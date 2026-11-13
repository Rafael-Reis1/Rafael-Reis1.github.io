import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const P2P_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(P2P_DIR, 'P2PShare.html');
const CSS_PATH = path.join(P2P_DIR, 'style.css');
const SW_PATH = path.join(P2P_DIR, 'sw.js');
const CORE_PATH = path.join(P2P_DIR, 'p2p-core.js');
const APP_PATH = path.join(P2P_DIR, 'app.js');

const P2PCore = require(CORE_PATH);

let JSDOM;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    console.log('\nℹ️  jsdom não instalado — pulando testes de DOM do P2PShare.\n');
    process.exit(0);
}

let passed = 0;
let failed = 0;

async function check(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`PASS ${name}`);
    } catch (error) {
        failed++;
        console.error(`FAIL ${name}: ${error.stack || error}`);
    }
}

function flush(ticks = 4) {
    return new Promise((resolve) => {
        let count = 0;
        const step = () => {
            count++;
            if (count >= ticks) resolve();
            else setTimeout(step, 5);
        };
        setTimeout(step, 5);
    });
}

function createBootstrappedDom(url = 'https://localhost:4177/P2PShare/P2PShare.html') {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const coreCode = fs.readFileSync(CORE_PATH, 'utf8');
    const appCode = fs.readFileSync(APP_PATH, 'utf8');

    const dom = new JSDOM(html, {
        url,
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });

    const sentPackets = [];
    const createdObjectUrls = [];
    const revokedObjectUrls = [];
    let urlCounter = 0;

    class MockSimplePeer {
        constructor(opts) {
            this.opts = opts;
            this.handlers = {};
            this.connected = true;
            this.destroyed = false;
            this._channel = {
                readyState: 'open',
                bufferedAmount: 0,
                bufferedAmountLowThreshold: 0,
                addEventListener() {},
                removeEventListener() {}
            };
        }
        on(evt, cb) {
            (this.handlers[evt] ||= []).push(cb);
        }
        emit(evt, arg) {
            (this.handlers[evt] || []).forEach(cb => cb(arg));
        }
        send(packet) {
            sentPackets.push(new Uint8Array(packet));
        }
        signal() {}
        removeAllListeners() {
            this.handlers = {};
        }
        destroy() {
            this.destroyed = true;
            this.connected = false;
        }
        addStream() {}
        removeStream() {}
    }

    const refStub = () => ({
        on() {},
        off() {},
        set: () => Promise.resolve(),
        remove: () => Promise.resolve()
    });

    const firebaseStub = {
        apps: [{}],
        initializeApp() {},
        database: () => ({ ref: refStub })
    };

    class MockQRCode {
        constructor(el, opts) {
            el.dataset.qrText = opts.text;
        }
    }
    MockQRCode.CorrectLevel = { L: 1 };

    const win = dom.window;
    win.SimplePeer = MockSimplePeer;
    win.firebase = firebaseStub;
    win.QRCode = MockQRCode;

    win.URL.createObjectURL = () => {
        const u = `blob:mock-${++urlCounter}`;
        createdObjectUrls.push(u);
        return u;
    };
    win.URL.revokeObjectURL = (u) => {
        revokedObjectUrls.push(u);
    };
    win.HTMLAnchorElement.prototype.click = function () {
        win.__lastDownload = { href: this.href, download: this.download };
    };
    win.navigator.clipboard = {
        writeText: async (txt) => {
            win.__lastCopied = txt;
        }
    };

    const vmContext = dom.getInternalVMContext();
    vm.runInContext(coreCode, vmContext);
    vm.runInContext(appCode, vmContext);

    return {
        dom,
        win,
        doc: win.document,
        sentPackets,
        createdObjectUrls,
        revokedObjectUrls,
        MockSimplePeer
    };
}

// --- 1. p2p-core unit tests ---
await check('generateTransferId always returns exact 8 ASCII alphanumeric chars', () => {
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
        const id = P2PCore.generateTransferId();
        assert.match(id, /^[a-z0-9]{8}$/);
        assert.equal(new TextEncoder().encode(id).length, 8);
        seen.add(id);
    }
    assert.ok(seen.size > 50, 'should produce high-entropy distinct IDs');
});

await check('encode/decode handles control, chunk, cancel, ArrayBuffer, and truncated packets', () => {
    const ctrl = P2PCore.encodeControlPacket({ type: 'header', transferId: 'abc12345', size: 42 });
    const decCtrl = P2PCore.decodePacket(ctrl.buffer);
    assert.equal(decCtrl.type, P2PCore.PACKET_TYPE.CONTROL);
    assert.equal(decCtrl.json.transferId, 'abc12345');

    const payload = new Uint8Array([10, 20, 30, 40]);
    const chunk = P2PCore.encodeChunkPacket('id000001', payload);
    const decChunk = P2PCore.decodePacket(chunk);
    assert.equal(decChunk.type, P2PCore.PACKET_TYPE.CHUNK);
    assert.equal(decChunk.transferId, 'id000001');
    assert.deepEqual(Array.from(decChunk.chunkBytes), [10, 20, 30, 40]);

    const cancel = P2PCore.encodeCancelPacket('id000001');
    const decCancel = P2PCore.decodePacket(cancel);
    assert.equal(decCancel.type, P2PCore.PACKET_TYPE.CANCEL);
    assert.equal(decCancel.transferId, 'id000001');

    const bad = P2PCore.decodePacket(new Uint8Array([1, 65, 66]));
    assert.equal(bad.type, -1);
});

await check('parseRoomInput extracts room IDs from URLs, OBS links, and rejects XSS safely', () => {
    assert.equal(P2PCore.parseRoomInput('https://example.com/P2PShare.html?remote=room99ab'), 'room99ab');
    assert.equal(P2PCore.parseRoomInput('http://localhost/P2PShare.html?host_id=obs_01&mode=obs'), 'obs_01');
    assert.equal(P2PCore.parseRoomInput('?remote=my-room_2'), 'my-room_2');
    assert.equal(P2PCore.parseRoomInput('plainid8'), 'plainid8');
    assert.equal(P2PCore.parseRoomInput('<script>alert(1)</script>'), 'scriptalert1script');
    assert.equal(P2PCore.parseRoomInput('http://[::bad-url'), 'httpbad-url');
});

await check('sanitizeFileName removes control chars & path separators cleanly', () => {
    assert.equal(P2PCore.sanitizeFileName('../../etc/passwd'), '.._.._etc_passwd');
    assert.equal(P2PCore.sanitizeFileName('nota\u0000fiscal.pdf'), 'notafiscal.pdf');
    assert.equal(P2PCore.sanitizeFileName('   '), 'arquivo');
});

await check('formatBytes, formatSpeed, and formatEta format edge cases cleanly', () => {
    assert.equal(P2PCore.formatBytes(0), '0 Bytes');
    assert.equal(P2PCore.formatBytes(-50), '0 Bytes');
    assert.equal(P2PCore.formatBytes(1536), '1.5 KB');
    assert.equal(P2PCore.formatSpeed(2 * 1024 * 1024, 1000).text, '2.0 MB/s');
    assert.equal(P2PCore.formatEta(1500, 500), '~3s');
    assert.equal(P2PCore.formatEta(90000, 1000), '~1m 30s');
});

// --- 2. Static HTML/CSS/SW verification ---
await check('HTML, CSS, and Service Worker enforce offline cache preservation & ARIA integrity', () => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    const sw = fs.readFileSync(SW_PATH, 'utf8');

    assert.ok(html.includes('src="p2p-core.js'), 'HTML must load p2p-core.js');
    assert.ok(html.indexOf('p2p-core.js') < html.indexOf('app.js'), 'p2p-core.js must load before app.js');
    assert.ok(html.includes('src="../imgs/arrow_back_white.webp"'), 'HTML must use relative arrow_back path');
    assert.ok(html.includes('id="manual-error"'), 'HTML must provide inline manual input error feedback');
    assert.ok(html.includes('id="transfers-header"'), 'HTML must provide transfer queue header');

    assert.ok(css.includes('--text-primary'), 'CSS must define --text-primary');
    assert.ok(css.includes('--text-secondary'), 'CSS must define --text-secondary');
    assert.ok(css.includes('--accent-glow'), 'CSS must define --accent-glow');
    assert.ok(css.includes('prefers-reduced-motion'), 'CSS must support reduced motion');
    assert.ok(!css.includes("'/imgs/arrow_back_white.webp'"), 'CSS must not depend on root-relative /imgs/ path');

    assert.ok(sw.includes("cacheName !== SHARE_CACHE_NAME"), 'sw.js must preserve share-cache on activate');
    assert.ok(sw.includes("ignoreSearch: true"), 'sw.js must match cached assets ignoring query string');
    assert.ok(!sw.includes("'/imgs/arrow_back_white.webp'"), 'sw.js must use relative ../imgs/ path');
});

// --- 3. JSDOM XSS, 0-byte transfer, cancellation, clipboard, and clear queue tests ---
await check('XSS attempt via ?host_id URL param cannot inject HTML into #obs-identity', async () => {
    const { dom, doc } = createBootstrappedDom(
        'https://localhost:4177/P2PShare/P2PShare.html?host_id=%3Cimg%20src=x%20onerror=window.__obsXss=1%3E&mode=obs'
    );
    await flush();

    const obsDiv = doc.getElementById('obs-identity');
    assert.equal(obsDiv.querySelectorAll('img').length, 0, 'Must not create img tags inside #obs-identity');
    assert.equal(dom.window.__obsXss, undefined, 'XSS payload must not execute');
    assert.ok(doc.body.classList.contains('obs-mode'));
    dom.window.close();
});

await check('XSS attempt in remote file header renders safely as plain text', async () => {
    const { dom, win, doc } = createBootstrappedDom();
    await flush();

    const hook = win.__p2pShare;
    const mockPeer = new (createBootstrappedDom().MockSimplePeer)({});
    hook.setPeer(mockPeer);
    hook.handleConnection();

    const payload = '<img src=x onerror="window.__fileXss=1">.txt';
    const header = P2PCore.encodeControlPacket({
        type: 'header',
        transferId: 'xss12345',
        name: payload,
        size: 100,
        mime: 'text/plain'
    });
    hook.handleDataReceived(header);

    const fileNameEl = doc.querySelector('.transfer-item .file-name');
    assert.ok(fileNameEl, 'Transfer item must be rendered');
    assert.equal(fileNameEl.textContent, payload);
    assert.equal(fileNameEl.querySelectorAll('img').length, 0);
    assert.equal(win.__fileXss, undefined);
    dom.window.close();
});

await check('Zero-byte file transfer completes cleanly on both sender and receiver without hanging at 0%', async () => {
    const { dom: senderDom, win: senderWin, doc: senderDoc, sentPackets } = createBootstrappedDom();
    const { dom: receiverDom, win: receiverWin, doc: receiverDoc } = createBootstrappedDom();
    await flush();

    senderWin.__p2pShare.handleConnection();
    receiverWin.__p2pShare.handleConnection();
    assert.equal(receiverDoc.getElementById('panel-waiting').style.display, 'none');
    assert.equal(receiverDoc.getElementById('panel-connected').style.display, 'flex');

    const emptyFile = new senderWin.File([], 'vazio.txt', { type: 'text/plain' });
    await senderWin.__p2pShare.sendFile(emptyFile);

    assert.equal(sentPackets.length, 1, 'Sender should emit header packet for 0-byte file');
    assert.equal(senderDoc.querySelector('.transfer-item .status-text').textContent, 'Enviado!');

    receiverWin.__p2pShare.handleDataReceived(sentPackets[0]);
    const rItem = receiverDoc.querySelector('.transfer-item');
    assert.ok(rItem, 'Receiver must create transfer row for 0-byte file');
    assert.equal(rItem.querySelector('.status-text').textContent, 'Recebido!');
    assert.equal(rItem.querySelector('.percentage').textContent, '100%');
    assert.equal(receiverWin.__p2pShare.getState().activeDownloadsCount, 0);
    assert.equal(receiverWin.__lastDownload.download, 'vazio.txt');
    assert.ok(rItem.querySelector('.btn-download-again'), 'Re-download button should be shown');

    senderDom.window.close();
    receiverDom.window.close();
});

await check('Remote cancel packet (type 2) frees active download buffer and updates status', async () => {
    const { dom, win, doc } = createBootstrappedDom();
    await flush();

    win.__p2pShare.handleConnection();
    const tid = 'cncl9999';

    win.__p2pShare.handleDataReceived(P2PCore.encodeControlPacket({
        type: 'header',
        transferId: tid,
        name: 'video.mp4',
        size: 131072,
        mime: 'video/mp4'
    }));
    assert.equal(win.__p2pShare.getState().activeDownloadsCount, 1);

    win.__p2pShare.handleDataReceived(P2PCore.encodeChunkPacket(tid, new Uint8Array(65536)));
    assert.equal(doc.querySelector('.transfer-item .percentage').textContent, '50%');

    win.__p2pShare.handleDataReceived(P2PCore.encodeCancelPacket(tid));
    assert.equal(win.__p2pShare.getState().activeDownloadsCount, 0, 'Active download must be evicted');
    assert.equal(doc.querySelector('.transfer-item .status-text').textContent, 'Cancelado pelo remetente');
    assert.equal(doc.querySelector('.transfer-item .btn-cancel-transfer'), null, 'Cancel button must be removed');

    dom.window.close();
});

await check('Receiver clicking cancel notifies sender via type-2 cancel packet and frees buffer', async () => {
    const { dom, win, doc, sentPackets } = createBootstrappedDom();
    await flush();

    win.__p2pShare.handleConnection();
    const tid = 'rx000001';
    win.__p2pShare.handleDataReceived(P2PCore.encodeControlPacket({
        type: 'header',
        transferId: tid,
        name: 'big.zip',
        size: 500000,
        mime: 'application/zip'
    }));

    const cancelBtn = doc.querySelector('.transfer-item .btn-cancel-transfer');
    assert.ok(cancelBtn, 'Receiver item should expose cancel button');
    cancelBtn.click();

    assert.equal(win.__p2pShare.getState().activeDownloadsCount, 0);
    assert.equal(doc.querySelector('.transfer-item .status-text').textContent, 'Cancelado');
    assert.equal(sentPackets.length, 1);
    const decoded = P2PCore.decodePacket(sentPackets[0]);
    assert.equal(decoded.type, P2PCore.PACKET_TYPE.CANCEL);
    assert.equal(decoded.transferId, tid);

    dom.window.close();
});

await check('Clipboard packet displays #clipboardModal and clear button prunes completed transfers', async () => {
    const { dom, win, doc } = createBootstrappedDom();
    await flush();

    win.__p2pShare.handleConnection();
    win.__p2pShare.handleDataReceived(P2PCore.encodeControlPacket({
        type: 'clipboard',
        text: 'Senha temporária: 1234'
    }));

    const clipModal = doc.getElementById('clipboardModal');
    assert.ok(clipModal.classList.contains('active'));
    assert.equal(doc.getElementById('clipboard-review').value, 'Senha temporária: 1234');

    win.__p2pShare.handleDataReceived(P2PCore.encodeControlPacket({
        type: 'header',
        transferId: 'done0001',
        name: 'a.txt',
        size: 0,
        mime: 'text/plain'
    }));

    const clearBtn = doc.getElementById('btn-clear-transfers');
    assert.equal(clearBtn.hidden, false);
    clearBtn.click();
    assert.equal(doc.getElementById('transfers-list').children.length, 0);
    assert.equal(doc.getElementById('transfers-header').hidden, true);

    dom.window.close();
});

console.log(`\nTotal: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
    process.exit(1);
}

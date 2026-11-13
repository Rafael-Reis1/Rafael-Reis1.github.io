import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDF_FORMATTER_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(PDF_FORMATTER_DIR, 'pdfFormater.html');
const CSS_PATH = path.join(PDF_FORMATTER_DIR, 'style.css');
const SW_PATH = path.join(PDF_FORMATTER_DIR, 'sw.js');
const CORE_PATH = path.join(PDF_FORMATTER_DIR, 'booklet-core.js');
const APP_PATH = path.join(PDF_FORMATTER_DIR, 'app.js');
const PDF_LIB_PATH = path.join(PDF_FORMATTER_DIR, 'lib', 'pdf-lib.min.js');

const BookletCore = require(CORE_PATH);

let JSDOM;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    console.log('\nℹ️  jsdom não instalado — pulando testes de DOM do pdfFormatter.\n');
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

function flush(ticks = 6) {
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

function installDomStubs(windowRef, { numPages = 5, failPdfJs = false } = {}) {
    const tracker = {
        getPageCalls: [],
        renderCalls: [],
        cleanupCalls: 0,
        docDestroyed: 0,
        downloads: [],
        createdUrls: [],
        revokedUrls: [],
        pdfLibInstance: null
    };

    const proto = windowRef.HTMLCanvasElement.prototype;
    proto.getContext = function getContext() {
        return {
            fillStyle: '#fff',
            fillRect() {},
            drawImage() {},
            clearRect() {}
        };
    };
    proto.toDataURL = () => 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP///w==';

    let urlSeq = 0;
    const urlToBlob = new Map();
    windowRef.URL.createObjectURL = (blob) => {
        const u = `blob:pdf-formatter-${++urlSeq}`;
        tracker.createdUrls.push(u);
        urlToBlob.set(u, blob);
        return u;
    };
    windowRef.URL.revokeObjectURL = (u) => {
        tracker.revokedUrls.push(u);
    };

    const origClick = windowRef.HTMLElement.prototype.click;
    windowRef.HTMLElement.prototype.click = function patchedClick(...args) {
        if (this.tagName === 'A' && this.download) {
            tracker.downloads.push({
                download: this.download,
                href: this.href,
                blob: urlToBlob.get(this.href) || null
            });
            return;
        }
        return origClick.apply(this, args);
    };

    windowRef.pdfjsLib = {
        GlobalWorkerOptions: { workerSrc: '' },
        getDocument() {
            if (failPdfJs) {
                return { promise: Promise.reject(new Error('Invalid PDF structure')) };
            }
            return {
                promise: Promise.resolve({
                    numPages,
                    async getPage(pageNumber) {
                        tracker.getPageCalls.push(pageNumber);
                        return {
                            getViewport({ scale = 1 } = {}) {
                                return { width: 595 * scale, height: 842 * scale };
                            },
                            render() {
                                tracker.renderCalls.push(pageNumber);
                                return { promise: Promise.resolve() };
                            },
                            cleanup() {
                                tracker.cleanupCalls++;
                            }
                        };
                    },
                    destroy() {
                        tracker.docDestroyed++;
                        return Promise.resolve();
                    }
                })
            };
        }
    };

    return tracker;
}

function createBootedDOM(options = {}) {
    const html = fs.readFileSync(HTML_PATH, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const dom = new JSDOM(html, {
        url: 'http://localhost/pdfFormatter/pdfFormater.html',
        runScripts: 'dangerously',
        pretendToBeVisual: true
    });

    const { window } = dom;
    const tracker = installDomStubs(window, options);

    const ctx = dom.getInternalVMContext();
    vm.runInContext(fs.readFileSync(PDF_LIB_PATH, 'utf8'), ctx);
    tracker.pdfLibInstance = window.PDFLib;
    vm.runInContext(fs.readFileSync(CORE_PATH, 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(APP_PATH, 'utf8'), ctx);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    return { dom, window, tracker };
}

console.log('\n📖 PDF Formatter — testes\n');

await check('HTML, CSS e SW mantêm referências válidas e preservam share-cache offline', async () => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    const sw = fs.readFileSync(SW_PATH, 'utf8');

    assert.ok(!html.includes('Leitor-logs-totvs-fluig/style.css'), 'HTML não deve importar CSS de outro app');
    assert.ok(!/rel=stylesheet/.test(html), 'links CSS não devem ter atributo colado sem aspas');
    assert.ok(html.includes('id="btnDownloadPreview"'), 'modal de preview deve incluir botão de download vetorial');
    assert.ok(html.includes('id="previewSummary"'), 'modal de preview deve exibir resumo do livreto');
    assert.ok(html.includes('role="combobox"') && html.includes('role="listbox"'), 'select customizado deve ter atributos ARIA');

    assert.ok(css.includes('--text-primary:'), 'style.css deve definir --text-primary');
    assert.ok(css.includes('--text-secondary:'), 'style.css deve definir --text-secondary');
    assert.ok(css.includes('--accent-glow:'), 'style.css deve definir --accent-glow');
    assert.ok(!css.includes("content: url('/imgs/"), 'style.css não deve usar caminho absoluto /imgs/');

    assert.ok(!sw.includes("'/imgs/"), 'SW não deve usar /imgs/ absoluto');
    assert.ok(sw.includes('./booklet-core.js'), 'SW deve cachear booklet-core.js');

    const listeners = {};
    const deletedCaches = [];
    let matchOpts = null;
    vm.runInNewContext(sw, {
        URL,
        Headers: globalThis.Headers,
        Response: globalThis.Response,
        Promise,
        caches: {
            async open() { return { addAll: async () => {}, put: async () => {} }; },
            async keys() { return ['pdf-booklet-?v=old', 'share-cache']; },
            async delete(name) { deletedCaches.push(name); return true; },
            async match(_req, opts) {
                matchOpts = opts;
                return new globalThis.Response('cached', { status: 200 });
            }
        },
        fetch: async () => { throw new Error('offline'); },
        self: {
            skipWaiting: async () => {},
            clients: { claim: async () => {} },
            addEventListener(ev, fn) { listeners[ev] = fn; }
        }
    });

    await new Promise(res => listeners.activate({ waitUntil: (p) => p.then(res) }));
    assert.deepEqual(deletedCaches, ['pdf-booklet-?v=old'], 'activate deve apagar caches antigos sem deletar share-cache');

    let fetched = null;
    listeners.fetch({
        request: { method: 'GET', url: 'http://localhost/pdfFormatter/app.js?v=99999' },
        respondWith(p) { fetched = p; }
    });
    const offlineResp = await fetched;
    assert.equal(offlineResp.status, 200);
    assert.equal(matchOpts?.ignoreSearch, true, 'SW offline deve usar ignoreSearch: true');
});

await check('booklet-core calcula imposição, cadernos, contenção proporcional e validação de arquivos', async () => {
    assert.deepEqual(BookletCore.calculateImposition(0, 0), []);

    const onePage = BookletCore.calculateImposition(1, 0);
    assert.equal(onePage.length, 1);
    assert.deepEqual(onePage[0].front, { left: 4, right: 1 });
    assert.deepEqual(onePage[0].back, { left: 2, right: 3 });

    const fivePages = BookletCore.calculateImposition(5, 0);
    assert.equal(fivePages.length, 2);
    const stats5 = BookletCore.getBookletStats(5, 0);
    assert.equal(stats5.blankPages, 3);
    assert.equal(stats5.totalSheets, 2);
    assert.equal(stats5.totalBookletPages, 4);

    // 20 páginas em cadernos de 16 (4 folhas + 1 folha no 2º caderno)
    const sigSheets = BookletCore.calculateImposition(20, 16);
    assert.equal(sigSheets.length, 5);
    assert.equal(sigSheets[0].signatureNumber, 1);
    assert.deepEqual(sigSheets[0].front, { left: 16, right: 1 });
    assert.equal(sigSheets[4].signatureNumber, 2);
    assert.deepEqual(sigSheets[4].front, { left: 20, right: 17 });

    // Slide 16:9 (1280x720) não deve esticar na vertical da metade A4 (420.945 x 595.28)
    const placed = BookletCore.computeContainedPlacement(1280, 720, 420.945, 0, 420.945, 595.28);
    assert.ok(Math.abs(placed.width - 420.945) < 0.01);
    assert.ok(placed.height < 250, 'altura proporcional deve preservar proporção 16:9 sem distorção');
    assert.ok(placed.y > 150, 'slide deve ficar centralizado verticalmente no slot');

    // Validação de arquivo tolera MIME vazio quando extensão é .pdf
    assert.equal(BookletCore.isSupportedPdfFile({ name: 'livro.PDF', type: '' }), true);
    assert.equal(BookletCore.isSupportedPdfFile({ name: 'doc.pdf', type: 'application/pdf' }), true);
    assert.equal(BookletCore.isSupportedPdfFile({ name: 'foto.png', type: 'image/png' }), false);
    assert.equal(BookletCore.getBookletOutputName('../pasta/Meu:Livro.pdf'), 'formatado_booklet_Meu_Livro.pdf');
});

await check('Select customizado responde a teclado (ArrowDown, ArrowUp, Escape) com ARIA sincronizado', async () => {
    const { window } = createBootedDOM();
    const doc = window.document;
    const trigger = doc.querySelector('.select-trigger');
    const nativeSelect = doc.getElementById('binding-type');

    trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');

    trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.equal(nativeSelect.value, '16');
    assert.match(trigger.textContent, /4 folhas/i);

    trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    assert.equal(nativeSelect.value, '0');

    trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');

    window.close();
});

await check('Fluxo completo renderiza cada página uma única vez no preview e gera livreto PDF vetorial real', async () => {
    const { window, tracker } = createBootedDOM({ numPages: 5 });
    const doc = window.document;
    const { PDFDocument } = tracker.pdfLibInstance;
    const api = window.__pdfFormatter;

    // Cria PDF real de 5 páginas US Letter (não-A4) via pdf-lib (usando Array do mesmo realm VM)
    const srcDoc = await PDFDocument.create();
    const letterDims = window.Array.from([612, 792]);
    for (let i = 0; i < 5; i++) {
        const p = srcDoc.addPage(letterDims);
        p.drawText(`Page ${i + 1}`, { x: 50, y: 700, size: 16 });
    }
    const srcBytes = await srcDoc.save();
    const fakePdfFile = {
        name: 'Apostila.pdf',
        type: '',
        async arrayBuffer() {
            return srcBytes.buffer.slice(srcBytes.byteOffset, srcBytes.byteOffset + srcBytes.byteLength);
        }
    };

    await api.handleFiles({ target: { files: [fakePdfFile] } });
    await flush(30);

    // Performance: cada página de conteúdo (1..5) deve ter sido renderizada APENAS 1x pelo PDF.js!
    assert.deepEqual(tracker.renderCalls.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5]);
    assert.equal(tracker.cleanupCalls, 5, 'deve liberar recursos de cada página com page.cleanup()');

    assert.equal(doc.querySelectorAll('#preview-container .sheet-preview').length, 2, '5 páginas devem gerar 2 folhas');
    assert.match(doc.getElementById('previewSummary').textContent, /2 folhas A4/i);
    assert.match(doc.querySelector('.sheet-meta').textContent, /Folha 1 de 2/i);

    // Exporta livreto vetorial direto do botão do Preview
    doc.getElementById('btnDownloadPreview').click();
    await flush(10);

    assert.equal(tracker.downloads.length, 1);
    assert.equal(tracker.downloads[0].download, 'formatado_booklet_Apostila.pdf');

    const downloadedBuf = await tracker.downloads[0].blob.arrayBuffer();
    const loadedBooklet = await PDFDocument.load(downloadedBuf);
    assert.equal(loadedBooklet.getPageCount(), 4, '2 folhas frente/verso devem gerar 4 páginas A4 paisagem');
    const firstOutPage = loadedBooklet.getPage(0);
    assert.ok(Math.abs(firstOutPage.getWidth() - 841.89) < 0.1);
    assert.ok(Math.abs(firstOutPage.getHeight() - 595.28) < 0.1);

    // Segundo clique reutiliza arquivo em cache sem erro
    doc.getElementById('btnDownloadPreview').click();
    await flush(6);
    assert.equal(tracker.downloads.length, 2);

    api.closeModal();
    await flush(25);
    assert.equal(tracker.docDestroyed >= 1, true, 'fechar preview deve destruir currentPdfDoc');

    window.close();
});

await check('Falha no modo Turbo e cancelamento restauram opções de encadernação e upload sem travar UI', async () => {
    const { window } = createBootedDOM({ numPages: 0, failPdfJs: true });
    const doc = window.document;
    const api = window.__pdfFormatter;

    doc.getElementById('skip-preview').checked = true;
    const corruptFile = {
        name: 'corrompido.pdf',
        type: 'application/pdf',
        async arrayBuffer() {
            return new Uint8Array([1, 2, 3, 4]).buffer;
        }
    };

    await api.handleFiles({ target: { files: [corruptFile] } });
    await flush(10);

    assert.notEqual(doc.getElementById('binding-options-container').style.display, 'none', 'opções devem reaparecer após erro no modo Turbo');
    assert.notEqual(doc.getElementById('file-upload').style.display, 'none', 'área de upload deve reaparecer após erro');
    assert.ok(doc.getElementById('customAlertModal').classList.contains('active'), 'alerta de erro deve ser exibido');

    window.close();
});

console.log(`\nResumo pdfFormatter: ${passed} passou, ${failed} falhou.`);
if (failed > 0) process.exit(1);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEITOR_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(LEITOR_DIR, 'leitor.html');
const WORKER_PATH = path.join(LEITOR_DIR, 'logWorker.js');
const APP_PATH = path.join(LEITOR_DIR, 'app.js');

let JSDOM;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    console.log('\nℹ️  jsdom não instalado — pulando testes de DOM do Leitor de Logs.\n');
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

function createWorkerHarness(chunkSizeOverride = null) {
    let workerCode = fs.readFileSync(WORKER_PATH, 'utf8');
    if (chunkSizeOverride) {
        workerCode = workerCode.replace(/const CHUNK_SIZE = [^;]+;/, `const CHUNK_SIZE = ${chunkSizeOverride};`);
    }
    const listeners = [];
    const postedMessages = [];

    const sandbox = {
        TextDecoder,
        Date,
        Math,
        Number,
        String,
        Array,
        Map,
        RegExp,
        Promise,
        Response: globalThis.Response,
        self: {
            addEventListener(type, fn) {
                if (type === 'message') listeners.push(fn);
            },
            postMessage(msg) {
                postedMessages.push(msg);
            }
        }
    };

    vm.runInNewContext(workerCode, sandbox, { filename: 'logWorker.js' });

    return {
        async run(payload) {
            postedMessages.length = 0;
            for (const fn of listeners) {
                await fn({ data: payload });
            }
            return postedMessages.slice();
        }
    };
}

function makeMockBlobFile(text, name, lastModified = 1700000000000) {
    const bytes = new TextEncoder().encode(text);
    return {
        name,
        size: bytes.length,
        lastModified,
        type: '',
        slice(start = 0, end = bytes.length) {
            const sub = bytes.slice(start, end);
            return {
                size: sub.length,
                async arrayBuffer() {
                    return sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.byteLength);
                }
            };
        }
    };
}

function createAppHarness(pageUrl = 'http://127.0.0.1:4173/Leitor-logs-totvs-fluig/leitor.html') {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const appCode = fs.readFileSync(APP_PATH, 'utf8');
    const workerHarness = createWorkerHarness();

    const dom = new JSDOM(html, {
        url: pageUrl,
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });

    const { window } = dom;
    const downloads = [];
    const blobPayloads = new Map();
    let blobSeq = 0;
    const clipboardWrites = [];
    let workerLoadPromise = Promise.resolve();

    const storageData = new Map();
    const mockLocalStorage = {
        getItem: (k) => (storageData.has(k) ? storageData.get(k) : null),
        setItem: (k, v) => storageData.set(k, String(v)),
        removeItem: (k) => storageData.delete(k),
        clear: () => storageData.clear()
    };

    Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, configurable: true });
    Object.defineProperty(window.navigator, 'clipboard', {
        value: {
            writeText: async (txt) => {
                clipboardWrites.push(txt);
            }
        },
        configurable: true
    });

    window.confirm = () => true;
    window.alert = () => {};
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

    const OriginalBlob = window.Blob;
    window.Blob = class MockBlob extends OriginalBlob {
        constructor(parts, opts) {
            super(parts, opts);
            this.__parts = parts;
        }
    };

    window.URL.createObjectURL = (blob) => {
        const id = `blob:mock/${++blobSeq}`;
        blobPayloads.set(id, blob);
        return id;
    };
    window.URL.revokeObjectURL = () => {};

    const origCreateElement = window.document.createElement.bind(window.document);
    window.document.createElement = function (tag, ...rest) {
        const el = origCreateElement(tag, ...rest);
        if (String(tag).toLowerCase() === 'a') {
            el.click = () => {
                downloads.push({
                    href: el.href,
                    download: el.download,
                    blob: blobPayloads.get(el.href) || null
                });
            };
        }
        return el;
    };

    window.Worker = class MockWorker {
        constructor() {
            this.onmessage = null;
            this.onerror = null;
            this._terminated = false;
        }
        postMessage(payload) {
            workerLoadPromise = workerHarness.run(payload).then((msgs) => {
                if (this._terminated) return;
                for (const msg of msgs) {
                    if (this._terminated) break;
                    if (typeof this.onmessage === 'function') {
                        this.onmessage({ data: msg });
                    }
                }
            }).catch((err) => {
                if (!this._terminated && typeof this.onerror === 'function') {
                    this.onerror(err);
                }
            });
        }
        terminate() {
            this._terminated = true;
        }
    };

    vm.runInContext(appCode, dom.getInternalVMContext(), { filename: 'app.js' });

    return {
        window,
        downloads,
        clipboardWrites,
        loadLogFiles: async (files) => {
            window.loadFilesInWorker(files);
            await workerLoadPromise;
            await new Promise((r) => setTimeout(r, 15));
        },
        run: (expr) => vm.runInContext(expr, dom.getInternalVMContext())
    };
}

await check('HTML mantém modais independentes e file-input sem capture de câmera', async () => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const popup = document.getElementById('arquivoLogPopup');
    const exportModal = document.getElementById('exportModal');
    const fileInput = document.getElementById('file-input');
    const uploadImg = document.getElementById('imageUpload');

    assert.ok(popup, 'arquivoLogPopup existe');
    assert.ok(exportModal, 'exportModal existe');
    assert.equal(popup.contains(exportModal), false, 'exportModal não pode ficar aninhado dentro de arquivoLogPopup');
    assert.equal(fileInput.hasAttribute('capture'), false, 'file-input não deve abrir câmera');
    assert.equal(uploadImg.getAttribute('alt'), 'Upload de log', 'atributo src/alt bem fechado');
});

await check('logWorker processa streaming de múltiplos arquivos, BOM, UTF-8 em fatias quebradas e deduplicação sem bloating', async () => {
    // Usa chunks de 13 bytes para forçar quebra no meio de linhas e de caracteres UTF-8 multibyte!
    const worker = createWorkerHarness(13);
    const rotated = [
        '\uFEFF2026-11-12 23:45:00,100 SEVERE [com.fluig.Auth] (task-1) - Autenticação falhou',
        'java.lang.RuntimeException: Token inválido',
        '\tat com.fluig.Auth.login(Auth.java:42)'
    ].join('\n');

    const current = [
        '2026-11-13 00:10:00,250 INFOx3 [com.fluig.BPM] (task-2) - Processo iniciado com ação',
        '2026-11-13 00:15:00,500 WARN [com.fluig.DB] (task-3) - Conexão lenta',
        '2026-11-13 00:15:00,500 WARN [com.fluig.DB] (task-3) - Conexão lenta',
        '2026-11-13 00:16:00,000 INFO [com.fluig.Boot] (MSC-1) - =============LOG CONFIGS=========',
        'fluig.version=1.8.2',
        '=================================='
    ].join('\n');

    const messages = await worker.run({
        files: [
            makeMockBlobFile(rotated, 'server.log.1'),
            makeMockBlobFile(current, 'server.log')
        ]
    });

    const progressMsgs = messages.filter(m => m.status === 'progress');
    const doneMsg = messages.find(m => m.status === 'done');

    assert.ok(progressMsgs.length >= 2, 'emite progresso para arquivos');
    assert.ok(doneMsg, 'emite resultado final');

    const { logs, stats } = doneMsg.data;
    assert.equal(stats.total, 7); // 1 SEVERE + 3 (INFOx3) + 2 WARN + 1 CONFIG
    assert.equal(stats.errors, 1);
    assert.equal(stats.warnings, 2);

    // Sem signature duplicada armazenada em memória por entrada e sem [] vazios
    const bpmLog = logs.find(l => l.className === 'com.fluig.BPM');
    assert.ok(bpmLog);
    assert.equal(bpmLog.count, 3);
    assert.equal('signature' in bpmLog, false);
    assert.equal(bpmLog.stacktrace, null);
    assert.equal(bpmLog.message, 'Processo iniciado com ação');

    const warnLog = logs.find(l => l.level === 'WARN');
    assert.equal(warnLog.count, 2);
    assert.equal(warnLog.fileName, 'server.log');

    const errorLog = logs.find(l => l.level === 'ERROR');
    assert.ok(errorLog);
    assert.equal(errorLog.fileName, 'server.log.1');
    assert.deepEqual(Array.from(errorLog.stacktrace), [
        'java.lang.RuntimeException: Token inválido',
        '\tat com.fluig.Auth.login(Auth.java:42)'
    ]);
});

await check('isSupportedLogFile aceita logs rotacionados e rejeita binários', async () => {
    const { window } = createAppHarness();
    assert.equal(window.isSupportedLogFile({ name: 'server.log', type: '' }), true);
    assert.equal(window.isSupportedLogFile({ name: 'server.log.1', type: '' }), true);
    assert.equal(window.isSupportedLogFile({ name: 'server.log.2026-11-12', type: '' }), true);
    assert.equal(window.isSupportedLogFile({ name: 'catalina.out', type: '' }), true);
    assert.equal(window.isSupportedLogFile({ name: 'foto.png', type: 'image/png' }), false);
    assert.equal(window.isSupportedLogFile({ name: 'server.log.gz', type: '' }), false);
    assert.equal(window.isSupportedLogFile({ name: 'fluig.jar', type: '' }), false);
});

await check('Render escapa HTML/XSS, destaca caracteres especiais (&, <tag>) e preserva ordem da stacktrace', async () => {
    const { window, loadLogFiles } = createAppHarness();
    const rawLog = [
        '2026-11-13 10:00:00,100 ERROR [com.fluig.Xml] (task-9) - Payload <script>window.__xss=1</script> & <tag> falhou',
        'java.lang.NullPointerException: missing field',
        '\tat com.fluig.Xml.parse(Xml.java:88)'
    ].join('\n');

    await loadLogFiles([makeMockBlobFile(rawLog, 'server.log')]);

    assert.equal(window.__xss, undefined, 'HTML/script não foi executado');

    const searchInput = window.document.getElementById('searchInput');
    searchInput.value = '<tag>';
    window.filterLogs();
    await new Promise(r => setTimeout(r, 15));

    const msgEl = window.document.querySelector('#conteudoArquivoLog .log-message');
    assert.ok(msgEl.innerHTML.includes('<mark class="highlight">&lt;tag&gt;</mark>'), 'destaca literal sem quebrar entidades');
    assert.ok(msgEl.innerHTML.includes('&amp;'), 'preserva entidade & inteira');

    const toggleBtn = window.document.querySelector('.stack-trace-toggle');
    assert.equal(toggleBtn.classList.contains('rotated'), false);
    toggleBtn.click();
    assert.equal(toggleBtn.classList.contains('rotated'), true);

    const detailTexts = Array.from(window.document.querySelectorAll('.log-detail-text')).map(el => el.textContent);
    assert.deepEqual(detailTexts, [
        'java.lang.NullPointerException: missing field',
        '\tat com.fluig.Xml.parse(Xml.java:88)'
    ]);
});

await check('Filtros de nível, horário virando meia-noite, stacktrace e ordem cronológica funcionam', async () => {
    const { window, loadLogFiles, run } = createAppHarness();
    const rawLog = [
        '2026-11-12 23:40:00,000 FATAL [com.fluig.Core] (t-1) - Queda crítica',
        'java.lang.OutOfMemoryError: heap',
        '2026-11-13 00:10:00,000 WARN [com.fluig.Pool] (t-2) - Pool cheio -ignorado',
        '2026-11-13 14:20:00,000 INFO [com.fluig.Job] (t-3) - Job concluído'
    ].join('\n');

    await loadLogFiles([makeMockBlobFile(rawLog, 'server.log')]);

    const clearTimeBtn = window.document.getElementById('clearTimeBtn');
    const clearFiltersBtn = window.document.getElementById('clearFiltersBtn');
    assert.equal(clearTimeBtn.style.display, '');
    assert.equal(clearFiltersBtn.style.display, '');
    assert.equal(clearTimeBtn.disabled, true);
    assert.equal(clearFiltersBtn.disabled, true);

    // Faixa cruzando meia-noite: 23:30 - 01:00
    window.document.getElementById('timeStart').value = '23:30:00';
    window.document.getElementById('timeEnd').value = '01:00:00';
    window.filterLogs();
    assert.equal(run('filteredGroupedLogs.length'), 2);
    assert.equal(clearTimeBtn.disabled, false);
    assert.equal(clearFiltersBtn.disabled, false);

    // Filtro somente com stacktrace -> resta apenas o FATAL
    window.document.getElementById('withStacktraceOnly').checked = true;
    window.filterLogs();
    assert.equal(run('filteredGroupedLogs.length'), 1);
    assert.equal(run('filteredGroupedLogs[0].level'), 'FATAL');

    // Limpa todos os filtros e testa sortOrder cronológica
    window.clearAllFilters();
    assert.equal(clearTimeBtn.disabled, true);
    assert.equal(clearFiltersBtn.disabled, true);
    assert.equal(run('filteredGroupedLogs.length'), 3);
    assert.equal(run('getOrderedFilteredItem(0).level'), 'INFO'); // Mais recentes primeiro

    window.document.getElementById('toggleSortBtn').click();
    assert.equal(run('sortOrder'), 'asc');
    assert.equal(run('getOrderedFilteredItem(0).level'), 'FATAL'); // Cronológica
});

await check('Atalhos não disparam durante digitação no input e Shift+Enter/Escape funcionam', async () => {
    const { window, loadLogFiles, run } = createAppHarness();
    const rawLog = [
        '2026-11-13 10:00:00,000 ERROR [com.fluig.A] (t-1) - Primeiro erro',
        'at com.fluig.A(A.java:10)',
        '2026-11-13 10:05:00,000 INFO [com.fluig.B] (t-2) - Segundo log'
    ].join('\n');

    await loadLogFiles([makeMockBlobFile(rawLog, 'server.log')]);

    const searchInput = window.document.getElementById('searchInput');
    searchInput.focus();
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    assert.equal(run('pinnedLogs.size'), 0, 'digitar "p" no input não fixa linha');

    searchInput.blur();
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    assert.equal(run('pinnedLogs.size'), 1, 'tecla P fora do input fixa linha ativa');

    // Shift+Enter expande todos os detalhes e sincroniza botão
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    assert.equal(run('globalExpandState'), true);
    assert.equal(window.document.getElementById('expandAllBtn').textContent.includes('Recolher'), true);

    // Exportação CSV com BOM UTF-8 e modal Escape guard
    window.openExportModal();
    assert.equal(window.document.getElementById('exportModal').style.display, 'flex');
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(window.document.getElementById('exportModal').style.display, 'none');
    assert.equal(window.document.getElementById('arquivoLogPopup').style.display, 'flex');
});

await check('Exportação gera CSV com BOM UTF-8 e JSON limpo sem campos internos', async () => {
    const { window, loadLogFiles, downloads } = createAppHarness();
    const rawLog = [
        '2026-11-13 10:00:00,000 INFO [com.fluig.A] (t-1) - Primeiro',
        '2026-11-13 10:01:00,000 ERROR [com.fluig.B] (t-2) - Segundo "citado"'
    ].join('\n');

    await loadLogFiles([makeMockBlobFile(rawLog, 'server.log')]);

    window.document.querySelector('input[name="exportFormat"][value="csv"]').checked = true;
    window.executeExport();

    const csvDownload = downloads.at(-1);
    assert.ok(csvDownload.download.endsWith('.csv'));
    const csvBom = Array.from(new Uint8Array(await csvDownload.blob.arrayBuffer()).slice(0, 3));
    assert.deepEqual(csvBom, [0xef, 0xbb, 0xbf]);
    const csvText = await csvDownload.blob.text();
    assert.ok(csvText.startsWith('Data;Hora;Level;Classe;Thread;Mensagem\n'));
    assert.ok(csvText.includes('"Segundo ""citado"""'));

    window.document.querySelector('input[name="exportFormat"][value="json"]').checked = true;
    window.executeExport();
    const jsonText = await downloads.at(-1).blob.text();
    const parsed = JSON.parse(jsonText);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].message, 'Primeiro');
    assert.equal('timeSecs' in parsed[0], false);
});

await check('Streaming e paginação funcionam rapidamente em lote com 12.000 linhas', async () => {
    const { window, loadLogFiles, run } = createAppHarness();
    const lines = [];
    for (let i = 0; i < 6000; i++) {
        const hh = String(10 + Math.floor(i / 1000)).padStart(2, '0');
        const mm = String(Math.floor((i % 1000) / 17)).padStart(2, '0');
        const ss = String(i % 60).padStart(2, '0');
        const level = i % 50 === 0 ? 'ERROR' : (i % 15 === 0 ? 'WARN' : 'INFO');
        lines.push(`2026-11-13 ${hh}:${mm}:${ss},123 ${level} [com.fluig.Worker${i % 8}] (task-${i % 12}) - Evento ${i}`);
        if (level === 'ERROR') {
            lines.push(`\tat com.fluig.Service.run(Service.java:${i % 200})`);
        }
    }

    const t0 = Date.now();
    await loadLogFiles([makeMockBlobFile(lines.join('\n'), 'huge-server.log')]);
    const elapsedMs = Date.now() - t0;

    assert.equal(run('filteredGroupedLogs.length'), 6000);
    assert.ok(elapsedMs < 10000, `processamento rápido (${elapsedMs}ms)`);
    assert.equal(window.document.getElementById('logHistogram'), null, 'barra de histograma removida para liberar espaço vertical');

    // Testa salto direto para página 4
    const jumpInput = window.document.getElementById('jumpPageInput');
    assert.ok(jumpInput, 'input de salto de página renderizado');
    jumpInput.value = '4';
    jumpInput.dispatchEvent(new window.Event('change'));
    await new Promise(r => setTimeout(r, 35));
    assert.equal(run('currentPage'), 4);
});

await check('Botão voltar adapta rótulo para Suíte Dev em ?from=devtools e CSS evita quebra de linha', async () => {
    const { window } = createAppHarness('http://127.0.0.1:4173/Leitor-logs-totvs-fluig/leitor.html?from=devtools');
    if (window.document.readyState === 'loading') {
        await new Promise((resolve) => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    assert.equal(window.document.querySelector('#btnVoltar .btnVoltar-label')?.textContent, 'Suíte Dev');
    const css = fs.readFileSync(path.join(LEITOR_DIR, 'style.css'), 'utf8');
    const btnBlock = css.match(/\.btnVoltar\s*\{[^}]*\}/)?.[0] || '';
    assert.ok(btnBlock.includes('white-space: nowrap'), '.btnVoltar precisa de white-space: nowrap');
    assert.ok(btnBlock.includes('width: auto'), '.btnVoltar precisa de width: auto');
});

console.log(`\nLeitor de Logs DOM/Unit summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
    process.exit(1);
}

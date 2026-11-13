import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDF_TOOLS_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(PDF_TOOLS_DIR, '..');
const HTML_PATH = path.join(PDF_TOOLS_DIR, 'pdfTools.html');
const PDF_LIB_PATH = path.join(ROOT_DIR, 'pdfFormatter', 'lib', 'pdf-lib.min.js');

const SCRIPT_FILES = ['pdf-core.js', 'tools-pages.js', 'tools-edit.js', 'tools-redact.js', 'app.js'];

let JSDOM;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    console.log('\nℹ️  jsdom não instalado — pulando testes de DOM do pdfTools.\n');
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

function createCanvasAndDownloadStubs(windowRef) {
    const downloads = [];
    const blobRegistry = new Map();
    let seq = 0;

    const proto = windowRef.HTMLCanvasElement.prototype;
    proto.getContext = function getContext() {
        const canvasEl = this;
        return {
            canvas: canvasEl,
            clearRect() {},
            fillRect() {},
            strokeRect() {},
            fillText() {},
            beginPath() {},
            moveTo() {},
            lineTo() {},
            stroke() {},
            translate() {},
            rotate() {},
            save() {},
            restore() {},
            drawImage() {},
            setLineDash() {},
            set fillStyle(v) { this._fill = v; },
            get fillStyle() { return this._fill || '#000'; },
            set strokeStyle(v) { this._stroke = v; },
            get strokeStyle() { return this._stroke || '#000'; },
            set font(v) { this._font = v; },
            set textAlign(v) { this._align = v; },
            set textBaseline(v) { this._base = v; },
            set globalAlpha(v) { this._alpha = v; },
            set lineWidth(v) { this._lw = v; },
            set lineCap(v) { this._lc = v; },
            set lineJoin(v) { this._lj = v; }
        };
    };
    proto.toDataURL = function toDataURL(type = 'image/png') {
        return `data:${type};base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==`;
    };
    proto.toBlob = function toBlob(cb, type = 'image/png') {
        cb(new windowRef.Blob([new Uint8Array([137, 80, 78, 71])], { type }));
    };

    windowRef.URL.createObjectURL = (blob) => {
        const url = `blob:pdftools/${++seq}`;
        blobRegistry.set(url, blob);
        return url;
    };
    windowRef.URL.revokeObjectURL = (url) => {
        blobRegistry.delete(url);
    };

    windowRef.HTMLAnchorElement.prototype.click = function click() {
        downloads.push({
            download: this.download,
            href: this.href,
            blob: blobRegistry.get(this.href) || null
        });
    };

    return { downloads };
}

async function createPdfToolsEnv() {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const dom = new JSDOM(html, {
        url: 'http://localhost/pdfTools/pdfTools.html',
        runScripts: 'outside-only'
    });

    const { window } = dom;
    const vmContext = dom.getInternalVMContext();
    const run = (code, filename = 'test.js') => vm.runInContext(code, vmContext, { filename });
    const { downloads } = createCanvasAndDownloadStubs(window);

    // Load local UMD pdf-lib.min.js inside the same JSDOM realm
    const pdfLibCode = fs.readFileSync(PDF_LIB_PATH, 'utf8');
    run(pdfLibCode, 'pdf-lib.min.js');

    for (const file of SCRIPT_FILES) {
        const code = fs.readFileSync(path.join(PDF_TOOLS_DIR, file), 'utf8');
        run(code, file);
    }

    // Minimal pdf.js mock so text extraction and thumbnail/page canvas routines run in JSDOM
    const mockPdfJsDocPages = new Map();
    window.pdfjsLib = {
        GlobalWorkerOptions: {},
        getDocument({ data }) {
            const bytes = new window.Uint8Array(data);
            return {
                promise: (async () => {
                    const parsed = await window.PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
                    const total = parsed.getPageCount();
                    return {
                        numPages: total,
                        async getPage(pageNum) {
                            const page = parsed.getPage(pageNum - 1);
                            const size = page.getSize();
                            return {
                                rotate: page.getRotation().angle || 0,
                                getViewport({ scale = 1, rotation = 0 }) {
                                    const swap = rotation === 90 || rotation === 270;
                                    const w = (swap ? size.height : size.width) * scale;
                                    const h = (swap ? size.width : size.height) * scale;
                                    return {
                                        width: w,
                                        height: h,
                                        scale,
                                        transform: [scale, 0, 0, -scale, 0, h]
                                    };
                                },
                                render() {
                                    return { promise: Promise.resolve() };
                                },
                                async getTextContent() {
                                    const str = mockPdfJsDocPages.get(pageNum) || `Texto página ${pageNum}`;
                                    return { items: [{ str, transform: [12, 0, 0, 12, 40, 500], width: 220, height: 12 }] };
                                }
                            };
                        }
                    };
                })()
            };
        }
    };

    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    async function makeSamplePdfFile(pageCount = 3, name = 'amostra.pdf', metadata = {}) {
        window.__sampleMeta = metadata;
        const bytes = await run(`(async () => {
            const doc = await PDFLib.PDFDocument.create();
            if (window.__sampleMeta.title) doc.setTitle(window.__sampleMeta.title);
            if (window.__sampleMeta.author) doc.setAuthor(window.__sampleMeta.author);
            for (let i = 0; i < ${pageCount}; i++) {
                doc.addPage([400 + i * 20, 600]);
            }
            return await doc.save();
        })()`);
        delete window.__sampleMeta;
        return {
            name,
            type: 'application/pdf',
            size: bytes.byteLength,
            async arrayBuffer() {
                return bytes.slice().buffer;
            }
        };
    }

    return { window, run, downloads, makeSamplePdfFile, mockPdfJsDocPages };
}

console.log('\n📄 PDF Tools — testes\n');

await check('pure helpers parse ranges, sizes, names, colors, boxes, and N-up grids', async () => {
    const { window } = await createPdfToolsEnv();

    assert.deepEqual(Array.from(window.parsePageRanges('1-3, 5, 8-6, 99, 2', 10)), [1, 2, 3, 5, 8, 7, 6]);
    assert.deepEqual(Array.from(window.parsePageRanges('', 5)), []);

    assert.equal(window.formatFileSize(500), '500 B');
    assert.equal(window.formatFileSize(2048), '2.0 KB');
    assert.equal(window.formatFileSize(1024 * 1024), '1.00 MB');

    assert.equal(window.sanitizePdfFileName('relatorio:final.pdf', 'extraido'), 'relatorio-final-extraido.pdf');
    assert.equal(window.sanitizePdfFileName('', 'limpo'), 'documento-limpo.pdf');

    const rgb = window.normalizeHexToRgb('#ef4444');
    assert.ok(Math.abs(rgb.r - 239 / 255) < 0.01 && Math.abs(rgb.g - 68 / 255) < 0.01);

    const fit = window.computeFitBox(200, 100, 100, 100, 10);
    assert.deepEqual({ ...fit }, { x: 60, y: 10, width: 80, height: 80 });

    assert.deepEqual({ ...window.parseNupGrid(2, 'landscape') }, { cols: 2, rows: 1 });
    assert.deepEqual({ ...window.parseNupGrid(4, 'portrait') }, { cols: 2, rows: 2 });
    assert.deepEqual({ ...window.parseNupGrid(6, 'landscape') }, { cols: 3, rows: 2 });
});

await check('all 14 tool cards open upload screen, keep footer hidden before upload, filter search, and close on Escape', async () => {
    const { window } = await createPdfToolsEnv();
    const cards = Array.from(window.document.querySelectorAll('.tool-card'));
    assert.equal(cards.length, 14);

    for (const card of cards) {
        card.click();
        assert.ok(window.document.getElementById('toolModal').classList.contains('active'));
        assert.equal(window.document.getElementById('uploadArea').style.display, 'flex');
        assert.equal(window.document.getElementById('modalFooter').style.display, 'none');
        window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.equal(window.document.getElementById('toolModal').classList.contains('active'), false);
    }

    const search = window.document.getElementById('toolSearch');
    search.value = 'assinar';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    const visible = Array.from(window.document.querySelectorAll('.tool-card:not(.hidden)'));
    assert.equal(visible.length, 1);
    assert.equal(visible[0].dataset.tool, 'sign');
});

await check('merge combines multiple real PDFs preserving total page count', async () => {
    const { window, downloads, makeSamplePdfFile } = await createPdfToolsEnv();
    window.document.querySelector('.tool-card[data-tool="merge"]').click();

    const fileA = await makeSamplePdfFile(2, 'parte1.pdf');
    const fileB = await makeSamplePdfFile(3, 'parte2.pdf');
    await window.handleSelectedFiles([fileA, fileB]);

    const mergedBytes = await window.executeMergePdfs();
    const mergedDoc = await window.PDFLib.PDFDocument.load(mergedBytes);
    assert.equal(mergedDoc.getPageCount(), 5);
    assert.equal(downloads.at(-1).download, 'pdf-mesclado.pdf');
});

await check('split extracts page ranges cleanly to single PDF and ZIP', async () => {
    const { window, downloads, makeSamplePdfFile } = await createPdfToolsEnv();
    window.document.querySelector('.tool-card[data-tool="split"]').click();
    await window.loadSinglePdfFile(await makeSamplePdfFile(5, 'apostila.pdf'));

    window.document.getElementById('splitRangeInput').value = '1, 3-4';
    const singleBytes = await window.executeSplitPdf();
    const singleDoc = await window.PDFLib.PDFDocument.load(singleBytes);
    assert.equal(singleDoc.getPageCount(), 3);
    assert.equal(downloads.at(-1).download, 'apostila-extraido.pdf');

    const zipEntries = new Map();
    window.JSZip = class MockJSZip {
        file(name, data) { zipEntries.set(name, data); }
        async generateAsync() { return new window.Blob(['zip']); }
    };
    window.document.getElementById('splitOutputMode').value = 'zip';
    const zipCount = await window.executeSplitPdf();
    assert.equal(zipCount, 3);
    assert.deepEqual(Array.from(zipEntries.keys()), ['pagina-1.pdf', 'pagina-3.pdf', 'pagina-4.pdf']);
    assert.equal(downloads.at(-1).download, 'apostila-paginas.zip');
});

await check('organize reorders, rotates, duplicates, removes pages, and saves valid PDF', async () => {
    const { window, downloads, makeSamplePdfFile } = await createPdfToolsEnv();
    window.document.querySelector('.tool-card[data-tool="organize"]').click();
    await window.loadSinglePdfFile(await makeSamplePdfFile(3, 'caderno.pdf'));

    window.rotateOrganizeItem(0);
    window.duplicateOrganizeItem(0);
    window.removeOrganizeItem(3);
    const outBytes = await window.executeOrganizePdf();
    const outDoc = await window.PDFLib.PDFDocument.load(outBytes);
    assert.equal(outDoc.getPageCount(), 3);
    assert.equal(outDoc.getPage(0).getRotation().angle, 90);
    assert.equal(downloads.at(-1).download, 'caderno-organizado.pdf');
});

await check('rotate applies rotation only to target range when specified', async () => {
    const { window, makeSamplePdfFile } = await createPdfToolsEnv();
    window.document.querySelector('.tool-card[data-tool="rotate"]').click();
    await window.loadSinglePdfFile(await makeSamplePdfFile(3, 'planta.pdf'));

    window.setRotateToolAngle(180);
    window.document.getElementById('rotatePageRange').value = '2';
    const outBytes = await window.executeRotatePdf();
    const doc = await window.PDFLib.PDFDocument.load(outBytes);
    assert.equal(doc.getPage(0).getRotation().angle, 0);
    assert.equal(doc.getPage(1).getRotation().angle, 180);
    assert.equal(doc.getPage(2).getRotation().angle, 0);
});

await check('watermark, page-numbers, nup, compress, metadata, extract-text, and sign produce valid outputs', async () => {
    const { window, run, downloads, makeSamplePdfFile } = await createPdfToolsEnv();
    const basePdf = await makeSamplePdfFile(4, 'contrato.pdf', { title: 'Original', author: 'Rafael' });

    // Watermark
    window.document.querySelector('.tool-card[data-tool="watermark"]').click();
    await window.loadSinglePdfFile(basePdf);
    const wmBytes = await window.executeWatermarkPdf();
    assert.equal((await window.PDFLib.PDFDocument.load(wmBytes)).getPageCount(), 4);

    // Page numbers
    window.document.querySelector('.tool-card[data-tool="page-numbers"]').click();
    window.document.getElementById('pgNumSkipFirst').checked = true;
    const numBytes = await window.executePageNumbersPdf();
    assert.equal((await window.PDFLib.PDFDocument.load(numBytes)).getPageCount(), 4);

    // N-up (4 pages into 2 per sheet => 2 output sheets)
    window.document.querySelector('.tool-card[data-tool="nup"]').click();
    const nupBytes = await window.executeNupPdf();
    assert.equal((await window.PDFLib.PDFDocument.load(nupBytes)).getPageCount(), 2);

    // Structural compression
    window.document.querySelector('.tool-card[data-tool="compress"]').click();
    window.document.getElementById('compressPdfMode').value = 'structural';
    const compBytes = await window.executeCompressPdf();
    assert.ok(compBytes.byteLength > 100);

    // Metadata inspection + cleanup
    window.document.querySelector('.tool-card[data-tool="metadata"]').click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(window.document.getElementById('metaAuthor').value, 'Rafael');
    window.clearMetadataFields();
    const cleanBytes = await window.executeMetadataSavePdf();
    const cleanDoc = await window.PDFLib.PDFDocument.load(cleanBytes);
    assert.equal(cleanDoc.getAuthor() || '', '');

    // Extract native text
    window.document.querySelector('.tool-card[data-tool="extract-text"]').click();
    await new Promise((r) => setTimeout(r, 20));
    const extracted = window.document.getElementById('extractedPdfText').value;
    assert.ok(extracted.includes('Texto página 1') && extracted.includes('Texto página 4'));

    // Sign with uploaded PNG data URL stamp
    window.document.querySelector('.tool-card[data-tool="sign"]').click();
    run(`signUploadedPngUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";`);
    const signedBytes = await window.executeSignPdf();
    assert.equal((await window.PDFLib.PDFDocument.load(signedBytes)).getPageCount(), 4);
    assert.equal(downloads.at(-1).download, 'contrato-assinado.pdf');
});

await check('img-to-pdf builds valid PDF from queued image items', async () => {
    const { window, run, downloads } = await createPdfToolsEnv();
    window.document.querySelector('.tool-card[data-tool="img-to-pdf"]').click();

    run(`imgToPdfItems = [{
        name: 'foto.png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        embedType: 'png',
        width: 400,
        height: 300
    }];`);
    window.renderActiveToolWorkspace();
    const outBytes = await window.executeImgToPdf();
    const doc = await window.PDFLib.PDFDocument.load(outBytes);
    assert.equal(doc.getPageCount(), 1);
    assert.equal(downloads.at(-1).download, 'imagens-convertidas.pdf');
});

await check('redact locates CPF/email/term matches, flattens redacted pages, keeps clean pages, and clears metadata', async () => {
    const { window, run, downloads, makeSamplePdfFile, mockPdfJsDocPages } = await createPdfToolsEnv();

    const boxes = window.findTextMatchNormalizedBoxes(
        [{ str: 'CPF 123.456.789-00 e email a@b.com', transform: [12, 0, 0, 12, 50, 700], width: 250, height: 12 }],
        { width: 600, height: 800, scale: 1, transform: [1, 0, 0, -1, 0, 800] },
        /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g
    );
    assert.equal(boxes.length, 1);
    assert.equal(boxes[0].label, '123.456.789-00');
    assert.ok(boxes[0].x >= 0 && boxes[0].y >= 0 && boxes[0].w > 0 && boxes[0].h > 0);

    mockPdfJsDocPages.set(1, 'Cliente João CPF 111.222.333-44 assinatura');
    mockPdfJsDocPages.set(2, 'Cláusula pública normal');

    window.document.querySelector('.tool-card[data-tool="redact"]').click();
    await window.loadSinglePdfFile(await makeSamplePdfFile(2, 'sigiloso.pdf', { author: 'Secreto', title: 'Contrato' }));

    // Empty export is rejected
    assert.equal(await window.executeRedactPdf(), null);

    // Preset CPF search marks page 1 only
    const matched = await window.markSensitivePreset('cpf');
    assert.equal(matched, 1);
    assert.equal(run('countTotalRedactBoxes()'), 1);

    // Custom search + undo on current page
    window.document.getElementById('redactSearchTerm').value = 'João';
    assert.equal(await window.markSensitivePreset('search'), 1);
    assert.equal(run('countTotalRedactBoxes()'), 2);
    window.undoRedactBoxOnPage();
    assert.equal(run('countTotalRedactBoxes()'), 1);

    // Clear boxes on page -> zero remaining, then re-mark email/cpf
    window.clearRedactBoxesOnPage();
    assert.equal(run('countTotalRedactBoxes()'), 0);
    await window.markSensitivePreset('cpf');

    const redactedBytes = await window.executeRedactPdf();
    const redactedDoc = await window.PDFLib.PDFDocument.load(redactedBytes);
    assert.equal(redactedDoc.getPageCount(), 2);
    assert.equal(redactedDoc.getAuthor() || '', '');
    assert.equal(redactedDoc.getTitle() || '', '');
    assert.equal(downloads.at(-1).download, 'sigiloso-redactado.pdf');

    // Direct helper check: skips whitespace-only items and trims padding
    const allHelperBoxes = window.extractAllTextNormalizedBoxes([
        { str: '   ', transform: [12, 0, 0, 12, 40, 600], width: 15, height: 12 },
        { str: '  Sigilo  ', transform: [12, 0, 0, 12, 40, 500], width: 90, height: 12 },
    ], { width: 595, height: 842, scale: 1 });
    assert.equal(allHelperBoxes.length, 1);

    // Clear page 1 -> 0 total boxes, then all-text-page marks only page 1
    window.clearRedactBoxesOnPage();
    assert.equal(run('countTotalRedactBoxes()'), 0);
    assert.equal(await window.markSensitivePreset('all-text-page'), 1);
    assert.equal(run('redactBoxesByPage.get(1)?.length || 0'), 1);
    assert.equal(run('redactBoxesByPage.get(2)?.length || 0'), 0);

    // Clear page 1 -> 0 total boxes, then all-text marks all pages and exports cleanly
    window.clearRedactBoxesOnPage();
    assert.equal(await window.markSensitivePreset('all-text'), 2);
    assert.equal(run('countTotalRedactBoxes()'), 2);
    assert.equal(run('redactBoxesByPage.get(1)?.length || 0'), 1);
    assert.equal(run('redactBoxesByPage.get(2)?.length || 0'), 1);

    const allRedactedBytes = await window.executeRedactPdf();
    const allRedactedDoc = await window.PDFLib.PDFDocument.load(allRedactedBytes);
    assert.equal(allRedactedDoc.getPageCount(), 2);
});

console.log(`\npdfTools DOM/Unit summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
    process.exit(1);
}

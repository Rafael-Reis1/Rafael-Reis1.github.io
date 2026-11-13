import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const IMG_CONVER_DIR = path.resolve('imgConver');
const HTML_PATH = path.join(IMG_CONVER_DIR, 'imgConver.html');
const SCRIPT_FILES = [
    'bg-removal.js',
    'phase1-tools.js',
    'phase2-tools.js',
    'phase3-tools.js',
    'phase4-tools.js',
    'phase5-tools.js',
    'phase6-tools.js',
    'app.js',
];

function createCanvasStub(windowRef) {
    let canvasIdSeq = 0;
    const downloads = [];

    function attachMockContext(canvasEl) {
        if (canvasEl._mockCtx) return canvasEl._mockCtx;
        canvasEl._ops = [];
        canvasEl._version = 0;
        const id = ++canvasIdSeq;

        const record = (name, args = []) => {
            canvasEl._version += 1;
            canvasEl._ops.push({ name, args });
        };

        const mockCtx = {
            canvas: canvasEl,
            filter: 'none',
            fillStyle: '#000000',
            strokeStyle: '#000000',
            lineWidth: 1,
            lineCap: 'butt',
            lineJoin: 'miter',
            font: '10px sans-serif',
            textAlign: 'start',
            textBaseline: 'alphabetic',
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
            save() { record('save'); },
            restore() { record('restore'); },
            clearRect(...args) { record('clearRect', args); },
            fillRect(...args) { record('fillRect', args); },
            strokeRect(...args) { record('strokeRect', args); },
            beginPath() { record('beginPath'); },
            closePath() { record('closePath'); },
            arc(...args) { record('arc', args); },
            rect(...args) { record('rect', args); },
            clip() { record('clip'); },
            moveTo(...args) { record('moveTo', args); },
            lineTo(...args) { record('lineTo', args); },
            quadraticCurveTo(...args) { record('quadraticCurveTo', args); },
            setLineDash(...args) { record('setLineDash', args); },
            stroke() { record('stroke'); },
            fill() { record('fill'); },
            translate(...args) { record('translate', args); },
            rotate(...args) { record('rotate', args); },
            scale(...args) { record('scale', args); },
            createLinearGradient(...args) {
                record('createLinearGradient', args);
                return { addColorStop() {} };
            },
            createRadialGradient(...args) {
                record('createRadialGradient', args);
                return { addColorStop() {} };
            },
            drawImage(...args) { record('drawImage', [args[0]?.src || 'canvas', ...args.slice(1)]); },
            fillText(...args) { record('fillText', args); },
            strokeText(...args) { record('strokeText', args); },
            measureText(text) {
                return { width: String(text || '').length * 10 };
            },
            getImageData(x, y, w, h) {
                const width = Math.max(1, Math.floor(w || canvasEl.width || 1));
                const height = Math.max(1, Math.floor(h || canvasEl.height || 1));
                return { width, height, data: new Uint8ClampedArray(width * height * 4) };
            },
            putImageData(imageData) {
                record('putImageData', [imageData?.width, imageData?.height]);
            },
        };

        canvasEl._mockCtx = mockCtx;
        canvasEl._id = id;
        return mockCtx;
    }

    windowRef.HTMLCanvasElement.prototype.getContext = function getContext(type) {
        if (type !== '2d') return null;
        return attachMockContext(this);
    };

    windowRef.HTMLCanvasElement.prototype.toDataURL = function toDataURL(type = 'image/png') {
        const version = this._version || 0;
        const id = this._id || 0;
        return `data:${type};base64,stub-${id}-${this.width}x${this.height}-v${version}`;
    };

    windowRef.HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type = 'image/png', quality) {
        const blob = new windowRef.Blob([`${this.width}x${this.height}`], { type });
        blob._canvasWidth = this.width;
        blob._canvasHeight = this.height;
        blob._ops = [...(this._ops || [])];
        blob._quality = quality;
        callback(blob);
    };

    class MockImage {
        constructor() {
            this.width = 400;
            this.height = 300;
            this.onload = null;
            this.onerror = null;
            this._src = '';
        }

        set src(value) {
            this._src = value;
            const match = String(value).match(/(\d+)x(\d+)/);
            if (match) {
                this.width = Number(match[1]);
                this.height = Number(match[2]);
            }
            if (typeof this.onload === 'function') {
                setTimeout(() => {
                    if (typeof this.onload === 'function') this.onload();
                }, 0);
            }
        }

        get src() {
            return this._src;
        }
    }

    windowRef.Image = MockImage;
    windowRef.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
    windowRef.cancelAnimationFrame = (id) => clearTimeout(id);

    const blobRegistry = new Map();
    let blobSeq = 0;
    windowRef.URL.createObjectURL = (blob) => {
        const url = `blob:test/${++blobSeq}`;
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
            blob: blobRegistry.get(this.href) || null,
        });
    };

    return { downloads };
}

async function createImgConverEnv() {
    const rawHtml = fs.readFileSync(HTML_PATH, 'utf8');
    // Strip external CDN script tags so jsdom stays local and fast.
    const cleanHtml = rawHtml
        .replace(/<script\b[^>]*\bsrc="https?:\/\/[^"]*"[^>]*><\/script>/gi, '')
        .replace(/<script type="importmap">[\s\S]*?<\/script>/gi, '');

    const dom = new JSDOM(cleanHtml, {
        url: 'http://localhost/imgConver/imgConver.html',
        runScripts: 'outside-only',
    });

    const { window } = dom;
    const vmContext = dom.getInternalVMContext();
    const run = (code, filename = 'test.js') => vm.runInContext(code, vmContext, { filename });
    const { downloads } = createCanvasStub(window);

    for (const file of SCRIPT_FILES) {
        const code = fs.readFileSync(path.join(IMG_CONVER_DIR, file), 'utf8');
        run(code, file);
    }

    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    const loadTestImage = (width = 400, height = 300, label = 'base') => {
        const img = new window.Image();
        img.width = width;
        img.height = height;
        img._src = `data:image/png;base64,${label}-${width}x${height}`;
        window.__testImg = img;
        run(`
            initialLoadedImage = window.__testImg;
            originalImage = window.__testImg;
            trueOriginalImage = window.__testImg;
            displayImage(window.__testImg);
            showEditor();
            if (typeof initHistory === 'function') initHistory();
        `);
        delete window.__testImg;
        return img;
    };

    const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

    return { dom, window, run, downloads, loadTestImage, tick };
}

let passed = 0;
let failed = 0;

async function check(name, fn) {
    try {
        await fn();
        passed += 1;
        console.log(`PASS ${name}`);
    } catch (err) {
        failed += 1;
        console.error(`FAIL ${name}: ${err.stack || err.message}`);
    }
}

await check('all tool cards in imgConver.html open and build controls (including compare and batch)', async () => {
    const { window, run, loadTestImage } = await createImgConverEnv();
    const cards = Array.from(window.document.querySelectorAll('.tool-card[data-tool]'));
    const tools = cards.map((card) => card.dataset.tool);

    assert.ok(tools.includes('compare'), 'compare tool card must exist');
    assert.ok(tools.includes('batch'), 'batch tool card must exist');
    assert.ok(tools.includes('mockup'), 'mockup tool card must exist');
    assert.ok(tools.includes('favicon'), 'favicon tool card must exist');
    assert.ok(tools.includes('img-to-pdf'), 'img-to-pdf tool card must exist');
    assert.ok(tools.includes('split-grid'), 'split-grid tool card must exist');
    assert.ok(tools.includes('svg-raster'), 'svg-raster tool card must exist');
    assert.ok(tools.includes('code-image'), 'code-image tool card must exist');
    assert.equal(cards.length, 35, 'expected 35 tool cards');

    // Standalone tools should open straight into editor without an existing image.
    for (const standaloneTool of ['batch', 'collage', 'img-to-pdf', 'svg-raster', 'code-image']) {
        run(`currentTool = ${JSON.stringify(standaloneTool)};`);
        window.openToolModal(standaloneTool);
        assert.equal(window.document.getElementById('editorArea').style.display, 'flex');
        assert.ok(window.document.getElementById('controls').children.length > 0);
        window.closeToolModal();
    }

    loadTestImage(400, 300);
    for (const tool of tools) {
        run(`currentTool = ${JSON.stringify(tool)};`);
        window.openToolModal(tool);
        assert.notEqual(
            window.document.getElementById('modalTitle').textContent,
            'Ferramenta',
            `tool "${tool}" must have a specific modal title`
        );
        assert.ok(
            window.document.getElementById('controls').children.length > 0,
            `tool "${tool}" must render controls`
        );
    }
});

await check('cleanupToolState clears canvas listeners and aborts active window listeners', async () => {
    const { window, run, loadTestImage } = await createImgConverEnv();
    loadTestImage(400, 300);

    run(`currentTool = 'censor';`);
    window.openToolModal('censor');
    const canvas = window.document.getElementById('canvas');
    assert.equal(canvas.onmouseout, null, 'censor should not attach leaky canvas.onmouseout');
    assert.equal(typeof canvas.onmousedown, 'function');

    window.cleanupToolState();
    assert.equal(canvas.onmousedown, null);
    assert.equal(canvas.onmousemove, null);
    assert.equal(canvas.onmouseup, null);
    assert.equal(canvas.onmouseleave, null);
    assert.equal(canvas.onclick, null);
});

await check('clampCropRect normalizes negative drags and clamps within image bounds', async () => {
    const { window } = await createImgConverEnv();
    const clamped = window.clampCropRect({ x: 50, y: 40, width: -100, height: 500 }, 400, 300);
    assert.deepEqual(
        { x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height },
        { x: 0, y: 40, width: 50, height: 260 }
    );
});

await check('getOutputFilename returns valid names without trailing spaces or missing extensions', async () => {
    const { window } = await createImgConverEnv();
    assert.equal(window.getOutputFilename('convert', 'image/webp'), 'imagem-convertida.webp');
    assert.equal(window.getOutputFilename('compress', 'image/jpeg'), 'imagem-comprimida.jpg');
    assert.equal(window.getOutputFilename('aspect-ratio'), 'imagem-proporcao.png');
    assert.equal(window.getOutputFilename('scanner'), 'documento-escaneado.png');
    assert.equal(window.getOutputFilename('upscale'), 'imagem-upscale.png');
    assert.equal(window.getOutputFilename('compare'), 'imagem-editada.png');
});

await check('circle-crop clamps center and downloads circular PNG even with preview off', async () => {
    const { window, run, downloads, loadTestImage } = await createImgConverEnv();
    loadTestImage(400, 300);

    run(`currentTool = 'circle-crop';`);
    window.openToolModal('circle-crop');

    run(`circleCropX = 10; circleCropY = 9999; clampCircleCenter();`);
    assert.equal(run('circleCropX'), 150);
    assert.equal(run('circleCropY'), 150);

    // Toggle preview OFF, then download: export must still use circular clip!
    window.toggleCirclePreview();
    window.downloadImage();

    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].download, 'avatar-circular.png');
    assert.equal(downloads[0].blob.type, 'image/png');
    assert.equal(downloads[0].blob._canvasWidth, 300);
    assert.equal(downloads[0].blob._canvasHeight, 300);
    assert.ok(downloads[0].blob._ops.some((op) => op.name === 'arc'));
    assert.ok(downloads[0].blob._ops.some((op) => op.name === 'clip'));
});

await check('applyFilters clears canvas before filter draw and previewResize ignores NaN input', async () => {
    const { window, run, loadTestImage } = await createImgConverEnv();
    loadTestImage(400, 300);

    run(`currentTool = 'filters';`);
    window.openToolModal('filters');
    const canvas = window.document.getElementById('canvas');
    canvas._ops = [];
    window.applyFilters();
    const clearIdx = canvas._ops.findIndex((op) => op.name === 'clearRect');
    const drawIdx = canvas._ops.findIndex((op) => op.name === 'drawImage');
    assert.ok(clearIdx !== -1 && clearIdx < drawIdx, 'clearRect must run before drawImage');

    run(`currentTool = 'resize';`);
    window.openToolModal('resize');
    const widthInput = window.document.getElementById('resizeWidth');
    widthInput.value = '';
    window.previewResize('width');
    assert.equal(canvas.width, 400);
    assert.equal(canvas.height, 300);
});

await check('kMeansClustering avoids duplicate centroid collapse and rgbToHex clamps channels', async () => {
    const { window } = await createImgConverEnv();
    const colors = [];
    for (let i = 0; i < 100; i++) colors.push({ r: 0, g: 0, b: 0 });
    for (let i = 0; i < 30; i++) colors.push({ r: 255, g: 0, b: 0 });
    for (let i = 0; i < 20; i++) colors.push({ r: 0, g: 0, b: 255 });

    const palette = window.kMeansClustering(colors, 3);
    const hexes = Array.from(palette, (c) => window.rgbToHex(c.r, c.g, c.b).toUpperCase());
    assert.deepEqual(hexes, ['#000000', '#FF0000', '#0000FF']);
    assert.equal(window.rgbToHex(300, -5, 16), '#ff0010');
});

await check('wrapMemeLines wraps long lines and loadBase64FromModal resets history cleanly', async () => {
    const { window, run, tick } = await createImgConverEnv();
    const canvas = window.document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    const lines = window.wrapMemeLines(ctx, 'THIS IS A VERY LONG MEME CAPTION THAT MUST WRAP', 120);
    assert.ok(lines.length >= 3, 'expected wrapped lines when caption exceeds maxWidth');

    window.openBase64Modal();
    window.document.getElementById('base64InputModal').value = 'data:image/png;base64,800x600';
    run(`currentTool = 'filters';`);
    window.loadBase64FromModal();
    await tick();

    assert.equal(run('originalImage.width'), 800);
    assert.equal(run('historyStack.length'), 1);
    assert.equal(run('historyIndex'), 0);
    assert.equal(window.document.getElementById('btnUndo').disabled, true);
});

await check('historyStack undo/redo restores snapshots and respects modal & input guards', async () => {
    const { window, run, loadTestImage, tick } = await createImgConverEnv();
    loadTestImage(400, 300);

    run(`currentTool = 'filters';`);
    window.openToolModal('filters');
    assert.equal(window.document.getElementById('btnUndo').disabled, true);
    assert.equal(window.document.getElementById('btnRedo').disabled, true);

    const canvas = window.document.getElementById('canvas');
    canvas.getContext('2d').fillRect(0, 0, 10, 10);
    window.saveToHistory();
    assert.equal(window.document.getElementById('btnUndo').disabled, false);

    // Ctrl+Z inside an input field must not trigger canvas undo.
    const input = window.document.createElement('input');
    window.document.getElementById('controls').appendChild(input);
    input.focus();
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    assert.equal(run('historyIndex'), 1);

    window.undo();
    await tick();
    assert.equal(run('historyIndex'), 0);
    assert.equal(window.document.getElementById('btnUndo').disabled, true);
    assert.equal(window.document.getElementById('btnRedo').disabled, false);

    window.redo();
    await tick();
    assert.equal(run('historyIndex'), 1);
    assert.equal(window.document.getElementById('btnRedo').disabled, true);

    // Ctrl+Z when modal is closed must not alter history either.
    window.closeToolModal();
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    assert.equal(run('historyIndex'), 1);
});

await check('applyScanFilter reads from scannerWarpedBase non-destructively', async () => {
    const { window, run, loadTestImage, tick } = await createImgConverEnv();
    loadTestImage(400, 300);

    run(`currentTool = 'scanner';`);
    window.openToolModal('scanner');
    const warpedImg = new window.Image();
    warpedImg._src = 'data:image/png;base64,warped-250x350';
    warpedImg.width = 250;
    warpedImg.height = 350;
    window.__warpedImg = warpedImg;
    run(`scannerWarpedBase = window.__warpedImg;`);
    delete window.__warpedImg;

    window.document.getElementById('scanActions').style.display = 'block';
    const buttons = window.document.querySelectorAll('#scanActions .filter-btn');
    window.applyScanFilter('bw', buttons[1]);
    await tick();

    assert.equal(run('originalImage.width'), 250);
    assert.ok(buttons[1].classList.contains('active'));

    // Applying 'none' afterward must still draw from scannerWarpedBase, not the 'bw' image.
    const canvas = window.document.getElementById('canvas');
    canvas._ops = [];
    window.applyScanFilter('none', buttons[0]);
    await tick();
    assert.equal(run('scannerWarpedBase')._src, 'data:image/png;base64,warped-250x350');
    assert.ok(buttons[0].classList.contains('active'));
    assert.equal(buttons[1].classList.contains('active'), false);
});

await check('bgWorker.onerror rejects pending work and initCustomSelects attaches single doc listener', async () => {
    const { window, run, loadTestImage } = await createImgConverEnv();
    let createdWorker = null;
    window.Worker = class MockWorker {
        constructor() {
            createdWorker = this;
        }
        postMessage() {}
    };

    const promise = window.removeBackgroundWorker(new window.Blob(['x']));
    assert.ok(createdWorker, 'expected Worker instance to be created');
    createdWorker.onerror({ message: 'Worker crashed' });
    await assert.rejects(promise, /Worker crashed/);

    // Ensure repeated initCustomSelects calls keep working cleanly without multiplying active classes.
    loadTestImage(400, 300);
    run(`currentTool = 'compress';`);
    window.openToolModal('compress');
    window.initCustomSelects();
    window.initCustomSelects();

    const trigger = window.document.querySelector('.custom-select-container .select-trigger');
    assert.ok(trigger, 'custom select trigger should exist');
    trigger.click();
    assert.ok(trigger.parentElement.classList.contains('active'));
    window.document.body.click();
    assert.equal(trigger.parentElement.classList.contains('active'), false);
});

await check('CDNs are lazy-loaded on demand via loadExternalScript with deduplication and retry', async () => {
    const rawHtml = fs.readFileSync(HTML_PATH, 'utf8');
    assert.equal(/cdn\.jsdelivr\.net\/npm\/@tensorflow/i.test(rawHtml), false, 'tfjs should not load eagerly');
    assert.equal(/cdn\.jsdelivr\.net\/npm\/tesseract\.js/i.test(rawHtml), false, 'tesseract should not load eagerly');
    assert.equal(/docs\.opencv\.org/i.test(rawHtml), false, 'opencv should not load eagerly');

    const { window } = await createImgConverEnv();
    const appended = [];
    const origAppend = window.document.head.appendChild.bind(window.document.head);
    window.document.head.appendChild = (el) => {
        appended.push(el);
        return origAppend(el);
    };

    // Concurrent calls share the same <script> request.
    const p1 = window.loadExternalScript('https://example.test/fail-then-ok.js', () => Boolean(window.__testLibLoaded));
    const p2 = window.loadExternalScript('https://example.test/fail-then-ok.js', () => Boolean(window.__testLibLoaded));
    assert.equal(appended.length, 1);

    appended[0].onerror();
    await assert.rejects(p1, /Falha ao carregar biblioteca/);
    await assert.rejects(p2, /Falha ao carregar biblioteca/);
    assert.equal(appended[0].isConnected, false, 'failed script tag should be removed');

    // Retry creates a fresh <script> tag and resolves when loaded.
    const pRetry = window.loadExternalScript('https://example.test/fail-then-ok.js', () => Boolean(window.__testLibLoaded));
    assert.equal(appended.length, 2);
    window.__testLibLoaded = true;
    appended[1].onload();
    await pRetry;

    // Loader helpers (BlazeFace, Tesseract, OpenCV) load lazily on demand.
    const pBf = window.ensureBlazeFaceReady();
    assert.ok(appended[2].src.includes('@tensorflow/tfjs'));
    window.tf = {};
    appended[2].onload();
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(appended[3].src.includes('@tensorflow-models/blazeface'));
    window.blazeface = { load: async () => ({}) };
    appended[3].onload();
    await pBf;

    const pTess = window.ensureTesseractReady();
    assert.ok(appended[4].src.includes('tesseract.js'));
    window.Tesseract = { recognize: async () => ({ data: { text: '', words: [] } }) };
    appended[4].onload();
    await pTess;

    const pCv = window.ensureOpenCVReady();
    assert.ok(appended[5].src.includes('opencv.js'));
    window.cv = { Mat: function MockMat() {} };
    appended[5].onload();
    assert.equal(await pCv, true);
});

await check('clipboard Ctrl+V paste loads single images, ignores text-only paste, and appends to batch', async () => {
    const { window, run } = await createImgConverEnv();

    // Stub FileReader for deterministic image data URL output in JSDOM.
    window.FileReader = class MockFileReader {
        readAsDataURL(file) {
            this.result = `data:image/png;base64,pasted-${file.name}-640x480`;
            setTimeout(() => {
                if (typeof this.onload === 'function') this.onload({ target: { result: this.result } });
            }, 0);
        }
    };

    // Text-only paste must not be hijacked or call preventDefault.
    const textPasteEvt = new window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(textPasteEvt, 'clipboardData', {
        value: { items: [{ type: 'text/plain', getAsFile: () => null }], files: [] },
    });
    window.document.dispatchEvent(textPasteEvt);
    assert.equal(textPasteEvt.defaultPrevented, false);

    // Image paste outside modal opens the editor with pasted image dimensions.
    const pngFile = new window.File(['png'], 'screenshot.png', { type: 'image/png' });
    const imgPasteEvt = new window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(imgPasteEvt, 'clipboardData', {
        value: { items: [{ type: 'image/png', getAsFile: () => pngFile }], files: [pngFile] },
    });
    window.document.dispatchEvent(imgPasteEvt);
    assert.equal(imgPasteEvt.defaultPrevented, true);
    await new Promise((r) => setTimeout(r, 25));

    assert.equal(window.document.getElementById('toolModal').classList.contains('active'), true);
    assert.equal(run('originalImage.width'), 640);
    assert.equal(run('originalImage.height'), 480);

    // Pasting while batch modal is active appends the image to batchImages.
    run(`currentTool = 'batch';`);
    window.openToolModal('batch');
    const batchPasteEvt = new window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(batchPasteEvt, 'clipboardData', {
        value: { items: [{ type: 'image/png', getAsFile: () => pngFile }], files: [pngFile] },
    });
    window.document.dispatchEvent(batchPasteEvt);
    assert.equal(run('batchImages.length'), 1);
});

await check('hold-to-compare button temporarily previews original and restores canvas state on release', async () => {
    const { window, run, loadTestImage } = await createImgConverEnv();
    loadTestImage(400, 300);

    run(`currentTool = 'resize';`);
    window.openToolModal('resize');
    const toolbar = window.document.getElementById('previewToolbar');
    const btnHold = window.document.getElementById('btnHoldCompare');
    const canvas = window.document.getElementById('canvas');
    assert.equal(toolbar.style.display, 'flex');

    // Resize canvas preview to 200x150 before holding compare.
    const widthInput = window.document.getElementById('resizeWidth');
    widthInput.value = '200';
    widthInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(canvas.width, 200);
    assert.equal(canvas.height, 150);

    btnHold.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    assert.equal(btnHold.classList.contains('active'), true);
    assert.equal(btnHold.getAttribute('aria-pressed'), 'true');
    assert.equal(canvas.width, 400);
    assert.equal(canvas.height, 300);

    window.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    assert.equal(btnHold.classList.contains('active'), false);
    assert.equal(btnHold.getAttribute('aria-pressed'), 'false');
    assert.equal(canvas.width, 200);
    assert.equal(canvas.height, 150);

    // Toolbar hides in batch/compare layout modes.
    run(`currentTool = 'compare';`);
    window.openToolModal('compare');
    assert.equal(toolbar.style.display, 'none');
});

await check('custom selects expose ARIA attributes and support Arrow, Enter, and Escape keyboard navigation', async () => {
    const { window, run, loadTestImage } = await createImgConverEnv();
    loadTestImage(400, 300);

    run(`currentTool = 'compress';`);
    window.openToolModal('compress');
    window.initCustomSelects();

    const container = window.document.querySelector('.custom-select-container');
    const trigger = container.querySelector('.select-trigger');
    const listbox = container.querySelector('.select-options');
    const options = Array.from(listbox.querySelectorAll('.custom-option'));
    const nativeSelect = container.querySelector('select');

    assert.equal(trigger.getAttribute('role'), 'combobox');
    assert.equal(trigger.getAttribute('aria-haspopup'), 'listbox');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(listbox.getAttribute('role'), 'listbox');
    assert.equal(options[0].getAttribute('role'), 'option');

    // ArrowDown opens, second ArrowDown highlights WEBP, Escape closes only dropdown (keeps modal open).
    trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(window.document.getElementById('toolModal').classList.contains('active'), true);

    // Open again, move down to WEBP, press Enter to select.
    trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert.ok(options[1].classList.contains('focused'));
    trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    assert.equal(nativeSelect.value, 'image/webp');
    assert.equal(options[1].getAttribute('aria-selected'), 'true');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});

await check('updateCache.js includes imgConver for cache versioning', async () => {
    const cacheScript = fs.readFileSync(path.resolve('updateCache.js'), 'utf8');
    assert.equal(/'imgConver'/.test(cacheScript), false, 'imgConver should not be in IGNORED_DIRS');
});

await check('filters supports invert, sharpen convolution, and vignette radial overlay', async () => {
    const { window, run, loadTestImage } = await createImgConverEnv();
    loadTestImage(40, 30);

    run(`currentTool = 'filters';`);
    window.openToolModal('filters');

    const invertSlider = window.document.getElementById('invert');
    const sharpenSlider = window.document.getElementById('sharpen');
    const vignetteSlider = window.document.getElementById('vignette');
    assert.ok(invertSlider && sharpenSlider && vignetteSlider, 'new filter sliders must exist');

    const canvas = window.document.getElementById('canvas');
    canvas._ops = [];
    sharpenSlider.value = '80';
    sharpenSlider.dispatchEvent(new window.Event('input'));
    vignetteSlider.value = '60';
    vignetteSlider.dispatchEvent(new window.Event('input'));

    assert.ok(canvas._ops.some((op) => op.name === 'putImageData'), 'sharpen should update imageData');
    assert.ok(canvas._ops.some((op) => op.name === 'createRadialGradient'), 'vignette should draw radial gradient');

    // Sharpen convolution unit check on a 3x3 pixel block with a bright center pixel.
    const imgData = {
        width: 3,
        height: 3,
        data: new Uint8ClampedArray([
            0, 0, 0, 255,   0, 0, 0, 255,   0, 0, 0, 255,
            0, 0, 0, 255,  80, 80, 80, 255, 0, 0, 0, 255,
            0, 0, 0, 255,   0, 0, 0, 255,   0, 0, 0, 255,
        ]),
    };
    window.applySharpenToImageData(imgData, 100);
    assert.equal(imgData.data[4 * 4], 255, 'center edge pixel should sharpen cleanly clamped to 255');
});

await check('privacy EXIF inspector parses TIFF Make/GPS tags safely and strips metadata on demand', async () => {
    const { window, run, loadTestImage } = await createImgConverEnv();

    // Build minimal valid JPEG with APP1 Exif (little-endian TIFF containing Make="<XSS>Cam" & GPSInfo).
    const makeStr = '<script>Cam\0';
    const tiffSize = 8 + 2 + 24 + 4 + makeStr.length + 2 + 48 + 4 + 48;
    const totalBytes = 2 + 2 + 2 + 6 + tiffSize + 2;
    const buf = new ArrayBuffer(totalBytes);
    const dv = new DataView(buf);
    let pos = 0;
    dv.setUint16(pos, 0xFFD8, false); pos += 2; // SOI
    dv.setUint16(pos, 0xFFE1, false); pos += 2; // APP1
    dv.setUint16(pos, 2 + 6 + tiffSize, false); pos += 2;
    'Exif\0\0'.split('').forEach((ch, idx) => dv.setUint8(pos + idx, ch.charCodeAt(0)));
    pos += 6;
    const tiffStart = pos;
    dv.setUint8(tiffStart, 0x49); dv.setUint8(tiffStart + 1, 0x49); // "II"
    dv.setUint16(tiffStart + 2, 42, true);
    dv.setUint32(tiffStart + 4, 8, true); // IFD0 offset

    const ifd0 = tiffStart + 8;
    const makeDataRel = 8 + 2 + 24 + 4;
    const gpsIfdRel = makeDataRel + makeStr.length;
    dv.setUint16(ifd0, 2, true); // 2 entries
    // Entry 0: Make (0x010F), ASCII (2), count, offset
    dv.setUint16(ifd0 + 2, 0x010F, true);
    dv.setUint16(ifd0 + 4, 2, true);
    dv.setUint32(ifd0 + 6, makeStr.length, true);
    dv.setUint32(ifd0 + 10, makeDataRel, true);
    // Entry 1: GPSInfo (0x8825), LONG (4), count 1, offset
    dv.setUint16(ifd0 + 14, 0x8825, true);
    dv.setUint16(ifd0 + 16, 4, true);
    dv.setUint32(ifd0 + 18, 1, true);
    dv.setUint32(ifd0 + 22, gpsIfdRel, true);
    dv.setUint32(ifd0 + 26, 0, true);

    for (let i = 0; i < makeStr.length; i++) {
        dv.setUint8(tiffStart + makeDataRel + i, makeStr.charCodeAt(i));
    }

    const gpsIfd = tiffStart + gpsIfdRel;
    const latDmsRel = gpsIfdRel + 2 + 48 + 4;
    const lonDmsRel = latDmsRel + 24;
    dv.setUint16(gpsIfd, 4, true);
    // LatRef 'S'
    dv.setUint16(gpsIfd + 2, 0x0001, true); dv.setUint16(gpsIfd + 4, 2, true); dv.setUint32(gpsIfd + 6, 2, true); dv.setUint8(gpsIfd + 10, 83); dv.setUint8(gpsIfd + 11, 0);
    // Lat RATIONAL[3] = [23, 30, 0] -> -23.5
    dv.setUint16(gpsIfd + 14, 0x0002, true); dv.setUint16(gpsIfd + 16, 5, true); dv.setUint32(gpsIfd + 18, 3, true); dv.setUint32(gpsIfd + 22, latDmsRel, true);
    // LonRef 'W'
    dv.setUint16(gpsIfd + 26, 0x0003, true); dv.setUint16(gpsIfd + 28, 2, true); dv.setUint32(gpsIfd + 30, 2, true); dv.setUint8(gpsIfd + 34, 87); dv.setUint8(gpsIfd + 35, 0);
    // Lon RATIONAL[3] = [46, 30, 0] -> -46.5
    dv.setUint16(gpsIfd + 38, 0x0004, true); dv.setUint16(gpsIfd + 40, 5, true); dv.setUint32(gpsIfd + 42, 3, true); dv.setUint32(gpsIfd + 46, lonDmsRel, true);
    dv.setUint32(gpsIfd + 50, 0, true);

    const writeRational3 = (rel, d, m, s) => {
        const base = tiffStart + rel;
        [d, m, s].forEach((val, idx) => {
            dv.setUint32(base + idx * 8, val, true);
            dv.setUint32(base + idx * 8 + 4, 1, true);
        });
    };
    writeRational3(latDmsRel, 23, 30, 0);
    writeRational3(lonDmsRel, 46, 30, 0);
    dv.setUint16(tiffStart + tiffSize, 0xFFD9, false); // EOI

    const meta = window.parseImageMetadata(buf, { name: 'foto.jpg', size: totalBytes, type: 'image/jpeg', width: 400, height: 300 });
    assert.equal(meta.hasExif, true);
    assert.equal(meta.hasGps, true);
    assert.deepEqual({ ...meta.gpsCoords }, { lat: -23.5, lon: -46.5 });
    assert.ok(meta.tags.some((t) => t.label === 'Fabricante' && t.value === '<script>Cam'));

    loadTestImage(400, 300);
    window.__parsedMeta = meta;
    run(`lastLoadedMetadata = window.__parsedMeta; currentTool = 'privacy';`);
    delete window.__parsedMeta;

    window.openToolModal('privacy');
    const reportEl = window.document.getElementById('privacyMetaReport');
    assert.ok(reportEl.textContent.includes('GPS'));
    assert.equal(reportEl.querySelectorAll('script').length, 0, 'XSS EXIF tag value must be escaped');

    window.stripMetadataNow();
    assert.equal(run('lastLoadedMetadata.cleanedByCanvas'), true);
    assert.ok(reportEl.textContent.includes('Imagem limpa'));
});

await check('mockup renders framed window + gradient background', async () => {
    const { window, run, loadTestImage } = await createImgConverEnv();
    loadTestImage(400, 300);

    run(`currentTool = 'mockup';`);
    window.openToolModal('mockup');

    const canvas = window.document.getElementById('canvas');
    // Default padding=48 => width=400+96=496, height=300+titleBar+96 > 400.
    assert.equal(canvas.width, 496);
    assert.ok(canvas.height > 400);
    assert.ok(canvas._ops.some((op) => op.name === 'createLinearGradient'));
    assert.ok(canvas._ops.some((op) => op.name === 'quadraticCurveTo'));
});

await check('favicon tool creates valid multi-size ICO header and ZIP kit with PNGs + manifest', async () => {
    const { window, run, downloads, loadTestImage } = await createImgConverEnv();
    loadTestImage(400, 300);

    const zipEntries = new Map();
    window.JSZip = class MockJSZip {
        file(name, data) { zipEntries.set(name, data); }
        async generateAsync({ type }) { return new window.Blob(['zip'], { type: 'application/zip' }); }
    };

    const icoBytes = window.createIcoFromPngEntries([
        { size: 16, bytes: new Uint8Array([1, 2, 3]) },
        { size: 32, bytes: new Uint8Array([4, 5, 6, 7]) },
    ]);
    const dv = new DataView(icoBytes.buffer);
    assert.equal(dv.getUint16(0, true), 0);
    assert.equal(dv.getUint16(2, true), 1); // ICO type
    assert.equal(dv.getUint16(4, true), 2); // 2 images
    assert.equal(dv.getUint8(6), 16);
    assert.equal(dv.getUint8(6 + 16), 32);

    run(`currentTool = 'favicon';`);
    window.openToolModal('favicon');
    await window.downloadFaviconKit();

    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].download, 'favicon-kit.zip');
    for (const expected of [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'favicon-48x48.png',
        'apple-touch-icon.png',
        'icon-192x192.png',
        'icon-512x512.png',
        'site.webmanifest',
        'snippet-html.txt',
    ]) {
        assert.ok(zipEntries.has(expected), `missing ${expected} in favicon kit`);
    }
});

await check('img-to-pdf builds valid binary multi-page PDF and supports reorder/remove', async () => {
    const { window, run, downloads, loadTestImage } = await createImgConverEnv();
    loadTestImage(400, 300);

    const pdfBytes = window.buildPdfFromJpegPages([
        { widthPx: 400, heightPx: 300, jpegBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), pageW: 595.28, pageH: 841.89, drawW: 500, drawH: 375, drawX: 47.64, drawY: 233.44 },
        { widthPx: 300, heightPx: 400, jpegBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), pageW: 595.28, pageH: 841.89, drawW: 375, drawH: 500, drawX: 110.14, drawY: 170.94 },
    ]);
    const pdfAscii = Buffer.from(pdfBytes).toString('latin1');
    assert.ok(pdfAscii.startsWith('%PDF-1.4\n'));
    assert.ok(pdfAscii.includes('/Count 2'));
    assert.ok(pdfAscii.includes('/Filter /DCTDecode'));
    assert.ok(pdfAscii.includes('xref\n'));
    assert.ok(pdfAscii.trimEnd().endsWith('%%EOF'));

    run(`currentTool = 'img-to-pdf';`);
    window.openToolModal('img-to-pdf');
    assert.equal(run('pdfPages.length'), 1);

    await window.generatePdfFromImages();
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].download, 'imagens-convertidas.pdf');
    assert.equal(downloads[0].blob.type, 'application/pdf');
});

await check('split-grid previews dashed slices and downloads all tiles in ZIP cleanly', async () => {
    const { window, run, downloads, loadTestImage } = await createImgConverEnv();
    loadTestImage(600, 400);

    const zipEntries = new Map();
    window.JSZip = class MockJSZip {
        file(name, data) { zipEntries.set(name, data); }
        async generateAsync() { return new window.Blob(['zip'], { type: 'application/zip' }); }
    };

    run(`currentTool = 'split-grid';`);
    window.openToolModal('split-grid');
    window.setSplitGridPreset(2, 2);
    assert.ok(window.document.getElementById('splitGridSummary').textContent.includes('4 fatias'));

    await window.downloadSplitGridZip();
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].download, 'grade-recortada.zip');
    assert.deepEqual(Array.from(zipEntries.keys()), [
        'fatia-01-L1C1.png',
        'fatia-02-L1C2.png',
        'fatia-03-L2C1.png',
        'fatia-04-L2C2.png',
    ]);
});

await check('svg-raster sanitizes unsafe markup, parses viewBox ratio, and renders target resolution', async () => {
    const { window, run } = await createImgConverEnv();

    const unsafe = '<svg viewBox="0 0 200 100" onload="alert(1)"><script>evil()</script><a href="javascript:void(0)"><rect width="200" height="100"/></a></svg>';
    const cleaned = window.sanitizeSvgMarkup(unsafe);
    assert.equal(/<script/i.test(cleaned), false);
    assert.equal(/onload=/i.test(cleaned), false);
    assert.equal(/javascript:/i.test(cleaned), false);

    assert.deepEqual({ ...window.parseSvgNaturalSize(cleaned) }, { width: 200, height: 100 });

    run(`currentTool = 'svg-raster';`);
    window.openToolModal('svg-raster');
    window.document.getElementById('svgMarkupInput').value = unsafe;
    window.loadSvgFromTextarea();
    await new Promise((r) => setTimeout(r, 20));

    window.setSvgTargetWidth(1000);
    const canvas = window.document.getElementById('canvas');
    assert.equal(canvas.width, 1000);
    assert.equal(canvas.height, 500, 'height must preserve 200:100 viewBox ratio');
});

await check('code-image detects languages, tokenizes, wraps lines, renders and exports PNG', async () => {
    const { window, run, loadTestImage, downloads } = await createImgConverEnv();

    assert.equal(window.detectCodeLanguage('def greet(name):\n    return f"hi {name}"'), 'python');
    assert.equal(window.detectCodeLanguage('SELECT id, email FROM users WHERE active = 1;'), 'sql');
    assert.equal(window.detectCodeLanguage('<section class="card"><h1>Oi</h1></section>'), 'html');
    assert.equal(window.detectCodeLanguage('{\n  "name": "imgConver",\n  "version": 2\n}'), 'json');
    assert.equal(window.detectCodeLanguage('#!/bin/bash\nnpm run build && echo "ok"'), 'bash');
    assert.equal(window.detectCodeLanguage('.hero { display: flex; color: #fff; }'), 'css');
    assert.equal(window.detectCodeLanguage('export async function load() { const x = 42; return x; }'), 'javascript');

    const tokenized = window.tokenizeCodeLines(
        'const n = 42; // inline\n/* block\nstill comment */\nreturn greet("ok");',
        'javascript'
    );
    assert.equal(tokenized.length, 4);
    assert.ok(tokenized[0].some((t) => t.type === 'keyword' && t.text === 'const'));
    assert.ok(tokenized[0].some((t) => t.type === 'number' && t.text === '42'));
    assert.ok(tokenized[0].some((t) => t.type === 'comment' && t.text.includes('// inline')));
    assert.ok(tokenized[1].every((t) => t.type === 'comment'));
    assert.ok(tokenized[2][0].type === 'comment');
    assert.ok(tokenized[3].some((t) => t.type === 'func' && t.text === 'greet'));
    assert.ok(tokenized[3].some((t) => t.type === 'string' && t.text === '"ok"'));

    const wrapped = window.wrapTokenizedLines(
        window.tokenizeCodeLines('const longValue = "abcdefghijklmnopqrstuvwxyz1234567890";', 'javascript'),
        20
    );
    assert.ok(wrapped.length >= 2, 'long line must wrap into multiple rows');
    assert.equal(wrapped[0].lineNumber, 1);
    assert.equal(wrapped[1].lineNumber, null, 'continuation lines must omit line number');

    // Open normal image tool without image -> footer stays hidden on dropzone
    window.document.querySelector('.tool-card[data-tool="compress"]').click();
    assert.equal(window.document.getElementById('modalFooter').style.display, 'none');

    // Open code-image without an image via real tool-card click and verify preview + toolbar state
    const codeCard = window.document.querySelector('.tool-card[data-tool="code-image"]');
    assert.ok(codeCard, 'code-image card must exist in DOM');
    codeCard.click();
    assert.equal(window.document.getElementById('modalTitle').textContent, 'Código para Imagem');
    assert.equal(
        window.document.querySelector('#modalFooter button[onclick="changeImage()"]').style.display,
        'none',
        'code-image hides Trocar Imagem button in footer'
    );
    const codeInput = window.document.getElementById('codeSnapInput');
    assert.ok(codeInput && codeInput.value.length > 0, 'default snippet should populate editor');
    const canvas = window.document.getElementById('canvas');
    assert.ok(canvas.width >= 360 && canvas.height > 80, 'rendered snippet canvas must have valid dimensions');

    // Changing padding/font size/theme/code must update canvas safely
    codeInput.value = 'def soma(a, b):\n    # calc\n    return a + b\nprint(soma(2, 3))';
    window.document.getElementById('codeTheme').value = 'github-light';
    window.document.getElementById('codeWindowTitle').value = 'math.py';
    window.document.getElementById('codeLineNumbers').checked = false;
    window.renderCodeImagePreview();
    const beforePadH = canvas.height;
    window.document.getElementById('codePadding').value = '88';
    window.selectCodeBgPreset('sunset', window.document.querySelector('.preset-swatch'));
    assert.ok(canvas.width > 0 && canvas.height > beforePadH, 'increasing padding increases canvas height');

    // Even when a previous image existed, previewToolbar stays hidden on code-image
    const priorImg = loadTestImage(200, 120, 'prior');
    codeCard.click();
    assert.equal(
        window.document.getElementById('previewToolbar').style.display,
        'none',
        'compare toolbar must stay hidden during code-image'
    );

    // Download filename check
    const dlBefore = downloads.length;
    window.downloadImage();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(downloads.length, dlBefore + 1);
    assert.equal(downloads[downloads.length - 1].download, 'codigo-snippet.png');

    // Clipboard fallback when ClipboardItem is missing
    delete window.ClipboardItem;
    assert.equal(await window.copyCodeImageToClipboard(), false);

    // Clipboard write when ClipboardItem + navigator.clipboard.write are present
    const copiedPayloads = [];
    window.ClipboardItem = class MockClipboardItem {
        constructor(items) {
            this.items = items;
        }
    };
    Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: {
            write: async (items) => {
                copiedPayloads.push(items);
            },
        },
    });
    assert.equal(await window.copyCodeImageToClipboard(), true);
    assert.equal(copiedPayloads.length, 1);
    assert.ok(copiedPayloads[0][0].items['image/png'], 'clipboard write receives image/png blob');

    // Apply edit bakes the rendered code card into originalImage
    window.applyEdit();
    await new Promise((r) => setTimeout(r, 20));
    assert.notEqual(run('originalImage'), priorImg, 'applyEdit replaces prior image with baked code card');
    assert.equal(run('originalImage'), run('trueOriginalImage'), 'baked code card becomes new trueOriginalImage');
    assert.ok(run('originalImage && originalImage._src.startsWith("data:image/png")'));
});

console.log(`\nimgConver DOM/Unit summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
    process.exit(1);
}

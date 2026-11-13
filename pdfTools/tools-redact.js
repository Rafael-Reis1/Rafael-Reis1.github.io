let redactCurrentPage = 1;
let redactBoxesByPage = new Map();
let redactBaseCanvas = null;
let redactDragStart = null;
let redactDragCurrent = null;
let redactPreviewZoom = 1.5;

function transformPdfPoint(vt, x, y) {
    return {
        x: vt[0] * x + vt[2] * y + vt[4],
        y: vt[1] * x + vt[3] * y + vt[5]
    };
}

/**
 * Maps a matching substring range inside a pdf.js text item into normalized [0..1]
 * top-left viewport coordinates suitable for redaction painting across any DPI.
 */
function computePdfTextItemViewportBox(viewport, item, matchStart = 0, matchLength = null) {
    const str = String(item?.str || '');
    const totalLen = Math.max(1, str.length);
    const len = matchLength == null ? totalLen : Math.max(1, matchLength);
    const startRatio = Math.max(0, Math.min(1, matchStart / totalLen));
    const widthRatio = Math.max(0.05, Math.min(1 - startRatio, len / totalLen));

    const tr = Array.isArray(item?.transform) ? item.transform : [12, 0, 0, 12, 40, 700];
    const vt = Array.isArray(viewport?.transform)
        ? viewport.transform
        : [viewport?.scale || 1, 0, 0, -(viewport?.scale || 1), 0, viewport?.height || 792];
    const scale = viewport?.scale || 1;
    const viewW = Math.max(1, viewport?.width || 595);
    const viewH = Math.max(1, viewport?.height || 842);

    const anchor = transformPdfPoint(vt, tr[4], tr[5]);
    const itemW = Math.max(8, (Number(item?.width) || totalLen * 6) * scale);
    const fontH = Math.max(10, (Math.hypot(tr[0], tr[1]) || Number(item?.height) || 12) * scale);

    const pad = 2;
    const px = anchor.x + itemW * startRatio - pad;
    const py = anchor.y - fontH * 0.9 - pad;
    const pw = itemW * widthRatio + pad * 2;
    const ph = fontH * 1.2 + pad * 2;

    return {
        x: Math.max(0, Math.min(0.99, px / viewW)),
        y: Math.max(0, Math.min(0.99, py / viewH)),
        w: Math.max(0.012, Math.min(1 - Math.max(0, px / viewW), pw / viewW)),
        h: Math.max(0.012, Math.min(1 - Math.max(0, py / viewH), ph / viewH))
    };
}

function findTextMatchNormalizedBoxes(textItems, viewport, queryOrRegex) {
    if (!Array.isArray(textItems) || !queryOrRegex) return [];
    const isRegex = Object.prototype.toString.call(queryOrRegex) === '[object RegExp]';
    const regex = isRegex
        ? new RegExp(queryOrRegex.source, queryOrRegex.flags.includes('g') ? queryOrRegex.flags : `${queryOrRegex.flags}g`)
        : new RegExp(String(queryOrRegex).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

    const boxes = [];
    for (const item of textItems) {
        const text = String(item?.str || '');
        if (!text.trim()) continue;
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (!match[0]) {
                regex.lastIndex++;
                continue;
            }
            const box = computePdfTextItemViewportBox(viewport, item, match.index, match[0].length);
            boxes.push({ ...box, label: match[0] });
        }
    }
    return boxes;
}

function extractAllTextNormalizedBoxes(textItems, viewport) {
    const boxes = [];
    if (!Array.isArray(textItems) || !viewport) return boxes;

    for (const item of textItems) {
        const raw = String(item?.str || '');
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const startOffset = raw.length - raw.trimStart().length;
        const box = computePdfTextItemViewportBox(viewport, item, startOffset, trimmed.length);
        boxes.push({ ...box, label: 'texto' });
    }
    return boxes;
}

function countTotalRedactBoxes() {
    let total = 0;
    redactBoxesByPage.forEach((arr) => { total += arr.length; });
    return total;
}

function buildRedactTool(previewPane, controls) {
    redactCurrentPage = 1;
    redactBoxesByPage = new Map();
    redactBaseCanvas = null;
    redactDragStart = null;
    redactDragCurrent = null;
    redactPreviewZoom = 1.5;

    previewPane.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.65rem;">
            <div style="display:flex; align-items:center; gap:0.45rem;">
                <button type="button" class="pdf-mini-btn" onclick="changeRedactPage(-1)">◀</button>
                <span id="redactPageLabel" style="font-size:0.84rem; font-weight:600;">Pág. 1 de ${loadedPdfPageCount}</span>
                <button type="button" class="pdf-mini-btn" onclick="changeRedactPage(1)">▶</button>
            </div>
            <div style="display:flex; align-items:center; gap:0.4rem;">
                <button type="button" class="pdf-mini-btn" onclick="changeRedactZoom(-0.3)" title="Diminuir zoom">🔍−</button>
                <span id="redactZoomLabel" style="font-size:0.8rem; color:var(--text-muted); min-width:44px; text-align:center;">Ajustar</span>
                <button type="button" class="pdf-mini-btn" onclick="changeRedactZoom(0.3)" title="Aumentar zoom">🔍+</button>
            </div>
            <div style="display:flex; align-items:center; gap:0.4rem;">
                <span id="redactBoxSummary" style="font-size:0.8rem; color:var(--text-muted);">0 tarjas</span>
                <button type="button" class="pdf-mini-btn" onclick="undoRedactBoxOnPage()">Desfazer</button>
                <button type="button" class="pdf-mini-btn danger" onclick="clearRedactBoxesOnPage()">Limpar</button>
            </div>
        </div>
        <div id="redactCanvasStage" class="pdf-canvas-stage">
            <canvas id="redactPreviewCanvas" width="595" height="842" style="cursor:crosshair; touch-action:none;"></canvas>
        </div>
    `;

    controls.innerHTML = `
        <div class="info-banner neutral">
            🔒 <strong>Redacão verdadeira:</strong> páginas com tarjas são achatadas em alta resolução e o texto escondido é destruído. Páginas limpas mantêm o vetor original.
        </div>
        <div class="control-group">
            <label>Localizar e tarjar automaticamente</label>
            <input type="text" id="redactSearchTerm" placeholder="Digite palavra, nome ou número...">
            <div style="display:flex; gap:0.45rem; flex-wrap:wrap; margin-top:0.25rem;">
                <button type="button" class="btn-secondary" style="flex:1;" onclick="markSensitivePreset('search')">Tarjar termo</button>
                <button type="button" class="btn-secondary" onclick="markSensitivePreset('cpf')">CPFs</button>
                <button type="button" class="btn-secondary" onclick="markSensitivePreset('email')">E-mails</button>
            </div>
            <div style="display:flex; gap:0.45rem; flex-wrap:wrap; margin-top:0.45rem;">
                <button type="button" class="btn-secondary" style="flex:1;" onclick="markSensitivePreset('all-text-page')">Tarjar todo texto (pág.)</button>
                <button type="button" class="btn-secondary" style="flex:1;" onclick="markSensitivePreset('all-text')">Tarjar todo texto (PDF)</button>
            </div>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Cor da tarja</label>
                <input type="color" id="redactTarjaColor" value="#000000" oninput="drawRedactCanvasFrame()">
            </div>
            <div class="control-group">
                <label>Nitidez final</label>
                <select id="redactDpiScale">
                    <option value="2" selected>Alta (144 DPI)</option>
                    <option value="2.8">Ultra (200 DPI)</option>
                </select>
            </div>
        </div>
        <div class="control-group">
            <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                <input type="checkbox" id="redactClearMeta" checked>
                Limpar metadados do PDF ao salvar
            </label>
        </div>
    `;

    initRedactCanvasEvents();
    loadRedactBasePage();
}

function changeRedactZoom(delta) {
    redactPreviewZoom = Math.max(0.9, Math.min(2.7, Number((redactPreviewZoom + delta).toFixed(2))));
    const stage = document.getElementById('redactCanvasStage');
    const zoomLabel = document.getElementById('redactZoomLabel');
    const isZoomed = redactPreviewZoom > 1.55;
    if (stage) stage.classList.toggle('zoomed', isZoomed);
    if (zoomLabel) {
        zoomLabel.textContent = isZoomed ? `${Math.round((redactPreviewZoom / 1.5) * 100)}%` : 'Ajustar';
    }
    loadRedactBasePage();
}

function updateRedactSummaryUi() {
    const pageBoxes = redactBoxesByPage.get(redactCurrentPage) || [];
    const pageLabel = document.getElementById('redactPageLabel');
    const summaryEl = document.getElementById('redactBoxSummary');
    if (pageLabel) pageLabel.textContent = `Pág. ${redactCurrentPage} de ${loadedPdfPageCount}`;
    if (summaryEl) {
        summaryEl.textContent = `${pageBoxes.length} nesta pág. · ${countTotalRedactBoxes()} no total`;
    }
}

async function loadRedactBasePage() {
    const offscreen = document.createElement('canvas');
    if (loadedPdfJsDoc) {
        await renderPdfPageToCanvas(loadedPdfJsDoc, redactCurrentPage, offscreen, redactPreviewZoom, 0);
    } else {
        offscreen.width = Math.round(420 * redactPreviewZoom);
        offscreen.height = Math.round(594 * redactPreviewZoom);
        const octx = offscreen.getContext('2d');
        if (octx) {
            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, offscreen.width, offscreen.height);
        }
    }
    redactBaseCanvas = offscreen;

    const canvasEl = document.getElementById('redactPreviewCanvas');
    if (canvasEl) {
        canvasEl.width = offscreen.width;
        canvasEl.height = offscreen.height;
    }
    drawRedactCanvasFrame();
    updateRedactSummaryUi();
}

function drawRedactBoxesOntoContext(ctx, width, height, boxes, color, previewOverlay = false) {
    if (!ctx || !Array.isArray(boxes) || boxes.length === 0) return;
    ctx.save();
    boxes.forEach((box, idx) => {
        const bx = box.x * width;
        const by = box.y * height;
        const bw = box.w * width;
        const bh = box.h * height;
        ctx.fillStyle = color;
        ctx.fillRect(bx, by, bw, bh);

        if (previewOverlay) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(bx, by, bw, bh);
            if (boxes.length <= 25) {
                ctx.fillStyle = '#ef4444';
                ctx.font = 'bold 10px sans-serif';
                ctx.fillText(`#${idx + 1}`, bx + 3, Math.max(10, by - 3));
            }
        }
    });
    ctx.restore();
}

function drawRedactCanvasFrame() {
    const canvasEl = document.getElementById('redactPreviewCanvas');
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    if (redactBaseCanvas) {
        if (canvasEl.width !== redactBaseCanvas.width || canvasEl.height !== redactBaseCanvas.height) {
            canvasEl.width = redactBaseCanvas.width;
            canvasEl.height = redactBaseCanvas.height;
        }
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(redactBaseCanvas, 0, 0);
    }

    const color = document.getElementById('redactTarjaColor')?.value || '#000000';
    const boxes = redactBoxesByPage.get(redactCurrentPage) || [];
    drawRedactBoxesOntoContext(ctx, canvasEl.width, canvasEl.height, boxes, color, true);

    if (redactDragStart && redactDragCurrent) {
        const rx = Math.min(redactDragStart.x, redactDragCurrent.x) * canvasEl.width;
        const ry = Math.min(redactDragStart.y, redactDragCurrent.y) * canvasEl.height;
        const rw = Math.abs(redactDragCurrent.x - redactDragStart.x) * canvasEl.width;
        const rh = Math.abs(redactDragCurrent.y - redactDragStart.y) * canvasEl.height;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.restore();
    }
}

function initRedactCanvasEvents() {
    const canvasEl = document.getElementById('redactPreviewCanvas');
    if (!canvasEl) return;

    const getNormCoords = (e) => {
        const rect = canvasEl.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width))),
            y: Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)))
        };
    };

    const onStart = (e) => {
        redactDragStart = getNormCoords(e);
        redactDragCurrent = redactDragStart;
        drawRedactCanvasFrame();
    };

    const onMove = (e) => {
        if (!redactDragStart) return;
        e.preventDefault();
        redactDragCurrent = getNormCoords(e);
        drawRedactCanvasFrame();
    };

    const onEnd = () => {
        if (!redactDragStart || !redactDragCurrent) return;
        const x = Math.min(redactDragStart.x, redactDragCurrent.x);
        const y = Math.min(redactDragStart.y, redactDragCurrent.y);
        const w = Math.abs(redactDragCurrent.x - redactDragStart.x);
        const h = Math.abs(redactDragCurrent.y - redactDragStart.y);
        redactDragStart = null;
        redactDragCurrent = null;

        if (w >= 0.008 && h >= 0.008) {
            const list = redactBoxesByPage.get(redactCurrentPage) || [];
            list.push({ x, y, w, h, label: 'manual' });
            redactBoxesByPage.set(redactCurrentPage, list);
        }
        drawRedactCanvasFrame();
        updateRedactSummaryUi();
    };

    canvasEl.addEventListener('mousedown', onStart);
    canvasEl.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    canvasEl.addEventListener('touchstart', onStart, { passive: true });
    canvasEl.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    activeToolTeardown = () => {
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchend', onEnd);
    };
}

function changeRedactPage(delta) {
    const next = Math.max(1, Math.min(loadedPdfPageCount || 1, redactCurrentPage + delta));
    if (next === redactCurrentPage) return;
    redactCurrentPage = next;
    loadRedactBasePage();
}

function undoRedactBoxOnPage() {
    const list = redactBoxesByPage.get(redactCurrentPage);
    if (!list || list.length === 0) return;
    list.pop();
    if (list.length === 0) redactBoxesByPage.delete(redactCurrentPage);
    drawRedactCanvasFrame();
    updateRedactSummaryUi();
}

function clearRedactBoxesOnPage() {
    redactBoxesByPage.delete(redactCurrentPage);
    drawRedactCanvasFrame();
    updateRedactSummaryUi();
}

async function markSensitivePreset(preset) {
    if (!loadedPdfJsDoc) {
        showToast('PDF.js necessário para localizar texto automaticamente.', 'error');
        return 0;
    }

    const isAllText = preset === 'all-text' || preset === 'all-text-page';
    let pattern = null;

    if (!isAllText) {
        if (preset === 'cpf') {
            pattern = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
        } else if (preset === 'email') {
            pattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
        } else {
            const term = document.getElementById('redactSearchTerm')?.value.trim() || '';
            if (!term) {
                showToast('Digite um termo para localizar e tarjar.', 'info');
                return 0;
            }
            pattern = term;
        }
    }

    const startPage = preset === 'all-text-page' ? redactCurrentPage : 1;
    const endPage = preset === 'all-text-page' ? redactCurrentPage : loadedPdfPageCount;

    let foundCount = 0;
    let firstMatchedPage = null;

    for (let p = startPage; p <= endPage; p++) {
        const page = await loadedPdfJsDoc.getPage(p);
        const viewport = page.getViewport({ scale: 1, rotation: page.rotate || 0 });
        const content = await page.getTextContent();
        const items = content.items || [];
        const matches = isAllText
            ? extractAllTextNormalizedBoxes(items, viewport)
            : findTextMatchNormalizedBoxes(items, viewport, pattern);
        if (matches.length > 0) {
            const list = redactBoxesByPage.get(p) || [];
            list.push(...matches);
            redactBoxesByPage.set(p, list);
            foundCount += matches.length;
            if (firstMatchedPage === null) firstMatchedPage = p;
        }
    }

    if (foundCount === 0) {
        showToast(
            isAllText
                ? 'Nenhum texto selecionável encontrado (PDF pode ser escaneado/imagem). Desenhe as tarjas manualmente.'
                : 'Nenhuma ocorrência encontrada no texto selecionável.',
            'info'
        );
        return 0;
    }

    const currentPageHasBoxes = (redactBoxesByPage.get(redactCurrentPage) || []).length > 0;
    if (!currentPageHasBoxes && firstMatchedPage !== null && firstMatchedPage !== redactCurrentPage) {
        redactCurrentPage = firstMatchedPage;
        await loadRedactBasePage();
    } else {
        drawRedactCanvasFrame();
        updateRedactSummaryUi();
    }

    showToast(`${foundCount} área(s) marcada(s) para redact!`, 'success');
    return foundCount;
}

async function executeRedactPdf() {
    if (!loadedPdfBytes) return null;
    const totalBoxes = countTotalRedactBoxes();
    if (totalBoxes === 0) {
        showToast('Marque ao menos uma área ou termo antes de baixar.', 'error');
        return null;
    }

    const color = document.getElementById('redactTarjaColor')?.value || '#000000';
    const dpiScale = parseFloat(document.getElementById('redactDpiScale')?.value || '2') || 2;
    const clearMeta = document.getElementById('redactClearMeta')?.checked !== false;

    const srcDoc = await PDFLib.PDFDocument.load(loadedPdfBytes, { ignoreEncryption: true });
    const outDoc = await PDFLib.PDFDocument.create();
    const workCanvas = document.createElement('canvas');
    let flattenedPages = 0;

    for (let p = 1; p <= loadedPdfPageCount; p++) {
        setPdfProgress((p / loadedPdfPageCount) * 90, `Processando página ${p} de ${loadedPdfPageCount}...`);
        const boxes = redactBoxesByPage.get(p) || [];

        if (boxes.length === 0) {
            const [copied] = await outDoc.copyPages(srcDoc, [p - 1]);
            outDoc.addPage(copied);
            continue;
        }

        flattenedPages++;
        const srcPage = srcDoc.getPage(p - 1);
        const { width: ptW, height: ptH } = srcPage.getSize();

        if (loadedPdfJsDoc) {
            await renderPdfPageToCanvas(loadedPdfJsDoc, p, workCanvas, dpiScale, 0);
        } else {
            workCanvas.width = Math.max(1, Math.round(ptW * dpiScale));
            workCanvas.height = Math.max(1, Math.round(ptH * dpiScale));
            const wctx = workCanvas.getContext('2d');
            if (wctx) {
                wctx.fillStyle = '#ffffff';
                wctx.fillRect(0, 0, workCanvas.width, workCanvas.height);
            }
        }

        const wctx = workCanvas.getContext('2d');
        drawRedactBoxesOntoContext(wctx, workCanvas.width, workCanvas.height, boxes, color, false);

        const pngBytes = dataUrlToUint8Array(workCanvas.toDataURL('image/png'));
        const embedded = await outDoc.embedPng(pngBytes);
        const outPage = outDoc.addPage([ptW, ptH]);
        outPage.drawImage(embedded, { x: 0, y: 0, width: ptW, height: ptH });
    }

    if (clearMeta) {
        outDoc.setTitle('');
        outDoc.setAuthor('');
        outDoc.setSubject('');
        outDoc.setCreator('');
        outDoc.setProducer('');
        outDoc.setKeywords([]);
    }

    const outBytes = await outDoc.save();
    downloadPdfBytes(outBytes, sanitizePdfFileName(loadedPdfName, 'redactado'));
    showToast(`Redact permanente aplicado em ${flattenedPages} página(s)!`, 'success');
    return outBytes;
}

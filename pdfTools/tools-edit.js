let signUploadedPngUrl = null;
let signPadHasStrokes = false;

/**
 * Shared single-page preview helper that renders the PDF page via pdf.js
 * (or draws a blank sheet when pdf.js is absent) and calls drawOverlayFn(ctx, w, h).
 */
async function renderPdfPageWithOverlay(canvasId, pageNumber, drawOverlayFn) {
    const target = document.getElementById(canvasId);
    if (!target) return;
    const ctx = target.getContext('2d');
    if (!ctx) return;

    if (loadedPdfJsDoc) {
        await renderPdfPageToCanvas(loadedPdfJsDoc, pageNumber, target, 1.35, 0);
    } else {
        target.width = 420;
        target.height = 594;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, target.width, target.height);
    }

    if (typeof drawOverlayFn === 'function') {
        ctx.save();
        drawOverlayFn(ctx, target.width, target.height);
        ctx.restore();
    }
}

function getStandardPdfPageDims(page, pageNumText, format) {
    if (format === 'short') return String(pageNumText);
    if (format === 'slash') return `${pageNumText} / ${page}`;
    return `Página ${pageNumText} de ${page}`;
}

// ============================================
// 6. IMAGENS PARA PDF (MULTIPLAS IMAGENS)
// ============================================

function buildImgToPdfTool(previewPane, controls) {
    renderImgToPdfQueue(previewPane);
    controls.innerHTML = `
        <div class="control-row">
            <div class="control-group">
                <label>Tamanho da página</label>
                <select id="imgPdfPageSize">
                    <option value="a4" selected>A4 (210 × 297 mm)</option>
                    <option value="letter">Carta (Letter)</option>
                    <option value="fit">Ajustado a cada imagem</option>
                </select>
            </div>
            <div class="control-group">
                <label>Orientação</label>
                <select id="imgPdfOrientation">
                    <option value="auto" selected>Automática por imagem</option>
                    <option value="portrait">Sempre Retrato</option>
                    <option value="landscape">Sempre Paisagem</option>
                </select>
            </div>
            <div class="control-group">
                <label>Margem (pt)</label>
                <select id="imgPdfMargin">
                    <option value="0">Sem margem</option>
                    <option value="24" selected>Média (24 pt)</option>
                    <option value="48">Larga (48 pt)</option>
                </select>
            </div>
        </div>
        <div>
            <button type="button" class="btn-secondary" onclick="document.getElementById('imgToPdfExtra').click()">
                ➕ Adicionar imagens
            </button>
            <input type="file" id="imgToPdfExtra" accept="image/*" multiple style="display:none;" onchange="handleImgToPdfExtra(this)">
        </div>
    `;
}

function renderImgToPdfQueue(previewPane) {
    if (!previewPane) return;
    if (imgToPdfItems.length === 0) {
        previewPane.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:1.5rem 0;">Nenhuma imagem adicionada ainda. Você também pode colar prints com Ctrl+V.</p>';
        return;
    }

    previewPane.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
            <strong>${imgToPdfItems.length} imagem(ns)</strong>
            <span style="font-size:0.82rem; color:var(--text-muted);">Cada imagem vira 1 página</span>
        </div>
        <div class="pdf-file-list">
            ${imgToPdfItems.map((item, idx) => `
                <div class="pdf-file-item">
                    <img src="${item.dataUrl}" alt="${escapeHtml(item.name)}" style="width:44px; height:44px; object-fit:cover; border-radius:6px; background:#000;">
                    <div class="pdf-file-info">
                        <span class="pdf-file-name">${escapeHtml(item.name)}</span>
                        <span class="pdf-file-sub">${item.width} × ${item.height} px</span>
                    </div>
                    <div style="display:flex; gap:0.35rem;">
                        <button type="button" class="pdf-mini-btn" onclick="moveImgToPdfItem(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>▲</button>
                        <button type="button" class="pdf-mini-btn" onclick="moveImgToPdfItem(${idx}, 1)" ${idx === imgToPdfItems.length - 1 ? 'disabled' : ''}>▼</button>
                        <button type="button" class="pdf-mini-btn danger" onclick="removeImgToPdfItem(${idx})">✕</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function addImgToPdfFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f && f.type && f.type.startsWith('image/'));
    if (files.length === 0) {
        showToast('Selecione imagens PNG, JPEG ou WEBP válidas.', 'error');
        return;
    }

    for (const file of files) {
        const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(String(e.target.result || ''));
            reader.readAsDataURL(file);
        });
        if (!dataUrl) continue;

        const dims = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width || 800, height: img.height || 600, img });
            img.onerror = () => resolve({ width: 800, height: 600, img: null });
            img.src = dataUrl;
        });

        let embedType = /image\/jpe?g/i.test(file.type) ? 'jpg' : 'png';
        let normalizedUrl = dataUrl;
        if (!/image\/(png|jpe?g)/i.test(file.type) && dims.img) {
            const temp = document.createElement('canvas');
            temp.width = dims.width;
            temp.height = dims.height;
            const tctx = temp.getContext('2d');
            if (tctx) {
                tctx.drawImage(dims.img, 0, 0);
                normalizedUrl = temp.toDataURL('image/png');
                embedType = 'png';
            }
        }

        imgToPdfItems.push({
            name: file.name || `imagem-${imgToPdfItems.length + 1}.png`,
            dataUrl: normalizedUrl,
            embedType,
            width: dims.width,
            height: dims.height
        });
    }

    renderImgToPdfQueue(document.getElementById('pdfPreviewPane'));
}

function handleImgToPdfExtra(input) {
    if (input.files && input.files.length > 0) {
        addImgToPdfFiles(input.files);
    }
    input.value = '';
}

function moveImgToPdfItem(idx, delta) {
    const next = idx + delta;
    if (next < 0 || next >= imgToPdfItems.length) return;
    [imgToPdfItems[idx], imgToPdfItems[next]] = [imgToPdfItems[next], imgToPdfItems[idx]];
    renderImgToPdfQueue(document.getElementById('pdfPreviewPane'));
}

function removeImgToPdfItem(idx) {
    imgToPdfItems.splice(idx, 1);
    renderImgToPdfQueue(document.getElementById('pdfPreviewPane'));
}

function dataUrlToUint8Array(dataUrl) {
    const payload = String(dataUrl || '').split(',')[1] || '';
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

async function executeImgToPdf() {
    if (imgToPdfItems.length === 0) {
        showToast('Adicione pelo menos 1 imagem para gerar o PDF.', 'error');
        return null;
    }

    const sizePreset = document.getElementById('imgPdfPageSize')?.value || 'a4';
    const orientation = document.getElementById('imgPdfOrientation')?.value || 'auto';
    const margin = parseInt(document.getElementById('imgPdfMargin')?.value || '24', 10) || 0;

    const doc = await PDFLib.PDFDocument.create();

    for (let i = 0; i < imgToPdfItems.length; i++) {
        const item = imgToPdfItems[i];
        setPdfProgress(((i + 1) / imgToPdfItems.length) * 90, `Incorporando imagem ${i + 1} de ${imgToPdfItems.length}...`);

        const bytes = dataUrlToUint8Array(item.dataUrl);
        const embedded = item.embedType === 'jpg'
            ? await doc.embedJpg(bytes)
            : await doc.embedPng(bytes);

        let pageW = embedded.width;
        let pageH = embedded.height;

        if (sizePreset !== 'fit') {
            const base = sizePreset === 'letter' ? [612, 792] : [595.28, 841.89];
            const isLand = orientation === 'landscape' || (orientation === 'auto' && embedded.width > embedded.height);
            pageW = isLand ? base[1] : base[0];
            pageH = isLand ? base[0] : base[1];
        }

        const page = doc.addPage([pageW, pageH]);
        const box = computeFitBox(pageW, pageH, embedded.width, embedded.height, sizePreset === 'fit' ? 0 : margin);
        page.drawImage(embedded, box);
    }

    const outBytes = await doc.save();
    downloadPdfBytes(outBytes, 'imagens-convertidas.pdf');
    showToast('PDF criado com sucesso!', 'success');
    return outBytes;
}

// ============================================
// 7. MARCA D'ÁGUA (WATERMARK)
// ============================================

function buildWatermarkTool(previewPane, controls) {
    previewPane.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.6rem; font-size:0.86rem; color:var(--text-muted);">
            <span>Prévia na página 1</span>
            <span>${loadedPdfPageCount} página(s)</span>
        </div>
        <div class="pdf-canvas-stage"><canvas id="watermarkPreviewCanvas" width="420" height="594"></canvas></div>
    `;

    controls.innerHTML = `
        <div class="control-row">
            <div class="control-group">
                <label>Texto da marca d'água</label>
                <input type="text" id="wmTextInput" value="CONFIDENCIAL" oninput="renderWatermarkPreview()">
            </div>
            <div class="control-group">
                <label>Cor</label>
                <input type="color" id="wmColorInput" value="#ef4444" oninput="renderWatermarkPreview()">
            </div>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Tamanho: <span id="wmSizeVal">54</span>pt</label>
                <input type="range" id="wmSizeInput" min="18" max="120" value="54"
                    oninput="document.getElementById('wmSizeVal').textContent = this.value; renderWatermarkPreview()">
            </div>
            <div class="control-group">
                <label>Opacidade: <span id="wmOpacityVal">30</span>%</label>
                <input type="range" id="wmOpacityInput" min="5" max="90" value="30"
                    oninput="document.getElementById('wmOpacityVal').textContent = this.value; renderWatermarkPreview()">
            </div>
            <div class="control-group">
                <label>Ângulo: <span id="wmAngleVal">45</span>°</label>
                <input type="range" id="wmAngleInput" min="-75" max="75" value="45"
                    oninput="document.getElementById('wmAngleVal').textContent = this.value; renderWatermarkPreview()">
            </div>
        </div>
        <div class="control-group">
            <label>Páginas (vazio = todas)</label>
            <input type="text" id="wmPageRange" placeholder="ex: 1-3, 5">
        </div>
    `;

    renderWatermarkPreview();
}

function renderWatermarkPreview() {
    const text = document.getElementById('wmTextInput')?.value || '';
    const color = document.getElementById('wmColorInput')?.value || '#ef4444';
    const fontSize = parseInt(document.getElementById('wmSizeInput')?.value || '54', 10) || 54;
    const opacity = (parseInt(document.getElementById('wmOpacityInput')?.value || '30', 10) || 30) / 100;
    const angle = parseInt(document.getElementById('wmAngleInput')?.value || '45', 10) || 45;

    renderPdfPageWithOverlay('watermarkPreviewCanvas', 1, (ctx, w, h) => {
        if (!text.trim()) return;
        ctx.translate(w / 2, h / 2);
        ctx.rotate((-angle * Math.PI) / 180);
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.font = `700 ${Math.round(fontSize * 0.72)}px Helvetica, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, 0);
    });
}

async function executeWatermarkPdf() {
    if (!loadedPdfBytes) return null;
    const text = document.getElementById('wmTextInput')?.value.trim() || '';
    if (!text) {
        showToast('Digite um texto para a marca d\'água.', 'error');
        return null;
    }

    const { r, g, b } = normalizeHexToRgb(document.getElementById('wmColorInput')?.value || '#ef4444');
    const fontSize = parseInt(document.getElementById('wmSizeInput')?.value || '54', 10) || 54;
    const opacity = (parseInt(document.getElementById('wmOpacityInput')?.value || '30', 10) || 30) / 100;
    const angle = parseInt(document.getElementById('wmAngleInput')?.value || '45', 10) || 45;
    const expr = document.getElementById('wmPageRange')?.value.trim() || '';
    const pages = expr ? parsePageRanges(expr, loadedPdfPageCount) : getAllPageNumbers(loadedPdfPageCount);

    if (pages.length === 0) {
        showToast('Intervalo de páginas inválido.', 'error');
        return null;
    }

    const doc = await PDFLib.PDFDocument.load(loadedPdfBytes, { ignoreEncryption: true });
    const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    pages.forEach((pNum) => {
        const page = doc.getPage(pNum - 1);
        const { width, height } = page.getSize();
        const rad = (angle * Math.PI) / 180;
        const cx = width / 2 - (textWidth / 2) * Math.cos(rad);
        const cy = height / 2 - (textWidth / 2) * Math.sin(rad);

        page.drawText(text, {
            x: cx,
            y: cy,
            size: fontSize,
            font,
            color: PDFLib.rgb(r, g, b),
            opacity,
            rotate: PDFLib.degrees(angle)
        });
    });

    const outBytes = await doc.save();
    downloadPdfBytes(outBytes, sanitizePdfFileName(loadedPdfName, 'marcadagua'));
    showToast('Marca d\'água aplicada!', 'success');
    return outBytes;
}

// ============================================
// 8. NUMERAR PÁGINAS (PAGE NUMBERS)
// ============================================

function buildPageNumbersTool(previewPane, controls) {
    previewPane.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.6rem; font-size:0.86rem; color:var(--text-muted);">
            <span>Prévia da numeração</span>
            <span>${loadedPdfPageCount} página(s)</span>
        </div>
        <div class="pdf-canvas-stage"><canvas id="pageNumbersPreviewCanvas" width="420" height="594"></canvas></div>
    `;

    controls.innerHTML = `
        <div class="control-row">
            <div class="control-group">
                <label>Posição</label>
                <select id="pgNumPos" onchange="renderPageNumbersPreview()">
                    <option value="bottom-center" selected>Rodapé Centro</option>
                    <option value="bottom-right">Rodapé Direita</option>
                    <option value="bottom-left">Rodapé Esquerda</option>
                    <option value="top-center">Cabeçalho Centro</option>
                    <option value="top-right">Cabeçalho Direita</option>
                    <option value="top-left">Cabeçalho Esquerda</option>
                </select>
            </div>
            <div class="control-group">
                <label>Formato</label>
                <select id="pgNumFormat" onchange="renderPageNumbersPreview()">
                    <option value="full" selected>Página X de Y</option>
                    <option value="slash">X / Y</option>
                    <option value="short">X</option>
                </select>
            </div>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Começar em</label>
                <input type="number" id="pgNumStart" value="1" min="1" max="9999" oninput="renderPageNumbersPreview()">
            </div>
            <div class="control-group">
                <label>Tamanho da fonte (pt)</label>
                <input type="number" id="pgNumSize" value="11" min="8" max="28" oninput="renderPageNumbersPreview()">
            </div>
            <div class="control-group" style="justify-content:flex-end;">
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                    <input type="checkbox" id="pgNumSkipFirst" onchange="renderPageNumbersPreview()">
                    Pular página 1 (capa)
                </label>
            </div>
        </div>
    `;

    renderPageNumbersPreview();
}

function renderPageNumbersPreview() {
    const pos = document.getElementById('pgNumPos')?.value || 'bottom-center';
    const format = document.getElementById('pgNumFormat')?.value || 'full';
    const start = parseInt(document.getElementById('pgNumStart')?.value || '1', 10) || 1;
    const skipFirst = Boolean(document.getElementById('pgNumSkipFirst')?.checked);
    const previewPage = skipFirst && loadedPdfPageCount >= 2 ? 2 : 1;
    const labelText = getStandardPdfPageDims(loadedPdfPageCount || 1, start + (previewPage - 1), format);

    renderPdfPageWithOverlay('pageNumbersPreviewCanvas', previewPage, (ctx, w, h) => {
        ctx.fillStyle = '#1f2937';
        ctx.font = '600 13px Helvetica, Arial, sans-serif';
        const pad = 22;
        const isTop = pos.startsWith('top-');
        const y = isTop ? pad : h - pad;
        if (pos.endsWith('-left')) {
            ctx.textAlign = 'left';
            ctx.fillText(labelText, pad, y);
        } else if (pos.endsWith('-right')) {
            ctx.textAlign = 'right';
            ctx.fillText(labelText, w - pad, y);
        } else {
            ctx.textAlign = 'center';
            ctx.fillText(labelText, w / 2, y);
        }
    });
}

async function executePageNumbersPdf() {
    if (!loadedPdfBytes) return null;
    const pos = document.getElementById('pgNumPos')?.value || 'bottom-center';
    const format = document.getElementById('pgNumFormat')?.value || 'full';
    const start = Math.max(1, parseInt(document.getElementById('pgNumStart')?.value || '1', 10) || 1);
    const fontSize = Math.max(8, Math.min(28, parseInt(document.getElementById('pgNumSize')?.value || '11', 10) || 11));
    const skipFirst = Boolean(document.getElementById('pgNumSkipFirst')?.checked);

    const doc = await PDFLib.PDFDocument.load(loadedPdfBytes, { ignoreEncryption: true });
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const total = doc.getPageCount();
    const totalDisplay = start + total - 1 - (skipFirst ? 1 : 0);

    for (let i = 0; i < total; i++) {
        if (skipFirst && i === 0) continue;
        const page = doc.getPage(i);
        const { width, height } = page.getSize();
        const displayIndex = start + i - (skipFirst ? 1 : 0);
        const label = getStandardPdfPageDims(Math.max(displayIndex, totalDisplay), displayIndex, format);
        const textW = font.widthOfTextAtSize(label, fontSize);
        const marginX = 28;
        const marginY = 22;

        let x = (width - textW) / 2;
        if (pos.endsWith('-left')) x = marginX;
        else if (pos.endsWith('-right')) x = Math.max(marginX, width - textW - marginX);

        const y = pos.startsWith('top-') ? height - marginY - fontSize : marginY;

        page.drawText(label, {
            x,
            y,
            size: fontSize,
            font,
            color: PDFLib.rgb(0.15, 0.15, 0.2)
        });
    }

    const outBytes = await doc.save();
    downloadPdfBytes(outBytes, sanitizePdfFileName(loadedPdfName, 'numerado'));
    showToast('Numeração adicionada!', 'success');
    return outBytes;
}

// ============================================
// 9. ASSINAR / CARIMBAR PDF (SIGN)
// ============================================

function buildSignTool(previewPane, controls) {
    signUploadedPngUrl = null;
    signPadHasStrokes = false;

    previewPane.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.6rem; font-size:0.86rem; color:var(--text-muted);">
            <span>Posição da assinatura na página</span>
            <span id="signPreviewPageInfo">Pág. 1 de ${loadedPdfPageCount}</span>
        </div>
        <div class="pdf-canvas-stage"><canvas id="signPreviewCanvas" width="420" height="594"></canvas></div>
    `;

    controls.innerHTML = `
        <div class="control-group">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <label>Desenhe sua assinatura abaixo</label>
                <div style="display:flex; gap:0.5rem;">
                    <button type="button" class="pdf-mini-btn" onclick="document.getElementById('signStampUpload').click()">Subir carimbo PNG</button>
                    <button type="button" class="pdf-mini-btn" onclick="clearSignaturePad()">Limpar</button>
                </div>
                <input type="file" id="signStampUpload" accept="image/png,image/jpeg,image/webp" style="display:none;" onchange="handleSignStampFile(this)">
            </div>
            <canvas id="signDrawPad" class="sign-pad-canvas" width="520" height="150"></canvas>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Página alvo (1-${loadedPdfPageCount})</label>
                <input type="number" id="signPageNum" value="${loadedPdfPageCount}" min="1" max="${loadedPdfPageCount}" oninput="renderSignCompositePreview()">
            </div>
            <div class="control-group">
                <label>Cor da caneta</label>
                <input type="color" id="signInkColor" value="#111827">
            </div>
            <div class="control-group">
                <label>Largura: <span id="signWidthVal">28</span>%</label>
                <input type="range" id="signWidthPct" min="10" max="70" value="28"
                    oninput="document.getElementById('signWidthVal').textContent = this.value; renderSignCompositePreview()">
            </div>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Posição Horizontal: <span id="signXVal">68</span>%</label>
                <input type="range" id="signPosX" min="5" max="95" value="68"
                    oninput="document.getElementById('signXVal').textContent = this.value; renderSignCompositePreview()">
            </div>
            <div class="control-group">
                <label>Posição Vertical: <span id="signYVal">82</span>%</label>
                <input type="range" id="signPosY" min="5" max="95" value="82"
                    oninput="document.getElementById('signYVal').textContent = this.value; renderSignCompositePreview()">
            </div>
        </div>
    `;

    initSignaturePadEvents();
    renderSignCompositePreview();
}

function initSignaturePadEvents() {
    const pad = document.getElementById('signDrawPad');
    if (!pad) return;
    const pctx = pad.getContext('2d');
    if (!pctx) return;

    let drawing = false;
    const getPoint = (e) => {
        const rect = pad.getBoundingClientRect();
        const scaleX = pad.width / Math.max(1, rect.width);
        const scaleY = pad.height / Math.max(1, rect.height);
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    };

    const startDraw = (e) => {
        drawing = true;
        signUploadedPngUrl = null;
        signPadHasStrokes = true;
        const pt = getPoint(e);
        pctx.strokeStyle = document.getElementById('signInkColor')?.value || '#111827';
        pctx.lineWidth = 3.2;
        pctx.lineCap = 'round';
        pctx.lineJoin = 'round';
        pctx.beginPath();
        pctx.moveTo(pt.x, pt.y);
    };

    const moveDraw = (e) => {
        if (!drawing) return;
        e.preventDefault();
        const pt = getPoint(e);
        pctx.lineTo(pt.x, pt.y);
        pctx.stroke();
    };

    const endDraw = () => {
        if (!drawing) return;
        drawing = false;
        renderSignCompositePreview();
    };

    pad.addEventListener('mousedown', startDraw);
    pad.addEventListener('mousemove', moveDraw);
    pad.addEventListener('mouseup', endDraw);
    pad.addEventListener('mouseleave', endDraw);
    pad.addEventListener('touchstart', startDraw, { passive: true });
    pad.addEventListener('touchmove', moveDraw, { passive: false });
    pad.addEventListener('touchend', endDraw);
}

function clearSignaturePad() {
    const pad = document.getElementById('signDrawPad');
    if (pad) {
        const pctx = pad.getContext('2d');
        if (pctx) pctx.clearRect(0, 0, pad.width, pad.height);
    }
    signPadHasStrokes = false;
    signUploadedPngUrl = null;
    renderSignCompositePreview();
}

function handleSignStampFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        signUploadedPngUrl = String(e.target.result || '');
        renderSignCompositePreview();
    };
    reader.readAsDataURL(file);
    input.value = '';
}

function getSignaturePngDataUrl() {
    if (signUploadedPngUrl) return signUploadedPngUrl;
    const pad = document.getElementById('signDrawPad');
    if (!pad || !signPadHasStrokes) return null;
    return pad.toDataURL('image/png');
}

async function renderSignCompositePreview() {
    const targetPage = Math.max(1, Math.min(loadedPdfPageCount || 1, parseInt(document.getElementById('signPageNum')?.value || '1', 10) || 1));
    const widthPct = (parseInt(document.getElementById('signWidthPct')?.value || '28', 10) || 28) / 100;
    const xPct = (parseInt(document.getElementById('signPosX')?.value || '68', 10) || 68) / 100;
    const yPct = (parseInt(document.getElementById('signPosY')?.value || '82', 10) || 82) / 100;
    const info = document.getElementById('signPreviewPageInfo');
    if (info) info.textContent = `Pág. ${targetPage} de ${loadedPdfPageCount}`;

    const stampUrl = getSignaturePngDataUrl();
    let stampImg = null;
    if (stampUrl) {
        stampImg = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = stampUrl;
        });
    }

    await renderPdfPageWithOverlay('signPreviewCanvas', targetPage, (ctx, w, h) => {
        const boxW = w * widthPct;
        const aspect = stampImg && stampImg.width > 0 ? stampImg.height / stampImg.width : 0.28;
        const boxH = boxW * aspect;
        const cx = w * xPct - boxW / 2;
        const cy = h * yPct - boxH / 2;

        if (stampImg) {
            ctx.drawImage(stampImg, cx, cy, boxW, boxH);
        } else {
            ctx.strokeStyle = '#ef4444';
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(cx, cy, boxW, Math.max(36, boxH));
            ctx.fillStyle = 'rgba(239, 68, 68, 0.75)';
            ctx.font = '600 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Assinatura aqui', cx + boxW / 2, cy + Math.max(36, boxH) / 2 + 4);
        }
    });
}

async function executeSignPdf() {
    if (!loadedPdfBytes) return null;
    const stampUrl = getSignaturePngDataUrl();
    if (!stampUrl) {
        showToast('Desenhe sua assinatura ou envie um carimbo PNG antes de baixar.', 'error');
        return null;
    }

    const targetPage = Math.max(1, Math.min(loadedPdfPageCount, parseInt(document.getElementById('signPageNum')?.value || '1', 10) || 1));
    const widthPct = (parseInt(document.getElementById('signWidthPct')?.value || '28', 10) || 28) / 100;
    const xPct = (parseInt(document.getElementById('signPosX')?.value || '68', 10) || 68) / 100;
    const yPct = (parseInt(document.getElementById('signPosY')?.value || '82', 10) || 82) / 100;

    const doc = await PDFLib.PDFDocument.load(loadedPdfBytes, { ignoreEncryption: true });
    const bytes = dataUrlToUint8Array(stampUrl);
    const isJpg = /^data:image\/jpe?g/i.test(stampUrl);
    const embedded = isJpg ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);

    const page = doc.getPage(targetPage - 1);
    const { width, height } = page.getSize();
    const drawW = width * widthPct;
    const drawH = drawW * (embedded.height / Math.max(1, embedded.width));
    const drawX = Math.max(0, Math.min(width - drawW, width * xPct - drawW / 2));
    // Canvas Y goes top->bottom while PDF Y goes bottom->top.
    const drawY = Math.max(0, Math.min(height - drawH, height * (1 - yPct) - drawH / 2));

    page.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });

    const outBytes = await doc.save();
    downloadPdfBytes(outBytes, sanitizePdfFileName(loadedPdfName, 'assinado'));
    showToast('Assinatura aplicada ao PDF!', 'success');
    return outBytes;
}

// ============================================
// 10. N PÁGINAS POR FOLHA (N-UP)
// ============================================

function buildNupTool(previewPane, controls) {
    previewPane.innerHTML = `
        <div class="info-banner neutral">
            Agrupe slides ou apostilas em folhas A4 para imprimir economizando papel (${loadedPdfPageCount} página(s) de entrada).
        </div>
    `;

    controls.innerHTML = `
        <div class="control-row">
            <div class="control-group">
                <label>Páginas por folha</label>
                <select id="nupPerSheet">
                    <option value="2" selected>2 páginas por folha</option>
                    <option value="4">4 páginas por folha (2×2)</option>
                    <option value="6">6 páginas por folha</option>
                </select>
            </div>
            <div class="control-group">
                <label>Orientação da folha A4</label>
                <select id="nupOrientation">
                    <option value="landscape" selected>Paisagem (Horizontal)</option>
                    <option value="portrait">Retrato (Vertical)</option>
                </select>
            </div>
            <div class="control-group" style="justify-content:flex-end;">
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                    <input type="checkbox" id="nupBorders" checked>
                    Desenhar moldura fina nas células
                </label>
            </div>
        </div>
    `;
}

async function executeNupPdf() {
    if (!loadedPdfBytes) return null;
    const perSheet = parseInt(document.getElementById('nupPerSheet')?.value || '2', 10) || 2;
    const orientation = document.getElementById('nupOrientation')?.value || 'landscape';
    const drawBorders = Boolean(document.getElementById('nupBorders')?.checked);
    const grid = parseNupGrid(perSheet, orientation);

    const a4 = [595.28, 841.89];
    const sheetW = orientation === 'landscape' ? a4[1] : a4[0];
    const sheetH = orientation === 'landscape' ? a4[0] : a4[1];
    const margin = 20;
    const gap = 12;
    const cellW = (sheetW - margin * 2 - gap * (grid.cols - 1)) / grid.cols;
    const cellH = (sheetH - margin * 2 - gap * (grid.rows - 1)) / grid.rows;

    const srcDoc = await PDFLib.PDFDocument.load(loadedPdfBytes, { ignoreEncryption: true });
    const outDoc = await PDFLib.PDFDocument.create();
    const embeddedPages = [];
    for (const srcPage of srcDoc.getPages()) {
        if (srcPage.node.Contents()) {
            embeddedPages.push(await outDoc.embedPage(srcPage));
        } else {
            const { width, height } = srcPage.getSize();
            embeddedPages.push({ isBlank: true, width, height });
        }
    }

    const slotsPerSheet = grid.cols * grid.rows;
    for (let i = 0; i < embeddedPages.length; i += slotsPerSheet) {
        const sheet = outDoc.addPage([sheetW, sheetH]);
        setPdfProgress(((i + 1) / embeddedPages.length) * 90, `Gerando folha ${Math.floor(i / slotsPerSheet) + 1}...`);

        for (let slot = 0; slot < slotsPerSheet && i + slot < embeddedPages.length; slot++) {
            const ep = embeddedPages[i + slot];
            const col = slot % grid.cols;
            const rowFromTop = Math.floor(slot / grid.cols);
            const cellX = margin + col * (cellW + gap);
            const cellY = sheetH - margin - (rowFromTop + 1) * cellH - rowFromTop * gap;
            const fit = computeFitBox(cellW, cellH, ep.width, ep.height, 4);

            if (!ep.isBlank) {
                sheet.drawPage(ep, {
                    x: cellX + fit.x,
                    y: cellY + fit.y,
                    width: fit.width,
                    height: fit.height
                });
            }

            if (drawBorders) {
                sheet.drawRectangle({
                    x: cellX,
                    y: cellY,
                    width: cellW,
                    height: cellH,
                    borderWidth: 0.6,
                    borderColor: PDFLib.rgb(0.75, 0.78, 0.85)
                });
            }
        }
    }

    const outBytes = await outDoc.save();
    downloadPdfBytes(outBytes, sanitizePdfFileName(loadedPdfName, `${perSheet}-por-folha`));
    showToast(`Layout ${perSheet} por folha gerado!`, 'success');
    return outBytes;
}

// ============================================
// 11. COMPACTAR PDF (ESTRUTURAL OU RASTERIZAÇÃO)
// ============================================

function buildCompressTool(previewPane, controls) {
    previewPane.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
            <div>
                <strong>${escapeHtml(loadedPdfName)}</strong>
                <div style="font-size:0.84rem; color:var(--text-muted);">${loadedPdfPageCount} página(s) · Tamanho original: ${formatFileSize(loadedPdfBytes?.byteLength || 0)}</div>
            </div>
            <span id="compressResultBadge" style="font-size:0.86rem; color:var(--success-color);"></span>
        </div>
    `;

    controls.innerHTML = `
        <div class="control-row">
            <div class="control-group">
                <label>Modo de compactação</label>
                <select id="compressPdfMode" onchange="toggleCompressRasterOptions()">
                    <option value="structural">Estrutural (preserva texto selecionável)</option>
                    <option value="raster" selected>Por Rasterização JPEG (redução máxima)</option>
                </select>
            </div>
            <div class="control-group" id="compressDpiGroup">
                <label>Resolução</label>
                <select id="compressRasterScale">
                    <option value="1">Leve (72 DPI)</option>
                    <option value="1.5" selected>Equilibrado (108 DPI)</option>
                    <option value="2">Nítido (144 DPI)</option>
                </select>
            </div>
        </div>
        <div class="control-group" id="compressQualityGroup">
            <label>Qualidade JPEG: <span id="compressQualVal">72</span>%</label>
            <input type="range" id="compressJpegQuality" min="35" max="95" value="72"
                oninput="document.getElementById('compressQualVal').textContent = this.value">
        </div>
        <div class="info-banner" id="compressRasterWarning">
            ⚠️ O modo por rasterização converte páginas para imagens JPEG compactadas. Textos selecionáveis viram imagem.
        </div>
    `;
}

function toggleCompressRasterOptions() {
    const mode = document.getElementById('compressPdfMode')?.value || 'raster';
    const isRaster = mode === 'raster';
    ['compressDpiGroup', 'compressQualityGroup', 'compressRasterWarning'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = isRaster ? 'flex' : 'none';
    });
}

async function executeCompressPdf() {
    if (!loadedPdfBytes) return null;
    const mode = document.getElementById('compressPdfMode')?.value || 'raster';
    const origSize = loadedPdfBytes.byteLength;
    let outBytes;

    if (mode === 'structural' || !loadedPdfJsDoc) {
        const doc = await PDFLib.PDFDocument.load(loadedPdfBytes, { ignoreEncryption: true });
        doc.setTitle('');
        doc.setSubject('');
        doc.setKeywords([]);
        outBytes = await doc.save({ useObjectStreams: true });
    } else {
        const scale = parseFloat(document.getElementById('compressRasterScale')?.value || '1.5') || 1.5;
        const quality = (parseInt(document.getElementById('compressJpegQuality')?.value || '72', 10) || 72) / 100;
        const outDoc = await PDFLib.PDFDocument.create();
        const workCanvas = document.createElement('canvas');

        for (let p = 1; p <= loadedPdfPageCount; p++) {
            setPdfProgress((p / loadedPdfPageCount) * 90, `Recomprimindo página ${p} de ${loadedPdfPageCount}...`);
            await renderPdfPageToCanvas(loadedPdfJsDoc, p, workCanvas, scale);
            const jpgUrl = workCanvas.toDataURL('image/jpeg', quality);
            const jpgBytes = dataUrlToUint8Array(jpgUrl);
            const embedded = await outDoc.embedJpg(jpgBytes);
            const ptW = (workCanvas.width / scale);
            const ptH = (workCanvas.height / scale);
            const page = outDoc.addPage([ptW, ptH]);
            page.drawImage(embedded, { x: 0, y: 0, width: ptW, height: ptH });
        }

        outBytes = await outDoc.save({ useObjectStreams: true });
    }

    const newSize = outBytes.byteLength;
    const savedPct = origSize > 0 ? Math.max(0, Math.round(((origSize - newSize) / origSize) * 100)) : 0;
    const badge = document.getElementById('compressResultBadge');
    if (badge) {
        badge.textContent = `Novo tamanho: ${formatFileSize(newSize)} (-${savedPct}%)`;
    }

    downloadPdfBytes(outBytes, sanitizePdfFileName(loadedPdfName, 'compactado'));
    showToast(`Compactado: ${formatFileSize(origSize)} → ${formatFileSize(newSize)}`, 'success');
    return outBytes;
}

// ============================================
// 12. EXTRAIR TEXTO & OCR
// ============================================

function buildExtractTextTool(previewPane, controls) {
    previewPane.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <strong>Texto extraído</strong>
            <span id="extractTextStats" style="font-size:0.82rem; color:var(--text-muted);">Lendo páginas...</span>
        </div>
        <div class="control-group">
            <textarea id="extractedPdfText" rows="12" placeholder="O texto extraído aparecerá aqui..."></textarea>
        </div>
    `;

    controls.innerHTML = `
        <div style="display:flex; gap:0.65rem; flex-wrap:wrap;">
            <button type="button" class="btn-secondary" onclick="copyExtractedPdfText()">📋 Copiar Texto</button>
            <button type="button" class="btn-secondary" onclick="runOcrOnPdfPages()">🔍 Rodar OCR Offline (PDF escaneado)</button>
        </div>
        <div class="info-banner neutral">
            Para PDFs digitais, o texto sai instantaneamente. Para PDFs escaneados como imagem, use o botão de OCR offline (Tesseract).
        </div>
    `;

    extractNativePdfText();
}

async function extractNativePdfText() {
    const area = document.getElementById('extractedPdfText');
    const stats = document.getElementById('extractTextStats');
    if (!loadedPdfJsDoc || !area) {
        if (stats) stats.textContent = 'PDF.js indisponível neste ambiente.';
        return '';
    }

    const chunks = [];
    for (let p = 1; p <= loadedPdfPageCount; p++) {
        const page = await loadedPdfJsDoc.getPage(p);
        const content = await page.getTextContent();
        const text = content.items.map((item) => item.str || '').join(' ').trim();
        chunks.push(`--- Página ${p} ---\n${text || '(sem texto selecionável)'}`);
    }

    const combined = chunks.join('\n\n');
    area.value = combined;
    if (stats) stats.textContent = `${combined.length} caracteres · ${loadedPdfPageCount} página(s)`;
    return combined;
}

async function runOcrOnPdfPages() {
    if (!loadedPdfJsDoc) {
        showToast('PDF.js necessário para renderizar páginas no OCR.', 'error');
        return;
    }

    const area = document.getElementById('extractedPdfText');
    const stats = document.getElementById('extractTextStats');

    try {
        setPdfProgress(5, 'Carregando motor Tesseract OCR...');
        await ensureTesseractReady();
        const workCanvas = document.createElement('canvas');
        const results = [];

        for (let p = 1; p <= loadedPdfPageCount; p++) {
            setPdfProgress(10 + ((p - 1) / loadedPdfPageCount) * 85, `Reconhecendo página ${p} de ${loadedPdfPageCount}...`);
            await renderPdfPageToCanvas(loadedPdfJsDoc, p, workCanvas, 2);
            const ocr = await Tesseract.recognize(workCanvas, 'por+eng');
            results.push(`--- Página ${p} (OCR) ---\n${(ocr?.data?.text || '').trim()}`);
        }

        const fullText = results.join('\n\n');
        if (area) area.value = fullText;
        if (stats) stats.textContent = `${fullText.length} caracteres (OCR) · ${loadedPdfPageCount} página(s)`;
        hidePdfProgress();
        showToast('OCR concluído com sucesso!', 'success');
    } catch (err) {
        hidePdfProgress();
        console.error('Erro no OCR de PDF:', err);
        showToast('Não foi possível concluir o OCR.', 'error');
    }
}

async function copyExtractedPdfText() {
    const text = document.getElementById('extractedPdfText')?.value || '';
    if (!text) {
        showToast('Não há texto para copiar.', 'info');
        return false;
    }
    try {
        await navigator.clipboard.writeText(text);
        showToast('Texto copiado!', 'success');
        return true;
    } catch {
        showToast('Não foi possível acessar a área de transferência.', 'error');
        return false;
    }
}

function executeDownloadExtractedTxt() {
    const text = document.getElementById('extractedPdfText')?.value || '';
    if (!text) {
        showToast('Nenhum texto extraído ainda.', 'error');
        return null;
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, sanitizePdfFileName(loadedPdfName, 'texto').replace(/\.pdf$/i, '.txt'));
    showToast('Arquivo .txt baixado!', 'success');
    return text;
}

// ============================================
// 13. PRIVACIDADE & METADADOS
// ============================================

function buildMetadataTool(previewPane, controls) {
    previewPane.innerHTML = `
        <div class="info-banner neutral">
            Edite abaixo ou limpe todos os rastros de autor, software gerador e palavras-chave antes de enviar seu PDF.
        </div>
    `;

    controls.innerHTML = `
        <div class="control-row">
            <div class="control-group">
                <label>Título</label>
                <input type="text" id="metaTitle" placeholder="Vazio">
            </div>
            <div class="control-group">
                <label>Autor</label>
                <input type="text" id="metaAuthor" placeholder="Vazio">
            </div>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Assunto</label>
                <input type="text" id="metaSubject" placeholder="Vazio">
            </div>
            <div class="control-group">
                <label>Criador / Software</label>
                <input type="text" id="metaCreator" placeholder="Vazio">
            </div>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Produtor</label>
                <input type="text" id="metaProducer" placeholder="Vazio">
            </div>
            <div class="control-group" style="justify-content:flex-end;">
                <button type="button" class="btn-secondary" onclick="clearMetadataFields()">🧹 Limpar Todos os Campos</button>
            </div>
        </div>
    `;

    populateMetadataInputs();
}

async function populateMetadataInputs() {
    if (!loadedPdfBytes) return;
    const doc = await PDFLib.PDFDocument.load(loadedPdfBytes, { ignoreEncryption: true });
    const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v || '';
    };
    setVal('metaTitle', doc.getTitle());
    setVal('metaAuthor', doc.getAuthor());
    setVal('metaSubject', doc.getSubject());
    setVal('metaCreator', doc.getCreator());
    setVal('metaProducer', doc.getProducer());
}

function clearMetadataFields() {
    ['metaTitle', 'metaAuthor', 'metaSubject', 'metaCreator', 'metaProducer'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    showToast('Campos limpos! Clique em Salvar PDF Limpo.', 'info');
}

async function executeMetadataSavePdf() {
    if (!loadedPdfBytes) return null;
    const doc = await PDFLib.PDFDocument.load(loadedPdfBytes, { ignoreEncryption: true });
    doc.setTitle(document.getElementById('metaTitle')?.value || '');
    doc.setAuthor(document.getElementById('metaAuthor')?.value || '');
    doc.setSubject(document.getElementById('metaSubject')?.value || '');
    doc.setCreator(document.getElementById('metaCreator')?.value || '');
    doc.setProducer(document.getElementById('metaProducer')?.value || '');
    doc.setKeywords([]);

    const outBytes = await doc.save();
    downloadPdfBytes(outBytes, sanitizePdfFileName(loadedPdfName, 'limpo'));
    showToast('Metadados atualizados no PDF!', 'success');
    return outBytes;
}

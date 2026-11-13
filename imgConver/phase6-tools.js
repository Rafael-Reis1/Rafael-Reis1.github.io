// ============================================
// MOCKUP, FAVICON, PDF, SPLIT GRID & SVG RASTER
// ============================================

const MOCKUP_PRESETS = {
    sunset: { c1: '#f97316', c2: '#ec4899', label: 'Sunset' },
    ocean: { c1: '#06b6d4', c2: '#3b82f6', label: 'Ocean' },
    violet: { c1: '#8b5cf6', c2: '#ec4899', label: 'Violeta' },
    emerald: { c1: '#10b981', c2: '#0d9488', label: 'Esmeralda' },
    dark: { c1: '#0f172a', c2: '#334155', label: 'Escuro' },
    solid: { c1: '#1e1b4b', c2: '#1e1b4b', label: 'Sólido' }
};

let mockupBgPreset = 'sunset';
let pdfPages = [];
let loadedSvgState = null;

function cleanupPhase6Tools() {
    if (loadedSvgState && loadedSvgState.objectUrl) {
        URL.revokeObjectURL(loadedSvgState.objectUrl);
        loadedSvgState.objectUrl = null;
    }
}

function traceRoundedRect(targetCtx, x, y, width, height, radius, topOnly = false) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    const br = topOnly ? 0 : r;

    targetCtx.beginPath();
    targetCtx.moveTo(x + r, y);
    targetCtx.lineTo(x + width - r, y);
    targetCtx.quadraticCurveTo(x + width, y, x + width, y + r);
    targetCtx.lineTo(x + width, y + height - br);
    targetCtx.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
    targetCtx.lineTo(x + br, y + height);
    targetCtx.quadraticCurveTo(x, y + height, x, y + height - br);
    targetCtx.lineTo(x, y + r);
    targetCtx.quadraticCurveTo(x, y, x + r, y);
    targetCtx.closePath();
}

function blobToUint8Array(blob) {
    if (blob && typeof blob.arrayBuffer === 'function') {
        return blob.arrayBuffer().then(buf => new Uint8Array(buf));
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = () => reject(new Error('Falha ao ler Blob binário.'));
        reader.readAsArrayBuffer(blob);
    });
}

function canvasToBlobPromise(srcCanvas, type = 'image/png', quality = 0.92) {
    return new Promise((resolve, reject) => {
        srcCanvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Falha ao codificar imagem do canvas.'));
        }, type, quality);
    });
}

// ============================================
// SHARED BACKDROP / WINDOW FRAME HELPERS
// ============================================

function renderPresetSwatchesHtml(callbackName, activeKey = 'sunset') {
    return Object.entries(MOCKUP_PRESETS).map(([key, p]) => `
        <button type="button" class="preset-swatch ${key === activeKey ? 'active' : ''}" data-preset="${key}"
            title="${p.label}" onclick="${callbackName}('${key}', this)"
            style="background: linear-gradient(135deg, ${p.c1}, ${p.c2});"></button>
    `).join('');
}

function selectPresetSwatch(btn, solidGroupId, presetKey) {
    document.querySelectorAll('#controls .preset-swatch').forEach(el => el.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const solidGroup = document.getElementById(solidGroupId);
    if (solidGroup) solidGroup.style.display = presetKey === 'solid' ? 'block' : 'none';
}

/**
 * Draws the shared gradient/solid backdrop, drop shadow, rounded window, and
 * optional macOS traffic lights + title onto canvas, then clips the content box.
 */
function drawBackdropAndWindowFrame(options) {
    const {
        contentW,
        contentH,
        padding = 48,
        radius = 16,
        shadowStrength = 0.6,
        bgPreset = 'sunset',
        solidColor = '#1e1b4b',
        showFrame = true,
        showTitleBar = true,
        titleBarHeight = 36,
        windowBg = '#18181b',
        titleBarBg = '#27272a',
        windowTitle = '',
        titleColor = 'rgba(255, 255, 255, 0.6)'
    } = options;

    const effectiveBarH = (showFrame && showTitleBar) ? titleBarHeight : 0;
    const outW = Math.max(1, Math.round(contentW + padding * 2));
    const outH = Math.max(1, Math.round(contentH + effectiveBarH + padding * 2));

    canvas.width = outW;
    canvas.height = outH;
    ctx.clearRect(0, 0, outW, outH);

    if (bgPreset === 'solid') {
        ctx.fillStyle = solidColor;
    } else {
        const preset = MOCKUP_PRESETS[bgPreset] || MOCKUP_PRESETS.sunset;
        const grad = ctx.createLinearGradient(0, 0, outW, outH);
        grad.addColorStop(0, preset.c1);
        grad.addColorStop(1, preset.c2);
        ctx.fillStyle = grad;
    }
    ctx.fillRect(0, 0, outW, outH);

    const boxX = padding;
    const boxY = padding;
    const boxW = contentW;
    const boxH = contentH + effectiveBarH;
    const effectiveRadius = showFrame ? radius : 0;

    ctx.save();
    if (shadowStrength > 0 && showFrame) {
        ctx.shadowColor = `rgba(0, 0, 0, ${(0.55 * shadowStrength).toFixed(2)})`;
        ctx.shadowBlur = Math.round(Math.max(12, Math.min(80, Math.max(contentW, contentH) * 0.05)) * shadowStrength);
        ctx.shadowOffsetY = Math.round(14 * shadowStrength);
    }
    traceRoundedRect(ctx, boxX, boxY, boxW, boxH, effectiveRadius);
    ctx.fillStyle = windowBg;
    ctx.fill();
    ctx.restore();

    ctx.save();
    traceRoundedRect(ctx, boxX, boxY, boxW, boxH, effectiveRadius);
    ctx.clip();

    if (effectiveBarH > 0) {
        ctx.fillStyle = titleBarBg;
        ctx.fillRect(boxX, boxY, boxW, effectiveBarH);

        const dotRadius = Math.max(4, Math.min(7, Math.round(effectiveBarH * 0.17)));
        const dotY = boxY + effectiveBarH / 2;
        const startDotX = boxX + dotRadius * 2.4;
        const dotGap = dotRadius * 3.1;
        ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((color, idx) => {
            ctx.beginPath();
            ctx.arc(startDotX + idx * dotGap, dotY, dotRadius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        });

        if (windowTitle) {
            const titleFontSize = Math.max(11, Math.min(14, Math.round(effectiveBarH * 0.36)));
            ctx.font = `600 ${titleFontSize}px Inter, Arial, sans-serif`;
            ctx.fillStyle = titleColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(windowTitle, boxX + boxW / 2, dotY, Math.max(60, boxW - 140));
        }
    }

    return {
        contentX: boxX,
        contentY: boxY + effectiveBarH,
        contentW: boxW,
        contentH
    };
}

// ============================================
// 1. MOCKUP DE SCREENSHOT
// ============================================

function buildMockupControls(container) {
    mockupBgPreset = 'sunset';

    container.innerHTML = `
        <div class="control-group">
            <label>Fundo (Gradiente / Cor)</label>
            <div class="preset-swatch-row">${renderPresetSwatchesHtml('selectMockupPreset', mockupBgPreset)}</div>
            <div id="mockupSolidColorGroup" style="display: none; margin-top: 0.5rem;">
                <input type="color" id="mockupSolidColor" value="#1e1b4b" oninput="renderMockupPreview()">
            </div>
        </div>
        <div class="control-group">
            <label>Moldura da janela</label>
            <select id="mockupFrameStyle" onchange="renderMockupPreview()">
                <option value="macos-dark">macOS Escura</option>
                <option value="macos-light">macOS Clara</option>
                <option value="minimal">Sem barra (apenas cantos/sombra)</option>
                <option value="none">Sem moldura</option>
            </select>
        </div>
        <div class="control-group">
            <label>Espaçamento (Padding): <span id="mockupPaddingVal">48</span>px</label>
            <input type="range" id="mockupPadding" min="0" max="160" value="48" oninput="document.getElementById('mockupPaddingVal').textContent = this.value; renderMockupPreview()">
        </div>
        <div class="control-group">
            <label>Arredondamento: <span id="mockupRadiusVal">16</span>px</label>
            <input type="range" id="mockupRadius" min="0" max="40" value="16" oninput="document.getElementById('mockupRadiusVal').textContent = this.value; renderMockupPreview()">
        </div>
        <div class="control-group">
            <label>Sombra: <span id="mockupShadowVal">60</span>%</label>
            <input type="range" id="mockupShadow" min="0" max="100" value="60" oninput="document.getElementById('mockupShadowVal').textContent = this.value; renderMockupPreview()">
        </div>
    `;

    renderMockupPreview();
}

function selectMockupPreset(presetKey, btn) {
    mockupBgPreset = MOCKUP_PRESETS[presetKey] ? presetKey : 'sunset';
    selectPresetSwatch(btn, 'mockupSolidColorGroup', presetKey);
    renderMockupPreview();
}

function renderMockupPreview() {
    if (!originalImage || !canvas || !ctx) return;

    const frameStyle = document.getElementById('mockupFrameStyle')?.value || 'macos-dark';
    const padding = parseInt(document.getElementById('mockupPadding')?.value ?? 48, 10) || 0;
    const radius = parseInt(document.getElementById('mockupRadius')?.value ?? 16, 10) || 0;
    const shadowStrength = (parseInt(document.getElementById('mockupShadow')?.value ?? 60, 10) || 0) / 100;
    const solidColor = document.getElementById('mockupSolidColor')?.value || '#1e1b4b';

    const imgW = originalImage.width;
    const imgH = originalImage.height;
    const isMac = frameStyle === 'macos-dark' || frameStyle === 'macos-light';
    const isLight = frameStyle === 'macos-light';

    const box = drawBackdropAndWindowFrame({
        contentW: imgW,
        contentH: imgH,
        padding,
        radius,
        shadowStrength,
        bgPreset: mockupBgPreset,
        solidColor,
        showFrame: frameStyle !== 'none',
        showTitleBar: isMac,
        titleBarHeight: Math.max(28, Math.round(Math.min(48, imgW * 0.04))),
        windowBg: isLight ? '#f3f4f6' : '#18181b',
        titleBarBg: isLight ? '#e5e7eb' : '#27272a'
    });

    ctx.drawImage(originalImage, box.contentX, box.contentY, box.contentW, box.contentH);
    ctx.restore();
}

// ============================================
// 2. KIT DE FAVICON & ÍCONES PWA
// ============================================

function buildFaviconControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Nome do App (manifest)</label>
            <input type="text" id="faviconAppName" value="Meu App" placeholder="Nome do site/app">
        </div>
        <div class="control-group">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="faviconTransparent" checked onchange="toggleFaviconBgInput()">
                Fundo transparente
            </label>
        </div>
        <div id="faviconBgColorGroup" class="control-group" style="display: none;">
            <label>Cor de fundo / tema</label>
            <input type="color" id="faviconBgColor" value="#131426" oninput="renderFaviconPreview()">
        </div>
        <div class="control-group">
            <label>Margem interna: <span id="faviconPaddingVal">8</span>%</label>
            <input type="range" id="faviconPadding" min="0" max="25" value="8" oninput="document.getElementById('faviconPaddingVal').textContent = this.value; renderFaviconPreview()">
        </div>
        <div class="control-group">
            <label>Arredondamento: <span id="faviconRadiusVal">15</span>%</label>
            <input type="range" id="faviconRadius" min="0" max="50" value="15" oninput="document.getElementById('faviconRadiusVal').textContent = this.value; renderFaviconPreview()">
        </div>
        <div class="control-group">
            <button type="button" class="btn-primary" onclick="downloadFaviconKit()" style="width: 100%;">
                📦 Baixar Kit Favicon (.zip)
            </button>
            <p style="font-size: 0.8rem; opacity: 0.75;">
                Inclui favicon.ico (16/32/48), PNGs, apple-touch-icon (180), PWA (192/512) e site.webmanifest.
            </p>
        </div>
    `;

    renderFaviconPreview();
}

function toggleFaviconBgInput() {
    const transparent = document.getElementById('faviconTransparent')?.checked;
    const bgGroup = document.getElementById('faviconBgColorGroup');
    if (bgGroup) bgGroup.style.display = transparent ? 'none' : 'flex';
    renderFaviconPreview();
}

function renderFaviconAtSize(sourceImg, size, options = {}) {
    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    const outCtx = out.getContext('2d');

    const padPx = Math.round((size * (options.paddingPct || 0)) / 100);
    const radiusPx = Math.round((size * (options.radiusPct || 0)) / 100);

    outCtx.save();
    traceRoundedRect(outCtx, 0, 0, size, size, radiusPx);
    outCtx.clip();

    if (!options.transparent) {
        outCtx.fillStyle = options.bgColor || '#131426';
        outCtx.fillRect(0, 0, size, size);
    }

    const innerSize = Math.max(1, size - padPx * 2);
    const scale = Math.min(innerSize / sourceImg.width, innerSize / sourceImg.height);
    const drawW = sourceImg.width * scale;
    const drawH = sourceImg.height * scale;
    const drawX = (size - drawW) / 2;
    const drawY = (size - drawH) / 2;

    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(sourceImg, drawX, drawY, drawW, drawH);
    outCtx.restore();

    return out;
}

function getFaviconOptionsFromDom() {
    return {
        appName: document.getElementById('faviconAppName')?.value.trim() || 'Meu App',
        transparent: document.getElementById('faviconTransparent')?.checked !== false,
        bgColor: document.getElementById('faviconBgColor')?.value || '#131426',
        paddingPct: parseInt(document.getElementById('faviconPadding')?.value ?? 8, 10) || 0,
        radiusPct: parseInt(document.getElementById('faviconRadius')?.value ?? 15, 10) || 0
    };
}

function renderFaviconPreview() {
    if (!originalImage || !canvas || !ctx) return;
    const opts = getFaviconOptionsFromDom();
    const previewCanvas = renderFaviconAtSize(originalImage, 512, opts);
    canvas.width = 512;
    canvas.height = 512;
    ctx.clearRect(0, 0, 512, 512);
    ctx.drawImage(previewCanvas, 0, 0);
}

/**
 * Packages PNG byte payloads into a valid multi-resolution Windows/Browser ICO binary.
 */
function createIcoFromPngEntries(entries) {
    const headerSize = 6;
    const dirEntrySize = 16;
    const totalDirSize = dirEntrySize * entries.length;
    const payloadSize = entries.reduce((sum, item) => sum + item.bytes.length, 0);

    const out = new Uint8Array(headerSize + totalDirSize + payloadSize);
    const view = new DataView(out.buffer);

    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, entries.length, true);

    let dataOffset = headerSize + totalDirSize;
    entries.forEach((entry, idx) => {
        const entryOffset = headerSize + idx * dirEntrySize;
        const dim = entry.size >= 256 ? 0 : entry.size;
        view.setUint8(entryOffset, dim);
        view.setUint8(entryOffset + 1, dim);
        view.setUint8(entryOffset + 2, 0);
        view.setUint8(entryOffset + 3, 0);
        view.setUint16(entryOffset + 4, 1, true);
        view.setUint16(entryOffset + 6, 32, true);
        view.setUint32(entryOffset + 8, entry.bytes.length, true);
        view.setUint32(entryOffset + 12, dataOffset, true);

        out.set(entry.bytes, dataOffset);
        dataOffset += entry.bytes.length;
    });

    return out;
}

async function downloadFaviconKit() {
    if (!originalImage) return;

    try {
        if (typeof ensureJSZipReady === 'function') {
            await ensureJSZipReady();
        } else if (typeof JSZip === 'undefined') {
            throw new Error('JSZip indisponível');
        }

        const opts = getFaviconOptionsFromDom();
        const zip = new JSZip();
        const targets = [
            { size: 16, file: 'favicon-16x16.png' },
            { size: 32, file: 'favicon-32x32.png' },
            { size: 48, file: 'favicon-48x48.png' },
            { size: 180, file: 'apple-touch-icon.png' },
            { size: 192, file: 'icon-192x192.png' },
            { size: 512, file: 'icon-512x512.png' }
        ];

        const icoEntries = [];
        for (const item of targets) {
            const c = renderFaviconAtSize(originalImage, item.size, opts);
            const blob = await canvasToBlobPromise(c, 'image/png', 1);
            const bytes = await blobToUint8Array(blob);
            zip.file(item.file, bytes);
            if (item.size <= 48) {
                icoEntries.push({ size: item.size, bytes });
            }
        }

        zip.file('favicon.ico', createIcoFromPngEntries(icoEntries));

        const manifest = {
            name: opts.appName,
            short_name: opts.appName,
            icons: [
                { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' }
            ],
            theme_color: opts.transparent ? '#131426' : opts.bgColor,
            background_color: opts.transparent ? '#06071A' : opts.bgColor,
            display: 'standalone'
        };
        zip.file('site.webmanifest', JSON.stringify(manifest, null, 2));

        const snippet = [
            '<link rel="icon" href="/favicon.ico" sizes="any">',
            '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
            '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
            '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
            '<link rel="manifest" href="/site.webmanifest">'
        ].join('\n');
        zip.file('snippet-html.txt', snippet);

        const content = await zip.generateAsync({ type: 'blob' });
        if (typeof triggerBlobDownload === 'function') {
            triggerBlobDownload(content, 'favicon-kit.zip');
        }
        if (typeof showToast === 'function') {
            showToast('Kit Favicon gerado com sucesso!', 'success');
        }
    } catch (err) {
        console.error('Erro ao gerar kit favicon:', err);
        if (typeof showToast === 'function') {
            showToast('Erro ao carregar JSZip ou gerar kit favicon.', 'error');
        }
    }
}

// ============================================
// 3. IMAGENS PARA PDF
// ============================================

function buildPdfControls(container) {
    pdfPages = [];
    if (originalImage) {
        pdfPages.push({
            name: 'imagem-atual.png',
            img: originalImage,
            src: originalImage.src,
            width: originalImage.width,
            height: originalImage.height
        });
    }

    container.innerHTML = `
        <div class="control-group">
            <label>Adicionar Páginas (clique ou Ctrl+V)</label>
            <div class="custom-file-upload">
                <label for="pdfImagesInput" class="file-upload-label">
                    <span>📄 Adicionar imagens ao PDF...</span>
                </label>
                <input type="file" id="pdfImagesInput" accept="image/*" multiple onchange="handlePdfInput(this)" style="display: none;">
            </div>
        </div>
        <div class="control-group">
            <label>Ordem das páginas (<span id="pdfPageCount">${pdfPages.length}</span>)</label>
            <div id="pdfPageList" class="pdf-page-list"></div>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Tamanho</label>
                <select id="pdfPageSize" onchange="renderPdfPreview()">
                    <option value="a4">A4 (210×297mm)</option>
                    <option value="letter">Carta (Letter)</option>
                    <option value="fit">Ajustar à imagem</option>
                </select>
            </div>
            <div class="control-group">
                <label>Orientação</label>
                <select id="pdfOrientation" onchange="renderPdfPreview()">
                    <option value="auto">Automática</option>
                    <option value="portrait">Retrato</option>
                    <option value="landscape">Paisagem</option>
                </select>
            </div>
        </div>
        <div class="control-group">
            <label>Margem</label>
            <select id="pdfMargin" onchange="renderPdfPreview()">
                <option value="28">Média (10mm)</option>
                <option value="0">Sem margem (borda a borda)</option>
                <option value="56">Grande (20mm)</option>
            </select>
        </div>
        <div class="control-group">
            <button type="button" id="btnGeneratePdf" class="btn-primary" onclick="generatePdfFromImages()" style="width: 100%;" ${pdfPages.length === 0 ? 'disabled' : ''}>
                📄 Gerar e Baixar PDF
            </button>
        </div>
    `;

    renderPdfPageList();
    renderPdfPreview();
}

async function handlePdfInput(input) {
    if (input.files && input.files.length > 0) {
        await addPdfImageFiles(Array.from(input.files));
        input.value = '';
    }
}

async function addPdfImageFiles(files) {
    for (const file of files) {
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    pdfPages.push({
                        name: file.name || `pagina-${pdfPages.length + 1}.png`,
                        img,
                        src: e.target.result,
                        width: img.width,
                        height: img.height
                    });
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = e.target.result;
            };
            reader.onerror = () => resolve();
            reader.readAsDataURL(file);
        });
    }

    renderPdfPageList();
    renderPdfPreview();
}

function movePdfPage(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= pdfPages.length) return;
    const [item] = pdfPages.splice(index, 1);
    pdfPages.splice(target, 0, item);
    renderPdfPageList();
    renderPdfPreview();
}

function removePdfPage(index) {
    pdfPages.splice(index, 1);
    renderPdfPageList();
    renderPdfPreview();
}

function renderPdfPageList() {
    const listEl = document.getElementById('pdfPageList');
    const countEl = document.getElementById('pdfPageCount');
    const btnGen = document.getElementById('btnGeneratePdf');

    if (countEl) countEl.textContent = String(pdfPages.length);
    if (btnGen) btnGen.disabled = pdfPages.length === 0;
    if (!listEl) return;

    if (pdfPages.length === 0) {
        listEl.innerHTML = '<p style="opacity: 0.65; font-size: 0.85rem; margin: 0.25rem;">Nenhuma imagem adicionada ainda.</p>';
        return;
    }

    listEl.innerHTML = pdfPages.map((page, idx) => `
        <div class="pdf-page-item">
            <img class="pdf-page-thumb" src="${page.src}" alt="">
            <div class="pdf-page-meta">
                <div class="pdf-page-name">${idx + 1}. ${typeof escapeHtml === 'function' ? escapeHtml(page.name) : page.name}</div>
                <div class="pdf-page-dims">${page.width} × ${page.height} px</div>
            </div>
            <div class="pdf-page-actions">
                <button type="button" onclick="movePdfPage(${idx}, -1)" title="Subir" ${idx === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" onclick="movePdfPage(${idx}, 1)" title="Descer" ${idx === pdfPages.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" onclick="removePdfPage(${idx})" title="Remover">×</button>
            </div>
        </div>
    `).join('');
}

function resolvePdfPageBox(imgWidth, imgHeight, pageSize, orientation, marginPt) {
    let pageW = 595.28;
    let pageH = 841.89;

    if (pageSize === 'letter') {
        pageW = 612;
        pageH = 792;
    } else if (pageSize === 'fit') {
        const maxPt = 842;
        const scale = Math.min(1, maxPt / Math.max(imgWidth, imgHeight));
        return {
            pageW: Math.max(100, imgWidth * scale + marginPt * 2),
            pageH: Math.max(100, imgHeight * scale + marginPt * 2)
        };
    }

    const useLandscape = orientation === 'landscape' || (orientation === 'auto' && imgWidth > imgHeight);
    if (useLandscape && pageW < pageH) {
        return { pageW: pageH, pageH: pageW };
    }
    return { pageW, pageH };
}

function renderPdfPreview() {
    if (!canvas || !ctx) return;

    if (pdfPages.length === 0) {
        canvas.width = 420;
        canvas.height = 594;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '16px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Prévia da Página 1 (adicione imagens)', canvas.width / 2, canvas.height / 2);
        return;
    }

    const first = pdfPages[0];
    const pageSize = document.getElementById('pdfPageSize')?.value || 'a4';
    const orientation = document.getElementById('pdfOrientation')?.value || 'auto';
    const marginPt = parseFloat(document.getElementById('pdfMargin')?.value ?? 28) || 0;
    const { pageW, pageH } = resolvePdfPageBox(first.width, first.height, pageSize, orientation, marginPt);

    const previewScale = Math.min(600 / pageW, 600 / pageH);
    const cw = Math.max(80, Math.round(pageW * previewScale));
    const ch = Math.max(80, Math.round(pageH * previewScale));
    const marginPx = marginPt * previewScale;

    canvas.width = cw;
    canvas.height = ch;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);

    const availW = Math.max(1, cw - marginPx * 2);
    const availH = Math.max(1, ch - marginPx * 2);
    const fitScale = Math.min(availW / first.width, availH / first.height);
    const drawW = first.width * fitScale;
    const drawH = first.height * fitScale;
    const drawX = (cw - drawW) / 2;
    const drawY = (ch - drawH) / 2;

    ctx.drawImage(first.img, drawX, drawY, drawW, drawH);
}

function encodeAsciiBytes(text) {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        out[i] = text.charCodeAt(i) & 0xff;
    }
    return out;
}

/**
 * Generates a self-contained PDF 1.4 binary embedding JPEG XObject pages via
 * /Filter /DCTDecode with zero external PDF dependencies.
 */
function buildPdfFromJpegPages(pages) {
    const chunks = [];
    let byteLength = 0;
    const pushBytes = (bytes) => {
        chunks.push(bytes);
        byteLength += bytes.length;
    };
    const pushText = (text) => pushBytes(encodeAsciiBytes(text));

    pushText('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

    const totalObjects = 2 + pages.length * 3;
    const offsets = new Array(totalObjects + 1).fill(0);

    const writeObject = (objNum, bodyParts) => {
        offsets[objNum] = byteLength;
        pushText(`${objNum} 0 obj\n`);
        bodyParts.forEach(part => {
            if (typeof part === 'string') pushText(part);
            else pushBytes(part);
        });
        pushText('\nendobj\n');
    };

    const pageRefs = pages.map((_, idx) => `${3 + idx * 3} 0 R`).join(' ');
    writeObject(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    writeObject(2, [`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`]);

    pages.forEach((p, idx) => {
        const pageObjId = 3 + idx * 3;
        const contentObjId = pageObjId + 1;
        const imageObjId = pageObjId + 2;

        writeObject(pageObjId, [
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.pageW.toFixed(2)} ${p.pageH.toFixed(2)}] /Resources << /XObject << /Im${idx} ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>`
        ]);

        const contentStream = `q\n${p.drawW.toFixed(2)} 0 0 ${p.drawH.toFixed(2)} ${p.drawX.toFixed(2)} ${p.drawY.toFixed(2)} cm\n/Im${idx} Do\nQ\n`;
        writeObject(contentObjId, [
            `<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream`
        ]);

        writeObject(imageObjId, [
            `<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\nstream\n`,
            p.jpegBytes,
            '\nendstream'
        ]);
    });

    const xrefOffset = byteLength;
    pushText(`xref\n0 ${totalObjects + 1}\n`);
    pushText('0000000000 65535 f \n');
    for (let i = 1; i <= totalObjects; i++) {
        pushText(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }

    pushText(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    const pdf = new Uint8Array(byteLength);
    let cursor = 0;
    for (const chunk of chunks) {
        pdf.set(chunk, cursor);
        cursor += chunk.length;
    }
    return pdf;
}

async function generatePdfFromImages() {
    if (pdfPages.length === 0) {
        if (typeof showToast === 'function') showToast('Adicione pelo menos uma imagem para gerar o PDF.', 'error');
        return;
    }

    const pageSize = document.getElementById('pdfPageSize')?.value || 'a4';
    const orientation = document.getElementById('pdfOrientation')?.value || 'auto';
    const marginPt = parseFloat(document.getElementById('pdfMargin')?.value ?? 28) || 0;

    try {
        const preparedPages = [];
        for (const page of pdfPages) {
            const maxDim = 2200;
            const downscale = Math.min(1, maxDim / Math.max(page.width, page.height));
            const widthPx = Math.max(1, Math.round(page.width * downscale));
            const heightPx = Math.max(1, Math.round(page.height * downscale));

            const offscreen = document.createElement('canvas');
            offscreen.width = widthPx;
            offscreen.height = heightPx;
            const octx = offscreen.getContext('2d');
            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, widthPx, heightPx);
            octx.drawImage(page.img, 0, 0, widthPx, heightPx);

            const blob = await canvasToBlobPromise(offscreen, 'image/jpeg', 0.9);
            const jpegBytes = await blobToUint8Array(blob);

            const { pageW, pageH } = resolvePdfPageBox(widthPx, heightPx, pageSize, orientation, marginPt);
            const availW = Math.max(10, pageW - marginPt * 2);
            const availH = Math.max(10, pageH - marginPt * 2);
            const fitScale = Math.min(availW / widthPx, availH / heightPx);
            const drawW = widthPx * fitScale;
            const drawH = heightPx * fitScale;

            preparedPages.push({
                widthPx,
                heightPx,
                jpegBytes,
                pageW,
                pageH,
                drawW,
                drawH,
                drawX: (pageW - drawW) / 2,
                drawY: (pageH - drawH) / 2
            });
        }

        const pdfBytes = buildPdfFromJpegPages(preparedPages);
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        if (typeof triggerBlobDownload === 'function') {
            triggerBlobDownload(pdfBlob, 'imagens-convertidas.pdf');
        }
        if (typeof showToast === 'function') {
            showToast(`PDF com ${preparedPages.length} página(s) gerado!`, 'success');
        }
    } catch (err) {
        console.error('Erro ao gerar PDF:', err);
        if (typeof showToast === 'function') showToast('Não foi possível gerar o PDF.', 'error');
    }
}

// ============================================
// 4. DIVISOR EM GRADE / CARROSSEL
// ============================================

function buildSplitGridControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Atalhos rápidos</label>
            <div class="filters-grid" style="grid-template-columns: repeat(3, 1fr);">
                <button type="button" class="filter-btn" onclick="setSplitGridPreset(2, 1, this)">2×1 Slide</button>
                <button type="button" class="filter-btn active" onclick="setSplitGridPreset(3, 1, this)">3×1 Carrossel</button>
                <button type="button" class="filter-btn" onclick="setSplitGridPreset(4, 1, this)">4×1 Carrossel</button>
                <button type="button" class="filter-btn" onclick="setSplitGridPreset(2, 2, this)">2×2 Grade</button>
                <button type="button" class="filter-btn" onclick="setSplitGridPreset(3, 3, this)">3×3 Grade</button>
                <button type="button" class="filter-btn" onclick="setSplitGridPreset(5, 1, this)">5×1 Banner</button>
            </div>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Colunas</label>
                <input type="number" id="splitCols" min="1" max="10" value="3" oninput="renderSplitGridPreview()">
            </div>
            <div class="control-group">
                <label>Linhas</label>
                <input type="number" id="splitRows" min="1" max="10" value="1" oninput="renderSplitGridPreview()">
            </div>
        </div>
        <div class="control-group">
            <p id="splitGridSummary" class="crop-dimensions">-</p>
        </div>
        <div class="control-group">
            <button type="button" class="btn-primary" onclick="downloadSplitGridZip()" style="width: 100%;">
                ✂️ Baixar Fatias (.zip)
            </button>
        </div>
    `;

    renderSplitGridPreview();
}

function setSplitGridPreset(cols, rows, btn) {
    const colsEl = document.getElementById('splitCols');
    const rowsEl = document.getElementById('splitRows');
    if (colsEl) colsEl.value = cols;
    if (rowsEl) rowsEl.value = rows;

    document.querySelectorAll('#controls .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderSplitGridPreview();
}

function getSplitGridDims() {
    const cols = Math.max(1, Math.min(10, parseInt(document.getElementById('splitCols')?.value ?? 3, 10) || 1));
    const rows = Math.max(1, Math.min(10, parseInt(document.getElementById('splitRows')?.value ?? 1, 10) || 1));
    return { cols, rows };
}

function renderSplitGridPreview() {
    if (!originalImage || !canvas || !ctx) return;

    const { cols, rows } = getSplitGridDims();
    const w = originalImage.width;
    const h = originalImage.height;

    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(originalImage, 0, 0);

    const tileW = Math.floor(w / cols);
    const tileH = Math.floor(h / rows);
    const summaryEl = document.getElementById('splitGridSummary');
    if (summaryEl) {
        summaryEl.textContent = `${cols * rows} fatias · ~${tileW} × ${tileH} px cada`;
    }

    ctx.save();
    ctx.strokeStyle = '#f2511b';
    ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.004));
    ctx.setLineDash([8, 6]);

    for (let c = 1; c < cols; c++) {
        const x = Math.round((w * c) / cols);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }

    for (let r = 1; r < rows; r++) {
        const y = Math.round((h * r) / rows);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    ctx.setLineDash([]);
    const fontSize = Math.max(14, Math.min(48, Math.round(Math.min(w / cols, h / rows) * 0.2)));
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let num = 1;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cx = ((c + 0.5) * w) / cols;
            const cy = ((r + 0.5) * h) / rows;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(cx - fontSize * 0.9, cy - fontSize * 0.7, fontSize * 1.8, fontSize * 1.4);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(String(num++), cx, cy);
        }
    }
    ctx.restore();
}

async function downloadSplitGridZip() {
    if (!originalImage) return;

    try {
        if (typeof ensureJSZipReady === 'function') {
            await ensureJSZipReady();
        } else if (typeof JSZip === 'undefined') {
            throw new Error('JSZip indisponível');
        }

        const { cols, rows } = getSplitGridDims();
        const w = originalImage.width;
        const h = originalImage.height;
        const zip = new JSZip();

        let index = 1;
        for (let r = 0; r < rows; r++) {
            const sy = Math.round((h * r) / rows);
            const ey = Math.round((h * (r + 1)) / rows);
            const sh = Math.max(1, ey - sy);

            for (let c = 0; c < cols; c++) {
                const sx = Math.round((w * c) / cols);
                const ex = Math.round((w * (c + 1)) / cols);
                const sw = Math.max(1, ex - sx);

                const tileCanvas = document.createElement('canvas');
                tileCanvas.width = sw;
                tileCanvas.height = sh;
                tileCanvas.getContext('2d').drawImage(originalImage, sx, sy, sw, sh, 0, 0, sw, sh);

                const blob = await canvasToBlobPromise(tileCanvas, 'image/png', 1);
                const bytes = await blobToUint8Array(blob);
                const padded = String(index++).padStart(2, '0');
                zip.file(`fatia-${padded}-L${r + 1}C${c + 1}.png`, bytes);
            }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        if (typeof triggerBlobDownload === 'function') {
            triggerBlobDownload(content, 'grade-recortada.zip');
        }
        if (typeof showToast === 'function') {
            showToast(`${cols * rows} fatia(s) geradas em ZIP!`, 'success');
        }
    } catch (err) {
        console.error('Erro ao fatiar imagem:', err);
        if (typeof showToast === 'function') {
            showToast('Erro ao carregar JSZip ou gerar fatias.', 'error');
        }
    }
}

// ============================================
// 5. RASTERIZAR SVG PARA PNG / WEBP
// ============================================

function sanitizeSvgMarkup(rawSvg) {
    return String(rawSvg || '')
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(?:href|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');
}

function parseSvgNaturalSize(svgMarkup) {
    const viewBoxMatch = svgMarkup.match(/viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
    const widthMatch = svgMarkup.match(/<svg\b[^>]*\bwidth\s*=\s*["']\s*([\d.]+)/i);
    const heightMatch = svgMarkup.match(/<svg\b[^>]*\bheight\s*=\s*["']\s*([\d.]+)/i);

    let width = widthMatch ? parseFloat(widthMatch[1]) : 0;
    let height = heightMatch ? parseFloat(heightMatch[1]) : 0;

    if ((!width || !height) && viewBoxMatch) {
        const vbW = parseFloat(viewBoxMatch[1]);
        const vbH = parseFloat(viewBoxMatch[2]);
        if (vbW > 0 && vbH > 0) {
            if (!width && !height) {
                width = vbW;
                height = vbH;
            } else if (!width) {
                width = height * (vbW / vbH);
            } else if (!height) {
                height = width * (vbH / vbW);
            }
        }
    }

    return {
        width: width > 0 ? Math.round(width) : 512,
        height: height > 0 ? Math.round(height) : 512
    };
}

function buildSvgRasterControls(container) {
    const defaultW = originalImage ? Math.min(4096, originalImage.width) : 1024;
    container.innerHTML = `
        <div class="control-group">
            <label>Carregar arquivo .svg</label>
            <div class="custom-file-upload">
                <label for="svgFileInput" class="file-upload-label">
                    <span>📐 Selecionar arquivo SVG...</span>
                </label>
                <input type="file" id="svgFileInput" accept=".svg,image/svg+xml" onchange="loadSvgFromFile(this)" style="display: none;">
            </div>
        </div>
        <div class="control-group">
            <label>Ou cole o código SVG</label>
            <textarea id="svgMarkupInput" rows="4" placeholder='<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">...</svg>' style="width: 100%; font-family: monospace; font-size: 0.8rem;"></textarea>
            <button type="button" class="btn-secondary" onclick="loadSvgFromTextarea()" style="width: 100%;">
                ⚡ Renderizar Código SVG
            </button>
        </div>
        <div class="control-group">
            <label>Resolução (largura em px)</label>
            <div class="filters-grid" style="grid-template-columns: repeat(4, 1fr);">
                <button type="button" class="filter-btn" onclick="setSvgTargetWidth(512, this)">512</button>
                <button type="button" class="filter-btn active" onclick="setSvgTargetWidth(1024, this)">1024</button>
                <button type="button" class="filter-btn" onclick="setSvgTargetWidth(2048, this)">2048</button>
                <button type="button" class="filter-btn" onclick="setSvgTargetWidth(4096, this)">4096</button>
            </div>
            <input type="number" id="svgTargetWidth" min="16" max="8192" value="${defaultW}" oninput="renderSvgRasterPreview()">
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Formato</label>
                <select id="svgFormat">
                    <option value="image/png">PNG (transparente)</option>
                    <option value="image/webp">WEBP</option>
                </select>
            </div>
            <div class="control-group">
                <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
                    <input type="checkbox" id="svgTransparentBg" checked onchange="toggleSvgBgInput()">
                    Fundo transparente
                </label>
                <input type="color" id="svgBgColor" value="#ffffff" style="display: none;" oninput="renderSvgRasterPreview()">
            </div>
        </div>
        <div class="control-group">
            <p id="svgOutputInfo" class="crop-dimensions">-</p>
        </div>
    `;

    renderSvgRasterPreview();
}

function toggleSvgBgInput() {
    const transparent = document.getElementById('svgTransparentBg')?.checked;
    const colorInput = document.getElementById('svgBgColor');
    if (colorInput) colorInput.style.display = transparent ? 'none' : 'block';
    renderSvgRasterPreview();
}

function setSvgTargetWidth(widthPx, btn) {
    const input = document.getElementById('svgTargetWidth');
    if (input) input.value = widthPx;
    document.querySelectorAll('#controls .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderSvgRasterPreview();
}

function applyLoadedSvgMarkup(rawSvg) {
    const cleaned = sanitizeSvgMarkup(rawSvg).trim();
    if (!/<svg[\s>]/i.test(cleaned)) {
        if (typeof showToast === 'function') showToast('Conteúdo SVG inválido.', 'error');
        return;
    }

    const natural = parseSvgNaturalSize(cleaned);
    const svgBlob = new Blob([cleaned], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);

    if (loadedSvgState && loadedSvgState.objectUrl) {
        URL.revokeObjectURL(loadedSvgState.objectUrl);
    }

    const img = new Image();
    img.onload = () => {
        loadedSvgState = { markup: cleaned, natural, objectUrl };
        originalImage = img;
        if (!trueOriginalImage) trueOriginalImage = img;
        if (typeof updatePreviewToolbarVisibility === 'function') updatePreviewToolbarVisibility();
        renderSvgRasterPreview();
        if (typeof showToast === 'function') showToast('SVG carregado com sucesso!', 'success');
    };
    img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (typeof showToast === 'function') showToast('Não foi possível renderizar este SVG.', 'error');
    };
    img.src = objectUrl;
}

function loadSvgFromFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = String(e.target.result || '');
        const textarea = document.getElementById('svgMarkupInput');
        if (textarea) textarea.value = text;
        applyLoadedSvgMarkup(text);
    };
    reader.onerror = () => {
        if (typeof showToast === 'function') showToast('Erro ao ler arquivo SVG.', 'error');
    };
    reader.readAsText(file);
    input.value = '';
}

function loadSvgFromTextarea() {
    const raw = document.getElementById('svgMarkupInput')?.value || '';
    applyLoadedSvgMarkup(raw);
}

function renderSvgRasterPreview() {
    if (!canvas || !ctx) return;

    const infoEl = document.getElementById('svgOutputInfo');
    if (!originalImage) {
        canvas.width = 400;
        canvas.height = 300;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '15px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Envie um arquivo .svg ou cole o código ao lado', 200, 150);
        if (infoEl) infoEl.textContent = 'Aguardando SVG...';
        return;
    }

    const natW = loadedSvgState?.natural?.width || originalImage.width || 512;
    const natH = loadedSvgState?.natural?.height || originalImage.height || 512;
    const ratio = natW / Math.max(1, natH);

    const rawWidth = parseInt(document.getElementById('svgTargetWidth')?.value ?? natW, 10);
    const targetW = Math.max(16, Math.min(8192, Number.isFinite(rawWidth) ? rawWidth : natW));
    const targetH = Math.max(1, Math.round(targetW / ratio));

    const transparent = document.getElementById('svgTransparentBg')?.checked !== false;
    const bgColor = document.getElementById('svgBgColor')?.value || '#ffffff';

    canvas.width = targetW;
    canvas.height = targetH;
    ctx.clearRect(0, 0, targetW, targetH);

    if (!transparent) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, targetW, targetH);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(originalImage, 0, 0, targetW, targetH);

    if (infoEl) {
        infoEl.textContent = `Saída: ${targetW} × ${targetH} px`;
    }
}

// ============================================
// 6. CÓDIGO PARA IMAGEM (SYNTAX SNAPSHOT)
// ============================================

const CODE_THEMES = {
    tokyo: {
        label: 'Tokyo Night',
        bg: '#1a1b26',
        bar: '#16161e',
        title: 'rgba(192, 202, 245, 0.65)',
        text: '#c0caf5',
        lineNum: '#565f89',
        comment: '#565f89',
        keyword: '#bb9af7',
        string: '#9ece6a',
        number: '#ff9e64',
        func: '#7aa2f7',
        type: '#2ac3de',
        operator: '#89ddff',
        tag: '#f7768e'
    },
    onedark: {
        label: 'One Dark',
        bg: '#282c34',
        bar: '#21252b',
        title: 'rgba(171, 178, 191, 0.68)',
        text: '#abb2bf',
        lineNum: '#5c6370',
        comment: '#7f848e',
        keyword: '#c678dd',
        string: '#98c379',
        number: '#d19a66',
        func: '#61afef',
        type: '#e5c07b',
        operator: '#56b6c2',
        tag: '#e06c75'
    },
    dracula: {
        label: 'Dracula',
        bg: '#282a36',
        bar: '#21222c',
        title: 'rgba(248, 248, 242, 0.65)',
        text: '#f8f8f2',
        lineNum: '#6272a4',
        comment: '#6272a4',
        keyword: '#ff79c6',
        string: '#f1fa8c',
        number: '#bd93f9',
        func: '#50fa7b',
        type: '#8be9fd',
        operator: '#ff79c6',
        tag: '#ff79c6'
    },
    monokai: {
        label: 'Monokai',
        bg: '#272822',
        bar: '#1e1f1c',
        title: 'rgba(248, 248, 242, 0.65)',
        text: '#f8f8f2',
        lineNum: '#75715e',
        comment: '#75715e',
        keyword: '#f92672',
        string: '#e6db74',
        number: '#ae81ff',
        func: '#a6e22e',
        type: '#66d9ef',
        operator: '#f92672',
        tag: '#f92672'
    },
    'github-light': {
        label: 'GitHub Light',
        bg: '#ffffff',
        bar: '#f6f8fa',
        title: 'rgba(36, 41, 47, 0.65)',
        text: '#24292f',
        lineNum: '#8c959f',
        comment: '#6e7781',
        keyword: '#cf222e',
        string: '#0a3069',
        number: '#0550ae',
        func: '#8250df',
        type: '#953800',
        operator: '#0550ae',
        tag: '#116329'
    }
};

const CODE_LANG_KEYWORDS = {
    javascript: new Set([
        'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
        'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally',
        'for', 'from', 'function', 'if', 'import', 'in', 'instanceof', 'let',
        'new', 'null', 'of', 'return', 'static', 'super', 'switch', 'this',
        'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while',
        'yield', 'interface', 'type', 'enum', 'implements'
    ]),
    python: new Set([
        'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
        'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from',
        'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not',
        'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield'
    ]),
    sql: new Set([
        'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
        'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'JOIN', 'INNER', 'LEFT',
        'RIGHT', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'AS', 'AND',
        'OR', 'NOT', 'NULL', 'DISTINCT', 'UNION', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
    ]),
    bash: new Set([
        'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case',
        'esac', 'function', 'return', 'export', 'local', 'readonly', 'true', 'false', 'in'
    ]),
    css: new Set(['important', 'from', 'to', 'and', 'not', 'only']),
    html: new Set(['DOCTYPE']),
    json: new Set(['true', 'false', 'null'])
};

const CODE_LANG_TYPES = new Set([
    'Array', 'Boolean', 'Date', 'Error', 'Map', 'Math', 'Number', 'Object',
    'Promise', 'RegExp', 'Set', 'String', 'Symbol', 'Uint8Array', 'console',
    'document', 'window', 'dict', 'list', 'set', 'tuple', 'str', 'int',
    'float', 'bool', 'len', 'range', 'print', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'
]);

const DEFAULT_CODE_SNIPPET = [
    '// Compartilhe trechos de código com visual limpo',
    'async function enviarResumo(usuario) {',
    '    const status = await buscarStatus(usuario.id);',
    '    if (!status.ativo) {',
    '        return { ok: false, motivo: "Inativo" };',
    '    }',
    '    return { ok: true, nome: usuario.nome, pontos: 42 };',
    '}'
].join('\n');

let codeBgPreset = 'ocean';

function detectCodeLanguage(code) {
    const sample = String(code || '').trim();
    if (!sample) return 'javascript';
    if (/^\s*[\[{]/.test(sample) && /"\w[^"]*"\s*:/.test(sample)) return 'json';
    if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b/i.test(sample) && /\b(FROM|INTO|WHERE|SET)\b/i.test(sample)) {
        return 'sql';
    }
    if (/^\s*<!DOCTYPE|<\/?[a-z][\w-]*(\s|>)/im.test(sample) && !/=>/.test(sample)) return 'html';
    if (/\b(def\s+\w+\(|elif\b|print\(|from\s+\w+\s+import\b)/.test(sample)) return 'python';
    if (/^#!\/.*sh\b|\b(echo|grep|awk)\s+|^\s*export\s+[A-Za-z_]\w*=/m.test(sample)) return 'bash';
    if (/[.#@]?[a-z_-]+\s*\{[^}]*:\s*[^;]+;/is.test(sample)) return 'css';
    return 'javascript';
}

function tokenizeCodeLines(code, language = 'auto') {
    const lang = language === 'auto' ? detectCodeLanguage(code) : language;
    const rawLines = String(code || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    const kwSet = CODE_LANG_KEYWORDS[lang] || CODE_LANG_KEYWORDS.javascript;

    let inBlockComment = false;
    let blockCommentEnd = '*/';

    return rawLines.map((line) => {
        const tokens = [];
        let i = 0;

        while (i < line.length) {
            if (inBlockComment) {
                const closeIdx = line.indexOf(blockCommentEnd, i);
                if (closeIdx === -1) {
                    tokens.push({ type: 'comment', text: line.slice(i) });
                    i = line.length;
                } else {
                    const end = closeIdx + blockCommentEnd.length;
                    tokens.push({ type: 'comment', text: line.slice(i, end) });
                    i = end;
                    inBlockComment = false;
                }
                continue;
            }

            if (line[i] === ' ') {
                let j = i + 1;
                while (j < line.length && line[j] === ' ') j++;
                tokens.push({ type: 'text', text: line.slice(i, j) });
                i = j;
                continue;
            }

            if (
                (line.startsWith('//', i) && lang !== 'python' && lang !== 'sql') ||
                (line[i] === '#' && (lang === 'python' || lang === 'bash')) ||
                (line.startsWith('--', i) && lang === 'sql')
            ) {
                tokens.push({ type: 'comment', text: line.slice(i) });
                break;
            }

            if (line.startsWith('/*', i) || (lang === 'html' && line.startsWith('<!--', i))) {
                blockCommentEnd = line.startsWith('<!--', i) ? '-->' : '*/';
                const closeIdx = line.indexOf(blockCommentEnd, i + blockCommentEnd.length);
                if (closeIdx === -1) {
                    tokens.push({ type: 'comment', text: line.slice(i) });
                    inBlockComment = true;
                    break;
                }
                const end = closeIdx + blockCommentEnd.length;
                tokens.push({ type: 'comment', text: line.slice(i, end) });
                i = end;
                continue;
            }

            const quote = line[i];
            if (quote === '"' || quote === "'" || quote === '`') {
                let j = i + 1;
                while (j < line.length) {
                    if (line[j] === '\\') {
                        j += 2;
                        continue;
                    }
                    if (line[j] === quote) {
                        j++;
                        break;
                    }
                    j++;
                }
                tokens.push({ type: 'string', text: line.slice(i, j) });
                i = j;
                continue;
            }

            if (lang === 'html' && line[i] === '<') {
                const tagMatch = line.slice(i).match(/^<\/?[a-zA-Z][\w-]*/);
                if (tagMatch) {
                    tokens.push({ type: 'tag', text: tagMatch[0] });
                    i += tagMatch[0].length;
                    continue;
                }
            }

            if (/\d/.test(line[i])) {
                const numMatch = line.slice(i).match(/^(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)/);
                if (numMatch) {
                    tokens.push({ type: 'number', text: numMatch[0] });
                    i += numMatch[0].length;
                    continue;
                }
            }

            if (/[a-zA-Z_$@]/.test(line[i])) {
                const idMatch = line.slice(i).match(/^[a-zA-Z_$@][\w-]*/);
                const word = idMatch ? idMatch[0] : line[i];
                const afterWord = line.slice(i + word.length);
                let tokenType = 'text';

                if (kwSet.has(word) || (lang === 'sql' && kwSet.has(word.toUpperCase()))) {
                    tokenType = 'keyword';
                } else if (CODE_LANG_TYPES.has(word) || /^[A-Z][a-zA-Z0-9]+$/.test(word)) {
                    tokenType = 'type';
                } else if (/^\s*\(/.test(afterWord)) {
                    tokenType = 'func';
                } else if (lang === 'css' && /^\s*:/.test(afterWord)) {
                    tokenType = 'type';
                }

                tokens.push({ type: tokenType, text: word });
                i += word.length;
                continue;
            }

            const opMatch = line.slice(i).match(/^(?:=>|===|!==|==|!=|<=|>=|&&|\|\||[=+\-*/%<>!&|^~?:{}()[\].,;])/);
            if (opMatch) {
                tokens.push({ type: 'operator', text: opMatch[0] });
                i += opMatch[0].length;
                continue;
            }

            tokens.push({ type: 'text', text: line[i] });
            i++;
        }

        return tokens;
    });
}

function wrapTokenizedLines(tokenizedLines, maxCols) {
    const wrapped = [];

    tokenizedLines.forEach((tokens, rawIndex) => {
        const lineNum = rawIndex + 1;
        let current = [];
        let colCount = 0;

        const flushLine = (isFirstPart) => {
            wrapped.push({ lineNumber: isFirstPart ? lineNum : null, tokens: current });
            current = [];
            colCount = 0;
        };

        let isFirst = true;
        tokens.forEach((tok) => {
            let remaining = tok.text;
            while (remaining.length > 0) {
                const spaceLeft = maxCols - colCount;
                if (spaceLeft <= 0) {
                    flushLine(isFirst);
                    isFirst = false;
                }
                const sliceLen = Math.min(remaining.length, Math.max(1, maxCols - colCount));
                current.push({ type: tok.type, text: remaining.slice(0, sliceLen) });
                colCount += sliceLen;
                remaining = remaining.slice(sliceLen);
            }
        });

        wrapped.push({ lineNumber: isFirst ? lineNum : null, tokens: current });
    });

    return wrapped;
}

function buildCodeImageControls(container) {
    codeBgPreset = 'ocean';

    container.innerHTML = `
        <div class="control-group">
            <label>Seu código</label>
            <textarea id="codeSnapInput" rows="7" spellcheck="false"
                style="width: 100%; font-family: monospace; font-size: 0.82rem; line-height: 1.45;"
                oninput="renderCodeImagePreview()"></textarea>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Tema</label>
                <select id="codeTheme" onchange="renderCodeImagePreview()">
                    <option value="tokyo">Tokyo Night</option>
                    <option value="onedark">One Dark</option>
                    <option value="dracula">Dracula</option>
                    <option value="monokai">Monokai</option>
                    <option value="github-light">GitHub Light</option>
                </select>
            </div>
            <div class="control-group">
                <label>Linguagem</label>
                <select id="codeLang" onchange="renderCodeImagePreview()">
                    <option value="auto">Automática</option>
                    <option value="javascript">JS / TypeScript</option>
                    <option value="python">Python</option>
                    <option value="html">HTML / XML</option>
                    <option value="css">CSS</option>
                    <option value="sql">SQL</option>
                    <option value="json">JSON</option>
                    <option value="bash">Bash / Shell</option>
                </select>
            </div>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Nome do arquivo</label>
                <input type="text" id="codeWindowTitle" value="snippet.js" placeholder="ex: app.js" oninput="renderCodeImagePreview()">
            </div>
            <div class="control-group" style="justify-content: flex-end;">
                <label style="display: flex; align-items: center; gap: 0.45rem; cursor: pointer;">
                    <input type="checkbox" id="codeLineNumbers" checked onchange="renderCodeImagePreview()">
                    Números de linha
                </label>
            </div>
        </div>
        <div class="control-group">
            <label>Fundo (Gradiente / Cor)</label>
            <div class="preset-swatch-row">${renderPresetSwatchesHtml('selectCodeBgPreset', codeBgPreset)}</div>
            <div id="codeSolidColorGroup" style="display: none; margin-top: 0.5rem;">
                <input type="color" id="codeSolidColor" value="#1e1b4b" oninput="renderCodeImagePreview()">
            </div>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Fonte: <span id="codeFontSizeVal">16</span>px</label>
                <input type="range" id="codeFontSize" min="13" max="24" value="16" oninput="document.getElementById('codeFontSizeVal').textContent = this.value; renderCodeImagePreview()">
            </div>
            <div class="control-group">
                <label>Padding: <span id="codePaddingVal">48</span>px</label>
                <input type="range" id="codePadding" min="16" max="96" value="48" oninput="document.getElementById('codePaddingVal').textContent = this.value; renderCodeImagePreview()">
            </div>
        </div>
        <div class="control-group">
            <label>Arredondamento: <span id="codeRadiusVal">14</span>px</label>
            <input type="range" id="codeRadius" min="0" max="32" value="14" oninput="document.getElementById('codeRadiusVal').textContent = this.value; renderCodeImagePreview()">
        </div>
        <div class="control-group">
            <button type="button" class="btn-primary" onclick="copyCodeImageToClipboard()" style="width: 100%;">
                📋 Copiar Imagem (PNG)
            </button>
        </div>
    `;

    const textarea = document.getElementById('codeSnapInput');
    if (textarea) textarea.value = DEFAULT_CODE_SNIPPET;

    renderCodeImagePreview();
}

function selectCodeBgPreset(presetKey, btn) {
    codeBgPreset = MOCKUP_PRESETS[presetKey] ? presetKey : 'ocean';
    selectPresetSwatch(btn, 'codeSolidColorGroup', presetKey);
    renderCodeImagePreview();
}

function renderCodeImagePreview() {
    if (!canvas || !ctx) return;

    const rawCode = document.getElementById('codeSnapInput')?.value ?? DEFAULT_CODE_SNIPPET;
    const themeKey = document.getElementById('codeTheme')?.value || 'tokyo';
    const theme = CODE_THEMES[themeKey] || CODE_THEMES.tokyo;
    const lang = document.getElementById('codeLang')?.value || 'auto';
    const windowTitle = document.getElementById('codeWindowTitle')?.value.trim() || '';
    const showLineNumbers = document.getElementById('codeLineNumbers')?.checked !== false;

    const fontSize = Math.max(12, Math.min(28, parseInt(document.getElementById('codeFontSize')?.value ?? 16, 10) || 16));
    const padding = Math.max(0, Math.min(120, parseInt(document.getElementById('codePadding')?.value ?? 48, 10) || 48));
    const radius = Math.max(0, Math.min(36, parseInt(document.getElementById('codeRadius')?.value ?? 14, 10) || 14));
    const solidColor = document.getElementById('codeSolidColor')?.value || '#1e1b4b';

    const codeFont = `${fontSize}px 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace`;
    ctx.font = codeFont;

    const tokenized = tokenizeCodeLines(rawCode, lang);
    const wrappedLines = wrapTokenizedLines(tokenized, 88);
    const maxLineCount = wrappedLines.length;
    const lineHeight = Math.round(fontSize * 1.55);
    const innerPadX = Math.round(fontSize * 1.5);
    const innerPadY = Math.round(fontSize * 1.25);

    const digits = String(tokenized.length).length;
    const sampleCharW = Math.max(fontSize * 0.6, ctx.measureText('M').width);
    const gutterWidth = showLineNumbers ? Math.round((digits + 1.5) * sampleCharW) : 0;

    let maxLineWidth = 0;
    wrappedLines.forEach((line) => {
        const plain = line.tokens.map(t => t.text).join('');
        maxLineWidth = Math.max(maxLineWidth, ctx.measureText(plain).width);
    });

    const contentW = Math.max(360, Math.min(1400, Math.ceil(gutterWidth + maxLineWidth + innerPadX * 2)));
    const contentH = Math.max(80, maxLineCount * lineHeight + innerPadY * 2);

    const box = drawBackdropAndWindowFrame({
        contentW,
        contentH,
        padding,
        radius,
        shadowStrength: 0.65,
        bgPreset: codeBgPreset,
        solidColor,
        showFrame: true,
        showTitleBar: true,
        titleBarHeight: Math.max(32, Math.round(fontSize * 2.1)),
        windowBg: theme.bg,
        titleBarBg: theme.bar,
        windowTitle,
        titleColor: theme.title
    });

    ctx.font = codeFont;
    ctx.textBaseline = 'top';

    wrappedLines.forEach((line, rowIdx) => {
        const y = box.contentY + innerPadY + rowIdx * lineHeight;
        let x = box.contentX + innerPadX;

        if (showLineNumbers) {
            if (line.lineNumber !== null) {
                ctx.fillStyle = theme.lineNum;
                ctx.textAlign = 'right';
                ctx.fillText(String(line.lineNumber), x + gutterWidth - sampleCharW * 1.2, y);
            }
            x += gutterWidth;
        }

        ctx.textAlign = 'left';
        line.tokens.forEach((tok) => {
            ctx.fillStyle = theme[tok.type] || theme.text;
            ctx.fillText(tok.text, x, y);
            x += ctx.measureText(tok.text).width;
        });
    });

    ctx.restore();
}

async function copyCodeImageToClipboard() {
    if (!canvas) return;

    try {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.write !== 'function') {
            if (typeof showToast === 'function') {
                showToast('Cópia direta de imagem indisponível aqui — clique em Baixar Imagem.', 'info');
            }
            return false;
        }

        const blob = await canvasToBlobPromise(canvas, 'image/png', 1);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        if (typeof showToast === 'function') {
            showToast('Imagem copiada! Cole no WhatsApp, Discord ou Slack.', 'success');
        }
        return true;
    } catch (err) {
        console.error('Erro ao copiar imagem:', err);
        if (typeof showToast === 'function') {
            showToast('Não foi possível copiar a imagem. Use Baixar Imagem.', 'error');
        }
        return false;
    }
}

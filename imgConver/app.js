let currentTool = null;
let originalImage = null;
let trueOriginalImage = null;
let initialLoadedImage = null;
let canvas = null;
let ctx = null;
let toolEventController = null;
let lastLoadedMetadata = null;

function getDefaultFilterState() {
    return {
        brightness: 100,
        contrast: 100,
        saturate: 100,
        grayscale: 0,
        sepia: 0,
        invert: 0,
        sharpen: 0,
        vignette: 0
    };
}

let currentFilter = getDefaultFilterState();
let cropRect = null;
const loadedExternalScripts = new Map();
let isHoldingCompare = false;
let compareRestoreSnapshot = null;

/**
 * Loads JSZip once on demand via loadExternalScript so batch, favicon, and
 * split-grid downloads share the same CDN loader.
 */
async function ensureJSZipReady() {
    if (typeof JSZip !== 'undefined') return;
    await loadExternalScript(
        'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
        () => typeof JSZip !== 'undefined'
    );
}

function dataUrlToArrayBuffer(dataUrl) {
    try {
        const commaIdx = String(dataUrl || '').indexOf(',');
        if (commaIdx === -1) return null;
        const header = dataUrl.slice(0, commaIdx);
        const payload = dataUrl.slice(commaIdx + 1);
        if (!/;base64/i.test(header)) return null;
        const bin = atob(payload);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i);
        }
        return bytes.buffer;
    } catch {
        return null;
    }
}

function refreshLoadedMetadata(dataUrl, fileMeta = {}) {
    if (typeof parseImageMetadata !== 'function') {
        lastLoadedMetadata = null;
        return;
    }
    const buf = dataUrlToArrayBuffer(dataUrl);
    lastLoadedMetadata = parseImageMetadata(buf, fileMeta);
}

/**
 * Loads an external script once and caches the in-flight promise so concurrent
 * tool actions share the same <script> request and retry on failure.
 */
function loadExternalScript(src, isAlreadyReady) {
    if (typeof isAlreadyReady === 'function' && isAlreadyReady()) {
        return Promise.resolve();
    }
    if (loadedExternalScripts.has(src)) {
        return loadedExternalScripts.get(src);
    }

    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            loadedExternalScripts.delete(src);
            script.remove();
            reject(new Error(`Falha ao carregar biblioteca: ${src}`));
        };
        document.head.appendChild(script);
    });

    loadedExternalScripts.set(src, promise);
    return promise;
}

function updatePreviewToolbarVisibility() {
    const toolbar = document.getElementById('previewToolbar');
    if (!toolbar) return;
    const excluded = currentTool === 'batch' || currentTool === 'compare' || currentTool === 'code-image';
    const canCompare = Boolean(trueOriginalImage) && !excluded;
    toolbar.style.display = canCompare ? 'flex' : 'none';
}

function startHoldCompare() {
    if (isHoldingCompare || !trueOriginalImage || !canvas || !ctx || canvas.width === 0 || canvas.height === 0) {
        return;
    }

    compareRestoreSnapshot = {
        width: canvas.width,
        height: canvas.height,
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
    };
    isHoldingCompare = true;

    canvas.width = trueOriginalImage.width;
    canvas.height = trueOriginalImage.height;
    ctx.filter = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(trueOriginalImage, 0, 0);

    const btn = document.getElementById('btnHoldCompare');
    if (btn) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        btn.textContent = '👁️ Mostrando original...';
    }
}

function stopHoldCompare() {
    if (!isHoldingCompare) return;
    isHoldingCompare = false;

    if (compareRestoreSnapshot && canvas && ctx) {
        canvas.width = compareRestoreSnapshot.width;
        canvas.height = compareRestoreSnapshot.height;
        ctx.putImageData(compareRestoreSnapshot.imageData, 0, 0);
        compareRestoreSnapshot = null;
    }

    const btn = document.getElementById('btnHoldCompare');
    if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        btn.textContent = '👁️ Segurar para ver original';
    }
}

function setupHoldCompareEvents() {
    const btn = document.getElementById('btnHoldCompare');
    if (!btn) return;

    btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startHoldCompare();
    });
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startHoldCompare();
    }, { passive: false });
    btn.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            startHoldCompare();
        }
    });
    btn.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            stopHoldCompare();
        }
    });
    btn.addEventListener('blur', stopHoldCompare);

    window.addEventListener('mouseup', stopHoldCompare);
    window.addEventListener('touchend', stopHoldCompare);
    window.addEventListener('touchcancel', stopHoldCompare);
    window.addEventListener('blur', stopHoldCompare);
}

function showToast(message, type = 'info', duration = 2800) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `imgconver-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 220);
    }, duration);
}

async function copyTextToClipboard(text, successMsg = 'Copiado para a área de transferência!') {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const temp = document.createElement('textarea');
            temp.value = text;
            temp.style.position = 'fixed';
            temp.style.opacity = '0';
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
        }
        showToast(successMsg, 'success');
        return true;
    } catch (err) {
        console.error('Erro ao copiar:', err);
        showToast('Não foi possível copiar automaticamente.', 'error');
        return false;
    }
}

function getToolEventSignal() {
    if (toolEventController) {
        toolEventController.abort();
    }
    toolEventController = new AbortController();
    return toolEventController.signal;
}

function cleanupToolState() {
    stopHoldCompare();

    if (toolEventController) {
        toolEventController.abort();
        toolEventController = null;
    }

    if (canvas) {
        canvas.onmousedown = null;
        canvas.onmousemove = null;
        canvas.onmouseup = null;
        canvas.onmouseout = null;
        canvas.onmouseleave = null;
        canvas.ontouchstart = null;
        canvas.ontouchmove = null;
        canvas.ontouchend = null;
        canvas.onclick = null;
        canvas.style.cursor = 'default';
        canvas.style.width = '';
        canvas.style.maxWidth = '';
    }

    if (typeof cleanupPhase1Tools === 'function') cleanupPhase1Tools();
    if (typeof cleanupPhase2Tools === 'function') cleanupPhase2Tools();
    if (typeof cleanupPhase4Tools === 'function') cleanupPhase4Tools();
    if (typeof cleanupPhase5Tools === 'function') cleanupPhase5Tools();
    if (typeof cleanupPhase6Tools === 'function') cleanupPhase6Tools();
}

function setModalLayoutMode(mode = 'default') {
    const previewSection = document.querySelector('#editorArea .preview-section');
    const modalFooter = document.getElementById('modalFooter');
    const btnApply = document.getElementById('btnApply');
    const btnReset = modalFooter ? modalFooter.querySelector('button[onclick="resetTool()"]') : null;
    const btnChange = modalFooter ? modalFooter.querySelector('button[onclick="changeImage()"]') : null;
    const btnDownload = modalFooter ? modalFooter.querySelector('button[onclick="downloadImage()"]') : null;

    if (previewSection) {
        previewSection.style.display = mode === 'batch' || mode === 'compare' ? 'none' : 'flex';
    }
    updatePreviewToolbarVisibility();

    if (modalFooter) {
        if (mode === 'batch') {
            modalFooter.style.display = 'none';
        } else {
            modalFooter.style.display = 'flex';
            if (btnChange) btnChange.style.display = mode === 'standalone-no-upload' ? 'none' : '';
            if (btnReset) btnReset.style.display = (mode === 'compare' || mode === 'export-only') ? 'none' : '';
            if (btnApply) btnApply.style.display = (mode === 'compare' || mode === 'export-only') ? 'none' : '';
            if (btnDownload) btnDownload.style.display = '';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    document.getElementById('btnVoltar').onclick = () => {
        window.location.href = '/';
    };

    document.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('click', () => {
            currentTool = card.dataset.tool;
            openToolModal(currentTool);
        });
    });

    document.getElementById('uploadArea').addEventListener('click', () => {
        document.getElementById('imageInput').click();
    });

    document.getElementById('imageInput').addEventListener('change', handleFileSelect);

    const uploadArea = document.getElementById('uploadArea');
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--accent-color)';
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--border-color)';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border-color)';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            loadImage(file);
        }
    });

    const modal = document.getElementById('toolModal');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeToolModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        const base64Modal = document.getElementById('base64Modal');
        if (base64Modal && base64Modal.style.display === 'flex') {
            if (e.key === 'Escape') closeBase64Modal();
            return;
        }

        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeToolModal();
        }
    });

    setupHoldCompareEvents();
    document.addEventListener('paste', handleClipboardPaste);

    const searchInput = document.getElementById('toolSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const tools = document.querySelectorAll('.tool-card');

            tools.forEach(tool => {
                const title = tool.querySelector('h3').textContent.toLowerCase();
                const desc = tool.querySelector('p').textContent.toLowerCase();

                if (title.includes(query) || desc.includes(query) || tool.dataset.tool.includes(query)) {
                    tool.classList.remove('hidden');
                    tool.style.animation = 'fadeIn 0.3s ease forwards';
                } else {
                    tool.classList.add('hidden');
                }
            });
        });
    }
});

function openToolModal(tool) {
    const modal = document.getElementById('toolModal');
    const title = document.getElementById('modalTitle');

    const titles = {
        compress: 'Comprimir Imagem',
        resize: 'Redimensionar Imagem',
        crop: 'Recortar Imagem',
        'aspect-ratio': 'Ajustar Proporção',
        convert: 'Converter Formato',
        rotate: 'Rotacionar Imagem',
        watermark: 'Marca d\'Água',
        filters: 'Filtros de Imagem',
        'remove-bg': 'Remover Fundo',
        'replace-bg': 'Trocar Fundo (IA)',
        flip: 'Virar/Espelhar',
        blur: 'Desfoque',
        'blur-bg': 'Desfocar Fundo (IA)',
        temperature: 'Temperatura',
        border: 'Adicionar Borda',
        censor: 'Censura/Pixelate',
        'circle-crop': 'Recorte Circular',
        collage: 'Colagem de Imagens',
        artistic: 'Efeitos Artísticos',
        ocr: 'Extrair Texto (OCR)',
        privacy: 'Privacidade (EXIF)',
        technical: 'Ferramentas Técnicas',
        memes: 'Gerador de Memes',
        compare: 'Comparar Antes/Depois',
        palette: 'Paleta de Cores',
        draw: 'Ferramentas de Desenho',
        batch: 'Processamento em Lote',
        scanner: 'Scanner de Documentos',
        upscale: 'Aumentar Resolução',
        mockup: 'Mockup de Screenshot',
        favicon: 'Kit de Favicon & PWA',
        'img-to-pdf': 'Imagens para PDF',
        'split-grid': 'Divisor em Grade',
        'svg-raster': 'SVG para PNG / WEBP',
        'code-image': 'Código para Imagem'
    };

    title.textContent = titles[tool] || 'Ferramenta';
    modal.classList.add('active');
    document.body.classList.add('modal-open');

    const standaloneWithoutImage =
        tool === 'batch' ||
        tool === 'svg-raster' ||
        tool === 'img-to-pdf' ||
        tool === 'code-image' ||
        (tool === 'collage' && !trueOriginalImage);

    if (standaloneWithoutImage) {
        showEditor();
        buildControls();
    } else if (trueOriginalImage) {
        resetTool();
    } else {
        resetEditor();
    }
}

function closeToolModal() {
    const modal = document.getElementById('toolModal');
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');

    document.getElementById('controls').innerHTML = '';
    cropRect = null;
    currentFilter = getDefaultFilterState();

    cleanupToolState();
    setModalLayoutMode('default');
}

function resetEditor() {
    document.getElementById('uploadArea').style.display = 'block';
    document.getElementById('editorArea').style.display = 'none';
    document.getElementById('imageInput').value = '';
    document.getElementById('controls').innerHTML = '';
    originalImage = null;
    lastLoadedMetadata = null;
    cropRect = null;
    currentFilter = getDefaultFilterState();

    cleanupToolState();
    setModalLayoutMode('default');
    const modalFooter = document.getElementById('modalFooter');
    if (modalFooter) modalFooter.style.display = 'none';
}

function clampCropRect(rect, maxW, maxH) {
    let normalized = { ...rect };
    if (normalized.width < 0) {
        normalized.x += normalized.width;
        normalized.width = Math.abs(normalized.width);
    }
    if (normalized.height < 0) {
        normalized.y += normalized.height;
        normalized.height = Math.abs(normalized.height);
    }

    const x1 = Math.max(0, Math.min(maxW, normalized.x));
    const y1 = Math.max(0, Math.min(maxH, normalized.y));
    const x2 = Math.max(0, Math.min(maxW, normalized.x + normalized.width));
    const y2 = Math.max(0, Math.min(maxH, normalized.y + normalized.height));

    return {
        x: Math.round(x1),
        y: Math.round(y1),
        width: Math.max(0, Math.round(x2 - x1)),
        height: Math.max(0, Math.round(y2 - y1))
    };
}

function applyEdit() {
    if (!originalImage && currentTool !== 'collage' && currentTool !== 'svg-raster' && currentTool !== 'code-image') return;

    let dataUrl;

    if (currentTool === 'crop' && cropRect && (Math.abs(cropRect.width) > 10 || Math.abs(cropRect.height) > 10)) {
        const finalRect = clampCropRect(cropRect, originalImage.width, originalImage.height);
        if (finalRect.width < 1 || finalRect.height < 1) {
            showToast('Selecione uma área válida dentro da imagem.', 'error');
            return;
        }

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = finalRect.width;
        tempCanvas.height = finalRect.height;
        tempCtx.drawImage(
            originalImage,
            finalRect.x, finalRect.y, finalRect.width, finalRect.height,
            0, 0, finalRect.width, finalRect.height
        );
        dataUrl = tempCanvas.toDataURL();
    } else if (currentTool === 'circle-crop' && typeof renderCircleCropToCanvas === 'function') {
        const tempCanvas = renderCircleCropToCanvas();
        dataUrl = tempCanvas ? tempCanvas.toDataURL('image/png') : canvas.toDataURL();
    } else {
        dataUrl = canvas.toDataURL();
    }

    const newImg = new Image();
    newImg.onload = () => {
        trueOriginalImage = newImg;
        originalImage = newImg;

        canvas.width = newImg.width;
        canvas.height = newImg.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(newImg, 0, 0);
        cropRect = null;
        currentFilter = getDefaultFilterState();
        lastLoadedMetadata = {
            format: 'PNG',
            fileName: lastLoadedMetadata?.fileName || 'imagem-limpa.png',
            fileSize: lastLoadedMetadata?.fileSize || 0,
            width: newImg.width,
            height: newImg.height,
            hasExif: false,
            hasGps: false,
            gpsCoords: null,
            tags: [],
            chunks: [],
            cleanedByCanvas: true
        };

        buildControls({ afterApply: true });
        if (typeof saveToHistory === 'function') saveToHistory();

        const btn = document.getElementById('btnApply');
        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Salvo!';
            btn.style.background = 'var(--success-color)';

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
            }, 1500);
        }
    };
    newImg.src = dataUrl;
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        loadImage(file);
    }
}

function extractClipboardImageFile(clipboardData) {
    if (!clipboardData) return null;

    if (clipboardData.items) {
        for (const item of Array.from(clipboardData.items)) {
            if (item.type && item.type.startsWith('image/') && typeof item.getAsFile === 'function') {
                const file = item.getAsFile();
                if (file) return file;
            }
        }
    }

    if (clipboardData.files) {
        for (const file of Array.from(clipboardData.files)) {
            if (file && file.type && file.type.startsWith('image/')) {
                return file;
            }
        }
    }

    return null;
}

function handleClipboardPaste(e) {
    const file = extractClipboardImageFile(e.clipboardData);
    if (!file) return;

    e.preventDefault();

    const base64Modal = document.getElementById('base64Modal');
    if (base64Modal && base64Modal.style.display === 'flex' && typeof closeBase64Modal === 'function') {
        closeBase64Modal();
    }

    const modal = document.getElementById('toolModal');
    const modalActive = Boolean(modal && modal.classList.contains('active'));

    if (modalActive && currentTool === 'batch' && typeof handleBatchSelect === 'function') {
        const existing = typeof batchImages !== 'undefined' && Array.isArray(batchImages) ? batchImages : [];
        handleBatchSelect({ files: [...existing, file] });
        showToast('Imagem colada adicionada ao lote!', 'success');
        return;
    }

    if (modalActive && currentTool === 'collage' && typeof addCollageFiles === 'function') {
        addCollageFiles([file]);
        showToast('Imagem colada adicionada à colagem!', 'success');
        return;
    }

    if (modalActive && currentTool === 'img-to-pdf' && typeof addPdfImageFiles === 'function') {
        addPdfImageFiles([file]);
        showToast('Imagem colada adicionada ao PDF!', 'success');
        return;
    }

    if (!modalActive) {
        currentTool = currentTool || 'filters';
        openToolModal(currentTool);
    }

    loadImage(file);
    showToast('Imagem colada da área de transferência!', 'success');
}

function loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            initialLoadedImage = img;
            originalImage = img;
            trueOriginalImage = img;

            refreshLoadedMetadata(e.target.result, {
                name: file.name || 'imagem',
                size: file.size || 0,
                type: file.type || '',
                width: img.width,
                height: img.height
            });

            if (typeof resetCollage === 'function') {
                resetCollage();
            }

            displayImage(img);
            showEditor();
            if (typeof initHistory === 'function') initHistory();
            buildControls();
        };
        img.onerror = () => {
            showToast('Não foi possível abrir este arquivo de imagem.', 'error');
        };
        img.src = e.target.result;
    };
    reader.onerror = () => {
        showToast('Erro ao ler o arquivo selecionado.', 'error');
    };
    reader.readAsDataURL(file);
}

function changeImage() {
    const fileInput = document.getElementById('imageInput');
    fileInput.value = '';
    fileInput.click();
}

function displayImage(img) {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
}

function showEditor() {
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('editorArea').style.display = 'flex';
    const modalFooter = document.getElementById('modalFooter');
    if (modalFooter) modalFooter.style.display = 'flex';
    updatePreviewToolbarVisibility();
}

function buildControls(options = {}) {
    const controlsDiv = document.getElementById('controls');
    controlsDiv.innerHTML = '';

    cleanupToolState();
    cropRect = null;

    if (currentTool === 'batch') {
        setModalLayoutMode('batch');
    } else if (currentTool === 'compare') {
        setModalLayoutMode('compare');
    } else if (currentTool === 'split-grid' || currentTool === 'img-to-pdf') {
        setModalLayoutMode('export-only');
    } else if (currentTool === 'code-image') {
        setModalLayoutMode('standalone-no-upload');
    } else {
        setModalLayoutMode('default');
    }

    switch (currentTool) {
        case 'compress':
            buildCompressControls(controlsDiv);
            break;
        case 'resize':
            buildResizeControls(controlsDiv);
            break;
        case 'crop':
            buildCropControls(controlsDiv);
            break;
        case 'aspect-ratio':
            buildAspectRatioControls(controlsDiv);
            break;
        case 'convert':
            buildConvertControls(controlsDiv);
            break;
        case 'rotate':
            buildRotateControls(controlsDiv);
            break;
        case 'watermark':
            buildWatermarkControls(controlsDiv);
            break;
        case 'filters':
            buildFilterControls(controlsDiv);
            break;
        case 'remove-bg':
            buildRemoveBgControls(controlsDiv);
            break;
        case 'replace-bg':
            buildReplaceBgControls(controlsDiv);
            break;
        case 'flip':
            buildFlipControls(controlsDiv);
            break;
        case 'blur':
            buildBlurControls(controlsDiv, options);
            break;
        case 'blur-bg':
            buildBlurBgControls(controlsDiv);
            break;
        case 'temperature':
            buildTemperatureControls(controlsDiv);
            break;
        case 'border':
            buildBorderControls(controlsDiv, options);
            break;
        case 'censor':
            buildCensorControls(controlsDiv);
            break;
        case 'circle-crop':
            buildCircleCropControls(controlsDiv);
            break;
        case 'collage':
            buildCollageControls(controlsDiv);
            break;
        case 'artistic':
            buildArtisticControls(controlsDiv);
            break;
        case 'ocr':
            buildOCRControls(controlsDiv);
            break;
        case 'privacy':
            buildPrivacyControls(controlsDiv);
            break;
        case 'technical':
            buildTechnicalControls(controlsDiv);
            break;
        case 'memes':
            buildMemeControls(controlsDiv);
            break;
        case 'compare':
            buildCompareControls(controlsDiv);
            break;
        case 'palette':
            buildPaletteControls(controlsDiv);
            break;
        case 'draw':
            buildDrawControls(controlsDiv);
            break;
        case 'batch':
            buildBatchControls(controlsDiv);
            break;
        case 'scanner':
            buildScannerControls(controlsDiv);
            break;
        case 'upscale':
            buildUpscaleControls(controlsDiv);
            break;
        case 'mockup':
            buildMockupControls(controlsDiv);
            break;
        case 'favicon':
            buildFaviconControls(controlsDiv);
            break;
        case 'img-to-pdf':
            buildPdfControls(controlsDiv);
            break;
        case 'split-grid':
            buildSplitGridControls(controlsDiv);
            break;
        case 'svg-raster':
            buildSvgRasterControls(controlsDiv);
            break;
        case 'code-image':
            buildCodeImageControls(controlsDiv);
            break;
    }

    if (typeof updateHistoryButtons === 'function') updateHistoryButtons();
    setTimeout(() => initCustomSelects(), 0);
}

function buildCompressControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Formato</label>
            <select id="compressFormat">
                <option value="image/jpeg">JPEG (.jpg)</option>
                <option value="image/webp">WEBP (.webp)</option>
            </select>
        </div>
        <div class="control-group">
            <label>Qualidade: <span id="qualityValue">80</span>%</label>
            <input type="range" id="quality" min="1" max="100" value="80">
        </div>
        <div class="control-group">
            <label>Tamanho estimado: <span id="sizeEstimate">-</span></label>
        </div>
    `;

    const qualityInput = document.getElementById('quality');
    const formatSelect = document.getElementById('compressFormat');

    const updateEstimate = () => {
        const qualityVal = parseInt(qualityInput.value, 10);
        document.getElementById('qualityValue').textContent = qualityVal;
        estimateSize(qualityVal / 100, formatSelect.value);
    };

    qualityInput.addEventListener('input', updateEstimate);
    formatSelect.addEventListener('change', updateEstimate);

    estimateSize(0.8, formatSelect.value);
}

function buildResizeControls(container) {
    container.innerHTML = `
        <div class="control-row">
            <div class="control-group">
                <label>Largura (px)</label>
                <input type="number" id="resizeWidth" value="${originalImage.width}" min="1" max="8192">
            </div>
            <div class="control-group">
                <label>Altura (px)</label>
                <input type="number" id="resizeHeight" value="${originalImage.height}" min="1" max="8192">
            </div>
        </div>
        <div class="control-group">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="keepRatio" checked> Manter proporção
            </label>
        </div>
        <div class="control-group">
            <label>Atalhos rápidos</label>
            <div class="filters-grid" style="grid-template-columns: repeat(4, 1fr);">
                <button type="button" class="filter-btn" data-resize-scale="0.25">25%</button>
                <button type="button" class="filter-btn" data-resize-scale="0.5">50%</button>
                <button type="button" class="filter-btn" data-resize-scale="0.75">75%</button>
                <button type="button" class="filter-btn" data-resize-scale="1">100%</button>
            </div>
        </div>
    `;

    const widthInput = document.getElementById('resizeWidth');
    const heightInput = document.getElementById('resizeHeight');
    const keepRatio = document.getElementById('keepRatio');

    const ratio = originalImage.width / originalImage.height;

    widthInput.addEventListener('input', () => {
        const w = parseInt(widthInput.value, 10);
        if (!Number.isFinite(w) || w < 1) return;
        if (keepRatio.checked) {
            heightInput.value = Math.max(1, Math.round(w / ratio));
        }
        previewResize();
    });

    heightInput.addEventListener('input', () => {
        const h = parseInt(heightInput.value, 10);
        if (!Number.isFinite(h) || h < 1) return;
        if (keepRatio.checked) {
            widthInput.value = Math.max(1, Math.round(h * ratio));
        }
        previewResize();
    });

    keepRatio.addEventListener('change', () => {
        if (keepRatio.checked) {
            const w = parseInt(widthInput.value, 10);
            if (Number.isFinite(w) && w >= 1) {
                heightInput.value = Math.max(1, Math.round(w / ratio));
                previewResize();
            }
        }
    });

    container.querySelectorAll('[data-resize-scale]').forEach(btn => {
        btn.addEventListener('click', () => {
            const scale = parseFloat(btn.dataset.resizeScale);
            widthInput.value = Math.max(1, Math.round(originalImage.width * scale));
            heightInput.value = Math.max(1, Math.round(originalImage.height * scale));
            previewResize();
        });
    });
}

function buildCropControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <p style="opacity: 0.7; margin: 0;">Arraste para selecionar. Arraste os cantos/lados para ajustar.</p>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.5rem;">
                <span id="cropDimensions" class="crop-dimensions">Nenhuma área selecionada</span>
                <button type="button" id="btnClearCrop" class="btn-secondary" style="flex: 0 0 auto; padding: 0.45rem 0.75rem; font-size: 0.85rem;" disabled>
                    Limpar seleção
                </button>
            </div>
        </div>
    `;

    cropRect = null;
    let isDragging = false;
    let isResizing = false;
    let isMoving = false;
    let resizeHandle = null;
    let startX = 0;
    let startY = 0;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    canvas.style.cursor = 'crosshair';
    const dimsEl = document.getElementById('cropDimensions');
    const clearCropBtn = document.getElementById('btnClearCrop');
    const signal = getToolEventSignal();

    function getCanvasScale() {
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
        return { rect, scaleX, scaleY };
    }

    function updateCropUI() {
        if (!cropRect) {
            dimsEl.textContent = 'Nenhuma área selecionada';
            clearCropBtn.disabled = true;
            return;
        }
        const clamped = clampCropRect(cropRect, canvas.width, canvas.height);
        if (clamped.width <= 10 && clamped.height <= 10) {
            dimsEl.textContent = 'Arraste para definir a área';
            clearCropBtn.disabled = false;
        } else {
            dimsEl.textContent = `Seleção: ${clamped.width} × ${clamped.height} px`;
            clearCropBtn.disabled = false;
        }
    }

    clearCropBtn.addEventListener('click', () => {
        cropRect = null;
        displayImage(originalImage);
        updateCropUI();
    });

    function getHandleAtPoint(x, y) {
        if (!cropRect || (cropRect.width === 0 && cropRect.height === 0)) return null;

        const { scaleX, scaleY } = getCanvasScale();
        const handleTol = Math.max(12, 16 * Math.max(scaleX, scaleY));
        const rect = clampCropRect(cropRect, canvas.width, canvas.height);

        if (Math.abs(x - rect.x) < handleTol && Math.abs(y - rect.y) < handleTol) return 'nw';
        if (Math.abs(x - (rect.x + rect.width)) < handleTol && Math.abs(y - rect.y) < handleTol) return 'ne';
        if (Math.abs(x - rect.x) < handleTol && Math.abs(y - (rect.y + rect.height)) < handleTol) return 'sw';
        if (Math.abs(x - (rect.x + rect.width)) < handleTol && Math.abs(y - (rect.y + rect.height)) < handleTol) return 'se';

        if (Math.abs(x - rect.x) < handleTol && y >= rect.y + handleTol && y <= rect.y + rect.height - handleTol) return 'w';
        if (Math.abs(x - (rect.x + rect.width)) < handleTol && y >= rect.y + handleTol && y <= rect.y + rect.height - handleTol) return 'e';
        if (Math.abs(y - rect.y) < handleTol && x >= rect.x + handleTol && x <= rect.x + rect.width - handleTol) return 'n';
        if (Math.abs(y - (rect.y + rect.height)) < handleTol && x >= rect.x + handleTol && x <= rect.x + rect.width - handleTol) return 's';

        if (x > rect.x && x < rect.x + rect.width && y > rect.y && y < rect.y + rect.height) return 'move';

        return null;
    }

    function getPointerPos(clientX, clientY) {
        const { rect, scaleX, scaleY } = getCanvasScale();
        return {
            x: Math.max(0, Math.min(canvas.width, (clientX - rect.left) * scaleX)),
            y: Math.max(0, Math.min(canvas.height, (clientY - rect.top) * scaleY))
        };
    }

    function handleStart(clientX, clientY) {
        const pos = getPointerPos(clientX, clientY);
        startX = pos.x;
        startY = pos.y;

        const handle = getHandleAtPoint(startX, startY);

        if (handle && handle !== 'move') {
            isResizing = true;
            resizeHandle = handle;
            cropRect = clampCropRect(cropRect, canvas.width, canvas.height);
        } else if (handle === 'move') {
            isMoving = true;
            cropRect = clampCropRect(cropRect, canvas.width, canvas.height);
            dragOffsetX = startX - cropRect.x;
            dragOffsetY = startY - cropRect.y;
        } else {
            cropRect = { x: startX, y: startY, width: 0, height: 0 };
            isDragging = true;
        }
    }

    function handleMove(clientX, clientY) {
        const pos = getPointerPos(clientX, clientY);
        const currentX = pos.x;
        const currentY = pos.y;

        if (!isDragging && !isResizing && !isMoving && cropRect) {
            const handle = getHandleAtPoint(currentX, currentY);
            const cursors = {
                nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize',
                n: 'n-resize', s: 's-resize', e: 'e-resize', w: 'w-resize',
                move: 'move'
            };
            canvas.style.cursor = (handle && cursors[handle]) || 'crosshair';
            return;
        }

        if (isDragging) {
            cropRect.width = currentX - startX;
            cropRect.height = currentY - startY;
        } else if (isMoving && cropRect) {
            const maxX = Math.max(0, canvas.width - cropRect.width);
            const maxY = Math.max(0, canvas.height - cropRect.height);
            cropRect.x = Math.max(0, Math.min(maxX, currentX - dragOffsetX));
            cropRect.y = Math.max(0, Math.min(maxY, currentY - dragOffsetY));
        } else if (isResizing && cropRect) {
            const dx = currentX - startX;
            const dy = currentY - startY;

            switch (resizeHandle) {
                case 'se': cropRect.width += dx; cropRect.height += dy; break;
                case 'sw': cropRect.width -= dx; cropRect.x += dx; cropRect.height += dy; break;
                case 'ne': cropRect.width += dx; cropRect.height -= dy; cropRect.y += dy; break;
                case 'nw': cropRect.width -= dx; cropRect.x += dx; cropRect.height -= dy; cropRect.y += dy; break;
                case 'e': cropRect.width += dx; break;
                case 'w': cropRect.width -= dx; cropRect.x += dx; break;
                case 's': cropRect.height += dy; break;
                case 'n': cropRect.height -= dy; cropRect.y += dy; break;
            }

            startX = currentX;
            startY = currentY;
        } else {
            return;
        }

        displayImage(originalImage);
        drawCropRect(cropRect);
        updateCropUI();
    }

    function handleEnd() {
        if (!isDragging && !isResizing && !isMoving) return;
        isDragging = false;
        isResizing = false;
        isMoving = false;
        resizeHandle = null;

        if (cropRect) {
            cropRect = clampCropRect(cropRect, canvas.width, canvas.height);
            if (cropRect.width <= 10 && cropRect.height <= 10) {
                cropRect = null;
                displayImage(originalImage);
            } else {
                displayImage(originalImage);
                drawCropRect(cropRect);
            }
            updateCropUI();
        }
    }

    canvas.onmousedown = (e) => handleStart(e.clientX, e.clientY);
    canvas.onmousemove = (e) => handleMove(e.clientX, e.clientY);
    window.addEventListener('mousemove', (e) => {
        if (isDragging || isResizing || isMoving) {
            handleMove(e.clientX, e.clientY);
        }
    }, { signal });
    window.addEventListener('mouseup', handleEnd, { signal });

    canvas.ontouchstart = (e) => {
        if (e.touches.length > 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        handleStart(touch.clientX, touch.clientY);
    };

    canvas.ontouchmove = (e) => {
        if (e.touches.length > 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        handleMove(touch.clientX, touch.clientY);
    };

    canvas.ontouchend = (e) => {
        e.preventDefault();
        handleEnd();
    };
}

function drawCropRect(rect) {
    if (!rect) return;

    const normalized = clampCropRect(rect, canvas.width, canvas.height);
    if (normalized.width <= 0 && normalized.height <= 0) return;

    const rectBounds = canvas.getBoundingClientRect();
    const displayScale = rectBounds.width > 0 ? canvas.width / rectBounds.width : 1;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, normalized.y);
    ctx.fillRect(0, normalized.y, normalized.x, normalized.height);
    ctx.fillRect(normalized.x + normalized.width, normalized.y, canvas.width - (normalized.x + normalized.width), normalized.height);
    ctx.fillRect(0, normalized.y + normalized.height, canvas.width, canvas.height - (normalized.y + normalized.height));

    ctx.strokeStyle = '#f2511b';
    ctx.lineWidth = Math.max(1.5, 2 * displayScale);
    ctx.strokeRect(normalized.x, normalized.y, normalized.width, normalized.height);

    const handleSize = Math.max(6, 10 * displayScale);
    const half = handleSize / 2;
    ctx.fillStyle = '#f2511b';

    const points = [
        [normalized.x, normalized.y],
        [normalized.x + normalized.width, normalized.y],
        [normalized.x, normalized.y + normalized.height],
        [normalized.x + normalized.width, normalized.y + normalized.height],
        [normalized.x + normalized.width / 2, normalized.y],
        [normalized.x + normalized.width / 2, normalized.y + normalized.height],
        [normalized.x, normalized.y + normalized.height / 2],
        [normalized.x + normalized.width, normalized.y + normalized.height / 2]
    ];

    for (const [px, py] of points) {
        ctx.fillRect(px - half, py - half, handleSize, handleSize);
    }
    ctx.restore();
}

function buildConvertControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Formato de saída</label>
            <select id="outputFormat">
                <option value="image/jpeg">JPEG (.jpg)</option>
                <option value="image/png">PNG (.png)</option>
                <option value="image/webp">WEBP (.webp)</option>
            </select>
        </div>
        <div id="convertQualityGroup" class="control-group">
            <label>Qualidade: <span id="convertQualityValue">92</span>%</label>
            <input type="range" id="convertQuality" min="10" max="100" value="92">
        </div>
        <div id="convertBgGroup" class="control-group">
            <label>Fundo para transparência (JPEG)</label>
            <input type="color" id="convertBgColor" value="#ffffff">
        </div>
        <div class="control-group">
            <label>Tamanho estimado: <span id="convertSizeEstimate">-</span></label>
        </div>
    `;

    const formatSelect = document.getElementById('outputFormat');
    const qualitySlider = document.getElementById('convertQuality');
    const qualityValue = document.getElementById('convertQualityValue');
    const qualityGroup = document.getElementById('convertQualityGroup');
    const bgGroup = document.getElementById('convertBgGroup');
    const bgColorInput = document.getElementById('convertBgColor');
    const estimateEl = document.getElementById('convertSizeEstimate');

    const updateConvertPreview = () => {
        const format = formatSelect.value;
        const isPng = format === 'image/png';
        const isJpeg = format === 'image/jpeg';

        qualityGroup.style.display = isPng ? 'none' : 'flex';
        bgGroup.style.display = isJpeg ? 'flex' : 'none';
        qualityValue.textContent = qualitySlider.value;

        if (!originalImage) return;
        const offscreen = renderExportCanvas(originalImage, format, bgColorInput.value);
        offscreen.toBlob((blob) => {
            if (!blob || !estimateEl.isConnected) return;
            const kb = blob.size / 1024;
            estimateEl.textContent = kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
        }, format, parseInt(qualitySlider.value, 10) / 100);
    };

    formatSelect.addEventListener('change', updateConvertPreview);
    qualitySlider.addEventListener('input', updateConvertPreview);
    bgColorInput.addEventListener('input', updateConvertPreview);
    updateConvertPreview();
}

function buildRotateControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Ângulo de rotação</label>
            <div style="display: flex; gap: 1rem;">
                <button class="btn-secondary" onclick="rotateImage(90)" style="flex: 1;">90°</button>
                <button class="btn-secondary" onclick="rotateImage(180)" style="flex: 1;">180°</button>
                <button class="btn-secondary" onclick="rotateImage(270)" style="flex: 1;">270°</button>
            </div>
        </div >
        `;
}

function buildWatermarkControls(container) {
    const defaultSize = originalImage ? Math.max(16, Math.min(180, Math.round(originalImage.width * 0.05))) : 40;
    container.innerHTML = `
        <div class="control-group">
            <label>Texto da marca d'água</label>
            <input type="text" id="watermarkText" placeholder="© Seu nome">
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Tamanho do texto</label>
                <input type="number" id="watermarkSize" value="${defaultSize}" min="10" max="400">
            </div>
            <div class="control-group">
                <label>Posição</label>
                <select id="watermarkPosition">
                    <option value="bottom-right">Inferior direito</option>
                    <option value="bottom-left">Inferior esquerdo</option>
                    <option value="top-right">Superior direito</option>
                    <option value="top-left">Superior esquerdo</option>
                    <option value="center">Centro</option>
                </select>
            </div>
        </div>
        <div class="control-group">
            <label>Opacidade: <span id="watermarkOpacityValue">0.5</span></label>
            <input type="range" id="watermarkOpacity" min="0.1" max="1" step="0.1" value="0.5">
        </div>
    `;

    document.getElementById('watermarkText').addEventListener('input', previewWatermark);
    document.getElementById('watermarkSize').addEventListener('input', previewWatermark);
    document.getElementById('watermarkPosition').addEventListener('change', previewWatermark);
    document.getElementById('watermarkOpacity').addEventListener('input', (e) => {
        document.getElementById('watermarkOpacityValue').textContent = e.target.value;
        previewWatermark();
    });
}

function buildFilterControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Brilho: <span id="brightnessValue">100</span>%</label>
            <input type="range" id="brightness" min="0" max="200" value="100">
        </div>
        <div class="control-group">
            <label>Contraste: <span id="contrastValue">100</span>%</label>
            <input type="range" id="contrast" min="0" max="200" value="100">
        </div>
        <div class="control-group">
            <label>Saturação: <span id="saturateValue">100</span>%</label>
            <input type="range" id="saturate" min="0" max="200" value="100">
        </div>
        <div class="control-group">
            <label>Escala de cinza: <span id="grayscaleValue">0</span>%</label>
            <input type="range" id="grayscale" min="0" max="100" value="0">
        </div>
        <div class="control-group">
            <label>Sépia: <span id="sepiaValue">0</span>%</label>
            <input type="range" id="sepia" min="0" max="100" value="0">
        </div>
        <div class="control-group">
            <label>Negativo (Inverter): <span id="invertValue">0</span>%</label>
            <input type="range" id="invert" min="0" max="100" value="0">
        </div>
        <div class="control-group">
            <label>Nitidez (Sharpen): <span id="sharpenValue">0</span>%</label>
            <input type="range" id="sharpen" min="0" max="100" value="0">
        </div>
        <div class="control-group">
            <label>Vinheta: <span id="vignetteValue">0</span>%</label>
            <input type="range" id="vignette" min="0" max="100" value="0">
        </div>
    `;

    ['brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'invert', 'sharpen', 'vignette'].forEach(filter => {
        const slider = document.getElementById(filter);
        slider.addEventListener('input', (e) => {
            document.getElementById(filter + 'Value').textContent = e.target.value;
            currentFilter[filter] = Number(e.target.value);
            applyFilters();
        });
    });
}

function renderExportCanvas(sourceImg, format, bgColor = '#ffffff') {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = sourceImg.width;
    tempCanvas.height = sourceImg.height;

    if (format === 'image/jpeg') {
        tempCtx.fillStyle = bgColor || '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    }

    tempCtx.drawImage(sourceImg, 0, 0);
    return tempCanvas;
}

let compressionRequestId = 0;

function estimateSize(quality, format = 'image/jpeg') {
    if (!originalImage) return;

    const requestId = ++compressionRequestId;
    const exportCanvas = renderExportCanvas(originalImage, format, '#ffffff');

    exportCanvas.toBlob((blob) => {
        if (requestId !== compressionRequestId) return;
        if (!blob) return;

        const sizeKB = blob.size / 1024;
        const sizeLabel = sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(2)} MB` : `${sizeKB.toFixed(1)} KB`;
        const sizeEstimateEl = document.getElementById('sizeEstimate');
        if (sizeEstimateEl) {
            sizeEstimateEl.textContent = sizeLabel;
        }

        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            if (requestId !== compressionRequestId) {
                URL.revokeObjectURL(url);
                return;
            }
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
    }, format, quality);
}

function resizeImageHighQuality(sourceImg, targetW, targetH) {
    let curW = sourceImg.width;
    let curH = sourceImg.height;
    let curSource = sourceImg;

    while (curW * 0.5 > targetW && curH * 0.5 > targetH) {
        const stepW = Math.max(targetW, Math.round(curW * 0.5));
        const stepH = Math.max(targetH, Math.round(curH * 0.5));
        const stepCanvas = document.createElement('canvas');
        stepCanvas.width = stepW;
        stepCanvas.height = stepH;
        const stepCtx = stepCanvas.getContext('2d');
        stepCtx.imageSmoothingEnabled = true;
        stepCtx.imageSmoothingQuality = 'high';
        stepCtx.drawImage(curSource, 0, 0, stepW, stepH);
        curSource = stepCanvas;
        curW = stepW;
        curH = stepH;
    }

    canvas.width = targetW;
    canvas.height = targetH;
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(curSource, 0, 0, targetW, targetH);
}

function previewResize() {
    if (!originalImage) return;
    const widthVal = parseInt(document.getElementById('resizeWidth').value, 10);
    const heightVal = parseInt(document.getElementById('resizeHeight').value, 10);

    if (!Number.isFinite(widthVal) || !Number.isFinite(heightVal) || widthVal < 1 || heightVal < 1) {
        return;
    }

    const width = Math.min(8192, widthVal);
    const height = Math.min(8192, heightVal);
    resizeImageHighQuality(originalImage, width, height);
}

function rotateImage(degrees) {
    if (!originalImage) return;
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    if (degrees === 90 || degrees === 270) {
        tempCanvas.width = originalImage.height;
        tempCanvas.height = originalImage.width;
    } else {
        tempCanvas.width = originalImage.width;
        tempCanvas.height = originalImage.height;
    }

    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    tempCtx.rotate((degrees * Math.PI) / 180);
    tempCtx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2);

    const rotated = new Image();
    rotated.onload = () => {
        originalImage = rotated;
        displayImage(rotated);
        if (typeof saveToHistory === 'function') saveToHistory();
    };
    rotated.src = tempCanvas.toDataURL();
}

function previewWatermark() {
    if (!originalImage) return;
    displayImage(originalImage);

    const text = document.getElementById('watermarkText').value;
    if (!text) return;

    const rawSize = parseInt(document.getElementById('watermarkSize').value, 10);
    const size = Number.isFinite(rawSize) ? Math.max(8, Math.min(400, rawSize)) : 40;
    const position = document.getElementById('watermarkPosition').value;
    const rawOpacity = parseFloat(document.getElementById('watermarkOpacity').value);
    const opacity = Number.isFinite(rawOpacity) ? Math.max(0.05, Math.min(1, rawOpacity)) : 0.5;
    const padding = Math.max(12, Math.round(size * 0.4));

    ctx.save();
    ctx.font = `bold ${size}px Arial, sans-serif`;
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
    ctx.lineWidth = Math.max(1, Math.round(size / 18));

    const textWidth = ctx.measureText(text).width;
    let x = padding;
    let y = padding;

    switch (position) {
        case 'bottom-right':
            ctx.textBaseline = 'bottom';
            x = Math.max(padding, canvas.width - textWidth - padding);
            y = canvas.height - padding;
            break;
        case 'bottom-left':
            ctx.textBaseline = 'bottom';
            x = padding;
            y = canvas.height - padding;
            break;
        case 'top-right':
            ctx.textBaseline = 'top';
            x = Math.max(padding, canvas.width - textWidth - padding);
            y = padding;
            break;
        case 'top-left':
            ctx.textBaseline = 'top';
            x = padding;
            y = padding;
            break;
        case 'center':
            ctx.textBaseline = 'middle';
            x = (canvas.width - textWidth) / 2;
            y = canvas.height / 2;
            break;
    }

    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();
}

function applySharpenToImageData(imageData, amount) {
    const strength = Math.max(0, Math.min(1, Number(amount) / 100));
    if (strength <= 0) return imageData;

    const { width, height, data } = imageData;
    if (width < 3 || height < 3) return imageData;

    const src = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y++) {
        const rowOffset = y * width;
        for (let x = 1; x < width - 1; x++) {
            const idx = (rowOffset + x) * 4;
            const up = idx - width * 4;
            const down = idx + width * 4;
            const left = idx - 4;
            const right = idx + 4;

            for (let c = 0; c < 3; c++) {
                const sharp = 5 * src[idx + c] - src[up + c] - src[down + c] - src[left + c] - src[right + c];
                data[idx + c] = Math.round(src[idx + c] + (sharp - src[idx + c]) * strength);
            }
        }
    }
    return imageData;
}

function applyVignetteOverlay(targetCtx, width, height, amount) {
    const strength = Math.max(0, Math.min(1, Number(amount) / 100));
    if (strength <= 0 || !targetCtx) return;

    const cx = width / 2;
    const cy = height / 2;
    const outerRadius = Math.hypot(cx, cy);
    const innerRadius = Math.min(width, height) * 0.28;

    targetCtx.save();
    const grad = targetCtx.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, `rgba(0, 0, 0, ${(strength * 0.85).toFixed(3)})`);
    targetCtx.fillStyle = grad;
    targetCtx.fillRect(0, 0, width, height);
    targetCtx.restore();
}

function applyFilters() {
    if (!originalImage) return;

    const filters = [
        `brightness(${currentFilter.brightness}%)`,
        `contrast(${currentFilter.contrast}%)`,
        `saturate(${currentFilter.saturate}%)`,
        `grayscale(${currentFilter.grayscale}%)`,
        `sepia(${currentFilter.sepia}%)`,
        `invert(${currentFilter.invert}%)`
    ].join(' ');

    canvas.width = originalImage.width;
    canvas.height = originalImage.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = filters;
    ctx.drawImage(originalImage, 0, 0);
    ctx.filter = 'none';

    if (Number(currentFilter.sharpen) > 0) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applySharpenToImageData(imgData, currentFilter.sharpen);
        ctx.putImageData(imgData, 0, 0);
    }

    if (Number(currentFilter.vignette) > 0) {
        applyVignetteOverlay(ctx, canvas.width, canvas.height, currentFilter.vignette);
    }
}

function resetTool() {
    cleanupToolState();
    cropRect = null;

    currentFilter = getDefaultFilterState();

    if (trueOriginalImage) {
        originalImage = trueOriginalImage;
        canvas.width = trueOriginalImage.width;
        canvas.height = trueOriginalImage.height;
        ctx.filter = 'none';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(trueOriginalImage, 0, 0);
    }

    buildControls();
}

function getOutputFilename(tool, format) {
    const ext = (format && format.includes('/')) ? format.split('/')[1].replace('jpeg', 'jpg') : 'png';
    const names = {
        compress: `imagem-comprimida.${ext}`,
        resize: 'imagem-redimensionada.png',
        crop: 'imagem-recortada.png',
        'aspect-ratio': 'imagem-proporcao.png',
        convert: `imagem-convertida.${ext}`,
        rotate: 'imagem-rotacionada.png',
        watermark: 'imagem-marca-dagua.png',
        filters: 'imagem-filtrada.png',
        'remove-bg': 'imagem-sem-fundo.png',
        'replace-bg': 'imagem-fundo-trocado.png',
        flip: 'imagem-espelhada.png',
        blur: 'imagem-desfocada.png',
        'blur-bg': 'imagem-fundo-desfocado.png',
        temperature: 'imagem-temperatura.png',
        border: 'imagem-com-borda.png',
        censor: 'imagem-censurada.png',
        'circle-crop': 'avatar-circular.png',
        collage: 'minha-colagem.png',
        artistic: 'imagem-artistica.png',
        ocr: 'imagem-com-texto-detectado.png',
        privacy: 'imagem-sem-exif.png',
        technical: 'imagem-dev-tools.png',
        memes: 'meu-meme.png',
        compare: 'imagem-editada.png',
        palette: 'imagem-paleta.png',
        draw: 'imagem-desenhada.png',
        scanner: 'documento-escaneado.png',
        upscale: 'imagem-upscale.png',
        mockup: 'mockup-screenshot.png',
        favicon: 'favicon-512x512.png',
        'img-to-pdf': 'imagens-convertidas.pdf',
        'split-grid': 'grade-recortada.zip',
        'svg-raster': `vetor-rasterizado.${ext}`,
        'code-image': 'codigo-snippet.png'
    };
    return names[tool] || `imagem.${ext}`;
}

function triggerBlobDownload(blob, filename) {
    if (!blob) {
        showToast('Não foi possível gerar o arquivo para download.', 'error');
        return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadImage(customName, customFormat) {
    let format = customFormat || 'image/png';
    let quality = 0.92;
    let exportCanvas = canvas;

    if (currentTool === 'crop' && cropRect && (Math.abs(cropRect.width) > 10 || Math.abs(cropRect.height) > 10)) {
        const finalRect = clampCropRect(cropRect, originalImage.width, originalImage.height);
        if (finalRect.width < 1 || finalRect.height < 1) {
            showToast('Selecione uma área válida dentro da imagem.', 'error');
            return;
        }

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = finalRect.width;
        tempCanvas.height = finalRect.height;

        tempCtx.drawImage(
            originalImage,
            finalRect.x, finalRect.y, finalRect.width, finalRect.height,
            0, 0, finalRect.width, finalRect.height
        );

        const filename = customName || getOutputFilename('crop', format);
        tempCanvas.toBlob((blob) => triggerBlobDownload(blob, filename), format, quality);
        return;
    }

    if (currentTool === 'circle-crop' && typeof renderCircleCropToCanvas === 'function') {
        const circleCanvas = renderCircleCropToCanvas();
        if (circleCanvas) {
            const filename = customName || getOutputFilename('circle-crop', 'image/png');
            circleCanvas.toBlob((blob) => triggerBlobDownload(blob, filename), 'image/png', 1);
            return;
        }
    }

    if (currentTool === 'split-grid' && typeof downloadSplitGridZip === 'function') {
        downloadSplitGridZip();
        return;
    }

    if (currentTool === 'img-to-pdf' && typeof generatePdfFromImages === 'function') {
        generatePdfFromImages();
        return;
    }

    if (currentTool === 'compress') {
        const qualityEl = document.getElementById('quality');
        const formatEl = document.getElementById('compressFormat');
        quality = qualityEl ? parseInt(qualityEl.value, 10) / 100 : 0.8;
        format = customFormat || (formatEl ? formatEl.value : 'image/jpeg');
        if (originalImage) {
            exportCanvas = renderExportCanvas(originalImage, format, '#ffffff');
        }
    } else if (currentTool === 'convert') {
        const formatEl = document.getElementById('outputFormat');
        const qualityEl = document.getElementById('convertQuality');
        const bgEl = document.getElementById('convertBgColor');
        format = customFormat || (formatEl ? formatEl.value : 'image/png');
        quality = qualityEl ? parseInt(qualityEl.value, 10) / 100 : 0.92;
        if (originalImage) {
            exportCanvas = renderExportCanvas(originalImage, format, bgEl ? bgEl.value : '#ffffff');
        }
    } else if (currentTool === 'svg-raster') {
        const formatEl = document.getElementById('svgFormat');
        format = customFormat || (formatEl ? formatEl.value : 'image/png');
        quality = 0.95;
    } else if (currentTool === 'compare' && trueOriginalImage) {
        exportCanvas = renderExportCanvas(trueOriginalImage, format);
    } else if (currentTool === 'remove-bg') {
        format = customFormat || 'image/png';
    }

    const filename = customName || getOutputFilename(currentTool, format);
    exportCanvas.toBlob((blob) => triggerBlobDownload(blob, filename), format, quality);
}

let customSelectDocListenerAttached = false;
let customSelectIdCounter = 0;

function closeAllCustomSelects(exceptContainer = null) {
    document.querySelectorAll('.custom-select-container.active').forEach(activeContainer => {
        if (activeContainer === exceptContainer) return;
        activeContainer.classList.remove('active');
        const activeTrigger = activeContainer.querySelector('.select-trigger');
        if (activeTrigger) activeTrigger.setAttribute('aria-expanded', 'false');
    });
}

function setCustomSelectOpen(container, trigger, optionsContainer, isOpen) {
    container.classList.toggle('active', isOpen);
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    if (!isOpen) {
        trigger.removeAttribute('aria-activedescendant');
        return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const optionsHeight = 250;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    if (spaceBelow < optionsHeight + 20 && spaceAbove > optionsHeight) {
        optionsContainer.style.top = 'auto';
        optionsContainer.style.bottom = '100%';
        optionsContainer.style.marginTop = '0';
        optionsContainer.style.marginBottom = '0.5rem';
    } else {
        optionsContainer.style.top = '100%';
        optionsContainer.style.bottom = 'auto';
        optionsContainer.style.marginTop = '0.5rem';
        optionsContainer.style.marginBottom = '0';
    }
}

function selectCustomOption(select, triggerText, optionEls, index) {
    const chosen = select.options[index];
    if (!chosen) return;

    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
    triggerText.textContent = chosen.text;

    optionEls.forEach((opt, optIdx) => {
        const isSelected = optIdx === index;
        opt.classList.toggle('selected', isSelected);
        opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
}

function initCustomSelects() {
    if (!customSelectDocListenerAttached) {
        document.addEventListener('click', () => closeAllCustomSelects());
        customSelectDocListenerAttached = true;
    }

    document.querySelectorAll('select').forEach(select => {
        if (select.parentElement.classList.contains('custom-select-container')) return;
        if (!select.options || select.options.length === 0) return;

        const selectIdx = ++customSelectIdCounter;
        const listboxId = `custom-select-listbox-${selectIdx}`;

        const container = document.createElement('div');
        container.className = 'custom-select-container';

        const trigger = document.createElement('div');
        trigger.className = 'select-trigger';
        trigger.setAttribute('tabindex', '0');
        trigger.setAttribute('role', 'combobox');
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-controls', listboxId);

        const groupLabel = select.closest('.control-group')?.querySelector('label');
        if (groupLabel) {
            if (!groupLabel.id) groupLabel.id = `custom-select-label-${selectIdx}`;
            trigger.setAttribute('aria-labelledby', groupLabel.id);
        }

        const initialIdx = Math.max(0, select.selectedIndex);
        const triggerText = document.createElement('span');
        triggerText.textContent = select.options[initialIdx].text;

        const arrow = document.createElement('svg');
        arrow.className = 'select-arrow';
        arrow.setAttribute('width', '12');
        arrow.setAttribute('height', '12');
        arrow.setAttribute('viewBox', '0 0 12 12');
        arrow.setAttribute('fill', 'currentColor');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.innerHTML = '<path d="M6 9L1 4h10z"/>';

        trigger.appendChild(triggerText);
        trigger.appendChild(arrow);

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'select-options';
        optionsContainer.id = listboxId;
        optionsContainer.setAttribute('role', 'listbox');

        const optionEls = [];
        let focusedIndex = initialIdx;

        const setFocusedOption = (nextIdx) => {
            focusedIndex = Math.max(0, Math.min(optionEls.length - 1, nextIdx));
            optionEls.forEach((opt, i) => opt.classList.toggle('focused', i === focusedIndex));
            const activeOpt = optionEls[focusedIndex];
            if (activeOpt) {
                trigger.setAttribute('aria-activedescendant', activeOpt.id);
                if (typeof activeOpt.scrollIntoView === 'function') {
                    activeOpt.scrollIntoView({ block: 'nearest' });
                }
            }
        };

        Array.from(select.options).forEach((option, index) => {
            const customOption = document.createElement('div');
            customOption.className = 'custom-option';
            customOption.id = `${listboxId}-opt-${index}`;
            customOption.setAttribute('role', 'option');
            customOption.setAttribute('aria-selected', index === initialIdx ? 'true' : 'false');
            if (index === initialIdx) {
                customOption.classList.add('selected');
            }
            customOption.textContent = option.text;
            customOption.dataset.value = option.value;

            customOption.addEventListener('click', () => {
                selectCustomOption(select, triggerText, optionEls, index);
                focusedIndex = index;
                setCustomSelectOpen(container, trigger, optionsContainer, false);
                trigger.focus();
            });

            optionEls.push(customOption);
            optionsContainer.appendChild(customOption);
        });

        container.appendChild(trigger);
        container.appendChild(optionsContainer);

        select.style.display = 'none';
        select.parentElement.insertBefore(container, select);
        container.appendChild(select);

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllCustomSelects(container);
            const willOpen = !container.classList.contains('active');
            setCustomSelectOpen(container, trigger, optionsContainer, willOpen);
            if (willOpen) {
                setFocusedOption(Math.max(0, select.selectedIndex));
            }
        });

        trigger.addEventListener('keydown', (e) => {
            const isOpen = container.classList.contains('active');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!isOpen) {
                    closeAllCustomSelects(container);
                    setCustomSelectOpen(container, trigger, optionsContainer, true);
                    setFocusedOption(Math.max(0, select.selectedIndex));
                } else {
                    setFocusedOption(focusedIndex + 1);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (!isOpen) {
                    closeAllCustomSelects(container);
                    setCustomSelectOpen(container, trigger, optionsContainer, true);
                    setFocusedOption(Math.max(0, select.selectedIndex));
                } else {
                    setFocusedOption(focusedIndex - 1);
                }
            } else if (e.key === 'Home' && isOpen) {
                e.preventDefault();
                setFocusedOption(0);
            } else if (e.key === 'End' && isOpen) {
                e.preventDefault();
                setFocusedOption(optionEls.length - 1);
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (isOpen) {
                    selectCustomOption(select, triggerText, optionEls, focusedIndex);
                    setCustomSelectOpen(container, trigger, optionsContainer, false);
                } else {
                    closeAllCustomSelects(container);
                    setCustomSelectOpen(container, trigger, optionsContainer, true);
                    setFocusedOption(Math.max(0, select.selectedIndex));
                }
            } else if (e.key === 'Escape' && isOpen) {
                e.preventDefault();
                e.stopPropagation();
                setCustomSelectOpen(container, trigger, optionsContainer, false);
            }
        });
    });
}


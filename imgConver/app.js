let currentTool = null;
let originalImage = null;
let trueOriginalImage = null;
let canvas = null;
let ctx = null;
let currentFilter = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    grayscale: 0,
    sepia: 0
};
let cropRect = null;

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
        upscale: 'Aumentar Resolução'
    };

    title.textContent = titles[tool] || 'Ferramenta';
    modal.classList.add('active');
    document.body.classList.add('modal-open');

    if (trueOriginalImage) {
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
    currentFilter = {
        brightness: 100,
        contrast: 100,
        saturate: 100,
        grayscale: 0,
        sepia: 0
    };

    if (typeof cleanupPhase2Tools === 'function') cleanupPhase2Tools();
    if (typeof cleanupPhase4Tools === 'function') cleanupPhase4Tools();
}

function resetEditor() {
    document.getElementById('uploadArea').style.display = 'block';
    document.getElementById('editorArea').style.display = 'none';
    const modalFooter = document.getElementById('modalFooter');
    if (modalFooter) modalFooter.style.display = 'none';
    document.getElementById('imageInput').value = '';
    document.getElementById('controls').innerHTML = '';
    originalImage = null;
    cropRect = null;
    currentFilter = {
        brightness: 100,
        contrast: 100,
        saturate: 100,
        grayscale: 0,
        sepia: 0
    };

    if (typeof cleanupPhase2Tools === 'function') {
        cleanupPhase2Tools();
    }
    if (typeof cleanupPhase4Tools === 'function') {
        cleanupPhase4Tools();
    }
}

function applyEdit() {
    let dataUrl;

    if (currentTool === 'crop' && cropRect && (Math.abs(cropRect.width) > 10 || Math.abs(cropRect.height) > 10)) {
        let finalRect = { ...cropRect };
        if (finalRect.width < 0) {
            finalRect.x += finalRect.width;
            finalRect.width = Math.abs(finalRect.width);
        }
        if (finalRect.height < 0) {
            finalRect.y += finalRect.height;
            finalRect.height = Math.abs(finalRect.height);
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
    } else {
        dataUrl = canvas.toDataURL();
    }

    const newImg = new Image();
    newImg.onload = () => {
        trueOriginalImage = newImg;
        originalImage = newImg;

        canvas.width = newImg.width;
        canvas.height = newImg.height;
        ctx.drawImage(newImg, 0, 0);
        cropRect = null;

        const btn = document.getElementById('btnApply');
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Salvo!';
        btn.style.background = 'var(--success-color)';

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
        }, 1500);
    };
    newImg.src = dataUrl;
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        loadImage(file);
    }
}

function loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            trueOriginalImage = img;

            if (typeof resetCollage === 'function') {
                resetCollage();
            }

            displayImage(img);
            showEditor();
            buildControls();
        };
        img.src = e.target.result;
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
}

function buildControls() {
    const controlsDiv = document.getElementById('controls');
    controlsDiv.innerHTML = '';

    canvas.onmousedown = null;
    canvas.onmousemove = null;
    canvas.onmouseup = null;
    canvas.ontouchstart = null;
    canvas.ontouchmove = null;
    canvas.ontouchend = null;
    canvas.style.cursor = 'default';

    canvas.style.width = '';
    canvas.style.maxWidth = '';

    cropRect = null;

    toolEntrySnapshot = canvas.toDataURL();
    compareMode = false;
    const btnCompare = document.getElementById('btnCompare');
    if (btnCompare) btnCompare.innerHTML = '👁️ Ver Original';

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
            buildBlurControls(controlsDiv);
            break;
        case 'blur-bg':
            buildBlurBgControls(controlsDiv);
            break;
        case 'temperature':
            buildTemperatureControls(controlsDiv);
            break;
        case 'border':
            buildBorderControls(controlsDiv);
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
        case 'palette':
            buildPaletteControls(controlsDiv);
            break;
        case 'draw':
            buildDrawControls(controlsDiv);
            break;
        case 'scanner':
            buildScannerControls(controlsDiv);
            break;
        case 'upscale':
            buildUpscaleControls(controlsDiv);
            break;
    }

    setTimeout(() => initCustomSelects(), 0);
}

function buildCompressControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Qualidade: <span id="qualityValue">80</span>%</label>
            <input type="range" id="quality" min="1" max="100" value="80">
        </div>
        <div class="control-group">
            <label>Tamanho estimado: <span id="sizeEstimate">-</span></label>
        </div>
    `;

    document.getElementById('quality').addEventListener('input', (e) => {
        document.getElementById('qualityValue').textContent = e.target.value;
        estimateSize(e.target.value / 100);
    });

    estimateSize(0.8);
}

function buildResizeControls(container) {
    container.innerHTML = `
        <div class="control-row">
            <div class="control-group">
                <label>Largura (px)</label>
                <input type="number" id="resizeWidth" value="${originalImage.width}" min="1">
            </div>
            <div class="control-group">
                <label>Altura (px)</label>
                <input type="number" id="resizeHeight" value="${originalImage.height}" min="1">
            </div>
        </div>
        <div class="control-group">
            <label>
                <input type="checkbox" id="keepRatio" checked> Manter proporção
            </label>
        </div>
    `;

    const widthInput = document.getElementById('resizeWidth');
    const heightInput = document.getElementById('resizeHeight');
    const keepRatio = document.getElementById('keepRatio');

    const ratio = originalImage.width / originalImage.height;

    widthInput.addEventListener('input', () => {
        if (keepRatio.checked) {
            heightInput.value = Math.round(widthInput.value / ratio);
        }
        previewResize();
    });

    heightInput.addEventListener('input', () => {
        if (keepRatio.checked) {
            widthInput.value = Math.round(heightInput.value * ratio);
        }
        previewResize();
    });
}

function buildCropControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <p style="opacity: 0.7; margin: 0;">Arraste para selecionar. Arraste os cantos/lados para ajustar.</p>
        </div>

    `;



    cropRect = null;
    let tempRect = { x: 0, y: 0, width: 0, height: 0 };
    let isDragging = false;
    let isResizing = false;
    let isMoving = false;
    let resizeHandle = null;
    let startX, startY;
    let dragOffsetX = 0, dragOffsetY = 0;

    canvas.style.cursor = 'crosshair';

    function getHandleAtPoint(x, y) {
        if (!cropRect || cropRect.width === 0) return null;

        const handleSize = 15;
        let rect = normalizeCropRect(cropRect);

        if (Math.abs(x - rect.x) < handleSize && Math.abs(y - rect.y) < handleSize) return 'nw';
        if (Math.abs(x - (rect.x + rect.width)) < handleSize && Math.abs(y - rect.y) < handleSize) return 'ne';
        if (Math.abs(x - rect.x) < handleSize && Math.abs(y - (rect.y + rect.height)) < handleSize) return 'sw';
        if (Math.abs(x - (rect.x + rect.width)) < handleSize && Math.abs(y - (rect.y + rect.height)) < handleSize) return 'se';

        if (Math.abs(x - rect.x) < handleSize && y > rect.y + handleSize && y < rect.y + rect.height - handleSize) return 'w';
        if (Math.abs(x - (rect.x + rect.width)) < handleSize && y > rect.y + handleSize && y < rect.y + rect.height - handleSize) return 'e';
        if (Math.abs(y - rect.y) < handleSize && x > rect.x + handleSize && x < rect.x + rect.width - handleSize) return 'n';
        if (Math.abs(y - (rect.y + rect.height)) < handleSize && x > rect.x + handleSize && x < rect.x + rect.width - handleSize) return 's';

        if (x > rect.x && x < rect.x + rect.width && y > rect.y && y < rect.y + rect.height) return 'move';

        return null;
    }

    function normalizeCropRect(rect) {
        let normalized = { ...rect };
        if (normalized.width < 0) {
            normalized.x += normalized.width;
            normalized.width = Math.abs(normalized.width);
        }
        if (normalized.height < 0) {
            normalized.y += normalized.height;
            normalized.height = Math.abs(normalized.height);
        }
        return normalized;
    }

    canvas.onmousedown = (e) => {
        const rect = canvas.getBoundingClientRect();
        startX = (e.clientX - rect.left) * (canvas.width / rect.width);
        startY = (e.clientY - rect.top) * (canvas.height / rect.height);

        const handle = getHandleAtPoint(startX, startY);

        if (handle && handle !== 'move') {
            isResizing = true;
            resizeHandle = handle;
            cropRect = normalizeCropRect(cropRect);
        } else if (handle === 'move') {
            isMoving = true;
            cropRect = normalizeCropRect(cropRect);
            dragOffsetX = startX - cropRect.x;
            dragOffsetY = startY - cropRect.y;
        } else {
            cropRect = { x: startX, y: startY, width: 0, height: 0 };
            tempRect = { ...cropRect };
            isDragging = true;
        }
    };

    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const currentX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const currentY = (e.clientY - rect.top) * (canvas.height / rect.height);

        if (!isDragging && !isResizing && !isMoving && cropRect) {
            const handle = getHandleAtPoint(currentX, currentY);
            if (handle) {
                const cursors = {
                    'nw': 'nw-resize', 'ne': 'ne-resize', 'sw': 'sw-resize', 'se': 'se-resize',
                    'n': 'n-resize', 's': 's-resize', 'e': 'e-resize', 'w': 'w-resize',
                    'move': 'move'
                };
                canvas.style.cursor = cursors[handle] || 'crosshair';
            } else {
                canvas.style.cursor = 'crosshair';
            }
        }

        if (isDragging) {
            cropRect.width = currentX - startX;
            cropRect.height = currentY - startY;
            displayImage(originalImage);
            drawCropRect(cropRect);
        } else if (isMoving && cropRect) {
            cropRect.x = currentX - dragOffsetX;
            cropRect.y = currentY - dragOffsetY;
            displayImage(originalImage);
            drawCropRect(cropRect);
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

            displayImage(originalImage);
            drawCropRect(cropRect);
        }
    };

    canvas.onmouseup = () => {
        isDragging = false;
        isResizing = false;
        isMoving = false;
        resizeHandle = null;
    };

    // Touch support
    canvas.ontouchstart = (e) => {
        if (e.touches.length > 1) return; // Ignore multi-touch
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        startX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        startY = (touch.clientY - rect.top) * (canvas.height / rect.height);

        const handle = getHandleAtPoint(startX, startY);

        if (handle && handle !== 'move') {
            isResizing = true;
            resizeHandle = handle;
            cropRect = normalizeCropRect(cropRect);
        } else if (handle === 'move') {
            isMoving = true;
            cropRect = normalizeCropRect(cropRect);
            dragOffsetX = startX - cropRect.x;
            dragOffsetY = startY - cropRect.y;
        } else {
            cropRect = { x: startX, y: startY, width: 0, height: 0 };
            tempRect = { ...cropRect };
            isDragging = true;
        }
    };

    canvas.ontouchmove = (e) => {
        if (e.touches.length > 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const currentX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const currentY = (touch.clientY - rect.top) * (canvas.height / rect.height);

        if (isDragging) {
            cropRect.width = currentX - startX;
            cropRect.height = currentY - startY;
            displayImage(originalImage);
            drawCropRect(cropRect);
        } else if (isMoving && cropRect) {
            cropRect.x = currentX - dragOffsetX;
            cropRect.y = currentY - dragOffsetY;
            displayImage(originalImage);
            drawCropRect(cropRect);
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

            displayImage(originalImage);
            drawCropRect(cropRect);
        }
    };

    canvas.ontouchend = (e) => {
        e.preventDefault();
        isDragging = false;
        isResizing = false;
        isMoving = false;
        resizeHandle = null;
    };
}

function drawCropRect(rect) {
    if (!rect) return;

    let normalized = { ...rect };
    if (normalized.width < 0) {
        normalized.x += normalized.width;
        normalized.width = Math.abs(normalized.width);
    }
    if (normalized.height < 0) {
        normalized.y += normalized.height;
        normalized.height = Math.abs(normalized.height);
    }

    ctx.strokeStyle = '#f2511b';
    ctx.lineWidth = 2;
    ctx.strokeRect(normalized.x, normalized.y, normalized.width, normalized.height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, normalized.y);
    ctx.fillRect(0, normalized.y, normalized.x, normalized.height);
    ctx.fillRect(normalized.x + normalized.width, normalized.y, canvas.width - (normalized.x + normalized.width), normalized.height);
    ctx.fillRect(0, normalized.y + normalized.height, canvas.width, canvas.height - (normalized.y + normalized.height));

    const handleSize = 8;
    ctx.fillStyle = '#f2511b';
    ctx.fillRect(normalized.x - handleSize / 2, normalized.y - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(normalized.x + normalized.width - handleSize / 2, normalized.y - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(normalized.x - handleSize / 2, normalized.y + normalized.height - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(normalized.x + normalized.width - handleSize / 2, normalized.y + normalized.height - handleSize / 2, handleSize, handleSize);

    ctx.fillRect(normalized.x + normalized.width / 2 - handleSize / 2, normalized.y - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(normalized.x + normalized.width / 2 - handleSize / 2, normalized.y + normalized.height - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(normalized.x - handleSize / 2, normalized.y + normalized.height / 2 - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(normalized.x + normalized.width - handleSize / 2, normalized.y + normalized.height / 2 - handleSize / 2, handleSize, handleSize);
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
        </div >
        `;
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
    container.innerHTML = `
        <div class="control-group">
            <label>Texto da marca d'água</label>
            <input type="text" id="watermarkText" placeholder="© Seu nome">
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Tamanho do texto</label>
                <input type="number" id="watermarkSize" value="40" min="10" max="200">
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
    `;

    ['brightness', 'contrast', 'saturate', 'grayscale', 'sepia'].forEach(filter => {
        const slider = document.getElementById(filter);
        slider.addEventListener('input', (e) => {
            document.getElementById(filter + 'Value').textContent = e.target.value;
            currentFilter[filter] = e.target.value;
            applyFilters();
        });
    });
}

let compressionRequestId = 0;

function estimateSize(quality) {
    if (!originalImage) return;

    const requestId = ++compressionRequestId;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
        if (requestId !== compressionRequestId) return;

        if (!blob) return;
        const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
        const sizeEstimateEl = document.getElementById('sizeEstimate');
        if (sizeEstimateEl) {
            sizeEstimateEl.textContent = `${sizeMB} MB`;
        }

        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            if (requestId !== compressionRequestId) {
                URL.revokeObjectURL(url);
                return;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }, 'image/jpeg', quality);
}

function previewResize() {
    const width = parseInt(document.getElementById('resizeWidth').value);
    const height = parseInt(document.getElementById('resizeHeight').value);

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(originalImage, 0, 0, width, height);
}

function rotateImage(degrees) {
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
    };
    rotated.src = tempCanvas.toDataURL();
}

function previewWatermark() {
    displayImage(originalImage);

    const text = document.getElementById('watermarkText').value;
    if (!text) return;

    const size = parseInt(document.getElementById('watermarkSize').value);
    const position = document.getElementById('watermarkPosition').value;
    const opacity = parseFloat(document.getElementById('watermarkOpacity').value);

    ctx.font = `bold ${size}px Arial`;
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
    ctx.lineWidth = 2;

    const textWidth = ctx.measureText(text).width;
    let x, y;

    switch (position) {
        case 'bottom-right':
            x = canvas.width - textWidth - 20;
            y = canvas.height - 20;
            break;
        case 'bottom-left':
            x = 20;
            y = canvas.height - 20;
            break;
        case 'top-right':
            x = canvas.width - textWidth - 20;
            y = size + 20;
            break;
        case 'top-left':
            x = 20;
            y = size + 20;
            break;
        case 'center':
            x = (canvas.width - textWidth) / 2;
            y = canvas.height / 2;
            break;
    }

    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
}

function applyFilters() {
    displayImage(originalImage);

    const filters = `
    brightness(${currentFilter.brightness}%)
    contrast(${currentFilter.contrast}%)
    saturate(${currentFilter.saturate}%)
    grayscale(${currentFilter.grayscale}%)
    sepia(${currentFilter.sepia}%)
    `;

    ctx.filter = filters;
    ctx.drawImage(originalImage, 0, 0);
    ctx.filter = 'none';
}

function resetTool() {
    canvas.onmousedown = null;
    canvas.onmousemove = null;
    canvas.onmouseup = null;
    canvas.style.cursor = 'default';
    cropRect = null;

    currentFilter = {
        brightness: 100,
        contrast: 100,
        saturate: 100,
        grayscale: 0,
        sepia: 0
    };

    originalImage = trueOriginalImage;

    canvas.width = trueOriginalImage.width;
    canvas.height = trueOriginalImage.height;
    ctx.filter = 'none';
    ctx.drawImage(trueOriginalImage, 0, 0);

    buildControls();
}

function downloadImage(customName, customFormat) {
    let format = customFormat || 'image/png';
    let quality = 0.92;
    let filename = customName || 'imagem';

    if (currentTool === 'crop' && cropRect && (Math.abs(cropRect.width) > 10 || Math.abs(cropRect.height) > 10)) {
        let finalRect = { ...cropRect };
        if (finalRect.width < 0) {
            finalRect.x += finalRect.width;
            finalRect.width = Math.abs(finalRect.width);
        }
        if (finalRect.height < 0) {
            finalRect.y += finalRect.height;
            finalRect.height = Math.abs(finalRect.height);
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

        filename = 'imagem-recortada.png';

        tempCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, format, quality);
        return;
    }

    switch (currentTool) {
        case 'compress':
            quality = parseInt(document.getElementById('quality').value) / 100;
            format = 'image/jpeg';
            filename = 'imagem-comprimida.jpg';
            break;
        case 'resize':
            filename = 'imagem-redimensionada.png';
            break;
        case 'convert':
            format = document.getElementById('outputFormat').value;
            const ext = format.split('/')[1];
            filename = `imagem - convertida.${ext} `;
            break;
        case 'rotate':
            filename = 'imagem-rotacionada.png';
            break;
        case 'watermark':
            filename = 'imagem-marca-dagua.png';
            break;
        case 'filters':
            filename = 'imagem-filtrada.png';
            break;
        case 'remove-bg':
            filename = 'imagem-sem-fundo.png';
            format = 'image/png';
            break;
        case 'flip':
            filename = 'imagem-espelhada.png';
            break;
        case 'blur':
            filename = 'imagem-desfocada.png';
            break;
        case 'temperature':
            filename = 'imagem-temperatura.png';
            break;
        case 'border':
            filename = 'imagem-com-borda.png';
            break;
        case 'censor':
            filename = 'imagem-censurada.png';
            break;
        case 'circle-crop':
            filename = 'avatar-circular.png';
            format = 'image/png';
            break;
        case 'collage':
            filename = 'minha-colagem.png';
            break;
        case 'artistic':
            filename = 'imagem-artistica.png';
            break;
        case 'ocr':
            filename = 'imagem-com-texto-detectado.png';
            break;
        case 'privacy':
            filename = 'imagem-sem-exif.png';
            break;
        case 'technical':
            filename = 'imagem-dev-tools.png';
            break;
        case 'memes':
            filename = 'meu-meme.png';
            break;
    }

    if (customName) filename = customName;
    if (customFormat) format = customFormat;

    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, format, quality);
}

function initCustomSelects() {
    document.querySelectorAll('select').forEach(select => {
        if (select.parentElement.classList.contains('custom-select-container')) return;

        const container = document.createElement('div');
        container.className = 'custom-select-container';

        const trigger = document.createElement('div');
        trigger.className = 'select-trigger';
        trigger.setAttribute('tabindex', '0');

        const triggerText = document.createElement('span');
        triggerText.textContent = select.options[select.selectedIndex].text;

        const arrow = document.createElement('svg');
        arrow.className = 'select-arrow';
        arrow.setAttribute('width', '12');
        arrow.setAttribute('height', '12');
        arrow.setAttribute('viewBox', '0 0 12 12');
        arrow.setAttribute('fill', 'currentColor');
        arrow.innerHTML = '<path d="M6 9L1 4h10z"/>';

        trigger.appendChild(triggerText);
        trigger.appendChild(arrow);

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'select-options';

        Array.from(select.options).forEach((option, index) => {
            const customOption = document.createElement('div');
            customOption.className = 'custom-option';
            if (index === select.selectedIndex) {
                customOption.classList.add('selected');
            }
            customOption.textContent = option.text;
            customOption.dataset.value = option.value;

            customOption.addEventListener('click', () => {
                select.selectedIndex = index;
                select.dispatchEvent(new Event('change'));
                triggerText.textContent = option.text;

                optionsContainer.querySelectorAll('.custom-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                customOption.classList.add('selected');

                container.classList.remove('active');
            });

            optionsContainer.appendChild(customOption);
        });

        container.appendChild(trigger);
        container.appendChild(optionsContainer);

        select.style.display = 'none';
        select.parentElement.insertBefore(container, select);
        container.appendChild(select);

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-container.active').forEach(other => {
                if (other !== container) other.classList.remove('active');
            });

            const wasActive = container.classList.contains('active');
            container.classList.toggle('active');

            if (!wasActive && container.classList.contains('active')) {
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
        });

        document.addEventListener('click', () => {
            container.classList.remove('active');
        });

        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                container.classList.toggle('active');
            }
        });
    });
}


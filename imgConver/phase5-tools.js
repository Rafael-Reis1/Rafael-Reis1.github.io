function cleanupPhase5Tools() {
    isDrawing = false;
    scannerManualMode = false;
    draggingCornerIndex = -1;
}

function buildCompareControls(container) {
    const hasEdits = Boolean(initialLoadedImage && trueOriginalImage && initialLoadedImage !== trueOriginalImage);

    container.innerHTML = `
        <div class="control-group">
            <p style="margin-bottom: 0.75rem;">Arraste o slider para comparar a imagem original com a editada.</p>
            ${hasEdits ? '' : '<p style="margin-bottom: 0.75rem; font-size: 0.85rem; color: #fbbf24;">💡 Edite a imagem em qualquer ferramenta e clique em "Aplicar" para ver a diferença aqui.</p>'}
            <div id="compareContainer" style="position: relative; width: 100%; overflow: hidden; border-radius: 8px; cursor: ew-resize; touch-action: none;">
                <canvas id="compareCanvas" style="display: block; width: 100%; max-height: 60vh; object-fit: contain;"></canvas>
                <div id="compareLine" style="position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent-color); left: 50%; pointer-events: none;">
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--accent-color); padding: 8px; border-radius: 50%;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                            <path d="M9 18l-6-6 6-6M15 6l6 6-6 6"/>
                        </svg>
                    </div>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.9rem; opacity: 0.7;">
                <span>← Original</span>
                <span>Editado →</span>
            </div>
        </div>
    `;

    initCompareSlider();
}

function initCompareSlider() {
    const container = document.getElementById('compareContainer');
    const line = document.getElementById('compareLine');
    const compareCanvas = document.getElementById('compareCanvas');
    if (!container || !line || !compareCanvas) return;

    const compareCtx = compareCanvas.getContext('2d');
    const origImg = initialLoadedImage || trueOriginalImage || originalImage;
    const editedImg = trueOriginalImage || originalImage;
    if (!origImg || !editedImg) return;

    compareCanvas.width = origImg.width;
    compareCanvas.height = origImg.height;

    let sliderPos = 0.5;

    function draw() {
        compareCtx.clearRect(0, 0, compareCanvas.width, compareCanvas.height);
        compareCtx.drawImage(editedImg, 0, 0, compareCanvas.width, compareCanvas.height);

        const clipX = compareCanvas.width * sliderPos;
        compareCtx.save();
        compareCtx.beginPath();
        compareCtx.rect(0, 0, clipX, compareCanvas.height);
        compareCtx.clip();
        compareCtx.drawImage(origImg, 0, 0, compareCanvas.width, compareCanvas.height);
        compareCtx.restore();

        line.style.left = (sliderPos * 100) + '%';
    }

    draw();

    let isDragging = false;
    const signal = typeof getToolEventSignal === 'function' ? getToolEventSignal() : undefined;

    const updateSlider = (clientX) => {
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0) return;
        sliderPos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        draw();
    };

    container.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateSlider(e.clientX);
    }, { signal });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        updateSlider(e.clientX);
    }, { signal });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    }, { signal });

    container.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) return;
        e.preventDefault();
        isDragging = true;
        updateSlider(e.touches[0].clientX);
    }, { passive: false, signal });

    container.addEventListener('touchmove', (e) => {
        if (!isDragging || e.touches.length > 1) return;
        e.preventDefault();
        updateSlider(e.touches[0].clientX);
    }, { passive: false, signal });

    container.addEventListener('touchend', () => {
        isDragging = false;
    }, { signal });
}

function buildPaletteControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Número de Cores</label>
            <input type="range" id="paletteCount" min="3" max="10" value="5" oninput="document.getElementById('paletteCountVal').textContent = this.value">
            <span id="paletteCountVal">5</span>
        </div>
        <div class="control-group">
            <button class="btn-primary" onclick="extractPalette()" style="width: 100%;">
                🎨 Extrair Paleta
            </button>
        </div>
        <div id="paletteResult" style="display: none;">
            <div class="control-group">
                <label>Cores Dominantes (clique para copiar)</label>
                <div id="paletteSwatches" style="display: flex; gap: 0.5rem; flex-wrap: wrap;"></div>
            </div>
        </div>
    `;
}

function extractPalette() {
    if (!originalImage) return;
    const count = parseInt(document.getElementById('paletteCount').value, 10) || 5;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const sampleSize = 64;
    tempCanvas.width = sampleSize;
    tempCanvas.height = sampleSize;
    tempCtx.drawImage(originalImage, 0, 0, sampleSize, sampleSize);

    const imageData = tempCtx.getImageData(0, 0, sampleSize, sampleSize);
    const pixels = imageData.data;

    const colors = [];
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue;
        colors.push({
            r: pixels[i],
            g: pixels[i + 1],
            b: pixels[i + 2]
        });
    }

    if (colors.length === 0) {
        if (typeof showToast === 'function') showToast('Imagem totalmente transparente.', 'error');
        return;
    }

    const palette = kMeansClustering(colors, count);

    const resultDiv = document.getElementById('paletteResult');
    const swatchesDiv = document.getElementById('paletteSwatches');
    resultDiv.style.display = 'block';

    swatchesDiv.innerHTML = palette.map(color => {
        const hex = rgbToHex(color.r, color.g, color.b).toUpperCase();
        return `
            <div style="text-align: center; cursor: pointer;" onclick="copyToClipboard('${hex}')">
                <div style="width: 50px; height: 50px; background: ${hex}; border-radius: 8px; border: 2px solid var(--border-color);"></div>
                <small style="font-size: 0.7rem;">${hex}</small>
            </div>
        `;
    }).join('');
}

function kMeansClustering(colors, k) {
    const clusterCount = Math.min(k, colors.length);
    let centroids = [];
    const seen = new Set();

    for (let i = 0; i < colors.length && centroids.length < clusterCount; i++) {
        const idx = Math.floor((i * colors.length) / clusterCount) % colors.length;
        const c = colors[idx];
        const key = `${c.r},${c.g},${c.b}`;
        if (!seen.has(key)) {
            seen.add(key);
            centroids.push({ ...c });
        }
    }

    while (centroids.length < clusterCount) {
        centroids.push({ ...colors[centroids.length % colors.length] });
    }

    let clusterSizes = new Array(clusterCount).fill(0);

    for (let iter = 0; iter < 12; iter++) {
        const clusters = Array.from({ length: clusterCount }, () => []);

        for (let i = 0; i < colors.length; i++) {
            const color = colors[i];
            let minDist = Infinity;
            let nearestIdx = 0;

            for (let j = 0; j < centroids.length; j++) {
                const centroid = centroids[j];
                const dr = color.r - centroid.r;
                const dg = color.g - centroid.g;
                const db = color.b - centroid.b;
                const dist = dr * dr + dg * dg + db * db;
                if (dist < minDist) {
                    minDist = dist;
                    nearestIdx = j;
                }
            }

            clusters[nearestIdx].push(color);
        }

        clusterSizes = clusters.map(cluster => cluster.length);
        centroids = clusters.map((cluster, idx) => {
            if (cluster.length === 0) return centroids[idx];
            let sumR = 0, sumG = 0, sumB = 0;
            for (let i = 0; i < cluster.length; i++) {
                sumR += cluster[i].r;
                sumG += cluster[i].g;
                sumB += cluster[i].b;
            }
            return {
                r: Math.round(sumR / cluster.length),
                g: Math.round(sumG / cluster.length),
                b: Math.round(sumB / cluster.length)
            };
        });
    }

    return centroids
        .map((c, idx) => ({ ...c, count: clusterSizes[idx] }))
        .sort((a, b) => b.count - a.count);
}

function copyToClipboard(text) {
    if (typeof copyTextToClipboard === 'function') {
        copyTextToClipboard(text, `Cor ${text} copiada!`);
    }
}

let isDrawing = false;
let drawColor = '#f2511b';
let drawSize = 5;
let drawMode = 'brush';

function buildDrawControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Ferramenta</label>
            <div class="filters-grid" style="grid-template-columns: repeat(3, 1fr);">
                <button class="filter-btn active" onclick="setDrawMode('brush', this)">✏️ Pincel</button>
                <button class="filter-btn" onclick="setDrawMode('line', this)">📏 Linha</button>
                <button class="filter-btn" onclick="setDrawMode('rect', this)">⬜ Retângulo</button>
                <button class="filter-btn" onclick="setDrawMode('circle', this)">⭕ Círculo</button>
                <button class="filter-btn" onclick="setDrawMode('arrow', this)">➡️ Seta</button>
                <button class="filter-btn" onclick="setDrawMode('text', this)">📝 Texto</button>
            </div>
        </div>
        <div class="control-group">
            <label>Cor</label>
            <input type="color" id="drawColorPicker" value="${drawColor}" onchange="drawColor = this.value">
        </div>
        <div class="control-group">
            <label>Tamanho</label>
            <input type="range" id="drawSizeSlider" min="1" max="50" value="${drawSize}" oninput="drawSize = parseInt(this.value, 10); document.getElementById('drawSizeVal').textContent = this.value + 'px'">
            <span id="drawSizeVal">${drawSize}px</span>
        </div>
        <div id="textInputGroup" class="control-group" style="display: none;">
            <label>Texto</label>
            <input type="text" id="drawTextInput" placeholder="Digite o texto..." class="text-input" style="height: auto;">
        </div>
        <div class="control-group">
            <button class="btn-secondary" onclick="clearDrawing()" style="width: 100%;">
                🗑️ Limpar Desenhos
            </button>
        </div>
    `;

    drawMode = 'brush';
    initDrawingCanvas();
}

function setDrawMode(mode, btn) {
    drawMode = mode;
    document.querySelectorAll('#controls .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const textGroup = document.getElementById('textInputGroup');
    if (textGroup) {
        textGroup.style.display = mode === 'text' ? 'block' : 'none';
    }

    canvas.style.cursor = 'crosshair';
}

function initDrawingCanvas() {
    let startX = 0;
    let startY = 0;
    let drawingSnapshot = null;
    const signal = typeof getToolEventSignal === 'function' ? getToolEventSignal() : undefined;

    canvas.style.cursor = 'crosshair';

    const getCanvasCoords = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const startDraw = (clientX, clientY) => {
        isDrawing = true;
        const pos = getCanvasCoords(clientX, clientY);
        startX = pos.x;
        startY = pos.y;

        drawingSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

        if (drawMode === 'brush') {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + 0.01, startY + 0.01);
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = drawSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        } else if (drawMode === 'text') {
            const text = document.getElementById('drawTextInput').value || 'Texto';
            ctx.font = `bold ${drawSize * 3}px Arial, sans-serif`;
            ctx.fillStyle = drawColor;
            ctx.fillText(text, startX, startY);
            updateOriginalFromCanvas();
            isDrawing = false;
        }
    };

    const moveDraw = (clientX, clientY) => {
        if (!isDrawing) return;
        const pos = getCanvasCoords(clientX, clientY);

        if (drawMode === 'brush') {
            ctx.lineTo(pos.x, pos.y);
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = drawSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        } else if (drawingSnapshot) {
            ctx.putImageData(drawingSnapshot, 0, 0);
            drawShape(startX, startY, pos.x, pos.y);
        }
    };

    const endDraw = (clientX, clientY) => {
        if (!isDrawing) return;
        isDrawing = false;

        if (drawMode !== 'brush' && drawingSnapshot && typeof clientX === 'number') {
            const pos = getCanvasCoords(clientX, clientY);
            ctx.putImageData(drawingSnapshot, 0, 0);
            drawShape(startX, startY, pos.x, pos.y);
        }
        drawingSnapshot = null;
        updateOriginalFromCanvas();
    };

    canvas.onmousedown = (e) => startDraw(e.clientX, e.clientY);
    canvas.onmousemove = (e) => moveDraw(e.clientX, e.clientY);
    canvas.onmouseup = (e) => endDraw(e.clientX, e.clientY);
    if (signal) {
        window.addEventListener('mousemove', (e) => {
            if (isDrawing) moveDraw(e.clientX, e.clientY);
        }, { signal });
        window.addEventListener('mouseup', (e) => {
            if (isDrawing) endDraw(e.clientX, e.clientY);
        }, { signal });
    }

    canvas.ontouchstart = (e) => {
        if (e.touches.length > 1) return;
        e.preventDefault();
        startDraw(e.touches[0].clientX, e.touches[0].clientY);
    };
    canvas.ontouchmove = (e) => {
        if (!isDrawing || e.touches.length > 1) return;
        e.preventDefault();
        moveDraw(e.touches[0].clientX, e.touches[0].clientY);
    };
    canvas.ontouchend = (e) => {
        e.preventDefault();
        const touch = e.changedTouches && e.changedTouches[0];
        endDraw(touch ? touch.clientX : undefined, touch ? touch.clientY : undefined);
    };
}

function drawShape(x1, y1, x2, y2) {
    ctx.strokeStyle = drawColor;
    ctx.fillStyle = drawColor;
    ctx.lineWidth = drawSize;
    ctx.lineCap = 'round';

    switch (drawMode) {
        case 'line':
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            break;
        case 'rect':
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            break;
        case 'circle': {
            const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            ctx.beginPath();
            ctx.arc(x1, y1, radius, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }
        case 'arrow':
            drawArrow(x1, y1, x2, y2);
            break;
    }
}

function drawArrow(fromX, fromY, toX, toY) {
    const headlen = 15 + Number(drawSize);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
}

function clearDrawing() {
    if (!trueOriginalImage) return;
    displayImage(trueOriginalImage);
    originalImage = trueOriginalImage;
    saveToHistory();
}

function updateOriginalFromCanvas() {
    const dataUrl = canvas.toDataURL();
    saveToHistory(dataUrl);
    const img = new Image();
    img.onload = () => {
        originalImage = img;
    };
    img.src = dataUrl;
}

let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 20;

function updateHistoryButtons() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.disabled = historyIndex <= 0;
    if (btnRedo) btnRedo.disabled = historyIndex < 0 || historyIndex >= historyStack.length - 1;
}

function initHistory() {
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
        historyStack = [];
        historyIndex = -1;
        updateHistoryButtons();
        return;
    }
    const snap = canvas.toDataURL();
    historyStack = [{
        src: snap,
        trueSrc: trueOriginalImage ? trueOriginalImage.src : snap
    }];
    historyIndex = 0;
    updateHistoryButtons();
}

function saveToHistory(snapshotOverride) {
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }

    const src = snapshotOverride || canvas.toDataURL();
    const trueSrc = trueOriginalImage ? trueOriginalImage.src : src;

    if (historyStack.length > 0 && historyStack[historyStack.length - 1].src === src && historyStack[historyStack.length - 1].trueSrc === trueSrc) {
        updateHistoryButtons();
        return;
    }

    historyStack.push({ src, trueSrc });

    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    }
    historyIndex = historyStack.length - 1;
    updateHistoryButtons();
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        loadFromHistory();
    }
}

function redo() {
    if (historyIndex >= 0 && historyIndex < historyStack.length - 1) {
        historyIndex++;
        loadFromHistory();
    }
}

function loadFromHistory() {
    const entry = historyStack[historyIndex];
    if (!entry) return;
    updateHistoryButtons();

    const img = new Image();
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        originalImage = img;

        const finishRestore = () => {
            const sliderTools = new Set(['filters', 'blur', 'temperature', 'border', 'watermark', 'memes']);
            if (sliderTools.has(currentTool) && typeof buildControls === 'function') {
                buildControls({ afterApply: true });
            }
        };

        if (entry.trueSrc && (!trueOriginalImage || trueOriginalImage.src !== entry.trueSrc)) {
            const tImg = new Image();
            tImg.onload = () => {
                trueOriginalImage = tImg;
                finishRestore();
            };
            tImg.src = entry.trueSrc;
        } else {
            finishRestore();
        }
    };
    img.src = entry.src;
}

document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('toolModal');
    if (!modal || !modal.classList.contains('active')) return;

    const isEditableTarget = (el) => Boolean(el && (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
    ));
    if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) {
        return;
    }

    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
    } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
    }
});

let batchImages = [];

function buildBatchControls(container) {
    batchImages = [];
    batchResults = [];

    container.innerHTML = `
        <div class="control-group">
            <p style="margin-bottom: 0.5rem;">Processe múltiplas imagens de uma vez.</p>
            <p style="opacity: 0.7; font-size: 0.9rem;">⚠️ Requer JSZip para download em ZIP</p>
        </div>
        <div class="control-group">
            <label>1. Selecione as Imagens</label>
            <div class="custom-file-upload">
                <label for="batchInput" class="file-upload-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span id="batchFileName">Selecionar imagens...</span>
                </label>
                <input type="file" id="batchInput" accept="image/*" multiple onchange="handleBatchSelect(this)" style="display: none;">
            </div>
            <div id="batchCount" style="margin-top: 0.5rem; opacity: 0.7;"></div>
        </div>
        <div class="control-group">
            <label>2. Operação</label>
            <select id="batchOperation" class="custom-select">
                <option value="resize">Redimensionar (800x600)</option>
                <option value="compress">Comprimir (70%)</option>
                <option value="grayscale">Preto e Branco</option>
                <option value="watermark">Adicionar Marca d'Água</option>
            </select>
        </div>
        <div id="batchWatermarkGroup" class="control-group" style="display: none;">
            <label>Texto da Marca d'Água</label>
            <input type="text" id="batchWatermarkText" placeholder="Seu texto aqui" class="text-input" style="height: auto;">
        </div>
        <div class="control-group">
            <button class="btn-primary" id="btnBatchProcess" onclick="processBatch()" style="width: 100%;" disabled>
                🔄 Processar Lote
            </button>
        </div>
        <div id="batchProgress" style="display: none;">
            <div style="background: var(--glass-bg); border-radius: 8px; padding: 1rem; margin-top: 1rem;">
                <p id="batchProgressText" style="margin: 0 0 0.5rem 0;">Processando...</p>
                <div style="background: var(--base-color); height: 8px; border-radius: 4px; overflow: hidden;">
                    <div id="batchProgressBar" style="background: var(--accent-color); height: 100%; width: 0%; transition: width 0.3s;"></div>
                </div>
            </div>
        </div>
        <div id="batchResults" style="display: none; margin-top: 1rem;">
            <button class="btn-primary" onclick="downloadBatchResults()" style="width: 100%;">
                📦 Baixar Todas (ZIP)
            </button>
        </div>
    `;

    document.getElementById('batchOperation').addEventListener('change', (e) => {
        document.getElementById('batchWatermarkGroup').style.display =
            e.target.value === 'watermark' ? 'block' : 'none';
    });

    setTimeout(() => initCustomSelects(), 0);
}

function handleBatchSelect(input) {
    if (input.files && input.files.length > 0) {
        batchImages = Array.from(input.files);
        document.getElementById('batchFileName').textContent = `${batchImages.length} imagem(ns) selecionada(s)`;
        document.getElementById('batchCount').textContent = `📁 ${batchImages.length} arquivo(s) pronto(s)`;
        document.getElementById('btnBatchProcess').disabled = false;
        document.getElementById('batchResults').style.display = 'none';
    }
}

let batchResults = [];

async function processBatch() {
    if (batchImages.length === 0) return;

    const operation = document.getElementById('batchOperation').value;
    const progressDiv = document.getElementById('batchProgress');
    const progressText = document.getElementById('batchProgressText');
    const progressBar = document.getElementById('batchProgressBar');
    const resultsDiv = document.getElementById('batchResults');

    progressDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
    batchResults = [];
    let failedCount = 0;

    for (let i = 0; i < batchImages.length; i++) {
        const file = batchImages[i];
        progressText.textContent = `Processando ${i + 1}/${batchImages.length}: ${file.name}`;
        progressBar.style.width = ((i + 1) / batchImages.length * 100) + '%';

        try {
            const result = await processSingleBatchImage(file, operation);
            batchResults.push({ name: file.name, data: result });
        } catch (error) {
            failedCount++;
            console.error('Error processing', file.name, error);
        }

        await new Promise(r => setTimeout(r, 20));
    }

    if (batchResults.length === 0) {
        progressText.textContent = '❌ Nenhuma imagem pôde ser processada.';
        return;
    }

    progressText.textContent = failedCount > 0
        ? `✓ ${batchResults.length} processada(s), ${failedCount} com erro.`
        : `✓ ${batchResults.length} imagem(ns) processada(s)!`;
    resultsDiv.style.display = 'block';
}

function processSingleBatchImage(file, operation) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error(`Imagem inválida: ${file.name}`));
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');

                let targetW = img.width;
                let targetH = img.height;
                if (operation === 'resize') {
                    const maxW = 800, maxH = 600;
                    if (targetW > maxW) { targetH = targetH * maxW / targetW; targetW = maxW; }
                    if (targetH > maxH) { targetW = targetW * maxH / targetH; targetH = maxH; }
                    targetW = Math.max(1, Math.round(targetW));
                    targetH = Math.max(1, Math.round(targetH));
                }

                tempCanvas.width = targetW;
                tempCanvas.height = targetH;
                tempCtx.fillStyle = '#ffffff';
                tempCtx.fillRect(0, 0, targetW, targetH);

                if (operation === 'grayscale') {
                    tempCtx.filter = 'grayscale(100%)';
                    tempCtx.drawImage(img, 0, 0, targetW, targetH);
                    tempCtx.filter = 'none';
                } else {
                    tempCtx.drawImage(img, 0, 0, targetW, targetH);
                }

                if (operation === 'watermark') {
                    const text = document.getElementById('batchWatermarkText').value || 'Watermark';
                    const fontSize = Math.max(20, Math.round(targetW / 15));
                    tempCtx.font = `bold ${fontSize}px Arial, sans-serif`;
                    tempCtx.fillStyle = 'rgba(255,255,255,0.65)';
                    tempCtx.strokeStyle = 'rgba(0,0,0,0.45)';
                    tempCtx.lineWidth = Math.max(1, Math.round(fontSize / 16));
                    tempCtx.textAlign = 'center';
                    tempCtx.textBaseline = 'bottom';
                    tempCtx.strokeText(text, targetW / 2, targetH - 20);
                    tempCtx.fillText(text, targetW / 2, targetH - 20);
                }

                const quality = operation === 'compress' ? 0.7 : 0.9;
                resolve(tempCanvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function downloadBatchResults() {
    if (batchResults.length === 0) return;

    try {
        if (typeof ensureJSZipReady === 'function') {
            await ensureJSZipReady();
        } else if (typeof JSZip === 'undefined') {
            throw new Error('JSZip indisponível');
        }

        const zip = new JSZip();
        const usedNames = new Map();

        batchResults.forEach((result) => {
            const base64Data = result.data.split(',')[1];
            const baseName = result.name.replace(/\.[^.]+$/, '');
            let candidate = `${baseName}_processed.jpg`;
            const count = (usedNames.get(candidate) || 0) + 1;
            usedNames.set(candidate, count);
            if (count > 1) {
                candidate = `${baseName}_processed_${count}.jpg`;
            }
            zip.file(candidate, base64Data, { base64: true });
        });

        const content = await zip.generateAsync({ type: 'blob' });
        if (typeof triggerBlobDownload === 'function') {
            triggerBlobDownload(content, 'imagens_processadas.zip');
        }
    } catch (err) {
        console.error('Erro ao gerar ZIP:', err);
        if (typeof showToast === 'function') {
            showToast('Erro ao carregar JSZip ou gerar o arquivo ZIP.', 'error');
        }
    }
}

let scannerCorners = null;
let scannerWarpedBase = null;
let scannerManualMode = false;
let draggingCornerIndex = -1;

function buildScannerControls(container) {
    scannerCorners = null;
    scannerWarpedBase = null;
    scannerManualMode = false;
    draggingCornerIndex = -1;

    container.innerHTML = `
        <div class="control-group">
            <p style="margin-bottom: 0.5rem;">📄 Detecta automaticamente as bordas do documento e corrige a perspectiva.</p>
            <p style="opacity: 0.7; font-size: 0.9rem;">⚠️ OpenCV.js carrega ~8MB na primeira execução</p>
        </div>
        <div class="control-group" style="gap: 0.5rem;">
            <button class="btn-primary" onclick="detectDocument()" style="width: 100%;" id="btnDetect">
                🔍 Detectar Documento Automaticamente
            </button>
            <button class="btn-secondary" onclick="enableManualScannerCorners()" style="width: 100%;" id="btnManualScan">
                ✂️ Ajustar Cantos Manualmente
            </button>
        </div>
        <div id="manualScanControls" class="control-group" style="display: none; margin-top: 0.5rem;">
            <p style="font-size: 0.85rem; color: #4ade80; margin: 0 0 0.5rem 0;">
                Arraste os 4 cantos laranja sobre as pontas do documento e clique em aplicar.
            </p>
            <button class="btn-primary" onclick="applyManualScannerWarp()" style="width: 100%;">
                ✅ Aplicar Perspectiva Manual
            </button>
        </div>
        <div id="scanProgress" style="display: none;">
            <div style="background: var(--glass-bg); border-radius: 8px; padding: 1rem; margin-top: 1rem;">
                <p id="scanProgressText" style="margin: 0 0 0.5rem 0;">Processando...</p>
                <div style="background: var(--base-color); height: 8px; border-radius: 4px; overflow: hidden;">
                    <div id="scanProgressBar" style="background: var(--accent-color); height: 100%; width: 0%; transition: width 0.3s;"></div>
                </div>
            </div>
        </div>
        <div id="scanActions" style="display: none; margin-top: 1rem;">
            <div class="control-group">
                <label>Filtros de Documento</label>
                <div class="filters-grid" style="grid-template-columns: repeat(2, 1fr);">
                    <button class="filter-btn active" onclick="applyScanFilter('none', this)">📷 Original</button>
                    <button class="filter-btn" onclick="applyScanFilter('bw', this)">⬛ Preto/Branco</button>
                    <button class="filter-btn" onclick="applyScanFilter('contrast', this)">🔆 Alto Contraste</button>
                    <button class="filter-btn" onclick="applyScanFilter('magic', this)">✨ Mágico</button>
                </div>
            </div>
        </div>
    `;
}

async function ensureOpenCVReady(progressText, progressBar) {
    if (typeof cv !== 'undefined' && typeof cv.Mat === 'function') return true;

    if (progressText) progressText.textContent = 'Carregando OpenCV (~8MB)...';
    if (progressBar) progressBar.style.width = '15%';

    try {
        if (typeof cv === 'undefined' && typeof loadExternalScript === 'function') {
            await loadExternalScript(
                'https://docs.opencv.org/4.x/opencv.js',
                () => typeof cv !== 'undefined'
            );
        }

        if (typeof cv === 'object' && cv !== null && typeof cv.then === 'function') {
            window.cv = await cv;
        }

        let attempts = 0;
        while ((typeof cv === 'undefined' || typeof cv.Mat !== 'function') && attempts < 60) {
            await new Promise(r => setTimeout(r, 250));
            attempts++;
            if (progressBar) progressBar.style.width = Math.min(40, 15 + attempts) + '%';
        }

        return typeof cv !== 'undefined' && typeof cv.Mat === 'function';
    } catch (err) {
        console.error('Erro ao carregar OpenCV:', err);
        return false;
    }
}

function warpScannerWithCorners(sortedCorners) {
    const tempSource = document.createElement('canvas');
    tempSource.width = originalImage.width;
    tempSource.height = originalImage.height;
    tempSource.getContext('2d').drawImage(originalImage, 0, 0);

    const width = Math.max(10, Math.round(Math.max(
        distance(sortedCorners[0], sortedCorners[1]),
        distance(sortedCorners[3], sortedCorners[2])
    )));
    const height = Math.max(10, Math.round(Math.max(
        distance(sortedCorners[0], sortedCorners[3]),
        distance(sortedCorners[1], sortedCorners[2])
    )));

    let src = null, srcPoints = null, dstPoints = null, M = null, warped = null;
    try {
        src = cv.imread(tempSource);
        srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
            sortedCorners[0].x, sortedCorners[0].y,
            sortedCorners[1].x, sortedCorners[1].y,
            sortedCorners[2].x, sortedCorners[2].y,
            sortedCorners[3].x, sortedCorners[3].y
        ]);
        dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            width, 0,
            width, height,
            0, height
        ]);

        M = cv.getPerspectiveTransform(srcPoints, dstPoints);
        warped = new cv.Mat();
        cv.warpPerspective(src, warped, M, new cv.Size(width, height));

        canvas.width = width;
        canvas.height = height;
        cv.imshow(canvas, warped);

        const baseCanvas = document.createElement('canvas');
        baseCanvas.width = width;
        baseCanvas.height = height;
        baseCanvas.getContext('2d').drawImage(canvas, 0, 0);
        scannerWarpedBase = baseCanvas;
        scannerManualMode = false;

        const manualBox = document.getElementById('manualScanControls');
        if (manualBox) manualBox.style.display = 'none';

        const img = new Image();
        img.onload = () => {
            originalImage = img;
            saveToHistory();
        };
        img.src = canvas.toDataURL();

        document.getElementById('scanActions').style.display = 'block';
        document.querySelectorAll('#scanActions .filter-btn').forEach((b, idx) => {
            b.classList.toggle('active', idx === 0);
        });
    } finally {
        if (warped) warped.delete();
        if (M) M.delete();
        if (srcPoints) srcPoints.delete();
        if (dstPoints) dstPoints.delete();
        if (src) src.delete();
    }
}

async function detectDocument() {
    if (!originalImage) return;
    const progressDiv = document.getElementById('scanProgress');
    const progressText = document.getElementById('scanProgressText');
    const progressBar = document.getElementById('scanProgressBar');

    progressDiv.style.display = 'block';
    progressText.textContent = 'Verificando OpenCV...';
    progressBar.style.width = '10%';

    if (!(await ensureOpenCVReady(progressText, progressBar))) {
        progressText.textContent = '❌ Falha ao carregar OpenCV. Tente novamente.';
        progressBar.style.width = '0%';
        return;
    }

    progressText.textContent = 'Detectando bordas...';
    progressBar.style.width = '50%';

    displayImage(originalImage);
    let src = null, gray = null, blurred = null, edges = null, contours = null, hierarchy = null, bestContour = null;

    try {
        src = cv.imread(canvas);
        gray = new cv.Mat();
        blurred = new cv.Mat();
        edges = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        cv.Canny(blurred, edges, 75, 200);

        progressText.textContent = 'Procurando documento...';
        progressBar.style.width = '70%';

        contours = new cv.MatVector();
        hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        let maxArea = 0;

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);

            if (area > maxArea && area > (src.rows * src.cols * 0.1)) {
                const peri = cv.arcLength(contour, true);
                const approx = new cv.Mat();
                cv.approxPolyDP(contour, approx, 0.02 * peri, true);

                if (approx.rows === 4) {
                    maxArea = area;
                    if (bestContour) bestContour.delete();
                    bestContour = approx;
                } else {
                    approx.delete();
                }
            }
            contour.delete();
        }

        if (bestContour) {
            progressText.textContent = 'Corrigindo perspectiva...';
            progressBar.style.width = '85%';

            const corners = [];
            for (let i = 0; i < 4; i++) {
                corners.push({
                    x: bestContour.data32S[i * 2],
                    y: bestContour.data32S[i * 2 + 1]
                });
            }

            const sortedCorners = sortCorners(corners);
            warpScannerWithCorners(sortedCorners);

            progressBar.style.width = '100%';
            progressText.textContent = '✓ Documento detectado e recortado!';
        } else {
            progressText.textContent = '⚠️ Não detectado automaticamente. Use "Ajustar Cantos Manualmente".';
            progressBar.style.width = '0%';
            enableManualScannerCorners();
        }
    } catch (error) {
        console.error('Scanner error:', error);
        progressText.textContent = '❌ Erro ao processar. Tente o ajuste manual.';
        progressBar.style.width = '0%';
    } finally {
        if (bestContour) bestContour.delete();
        if (src) src.delete();
        if (gray) gray.delete();
        if (blurred) blurred.delete();
        if (edges) edges.delete();
        if (contours) contours.delete();
        if (hierarchy) hierarchy.delete();
    }
}

function enableManualScannerCorners() {
    if (!originalImage) return;
    scannerManualMode = true;
    const manualBox = document.getElementById('manualScanControls');
    if (manualBox) manualBox.style.display = 'block';

    const w = originalImage.width;
    const h = originalImage.height;
    const padX = Math.round(w * 0.1);
    const padY = Math.round(h * 0.1);

    scannerCorners = [
        { x: padX, y: padY },
        { x: w - padX, y: padY },
        { x: w - padX, y: h - padY },
        { x: padX, y: h - padY }
    ];

    drawScannerOverlay();
    setupManualScannerEvents();
}

function drawScannerOverlay() {
    if (!originalImage || !scannerCorners) return;
    displayImage(originalImage);

    const rectBounds = canvas.getBoundingClientRect();
    const displayScale = rectBounds.width > 0 ? canvas.width / rectBounds.width : 1;

    ctx.save();
    ctx.strokeStyle = '#f2511b';
    ctx.lineWidth = Math.max(2, 2.5 * displayScale);
    ctx.fillStyle = 'rgba(242, 81, 27, 0.12)';
    ctx.beginPath();
    ctx.moveTo(scannerCorners[0].x, scannerCorners[0].y);
    for (let i = 1; i < 4; i++) {
        ctx.lineTo(scannerCorners[i].x, scannerCorners[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const radius = Math.max(8, 10 * displayScale);
    scannerCorners.forEach((corner) => {
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f2511b';
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, 2 * displayScale);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    });
    ctx.restore();
}

function setupManualScannerEvents() {
    const signal = typeof getToolEventSignal === 'function' ? getToolEventSignal() : undefined;
    canvas.style.cursor = 'crosshair';

    const getPos = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
        return {
            x: Math.max(0, Math.min(canvas.width, (clientX - rect.left) * scaleX)),
            y: Math.max(0, Math.min(canvas.height, (clientY - rect.top) * scaleY))
        };
    };

    const startCorner = (clientX, clientY) => {
        if (!scannerManualMode || !scannerCorners) return;
        const pos = getPos(clientX, clientY);
        const rectBounds = canvas.getBoundingClientRect();
        const displayScale = rectBounds.width > 0 ? canvas.width / rectBounds.width : 1;
        const hitRadius = Math.max(18, 22 * displayScale);

        draggingCornerIndex = -1;
        let minD = Infinity;
        scannerCorners.forEach((c, idx) => {
            const d = Math.hypot(pos.x - c.x, pos.y - c.y);
            if (d < hitRadius && d < minD) {
                minD = d;
                draggingCornerIndex = idx;
            }
        });
    };

    const moveCorner = (clientX, clientY) => {
        if (!scannerManualMode || draggingCornerIndex < 0 || !scannerCorners) return;
        const pos = getPos(clientX, clientY);
        scannerCorners[draggingCornerIndex] = pos;
        drawScannerOverlay();
    };

    const endCorner = () => {
        draggingCornerIndex = -1;
    };

    canvas.onmousedown = (e) => startCorner(e.clientX, e.clientY);
    canvas.onmousemove = (e) => moveCorner(e.clientX, e.clientY);
    canvas.onmouseup = endCorner;
    if (signal) {
        window.addEventListener('mousemove', (e) => moveCorner(e.clientX, e.clientY), { signal });
        window.addEventListener('mouseup', endCorner, { signal });
    }

    canvas.ontouchstart = (e) => {
        if (!scannerManualMode || e.touches.length > 1) return;
        e.preventDefault();
        startCorner(e.touches[0].clientX, e.touches[0].clientY);
    };
    canvas.ontouchmove = (e) => {
        if (!scannerManualMode || draggingCornerIndex < 0 || e.touches.length > 1) return;
        e.preventDefault();
        moveCorner(e.touches[0].clientX, e.touches[0].clientY);
    };
    canvas.ontouchend = endCorner;
}

async function applyManualScannerWarp() {
    if (!scannerCorners || !originalImage) return;
    const progressDiv = document.getElementById('scanProgress');
    const progressText = document.getElementById('scanProgressText');
    const progressBar = document.getElementById('scanProgressBar');

    progressDiv.style.display = 'block';
    progressText.textContent = 'Aplicando correção de perspectiva...';
    progressBar.style.width = '30%';

    if (!(await ensureOpenCVReady(progressText, progressBar))) {
        progressText.textContent = '❌ OpenCV ainda não carregou. Tente novamente.';
        progressBar.style.width = '0%';
        return;
    }

    try {
        const sorted = sortCorners([...scannerCorners]);
        warpScannerWithCorners(sorted);
        progressBar.style.width = '100%';
        progressText.textContent = '✓ Perspectiva corrigida!';
    } catch (err) {
        console.error('Manual warp error:', err);
        progressText.textContent = '❌ Erro ao corrigir perspectiva.';
        progressBar.style.width = '0%';
    }
}

function sortCorners(corners) {
    corners.sort((a, b) => a.y - b.y);
    const top = corners.slice(0, 2);
    const bottom = corners.slice(2, 4);

    top.sort((a, b) => a.x - b.x);
    bottom.sort((a, b) => a.x - b.x);

    return [top[0], top[1], bottom[1], bottom[0]];
}

function distance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function applyScanFilter(mode, btn) {
    const source = scannerWarpedBase || originalImage;
    if (!source) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = source.width;
    tempCanvas.height = source.height;

    switch (mode) {
        case 'none':
            tempCtx.drawImage(source, 0, 0);
            break;
        case 'bw':
            tempCtx.filter = 'grayscale(100%) contrast(130%)';
            tempCtx.drawImage(source, 0, 0);
            break;
        case 'contrast':
            tempCtx.filter = 'contrast(200%) brightness(110%)';
            tempCtx.drawImage(source, 0, 0);
            break;
        case 'magic':
            tempCtx.filter = 'grayscale(100%) contrast(180%) brightness(120%)';
            tempCtx.drawImage(source, 0, 0);
            break;
    }

    canvas.width = tempCanvas.width;
    canvas.height = tempCanvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);

    const img = new Image();
    img.onload = () => {
        originalImage = img;
        saveToHistory();
    };
    img.src = canvas.toDataURL();

    document.querySelectorAll('#scanActions .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

function buildUpscaleControls(container) {
    upscaleFactor = 2;
    container.innerHTML = `
        <div class="control-group">
            <p style="margin-bottom: 0.5rem;">Aumente a resolução da imagem usando interpolação avançada.</p>
            <p style="opacity: 0.7; font-size: 0.9rem;">
                ⚠️ Nota: Este é um upscale por software, não IA neural real (que requer servidor).
            </p>
        </div>
        <div class="control-group">
            <label>Fator de Escala</label>
            <div class="filters-grid" style="grid-template-columns: repeat(3, 1fr);">
                <button class="filter-btn active" onclick="applyUpscale(2, this)">2x</button>
                <button class="filter-btn" onclick="applyUpscale(3, this)">3x</button>
                <button class="filter-btn" onclick="applyUpscale(4, this)">4x</button>
            </div>
        </div>
        <div id="upscaleInfo" class="control-group">
            <p style="opacity: 0.7; font-size: 0.9rem;">
                Original: ${originalImage.width} × ${originalImage.height}<br>
                <span id="upscaleResult">Resultado: ${originalImage.width * 2} × ${originalImage.height * 2}</span>
            </p>
        </div>
        <div class="control-group">
            <button class="btn-primary" id="btnUpscale" onclick="processUpscale()" style="width: 100%;">
                🔍 Aplicar Upscale
            </button>
        </div>
    `;
}

let upscaleFactor = 2;

function applyUpscale(factor, btn) {
    upscaleFactor = factor;
    document.querySelectorAll('#controls .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    document.getElementById('upscaleResult').textContent =
        `Resultado: ${originalImage.width * factor} × ${originalImage.height * factor}`;
}

function processUpscale() {
    if (!originalImage) return;
    const newWidth = originalImage.width * upscaleFactor;
    const newHeight = originalImage.height * upscaleFactor;

    if (newWidth > 12000 || newHeight > 12000) {
        if (typeof showToast === 'function') {
            showToast(`Resolução resultante (${newWidth} × ${newHeight}) excede o limite seguro do navegador.`, 'error');
        }
        return;
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = newWidth;
    tempCanvas.height = newHeight;

    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'high';
    tempCtx.drawImage(originalImage, 0, 0, newWidth, newHeight);

    canvas.width = newWidth;
    canvas.height = newHeight;
    ctx.clearRect(0, 0, newWidth, newHeight);
    ctx.drawImage(tempCanvas, 0, 0);

    const img = new Image();
    img.onload = () => {
        originalImage = img;
        saveToHistory();
        if (typeof showToast === 'function') {
            showToast(`Imagem aumentada para ${newWidth} × ${newHeight} px!`, 'success');
        }
    };
    img.src = canvas.toDataURL();
}

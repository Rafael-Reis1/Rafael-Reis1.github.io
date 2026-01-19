let compareOriginal = null;

function buildCompareControls(container) {
    const editedDataUrl = canvas.toDataURL();

    container.innerHTML = `
        <div class="control-group">
            <p style="margin-bottom: 1rem;">Arraste o slider para comparar a imagem original com a editada.</p>
            <div id="compareContainer" style="position: relative; width: 100%; overflow: hidden; border-radius: 8px; cursor: ew-resize;">
                <canvas id="compareCanvas" style="display: block; width: 100%;"></canvas>
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
    const compareCtx = compareCanvas.getContext('2d');

    const origImg = trueOriginalImage;
    const editedImg = new Image();
    editedImg.src = canvas.toDataURL();

    editedImg.onload = () => {
        compareCanvas.width = origImg.width;
        compareCanvas.height = origImg.height;

        let sliderPos = 0.5;

        function draw() {
            compareCtx.clearRect(0, 0, compareCanvas.width, compareCanvas.height);

            compareCtx.drawImage(editedImg, 0, 0);
            
            const clipX = compareCanvas.width * sliderPos;
            compareCtx.save();
            compareCtx.beginPath();
            compareCtx.rect(0, 0, clipX, compareCanvas.height);
            compareCtx.clip();
            compareCtx.drawImage(origImg, 0, 0);
            compareCtx.restore();

            line.style.left = (sliderPos * 100) + '%';
        }

        draw();

        let isDragging = false;

        container.addEventListener('mousedown', () => isDragging = true);
        document.addEventListener('mouseup', () => isDragging = false);
        container.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = container.getBoundingClientRect();
            sliderPos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            draw();
        });

        container.addEventListener('touchmove', (e) => {
            const rect = container.getBoundingClientRect();
            const touch = e.touches[0];
            sliderPos = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
            draw();
        });
    };
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
                <label>Cores Dominantes</label>
                <div id="paletteSwatches" style="display: flex; gap: 0.5rem; flex-wrap: wrap;"></div>
            </div>
        </div>
    `;
}

function extractPalette() {
    const count = parseInt(document.getElementById('paletteCount').value);

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const sampleSize = 50;
    tempCanvas.width = sampleSize;
    tempCanvas.height = sampleSize;
    tempCtx.drawImage(originalImage, 0, 0, sampleSize, sampleSize);

    const imageData = tempCtx.getImageData(0, 0, sampleSize, sampleSize);
    const pixels = imageData.data;

    const colors = [];
    for (let i = 0; i < pixels.length; i += 4) {
        colors.push({
            r: pixels[i],
            g: pixels[i + 1],
            b: pixels[i + 2]
        });
    }

    const palette = kMeansClustering(colors, count);

    const resultDiv = document.getElementById('paletteResult');
    const swatchesDiv = document.getElementById('paletteSwatches');
    resultDiv.style.display = 'block';

    swatchesDiv.innerHTML = palette.map(color => {
        const hex = rgbToHex(color.r, color.g, color.b);
        return `
            <div style="text-align: center; cursor: pointer;" onclick="copyToClipboard('${hex}')">
                <div style="width: 50px; height: 50px; background: ${hex}; border-radius: 8px; border: 2px solid var(--border-color);"></div>
                <small style="font-size: 0.7rem;">${hex}</small>
            </div>
        `;
    }).join('');
}

function kMeansClustering(colors, k) {
    let centroids = colors.slice(0, k).map(c => ({ ...c }));

    for (let iter = 0; iter < 10; iter++) {
        const clusters = Array(k).fill(null).map(() => []);

        colors.forEach(color => {
            let minDist = Infinity;
            let nearestIdx = 0;

            centroids.forEach((centroid, idx) => {
                const dist = Math.sqrt(
                    Math.pow(color.r - centroid.r, 2) +
                    Math.pow(color.g - centroid.g, 2) +
                    Math.pow(color.b - centroid.b, 2)
                );
                if (dist < minDist) {
                    minDist = dist;
                    nearestIdx = idx;
                }
            });

            clusters[nearestIdx].push(color);
        });

        centroids = clusters.map((cluster, idx) => {
            if (cluster.length === 0) return centroids[idx];
            return {
                r: Math.round(cluster.reduce((s, c) => s + c.r, 0) / cluster.length),
                g: Math.round(cluster.reduce((s, c) => s + c.g, 0) / cluster.length),
                b: Math.round(cluster.reduce((s, c) => s + c.b, 0) / cluster.length)
            };
        });
    }

    return centroids;
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    alert(`Copiado: ${text}`);
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
            <input type="range" id="drawSizeSlider" min="1" max="50" value="${drawSize}" oninput="drawSize = this.value; document.getElementById('drawSizeVal').textContent = this.value + 'px'">
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

    initDrawingCanvas();
}

function setDrawMode(mode, btn) {
    drawMode = mode;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const textGroup = document.getElementById('textInputGroup');
    textGroup.style.display = mode === 'text' ? 'block' : 'none';

    canvas.style.cursor = mode === 'brush' ? 'crosshair' : 'crosshair';
}

function initDrawingCanvas() {
    let startX, startY;
    let drawingSnapshot;

    canvas.style.cursor = 'crosshair';

    canvas.onmousedown = (e) => {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        startX = (e.clientX - rect.left) * scaleX;
        startY = (e.clientY - rect.top) * scaleY;

        drawingSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

        if (drawMode === 'brush') {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
        }

        if (drawMode === 'text') {
            const text = document.getElementById('drawTextInput').value || 'Texto';
            ctx.font = `${drawSize * 3}px Arial`;
            ctx.fillStyle = drawColor;
            ctx.fillText(text, startX, startY);
            updateOriginalFromCanvas();
            isDrawing = false;
        }
    };

    canvas.onmousemove = (e) => {
        if (!isDrawing) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (drawMode === 'brush') {
            ctx.lineTo(x, y);
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = drawSize;
            ctx.lineCap = 'round';
            ctx.stroke();
        } else {
            ctx.putImageData(drawingSnapshot, 0, 0);
            drawShape(startX, startY, x, y);
        }
    };

    canvas.onmouseup = (e) => {
        if (!isDrawing) return;
        isDrawing = false;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (drawMode !== 'brush') {
            ctx.putImageData(drawingSnapshot, 0, 0);
            drawShape(startX, startY, x, y);
        }

        updateOriginalFromCanvas();
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
        case 'circle':
            const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            ctx.beginPath();
            ctx.arc(x1, y1, radius, 0, Math.PI * 2);
            ctx.stroke();
            break;
        case 'arrow':
            drawArrow(x1, y1, x2, y2);
            break;
    }
}

function drawArrow(fromX, fromY, toX, toY) {
    const headlen = 15 + drawSize;
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
    displayImage(trueOriginalImage);
    originalImage = trueOriginalImage;
}

function updateOriginalFromCanvas() {
    const img = new Image();
    img.onload = () => {
        originalImage = img;
        saveToHistory();
    };
    img.src = canvas.toDataURL();
}

let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 20;

function saveToHistory() {
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }

    historyStack.push(canvas.toDataURL());

    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    } else {
        historyIndex++;
    }
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        loadFromHistory();
    }
}

function redo() {
    if (historyIndex < historyStack.length - 1) {
        historyIndex++;
        loadFromHistory();
    }
}

function loadFromHistory() {
    const img = new Image();
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        originalImage = img;
    };
    img.src = historyStack[historyIndex];
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
    }
});

let batchImages = [];

function buildBatchControls(container) {
    batchImages = [];

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
        document.getElementById('batchFileName').textContent = `${batchImages.length} imagens selecionadas`;
        document.getElementById('batchCount').textContent = `📁 ${batchImages.length} arquivos prontos`;
        document.getElementById('btnBatchProcess').disabled = false;
    }
}

let batchResults = [];

async function processBatch() {
    if (batchImages.length === 0) return;

    const operation = document.getElementById('batchOperation').value;
    const progressDiv = document.getElementById('batchProgress');
    const progressText = document.getElementById('batchProgressText');
    const progressBar = document.getElementById('batchProgressBar');

    progressDiv.style.display = 'block';
    batchResults = [];

    for (let i = 0; i < batchImages.length; i++) {
        const file = batchImages[i];
        progressText.textContent = `Processando ${i + 1}/${batchImages.length}: ${file.name}`;
        progressBar.style.width = ((i + 1) / batchImages.length * 100) + '%';

        try {
            const result = await processSingleBatchImage(file, operation);
            batchResults.push({ name: file.name, data: result });
        } catch (error) {
            console.error('Error processing', file.name, error);
        }

        await new Promise(r => setTimeout(r, 50));
    }

    progressText.textContent = `✓ ${batchResults.length} imagens processadas!`;
    document.getElementById('batchResults').style.display = 'block';
}

function processSingleBatchImage(file, operation) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');

                switch (operation) {
                    case 'resize':
                        const maxW = 800, maxH = 600;
                        let w = img.width, h = img.height;
                        if (w > maxW) { h = h * maxW / w; w = maxW; }
                        if (h > maxH) { w = w * maxH / h; h = maxH; }
                        tempCanvas.width = w;
                        tempCanvas.height = h;
                        tempCtx.drawImage(img, 0, 0, w, h);
                        break;

                    case 'compress':
                        tempCanvas.width = img.width;
                        tempCanvas.height = img.height;
                        tempCtx.drawImage(img, 0, 0);
                        break;

                    case 'grayscale':
                        tempCanvas.width = img.width;
                        tempCanvas.height = img.height;
                        tempCtx.filter = 'grayscale(100%)';
                        tempCtx.drawImage(img, 0, 0);
                        break;

                    case 'watermark':
                        tempCanvas.width = img.width;
                        tempCanvas.height = img.height;
                        tempCtx.drawImage(img, 0, 0);
                        const text = document.getElementById('batchWatermarkText').value || 'Watermark';
                        tempCtx.font = `${Math.max(20, img.width / 15)}px Arial`;
                        tempCtx.fillStyle = 'rgba(255,255,255,0.5)';
                        tempCtx.textAlign = 'center';
                        tempCtx.fillText(text, img.width / 2, img.height - 30);
                        break;
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
    if (typeof JSZip === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        document.head.appendChild(script);
        await new Promise(r => script.onload = r);
    }

    const zip = new JSZip();

    batchResults.forEach((result, i) => {
        const base64Data = result.data.split(',')[1];
        const ext = result.name.split('.').pop();
        const newName = result.name.replace(`.${ext}`, '_processed.jpg');
        zip.file(newName, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'imagens_processadas.zip';
    a.click();
    URL.revokeObjectURL(url);
}

let scannerCorners = null;

function buildScannerControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <p style="margin-bottom: 0.5rem;">📄 Detecta automaticamente as bordas do documento e corrige a perspectiva.</p>
            <p style="opacity: 0.7; font-size: 0.9rem;">⚠️ OpenCV.js carrega ~8MB na primeira execução</p>
        </div>
        <div class="control-group">
            <button class="btn-primary" onclick="detectDocument()" style="width: 100%;" id="btnDetect">
                🔍 Detectar Documento
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
                    <button class="filter-btn" onclick="applyScanFilter('none')">📷 Original</button>
                    <button class="filter-btn" onclick="applyScanFilter('bw')">⬛ Preto/Branco</button>
                    <button class="filter-btn" onclick="applyScanFilter('contrast')">🔆 Alto Contraste</button>
                    <button class="filter-btn" onclick="applyScanFilter('magic')">✨ Mágico</button>
                </div>
            </div>
        </div>
    `;
}

async function detectDocument() {
    const progressDiv = document.getElementById('scanProgress');
    const progressText = document.getElementById('scanProgressText');
    const progressBar = document.getElementById('scanProgressBar');

    progressDiv.style.display = 'block';
    progressText.textContent = 'Verificando OpenCV...';
    progressBar.style.width = '10%';

    if (typeof cv === 'undefined' || !cvReady) {
        progressText.textContent = 'Carregando OpenCV (~8MB)...';
        let attempts = 0;
        while ((!cvReady || typeof cv === 'undefined') && attempts < 60) {
            await new Promise(r => setTimeout(r, 500));
            attempts++;
            progressBar.style.width = Math.min(40, 10 + attempts) + '%';
        }

        if (typeof cv === 'undefined') {
            progressText.textContent = '❌ Falha ao carregar OpenCV. Tente novamente.';
            return;
        }
    }

    progressText.textContent = 'Detectando bordas...';
    progressBar.style.width = '50%';

    try {
        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        const blurred = new cv.Mat();
        const edges = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

        cv.Canny(blurred, edges, 75, 200);

        progressText.textContent = 'Procurando documento...';
        progressBar.style.width = '70%';

        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        let maxArea = 0;
        let bestContour = null;

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

            const width = Math.max(
                distance(sortedCorners[0], sortedCorners[1]),
                distance(sortedCorners[3], sortedCorners[2])
            );
            const height = Math.max(
                distance(sortedCorners[0], sortedCorners[3]),
                distance(sortedCorners[1], sortedCorners[2])
            );

            const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
                sortedCorners[0].x, sortedCorners[0].y,
                sortedCorners[1].x, sortedCorners[1].y,
                sortedCorners[2].x, sortedCorners[2].y,
                sortedCorners[3].x, sortedCorners[3].y
            ]);

            const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
                0, 0,
                width, 0,
                width, height,
                0, height
            ]);

            const M = cv.getPerspectiveTransform(srcPoints, dstPoints);
            const warped = new cv.Mat();
            const dsize = new cv.Size(width, height);
            cv.warpPerspective(src, warped, M, dsize);

            cv.imshow(canvas, warped);

            const img = new Image();
            img.onload = () => { originalImage = img; };
            img.src = canvas.toDataURL();

            warped.delete();
            M.delete();
            srcPoints.delete();
            dstPoints.delete();
            bestContour.delete();

            progressBar.style.width = '100%';
            progressText.textContent = '✓ Documento detectado e recortado!';
            document.getElementById('scanActions').style.display = 'block';

        } else {
            progressText.textContent = '⚠️ Documento não encontrado. Tente com uma foto mais clara.';
            progressBar.style.width = '0%';
        }

        src.delete();
        gray.delete();
        blurred.delete();
        edges.delete();
        contours.delete();
        hierarchy.delete();

    } catch (error) {
        console.error('Scanner error:', error);
        progressText.textContent = '❌ Erro ao processar. Tente novamente.';
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

function applyScanFilter(mode) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    switch (mode) {
        case 'none':
            tempCtx.drawImage(canvas, 0, 0);
            break;
        case 'bw':
            tempCtx.filter = 'grayscale(100%) contrast(130%)';
            tempCtx.drawImage(canvas, 0, 0);
            break;
        case 'contrast':
            tempCtx.filter = 'contrast(200%) brightness(110%)';
            tempCtx.drawImage(canvas, 0, 0);
            break;
        case 'magic':
            tempCtx.filter = 'grayscale(100%) contrast(180%) brightness(120%)';
            tempCtx.drawImage(canvas, 0, 0);
            break;
    }

    ctx.drawImage(tempCanvas, 0, 0);

    const img = new Image();
    img.onload = () => { originalImage = img; };
    img.src = canvas.toDataURL();

    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

function buildUpscaleControls(container) {
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
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('upscaleResult').textContent =
        `Resultado: ${originalImage.width * factor} × ${originalImage.height * factor}`;
}

function processUpscale() {
    const newWidth = originalImage.width * upscaleFactor;
    const newHeight = originalImage.height * upscaleFactor;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = newWidth;
    tempCanvas.height = newHeight;

    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'high';
    tempCtx.drawImage(originalImage, 0, 0, newWidth, newHeight);

    canvas.width = newWidth;
    canvas.height = newHeight;
    ctx.drawImage(tempCanvas, 0, 0);

    const img = new Image();
    img.onload = () => {
        originalImage = img;
        alert(`✓ Imagem aumentada para ${newWidth} × ${newHeight} pixels!`);
    };
    img.src = canvas.toDataURL();
}

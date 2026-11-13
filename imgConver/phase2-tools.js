let isCensorshipActive = false;
let isDrawingCensorship = false;
let censorshipMode = 'pixelate';
let censorshipIntensity = 10;
let lastX = 0;
let lastY = 0;

function cleanupPhase2Tools() {
    isCirclePreviewActive = false;
    isCensorshipActive = false;
    isDrawingCensorship = false;
    isDraggingCircle = false;
}

let isCirclePreviewActive = false;
let circleCropX = null;
let circleCropY = null;
let isDraggingCircle = false;
let lastMouseX = 0;
let lastMouseY = 0;

function buildCircleCropControls(container) {
    isCirclePreviewActive = true;
    circleCropX = originalImage ? originalImage.width / 2 : 0;
    circleCropY = originalImage ? originalImage.height / 2 : 0;

    container.innerHTML = `
        <div class="control-group">
            <p style="margin-bottom: 0.75rem; opacity: 0.8;">
                O recorte circular com fundo transparente será aplicado ao aplicar ou baixar.
            </p>
            <p style="margin-bottom: 1rem; font-size: 0.9rem; color: #4ade80;">
                Arraste sobre a imagem para ajustar a posição do círculo!
            </p>
            <button id="btnCirclePreview" class="btn-secondary" onclick="toggleCirclePreview()" style="width: 100%;">
                ❌ Mostrar Original
            </button>
        </div>
    `;

    setupCircleCropEvents();
    applyCirclePreview(true);
}

function clampCircleCenter() {
    if (!originalImage) return;
    const minDim = Math.min(originalImage.width, originalImage.height);
    const radius = minDim / 2;
    circleCropX = Math.max(radius, Math.min(originalImage.width - radius, circleCropX));
    circleCropY = Math.max(radius, Math.min(originalImage.height - radius, circleCropY));
}

function renderCircleCropToCanvas() {
    if (!originalImage) return null;

    const minDim = Math.min(originalImage.width, originalImage.height);
    const radius = minDim / 2;

    if (circleCropX === null) circleCropX = originalImage.width / 2;
    if (circleCropY === null) circleCropY = originalImage.height / 2;
    clampCircleCenter();

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    tempCanvas.width = minDim;
    tempCanvas.height = minDim;

    tempCtx.beginPath();
    tempCtx.arc(radius, radius, radius, 0, Math.PI * 2);
    tempCtx.closePath();
    tempCtx.clip();

    const sourceX = circleCropX - radius;
    const sourceY = circleCropY - radius;

    tempCtx.drawImage(
        originalImage,
        sourceX, sourceY, minDim, minDim,
        0, 0, minDim, minDim
    );

    return tempCanvas;
}

function setupCircleCropEvents() {
    const signal = typeof getToolEventSignal === 'function' ? getToolEventSignal() : undefined;
    canvas.style.cursor = 'grab';

    const startDrag = (clientX, clientY) => {
        if (!isCirclePreviewActive) return;
        isDraggingCircle = true;
        canvas.style.cursor = 'grabbing';
        const rect = canvas.getBoundingClientRect();
        lastMouseX = clientX - rect.left;
        lastMouseY = clientY - rect.top;
    };

    const moveDrag = (clientX, clientY) => {
        if (!isCirclePreviewActive || !isDraggingCircle) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        const deltaX = mouseX - lastMouseX;
        const deltaY = mouseY - lastMouseY;

        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

        circleCropX += deltaX * scaleX;
        circleCropY += deltaY * scaleY;
        clampCircleCenter();

        lastMouseX = mouseX;
        lastMouseY = mouseY;

        applyCirclePreview(true);
    };

    const endDrag = () => {
        if (!isDraggingCircle) return;
        isDraggingCircle = false;
        if (isCirclePreviewActive) canvas.style.cursor = 'grab';
    };

    canvas.onmousedown = (e) => startDrag(e.clientX, e.clientY);
    canvas.onmousemove = (e) => moveDrag(e.clientX, e.clientY);
    canvas.onmouseup = endDrag;
    if (signal) {
        window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY), { signal });
        window.addEventListener('mouseup', endDrag, { signal });
    }

    canvas.ontouchstart = (e) => {
        if (!isCirclePreviewActive || e.touches.length > 1) return;
        e.preventDefault();
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
    };
    canvas.ontouchmove = (e) => {
        if (!isCirclePreviewActive || !isDraggingCircle || e.touches.length > 1) return;
        e.preventDefault();
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    };
    canvas.ontouchend = endDrag;
}

function toggleCirclePreview() {
    const btn = document.getElementById('btnCirclePreview');

    if (isCirclePreviewActive) {
        isCirclePreviewActive = false;
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(originalImage, 0, 0);
        canvas.style.cursor = 'default';

        btn.innerHTML = '👁️ Visualizar Recorte';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
    } else {
        if (circleCropX === null || circleCropY === null) {
            circleCropX = originalImage.width / 2;
            circleCropY = originalImage.height / 2;
        }

        isCirclePreviewActive = true;
        canvas.style.cursor = 'grab';
        applyCirclePreview(true);

        btn.innerHTML = '❌ Mostrar Original';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    }
}

function applyCirclePreview(redraw = false) {
    if (!isCirclePreviewActive && !redraw) return;

    const tempCanvas = renderCircleCropToCanvas();
    if (!tempCanvas) return;

    canvas.width = tempCanvas.width;
    canvas.height = tempCanvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);
}

function buildCensorControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <button class="btn-primary" onclick="detectAndCensorFaces()" style="width: 100%; margin-bottom: 1rem; background: var(--accent-color);">
                🤖 Auto-Censurar Rostos (IA)
            </button>
            <p id="face-status" style="font-size: 0.8rem; margin: -0.5rem 0 1rem 0; opacity: 0.8; display: none;"></p>

            <label>Modo de Censura</label>
            <div class="radio-group" style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="censorMode" value="pixelate" checked onchange="updateCensorMode(this.value)">
                    <span>Pixelate</span>
                </label>
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="censorMode" value="blur" onchange="updateCensorMode(this.value)">
                    <span>Blur</span>
                </label>
            </div>
            
            <label>Intensidade / Tamanho do Pincel</label>
            <input type="range" id="censorIntensity" min="5" max="50" value="20" oninput="updateCensorIntensity(this.value)">
            <span id="censorValue">20px</span>
            
            <p style="margin-top: 1rem; font-size: 0.9rem; opacity: 0.8;">
                👆 Clique e arraste na imagem para censurar manualmente.
            </p>
        </div>
    `;

    isCensorshipActive = true;
    censorshipMode = 'pixelate';
    censorshipIntensity = 20;

    setupCensorshipEvents();
}

async function ensureBlazeFaceReady() {
    if (typeof tf !== 'undefined' && typeof blazeface !== 'undefined') return;
    if (typeof loadExternalScript !== 'function') {
        throw new Error('Carregador de scripts indisponível');
    }

    await loadExternalScript(
        'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs',
        () => typeof tf !== 'undefined'
    );
    await loadExternalScript(
        'https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface',
        () => typeof blazeface !== 'undefined'
    );
}

async function detectAndCensorFaces() {
    const statusEl = document.getElementById('face-status');
    statusEl.style.display = 'block';
    statusEl.style.color = '';
    statusEl.textContent = '⏳ Carregando modelo e detectando rostos...';

    try {
        await ensureBlazeFaceReady();
        if (typeof blazeface === 'undefined') {
            throw new Error('Modelo BlazeFace indisponível');
        }
        if (!window.blazefaceModel) {
            window.blazefaceModel = await blazeface.load();
        }

        const predictions = await window.blazefaceModel.estimateFaces(canvas, false);

        if (predictions.length > 0) {
            statusEl.textContent = `✅ ${predictions.length} rosto(s) encontrado(s) e censurado(s)!`;
            statusEl.style.color = '#4ade80';

            predictions.forEach(prediction => {
                const start = prediction.topLeft;
                const end = prediction.bottomRight;
                const size = [end[0] - start[0], end[1] - start[1]];

                const padding = Math.max(size[0], size[1]) * 0.4;
                const x = start[0] - padding / 2;
                const y = start[1] - padding / 2;
                const width = size[0] + padding;
                const height = size[1] + padding;

                applyAreaCensorship(x, y, width, height);
            });

            const newImg = new Image();
            newImg.onload = () => {
                originalImage = newImg;
                if (typeof saveToHistory === 'function') saveToHistory();
            };
            newImg.src = canvas.toDataURL();

        } else {
            statusEl.textContent = '⚠️ Nenhum rosto detectado.';
            statusEl.style.color = '#fbbf24';
        }
    } catch (error) {
        console.error('Face detection error:', error);
        statusEl.textContent = '❌ Erro ao detectar rostos.';
        statusEl.style.color = '#ef4444';
    }
}

function updateCensorMode(mode) {
    censorshipMode = mode;
}

function updateCensorIntensity(val) {
    censorshipIntensity = parseInt(val);
    document.getElementById('censorValue').textContent = `${val}px`;
}

function resetToOriginal() {
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
}

function setupCensorshipEvents() {
    const signal = typeof getToolEventSignal === 'function' ? getToolEventSignal() : undefined;
    canvas.style.cursor = 'crosshair';

    canvas.onmousedown = startCensoring;
    canvas.onmousemove = drawCensor;
    canvas.onmouseup = stopCensoring;
    if (signal) {
        window.addEventListener('mouseup', stopCensoring, { signal });
    }

    canvas.ontouchstart = (e) => {
        if (!isCensorshipActive || e.touches.length > 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        startCensoring({ clientX: touch.clientX, clientY: touch.clientY });
    };
    canvas.ontouchmove = (e) => {
        if (!isDrawingCensorship || !isCensorshipActive || e.touches.length > 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        drawCensor({ clientX: touch.clientX, clientY: touch.clientY });
    };
    canvas.ontouchend = () => {
        stopCensoring();
    };
}

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY
    };
}

function startCensoring(e) {
    if (!isCensorshipActive) return;
    isDrawingCensorship = true;
    const pos = getMousePos(e);
    lastX = pos.x;
    lastY = pos.y;
    applyCensorship(pos.x, pos.y);
}

function drawCensor(e) {
    if (!isDrawingCensorship || !isCensorshipActive) return;
    const pos = getMousePos(e);

    const dist = Math.hypot(pos.x - lastX, pos.y - lastY);
    const step = Math.max(1, censorshipIntensity / 4);

    if (dist > step) {
        const steps = dist / step;
        for (let i = 0; i < steps; i++) {
            const x = lastX + (pos.x - lastX) * (i / steps);
            const y = lastY + (pos.y - lastY) * (i / steps);
            applyCensorship(x, y);
        }
    }

    applyCensorship(pos.x, pos.y);
    lastX = pos.x;
    lastY = pos.y;
}

function stopCensoring() {
    if (!isDrawingCensorship) return;
    isDrawingCensorship = false;
    const newImg = new Image();
    newImg.onload = () => {
        originalImage = newImg;
        if (typeof saveToHistory === 'function') saveToHistory();
    };
    newImg.src = canvas.toDataURL();
}

function applyCensorship(x, y) {
    applyAreaCensorship(x, y, 0, 0);
}

function applyAreaCensorship(x, y, w_override, h_override) {
    let width, height, startX, startY;

    if (w_override > 0 && h_override > 0) {
        width = w_override;
        height = h_override;
        startX = Math.max(0, x);
        startY = Math.max(0, y);
        width = Math.min(canvas.width - startX, width);
        height = Math.min(canvas.height - startY, height);
    } else {
        const size = censorshipIntensity;
        const halfSize = size / 2;
        startX = Math.max(0, x - halfSize);
        startY = Math.max(0, y - halfSize);
        width = Math.min(canvas.width - startX, size);
        height = Math.min(canvas.height - startY, size);
    }

    if (width <= 0 || height <= 0) return;

    if (censorshipMode === 'pixelate') {
        const pixelSize = Math.max(10, Math.min(width, height) / 4);
        if (pixelSize < 1) return;

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        const sw = Math.ceil(width / pixelSize);
        const sh = Math.ceil(height / pixelSize);

        if (sw <= 0 || sh <= 0) return;

        tempCanvas.width = sw;
        tempCanvas.height = sh;

        tempCtx.drawImage(originalImage,
            startX, startY, width, height,
            0, 0, sw, sh
        );

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas,
            0, 0, sw, sh,
            startX, startY, width, height
        );
        ctx.imageSmoothingEnabled = true;

    } else {
        ctx.filter = `blur(${censorshipIntensity * 1.5}px)`;

        ctx.save();
        ctx.beginPath();
        ctx.rect(startX, startY, width, height);
        ctx.clip();
        ctx.drawImage(originalImage, 0, 0);
        ctx.restore();
        ctx.filter = 'none';
    }
}

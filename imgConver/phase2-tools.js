let isCensorshipActive = false;
let isDrawingCensorship = false;
let censorshipMode = 'pixelate';
let censorshipIntensity = 10;
let lastX = 0;
let lastY = 0;

function cleanupPhase2Tools() {
    isCirclePreviewActive = false;
    isCensorshipActive = false;
    isDraggingCircle = false;
}

let isCirclePreviewActive = false;
let circleCropX = 0;
let circleCropY = 0;
let isDraggingCircle = false;
let lastMouseX = 0;
let lastMouseY = 0;

function buildCircleCropControls(container) {
    isCirclePreviewActive = false;
    circleCropX = null;
    circleCropY = null;

    container.innerHTML = `
        <div class="control-group">
            <p style="margin-bottom: 1rem; opacity: 0.8;">
                O recorte será aplicado ao baixar.
            </p>
            <p style="margin-bottom: 1rem; font-size: 0.9rem; color: #4ade80;">
                Arraste o círculo na imagem para ajustar a posição!
            </p>
            <button id="btnCirclePreview" class="btn-primary" onclick="toggleCirclePreview()" style="width: 100%;">
                👁️ Visualizar Recorte
            </button>
        </div>
    `;

    setupCircleCropEvents();
}

function setupCircleCropEvents() {
    if (canvas.hasAttribute('data-circle-events')) return;
    canvas.setAttribute('data-circle-events', 'true');

    canvas.addEventListener('mousedown', (e) => {
        if (!isCirclePreviewActive) return;
        isDraggingCircle = true;
        const rect = canvas.getBoundingClientRect();
        lastMouseX = e.clientX - rect.left;
        lastMouseY = e.clientY - rect.top;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isCirclePreviewActive || !isDraggingCircle) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const deltaX = mouseX - lastMouseX;
        const deltaY = mouseY - lastMouseY;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        circleCropX += deltaX * scaleX;
        circleCropY += deltaY * scaleY;

        lastMouseX = mouseX;
        lastMouseY = mouseY;

        applyCirclePreview(true);
    });

    canvas.addEventListener('mouseup', () => {
        isDraggingCircle = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDraggingCircle = false;
    });

    canvas.addEventListener('touchstart', (e) => {
        if (!isCirclePreviewActive) return;
        e.preventDefault();
        isDraggingCircle = true;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        lastMouseX = touch.clientX - rect.left;
        lastMouseY = touch.clientY - rect.top;
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (!isCirclePreviewActive || !isDraggingCircle) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mouseX = touch.clientX - rect.left;
        const mouseY = touch.clientY - rect.top;

        const deltaX = mouseX - lastMouseX;
        const deltaY = mouseY - lastMouseY;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        circleCropX += deltaX * scaleX;
        circleCropY += deltaY * scaleY;

        lastMouseX = mouseX;
        lastMouseY = mouseY;

        applyCirclePreview(true);
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
        isDraggingCircle = false;
    });
}

function toggleCirclePreview() {
    const btn = document.getElementById('btnCirclePreview');

    if (isCirclePreviewActive) {
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        ctx.drawImage(originalImage, 0, 0);

        btn.innerHTML = '👁️ Visualizar Recorte';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        isCirclePreviewActive = false;
    } else {
        if (circleCropX === null || circleCropY === null) {
            circleCropX = originalImage.width / 2;
            circleCropY = originalImage.height / 2;
        }

        applyCirclePreview(true);

        btn.innerHTML = '❌ Mostrar Original';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        isCirclePreviewActive = true;
    }
}

function applyCirclePreview(redraw = false) {
    if (!isCirclePreviewActive && !redraw) return;

    const minDim = Math.min(originalImage.width, originalImage.height);
    const radius = minDim / 2;

    if (circleCropX === null) circleCropX = originalImage.width / 2;
    if (circleCropY === null) circleCropY = originalImage.height / 2;

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

    tempCtx.drawImage(originalImage,
        sourceX, sourceY, minDim, minDim,
        0, 0, minDim, minDim 
    );

    canvas.width = minDim;
    canvas.height = minDim;
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

async function detectAndCensorFaces() {
    const statusEl = document.getElementById('face-status');
    statusEl.style.display = 'block';
    statusEl.textContent = '⏳ Carregando modelo e detectando rostos...';

    try {
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
            }
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
    canvas.onmousedown = startCensoring;
    canvas.onmousemove = drawCensor;
    canvas.onmouseup = stopCensoring;
    canvas.onmouseout = stopCensoring;

    canvas.ontouchstart = (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    };
    canvas.ontouchmove = (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    };
    canvas.ontouchend = () => {
        const mouseEvent = new MouseEvent('mouseup', {});
        canvas.dispatchEvent(mouseEvent);
    };
}

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
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
    const step = censorshipIntensity / 4;

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
    isDrawingCensorship = false;
    const newImg = new Image();
    newImg.onload = () => {
        originalImage = newImg;
    }
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

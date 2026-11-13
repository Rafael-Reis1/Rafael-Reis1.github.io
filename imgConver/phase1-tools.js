let tempRafId = null;

function cleanupPhase1Tools() {
    if (tempRafId !== null) {
        cancelAnimationFrame(tempRafId);
        tempRafId = null;
    }
}

function buildFlipControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <button class="btn-primary" onclick="flipImage('horizontal')" style="width: 100%; margin-bottom: 0.5rem;">
                ↔️ Virar Horizontal
            </button>
            <button class="btn-primary" onclick="flipImage('vertical')" style="width: 100%;">
                ↕️ Virar Vertical
            </button>
        </div>
    `;
}

function flipImage(direction) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    tempCanvas.width = originalImage.width;
    tempCanvas.height = originalImage.height;

    tempCtx.save();
    if (direction === 'horizontal') {
        tempCtx.scale(-1, 1);
        tempCtx.drawImage(originalImage, -tempCanvas.width, 0);
    } else {
        tempCtx.scale(1, -1);
        tempCtx.drawImage(originalImage, 0, -tempCanvas.height);
    }
    tempCtx.restore();

    const flipped = new Image();
    flipped.onload = () => {
        originalImage = flipped;
        displayImage(flipped);
        if (typeof saveToHistory === 'function') saveToHistory();
    };
    flipped.src = tempCanvas.toDataURL();
}

function buildBlurControls(container, options = {}) {
    const initialBlur = options.afterApply ? 0 : 5;
    container.innerHTML = `
        <div class="control-group">
            <label>Intensidade do Blur</label>
            <input type="range" id="blurAmount" min="0" max="20" value="${initialBlur}" step="0.5">
            <span id="blurValue">${initialBlur}px</span>
        </div>
    `;

    const slider = document.getElementById('blurAmount');
    const valueDisplay = document.getElementById('blurValue');

    slider.addEventListener('input', () => {
        valueDisplay.textContent = `${slider.value}px`;
        previewBlur();
    });

    previewBlur();
}

function previewBlur() {
    if (!originalImage) return;
    const blurAmount = parseFloat(document.getElementById('blurAmount').value) || 0;

    canvas.width = originalImage.width;
    canvas.height = originalImage.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (blurAmount <= 0) {
        ctx.drawImage(originalImage, 0, 0);
        return;
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = originalImage.width;
    tempCanvas.height = originalImage.height;
    tempCtx.filter = `blur(${blurAmount}px)`;
    tempCtx.drawImage(originalImage, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0);
}

function buildTemperatureControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Temperatura</label>
            <input type="range" id="tempAmount" min="-50" max="50" value="0" step="1">
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; opacity: 0.7;">
                <span>❄️ Frio</span>
                <span id="tempValue">0</span>
                <span>🔥 Quente</span>
            </div>
        </div>
    `;

    const slider = document.getElementById('tempAmount');
    const valueDisplay = document.getElementById('tempValue');

    slider.addEventListener('input', () => {
        valueDisplay.textContent = slider.value;
        scheduleTemperaturePreview();
    });

    previewTemperature();
}

function scheduleTemperaturePreview() {
    if (tempRafId !== null) {
        cancelAnimationFrame(tempRafId);
    }
    tempRafId = requestAnimationFrame(() => {
        tempRafId = null;
        previewTemperature();
    });
}

function previewTemperature() {
    if (!originalImage) return;
    const tempEl = document.getElementById('tempAmount');
    if (!tempEl) return;
    const tempAmount = parseInt(tempEl.value, 10) || 0;

    if (tempAmount === 0) {
        displayImage(originalImage);
        return;
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = originalImage.width;
    tempCanvas.height = originalImage.height;
    tempCtx.drawImage(originalImage, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    const rLut = new Uint8Array(256);
    const bLut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
        rLut[v] = Math.max(0, Math.min(255, v + tempAmount));
        bLut[v] = Math.max(0, Math.min(255, v - tempAmount));
    }

    for (let i = 0; i < data.length; i += 4) {
        data[i] = rLut[data[i]];
        data[i + 2] = bLut[data[i + 2]];
    }

    tempCtx.putImageData(imageData, 0, 0);

    canvas.width = tempCanvas.width;
    canvas.height = tempCanvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);
}

function buildBorderControls(container, options = {}) {
    const initialBorder = options.afterApply ? 0 : 20;
    container.innerHTML = `
        <div class="control-group">
            <label>Espessura da Borda</label>
            <input type="range" id="borderWidth" min="0" max="100" value="${initialBorder}" step="5">
            <span id="borderWidthValue">${initialBorder}px</span>
        </div>
        <div class="control-group">
            <label>Cor da Borda</label>
            <input type="color" id="borderColor" value="#ff6b35">
        </div>
    `;

    const widthSlider = document.getElementById('borderWidth');
    const widthValue = document.getElementById('borderWidthValue');
    const colorPicker = document.getElementById('borderColor');

    widthSlider.addEventListener('input', () => {
        widthValue.textContent = `${widthSlider.value}px`;
        previewBorder();
    });

    colorPicker.addEventListener('input', previewBorder);

    previewBorder();
}

function previewBorder() {
    if (!originalImage) return;
    const borderWidth = parseInt(document.getElementById('borderWidth').value, 10) || 0;
    const borderColor = document.getElementById('borderColor').value;

    if (borderWidth <= 0) {
        displayImage(originalImage);
        return;
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    tempCanvas.width = originalImage.width + (borderWidth * 2);
    tempCanvas.height = originalImage.height + (borderWidth * 2);

    tempCtx.fillStyle = borderColor;
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tempCtx.drawImage(originalImage, borderWidth, borderWidth);

    canvas.width = tempCanvas.width;
    canvas.height = tempCanvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);
}

const aspectRatios = {
    '1:1': 1,
    '16:9': 16 / 9,
    '9:16': 9 / 16,
    '4:3': 4 / 3,
    '3:4': 3 / 4,
    '3:2': 3 / 2,
    '2:3': 2 / 3
};

function buildAspectRatioControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Escolha a Proporção</label>
            <div class="filters-grid" style="grid-template-columns: repeat(3, 1fr);">
                <button class="filter-btn" onclick="applyAspectRatio('1:1', this)">1:1<br><small>Quadrado</small></button>
                <button class="filter-btn" onclick="applyAspectRatio('16:9', this)">16:9<br><small>YouTube</small></button>
                <button class="filter-btn" onclick="applyAspectRatio('9:16', this)">9:16<br><small>Stories</small></button>
                <button class="filter-btn" onclick="applyAspectRatio('4:3', this)">4:3<br><small>Clássico</small></button>
                <button class="filter-btn" onclick="applyAspectRatio('3:4', this)">3:4<br><small>Retrato</small></button>
                <button class="filter-btn" onclick="applyAspectRatio('3:2', this)">3:2<br><small>DSLR</small></button>
            </div>
        </div>
        <div class="control-group">
            <p style="opacity: 0.7; font-size: 0.9rem;">
                💡 A imagem será recortada do centro para caber na proporção escolhida.
            </p>
        </div>
    `;
}

function applyAspectRatio(ratioKey, btn) {
    const targetRatio = aspectRatios[ratioKey];
    const sourceImg = trueOriginalImage || originalImage;
    if (!targetRatio || !sourceImg) return;

    const imgWidth = sourceImg.width;
    const imgHeight = sourceImg.height;
    const currentRatio = imgWidth / imgHeight;

    let cropWidth, cropHeight, cropX, cropY;

    if (currentRatio > targetRatio) {
        cropHeight = imgHeight;
        cropWidth = Math.round(imgHeight * targetRatio);
        cropX = Math.round((imgWidth - cropWidth) / 2);
        cropY = 0;
    } else {
        cropWidth = imgWidth;
        cropHeight = Math.round(imgWidth / targetRatio);
        cropX = 0;
        cropY = Math.round((imgHeight - cropHeight) / 2);
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = cropWidth;
    tempCanvas.height = cropHeight;

    tempCtx.drawImage(
        sourceImg,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
    );

    canvas.width = cropWidth;
    canvas.height = cropHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);

    const croppedImg = new Image();
    croppedImg.onload = () => {
        originalImage = croppedImg;
        if (typeof saveToHistory === 'function') saveToHistory();
    };
    croppedImg.src = canvas.toDataURL();

    document.querySelectorAll('#controls .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

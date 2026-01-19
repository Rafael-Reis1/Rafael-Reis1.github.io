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
    };
    flipped.src = tempCanvas.toDataURL();
}

function buildBlurControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Intensidade do Blur</label>
            <input type="range" id="blurAmount" min="0" max="20" value="5" step="0.5">
            <span id="blurValue">5px</span>
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
    const blurAmount = document.getElementById('blurAmount').value;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    tempCanvas.width = originalImage.width;
    tempCanvas.height = originalImage.height;

    tempCtx.filter = `blur(${blurAmount}px)`;
    tempCtx.drawImage(originalImage, 0, 0);

    canvas.width = tempCanvas.width;
    canvas.height = tempCanvas.height;
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
        previewTemperature();
    });

    previewTemperature();
}

function previewTemperature() {
    const tempAmount = parseInt(document.getElementById('tempAmount').value);

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    tempCanvas.width = originalImage.width;
    tempCanvas.height = originalImage.height;

    tempCtx.drawImage(originalImage, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        if (tempAmount > 0) {
            data[i] = Math.min(255, data[i] + tempAmount);
            data[i + 2] = Math.max(0, data[i + 2] - tempAmount);
        } else {
            data[i] = Math.max(0, data[i] + tempAmount);
            data[i + 2] = Math.min(255, data[i + 2] - tempAmount);
        }
    }

    tempCtx.putImageData(imageData, 0, 0);

    canvas.width = tempCanvas.width;
    canvas.height = tempCanvas.height;
    ctx.drawImage(tempCanvas, 0, 0);
}

function buildBorderControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Espessura da Borda</label>
            <input type="range" id="borderWidth" min="5" max="100" value="20" step="5">
            <span id="borderWidthValue">20px</span>
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
    const borderWidth = parseInt(document.getElementById('borderWidth').value);
    const borderColor = document.getElementById('borderColor').value;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    tempCanvas.width = originalImage.width + (borderWidth * 2);
    tempCanvas.height = originalImage.height + (borderWidth * 2);

    tempCtx.fillStyle = borderColor;
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tempCtx.drawImage(originalImage, borderWidth, borderWidth);

    canvas.width = tempCanvas.width;
    canvas.height = tempCanvas.height;
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
                <button class="filter-btn" onclick="applyAspectRatio('1:1')">1:1<br><small>Quadrado</small></button>
                <button class="filter-btn" onclick="applyAspectRatio('16:9')">16:9<br><small>YouTube</small></button>
                <button class="filter-btn" onclick="applyAspectRatio('9:16')">9:16<br><small>Stories</small></button>
                <button class="filter-btn" onclick="applyAspectRatio('4:3')">4:3<br><small>Clássico</small></button>
                <button class="filter-btn" onclick="applyAspectRatio('3:4')">3:4<br><small>Retrato</small></button>
                <button class="filter-btn" onclick="applyAspectRatio('3:2')">3:2<br><small>DSLR</small></button>
            </div>
        </div>
        <div class="control-group">
            <p style="opacity: 0.7; font-size: 0.9rem;">
                💡 A imagem será recortada do centro para caber na proporção escolhida.
            </p>
        </div>
    `;
}

function applyAspectRatio(ratioKey) {
    const targetRatio = aspectRatios[ratioKey];
    const sourceImg = trueOriginalImage;
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
    ctx.drawImage(tempCanvas, 0, 0);

    const croppedImg = new Image();
    croppedImg.onload = () => {
        originalImage = croppedImg;
    };
    croppedImg.src = canvas.toDataURL();

    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.closest('.filter-btn').classList.add('active');
}

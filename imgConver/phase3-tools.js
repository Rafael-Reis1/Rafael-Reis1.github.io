let collageImages = [];

function buildCollageControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Adicionar Imagens</label>
            
            <div class="custom-file-upload">
                <label for="collageInput" class="file-upload-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>Escolher fotos...</span>
                </label>
                <input type="file" id="collageInput" accept="image/*" multiple onchange="handleCollageParams()" style="display: none;">
            </div>

            <!-- Image List Container -->
            <div id="collageImageList" class="collage-list"></div>
            
            <label>Layout</label>
            <select id="collageLayout" class="custom-select" onchange="renderCollage()">
                <option value="auto">Automático (Grid)</option>
                <option value="horizontal">Horizontal (Lado a Lado)</option>
                <option value="vertical">Vertical (Empilhado)</option>
            </select>
            
            <label>Espaçamento / Borda</label>
            <input type="range" id="collageGap" min="0" max="50" value="10" oninput="renderCollage()">
            <label>Cor de Fundo</label>
            <input type="color" id="collageBg" value="#ffffff" oninput="renderCollage()">
            
            <button class="btn-secondary" onclick="resetCollage()" style="width: 100%; margin-top: 1rem;">
                Limpar Colagem
            </button>
        </div>
    `;

    if (collageImages.length === 0 && originalImage) {
        collageImages.push(originalImage);
    }

    setTimeout(() => initCustomSelects(), 0);
    renderCollage();
    renderCollageImageList();
}

async function handleCollageParams() {
    const input = document.getElementById('collageInput');
    if (input.files && input.files.length > 0) {
        const files = Array.from(input.files);

        for (const file of files) {
            await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        collageImages.push(img);
                        resolve();
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        }
        renderCollage();
        renderCollageImageList();
    }
}

function resetCollage() {
    collageImages = [];
    if (originalImage) collageImages.push(originalImage);
    renderCollage();
    renderCollageImageList();
}

function removeCollageImage(index) {
    collageImages.splice(index, 1);
    renderCollage();
    renderCollageImageList();
}

function renderCollageImageList() {
    const container = document.getElementById('collageImageList');
    if (!container) return;

    container.innerHTML = '';

    if (collageImages.length === 0) {
        container.innerHTML = '<p style="opacity: 0.5; font-size: 0.8rem;">Nenhuma imagem selecionada</p>';
        return;
    }

    collageImages.forEach((img, index) => {
        const item = document.createElement('div');
        item.className = 'collage-item';

        const thumb = document.createElement('img');
        thumb.src = img.src;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => removeCollageImage(index);

        item.appendChild(thumb);
        item.appendChild(removeBtn);
        container.appendChild(item);
    });
}

function renderCollage() {
    if (collageImages.length === 0) return;

    const layout = document.getElementById('collageLayout') ? document.getElementById('collageLayout').value : 'auto';
    const gap = document.getElementById('collageGap') ? parseInt(document.getElementById('collageGap').value) : 10;
    const bgColor = document.getElementById('collageBg') ? document.getElementById('collageBg').value : '#ffffff';

    const targetWidth = 1200;
    let targetHeight = 1200;

    let rows = 1;
    let cols = 1;

    if (layout === 'horizontal') {
        cols = collageImages.length;
        rows = 1;
    } else if (layout === 'vertical') {
        cols = 1;
        rows = collageImages.length;
    } else {
        cols = Math.ceil(Math.sqrt(collageImages.length));
        rows = Math.ceil(collageImages.length / cols);
    }

    const cellWidth = (targetWidth - (gap * (cols + 1))) / cols;
    const cellHeight = cellWidth;

    targetHeight = (cellHeight * rows) + (gap * (rows + 1));

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    collageImages.forEach((img, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);

        const x = gap + (col * (cellWidth + gap));
        const y = gap + (row * (cellHeight + gap));

        drawImageCover(ctx, img, x, y, cellWidth, cellHeight);
    });
}

function drawImageCover(ctx, img, x, y, w, h) {
    const imgRatio = img.width / img.height;
    const boxRatio = w / h;

    let sx, sy, sWidth, sHeight;

    if (imgRatio > boxRatio) {
        sHeight = img.height;
        sWidth = img.height * boxRatio;
        sx = (img.width - sWidth) / 2;
        sy = 0;
    } else {
        sWidth = img.width;
        sHeight = img.width / boxRatio;
        sx = 0;
        sy = (img.height - sHeight) / 2;
    }

    ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, w, h);
}

function buildArtisticControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Efeito</label>
            <div class="filters-grid">
                <button class="filter-btn" onclick="applyArtisticEffect('none')">Normal</button>
                <button class="filter-btn" onclick="applyArtisticEffect('sketch')">Sketch</button>
                <button class="filter-btn" onclick="applyArtisticEffect('posterize')">Pop Art</button>
                <button class="filter-btn" onclick="applyArtisticEffect('edge')">Bordas</button>
            </div>
        </div>
    `;
}

function applyArtisticEffect(effect) {
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    if (effect === 'none') {
        return;
    }

    if (effect === 'sketch') {
        greyScale(data);
        const edges = sobel(data, width, height);
        for (let i = 0; i < data.length; i += 4) {
            const val = 255 - edges[i];
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
        }
    }
    else if (effect === 'posterize') {
        const levels = 4;
        const step = 255 / levels;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.floor(data[i] / step) * step;
            data[i + 1] = Math.floor(data[i + 1] / step) * step;
            data[i + 2] = Math.floor(data[i + 2] / step) * step;
        }
    }
    else if (effect === 'edge') {
        const edges = sobel(data, width, height);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = edges[i];
            data[i + 1] = edges[i + 1];
            data[i + 2] = edges[i + 2];
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

function greyScale(data) {
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg;
        data[i + 1] = avg;
        data[i + 2] = avg;
    }
}

function sobel(data, width, height) {
    const grayscale = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        grayscale[i] = avg;
        grayscale[i + 1] = avg;
        grayscale[i + 2] = avg;
        grayscale[i + 3] = 255;
    }

    const output = new Uint8ClampedArray(data.length);
    const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let pixelX = 0;
            let pixelY = 0;

            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    const val = grayscale[idx];
                    pixelX += val * kernelX[(ky + 1) * 3 + (kx + 1)];
                    pixelY += val * kernelY[(ky + 1) * 3 + (kx + 1)];
                }
            }

            const magnitude = Math.sqrt(pixelX * pixelX + pixelY * pixelY);
            const idx = (y * width + x) * 4;
            output[idx] = magnitude;
            output[idx + 1] = magnitude;
            output[idx + 2] = magnitude;
            output[idx + 3] = 255;
        }
    }
    return output;
}

function buildOCRControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <button class="btn-primary" onclick="runOCR('por')" style="width: 100%; margin-bottom: 1rem;">
                📝 Extrair Texto (PT-BR)
            </button>
             <button class="btn-secondary" onclick="runOCR('eng')" style="width: 100%; margin-bottom: 1rem;">
                📝 Extract Text (OR)
            </button>
            <button class="btn-primary" onclick="detectAndCensorText()" style="width: 100%; margin-bottom: 1rem; background: #000;">
                🕵️ Censurar Texto Detectado
            </button>
            
            <p id="ocr-status" style="font-size: 0.8rem; margin-bottom: 1rem; display: none;">Carregando...</p>
            
            <label>Texto Extraído</label>
            <textarea id="ocrBox" class="text-input" rows="8" placeholder="O texto aparecerá aqui..." readonly style="width: 100%; font-family: monospace;"></textarea>
            
            <button class="btn-secondary" onclick="copyOCR()" style="width: 100%; margin-top: 0.5rem;">
                📋 Copiar Texto
            </button>
        </div>
    `;
}

async function runOCR(lang = 'por') {
    const status = document.getElementById('ocr-status');
    const output = document.getElementById('ocrBox');

    status.style.display = 'block';
    status.style.color = 'var(--text-color)';
    status.textContent = '⏳ Inicializando Tesseract e processando...';
    output.value = '';

    try {
        const result = await Tesseract.recognize(
            canvas,
            lang,
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        status.textContent = `⏳ Lendo texto: ${Math.round(m.progress * 100)}%`;
                    }
                }
            }
        );

        output.value = result.data.text;
        status.textContent = '✅ Texto extraído com sucesso!';
        status.style.color = '#4ade80';

    } catch (err) {
        console.error(err);
        status.textContent = '❌ Erro ao extrair texto.';
        status.style.color = '#ef4444';
    }
}

function copyOCR() {
    const output = document.getElementById('ocrBox');
    output.select();
    document.execCommand('copy');
    alert('Texto copiado!');
}

async function detectAndCensorText() {
    const status = document.getElementById('ocr-status');
    status.style.display = 'block';
    status.textContent = '⏳ Detectando texto para censura...';

    try {
        const result = await Tesseract.recognize(canvas, 'por');

        const words = result.data.words;

        ctx.fillStyle = 'black';

        words.forEach(word => {
            const bbox = word.bbox;
            const x = bbox.x0;
            const y = bbox.y0;
            const w = bbox.x1 - bbox.x0;
            const h = bbox.y1 - bbox.y0;

            const pad = 2;

            ctx.fillRect(x - pad, y - pad, w + (pad * 2), h + (pad * 2));
        });

        status.textContent = `✅ ${words.length} palavras censuradas!`;
        status.style.color = '#4ade80';

        const newImg = new Image();
        newImg.onload = () => {
            originalImage = newImg;
        }
        newImg.src = canvas.toDataURL();

    } catch (err) {
        console.error(err);
        status.textContent = '❌ Erro ao censurar.';
    }
}

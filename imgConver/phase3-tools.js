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

async function addCollageFiles(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    collageImages.push(img);
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = e.target.result;
            };
            reader.onerror = () => resolve();
            reader.readAsDataURL(file);
        });
    }

    renderCollage();
    renderCollageImageList();
}

async function handleCollageParams() {
    const input = document.getElementById('collageInput');
    if (input.files && input.files.length > 0) {
        await addCollageFiles(Array.from(input.files));
        input.value = '';
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
    if (!canvas || !ctx) return;

    const layout = document.getElementById('collageLayout') ? document.getElementById('collageLayout').value : 'auto';
    const gap = document.getElementById('collageGap') ? parseInt(document.getElementById('collageGap').value, 10) : 10;
    const bgColor = document.getElementById('collageBg') ? document.getElementById('collageBg').value : '#ffffff';

    if (collageImages.length === 0) {
        canvas.width = 800;
        canvas.height = 500;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(247, 247, 247, 0.55)';
        ctx.font = '600 22px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Adicione imagens no painel para montar a colagem', canvas.width / 2, canvas.height / 2);
        return;
    }

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

    const baseWidth = 1200;
    const minCell = 120;
    const targetWidth = Math.max(baseWidth, cols * minCell + gap * (cols + 1));
    const cellWidth = (targetWidth - (gap * (cols + 1))) / cols;
    const cellHeight = cellWidth;
    const targetHeight = (cellHeight * rows) + (gap * (rows + 1));

    canvas.width = Math.round(targetWidth);
    canvas.height = Math.round(targetHeight);

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
                <button class="filter-btn active" onclick="applyArtisticEffect('none', this)">Normal</button>
                <button class="filter-btn" onclick="applyArtisticEffect('sketch', this)">Sketch</button>
                <button class="filter-btn" onclick="applyArtisticEffect('posterize', this)">Pop Art</button>
                <button class="filter-btn" onclick="applyArtisticEffect('edge', this)">Bordas</button>
            </div>
        </div>
    `;
}

function applyArtisticEffect(effect, btn) {
    if (!originalImage) return;

    document.querySelectorAll('#controls .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    canvas.width = originalImage.width;
    canvas.height = originalImage.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0);

    if (effect === 'none') {
        return;
    }

    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    if (effect === 'sketch') {
        const edges = sobel(data, width, height);
        for (let p = 0, i = 0; i < data.length; i += 4, p++) {
            const val = 255 - edges[p];
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
        }
    } else if (effect === 'posterize') {
        const levels = 4;
        const step = 255 / levels;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.floor(data[i] / step) * step;
            data[i + 1] = Math.floor(data[i + 1] / step) * step;
            data[i + 2] = Math.floor(data[i + 2] / step) * step;
        }
    } else if (effect === 'edge') {
        const edges = sobel(data, width, height);
        for (let p = 0, i = 0; i < data.length; i += 4, p++) {
            const val = edges[p];
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
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
    const totalPixels = width * height;
    const gray = new Uint8Array(totalPixels);
    for (let p = 0, i = 0; p < totalPixels; p++, i += 4) {
        gray[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    }

    const output = new Uint8ClampedArray(totalPixels);
    for (let y = 1; y < height - 1; y++) {
        const rowPrev = (y - 1) * width;
        const rowCurr = y * width;
        const rowNext = (y + 1) * width;

        for (let x = 1; x < width - 1; x++) {
            const tl = gray[rowPrev + x - 1];
            const tc = gray[rowPrev + x];
            const tr = gray[rowPrev + x + 1];
            const ml = gray[rowCurr + x - 1];
            const mr = gray[rowCurr + x + 1];
            const bl = gray[rowNext + x - 1];
            const bc = gray[rowNext + x];
            const br = gray[rowNext + x + 1];

            const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
            const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
            output[rowCurr + x] = Math.min(255, Math.hypot(gx, gy));
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
                📝 Extract Text (EN)
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

async function ensureTesseractReady() {
    if (typeof Tesseract !== 'undefined') return;
    if (typeof loadExternalScript !== 'function') {
        throw new Error('Biblioteca Tesseract.js indisponível');
    }

    await loadExternalScript(
        'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
        () => typeof Tesseract !== 'undefined'
    );
}

async function runOCR(lang = 'por') {
    const status = document.getElementById('ocr-status');
    const output = document.getElementById('ocrBox');

    status.style.display = 'block';
    status.style.color = 'var(--text-color)';
    status.textContent = '⏳ Inicializando Tesseract e processando...';
    output.value = '';

    try {
        await ensureTesseractReady();
        if (typeof Tesseract === 'undefined') {
            throw new Error('Biblioteca Tesseract.js indisponível');
        }
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
    if (!output || !output.value) {
        if (typeof showToast === 'function') showToast('Nenhum texto para copiar.', 'error');
        return;
    }
    if (typeof copyTextToClipboard === 'function') {
        copyTextToClipboard(output.value, 'Texto copiado!');
    }
}

async function detectAndCensorText() {
    const status = document.getElementById('ocr-status');
    status.style.display = 'block';
    status.style.color = 'var(--text-color)';
    status.textContent = '⏳ Detectando texto para censura...';

    try {
        await ensureTesseractReady();
        if (typeof Tesseract === 'undefined') {
            throw new Error('Biblioteca Tesseract.js indisponível');
        }
        const result = await Tesseract.recognize(canvas, 'por', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    status.textContent = `⏳ Analisando imagem: ${Math.round(m.progress * 100)}%`;
                }
            }
        });

        const words = result.data.words || [];
        if (words.length === 0) {
            status.textContent = '⚠️ Nenhum texto detectado na imagem.';
            status.style.color = '#fbbf24';
            return;
        }

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

        status.textContent = `✅ ${words.length} palavra(s) censurada(s)!`;
        status.style.color = '#4ade80';

        const newImg = new Image();
        newImg.onload = () => {
            originalImage = newImg;
            if (typeof saveToHistory === 'function') saveToHistory();
        };
        newImg.src = canvas.toDataURL();

    } catch (err) {
        console.error(err);
        status.textContent = '❌ Erro ao censurar texto.';
        status.style.color = '#ef4444';
    }
}

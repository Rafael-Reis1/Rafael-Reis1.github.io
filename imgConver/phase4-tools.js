let memeTopText = '';
let memeBottomText = '';

const MEME_TEMPLATES = [
    { top: "QUANDO O CLIENTE", bottom: "PEDE PRA AUMENTAR A LOGO" },
    { top: "EXPECTATIVA", bottom: "REALIDADE" },
    { top: "QUANDO VÊ", bottom: "JÁ É TERÇA-FEIRA" },
    { top: "O QUE FAZEMOS HOJE?", bottom: "O MESMO DE SEMPRE, PINKY" },
    { top: "CONFIA", bottom: "VAI DAR CERTO" },
    { top: "EU VENDO O BUG", bottom: "QUE EU MESMO CRIEI" },
    { top: "NA MINHA MÁQUINA", bottom: "FUNCIONA" },
    { top: "QUANDO O CHEFE CHEGA", bottom: "E EU TÔ NO YOUTUBE" },
    { top: "SENIOR DEVELOPER", bottom: "PESQUISANDO COMO CENTRALIZAR DIV" },
    { top: "O PRAZO ERA ONTEM?", bottom: "" },
    { top: "QUANDO O SQL", bottom: "VOLTA SEM WHERE" },
    { top: "GIMME", bottom: "COFFEE" },
    { top: "", bottom: "SÓ PEÇO PACIÊNCIA" },
    { top: "A MIMIR", bottom: "" },
    { top: "MUITO TEXTO", bottom: "NÃO VOU LER" }
];

function buildMemeControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Texto Superior</label>
            <input type="text" id="memeTop" class="text-input" placeholder="DIGITE ALGO..." oninput="updateMemeText('top', this.value)">
            
            <label style="margin-top: 1rem;">Texto Inferior</label>
            <input type="text" id="memeBottom" class="text-input" placeholder="MEME TEXT" oninput="updateMemeText('bottom', this.value)">
            
            <button class="btn-secondary" onclick="generateRandomMeme()" style="margin-top: 1rem; width: 100%;">
                🎲 Texto Aleatório
            </button>
            <p style="margin-top: 1rem; font-size: 0.9rem; opacity: 0.7;">
                💡 A fonte é ajustada automaticamente para caber na imagem.
            </p>
        </div>
    `;

    memeTopText = '';
    memeBottomText = '';
    applyMemePreview();
}

function generateRandomMeme() {
    const random = MEME_TEMPLATES[Math.floor(Math.random() * MEME_TEMPLATES.length)];

    document.getElementById('memeTop').value = random.top;
    document.getElementById('memeBottom').value = random.bottom;

    updateMemeText('top', random.top);
    updateMemeText('bottom', random.bottom);
}

function updateMemeText(position, text) {
    if (position === 'top') memeTopText = text.toUpperCase();
    if (position === 'bottom') memeBottomText = text.toUpperCase();
    applyMemePreview();
}

function applyMemePreview() {
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    if (!memeTopText && !memeBottomText) return;

    const width = canvas.width;
    const height = canvas.height;

    const fontSize = width / 10;
    ctx.font = `900 ${fontSize}px Impact, sans-serif`;
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = fontSize / 15;
    ctx.textAlign = 'center';

    if (memeTopText) {
        ctx.textBaseline = 'top';
        ctx.strokeText(memeTopText, width / 2, fontSize / 2);
        ctx.fillText(memeTopText, width / 2, fontSize / 2);
    }

    if (memeBottomText) {
        ctx.textBaseline = 'bottom';
        ctx.strokeText(memeBottomText, width / 2, height - (fontSize / 2));
        ctx.fillText(memeBottomText, width / 2, height - (fontSize / 2));
    }
}

function buildPrivacyControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <div class="alert-box" style="background: rgba(74, 222, 128, 0.1); border: 1px solid #4ade80; color: #4ade80; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.5rem 0;">🛡️ Modo Protegido</h4>
                <p style="font-size: 0.9rem; opacity: 0.9 margin: 0;">
                    Ao processar imagens aqui, todos os metadados (GPS, modelo da câmera, data) são <strong>automaticamente removidos</strong>.
                </p>
            </div>
            
            <p style="opacity: 0.8; font-size: 0.9rem;">
                O Canvas do navegador recria a imagem do zero, o que garante que nenhum dado oculto do arquivo original seja preservado no download.
            </p>
        </div>
    `;
}

let isColorPickerActive = false;

function buildTechnicalControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Ferramenta</label>
            <div class="radio-group" style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="techTool" value="base64" checked onchange="toggleTechTool(this.value)">
                    <span>Base64</span>
                </label>
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="techTool" value="picker" onchange="toggleTechTool(this.value)">
                    <span>Color Picker</span>
                </label>
            </div>

            <!-- Base64 Area -->
            <div id="base64Section">
                <p style="font-size: 0.9rem; opacity: 0.8; margin-bottom: 0.5rem;">Base64 da imagem (Copie ou Cole aqui):</p>
                <textarea id="base64Output" style="width: 100%; height: 100px; background: #0f0f13; border: 1px solid var(--border-color); color: var(--text-color); border-radius: 4px; padding: 0.5rem; font-family: monospace; font-size: 0.8rem; resize: vertical;"></textarea>
                
                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                    <button class="btn-secondary" onclick="copyBase64()" style="flex: 1;">
                        📋 Copiar
                    </button>
                    <button class="btn-primary" onclick="loadBase64Image()" style="flex: 1; background: var(--accent-color);">
                        🖼️ Carregar Imagem
                    </button>
                </div>
            </div>

            <!-- Color Picker Area -->
            <div id="pickerSection" style="display: none;">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; background: #0f0f13; padding: 0.5rem; border-radius: 8px; border: 1px solid var(--border-color);">
                    <div id="colorPreview" style="width: 40px; height: 40px; border-radius: 4px; background: #000; border: 2px solid #fff;"></div>
                    <div>
                        <div id="hexValue" style="font-family: monospace; font-size: 1.1rem; font-weight: bold;">#000000</div>
                        <div id="rgbValue" style="font-size: 0.8rem; opacity: 0.7;">rgb(0, 0, 0)</div>
                    </div>
                </div>
                <p style="font-size: 0.9rem; color: #4ade80;">
                    👆 Passe o mouse sobre a imagem para ver a cor. Clique para copiar o HEX.
                </p>
                <p id="copyFeedback" style="font-size: 0.8rem; color: #4ade80; opacity: 0; transition: opacity 0.3s;">
                    Copiado para a área de transferência!
                </p>
            </div>
        </div>
    `;

    const dataURL = canvas.toDataURL('image/png');
    document.getElementById('base64Output').value = dataURL;

    setupColorPickerEvents();
}

function toggleTechTool(mode) {
    const base64Sec = document.getElementById('base64Section');
    const pickerSec = document.getElementById('pickerSection');

    if (mode === 'base64') {
        base64Sec.style.display = 'block';
        pickerSec.style.display = 'none';
        isColorPickerActive = false;
        canvas.style.cursor = 'default';
    } else {
        base64Sec.style.display = 'none';
        pickerSec.style.display = 'block';
        isColorPickerActive = true;
        canvas.style.cursor = 'crosshair';
    }
}

function copyBase64() {
    const textarea = document.getElementById('base64Output');
    textarea.select();
    document.execCommand('copy');
    const originalText = document.querySelector('button[onclick="copyBase64()"]').innerHTML;
    document.querySelector('button[onclick="copyBase64()"]').innerHTML = '✅ Copiado!';
    setTimeout(() => {
        document.querySelector('button[onclick="copyBase64()"]').innerHTML = originalText;
    }, 2000);
}

function loadBase64Image() {
    const textarea = document.getElementById('base64Output');
    const base64Str = textarea.value.trim();

    if (!base64Str) {
        alert('Por favor, cole uma string Base64 válida primeiro.');
        return;
    }

    const img = new Image();
    img.onload = () => {
        originalImage = img;
        trueOriginalImage = img;

        if (typeof resetCollage === 'function') resetCollage();

        displayImage(img);
        alert('Imagem carregada com sucesso do Base64!');
    };
    img.onerror = () => {
        alert('Erro ao carregar imagem. Verifique se o código Base64 está correto (ex: deve começar com data:image/png;base64,...)');
    };
    img.src = base64Str;
}

function setupColorPickerEvents() {
    if (canvas.hasAttribute('data-picker-events')) return;
    canvas.setAttribute('data-picker-events', 'true');

    canvas.addEventListener('mousemove', (e) => {
        if (!isColorPickerActive) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);

        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const r = pixel[0];
        const g = pixel[1];
        const b = pixel[2];
        const hex = rgbToHex(r, g, b);

        document.getElementById('colorPreview').style.backgroundColor = hex;
        document.getElementById('hexValue').textContent = hex.toUpperCase();
        document.getElementById('rgbValue').textContent = `rgb(${r}, ${g}, ${b})`;
    });

    canvas.addEventListener('click', () => {
        if (!isColorPickerActive) return;

        const hex = document.getElementById('hexValue').textContent;
        navigator.clipboard.writeText(hex).then(() => {
            const feedback = document.getElementById('copyFeedback');
            feedback.style.opacity = '1';
            setTimeout(() => feedback.style.opacity = '0', 2000);
        });
    });
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function openBase64Modal() {
    const modal = document.getElementById('base64Modal');
    modal.style.display = 'flex';
}

function closeBase64Modal() {
    const modal = document.getElementById('base64Modal');
    modal.style.display = 'none';
}

function loadBase64FromModal() {
    const textarea = document.getElementById('base64InputModal');
    const base64Str = textarea.value.trim();

    if (!base64Str) {
        alert('Por favor, cole uma string Base64 válida.');
        return;
    }

    const img = new Image();
    img.onload = () => {
        originalImage = img;
        trueOriginalImage = img;

        if (typeof resetCollage === 'function') resetCollage();

        displayImage(img);
        showEditor();
        buildControls();
        closeBase64Modal();

        textarea.value = '';
    };
    img.onerror = () => {
        alert('Erro ao carregar imagem. Verifique se o código Base64 é válido.');
    };
    img.src = base64Str;
}

window.onclick = function (event) {
    const modal = document.getElementById('base64Modal');
    if (event.target == modal) {
        closeBase64Modal();
    }
}

function cleanupPhase4Tools() {
    isColorPickerActive = false;
    if (canvas) canvas.style.cursor = 'default';
}

let bgWorker = null;
let bgWorkerCallbacks = {};
let bgWorkerMsgId = 0;

function getBgWorker() {
    if (!bgWorker) {
        bgWorker = new Worker('bg-worker.js', { type: 'module' });
        bgWorker.onmessage = (e) => {
            const { id, type, resultBlob, error, key, current, total } = e.data;
            if (bgWorkerCallbacks[id]) {
                if (type === 'success') {
                    bgWorkerCallbacks[id].resolve(resultBlob);
                    delete bgWorkerCallbacks[id];
                } else if (type === 'error') {
                    bgWorkerCallbacks[id].reject(new Error(error));
                    delete bgWorkerCallbacks[id];
                } else if (type === 'progress' && bgWorkerCallbacks[id].onProgress) {
                    bgWorkerCallbacks[id].onProgress(key, current, total);
                }
            }
        };
    }
    return bgWorker;
}

function removeBackgroundWorker(blob, onProgress) {
    return new Promise((resolve, reject) => {
        const worker = getBgWorker();
        const id = ++bgWorkerMsgId;
        bgWorkerCallbacks[id] = { resolve, reject, onProgress };
        worker.postMessage({ id, blob });
    });
}

async function buildRemoveBgControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <p style="margin-bottom: 0.5rem;">A IA irá processar a imagem e remover o fundo automaticamente.</p>
            <p style="opacity: 0.7; font-size: 0.9rem; margin: 0;">
                ⚠️ Primeira execução: download de modelo (~20MB)<br>
                ⏱️ Processamento: 5-15 segundos
            </p>
        </div>
        <div class="control-group">
            <button class="btn-primary" onclick="processRemoveBackground()" style="width: 100%;">
                🤖 Processar com IA
            </button>
        </div>
        <div id="bg-progress" style="display: none;">
            <div style="background: var(--glass-bg); border-radius: 8px; padding: 1rem;">
                <p id="progress-text" style="margin: 0 0 0.5rem 0;">Inicializando...</p>
                <div style="background: var(--base-color); height: 8px; border-radius: 4px; overflow: hidden;">
                    <div id="progress-bar" style="background: var(--accent-color); height: 100%; width: 0%; transition: width 0.3s;"></div>
                </div>
            </div>
        </div>
    `;
}

async function processRemoveBackground() {
    const progressDiv = document.getElementById('bg-progress');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');

    try {
        progressDiv.style.display = 'block';
        progressText.textContent = 'Preparando...';
        progressBar.style.width = '5%';

        const blob = await new Promise(resolve => canvas.toBlob(resolve));

        const resultBlob = await removeBackgroundWorker(blob, (key, current, total) => {
            const pct = Math.round((current / total) * 100);
            progressBar.style.width = `${pct}%`;
            if (key.includes('fetch')) {
                progressText.textContent = `Carregando modelo: ${pct}%`;
            } else {
                progressText.textContent = `Processando IA: ${pct}%`;
            }
        });
        progressBar.style.width = '100%';
        progressText.textContent = 'Concluído! ✓';

        const url = URL.createObjectURL(resultBlob);
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            displayImage(img);

            setTimeout(() => {
                progressDiv.style.display = 'none';
                progressBar.style.width = '0%';
            }, 1000);

            URL.revokeObjectURL(url);
        };
        img.src = url;

    } catch (error) {
        console.error('Erro ao remover fundo:', error);
        progressText.textContent = '❌ Erro ao processar. Tente novamente.';
        progressText.style.color = 'var(--accent-color)';
        progressBar.style.width = '0%';

        setTimeout(() => {
            progressDiv.style.display = 'none';
            progressText.style.color = '';
        }, 3000);
    }
}

async function buildBlurBgControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <p style="margin-bottom: 0.5rem;">A IA irá detectar o objeto principal e desfocar apenas o fundo.</p>
            <p style="opacity: 0.7; font-size: 0.9rem; margin: 0;">
                ⚠️ Primeira execução: download de modelo (~20MB)<br>
                ⏱️ Processamento: 10-20 segundos
            </p>
        </div>
        <div class="control-group">
            <label>Intensidade do Desfoque</label>
            <input type="range" id="bgBlurIntensity" min="5" max="30" value="15" oninput="document.getElementById('blurValue').textContent = this.value + 'px'">
            <span id="blurValue">15px</span>
        </div>
        <div class="control-group">
            <button class="btn-primary" onclick="processBlurBackground()" style="width: 100%;">
                🤖 Desfocar Fundo com IA
            </button>
        </div>
        <div id="blur-bg-progress" style="display: none;">
            <div style="background: var(--glass-bg); border-radius: 8px; padding: 1rem;">
                <p id="blur-progress-text" style="margin: 0 0 0.5rem 0;">Inicializando...</p>
                <div style="background: var(--base-color); height: 8px; border-radius: 4px; overflow: hidden;">
                    <div id="blur-progress-bar" style="background: var(--accent-color); height: 100%; width: 0%; transition: width 0.3s;"></div>
                </div>
            </div>
        </div>
    `;
}

async function processBlurBackground() {
    const progressDiv = document.getElementById('blur-bg-progress');
    const progressText = document.getElementById('blur-progress-text');
    const progressBar = document.getElementById('blur-progress-bar');
    const blurIntensity = parseInt(document.getElementById('bgBlurIntensity').value);

    try {
        progressDiv.style.display = 'block';
        progressText.textContent = 'Preparando...';
        progressBar.style.width = '5%';

        const blob = await new Promise(resolve => canvas.toBlob(resolve));

        const foregroundBlob = await removeBackgroundWorker(blob, (key, current, total) => {
            const pct = Math.round((current / total) * 100);
            progressBar.style.width = `${pct}%`;
            if (key.includes('fetch')) {
                progressText.textContent = `Carregando modelo: ${pct}%`;
            } else {
                progressText.textContent = `Detectando objeto: ${pct}%`;
            }
        });
        progressBar.style.width = '90%';
        progressText.textContent = 'Compondo imagem...';

        const originalImg = originalImage;
        const foregroundUrl = URL.createObjectURL(foregroundBlob);

        const foregroundImg = new Image();
        await new Promise((resolve) => {
            foregroundImg.onload = resolve;
            foregroundImg.src = foregroundUrl;
        });

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = originalImg.width;
        tempCanvas.height = originalImg.height;

        tempCtx.filter = `blur(${blurIntensity}px)`;
        tempCtx.drawImage(originalImg, 0, 0);
        tempCtx.filter = 'none';

        tempCtx.drawImage(foregroundImg, 0, 0, originalImg.width, originalImg.height);

        canvas.width = originalImg.width;
        canvas.height = originalImg.height;
        ctx.drawImage(tempCanvas, 0, 0);

        const finalImg = new Image();
        finalImg.onload = () => {
            originalImage = finalImg;
        };
        finalImg.src = canvas.toDataURL();

        progressBar.style.width = '100%';
        progressText.textContent = 'Concluído! ✓';

        setTimeout(() => {
            progressDiv.style.display = 'none';
            progressBar.style.width = '0%';
        }, 1000);

        URL.revokeObjectURL(foregroundUrl);

    } catch (error) {
        console.error('Erro ao desfocar fundo:', error);
        progressText.textContent = '❌ Erro ao processar. Tente novamente.';
        progressText.style.color = 'var(--accent-color)';
        progressBar.style.width = '0%';

        setTimeout(() => {
            progressDiv.style.display = 'none';
            progressText.style.color = '';
        }, 3000);
    }
}

let replaceBgImage = null;

async function buildReplaceBgControls(container) {
    replaceBgImage = null;

    container.innerHTML = `
        <div class="control-group">
            <p style="margin-bottom: 0.5rem;">A IA irá remover o fundo e você pode escolher uma nova imagem de fundo.</p>
            <p style="opacity: 0.7; font-size: 0.9rem; margin: 0;">
                ⚠️ Primeira execução: download de modelo (~20MB)<br>
                ⏱️ Processamento: 10-20 segundos
            </p>
        </div>
        <div class="control-group">
            <label>1. Escolha a imagem de fundo</label>
            <div class="custom-file-upload">
                <label for="bgImageInput" class="file-upload-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span id="bgFileName">Selecionar imagem de fundo...</span>
                </label>
                <input type="file" id="bgImageInput" accept="image/*" onchange="handleBgImageSelect(this)" style="display: none;">
            </div>
            <div id="bgPreview" style="display: none; margin-top: 0.5rem;">
                <img id="bgPreviewImg" style="max-width: 100%; max-height: 100px; border-radius: 8px; border: 1px solid var(--border-color);">
            </div>
        </div>
        <div class="control-group">
            <button class="btn-primary" id="btnProcessReplace" onclick="processReplaceBackground()" style="width: 100%;" disabled>
                🤖 2. Processar com IA
            </button>
        </div>
        <div id="replace-bg-progress" style="display: none;">
            <div style="background: var(--glass-bg); border-radius: 8px; padding: 1rem;">
                <p id="replace-progress-text" style="margin: 0 0 0.5rem 0;">Inicializando...</p>
                <div style="background: var(--base-color); height: 8px; border-radius: 4px; overflow: hidden;">
                    <div id="replace-progress-bar" style="background: var(--accent-color); height: 100%; width: 0%; transition: width 0.3s;"></div>
                </div>
            </div>
        </div>
    `;
}

function handleBgImageSelect(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                replaceBgImage = img;
                document.getElementById('bgFileName').textContent = file.name;
                document.getElementById('bgPreview').style.display = 'block';
                document.getElementById('bgPreviewImg').src = e.target.result;
                document.getElementById('btnProcessReplace').disabled = false;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

async function processReplaceBackground() {
    if (!replaceBgImage) {
        alert('Selecione uma imagem de fundo primeiro!');
        return;
    }

    const progressDiv = document.getElementById('replace-bg-progress');
    const progressText = document.getElementById('replace-progress-text');
    const progressBar = document.getElementById('replace-progress-bar');

    try {
        progressDiv.style.display = 'block';
        progressText.textContent = 'Preparando...';
        progressBar.style.width = '5%';

        const blob = await new Promise(resolve => canvas.toBlob(resolve));

        const foregroundBlob = await removeBackgroundWorker(blob, (key, current, total) => {
            const pct = Math.round((current / total) * 100);
            progressBar.style.width = `${pct}%`;
            if (key.includes('fetch')) {
                progressText.textContent = `Carregando modelo: ${pct}%`;
            } else {
                progressText.textContent = `Processando IA: ${pct}%`;
            }
        });
        progressBar.style.width = '90%';
        progressText.textContent = 'Finalizando...';

        const foregroundUrl = URL.createObjectURL(foregroundBlob);
        const foregroundImg = new Image();
        await new Promise((resolve) => {
            foregroundImg.onload = resolve;
            foregroundImg.src = foregroundUrl;
        });

        const width = originalImage.width;
        const height = originalImage.height;

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = width;
        tempCanvas.height = height;

        tempCtx.drawImage(replaceBgImage, 0, 0, width, height);

        tempCtx.drawImage(foregroundImg, 0, 0, width, height);

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(tempCanvas, 0, 0);

        const finalImg = new Image();
        finalImg.onload = () => {
            originalImage = finalImg;
        };
        finalImg.src = canvas.toDataURL();

        progressBar.style.width = '100%';
        progressText.textContent = 'Concluído! ✓';

        setTimeout(() => {
            progressDiv.style.display = 'none';
            progressBar.style.width = '0%';
        }, 1000);

        URL.revokeObjectURL(foregroundUrl);

    } catch (error) {
        console.error('Erro ao trocar fundo:', error);
        progressText.textContent = '❌ Erro ao processar. Tente novamente.';
        progressText.style.color = 'var(--accent-color)';
        progressBar.style.width = '0%';

        setTimeout(() => {
            progressDiv.style.display = 'none';
            progressText.style.color = '';
        }, 3000);
    }
}

const firebaseConfig = {
    apiKey: "AIzaSyDiPOnKLD0bFG5fuAzTUBGItdSn1hHxw1A",
    authDomain: "p2p-share-portfolio.firebaseapp.com",
    databaseURL: "https://p2p-share-portfolio-default-rtdb.firebaseio.com",
    projectId: "p2p-share-portfolio",
    storageBucket: "p2p-share-portfolio.firebasestorage.app",
    messagingSenderId: "790301899345",
    appId: "1:790301899345:web:409fed4b714a7d37779670",
    measurementId: "G-P0ZZCLHBFN"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

const CHUNK_SIZE = 64 * 1024;
let peer = null;
let roomId = null;
let currentStream = null;
let pendingFileFromShare = null;

const panelWaiting = document.getElementById('panel-waiting');
const panelConnected = document.getElementById('panel-connected');
const qrContainer = document.getElementById('qrcode');
const linkInput = document.getElementById('share-link');
const transfersList = document.getElementById('transfers-list');
const fileInput = document.getElementById('file-input');
const btnDisconnect = document.getElementById('btn-disconnect');
const btnCopy = document.getElementById('btn-copy');
const btnVoltar = document.getElementById('btnVoltar');

const activeDownloads = new Map();
const MAX_CONCURRENT_UPLOADS = 1;
let activeUploads = 0;
const uploadQueue = [];

btnVoltar.onclick = function () {
    window.location.href = '/';
}

function showModal(title, message) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'obs') {
        console.warn("OBS Modal Suprimido:", title, message);
        return;
    }

    const modal = document.getElementById('alertModal');
    const titleEl = document.getElementById('alertTitle');
    const msgEl = document.getElementById('alertMessage');

    if (modal && titleEl && msgEl) {
        titleEl.innerText = title;
        msgEl.innerText = message;
        modal.classList.add('active');
    }
}

function closeModal() {
    const modal = document.getElementById('alertModal');
    if (modal) modal.classList.remove('active');
}
window.closeModal = closeModal;

function showClipboardModal(text, autoCopied = false) {
    const modal = document.getElementById('clipboardModal');
    const textarea = document.getElementById('clipboard-review');
    const copyBtn = document.getElementById('btn-manual-copy');

    if (modal && textarea) {
        textarea.value = text;
        modal.classList.add('active');

        if (autoCopied) {
            copyBtn.innerText = "Copiado! ✔";
            copyBtn.style.background = '#4ade80';
        } else {
            copyBtn.innerText = "Copiar";
            copyBtn.style.background = '';
        }

        copyBtn.onclick = () => {
            textarea.select();
            document.execCommand('copy');
            copyBtn.innerText = "Copiado! ✔";
            copyBtn.style.background = '#4ade80';
            setTimeout(() => closeClipboardModal(), 1000);
        };
    }
}

function closeClipboardModal() {
    const modal = document.getElementById('clipboardModal');
    if (modal) modal.classList.remove('active');
}

window.onclick = function (event) {
    const alertModal = document.getElementById('alertModal');
    const clipModal = document.getElementById('clipboardModal');
    if (event.target === alertModal) closeModal();
    if (event.target === clipModal) closeClipboardModal();
};

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeModal();
        closeClipboardModal();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(console.error);
    }

    let deferredPrompt;
    const installBtn = document.getElementById('installAppBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) installBtn.style.display = 'flex';
    });
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            installBtn.style.display = 'none';
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt = null;
            }
        });
    }

    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get('mode') === 'obs') {
        document.body.classList.add('obs-mode');
    }

    if (urlParams.get('share_target') === 'true') {
        handleShareTarget(urlParams);
    }

    const remoteId = urlParams.get('remote');
    if (remoteId) {
        roomId = remoteId;
        initClient(roomId);
    } else {
        if (urlParams.get('share_target') === 'true') {
            const lastRemote = localStorage.getItem('p2p_last_remote');
            if (lastRemote) {
                console.log("Restaurando sessão para Share Target:", lastRemote);
                showModal("Reconectando", "Restaurando conexão anterior...");
                initClient(lastRemote);
                return;
            }
        }
        initHost();
    }

    setupDragAndDrop();
});

async function handleShareTarget(urlParams) {
    try {
        const cache = await caches.open('share-cache');
        const response = await cache.match('shared-file');
        const metaResponse = await cache.match('shared-meta');

        if (response) {
            const blob = await response.blob();
            let fileName = "shared_file";
            let fileType = blob.type;

            if (metaResponse) {
                const meta = await metaResponse.json();
                if (meta.name) fileName = meta.name;
                if (meta.type) fileType = meta.type;
            }

            const file = new File([blob], fileName, { type: fileType });
            showModal("Arquivo Recebido", `Arquivo "${file.name}" pronto para enviar.`);

            pendingFileFromShare = file;
            if (peer && peer.connected) {
                processPendingFile();
            }

            await cache.delete('shared-file');
            await cache.delete('shared-meta');

            urlParams.delete('share_target');
            window.history.replaceState({}, document.title, window.location.pathname + '?' + urlParams.toString());

            await cache.delete('shared-file');
            await cache.delete('shared-meta');

            urlParams.delete('share_target');
            window.history.replaceState({}, document.title, window.location.pathname + '?' + urlParams.toString());
        }
    } catch (e) {
        console.error("Erro Share Target:", e);
    }
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 10);
}

function initHost() {
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('host_id') || generateRoomId();

    db.ref(`rooms/${roomId}`).off();
    db.ref(`rooms/${roomId}`).onDisconnect().remove();

    generateQRCode(roomId);
    updateUIState('waiting');

    const readyContent = document.getElementById('ready-content');
    if (readyContent) {
        readyContent.style.display = 'flex';
        readyContent.classList.add('fade-in');
        const panel = document.getElementById('panel-waiting');
        panel.style.height = (window.innerWidth <= 600) ? '595px' : '630px';
    }

    const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    peer = new SimplePeer({
        initiator: true,
        trickle: false,
        config: rtcConfig
    });

    peer.on('signal', data => {
        db.ref(`rooms/${roomId}/offer`).set(JSON.stringify(data));
    });

    peer.on('connect', () => {
        handleConnection();
    });

    peer.on('data', data => handleDataReceived(data));

    peer.on('stream', stream => {
        console.log("HOST RECEBEU STREAM");
        handleVideoStream(stream, urlParams.get('mode') === 'obs');
    });

    peer.on('close', () => {
        if (urlParams.get('mode') === 'obs') {
            console.log("OBS: Conexão fechada. Reiniciando...");
            resetApp();
        } else {
            console.log("Cliente desconectou. Aguardando reconexão...");
            showModal("Desconectado", "O outro dispositivo desconectou.\nAguardando reconexão...");
            updateUIState('waiting');

            if (peer) {
                peer.removeAllListeners();
                peer.destroy();
                peer = null;
            }

            restartHostPeer(roomId);
        }
    });

    peer.on('error', err => {
        console.error("Erro Peer:", err);
        if (urlParams.get('mode') === 'obs') {
            console.log("OBS: Erro crítico. Reiniciando...");
            if (peer) { peer.removeAllListeners(); peer.destroy(); }
            peer = null;
            initHost();
        } else {
            handleError(err);
        }
    });

    let lastAnswer = null;
    db.ref(`rooms/${roomId}/answer`).on('value', snapshot => {
        const data = snapshot.val();
        if (data && data !== lastAnswer) {
            lastAnswer = data;
            try {
                if (peer && !peer.destroyed) peer.signal(JSON.parse(data));
            } catch (e) { console.warn("Sinal ignorado:", e); }
        }
    });
}

function restartHostPeer(currentRoomId) {
    if (peer) {
        peer.removeAllListeners();
        peer.destroy();
        peer = null;
    }

    const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    peer = new SimplePeer({
        initiator: true,
        trickle: false,
        config: rtcConfig
    });

    peer.on('signal', data => {
        db.ref(`rooms/${currentRoomId}/offer`).set(JSON.stringify(data));
    });

    peer.on('connect', handleConnection);
    peer.on('data', handleDataReceived);
    peer.on('stream', stream => handleVideoStream(stream, false));

    peer.on('close', () => {
        console.log("Cliente desconectou novamente. Reiniciando peer...");
        updateUIState('waiting');
        restartHostPeer(currentRoomId);
    });

    peer.on('error', err => {
        console.error("Erro no Peer (Restarted):", err);
        restartHostPeer(currentRoomId);
    });
}

function initClient(id) {
    roomId = id;
    localStorage.setItem('p2p_last_remote', roomId);
    const qrDiv = document.getElementById('qrcode');

    if (qrDiv) {
        qrDiv.innerHTML = `
            <div class="qr-loading">
                <div class="spinner"></div>
                <p id="loading-text" style="margin-top: 10px; margin-bottom: 0; color: var(--accent-color); font-family: var(--font-body);">
                    Buscando sala...
                </p>
            </div>
        `;
    }

    const manualHostTimeout = setTimeout(() => {
        const loadingText = document.getElementById('loading-text');

        if (qrDiv && (!peer || !peer.connected) && loadingText) {
            loadingText.innerText = "Aguardando o Host...";
            loadingText.style.opacity = "0.7";
            loadingText.style.marginBottom = "0px";

            const optionDiv = document.createElement('div');
            optionDiv.className = 'fade-in';
            optionDiv.style.display = 'flex';
            optionDiv.style.flexDirection = 'column';
            optionDiv.style.alignItems = 'center';

            optionDiv.innerHTML = `
                <span style="font-size: 0.75rem; opacity: 0.4; color: var(--text-color); font-family: var(--font-body);">
                    Não conectou?
                </span>
                <button id="btn-force-host" style="
                    background: var(--base-color); 
                    border: 1px solid var(--accent-color); 
                    color: var(--accent-color); 
                    padding: 6px 14px; 
                    border-radius: 20px; 
                    font-size: 0.8rem; 
                    cursor: pointer; 
                    transition: all 0.3s ease;
                    font-family: var(--font-body);
                    font-weight: 500;
                    backdrop-filter: blur(4px);
                    margin-top: 2px;
                " 
                onmouseover="this.style.background='var(--accent-color)'; this.style.color='var(--text-color)';"
                onmouseout="this.style.background='var(--base-color)'; this.style.color='var(--accent-color)';"
                >
                    Criar Minha Sala
                </button>
            `;

            const container = qrDiv.querySelector('.qr-loading');
            if (container) container.appendChild(optionDiv);

            const btn = document.getElementById('btn-force-host');
            if (btn) {
                btn.onclick = () => {
                    console.log("Usuário virou Host.");
                    resetApp();
                };
            }
        }
    }, 5000);

    let lastOffer = null;

    db.ref(`rooms/${id}/offer`).on('value', snapshot => {
        const offer = snapshot.val();

        if (!offer) return;

        if (qrDiv && !peer) {
            qrDiv.innerHTML = `
                <div class="qr-loading">
                    <div class="spinner"></div>
                    <p style="color: var(--accent-color); margin-top: 10px;">Conectando...</p>
                </div>`;
        }
        clearTimeout(manualHostTimeout);

        if (offer === lastOffer) return;
        lastOffer = offer;

        if (!peer) {
            const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

            peer = new SimplePeer({
                initiator: false,
                trickle: false,
                config: rtcConfig
            });

            peer.on('stream', stream => {
                handleVideoStream(stream, false);
            });

            peer.on('signal', data => {
                db.ref(`rooms/${id}/answer`).set(JSON.stringify(data));
            });

            peer.on('connect', () => {
                handleConnection();
                clearTimeout(manualHostTimeout);
            });

            peer.on('data', data => handleDataReceived(data));
            peer.on('close', handleDisconnect);
            peer.on('error', handleError);

            peer.signal(JSON.parse(offer));
        } else {
            peer.signal(JSON.parse(offer));
        }
    });
}

function handleVideoStream(stream, isObs) {
    console.log("Processando vídeo...", stream);
    const video = document.getElementById('remote-video');
    const wrapper = document.getElementById('video-wrapper');

    wrapper.style.display = 'flex';
    wrapper.style.zIndex = '9999';

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    const playPromise = video.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.warn("Autoplay bloqueado. Tentando play forçado:", error);
            video.muted = true;
            video.play();
        });
    }

    if (isObs) document.body.classList.add('obs-mode');
}

function generateQRCode(id) {
    const origin = window.location.origin;
    const path = window.location.pathname;

    const connectUrl = `${origin}${path}?remote=${id}`;

    if (linkInput) linkInput.value = connectUrl;

    const obsUrl = `${origin}${path}?remote=${id}&mode=obs`;

    const obsInput = document.getElementById('link-obs');
    if (obsInput) obsInput.value = obsUrl;

    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: connectUrl,
        width: 180,
        height: 180,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.L
    });
}

function updateUIState(state) {
    if (state === 'waiting') {
        panelWaiting.style.display = 'flex';
        panelConnected.style.display = 'none';
    } else if (state === 'connected') {
        panelWaiting.style.display = 'none';
        panelConnected.style.display = 'flex';
        document.getElementById('remote-peer-name').innerText = `Conectado via P2P (Seguro)`;
    }
}

function handleConnection() {
    updateUIState('connected');
    closeModal();

    setTimeout(() => {
        processPendingFile();
    }, 500);
}

function processPendingFile() {
    if (!pendingFileFromShare || !fileInput) return;
    console.log("Processando arquivo pendente do Share Target...");
    const dt = new DataTransfer();
    dt.items.add(pendingFileFromShare);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change'));
    pendingFileFromShare = null;
}

function handleDisconnect() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'obs') {
        resetApp();
        return;
    }
    showModal("Desconectado", "Conexão encerrada.");
    resetApp();
}

function handleError(err) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'obs') {
        console.error("OBS Erro Silencioso:", err);
        if (peer) peer.destroy();
        initHost();
        return;
    }

    let msg = err.message || "Erro desconhecido.";
    if (err.code === 'ERR_WEBRTC_SUPPORT') msg = "Seu navegador não suporta WebRTC.";
    showModal("Erro", msg);
}

function resetApp() {
    if (peer) {
        peer.removeAllListeners();
        peer.destroy();
        peer = null;
    }
    roomId = null;
    activeDownloads.clear();
    transfersList.innerHTML = '';
    window.history.replaceState({}, document.title, window.location.pathname);
    initHost();
}

async function sendFile(file, existingElement = null) {
    if (!peer || !peer.connected) {
        showModal("Erro", "Não há conexão ativa!");
        return;
    }

    const transferId = Math.random().toString(36).substring(2, 10);
    let isCancelled = false;
    let item = existingElement;

    if (!item) {
        item = createTransferItem(file.name, file.size, 'Iniciando...', 'upload', () => { isCancelled = true; });
    } else {
        const btn = item.querySelector('.btn-cancel-transfer');
        if (btn) btn.onclick = () => { isCancelled = true; };
    }

    const statusText = item.querySelector('.status-text');
    const progressBar = item.querySelector('.progress-fill');
    const percentageText = item.querySelector('.percentage');
    const cancelBtn = item.querySelector('.btn-cancel-transfer');

    const header = JSON.stringify({
        type: 'header', transferId, name: file.name, size: file.size, mime: file.type
    });
    const headerBytes = new TextEncoder().encode(header);
    const headerPacket = new Uint8Array(headerBytes.length + 1);
    headerPacket[0] = 0;
    headerPacket.set(headerBytes, 1);

    try {
        peer.send(headerPacket);
    } catch (e) {
        statusText.innerText = 'Erro ao iniciar';
        return;
    }

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let offset = 0;
    const idBytes = new TextEncoder().encode(transferId);

    const startTime = Date.now();
    let lastUiTime = 0;

    for (let i = 0; i < totalChunks; i++) {
        if (!peer || !peer.connected || isCancelled) {
            statusText.innerText = isCancelled ? 'Cancelado' : 'Erro de Conexão';
            statusText.style.color = '#ff4444';
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (isCancelled) {
                const cancelPacket = new Uint8Array(9);
                cancelPacket[0] = 2;
                cancelPacket.set(idBytes, 1);
                try { peer.send(cancelPacket); } catch (e) { }
            }
            return;
        }

        if (peer._channel.bufferedAmount > 1024 * 1024) {
            await new Promise(r => setTimeout(r, 50));
        }

        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await chunk.arrayBuffer();
        const chunkBytes = new Uint8Array(buffer);
        const packet = new Uint8Array(1 + 8 + chunkBytes.length);

        packet[0] = 1;
        packet.set(idBytes, 1);
        packet.set(chunkBytes, 9);

        try {
            peer.send(packet);
        } catch (err) {
            await new Promise(r => setTimeout(r, 50));
            i--; continue;
        }

        offset += CHUNK_SIZE;

        const now = Date.now();
        if (now - lastUiTime >= 500 || i === totalChunks - 1) {
            const percent = Math.floor(((i + 1) / totalChunks) * 100);

            const timeElapsed = (now - startTime) / 1000;
            let speedText = "";
            if (timeElapsed > 0) {
                const speedBytes = offset / timeElapsed;
                speedText = `(${formatBytes(speedBytes)}/s)`;
            }

            progressBar.style.width = percent + '%';
            percentageText.innerText = percent + '%';
            statusText.innerText = `Enviando... ${speedText}`;

            lastUiTime = now;
        }
    }

    if (cancelBtn) cancelBtn.remove();
    statusText.innerText = 'Enviado!';
    statusText.style.color = '#4ade80';
    progressBar.style.width = '100%';
}

function queueFile(file) {
    if (!peer || !peer.connected) {
        showModal("Erro", "Conecte-se primeiro.");
        return;
    }

    const item = createTransferItem(file.name, file.size, 'Aguardando...', 'upload', () => {
        const idx = uploadQueue.findIndex(x => x.element === item);
        if (idx > -1) {
            uploadQueue.splice(idx, 1);
            item.querySelector('.status-text').innerText = 'Cancelado';
        }
    });

    uploadQueue.push({ file, element: item });
    processQueue();
}

async function processQueue() {
    if (activeUploads >= MAX_CONCURRENT_UPLOADS || uploadQueue.length === 0) return;

    const next = uploadQueue.shift();
    if (!next) return;

    activeUploads++;
    const status = next.element.querySelector('.status-text');
    status.innerText = 'Preparando...';

    try {
        await sendFile(next.file, next.element);
    } catch (e) {
        console.error(e);
    } finally {
        activeUploads--;
        setTimeout(processQueue, 50);
    }
}

function handleDataReceived(data) {
    if (!data || data.byteLength === 0) return;
    const type = data[0];

    if (type === 1) {
        const idBytes = data.subarray(1, 9);
        const transferId = new TextDecoder().decode(idBytes);
        const fileState = activeDownloads.get(transferId);
        if (!fileState) return;

        const payload = data.subarray(9);
        fileState.buffer.push(payload);
        fileState.receivedSize += payload.byteLength;

        const now = Date.now();
        if (now - fileState.lastTime >= 500 || fileState.receivedSize >= fileState.totalSize) {
            const percent = Math.round((fileState.receivedSize / fileState.totalSize) * 100);
            if (fileState.progressBar) fileState.progressBar.style.width = percent + '%';
            if (fileState.percentageText) fileState.percentageText.innerText = percent + '%';
            fileState.lastTime = now;
        }

        if (fileState.receivedSize >= fileState.totalSize) {
            assembleAndDownload(transferId);
        }
    }
    else if (type === 0) {
        try {
            const json = JSON.parse(new TextDecoder().decode(data.subarray(1)));

            if (json.type === 'header') {
                const item = createTransferItem(json.name, json.size, 'Recebendo...', 'download');
                activeDownloads.set(json.transferId, {
                    buffer: [], receivedSize: 0, totalSize: json.size,
                    name: json.name, mime: json.mime,
                    progressBar: item.querySelector('.progress-fill'),
                    percentageText: item.querySelector('.percentage'),
                    lastTime: Date.now()
                });
            }
            else if (json.type === 'clipboard') {
                showClipboardModal(json.text, true);
                navigator.clipboard.writeText(json.text).catch(() => { });
            }
            else if (json.type === 'close-video') {
                console.log("Comando de fechar recebido.");
                closeVideoUI();
            }
        } catch (e) { }
    }
}

function assembleAndDownload(id) {
    const fs = activeDownloads.get(id);
    if (!fs) return;
    const blob = new Blob(fs.buffer, { type: fs.mime });
    downloadFile(blob, fs.name);
    activeDownloads.delete(id);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
    }
    if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv'].includes(ext)) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>';
    }
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
    }
    if (ext === 'pdf') {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15h3a2 2 0 0 0 0-4H9v4z"></path></svg>';
    }
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>';
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 12.5v5"></path><path d="M14 12.5v5"></path><path d="M12 2v10"></path><path d="M21 10V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"></path></svg>';
    }
    if (['js', 'html', 'css', 'json', 'py', 'php', 'ts', 'sql', 'c', 'cpp', 'java'].includes(ext)) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
    }
    if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
    }
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>';
}

function createTransferItem(name, size, status, type, onCancel) {
    const item = document.createElement('div');
    item.className = `transfer-item fade-in ${type}`;
    item.innerHTML = `
        <div class="transfer-icon-wrapper">${getFileIcon(name)}</div>
        <div class="transfer-content">
            <div class="transfer-header"><span>${name}</span><span>${formatBytes(size)}</span></div>
            <div class="progress-container"><div class="progress-bar-bg"><div class="progress-fill" style="width: 0%"></div></div></div>
            <div class="transfer-footer">
                <span class="status-text">${status}</span>
                <span class="percentage">0%</span>
                ${onCancel ? '<button class="btn-cancel-transfer">X</button>' : ''}
            </div>
        </div>`;

    if (onCancel) item.querySelector('.btn-cancel-transfer').onclick = onCancel;
    transfersList.appendChild(item);
    return item;
}

function downloadFile(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

document.getElementById('file-input').addEventListener('change', e => {
    Array.from(e.target.files).forEach(queueFile);
    e.target.value = null;
});

document.getElementById('btn-share-cam').onclick = () => startStream('camera');
document.getElementById('btn-share-screen').onclick = () => startStream('screen');
document.getElementById('btn-exit-obs').onclick = () => {
    closeVideoUI();

    if (peer && peer.connected) {
        const cmd = JSON.stringify({ type: 'close-video' });
        const bytes = new TextEncoder().encode(cmd);
        const packet = new Uint8Array(bytes.length + 1);
        packet.set(bytes, 1);
        try { peer.send(packet); } catch (e) { }
    }
};

const btnsCopy = document.querySelectorAll('#btn-copy, #btn-copy-obs, #btn-copy-remote');
btnsCopy.forEach(btn => {
    btn.onclick = () => {
        const input = btn.previousElementSibling;
        input.select();
        document.execCommand('copy');
        const orig = btn.innerText;
        btn.innerText = "Copiado!";
        setTimeout(() => btn.innerText = orig, 2000);
    };
});

document.getElementById('btn-disconnect').onclick = () => {
    if (peer) peer.destroy();
    resetApp();
};

document.getElementById('btn-send-text').onclick = () => {
    const input = document.getElementById('clipboard-input');
    const text = input.value.trim();
    if (!text) return;

    if (!peer || !peer.connected) {
        showModal("Erro", "Conecte-se primeiro.");
        return;
    }

    const payload = JSON.stringify({ type: 'clipboard', text: text });
    const bytes = new TextEncoder().encode(payload);
    const packet = new Uint8Array(bytes.length + 1);
    packet[0] = 0;
    packet.set(bytes, 1);

    try {
        peer.send(packet);
        input.value = '';
        const btn = document.getElementById('btn-send-text');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span style="font-size:1.2rem">✔</span>';
        setTimeout(() => btn.innerHTML = originalHtml, 1500);
    } catch (err) {
        showModal("Erro", "Falha ao enviar texto.");
    }
};

document.getElementById('clipboard-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('btn-send-text').click();
    }
});

async function startStream(type) {
    if (!peer || !peer.connected) return showModal("Erro", "Conecte-se primeiro!");

    try {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        if (type === 'camera') {
            currentStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30, max: 60 },
                    facingMode: "environment"
                },
                audio: false
            });
        } else {
            currentStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 30 } },
                audio: false
            });
        }

        peer.addStream(currentStream);

        const video = document.getElementById('remote-video');
        document.getElementById('video-wrapper').style.display = 'flex';
        video.srcObject = currentStream;
        video.muted = true;
        video.play();

        document.getElementById('btn-share-cam').disabled = true;
        document.getElementById('btn-share-screen').disabled = true;

        currentStream.getVideoTracks()[0].onended = () => {
            closeVideoUI();
            if (peer && peer.connected) {
                const cmd = JSON.stringify({ type: 'close-video' });
                const bytes = new TextEncoder().encode(cmd);
                const packet = new Uint8Array(bytes.length + 1);
                packet.set(bytes, 1);
                try { peer.send(packet); } catch (e) { }
            }
        };

    } catch (err) {
        console.error(err);
        showModal("Erro", "Falha ao iniciar stream: " + err.message);
    }
}

function closeVideoUI() {
    const wrapper = document.getElementById('video-wrapper');
    const video = document.getElementById('remote-video');

    wrapper.style.display = 'none';

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') !== 'obs') {
        document.body.classList.remove('obs-mode');
    }

    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }

    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        if (peer && !peer.destroyed) {
            try { peer.removeStream(currentStream); } catch (e) { }
        }
        currentStream = null;
    }

    document.getElementById('btn-share-cam').disabled = false;
    document.getElementById('btn-share-screen').disabled = false;
}

function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => {
        dropZone.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); });
    });
    dropZone.addEventListener('dragover', () => dropZone.classList.add('highlight'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('highlight'));
    dropZone.addEventListener('drop', e => {
        dropZone.classList.remove('highlight');
        Array.from(e.dataTransfer.files).forEach(queueFile);
    });
}
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

const panelWaiting = document.getElementById('panel-waiting');
const panelConnected = document.getElementById('panel-connected');
const qrContainer = document.getElementById('qrcode');
const linkInput = document.getElementById('share-link');
const transfersList = document.getElementById('transfers-list');
const fileInput = document.getElementById('file-input');
const btnDisconnect = document.getElementById('btn-disconnect');
const btnCopy = document.getElementById('btn-copy');
const btnVoltar = document.getElementById('btnVoltar');

let incomingFile = {
    buffer: [],
    receivedSize: 0,
    totalSize: 0,
    name: '',
    mime: '',
    progressBar: null,
    startTime: 0
};

btnVoltar.onclick = function () {
    window.location.href = '/';
}

function showModal(title, message) {
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
            copyBtn.classList.remove('btn-primary');
            copyBtn.style.background = '#4ade80';
        } else {
            copyBtn.innerText = "Copiar";
            copyBtn.classList.add('btn-primary');
            copyBtn.style.background = '';
        }

        copyBtn.onclick = () => {
            textarea.select();
            document.execCommand('copy');
            navigator.clipboard.writeText(text).then(() => {
                copyBtn.innerText = "Copiado! ✔";
                copyBtn.style.background = '#4ade80';
                setTimeout(() => closeClipboardModal(), 1000);
            }).catch(e => {
                console.warn("Copy failed", e);
                copyBtn.innerText = "Erro ao copiar";
            });
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
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado:', reg.scope))
            .catch(err => console.error('Erro no Service Worker:', err));
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
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
            }
        });
    }

    window.addEventListener('appinstalled', () => {
        if (installBtn) installBtn.style.display = 'none';
        deferredPrompt = null;
    });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('share_target') === 'true') {
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

                console.log("Arquivo compartilhado recebido via PWA:", file.name);
                showModal("Arquivo Recebido", `Arquivo "${file.name}" carregado. Conecte-se para enviar.`);

                const dt = new DataTransfer();
                dt.items.add(file);
                const fileInput = document.getElementById('file-input');
                if (fileInput) {
                    fileInput.files = dt.files;
                    fileInput.dispatchEvent(new Event('change'));
                }

                await cache.delete('shared-file');
                await cache.delete('shared-meta');

                urlParams.delete('share_target');
                window.history.replaceState({}, document.title, window.location.pathname + '?' + urlParams.toString());
            }
        } catch (e) {
            console.error("Erro ao ler arquivo compartilhado:", e);
        }
    }

    const remoteId = urlParams.get('remote');

    if (remoteId) {
        roomId = remoteId;
        initClient(roomId);
    } else {
        initHost();
    }

    setupDragAndDrop();
});

function generateRoomId() {
    return Math.random().toString(36).substring(2, 10);
}

function initHost() {
    roomId = generateRoomId();

    db.ref(`rooms/${roomId}`).onDisconnect().remove();

    generateQRCode(roomId);
    updateUIState('waiting');

    const readyContent = document.getElementById('ready-content');

    if (readyContent) {
        const panel = document.getElementById('panel-waiting');

        const startHeight = panel.offsetHeight;
        panel.style.height = startHeight + 'px';

        readyContent.style.display = 'flex';

        void panel.offsetHeight;

        const isMobile = window.innerWidth <= 600;

        panel.style.height = isMobile ? '450px' : '500px';

        readyContent.classList.add('fade-in');
    }

    peer = new SimplePeer({
        initiator: true,
        trickle: false
    });

    peer.on('signal', data => {
        db.ref(`rooms/${roomId}/offer`).set(JSON.stringify(data));
    });

    peer.on('connect', () => {
        handleConnection();
        db.ref(`rooms/${roomId}`).remove();
    });

    peer.on('data', data => handleDataReceived(data));
    peer.on('close', () => handleDisconnect());
    peer.on('error', err => handleError(err));

    const answerRef = db.ref(`rooms/${roomId}/answer`);
    answerRef.on('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            peer.signal(JSON.parse(data));
            answerRef.off();
        }
    });

    setTimeout(() => {
        if (!peer.connected && !linkInput.value) {
            console.warn("Possível erro de configuração do Firebase ou Rede.");
        }
    }, 5000);
}

function initClient(id) {

    const qrDiv = document.getElementById('qrcode');
    if (qrDiv) {
        qrDiv.innerHTML = `
            <div class="qr-loading">
                <div class="spinner"></div>
                <p>Buscando sala...</p>
            </div>
        `;
    }

    db.ref(`rooms/${id}/offer`).once('value', snapshot => {
        const offer = snapshot.val();
        if (!offer) {
            resetApp();
            return;
        }

        if (qrDiv) qrDiv.innerHTML = `<div class="qr-loading"><div class="spinner"></div><p>Conectando...</p></div>`;

        peer = new SimplePeer({
            initiator: false,
            trickle: false
        });

        peer.on('signal', data => {
            db.ref(`rooms/${id}/answer`).set(JSON.stringify(data));
        });

        peer.on('connect', () => {
            handleConnection();
        });

        peer.on('data', data => handleDataReceived(data));
        peer.on('close', () => handleDisconnect());
        peer.on('error', err => handleError(err));

        peer.signal(JSON.parse(offer));
    });
}

function handleConnection() {
    updateUIState('connected');
}

function handleDisconnect() {
    showModal("Desconectado", "Conexão encerrada.");
    resetApp();
}

function handleError(err) {
    let msg = "Erro desconhecido.";
    if (err.code === 'ERR_WEBRTC_SUPPORT') msg = "Seu navegador não suporta WebRTC.";
    if (err.message) msg = err.message;

    showModal("Erro", msg);
}

async function sendFile(file) {
    if (!peer || !peer.connected) {
        showModal("Erro", "Não há conexão ativa!");
        return;
    }

    let isCancelled = false;

    const item = createTransferItem(file.name, file.size, 'Enviando...', 'upload', () => {
        isCancelled = true;
    });

    const progressBar = item.querySelector('.progress-fill');
    const statusText = item.querySelector('.status-text');
    const percentageText = item.querySelector('.percentage');
    const cancelBtn = item.querySelector('.btn-cancel-transfer');

    const header = JSON.stringify({
        type: 'header',
        name: file.name,
        size: file.size,
        mime: file.type
    });
    const headerBytes = new TextEncoder().encode(header);
    const headerPacket = new Uint8Array(headerBytes.length + 1);
    headerPacket[0] = 0;
    headerPacket.set(headerBytes, 1);

    try {
        peer.send(headerPacket);
    } catch (e) {
        console.error("Erro ao enviar header:", e);
        statusText.innerText = 'Erro ao iniciar';
        return;
    }

    const MAX_BUFFERED_AMOUNT = 1 * 1024 * 1024;

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let offset = 0;

    let lastUiTime = 0;
    let bytesSentSinceLastUi = 0;
    let startTime = Date.now();
    let currentSpeed = "Iniciando...";

    for (let i = 0; i < totalChunks; i++) {
        if (!peer || !peer.connected || peer.destroyed) {
            statusText.innerText = 'Erro: Conexão caiu';
            statusText.style.color = '#ff4444';
            if (cancelBtn) cancelBtn.style.display = 'none';
            return;
        }

        if (isCancelled) {
            console.log("Envio cancelado pelo usuário.");
            statusText.innerText = 'Cancelado';
            statusText.style.color = '#ff4444';
            if (cancelBtn) cancelBtn.style.display = 'none';

            try {
                const cancelPacket = new Uint8Array(1);
                cancelPacket[0] = 2;
                peer.send(cancelPacket);
            } catch (e) { }

            return;
        }

        if (peer._channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
            await new Promise(resolve => {
                const checkBuffer = () => {
                    if (!peer || !peer.connected || peer.destroyed) return resolve();

                    if (peer._channel.bufferedAmount < MAX_BUFFERED_AMOUNT) {
                        resolve();
                    } else {
                        setTimeout(checkBuffer, 5);
                    }
                };
                checkBuffer();
            });
        }

        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await chunk.arrayBuffer();
        const chunkBytes = new Uint8Array(buffer);

        const packet = new Uint8Array(chunkBytes.length + 1);
        packet[0] = 1;
        packet.set(chunkBytes, 1);

        let sent = false;
        while (!sent) {
            if (!peer || !peer.connected || peer._channel.readyState !== 'open') {
                console.warn("Canal fechou durante tentativa de envio.");
                statusText.innerText = 'Erro: Canal fechado';
                return;
            }

            try {
                peer.send(packet);
                sent = true;
            } catch (err) {
                if (err.message && err.message.includes('queue is full')) {
                    await new Promise(r => setTimeout(r, 10));
                } else {
                    console.error("Erro fatal envio (catch):", err);
                    statusText.innerText = 'Erro no envio';
                    return;
                }
            }
        }

        offset += CHUNK_SIZE;
        bytesSentSinceLastUi += packet.length;

        const now = Date.now();
        if (now - lastUiTime >= 100 || i === totalChunks - 1) {
            const percent = Math.floor(((i + 1) / totalChunks) * 100);

            if (now - startTime >= 500) {
                const diffSec = (now - startTime) / 1000;
                const speed = offset / diffSec;
                currentSpeed = formatSpeed(speed);
            }

            progressBar.style.width = percent + '%';
            statusText.innerText = `Enviando... (${currentSpeed})`;
            percentageText.innerText = percent + '%';
            lastUiTime = now;
        }
    }

    if (peer && peer._channel) {
        while (peer._channel.bufferedAmount > 0) {
            if (!peer.connected) break;
            statusText.innerText = 'Finalizando upload...';
            await new Promise(r => setTimeout(r, 100));
        }
    }

    if (cancelBtn) cancelBtn.remove();

    statusText.innerText = 'Enviado com sucesso!';
    statusText.style.color = '#4ade80';
    percentageText.innerText = '100%';
    progressBar.style.width = '100%';
}

function handleDataReceived(data) {
    if (!data || data.byteLength === 0) return;

    const type = data[0];
    const payload = data.subarray(1);

    if (type === 1) {
        incomingFile.buffer.push(payload);
        incomingFile.receivedSize += payload.byteLength;

        const now = Date.now();
        if (!incomingFile.lastTime) incomingFile.lastTime = now;

        if (typeof incomingFile.lastBytesRef === 'undefined') incomingFile.lastBytesRef = 0;

        if (now - incomingFile.lastTime >= 500) {
            const diffTime = (now - incomingFile.lastTime) / 1000;
            const chunkDelta = incomingFile.receivedSize - incomingFile.lastBytesRef;

            const speedBytes = chunkDelta / diffTime;
            incomingFile.currentSpeed = formatSpeed(speedBytes);

            incomingFile.lastTime = now;
            incomingFile.lastBytesRef = incomingFile.receivedSize;
        }

        const percent = Math.min(100, Math.round((incomingFile.receivedSize / incomingFile.totalSize) * 100));

        if (incomingFile.progressBar) {
            incomingFile.progressBar.style.width = percent + '%';
            incomingFile.statusText.innerText = `Recebendo... (${incomingFile.currentSpeed || '...'})`;
            incomingFile.percentageText.innerText = percent + '%';
        }

        if (incomingFile.receivedSize >= incomingFile.totalSize) {
            assembleAndDownload();
        }
        return;
    }

    if (type === 2) {
        if (incomingFile.statusText) {
            incomingFile.statusText.innerText = 'Cancelado pelo remetente';
            incomingFile.statusText.style.color = '#ff4444';
        }
        incomingFile.buffer = [];
        incomingFile.receivedSize = 0;
        console.log("Recebimento cancelado remotamente.");
        return;
    }

    if (type === 0) {
        try {
            const jsonString = new TextDecoder().decode(payload);
            const parsed = JSON.parse(jsonString);

            if (parsed.type === 'header') {
                incomingFile.buffer = [];
                incomingFile.receivedSize = 0;
                incomingFile.totalSize = parsed.size;
                incomingFile.name = parsed.name;
                incomingFile.mime = parsed.mime;
                incomingFile.lastTime = Date.now();
                incomingFile.lastBytesRef = 0;
                incomingFile.currentSpeed = "0 KB/s";

                const item = createTransferItem(parsed.name, parsed.size, 'Recebendo...', 'download');
                incomingFile.progressBar = item.querySelector('.progress-fill');
                incomingFile.statusText = item.querySelector('.status-text');
                incomingFile.percentageText = item.querySelector('.percentage');

            } else if (parsed.type === 'clipboard') {
                const text = parsed.text;
                if (text) {
                    navigator.clipboard.writeText(text).then(() => {
                        showClipboardModal(text, true);
                    }).catch(err => {
                        console.warn("Auto-copy blocked:", err);
                        showClipboardModal(text, false);
                    });
                }

            } else if (parsed.type === 'error') {
                showModal("Erro Remoto", parsed.msg);
            }

        } catch (e) {
            console.warn("Erro ao processar pacote de controle:", e);
        }
    }
}

function assembleAndDownload() {
    const blob = new Blob(incomingFile.buffer, { type: incomingFile.mime });
    downloadFile(blob, incomingFile.name);

    if (incomingFile.statusText) {
        incomingFile.statusText.innerText = 'Recebido com sucesso!';
        incomingFile.statusText.style.color = '#4ade80';
        incomingFile.progressBar.style.backgroundColor = '#4ade80';
        incomingFile.percentageText.innerText = '100%';
    }

    incomingFile.buffer = [];
    incomingFile.receivedSize = 0;
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

function resetApp() {
    if (peer) {
        peer.removeAllListeners();
        peer.destroy();
        peer = null;
    }
    roomId = null;

    incomingFile = {
        buffer: [],
        receivedSize: 0,
        totalSize: 0,
        name: '',
        mime: '',
        progressBar: null,
        startTime: 0
    };

    transfersList.innerHTML = '';

    window.history.replaceState({}, document.title, window.location.pathname);

    initHost();
}

function generateQRCode(id) {
    const fullUrl = `${window.location.origin}${window.location.pathname}?remote=${id}`;
    linkInput.value = fullUrl;
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: fullUrl,
        width: 180,
        height: 180,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.L
    });
}

function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    const uploadIcon = document.getElementById('upload-icon');
    const defaultIcon = '../Leitor-logs-totvs-fluig/assets/upload.webp';
    const activeIcon = '../Leitor-logs-totvs-fluig/assets/upload_blue.webp';

    function setUploadIcon(active) {
        if (uploadIcon) uploadIcon.src = active ? activeIcon : defaultIcon;
    }

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('highlight');
            setUploadIcon(true);
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('highlight');
            setUploadIcon(false);
        });
    });

    dropZone.addEventListener('drop', e => {
        const dt = e.dataTransfer;
        if (dt.files.length > 0) sendFile(dt.files[0]);
    });

    dropZone.addEventListener('mouseenter', () => setUploadIcon(true));
    dropZone.addEventListener('mouseleave', () => setUploadIcon(false));
}

fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) sendFile(e.target.files[0]);
});

btnCopy.addEventListener('click', () => {
    linkInput.select();
    document.execCommand('copy');
    const originalText = btnCopy.innerText;
    btnCopy.innerText = "Copiado!";
    setTimeout(() => btnCopy.innerText = originalText, 2000);
});

const clipboardInput = document.getElementById('clipboard-input');
const btnSendText = document.getElementById('btn-send-text');

function sendClipboardText() {
    const text = clipboardInput.value.trim();
    if (!text) return;

    if (!peer || !peer.connected) {
        showModal("Erro", "Você precisa estar conectado.");
        return;
    }

    const payload = JSON.stringify({ type: 'clipboard', text: text });
    const payloadBytes = new TextEncoder().encode(payload);
    const packet = new Uint8Array(payloadBytes.length + 1);
    packet[0] = 0;
    packet.set(payloadBytes, 1);

    try {
        peer.send(packet);

        clipboardInput.value = '';
        const originalBtnHTML = btnSendText.innerHTML;
        btnSendText.innerHTML = '✔';
        btnSendText.style.background = '#4ade80';
        setTimeout(() => {
            btnSendText.innerHTML = originalBtnHTML;
            btnSendText.style.background = '';
        }, 1500);

    } catch (e) {
        console.error("Erro ao enviar texto:", e);
        showModal("Erro", "Falha ao enviar texto.");
    }
}

if (btnSendText) {
    btnSendText.addEventListener('click', sendClipboardText);
}
if (clipboardInput) {
    clipboardInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendClipboardText();
    });
}

btnDisconnect.addEventListener('click', () => {
    if (peer) peer.destroy();
    resetApp();
});

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond) {
    return formatBytes(bytesPerSecond) + '/s';
}

function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const icons = {
        image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
        video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`,
        audio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
        pdf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
        doc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
        archive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
        code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
        default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`
    };
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return icons.image;
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return icons.video;
    if (['mp3', 'wav', 'ogg'].includes(ext)) return icons.audio;
    if (['pdf'].includes(ext)) return icons.pdf;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return icons.archive;
    if (['html', 'css', 'js', 'json', 'py', 'java', 'c', 'cpp'].includes(ext)) return icons.code;
    return icons.default;
}

function createTransferItem(name, size, status, type, onCancel) {
    const item = document.createElement('div');
    item.className = `transfer-item fade-in ${type}`;
    const formattedSize = formatBytes(size);
    const icon = getFileIcon(name);
    const isUpload = type === 'upload';
    const actionIcon = isUpload ?
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' :
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';

    const cancelButton = onCancel ?
        `<button class="btn-cancel-transfer" title="Cancelar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` :
        '';

    item.innerHTML = `
        <div class="transfer-icon-wrapper">
            ${icon}
            <div class="transfer-badge ${type}">${actionIcon}</div>
        </div>
        <div class="transfer-content">
            <div class="transfer-header">
                <span class="file-name" title="${name}">${name}</span>
                <span class="file-size">${formattedSize}</span>
            </div>
            <div class="progress-container">
                <div class="progress-bar-bg">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
            </div>
            <div class="transfer-footer">
                <span class="status-text">${status}</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="percentage">0%</span>
                    ${cancelButton}
                </div>
            </div>
        </div>
    `;

    if (onCancel) {
        const btn = item.querySelector('.btn-cancel-transfer');
        if (btn) btn.onclick = onCancel;
    }

    transfersList.prepend(item);
    return item;
}

function downloadFile(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

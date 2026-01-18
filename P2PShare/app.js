const PEER_CONFIG = {
    debug: 2
};

// --- Modal Helper Functions ---
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

const CHUNK_SIZE = 64 * 1024; // 64KB per chunk

let peer = null;
let conn = null;

const panelWaiting = document.getElementById('panel-waiting');
const panelConnected = document.getElementById('panel-connected');
const qrContainer = document.getElementById('qrcode');
const linkInput = document.getElementById('share-link');
const transfersList = document.getElementById('transfers-list');
const fileInput = document.getElementById('file-input');
const btnDisconnect = document.getElementById('btn-disconnect');
const btnCopy = document.getElementById('btn-copy');

// Current Transfer State
let incomingFile = {
    buffer: [],
    receivedSize: 0,
    totalSize: 0,
    name: '',
    mime: '',
    progressBar: null,
    startTime: 0
};

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const remoteId = urlParams.get('remote');

    if (remoteId) {
        initClient(remoteId);
    } else {
        initHost();
    }

    setupDragAndDrop();
});

function initHost() {
    console.log("Iniciando Host...");
    peer = new Peer(null, PEER_CONFIG);

    // Timeout header feedback
    const timeoutTimer = setTimeout(() => {
        const qrDiv = document.getElementById('qrcode');
        if (qrDiv && !qrDiv.querySelector('img')) { // If QR not generated yet
            qrDiv.innerHTML = `
                <div style="color: #f2511b; text-align: center; padding: 20px;">
                    <p style="margin-bottom: 20px;">O servidor público está demorando...</p>
                    <div class="spinner" style="margin: 0 auto 10px auto;"></div>
                    <button onclick="window.location.reload()" class="btn-action" style="font-size: 0.9rem; padding: 5px 10px; margin-top: 20px">Recarregar</button>
                </div>
            `;
        }
    }, 5000); // 5 seconds timeout

    peer.on('open', (id) => {
        clearTimeout(timeoutTimer);
        console.log('Host ID:', id);
        generateQRCode(id);

        // Show ready content with smooth animation
        const readyContent = document.getElementById('ready-content');
        if (readyContent) {
            const panel = document.getElementById('panel-waiting');
            const startHeight = panel.offsetHeight;

            readyContent.style.display = 'flex';
            const endHeight = panel.offsetHeight;

            // Reset to start height and force reflow
            panel.style.height = startHeight + 'px';
            void panel.offsetHeight;

            // Animate to end height
            panel.style.height = endHeight + 'px';
            readyContent.classList.add('fade-in');

            // Cleanup
            setTimeout(() => {
                panel.style.height = 'auto';
            }, 350); // Match transition duration (+ margin)
        }

        updateUIState('waiting');
    });

    peer.on('connection', (connection) => {
        if (conn && conn.open) {
            connection.on('open', () => {
                connection.send({ type: 'error', msg: 'Sala cheia!' });
                setTimeout(() => connection.close(), 500);
            });
            return;
        }
        handleConnection(connection);
    });

    peer.on('error', (err) => {
        clearTimeout(timeoutTimer);
        handleError(err);
    });
}

function initClient(hostId) {
    // Show establishing connection state
    const qrDiv = document.getElementById('qrcode');
    if (qrDiv) {
        qrDiv.innerHTML = `
            <div class="qr-loading">
                <div class="spinner"></div>
                <p>Entrando na sala...</p>
            </div>
        `;
    }

    peer = new Peer(null, PEER_CONFIG);

    // Timeout header feedback for Client
    const timeoutTimer = setTimeout(() => {
        if (qrDiv) {
            qrDiv.innerHTML = `
                <div style="color: #f2511b; text-align: center; padding: 20px;">
                    <p style="margin-bottom: 20px;">O servidor público está demorando...</p>
                    <div class="spinner" style="margin: 0 auto 10px auto;"></div>
                    <button onclick="window.location.reload()" class="btn-action" style="font-size: 0.9rem; padding: 5px 10px; margin-top: 20px">Recarregar</button>
                    <div style="margin-top: 15px; font-size: 0.8rem; opacity: 0.7;">Tentando conectar ao ID do Host...</div>
                </div>
            `;
        }
    }, 5000); // 5 seconds timeout

    peer.on('open', (id) => {
        clearTimeout(timeoutTimer);

        // Update status - connected to PeerServer, now connecting to Host
        if (qrDiv) {
            qrDiv.innerHTML = `
                <div class="qr-loading">
                    <div class="spinner"></div>
                    <p>Conectando ao Host...</p>
                </div>
            `;
        }

        const connection = peer.connect(hostId, {
            reliable: true
        });
        handleConnection(connection);
    });

    peer.on('error', (err) => {
        clearTimeout(timeoutTimer);
        handleError(err);
    });
}

function handleConnection(connection) {
    conn = connection;

    conn.on('open', () => {
        console.log("Conexão estabelecida!");
        updateUIState('connected');

        // Update URL without reloading to look clean or allow bookmarking
        const url = new URL(window.location);
        if (!url.searchParams.has('remote')) {
            // If I am host, I might want to clear params if I want to look clean, 
            // but keeping remote param for client is useful.
        }
    });

    conn.on('data', (data) => {
        handleDataReceived(data);
    });

    conn.on('close', () => {
        showModal("Desconectado", "Conexão encerrada pelo outro dispositivo.");
        resetApp();
    });

    conn.on('error', (err) => {
        console.error("Erro na conexão:", err);
        showModal("Erro", "Erro na conexão P2P.");
    });
}

function handleError(err) {
    console.error("Erro PeerJS:", err);
    let msg = "Erro desconhecido.";
    if (err.type === 'peer-unavailable') msg = "Dispositivo não encontrado ou offline.";
    if (err.type === 'network') msg = "Erro de rede.";
    if (err.type === 'browser-incompatible') msg = "Navegador incompatível.";

    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = `
        <div style="color: #ff4444; text-align: center; padding: 20px;">
            <p>${msg}</p>
            <button onclick="window.location.reload()" class="btn-action" style="margin-top:10px">Tentar de novo</button>
        </div>
    `;
    // Also show modal if interaction happened
    showModal("Erro", msg);
}



// --- Drag & Drop & Hover Effects ---
function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    const uploadIcon = document.getElementById('upload-icon');

    // Icon paths (relative to P2PShare/index.html)
    const defaultIcon = '../Leitor-logs-totvs-fluig/assets/upload.webp';
    const activeIcon = '../Leitor-logs-totvs-fluig/assets/upload_blue.webp';

    function setUploadIcon(active) {
        if (uploadIcon) {
            uploadIcon.src = active ? activeIcon : defaultIcon;
        }
    }

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('highlight');
            setUploadIcon(true);
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('highlight');
            setUploadIcon(false);
        }, false);
    });

    // Hover effects
    dropZone.addEventListener('mouseenter', () => setUploadIcon(true));
    dropZone.addEventListener('mouseleave', () => setUploadIcon(false));

    dropZone.addEventListener('drop', handleDrop, false);
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        sendFile(files[0]);
    }
}

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) sendFile(file);
});

// --- File Transfer Logic ---

async function sendFile(file) {
    if (!conn || !conn.open) {
        showModal("Erro", "Não há conexão ativa!");
        return;
    }

    const item = createTransferItem(file.name, file.size, 'Enviando...', 'upload');
    const progressBar = item.querySelector('.progress-fill');

    // 1. Send Header
    conn.send({
        type: 'header',
        name: file.name,
        size: file.size,
        mime: file.type
    });

    // 2. Read and Chunk
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let offset = 0;

    // We try to utilize the buffered amount to avoid flooding connection
    // But PeerJS data channel 'bufferedAmount' property access needs caution.
    // simpler approach: await small delay if needed, or just loop. 
    // For robust logic, we can listen to 'bufferedamountlow' but PeerJS wraps it.
    // Let's use a simple async recursion or loop with small pauses if needed.

    for (let i = 0; i < totalChunks; i++) {
        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await chunk.arrayBuffer();

        conn.send({
            type: 'chunk',
            data: buffer,
            index: i
        });

        offset += CHUNK_SIZE;

        // Update UI every few chunks to not lag DOM
        if (i % 5 === 0 || i === totalChunks - 1) {
            const percent = Math.min(100, Math.round(((i + 1) / totalChunks) * 100));
            progressBar.style.width = percent + '%';
            item.querySelector('.status-text').innerText = 'Enviando...';
            item.querySelector('.percentage').innerText = percent + '%';

            // Allow UI to breathe
            await new Promise(r => setTimeout(r, 2));
        }
    }

    item.querySelector('.status-text').innerText = 'Enviado com sucesso!';
    item.querySelector('.status-text').style.color = '#4ade80';
    item.querySelector('.percentage').innerText = '100%';
}

function handleDataReceived(data) {
    if (data.type === 'header') {
        // Start new file
        incomingFile.buffer = [];
        incomingFile.receivedSize = 0;
        incomingFile.totalSize = data.size;
        incomingFile.name = data.name;
        incomingFile.mime = data.mime;

        const item = createTransferItem(data.name, data.size, 'Recebendo...', 'download');
        incomingFile.progressBar = item.querySelector('.progress-fill');
        incomingFile.statusText = item.querySelector('.status-text');
        incomingFile.percentageText = item.querySelector('.percentage');

    } else if (data.type === 'chunk') {
        // Append chunk
        incomingFile.buffer.push(data.data);
        incomingFile.receivedSize += data.data.byteLength;

        // Update UI
        const percent = Math.min(100, Math.round((incomingFile.receivedSize / incomingFile.totalSize) * 100));

        if (incomingFile.progressBar) {
            incomingFile.progressBar.style.width = percent + '%';
            incomingFile.statusText.innerText = 'Recebendo...';
            incomingFile.percentageText.innerText = percent + '%';
        }

        // Check completion
        if (incomingFile.receivedSize >= incomingFile.totalSize) {
            assembleAndDownload();
        }
    } else if (data.type === 'error') {
        showModal("Erro Remoto", data.msg);
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

    // Cleanup memory
    incomingFile.buffer = [];
    incomingFile.receivedSize = 0;
}


// --- UI Helpers ---

function updateUIState(state) {
    if (state === 'waiting') {
        panelWaiting.style.display = 'flex';
        panelConnected.style.display = 'none';
    } else if (state === 'connected') {
        panelWaiting.style.display = 'none';
        panelConnected.style.display = 'flex';
        document.getElementById('remote-peer-name').innerText = `Conectado com ${conn.peer}`;
    }
}

function createTransferItem(name, size, status, type) {
    const item = document.createElement('div');
    item.className = `transfer-item fade-in ${type}`;

    const formattedSize = formatBytes(size);
    const icon = getFileIcon(name);

    // Status color class
    const isUpload = type === 'upload';
    const actionIcon = isUpload ?
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' :
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';

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
                <span class="percentage">0%</span>
            </div>
        </div>
    `;
    transfersList.prepend(item);
    return item;
}

function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();

    // SVG Icons
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

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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

function resetApp() {
    conn = null;
    updateUIState('waiting');
    transfersList.innerHTML = '';
    // We might want to keep history, but resetting ensures clean state for next connection
}

btnCopy.addEventListener('click', () => {
    linkInput.select();
    document.execCommand('copy');
    const originalText = btnCopy.innerText;
    btnCopy.innerText = "Copiado!";
    setTimeout(() => btnCopy.innerText = originalText, 2000);
});

btnDisconnect.addEventListener('click', () => {
    if (conn) {
        conn.close();
    }
    resetApp();
});

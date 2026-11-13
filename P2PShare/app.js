(() => {
    'use strict';

    const Core = window.P2PCore;
    const CHUNK_SIZE = Core ? Core.CHUNK_SIZE : 65536;
    const MAX_BUFFERED_AMOUNT = Core ? Core.MAX_BUFFERED_AMOUNT : 1024 * 1024;
    const PACKET_TYPE = Core ? Core.PACKET_TYPE : { CONTROL: 0, CHUNK: 1, CANCEL: 2 };
    const MAX_CONCURRENT_UPLOADS = 1;
    const MAX_RETAINED_BLOB_BYTES = 50 * 1024 * 1024; // 50 MB
    const MAX_HOST_RETRIES = 6;
    const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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

    let db = null;
    let peer = null;
    let roomId = null;
    let currentStream = null;
    let pendingFileFromShare = null;
    let manualHostTimeout = null;
    let hostRetryTimer = null;
    let hostRetryCount = 0;
    let activeUploads = 0;

    const activeDownloads = new Map();
    const activeUploadControllers = new Map();
    const uploadQueue = [];
    const activeObjectUrls = new Set();

    function getDb() {
        if (db) return db;
        if (typeof firebase === 'undefined') return null;
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.database();
        } catch (err) {
            console.warn('Firebase unavailable:', err);
            db = null;
        }
        return db;
    }

    function getEl(id) {
        return document.getElementById(id);
    }

    function generateRoomId() {
        return Core ? Core.generateTransferId() : Math.random().toString(36).substring(2, 10).padEnd(8, '0');
    }

    function sanitizeRoomId(raw) {
        return Core ? Core.sanitizeRoomId(raw) : String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    }

    function formatBytes(bytes) {
        return Core ? Core.formatBytes(bytes) : `${bytes} Bytes`;
    }

    function sanitizeFileName(name) {
        return Core ? Core.sanitizeFileName(name) : String(name || 'arquivo');
    }

    function encodeControl(payload) {
        if (Core) return Core.encodeControlPacket(payload);
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        const packet = new Uint8Array(bytes.length + 1);
        packet[0] = PACKET_TYPE.CONTROL;
        packet.set(bytes, 1);
        return packet;
    }

    function encodeCancel(transferId) {
        if (Core) return Core.encodeCancelPacket(transferId);
        const packet = new Uint8Array(9);
        packet[0] = PACKET_TYPE.CANCEL;
        packet.set(new TextEncoder().encode(String(transferId).padEnd(8, '0').slice(0, 8)), 1);
        return packet;
    }

    function encodeChunk(transferId, chunkBytes) {
        if (Core) return Core.encodeChunkPacket(transferId, chunkBytes);
        const packet = new Uint8Array(9 + chunkBytes.length);
        packet[0] = PACKET_TYPE.CHUNK;
        packet.set(new TextEncoder().encode(String(transferId).padEnd(8, '0').slice(0, 8)), 1);
        packet.set(chunkBytes, 9);
        return packet;
    }

    async function copyText(text) {
        if (!text) return false;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (_) {
                // Fall back to execCommand below
            }
        }
        try {
            const temp = document.createElement('textarea');
            temp.value = text;
            temp.setAttribute('readonly', '');
            temp.style.position = 'fixed';
            temp.style.opacity = '0';
            document.body.appendChild(temp);
            temp.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(temp);
            return Boolean(ok);
        } catch (_) {
            return false;
        }
    }

    function clearTimeoutSafe(timerId) {
        if (timerId !== null) {
            clearTimeout(timerId);
        }
        return null;
    }

    function cleanupFirebaseListeners(targetRoomId) {
        const database = getDb();
        if (!database || !targetRoomId) return;
        try {
            database.ref(`rooms/${targetRoomId}/answer`).off();
            database.ref(`rooms/${targetRoomId}/offer`).off();
            database.ref(`rooms/${targetRoomId}/client_join_attempt`).off();
            database.ref(`rooms/${targetRoomId}`).off();
        } catch (_) {
            // Ignore cleanup errors on shutdown
        }
    }

    function revokeTrackedUrls() {
        activeObjectUrls.forEach(url => {
            try { URL.revokeObjectURL(url); } catch (_) { }
        });
        activeObjectUrls.clear();
    }

    function setWaitingSubstatus(message = '') {
        const sub = getEl('waiting-status-text');
        if (!sub) return;
        if (message) {
            sub.textContent = message;
            sub.hidden = false;
        } else {
            sub.textContent = '';
            sub.hidden = true;
        }
    }

    function setManualError(message = '') {
        const el = getEl('manual-error');
        if (!el) return;
        if (message) {
            el.textContent = message;
            el.hidden = false;
        } else {
            el.textContent = '';
            el.hidden = true;
        }
    }

    function updateTransfersSummary() {
        const header = getEl('transfers-header');
        const summary = getEl('transfers-summary');
        const clearBtn = getEl('btn-clear-transfers');
        const list = getEl('transfers-list');
        if (!header || !summary || !list) return;

        const items = Array.from(list.children);
        if (items.length === 0) {
            header.hidden = true;
            return;
        }

        header.hidden = false;
        const doneCount = items.filter(el => el.dataset.state === 'done').length;
        const activeCount = items.length - doneCount;
        const label = items.length === 1 ? '1 transferência' : `${items.length} transferências`;
        summary.textContent = activeCount > 0 ? `${label} (${activeCount} em andamento)` : label;
        if (clearBtn) {
            clearBtn.hidden = doneCount === 0;
        }
    }

    function showModal(title, message, options = {}) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mode') === 'obs') {
            console.warn('OBS Modal Suprimido:', title, message);
            if (options.retry) setTimeout(() => window.location.reload(), 2000);
            return;
        }

        const modal = getEl('alertModal');
        const titleEl = getEl('alertTitle');
        const msgEl = getEl('alertMessage');
        const actionsDiv = modal ? modal.querySelector('.modal-actions') : null;
        const closeBtn = modal ? modal.querySelector('.modal-close') : null;

        if (!modal || !titleEl || !msgEl || !actionsDiv) return;

        titleEl.textContent = title;
        msgEl.textContent = message;

        if (options.hideClose) {
            modal.dataset.locked = 'true';
            if (closeBtn) closeBtn.style.display = 'none';
        } else {
            delete modal.dataset.locked;
            if (closeBtn) closeBtn.style.display = '';
        }

        actionsDiv.innerHTML = '';
        actionsDiv.classList.remove('actionRetry');

        if (!options.retry && !options.host) {
            const btnOk = document.createElement('button');
            btnOk.type = 'button';
            btnOk.className = 'btn btn-primary';
            btnOk.textContent = 'OK';
            btnOk.addEventListener('click', closeModal);
            actionsDiv.appendChild(btnOk);
        }

        if (options.host) {
            const btnHost = document.createElement('button');
            btnHost.type = 'button';
            btnHost.className = 'btn btn-host';
            btnHost.textContent = 'Virar Host';
            btnHost.addEventListener('click', () => {
                forceCloseModal();
                resetApp(true);
            });
            actionsDiv.appendChild(btnHost);
        }

        if (options.retry) {
            const btnRetry = document.createElement('button');
            btnRetry.type = 'button';
            btnRetry.className = 'btn btn-retry';
            btnRetry.textContent = 'Reconectar';
            btnRetry.addEventListener('click', () => {
                forceCloseModal();
                window.location.reload();
            });
            actionsDiv.classList.add('actionRetry');
            actionsDiv.appendChild(btnRetry);
        }

        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('active');
    }

    function closeModal() {
        const modal = getEl('alertModal');
        if (!modal || modal.dataset.locked === 'true') return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    function forceCloseModal() {
        const modal = getEl('alertModal');
        if (!modal) return;
        delete modal.dataset.locked;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    function showClipboardModal(text, autoCopied = false) {
        const modal = getEl('clipboardModal');
        const textarea = getEl('clipboard-review');
        const copyBtn = getEl('btn-manual-copy');
        if (!modal || !textarea || !copyBtn) return;

        textarea.value = text;
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('active');

        const setCopiedState = (copied) => {
            if (copied) {
                copyBtn.textContent = 'Copiado! ✔';
                copyBtn.style.background = '#16a34a';
            } else {
                copyBtn.textContent = 'Copiar';
                copyBtn.style.background = '';
            }
        };

        setCopiedState(autoCopied);

        copyBtn.onclick = async () => {
            const ok = await copyText(textarea.value);
            if (ok) {
                setCopiedState(true);
                setTimeout(() => closeClipboardModal(), 900);
            }
        };
    }

    function closeClipboardModal() {
        const modal = getEl('clipboardModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    window.closeModal = closeModal;
    window.closeClipboardModal = closeClipboardModal;

    function renderObsIdentity(safeRoomId) {
        const obsIdDiv = getEl('obs-identity');
        if (!obsIdDiv) return;

        obsIdDiv.style.display = '';
        obsIdDiv.replaceChildren();

        const label = document.createElement('span');
        label.style.cssText = 'font-size: 0.85rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 4px; margin-bottom: 5px;';
        label.textContent = 'Código de Acesso';

        const code = document.createElement('span');
        code.style.cssText = 'font-size: 4.5rem; font-weight: 800; color: #fff; font-family: monospace; line-height: 1;';
        code.textContent = safeRoomId;

        const hint = document.createElement('span');
        hint.style.cssText = 'font-size: 0.9rem; color: var(--accent-color); margin-top: 10px; font-weight: 500;';
        hint.textContent = 'Insira este código para conectar';

        obsIdDiv.append(label, code, hint);
    }

    function generateQRCode(id) {
        const qrContainer = getEl('qrcode');
        const linkInput = getEl('share-link');
        const obsInput = getEl('link-obs');
        if (!qrContainer) return;

        const origin = window.location.origin;
        const path = window.location.pathname;
        const connectUrl = `${origin}${path}?remote=${encodeURIComponent(id)}`;
        const obsUrl = `${origin}${path}?host_id=${encodeURIComponent(id)}&mode=obs`;

        if (linkInput) linkInput.value = connectUrl;
        if (obsInput) obsInput.value = obsUrl;

        qrContainer.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: connectUrl,
                width: 180,
                height: 180,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel ? QRCode.CorrectLevel.L : 1
            });
            qrContainer.setAttribute('aria-label', `QR Code para conectar na sala ${id}`);
        } else {
            const fallback = document.createElement('p');
            fallback.className = 'waiting-substatus';
            fallback.textContent = id;
            qrContainer.appendChild(fallback);
        }
    }

    function updateUIState(state) {
        const panelWaiting = getEl('panel-waiting');
        const panelConnected = getEl('panel-connected');
        if (!panelWaiting || !panelConnected) return;

        if (state === 'waiting') {
            panelWaiting.style.display = 'flex';
            panelConnected.style.display = 'none';
        } else if (state === 'connected') {
            panelWaiting.style.display = 'none';
            panelConnected.style.display = 'flex';
            const peerNameEl = getEl('remote-peer-name');
            if (peerNameEl) peerNameEl.textContent = 'Conectado via P2P (Seguro)';
        }
    }

    function processPendingFile() {
        const fileInput = getEl('file-input');
        if (!pendingFileFromShare || !fileInput || !peer || !peer.connected) return;
        const fileToQueue = pendingFileFromShare;
        pendingFileFromShare = null;
        queueFile(fileToQueue);
    }

    function handleConnection() {
        hostRetryCount = 0;
        hostRetryTimer = clearTimeoutSafe(hostRetryTimer);
        manualHostTimeout = clearTimeoutSafe(manualHostTimeout);
        setWaitingSubstatus('');
        updateUIState('connected');
        forceCloseModal();

        const transfersList = getEl('transfers-list');
        if (transfersList) transfersList.innerHTML = '';
        activeDownloads.clear();
        activeUploadControllers.clear();
        uploadQueue.length = 0;
        activeUploads = 0;
        updateTransfersSummary();

        setTimeout(() => {
            processPendingFile();
        }, 400);
    }

    function handleDisconnect() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mode') === 'obs') {
            resetApp();
            return;
        }
        showModal('Desconectado', 'Conexão encerrada.', { retry: true, host: true, hideClose: true });
        resetApp();
    }

    function handleError(err) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mode') === 'obs') return;

        let msg = (err && err.message) || 'Erro desconhecido.';
        if (err && err.code === 'ERR_WEBRTC_SUPPORT') {
            msg = 'Seu navegador não suporta WebRTC.';
        }
        showModal('Erro', msg, { retry: true, host: true, hideClose: true });
    }

    function scheduleHostRestart(currentRoomId, delayMs) {
        hostRetryTimer = clearTimeoutSafe(hostRetryTimer);
        if (hostRetryCount >= MAX_HOST_RETRIES) {
            setWaitingSubstatus('Falha repetida na conexão P2P. Recarregue ou tente outra rede.');
            return;
        }
        hostRetryCount += 1;
        const backoff = Math.max(delayMs, Math.min(8000, 500 * Math.pow(2, hostRetryCount - 1)));
        setWaitingSubstatus(`Reconectando sinalização (${hostRetryCount}/${MAX_HOST_RETRIES})...`);
        hostRetryTimer = setTimeout(() => {
            if (roomId === currentRoomId) {
                restartHostPeer(currentRoomId);
            }
        }, backoff);
    }

    function restartHostPeer(currentRoomId) {
        hostRetryTimer = clearTimeoutSafe(hostRetryTimer);
        if (peer) {
            peer.removeAllListeners();
            peer.destroy();
            peer = null;
        }

        const database = getDb();
        if (database) {
            database.ref(`rooms/${currentRoomId}/answer`).remove().catch(() => {});
        }

        if (typeof SimplePeer === 'undefined') {
            setWaitingSubstatus('Biblioteca WebRTC indisponível.');
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const isObs = urlParams.get('mode') === 'obs';

        try {
            peer = new SimplePeer({
                initiator: true,
                trickle: false,
                config: RTC_CONFIG
            });
        } catch (err) {
            handleError(err);
            return;
        }

        peer.on('signal', data => {
            const d = getDb();
            if (d) d.ref(`rooms/${currentRoomId}/offer`).set(JSON.stringify(data));
        });

        peer.on('connect', handleConnection);
        peer.on('data', data => handleDataReceived(data));
        peer.on('stream', stream => handleVideoStream(stream, isObs));

        peer.on('close', () => {
            if (!isObs) updateUIState('waiting');
            scheduleHostRestart(currentRoomId, 500);
        });

        peer.on('error', err => {
            console.error('Erro Peer:', err);
            scheduleHostRestart(currentRoomId, isObs ? 2000 : 1000);
        });
    }

    function initHost() {
        const database = getDb();
        const urlParams = new URLSearchParams(window.location.search);
        const rawHostId = urlParams.get('host_id');
        const cleanedHostId = rawHostId ? sanitizeRoomId(rawHostId) : '';
        roomId = cleanedHostId || generateRoomId();
        hostRetryCount = 0;

        renderObsIdentity(roomId);

        const displayId = getEl('room-id-display');
        if (displayId) displayId.textContent = roomId;

        cleanupFirebaseListeners(roomId);

        if (database) {
            if (urlParams.get('mode') === 'obs' || urlParams.has('host_id')) {
                database.ref(`rooms/${roomId}/answer`).remove().catch(() => {});
            }

            database.ref(`rooms/${roomId}/client_join_attempt`).on('value', snapshot => {
                if (snapshot.val()) {
                    snapshot.ref.remove().catch(() => {});
                    hostRetryCount = 0;
                    restartHostPeer(roomId);
                }
            });

            let lastAnswer = null;
            database.ref(`rooms/${roomId}/answer`).on('value', snapshot => {
                const data = snapshot.val();
                if (!data || data === lastAnswer) return;
                lastAnswer = data;
                if (!peer || peer.destroyed) return;

                let signal;
                try {
                    signal = JSON.parse(data);
                } catch (e) {
                    console.warn('Resposta inválida ignorada:', e);
                    return;
                }

                if (peer._pc && peer._pc.signalingState === 'stable' && signal.type === 'answer') {
                    return;
                }
                try {
                    peer.signal(signal);
                } catch (e) {
                    console.warn('Sinal ignorado:', e);
                }
            });
        }

        generateQRCode(roomId);
        updateUIState('waiting');
        setWaitingSubstatus('');

        const readyContent = getEl('ready-content');
        if (readyContent) {
            readyContent.style.display = 'flex';
            readyContent.classList.add('fade-in');
        }

        restartHostPeer(roomId);
    }

    function initClient(rawId) {
        const cleanId = sanitizeRoomId(rawId);
        if (!cleanId) {
            showModal('ID inválido', 'O código da sala informado não é válido.', { host: true });
            initHost();
            return;
        }

        cleanupFirebaseListeners(roomId);
        manualHostTimeout = clearTimeoutSafe(manualHostTimeout);

        roomId = cleanId;
        try {
            localStorage.setItem('p2p_last_remote', roomId);
        } catch (_) { }

        const qrDiv = getEl('qrcode');
        if (qrDiv) {
            qrDiv.innerHTML = '';
            const loadingWrap = document.createElement('div');
            loadingWrap.className = 'qr-loading';
            loadingWrap.setAttribute('role', 'status');
            loadingWrap.setAttribute('aria-live', 'polite');

            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            spinner.setAttribute('aria-hidden', 'true');

            const loadingText = document.createElement('p');
            loadingText.id = 'loading-text';
            loadingText.textContent = 'Buscando sala...';

            loadingWrap.append(spinner, loadingText);
            qrDiv.appendChild(loadingWrap);
        }

        const database = getDb();
        if (!database || typeof SimplePeer === 'undefined') {
            setWaitingSubstatus('Sinalização indisponível no momento.');
            return;
        }

        database.ref(`rooms/${roomId}/client_join_attempt`).set(Date.now()).catch(() => {});

        manualHostTimeout = setTimeout(() => {
            if (!peer || !peer.connected) {
                showModal(
                    'Não conectou?',
                    'O Host não respondeu ou a sala não existe mais.',
                    { retry: true, host: true, hideClose: true }
                );
            }
        }, 15000);

        let lastOffer = null;
        database.ref(`rooms/${roomId}/offer`).on('value', snapshot => {
            const offer = snapshot.val();
            if (!offer || offer === lastOffer) return;

            let signal;
            try {
                signal = JSON.parse(offer);
            } catch (e) {
                console.warn('Offer inválido ignorado:', e);
                return;
            }
            lastOffer = offer;

            const loadingText = getEl('loading-text');
            if (loadingText) loadingText.textContent = 'Conectando...';

            if (!peer) {
                peer = new SimplePeer({
                    initiator: false,
                    trickle: false,
                    config: RTC_CONFIG
                });

                peer.on('stream', stream => handleVideoStream(stream, false));
                peer.on('signal', data => {
                    database.ref(`rooms/${roomId}/answer`).set(JSON.stringify(data));
                });
                peer.on('connect', handleConnection);
                peer.on('data', data => handleDataReceived(data));
                peer.on('close', handleDisconnect);
                peer.on('error', handleError);
            }

            try {
                peer.signal(signal);
            } catch (e) {
                console.warn('Falha ao processar offer:', e);
            }
        });
    }

    function closeVideoUI() {
        const wrapper = getEl('video-wrapper');
        const video = getEl('remote-video');
        const obsIdDiv = getEl('obs-identity');

        if (wrapper) wrapper.style.display = 'none';
        if (obsIdDiv) obsIdDiv.style.display = '';

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mode') !== 'obs') {
            document.body.classList.remove('obs-mode');
        }

        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }

        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            if (peer && !peer.destroyed) {
                try { peer.removeStream(currentStream); } catch (_) { }
            }
            currentStream = null;
        }

        const btnCam = getEl('btn-share-cam');
        const btnScreen = getEl('btn-share-screen');
        if (btnCam) btnCam.disabled = false;
        if (btnScreen) btnScreen.disabled = false;
    }

    function handleVideoStream(stream, isObs) {
        const video = getEl('remote-video');
        const wrapper = getEl('video-wrapper');
        const obsIdDiv = getEl('obs-identity');

        if (obsIdDiv) obsIdDiv.style.display = 'none';
        if (wrapper) {
            wrapper.style.display = 'flex';
            wrapper.style.zIndex = '9999';
        }
        if (video) {
            video.srcObject = stream;
            video.muted = true;
            video.playsInline = true;
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                    video.muted = true;
                    video.play().catch(() => {});
                });
            }
        }
        if (isObs) document.body.classList.add('obs-mode');
    }

    function resetApp(forceDisconnect = false) {
        manualHostTimeout = clearTimeoutSafe(manualHostTimeout);
        hostRetryTimer = clearTimeoutSafe(hostRetryTimer);
        closeVideoUI();
        cleanupFirebaseListeners(roomId);

        if (peer) {
            peer.removeAllListeners();
            peer.destroy();
            peer = null;
        }

        activeDownloads.forEach(fs => {
            if (fs.buffer) fs.buffer.length = 0;
        });
        activeDownloads.clear();
        activeUploadControllers.clear();
        uploadQueue.length = 0;
        activeUploads = 0;
        revokeTrackedUrls();

        const transfersList = getEl('transfers-list');
        if (transfersList) transfersList.innerHTML = '';
        updateTransfersSummary();

        const urlParams = new URLSearchParams(window.location.search);
        const isFixedRoom = urlParams.has('host_id');
        const isObsMode = urlParams.get('mode') === 'obs';
        const isClient = urlParams.has('remote');

        if (isClient && !forceDisconnect) {
            return;
        }

        if (!isFixedRoom && !isObsMode) {
            roomId = null;
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        initHost();
    }

    async function handleShareTarget(urlParams) {
        try {
            if (typeof caches === 'undefined') return;
            const cache = await caches.open('share-cache');
            const response = await cache.match('shared-file');
            const metaResponse = await cache.match('shared-meta');

            if (!response) return;

            const blob = await response.blob();
            let fileName = 'shared_file';
            let fileType = blob.type;

            if (metaResponse) {
                const meta = await metaResponse.json();
                if (meta.name) fileName = sanitizeFileName(meta.name);
                if (meta.type) fileType = meta.type;
            }

            const file = new File([blob], fileName, { type: fileType });
            showModal('Arquivo Recebido', `Arquivo "${file.name}" pronto para enviar.`);

            pendingFileFromShare = file;
            if (peer && peer.connected) {
                processPendingFile();
            }

            await cache.delete('shared-file');
            await cache.delete('shared-meta');

            urlParams.delete('share_target');
            const remainingQuery = urlParams.toString();
            const nextUrl = remainingQuery ? `${window.location.pathname}?${remainingQuery}` : window.location.pathname;
            window.history.replaceState({}, document.title, nextUrl);
        } catch (e) {
            console.error('Erro Share Target:', e);
        }
    }

    function sendCancelPacket(transferId) {
        if (!peer || !peer.connected) return;
        try {
            peer.send(encodeCancel(transferId));
        } catch (_) { }
    }

    function waitForBufferDrain(channel, isAborted) {
        return new Promise(resolve => {
            if (!channel || channel.readyState !== 'open' || isAborted()) {
                resolve();
                return;
            }
            if (channel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
                resolve();
                return;
            }

            let settled = false;
            let timer = null;

            const finish = () => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                if (typeof channel.removeEventListener === 'function') {
                    channel.removeEventListener('bufferedamountlow', onLow);
                }
                resolve();
            };

            const onLow = () => {
                if (isAborted() || !channel || channel.readyState !== 'open' || channel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
                    finish();
                }
            };

            if ('bufferedAmountLowThreshold' in channel) {
                try {
                    channel.bufferedAmountLowThreshold = Math.floor(MAX_BUFFERED_AMOUNT / 2);
                } catch (_) { }
            }
            if (typeof channel.addEventListener === 'function') {
                channel.addEventListener('bufferedamountlow', onLow);
            }
            timer = setTimeout(finish, 50);
        });
    }

    function finishTransferItem(item, statusLabel, color, extraAction = null) {
        if (!item) return;
        item.dataset.state = 'done';
        const statusText = item.querySelector('.status-text');
        const cancelBtn = item.querySelector('.btn-cancel-transfer');
        const footer = item.querySelector('.transfer-footer');
        if (cancelBtn) cancelBtn.remove();
        if (statusText) {
            statusText.textContent = statusLabel;
            if (color) statusText.style.color = color;
        }
        if (extraAction && footer) {
            footer.insertBefore(extraAction, footer.querySelector('.percentage'));
        }
        updateTransfersSummary();
    }

    async function sendFile(file, existingElement = null) {
        if (!peer || !peer.connected) {
            showModal('Erro', 'Não há conexão ativa!');
            return;
        }

        const transferId = Core ? Core.generateTransferId() : generateRoomId();
        let cancelReason = null;

        const item = existingElement || createTransferItem(file.name, file.size, 'Iniciando...', 'upload');
        const statusText = item.querySelector('.status-text');
        const progressBar = item.querySelector('.progress-fill');
        const percentageText = item.querySelector('.percentage');
        const cancelBtn = item.querySelector('.btn-cancel-transfer');

        const triggerCancel = (reason = 'Cancelado') => {
            if (!cancelReason) cancelReason = reason;
        };

        activeUploadControllers.set(transferId, triggerCancel);
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                triggerCancel('Cancelado');
            };
        }

        const safeName = sanitizeFileName(file.name);
        const headerPacket = encodeControl({
            type: 'header',
            transferId,
            name: safeName,
            size: file.size,
            mime: file.type
        });

        try {
            peer.send(headerPacket);
        } catch (_) {
            activeUploadControllers.delete(transferId);
            finishTransferItem(item, 'Erro ao iniciar', 'var(--danger-color)');
            return;
        }

        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        let offset = 0;
        const startTime = Date.now();
        let lastUiTime = 0;

        for (let i = 0; i < totalChunks; i++) {
            if (!peer || !peer.connected || cancelReason) {
                activeUploadControllers.delete(transferId);
                if (cancelReason === 'Cancelado') {
                    sendCancelPacket(transferId);
                }
                finishTransferItem(
                    item,
                    cancelReason || 'Erro de Conexão',
                    'var(--danger-color)'
                );
                return;
            }

            if (peer._channel && peer._channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                await waitForBufferDrain(peer._channel, () => !peer || !peer.connected || Boolean(cancelReason));
                if (!peer || !peer.connected || cancelReason) {
                    activeUploadControllers.delete(transferId);
                    if (cancelReason === 'Cancelado') sendCancelPacket(transferId);
                    finishTransferItem(item, cancelReason || 'Erro de Conexão', 'var(--danger-color)');
                    return;
                }
            }

            const chunk = file.slice(offset, offset + CHUNK_SIZE);
            const buffer = await chunk.arrayBuffer();
            const packet = encodeChunk(transferId, new Uint8Array(buffer));

            let sent = false;
            for (let attempt = 0; attempt < 5; attempt++) {
                if (!peer || !peer.connected || cancelReason) break;
                try {
                    peer.send(packet);
                    sent = true;
                    break;
                } catch (_) {
                    await new Promise(r => setTimeout(r, 50));
                }
            }

            if (!sent) {
                activeUploadControllers.delete(transferId);
                finishTransferItem(item, cancelReason || 'Falha no envio', 'var(--danger-color)');
                return;
            }

            offset = Math.min(file.size, offset + CHUNK_SIZE);
            const now = Date.now();
            if (now - lastUiTime >= 250 || i === totalChunks - 1) {
                const percent = file.size === 0 ? 100 : Math.floor(((i + 1) / totalChunks) * 100);
                const elapsedMs = now - startTime;
                const speed = Core ? Core.formatSpeed(offset, elapsedMs) : { text: '', bytesPerSec: 0 };
                if (progressBar) progressBar.style.width = `${percent}%`;
                if (percentageText) percentageText.textContent = `${percent}%`;
                if (statusText) {
                    statusText.textContent = speed.text ? `Enviando... (${speed.text})` : 'Enviando...';
                }
                lastUiTime = now;
            }
        }

        activeUploadControllers.delete(transferId);
        if (progressBar) progressBar.style.width = '100%';
        if (percentageText) percentageText.textContent = '100%';
        finishTransferItem(item, 'Enviado!', 'var(--success-color)');
    }

    function queueFile(file) {
        if (!peer || !peer.connected) {
            showModal('Erro', 'Conecte-se primeiro.');
            return;
        }
        const entry = { file, element: null };
        const item = createTransferItem(file.name, file.size, 'Aguardando...', 'upload', () => {
            const idx = uploadQueue.indexOf(entry);
            if (idx > -1) {
                uploadQueue.splice(idx, 1);
                finishTransferItem(item, 'Cancelado', 'var(--danger-color)');
            }
        });
        entry.element = item;
        uploadQueue.push(entry);
        processQueue();
    }

    async function processQueue() {
        if (activeUploads >= MAX_CONCURRENT_UPLOADS || uploadQueue.length === 0) return;
        const next = uploadQueue.shift();
        if (!next) return;
        activeUploads++;
        const status = next.element ? next.element.querySelector('.status-text') : null;
        if (status) status.textContent = 'Preparando...';
        try {
            await sendFile(next.file, next.element);
        } catch (e) {
            console.error(e);
        } finally {
            activeUploads--;
            setTimeout(processQueue, 20);
        }
    }

    function handleDataReceived(rawData) {
        const decoded = Core ? Core.decodePacket(rawData) : null;
        if (!decoded || decoded.type === -1) return;

        if (decoded.type === PACKET_TYPE.CHUNK) {
            const fileState = activeDownloads.get(decoded.transferId);
            if (!fileState) return;

            fileState.buffer.push(decoded.chunkBytes);
            fileState.receivedSize += decoded.chunkBytes.byteLength;

            const now = Date.now();
            if (now - fileState.lastTime >= 250 || fileState.receivedSize >= fileState.totalSize) {
                const percent = fileState.totalSize === 0
                    ? 100
                    : Math.min(100, Math.round((fileState.receivedSize / fileState.totalSize) * 100));
                const speed = Core ? Core.formatSpeed(fileState.receivedSize, now - fileState.startTime) : { text: '' };
                if (fileState.progressBar) fileState.progressBar.style.width = `${percent}%`;
                if (fileState.percentageText) fileState.percentageText.textContent = `${percent}%`;
                if (fileState.statusText) {
                    fileState.statusText.textContent = speed.text ? `Recebendo... (${speed.text})` : 'Recebendo...';
                }
                fileState.lastTime = now;
            }

            if (fileState.receivedSize >= fileState.totalSize) {
                assembleAndDownload(decoded.transferId);
            }
            return;
        }

        if (decoded.type === PACKET_TYPE.CANCEL) {
            const uploadController = activeUploadControllers.get(decoded.transferId);
            if (uploadController) {
                uploadController('Cancelado pelo destinatário');
                return;
            }

            const fileState = activeDownloads.get(decoded.transferId);
            if (fileState) {
                fileState.buffer.length = 0;
                activeDownloads.delete(decoded.transferId);
                finishTransferItem(fileState.item, 'Cancelado pelo remetente', 'var(--danger-color)');
            }
            return;
        }

        if (decoded.type === PACKET_TYPE.CONTROL) {
            const json = decoded.json;
            if (!json || typeof json !== 'object') return;

            if (json.type === 'header') {
                const transferId = typeof json.transferId === 'string' ? json.transferId : '';
                const safeName = sanitizeFileName(json.name);
                const totalSize = Number.isFinite(Number(json.size)) && Number(json.size) >= 0 ? Number(json.size) : 0;
                const mime = typeof json.mime === 'string' ? json.mime : '';

                const item = createTransferItem(safeName, totalSize, 'Recebendo...', 'download', () => {
                    const fs = activeDownloads.get(transferId);
                    if (fs) {
                        fs.buffer.length = 0;
                        activeDownloads.delete(transferId);
                        finishTransferItem(fs.item, 'Cancelado', 'var(--danger-color)');
                        sendCancelPacket(transferId);
                    }
                });

                activeDownloads.set(transferId, {
                    buffer: [],
                    receivedSize: 0,
                    totalSize,
                    name: safeName,
                    mime,
                    item,
                    progressBar: item.querySelector('.progress-fill'),
                    percentageText: item.querySelector('.percentage'),
                    statusText: item.querySelector('.status-text'),
                    startTime: Date.now(),
                    lastTime: 0
                });

                if (totalSize === 0) {
                    assembleAndDownload(transferId);
                }
            } else if (json.type === 'clipboard' && typeof json.text === 'string') {
                showClipboardModal(json.text, false);
                copyText(json.text).then(copied => {
                    if (copied) {
                        const copyBtn = getEl('btn-manual-copy');
                        if (copyBtn) {
                            copyBtn.textContent = 'Copiado! ✔';
                            copyBtn.style.background = '#16a34a';
                        }
                    }
                });
            } else if (json.type === 'close-video') {
                closeVideoUI();
            }
        }
    }

    function triggerBlobDownload(blob, fileName) {
        const url = URL.createObjectURL(blob);
        activeObjectUrls.add(url);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => {
            try { URL.revokeObjectURL(url); } catch (_) { }
            activeObjectUrls.delete(url);
        }, 15000);
    }

    function assembleAndDownload(id) {
        const fs = activeDownloads.get(id);
        if (!fs) return;

        const blob = new Blob(fs.buffer, { type: fs.mime || 'application/octet-stream' });
        fs.buffer.length = 0;
        activeDownloads.delete(id);

        triggerBlobDownload(blob, fs.name);

        if (fs.progressBar) fs.progressBar.style.width = '100%';
        if (fs.percentageText) fs.percentageText.textContent = '100%';

        let reDownloadBtn = null;
        if (blob.size <= MAX_RETAINED_BLOB_BYTES) {
            reDownloadBtn = document.createElement('button');
            reDownloadBtn.type = 'button';
            reDownloadBtn.className = 'btn-download-again';
            reDownloadBtn.textContent = 'Baixar';
            reDownloadBtn.title = 'Baixar arquivo novamente';
            reDownloadBtn.addEventListener('click', () => triggerBlobDownload(blob, fs.name));
        }

        finishTransferItem(fs.item, 'Recebido!', 'var(--success-color)', reDownloadBtn);
    }

    function getFileIcon(name) {
        const ext = String(name || '').split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
        if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv'].includes(ext)) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>';
        if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
        if (ext === 'pdf') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15h3a2 2 0 0 0 0-4H9v4z"></path></svg>';
        if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>';
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 12.5v5"></path><path d="M14 12.5v5"></path><path d="M12 2v10"></path><path d="M21 10V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"></path></svg>';
        if (['js', 'html', 'css', 'json', 'py', 'php', 'ts', 'sql', 'c', 'cpp', 'java'].includes(ext)) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
        if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>';
    }

    /**
     * Renders a transfer row safely using textContent for untrusted filenames/status
     * to prevent HTML/XSS injection from remote peers.
     */
    function createTransferItem(name, size, status, type, onCancel) {
        const safeName = sanitizeFileName(name);
        const transfersList = getEl('transfers-list');

        const item = document.createElement('div');
        item.className = `transfer-item fade-in ${type === 'download' ? 'download' : 'upload'}`;
        item.dataset.state = 'active';

        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'transfer-icon-wrapper';
        iconWrapper.innerHTML = getFileIcon(safeName);

        const badge = document.createElement('span');
        badge.className = `transfer-badge ${type === 'download' ? 'download' : 'upload'}`;
        badge.textContent = type === 'download' ? '↓' : '↑';
        badge.setAttribute('aria-hidden', 'true');
        iconWrapper.appendChild(badge);

        const content = document.createElement('div');
        content.className = 'transfer-content';

        const header = document.createElement('div');
        header.className = 'transfer-header';

        const nameEl = document.createElement('span');
        nameEl.className = 'file-name';
        nameEl.textContent = safeName;
        nameEl.title = safeName;

        const sizeEl = document.createElement('span');
        sizeEl.className = 'file-size';
        sizeEl.textContent = formatBytes(size);
        header.append(nameEl, sizeEl);

        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        const progressBg = document.createElement('div');
        progressBg.className = 'progress-bar-bg';
        const progressFill = document.createElement('div');
        progressFill.className = 'progress-fill';
        progressFill.style.width = '0%';
        progressBg.appendChild(progressFill);
        progressContainer.appendChild(progressBg);

        const footer = document.createElement('div');
        footer.className = 'transfer-footer';

        const statusEl = document.createElement('span');
        statusEl.className = 'status-text';
        statusEl.textContent = status;

        const percentageEl = document.createElement('span');
        percentageEl.className = 'percentage';
        percentageEl.textContent = '0%';

        footer.append(statusEl, percentageEl);

        if (typeof onCancel === 'function') {
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn-cancel-transfer';
            cancelBtn.setAttribute('aria-label', `Cancelar ${safeName}`);
            cancelBtn.textContent = '×';
            cancelBtn.onclick = onCancel;
            footer.appendChild(cancelBtn);
        }

        content.append(header, progressContainer, footer);
        item.append(iconWrapper, content);

        if (transfersList) {
            transfersList.appendChild(item);
            updateTransfersSummary();
        }
        return item;
    }

    async function startStream(type) {
        if (!peer || !peer.connected) {
            showModal('Erro', 'Conecte-se primeiro!');
            return;
        }
        try {
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
            if (type === 'camera') {
                currentStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 }, facingMode: 'environment' },
                    audio: false
                });
            } else {
                currentStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: { ideal: 30 } },
                    audio: false
                });
            }

            peer.addStream(currentStream);
            const video = getEl('remote-video');
            const wrapper = getEl('video-wrapper');
            if (wrapper) wrapper.style.display = 'flex';
            if (video) {
                video.srcObject = currentStream;
                video.muted = true;
                video.play().catch(() => {});
            }

            const btnCam = getEl('btn-share-cam');
            const btnScreen = getEl('btn-share-screen');
            if (btnCam) btnCam.disabled = true;
            if (btnScreen) btnScreen.disabled = true;

            const videoTrack = currentStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.onended = () => {
                    closeVideoUI();
                    if (peer && peer.connected) {
                        try { peer.send(encodeControl({ type: 'close-video' })); } catch (_) { }
                    }
                };
            }
        } catch (err) {
            console.error(err);
            showModal('Erro', `Falha ao iniciar stream: ${err.message}`);
        }
    }

    function setupDragAndDrop() {
        const dropZone = getEl('drop-zone');
        const uploadIcon = getEl('upload-icon');
        if (!dropZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evtName => {
            dropZone.addEventListener(evtName, ev => {
                ev.preventDefault();
                ev.stopPropagation();
            });
        });

        dropZone.addEventListener('dragover', () => {
            dropZone.classList.add('highlight');
            if (uploadIcon) uploadIcon.src = '../Leitor-logs-totvs-fluig/assets/upload_blue.webp';
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('highlight');
            if (uploadIcon) uploadIcon.src = '../Leitor-logs-totvs-fluig/assets/upload.webp';
        });

        dropZone.addEventListener('drop', e => {
            dropZone.classList.remove('highlight');
            if (uploadIcon) uploadIcon.src = '../Leitor-logs-totvs-fluig/assets/upload.webp';
            if (e.dataTransfer && e.dataTransfer.files) {
                Array.from(e.dataTransfer.files).forEach(queueFile);
            }
        });
    }

    function bindUiEvents() {
        const btnVoltar = getEl('btnVoltar');
        if (btnVoltar) {
            btnVoltar.addEventListener('click', () => {
                window.location.href = '../';
            });
        }

        const btnCloseAlertX = getEl('btn-close-alert-x');
        const btnOkAlert = getEl('btn-ok-alert');
        if (btnCloseAlertX) btnCloseAlertX.addEventListener('click', closeModal);
        if (btnOkAlert) btnOkAlert.addEventListener('click', closeModal);

        const btnCloseClipboardX = getEl('btn-close-clipboard-x');
        const btnCloseClipboard = getEl('btn-close-clipboard');
        if (btnCloseClipboardX) btnCloseClipboardX.addEventListener('click', closeClipboardModal);
        if (btnCloseClipboard) btnCloseClipboard.addEventListener('click', closeClipboardModal);

        window.addEventListener('click', (event) => {
            const alertModal = getEl('alertModal');
            const clipModal = getEl('clipboardModal');
            if (event.target === alertModal && alertModal.dataset.locked !== 'true') {
                closeModal();
            }
            if (event.target === clipModal) {
                closeClipboardModal();
            }
        });

        window.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            const alertModal = getEl('alertModal');
            const isAlertOpen = alertModal && alertModal.classList.contains('active');
            const isLocked = alertModal && alertModal.dataset.locked === 'true';
            if (isAlertOpen && isLocked) return;
            closeModal();
            closeClipboardModal();
        });

        const fileInput = getEl('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', e => {
                Array.from(e.target.files || []).forEach(queueFile);
                e.target.value = '';
            });
        }

        const btnClearTransfers = getEl('btn-clear-transfers');
        if (btnClearTransfers) {
            btnClearTransfers.addEventListener('click', () => {
                const list = getEl('transfers-list');
                if (!list) return;
                Array.from(list.children).forEach(child => {
                    if (child.dataset.state === 'done') child.remove();
                });
                updateTransfersSummary();
            });
        }

        const btnShareCam = getEl('btn-share-cam');
        const btnShareScreen = getEl('btn-share-screen');
        const btnExitObs = getEl('btn-exit-obs');
        if (btnShareCam) btnShareCam.addEventListener('click', () => startStream('camera'));
        if (btnShareScreen) btnShareScreen.addEventListener('click', () => startStream('screen'));
        if (btnExitObs) {
            btnExitObs.addEventListener('click', () => {
                closeVideoUI();
                if (peer && peer.connected) {
                    try { peer.send(encodeControl({ type: 'close-video' })); } catch (_) { }
                }
            });
        }

        document.querySelectorAll('#btn-copy, #btn-copy-obs, #btn-copy-remote').forEach(btn => {
            btn.addEventListener('click', async () => {
                const input = btn.previousElementSibling;
                if (!input) return;
                const ok = await copyText(input.value);
                if (ok) {
                    const orig = btn.textContent;
                    btn.textContent = 'Copiado!';
                    setTimeout(() => { btn.textContent = orig; }, 1800);
                }
            });
        });

        const btnDisconnect = getEl('btn-disconnect');
        if (btnDisconnect) {
            btnDisconnect.addEventListener('click', () => resetApp(true));
        }

        const clipboardInput = getEl('clipboard-input');
        const btnSendText = getEl('btn-send-text');
        if (btnSendText && clipboardInput) {
            btnSendText.addEventListener('click', () => {
                const text = clipboardInput.value.trim();
                if (!text) return;
                if (!peer || !peer.connected) {
                    showModal('Erro', 'Conecte-se primeiro.');
                    return;
                }
                const packet = encodeControl({ type: 'clipboard', text });

                try {
                    peer.send(packet);
                    clipboardInput.value = '';
                    const origText = btnSendText.textContent;
                    btnSendText.textContent = '✔';
                    setTimeout(() => { btnSendText.textContent = origText; }, 1400);
                } catch (_) {
                    showModal('Erro', 'Falha ao enviar texto.');
                }
            });

            clipboardInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    btnSendText.click();
                }
            });
        }

        const btnManual = getEl('btn-manual-connect');
        const inputManual = getEl('manual-room-id');
        if (btnManual && inputManual) {
            const performConnect = () => {
                const parsedId = Core ? Core.parseRoomInput(inputManual.value) : sanitizeRoomId(inputManual.value);
                if (!parsedId) {
                    setManualError('Informe um ID de sala ou link válido.');
                    inputManual.focus();
                    return;
                }
                setManualError('');
                window.location.href = `?remote=${encodeURIComponent(parsedId)}`;
            };

            btnManual.addEventListener('click', performConnect);
            inputManual.addEventListener('input', () => setManualError(''));
            inputManual.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    performConnect();
                }
            });
        }

        setupDragAndDrop();
    }

    function setupInstallPrompt() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(console.error);
        }

        let deferredPrompt = null;
        const installBtn = getEl('installAppBtn');
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
    }

    function initApp() {
        setupInstallPrompt();
        bindUiEvents();

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mode') === 'obs') {
            document.body.classList.add('obs-mode');
        }

        if (urlParams.get('share_target') === 'true') {
            handleShareTarget(urlParams);
        }

        const remoteId = urlParams.get('remote');
        if (remoteId) {
            initClient(remoteId);
        } else if (urlParams.get('share_target') === 'true') {
            let lastRemote = null;
            try { lastRemote = localStorage.getItem('p2p_last_remote'); } catch (_) { }
            if (lastRemote) {
                showModal('Reconectando', 'Restaurando conexão anterior...');
                initClient(lastRemote);
            } else {
                initHost();
            }
        } else {
            initHost();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

    window.__p2pShare = {
        getState: () => ({
            roomId,
            activeDownloadsCount: activeDownloads.size,
            uploadQueueLength: uploadQueue.length,
            connected: Boolean(peer && peer.connected)
        }),
        setPeer: (mockPeer) => { peer = mockPeer; },
        handleConnection,
        handleDataReceived,
        createTransferItem,
        sendFile,
        queueFile,
        showClipboardModal,
        showModal,
        closeModal,
        resetApp
    };
})();

/**
 * Scanner de Código de Barras (ISBN-13 / ISBN-10) via Câmera para localização rápida de livros físicos
 */

let videoStream = null;
let scanInterval = null;
let isScanning = false;

export const ISBNScanner = {
    isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    },

    async start(videoEl, onDetected, onError) {
        if (typeof videoEl === 'function') {
            onError = onDetected;
            onDetected = videoEl;
            videoEl = document.getElementById('isbnVideo');
        } else if (!videoEl) {
            videoEl = document.getElementById('isbnVideo');
        }

        const statusEl = document.getElementById('isbnScannerStatus');

        if (!this.isSupported()) {
            if (onError) onError('Câmera indisponível neste navegador ou requer conexão segura (HTTPS).');
            return;
        }

        try {
            if (statusEl) statusEl.textContent = 'Solicitando permissão da câmera...';

            videoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            if (videoEl) {
                videoEl.srcObject = videoStream;
                await videoEl.play();
            }
            isScanning = true;

            if ('BarcodeDetector' in window) {
                if (statusEl) statusEl.textContent = 'Aponte a câmera para o código de barras (ISBN) do livro...';

                let detector;
                try {
                    detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'code_128'] });
                } catch (e) {
                    detector = new window.BarcodeDetector();
                }

                scanInterval = setInterval(async () => {
                    if (!isScanning || !videoEl || videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) return;
                    try {
                        const barcodes = await detector.detect(videoEl);
                        if (barcodes && barcodes.length > 0) {
                            const code = (barcodes[0].rawValue || '').replace(/[\s-]/g, '');
                            if (code && /^\d{10,13}$/.test(code)) {
                                this.stop();
                                if (onDetected) onDetected(code);
                            }
                        }
                    } catch (e) {
                        // Ignorar erros pontuais de render/frame
                    }
                }, 250);
            } else {
                if (statusEl) {
                    statusEl.innerHTML = 'A câmera está ligada. Digite os números do ISBN abaixo para localizar:';
                }
                const manualInput = document.getElementById('manualIsbnInput');
                if (manualInput) manualInput.focus();
            }
        } catch (err) {
            console.error('Erro ao acessar câmera:', err);
            this.stop();
            const msg = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
                ? 'Permissão da câmera negada. Permita o acesso à câmera nas configurações do navegador.'
                : 'Não foi possível acessar a câmera do dispositivo.';
            if (onError) onError(msg);
        }
    },

    stop() {
        isScanning = false;
        if (scanInterval) {
            clearInterval(scanInterval);
            scanInterval = null;
        }
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        const video = document.getElementById('isbnVideo');
        if (video) {
            video.srcObject = null;
        }
    }
};

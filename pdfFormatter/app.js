document.addEventListener('DOMContentLoaded', () => {
    const core = window.BookletCore;
    if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    }

    let currentPdfBytes = null;
    let currentPdfDoc = null;
    let shouldCancel = false;
    let isCancelledByUser = false;
    let currentFileName = 'documento.pdf';
    let generatedPdfFile = null;
    let generatedConfigKey = null;
    let deferredPrompt = null;
    const activeObjectUrls = new Set();

    const fileInput = document.getElementById('file-input');
    const fileUpload = document.getElementById('file-upload');
    const bindingOptionsContainer = document.getElementById('binding-options-container');
    const processingIndicator = document.getElementById('processing-indicator');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const previewContainer = document.getElementById('preview-container');
    const previewSummary = document.getElementById('previewSummary');
    const printContainer = document.getElementById('print-container');
    const previewModal = document.getElementById('previewModal');
    const popupCard = previewModal ? previewModal.querySelector('.popupCard') : null;
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnDownloadPreview = document.getElementById('btnDownloadPreview');
    const btnPrint = document.getElementById('btnPrint');
    const btnShare = document.getElementById('btnShare');
    const btnCancelProcessing = document.getElementById('btnCancelProcessing');
    const customAlertModal = document.getElementById('customAlertModal');
    const customAlertTitle = document.getElementById('customAlertTitle');
    const customAlertMessage = document.getElementById('customAlertMessage');
    const successModal = document.getElementById('successModal');
    const successFileName = document.getElementById('successFileName');
    const successDetails = document.getElementById('successDetails');
    const installBtn = document.getElementById('installAppBtn');
    const addPaginationCheckbox = document.getElementById('add-pagination');
    const skipPreviewCheckbox = document.getElementById('skip-preview');
    const nativeSelect = document.getElementById('binding-type');

    function createCancelError() {
        const err = new Error('Processamento cancelado pelo usuário.');
        err.name = 'AbortError';
        return err;
    }

    function canNativeShare(file) {
        if (!navigator.share || !navigator.canShare) return false;
        if (file) {
            try { return navigator.canShare({ files: [file] }); } catch (_) { return false; }
        }
        try {
            const dummy = new File([''], 't.pdf', { type: 'application/pdf' });
            return navigator.canShare({ files: [dummy] });
        } catch (_) {
            return false;
        }
    }

    if (btnShare) {
        btnShare.style.display = canNativeShare() ? 'inline-flex' : 'none';
    }

    function createManagedObjectUrl(blob) {
        const url = URL.createObjectURL(blob);
        activeObjectUrls.add(url);
        setTimeout(() => {
            if (activeObjectUrls.has(url)) {
                URL.revokeObjectURL(url);
                activeObjectUrls.delete(url);
            }
        }, 60000);
        return url;
    }

    function revokeAllObjectUrls() {
        activeObjectUrls.forEach(url => {
            try { URL.revokeObjectURL(url); } catch (_) {}
        });
        activeObjectUrls.clear();
    }

    function destroyCurrentPdfDoc() {
        if (currentPdfDoc) {
            try { currentPdfDoc.destroy(); } catch (_) {}
            currentPdfDoc = null;
        }
    }

    function getBindingLabel() {
        if (!nativeSelect) return '';
        const selected = nativeSelect.options[nativeSelect.selectedIndex];
        return selected ? selected.textContent.trim() : '';
    }

    /** Restore home options/upload controls and release transient PDF buffers. */
    function resetToHomeState({ keepPdfData = false } = {}) {
        if (processingIndicator) processingIndicator.style.display = 'none';
        if (fileUpload) fileUpload.style.display = '';
        if (bindingOptionsContainer) bindingOptionsContainer.style.display = '';
        if (fileInput) fileInput.value = '';
        if (progressBar) {
            progressBar.style.transition = '';
            progressBar.style.width = '0%';
        }
        if (progressText) progressText.textContent = '0%';
        if (btnCancelProcessing) {
            btnCancelProcessing.textContent = 'Cancelar';
            btnCancelProcessing.disabled = false;
            btnCancelProcessing.style.display = '';
        }

        if (!keepPdfData) {
            if (previewContainer) previewContainer.innerHTML = '';
            if (printContainer) printContainer.innerHTML = '';
            if (previewSummary) previewSummary.textContent = '';
            currentPdfBytes = null;
            generatedPdfFile = null;
            generatedConfigKey = null;
            destroyCurrentPdfDoc();
            revokeAllObjectUrls();
        }
    }

    // --- Accessible custom select (combobox + listbox) ---
    const customSelect = document.querySelector('.custom-select-container');
    if (customSelect && nativeSelect) {
        const selectTrigger = customSelect.querySelector('.select-trigger');
        const options = Array.from(customSelect.querySelectorAll('.custom-option'));

        const setDropdownOpen = (open) => {
            customSelect.classList.toggle('active', open);
            selectTrigger.setAttribute('aria-expanded', String(Boolean(open)));
        };

        const selectOption = (optionEl, closeMenu = true) => {
            options.forEach(opt => {
                opt.classList.remove('selected');
                opt.setAttribute('aria-selected', 'false');
            });
            optionEl.classList.add('selected');
            optionEl.setAttribute('aria-selected', 'true');
            const labelSpan = selectTrigger.querySelector('span');
            if (labelSpan) labelSpan.textContent = optionEl.textContent;
            nativeSelect.value = optionEl.getAttribute('data-value') || '0';
            nativeSelect.dispatchEvent(new Event('change'));
            if (closeMenu) setDropdownOpen(false);
        };

        selectTrigger.addEventListener('click', () => {
            setDropdownOpen(!customSelect.classList.contains('active'));
        });

        selectTrigger.addEventListener('keydown', (e) => {
            const currentIdx = Math.max(0, options.findIndex(o => o.classList.contains('selected')));
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDropdownOpen(!customSelect.classList.contains('active'));
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = options[(currentIdx + 1) % options.length];
                selectOption(next, false);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = options[(currentIdx - 1 + options.length) % options.length];
                selectOption(prev, false);
            } else if (e.key === 'Escape') {
                setDropdownOpen(false);
            }
        });

        options.forEach(option => {
            option.addEventListener('click', () => selectOption(option, true));
        });

        document.addEventListener('click', (e) => {
            if (!customSelect.contains(e.target)) {
                setDropdownOpen(false);
            }
        });
    }

    document.querySelectorAll('.tag-checkbox input').forEach(checkbox => {
        checkbox.parentElement.classList.toggle('checked', checkbox.checked);
        checkbox.addEventListener('change', () => {
            checkbox.parentElement.classList.toggle('checked', checkbox.checked);
        });
    });

    function showAlertModal(title, message) {
        if (customAlertModal && customAlertTitle && customAlertMessage) {
            customAlertTitle.textContent = title;
            customAlertMessage.textContent = message;
            customAlertModal.classList.add('active');
        }
    }

    function closeCustomAlertModal() {
        if (customAlertModal) customAlertModal.classList.remove('active');
    }
    window.closeCustomAlertModal = closeCustomAlertModal;

    function showPreviewModal() {
        if (!previewModal || !popupCard) return;
        previewModal.style.display = 'flex';
        setTimeout(() => popupCard.classList.add('show'), 10);
    }

    function closeModal() {
        if (!previewModal || !popupCard) return;
        popupCard.classList.remove('show');
        setTimeout(() => {
            previewModal.style.display = 'none';
            resetToHomeState();
        }, 300);
    }

    function closeSuccessModal() {
        if (!successModal) return;
        successModal.classList.remove('active');
        setTimeout(() => {
            successModal.style.display = 'none';
            resetToHomeState();
        }, 300);
    }

    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
    if (btnPrint) btnPrint.addEventListener('click', () => window.print());
    if (btnDownloadPreview) {
        btnDownloadPreview.addEventListener('click', () => {
            exportBooklet({ forceDownload: true, triggerBtn: btnDownloadPreview });
        });
    }
    if (btnShare) {
        btnShare.addEventListener('click', () => {
            exportBooklet({ forceDownload: false, triggerBtn: btnShare });
        });
    }

    if (btnCancelProcessing) {
        btnCancelProcessing.addEventListener('click', () => {
            shouldCancel = true;
            isCancelledByUser = true;
            btnCancelProcessing.textContent = 'Cancelando...';
            btnCancelProcessing.disabled = true;
        });
    }

    if (previewModal) {
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) closeModal();
        });
    }
    if (customAlertModal) {
        customAlertModal.addEventListener('click', (e) => {
            if (e.target === customAlertModal) closeCustomAlertModal();
        });
    }
    if (successModal) {
        successModal.addEventListener('click', (e) => {
            if (e.target === successModal) closeSuccessModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (customAlertModal && customAlertModal.classList.contains('active')) {
                closeCustomAlertModal();
            } else if (previewModal && previewModal.style.display === 'flex') {
                closeModal();
            } else if (successModal && successModal.classList.contains('active')) {
                closeSuccessModal();
            }
        }
    });

    // --- Drag and drop upload zone ---
    const imageUpload = document.getElementById('imageUpload');
    const defaultIcon = '../Leitor-logs-totvs-fluig/assets/upload.webp';
    const activeIcon = '../Leitor-logs-totvs-fluig/assets/upload_blue.webp';

    function setUploadIcon(active) {
        if (imageUpload) {
            imageUpload.src = active ? activeIcon : defaultIcon;
        }
    }

    if (fileUpload) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            fileUpload.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            fileUpload.addEventListener(eventName, () => {
                fileUpload.classList.add('dragover');
                setUploadIcon(true);
            }, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            fileUpload.addEventListener(eventName, () => {
                fileUpload.classList.remove('dragover');
                setUploadIcon(false);
            }, false);
        });
        fileUpload.addEventListener('mouseenter', () => setUploadIcon(true));
        fileUpload.addEventListener('mouseleave', () => setUploadIcon(false));
        fileUpload.addEventListener('drop', (e) => {
            handleFiles({ target: { files: e.dataTransfer?.files } });
        }, false);
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => handleFiles(e), false);
    }

    async function handleFiles(e, autoProcess = true) {
        let file = null;
        if (e?.target?.files) file = e.target.files[0];
        else if (e?.files?.[0]) file = e.files[0];

        if (!core.isSupportedPdfFile(file)) {
            showAlertModal('Erro', 'Por favor, envie um arquivo PDF válido.');
            if (fileInput) fileInput.value = '';
            return;
        }

        currentPdfBytes = null;
        generatedPdfFile = null;
        generatedConfigKey = null;
        destroyCurrentPdfDoc();

        currentFileName = file.name || 'documento.pdf';

        if (!autoProcess) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                currentPdfBytes = new Uint8Array(arrayBuffer);
                showFileReadyState(file);
                return;
            } catch (err) {
                console.error('Erro ao ler arquivo compartilhado:', err);
                showAlertModal('Erro', 'Falha ao ler o arquivo compartilhado.');
                return;
            }
        }

        startProcessing();
        await processLoadedFile(file);
    }

    async function processLoadedFile(file) {
        try {
            if (!currentPdfBytes) {
                const arrayBuffer = await file.arrayBuffer();
                currentPdfBytes = new Uint8Array(arrayBuffer);
            }

            if (currentPdfBytes.byteLength === 0) {
                throw new Error('O arquivo PDF está vazio.');
            }

            const skipPreview = Boolean(skipPreviewCheckbox?.checked);

            if (skipPreview) {
                updateProgress(0, 'Iniciando modo Turbo...');
                await exportBooklet({ forceDownload: false, isTurboMode: true });
            } else {
                destroyCurrentPdfDoc();
                currentPdfDoc = await pdfjsLib.getDocument(currentPdfBytes.slice(0)).promise;
                await processPDF(currentPdfDoc);
            }
        } catch (error) {
            if (error?.name === 'AbortError' || isCancelledByUser) {
                resetToHomeState();
                return;
            }
            console.error('Erro ao processar:', error);
            resetToHomeState();
            const message = error?.name === 'PasswordException'
                ? 'Este PDF está protegido por senha. Remova a senha antes de formatar.'
                : (error?.message || 'Ocorreu um erro ao processar o PDF.');
            showAlertModal('Erro', message);
        }
    }

    function showFileReadyState(file) {
        if (fileUpload) fileUpload.style.display = 'none';

        const modal = document.getElementById('sharedFileModal');
        const fileNameEl = document.getElementById('sharedFileName');
        const btnProcess = document.getElementById('btnProcessShared');
        const btnClose = document.getElementById('btnCloseShared');
        const optionsLocation = document.getElementById('sharedOptionsLocation');
        const originalLocation = document.querySelector('.opcoes');

        if (fileNameEl) fileNameEl.textContent = file.name;
        if (bindingOptionsContainer && optionsLocation) {
            optionsLocation.appendChild(bindingOptionsContainer);
        }

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);

        const restoreOptions = () => {
            if (originalLocation && bindingOptionsContainer && fileUpload) {
                originalLocation.insertBefore(bindingOptionsContainer, fileUpload);
            }
        };

        btnProcess.onclick = () => {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                restoreOptions();
                startProcessing();
                processLoadedFile(file);
            }, 300);
        };

        const closeSharedModal = () => {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                restoreOptions();
                resetToHomeState();
            }, 300);
        };

        btnClose.onclick = closeSharedModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeSharedModal();
        };
    }

    function startProcessing() {
        if (fileUpload) fileUpload.style.display = 'none';
        if (bindingOptionsContainer) bindingOptionsContainer.style.display = 'none';
        if (processingIndicator) processingIndicator.style.display = 'block';
        if (previewContainer) previewContainer.innerHTML = '';
        if (printContainer) printContainer.innerHTML = '';
        if (previewSummary) previewSummary.textContent = '';

        shouldCancel = false;
        isCancelledByUser = false;
        if (btnCancelProcessing) {
            btnCancelProcessing.textContent = 'Cancelar';
            btnCancelProcessing.disabled = false;
            btnCancelProcessing.style.display = '';
        }

        updateProgress(0);
    }

    function updateProgress(percent, labelHtml = null) {
        if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        if (progressText) {
            if (labelHtml !== null) {
                progressText.textContent = labelHtml;
            } else {
                progressText.textContent = `${Math.round(percent)}%`;
            }
        }
    }

    function formatSideSlotLabel(leftPage, rightPage, totalOriginalPages) {
        const fmt = (idx) => (idx <= totalOriginalPages ? idx : 'Branco');
        return `Págs. ${fmt(leftPage)} | ${fmt(rightPage)}`;
    }

    function appendPageNumberBadge(container, pageNumText) {
        if (!pageNumText) return;
        const numDiv = document.createElement('div');
        numDiv.className = 'page-number';
        numDiv.textContent = pageNumText;
        container.appendChild(numDiv);
    }

    /**
     * Render each PDF page once at print resolution, then blit a lightweight copy
     * onto the preview canvas and release page resources immediately.
     */
    async function renderSheetSlot(pdf, pageIndex, previewTarget, printTarget, totalOriginalPages, addPagination, renderScale) {
        const isContentPage = pageIndex <= totalOriginalPages;
        const pageNumText = (addPagination && pageIndex > 1 && isContentPage) ? String(pageIndex - 1) : '';

        previewTarget.innerHTML = '';
        printTarget.innerHTML = '';

        if (isContentPage) {
            let page = null;
            try {
                page = await pdf.getPage(pageIndex);
                const viewport = page.getViewport({ scale: renderScale });

                const printCanvas = document.createElement('canvas');
                printCanvas.width = Math.max(1, Math.round(viewport.width));
                printCanvas.height = Math.max(1, Math.round(viewport.height));
                const printCtx = printCanvas.getContext('2d');
                await page.render({ canvasContext: printCtx, viewport }).promise;
                printTarget.appendChild(printCanvas);

                const previewCanvas = document.createElement('canvas');
                const previewMaxWidth = 720;
                const thumbRatio = printCanvas.width > previewMaxWidth ? (previewMaxWidth / printCanvas.width) : 1;
                previewCanvas.width = Math.max(1, Math.round(printCanvas.width * thumbRatio));
                previewCanvas.height = Math.max(1, Math.round(printCanvas.height * thumbRatio));
                const previewCtx = previewCanvas.getContext('2d');
                if (previewCtx && typeof previewCtx.drawImage === 'function') {
                    previewCtx.drawImage(printCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
                }
                previewTarget.appendChild(previewCanvas);
            } catch (err) {
                console.error(`Error rendering page ${pageIndex}`, err);
            } finally {
                if (page && typeof page.cleanup === 'function') {
                    try { page.cleanup(); } catch (_) {}
                }
            }
        }

        appendPageNumberBadge(previewTarget, pageNumText);
        appendPageNumberBadge(printTarget, pageNumText);
    }

    async function processPDF(pdf) {
        const totalOriginalPages = pdf.numPages;
        if (!totalOriginalPages || totalOriginalPages <= 0) {
            throw new Error('O documento PDF não possui páginas.');
        }

        const signatureSize = parseInt(nativeSelect?.value, 10) || 0;
        const sheets = core.calculateImposition(totalOriginalPages, signatureSize);
        const stats = core.getBookletStats(totalOriginalPages, signatureSize);
        const renderScale = totalOriginalPages > 40 ? 1.5 : 2;
        const addPagination = Boolean(addPaginationCheckbox?.checked);

        if (previewSummary) {
            previewSummary.textContent = core.formatBookletSummary(stats, getBindingLabel());
        }

        const totalOperations = sheets.length * 4;
        let processedCount = 0;
        const startTime = Date.now();

        const updateTimeAndProgress = () => {
            processedCount++;
            const percent = (processedCount / totalOperations) * 100;
            const elapsedTime = Date.now() - startTime;
            const timePerOp = elapsedTime / processedCount;
            const remainingOps = totalOperations - processedCount;
            const estimatedTimeLeft = Math.ceil((timePerOp * remainingOps) / 1000);

            let timeText = '';
            if (processedCount > 2 && remainingOps > 0) {
                timeText = estimatedTimeLeft > 60
                    ? `• ~${Math.ceil(estimatedTimeLeft / 60)} min`
                    : `• ~${estimatedTimeLeft}s`;
            }

            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressText) {
                progressText.replaceChildren();
                const pctText = document.createTextNode(`${Math.round(percent)}% `);
                const subSpan = document.createElement('span');
                subSpan.style.cssText = 'display:block;font-size:0.85em;font-weight:normal;opacity:0.8;';
                subSpan.textContent = `(${processedCount}/${totalOperations}) ${timeText}`.trim();
                progressText.append(pctText, subSpan);
            }
        };

        for (let i = 0; i < sheets.length; i++) {
            if (shouldCancel) {
                resetToHomeState();
                return;
            }

            const sheet = sheets[i];
            const sheetDiv = document.createElement('div');
            sheetDiv.className = 'sheet-preview';

            const metaDiv = document.createElement('div');
            metaDiv.className = 'sheet-meta';
            const sigSuffix = stats.signaturesCount > 1 ? ` · Caderno ${sheet.signatureNumber}` : '';
            metaDiv.textContent = `Folha ${sheet.sheetNumber} de ${sheets.length}${sigSuffix}`;
            sheetDiv.appendChild(metaDiv);

            const frontLabel = document.createElement('div');
            frontLabel.className = 'side-label';
            frontLabel.textContent = `Frente · ${formatSideSlotLabel(sheet.front.left, sheet.front.right, totalOriginalPages)}`;
            sheetDiv.appendChild(frontLabel);

            const frontDiv = document.createElement('div');
            frontDiv.className = 'paper-sheet';
            const frontLeftContainer = createPageContainer();
            const frontRightContainer = createPageContainer();
            frontDiv.append(frontLeftContainer, frontRightContainer);
            sheetDiv.appendChild(frontDiv);

            const backLabel = document.createElement('div');
            backLabel.className = 'side-label';
            backLabel.textContent = `Verso · ${formatSideSlotLabel(sheet.back.left, sheet.back.right, totalOriginalPages)}`;
            sheetDiv.appendChild(backLabel);

            const backDiv = document.createElement('div');
            backDiv.className = 'paper-sheet';
            const backLeftContainer = createPageContainer();
            const backRightContainer = createPageContainer();
            backDiv.append(backLeftContainer, backRightContainer);
            sheetDiv.appendChild(backDiv);

            previewContainer.appendChild(sheetDiv);

            const printSheetFront = document.createElement('div');
            printSheetFront.className = 'print-sheet';
            const printFrontLeft = createPrintPage();
            const printFrontRight = createPrintPage();
            printSheetFront.append(printFrontLeft, printFrontRight);

            const printSheetBack = document.createElement('div');
            printSheetBack.className = 'print-sheet';
            const printBackLeft = createPrintPage();
            const printBackRight = createPrintPage();
            printSheetBack.append(printBackLeft, printBackRight);

            printContainer.append(printSheetFront, printSheetBack);

            const slots = [
                [sheet.front.left, frontLeftContainer, printFrontLeft],
                [sheet.front.right, frontRightContainer, printFrontRight],
                [sheet.back.left, backLeftContainer, printBackLeft],
                [sheet.back.right, backRightContainer, printBackRight]
            ];

            for (const [pageIdx, pContainer, prContainer] of slots) {
                if (shouldCancel) {
                    resetToHomeState();
                    return;
                }
                await renderSheetSlot(pdf, pageIdx, pContainer, prContainer, totalOriginalPages, addPagination, renderScale);
                updateTimeAndProgress();
            }
        }

        if (shouldCancel) {
            resetToHomeState();
            return;
        }

        updateProgress(100);
        setTimeout(() => {
            if (processingIndicator) processingIndicator.style.display = 'none';
            showPreviewModal();
        }, 250);
    }

    function createPageContainer() {
        const div = document.createElement('div');
        div.className = 'preview-page';
        return div;
    }

    function createPrintPage() {
        const div = document.createElement('div');
        div.className = 'print-page';
        return div;
    }

    // --- PWA install button ---
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) installBtn.style.display = 'flex';
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            installBtn.style.display = 'none';
        });
    }

    window.addEventListener('appinstalled', () => {
        if (installBtn) installBtn.style.display = 'none';
        deferredPrompt = null;
    });

    /**
     * Build lossless vector booklet PDF via pdf-lib (caching output by active config).
     */
    async function buildBookletFile({ reportProgress = false } = {}) {
        const signatureSize = parseInt(nativeSelect?.value, 10) || 0;
        const addPagination = Boolean(addPaginationCheckbox?.checked);
        const cacheKey = `${signatureSize}|${addPagination}|${currentPdfBytes?.byteLength || 0}|${currentFileName}`;

        if (generatedPdfFile && generatedConfigKey === cacheKey) {
            return { file: generatedPdfFile, stats: null };
        }

        if (reportProgress) {
            if (progressBar) progressBar.style.transition = 'width 0.2s linear';
            updateProgress(10, 'Lendo PDF original...');
        }

        const { PDFDocument } = PDFLib;
        const newPdf = await PDFDocument.create();

        let originalPdf;
        let embeddedPages;

        const originalWarn = console.warn;
        console.warn = () => {};

        try {
            originalPdf = await PDFDocument.load(currentPdfBytes.slice(0), { ignoreEncryption: true });
            if (originalPdf.getPageCount() === 0) {
                throw new Error('O documento PDF não possui páginas.');
            }
            embeddedPages = await newPdf.embedPages(originalPdf.getPages());
        } catch (err) {
            console.warn = originalWarn;
            if (err?.name === 'AbortError') throw err;
            console.log('PDF problemático detectado. Iniciando reparo inteligente...');
            originalPdf = await repairPdfViaCanvas(currentPdfBytes);
            embeddedPages = await newPdf.embedPages(originalPdf.getPages());
        } finally {
            console.warn = originalWarn;
        }

        const totalOriginalPages = embeddedPages.length;
        const sheets = core.calculateImposition(totalOriginalPages, signatureSize);
        const stats = core.getBookletStats(totalOriginalPages, signatureSize);

        const pageWidth = 841.89;
        const pageHeight = 595.28;
        const halfWidth = pageWidth / 2;
        const font = await newPdf.embedFont(PDFLib.StandardFonts.Helvetica);

        const drawNum = (page, pageIndex, centerX) => {
            if (!addPagination || pageIndex <= 1) return;
            const text = String(pageIndex - 1);
            const size = 11;
            const textWidth = font.widthOfTextAtSize(text, size);
            const yPos = 15;
            const xPos = centerX - (textWidth / 2);

            page.drawText(text, { x: xPos + 0.5, y: yPos - 0.5, size, font, color: PDFLib.rgb(0, 0, 0) });
            page.drawText(text, { x: xPos + 1, y: yPos - 1, size, font, color: PDFLib.rgb(0, 0, 0) });
            page.drawText(text, { x: xPos, y: yPos, size, font, color: PDFLib.rgb(1, 1, 1) });
        };

        const drawHalfSlot = (targetPage, pageIndex, slotX) => {
            if (pageIndex > totalOriginalPages) return;
            const embedded = embeddedPages[pageIndex - 1];
            const placement = core.computeContainedPlacement(
                embedded.width,
                embedded.height,
                slotX,
                0,
                halfWidth,
                pageHeight
            );
            targetPage.drawPage(embedded, placement);
            drawNum(targetPage, pageIndex, slotX + (halfWidth / 2));
        };

        if (reportProgress) updateProgress(15, 'Processando páginas...');

        const totalSheets = sheets.length;
        const BATCH_SIZE = 25;

        for (let i = 0; i < totalSheets; i++) {
            if (shouldCancel) throw createCancelError();

            const sheet = sheets[i];
            if (reportProgress && i % BATCH_SIZE === 0) {
                const percent = 15 + ((i / totalSheets) * 75);
                updateProgress(percent, `Processando... ${Math.round((i / totalSheets) * 100)}%`);
                await new Promise(r => setTimeout(r, 0));
            }

            const frontPage = newPdf.addPage([pageWidth, pageHeight]);
            drawHalfSlot(frontPage, sheet.front.left, 0);
            drawHalfSlot(frontPage, sheet.front.right, halfWidth);

            const backPage = newPdf.addPage([pageWidth, pageHeight]);
            drawHalfSlot(backPage, sheet.back.left, 0);
            drawHalfSlot(backPage, sheet.back.right, halfWidth);
        }

        if (shouldCancel) throw createCancelError();

        if (reportProgress) {
            updateProgress(95, 'Salvando arquivo...');
            await new Promise(r => setTimeout(r, 10));
        }

        const pdfBytes = await newPdf.save();
        const newFileName = core.getBookletOutputName(currentFileName);
        generatedPdfFile = new File([pdfBytes], newFileName, { type: 'application/pdf' });
        generatedConfigKey = cacheKey;

        return { file: generatedPdfFile, stats };
    }

    async function exportBooklet({ forceDownload = false, isTurboMode = false, triggerBtn = null } = {}) {
        if (!currentPdfBytes) {
            showAlertModal('Aviso', 'Nenhum arquivo PDF carregado.');
            return null;
        }

        const originalBtnText = triggerBtn ? triggerBtn.textContent : '';
        if (triggerBtn && !isTurboMode) {
            triggerBtn.textContent = 'Gerando PDF...';
            triggerBtn.disabled = true;
        }

        try {
            const { file, stats } = await buildBookletFile({ reportProgress: isTurboMode });

            if (isTurboMode) {
                updateProgress(100, 'Concluído!');
                await new Promise(r => setTimeout(r, 150));

                if (successFileName) successFileName.textContent = file.name;
                if (successDetails) {
                    const effectiveStats = stats || core.getBookletStats(0, 0);
                    successDetails.textContent = core.formatBookletSummary(effectiveStats, getBindingLabel());
                }

                if (successModal) {
                    successModal.style.display = 'flex';
                    successModal.offsetHeight;
                    successModal.classList.add('active');
                }
            } else {
                await triggerDownloadOrShare(file, forceDownload);
            }

            return file;
        } catch (error) {
            if (error?.name === 'AbortError' || isCancelledByUser) {
                resetToHomeState();
                return null;
            }
            console.error('Erro ao gerar livreto:', error);
            if (isTurboMode) resetToHomeState();
            showAlertModal('Erro', `Falha ao gerar o livreto: ${error.message}`);
            return null;
        } finally {
            if (progressBar) progressBar.style.transition = '';
            if (triggerBtn && !isTurboMode) {
                triggerBtn.textContent = originalBtnText;
                triggerBtn.disabled = false;
            }
        }
    }

    async function triggerDownloadOrShare(file, forceDownload = false) {
        if (!file) return;

        if (forceDownload || !canNativeShare(file)) {
            const link = document.createElement('a');
            const url = createManagedObjectUrl(file);
            link.href = url;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }

        try {
            await navigator.share({
                files: [file],
                title: 'Livreto PDF Formatado',
                text: 'Aqui está seu livreto pronto para impressão.'
            });
        } catch (err) {
            console.warn('Share falhou ou cancelado:', err);
            if (err.name !== 'AbortError') {
                await triggerDownloadOrShare(file, true);
            }
        }
    }

    const btnModalShare = document.getElementById('btnModalShare');
    const btnModalPrint = document.getElementById('btnModalPrint');
    const btnModalDownload = document.getElementById('btnModalDownload');
    const btnCloseSuccess = document.getElementById('btnCloseSuccess');

    if (btnModalShare) {
        btnModalShare.addEventListener('click', () => triggerDownloadOrShare(generatedPdfFile, false));
    }
    if (btnModalPrint) {
        btnModalPrint.addEventListener('click', () => {
            if (generatedPdfFile) {
                const url = createManagedObjectUrl(generatedPdfFile);
                window.open(url, '_blank');
            }
        });
    }
    if (btnModalDownload) {
        btnModalDownload.addEventListener('click', () => {
            triggerDownloadOrShare(generatedPdfFile, true);
            showAlertModal('Sucesso', 'Download iniciado! Verifique sua pasta de Downloads.');
        });
    }
    if (btnCloseSuccess) {
        btnCloseSuccess.addEventListener('click', closeSuccessModal);
    }

    // --- File Handlers & Share Target PWA ---
    if ('launchQueue' in window) {
        window.launchQueue.setConsumer(async (launchParams) => {
            if (launchParams.files && launchParams.files.length > 0) {
                const file = await launchParams.files[0].getFile();
                handleFiles({ files: [file] }, false);
            }
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('share_target') === 'true' && typeof caches !== 'undefined') {
        caches.open('share-cache').then(async (cache) => {
            const response = await cache.match('shared-file');
            if (!response) return;

            const blob = await response.blob();
            let fileName = 'shared_document.pdf';
            const originalName = response.headers.get('X-Original-Filename');
            if (originalName) {
                try { fileName = decodeURIComponent(originalName); } catch (_) { fileName = originalName; }
            }

            const file = new File([blob], fileName, { type: 'application/pdf' });
            handleFiles({ files: [file] }, false);
            cache.delete('shared-file');
            window.history.replaceState({}, document.title, window.location.pathname);
        });
    }

    async function repairPdfViaCanvas(pdfBytes) {
        const { PDFDocument } = PDFLib;
        const flatPdf = await PDFDocument.create();
        const pdfJsDoc = await pdfjsLib.getDocument(pdfBytes.slice(0)).promise;

        try {
            const totalPages = pdfJsDoc.numPages;
            if (!totalPages) throw new Error('O documento PDF não possui páginas.');

            for (let i = 1; i <= totalPages; i++) {
                if (shouldCancel) throw createCancelError();
                updateProgress((i / totalPages) * 100, `Reparando página ${i} de ${totalPages}...`);
                await new Promise(r => setTimeout(r, 10));

                let page = null;
                try {
                    page = await pdfJsDoc.getPage(i);
                    const viewport = page.getViewport({ scale: 2.0 });

                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(viewport.width));
                    canvas.height = Math.max(1, Math.round(viewport.height));
                    const ctx = canvas.getContext('2d');

                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    await page.render({ canvasContext: ctx, viewport }).promise;

                    const imgData = canvas.toDataURL('image/jpeg', 0.85);
                    const jpgImage = await flatPdf.embedJpg(imgData);

                    const newPage = flatPdf.addPage([viewport.width, viewport.height]);
                    newPage.drawImage(jpgImage, {
                        x: 0,
                        y: 0,
                        width: viewport.width,
                        height: viewport.height
                    });
                } finally {
                    if (page && typeof page.cleanup === 'function') {
                        try { page.cleanup(); } catch (_) {}
                    }
                }
            }

            if (shouldCancel) throw createCancelError();
            updateProgress(95, 'Finalizando reparo...');
            await new Promise(r => setTimeout(r, 10));

            const flatBytes = await flatPdf.save();
            return await PDFDocument.load(flatBytes, { ignoreEncryption: true });
        } finally {
            try { await pdfJsDoc.destroy(); } catch (_) {}
        }
    }

    window.__pdfFormatter = {
        core,
        getState: () => ({
            currentFileName,
            hasBytes: Boolean(currentPdfBytes),
            hasGeneratedFile: Boolean(generatedPdfFile),
            activeObjectUrlsCount: activeObjectUrls.size
        }),
        buildBookletFile,
        exportBooklet,
        processPDF,
        resetToHomeState,
        closeModal,
        handleFiles
    };
});

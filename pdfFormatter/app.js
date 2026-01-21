document.addEventListener('DOMContentLoaded', () => {
    let currentPdfBytes = null;
    let currentPdfDoc = null;
    let shouldCancel = false;
    let currentFileName = "documento.pdf";
    let generatedPdfFile = null;
    const fileInput = document.getElementById('file-input');
    const fileUpload = document.getElementById('file-upload');
    const processingIndicator = document.getElementById('processing-indicator');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const previewContainer = document.getElementById('preview-container');
    const printContainer = document.getElementById('print-container');
    const previewModal = document.getElementById('previewModal');
    const popupCard = previewModal.querySelector('.popupCard');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const customAlertModal = document.getElementById('customAlertModal');
    const customAlertTitle = document.getElementById('customAlertTitle');
    const customAlertMessage = document.getElementById('customAlertMessage');
    const btnPrint = document.getElementById('btnPrint');
    const btnShare = document.getElementById('btnShare');
    const btnCancelProcessing = document.getElementById('btnCancelProcessing');
    const customSelect = document.querySelector('.custom-select-container');
    const selectTrigger = customSelect.querySelector('.select-trigger');
    const nativeSelect = document.getElementById('binding-type');
    const options = customSelect.querySelectorAll('.custom-option');

    selectTrigger.addEventListener('click', () => {
        customSelect.classList.toggle('active');
    });

    options.forEach(option => {
        option.addEventListener('click', () => {
            options.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');

            selectTrigger.querySelector('span').textContent = option.textContent;

            nativeSelect.value = option.getAttribute('data-value');

            customSelect.classList.remove('active');
        });
    });

    document.addEventListener('click', (e) => {
        if (!customSelect.contains(e.target)) {
            customSelect.classList.remove('active');
        }
    });

    btnCloseModal.addEventListener('click', closeModal);
    btnPrint.addEventListener('click', () => window.print());

    if (btnShare) {
        btnShare.addEventListener('click', shareBooklet);
    }

    if (btnCancelProcessing) {
        btnCancelProcessing.addEventListener('click', () => {
            shouldCancel = true;
            btnCancelProcessing.innerText = "Cancelando...";
            btnCancelProcessing.disabled = true;
        });
    }

    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) closeModal();
    });

    if (customAlertModal) {
        customAlertModal.addEventListener('click', (e) => {
            if (e.target === customAlertModal) closeCustomAlertModal();
        });
    }

    const successModal = document.getElementById('successModal');
    if (successModal) {
        successModal.addEventListener('click', (e) => {
            if (e.target === successModal) closeSuccessModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (previewModal.style.display === 'flex') closeModal();
            if (customAlertModal && customAlertModal.classList.contains('active')) closeCustomAlertModal();
            if (successModal && successModal.classList.contains('active')) closeSuccessModal();
        }
    });

    function showAlertModal(title, message) {
        if (customAlertModal && customAlertTitle && customAlertMessage) {
            customAlertTitle.innerText = title;
            customAlertMessage.innerText = message;
            customAlertModal.classList.add('active');
        }
    }

    function closeCustomAlertModal() {
        if (customAlertModal) customAlertModal.classList.remove('active');
    }
    window.closeCustomAlertModal = closeCustomAlertModal;

    function closeSuccessModal() {
        const modal = document.getElementById('successModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                document.getElementById('processing-indicator').style.display = 'none';
                document.getElementById('file-upload').style.display = 'block';
                document.getElementById('binding-options-container').style.display = 'block';
                document.getElementById('file-input').value = '';
                document.getElementById('progress-bar').style.width = "0%";
            }, 300);
        }
    }

    function showModal() {
        previewModal.style.display = 'flex';
        setTimeout(() => popupCard.classList.add('show'), 10);
    }

    function closeModal() {
        popupCard.classList.remove('show');
        setTimeout(() => {
            previewModal.style.display = 'none';
            previewContainer.innerHTML = '';
            printContainer.innerHTML = '';
            currentPdfBytes = null;

            if (currentPdfDoc) {
                currentPdfDoc.destroy();
                currentPdfDoc = null;
            }

            document.body.style.display = 'none';
            document.body.offsetHeight;
            document.body.style.display = '';

        }, 300);

        fileUpload.style.display = 'block';
        document.getElementById('binding-options-container').style.display = 'block';
        fileInput.value = '';

        progressBar.style.width = '0%';
        progressText.innerText = '0%';
    }

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileUpload.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const imageUpload = document.getElementById('imageUpload');
    const defaultIcon = '../Leitor-logs-totvs-fluig/assets/upload.webp';
    const activeIcon = '../Leitor-logs-totvs-fluig/assets/upload_blue.webp';

    function setUploadIcon(active) {
        if (imageUpload) {
            imageUpload.src = active ? activeIcon : defaultIcon;
        }
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        fileUpload.addEventListener(eventName, (e) => {
            highlight(e);
            setUploadIcon(true);
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        fileUpload.addEventListener(eventName, (e) => {
            unhighlight(e);
            setUploadIcon(false);
        }, false);
    });

    fileUpload.addEventListener('mouseenter', () => setUploadIcon(true));
    fileUpload.addEventListener('mouseleave', () => setUploadIcon(false));

    function highlight(e) {
        fileUpload.classList.add('dragover');
    }

    function unhighlight(e) {
        fileUpload.classList.remove('dragover');
    }

    fileUpload.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFiles, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles({ target: { files: files } });
    }

    async function handleFiles(e, autoProcess = true) {
        let file = null;

        if (e.target && e.target.files) file = e.target.files[0];
        else if (e.files && e.files[0]) file = e.files[0];

        if (!file || file.type !== 'application/pdf') {
            showAlertModal('Erro', 'Por favor, envie um arquivo PDF.');
            return;
        }

        currentFileName = file.name;

        if (!autoProcess) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                currentPdfBytes = arrayBuffer.slice(0);

                showFileReadyState(file);
                return;
            } catch (err) {
                console.error("Erro ao ler arquivo compartilhado:", err);
                showAlertModal('Erro', 'Falha ao ler o arquivo compartilhado.');
                return;
            }
        }

        startProcessing();
        processLoadedFile(file);
    }

    async function processLoadedFile(file) {
        try {
            if (!currentPdfBytes) {
                const arrayBuffer = await file.arrayBuffer();
                currentPdfBytes = arrayBuffer.slice(0);
            }

            const skipPreview = document.getElementById('skip-preview').checked;

            if (skipPreview) {
                const progressText = document.getElementById('progress-text');
                const progressBar = document.getElementById('progress-bar');

                progressText.innerText = "Iniciando...";
                progressBar.style.width = "0%";

                requestAnimationFrame(async () => {
                    try {
                        await shareBooklet();
                    } catch (err) {
                        console.error(err);
                        showAlertModal('Erro', 'Falha ao gerar o PDF.');
                        endProcessing();
                    }
                });

            } else {
                if (currentPdfDoc) {
                    currentPdfDoc.destroy();
                }
                currentPdfDoc = await pdfjsLib.getDocument(currentPdfBytes).promise;
                await processPDF(currentPdfDoc);
            }

        } catch (error) {
            console.error('Erro ao processar:', error);
            showAlertModal('Erro', 'Ocorreu um erro ao processar o PDF.');
            endProcessing();
            fileInput.value = '';
        }
    }

    function showFileReadyState(file) {
        fileUpload.style.display = 'none';

        const modal = document.getElementById('sharedFileModal');
        const fileNameEl = document.getElementById('sharedFileName');
        const btnProcess = document.getElementById('btnProcessShared');
        const btnClose = document.getElementById('btnCloseShared');
        const optionsLocation = document.getElementById('sharedOptionsLocation');
        const optionsContainer = document.getElementById('binding-options-container');
        const originalLocation = document.querySelector('.opcoes');

        if (fileNameEl) fileNameEl.textContent = file.name;

        if (optionsContainer && optionsLocation) {
            optionsLocation.appendChild(optionsContainer);
        }

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);

        btnProcess.onclick = () => {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';

                if (originalLocation && optionsContainer) {
                    originalLocation.insertBefore(optionsContainer, fileUpload);
                }

                startProcessing();
                processLoadedFile(file);
            }, 300);
        };

        btnClose.onclick = () => {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';

                if (originalLocation && optionsContainer) {
                    originalLocation.insertBefore(optionsContainer, fileUpload);
                }

                fileUpload.style.display = 'block';
                currentPdfBytes = null;
                fileInput.value = '';
            }, 300);
        };
    }

    function startProcessing() {
        fileUpload.style.display = 'none';
        document.getElementById('binding-options-container').style.display = 'none';
        processingIndicator.style.display = 'block';
        previewContainer.innerHTML = '';
        printContainer.innerHTML = '';

        shouldCancel = false;
        if (btnCancelProcessing) {
            btnCancelProcessing.innerText = "Cancelar";
            btnCancelProcessing.disabled = false;
            btnCancelProcessing.style.display = '';
        }

        updateProgress(0);
    }

    function endProcessing() {
        processingIndicator.style.display = 'none';
        showModal();
    }

    function updateProgress(percent) {
        progressBar.style.width = `${percent}%`;
        progressText.innerText = `${Math.round(percent)}%`;
    }

    function calculateImposition(totalOriginalPages, signatureSize) {
        const sheets = [];
        let p = 1;

        while (p <= totalOriginalPages) {
            let pagesLeft = totalOriginalPages - p + 1;

            let currentSize;

            if (signatureSize > 0 && pagesLeft < signatureSize) {
                currentSize = Math.ceil(pagesLeft / 4) * 4;
            } else if (signatureSize === 0) {
                currentSize = Math.ceil(totalOriginalPages / 4) * 4;
            } else {
                currentSize = signatureSize;
            }

            let start = p;
            let end = p + currentSize - 1;
            let count = currentSize / 4;

            let s = start;
            let e = end;

            for (let i = 0; i < count; i++) {
                sheets.push({
                    front: { left: e, right: s },
                    back: { left: s + 1, right: e - 1 }
                });
                s += 2;
                e -= 2;
            }

            p += currentSize;
        }

        return sheets;
    }

    async function processPDF(pdf) {
        const totalOriginalPages = pdf.numPages;

        const signatureSize = parseInt(document.getElementById('binding-type').value) || 0;

        const sheets = calculateImposition(totalOriginalPages, signatureSize);

        const numSheets = sheets.length;

        let processedCount = 0;
        const totalOperations = numSheets * 4;
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
                if (estimatedTimeLeft > 60) {
                    const mins = Math.ceil(estimatedTimeLeft / 60);
                    timeText = `• ~${mins} min`;
                } else {
                    timeText = `• ~${estimatedTimeLeft}s`;
                }
            } else if (remainingOps === 0) {
                timeText = '';
            }

            progressBar.style.width = `${percent}%`;
            progressText.innerHTML = `
                ${Math.round(percent)}%
                <br>
                <span style="font-size: 0.85em; font-weight: normal; opacity: 0.8;">
                    (${processedCount}/${totalOperations}) ${timeText}
                </span>
            `;
        };

        for (let i = 0; i < sheets.length; i++) {
            if (shouldCancel) {
                processingIndicator.style.display = 'none';
                fileUpload.style.display = 'block';
                document.getElementById('binding-options-container').style.display = 'block';
                fileInput.value = '';

                if (currentPdfDoc) {
                    currentPdfDoc.destroy();
                    currentPdfDoc = null;
                }
                currentPdfBytes = null;

                return;
            }

            const sheet = sheets[i];

            const sheetDiv = document.createElement('div');
            sheetDiv.className = 'sheet-preview';

            const frontDiv = document.createElement('div'); frontDiv.className = 'paper-sheet';
            const frontLeftContainer = createPageContainer(); const frontRightContainer = createPageContainer();
            frontDiv.appendChild(frontLeftContainer); frontDiv.appendChild(frontRightContainer);

            const backDiv = document.createElement('div'); backDiv.className = 'paper-sheet'; backDiv.style.marginTop = '10px';
            const backLeftContainer = createPageContainer(); const backRightContainer = createPageContainer();
            backDiv.appendChild(backLeftContainer); backDiv.appendChild(backRightContainer);

            sheetDiv.appendChild(frontDiv); sheetDiv.appendChild(backDiv);
            previewContainer.appendChild(sheetDiv);

            const printSheetFront = document.createElement('div'); printSheetFront.className = 'print-sheet';
            const printFrontLeft = createPrintPage(); const printFrontRight = createPrintPage();
            printSheetFront.appendChild(printFrontLeft); printSheetFront.appendChild(printFrontRight);

            const printSheetBack = document.createElement('div'); printSheetBack.className = 'print-sheet';
            const printBackLeft = createPrintPage(); const printBackRight = createPrintPage();
            printSheetBack.appendChild(printBackLeft); printSheetBack.appendChild(printBackRight);

            printContainer.appendChild(printSheetFront); printContainer.appendChild(printSheetBack);

            const renderToTargets = async (pageIndex, targets) => {
                const isContentPage = pageIndex <= totalOriginalPages;
                const addPagination = document.getElementById('add-pagination').checked;
                let pageNumText = '';
                if (addPagination && pageIndex > 1 && isContentPage) pageNumText = (pageIndex - 1).toString();

                for (const container of targets) {
                    container.innerHTML = '';
                    if (isContentPage) {
                        try {
                            const page = await pdf.getPage(pageIndex);
                            const viewport = page.getViewport({ scale: 2 });
                            const canvas = document.createElement('canvas');
                            const context = canvas.getContext('2d');
                            canvas.height = viewport.height;
                            canvas.width = viewport.width;
                            container.appendChild(canvas);
                            await page.render({ canvasContext: context, viewport: viewport }).promise;
                        } catch (err) { console.error(`Error rendering page ${pageIndex}`, err); }
                    }
                    if (pageNumText) {
                        const numDiv = document.createElement('div'); numDiv.className = 'page-number';
                        numDiv.innerText = pageNumText; container.appendChild(numDiv);
                    }
                }
            };

            if (shouldCancel) break;
            await renderToTargets(sheet.front.left, [frontLeftContainer, printFrontLeft]);
            updateTimeAndProgress();

            if (shouldCancel) break;
            await renderToTargets(sheet.front.right, [frontRightContainer, printFrontRight]);
            updateTimeAndProgress();

            if (shouldCancel) break;
            await renderToTargets(sheet.back.left, [backLeftContainer, printBackLeft]);
            updateTimeAndProgress();

            if (shouldCancel) break;
            await renderToTargets(sheet.back.right, [backRightContainer, printBackRight]);
            updateTimeAndProgress();
        }

        if (shouldCancel) {
            processingIndicator.style.display = 'none';
            fileUpload.style.display = 'block';
            document.getElementById('binding-options-container').style.display = 'block';
            fileInput.value = '';
            return;
        }

        updateProgress(100);

        setTimeout(() => {
            endProcessing();
        }, 300);
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

    let deferredPrompt;
    const installBtn = document.getElementById('installAppBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.style.display = 'flex';
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.style.display = 'none';
    });

    window.addEventListener('appinstalled', () => {
        installBtn.style.display = 'none';
        deferredPrompt = null;
    });

    async function shareBooklet() {
        if (!currentPdfBytes) {
            showAlertModal('Aviso', 'Nenhum arquivo PDF carregado.');
            return;
        }

        const btnShare = document.getElementById('btnShare');
        const originalText = btnShare ? btnShare.innerText : '';
        const skipPreview = document.getElementById('skip-preview').checked;
        const btnCancelProcessing = document.getElementById('btnCancelProcessing');

        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');

        const successModal = document.getElementById('successModal');
        const successFileName = document.getElementById('successFileName');

        if (btnShare && !skipPreview) {
            btnShare.innerText = 'Gerando PDF...';
            btnShare.disabled = true;
        }

        try {
            if (skipPreview) {
                progressText.innerText = "Lendo PDF Original...";
                progressBar.style.width = "10%";
                if (btnCancelProcessing) btnCancelProcessing.style.display = 'none';
                progressBar.style.transition = 'width 0.2s linear';
            }

            const { PDFDocument } = PDFLib;
            const newPdf = await PDFDocument.create();
            const originalPdf = await PDFDocument.load(currentPdfBytes, { ignoreEncryption: true });

            const embeddedPages = await newPdf.embedPages(originalPdf.getPages());
            const totalOriginalPages = embeddedPages.length;
            const signatureSize = parseInt(document.getElementById('binding-type').value) || 0;
            const sheets = calculateImposition(totalOriginalPages, signatureSize);

            const pageWidth = 841.89;
            const pageHeight = 595.28;
            const halfWidth = pageWidth / 2;
            const font = await newPdf.embedFont(PDFLib.StandardFonts.Helvetica);

            const drawNum = (page, pageIndex, centerX) => {
                const addPagination = document.getElementById('add-pagination').checked;

                if (addPagination && pageIndex > 1) {
                    const text = (pageIndex - 1).toString();
                    const size = 11;
                    const textWidth = font.widthOfTextAtSize(text, size);

                    const yPos = 15;

                    page.drawText(text, {
                        x: centerX - (textWidth / 2) + 0.5,
                        y: yPos - 0.5,
                        size: size, font: font,
                        color: PDFLib.rgb(0, 0, 0)
                    });

                    page.drawText(text, {
                        x: centerX - (textWidth / 2) + 1,
                        y: yPos - 1,
                        size: size, font: font,
                        color: PDFLib.rgb(0, 0, 0)
                    });

                    page.drawText(text, {
                        x: centerX - (textWidth / 2),
                        y: yPos,
                        size: size, font: font,
                        color: PDFLib.rgb(1, 1, 1)
                    });
                }
            };

            if (skipPreview) {
                progressText.innerText = "Processando páginas...";
            }

            const totalSheets = sheets.length;

            const BATCH_SIZE = 50;

            for (let i = 0; i < totalSheets; i++) {
                const sheet = sheets[i];

                if (skipPreview && i % BATCH_SIZE === 0) {
                    const percent = 10 + ((i / totalSheets) * 80);
                    progressBar.style.width = `${percent}%`;

                    progressText.innerText = `Processando... ${Math.round((i / totalSheets) * 100)}%`;

                    await new Promise(r => setTimeout(r, 0));
                }

                const frontPage = newPdf.addPage([pageWidth, pageHeight]);
                if (sheet.front.left <= totalOriginalPages) {
                    frontPage.drawPage(embeddedPages[sheet.front.left - 1], { x: 0, y: 0, width: halfWidth, height: pageHeight });
                    drawNum(frontPage, sheet.front.left, halfWidth / 2);
                }
                if (sheet.front.right <= totalOriginalPages) {
                    frontPage.drawPage(embeddedPages[sheet.front.right - 1], { x: halfWidth, y: 0, width: halfWidth, height: pageHeight });
                    drawNum(frontPage, sheet.front.right, halfWidth + (halfWidth / 2));
                }

                const backPage = newPdf.addPage([pageWidth, pageHeight]);
                if (sheet.back.left <= totalOriginalPages) {
                    backPage.drawPage(embeddedPages[sheet.back.left - 1], { x: 0, y: 0, width: halfWidth, height: pageHeight });
                    drawNum(backPage, sheet.back.left, halfWidth / 2);
                }
                if (sheet.back.right <= totalOriginalPages) {
                    backPage.drawPage(embeddedPages[sheet.back.right - 1], { x: halfWidth, y: 0, width: halfWidth, height: pageHeight });
                    drawNum(backPage, sheet.back.right, halfWidth + (halfWidth / 2));
                }
            }

            if (skipPreview) {
                progressBar.style.width = "95%";
                progressText.innerText = "Salvando arquivo...";
                await new Promise(r => setTimeout(r, 10));
            }

            const pdfBytes = await newPdf.save();
            const newFileName = `formatado_booklet_${currentFileName || 'documento.pdf'}`;

            generatedPdfFile = new File([pdfBytes], newFileName, { type: "application/pdf" });

            if (skipPreview) {
                progressBar.style.width = "100%";
                progressText.innerText = "Concluído!";

                await new Promise(r => setTimeout(r, 200));

                successFileName.textContent = newFileName;

                successModal.style.display = 'flex';
                successModal.offsetHeight;
                successModal.classList.add('active');

            } else {
                triggerDownloadOrShare(generatedPdfFile);
            }

        } catch (error) {
            console.error('Erro:', error);
            showAlertModal('Erro', 'Falha crítica: ' + error.message);
            if (skipPreview) {
                document.getElementById('processing-indicator').style.display = 'none';
                document.getElementById('file-upload').style.display = 'block';
            }
        } finally {
            if (progressBar) progressBar.style.transition = '';

            if (btnCancelProcessing) {
                if (skipPreview) {
                    btnCancelProcessing.style.display = 'none';
                } else {
                    btnCancelProcessing.style.display = '';
                }
            }

            if (btnShare && !skipPreview) {
                btnShare.innerText = originalText;
                btnShare.disabled = false;
            }
        }
    }

    async function triggerDownloadOrShare(file, forceDownload = false) {
        if (!file) return;

        if (forceDownload || !(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }))) {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(file);
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
                triggerDownloadOrShare(file, true);
            }
        }
    }

    document.getElementById('btnModalShare').addEventListener('click', () => {
        triggerDownloadOrShare(generatedPdfFile, false);
    });

    document.getElementById('btnModalPrint').addEventListener('click', () => {
        if (generatedPdfFile) {
            const url = URL.createObjectURL(generatedPdfFile);
            window.open(url, '_blank');
        }
    });

    document.getElementById('btnModalDownload').addEventListener('click', () => {
        triggerDownloadOrShare(generatedPdfFile, true);
    });

    document.getElementById('btnCloseSuccess').addEventListener('click', closeSuccessModal);

    if ('launchQueue' in window) {
        window.launchQueue.setConsumer(async (launchParams) => {
            if (launchParams.files && launchParams.files.length > 0) {
                const fileHandle = launchParams.files[0];
                const file = await fileHandle.getFile();
                handleFiles({ files: [file] }, false);
            }
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('share_target') === 'true') {
        caches.open('share-cache').then(async CACHE => {
            const response = await CACHE.match('shared-file');
            if (response) {
                const blob = await response.blob();
                const file = new File([blob], "shared_document.pdf", { type: "application/pdf" });
                handleFiles({ files: [file] }, false);
                CACHE.delete('shared-file');
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    let currentPdfBytes = null;
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
    const btnPrint = document.getElementById('btnPrint');
    const btnShare = document.getElementById('btnShare');

    btnCloseModal.addEventListener('click', closeModal);
    btnPrint.addEventListener('click', () => window.print());
    if (btnShare) {
        btnShare.addEventListener('click', shareBooklet);
    }

    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && previewModal.style.display === 'flex') {
            closeModal();
        }
    });

    function showModal() {
        previewModal.style.display = 'flex';
        setTimeout(() => popupCard.classList.add('show'), 10);
    }

    function closeModal() {
        popupCard.classList.remove('show');
        setTimeout(() => {
            previewModal.style.display = 'none';
        }, 300);
        fileUpload.style.display = 'block';
        fileInput.value = '';
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

    async function handleFiles(e) {
        const file = e.target.files[0];
        if (!file || file.type !== 'application/pdf') {
            alert('Por favor, envie um arquivo PDF.');
            return;
        }

        startProcessing();

        try {
            const arrayBuffer = await file.arrayBuffer();
            currentPdfBytes = arrayBuffer.slice(0);
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            await processPDF(pdf);

            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error('Erro ao processar PDF:', error);
            alert('Ocorreu um erro ao ler o PDF.');
        } finally {
            endProcessing();
        }
    }

    function startProcessing() {
        fileUpload.style.display = 'none';
        processingIndicator.style.display = 'block';
        previewContainer.innerHTML = '';
        printContainer.innerHTML = '';
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

    async function processPDF(pdf) {
        const totalOriginalPages = pdf.numPages;
        let totalPages = totalOriginalPages;

        if (totalPages % 4 !== 0) {
            totalPages = Math.ceil(totalPages / 4) * 4;
        }

        const sheets = [];
        const numSheets = totalPages / 4;

        let start = 1;
        let end = totalPages;

        for (let i = 0; i < numSheets; i++) {
            const sheet = {
                front: { left: end, right: start },
                back: { left: start + 1, right: end - 1 }
            };

            sheets.push(sheet);

            start += 2;
            end -= 2;
        }

        let processedCount = 0;
        const totalOperations = numSheets * 4;

        for (let i = 0; i < sheets.length; i++) {
            const sheet = sheets[i];
            const sheetDiv = document.createElement('div');
            sheetDiv.className = 'sheet-preview';

            const frontDiv = document.createElement('div');
            frontDiv.className = 'paper-sheet';
            const frontLeftContainer = createPageContainer();
            const frontRightContainer = createPageContainer();
            frontDiv.appendChild(frontLeftContainer);
            frontDiv.appendChild(frontRightContainer);

            const backDiv = document.createElement('div');
            backDiv.className = 'paper-sheet';
            backDiv.style.marginTop = '10px';
            const backLeftContainer = createPageContainer();
            const backRightContainer = createPageContainer();
            backDiv.appendChild(backLeftContainer);
            backDiv.appendChild(backRightContainer);

            sheetDiv.appendChild(frontDiv);
            sheetDiv.appendChild(backDiv);
            previewContainer.appendChild(sheetDiv);

            const printSheetFront = document.createElement('div');
            printSheetFront.className = 'print-sheet';
            const printFrontLeft = createPrintPage();
            const printFrontRight = createPrintPage();
            printSheetFront.appendChild(printFrontLeft);
            printSheetFront.appendChild(printFrontRight);

            const printSheetBack = document.createElement('div');
            printSheetBack.className = 'print-sheet';
            const printBackLeft = createPrintPage();
            const printBackRight = createPrintPage();
            printSheetBack.appendChild(printBackLeft);
            printSheetBack.appendChild(printBackRight);

            printContainer.appendChild(printSheetFront);
            printContainer.appendChild(printSheetBack);

            const renderToTargets = async (pageIndex, targets) => {
                const isContentPage = pageIndex <= totalOriginalPages;

                let pageNumText = '';
                if (pageIndex > 1 && pageIndex < totalPages) {
                    pageNumText = (pageIndex - 1).toString();
                }

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

                            await page.render({
                                canvasContext: context,
                                viewport: viewport
                            }).promise;
                        } catch (err) {
                            console.error(`Error rendering page ${pageIndex}`, err);
                        }
                    }

                    if (pageNumText) {
                        const numDiv = document.createElement('div');
                        numDiv.className = 'page-number';
                        numDiv.innerText = pageNumText;
                        container.appendChild(numDiv);
                    }
                }
            };

            await renderToTargets(sheet.front.left, [frontLeftContainer, printFrontLeft]);
            processedCount++; updateProgress((processedCount / totalOperations) * 100);

            await renderToTargets(sheet.front.right, [frontRightContainer, printFrontRight]);
            processedCount++; updateProgress((processedCount / totalOperations) * 100);

            await renderToTargets(sheet.back.left, [backLeftContainer, printBackLeft]);
            processedCount++; updateProgress((processedCount / totalOperations) * 100);

            await renderToTargets(sheet.back.right, [backRightContainer, printBackRight]);
            processedCount++; updateProgress((processedCount / totalOperations) * 100);
        }

        updateProgress(100);
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
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
        installBtn.style.display = 'none';
    });

    window.addEventListener('appinstalled', () => {
        installBtn.style.display = 'none';
        deferredPrompt = null;
        console.log('PWA was installed');
    });

    async function shareBooklet() {
        if (!currentPdfBytes) {
            alert('Nenhum arquivo PDF carregado.');
            return;
        }

        const btnShare = document.getElementById('btnShare');
        const originalText = btnShare.innerText;
        btnShare.innerText = 'Gerando PDF...';
        btnShare.disabled = true;
        try {
            const { PDFDocument } = PDFLib;
            const newPdf = await PDFDocument.create();
            const originalPdf = await PDFDocument.load(currentPdfBytes);
            const embeddedPages = await newPdf.embedPages(originalPdf.getPages());

            const totalOriginalPages = embeddedPages.length;
            let totalPages = totalOriginalPages;
            if (totalPages % 4 !== 0) {
                totalPages = Math.ceil(totalPages / 4) * 4;
            }

            const numSheets = totalPages / 4;
            let start = 1;
            let end = totalPages;

            const sheets = [];
            for (let i = 0; i < numSheets; i++) {
                sheets.push({
                    front: { left: end, right: start },
                    back: { left: start + 1, right: end - 1 }
                });
                start += 2;
                end -= 2;
            }

            const pageWidth = 841.89;
            const pageHeight = 595.28;
            const halfWidth = pageWidth / 2;

            for (const sheet of sheets) {
                const frontPage = newPdf.addPage([pageWidth, pageHeight]);

                if (sheet.front.left <= totalOriginalPages) {
                    frontPage.drawPage(embeddedPages[sheet.front.left - 1], {
                        x: 0,
                        y: 0,
                        width: halfWidth,
                        height: pageHeight
                    });
                }

                if (sheet.front.right <= totalOriginalPages) {
                    frontPage.drawPage(embeddedPages[sheet.front.right - 1], {
                        x: halfWidth,
                        y: 0,
                        width: halfWidth,
                        height: pageHeight
                    });
                }

                const backPage = newPdf.addPage([pageWidth, pageHeight]);

                if (sheet.back.left <= totalOriginalPages) {
                    backPage.drawPage(embeddedPages[sheet.back.left - 1], {
                        x: 0,
                        y: 0,
                        width: halfWidth,
                        height: pageHeight
                    });
                }

                if (sheet.back.right <= totalOriginalPages) {
                    backPage.drawPage(embeddedPages[sheet.back.right - 1], {
                        x: halfWidth,
                        y: 0,
                        width: halfWidth,
                        height: pageHeight
                    });
                }
            }

            const pdfBytes = await newPdf.save();
            const file = new File([pdfBytes], "livreto_formatado.pdf", { type: "application/pdf" });

            if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Livreto PDF Formatado',
                    text: 'Aqui está seu livreto pronto para impressão.'
                });
            } else {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(file);
                link.download = 'livreto_formatado.pdf';
                link.click();
            }

        } catch (error) {
            console.error('Erro ao gerar/compartilhar PDF:', error);
            alert('Erro ao gerar o PDF para compartilhamento. Verifique o console para mais detalhes.');
        } finally {
            btnShare.innerText = originalText;
            btnShare.disabled = false;
        }
    }

    if ('launchQueue' in window) {
        window.launchQueue.setConsumer(async (launchParams) => {
            if (launchParams.files && launchParams.files.length > 0) {
                const fileHandle = launchParams.files[0];
                const file = await fileHandle.getFile();
                handleFiles({ target: { files: [file] } });
            }
        });
    }
});

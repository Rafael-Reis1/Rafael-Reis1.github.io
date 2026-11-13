const PDF_TOOL_CONFIG = {
    merge: {
        title: 'Juntar PDFs',
        uploadPrompt: 'Arraste 2 ou mais PDFs aqui ou clique para selecionar',
        accept: 'application/pdf,.pdf',
        multiple: true,
        primaryLabel: 'Baixar PDF Mesclado',
        changeLabel: 'Substituir Lista',
        build: (previewPane, controls) => buildMergeTool(previewPane, controls),
        run: () => executeMergePdfs()
    },
    split: {
        title: 'Dividir / Extrair Páginas',
        uploadPrompt: 'Arraste seu PDF aqui para selecionar páginas',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Extrair Selecionadas',
        build: (previewPane, controls) => buildSplitTool(previewPane, controls),
        run: () => executeSplitPdf()
    },
    organize: {
        title: 'Organizar Páginas',
        uploadPrompt: 'Arraste seu PDF aqui para reordenar, girar ou excluir páginas',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Baixar PDF Organizado',
        build: (previewPane, controls) => buildOrganizeTool(previewPane, controls),
        run: () => executeOrganizePdf()
    },
    rotate: {
        title: 'Girar Páginas',
        uploadPrompt: 'Arraste seu PDF aqui para girar páginas',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Aplicar Rotação e Baixar',
        build: (previewPane, controls) => buildRotateTool(previewPane, controls),
        run: () => executeRotatePdf()
    },
    'pdf-to-img': {
        title: 'PDF para Imagens',
        uploadPrompt: 'Arraste seu PDF aqui para exportar páginas em PNG, JPG ou WEBP',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Converter e Baixar',
        build: (previewPane, controls) => buildPdfToImgTool(previewPane, controls),
        run: () => executePdfToImages()
    },
    'img-to-pdf': {
        title: 'Imagens para PDF',
        uploadPrompt: 'Arraste imagens PNG, JPG ou WEBP aqui (ou cole com Ctrl+V)',
        accept: 'image/*',
        multiple: true,
        primaryLabel: 'Gerar e Baixar PDF',
        changeLabel: 'Limpar e Reenviar',
        build: (previewPane, controls) => buildImgToPdfTool(previewPane, controls),
        run: () => executeImgToPdf()
    },
    watermark: {
        title: "Marca d'Água em PDF",
        uploadPrompt: 'Arraste seu PDF aqui para aplicar marca d\'água',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Aplicar e Baixar PDF',
        build: (previewPane, controls) => buildWatermarkTool(previewPane, controls),
        run: () => executeWatermarkPdf()
    },
    'page-numbers': {
        title: 'Numerar Páginas',
        uploadPrompt: 'Arraste seu PDF aqui para adicionar numeração automática',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Numerar e Baixar PDF',
        build: (previewPane, controls) => buildPageNumbersTool(previewPane, controls),
        run: () => executePageNumbersPdf()
    },
    sign: {
        title: 'Assinar / Carimbar PDF',
        uploadPrompt: 'Arraste o PDF que deseja assinar ou carimbar',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Assinar e Baixar PDF',
        build: (previewPane, controls) => buildSignTool(previewPane, controls),
        run: () => executeSignPdf()
    },
    nup: {
        title: 'N Páginas por Folha',
        uploadPrompt: 'Arraste seu PDF aqui para agrupar várias páginas por folha A4',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Gerar Layout e Baixar',
        build: (previewPane, controls) => buildNupTool(previewPane, controls),
        run: () => executeNupPdf()
    },
    compress: {
        title: 'Compactar PDF',
        uploadPrompt: 'Arraste seu PDF aqui para reduzir o tamanho do arquivo',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Compactar e Baixar',
        build: (previewPane, controls) => buildCompressTool(previewPane, controls),
        run: () => executeCompressPdf()
    },
    'extract-text': {
        title: 'Extrair Texto & OCR',
        uploadPrompt: 'Arraste seu PDF aqui para extrair texto ou rodar OCR',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Baixar .TXT',
        build: (previewPane, controls) => buildExtractTextTool(previewPane, controls),
        run: () => executeDownloadExtractedTxt()
    },
    metadata: {
        title: 'Privacidade & Metadados',
        uploadPrompt: 'Arraste seu PDF aqui para inspecionar ou limpar metadados',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Salvar PDF Limpo',
        build: (previewPane, controls) => buildMetadataTool(previewPane, controls),
        run: () => executeMetadataSavePdf()
    },
    redact: {
        title: 'Tarja / Redact Seguro',
        uploadPrompt: 'Arraste seu PDF aqui para ocultar dados sensíveis de forma irreversível',
        accept: 'application/pdf,.pdf',
        multiple: false,
        primaryLabel: 'Aplicar Tarjas e Baixar',
        build: (previewPane, controls) => buildRedactTool(previewPane, controls),
        run: () => executeRedactPdf()
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '../pdfFormatter/lib/pdf.worker.min.js';
    }

    document.querySelectorAll('.tool-card').forEach((card) => {
        card.addEventListener('click', () => {
            openToolModal(card.dataset.tool);
        });
    });

    const uploadArea = document.getElementById('uploadArea');
    const pdfInput = document.getElementById('pdfInput');

    if (uploadArea && pdfInput) {
        uploadArea.addEventListener('click', () => pdfInput.click());
        pdfInput.addEventListener('change', (e) => {
            handleSelectedFiles(e.target.files);
            e.target.value = '';
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            if (e.dataTransfer?.files?.length) {
                handleSelectedFiles(e.dataTransfer.files);
            }
        });
    }

    const modal = document.getElementById('toolModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeToolModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.classList.contains('active')) {
            closeToolModal();
        }
    });

    document.addEventListener('paste', handleClipboardPaste);

    const searchInput = document.getElementById('toolSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.tool-card').forEach((card) => {
                const title = card.querySelector('h3')?.textContent.toLowerCase() || '';
                const desc = card.querySelector('p')?.textContent.toLowerCase() || '';
                const key = (card.dataset.tool || '').toLowerCase();
                const visible = !q || title.includes(q) || desc.includes(q) || key.includes(q);
                card.classList.toggle('hidden', !visible);
            });
        });
    }
});

const WIDE_SPLIT_TOOLS = new Set(['redact', 'sign', 'watermark', 'page-numbers', 'rotate', 'pdf-to-img']);

function showUploadScreen(cfg) {
    const uploadArea = document.getElementById('uploadArea');
    const workspace = document.getElementById('pdfWorkspace');
    const footer = document.getElementById('modalFooter');
    const prompt = document.getElementById('uploadPrompt');
    const input = document.getElementById('pdfInput');

    if (uploadArea) uploadArea.style.display = 'flex';
    if (workspace) {
        workspace.style.display = 'none';
        workspace.classList.remove('wide-split');
    }
    if (footer) footer.style.display = 'none';
    if (prompt && cfg) prompt.textContent = cfg.uploadPrompt;
    if (input && cfg) {
        input.accept = cfg.accept;
        input.multiple = Boolean(cfg.multiple);
    }
}

function showWorkspaceScreen(cfg) {
    const uploadArea = document.getElementById('uploadArea');
    const workspace = document.getElementById('pdfWorkspace');
    const footer = document.getElementById('modalFooter');
    const btnPrimary = document.getElementById('btnPdfPrimary');
    const btnChange = document.getElementById('btnPdfChangeFile');

    if (uploadArea) uploadArea.style.display = 'none';
    if (workspace) {
        workspace.style.display = '';
        workspace.classList.toggle('wide-split', WIDE_SPLIT_TOOLS.has(currentPdfTool));
    }
    if (footer) footer.style.display = 'flex';
    if (btnPrimary && cfg) btnPrimary.textContent = cfg.primaryLabel || 'Baixar PDF';
    if (btnChange && cfg) btnChange.textContent = cfg.changeLabel || 'Trocar Arquivo';
}

function renderActiveToolWorkspace() {
    const cfg = PDF_TOOL_CONFIG[currentPdfTool];
    if (!cfg) return;

    cleanupPdfToolState();
    showWorkspaceScreen(cfg);

    const previewPane = document.getElementById('pdfPreviewPane');
    const controls = document.getElementById('pdfControls');
    if (previewPane) previewPane.innerHTML = '';
    if (controls) controls.innerHTML = '';

    cfg.build(previewPane, controls);
    setTimeout(() => initCustomSelects(), 0);
}

function openToolModal(toolKey) {
    const cfg = PDF_TOOL_CONFIG[toolKey];
    if (!cfg) return;

    currentPdfTool = toolKey;
    cleanupPdfToolState();

    const modal = document.getElementById('toolModal');
    const titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.textContent = cfg.title;
    if (modal) modal.classList.add('active');
    document.body.classList.add('modal-open');

    if (toolKey === 'merge' && mergePdfFiles.length > 0) {
        renderActiveToolWorkspace();
    } else if (toolKey === 'img-to-pdf' && imgToPdfItems.length > 0) {
        renderActiveToolWorkspace();
    } else if (toolKey !== 'merge' && toolKey !== 'img-to-pdf' && loadedPdfBytes) {
        renderActiveToolWorkspace();
    } else {
        showUploadScreen(cfg);
    }
}

function closeToolModal() {
    const modal = document.getElementById('toolModal');
    if (modal) modal.classList.remove('active');
    document.body.classList.remove('modal-open');
    cleanupPdfToolState();
}

function triggerChangeFile() {
    const cfg = PDF_TOOL_CONFIG[currentPdfTool];
    if (!cfg) return;
    if (currentPdfTool === 'merge') mergePdfFiles = [];
    if (currentPdfTool === 'img-to-pdf') imgToPdfItems = [];
    showUploadScreen(cfg);
}

function resetCurrentTool() {
    if (!currentPdfTool) return;
    renderActiveToolWorkspace();
    showToast('Configurações restauradas!', 'info');
}

async function handleSelectedFiles(fileList) {
    const cfg = PDF_TOOL_CONFIG[currentPdfTool];
    if (!cfg || !fileList || fileList.length === 0) return;

    if (currentPdfTool === 'merge') {
        showWorkspaceScreen(cfg);
        buildMergeTool(document.getElementById('pdfPreviewPane'), document.getElementById('pdfControls'));
        await addMergePdfFiles(fileList);
        return;
    }

    if (currentPdfTool === 'img-to-pdf') {
        showWorkspaceScreen(cfg);
        buildImgToPdfTool(document.getElementById('pdfPreviewPane'), document.getElementById('pdfControls'));
        await addImgToPdfFiles(fileList);
        setTimeout(() => initCustomSelects(), 0);
        return;
    }

    const pdfFile = Array.from(fileList).find((f) =>
        f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''))
    );
    if (!pdfFile) {
        showToast('Envie um arquivo PDF válido.', 'error');
        return;
    }

    await loadSinglePdfFile(pdfFile);
}

async function loadSinglePdfFile(file) {
    try {
        setPdfProgress(15, 'Carregando PDF...');
        const bytes = await readFileAsUint8Array(file);
        const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        loadedPdfBytes = bytes;
        loadedPdfName = file.name || 'documento.pdf';
        loadedPdfPageCount = doc.getPageCount();
        loadedPdfJsDoc = await openPdfJsDocument(bytes);
        hidePdfProgress();
        renderActiveToolWorkspace();
    } catch (err) {
        hidePdfProgress();
        console.error('Erro ao abrir PDF:', err);
        showToast('Não foi possível abrir este PDF (verifique se está corrompido ou protegido).', 'error');
    }
}

function handleClipboardPaste(e) {
    const modal = document.getElementById('toolModal');
    if (!modal || !modal.classList.contains('active')) return;
    if (currentPdfTool !== 'img-to-pdf') return;

    const files = [];
    if (e.clipboardData?.items) {
        for (const item of Array.from(e.clipboardData.items)) {
            if (item.type && item.type.startsWith('image/') && typeof item.getAsFile === 'function') {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }
    }
    if (files.length === 0) return;

    e.preventDefault();
    showWorkspaceScreen(PDF_TOOL_CONFIG['img-to-pdf']);
    if (!document.getElementById('imgPdfPageSize')) {
        buildImgToPdfTool(document.getElementById('pdfPreviewPane'), document.getElementById('pdfControls'));
        setTimeout(() => initCustomSelects(), 0);
    }
    addImgToPdfFiles(files);
    showToast('Imagem colada para converter em PDF!', 'success');
}

async function runPrimaryAction() {
    const cfg = PDF_TOOL_CONFIG[currentPdfTool];
    if (!cfg) return;

    const btn = document.getElementById('btnPdfPrimary');
    const prevLabel = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Processando...';
    }

    try {
        await cfg.run();
    } catch (err) {
        console.error(`Erro na ferramenta ${currentPdfTool}:`, err);
        showToast('Ocorreu um erro ao processar o arquivo.', 'error');
    } finally {
        hidePdfProgress();
        if (btn) {
            btn.disabled = false;
            btn.textContent = prevLabel;
        }
    }
}

let splitSelectedPages = new Set();
let organizeItems = [];
let rotateTargetAngle = 90;

function renderPdfPreviewInfoHeader(previewPane, title, subtitle) {
    previewPane.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
            <strong style="font-size:0.95rem;">${escapeHtml(title)}</strong>
            <span style="font-size:0.82rem; color:var(--text-muted);">${escapeHtml(subtitle)}</span>
        </div>
        <div id="pdfThumbGrid" class="pdf-thumb-grid"></div>
    `;
    return previewPane.querySelector('#pdfThumbGrid');
}

async function populateThumbGrid(gridEl, entries, token) {
    if (!gridEl || !loadedPdfJsDoc) return;
    const batch = entries.slice(0, 60);
    for (const item of batch) {
        if (token !== activeRenderToken || !gridEl.isConnected) return;
        const canvasEl = item.canvas;
        if (!canvasEl) continue;
        try {
            await renderPdfPageToCanvas(loadedPdfJsDoc, item.pageNum, canvasEl, 0.35, item.rotation || 0);
        } catch {
            // Keep placeholder size if single page fails.
        }
    }
}

// ============================================
// 1. JUNTAR PDFs (MERGE)
// ============================================

function buildMergeTool(previewPane, controls) {
    renderMergeFileList(previewPane);
    controls.innerHTML = `
        <div class="info-banner neutral">
            Adicione dois ou mais PDFs, ajuste a ordem na lista acima e clique em <strong>Baixar PDF Mesclado</strong>.
        </div>
        <div class="control-row">
            <button type="button" class="btn-secondary" onclick="document.getElementById('mergeExtraInput').click()">
                ➕ Adicionar mais PDFs
            </button>
            <input type="file" id="mergeExtraInput" accept="application/pdf,.pdf" multiple style="display:none;" onchange="handleMergeExtraFiles(this)">
        </div>
    `;
}

function renderMergeFileList(previewPane) {
    if (!previewPane) return;
    if (mergePdfFiles.length === 0) {
        previewPane.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:1.5rem 0;">Nenhum PDF na fila ainda.</p>';
        return;
    }

    const totalPages = mergePdfFiles.reduce((acc, f) => acc + f.pageCount, 0);
    previewPane.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <strong>${mergePdfFiles.length} arquivo(s) na fila</strong>
            <span style="font-size:0.82rem; color:var(--text-muted);">Total: ${totalPages} página(s)</span>
        </div>
        <div class="pdf-file-list">
            ${mergePdfFiles.map((item, idx) => `
                <div class="pdf-file-item">
                    <span style="font-weight:700; color:var(--accent-color); min-width:24px;">#${idx + 1}</span>
                    <div class="pdf-file-info">
                        <span class="pdf-file-name">${escapeHtml(item.name)}</span>
                        <span class="pdf-file-sub">${item.pageCount} pág. · ${formatFileSize(item.bytes.byteLength)}</span>
                    </div>
                    <div style="display:flex; gap:0.35rem;">
                        <button type="button" class="pdf-mini-btn" onclick="moveMergeFile(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} title="Subir">▲</button>
                        <button type="button" class="pdf-mini-btn" onclick="moveMergeFile(${idx}, 1)" ${idx === mergePdfFiles.length - 1 ? 'disabled' : ''} title="Descer">▼</button>
                        <button type="button" class="pdf-mini-btn danger" onclick="removeMergeFile(${idx})" title="Remover">✕</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function addMergePdfFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) =>
        f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''))
    );
    if (files.length === 0) {
        showToast('Selecione apenas arquivos PDF válidos.', 'error');
        return;
    }

    setPdfProgress(10, 'Lendo arquivos PDF...');
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const bytes = await readFileAsUint8Array(file);
            const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
            mergePdfFiles.push({
                name: file.name || `arquivo-${mergePdfFiles.length + 1}.pdf`,
                bytes,
                pageCount: doc.getPageCount()
            });
            setPdfProgress(((i + 1) / files.length) * 100, `Lido ${i + 1} de ${files.length}...`);
        } catch (err) {
            console.error('Erro ao ler PDF no merge:', err);
            showToast(`Não foi possível abrir "${file.name}".`, 'error');
        }
    }
    hidePdfProgress();
    renderMergeFileList(document.getElementById('pdfPreviewPane'));
}

function handleMergeExtraFiles(input) {
    if (input.files && input.files.length > 0) {
        addMergePdfFiles(input.files);
    }
    input.value = '';
}

function moveMergeFile(idx, delta) {
    const next = idx + delta;
    if (next < 0 || next >= mergePdfFiles.length) return;
    [mergePdfFiles[idx], mergePdfFiles[next]] = [mergePdfFiles[next], mergePdfFiles[idx]];
    renderMergeFileList(document.getElementById('pdfPreviewPane'));
}

function removeMergeFile(idx) {
    mergePdfFiles.splice(idx, 1);
    renderMergeFileList(document.getElementById('pdfPreviewPane'));
}

async function executeMergePdfs() {
    if (mergePdfFiles.length < 2) {
        showToast('Adicione pelo menos 2 PDFs para juntar.', 'error');
        return null;
    }

    const merged = await PDFLib.PDFDocument.create();
    for (let i = 0; i < mergePdfFiles.length; i++) {
        const item = mergePdfFiles[i];
        setPdfProgress(((i + 1) / mergePdfFiles.length) * 90, `Copiando "${item.name}"...`);
        const srcDoc = await PDFLib.PDFDocument.load(item.bytes, { ignoreEncryption: true });
        const copiedPages = await merged.copyPages(srcDoc, srcDoc.getPageIndices());
        copiedPages.forEach((p) => merged.addPage(p));
    }

    setPdfProgress(98, 'Gerando PDF final...');
    const outBytes = await merged.save();
    downloadPdfBytes(outBytes, 'pdf-mesclado.pdf');
    showToast('PDFs mesclados com sucesso!', 'success');
    return outBytes;
}

// ============================================
// 2. DIVIDIR / EXTRAIR PÁGINAS (SPLIT)
// ============================================

function buildSplitTool(previewPane, controls) {
    splitSelectedPages = new Set(getAllPageNumbers(loadedPdfPageCount));

    controls.innerHTML = `
        <div class="control-row">
            <div class="control-group">
                <label>Intervalo de páginas (1-${loadedPdfPageCount})</label>
                <input type="text" id="splitRangeInput" value="1-${loadedPdfPageCount}" placeholder="ex: 1-3, 5, 8">
            </div>
            <div class="control-group">
                <label>Modo de saída</label>
                <select id="splitOutputMode">
                    <option value="single">Extrair selecionadas em 1 PDF</option>
                    <option value="zip">Salvar cada página separada (.zip)</option>
                </select>
            </div>
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button type="button" class="btn-secondary" onclick="selectAllSplitPages(true)">Selecionar todas</button>
            <button type="button" class="btn-secondary" onclick="selectAllSplitPages(false)">Limpar seleção</button>
            <button type="button" class="btn-secondary" onclick="applySplitRangeFromInput()">Aplicar intervalo</button>
        </div>
    `;

    document.getElementById('splitRangeInput').addEventListener('input', applySplitRangeFromInput);
    renderSplitGrid(previewPane);
}

function renderSplitGrid(previewPane) {
    const grid = renderPdfPreviewInfoHeader(
        previewPane,
        loadedPdfName,
        `${splitSelectedPages.size} de ${loadedPdfPageCount} selecionada(s)`
    );

    const token = ++activeRenderToken;
    const renderTargets = [];
    grid.innerHTML = '';

    for (let p = 1; p <= loadedPdfPageCount; p++) {
        const card = document.createElement('div');
        card.className = `pdf-thumb-card${splitSelectedPages.has(p) ? ' selected' : ''}`;
        card.dataset.page = String(p);
        card.onclick = () => toggleSplitPage(p);

        const canvasEl = document.createElement('canvas');
        canvasEl.className = 'pdf-thumb-canvas';
        canvasEl.width = 110;
        canvasEl.height = 148;

        const meta = document.createElement('div');
        meta.className = 'pdf-thumb-meta';
        meta.innerHTML = `<span>Pág. ${p}</span><span>${splitSelectedPages.has(p) ? '✔' : ''}</span>`;

        card.appendChild(canvasEl);
        card.appendChild(meta);
        grid.appendChild(card);
        renderTargets.push({ pageNum: p, canvas: canvasEl });
    }

    populateThumbGrid(grid, renderTargets, token);
}

function syncSplitInputWithSet() {
    const input = document.getElementById('splitRangeInput');
    if (!input) return;
    const sorted = Array.from(splitSelectedPages).sort((a, b) => a - b);
    input.value = sorted.join(', ');
}

function toggleSplitPage(pageNum) {
    if (splitSelectedPages.has(pageNum)) {
        splitSelectedPages.delete(pageNum);
    } else {
        splitSelectedPages.add(pageNum);
    }
    syncSplitInputWithSet();
    renderSplitGrid(document.getElementById('pdfPreviewPane'));
}

function selectAllSplitPages(selected) {
    splitSelectedPages = selected ? new Set(getAllPageNumbers(loadedPdfPageCount)) : new Set();
    syncSplitInputWithSet();
    renderSplitGrid(document.getElementById('pdfPreviewPane'));
}

function applySplitRangeFromInput() {
    const raw = document.getElementById('splitRangeInput')?.value || '';
    splitSelectedPages = new Set(parsePageRanges(raw, loadedPdfPageCount));
    document.querySelectorAll('#pdfThumbGrid .pdf-thumb-card').forEach((card) => {
        const pageNum = parseInt(card.dataset.page, 10);
        const on = splitSelectedPages.has(pageNum);
        card.classList.toggle('selected', on);
        const checkEl = card.querySelector('.pdf-thumb-meta span:last-child');
        if (checkEl) checkEl.textContent = on ? '✔' : '';
    });
    const subtitle = document.querySelector('#pdfPreviewPane strong + span');
    if (subtitle) subtitle.textContent = `${splitSelectedPages.size} de ${loadedPdfPageCount} selecionada(s)`;
}

async function executeSplitPdf() {
    if (!loadedPdfBytes) return null;
    const expr = document.getElementById('splitRangeInput')?.value || '';
    const pages = parsePageRanges(expr, loadedPdfPageCount);
    const chosen = pages.length > 0 ? pages : Array.from(splitSelectedPages).sort((a, b) => a - b);

    if (chosen.length === 0) {
        showToast('Selecione ao menos uma página válida.', 'error');
        return null;
    }

    const mode = document.getElementById('splitOutputMode')?.value || 'single';
    const srcDoc = await PDFLib.PDFDocument.load(loadedPdfBytes, { ignoreEncryption: true });

    if (mode === 'zip') {
        await ensureJSZipReady();
        const zip = new JSZip();
        const pad = String(loadedPdfPageCount).length;

        for (let i = 0; i < chosen.length; i++) {
            const pNum = chosen[i];
            setPdfProgress(((i + 1) / chosen.length) * 90, `Extraindo página ${pNum}...`);
            const singleDoc = await PDFLib.PDFDocument.create();
            const [copied] = await singleDoc.copyPages(srcDoc, [pNum - 1]);
            singleDoc.addPage(copied);
            const singleBytes = await singleDoc.save();
            zip.file(`pagina-${String(pNum).padStart(pad, '0')}.pdf`, singleBytes);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, sanitizePdfFileName(loadedPdfName, 'paginas').replace(/\.pdf$/i, '.zip'));
        showToast(`${chosen.length} páginas salvas em ZIP!`, 'success');
        return chosen.length;
    }

    const outDoc = await PDFLib.PDFDocument.create();
    const indices = chosen.map((p) => p - 1);
    const copiedPages = await outDoc.copyPages(srcDoc, indices);
    copiedPages.forEach((p) => outDoc.addPage(p));
    const outBytes = await outDoc.save();
    downloadPdfBytes(outBytes, sanitizePdfFileName(loadedPdfName, 'extraido'));
    showToast(`${chosen.length} página(s) extraída(s)!`, 'success');
    return outBytes;
}

// ============================================
// 3. ORGANIZAR PÁGINAS (REORDENAR / GIRAR / EXCLUIR)
// ============================================

function buildOrganizeTool(previewPane, controls) {
    organizeItems = getAllPageNumbers(loadedPdfPageCount).map((p) => ({
        pageNum: p,
        rotation: 0
    }));

    controls.innerHTML = `
        <div class="info-banner neutral">
            Use os botões em cada miniatura para mover (◀ ▶), girar (↻), duplicar (+) ou remover (✕) páginas antes de baixar.
        </div>
    `;
    renderOrganizeGrid(previewPane);
}

function renderOrganizeGrid(previewPane) {
    const grid = renderPdfPreviewInfoHeader(
        previewPane,
        loadedPdfName,
        `${organizeItems.length} página(s) na ordem final`
    );

    const token = ++activeRenderToken;
    const renderTargets = [];
    grid.innerHTML = '';

    organizeItems.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'pdf-thumb-card';

        const canvasEl = document.createElement('canvas');
        canvasEl.className = 'pdf-thumb-canvas';
        canvasEl.width = 110;
        canvasEl.height = 148;

        const meta = document.createElement('div');
        meta.className = 'pdf-thumb-meta';
        meta.innerHTML = `<span>#${idx + 1} (orig. ${item.pageNum})</span><span>${item.rotation}°</span>`;

        const actions = document.createElement('div');
        actions.className = 'pdf-thumb-actions';
        actions.innerHTML = `
            <button type="button" class="pdf-mini-btn" onclick="moveOrganizeItem(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} title="Mover antes">◀</button>
            <button type="button" class="pdf-mini-btn" onclick="moveOrganizeItem(${idx}, 1)" ${idx === organizeItems.length - 1 ? 'disabled' : ''} title="Mover depois">▶</button>
            <button type="button" class="pdf-mini-btn" onclick="rotateOrganizeItem(${idx})" title="Girar 90°">↻</button>
            <button type="button" class="pdf-mini-btn" onclick="duplicateOrganizeItem(${idx})" title="Duplicar">+</button>
            <button type="button" class="pdf-mini-btn danger" onclick="removeOrganizeItem(${idx})" title="Remover">✕</button>
        `;

        card.appendChild(canvasEl);
        card.appendChild(meta);
        card.appendChild(actions);
        grid.appendChild(card);

        renderTargets.push({ pageNum: item.pageNum, rotation: item.rotation, canvas: canvasEl });
    });

    populateThumbGrid(grid, renderTargets, token);
}

function moveOrganizeItem(idx, delta) {
    const next = idx + delta;
    if (next < 0 || next >= organizeItems.length) return;
    [organizeItems[idx], organizeItems[next]] = [organizeItems[next], organizeItems[idx]];
    renderOrganizeGrid(document.getElementById('pdfPreviewPane'));
}

function rotateOrganizeItem(idx) {
    if (!organizeItems[idx]) return;
    organizeItems[idx].rotation = (organizeItems[idx].rotation + 90) % 360;
    renderOrganizeGrid(document.getElementById('pdfPreviewPane'));
}

function duplicateOrganizeItem(idx) {
    if (!organizeItems[idx]) return;
    organizeItems.splice(idx + 1, 0, { ...organizeItems[idx] });
    renderOrganizeGrid(document.getElementById('pdfPreviewPane'));
}

function removeOrganizeItem(idx) {
    if (organizeItems.length <= 1) {
        showToast('Mantenha pelo menos 1 página no documento.', 'error');
        return;
    }
    organizeItems.splice(idx, 1);
    renderOrganizeGrid(document.getElementById('pdfPreviewPane'));
}

async function executeOrganizePdf() {
    if (!loadedPdfBytes || organizeItems.length === 0) return null;

    const srcDoc = await PDFLib.PDFDocument.load(loadedPdfBytes, { ignoreEncryption: true });
    const outDoc = await PDFLib.PDFDocument.create();

    for (let i = 0; i < organizeItems.length; i++) {
        const entry = organizeItems[i];
        setPdfProgress(((i + 1) / organizeItems.length) * 90, `Montando página ${i + 1}...`);
        const [copied] = await outDoc.copyPages(srcDoc, [entry.pageNum - 1]);
        const currentRot = copied.getRotation().angle || 0;
        copied.setRotation(PDFLib.degrees((currentRot + entry.rotation) % 360));
        outDoc.addPage(copied);
    }

    const outBytes = await outDoc.save();
    downloadPdfBytes(outBytes, sanitizePdfFileName(loadedPdfName, 'organizado'));
    showToast('PDF organizado salvo!', 'success');
    return outBytes;
}

// ============================================
// 4. GIRAR PÁGINAS (ROTATE)
// ============================================

function buildRotateTool(previewPane, controls) {
    rotateTargetAngle = 90;

    previewPane.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.6rem; font-size:0.86rem; color:var(--text-muted);">
            <span>Prévia da página 1</span>
            <span id="rotateAngleLabel">Rotação: +90°</span>
        </div>
        <div class="pdf-canvas-stage"><canvas id="rotatePreviewCanvas" width="320" height="440"></canvas></div>
    `;

    controls.innerHTML = `
        <div class="control-group">
            <label>Ângulo de rotação adicional</label>
            <div class="control-row">
                <button type="button" class="btn-secondary" onclick="setRotateToolAngle(90)">↻ 90° Horário</button>
                <button type="button" class="btn-secondary" onclick="setRotateToolAngle(180)">⇅ 180°</button>
                <button type="button" class="btn-secondary" onclick="setRotateToolAngle(270)">↺ 90° Anti-horário</button>
            </div>
        </div>
        <div class="control-group">
            <label>Aplicar às páginas (vazio = todas as ${loadedPdfPageCount})</label>
            <input type="text" id="rotatePageRange" placeholder="ex: 1-3, 5">
        </div>
    `;

    renderRotateSampleCanvas();
}

function setRotateToolAngle(deg) {
    rotateTargetAngle = ((Number(deg) % 360) + 360) % 360;
    const label = document.getElementById('rotateAngleLabel');
    if (label) label.textContent = `Rotação: +${rotateTargetAngle}°`;
    renderRotateSampleCanvas();
}

async function renderRotateSampleCanvas() {
    const canvasEl = document.getElementById('rotatePreviewCanvas');
    if (!canvasEl || !loadedPdfJsDoc) return;
    await renderPdfPageToCanvas(loadedPdfJsDoc, 1, canvasEl, 1.35, rotateTargetAngle);
}

async function executeRotatePdf() {
    if (!loadedPdfBytes) return null;
    const rangeExpr = document.getElementById('rotatePageRange')?.value.trim() || '';
    const pages = rangeExpr ? parsePageRanges(rangeExpr, loadedPdfPageCount) : getAllPageNumbers(loadedPdfPageCount);

    if (pages.length === 0) {
        showToast('Nenhuma página válida no intervalo informado.', 'error');
        return null;
    }

    const doc = await PDFLib.PDFDocument.load(loadedPdfBytes, { ignoreEncryption: true });
    pages.forEach((pNum) => {
        const page = doc.getPage(pNum - 1);
        const curr = page.getRotation().angle || 0;
        page.setRotation(PDFLib.degrees((curr + rotateTargetAngle) % 360));
    });

    const outBytes = await doc.save();
    downloadPdfBytes(outBytes, sanitizePdfFileName(loadedPdfName, 'girado'));
    showToast(`Rotação aplicada em ${pages.length} página(s)!`, 'success');
    return outBytes;
}

// ============================================
// 5. PDF PARA IMAGENS (PNG / JPEG / WEBP + ZIP)
// ============================================

function buildPdfToImgTool(previewPane, controls) {
    previewPane.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.6rem; font-size:0.86rem; color:var(--text-muted);">
            <span>Prévia da página 1</span>
            <span>${loadedPdfPageCount} página(s)</span>
        </div>
        <div class="pdf-canvas-stage"><canvas id="pdfToImgSampleCanvas" width="320" height="440"></canvas></div>
    `;

    controls.innerHTML = `
        <div class="control-row">
            <div class="control-group">
                <label>Formato da imagem</label>
                <select id="pdfToImgFormat">
                    <option value="image/png">PNG (Sem perdas)</option>
                    <option value="image/jpeg">JPEG (Leve)</option>
                    <option value="image/webp">WEBP (Moderno)</option>
                </select>
            </div>
            <div class="control-group">
                <label>Resolução</label>
                <select id="pdfToImgScale">
                    <option value="1">Padrão (72 DPI)</option>
                    <option value="2" selected>Alta (144 DPI)</option>
                    <option value="3">Ultra (216 DPI)</option>
                </select>
            </div>
        </div>
        <div class="control-row">
            <div class="control-group">
                <label>Páginas (vazio = todas)</label>
                <input type="text" id="pdfToImgRange" placeholder="ex: 1-4">
            </div>
            <div class="control-group">
                <label>Qualidade JPG/WEBP: <span id="pdfToImgQualVal">92</span>%</label>
                <input type="range" id="pdfToImgQuality" min="40" max="100" value="92"
                    oninput="document.getElementById('pdfToImgQualVal').textContent = this.value">
            </div>
        </div>
    `;

    if (loadedPdfJsDoc) {
        renderPdfPageToCanvas(loadedPdfJsDoc, 1, document.getElementById('pdfToImgSampleCanvas'), 1.35);
    }
}

async function executePdfToImages() {
    if (!loadedPdfJsDoc) {
        showToast('Renderizador PDF.js indisponível neste ambiente.', 'error');
        return null;
    }

    const mime = document.getElementById('pdfToImgFormat')?.value || 'image/png';
    const scale = Math.max(0.5, Math.min(4, parseFloat(document.getElementById('pdfToImgScale')?.value || '2') || 2));
    const quality = (parseInt(document.getElementById('pdfToImgQuality')?.value || '92', 10) || 92) / 100;
    const expr = document.getElementById('pdfToImgRange')?.value.trim() || '';
    const pages = expr ? parsePageRanges(expr, loadedPdfPageCount) : getAllPageNumbers(loadedPdfPageCount);

    if (pages.length === 0) {
        showToast('Informe um intervalo de páginas válido.', 'error');
        return null;
    }

    const ext = mime === 'image/jpeg' ? 'jpg' : (mime === 'image/webp' ? 'webp' : 'png');
    const workCanvas = document.createElement('canvas');

    const canvasToBlob = (target) => new Promise((resolve) => target.toBlob(resolve, mime, quality));

    if (pages.length === 1) {
        setPdfProgress(50, `Renderizando página ${pages[0]}...`);
        await renderPdfPageToCanvas(loadedPdfJsDoc, pages[0], workCanvas, scale);
        const blob = await canvasToBlob(workCanvas);
        downloadBlob(blob, `${sanitizePdfFileName(loadedPdfName).replace(/\.pdf$/i, '')}-pag-${pages[0]}.${ext}`);
        showToast('Imagem exportada!', 'success');
        return 1;
    }

    await ensureJSZipReady();
    const zip = new JSZip();
    const pad = String(loadedPdfPageCount).length;

    for (let i = 0; i < pages.length; i++) {
        const pNum = pages[i];
        setPdfProgress(((i + 1) / pages.length) * 90, `Convertendo página ${pNum} de ${pages.length}...`);
        await renderPdfPageToCanvas(loadedPdfJsDoc, pNum, workCanvas, scale);
        const blob = await canvasToBlob(workCanvas);
        zip.file(`pagina-${String(pNum).padStart(pad, '0')}.${ext}`, blob);
    }

    setPdfProgress(98, 'Empacotando ZIP...');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, sanitizePdfFileName(loadedPdfName, 'imagens').replace(/\.pdf$/i, '.zip'));
    showToast(`${pages.length} imagens salvas em ZIP!`, 'success');
    return pages.length;
}

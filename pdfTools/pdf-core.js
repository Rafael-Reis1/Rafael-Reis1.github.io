let currentPdfTool = null;
let loadedPdfBytes = null;
let loadedPdfName = 'documento.pdf';
let loadedPdfPageCount = 0;
let loadedPdfJsDoc = null;
let mergePdfFiles = [];
let imgToPdfItems = [];
let activeRenderToken = 0;
let activeToolTeardown = null;

const loadedExternalScripts = new Map();
let customSelectDocListenerAttached = false;

/**
 * Loads an external CDN script once and caches the in-flight promise.
 */
function loadExternalScript(url, isReadyCheck) {
    if (typeof isReadyCheck === 'function' && isReadyCheck()) {
        return Promise.resolve();
    }
    if (loadedExternalScripts.has(url)) {
        return loadedExternalScripts.get(url);
    }

    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = () => {
            if (typeof isReadyCheck === 'function' && !isReadyCheck()) {
                loadedExternalScripts.delete(url);
                reject(new Error(`Dependência não inicializou: ${url}`));
                return;
            }
            resolve();
        };
        script.onerror = () => {
            loadedExternalScripts.delete(url);
            reject(new Error(`Falha ao carregar script: ${url}`));
        };
        document.head.appendChild(script);
    });

    loadedExternalScripts.set(url, promise);
    return promise;
}

async function ensureJSZipReady() {
    if (typeof JSZip !== 'undefined') return;
    await loadExternalScript(
        'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
        () => typeof JSZip !== 'undefined'
    );
}

async function ensureTesseractReady() {
    if (typeof Tesseract !== 'undefined') return;
    await loadExternalScript(
        'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
        () => typeof Tesseract !== 'undefined'
    );
}

/**
 * Parses a human page-range expression like "1-3, 5, 8-6" against maxPages.
 * Returns unique 1-based page numbers in the order requested.
 */
function parsePageRanges(expr, maxPages) {
    const limit = Math.max(0, Math.floor(Number(maxPages) || 0));
    if (limit <= 0) return [];

    const cleaned = String(expr || '').trim();
    if (!cleaned) return [];

    const seen = new Set();
    const pages = [];

    for (const part of cleaned.split(',')) {
        const token = part.trim();
        if (!token) continue;

        const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            const start = Math.max(1, Math.min(limit, parseInt(rangeMatch[1], 10)));
            const end = Math.max(1, Math.min(limit, parseInt(rangeMatch[2], 10)));
            const step = start <= end ? 1 : -1;
            for (let p = start; step > 0 ? p <= end : p >= end; p += step) {
                if (!seen.has(p)) {
                    seen.add(p);
                    pages.push(p);
                }
            }
            continue;
        }

        if (/^\d+$/.test(token)) {
            const single = parseInt(token, 10);
            if (single >= 1 && single <= limit && !seen.has(single)) {
                seen.add(single);
                pages.push(single);
            }
        }
    }

    return pages;
}

function formatFileSize(bytes) {
    const n = Math.max(0, Number(bytes) || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function sanitizePdfFileName(baseName, suffix = '') {
    const raw = String(baseName || 'documento')
        .replace(/\.pdf$/i, '')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .trim();
    const safeBase = raw || 'documento';
    const cleanSuffix = suffix ? `-${suffix.replace(/^-+/, '')}` : '';
    return `${safeBase}${cleanSuffix}.pdf`;
}

function normalizeHexToRgb(hex) {
    const clean = String(hex || '#000000').replace('#', '').trim();
    const full = clean.length === 3
        ? clean.split('').map((c) => c + c).join('')
        : clean.padEnd(6, '0').slice(0, 6);
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return { r: 0, g: 0, b: 0 };
    return {
        r: ((num >> 16) & 255) / 255,
        g: ((num >> 8) & 255) / 255,
        b: (num & 255) / 255
    };
}

function computeFitBox(containerW, containerH, itemW, itemH, margin = 0) {
    const pad = Math.max(0, Number(margin) || 0);
    const availW = Math.max(1, containerW - pad * 2);
    const availH = Math.max(1, containerH - pad * 2);
    const scale = Math.min(availW / Math.max(1, itemW), availH / Math.max(1, itemH));
    const width = itemW * scale;
    const height = itemH * scale;
    return {
        x: pad + (availW - width) / 2,
        y: pad + (availH - height) / 2,
        width,
        height
    };
}

function parseNupGrid(perSheet, orientation = 'portrait') {
    const n = Number(perSheet);
    if (n === 2) {
        return orientation === 'landscape' ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 };
    }
    if (n === 6) {
        return orientation === 'landscape' ? { cols: 3, rows: 2 } : { cols: 2, rows: 3 };
    }
    return { cols: 2, rows: 2 };
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `pdftools-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.isConnected) toast.remove();
    }, 3500);
}

function setPdfProgress(percent, text = 'Processando...') {
    const box = document.getElementById('pdfProgressBox');
    const fill = document.getElementById('pdfProgressFill');
    const label = document.getElementById('pdfProgressText');
    if (box) box.style.display = 'flex';
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
    if (label) label.textContent = text;
}

function hidePdfProgress() {
    const box = document.getElementById('pdfProgressBox');
    if (box) box.style.display = 'none';
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadPdfBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    downloadBlob(blob, filename);
}

function getAllPageNumbers(total) {
    return Array.from({ length: Math.max(0, total) }, (_, idx) => idx + 1);
}

function getAllPagesZeroBased(total) {
    return Array.from({ length: Math.max(0, total) }, (_, idx) => idx);
}

async function readFileAsUint8Array(file) {
    if (typeof file.arrayBuffer === 'function') {
        return new Uint8Array(await file.arrayBuffer());
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = () => reject(reader.error || new Error('Erro ao ler arquivo'));
        reader.readAsArrayBuffer(file);
    });
}

async function openPdfJsDocument(uint8Bytes) {
    if (typeof pdfjsLib === 'undefined' || typeof pdfjsLib.getDocument !== 'function') {
        return null;
    }
    // Pass a copied buffer so pdf.js worker transfer never detaches loadedPdfBytes.
    const loadingTask = pdfjsLib.getDocument({ data: uint8Bytes.slice() });
    return loadingTask.promise;
}

async function renderPdfPageToCanvas(pdfJsDoc, pageNumber, targetCanvas, scale = 1, extraRotationDeg = 0) {
    if (!pdfJsDoc || !targetCanvas) return false;
    const page = await pdfJsDoc.getPage(pageNumber);
    const baseRot = page.rotate || 0;
    const viewport = page.getViewport({ scale, rotation: (baseRot + extraRotationDeg) % 360 });
    const ctx = targetCanvas.getContext('2d');
    targetCanvas.width = Math.max(1, Math.round(viewport.width));
    targetCanvas.height = Math.max(1, Math.round(viewport.height));
    if (!ctx || typeof page.render !== 'function') return false;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return true;
}

function cleanupPdfToolState() {
    activeRenderToken++;
    if (typeof activeToolTeardown === 'function') {
        try {
            activeToolTeardown();
        } catch {
            // Ignore cleanup errors from detached nodes.
        }
        activeToolTeardown = null;
    }
    hidePdfProgress();
}

function initCustomSelects() {
    document.querySelectorAll('.controls-section select').forEach((select) => {
        if (select.dataset.customized === 'true') return;
        select.dataset.customized = 'true';

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-container';

        const trigger = document.createElement('div');
        trigger.className = 'select-trigger';
        trigger.setAttribute('role', 'combobox');
        trigger.setAttribute('tabindex', '0');
        trigger.setAttribute('aria-expanded', 'false');

        const selectedOpt = select.options[select.selectedIndex];
        const triggerText = document.createElement('span');
        triggerText.textContent = selectedOpt ? selectedOpt.textContent : '';

        const arrow = document.createElement('div');
        arrow.className = 'select-arrow';
        arrow.textContent = '▼';

        trigger.appendChild(triggerText);
        trigger.appendChild(arrow);

        const optionsList = document.createElement('div');
        optionsList.className = 'select-options';
        optionsList.setAttribute('role', 'listbox');

        const optionEls = Array.from(select.options).map((opt) => {
            const optEl = document.createElement('div');
            optEl.className = 'custom-option';
            optEl.setAttribute('role', 'option');
            optEl.dataset.value = opt.value;
            optEl.textContent = opt.textContent;
            if (opt.selected) {
                optEl.classList.add('selected');
                optEl.setAttribute('aria-selected', 'true');
            }
            optEl.addEventListener('click', (e) => {
                e.stopPropagation();
                select.value = opt.value;
                triggerText.textContent = opt.textContent;
                optionEls.forEach((el) => {
                    el.classList.remove('selected');
                    el.removeAttribute('aria-selected');
                });
                optEl.classList.add('selected');
                optEl.setAttribute('aria-selected', 'true');
                wrapper.classList.remove('active');
                trigger.setAttribute('aria-expanded', 'false');
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
            optionsList.appendChild(optEl);
            return optEl;
        });

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = wrapper.classList.toggle('active');
            document.querySelectorAll('.custom-select-container').forEach((other) => {
                if (other !== wrapper) {
                    other.classList.remove('active');
                    other.querySelector('.select-trigger')?.setAttribute('aria-expanded', 'false');
                }
            });
            trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                trigger.click();
            } else if (e.key === 'Escape') {
                wrapper.classList.remove('active');
                trigger.setAttribute('aria-expanded', 'false');
            }
        });

        wrapper.appendChild(trigger);
        wrapper.appendChild(optionsList);
        select.style.display = 'none';
        select.parentNode.insertBefore(wrapper, select.nextSibling);
    });

    if (!customSelectDocListenerAttached) {
        customSelectDocListenerAttached = true;
        document.addEventListener('click', () => {
            document.querySelectorAll('.custom-select-container').forEach((el) => {
                el.classList.remove('active');
                el.querySelector('.select-trigger')?.setAttribute('aria-expanded', 'false');
            });
        });
    }
}

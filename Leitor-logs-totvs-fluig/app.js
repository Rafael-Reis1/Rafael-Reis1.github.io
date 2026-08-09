const fileUploadArea = document.getElementById('file-upload');
const imageUpload = document.getElementById('imageUpload');
const fileInput = document.getElementById('file-input');

fileUploadArea.addEventListener('dragover', function (event) {
    imageUpload.src = 'assets/upload_blue.webp';
    fileUploadArea.classList.add('dragover');
    event.preventDefault();
});

fileUploadArea.addEventListener('dragleave', function (event) {
    imageUpload.src = 'assets/upload.webp';
    fileUploadArea.classList.remove('dragover');
    event.preventDefault();
});

fileUploadArea.addEventListener('drop', function (event) {
    event.preventDefault();
    Array.from(event.dataTransfer.files).forEach(file => addFileToList(file));
    fileUploadArea.classList.remove('dragover');
});

fileUploadArea.addEventListener('click', function () {
    fileInput.click();
});

fileUploadArea.onmouseenter = function () {
    imageUpload.src = 'assets/upload_blue.webp';
}

fileUploadArea.onmouseleave = function () {
    imageUpload.src = 'assets/upload.webp';
}

fileInput.addEventListener('change', function () {
    Array.from(this.files).forEach(file => addFileToList(file));
    this.value = '';
});

let currentFileId = null;
let globalExpandState = false;
const pinnedLogs = new Set();
let allGroupedLogs = [];
let filteredGroupedLogs = [];
let logHeaderElement = null;
let currentPage = 1;
let logsPerPage = 500;
let searchInput = document.getElementById('searchInput');
let timeStartInput = document.getElementById('timeStart');
let timeEndInput = document.getElementById('timeEnd');
let checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]');

const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
if (conteudoArquivoLog) {
    conteudoArquivoLog.addEventListener('click', (e) => {
        if (e.target.classList.contains('log-pin')) {
            const line = e.target.closest('.log-line');
            if (line && line.dataset.signature) {
                const sig = line.dataset.signature;
                if (pinnedLogs.has(sig)) {
                    pinnedLogs.delete(sig);
                    line.classList.remove('pinned');

                    const pinnedCheckbox = document.getElementById('pinnedOnly');
                    if (pinnedCheckbox && pinnedCheckbox.checked) {
                        const allActive = conteudoArquivoLog.querySelectorAll('.active');
                        allActive.forEach(el => el.classList.remove('active'));
                        filterLogs();
                    }

                    updateClearPinsButton();
                    debouncedSaveSettings();
                } else {
                    pinnedLogs.add(sig);
                    line.classList.add('pinned');
                    updateClearPinsButton();
                    debouncedSaveSettings();
                }
            }
        }

        const clickable = e.target.closest('.clickable-text');
        if (clickable) {
            const text = clickable.textContent.trim();
            const cleanText = text.replace(/^\[|\]$|^\(|\)$/g, '');

            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                if (searchInput.value === cleanText) {
                    searchInput.value = '';
                } else {
                    searchInput.value = cleanText;
                }
                searchInput.dispatchEvent(new Event('input'));
            }
        }
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function getFileId(file) {
    const id = `log_settings_${file.name}_${file.size}_${file.lastModified}`;
    return id;
}

function saveSettings() {
    if (!currentFileId) {
        console.warn('[DEBUG] No currentFileId, skipping save');
        return;
    }

    const settings = {
        pinnedSignatures: Array.from(pinnedLogs),
        filters: {
            pinnedOnly: document.getElementById('pinnedOnly')?.checked || false,
            levels: Array.from(document.querySelectorAll('input[name="filterLevel"]:checked')).map(cb => cb.value),
            search: document.getElementById('searchInput')?.value || '',
            timeStart: document.getElementById('timeStart')?.value || '',
            timeEnd: document.getElementById('timeEnd')?.value || '',
            limit: logsPerPage
        }
    };

    try {
        localStorage.setItem(currentFileId, JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save settings to localStorage', e);
    }
}

const activeLogElements = new Set();

function clearActiveLines() {
    activeLogElements.forEach(el => {
        if (el && el.classList) el.classList.remove('active');
    });
    activeLogElements.clear();
}

function setActiveLine(element) {
    if (!element) return;
    clearActiveLines();
    element.classList.add('active');
    activeLogElements.add(element);
}

const debouncedSaveSettings = debounce(saveSettings, 500);

function loadSettings(fileId) {
    const saved = localStorage.getItem(fileId);
    if (!saved) return;

    try {
        const settings = JSON.parse(saved);

        pinnedLogs.clear();
        if (settings.pinnedSignatures && Array.isArray(settings.pinnedSignatures)) {
            settings.pinnedSignatures.forEach(sig => pinnedLogs.add(sig));
        }

        updateClearPinsButton();

        if (settings.filters) {
            const pinnedCheckbox = document.getElementById('pinnedOnly');
            if (pinnedCheckbox) pinnedCheckbox.checked = !!settings.filters.pinnedOnly;

            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = settings.filters.search || '';

            const timeStart = document.getElementById('timeStart');
            const timeEnd = document.getElementById('timeEnd');
            if (timeStart) timeStart.value = settings.filters.timeStart || '';
            if (timeEnd) timeEnd.value = settings.filters.timeEnd || '';

            if (settings.filters.limit) {
                logsPerPage = settings.filters.limit;
            } else {
                logsPerPage = 500;
            }

            if (settings.filters.levels && Array.isArray(settings.filters.levels)) {
                document.querySelectorAll('input[name="filterLevel"]').forEach(cb => {
                    cb.checked = settings.filters.levels.includes(cb.value);
                });
            }
        }
    } catch (e) {
        console.error('Failed to load settings from localStorage', e);
    }
}

function createStackTraceBlock(buffer, level, customLabel = null, isConfigMode = false) {
    const container = document.createElement('div');
    container.className = 'stack-trace-container';
    if (level) container.dataset.level = level;

    const labelText = customLabel || 'Show Details';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'stack-trace-toggle';
    toggleBtn.textContent = `▶ ${labelText} (${buffer.length} lines)`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'stack-trace-content';
    contentDiv.style.display = globalExpandState ? 'block' : 'none';

    if (globalExpandState) {
        toggleBtn.classList.add('rotated');
    }

    [...buffer].reverse().forEach(traceLine => {
        const lineDiv = document.createElement('div');
        const isStackLine = traceLine.trim().startsWith('at ') || traceLine.trim().startsWith('...');

        if (isConfigMode) {
            lineDiv.className = 'log-line';
            const regex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3})\s+((?:INFO|WARN|ERROR|DEBUG|FATAL)(?:x\d+)?)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$/;
            const match = traceLine.match(regex);

            if (match) {
                const [fullMatch, date, rawLevel, className, thread, message] = match;
                const matchLevel = rawLevel.replace(/x\d+$/, '').trim();
                let cleanClass = className.replace(/^\[|\]$/g, '');
                let cleanThread = thread.replace(/^\(|\)$/g, '');
                let cleanMessage = message.replace(/^-\s+/, '');

                lineDiv.innerHTML = `
                    <span class="log-pin-placeholder"></span>
                    <span class="log-date">${date}</span>
                    <span class="log-level log-level-${matchLevel.toLowerCase()}">${matchLevel}</span>
                    <span class="log-class"><span class="clickable-text" data-type="class">${cleanClass}</span></span>
                    <span class="log-thread"><span class="clickable-text" data-type="thread">${cleanThread}</span></span>
                    <span class="log-message">${cleanMessage}</span>
                `;
                lineDiv.querySelector('.log-message').dataset.originalText = cleanMessage;
            } else {
                lineDiv.className = 'log-line log-config-content';
                lineDiv.innerHTML = `<span class="log-pin-placeholder"></span><span style="grid-column: 2 / -1; word-break: break-all;">${traceLine}</span>`;
                lineDiv.dataset.originalText = traceLine;
            }
        } else if (isStackLine) {
            lineDiv.className = 'log-line log-stacktrace';
            lineDiv.innerHTML = `<span class="log-pin-placeholder"></span><span style="grid-column: 2 / -1; word-break: break-all;">${traceLine}</span>`;
        } else {
            lineDiv.className = 'log-line log-detail';
            lineDiv.innerHTML = `<span class="log-pin-placeholder"></span><span style="grid-column: 2 / -1; word-break: break-all;">${traceLine}</span>`;
            lineDiv.dataset.originalText = traceLine;
        }

        contentDiv.appendChild(lineDiv);
    });

    toggleBtn.onclick = () => {
        const isHidden = contentDiv.style.display === 'none';
        contentDiv.style.display = isHidden ? 'block' : 'none';
        toggleBtn.textContent = isHidden
            ? `▼ Hide ${labelText.replace('Show ', '')} (${buffer.length} lines)`
            : `▶ ${labelText} (${buffer.length} lines)`;
    };

    container.appendChild(toggleBtn);
    container.appendChild(contentDiv);
    return container;
}

function createDOMElementFromLog(logObj) {
    if (logObj.type === 'raw') {
        const div = document.createElement('div');
        div.textContent = logObj.content;
        div.className = 'log-line log-raw';
        if (logObj.isBold) div.style.fontWeight = 'bold';
        return div;
    }
    
    if (logObj.type === 'stacktrace_only') {
        return createStackTraceBlock(logObj.stacktrace, '', logObj.label, logObj.isConfigMode);
    }
    
    const frag = document.createDocumentFragment();
    
    const div = document.createElement('div');
    div.className = 'log-line';
    div.dataset.signature = logObj.signature;
    div.classList.add(`log-type-${logObj.level.toLowerCase()}`);
    
    if (pinnedLogs.has(logObj.signature)) {
        div.classList.add('pinned');
    }
    
    let deltaHtml = '';
    if (logObj.deltaMs > 0) {
        let deltaText = '';
        if (logObj.deltaMs < 1000) {
            deltaText = `+${logObj.deltaMs}ms`;
        } else if (logObj.deltaMs < 60000) {
            deltaText = `+${(logObj.deltaMs / 1000).toFixed(2)}s`;
        } else {
            deltaText = `+${(logObj.deltaMs / 60000).toFixed(1)}m`;
        }
        deltaHtml = `<span class="log-delta">${deltaText}</span>`;
    }
    
    div.innerHTML = `
        <span class="log-pin" title="Fixar linha">📌</span>
        <span class="log-date">${logObj.date} ${deltaHtml}</span>
        <span class="log-level log-level-${logObj.level.toLowerCase()}">${logObj.level}</span>
        <span class="log-class"><span class="clickable-text" data-type="class">${logObj.className}</span></span>
        <span class="log-thread"><span class="clickable-text" data-type="thread">${logObj.thread}</span></span>
        <span class="log-message">${logObj.message}</span>
    `;
    div.querySelector('.log-message').dataset.originalText = logObj.message;
    
    if (logObj.count > 1) {
        const badge = document.createElement('span');
        badge.className = 'log-count';
        badge.textContent = `x${logObj.count}`;
        div.querySelector('.log-level').appendChild(badge);
    }
    
    frag.appendChild(div);
    
    if (logObj.stacktrace && logObj.stacktrace.length > 0) {
        const label = logObj.isConfigMode ? 'Show Configs' : null;
        frag.appendChild(createStackTraceBlock(logObj.stacktrace, logObj.level.toLowerCase(), label, logObj.isConfigMode));
    }
    
    return frag;
}

function openExportModal() {
    if (!filteredGroupedLogs || filteredGroupedLogs.length === 0) {
        alert("Não há logs filtrados para exportar.");
        return;
    }
    const modal = document.getElementById('exportModal');
    if (modal) modal.style.display = 'flex';
}

function closeExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) modal.style.display = 'none';
}

function executeExport() {
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'txt';
    let content = '';
    
    if (format === 'csv') {
        content = 'Data;Hora;Level;Classe;Thread;Mensagem\n';
        for (let i = filteredGroupedLogs.length - 1; i >= 0; i--) {
            const log = filteredGroupedLogs[i];
            if (log.type === 'raw' || log.type === 'stacktrace_only') continue;

            const date = log.date ? log.date.split(' ')[0] : '';
            const time = log.date ? log.date.split(' ')[1] || '' : '';
            const level = log.level || '';
            const className = (log.className || '').replace(/"/g, '""');
            const thread = (log.thread || '').replace(/"/g, '""');
            const message = (log.message || '').replace(/\r?\n|\r/g, ' ').replace(/"/g, '""');
            
            content += `"${date}";"${time}";"${level}";"${className}";"${thread}";"${message}"\n`;
        }
    } else if (format === 'json') {
        const exportArray = [];
        for (let i = filteredGroupedLogs.length - 1; i >= 0; i--) {
            exportArray.push(filteredGroupedLogs[i]);
        }
        content = JSON.stringify(exportArray, null, 2);
    } else {
        for (let i = filteredGroupedLogs.length - 1; i >= 0; i--) {
            const log = filteredGroupedLogs[i];
            if (log.type === 'raw') {
                content += log.content + '\n';
            } else if (log.type === 'stacktrace_only') {
                log.stacktrace.forEach(line => content += line + '\n');
            } else {
                content += `${log.date} ${log.level} [${log.className}] (${log.thread}) - ${log.message}\n`;
                if (log.stacktrace && log.stacktrace.length > 0) {
                    log.stacktrace.forEach(line => content += line + '\n');
                }
            }
        }
    }

    let mimeType = 'text/plain;charset=utf-8;';
    if (format === 'csv') mimeType = 'text/csv;charset=utf-8;';
    else if (format === 'json') mimeType = 'application/json;charset=utf-8;';

    const blob = new Blob([format === 'csv' ? '\uFEFF' + content : content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${format}`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    closeExportModal();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('closeExportModal')?.addEventListener('click', closeExportModal);
    document.getElementById('cancelExportBtn')?.addEventListener('click', closeExportModal);
    document.getElementById('confirmExportBtn')?.addEventListener('click', executeExport);
});


document.addEventListener('click', (e) => {
    const exportModal = document.getElementById('exportModal');
    if (exportModal && exportModal.style.display === 'flex' && e.target === exportModal) {
        closeExportModal();
    }
});

function addFileToList(file) {
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.log') || file.name.toLowerCase().endsWith('.txt') || file.type.startsWith('text/')) {
        currentFileId = getFileId(file);
        pinnedLogs.clear();
        
        const popup = document.getElementById('arquivoLogPopup');
        const loadingOverlay = document.getElementById('loadingOverlay');
        
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        
        setTimeout(() => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const content = e.target.result;
                const popupCard = popup.querySelector('.popupCard');
                const containerArquivoLog = document.querySelector('.containerArquivoLog');

                if (conteudoArquivoLog && popup) {
                    conteudoArquivoLog.innerHTML = '';
                    allGroupedLogs = [];
                    filteredGroupedLogs = [];
                    currentPage = 1;
                    if(searchInput) searchInput.value = '';
                    if(timeStartInput) timeStartInput.value = '';
                    if(timeEndInput) timeEndInput.value = '';
                    checkboxes.forEach(cb => cb.checked = false);

                    loadSettings(currentFileId);

                    const worker = new Worker('logWorker.js');
                    worker.postMessage({ content: content });
                    
                    worker.onmessage = function(msgEvent) {
                        if (msgEvent.data.status === 'done') {
                            const data = msgEvent.data.data;
                            allGroupedLogs = data.logs;
                            filteredGroupedLogs = [...allGroupedLogs];
                            
                            const statTotal = document.getElementById('statTotal');
                            const statErrors = document.getElementById('statErrors');
                            const statWarnings = document.getElementById('statWarnings');
                            const statDuration = document.getElementById('statDuration');
                            const logDashboard = document.getElementById('logDashboard');

                            if (statTotal) statTotal.textContent = data.stats.total;
                            if (statErrors) statErrors.textContent = data.stats.errors;
                            if (statWarnings) statWarnings.textContent = data.stats.warnings;

                            let durationStr = '--';
                            if (data.stats.durationMs > 0) {
                                const diffSec = Math.floor(data.stats.durationMs / 1000);
                                const hours = Math.floor(diffSec / 3600);
                                const mins = Math.floor((diffSec % 3600) / 60);
                                const secs = diffSec % 60;
                                durationStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                            }
                            if (statDuration) statDuration.textContent = durationStr;
                            if (logDashboard) logDashboard.style.display = 'flex';
                            
                            conteudoArquivoLog.onclick = function (ev) {
                                const line = ev.target.closest('.log-line');
                                if (line) {
                                    setActiveLine(line);
                                }
                            };
                            
                            const headerRow = document.createElement('div');
                            headerRow.className = 'log-header';
                            headerRow.innerHTML = `
                                <div class="header-cell" style="position: relative;">
                                    <button id="clearPins" title="Limpar todos os fixados" style="display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.9em; padding: 1px 4px; cursor: pointer; background: var(--error-color); color: white; border: none; border-radius: 3px;">✕</button>
                                </div>
                                <div class="header-cell">Date</div>
                                <div class="header-cell">Level</div>
                                <div class="header-cell">Class</div>
                                <div class="header-cell">Thread</div>
                                <div class="header-cell">Message</div>
                            `;
                            logHeaderElement = headerRow;
                            
                            filterLogs();
                            
                            updateClearPinsButton();
                            
                            if (loadingOverlay) loadingOverlay.style.display = 'none';
                            popup.style.display = 'flex';
                            requestAnimationFrame(() => {
                                if (popupCard) popupCard.classList.add('show');
                                if (containerArquivoLog) containerArquivoLog.scrollTop = 0;
                            });
                            
                            const closeBtn = document.getElementById('fechar');
                            if (closeBtn) closeBtn.onclick = closeModal;
                            const exportBtn = document.getElementById('exportar');
                            if (exportBtn) exportBtn.onclick = openExportModal;
                            
                            const clearPinsBtn = document.getElementById('clearPins');
                            if (clearPinsBtn) {
                                clearPinsBtn.onclick = () => {
                                    if (pinnedLogs.size === 0) return;
                                    if (confirm(`Desmarcar todos os ${pinnedLogs.size} logs fixados?`)) {
                                        pinnedLogs.clear();
                                        const allPinnedElements = document.querySelectorAll('.log-line.pinned');
                                        allPinnedElements.forEach(el => el.classList.remove('pinned'));
                                        const pinnedCheckbox = document.getElementById('pinnedOnly');
                                        if (pinnedCheckbox && pinnedCheckbox.checked) {
                                            pinnedCheckbox.checked = false;
                                            filterLogs();
                                        }
                                        clearPinsBtn.style.display = 'none';
                                        debouncedSaveSettings();
                                    }
                                };
                            }
                            const background = document.getElementById('listaBackgroud');
                            if (background) background.onclick = closeModal;
                        }
                    };
                    worker.onerror = function(err) {
                        alert("Erro no processamento do arquivo: " + err.message);
                        if (loadingOverlay) loadingOverlay.style.display = 'none';
                    };
                }
            };
            reader.onerror = function () {
                alert("Erro ao ler o arquivo");
                if (loadingOverlay) loadingOverlay.style.display = 'none';
            };
            reader.readAsText(file);
        }, 100);
    } else {
        alert("Por favor, envie um arquivo .log ou de texto.");
    }
}

function updateClearPinsButton() {
    const clearPinsBtn = document.getElementById('clearPins');
    if (clearPinsBtn) {
        clearPinsBtn.style.display = pinnedLogs.size > 0 ? 'block' : 'none';
    }
}

function closeModal() {
    const popup = document.getElementById('arquivoLogPopup');
    const popupCard = popup ? popup.querySelector('.popupCard') : null;
    const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');

    if (popupCard) popupCard.classList.remove('show');
    if (popup) {
        setTimeout(() => {
            popup.style.display = 'none';
            if (conteudoArquivoLog) conteudoArquivoLog.textContent = '';
        }, 100);
        if (typeof saveSettings === 'function') {
            saveSettings();
        }
    }
}

const btnVoltar = document.getElementById('btnVoltar');
if (btnVoltar) {
    btnVoltar.addEventListener('click', () => {
        window.location.href = '/';
    });
}

function parseLogDate(dateStr) {
    const isoStr = dateStr.replace(' ', 'T').replace(',', '.');
    return new Date(isoStr);
}

function highlightSearchTerm(element, term) {
    if (!element) return;
    const messageSpan = element.querySelector('.log-message');
    const target = messageSpan || element;
    if (!target.dataset.originalText) return;

    if (!term || term.trim() === '') {
        target.textContent = target.dataset.originalText;
        return;
    }

    let useRegex = false;
    let regexVal = term.trim();

    if (regexVal.length > 2 && regexVal.startsWith('/') && regexVal.endsWith('/')) {
        useRegex = true;
        regexVal = regexVal.slice(1, -1);
    }

    const text = target.dataset.originalText;
    const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

    let regex;
    if (useRegex) {
        try {
            regex = new RegExp(`(${regexVal})`, 'gi');
        } catch (e) {
            target.innerHTML = safeText;
            return;
        }
    } else {
        const tokens = term.trim().split(/\s+/).filter(t => t.length > 0);
        const positiveTokens = tokens.filter(t => !t.startsWith('-'));
        if (positiveTokens.length === 0) {
            target.textContent = target.dataset.originalText;
            return;
        }
        const escapedTokens = positiveTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
    }

    const newHtml = safeText.replace(regex, '<mark class="highlight">$1</mark>');
    target.innerHTML = newHtml;
}

function renderPage(page) {
    const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
    const containerArquivoLog = document.querySelector('.containerArquivoLog');

    if (!filteredGroupedLogs.length) {
        conteudoArquivoLog.innerHTML = '';
        const controls = document.getElementById('pagination-controls');
        if (controls) controls.style.display = 'none';

        let noResultsMsg = document.getElementById('no-results-msg');
        if (!noResultsMsg) {
            noResultsMsg = document.createElement('div');
            noResultsMsg.id = 'no-results-msg';
            noResultsMsg.textContent = 'Nenhum log encontrado para este filtro.';
            noResultsMsg.className = 'no-results-message';
            conteudoArquivoLog.appendChild(noResultsMsg);
        }
        noResultsMsg.style.display = 'block';
        return;
    }

    const noResults = document.getElementById('no-results-msg');
    if (noResults) noResults.style.display = 'none';

    const startIndex = (page - 1) * logsPerPage;
    const endIndex = Math.min(startIndex + logsPerPage, filteredGroupedLogs.length);
    const pageItems = filteredGroupedLogs.slice(startIndex, endIndex);

    conteudoArquivoLog.innerHTML = '';
    if (logHeaderElement) conteudoArquivoLog.appendChild(logHeaderElement);

    const fragment = document.createDocumentFragment();
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.trim() : '';

    pageItems.forEach(logObj => {
        const elFrag = createDOMElementFromLog(logObj);
        const children = Array.from(elFrag.children);
        children.forEach(el => {
            highlightSearchTerm(el, searchTerm);
            fragment.appendChild(el);
        });
    });
    conteudoArquivoLog.appendChild(fragment);

    updatePaginationControls();

    const existingActive = conteudoArquivoLog.querySelector('.log-line.active, .stack-trace-container.active');
    if (existingActive) {
        requestAnimationFrame(() => {
            existingActive.scrollIntoView({ block: 'center', behavior: 'auto' });
        });
    } else {
        if (containerArquivoLog) containerArquivoLog.scrollTop = 0;
        const firstLine = conteudoArquivoLog.querySelector('.log-line:not(.log-detail):not(.log-stacktrace), .stack-trace-container');
        if (firstLine) {
            setActiveLine(firstLine);
        }
    }
}

function updatePaginationControls() {
    const controls = document.getElementById('pagination-controls');
    if (!controls) return;

    const totalPages = Math.ceil(filteredGroupedLogs.length / logsPerPage);

    controls.innerHTML = '';
    controls.style.display = 'flex';

    const limitSelect = document.createElement('select');
    limitSelect.innerHTML = `
        <option value="500">500 itens</option>
        <option value="1000">1000 itens</option>
        <option value="2000">2000 itens</option>
        <option value="9999999">Sem limite</option>
    `;
    limitSelect.value = logsPerPage;
    limitSelect.onchange = (e) => {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        
        setTimeout(() => {
            logsPerPage = parseInt(e.target.value, 10);
            currentPage = 1;
            debouncedSaveSettings();
            renderPage(1);
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }, 50);
    };

    controls.appendChild(limitSelect);

    if (totalPages <= 1 && logsPerPage !== 9999999 && filteredGroupedLogs.length <= 500) {
        if (filteredGroupedLogs.length === 0) {
            controls.style.display = 'none';
        }
        return;
    }

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '◀ Anterior';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage(currentPage);
        }
    };

    const info = document.createElement('span');
    info.textContent = `Página ${currentPage} de ${Math.max(1, totalPages)} (${filteredGroupedLogs.length} logs)`;

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Próximo ▶';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderPage(currentPage);
        }
    };

    controls.appendChild(prevBtn);
    controls.appendChild(info);
    controls.appendChild(nextBtn);
}

function filterLogs() {
    const searchInput = document.getElementById('searchInput');
    const timeStartInput = document.getElementById('timeStart');
    const timeEndInput = document.getElementById('timeEnd');
    const checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]');

    const searchInputVal = searchInput ? searchInput.value : '';
    const trimmedVal = searchInputVal.trim();

    let regex = null;
    let searchTokens = [];
    let useRegex = false;

    if (trimmedVal.length > 2 && trimmedVal.startsWith('/') && trimmedVal.endsWith('/')) {
        useRegex = true;
        const pattern = trimmedVal.slice(1, -1);
        try {
            regex = new RegExp(pattern, 'i');
            if (searchInput) searchInput.classList.remove('error');
        } catch (e) {
            if (searchInput) searchInput.classList.add('error');
            regex = /$.^/;
        }
    } else {
        if (searchInput) searchInput.classList.remove('error');
        const lowerVal = searchInputVal.toLowerCase().trim();
        searchTokens = lowerVal.split(/\s+/).filter(t => t.length > 0);
    }

    const selectedLevels = [];
    let pinnedOnlyFilter = false;

    checkboxes.forEach(cb => {
        if (cb.checked) {
            if (cb.id === 'pinnedOnly') {
                pinnedOnlyFilter = true;
            } else if (cb.name === 'filterLevel') {
                selectedLevels.push(cb.value.toLowerCase());
            }
        }
    });

    if (filteredGroupedLogs) {
        clearActiveLines();
    }

    filteredGroupedLogs = [];
    let visibleCount = 0;
    let visibleErrors = 0;
    let visibleWarnings = 0;
    let oldestVisibleDate = null;
    let lastVisibleDate = null;

    allGroupedLogs.forEach(logObj => {
        if (pinnedOnlyFilter) {
            if (!logObj.signature || !pinnedLogs.has(logObj.signature)) return;
        }

        let levelMatch = true;
        if (selectedLevels.length > 0) {
            if (logObj.level) {
                const levelText = logObj.level.toLowerCase().trim();
                levelMatch = selectedLevels.some(selected => levelText.startsWith(selected));
            } else {
                levelMatch = false;
            }
        }

        let textMatch = true;
        let searchableText = "";
        if (logObj.type === 'raw') searchableText = logObj.content.toLowerCase();
        else if (logObj.type === 'stacktrace_only') searchableText = logObj.stacktrace.join(' ').toLowerCase();
        else searchableText = `${logObj.date} ${logObj.level} ${logObj.className} ${logObj.thread} ${logObj.message} ${logObj.stacktrace ? logObj.stacktrace.join(' ') : ''}`.toLowerCase();
        
        if (useRegex) {
            if (regex) {
                textMatch = regex.test(searchableText);
            }
        } else {
            textMatch = searchTokens.length === 0 || searchTokens.every(token => {
                if (token.startsWith('-') && token.length > 1) {
                    return !searchableText.includes(token.substring(1));
                }
                return searchableText.includes(token);
            });
        }

        let timeMatch = true;
        if (logObj.date) {
            const timePart = logObj.date.split(' ')[1].split(',')[0];
            let startTime = timeStartInput ? timeStartInput.value : '';
            let endTime = timeEndInput ? timeEndInput.value : '';
            if (startTime && startTime.length === 5) startTime += ':00';
            if (endTime && endTime.length === 5) endTime += ':59';
            if (startTime && timePart < startTime) timeMatch = false;
            if (endTime && timePart > endTime) timeMatch = false;
        }

        if (levelMatch && textMatch && timeMatch) {
            if (logObj.timestamp) {
                if (!oldestVisibleDate || logObj.timestamp < oldestVisibleDate) oldestVisibleDate = logObj.timestamp;
                if (!lastVisibleDate || logObj.timestamp > lastVisibleDate) lastVisibleDate = logObj.timestamp;
            }

            filteredGroupedLogs.push(logObj);
            visibleCount++;

            if (logObj.level) {
                const levelText = logObj.level.toLowerCase().trim();
                if (levelText.startsWith('error')) visibleErrors++;
                if (levelText.startsWith('warn')) visibleWarnings++;
            }
        }
    });

    const statTotal = document.getElementById('statTotal');
    const statErrors = document.getElementById('statErrors');
    const statWarnings = document.getElementById('statWarnings');
    const statDuration = document.getElementById('statDuration');

    if (statTotal) statTotal.textContent = visibleCount;
    if (statErrors) statErrors.textContent = visibleErrors;
    if (statWarnings) statWarnings.textContent = visibleWarnings;

    let durationStr = '--';
    if (oldestVisibleDate && lastVisibleDate) {
        const diffMs = lastVisibleDate - oldestVisibleDate;
        const diffSec = Math.floor(diffMs / 1000);
        const hours = Math.floor(diffSec / 3600);
        const mins = Math.floor((diffSec % 3600) / 60);
        const secs = diffSec % 60;
        durationStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    if (statDuration) statDuration.textContent = durationStr;

    currentPage = 1;
    renderPage(currentPage);
}

function togglePin(line) {
    if (!line || !line.dataset.signature) return;
    const sig = line.dataset.signature;

    if (pinnedLogs.has(sig)) {
        pinnedLogs.delete(sig);
        line.classList.remove('pinned');

        const pinnedCheckbox = document.getElementById('pinnedOnly');
        if (pinnedCheckbox && pinnedCheckbox.checked) {
            filterLogs();
        }
    } else {
        pinnedLogs.add(sig);
        line.classList.add('pinned');
    }
    updateClearPinsButton();
    debouncedSaveSettings();
}

document.addEventListener('keydown', function (e) {
    const popup = document.getElementById('arquivoLogPopup');
    if (!popup || popup.style.display === 'none') return;

    if (e.key === 'p' || e.key === 'P') {
        const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
        const activeLine = conteudoArquivoLog.querySelector('.log-line.active');
        if (activeLine) togglePin(activeLine);
    } else if (e.key === '/') {
        if (document.activeElement.tagName === 'INPUT') return;
        e.preventDefault();
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus();
        }
    } else if (e.key === 'Home') {
        if (document.activeElement.tagName === 'INPUT') return;
        e.preventDefault();
        currentPage = 1;
        renderPage(1);
    } else if (e.key === 'End') {
        if (document.activeElement.tagName === 'INPUT') return;
        e.preventDefault();
        const totalPages = Math.ceil(filteredGroupedLogs.length / logsPerPage);
        if (totalPages > 0) {
            currentPage = totalPages;
            renderPage(currentPage);
        }
    } else if (e.key === 'Escape') {
        const exportModal = document.getElementById('exportModal');
        if (exportModal && exportModal.style.display === 'flex') {
            closeExportModal();
        } else {
            closeModal();
        }
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (document.activeElement.tagName === 'INPUT') return;
        const totalPages = Math.ceil(filteredGroupedLogs.length / logsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderPage(currentPage);
        }
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (document.activeElement.tagName === 'INPUT') return;
        if (currentPage > 1) {
            currentPage--;
            renderPage(currentPage);
        }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (document.activeElement.tagName === 'INPUT') return;
        e.preventDefault();
        const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
        const containerArquivoLog = document.querySelector('.containerArquivoLog');

        const candidates = Array.from(conteudoArquivoLog.querySelectorAll('.log-line, .stack-trace-container'));
        const allVisibleLines = candidates.filter(el => el.offsetParent !== null);

        if (allVisibleLines.length === 0) return;

        const currentActive = conteudoArquivoLog.querySelector('.log-line.active, .stack-trace-container.active');
        let nextIndex = 0;

        if (currentActive) {
            const currentIndex = allVisibleLines.indexOf(currentActive);
            const step = e.shiftKey ? 10 : 1;

            if (e.key === 'ArrowDown') {
                if (e.shiftKey) {
                    nextIndex = Math.min(currentIndex + step, allVisibleLines.length - 1);
                } else {
                    nextIndex = currentIndex + 1;
                    if (nextIndex >= allVisibleLines.length) nextIndex = 0;
                }
            } else {
                if (e.shiftKey) {
                    nextIndex = Math.max(currentIndex - step, 0);
                } else {
                    nextIndex = currentIndex - 1;
                    if (nextIndex < 0) nextIndex = allVisibleLines.length - 1;
                }
            }
        } else {
            if (e.key === 'ArrowDown') nextIndex = 0;
            else nextIndex = allVisibleLines.length - 1;
        }

        const nextLine = allVisibleLines[nextIndex];
        setActiveLine(nextLine);

        if (nextIndex === 0 && currentPage === 1) {
            if (containerArquivoLog) containerArquivoLog.scrollTop = 0;
        } else {
            if (nextLine) nextLine.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
    } else if (e.key === 'Enter') {
        const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');

        if (e.shiftKey) {

            const allToggles = conteudoArquivoLog.querySelectorAll('.stack-trace-toggle');
            let anyOpen = false;
            let count = 0;

            allToggles.forEach(btn => {
                count++;
                if (btn.classList.contains('rotated')) {
                    anyOpen = true;
                }
            });

            if (count === 0) return;

            const targetStateOpen = !anyOpen;
            globalExpandState = targetStateOpen;

            allToggles.forEach(btn => {
                const isRotated = btn.classList.contains('rotated');
                if (targetStateOpen && !isRotated) btn.click();
                if (!targetStateOpen && isRotated) btn.click();
            });

        } else {
            const currentActive = conteudoArquivoLog.querySelector('.log-line.active, .stack-trace-container.active');
            if (currentActive) {
                const toggleBtn = currentActive.querySelector('.stack-trace-toggle');
                if (toggleBtn) toggleBtn.click();
            }
        }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
        const currentActive = conteudoArquivoLog.querySelector('.log-line.active');
        if (currentActive) {
            const text = currentActive.dataset.originalText || currentActive.textContent;
            navigator.clipboard.writeText(text).then(() => {
                const originalBg = currentActive.style.backgroundColor;
                currentActive.style.backgroundColor = 'var(--accent-color)';
                setTimeout(() => {
                    currentActive.style.backgroundColor = originalBg;
                }, 200);
            }).catch(err => console.error('Failed to copy', err));
        }
    } else if (['i', 'w', 'e', 'd', 'f'].includes(e.key.toLowerCase())) {
        if (document.activeElement.tagName === 'INPUT') return;

        let checkboxId = '';
        if (e.key.toLowerCase() === 'i') checkboxId = 'info';
        if (e.key.toLowerCase() === 'w') checkboxId = 'warn';
        if (e.key.toLowerCase() === 'e') checkboxId = 'error';
        if (e.key.toLowerCase() === 'd') checkboxId = 'debug';
        if (e.key.toLowerCase() === 'f') checkboxId = 'pinnedOnly';

        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            filterLogs();
            debouncedSaveSettings();
        }
    }
});

if (searchInput) searchInput.addEventListener('input', () => { filterLogs(); debouncedSaveSettings(); });
if (timeStartInput) timeStartInput.addEventListener('input', () => { filterLogs(); debouncedSaveSettings(); });
if (timeEndInput) timeEndInput.addEventListener('input', () => { filterLogs(); debouncedSaveSettings(); });

if (checkboxes) {
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => { filterLogs(); debouncedSaveSettings(); });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(console.error);
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
                deferredPrompt = null;
            }
        });
    }
});

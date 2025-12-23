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
const pinnedLogs = new Set();
let allGroupedLogs = [];
let filteredGroupedLogs = [];
let logHeaderElement = null;
let currentPage = 1;
const logsPerPage = 500;
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
    console.log('[DEBUG] Generated File ID:', id);
    return id;
}

function saveSettings() {
    console.log('[DEBUG] Saving settings...', currentFileId, 'Pins:', pinnedLogs.size);
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
            timeEnd: document.getElementById('timeEnd')?.value || ''
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
    console.log('[DEBUG] Loading Settings for:', fileId, 'Found:', !!saved);
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

function addFileToList(file) {
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.log') || file.name.toLowerCase().endsWith('.txt') || file.type.startsWith('text/')) {
        currentFileId = getFileId(file);
        pinnedLogs.clear();
        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;
            const popup = document.getElementById('arquivoLogPopup');
            const popupCard = popup.querySelector('.popupCard');
            const containerArquivoLog = document.querySelector('.containerArquivoLog');

            if (conteudoArquivoLog && popup) {
                conteudoArquivoLog.innerHTML = '';
                allGroupedLogs = [];
                filteredGroupedLogs = [];
                currentPage = 1;
                searchInput.value = '';
                timeStartInput.value = '';
                timeEndInput.value = '';
                checkboxes.forEach(cb => cb.checked = false);

                loadSettings(currentFileId);

                const lines = content.split('\n');
                const fragment = document.createDocumentFragment();

                function createStackTraceBlock(buffer, level, customLabel = null, isConfigMode = false) {
                    const container = document.createElement('div');
                    container.className = 'stack-trace-container';
                    if (level) {
                        container.dataset.level = level;
                    }

                    const labelText = customLabel || 'Show Details';

                    const toggleBtn = document.createElement('button');
                    toggleBtn.className = 'stack-trace-toggle';
                    toggleBtn.textContent = `▶ ${labelText} (${buffer.length} lines)`;

                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'stack-trace-content';
                    contentDiv.style.display = 'none';

                    [...buffer].reverse().forEach(traceLine => {
                        const lineDiv = document.createElement('div');
                        const isStackLine = traceLine.trim().startsWith('at ') || traceLine.trim().startsWith('...');

                        if (isConfigMode) {
                            lineDiv.className = 'log-line';

                            const regex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3})\s+((?:INFO|WARN|ERROR|DEBUG|FATAL)(?:x\d+)?)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$/;
                            const match = traceLine.match(regex);


                            if (match) {
                                const [fullMatch, date, rawLevel, className, thread, message] = match;

                                const level = rawLevel.replace(/x\d+$/, '').trim();
                                let cleanClass = className.replace(/^\[|\]$/g, '');
                                let cleanThread = thread.replace(/^\(|\)$/g, '');
                                let cleanMessage = message.replace(/^-\s+/, '');

                                lineDiv.innerHTML = `
                                    <span class="log-pin-placeholder"></span>
                                    <span class="log-date">${date}</span>
                                    <span class="log-level log-level-${level.toLowerCase()}">${level}</span>
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

                let lastLog = null;
                let pendingHeader = null;
                let pendingBuffer = [];
                let countTotal = 0;
                let countError = 0;
                let countWarn = 0;
                let oldestDate = null;
                let newestDate = null;

                let previousUniqueLogDate = null;

                function processPendingLog() {
                    if (!pendingHeader) return;

                    countTotal++;
                    let { date, level, className, thread, message } = pendingHeader;

                    className = className.replace(/^\[|\]$/g, '');
                    thread = thread.replace(/^\(|\)$/g, '');
                    message = message.replace(/^-\s+/, '');

                    if (level === 'ERROR') countError++;
                    if (level === 'WARN') countWarn++;

                    if (!oldestDate) oldestDate = parseLogDate(date);
                    newestDate = parseLogDate(date);

                    const bufferContent = pendingBuffer.join('\n');
                    const signature = `${date}|${level}|${className}|${thread}|${message}|${bufferContent}`;

                    if (lastLog && lastLog.signature === signature) {
                        lastLog.count++;
                        if (!lastLog.countBadge) {
                            const badge = document.createElement('span');
                            badge.className = 'log-count';
                            badge.textContent = `x${lastLog.count}`;
                            const levelSpan = lastLog.element.querySelector('.log-level');
                            if (levelSpan) {
                                levelSpan.appendChild(badge);
                            }
                            lastLog.countBadge = badge;
                        } else {
                            lastLog.countBadge.textContent = `x${lastLog.count}`;
                        }
                    } else {
                        let deltaHtml = '';
                        const currentObjDate = parseLogDate(date);

                        if (previousUniqueLogDate) {
                            const diff = currentObjDate - previousUniqueLogDate;
                            if (diff > 0) {
                                let deltaText = '';
                                if (diff < 1000) {
                                    deltaText = `+${diff}ms`;
                                } else if (diff < 60000) {
                                    deltaText = `+${(diff / 1000).toFixed(2)}s`;
                                } else {
                                    deltaText = `+${(diff / 60000).toFixed(1)}m`;
                                }
                                deltaHtml = `<span class="log-delta">${deltaText}</span>`;
                            }
                        }

                        previousUniqueLogDate = currentObjDate;

                        const div = document.createElement('div');
                        div.className = 'log-line';
                        const isConfig = message.includes('=============LOG CONFIGS=========');

                        div.innerHTML = `
                            <span class="log-pin" title="Fixar linha">📌</span>
                            <span class="log-date">${date} ${deltaHtml}</span>
                            <span class="log-level log-level-${level.toLowerCase()}">${level}</span>
                            <span class="log-class"><span class="clickable-text" data-type="class">${className}</span></span>
                            <span class="log-thread"><span class="clickable-text" data-type="thread">${thread}</span></span>
                            <span class="log-message">${message}</span>
                        `;
                        div.querySelector('.log-message').dataset.originalText = message;
                        div.dataset.signature = signature;
                        div.classList.add(`log-type-${level.toLowerCase()}`);

                        if (pinnedLogs.has(signature)) {
                            div.classList.add('pinned');
                        }

                        fragment.appendChild(div);

                        if (pendingBuffer.length > 0) {
                            const label = isConfig ? 'Show Configs' : null;
                            fragment.appendChild(createStackTraceBlock(pendingBuffer, level.toLowerCase(), label, isConfig));
                        }

                        lastLog = {
                            signature: signature,
                            count: 1,
                            element: div,
                            countBadge: null
                        };
                    }

                    pendingBuffer = [];
                }

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
                fragment.appendChild(headerRow);

                let configBuffer = [];
                let inConfigBlock = false;

                lines.forEach(line => {
                    line = line.replace('\r', '');

                    const regex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3})\s+((?:INFO|WARN|ERROR|DEBUG|FATAL)(?:x\d+)?)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$/;
                    const match = line.match(regex);

                    if (match) {
                        const [fullMatch, date, rawLevel, className, thread, message] = match;
                        const level = rawLevel.replace(/x\d+$/, '').trim();

                        if (message.includes('=============LOG CONFIGS=========')) {
                            if (inConfigBlock && configBuffer.length > 0) {
                                fragment.appendChild(createStackTraceBlock(configBuffer, '', 'Show Configs', true));
                                configBuffer = [];
                            }
                            inConfigBlock = true;
                            processPendingLog();

                            pendingHeader = { date, level, className, thread, message };
                            pendingBuffer = [];

                            processPendingLog();
                            pendingHeader = null;

                            return;
                        }

                        if (inConfigBlock && message.match(/^={10,}$/)) {
                            configBuffer.push(line);
                            fragment.appendChild(createStackTraceBlock(configBuffer, '', 'Show Configs', true));
                            configBuffer = [];
                            inConfigBlock = false;
                            return;
                        }

                        if (inConfigBlock) {
                            configBuffer.push(line);
                        } else {
                            processPendingLog();
                            pendingHeader = { date, level, className, thread, message };
                            pendingBuffer = [];
                        }
                    } else {
                        if (line.includes('=============LOG CONFIGS=========')) {
                            if (inConfigBlock && configBuffer.length > 0) {
                                fragment.appendChild(createStackTraceBlock(configBuffer, '', 'Show Configs', true));
                                configBuffer = [];
                            }
                            inConfigBlock = true;
                            const div = document.createElement('div');
                            div.textContent = line;
                            div.classList.add('log-line', 'log-raw');
                            div.style.fontWeight = 'bold';
                            fragment.appendChild(div);
                            return;
                        }

                        if (inConfigBlock && line.trim() === '============') {
                            configBuffer.push(line);
                            fragment.appendChild(createStackTraceBlock(configBuffer, '', 'Show Configs', true));
                            configBuffer = [];
                            inConfigBlock = false;
                            return;
                        }

                        if (inConfigBlock) {
                            configBuffer.push(line);
                        } else {
                            if (pendingHeader) {
                                if (line.trim().length > 0) {
                                    pendingBuffer.push(line);
                                }
                            } else {
                                if (line.trim().length > 0) {
                                    const div = document.createElement('div');
                                    div.textContent = line;
                                    div.classList.add('log-line', 'log-raw');
                                    fragment.appendChild(div);
                                    lastLog = null;
                                }
                            }
                        }
                    }
                });

                if (inConfigBlock && configBuffer.length > 0) {
                    fragment.appendChild(createStackTraceBlock(configBuffer, '', 'Show Configs', true));
                }
                processPendingLog();

                const statTotal = document.getElementById('statTotal');
                const statErrors = document.getElementById('statErrors');
                const statWarnings = document.getElementById('statWarnings');
                const statDuration = document.getElementById('statDuration');
                const logDashboard = document.getElementById('logDashboard');

                if (statTotal) statTotal.textContent = countTotal;
                if (statErrors) statErrors.textContent = countError;
                if (statWarnings) statWarnings.textContent = countWarn;

                let durationStr = '--';
                if (oldestDate && newestDate) {
                    const diffMs = newestDate - oldestDate;
                    const diffSec = Math.floor(diffMs / 1000);
                    const hours = Math.floor(diffSec / 3600);
                    const mins = Math.floor((diffSec % 3600) / 60);
                    const secs = diffSec % 60;
                    durationStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                }
                if (statDuration) statDuration.textContent = durationStr;
                if (logDashboard) logDashboard.style.display = 'flex';

                conteudoArquivoLog.onclick = function (e) {
                    const line = e.target.closest('.log-line');
                    if (line) {
                        setActiveLine(line);
                    }
                };

                const elements = Array.from(fragment.children);
                const header = elements.find(el => el.classList.contains('log-header'));

                const groupedLogs = [];
                let currentGroup = [];

                elements.forEach(el => {
                    if (el.classList.contains('log-header')) return;

                    if (el.classList.contains('log-line') && !el.classList.contains('log-stacktrace') && !el.classList.contains('log-detail') && !el.classList.contains('log-config-content')) {
                        if (currentGroup.length > 0) groupedLogs.push(currentGroup);
                        currentGroup = [el];
                    } else {
                        currentGroup.push(el);
                    }
                });
                if (currentGroup.length > 0) groupedLogs.push(currentGroup);

                if (header) {
                    logHeaderElement = header;
                }

                allGroupedLogs = groupedLogs.reverse().map(group => group.reverse());
                filteredGroupedLogs = [...allGroupedLogs];

                filterLogs();

                renderPage(1);
                updateClearPinsButton();


                popup.style.display = 'flex';
                requestAnimationFrame(() => {
                    if (popupCard) popupCard.classList.add('show');
                    const container = document.querySelector('.containerArquivoLog');
                    if (container) container.scrollTop = 0;
                });

                function exportFilteredLogs() {
                    if (!filteredGroupedLogs || filteredGroupedLogs.length === 0) {
                        alert("Não há logs filtrados para exportar.");
                        return;
                    }

                    let content = '';
                    for (let g = filteredGroupedLogs.length - 1; g >= 0; g--) {
                        const group = filteredGroupedLogs[g];
                        for (let i = group.length - 1; i >= 0; i--) {
                            const el = group[i];

                            if (el.classList.contains('stack-trace-container')) {
                                const innerLines = Array.from(el.querySelectorAll('.stack-trace-content .log-line')).reverse();

                                innerLines.forEach(inner => {
                                    let innerText = '';
                                    if (inner.querySelector('.log-date')) {
                                        const date = inner.querySelector('.log-date').textContent.split('+')[0].trim();
                                        const level = inner.querySelector('.log-level').textContent;
                                        const className = inner.querySelector('.log-class').textContent;
                                        const thread = inner.querySelector('.log-thread').textContent;
                                        const message = inner.querySelector('.log-message').dataset.originalText || inner.querySelector('.log-message').textContent;
                                        innerText = `${date} ${level} [${className}] (${thread}) - ${message}`;
                                    } else {
                                        innerText = inner.dataset.originalText || inner.textContent;
                                    }
                                    content += innerText + '\n';
                                });
                                continue;
                            }

                            let lineText = '';

                            if (el.classList.contains('log-line') && !el.classList.contains('log-detail') && !el.classList.contains('log-stacktrace') && !el.classList.contains('log-config-content') && !el.classList.contains('log-raw')) {
                                const date = el.querySelector('.log-date').textContent.split('+')[0].trim();
                                const level = el.querySelector('.log-level').textContent;
                                const className = el.querySelector('.log-class').textContent;
                                const thread = el.querySelector('.log-thread').textContent;
                                const message = el.querySelector('.log-message').dataset.originalText || el.querySelector('.log-message').textContent;

                                lineText = `${date} ${level} [${className}] (${thread}) - ${message}`;
                            } else {
                                lineText = el.dataset.originalText || el.textContent;
                            }

                            content += lineText + '\n';
                        }
                    }

                    const blob = new Blob([content], { type: 'text/plain' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `logs-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                }

                const closeBtn = document.getElementById('fechar');
                if (closeBtn) {
                    closeBtn.onclick = closeModal;
                }

                const exportBtn = document.getElementById('exportar');
                if (exportBtn) {
                    exportBtn.onclick = exportFilteredLogs;
                }

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
                if (background) {
                    background.onclick = closeModal;
                }
            }
        };
        reader.onerror = function () {
            alert("Erro ao ler o arquivo");
        };
        reader.readAsText(file);
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
        window.location.href = '../index.html';
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

    pageItems.forEach(group => {
        group.forEach(el => {
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

    if (totalPages <= 1) {
        controls.style.display = 'none';
        return;
    }
    controls.innerHTML = '';
    controls.style.display = 'flex';

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
    info.textContent = `Página ${currentPage} de ${totalPages} (${filteredGroupedLogs.length} logs)`;

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Próximo ▶';
    nextBtn.disabled = currentPage === totalPages;
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

    allGroupedLogs.forEach(group => {
        const logLine = group[group.length - 1];
        if (!logLine || !logLine.classList.contains('log-line')) return;

        if (pinnedOnlyFilter) {
            const hasPinned = logLine.dataset.signature && pinnedLogs.has(logLine.dataset.signature);
            if (!hasPinned) return;
        }

        const text = logLine.textContent;
        const lowerText = text.toLowerCase();
        const levelSpan = logLine.querySelector('.log-level');

        let levelMatch = true;
        if (selectedLevels.length > 0) {
            if (levelSpan) {
                const levelText = levelSpan.textContent.toLowerCase().trim();
                levelMatch = selectedLevels.some(selected => levelText.startsWith(selected));
            } else {
                levelMatch = false;
            }
        }

        let textMatch = true;
        if (useRegex) {
            if (regex) {
                textMatch = regex.test(text);
            }
        } else {
            textMatch = searchTokens.length === 0 || searchTokens.every(token => {
                if (token.startsWith('-') && token.length > 1) {
                    return !lowerText.includes(token.substring(1));
                }
                return lowerText.includes(token);
            });
        }

        let timeMatch = true;
        const dateSpan = logLine.querySelector('.log-date');
        if (dateSpan) {
            const dateText = dateSpan.textContent.trim().split(' ').slice(0, 2).join(' ');
            const timePart = dateText.split(' ')[1].split(',')[0];

            let startTime = timeStartInput ? timeStartInput.value : '';
            let endTime = timeEndInput ? timeEndInput.value : '';

            if (startTime && startTime.length === 5) startTime += ':00';
            if (endTime && endTime.length === 5) endTime += ':59';

            if (startTime && timePart < startTime) timeMatch = false;
            if (endTime && timePart > endTime) timeMatch = false;
        }

        if (levelMatch && textMatch && timeMatch) {
            if (logLine.querySelector('.log-date')) {
                const dateText = logLine.querySelector('.log-date').textContent.trim().split(' ').slice(0, 2).join(' ');
                const logDate = parseLogDate(dateText);
                if (!oldestVisibleDate || logDate < oldestVisibleDate) oldestVisibleDate = logDate;
                if (!lastVisibleDate || logDate > lastVisibleDate) lastVisibleDate = logDate;
            }

            filteredGroupedLogs.push(group);
            visibleCount++;

            if (levelSpan) {
                const levelText = levelSpan.textContent.toLowerCase().trim();
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
        closeModal();
    } else if (e.key === 'ArrowRight') {
        if (document.activeElement.tagName === 'INPUT') return;
        const totalPages = Math.ceil(filteredGroupedLogs.length / logsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderPage(currentPage);
        }
    } else if (e.key === 'ArrowLeft') {
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
            if (e.key === 'ArrowDown') {
                nextIndex = Math.min(currentIndex + 1, allVisibleLines.length - 1);
            } else {
                nextIndex = Math.max(currentIndex - 1, 0);
            }
        } else {
            if (e.key === 'ArrowDown') nextIndex = 0;
            else nextIndex = allVisibleLines.length - 1;
        }

        setActiveLine(allVisibleLines[nextIndex]);

        if (nextIndex === 0 && currentPage === 1) {
            if (containerArquivoLog) containerArquivoLog.scrollTop = 0;
        } else {
            nextLine.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
    } else if (e.key === 'Enter') {
        const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
        const currentActive = conteudoArquivoLog.querySelector('.log-line.active, .stack-trace-container.active');
        if (currentActive) {
            const toggleBtn = currentActive.querySelector('.stack-trace-toggle');
            if (toggleBtn) toggleBtn.click();
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

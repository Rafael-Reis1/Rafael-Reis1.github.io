const WORKER_SCRIPT_URL = 'logWorker.js?v=1611261852';
const LOG_FILE_NAME_REGEX = /\.(?:log|txt|out|err|trace)(?:\.[^.]+)?$/i;
const BLOCKED_BINARY_REGEX = /\.(?:gz|zip|rar|7z|tar|png|jpe?g|gif|webp|svg|ico|pdf|exe|dll|jar|war|ear|class|mp3|mp4|avi|mov)$/i;
const RENDER_CHUNK_SIZE = 400;
const LARGE_ALL_CONFIRM_THRESHOLD = 15000;

let activeWorker = null;
let currentFileId = null;
let currentLoadedLabel = '';
let globalExpandState = false;
let sortOrder = 'desc'; // 'desc' (mais recentes primeiro) | 'asc' (cronológica)
let regexModeEnabled = false;
let currentPage = 1;
let logsPerPage = 500;
let renderGeneration = 0;

const pinnedLogs = new Set();
const activeLogElements = new Set();
let allGroupedLogs = [];
let filteredGroupedLogs = [];
let logHeaderElement = null;
let currentSearchSpec = compileSearchSpec('');

// Utilities
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const val = bytes / Math.pow(1024, exp);
    return `${exp === 0 ? val : val.toFixed(1)} ${units[exp]}`;
}

function formatDurationMs(diffMs) {
    if (!Number.isFinite(diffMs) || diffMs <= 0) return '--';
    const diffSec = Math.floor(diffMs / 1000);
    const hours = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function showToast(message, type = 'info', durationMs = 2800) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, durationMs);
}

function isSupportedLogFile(file) {
    if (!file) return false;
    const name = String(file.name || '').trim();
    if (BLOCKED_BINARY_REGEX.test(name)) return false;
    if (LOG_FILE_NAME_REGEX.test(name)) return true;
    if (/\.log(?:\.|$)/i.test(name)) return true;
    if (file.type && (file.type.startsWith('text/') || file.type === 'application/json')) return true;
    return false;
}

function getFilesStorageKey(files) {
    return 'log_settings_' + files.map(f => `${f.name}_${f.size}_${f.lastModified || 0}`).join('|');
}

function getLogSignature(logObj) {
    if (!logObj || !logObj.date) return '';
    const trace = logObj.stacktrace && logObj.stacktrace.length > 0 ? logObj.stacktrace.join('\n') : '';
    return `${logObj.date}|${logObj.level}|${logObj.className}|${logObj.thread}|${logObj.message}|${trace}`;
}

function formatLogEntryAsText(logObj, includeStacktrace = true) {
    if (!logObj) return '';
    if (logObj.type === 'raw') return logObj.content || '';
    if (logObj.type === 'stacktrace_only') {
        return (logObj.stacktrace || []).join('\n');
    }
    const header = `${logObj.date} ${logObj.level} [${logObj.className}] (${logObj.thread}) - ${logObj.message}`;
    if (!includeStacktrace || !logObj.stacktrace || logObj.stacktrace.length === 0) {
        return header;
    }
    return `${header}\n${logObj.stacktrace.join('\n')}`;
}

// Search & Filter Helpers
function compileSearchSpec(rawTerm, forceRegex = regexModeEnabled) {
    const trimmed = String(rawTerm || '').trim();
    if (!trimmed) {
        return {
            hasQuery: false,
            isRegex: false,
            isValidRegex: true,
            filterRegex: null,
            highlightRegex: null,
            positiveTokens: [],
            negativeTokens: []
        };
    }

    const wrappedAsRegex = trimmed.length > 2 && trimmed.startsWith('/') && trimmed.endsWith('/');
    if (wrappedAsRegex || forceRegex) {
        const pattern = wrappedAsRegex ? trimmed.slice(1, -1) : trimmed;
        if (!pattern) {
            return {
                hasQuery: false,
                isRegex: true,
                isValidRegex: true,
                filterRegex: null,
                highlightRegex: null,
                positiveTokens: [],
                negativeTokens: []
            };
        }
        try {
            const filterRegex = new RegExp(pattern, 'i');
            const highlightRegex = new RegExp(pattern, 'gi');
            return {
                hasQuery: true,
                isRegex: true,
                isValidRegex: true,
                filterRegex,
                highlightRegex,
                positiveTokens: [],
                negativeTokens: []
            };
        } catch (err) {
            return {
                hasQuery: true,
                isRegex: true,
                isValidRegex: false,
                filterRegex: /$.^/,
                highlightRegex: null,
                positiveTokens: [],
                negativeTokens: []
            };
        }
    }

    const rawTokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    const positiveTokens = [];
    const negativeTokens = [];
    for (const token of rawTokens) {
        if (token.startsWith('-') && token.length > 1) {
            negativeTokens.push(token.slice(1));
        } else {
            positiveTokens.push(token);
        }
    }

    const highlightRegex = positiveTokens.length > 0
        ? new RegExp(positiveTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi')
        : null;

    return {
        hasQuery: positiveTokens.length > 0 || negativeTokens.length > 0,
        isRegex: false,
        isValidRegex: true,
        filterRegex: null,
        highlightRegex,
        positiveTokens,
        negativeTokens
    };
}

function textMatchesSpec(text, spec) {
    if (!spec || !spec.hasQuery) return false;
    if (!text) return false;
    if (spec.isRegex) {
        return spec.filterRegex ? spec.filterRegex.test(text) : false;
    }
    const lower = text.toLowerCase();
    for (const neg of spec.negativeTokens) {
        if (lower.includes(neg)) return false;
    }
    if (spec.positiveTokens.length === 0) return true;
    return spec.positiveTokens.some(pos => lower.includes(pos));
}

function matchesLogEntrySpec(logObj, spec) {
    if (!spec.hasQuery) return true;

    if (logObj.type === 'raw') {
        const lower = (logObj.content || '').toLowerCase();
        if (spec.isRegex) return spec.filterRegex.test(logObj.content || '');
        return spec.negativeTokens.every(n => !lower.includes(n)) &&
            spec.positiveTokens.every(p => lower.includes(p));
    }

    if (logObj.type === 'stacktrace_only') {
        const trace = logObj.stacktrace || [];
        if (spec.isRegex) return trace.some(l => spec.filterRegex.test(l));
        const joined = trace.join('\n').toLowerCase();
        return spec.negativeTokens.every(n => !joined.includes(n)) &&
            spec.positiveTokens.every(p => joined.includes(p));
    }

    const headerRaw = `${logObj.date} ${logObj.level} ${logObj.className} ${logObj.thread} ${logObj.message}`;
    const trace = logObj.stacktrace;

    if (spec.isRegex) {
        if (spec.filterRegex.test(headerRaw)) return true;
        return Boolean(trace && trace.some(l => spec.filterRegex.test(l)));
    }

    const headerLower = headerRaw.toLowerCase();
    for (const neg of spec.negativeTokens) {
        if (headerLower.includes(neg)) return false;
        if (trace && trace.some(l => l.toLowerCase().includes(neg))) return false;
    }

    for (const pos of spec.positiveTokens) {
        if (headerLower.includes(pos)) continue;
        if (trace && trace.some(l => l.toLowerCase().includes(pos))) continue;
        return false;
    }
    return true;
}

function renderHighlightedHtml(rawText, spec) {
    const safeRaw = String(rawText ?? '');
    if (!spec || !spec.highlightRegex || safeRaw.length === 0) {
        return escapeHtml(safeRaw);
    }

    // Evita regex excessivo em linhas absurdamente gigantes (>60k chars)
    if (safeRaw.length > 60000) {
        return escapeHtml(safeRaw);
    }

    const regex = new RegExp(spec.highlightRegex.source, spec.highlightRegex.flags.includes('g') ? spec.highlightRegex.flags : `${spec.highlightRegex.flags}g`);
    let out = '';
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(safeRaw)) !== null) {
        if (match[0].length === 0) {
            regex.lastIndex++;
            continue;
        }
        out += escapeHtml(safeRaw.slice(lastIndex, match.index));
        out += `<mark class="highlight">${escapeHtml(match[0])}</mark>`;
        lastIndex = match.index + match[0].length;
    }
    out += escapeHtml(safeRaw.slice(lastIndex));
    return out;
}

function parseTimeFilterSecs(value, isEnd) {
    if (!value) return -1;
    const parts = value.split(':').map(Number);
    if (parts.length < 2 || parts.some(n => !Number.isFinite(n))) return -1;
    const hh = parts[0];
    const mm = parts[1];
    const ss = parts.length >= 3 ? parts[2] : (isEnd ? 59 : 0);
    return hh * 3600 + mm * 60 + ss;
}

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

// Persisted Settings
function saveSettings() {
    if (!currentFileId) return;
    const settings = {
        pinnedSignatures: Array.from(pinnedLogs),
        filters: {
            pinnedOnly: Boolean(document.getElementById('pinnedOnly')?.checked),
            withStacktraceOnly: Boolean(document.getElementById('withStacktraceOnly')?.checked),
            levels: Array.from(document.querySelectorAll('input[name="filterLevel"]:checked')).map(cb => cb.value),
            search: document.getElementById('searchInput')?.value || '',
            regexMode: regexModeEnabled,
            timeStart: document.getElementById('timeStart')?.value || '',
            timeEnd: document.getElementById('timeEnd')?.value || '',
            limit: logsPerPage,
            sortOrder
        }
    };
    try {
        localStorage.setItem(currentFileId, JSON.stringify(settings));
    } catch (err) {
        console.warn('Falha ao salvar preferências no localStorage', err);
    }
}

const debouncedSaveSettings = debounce(saveSettings, 400);

function loadSettings(fileId) {
    let saved = null;
    try {
        saved = localStorage.getItem(fileId);
    } catch (_) {
        return;
    }
    if (!saved) return;

    try {
        const settings = JSON.parse(saved);
        pinnedLogs.clear();
        if (Array.isArray(settings.pinnedSignatures)) {
            settings.pinnedSignatures.forEach(sig => pinnedLogs.add(sig));
        }

        if (settings.filters) {
            const pinnedCheckbox = document.getElementById('pinnedOnly');
            const stackCheckbox = document.getElementById('withStacktraceOnly');
            const searchInputEl = document.getElementById('searchInput');
            const timeStartEl = document.getElementById('timeStart');
            const timeEndEl = document.getElementById('timeEnd');

            if (pinnedCheckbox) pinnedCheckbox.checked = Boolean(settings.filters.pinnedOnly);
            if (stackCheckbox) stackCheckbox.checked = Boolean(settings.filters.withStacktraceOnly);
            if (searchInputEl) searchInputEl.value = settings.filters.search || '';
            if (timeStartEl) timeStartEl.value = settings.filters.timeStart || '';
            if (timeEndEl) timeEndEl.value = settings.filters.timeEnd || '';

            regexModeEnabled = Boolean(settings.filters.regexMode);
            updateRegexToggleButtonUi();

            logsPerPage = Number(settings.filters.limit) || 500;
            sortOrder = settings.filters.sortOrder === 'asc' ? 'asc' : 'desc';
            updateSortButtonUi();

            if (Array.isArray(settings.filters.levels)) {
                document.querySelectorAll('input[name="filterLevel"]').forEach(cb => {
                    cb.checked = settings.filters.levels.includes(cb.value);
                });
            }
        }
    } catch (err) {
        console.warn('Falha ao carregar preferências salvas', err);
    }
}

function updateClearPinsButton() {
    const clearPinsBtn = document.getElementById('clearPins');
    if (clearPinsBtn) {
        clearPinsBtn.style.display = pinnedLogs.size > 0 ? 'inline-flex' : 'none';
    }
}

function updateRegexToggleButtonUi() {
    const btn = document.getElementById('regexToggleBtn');
    if (!btn) return;
    btn.classList.toggle('active', regexModeEnabled);
    btn.setAttribute('aria-pressed', String(regexModeEnabled));
}

function updateSortButtonUi() {
    const btn = document.getElementById('toggleSortBtn');
    if (!btn) return;
    btn.textContent = sortOrder === 'asc' ? '↑ Cronológica' : '↓ Mais recentes';
    btn.classList.toggle('active-state', sortOrder === 'asc');
}

function updateExpandAllButtonUi() {
    const btn = document.getElementById('expandAllBtn');
    if (!btn) return;
    btn.textContent = globalExpandState ? '▾ Recolher tudo' : '▸ Expandir tudo';
    btn.classList.toggle('active-state', globalExpandState);
}

function updateFilterIndicatorsUi() {
    const searchVal = document.getElementById('searchInput')?.value || '';
    const timeStartVal = document.getElementById('timeStart')?.value || '';
    const timeEndVal = document.getElementById('timeEnd')?.value || '';
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const clearTimeBtn = document.getElementById('clearTimeBtn');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    if (clearSearchBtn) clearSearchBtn.style.display = searchVal ? 'inline-flex' : 'none';
    if (clearTimeBtn) clearTimeBtn.disabled = !(timeStartVal || timeEndVal);

    const anyLevelChecked = document.querySelectorAll('input[name="filterLevel"]:checked').length > 0;
    const pinnedChecked = Boolean(document.getElementById('pinnedOnly')?.checked);
    const stackChecked = Boolean(document.getElementById('withStacktraceOnly')?.checked);
    const hasFilters = Boolean(searchVal || timeStartVal || timeEndVal || anyLevelChecked || pinnedChecked || stackChecked);

    if (clearFiltersBtn) clearFiltersBtn.disabled = !hasFilters;
}

// DOM Rendering
const INNER_LOG_REGEX = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}[.,]\d{3})\s+((?:INFO|WARN|ERROR|DEBUG|FATAL|TRACE|SEVERE|WARNING)(?:x\d+)?)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$/i;

function buildStackLinesFragment(buffer, isConfigMode, searchSpec) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < buffer.length; i++) {
        const traceLine = buffer[i];
        const lineDiv = document.createElement('div');
        const trimmed = traceLine.trim();
        const isStackLine = trimmed.startsWith('at ') || trimmed.startsWith('...') || trimmed.startsWith('Caused by:');

        if (isConfigMode) {
            const match = traceLine.match(INNER_LOG_REGEX);
            if (match) {
                lineDiv.className = 'log-line';
                const [, date, rawLevel, className, thread, message] = match;
                const matchLevel = rawLevel.replace(/x\d+$/i, '').trim().toUpperCase();
                const cleanClass = className.replace(/^\[|\]$/g, '');
                const cleanThread = thread.replace(/^\(|\)$/g, '');
                const cleanMessage = message.replace(/^-\s+/, '');

                lineDiv.innerHTML = `
                    <span class="log-row-actions"></span>
                    <span class="log-date">${escapeHtml(date)}</span>
                    <span class="log-level log-level-${escapeHtml(matchLevel.toLowerCase())}">${escapeHtml(matchLevel)}</span>
                    <span class="log-class"><span class="clickable-text" data-type="class">${escapeHtml(cleanClass)}</span></span>
                    <span class="log-thread"><span class="clickable-text" data-type="thread">${escapeHtml(cleanThread)}</span></span>
                    <span class="log-message">${renderHighlightedHtml(cleanMessage, searchSpec)}</span>
                `;
                lineDiv.querySelector('.log-message').dataset.originalText = cleanMessage;
                frag.appendChild(lineDiv);
                continue;
            }
            lineDiv.className = 'log-line log-config-plain';
        } else if (isStackLine) {
            lineDiv.className = 'log-line log-stacktrace';
        } else {
            lineDiv.className = 'log-line log-detail';
        }

        const textSpan = document.createElement('span');
        textSpan.className = 'log-detail-text';
        textSpan.dataset.originalText = traceLine;
        textSpan.innerHTML = renderHighlightedHtml(traceLine, searchSpec);
        lineDiv.appendChild(textSpan);
        frag.appendChild(lineDiv);
    }
    return frag;
}

function createStackTraceBlock(buffer, level, customLabel = null, isConfigMode = false, searchSpec = currentSearchSpec) {
    const container = document.createElement('div');
    container.className = 'stack-trace-container';
    if (level) container.dataset.level = level;

    const labelText = customLabel ? customLabel.replace(/^Show\s+/i, '') : 'Detalhes';
    const hasMatchInside = searchSpec && searchSpec.hasQuery && buffer.some(line => textMatchesSpec(line, searchSpec));

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'stack-trace-toggle';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'stack-trace-content';

    let isOpen = Boolean(globalExpandState);
    let rendered = false;

    function syncToggleVisuals() {
        toggleBtn.classList.toggle('rotated', isOpen);
        contentDiv.style.display = isOpen ? 'block' : 'none';
        const arrow = isOpen ? '▼' : '▶';
        const actionVerb = isOpen ? 'Ocultar' : 'Mostrar';
        const matchBadge = (!isOpen && hasMatchInside)
            ? ' <span class="stack-match-pill">termo nos detalhes</span>'
            : '';
        toggleBtn.innerHTML = `${arrow} ${escapeHtml(actionVerb)} ${escapeHtml(labelText)} (${buffer.length} linhas)${matchBadge}`;
    }

    function ensureRendered() {
        if (rendered) return;
        rendered = true;
        contentDiv.appendChild(buildStackLinesFragment(buffer, isConfigMode, searchSpec));
    }

    if (isOpen) {
        ensureRendered();
    }
    syncToggleVisuals();

    toggleBtn.onclick = () => {
        isOpen = !isOpen;
        if (isOpen) ensureRendered();
        syncToggleVisuals();
    };

    container.appendChild(toggleBtn);
    container.appendChild(contentDiv);
    return container;
}

function formatDeltaBadge(deltaMs) {
    if (!deltaMs || deltaMs <= 0) return '';
    let deltaText;
    if (deltaMs < 1000) deltaText = `+${deltaMs}ms`;
    else if (deltaMs < 60000) deltaText = `+${(deltaMs / 1000).toFixed(2)}s`;
    else deltaText = `+${(deltaMs / 60000).toFixed(1)}m`;
    return `<span class="log-delta">${deltaText}</span>`;
}

function createDOMElementFromLog(logObj, displayIndex, searchSpec) {
    if (logObj.type === 'raw') {
        const div = document.createElement('div');
        div.className = 'log-line log-raw';
        div.dataset.displayIndex = String(displayIndex);
        if (logObj.isBold) div.style.fontWeight = 'bold';
        div.dataset.originalText = logObj.content || '';
        div.innerHTML = renderHighlightedHtml(logObj.content || '', searchSpec);
        return div;
    }

    if (logObj.type === 'stacktrace_only') {
        return createStackTraceBlock(logObj.stacktrace || [], '', logObj.label, logObj.isConfigMode, searchSpec);
    }

    const frag = document.createDocumentFragment();
    const levelLower = String(logObj.level || 'info').toLowerCase();
    const div = document.createElement('div');
    div.className = `log-line log-type-${levelLower}`;
    div.dataset.displayIndex = String(displayIndex);

    let sig = '';
    if (pinnedLogs.size > 0) {
        sig = getLogSignature(logObj);
        if (pinnedLogs.has(sig)) div.classList.add('pinned');
    }

    const fileBadge = logObj.fileName
        ? `<span class="log-file-tag" title="${escapeHtml(logObj.fileName)}">${escapeHtml(logObj.fileName)}</span>`
        : '';

    const countBadge = logObj.count > 1
        ? `<span class="log-count">x${logObj.count}</span>`
        : '';

    div.innerHTML = `
        <span class="log-row-actions">
            <button type="button" class="log-pin" title="Fixar linha (P)">📌</button>
            <button type="button" class="log-copy-btn" title="Copiar ocorrência">📋</button>
        </span>
        <span class="log-date"><span>${escapeHtml(logObj.date)}</span>${formatDeltaBadge(logObj.deltaMs)}</span>
        <span class="log-level log-level-${escapeHtml(levelLower)}">${escapeHtml(logObj.level)}${countBadge}</span>
        <span class="log-class"><span class="clickable-text" data-type="class" title="Filtrar por classe">${escapeHtml(logObj.className)}</span></span>
        <span class="log-thread"><span class="clickable-text" data-type="thread" title="Filtrar por thread">${escapeHtml(logObj.thread)}</span></span>
        <span class="log-message">${fileBadge}${renderHighlightedHtml(logObj.message, searchSpec)}</span>
    `;

    const messageEl = div.querySelector('.log-message');
    if (messageEl) messageEl.dataset.originalText = logObj.message;

    frag.appendChild(div);

    if (logObj.stacktrace && logObj.stacktrace.length > 0) {
        const label = logObj.isConfigMode ? 'Show Configs' : null;
        frag.appendChild(createStackTraceBlock(logObj.stacktrace, levelLower, label, logObj.isConfigMode, searchSpec));
    }

    return frag;
}

function getOrderedFilteredItem(displayIdx) {
    const len = filteredGroupedLogs.length;
    if (len === 0 || displayIdx < 0 || displayIdx >= len) return null;
    const rawIdx = sortOrder === 'asc' ? (len - 1 - displayIdx) : displayIdx;
    return filteredGroupedLogs[rawIdx];
}

// Rendering Pages
function ensureLogHeaderElement() {
    if (logHeaderElement) return logHeaderElement;
    const headerRow = document.createElement('div');
    headerRow.className = 'log-header';
    headerRow.innerHTML = `
        <div class="header-cell header-actions-cell">
            <button id="clearPins" type="button" class="clear-pins-btn" title="Limpar todos os fixados" aria-label="Limpar todos os fixados" style="display: none;">✕</button>
        </div>
        <div class="header-cell">Date</div>
        <div class="header-cell">Level</div>
        <div class="header-cell">Class</div>
        <div class="header-cell">Thread</div>
        <div class="header-cell">Message</div>
    `;
    const clearPinsBtn = headerRow.querySelector('#clearPins');
    if (clearPinsBtn) {
        clearPinsBtn.onclick = () => {
            if (pinnedLogs.size === 0) return;
            if (confirm(`Desmarcar todos os ${pinnedLogs.size} logs fixados?`)) {
                pinnedLogs.clear();
                document.querySelectorAll('.log-line.pinned').forEach(el => el.classList.remove('pinned'));
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
    logHeaderElement = headerRow;
    return logHeaderElement;
}

function renderPage(page, focusDisplayIdx = null) {
    const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
    const containerArquivoLog = document.querySelector('.containerArquivoLog');
    if (!conteudoArquivoLog) return;

    const myGeneration = ++renderGeneration;
    clearActiveLines();

    if (!filteredGroupedLogs.length) {
        conteudoArquivoLog.innerHTML = '';
        const noResultsMsg = document.createElement('div');
        noResultsMsg.id = 'no-results-msg';
        noResultsMsg.textContent = 'Nenhum log encontrado para este filtro.';
        noResultsMsg.className = 'no-results-message';
        conteudoArquivoLog.appendChild(noResultsMsg);
        updatePaginationControls();
        return;
    }

    const totalPages = Math.max(1, Math.ceil(filteredGroupedLogs.length / logsPerPage));
    currentPage = Math.max(1, Math.min(page, totalPages));

    const startIndex = (currentPage - 1) * logsPerPage;
    const endIndex = Math.min(startIndex + logsPerPage, filteredGroupedLogs.length);

    conteudoArquivoLog.innerHTML = '';
    conteudoArquivoLog.appendChild(ensureLogHeaderElement());
    updateClearPinsButton();
    updatePaginationControls();

    const searchInputEl = document.getElementById('searchInput');
    currentSearchSpec = compileSearchSpec(searchInputEl ? searchInputEl.value : '');

    let cursor = startIndex;

    function finishFocus() {
        if (focusDisplayIdx !== null) {
            const targetEl = conteudoArquivoLog.querySelector(`.log-line[data-display-index="${focusDisplayIdx}"]`);
            if (targetEl) {
                setActiveLine(targetEl);
                targetEl.classList.add('flash-highlight');
                if (typeof targetEl.scrollIntoView === 'function') {
                    targetEl.scrollIntoView({ block: 'center', behavior: 'auto' });
                }
                return;
            }
        }
        if (containerArquivoLog) containerArquivoLog.scrollTop = 0;
        const firstLine = conteudoArquivoLog.querySelector('.log-line:not(.log-detail):not(.log-stacktrace), .stack-trace-container');
        if (firstLine) setActiveLine(firstLine);
    }

    function appendBatch() {
        if (myGeneration !== renderGeneration) return;
        const batchEnd = Math.min(cursor + RENDER_CHUNK_SIZE, endIndex);
        const fragment = document.createDocumentFragment();
        for (let idx = cursor; idx < batchEnd; idx++) {
            const logObj = getOrderedFilteredItem(idx);
            if (logObj) {
                fragment.appendChild(createDOMElementFromLog(logObj, idx, currentSearchSpec));
            }
        }
        conteudoArquivoLog.appendChild(fragment);
        cursor = batchEnd;

        if (cursor < endIndex) {
            requestAnimationFrame(appendBatch);
        } else {
            finishFocus();
        }
    }

    appendBatch();
}

function updatePaginationControls() {
    const controls = document.getElementById('pagination-controls');
    if (!controls) return;

    if (filteredGroupedLogs.length === 0) {
        controls.style.display = 'none';
        controls.innerHTML = '';
        return;
    }

    const totalPages = Math.max(1, Math.ceil(filteredGroupedLogs.length / logsPerPage));
    controls.innerHTML = '';
    controls.style.display = 'flex';

    const limitSelect = document.createElement('select');
    limitSelect.title = 'Itens por página';
    limitSelect.innerHTML = `
        <option value="200">200 itens</option>
        <option value="500">500 itens</option>
        <option value="1000">1000 itens</option>
        <option value="2000">2000 itens</option>
        <option value="9999999">Todos</option>
    `;
    limitSelect.value = String(logsPerPage);
    limitSelect.onchange = (e) => {
        const chosen = parseInt(e.target.value, 10);
        if (chosen === 9999999 && filteredGroupedLogs.length > LARGE_ALL_CONFIRM_THRESHOLD) {
            if (!confirm(`Exibir todos os ${filteredGroupedLogs.length.toLocaleString('pt-BR')} registros na mesma página pode deixar o navegador lento. Deseja continuar?`)) {
                e.target.value = String(logsPerPage);
                return;
            }
        }
        logsPerPage = chosen;
        currentPage = 1;
        debouncedSaveSettings();
        renderPage(1);
    };
    controls.appendChild(limitSelect);

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.textContent = '◀ Anterior';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) renderPage(currentPage - 1);
    };

    const info = document.createElement('span');
    info.textContent = `Página ${currentPage} de ${totalPages} (${filteredGroupedLogs.length.toLocaleString('pt-BR')} agrupados)`;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = 'Próximo ▶';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) renderPage(currentPage + 1);
    };

    controls.appendChild(prevBtn);
    controls.appendChild(info);
    controls.appendChild(nextBtn);

    if (totalPages > 1) {
        const jumpGroup = document.createElement('div');
        jumpGroup.className = 'jump-page-group';
        const jumpLabel = document.createElement('span');
        jumpLabel.textContent = 'Ir para:';
        const jumpInput = document.createElement('input');
        jumpInput.type = 'number';
        jumpInput.id = 'jumpPageInput';
        jumpInput.className = 'jump-page-input';
        jumpInput.min = '1';
        jumpInput.max = String(totalPages);
        jumpInput.value = String(currentPage);
        jumpInput.title = 'Número da página + Enter';
        jumpInput.onchange = () => {
            const target = parseInt(jumpInput.value, 10);
            if (Number.isFinite(target)) {
                renderPage(Math.max(1, Math.min(totalPages, target)));
            }
        };
        jumpGroup.appendChild(jumpLabel);
        jumpGroup.appendChild(jumpInput);
        controls.appendChild(jumpGroup);
    }
}

// Filtering
function filterLogs() {
    const searchInputEl = document.getElementById('searchInput');
    const timeStartEl = document.getElementById('timeStart');
    const timeEndEl = document.getElementById('timeEnd');

    const searchVal = searchInputEl ? searchInputEl.value : '';
    const spec = compileSearchSpec(searchVal);
    currentSearchSpec = spec;

    if (searchInputEl) {
        searchInputEl.classList.toggle('error', spec.isRegex && !spec.isValidRegex);
    }

    const startSecs = parseTimeFilterSecs(timeStartEl ? timeStartEl.value : '', false);
    const endSecs = parseTimeFilterSecs(timeEndEl ? timeEndEl.value : '', true);
    const hasTimeFilter = startSecs >= 0 || endSecs >= 0;

    const selectedLevels = new Set();
    let pinnedOnlyFilter = false;
    let stackOnlyFilter = false;

    document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(cb => {
        if (!cb.checked) return;
        if (cb.id === 'pinnedOnly') pinnedOnlyFilter = true;
        else if (cb.id === 'withStacktraceOnly') stackOnlyFilter = true;
        else if (cb.name === 'filterLevel') {
            selectedLevels.add(cb.value.toLowerCase());
            if (cb.value === 'ERROR') selectedLevels.add('fatal');
        }
    });

    const hasLevelFilter = selectedLevels.size > 0;
    const hasSearch = spec.hasQuery;

    filteredGroupedLogs = [];
    let visibleOccurrences = 0;
    let visibleErrors = 0;
    let visibleWarnings = 0;
    let oldestVisibleDate = null;
    let lastVisibleDate = null;

    for (let i = 0; i < allGroupedLogs.length; i++) {
        const logObj = allGroupedLogs[i];

        if (hasLevelFilter) {
            if (!logObj.level || !selectedLevels.has(logObj.level.toLowerCase())) continue;
        }

        if (hasTimeFilter) {
            if (typeof logObj.timeSecs !== 'number' || logObj.timeSecs < 0) continue;
            const s = logObj.timeSecs;
            if (startSecs >= 0 && endSecs >= 0) {
                if (startSecs <= endSecs) {
                    if (s < startSecs || s > endSecs) continue;
                } else {
                    // Faixa cruzando meia-noite (ex: 23:30 - 01:15)
                    if (s < startSecs && s > endSecs) continue;
                }
            } else if (startSecs >= 0 && s < startSecs) {
                continue;
            } else if (endSecs >= 0 && s > endSecs) {
                continue;
            }
        }

        if (stackOnlyFilter && (!logObj.stacktrace || logObj.stacktrace.length === 0)) {
            continue;
        }

        if (pinnedOnlyFilter) {
            if (!logObj.date || !pinnedLogs.has(getLogSignature(logObj))) continue;
        }

        if (hasSearch && !matchesLogEntrySpec(logObj, spec)) {
            continue;
        }

        if (logObj.timestamp > 0) {
            if (oldestVisibleDate === null || logObj.timestamp < oldestVisibleDate) oldestVisibleDate = logObj.timestamp;
            if (lastVisibleDate === null || logObj.timestamp > lastVisibleDate) lastVisibleDate = logObj.timestamp;
        }

        filteredGroupedLogs.push(logObj);

        if (logObj.type === 'log' || logObj.type === 'config') {
            const countWeight = logObj.count || 1;
            visibleOccurrences += countWeight;
            if (logObj.level === 'ERROR' || logObj.level === 'FATAL') visibleErrors += countWeight;
            else if (logObj.level === 'WARN') visibleWarnings += countWeight;
        }
    }

    const statTotal = document.getElementById('statTotal');
    const statErrors = document.getElementById('statErrors');
    const statWarnings = document.getElementById('statWarnings');
    const statVisible = document.getElementById('statVisible');
    const statDuration = document.getElementById('statDuration');

    if (statTotal) statTotal.textContent = visibleOccurrences.toLocaleString('pt-BR');
    if (statErrors) statErrors.textContent = visibleErrors.toLocaleString('pt-BR');
    if (statWarnings) statWarnings.textContent = visibleWarnings.toLocaleString('pt-BR');
    if (statVisible) statVisible.textContent = filteredGroupedLogs.length.toLocaleString('pt-BR');
    if (statDuration) {
        statDuration.textContent = (oldestVisibleDate && lastVisibleDate)
            ? formatDurationMs(lastVisibleDate - oldestVisibleDate)
            : '--';
    }

    updateFilterIndicatorsUi();

    currentPage = 1;
    renderPage(currentPage);
}

const debouncedFilterLogs = debounce(() => {
    filterLogs();
    debouncedSaveSettings();
}, 170);

// Pin & Clear All Filters
function togglePin(line) {
    if (!line || line.dataset.displayIndex === undefined) return;
    const logObj = getOrderedFilteredItem(Number(line.dataset.displayIndex));
    const sig = getLogSignature(logObj);
    if (!sig) return;

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

function clearAllFilters() {
    const searchInputEl = document.getElementById('searchInput');
    const timeStartEl = document.getElementById('timeStart');
    const timeEndEl = document.getElementById('timeEnd');
    if (searchInputEl) searchInputEl.value = '';
    if (timeStartEl) timeStartEl.value = '';
    if (timeEndEl) timeEndEl.value = '';
    regexModeEnabled = false;
    updateRegexToggleButtonUi();
    document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    filterLogs();
    debouncedSaveSettings();
}

function toggleAllStacktraces(forceTargetState = null) {
    const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
    if (!conteudoArquivoLog) return;
    const allToggles = conteudoArquivoLog.querySelectorAll('.stack-trace-toggle');
    if (allToggles.length === 0) return;

    const targetOpen = forceTargetState !== null ? forceTargetState : !globalExpandState;
    globalExpandState = targetOpen;
    updateExpandAllButtonUi();

    allToggles.forEach(btn => {
        const isRotated = btn.classList.contains('rotated');
        if (targetOpen !== isRotated) btn.click();
    });
}

// File Loading & Worker Streaming
function cancelCurrentLoad() {
    if (activeWorker) {
        activeWorker.terminate();
        activeWorker = null;
    }
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'none';
}

function loadFilesInWorker(inputFiles, customDisplayLabel = null) {
    const validFiles = Array.from(inputFiles || []).filter(isSupportedLogFile);
    if (validFiles.length === 0) {
        showToast('Por favor, envie um arquivo .log, .txt ou .out válido.', 'error');
        return;
    }

    if (activeWorker) {
        activeWorker.terminate();
        activeWorker = null;
    }

    currentFileId = validFiles.some(f => f.isEphemeralPaste) ? null : getFilesStorageKey(validFiles);
    const totalBytes = validFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    currentLoadedLabel = customDisplayLabel || (
        validFiles.length === 1
            ? `${validFiles[0].name} (${formatBytes(totalBytes)})`
            : `${validFiles.length} arquivos (${formatBytes(totalBytes)})`
    );

    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingFileInfo = document.getElementById('loadingFileInfo');
    const loadingProgressBar = document.getElementById('loadingProgressBar');
    const loadingProgressText = document.getElementById('loadingProgressText');

    if (loadingFileInfo) loadingFileInfo.textContent = currentLoadedLabel;
    if (loadingProgressBar) loadingProgressBar.style.width = '5%';
    if (loadingProgressText) loadingProgressText.textContent = 'Iniciando leitura em blocos...';
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    pinnedLogs.clear();
    globalExpandState = false;
    sortOrder = 'desc';
    regexModeEnabled = false;
    logsPerPage = 500;
    updateSortButtonUi();
    updateExpandAllButtonUi();
    updateRegexToggleButtonUi();

    const searchInputEl = document.getElementById('searchInput');
    const timeStartEl = document.getElementById('timeStart');
    const timeEndEl = document.getElementById('timeEnd');
    if (searchInputEl) searchInputEl.value = '';
    if (timeStartEl) timeStartEl.value = '';
    if (timeEndEl) timeEndEl.value = '';
    document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });

    loadSettings(currentFileId);

    try {
        const worker = new Worker(WORKER_SCRIPT_URL);
        activeWorker = worker;

        worker.onmessage = function (msgEvent) {
            const msg = msgEvent.data;
            if (!msg) return;

            if (msg.status === 'progress') {
                if (loadingProgressBar) loadingProgressBar.style.width = `${msg.progress}%`;
                if (loadingProgressText) {
                    const linesLabel = (msg.processedLines || 0).toLocaleString('pt-BR');
                    const uniqLabel = (msg.uniqueEntries || 0).toLocaleString('pt-BR');
                    loadingProgressText.textContent = `${msg.progress}% • ${linesLabel} linhas (${uniqLabel} agrupadas)`;
                }
                return;
            }

            if (msg.status === 'error') {
                cancelCurrentLoad();
                showToast(`Erro no processamento do arquivo: ${msg.message || 'falha desconhecida'}`, 'error', 4500);
                return;
            }

            if (msg.status === 'done') {
                worker.terminate();
                if (activeWorker === worker) activeWorker = null;

                const data = msg.data || { logs: [], stats: {} };
                allGroupedLogs = data.logs || [];

                const popup = document.getElementById('arquivoLogPopup');
                const popupCard = popup ? popup.querySelector('.popupCard') : null;
                const containerArquivoLog = document.querySelector('.containerArquivoLog');
                const loadedFileInfo = document.getElementById('loadedFileInfo');
                const logDashboard = document.getElementById('logDashboard');

                if (loadedFileInfo) {
                    const linesInfo = data.stats?.processedLines
                        ? ` • ${data.stats.processedLines.toLocaleString('pt-BR')} linhas`
                        : '';
                    loadedFileInfo.textContent = `📄 ${currentLoadedLabel}${linesInfo}`;
                    loadedFileInfo.title = currentLoadedLabel;
                }

                if (logDashboard) logDashboard.style.display = 'flex';
                filterLogs();

                if (loadingProgressBar) loadingProgressBar.style.width = '100%';
                if (loadingOverlay) loadingOverlay.style.display = 'none';
                if (popup) popup.style.display = 'flex';

                requestAnimationFrame(() => {
                    if (popupCard) popupCard.classList.add('show');
                    if (containerArquivoLog) containerArquivoLog.scrollTop = 0;
                });
            }
        };

        worker.onerror = function (err) {
            cancelCurrentLoad();
            showToast(`Erro ao processar log: ${err?.message || 'falha no worker'}`, 'error', 4500);
        };

        worker.postMessage({ files: validFiles });
    } catch (err) {
        cancelCurrentLoad();
        showToast(`Não foi possível iniciar o Web Worker: ${err.message}`, 'error', 4500);
    }
}

// Keep backward-compatible helper name
function addFileToList(file) {
    if (file) loadFilesInWorker([file]);
}

function closeModal() {
    const popup = document.getElementById('arquivoLogPopup');
    const popupCard = popup ? popup.querySelector('.popupCard') : null;
    const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');

    if (typeof saveSettings === 'function') saveSettings();
    if (popupCard) popupCard.classList.remove('show');
    if (popup) {
        setTimeout(() => {
            if (popupCard && popupCard.classList.contains('show')) return;
            popup.style.display = 'none';
            renderGeneration++;
            if (conteudoArquivoLog) conteudoArquivoLog.innerHTML = '';
            allGroupedLogs = [];
            filteredGroupedLogs = [];
        }, 120);
    }
}

// Export Modal
function openExportModal() {
    if (!filteredGroupedLogs || filteredGroupedLogs.length === 0) {
        showToast('Não há logs filtrados para exportar.', 'error');
        return;
    }
    const hint = document.getElementById('exportCountHint');
    if (hint) {
        hint.textContent = `${filteredGroupedLogs.length.toLocaleString('pt-BR')} registros filtrados`;
    }
    const modal = document.getElementById('exportModal');
    if (modal) modal.style.display = 'flex';
}

function closeExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) modal.style.display = 'none';
}

function buildExportChunks(logsArray, format) {
    const chunks = [];
    if (format === 'csv') {
        chunks.push('\uFEFFData;Hora;Level;Classe;Thread;Mensagem\n');
        for (let i = logsArray.length - 1; i >= 0; i--) {
            const log = logsArray[i];
            if (log.type === 'raw' || log.type === 'stacktrace_only') continue;
            const date = log.date ? log.date.split(' ')[0] : '';
            const time = log.date ? log.date.split(' ')[1] || '' : '';
            const level = log.level || '';
            const className = (log.className || '').replace(/"/g, '""');
            const thread = (log.thread || '').replace(/"/g, '""');
            const message = (log.message || '').replace(/\r?\n|\r/g, ' ').replace(/"/g, '""');
            chunks.push(`"${date}";"${time}";"${level}";"${className}";"${thread}";"${message}"\n`);
        }
        return chunks;
    }

    if (format === 'json') {
        chunks.push('[\n');
        let first = true;
        for (let i = logsArray.length - 1; i >= 0; i--) {
            const cleanObj = { ...logsArray[i] };
            delete cleanObj.timeSecs;
            if (!first) chunks.push(',\n');
            chunks.push(JSON.stringify(cleanObj, null, 2));
            first = false;
        }
        chunks.push('\n]');
        return chunks;
    }

    for (let i = logsArray.length - 1; i >= 0; i--) {
        chunks.push(`${formatLogEntryAsText(logsArray[i], true)}\n`);
    }
    return chunks;
}

function executeExport() {
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'txt';
    const chunks = buildExportChunks(filteredGroupedLogs, format);

    let mimeType = 'text/plain;charset=utf-8;';
    if (format === 'csv') mimeType = 'text/csv;charset=utf-8;';
    else if (format === 'json') mimeType = 'application/json;charset=utf-8;';

    const blob = new Blob(chunks, { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${format}`;
    a.click();
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);

    closeExportModal();
    showToast(`Exportação .${format === 'txt' ? 'log' : format} gerada com sucesso!`, 'success');
}

// Keyboard Navigation Helper (no offsetParent layout thrashing)
function getVisibleNavigableElements() {
    const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
    if (!conteudoArquivoLog) return [];
    const elements = conteudoArquivoLog.querySelectorAll('.log-line, .stack-trace-container');
    const visible = [];
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const parentContent = el.closest('.stack-trace-content');
        if (parentContent && parentContent.style.display === 'none') continue;
        visible.push(el);
    }
    return visible;
}

function handleViewerKeyDown(e) {
    const popup = document.getElementById('arquivoLogPopup');
    if (!popup || popup.style.display === 'none') return;

    const exportModal = document.getElementById('exportModal');
    const isExportOpen = exportModal && exportModal.style.display === 'flex';
    if (isExportOpen) {
        if (e.key === 'Escape') closeExportModal();
        return;
    }

    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    const isTypingInControl = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

    if (e.key === 'Escape') {
        const shortcutsTooltip = document.getElementById('shortcutsTooltip');
        if (shortcutsTooltip && shortcutsTooltip.classList.contains('open')) {
            shortcutsTooltip.classList.remove('open');
            return;
        }
        closeModal();
        return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const selectionText = window.getSelection ? window.getSelection().toString() : '';
        if (isTypingInControl || selectionText.length > 0) return;

        const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
        const currentActive = conteudoArquivoLog?.querySelector('.log-line.active');
        if (currentActive) {
            const idx = Number(currentActive.dataset.displayIndex);
            const logObj = Number.isFinite(idx) ? getOrderedFilteredItem(idx) : null;
            const text = logObj
                ? formatLogEntryAsText(logObj, false)
                : (currentActive.dataset.originalText || currentActive.textContent);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(() => showToast('Linha copiada para a área de transferência!', 'success', 1800))
                    .catch(err => console.error('Failed to copy', err));
            }
        }
        return;
    }

    if (isTypingInControl) {
        if (e.key === 'Enter' && document.activeElement?.id === 'searchInput') {
            filterLogs();
            debouncedSaveSettings();
        }
        return;
    }

    const keyLower = e.key.toLowerCase();

    if (keyLower === 'p') {
        const currentActive = document.querySelector('#conteudoArquivoLog .log-line.active');
        if (currentActive) togglePin(currentActive);
    } else if (e.key === '/') {
        e.preventDefault();
        document.getElementById('searchInput')?.focus();
    } else if (e.key === 'Home') {
        e.preventDefault();
        renderPage(1);
    } else if (e.key === 'End') {
        e.preventDefault();
        const totalPages = Math.ceil(filteredGroupedLogs.length / logsPerPage);
        if (totalPages > 0) renderPage(totalPages);
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        const totalPages = Math.ceil(filteredGroupedLogs.length / logsPerPage);
        if (currentPage < totalPages) renderPage(currentPage + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (currentPage > 1) renderPage(currentPage - 1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const containerArquivoLog = document.querySelector('.containerArquivoLog');
        const allVisibleLines = getVisibleNavigableElements();
        if (allVisibleLines.length === 0) return;

        const currentActive = document.querySelector('#conteudoArquivoLog .log-line.active, #conteudoArquivoLog .stack-trace-container.active');
        let nextIndex = 0;

        if (currentActive) {
            const currentIndex = allVisibleLines.indexOf(currentActive);
            const step = e.shiftKey ? 10 : 1;
            if (e.key === 'ArrowDown') {
                nextIndex = e.shiftKey
                    ? Math.min(currentIndex + step, allVisibleLines.length - 1)
                    : (currentIndex + 1 >= allVisibleLines.length ? 0 : currentIndex + 1);
            } else {
                nextIndex = e.shiftKey
                    ? Math.max(currentIndex - step, 0)
                    : (currentIndex - 1 < 0 ? allVisibleLines.length - 1 : currentIndex - 1);
            }
        } else if (e.key === 'ArrowUp') {
            nextIndex = allVisibleLines.length - 1;
        }

        const nextLine = allVisibleLines[nextIndex];
        setActiveLine(nextLine);
        if (nextIndex === 0 && currentPage === 1) {
            if (containerArquivoLog) containerArquivoLog.scrollTop = 0;
        } else if (nextLine && typeof nextLine.scrollIntoView === 'function') {
            nextLine.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
    } else if (e.key === 'Enter') {
        if (e.shiftKey) {
            toggleAllStacktraces();
        } else {
            const currentActive = document.querySelector('#conteudoArquivoLog .log-line.active, #conteudoArquivoLog .stack-trace-container.active');
            const toggleBtn = currentActive?.querySelector('.stack-trace-toggle')
                || (currentActive?.nextElementSibling?.classList.contains('stack-trace-container')
                    ? currentActive.nextElementSibling.querySelector('.stack-trace-toggle')
                    : null);
            if (toggleBtn) toggleBtn.click();
        }
    } else if (['i', 'w', 'e', 'd', 'f'].includes(keyLower)) {
        const map = { i: 'info', w: 'warn', e: 'error', d: 'debug', f: 'pinnedOnly' };
        const checkbox = document.getElementById(map[keyLower]);
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            filterLogs();
            debouncedSaveSettings();
        }
    }
}

// Wire Events & Startup
function initLeitorLogs() {
    const fileUploadArea = document.getElementById('file-upload');
    const imageUpload = document.getElementById('imageUpload');
    const fileInput = document.getElementById('file-input');
    const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');

    if (fileUploadArea) {
        fileUploadArea.addEventListener('dragover', (event) => {
            if (imageUpload) imageUpload.src = 'assets/upload_blue.webp?v=1611261852';
            fileUploadArea.classList.add('dragover');
            event.preventDefault();
        });
        fileUploadArea.addEventListener('dragleave', (event) => {
            if (imageUpload) imageUpload.src = 'assets/upload.webp?v=1611261852';
            fileUploadArea.classList.remove('dragover');
            event.preventDefault();
        });
        fileUploadArea.addEventListener('drop', (event) => {
            event.preventDefault();
            fileUploadArea.classList.remove('dragover');
            loadFilesInWorker(event.dataTransfer?.files);
        });
        fileUploadArea.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
        fileUploadArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (fileInput) fileInput.click();
            }
        });
        fileUploadArea.onmouseenter = () => {
            if (imageUpload) imageUpload.src = 'assets/upload_blue.webp?v=1611261852';
        };
        fileUploadArea.onmouseleave = () => {
            if (imageUpload) imageUpload.src = 'assets/upload.webp?v=1611261852';
        };
    }

    // Permitir soltar novo arquivo direto sobre o visualizador aberto
    document.body.addEventListener('dragover', (event) => {
        const popup = document.getElementById('arquivoLogPopup');
        if (popup && popup.style.display === 'flex') {
            event.preventDefault();
        }
    });
    document.body.addEventListener('drop', (event) => {
        const popup = document.getElementById('arquivoLogPopup');
        if (popup && popup.style.display === 'flex' && event.target !== fileUploadArea) {
            event.preventDefault();
            if (event.dataTransfer?.files?.length) {
                loadFilesInWorker(event.dataTransfer.files);
            }
        }
    });

    // Permitir colar conteúdo de log direto na tela inicial (Ctrl+V)
    document.addEventListener('paste', (event) => {
        const activeTag = document.activeElement?.tagName || '';
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
        const popup = document.getElementById('arquivoLogPopup');
        if (popup && popup.style.display === 'flex') return;

        const pastedText = event.clipboardData?.getData('text');
        if (pastedText && pastedText.trim().length > 0) {
            const nowStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
            const blob = new Blob([pastedText], { type: 'text/plain' });
            blob.name = `colado-${nowStr}.log`;
            blob.lastModified = Date.now();
            blob.isEphemeralPaste = true;
            loadFilesInWorker([blob], `Log colado (${formatBytes(blob.size)})`);
        }
    });

    if (fileInput) {
        fileInput.addEventListener('change', function () {
            if (this.files && this.files.length > 0) {
                loadFilesInWorker(this.files);
            }
            this.value = '';
        });
    }

    if (conteudoArquivoLog) {
        conteudoArquivoLog.addEventListener('click', (e) => {
            if (e.target.classList.contains('log-pin')) {
                togglePin(e.target.closest('.log-line'));
                return;
            }

            if (e.target.classList.contains('log-copy-btn')) {
                const line = e.target.closest('.log-line');
                const idx = line ? Number(line.dataset.displayIndex) : NaN;
                const logObj = Number.isFinite(idx) ? getOrderedFilteredItem(idx) : null;
                if (logObj && navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(formatLogEntryAsText(logObj, true))
                        .then(() => showToast('Ocorrência copiada!', 'success', 1800))
                        .catch(() => showToast('Não foi possível copiar.', 'error'));
                }
                return;
            }

            const clickable = e.target.closest('.clickable-text');
            if (clickable) {
                const cleanText = clickable.textContent.trim().replace(/^\[|\]$|^\(|\)$/g, '');
                const searchEl = document.getElementById('searchInput');
                if (searchEl) {
                    searchEl.value = searchEl.value === cleanText ? '' : cleanText;
                    filterLogs();
                    debouncedSaveSettings();
                }
                return;
            }

            const line = e.target.closest('.log-line, .stack-trace-container');
            if (line) setActiveLine(line);
        });
    }

    const btnVoltar = document.getElementById('btnVoltar');
    const cameFromDevTools = typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('from') === 'devtools';
    if (btnVoltar) {
        if (cameFromDevTools) {
            const label = btnVoltar.querySelector('.btnVoltar-label');
            if (label) label.textContent = 'Suíte Dev';
        }
        btnVoltar.addEventListener('click', () => {
            window.location.href = cameFromDevTools ? '../devTools/devTools.html' : '/';
        });
    }

    document.getElementById('cancelLoadBtn')?.addEventListener('click', cancelCurrentLoad);
    document.getElementById('fechar')?.addEventListener('click', closeModal);
    document.getElementById('listaBackgroud')?.addEventListener('click', closeModal);
    document.getElementById('exportar')?.addEventListener('click', openExportModal);
    document.getElementById('openAnotherFileBtn')?.addEventListener('click', () => {
        fileInput?.click();
    });

    document.getElementById('toggleSortBtn')?.addEventListener('click', () => {
        sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
        updateSortButtonUi();
        renderPage(1);
        debouncedSaveSettings();
    });

    document.getElementById('expandAllBtn')?.addEventListener('click', () => {
        toggleAllStacktraces();
    });

    document.getElementById('closeExportModal')?.addEventListener('click', closeExportModal);
    document.getElementById('cancelExportBtn')?.addEventListener('click', closeExportModal);
    document.getElementById('confirmExportBtn')?.addEventListener('click', executeExport);
    document.getElementById('exportModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'exportModal') closeExportModal();
    });

    // Click nos cards do dashboard como atalho de filtro
    document.querySelectorAll('.stat-clickable').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.statAction;
            const levelCheckboxes = document.querySelectorAll('input[name="filterLevel"]');
            if (action === 'all') {
                levelCheckboxes.forEach(cb => { cb.checked = false; });
            } else {
                levelCheckboxes.forEach(cb => {
                    cb.checked = cb.value === action ? !cb.checked : false;
                });
            }
            filterLogs();
            debouncedSaveSettings();
        });
    });

    // Filtros e botões auxiliares
    const searchInputEl = document.getElementById('searchInput');
    const timeStartEl = document.getElementById('timeStart');
    const timeEndEl = document.getElementById('timeEnd');

    if (searchInputEl) {
        searchInputEl.addEventListener('input', () => {
            updateFilterIndicatorsUi();
            debouncedFilterLogs();
        });
    }
    if (timeStartEl) {
        timeStartEl.addEventListener('input', () => {
            filterLogs();
            debouncedSaveSettings();
        });
    }
    if (timeEndEl) {
        timeEndEl.addEventListener('input', () => {
            filterLogs();
            debouncedSaveSettings();
        });
    }

    document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            filterLogs();
            debouncedSaveSettings();
        });
    });

    document.getElementById('regexToggleBtn')?.addEventListener('click', () => {
        regexModeEnabled = !regexModeEnabled;
        updateRegexToggleButtonUi();
        filterLogs();
        debouncedSaveSettings();
    });

    document.getElementById('clearSearchBtn')?.addEventListener('click', () => {
        if (searchInputEl) searchInputEl.value = '';
        filterLogs();
        debouncedSaveSettings();
    });

    document.getElementById('clearTimeBtn')?.addEventListener('click', () => {
        if (timeStartEl) timeStartEl.value = '';
        if (timeEndEl) timeEndEl.value = '';
        filterLogs();
        debouncedSaveSettings();
    });

    document.getElementById('clearFiltersBtn')?.addEventListener('click', clearAllFilters);

    const shortcutsBtn = document.getElementById('shortcutsBtn');
    const shortcutsTooltip = document.getElementById('shortcutsTooltip');
    if (shortcutsBtn && shortcutsTooltip) {
        shortcutsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = shortcutsTooltip.classList.toggle('open');
            shortcutsBtn.setAttribute('aria-expanded', String(open));
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.shortcuts-tooltip-container')) {
                shortcutsTooltip.classList.remove('open');
                shortcutsBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    document.addEventListener('keydown', handleViewerKeyDown);

    // PWA Service Worker & Install Prompt
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(console.error);
    }

    function detectDesktopDownloadTarget() {
        const platformHint = `${navigator.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`;
        if (/android|iphone|ipad|ipod|mobile/i.test(platformHint)) return null;
        if (/win/i.test(platformHint)) {
            return {
                os: 'windows',
                url: 'downloads/fluig-log-gpui.exe',
                download: 'Leitor-Logs-Fluig-Windows.exe',
                label: 'Baixar Desktop (Windows)',
                title: 'Baixar aplicativo desktop nativo em Rust + GPUI (Windows)',
                toast: 'Download iniciado! Se o Windows SmartScreen aparecer, clique em "More info (Mais informações)" → "Run anyway (Executar assim mesmo)".'
            };
        }
        if (/mac/i.test(platformHint)) {
            return {
                os: 'mac',
                url: 'downloads/fluig-log-gpui-mac',
                download: 'fluig-log-gpui-mac',
                label: 'Baixar Desktop (macOS)',
                title: 'Baixar aplicativo desktop nativo em Rust + GPUI (macOS)',
                toast: 'Download iniciado! No macOS, dê permissão (chmod +x fluig-log-gpui-mac) e, se o Gatekeeper bloquear, use clique direito → Abrir.'
            };
        }
        if (/linux|x11/i.test(platformHint)) {
            return {
                os: 'linux',
                url: 'downloads/fluig-log-gpui-linux',
                download: 'fluig-log-gpui-linux',
                label: 'Baixar Desktop (Linux)',
                title: 'Baixar aplicativo desktop nativo em Rust + GPUI (Linux)',
                toast: 'Download iniciado! No Linux, dê permissão de execução antes de abrir (chmod +x fluig-log-gpui-linux).'
            };
        }
        return null;
    }

    const downloadDesktopBtn = document.getElementById('downloadDesktopBtn');
    const downloadDesktopLabel = document.getElementById('downloadDesktopLabel');
    let activeDesktopTarget = null;
    if (downloadDesktopBtn) {
        downloadDesktopBtn.style.display = 'none';
        const candidate = detectDesktopDownloadTarget();
        if (candidate && typeof fetch === 'function') {
            fetch(`./${candidate.url}`, { method: 'HEAD' })
                .then((res) => {
                    if (res && res.ok) {
                        activeDesktopTarget = candidate;
                        downloadDesktopBtn.href = candidate.url;
                        downloadDesktopBtn.download = candidate.download;
                        downloadDesktopBtn.title = candidate.title;
                        if (downloadDesktopLabel) downloadDesktopLabel.textContent = candidate.label;
                        downloadDesktopBtn.style.display = 'inline-flex';
                    }
                })
                .catch(() => {});
        }
        downloadDesktopBtn.addEventListener('click', () => {
            if (activeDesktopTarget) {
                showToast(activeDesktopTarget.toast, 'info', 6500);
            }
        });
    }

    let deferredPrompt = null;
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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLeitorLogs);
} else {
    initLeitorLogs();
}

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

function addFileToList(file) {
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.log') || file.name.toLowerCase().endsWith('.txt') || file.type.startsWith('text/')) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;

            const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
            const popup = document.getElementById('arquivoLogPopup');
            const popupCard = popup.querySelector('.popupCard');
            const containerArquivoLog = document.querySelector('.containerArquivoLog');

            if (conteudoArquivoLog && popup) {
                conteudoArquivoLog.innerHTML = '';

                const lines = content.split('\n');
                const fragment = document.createDocumentFragment();


                const searchInputEl = document.getElementById('searchInput');
                const timeStartEl = document.getElementById('timeStart');
                const timeEndEl = document.getElementById('timeEnd');

                if (searchInputEl) searchInputEl.value = '';
                if (timeStartEl) timeStartEl.value = '';
                if (timeEndEl) timeEndEl.value = '';

                const filterCheckboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]');
                filterCheckboxes.forEach(cb => cb.checked = false);


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

                            const regex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3})\s+(INFO|WARN|ERROR|DEBUG|FATAL)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$/;
                            const match = traceLine.match(regex);

                            if (match) {
                                const [fullMatch, date, level, className, thread, message] = match;
                                let cleanClass = className.replace(/^\[|\]$/g, '');
                                let cleanThread = thread.replace(/^\(|\)$/g, '');
                                let cleanMessage = message.replace(/^-\s+/, '');

                                lineDiv.innerHTML = `
                                    <span class="log-date">${date}</span>
                                    <span class="log-level log-level-${level.toLowerCase()}">${level}</span>
                                    <span class="log-class">${cleanClass}</span>
                                    <span class="log-thread">${cleanThread}</span>

                                    <span class="log-message">${cleanMessage}</span>
                                `;
                                lineDiv.querySelector('.log-message').dataset.originalText = cleanMessage;
                            } else {
                                lineDiv.className = 'log-line log-config-content';
                                lineDiv.textContent = traceLine;
                                lineDiv.dataset.originalText = traceLine;
                            }

                        } else if (isStackLine) {
                            lineDiv.className = 'log-line log-stacktrace';
                            lineDiv.textContent = traceLine;
                        } else {
                            lineDiv.className = 'log-line log-detail';
                            lineDiv.textContent = traceLine;
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
                const logsPerPage = 500;
                let currentPage = 1;
                let allGroupedLogs = [];
                let filteredGroupedLogs = [];
                let logHeaderElement = null;

                function parseLogDate(dateStr) {
                    const isoStr = dateStr.replace(' ', 'T').replace(',', '.');
                    return new Date(isoStr);
                }

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
                    const signature = `${level}|${className}|${thread}|${message}|${bufferContent}`;

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
                            <span class="log-date">${date} ${deltaHtml}</span>
                            <span class="log-level log-level-${level.toLowerCase()}">${level}</span>
                            <span class="log-class">${className}</span>
                            <span class="log-thread">${thread}</span>
                            <span class="log-message">${message}</span>
                        `;
                        div.querySelector('.log-message').dataset.originalText = message;
                        div.classList.add(`log-type-${level.toLowerCase()}`);
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
                    <div class="header-cell">Date</div>
                    <div class="header-cell">Level</div>
                    <div class="header-cell">Class</div>
                    <div class="header-cell">Thread</div>
                    <div class="header-cell">Message</div>
                `;
                fragment.appendChild(headerRow);

                conteudoArquivoLog.addEventListener('click', (e) => {
                    if (e.target.classList.contains('log-class') || e.target.classList.contains('log-thread')) {
                        const text = e.target.textContent.trim();
                        const cleanText = text.replace(/^\[|\]$|^\(|\)$/g, '');

                        const searchInput = document.getElementById('searchInput');
                        if (searchInput) {
                            searchInput.value = cleanText;
                            searchInput.dispatchEvent(new Event('input'));
                        }
                    }
                });

                let configBuffer = [];
                let inConfigBlock = false;

                lines.forEach(line => {
                    line = line.replace('\r', '');

                    const regex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3})\s+(INFO|WARN|ERROR|DEBUG|FATAL)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$/;
                    const match = line.match(regex);

                    if (match) {
                        const [fullMatch, date, level, className, thread, message] = match;

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
                        const currentActive = conteudoArquivoLog.querySelector('.log-line.active, .stack-trace-container.active');
                        if (currentActive) currentActive.classList.remove('active');
                        line.classList.add('active');
                    }
                };

                const searchInput = document.getElementById('searchInput');
                const timeStartInput = document.getElementById('timeStart');
                const timeEndInput = document.getElementById('timeEnd');
                const checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]');

                function highlightSearchTerm(element, term) {
                    if (!element) return;

                    const messageSpan = element.querySelector('.log-message');
                    const target = messageSpan || element;

                    if (!target.dataset.originalText) return;

                    if (!term || term.trim() === '') {
                        target.textContent = target.dataset.originalText;
                        return;
                    }

                    const tokens = term.trim().split(/\s+/).filter(t => t.length > 0);
                    if (tokens.length === 0) {
                        target.textContent = target.dataset.originalText;
                        return;
                    }

                    const text = target.dataset.originalText;

                    const escapedTokens = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                    const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');

                    const safeText = text.replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#039;");

                    const newHtml = safeText.replace(regex, '<mark class="highlight">$1</mark>');
                    target.innerHTML = newHtml;
                }

                function renderPage(page) {
                    if (!filteredGroupedLogs.length) {
                        conteudoArquivoLog.innerHTML = '';
                        document.getElementById('pagination-controls').style.display = 'none';
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
                        containerArquivoLog.scrollTop = 0;
                        const firstLine = conteudoArquivoLog.querySelector('.log-line:not(.log-detail):not(.log-stacktrace), .stack-trace-container');
                        if (firstLine) {
                            firstLine.classList.add('active');
                        }
                    }
                }

                function updatePaginationControls() {
                    const controls = document.getElementById('pagination-controls');
                    const totalPages = Math.ceil(filteredGroupedLogs.length / logsPerPage);

                    if (totalPages <= 1) {
                        controls.style.display = 'none';
                        return;
                    }

                    controls.style.display = 'flex';
                    controls.innerHTML = '';

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
                    const searchInputVal = searchInput.value.toLowerCase().trim();
                    const searchTokens = searchInputVal.split(/\s+/).filter(t => t.length > 0);

                    const selectedLevels = [];
                    checkboxes.forEach(cb => {
                        if (cb.checked) {
                            selectedLevels.push(cb.value.toLowerCase());
                        }
                    });

                    filteredGroupedLogs = [];
                    let visibleCount = 0;
                    let visibleErrors = 0;
                    let visibleWarnings = 0;
                    let oldestVisibleDate = null;
                    let lastVisibleDate = null;

                    allGroupedLogs.forEach(group => {
                        const logLine = group[group.length - 1];
                        if (!logLine || !logLine.classList.contains('log-line')) return;

                        const text = logLine.textContent.toLowerCase();
                        const levelSpan = logLine.querySelector('.log-level');

                        let levelMatch = true;
                        if (selectedLevels.length > 0) {
                            if (levelSpan) {
                                const levelText = levelSpan.textContent.toLowerCase().trim();
                                levelMatch = selectedLevels.includes(levelText);
                            } else {
                                levelMatch = false;
                            }
                        }

                        const textMatch = searchTokens.length === 0 || searchTokens.every(token => text.includes(token));

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

                            if (timeMatch) {
                                const logDate = parseLogDate(dateText);
                                if (!oldestVisibleDate || logDate < oldestVisibleDate) oldestVisibleDate = logDate;
                                if (!lastVisibleDate || logDate > lastVisibleDate) lastVisibleDate = logDate;
                            }
                        }

                        if (levelMatch && textMatch && timeMatch) {
                            filteredGroupedLogs.push(group);
                            visibleCount++;

                            if (levelSpan) {
                                const levelText = levelSpan.textContent.toLowerCase().trim();
                                if (levelText === 'error') visibleErrors++;
                                if (levelText === 'warn') visibleWarnings++;
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

                if (searchInput) searchInput.addEventListener('input', filterLogs);
                if (timeStartInput) timeStartInput.addEventListener('input', filterLogs);
                if (timeEndInput) timeEndInput.addEventListener('input', filterLogs);

                checkboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', filterLogs);
                });

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

                renderPage(1);


                popup.style.display = 'flex';
                requestAnimationFrame(() => {
                    if (popupCard) popupCard.classList.add('show');
                    const container = document.querySelector('.containerArquivoLog');
                    if (container) container.scrollTop = 0;
                });

                document.addEventListener('keydown', function (e) {
                    if (popup.style.display === 'none') return;

                    if (e.key === 'ArrowRight') {
                        const totalPages = Math.ceil(filteredGroupedLogs.length / logsPerPage);
                        if (currentPage < totalPages) {
                            currentPage++;
                            renderPage(currentPage);
                        }
                    } else if (e.key === 'Enter') {
                        const currentActive = conteudoArquivoLog.querySelector('.log-line.active, .stack-trace-container.active');
                        if (currentActive) {
                            const toggleBtn = currentActive.querySelector('.stack-trace-toggle');
                            if (toggleBtn) {
                                toggleBtn.click();
                            }
                        }
                    } else if (e.key === 'ArrowLeft') {
                        if (currentPage > 1) {
                            currentPage--;
                            renderPage(currentPage);
                        }
                    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        const candidates = Array.from(conteudoArquivoLog.querySelectorAll('.log-line, .stack-trace-container'));

                        const allVisibleLines = candidates.filter(el => {
                            return el.offsetParent !== null;
                        });

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

                        if (currentActive) currentActive.classList.remove('active');
                        const nextLine = allVisibleLines[nextIndex];
                        nextLine.classList.add('active');

                        if (nextIndex === 0) {
                            conteudoArquivoLog.parentElement.scrollTop = 0;
                        } else {
                            nextLine.scrollIntoView({ block: 'nearest', behavior: 'auto' });
                        }
                    }
                });

                function closeModal() {
                    const popup = document.getElementById('arquivoLogPopup');
                    const popupCard = popup.querySelector('.popupCard');
                    const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');

                    if (popupCard) popupCard.classList.remove('show');
                    setTimeout(() => {
                        popup.style.display = 'none';
                        conteudoArquivoLog.textContent = '';
                    }, 100);
                }

                const closeBtn = document.getElementById('fechar');
                if (closeBtn) {
                    closeBtn.onclick = closeModal;
                }

                const background = document.getElementById('listaBackgroud');
                if (background) {
                    background.onclick = closeModal;
                }

                document.addEventListener('keydown', function (event) {
                    if (event.key === 'Escape') {
                        closeModal();
                    }
                });
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

const btnVoltar = document.getElementById('btnVoltar');
if (btnVoltar) {
    btnVoltar.addEventListener('click', () => {
        window.location.href = '../index.html';
    });
}

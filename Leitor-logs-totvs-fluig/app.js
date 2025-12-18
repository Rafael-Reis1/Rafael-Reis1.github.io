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

            if (conteudoArquivoLog && popup) {
                conteudoArquivoLog.innerHTML = '';

                const lines = content.split('\n');
                const fragment = document.createDocumentFragment();


                const searchInputEl = document.getElementById('searchInput');
                if (searchInputEl) {
                    searchInputEl.value = '';
                }

                const filterCheckboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]');
                filterCheckboxes.forEach(cb => cb.checked = false);


                function createStackTraceBlock(buffer, level) {
                    const container = document.createElement('div');
                    container.className = 'stack-trace-container';
                    if (level) {
                        container.dataset.level = level;
                    }

                    const toggleBtn = document.createElement('button');
                    toggleBtn.className = 'stack-trace-toggle';
                    toggleBtn.textContent = `▶ Show Details (${buffer.length} lines)`;

                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'stack-trace-content';
                    contentDiv.style.display = 'none';

                    buffer.forEach(traceLine => {
                        const lineDiv = document.createElement('div');
                        const isStackLine = traceLine.trim().startsWith('at ') || traceLine.trim().startsWith('...');

                        if (isStackLine) {
                            lineDiv.className = 'log-line log-stacktrace';
                        } else {
                            lineDiv.className = 'log-line log-detail';
                        }

                        lineDiv.textContent = traceLine;
                        contentDiv.appendChild(lineDiv);
                    });

                    toggleBtn.onclick = () => {
                        const isHidden = contentDiv.style.display === 'none';
                        contentDiv.style.display = isHidden ? 'block' : 'none';
                        toggleBtn.textContent = isHidden
                            ? `▼ Hide Details (${buffer.length} lines)`
                            : `▶ Show Details (${buffer.length} lines)`;
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
                        div.innerHTML = `
                            <span class="log-date">${date} ${deltaHtml}</span>
                            <span class="log-level log-level-${level.toLowerCase()}">${level}</span>
                            <span class="log-class">${className}</span>
                            <span class="log-thread">${thread}</span>
                            <span class="log-message">${message}</span>
                        `;
                        fragment.appendChild(div);

                        if (pendingBuffer.length > 0) {
                            fragment.appendChild(createStackTraceBlock(pendingBuffer, level.toLowerCase()));
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

                lines.forEach(line => {
                    line = line.replace('\r', '');

                    const regex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3})\s+(INFO|WARN|ERROR|DEBUG|FATAL)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$/;
                    const match = line.match(regex);

                    if (match) {
                        processPendingLog();

                        const [fullMatch, date, level, className, thread, message] = match;
                        pendingHeader = { date, level, className, thread, message };
                        pendingBuffer = [];
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
                });

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
                        const currentActive = conteudoArquivoLog.querySelector('.log-line.active');
                        if (currentActive) currentActive.classList.remove('active');
                        line.classList.add('active');
                    }
                };

                const searchInput = document.getElementById('searchInput');
                const checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]');

                function filterLogs() {
                    const searchTerm = searchInput.value.toLowerCase();

                    const selectedLevels = [];
                    checkboxes.forEach(cb => {
                        if (cb.checked) {
                            selectedLevels.push(cb.value.toLowerCase());
                        }
                    });

                    const logLines = conteudoArquivoLog.querySelectorAll('.log-line');
                    const stackContainers = conteudoArquivoLog.querySelectorAll('.stack-trace-container');

                    let visibleCount = 0;
                    let visibleErrors = 0;
                    let visibleWarnings = 0;
                    let oldestVisibleDate = null;
                    let lastVisibleDate = null;

                    logLines.forEach(line => {
                        if (line.classList.contains('log-stacktrace') || line.classList.contains('log-detail')) return;

                        const text = line.textContent.toLowerCase();
                        const levelSpan = line.querySelector('.log-level');

                        let levelMatch = true;

                        if (selectedLevels.length > 0) {
                            if (levelSpan) {
                                const levelText = levelSpan.textContent.toLowerCase().trim();
                                levelMatch = selectedLevels.includes(levelText);
                            } else {
                                levelMatch = false;
                            }
                        }

                        const textMatch = text.includes(searchTerm);

                        if (levelMatch && textMatch) {
                            line.style.display = '';
                            visibleCount++;

                            if (levelSpan) {
                                const levelText = levelSpan.textContent.toLowerCase().trim();
                                if (levelText === 'error') visibleErrors++;
                                if (levelText === 'warn') visibleWarnings++;
                            }

                            const dateSpan = line.querySelector('.log-date');
                            if (dateSpan) {
                                const dateText = dateSpan.textContent.trim().split(' ').slice(0, 2).join(' ');
                                const logDate = parseLogDate(dateText);

                                if (!oldestVisibleDate || logDate < oldestVisibleDate) {
                                    oldestVisibleDate = logDate;
                                }
                                if (!lastVisibleDate || logDate > lastVisibleDate) {
                                    lastVisibleDate = logDate;
                                }
                            }
                        } else {
                            line.style.display = 'none';
                        }
                    });

                    stackContainers.forEach(container => {
                        const prevLine = container.previousElementSibling;
                        const isPrevVisible = prevLine && prevLine.style.display !== 'none';

                        if (isPrevVisible) {
                            container.style.display = '';
                        } else {
                            container.style.display = 'none';
                        }

                        if (searchTerm) {
                            const content = container.querySelector('.stack-trace-content');
                            const btn = container.querySelector('.stack-trace-toggle');
                            if (content && content.style.display !== 'none') {
                                content.style.display = 'none';
                                if (btn) {
                                    btn.textContent = btn.textContent.replace('▼ Hide', '▶ Show');
                                }
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

                    let noResultsMsg = document.getElementById('no-results-msg');
                    if (!noResultsMsg) {
                        noResultsMsg = document.createElement('div');
                        noResultsMsg.id = 'no-results-msg';
                        noResultsMsg.textContent = 'Nenhum log encontrado para este filtro.';
                        noResultsMsg.className = 'no-results-message';
                        conteudoArquivoLog.appendChild(noResultsMsg);
                    }

                    if (visibleCount === 0) {
                        noResultsMsg.style.display = 'block';
                    } else {
                        noResultsMsg.style.display = 'none';
                    }
                }

                if (searchInput) {
                    searchInput.addEventListener('input', filterLogs);
                }

                checkboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', filterLogs);
                });

                const elements = Array.from(fragment.children);
                const header = elements.find(el => el.classList.contains('log-header'));
                const logs = elements.filter(el => !el.classList.contains('log-header'));

                if (header) conteudoArquivoLog.appendChild(header);
                logs.reverse().forEach(el => conteudoArquivoLog.appendChild(el));


                popup.style.display = 'flex';
                requestAnimationFrame(() => {
                    if (popupCard) popupCard.classList.add('show');
                    const container = document.querySelector('.containerArquivoLog');
                    if (container) container.scrollTop = 0;
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

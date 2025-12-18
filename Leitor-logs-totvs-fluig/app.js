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
    // Clear input so same file can be selected again if needed
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

                let stackTraceBuffer = [];
                let lastLogLevel = ''; // Keep track of the last seen log level

                function createStackTraceBlock(buffer, level) {
                    const container = document.createElement('div');
                    container.className = 'stack-trace-container';
                    if (level) {
                        container.dataset.level = level; // Tag container with valid log level
                    }

                    const toggleBtn = document.createElement('button');
                    toggleBtn.className = 'stack-trace-toggle';
                    toggleBtn.textContent = `▶ Show Stack Trace (${buffer.length} lines)`;

                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'stack-trace-content';
                    contentDiv.style.display = 'none';

                    buffer.forEach(traceLine => {
                        const lineDiv = document.createElement('div');
                        lineDiv.className = 'log-line log-stacktrace';
                        lineDiv.textContent = traceLine;
                        contentDiv.appendChild(lineDiv);
                    });

                    toggleBtn.onclick = () => {
                        const isHidden = contentDiv.style.display === 'none';
                        contentDiv.style.display = isHidden ? 'block' : 'none';
                        toggleBtn.textContent = isHidden
                            ? `▼ Hide Stack Trace (${buffer.length} lines)`
                            : `▶ Show Stack Trace (${buffer.length} lines)`;
                    };

                    container.appendChild(toggleBtn);
                    container.appendChild(contentDiv);
                    return container;
                }

                lines.forEach(line => {
                    // Check if line is part of stack trace
                    const isStackTrace = line.trim().startsWith('at ') || line.trim().startsWith('...');

                    if (isStackTrace) {
                        stackTraceBuffer.push(line);
                    } else {
                        // Flush stack trace buffer if it has content (belongs to previous line's level)
                        if (stackTraceBuffer.length > 0) {
                            fragment.appendChild(createStackTraceBlock(stackTraceBuffer, lastLogLevel));
                            stackTraceBuffer = [];
                        }

                        const div = document.createElement('div');
                        div.className = 'log-line';

                        // Regex to parse: Date Level [Class] (Thread) Message
                        const regex = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})\s+(INFO|WARN|ERROR|DEBUG|FATAL)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$/;
                        const match = line.match(regex);

                        if (match) {
                            const [, date, level, className, thread, message] = match;

                            // Update last seen level
                            lastLogLevel = level.toLowerCase();

                            div.innerHTML = `
                                <span class="log-date">${date}</span>
                                <span class="log-level log-level-${level.toLowerCase()}">${level}</span>
                                <span class="log-class">${className}</span>
                                <span class="log-thread">${thread}</span>
                                <span class="log-message">${message}</span>
                            `;
                        } else {
                            // Non-standard line: keep previous level context or no?
                            // Usually continuation of message. Let's keep lastLogLevel.
                            div.textContent = line;
                        }

                        fragment.appendChild(div);
                    }
                });

                // Flush remaining buffer at the end
                if (stackTraceBuffer.length > 0) {
                    fragment.appendChild(createStackTraceBlock(stackTraceBuffer, lastLogLevel));
                }

                // Filter Logic
                const searchInput = document.getElementById('searchInput');
                const radioButtons = document.querySelectorAll('input[name="logLevel"]');

                function filterLogs() {
                    const searchTerm = searchInput.value.toLowerCase();
                    const selectedRadio = document.querySelector('input[name="logLevel"]:checked');
                    const selectedLevel = selectedRadio ? selectedRadio.value.toLowerCase() : 'all';

                    const logLines = conteudoArquivoLog.querySelectorAll('.log-line');
                    const stackContainers = conteudoArquivoLog.querySelectorAll('.stack-trace-container');

                    // Filter Logic
                    let visibleCount = 0;

                    // Filter Standard Log Lines
                    logLines.forEach(line => {
                        if (line.classList.contains('log-stacktrace')) return;

                        const text = line.textContent.toLowerCase();
                        const levelSpan = line.querySelector('.log-level');

                        let levelMatch = true;

                        if (selectedLevel !== 'all') {
                            if (levelSpan) {
                                const levelText = levelSpan.textContent.toLowerCase().trim();
                                levelMatch = (levelText === selectedLevel);
                            } else {
                                levelMatch = false;
                            }
                        }

                        const textMatch = text.includes(searchTerm);

                        if (levelMatch && textMatch) {
                            line.style.display = 'block';
                            visibleCount++;
                        } else {
                            line.style.display = 'none';
                        }
                    });

                    // Filter Stack Trace Containers
                    stackContainers.forEach(container => {
                        // Check container level
                        const containerLevel = container.dataset.level; // might be undefined

                        let levelMatch = true;

                        if (selectedLevel !== 'all') {
                            if (containerLevel) {
                                levelMatch = (containerLevel === selectedLevel);
                            } else {
                                // Stack traces without level (orphaned? or start of file?)
                                // Hide them if filtering strictly.
                                levelMatch = false;
                            }
                        }

                        const text = container.textContent.toLowerCase();
                        const textMatch = text.includes(searchTerm);

                        if (levelMatch && textMatch) {
                            container.style.display = 'block';
                            visibleCount++;
                        } else {
                            container.style.display = 'none';
                        }
                    });

                    // Handle "No Results" message
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

                radioButtons.forEach(radio => {
                    radio.addEventListener('change', filterLogs);
                });

                conteudoArquivoLog.appendChild(fragment);

                popup.style.display = 'flex';
                requestAnimationFrame(() => {
                    if (popupCard) popupCard.classList.add('show');
                });

                const closeBtn = document.getElementById('fechar');
                if (closeBtn) {
                    closeBtn.onclick = () => {
                        if (popupCard) popupCard.classList.remove('show');
                        setTimeout(() => {
                            popup.style.display = 'none';
                            conteudoArquivoLog.textContent = '';
                        }, 300);
                    };
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

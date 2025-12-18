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

    // Relaxed check: allow .txt, .log, or any text type, or even if type is empty but name has extension
    // The previous check might fail on some windows machines where .log doesn't have a MIME type
    if (file.name.toLowerCase().endsWith('.log') || file.name.toLowerCase().endsWith('.txt') || file.type.startsWith('text/')) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;

            const conteudoArquivoLog = document.getElementById('conteudoArquivoLog');
            const popup = document.getElementById('arquivoLogPopup');
            const popupCard = popup.querySelector('.popupCard');

            if (conteudoArquivoLog && popup) {
                // Clear previous content
                conteudoArquivoLog.innerHTML = '';

                const lines = content.split('\n');
                const fragment = document.createDocumentFragment();

                lines.forEach(line => {
                    const div = document.createElement('div');
                    div.className = 'log-line';

                    // Regex to parse: Date Level [Class] (Thread) Message
                    const regex = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})\s+(INFO|WARN|ERROR|DEBUG|FATAL)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$/;
                    const match = line.match(regex);

                    if (match) {
                        const [, date, level, className, thread, message] = match;

                        div.innerHTML = `
                            <span class="log-date">${date}</span>
                            <span class="log-level log-level-${level.toLowerCase()}">${level}</span>
                            <span class="log-class">${className}</span>
                            <span class="log-thread">${thread}</span>
                            <span class="log-message">${message}</span>
                        `;
                    } else {
                        // If line doesn't match specific format (e.g. stack trace), just print it
                        // Check if it looks like a stack trace or continuation
                        if (line.trim().startsWith('at') || line.trim().startsWith('...')) {
                            div.classList.add('log-stacktrace');
                        }
                        div.textContent = line;
                    }

                    fragment.appendChild(div);
                });

                conteudoArquivoLog.appendChild(fragment);

                // Show popup container first
                popup.style.display = 'flex';

                // Add class for animation/visibility
                // Use setTimeout to allow display:flex to apply before adding class for transition
                requestAnimationFrame(() => {
                    if (popupCard) popupCard.classList.add('show');
                });

                // Close button handler
                const closeBtn = document.getElementById('fechar');
                if (closeBtn) {
                    closeBtn.onclick = () => {
                        if (popupCard) popupCard.classList.remove('show');

                        // Wait for transition
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

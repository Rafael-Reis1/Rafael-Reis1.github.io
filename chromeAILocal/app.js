const promptText = document.getElementById('promptText');
const messagesContainer = document.getElementById('messages');
const sendButton = document.getElementById('sendButton');
const LIMITE_HISTORICO = 40;
let historicoMensagens = [];

function handleSendMessage() {
    const userText = promptText.value;
    if (userText.trim() === "") return;

    addHistorico({ role: 'user', content: userText });

    const escapedUserText = userText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const userHtml = `<p class="message">${escapedUserText}</p>`;
    addMessage(userHtml, 'user');
    
    const messageId = 'msg-' + Date.now();
    const assistantHtml = `<div class="message" id="${messageId}">
                             <div class="typing-indicator"></div>
                           </div>`;
    addMessage(assistantHtml, 'assistant');

    aiApiCall(historicoMensagens, messageId);
    
    promptText.value = '';
}

promptText.onkeydown = function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();

        if (event.ctrlKey) {
            const start = promptText.selectionStart;
            const end = promptText.selectionEnd;
            
            promptText.value = promptText.value.substring(0, start) + "\n" + promptText.value.substring(end);
            
            promptText.selectionStart = promptText.selectionEnd = start + 1;

        } else {
            handleSendMessage();
            promptText.style.height = 'auto';
        }
    }
}

sendButton.onclick = function() {
    handleSendMessage();
}

async function aiApiCall(historicoMensagens, elementIdToUpdate) {
    promptText.disabled = true;
    const elementToUpdate = document.getElementById(elementIdToUpdate);
    let session;

    try {
        if (!(await LanguageModel.availability())) {
            throw new Error('A API de IA integrada não está disponível. Verifique se ela está ativada em chrome://flags/#prompt-api-for-gemini-nano');
        }

        const DOWNLOAD_MESSAGE_ID = 'aviso-download-modelo';
        let downloadMessageAdded = false;

        session = await LanguageModel.create({
            monitor(m) {
                m.addEventListener('downloadprogress', (e) => {
                    const existingMsg = document.getElementById(DOWNLOAD_MESSAGE_ID);
                    
                    if (e.loaded > 0 && e.loaded < 1) { 
                        const percentage = (e.loaded * 100).toFixed(0);
                        let messageText;
                        
                        if (e.loaded < 0.85) {
                            messageText = `Baixando modelo (${percentage}%)`;
                        } 
                        else { 
                            messageText = `Download concluído. Processando e carregando o modelo... Por favor, aguarde.`;
                        }
                        
                        const avisoDownloadContent = `
                            <p><b>Preparando IA:</b> ${messageText}</p>
                            <progress 
                                value="${e.loaded}" 
                                max="1" 
                                style="width: 100%; border-radius: 8px; overflow: hidden;"
                            ></progress>
                        `;
                        
                        if (!downloadMessageAdded) {
                            const avisoDownload = `<div class="message" id="${DOWNLOAD_MESSAGE_ID}">${avisoDownloadContent}</div>`;
                            addMessage(avisoDownload, 'assistant');
                            downloadMessageAdded = true;
                        } else if (existingMsg) {
                            existingMsg.innerHTML = avisoDownloadContent;
                        }

                    }
                    
                    else if (e.loaded === 1 && existingMsg) {
                        existingMsg.innerHTML = '<p><b>Quase lá!</b> Download concluído. Carregando o modelo de IA...</p>';
                    }
                });
            },
        });

        const stream = await session.promptStreaming(historicoMensagens);
        const reader = stream.getReader();

        let fullResponse = "";
        let firstChunk = true;

        let renderBuffer = "";
        let lastRenderTime = 0;
        const RENDER_INTERVAL = 20;

        const render = (force = false) => {
            const now = Date.now();
            
            if (!force && (now - lastRenderTime < RENDER_INTERVAL)) {
                return; 
            }
            if (renderBuffer === "") return;

            lastRenderTime = now;
            fullResponse += renderBuffer;
            renderBuffer = "";

            const isScrolledToBottom = messagesContainer.scrollHeight - messagesContainer.clientHeight <= messagesContainer.scrollTop + 30;

            const unsafeHtml = marked.parse(fullResponse);
            elementToUpdate.innerHTML = DOMPurify.sanitize(unsafeHtml);

            elementToUpdate.querySelectorAll('pre code:not(.hljs-added)').forEach((block) => {
                hljs.highlightElement(block);
                block.classList.add('hljs-added');
            });

            if (isScrolledToBottom) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        };


        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                render(true);
                break;
            }

            if (firstChunk) {
                elementToUpdate.className = 'message is-streaming';
                
                if (document.getElementById(DOWNLOAD_MESSAGE_ID)) {
                    document.getElementById(DOWNLOAD_MESSAGE_ID).remove();
                }
                firstChunk = false;
            }

            renderBuffer += value;
            
            render(false); 
        }

        addHistorico({ role: 'assistant', content: fullResponse });

        addCopyButtons(elementToUpdate);

    } catch (error) {
        console.error('Erro ao chamar a API de IA:', error);
        elementToUpdate.innerHTML = `<p class="error-message"><b>Erro:</b> ${error.message}</p>`;
    } finally {
        if (session) {
            session.destroy();
        }
        elementToUpdate.classList.remove('is-streaming');
    }
    promptText.disabled = false;
    promptText.focus();
}

function addHistorico(messageObject) {
  if (historicoMensagens.length >= LIMITE_HISTORICO) {
    historicoMensagens.splice(0, 2); 
  }
  if (messageObject && messageObject.role && typeof messageObject.content === 'string') {
      historicoMensagens.push({
          role: messageObject.role,
          content: messageObject.content
      });
  }
}

function addMessage(htmlContent, role) {
    const message = `
        <div class="${role === 'user' ? 'rowUser' : 'rowAssistant'}"> 
            ${htmlContent}
        </div>
    `;
    messagesContainer.insertAdjacentHTML('beforeend', message);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addCopyButtons(element) {
    element.querySelectorAll('pre').forEach(pre => {
        if (pre.parentNode.classList.contains('code-block-wrapper')) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';

        const button = document.createElement('button');
        button.className = 'copy-code-button';
        button.textContent = 'Copiar';

        button.onclick = () => {
            const code = pre.querySelector('code');
            if (code) {
                navigator.clipboard.writeText(code.innerText);
                button.textContent = 'Copiado!';
                setTimeout(() => { button.textContent = 'Copiar'; }, 2000);
            }
        };

        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
        wrapper.appendChild(button);
    });
}

document.getElementById('btnVoltar').onclick = function() {
    if (window.opener) {
        window.close();
    } else {
        window.location.href = '../index.html';
    }
};

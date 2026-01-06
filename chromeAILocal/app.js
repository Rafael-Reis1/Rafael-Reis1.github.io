const promptText = document.getElementById('promptText');
const messagesContainer = document.getElementById('messages');
const sendButton = document.getElementById('sendButton');
const stopButton = document.getElementById('stopButton');
const btnNewChat = document.getElementById('btnNewChat');
const chatListContainer = document.getElementById('chatList');
const sidebar = document.getElementById('sidebar');
const menuButton = document.getElementById('menuButton');
const overlay = document.getElementById('overlay');

let allChats = [];
let currentChatId = null;
let abortController = null;

window.addEventListener('load', () => {
    loadAllChats();
});

function toggleSidebar() {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

menuButton.onclick = toggleSidebar;
overlay.onclick = toggleSidebar;

function loadAllChats() {
    const savedChats = localStorage.getItem('allChats');
    if (savedChats) {
        allChats = JSON.parse(savedChats);
    }

    if (allChats.length === 0) {
        createNewChat();
    } else {
        switchChat(allChats[0].id);
    }
    renderChatList();
}

function saveAllChats() {
    localStorage.setItem('allChats', JSON.stringify(allChats));
}

function createNewChat() {
    const newChat = {
        id: Date.now().toString(),
        title: 'Novo Chat',
        messages: [],
        timestamp: Date.now()
    };

    allChats.unshift(newChat);
    saveAllChats();
    switchChat(newChat.id);
    renderChatList();

    if (window.innerWidth <= 768) {
        if (sidebar && sidebar.classList.contains('open')) toggleSidebar();
    }
}

function deleteChat(chatId, event) {
    if (event) event.stopPropagation();

    if (!confirm('Excluir este chat?')) return;

    allChats = allChats.filter(c => c.id !== chatId);
    saveAllChats();

    if (currentChatId === chatId) {
        if (allChats.length > 0) {
            switchChat(allChats[0].id);
        } else {
            createNewChat();
        }
    } else {
        renderChatList();
    }
}

function switchChat(chatId) {
    currentChatId = chatId;
    const chat = allChats.find(c => c.id === chatId);
    messagesContainer.innerHTML = '';

    if (chat) {
        chat.messages.forEach(msg => {
            renderMessage(msg, false);
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    renderChatList();

    if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

function updateChatTitle(chatId, firstMessageContent) {
    const chat = allChats.find(c => c.id === chatId);
    if (chat && chat.title === 'Novo Chat') {
        const generatedTitle = firstMessageContent.slice(0, 30) + (firstMessageContent.length > 30 ? '...' : '');
        chat.title = generatedTitle;
        saveAllChats();
        renderChatList();
    }
}

function renderChatList() {
    if (!chatListContainer) return;

    chatListContainer.innerHTML = '';
    allChats.forEach(chat => {
        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;

        item.onclick = (e) => {
            if (!e.target.closest('.chat-action-btn')) {
                switchChat(chat.id);
            }
        };

        item.innerHTML = `
            <span>${chat.title}</span>
            <div class="chat-actions">
                <button class="chat-action-btn edit" title="Renomear">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                </button>
                <button class="chat-action-btn delete" title="Excluir">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;

        const editBtn = item.querySelector('.chat-action-btn.edit');
        const deleteBtn = item.querySelector('.chat-action-btn.delete');

        editBtn.onclick = (e) => renameChat(chat.id, e);
        deleteBtn.onclick = (e) => deleteChat(chat.id, e);

        chatListContainer.appendChild(item);
    });
}

function renameChat(chatId, event) {
    if (event) event.stopPropagation();

    const chat = allChats.find(c => c.id === chatId);
    if (!chat) return;

    const newTitle = prompt('Renomear chat para:', chat.title);
    if (newTitle && newTitle.trim() !== '') {
        chat.title = newTitle.trim();
        saveAllChats();
        renderChatList();
    }
}

function renderMessage(msg, shouldScroll = true) {
    if (msg.role === 'user') {
        const escapedUserText = msg.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const userHtml = `<p class="message">${escapedUserText}</p>`;
        addMessage(userHtml, 'user', shouldScroll);
    } else if (msg.role === 'assistant') {
        const divId = 'msg-' + Math.random().toString(36).substr(2, 9);
        const assistantDiv = `<div class="message" id="${divId}"></div>`;
        addMessage(assistantDiv, 'assistant', shouldScroll);

        const elementToUpdate = document.getElementById(divId);
        if (elementToUpdate) {
            const unsafeHtml = marked.parse(msg.content);
            elementToUpdate.innerHTML = DOMPurify.sanitize(unsafeHtml);
            elementToUpdate.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
            addCopyButtons(elementToUpdate);
        }
    }
}

if (btnNewChat) btnNewChat.onclick = createNewChat;

function handleSendMessage() {
    const userText = promptText.value;
    if (userText.trim() === "") return;

    const currentChat = allChats.find(c => c.id === currentChatId);
    let context = [];

    if (currentChat) {
        currentChat.messages.push({ role: 'user', content: userText });
        saveAllChats();

        if (currentChat.messages.length === 1) {
            updateChatTitle(currentChatId, userText);
        }

        context = currentChat.messages.map(m => ({ role: m.role, content: m.content }));
    }

    renderMessage({ role: 'user', content: userText });

    const messageId = 'msg-' + Date.now();
    const assistantHtml = `<div class="message" id="${messageId}">
                             <div class="typing-indicator"></div>
                           </div>`;
    addMessage(assistantHtml, 'assistant');

    sendButton.style.display = 'none';
    stopButton.style.display = 'block';

    abortController = new AbortController();

    aiApiCall(context, messageId, abortController.signal);

    promptText.value = '';
    promptText.style.height = 'auto';
}

promptText.addEventListener('input', function () {
    this.style.height = 'auto';

    if (this.scrollHeight > 200) {
        this.style.height = '200px';
        this.style.overflowY = 'auto';
    } else {
        this.style.height = (this.scrollHeight) + 'px';
        this.style.overflowY = 'hidden';
    }

    if (this.value === '') {
        this.style.height = 'auto';
        this.style.overflowY = 'hidden';
    }
});

promptText.onkeydown = function (event) {
    if (event.key === 'Enter') {
        if (event.shiftKey) {
            return;
        } else {
            event.preventDefault();
            handleSendMessage();
        }
    }
}

stopButton.onclick = function () {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
};

sendButton.onclick = function () {
    handleSendMessage();
}

async function aiApiCall(historicoMensagens, elementIdToUpdate, signal) {
    promptText.disabled = true;
    const elementToUpdate = document.getElementById(elementIdToUpdate);
    let session;
    let reader;

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
        reader = stream.getReader();

        let fullResponse = "";
        let firstChunk = true;

        let renderBuffer = "";
        let lastRenderTime = 0;
        const RENDER_INTERVAL = 100;

        const render = (force = false) => {
            const now = Date.now();

            if (!force && (now - lastRenderTime < RENDER_INTERVAL)) {
                return;
            }
            if (renderBuffer === "") return;

            const isAtBottom = (messagesContainer.scrollHeight - messagesContainer.scrollTop) <= (messagesContainer.clientHeight + 100);

            lastRenderTime = now;
            fullResponse += renderBuffer;
            renderBuffer = "";

            const unsafeHtml = marked.parse(fullResponse);
            elementToUpdate.innerHTML = DOMPurify.sanitize(unsafeHtml);

            elementToUpdate.querySelectorAll('pre code:not(.hljs-added)').forEach((block) => {
                hljs.highlightElement(block);
                block.classList.add('hljs-added');
            });

            if (isAtBottom) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        };


        while (true) {
            if (signal && signal.aborted) {
                reader.cancel();
                break;
            }

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

        const currentChat = allChats.find(c => c.id === currentChatId);
        if (currentChat) {
            currentChat.messages.push({ role: 'assistant', content: fullResponse });
            saveAllChats();
        }

        addCopyButtons(elementToUpdate);

    } catch (error) {
        if (signal && signal.aborted) {
            console.log('Geração interrompida pelo usuário.');
        } else {
            console.error('Erro ao chamar a API de IA:', error);
            elementToUpdate.innerHTML = `<p class="error-message"><b>Erro:</b> ${error.message}</p>`;
        }
    } finally {
        if (session) {
            session.destroy();
        }
        elementToUpdate.classList.remove('is-streaming');

        sendButton.style.display = 'block';
        stopButton.style.display = 'none';
        promptText.disabled = false;
        promptText.focus();
        abortController = null;
    }
}



function addMessage(htmlContent, role, shouldScroll = true) {
    const message = `
        <div class="${role === 'user' ? 'rowUser' : 'rowAssistant'}"> 
            ${htmlContent}
        </div>
    `;
    messagesContainer.insertAdjacentHTML('beforeend', message);
    if (shouldScroll) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
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

document.getElementById('btnVoltar').onclick = function () {
    if (window.opener) {
        window.close();
    } else {
        window.location.href = '../index.html';
    }
};

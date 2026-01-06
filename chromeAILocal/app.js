class PersonaManager {
    constructor() {
        this.personas = [];
        this.load();
    }

    load() {
        const saved = localStorage.getItem('personas');
        if (saved) {
            this.personas = JSON.parse(saved);
        } else {
            this.personas = [
                { id: 'default', name: 'Padrão (Sem Prompt)', prompt: '' },
                { id: '1', name: 'Dev Frontend', prompt: 'Você é um especialista em desenvolvimento Frontend (HTML, CSS, JS). Responda com código limpo e moderno.' },
                { id: '2', name: 'Tradutor EN-PT', prompt: 'Você é um tradutor profissional. Traduza tudo o que eu disser do Inglês para o Português (Brasil) ou vice-versa, mantendo o contexto.' }
            ];
            this.save();
        }
    }

    save() {
        localStorage.setItem('personas', JSON.stringify(this.personas));
    }

    getAll() {
        return this.personas;
    }

    get(id) {
        return this.personas.find(p => p.id === id);
    }

    create(name, prompt) {
        const newPersona = {
            id: Date.now().toString(),
            name,
            prompt
        };
        this.personas.push(newPersona);
        this.save();
        return newPersona;
    }

    update(id, name, prompt) {
        const persona = this.get(id);
        if (persona) {
            persona.name = name;
            persona.prompt = prompt;
            this.save();
        }
    }

    delete(id) {
        if (id === 'default') return;
        this.personas = this.personas.filter(p => p.id !== id);
        this.save();
    }
}

class ChatManager {
    constructor() {
        this.chats = [];
        this.activeChatId = null;
        this.load();
    }

    load() {
        const saved = localStorage.getItem('allChats');
        this.chats = saved ? JSON.parse(saved) : [];
    }

    save() {
        localStorage.setItem('allChats', JSON.stringify(this.chats));
    }

    getAll() {
        return this.chats;
    }

    create(systemPrompt = '') {
        const chat = {
            id: Date.now().toString(),
            title: 'Novo Chat',
            messages: [],
            systemPrompt: systemPrompt,
            timestamp: Date.now()
        };
        this.chats.unshift(chat);
        this.save();
        return chat;
    }

    delete(id) {
        this.chats = this.chats.filter(c => c.id !== id);
        this.save();
    }

    rename(id, newTitle) {
        const chat = this.chats.find(c => c.id === id);
        if (chat) {
            chat.title = newTitle;
            this.save();
        }
    }

    get(id) {
        return this.chats.find(c => c.id === id);
    }

    addMessage(id, role, content) {
        const chat = this.chats.find(c => c.id === id);
        if (chat) {
            chat.messages.push({ role, content });
            this.save();
        }
    }

    autoUpdateTitle(id, content) {
        const chat = this.chats.find(c => c.id === id);
        if (chat && chat.title === 'Novo Chat') {
            chat.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
            this.save();
            return true;
        }
        return false;
    }
}

class AIService {
    constructor() {
        this.session = null;
    }

    get factory() {
        if (typeof LanguageModel !== 'undefined') return LanguageModel;
        if (window.ai && window.ai.languageModel) return window.ai.languageModel;
        return null;
    }

    async isAvailable() {
        if (!this.factory) return false;
        try {
            return (await this.factory.availability()) !== 'no';
        } catch {
            return false;
        }
    }

    async generateStream(messages, systemPrompt, callbacks, signal) {
        const { onChunk, onDownloadProgress } = callbacks;

        try {
            if (this.session) {
                this.session.destroy();
                this.session = null;
            }

            if (!this.factory) throw new Error('Model factory not found');

            const lastMessage = messages[messages.length - 1];
            const history = messages.slice(0, -1);

            const initialPrompts = [];
            if (systemPrompt) {
                initialPrompts.push({ role: 'system', content: systemPrompt });
            }
            initialPrompts.push(...history);

            const options = {
                initialPrompts,
                monitor(m) {
                    m.addEventListener('downloadprogress', e => {
                        if (onDownloadProgress) onDownloadProgress(e);
                    });
                }
            };

            this.session = await this.factory.create(options);

            const stream = await this.session.promptStreaming(lastMessage.content, { signal });
            const reader = stream.getReader();

            while (true) {
                if (signal?.aborted) break;
                const { done, value } = await reader.read();
                if (done) break;
                onChunk(value);
            }

        } finally {
            if (this.session) {
                this.session.destroy();
                this.session = null;
            }
        }
    }
}

class UIManager {
    constructor(chatManager, aiService, personaManager) {
        this.chats = chatManager;
        this.ai = aiService;
        this.personas = personaManager;
        this.abortController = null;
        this.renderBuffer = "";
        this.lastRenderTime = 0;

        this.els = {
            prompt: document.getElementById('promptText'),
            messages: document.getElementById('messages'),
            sendBtn: document.getElementById('sendButton'),
            stopBtn: document.getElementById('stopButton'),
            newChatBtn: document.getElementById('btnNewChat'),
            chatList: document.getElementById('chatList'),
            sidebar: document.getElementById('sidebar'),
            menuBtn: document.getElementById('menuButton'),
            overlay: document.getElementById('overlay'),
            backBtn: document.getElementById('btnVoltar'),
            personasBtn: document.getElementById('btnPersonas'),
            personasModal: document.getElementById('personasModal'),
            closeModalBtn: document.querySelector('.close-modal'),
            personasList: document.getElementById('personasList'),
            addPersonaBtn: document.getElementById('btnAddPersona'),
            personaForm: document.getElementById('personaForm'),
            savePersonaBtn: document.getElementById('btnSavePersona'),
            cancelPersonaBtn: document.getElementById('btnCancelPersona'),
            inputPersonaName: document.getElementById('inputPersonaName'),
            inputPersonaPrompt: document.getElementById('inputPersonaPrompt'),
            personaEditor: document.getElementById('personaEditor')
        };

        this.init();
    }

    init() {
        window.addEventListener('load', () => this.loadInitialState());

        if (this.els.menuBtn) this.els.menuBtn.onclick = () => this.toggleSidebar();
        if (this.els.overlay) this.els.overlay.onclick = () => this.toggleSidebar();

        if (this.els.newChatBtn) this.els.newChatBtn.onclick = () => this.createNewChat();

        if (this.els.backBtn) {
            this.els.backBtn.onclick = () => {
                if (window.opener) window.close();
                else window.location.href = '../index.html';
            };
        }

        if (this.els.sendBtn) this.els.sendBtn.onclick = () => this.handleSend();
        if (this.els.stopBtn) this.els.stopBtn.onclick = () => this.handleStop();

        if (this.els.prompt) {
            this.els.prompt.addEventListener('input', () => this.adjustTextarea());
            this.els.prompt.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSend();
                }
            };
        }

        if (this.els.personasBtn) this.els.personasBtn.onclick = () => this.openPersonasModal();
        if (this.els.closeModalBtn) this.els.closeModalBtn.onclick = () => this.closePersonasModal();
        if (this.els.personasModal) {
            this.els.personasModal.onclick = (e) => {
                if (e.target === this.els.personasModal) this.closePersonasModal();
            };
        }
        if (this.els.addPersonaBtn) this.els.addPersonaBtn.onclick = () => this.showPersonaEditor();
        if (this.els.cancelPersonaBtn) this.els.cancelPersonaBtn.onclick = () => this.hidePersonaEditor();
        if (this.els.savePersonaBtn) this.els.savePersonaBtn.onclick = () => this.savePersona();

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.els.personasModal && this.els.personasModal.classList.contains('active')) {
                    this.closePersonasModal();
                }
            }
        });
    }

    loadInitialState() {
        if (this.chats.getAll().length === 0) {
            this.createNewChat();
        } else {
            this.switchChat(this.chats.getAll()[0].id);
        }
    }

    toggleSidebar() {
        if (this.els.sidebar) this.els.sidebar.classList.toggle('open');
        if (this.els.overlay) this.els.overlay.classList.toggle('active');
    }

    createNewChat(systemPrompt = '') {
        const chat = this.chats.create(systemPrompt);
        this.switchChat(chat.id);
        if (window.innerWidth <= 768 && this.els.sidebar && this.els.sidebar.classList.contains('open')) {
            this.toggleSidebar();
        }
    }

    switchChat(id) {
        this.chats.activeChatId = id;
        const chat = this.chats.get(id);

        if (this.els.messages) this.els.messages.innerHTML = '';

        if (chat) {
            chat.messages.forEach(msg => this.renderMessage(msg.role, msg.content, false));
        }

        this.scrollToBottom();
        this.renderChatList();

        if (window.innerWidth <= 768 && this.els.sidebar && this.els.sidebar.classList.contains('open')) {
            this.toggleSidebar();
        }
    }

    deleteChat(id, e) {
        if (e) e.stopPropagation();
        if (!confirm('Excluir este chat?')) return;

        this.chats.delete(id);

        if (this.chats.activeChatId === id) {
            const all = this.chats.getAll();
            if (all.length > 0) this.switchChat(all[0].id);
            else this.createNewChat();
        } else {
            this.renderChatList();
        }
    }

    renameChat(id, e) {
        if (e) e.stopPropagation();
        const chat = this.chats.get(id);
        if (!chat) return;

        const newTitle = prompt('Renomear chat para:', chat.title);
        if (newTitle && newTitle.trim()) {
            this.chats.rename(id, newTitle.trim());
            this.renderChatList();
        }
    }

    renderChatList() {
        if (!this.els.chatList) return;
        this.els.chatList.innerHTML = '';

        this.chats.getAll().forEach(chat => {
            const item = document.createElement('div');
            item.className = `chat-item ${chat.id === this.chats.activeChatId ? 'active' : ''}`;

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

            item.onclick = (e) => {
                if (!e.target.closest('.chat-action-btn')) this.switchChat(chat.id);
            };

            item.querySelector('.edit').onclick = (e) => this.renameChat(chat.id, e);
            item.querySelector('.delete').onclick = (e) => this.deleteChat(chat.id, e);

            this.els.chatList.appendChild(item);
        });
    }

    openPersonasModal() {
        this.renderPersonasList();
        this.hidePersonaEditor();
        this.els.personasModal.classList.add('active');
    }

    closePersonasModal() {
        this.els.personasModal.classList.remove('active');
    }

    renderPersonasList() {
        if (!this.els.personasList) return;
        this.els.personasList.innerHTML = '';

        this.personas.getAll().forEach(p => {
            const el = document.createElement('div');
            el.className = 'persona-item';
            el.innerHTML = `
                <div class="persona-info">
                    <strong>${p.name}</strong>
                    <p>${p.prompt ? p.prompt.substring(0, 60) + (p.prompt.length > 60 ? '...' : '') : 'Padrão'}</p>
                </div>
                <div class="persona-actions">
                    <button class="btn-primary-small start-chat">Conversar</button>
                    ${p.id !== 'default' ? `
                    <button class="chat-action-btn edit" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
                    <button class="chat-action-btn delete" title="Excluir"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                    ` : ''}
                </div>
            `;

            el.querySelector('.start-chat').onclick = () => {
                this.createNewChat(p.prompt);
                this.closePersonasModal();
            };

            if (p.id !== 'default') {
                el.querySelector('.edit').onclick = () => this.showPersonaEditor(p);
                el.querySelector('.delete').onclick = () => {
                    if (confirm(`Excluir persona "${p.name}"?`)) {
                        this.personas.delete(p.id);
                        this.renderPersonasList();
                    }
                };
            }

            this.els.personasList.appendChild(el);
        });
    }

    showPersonaEditor(persona = null) {
        this.currentEditingId = persona ? persona.id : null;
        this.els.inputPersonaName.value = persona ? persona.name : '';
        this.els.inputPersonaPrompt.value = persona ? persona.prompt : '';
        this.els.personasList.style.display = 'none';
        this.els.addPersonaBtn.style.display = 'none';
        this.els.personaEditor.style.display = 'flex';
    }

    hidePersonaEditor() {
        this.els.personaEditor.style.display = 'none';
        this.els.personasList.style.display = '';
        this.els.addPersonaBtn.style.display = '';
        this.currentEditingId = null;
    }

    savePersona() {
        const name = this.els.inputPersonaName.value.trim();
        const prompt = this.els.inputPersonaPrompt.value.trim();

        if (!name) {
            alert('Nome é obrigatório');
            return;
        }

        if (this.currentEditingId) {
            this.personas.update(this.currentEditingId, name, prompt);
        } else {
            this.personas.create(name, prompt);
        }

        this.renderPersonasList();
        this.hidePersonaEditor();
    }

    async handleSend() {
        const text = this.els.prompt.value.trim();
        if (!text) return;

        const chatId = this.chats.activeChatId;
        const currentChat = this.chats.get(chatId);

        if (currentChat) {
            this.chats.addMessage(chatId, 'user', text);
            if (currentChat.messages.length === 1) {
                if (this.chats.autoUpdateTitle(chatId, text)) {
                    this.renderChatList();
                }
            }
        }

        this.renderMessage('user', text);
        this.els.prompt.value = '';
        this.adjustTextarea();

        const msgId = 'msg-' + Date.now();
        this.addMessageToDOM(`<div class="message" id="${msgId}"><div class="typing-indicator"></div></div>`, 'assistant');

        this.setLoadingState(true);
        this.abortController = new AbortController();

        try {
            if (!(await this.ai.isAvailable())) {
                throw new Error('API de IA não disponível. Verifique as flags do Chrome.');
            }

            let fullResponse = "";
            let firstChunk = true;
            const msgElement = document.getElementById(msgId);
            const downloadMsgId = 'download-progress-msg';

            const context = currentChat ? currentChat.messages.map(m => ({ role: m.role, content: m.content })) : [];
            const systemPrompt = currentChat ? currentChat.systemPrompt : '';

            await this.ai.generateStream(
                context,
                systemPrompt,
                {
                    onChunk: (text) => {
                        if (firstChunk) {
                            msgElement.className = 'message is-streaming';
                            const dlMsg = document.getElementById(downloadMsgId);
                            if (dlMsg) dlMsg.remove();
                            firstChunk = false;
                        }

                        fullResponse += text;
                        this.throttledRender(fullResponse, msgElement, false);
                    },
                    onDownloadProgress: (e) => {
                        this.handleDownloadProgress(e, downloadMsgId);
                    }
                },
                this.abortController.signal
            );

            this.throttledRender(fullResponse, msgElement, true);
            this.chats.addMessage(chatId, 'assistant', fullResponse);
            this.addCopyButtons(msgElement);

        } catch (error) {
            if (this.abortController?.signal.aborted) {
                console.log('Cancelado pelo usuário');
            } else {
                const msgElement = document.getElementById(msgId);
                if (msgElement) msgElement.innerHTML = `<p class="error-message"><b>Erro:</b> ${error.message}</p>`;
            }
        } finally {
            this.setLoadingState(false);
            const msgElement = document.getElementById(msgId);
            if (msgElement) msgElement.classList.remove('is-streaming');
            this.abortController = null;
        }
    }

    handleStop() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    handleDownloadProgress(e, msgId) {
        let existing = document.getElementById(msgId);

        if (e.loaded > 0 && e.loaded < 1) {
            const pct = (e.loaded * 100).toFixed(0);
            const text = e.loaded < 0.85 ? `Baixando modelo (${pct}%)` : `Processando modelo...`;

            const html = `
                <p><b>Preparando IA:</b> ${text}</p>
                <progress value="${e.loaded}" max="1" style="width: 100%; border-radius: 8px; overflow: hidden;"></progress>
            `;

            if (!existing) {
                this.addMessageToDOM(`<div class="message" id="${msgId}">${html}</div>`, 'assistant');
            } else {
                existing.innerHTML = html;
            }
        } else if (e.loaded === 1 && existing) {
            existing.innerHTML = '<p><b>Quase lá!</b> Carregando modelo...</p>';
        }
    }

    throttledRender(fullText, element, force) {
        const now = Date.now();
        if (!force && (now - this.lastRenderTime < 100)) return;

        this.lastRenderTime = now;
        this.renderMarkdownUpdate(fullText, element);
    }

    renderMarkdownUpdate(text, element) {
        const unsafe = marked.parse(text);
        element.innerHTML = DOMPurify.sanitize(unsafe);
        element.querySelectorAll('pre code:not(.hljs-added)').forEach(block => {
            hljs.highlightElement(block);
            block.classList.add('hljs-added');
        });
        this.scrollToBottom();
    }

    renderMessage(role, content, animate = true) {
        let html = '';
        if (role === 'user') {
            const escaped = content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            html = `<p class="message">${escaped}</p>`;
        } else {
            const id = 'msg-' + Math.random().toString(36).substr(2, 9);
            html = `<div class="message" id="${id}"></div>`;
            setTimeout(() => {
                const el = document.getElementById(id);
                if (el) {
                    this.renderMarkdownUpdate(content, el);
                    this.addCopyButtons(el);
                }
            }, 0);
        }
        this.addMessageToDOM(html, role);
    }

    addMessageToDOM(html, role) {
        const div = document.createElement('div');
        div.className = role === 'user' ? 'rowUser' : 'rowAssistant';
        div.innerHTML = html;
        this.els.messages.appendChild(div);
        this.scrollToBottom();
    }

    scrollToBottom() {
        if (this.els.messages) this.els.messages.scrollTop = this.els.messages.scrollHeight;
    }

    setLoadingState(isLoading) {
        if (this.els.sendBtn) this.els.sendBtn.style.display = isLoading ? 'none' : 'block';
        if (this.els.stopBtn) this.els.stopBtn.style.display = isLoading ? 'block' : 'none';
        if (this.els.prompt) this.els.prompt.disabled = isLoading;
        if (!isLoading && this.els.prompt) {
            this.els.prompt.focus();
        }
    }

    adjustTextarea() {
        const el = this.els.prompt;
        if (!el) return;
        el.style.height = 'auto';
        if (el.scrollHeight > 200) {
            el.style.height = '200px';
            el.style.overflowY = 'auto';
        } else {
            el.style.height = el.scrollHeight + 'px';
            el.style.overflowY = 'hidden';
        }
        if (el.value === '') {
            el.style.height = 'auto';
        }
    }

    addCopyButtons(element) {
        element.querySelectorAll('pre').forEach(pre => {
            if (pre.parentNode.classList.contains('code-block-wrapper')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            const btn = document.createElement('button');
            btn.className = 'copy-code-button';
            btn.textContent = 'Copiar';
            btn.onclick = () => {
                const code = pre.querySelector('code');
                if (code) {
                    navigator.clipboard.writeText(code.innerText);
                    btn.textContent = 'Copiado!';
                    setTimeout(() => btn.textContent = 'Copiar', 2000);
                }
            };

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);
            wrapper.appendChild(btn);
        });
    }
}

const personaManager = new PersonaManager();
const chatManager = new ChatManager();
const aiService = new AIService();
const uiManager = new UIManager(chatManager, aiService, personaManager);

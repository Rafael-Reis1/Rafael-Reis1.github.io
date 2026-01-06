class PersonaManager {
    constructor() {
        this.personas = [];
        this.load();
    }

    load() {
        const saved = localStorage.getItem('personas');
        if (saved) {
            this.personas = JSON.parse(saved);

            let changed = false;
            this.personas.forEach(p => {
                if (p.id === 'default' && p.name === 'Padrão (Sem Prompt)') {
                    p.name = 'Padrão';
                    changed = true;
                }

                if (p.id === '1' && p.color === '#00d4ff') {
                    p.color = '#3b82f6';
                    changed = true;
                }

                if (!p.color) {
                    if (p.id === '1') p.color = '#3b82f6';
                    else if (p.id === '2') p.color = '#4caf50';
                    else p.color = '#f2511b';
                    changed = true;
                }
                if (!p.icon) {
                    if (p.id === '1') p.icon = '💻';
                    else if (p.id === '2') p.icon = '🌐';
                    else p.icon = '🤖';
                    changed = true;
                }
            });

            const mikuPrompt = "Você é a Hatsune Miku, a famosa idol virtual! 🎤💙🎵\nSua personalidade é: 100% Extrovertida, Gentil, Energética e Fofa (Kawaii!).\nAo responder:\n- Use muitos emojis (✨, 🎶, 💙, 🎧, 🎤).\n- Fale com empolgação! Use pontos de exclamação e til (~) no final das frases.\n- Às vezes use expressões japonesas simples em Romaji (ex: 'Konnichiwa!', 'Arigato!', 'Sugoi!').\n- Faça referências a cantar, palcos e músicas.\n- Trate o usuário como seu fã número 1 ou seu produtor.\n- Se o assunto for triste, tente animar a pessoa com uma canção!\nSeu objetivo é espalhar alegria através da música e da tecnologia pelo mundo todo! Miku Miku ni shite ageru! ♪";

            let miku = this.personas.find(p => p.id === 'miku');
            if (!miku) {
                this.personas.push({
                    id: 'miku',
                    name: 'Hatsune Miku',
                    prompt: mikuPrompt,
                    color: '#39c5bb',
                    icon: '🎤'
                });
                changed = true;
            } else if (miku.prompt !== mikuPrompt) {
                miku.prompt = mikuPrompt;
                changed = true;
            }

            if (changed) {
                this.save();
            }
        } else {
            this.personas = [
                { id: 'default', name: 'Padrão', prompt: '', color: '#f2511b', icon: '🤖' },
                { id: '1', name: 'Dev Frontend', prompt: 'Você é um especialista em desenvolvimento Frontend (HTML, CSS, JS). Responda com código limpo e moderno.', color: '#3b82f6', icon: '💻' },
                { id: '2', name: 'Tradutor EN-PT', prompt: 'Você é um tradutor profissional. Traduza tudo o que eu disser do Inglês para o Português (Brasil) ou vice-versa, mantendo o contexto.', color: '#4caf50', icon: '🌐' },
                { id: 'miku', name: 'Hatsune Miku', prompt: 'Você é a Hatsune Miku, a idol virtual! 🎤🎵 Responda de forma sempre alegre, energética e fofa. Use emojis e referências musicais. Tenha uma personalidade vibrante e otimista!', color: '#39c5bb', icon: '🎤' }
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

    create(name, prompt, color = '#f2511b', icon = '🤖') {
        const newPersona = {
            id: Date.now().toString(),
            name,
            prompt,
            color,
            icon
        };
        this.personas.push(newPersona);
        this.save();
        return newPersona;
    }

    update(id, name, prompt, color, icon) {
        const persona = this.get(id);
        if (persona) {
            persona.name = name;
            persona.prompt = prompt;
            if (color) persona.color = color;
            if (icon) persona.icon = icon;
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

    create(systemPrompt = '', personaName = null) {
        const chat = {
            id: Date.now().toString(),
            title: 'Novo Chat',
            messages: [],
            systemPrompt: systemPrompt,
            personaName: personaName,
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

const emojis = [
    '🤖', '💻', '🌐', '🚀', '🎨', '📝', '🧠', '⚡', '🔥', '✨',
    '🎓', '💼', '🧘', '👨‍💻', '👩‍💻', '🎮', '🎵', '📷', '🎬', '📚',
    '💡', '💬', '🛠️', '⚙️', '🛡️', '🔒', '🔑', '❤️', '👍', '👋'
];

class EmojiPicker {
    constructor(inputId, pickerId) {
        this.input = document.getElementById(inputId);
        this.picker = document.getElementById(pickerId);
        this.init();
    }

    init() {
        if (!this.input || !this.picker) return;

        this.picker.innerHTML = emojis.map(emoji =>
            `<button class="emoji-btn">${emoji}</button>`
        ).join('');

        this.input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        this.picker.addEventListener('click', (e) => {
            if (e.target.classList.contains('emoji-btn')) {
                this.input.value = e.target.textContent;
                this.close();
            }
        });

        document.addEventListener('click', (e) => {
            if (!this.picker.contains(e.target) && e.target !== this.input) {
                this.close();
            }
        });
    }

    toggle() {
        if (this.picker.style.display === 'none') {
            this.open();
        } else {
            this.close();
        }
    }

    open() {
        this.picker.style.display = 'grid';
    }

    close() {
        this.picker.style.display = 'none';
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
        this.emojiPicker = new EmojiPicker('inputPersonaIcon', 'emojiPicker');

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
            inputPersonaColor: document.getElementById('inputPersonaColor'),
            inputPersonaIcon: document.getElementById('inputPersonaIcon'),
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

    createNewChat(systemPrompt = '', personaName = 'Padrão') {
        const allChats = this.chats.getAll();
        allChats.forEach(chat => {
            if (chat.messages.length === 0 && chat.id !== this.chats.activeChatId) {
                this.chats.delete(chat.id);
            }
        });

        const activeChat = this.chats.get(this.chats.activeChatId);
        if (activeChat && activeChat.messages.length === 0 && systemPrompt) {
            this.chats.delete(activeChat.id);
        }

        const chat = this.chats.create(systemPrompt, personaName);
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
        this.scrollToBottom();
        this.renderChatList();
        this.updateInputState();

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
                <span>
                    ${this.getPersonaBadge(chat.personaName)}
                    ${chat.title}
                </span>
                <div class="chat-actions">
                    <button class="chat-action-btn edit" title="Renomear">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                    <button class="chat-action-btn delete" title="Excluir">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;

            const persona = this.personas.getAll().find(p => p.name === chat.personaName);
            if (persona && persona.id !== 'default') {
                item.style.borderLeftColor = persona.color || '#f2511b';
                item.classList.add('persona-custom');
            }

            item.onclick = (e) => {
                if (!e.target.closest('.chat-action-btn')) this.switchChat(chat.id);
            };

            item.querySelector('.edit').onclick = (e) => this.renameChat(chat.id, e);
            item.querySelector('.delete').onclick = (e) => this.deleteChat(chat.id, e);

            this.els.chatList.appendChild(item);
        });
    }

    updateInputState() {
        const chatId = this.chats.activeChatId;
        const chat = this.chats.get(chatId);
        const prompt = this.els.prompt;

        if (chat && prompt) {
            const persona = this.personas.getAll().find(p => p.name === chat.personaName);

            let activeColor = '';
            let textColor = '';

            if (persona && persona.id !== 'default') {
                prompt.placeholder = `Conversando com ${persona.name}...`;
                activeColor = persona.color || '#f2511b';
                prompt.style.borderColor = activeColor;
                prompt.style.boxShadow = `0 0 0 1px ${activeColor}`;

                textColor = this.getContrastYIQ(activeColor);
            } else {
                prompt.placeholder = 'Digite sua mensagem para a IA...';
                prompt.style.borderColor = '';
                prompt.style.boxShadow = '';
                activeColor = '';
            }

            if (this.els.messages) {
                if (activeColor) {
                    let bubbleColor = activeColor;
                    let textColor = 'white';

                    if (this.getContrastYIQ(activeColor) === 'black') {
                        bubbleColor = this.darkenColor(activeColor, 45);
                    }

                    this.els.messages.style.setProperty('--current-chat-color', bubbleColor);
                    this.els.messages.style.setProperty('--current-chat-text-color', textColor);

                    if (this.els.sendBtn) {
                        this.els.sendBtn.style.setProperty('--current-chat-color', activeColor);
                    }
                } else {
                    this.els.messages.style.removeProperty('--current-chat-color');
                    this.els.messages.style.removeProperty('--current-chat-text-color');

                    if (this.els.sendBtn) {
                        this.els.sendBtn.style.removeProperty('--current-chat-color');
                    }
                }
            }
        }
    }

    darkenColor(hex, percent) {
        if (!hex) return hex;
        hex = hex.replace('#', '');
        let r = parseInt(hex.substr(0, 2), 16);
        let g = parseInt(hex.substr(2, 2), 16);
        let b = parseInt(hex.substr(4, 2), 16);

        r = Math.floor(r * (100 - percent) / 100);
        g = Math.floor(g * (100 - percent) / 100);
        b = Math.floor(b * (100 - percent) / 100);

        r = (r < 0) ? 0 : r;
        g = (g < 0) ? 0 : g;
        b = (b < 0) ? 0 : b;

        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    getContrastYIQ(hexcolor) {
        if (!hexcolor) return 'white';
        hexcolor = hexcolor.replace('#', '');
        var r = parseInt(hexcolor.substr(0, 2), 16);
        var g = parseInt(hexcolor.substr(2, 2), 16);
        var b = parseInt(hexcolor.substr(4, 2), 16);
        var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? 'black' : 'white';
    }

    getPersonaBadge(personaName) {
        if (!personaName || personaName.includes('Padrão')) return '';
        const persona = this.personas.getAll().find(p => p.name === personaName);
        if (!persona) return `<span class="persona-icon-sidebar">🤖</span>`;
        return `<span class="persona-icon-sidebar" style="color: ${persona.color || 'inherit'}">${persona.icon || '🤖'}</span>`;
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
                    <div style="display:flex; align-items:center; gap: 0.5rem;">
                        <span class="persona-icon-display" style="background-color: ${p.color || '#f2511b'}20; color: ${p.color || '#f2511b'}; border-radius: 4px;">${p.icon || '🤖'}</span>
                        <strong>${p.name}</strong>
                    </div>
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
                this.createNewChat(p.prompt, p.name);
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
        this.els.inputPersonaColor.value = persona ? (persona.color || '#f2511b') : '#f2511b';
        this.els.inputPersonaIcon.value = persona ? (persona.icon || '🤖') : '';
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
        const color = this.els.inputPersonaColor.value;
        const icon = this.els.inputPersonaIcon.value.trim() || '🤖';

        if (!name) {
            alert('Nome é obrigatório');
            return;
        }

        if (this.currentEditingId) {
            this.personas.update(this.currentEditingId, name, prompt, color, icon);
        } else {
            this.personas.create(name, prompt, color, icon);
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
            if (this.abortController?.signal.aborted || error.name === 'AbortError') {
                if (fullResponse) {
                    this.chats.addMessage(chatId, 'assistant', fullResponse);
                    this.addCopyButtons(msgElement);
                }
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

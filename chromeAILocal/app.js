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

                if (p.id === '2' && (p.name === 'Tradutor EN-PT' || !p.name)) {
                    p.name = 'Revisor de Texto PT';
                    p.prompt = 'Você é um revisor de textos especialista em Português. Corrija gramática, ortografia e pontuação. Dê sugestões para melhorar a clareza, coesão e fluidez, mas mantenha o tom original. Explique brevemente suas principais correções.';
                    p.icon = '✍️';
                    p.color = '#8e44ad';
                    changed = true;
                }

                if (p.name === 'Dev Frontend' && p.id !== '1') { p.id = '1'; changed = true; }
                if (p.name === 'Revisor de Texto PT' && p.id !== '2') { p.id = '2'; changed = true; }
                if (p.name === 'Hatsune Miku' && p.id !== 'miku') { p.id = 'miku'; changed = true; }

                if (p.id === '1' && p.color === '#00d4ff') {
                    p.color = '#3b82f6';
                    changed = true;
                }

                if (!p.color) {
                    if (p.id === '1') p.color = '#3b82f6';
                    else if (p.id === '2') p.color = '#8e44ad';
                    else p.color = '#f2511b';
                    changed = true;
                }
                if (!p.icon) {
                    if (p.id === '1') p.icon = '💻';
                    else if (p.id === '2') p.icon = '✍️';
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
                { id: '2', name: 'Revisor de Texto PT', prompt: 'Você é um revisor de textos especialista em Português. Corrija gramática, ortografia e pontuação. Dê sugestões para melhorar a clareza, coesão e fluidez, mas mantenha o tom original. Explique brevemente suas principais correções.', color: '#8e44ad', icon: '✍️' },
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

    create(systemPrompt = '', personaName = null, personaIcon = null, personaColor = null) {
        const chat = {
            id: Date.now().toString(),
            title: 'Novo Chat',
            messages: [],
            systemPrompt: systemPrompt,
            personaName: personaName,
            personaIcon: personaIcon,
            personaColor: personaColor,
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
        const { onChunk, onDownloadProgress, onStats } = callbacks;
        const startTime = Date.now();
        let fullResponse = '';

        try {
            if (this.session) {
                this.session.destroy();
                this.session = null;
            }

            if (!this.factory) throw new Error('Model factory not found');

            const lastMessage = messages[messages.length - 1];
            const history = messages.slice(0, -1);

            const mermaidInstruction = 'Sempre que precisar criar fluxogramas, organogramas, diagramas, gráficos ou qualquer visualização de processos, use OBRIGATORIAMENTE a sintaxe Mermaid dentro de um bloco de código ```mermaid. Nunca use ASCII art ou descrições textuais para representar processos visuais.';

            const initialPrompts = [];
            const fullSystemPrompt = systemPrompt
                ? `${mermaidInstruction}\n\n${systemPrompt}`
                : mermaidInstruction;
            initialPrompts.push({ role: 'system', content: fullSystemPrompt });
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
            let firstTokenTime = null;

            while (true) {
                if (signal?.aborted) break;
                const { done, value } = await reader.read();
                if (done) break;
                if (!firstTokenTime) firstTokenTime = Date.now();
                fullResponse += value;
                onChunk(fullResponse);
            }

            if (onStats && fullResponse) {
                try {
                    const endTime = Date.now();
                    const durationSeconds = (endTime - startTime) / 1000;
                    const ttftMs = firstTokenTime ? (firstTokenTime - startTime) : 0;

                    const generationTimeSeconds = firstTokenTime ? (endTime - firstTokenTime) / 1000 : durationSeconds;

                    let tokenCount;
                    if (this.session && typeof this.session.countPromptTokens === 'function') {
                        tokenCount = await this.session.countPromptTokens(fullResponse);
                    } else {
                        tokenCount = Math.ceil(fullResponse.length / 4);
                    }

                    const tokensPerSecond = generationTimeSeconds > 0 ? (tokenCount / generationTimeSeconds).toFixed(1) : 0;

                    onStats({
                        tokens: tokenCount,
                        duration: durationSeconds.toFixed(2),
                        tokensPerSecond,
                        ttft: ttftMs
                    });
                } catch (statsErr) {
                    console.warn('Could not calculate stats:', statsErr);
                }
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

    setReadOnly(readOnly) {
        if (this.input) {
            this.input.style.pointerEvents = readOnly ? 'none' : 'auto';
            this.input.readOnly = readOnly;
        }
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

const colors = [
    '#f2511b', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
    '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39',
    '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b',
    '#39c5bb', '#3b82f6', '#ef4444', '#f97316', '#84cc16', '#06b6d4'
];

class ColorPicker {
    constructor(previewId, pickerId) {
        this.preview = document.getElementById(previewId);
        this.picker = document.getElementById(pickerId);
        this.selectedColor = '#f2511b';
        this.init();
    }

    init() {
        if (!this.preview || !this.picker) return;

        this.picker.innerHTML = colors.map(color =>
            `<button class="color-btn" style="background: ${color};" data-color="${color}"></button>`
        ).join('');

        this.preview.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        this.picker.addEventListener('click', (e) => {
            if (e.target.classList.contains('color-btn')) {
                this.selectColor(e.target.dataset.color);
                this.close();
            }
        });

        document.addEventListener('click', (e) => {
            if (!this.picker.contains(e.target) && e.target !== this.preview) {
                this.close();
            }
        });
    }

    setReadOnly(readOnly) {
        if (this.preview) {
            this.preview.style.pointerEvents = readOnly ? 'none' : 'auto';
        }
    }

    selectColor(color) {
        this.selectedColor = color;
        this.preview.style.background = color;

        this.picker.querySelectorAll('.color-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.color === color);
        });
    }

    getValue() {
        return this.selectedColor;
    }

    setValue(color) {
        this.selectColor(color);
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
        this.colorPicker = new ColorPicker('inputPersonaColor', 'colorPicker');

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
            personaEditor: document.getElementById('personaEditor'),
            btnImportPersona: document.getElementById('btnImportPersona'),
            btnExportAllPersonas: document.getElementById('btnExportAllPersonas'),
            importPersonaFile: document.getElementById('importPersonaFile'),
            btnExportChats: document.getElementById('btnExportChats'),
            btnImportChats: document.getElementById('btnImportChats'),
            importChatsFile: document.getElementById('importChatsFile'),
            modalFooter: document.querySelector('.modal-footer'),
            genericModal: document.getElementById('genericModal'),
            genericModalTitle: document.getElementById('genericModalTitle'),
            genericModalMessage: document.getElementById('genericModalMessage'),
            genericModalOkBtn: document.getElementById('genericModalOkBtn'),
            genericModalCancelBtn: document.getElementById('genericModalCancelBtn'),
            closeGenericModalBtn: document.getElementById('closeGenericModal'),
            genericModalInput: document.getElementById('genericModalInput'),
            genericModalFooter: document.getElementById('genericModalFooter')
        };

        this.init();
    }

    init() {
        try {
            if (window.mermaid) {
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'dark',
                    flowchart: { useMaxWidth: false, htmlLabels: true },
                    sequence: { useMaxWidth: false },
                    securityLevel: 'loose'
                });
            }
        } catch (e) {
            console.error('Mermaid init error:', e);
        }

        try {
            const renderer = new marked.Renderer();
            const originalCode = renderer.code.bind(renderer);

            renderer.code = (code, language) => {
                let text = code;
                let lang = language;

                if (typeof code === 'object' && code !== null && !Array.isArray(code)) {
                    text = code.text || '';
                    lang = code.lang || '';
                }

                let codeContent = String(text || '');

                codeContent = codeContent.replace(/^mermaid\s*\n/i, '');

                const isMermaid = (lang && lang.toLowerCase() === 'mermaid') ||
                    /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline)\b/i.test(codeContent);

                if (isMermaid) {
                    const chatId = this.chats.activeChatId;
                    const chat = this.chats.get(chatId);
                    const personaColor = chat?.personaColor || '#f2511b';
                    const darkColor = this.darkenColor(personaColor, 40);

                    const fixLabel = (id, open, content, close) => {
                        let text = (content || '').trim();
                        if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
                        text = text.replace(/"/g, "'");
                        return `${id || ''}${open}"${text}"${close}`;
                    };

                    let fixedCode = codeContent.replace(/(\b\w+)?\s*(?:\[([^\]]*)\]|\{([^\}]*)\}|\(([^\)]*)\))/g, (match, id, c1, c2, c3) => {
                        if (c1 !== undefined) return fixLabel(id, '[', c1, ']');
                        if (c2 !== undefined) return fixLabel(id, '{', c2, '}');
                        if (c3 !== undefined) return fixLabel(id, '(', c3, ')');
                        return match;
                    });

                    fixedCode = fixedCode
                        .replace(/fill\s*:\s*#[a-fA-F0-9]{3,6}/gi, `fill:${darkColor}`)
                        .replace(/stroke\s*:\s*#[a-fA-F0-9]{3,6}/gi, `stroke:${personaColor}`);

                    const textColor = this.getContrastYIQ(darkColor) === 'black' ? '#000000' : '#ffffff';
                    fixedCode += `\n    classDef default fill:${darkColor},stroke:${personaColor},stroke-width:2px,color:${textColor};`;

                    const encodedCode = encodeURIComponent(fixedCode);
                    return `
                        <div class="mermaid-wrapper">
                            <div class="mermaid-top-bar">
                                <span class="mermaid-label">Diagrama</span>
                                <div style="display: flex; gap: 8px;">
                                    <button class="reset-zoom-btn">
                                        Reset Zoom
                                    </button>
                                    <button class="copy-mermaid-btn" data-data="${encodedCode}">
                                        Copiar Código
                                    </button>
                                </div>
                            </div>
                            <div class="mermaid">${fixedCode}</div>
                        </div>`;
                }
                return originalCode(code, language);
            };

            marked.use({ renderer });
        } catch (e) {
            console.error('Marked init error:', e);
        }

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
        this.els.personasModal.onclick = (e) => {
            if (e.target === this.els.personasModal) this.closePersonasModal();
        };

        if (this.els.closeGenericModalBtn) this.els.closeGenericModalBtn.onclick = () => this.els.genericModal.classList.remove('active');
        if (this.els.addPersonaBtn) this.els.addPersonaBtn.onclick = () => this.showPersonaEditor();
        if (this.els.cancelPersonaBtn) this.els.cancelPersonaBtn.onclick = () => this.hidePersonaEditor();
        if (this.els.savePersonaBtn) this.els.savePersonaBtn.onclick = () => this.savePersona();

        if (this.els.btnImportPersona) this.els.btnImportPersona.onclick = () => this.els.importPersonaFile?.click();
        if (this.els.importPersonaFile) this.els.importPersonaFile.onchange = (e) => this.handleImportPersona(e);
        if (this.els.btnExportAllPersonas) this.els.btnExportAllPersonas.onclick = () => this.exportAllPersonas();
        if (this.els.btnExportChats) this.els.btnExportChats.onclick = () => this.exportAllChats();
        if (this.els.btnImportChats) this.els.btnImportChats.onclick = () => this.els.importChatsFile?.click();
        if (this.els.importChatsFile) this.els.importChatsFile.onchange = (e) => this.handleImportChats(e);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.els.personasModal && this.els.personasModal.classList.contains('active')) {
                    this.closePersonasModal();
                }

                if (this.els.genericModal && this.els.genericModal.classList.contains('active')) {
                    if (this.els.genericModalCancelBtn && this.els.genericModalCancelBtn.offsetParent !== null) {
                        this.els.genericModalCancelBtn.click();
                    }
                    else if (this.els.closeGenericModalBtn) {
                        this.els.closeGenericModalBtn.click();
                    }
                    else {
                        this.els.genericModal.classList.remove('active');
                    }
                }
            } else if (e.key === 'Enter') {
                if (this.els.genericModal && this.els.genericModal.classList.contains('active')) {
                    if (document.activeElement !== this.els.genericModalInput) {
                        e.preventDefault();
                        e.stopPropagation();

                        if (this.els.genericModalOkBtn && this.els.genericModalOkBtn.offsetParent !== null) {
                            this.els.genericModalOkBtn.click();
                        }
                        else if (this.els.genericModalFooter) {
                            const primaryBtn = this.els.genericModalFooter.querySelector('.btn-primary');
                            if (primaryBtn) primaryBtn.click();
                            else {
                                const firstBtn = this.els.genericModalFooter.querySelector('button');
                                if (firstBtn) firstBtn.click();
                            }
                        }
                    }
                }

                if (this.els.personaEditor && this.els.personaEditor.style.display !== 'none') {
                    if (document.activeElement !== this.els.inputPersonaPrompt) {
                        e.preventDefault();
                        e.stopPropagation();

                        if (this.els.savePersonaBtn && this.els.savePersonaBtn.offsetParent !== null) {
                            this.els.savePersonaBtn.click();
                        }
                    }
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

    createNewChat(systemPrompt = '', personaName = 'Padrão', personaIcon = null, personaColor = null) {
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

        const chat = this.chats.create(systemPrompt, personaName, personaIcon, personaColor);
        this.switchChat(chat.id);
        if (window.innerWidth <= 768 && this.els.sidebar && this.els.sidebar.classList.contains('open')) {
            this.toggleSidebar();
        }

        setTimeout(() => { if (this.els.prompt) this.els.prompt.focus(); }, 100);
    }

    switchChat(id) {
        this.chats.activeChatId = id;
        const chat = this.chats.get(id);

        if (this.els.messages) this.els.messages.innerHTML = '';

        if (chat) {
            chat.messages.forEach(msg => this.renderMessage(msg.role, msg.content, false));
        }

        setTimeout(() => this.scrollToBottom(true), 50);

        this.renderChatList();
        this.updateInputState();

        if (window.innerWidth <= 768 && this.els.sidebar && this.els.sidebar.classList.contains('open')) {
            this.toggleSidebar();
        }
    }

    deleteChat(id, e) {
        if (e) e.stopPropagation();
        this.showDialog('Excluir este chat?', {
            title: 'Confirmar Exclusão',
            type: 'confirm',
            onConfirm: () => {
                this.chats.delete(id);

                if (this.chats.activeChatId === id) {
                    const all = this.chats.getAll();
                    if (all.length > 0) this.switchChat(all[0].id);
                    else this.createNewChat();
                } else {
                    this.renderChatList();
                }
            }
        });
    }

    renameChat(id, e) {
        if (e) e.stopPropagation();
        const chat = this.chats.get(id);
        if (!chat) return;

        this.showDialog('Digite o novo nome do chat:', {
            title: 'Renomear Chat',
            type: 'prompt',
            defaultValue: chat.title,
            onConfirm: (newTitle) => {
                if (newTitle && newTitle.trim()) {
                    this.chats.rename(id, newTitle.trim());
                    this.renderChatList();
                }
            }
        });
    }

    renderChatList() {
        if (!this.els.chatList) return;
        this.els.chatList.innerHTML = '';

        this.chats.getAll().forEach(chat => {
            const item = document.createElement('div');
            item.className = `chat-item ${chat.id === this.chats.activeChatId ? 'active' : ''}`;

            item.innerHTML = `
                <span>
                    ${this.getPersonaBadge(chat.personaName, chat.personaIcon, chat.personaColor)}
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

    showDialog(message, options = {}) {
        const {
            title = 'Atenção',
            type = 'alert',
            defaultValue = '',
            onConfirm = () => { },
            onCancel = () => { },
            buttons = []
        } = options;

        if (this.els.genericModalTitle) this.els.genericModalTitle.textContent = title;
        if (this.els.genericModalMessage) this.els.genericModalMessage.textContent = message;

        if (this.els.genericModalInput) {
            if (type === 'prompt') {
                this.els.genericModalInput.style.display = 'block';
                this.els.genericModalInput.value = defaultValue;

                this.els.genericModalInput.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.els.genericModalOkBtn.click();
                    }
                };

                setTimeout(() => this.els.genericModalInput.focus(), 100);
            } else {
                this.els.genericModalInput.style.display = 'none';
                this.els.genericModalInput.onkeydown = null;
            }
        }

        if (buttons.length > 0) {
            if (this.els.genericModalFooter) {
                this.els.genericModalFooter.innerHTML = '';
                this.els.genericModalFooter.style.flexDirection = 'column';
                this.els.genericModalFooter.style.alignItems = 'stretch';

                buttons.forEach(btn => {
                    const button = document.createElement('button');
                    button.textContent = btn.text;
                    button.className = btn.class || 'btn-primary';
                    button.style.width = '100%';
                    button.onclick = () => {
                        this.els.genericModal.classList.remove('active');
                        if (btn.onClick) btn.onClick();
                    };
                    this.els.genericModalFooter.appendChild(button);
                });
            }
        } else {
            if (this.els.genericModalFooter) {
                this.els.genericModalFooter.style.flexDirection = 'row';
                this.els.genericModalFooter.style.alignItems = 'center';
                this.els.genericModalFooter.innerHTML = '';

                const cancelBtn = document.createElement('button');
                cancelBtn.id = 'genericModalCancelBtn';
                cancelBtn.className = 'btn-secondary';
                cancelBtn.textContent = 'Cancelar';
                cancelBtn.style.display = (type === 'confirm' || type === 'prompt') ? 'block' : 'none';
                cancelBtn.onclick = () => {
                    this.els.genericModal.classList.remove('active');
                    onCancel();
                };

                const okBtn = document.createElement('button');
                okBtn.id = 'genericModalOkBtn';
                okBtn.className = 'btn-primary';
                okBtn.textContent = 'OK';
                okBtn.onclick = () => {
                    const value = this.els.genericModalInput ? this.els.genericModalInput.value : null;
                    if (type === 'prompt' && !value) return;

                    this.els.genericModal.classList.remove('active');
                    onConfirm(value);
                };

                this.els.genericModalFooter.appendChild(cancelBtn);
                this.els.genericModalFooter.appendChild(okBtn);
            }
        }

        if (this.els.genericModal) {
            this.els.genericModal.classList.add('active');
        }
    }

    updateInputState() {
        const chatId = this.chats.activeChatId;
        const chat = this.chats.get(chatId);
        const prompt = this.els.prompt;

        if (chat && prompt) {
            const persona = this.personas.getAll().find(p => p.name === chat.personaName);

            const activePersonaName = persona ? persona.name : (chat.personaName || '');
            const activePersonaColor = persona ? (persona.color || '#f2511b') : (chat.personaColor || '');
            const shouldUsePersonaStyle = (persona && persona.id !== 'default') || (chat.personaName && chat.personaColor);

            let activeColor = '';
            let textColor = '';

            if (shouldUsePersonaStyle) {
                prompt.placeholder = `Conversando com ${activePersonaName}...`;
                activeColor = activePersonaColor;

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

                    prompt.style.borderColor = bubbleColor;
                    prompt.style.boxShadow = `0 0 0 1px ${bubbleColor}`;

                    this.els.messages.style.setProperty('--current-chat-color', bubbleColor);
                    this.els.messages.style.setProperty('--current-chat-text-color', textColor);

                    if (this.els.sendBtn) {
                        this.els.sendBtn.style.setProperty('--current-chat-color', bubbleColor);
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

    getPersonaBadge(personaName, iconSnapshot = null, colorSnapshot = null) {
        if (!personaName || personaName.includes('Padrão')) return '';
        const persona = this.personas.getAll().find(p => p.name === personaName);

        const icon = persona ? (persona.icon || '🤖') : (iconSnapshot || '🤖');
        const color = persona ? (persona.color || 'inherit') : (colorSnapshot || 'inherit');

        if (!persona && !iconSnapshot) return `<span class="persona-icon-sidebar">🤖</span>`;

        return `<span class="persona-icon-sidebar" style="color: ${color}">${icon}</span>`;
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
                    <p>${p.id === 'default' ? 'Assistente geral do Chrome AI. Versátil e útil para a maioria das tarefas.' : (p.prompt ? p.prompt.substring(0, 60) + (p.prompt.length > 60 ? '...' : '') : 'Sem descrição')}</p>
                </div>
                <div class="persona-actions">
                    <button class="btn-primary-small start-chat">Conversar</button>
                    ${!['default', '1', '2', 'miku'].includes(String(p.id)) ? `
                    <button class="chat-action-btn share" title="Compartilhar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg></button>
                    <button class="chat-action-btn edit" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
                    <button class="chat-action-btn delete" title="Excluir"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                    ` : `
                    <button class="chat-action-btn view" title="Ver Detalhes"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>
                    `}
                </div>
            `;

            el.querySelector('.start-chat').onclick = () => {
                this.createNewChat(p.prompt, p.name, p.icon, p.color);
                this.closePersonasModal();
            };

            if (!['default', '1', '2', 'miku'].includes(String(p.id))) {
                el.querySelector('.share').onclick = () => this.sharePersona(p);
                el.querySelector('.edit').onclick = () => this.showPersonaEditor(p);
                el.querySelector('.delete').onclick = () => {
                    this.showDialog(`Excluir persona "${p.name}"?`, {
                        title: 'Confirmar Exclusão',
                        type: 'confirm',
                        onConfirm: () => {
                            this.personas.delete(p.id);
                            this.renderPersonasList();
                            this.renderChatList();
                            const activeChat = this.chats.get(this.chats.activeChatId);
                            if (activeChat && activeChat.personaName === p.name) {
                                this.updateInputState();
                            }
                        }
                    });
                };
            } else {
                const viewBtn = el.querySelector('.view');
                if (viewBtn) viewBtn.onclick = () => this.showPersonaEditor(p, true);
            }

            this.els.personasList.appendChild(el);
        });
    }

    showPersonaEditor(persona = null, readOnly = false) {
        this.currentEditingId = persona ? persona.id : null;
        this.els.inputPersonaName.value = persona ? persona.name : '';
        this.els.inputPersonaPrompt.value = persona ? persona.prompt : '';
        this.colorPicker.setValue(persona ? (persona.color || '#f2511b') : '#f2511b');
        this.els.inputPersonaIcon.value = persona ? (persona.icon || '🤖') : '';
        this.els.inputPersonaName.disabled = readOnly;
        this.els.inputPersonaPrompt.disabled = readOnly;
        this.els.inputPersonaIcon.readOnly = readOnly;

        if (this.colorPicker.setReadOnly) this.colorPicker.setReadOnly(readOnly);
        if (this.emojiPicker.setReadOnly) this.emojiPicker.setReadOnly(readOnly);

        this.els.savePersonaBtn.style.display = readOnly ? 'none' : 'block';
        if (this.els.cancelPersonaBtn) {
            this.els.cancelPersonaBtn.textContent = readOnly ? 'Voltar' : 'Cancelar';
        }

        this.els.personasList.style.display = 'none';
        this.els.addPersonaBtn.style.display = 'none';

        if (this.els.modalFooter) this.els.modalFooter.style.display = 'none';

        this.els.personaEditor.style.display = 'flex';
    }

    hidePersonaEditor() {
        this.els.personaEditor.style.display = 'none';
        this.els.personasList.style.display = '';
        this.els.addPersonaBtn.style.display = '';
        if (this.els.modalFooter) this.els.modalFooter.style.display = '';
        this.currentEditingId = null;
    }

    savePersona() {
        const name = this.els.inputPersonaName.value.trim();
        const prompt = this.els.inputPersonaPrompt.value.trim();
        const color = this.colorPicker.getValue();
        const icon = this.els.inputPersonaIcon.value.trim() || '🤖';

        if (!name) {
            this.showDialog('Nome é obrigatório', { title: 'Erro' });
            return;
        }

        if (this.currentEditingId) {
            this.personas.update(this.currentEditingId, name, prompt, color, icon);
        } else {
            this.personas.create(name, prompt, color, icon);
        }

        this.renderPersonasList();
        this.renderChatList();
        this.updateInputState();
        this.hidePersonaEditor();
    }

    exportAllPersonas() {
        const personas = this.personas.getAll().filter(p => p.id !== 'default');
        const data = {
            type: 'personas',
            version: '1.0',
            exportDate: new Date().toISOString(),
            personas: personas
        };
        this.downloadJSON(data, 'personas-backup.json');
    }

    sharePersona(persona) {
        const data = {
            type: 'persona',
            version: '1.0',
            exportDate: new Date().toISOString(),
            name: persona.name,
            prompt: persona.prompt,
            color: persona.color,
            icon: persona.icon
        };
        const filename = `persona-${persona.name.toLowerCase().replace(/\s+/g, '-')}.json`;
        this.downloadJSON(data, filename);
    }

    handleImportPersona(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const existingNames = this.personas.getAll().map(p => p.name.toLowerCase());

                if (data.type === 'personas' && data.personas) {
                    let imported = 0;
                    let skipped = 0;
                    data.personas.forEach(p => {
                        if (p.name && p.prompt !== undefined) {
                            if (existingNames.includes(p.name.toLowerCase())) {
                                skipped++;
                            } else {
                                this.personas.create(p.name, p.prompt, p.color || '#f2511b', p.icon || '🤖');
                                existingNames.push(p.name.toLowerCase());
                                imported++;
                            }
                        }
                    });
                    this.showDialog(`${imported} persona(s) importada(s)${skipped > 0 ? `, ${skipped} ignorada(s) (duplicadas)` : ''}`, { title: 'Importação Concluída' });
                    this.renderPersonasList();
                } else if (data.name && data.prompt !== undefined) {
                    if (existingNames.includes(data.name.toLowerCase())) {
                        this.showDialog(`Persona "${data.name}" já existe.`, { title: 'Importação Falhou' });
                    } else {
                        this.personas.create(data.name, data.prompt, data.color || '#f2511b', data.icon || '🤖');
                        this.showDialog(`Persona "${data.name}" importada com sucesso!`, { title: 'Importação Concluída' });
                        this.renderPersonasList();
                    }
                } else {
                    this.showDialog('Arquivo inválido. Formato não reconhecido.', { title: 'Erro' });
                }
            } catch (err) {
                this.showDialog('Erro ao ler arquivo: ' + err.message, { title: 'Erro' });
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    exportAllChats() {
        const chats = this.chats.getAll();

        const usedPersonaNames = new Set(chats.map(c => c.personaName).filter(Boolean));
        const relatedPersonas = this.personas.getAll().filter(p => usedPersonaNames.has(p.name));

        const data = {
            type: 'chats',
            version: '1.0',
            exportDate: new Date().toISOString(),
            chats: chats,
            personas: relatedPersonas
        };
        this.downloadJSON(data, 'chats-backup.json');
    }

    downloadJSON(data, filename) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    handleImportChats(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (data.type === 'chats' && data.chats) {
                    const importPersonas = () => {
                        if (!data.personas) return 0;
                        const existingNames = new Set(this.personas.getAll().map(p => p.name));
                        let count = 0;
                        data.personas.forEach(p => {
                            if (!existingNames.has(p.name)) {
                                this.personas.personas.push(p);
                                existingNames.add(p.name);
                                count++;
                            }
                        });
                        if (count > 0) this.personas.save();
                        return count;
                    };

                    const checkMissing = (chatsToCheck) => {
                        const existingNames = this.personas.getAll().map(p => p.name);
                        const missing = new Set();
                        chatsToCheck.forEach(c => {
                            if (c.personaName && !existingNames.includes(c.personaName)) missing.add(c.personaName);
                        });
                        return missing.size > 0 ? `\n\nAtenção: Personas não encontradas:\n${Array.from(missing).join(', ')}` : '';
                    };

                    this.showDialog('Como deseja importar os chats?', {
                        title: 'Importar Chats',
                        type: 'custom',
                        buttons: [
                            {
                                text: 'Adicionar (Sem Duplicados)',
                                class: 'btn-primary',
                                onClick: () => {
                                    const importedPersonas = importPersonas();
                                    const existingChats = this.chats.getAll();
                                    let imported = 0;
                                    let skipped = 0;

                                    data.chats.forEach(chat => {
                                        const isDuplicate = existingChats.some(existing =>
                                            existing.title === chat.title &&
                                            existing.messages.length === chat.messages.length
                                        );

                                        if (isDuplicate) {
                                            skipped++;
                                        } else {
                                            chat.id = 'chat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                                            this.chats.chats.push(chat);
                                            imported++;
                                        }
                                    });
                                    this.chats.save();

                                    const warning = checkMissing(data.chats);
                                    const personaMsg = importedPersonas > 0 ? ` (+ ${importedPersonas} personas restauradas)` : '';

                                    this.showDialog(`${imported} chat(s) importado(s)${skipped > 0 ? `, ${skipped} ignorado(s) (duplicadas)` : ''}${personaMsg}${warning}`, { title: 'Importação Concluída' });

                                    this.renderChatList();
                                    this.renderPersonasList();
                                    if (this.chats.chats.length > 0) this.switchChat(this.chats.chats[0].id);
                                }
                            },
                            {
                                text: 'Substituir Tudo',
                                class: 'btn-primary-outline',
                                onClick: () => {
                                    const importedPersonas = importPersonas();
                                    localStorage.setItem('chats', JSON.stringify(data.chats));
                                    this.chats.chats = data.chats;

                                    const warning = checkMissing(data.chats);
                                    const personaMsg = importedPersonas > 0 ? ` (+ ${importedPersonas} personas restauradas)` : '';

                                    this.showDialog(`${data.chats.length} chat(s) importado(s) com sucesso!${personaMsg}${warning}`, { title: 'Sucesso' });

                                    this.renderChatList();
                                    this.renderPersonasList();
                                    if (this.chats.chats.length > 0) this.switchChat(this.chats.chats[0].id);
                                }
                            },
                            {
                                text: 'Cancelar',
                                class: 'btn-secondary',
                                onClick: () => { }
                            }
                        ]
                    });
                } else {
                    this.showDialog('Arquivo inválido. Formato não reconhecido.', { title: 'Erro' });
                }
            } catch (err) {
                this.showDialog('Erro ao ler arquivo: ' + err.message, { title: 'Erro' });
            }
        };
        reader.readAsText(file);
        event.target.value = '';
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
        const skeletonHtml = `
            <div class="message" id="${msgId}">
                <div class="skeleton-loading">
                    <div class="skeleton-line"></div>
                </div>
            </div>
        `;
        this.addMessageToDOM(skeletonHtml, 'assistant');

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
            let responseStats = null;

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

                        fullResponse = text;
                        this.throttledRender(fullResponse, msgElement, false);
                    },
                    onDownloadProgress: (e) => {
                        this.handleDownloadProgress(e, downloadMsgId);
                    },
                    onStats: (stats) => {
                        responseStats = stats;
                    }
                },
                this.abortController.signal
            );

            this.throttledRender(fullResponse, msgElement, true);
            this.chats.addMessage(chatId, 'assistant', fullResponse);
            this.addCopyButtons(msgElement);

            if (responseStats) {
                const statsHtml = `<div class="message-stats">Tokens: ${responseStats.tokens} · Velocidade: ${responseStats.tokensPerSecond} tok/s · Primeiro token: ${responseStats.ttft}ms · Tempo total: ${responseStats.duration}s</div>`;
                msgElement.insertAdjacentHTML('beforeend', statsHtml);
            }

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
        this.renderMarkdownUpdate(fullText, element, !force);
    }

    async renderMarkdownUpdate(text, element, isStreaming = false) {
        const unsafe = marked.parse(text);

        const sanitized = DOMPurify.sanitize(unsafe, {
            ADD_TAGS: ['div', 'button', 'svg', 'g', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'text', 'style', 'defs', 'marker', 'foreignObject'],
            ADD_ATTR: ['class', 'id', 'data-data', 'width', 'height', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'marker-end', 'transform', 'style']
        });

        element.innerHTML = sanitized;

        if (window.renderMathInElement) {
            renderMathInElement(element, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        }

        const mermaidNodes = element.querySelectorAll('.mermaid');
        if (!isStreaming && mermaidNodes.length > 0 && window.mermaid) {
            try {
                await mermaid.run({ nodes: mermaidNodes });

                if (window.panzoom) {
                    mermaidNodes.forEach(div => {
                        const svg = div.querySelector('svg');
                        if (svg && !svg.dataset.panzoomApplied) {
                            svg.dataset.panzoomApplied = 'true';
                            const instance = panzoom(svg, {
                                maxZoom: 5,
                                minZoom: 0.3,
                                bounds: true,
                                boundsPadding: 0.1
                            });

                            div._panzoomInstance = instance;
                        }
                    });
                }
            } catch (err) {
                console.error('Mermaid run failed:', err);
                mermaidNodes.forEach(div => {
                    if (!div.querySelector('svg')) {
                        const errorMsg = err.message || 'Syntax error';
                        div.innerHTML += `
                            <div style="color: #ff6b6b; border: 1px solid #ff6b6b; background: rgba(255,107,107,0.1); padding: 8px; margin-top: 8px; border-radius: 4px; font-family: monospace; font-size: 12px; white-space: pre-wrap;">
                                <strong>Mermaid Error:</strong>\n${errorMsg}
                            </div>`;
                    }
                });
            }
        } else if (isStreaming && mermaidNodes.length > 0) {
            mermaidNodes.forEach(node => {
                node.innerHTML = `<div class="mermaid-placeholder">Aguardando a IA terminar para renderizar o gráfico...</div>`;
            });
        }

        element.querySelectorAll('pre code:not(.language-mermaid):not(.hljs-added)').forEach(block => {
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

        if (role === 'assistant') {
            const chat = this.chats.get(this.chats.activeChatId);
            const persona = chat ? this.personas.getAll().find(p => p.name === chat.personaName) : null;
            const icon = persona?.icon || '🤖';
            const color = persona?.color || '#f2511b';

            div.innerHTML = `
                <div class="avatar" style="background-color: ${color}20; color: ${color};">${icon}</div>
                ${html}
            `;
        } else {
            div.innerHTML = html;
        }

        this.els.messages.appendChild(div);
        this.scrollToBottom(true);
    }

    scrollToBottom(force = false) {
        if (!this.els.messages) return;

        const el = this.els.messages;
        const threshold = 100;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

        if (force || isNearBottom) {
            el.scrollTop = el.scrollHeight;
        }
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

        element.querySelectorAll('.copy-mermaid-btn').forEach(btn => {
            btn.onclick = () => {
                const encoded = btn.getAttribute('data-data');
                if (encoded) {
                    const code = decodeURIComponent(encoded);
                    navigator.clipboard.writeText(code);
                    const originalText = btn.textContent;
                    btn.textContent = 'Copiado!';
                    setTimeout(() => btn.textContent = originalText.trim(), 2000);
                }
            };
        });

        element.querySelectorAll('.reset-zoom-btn').forEach(btn => {
            btn.onclick = () => {
                const wrapper = btn.closest('.mermaid-wrapper');
                const mermaidDiv = wrapper.querySelector('.mermaid');
                if (mermaidDiv._panzoomInstance) {
                    mermaidDiv._panzoomInstance.moveTo(0, 0);
                    mermaidDiv._panzoomInstance.zoomAbs(0, 0, 1);
                }
            };
        });
    }
}

const personaManager = new PersonaManager();
const chatManager = new ChatManager();
const aiService = new AIService();
const uiManager = new UIManager(chatManager, aiService, personaManager);

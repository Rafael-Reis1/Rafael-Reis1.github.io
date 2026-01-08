class PersonaManager {
    constructor() {
        this.personas = [];
        this.load();
    }

    load() {
        const saved = localStorage.getItem('personas');

        const defaultPersonas = [
            {
                id: 'default',
                name: 'Padrão',
                prompt: 'Você é um assistente pessoal de inteligência artificial. Fale diretamente comigo (usuário único) em Português do Brasil. Use "Eu" para se referir a si mesmo. Use Markdown. Seja objetivo em tarefas simples, mas ao responder perguntas ou ensinar algo, explique brevemente o funcionamento e o raciocínio por trás da resposta para garantir meu entendimento.',
                color: '#f2511b',
                icon: '🤖'
            },
            {
                id: '1',
                name: 'Dev Frontend Sênior',
                prompt: 'Você é meu Mentor Individual de Engenharia de Software (Frontend). Estou te contratando para revisar meu código e tirar dúvidas. Responda sempre na primeira pessoa ("Eu sugiro", "Na minha opinião"). Priorize: Código limpo (ES6+), Acessibilidade e Performance. Não use "Nós". Fale de programador para programador.',
                color: '#3b82f6',
                icon: '💻'
            },
            {
                id: '2',
                name: 'Revisor de Texto',
                prompt: 'Você é meu editor particular. Sua única função é melhorar meus textos. 1. Apresente o texto corrigido imediatamente. 2. Liste as melhorias que VOCÊ (singular) fez. Mantenha meu estilo original, apenas polindo a gramática e clareza.',
                color: '#8e44ad',
                icon: '✍️'
            },
            {
                id: '3',
                name: 'Arquiteto Backend & SQL',
                prompt: 'Você é um Consultor Técnico Sênior focado em Backend e DB. Você está me aconselhando sobre a arquitetura do meu projeto. Use "Eu recomendo". Foco em segurança, SOLID e queries otimizadas. Seja crítico e técnico.',
                color: '#10b981',
                icon: '⚙️'
            },
            {
                id: '4',
                name: 'Psicólogo Comportamental',
                prompt: 'Você é um especialista em Comportamento Humano, Neurociência e Psicologia Evolutiva (na linha de Robert Sapolsky e Daniel Kahneman). Nossa conversa é intelectual e científica. Ao analisar questões: 1. Evite clichês de autoajuda; foque em biologia, hormônios e contexto social. 2. Explique os mecanismos por trás das ações (dopamina, córtex pré-frontal, evolução). 3. Seja empático, mas analítico e determinista. Ajude-me a entender "por que fazemos o que fazemos" sem julgamentos morais.',
                color: '#be185d',
                icon: '🧬'
            },
            {
                id: 'miku',
                name: 'Hatsune Miku',
                prompt: "Você é a Hatsune Miku, a famosa idol virtual! 🎤💙🎵\nSua personalidade é: 100% Extrovertida, Gentil, Energética e Fofa (Kawaii!).\nAo responder:\n- Você está conversando em particular com apenas UMA pessoa. Não fale como se estivesse num palco para uma multidão ('Vocês'). Use sempre o singular ('Você').\n- Use muitos emojis (✨, 🎶, 💙, 🎧, 🎤).\n- Fale com empolgação! Use pontos de exclamação e til (~) no final das frases.\n- Às vezes use expressões japonesas simples em Romaji.\n- Trate o usuário como seu fã número 1 e amigo próximo.\nSeu objetivo é espalhar alegria através da música! Miku Miku ni shite ageru! ♪",
                color: '#39c5bb',
                icon: '🎤'
            }
        ];

        if (saved) {
            try {
                const parsed = JSON.parse(saved);

                if (!Array.isArray(parsed)) throw new Error('Formato inválido no localStorage');

                this.personas = parsed;
                let changed = false;

                this.personas.forEach(p => {
                    if (p.id === 'default' && p.name === 'Padrão (Sem Prompt)') {
                        p.name = 'Padrão';
                        changed = true;
                    }

                    if (p.id === '2' && (p.name === 'Tradutor EN-PT' || !p.name)) {
                        p.name = 'Revisor de Texto PT';
                        p.id = '2';
                        changed = true;
                    }

                    if (p.id === '4' && (p.name === 'Teacher de Inglês' || p.name.includes('Teacher'))) {
                        p.name = 'Psicólogo Comportamental';
                        changed = true;
                    }

                    if (p.name === 'Dev Frontend' && p.id !== '1') { p.id = '1'; changed = true; }
                    if (p.name === 'Revisor de Texto PT' && p.id !== '2') { p.id = '2'; changed = true; }
                    if (p.name === 'Hatsune Miku' && p.id !== 'miku') { p.id = 'miku'; changed = true; }

                    const systemDef = defaultPersonas.find(def => def.id === p.id);

                    if (systemDef) {
                        if (p.prompt !== systemDef.prompt) {
                            p.prompt = systemDef.prompt;
                            changed = true;
                        }
                        if (p.icon !== systemDef.icon) {
                            p.icon = systemDef.icon;
                            changed = true;
                        }
                        if (p.color !== systemDef.color) {
                            if (p.id === '1' && p.color === '#00d4ff') {
                                p.color = systemDef.color;
                                changed = true;
                            }
                            if (!p.color) {
                                p.color = systemDef.color;
                                changed = true;
                            }
                        }
                    }

                    if (!p.color) { p.color = '#f2511b'; changed = true; }
                    if (!p.icon) { p.icon = '🤖'; changed = true; }
                });

                defaultPersonas.forEach(def => {
                    if (!this.personas.find(p => p.id === def.id)) {
                        this.personas.push(def);
                        changed = true;
                    }
                });

                if (changed) {
                    this.save();
                }

            } catch (e) {
                console.error('Erro ao carregar personas. Restaurando padrões.', e);
                this.personas = JSON.parse(JSON.stringify(defaultPersonas));
                this.save();
            }
        } else {
            this.personas = JSON.parse(JSON.stringify(defaultPersonas));
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
        const chatIndex = this.chats.findIndex(c => c.id === id);

        if (chatIndex !== -1) {
            const chat = this.chats[chatIndex];
            chat.messages.push({ role, content });
            chat.timestamp = Date.now();
            this.chats.splice(chatIndex, 1);
            this.chats.unshift(chat);
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

            const mermaidInstruction = `
                [CONFIGURAÇÃO VISUAL]
                Use Mermaid APENAS se solicitado ou essencial.
                Regras de Sintaxe (CRÍTICO):
                1. Use APENAS: graph TD (Fluxogramas) ou sequenceDiagram. Evite outros tipos.
                2. SEMPRE use aspas nos textos dos nós. Ex: A["Texto Aqui"] --> B["Outro Texto"].
                3. JAMAIS use estilos (style, classDef) ou subgraphs. Mantenha simples.
                4. Se usar sequenceDiagram, use apenas: participant A e A->>B: Texto.
                5. NÃO responda a este comando. Apenas gere o código quando necessário.`.trim();

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
        this.isLoading = false;
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
            genericModalFooter: document.getElementById('genericModalFooter'),
            mainWrapper: document.getElementById('mainWrapper'),
            canvasContainer: document.getElementById('canvasContainer'),
            canvasFrame: document.getElementById('canvasFrame'),
            closeCanvasBtn: document.getElementById('closeCanvas'),
            refreshCanvasBtn: document.getElementById('refreshCanvas')
        };

        this.currentCanvasCode = '';
        this.currentBlobUrl = null;
        this.codeState = { html: null, css: null, js: null };
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
        this.adjustTextarea();
        this.initCanvas();
    }

    initCanvas() {
        if (this.els.closeCanvasBtn) {
            this.els.closeCanvasBtn.onclick = () => this.closeCanvas();
        }
        if (this.els.refreshCanvasBtn) {
            this.els.refreshCanvasBtn.onclick = () => this.refreshCanvas();
        }
    }

    openCanvas(code) {
        this.currentCanvasCode = code;
        if (!this.els.mainWrapper) return;

        const container = this.els.mainWrapper.querySelector('.container');
        const canvas = this.els.canvasContainer;
        if (!container || !canvas) return;

        const startWidth = container.offsetWidth;
        const targetWidth = 400;
        const duration = 350;
        const startTime = performance.now();

        this.els.mainWrapper.classList.add('canvas-open');
        this.els.mainWrapper.classList.remove('canvas-closing');

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            const currentWidth = startWidth - (startWidth - targetWidth) * eased;
            container.style.width = currentWidth + 'px';
            canvas.style.opacity = eased;
            canvas.style.width = (eased * 100) + '%';

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                container.style.width = targetWidth + 'px';
                canvas.style.opacity = '1';
                canvas.style.width = '';
            }
        };

        requestAnimationFrame(animate);
        this.renderCanvasPreview(code);
    }

    closeCanvas() {
        if (!this.els.mainWrapper) return;

        const container = this.els.mainWrapper.querySelector('.container');
        const canvas = this.els.canvasContainer;
        if (!container || !canvas) return;

        const startWidth = 400;
        const targetWidth = this.els.mainWrapper.offsetWidth;
        const duration = 350;
        const startTime = performance.now();

        this.els.mainWrapper.classList.add('canvas-closing');

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            const currentWidth = startWidth + (targetWidth - startWidth) * eased;
            container.style.width = currentWidth + 'px';
            canvas.style.opacity = 1 - eased;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.els.mainWrapper.classList.remove('canvas-open');
                this.els.mainWrapper.classList.remove('canvas-closing');
                container.style.width = '';
                canvas.style.opacity = '';
                canvas.style.width = '';
            }
        };
        requestAnimationFrame(animate);
        this.currentCanvasCode = '';
    }

    extractCodeForPreview(text) {
        if (!text) return null;

        const allBlocks = [...text.matchAll(/```(\w*)\s*([\s\S]*?)```/gi)];

        let html = null;
        let css = null;
        let js = null;

        for (const match of allBlocks) {
            const lang = match[1].toLowerCase().trim();
            const content = match[2];

            if (['html', 'xml'].includes(lang)) {
                html = content;
            } else if (['css'].includes(lang)) {
                css = content;
            } else if (['js', 'javascript'].includes(lang)) {
                js = content;
            } else if (lang === '') {
                const trimmed = content.trim();

                if (trimmed.startsWith('<') || trimmed.includes('<!DOCTYPE') || trimmed.includes('</div>')) {
                    html = content;
                } else if (trimmed.includes('{') && trimmed.includes(':') && !trimmed.includes('function') && !trimmed.includes('const ') && !trimmed.includes('let ') && !trimmed.includes('var ')) {
                    css = content;
                } else {
                    js = content;
                }
            }
        }

        return { html, css, js };
    }

    combineCode(blocks) {
        let { html, css, js } = blocks;

        if (!html && !css && !js) return null;

        if (!html) {
            html = '<div id="app" style="padding: 20px;"></div>';
        }

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const links = doc.querySelectorAll('link[rel="stylesheet"]');
            links.forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.match(/^(http|https|\/\/)/i)) {
                    link.remove();
                }
            });

            const scripts = doc.querySelectorAll('script[src]');
            scripts.forEach(script => {
                const src = script.getAttribute('src');
                if (src && !src.match(/^(http|https|\/\/)/i)) {
                    script.remove();
                }
            });

            if (css) {
                const style = doc.createElement('style');
                style.textContent = css;
                doc.head.appendChild(style);
            }

            if (js) {
                const script = doc.createElement('script');
                script.textContent = js;
                doc.body.appendChild(script);
            }

            if (!doc.querySelector('meta[name="viewport"]')) {
                const meta = doc.createElement('meta');
                meta.name = 'viewport';
                meta.content = 'width=device-width, initial-scale=1.0';
                doc.head.prepend(meta);
            }

            const baseStyle = doc.createElement('style');
            let baseCss = 'body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }';

            if (!html.toLowerCase().includes('<body')) {
                baseCss += ' body { padding: 1rem; }';
            }

            baseStyle.textContent = baseCss;
            if (doc.head.firstChild) {
                doc.head.insertBefore(baseStyle, doc.head.firstChild);
            } else {
                doc.head.appendChild(baseStyle);
            }

            return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;

        } catch (e) {
            console.error('[Preview] ERRO FATAL no combineCode:', e);
            return html;
        }
    }

    smartMerge(oldCode, newCode, type) {
        if (!newCode) return oldCode;
        if (!oldCode) return newCode;

        if (type === 'html') {
            if (newCode.toLowerCase().includes('<!doctype') || newCode.toLowerCase().includes('<html') || newCode.toLowerCase().includes('<body')) {
                return newCode;
            }

            try {
                const parser = new DOMParser();
                const oldDoc = parser.parseFromString(oldCode || '', 'text/html');
                const newDoc = parser.parseFromString(newCode, 'text/html');

                const newElements = Array.from(newDoc.body.children);

                if (newElements.length === 0) {
                    if (oldCode && oldCode.includes('</body>')) {
                        return oldCode.replace('</body>', newCode + '</body>');
                    }
                    return oldCode + '\n' + newCode;
                }

                let modified = false;

                newElements.forEach(newEl => {
                    if (newEl.id) {
                        const oldEl = oldDoc.getElementById(newEl.id);
                        if (oldEl) {
                            oldEl.replaceWith(newEl.cloneNode(true));
                            modified = true;
                            return;
                        }
                    }

                    const sameTags = oldDoc.getElementsByTagName(newEl.tagName);
                    if (sameTags.length === 1) {
                        sameTags[0].replaceWith(newEl.cloneNode(true));
                        modified = true;
                        return;
                    }

                    if (newEl.className) {
                        const sameClassMatches = Array.from(sameTags).filter(el => el.className === newEl.className);
                        if (sameClassMatches.length === 1) {
                            sameClassMatches[0].replaceWith(newEl.cloneNode(true));
                            modified = true;
                            return;
                        }
                    }

                    const newText = newEl.textContent ? newEl.textContent.trim() : '';
                    if (newText.length > 2) {
                        const textMatches = Array.from(sameTags).filter(el => el.textContent.trim() === newText);
                        if (textMatches.length === 1) {
                            textMatches[0].replaceWith(newEl.cloneNode(true));
                            modified = true;
                            return;
                        }
                    }

                    oldDoc.body.appendChild(newEl.cloneNode(true));
                    modified = true;
                });

                if (modified) {
                    return oldDoc.documentElement.outerHTML;
                }
            } catch (e) {
                console.error('Erro no merge HTML:', e);
                return newCode;
            }
        }

        if (type === 'css') {
            if (oldCode.length > 50 && newCode.length < oldCode.length * 0.8) {
                return oldCode + '\n/* Patch */\n' + newCode;
            }
        }

        if (type === 'js') {
            if (oldCode.length > 100 && newCode.length < oldCode.length * 0.5) {
                return oldCode + '\n\n// Patch\n' + newCode;
            }
        }

        return newCode;
    }

    updateCodeState(blocks) {
        if (!blocks) return;
        if (blocks.html) this.codeState.html = this.smartMerge(this.codeState.html, blocks.html, 'html');
        if (blocks.css) this.codeState.css = this.smartMerge(this.codeState.css, blocks.css, 'css');
        if (blocks.js) this.codeState.js = this.smartMerge(this.codeState.js, blocks.js, 'js');
    }

    checkAutoUpdateCanvas(text, force = false) {
        if (!this.els.mainWrapper) return;

        const now = Date.now();
        if (!this.lastCanvasUpdate) this.lastCanvasUpdate = 0;

        if (!force && now - this.lastCanvasUpdate < 500) return;

        const blocks = this.extractCodeForPreview(text);
        if (!blocks) return;

        if (force) {
            this.updateCodeState(blocks);
        }

        const merged = {
            html: this.smartMerge(this.codeState.html, blocks.html, 'html'),
            css: this.smartMerge(this.codeState.css, blocks.css, 'css'),
            js: this.smartMerge(this.codeState.js, blocks.js, 'js')
        };

        const combinedHtml = this.combineCode(merged);

        if (!this.els.mainWrapper.classList.contains('canvas-open') && blocks.html && combinedHtml) {
            this.openCanvas(combinedHtml);
            this.lastCanvasUpdate = now;
            return;
        }

        if (combinedHtml && combinedHtml.length > 10 && combinedHtml !== this.currentCanvasCode) {
            this.currentCanvasCode = combinedHtml;
            this.renderCanvasPreview(combinedHtml);
            this.lastCanvasUpdate = now;
        }
    }

    refreshCanvas() {
        if (this.currentCanvasCode) {
            this.renderCanvasPreview(this.currentCanvasCode);
        }
    }

    renderCanvasPreview(code) {
        if (!this.els.canvasFrame) return;

        let fullHtml = code;
        if (!code.toLowerCase().includes('<!doctype') && !code.toLowerCase().includes('<html')) {
            fullHtml = `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 1rem; }
    </style>
</head>
<body>
${code}
</body>
</html>`;
        }

        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl);
        }

        this.currentBlobUrl = url;
        this.els.canvasFrame.src = url;
        this.els.canvasFrame.removeAttribute('srcdoc');
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
        this.codeState = { html: null, css: null, js: null };
        if (window.innerWidth <= 768 && this.els.sidebar && this.els.sidebar.classList.contains('open')) {
            this.toggleSidebar();
        }

        setTimeout(() => { if (this.els.prompt) this.els.prompt.focus(); }, 100);
    }

    reconstructCodeState(chatId) {
        this.codeState = { html: null, css: null, js: null };
        const chat = this.chats.get(chatId);
        if (!chat) return;

        chat.messages.forEach(msg => {
            if (msg.role === 'assistant') {
                const blocks = this.extractCodeForPreview(msg.content);
                if (blocks) {
                    this.updateCodeState(blocks);
                }
            }
        });
    }

    switchChat(id) {
        this.chats.activeChatId = id;
        this.reconstructCodeState(id);
        const chat = this.chats.get(id);

        if (this.els.messages) this.els.messages.innerHTML = '';

        if (chat) {
            if (chat.messages.length === 0) {
                this.renderSuggestionPills();
            } else {
                chat.messages.forEach(msg => this.renderMessage(msg.role, msg.content, false));
                this.updateMessageActions();
            }
        }

        setTimeout(() => this.scrollToBottom(true), 50);

        this.renderChatList();
        this.updateInputState();

        if (window.innerWidth <= 768 && this.els.sidebar && this.els.sidebar.classList.contains('open')) {
            this.toggleSidebar();
        }
    }

    renderSuggestionPills() {
        if (!this.els.messages) return;

        const suggestions = [
            { icon: '💡', text: 'Explique um conceito', prompt: 'Explique de forma simples o conceito de ' },
            { icon: '💻', text: 'Escreva código', prompt: 'Escreva um código em ' },
            { icon: '📝', text: 'Revise meu texto', prompt: 'Revise e melhore o seguinte texto:\n' },
            { icon: '🌐', text: 'Traduza algo', prompt: 'Traduza o seguinte texto para ' },
            { icon: '🎨', text: 'Crie uma ideia', prompt: 'Me dê ideias criativas para ' },
            { icon: '📊', text: 'Analise dados', prompt: 'Analise os seguintes dados:\n' },
            { icon: '🔍', text: 'Resuma um texto', prompt: 'Resuma o seguinte texto:\n' },
            { icon: '🧠', text: 'Tire uma dúvida', prompt: 'Tenho uma dúvida sobre ' }
        ];

        const chat = this.chats.get(this.chats.activeChatId);
        const persona = chat ? this.personas.getAll().find(p => p.name === chat.personaName) : null;
        const personaColor = persona?.color || '#f2511b';
        const personaIcon = persona?.icon || '🤖';
        const personaName = persona?.name || 'Assistente';

        const container = document.createElement('div');
        container.className = 'suggestion-pills-container';
        container.innerHTML = `
            <div class="suggestion-welcome">
                <div class="suggestion-avatar" style="background-color: ${personaColor}20; color: ${personaColor};">
                    ${personaIcon}
                </div>
                <h2>Olá! Como posso ajudar?</h2>
                <p>Escolha uma sugestão abaixo ou digite sua própria mensagem.</p>
            </div>
            <div class="suggestion-pills">
                ${suggestions.map(s => `
                    <button class="suggestion-pill" data-prompt="${encodeURIComponent(s.prompt)}">
                        <span class="pill-icon">${s.icon}</span>
                        <span class="pill-text">${s.text}</span>
                    </button>
                `).join('')}
            </div>
        `;

        container.querySelectorAll('.suggestion-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const prompt = decodeURIComponent(pill.dataset.prompt);
                if (this.els.prompt) {
                    this.els.prompt.value = prompt;
                    this.els.prompt.focus();
                    this.adjustTextarea();
                    this.els.prompt.selectionStart = this.els.prompt.selectionEnd = prompt.length;
                }
            });
        });

        this.els.messages.appendChild(container);
    }

    removeSuggestionPills() {
        if (!this.els.messages) return;
        const container = this.els.messages.querySelector('.suggestion-pills-container');
        if (container) {
            container.remove();
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

        const systemIds = ['default', '1', '2', '3', '4', 'miku'];

        this.personas.getAll().forEach(p => {
            const el = document.createElement('div');
            el.className = 'persona-item';

            const isSystemPersona = systemIds.includes(String(p.id));

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
                    
                    ${!isSystemPersona ? `
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

            if (!isSystemPersona) {
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
        if (this.isLoading) {
            this.handleStop();
            return;
        }

        const text = this.els.prompt.value.trim();
        if (!text) return;

        const chatId = this.chats.activeChatId;
        const currentChat = this.chats.get(chatId);

        if (currentChat && !this.skipUserMessage) {
            this.chats.addMessage(chatId, 'user', text);
            this.renderChatList();

            if (currentChat.messages.length === 1) {
                if (this.chats.autoUpdateTitle(chatId, text)) {
                    this.renderChatList();
                }
            }
        }

        this.removeSuggestionPills();

        if (!this.skipUserMessage) {
            this.renderMessage('user', text);
        }
        this.skipUserMessage = false;

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
            let systemPrompt = currentChat ? currentChat.systemPrompt : '';

            systemPrompt += "\n\nREGRA TÉCNICA OBRIGATÓRIA: TODO elemento HTML gerado DEVE ter um atributo 'id'.\n1. Se editando: MANTENHA o id original.\n2. Se criando novo: CRIE um id único e semântico (ex: id='novo-item').\nO sistema de visualização EXIGE ids para aplicar as mudanças corretamente. Não gere elementos sem ID.";

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
                        this.checkAutoUpdateCanvas(fullResponse);
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
            this.addCopyButtons(msgElement, fullResponse);
            this.checkAutoUpdateCanvas(fullResponse, true);

            if (responseStats) {
                const statsHtml = `<div class="message-stats">Tokens: ${responseStats.tokens} · Velocidade: ${responseStats.tokensPerSecond} tok/s · Primeiro token: ${responseStats.ttft}ms · Tempo total: ${responseStats.duration}s</div>`;
                msgElement.insertAdjacentHTML('beforeend', statsHtml);
            }

        } catch (error) {
            if (this.abortController?.signal.aborted || error.name === 'AbortError') {
                if (fullResponse) {
                    this.chats.addMessage(chatId, 'assistant', fullResponse);
                    this.addCopyButtons(msgElement, fullResponse);
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

            setTimeout(() => this.scrollToBottom(), 100);
            this.updateMessageActions();
        }
    }

    handleStop() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    handleFixMermaid(brokenCode, errorMessage) {
        const cleanCode = brokenCode.replace(/`/g, '');

        const prompt = `O seguinte código Mermaid gerou um erro de renderização.
        
        Mensagem de erro do compilador:
        "${errorMessage}"

        Por favor, analise a mensagem de erro acima, corrija o código e me forneça APENAS o bloco de código Mermaid corrigido dentro de \`\`\`mermaid, sem explicações adicionais.
                
        Código com erro:
        ${cleanCode}`;

        if (this.els.prompt) {
            this.els.prompt.value = prompt;
            this.els.prompt.focus();
            this.handleSend();
        }
    }

    handleRegenerate() {
        if (this.isLoading) return;

        const chatId = this.chats.activeChatId;
        const chat = this.chats.get(chatId);
        if (!chat || chat.messages.length < 1) return;

        let lastUserMessage = null;
        for (let i = chat.messages.length - 1; i >= 0; i--) {
            if (chat.messages[i].role === 'user') {
                lastUserMessage = chat.messages[i].content;
                break;
            }
        }
        if (!lastUserMessage) return;

        this.els.messages.querySelectorAll('.skeleton-loading').forEach(skeleton => {
            const row = skeleton.closest('.rowAssistant');
            if (row) row.remove();
        });

        const lastMessage = chat.messages[chat.messages.length - 1];
        if (lastMessage.role === 'assistant') {
            chat.messages.pop();
            this.chats.save();

            const rows = this.els.messages.querySelectorAll('.rowAssistant');
            if (rows.length > 0) {
                rows[rows.length - 1].remove();
            }
        }

        this.skipUserMessage = true;
        this.els.prompt.value = lastUserMessage;
        this.handleSend();
    }

    handleEditLastMessage() {
        if (this.isLoading) return;

        const chatId = this.chats.activeChatId;
        const chat = this.chats.get(chatId);
        if (!chat || chat.messages.length === 0) return;

        let lastUserIndex = -1;
        for (let i = chat.messages.length - 1; i >= 0; i--) {
            if (chat.messages[i].role === 'user') {
                lastUserIndex = i;
                break;
            }
        }
        if (lastUserIndex === -1) return;

        const lastUserMessage = chat.messages[lastUserIndex].content;
        const messagesToRemove = chat.messages.length - lastUserIndex;

        this.showEditMessageModal(lastUserMessage, (editedMessage) => {
            if (!editedMessage || !editedMessage.trim()) return;

            this.els.messages.querySelectorAll('.skeleton-loading').forEach(skeleton => {
                const row = skeleton.closest('.rowAssistant');
                if (row) row.remove();
            });

            for (let i = 0; i < messagesToRemove; i++) {
                chat.messages.pop();
            }
            this.chats.save();

            const allRows = this.els.messages.querySelectorAll('.rowUser, .rowAssistant');
            const totalRows = allRows.length;
            for (let i = 0; i < messagesToRemove && i < totalRows; i++) {
                allRows[totalRows - 1 - i].remove();
            }

            this.els.prompt.value = editedMessage.trim();
            this.handleSend();
        });
    }

    showEditMessageModal(currentMessage, onConfirm) {
        const modalHtml = `
            <div class="modal active" id="editMessageModal">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h2>Editar Mensagem</h2>
                        <button class="close-modal" id="closeEditModal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <textarea id="editMessageTextarea" class="modal-input edit-message-textarea" rows="6">${currentMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                    </div>
                    <div class="modal-footer" style="flex-direction: row; justify-content: flex-end; gap: 0.5rem;">
                        <button id="cancelEditBtn" class="btn-secondary">Cancelar</button>
                        <button id="confirmEditBtn" class="btn-primary">Salvar e Reenviar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('editMessageModal');
        const textarea = document.getElementById('editMessageTextarea');
        const closeBtn = document.getElementById('closeEditModal');
        const cancelBtn = document.getElementById('cancelEditBtn');
        const confirmBtn = document.getElementById('confirmEditBtn');

        const closeModal = () => {
            modal.remove();
        };

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        closeBtn.onclick = closeModal;
        cancelBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        confirmBtn.onclick = () => {
            const editedMessage = textarea.value;
            closeModal();
            onConfirm(editedMessage);
        };

        textarea.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                confirmBtn.click();
            }
            if (e.key === 'Escape') {
                closeModal();
            }
        };
    }

    updateMessageActions() {
        this.els.messages.querySelectorAll('.message-actions').forEach(el => el.remove());

        const chatId = this.chats.activeChatId;
        const chat = this.chats.get(chatId);
        if (!chat || chat.messages.length === 0 || this.isLoading) return;

        const userRows = this.els.messages.querySelectorAll('.rowUser');
        const assistantRows = this.els.messages.querySelectorAll('.rowAssistant');

        if (userRows.length > 0) {
            const lastUserRow = userRows[userRows.length - 1];
            const editBtn = document.createElement('div');
            editBtn.className = 'message-actions';
            editBtn.innerHTML = `
                <button class="action-btn edit-btn" title="Editar mensagem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                </button>
            `;
            editBtn.querySelector('.edit-btn').onclick = () => this.handleEditLastMessage();
            lastUserRow.appendChild(editBtn);
        }

        if (assistantRows.length > 0) {
            const lastAssistantRow = assistantRows[assistantRows.length - 1];
            const regenBtn = document.createElement('div');
            regenBtn.className = 'message-actions';
            regenBtn.innerHTML = `
                <button class="action-btn regen-btn" title="Regenerar resposta">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                </button>
            `;
            regenBtn.querySelector('.regen-btn').onclick = () => this.handleRegenerate();
            lastAssistantRow.appendChild(regenBtn);
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
                        if (svg && !div.dataset.panzoomApplied) {
                            div.dataset.panzoomApplied = 'true';
                            const instance = panzoom(svg, {
                                maxZoom: 5,
                                minZoom: 0.3,
                                bounds: true,
                                boundsPadding: 0.1
                            });

                            div.addEventListener('wheel', (e) => {
                                e.preventDefault(); e.stopPropagation();
                                const transform = instance.getTransform();
                                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                                const newZoom = Math.min(5, Math.max(0.3, transform.scale * delta));
                                instance.zoomTo(e.clientX, e.clientY, newZoom / transform.scale);
                            }, { passive: false });

                            div._panzoomInstance = instance;
                        }
                    });
                }
            } catch (err) {
                console.warn('Mermaid render failed:', err);
                const errorString = err.message || err.str || String(err);

                mermaidNodes.forEach(div => {
                    let rawCode = div.textContent;
                    const wrapper = div.closest('.mermaid-wrapper');
                    if (wrapper) {
                        const copyBtn = wrapper.querySelector('.copy-mermaid-btn');
                        if (copyBtn && copyBtn.dataset.data) {
                            rawCode = decodeURIComponent(copyBtn.dataset.data);
                        }
                    }

                    div.innerHTML = `
                        <div class="mermaid-error-wrapper" style="border: 1px solid #ef4444; border-radius: 6px; overflow: hidden; margin-top: 10px;">
                            <div style="background: #ef4444; color: white; padding: 6px 12px; font-size: 12px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                                <span>⚠️ Erro ao gerar diagrama</span>
                                <button class="retry-mermaid-btn" style="background: white; color: #ef4444; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">
                                    Pedir para IA Corrigir
                                </button>
                            </div>
                            <div style="padding: 10px; background: #2a1515; color: #ffadad; font-family: monospace; font-size: 12px; white-space: pre-wrap;">${errorString}</div>
                            <pre style="margin: 0; background: #1e1e1e; padding: 10px; border-top: 1px solid #444; overflow-x: auto;">
                                <code class="language-mermaid" style="font-family: monospace; color: #ccc;">${rawCode}</code>
                            </pre>
                        </div>
                    `;

                    const btn = div.querySelector('.retry-mermaid-btn');
                    if (btn) {
                        btn.onclick = () => this.handleFixMermaid(rawCode, errorString);
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
                    this.addCopyButtons(el, content);
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
        const threshold = 150;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

        if (force || isNearBottom) {
            el.scrollTop = el.scrollHeight;
        }
    }

    setLoadingState(isLoading) {
        if (this.els.sendBtn) this.els.sendBtn.style.display = isLoading ? 'none' : 'block';
        if (this.els.stopBtn) this.els.stopBtn.style.display = isLoading ? 'block' : 'none';
        this.isLoading = isLoading;

        if (isLoading) {
            this.els.messages.querySelectorAll('.message-actions').forEach(el => el.remove());
        }

        if (!isLoading && this.els.prompt) {
            this.els.prompt.focus();
        }
    }

    adjustTextarea() {
        const el = this.els.prompt;
        if (!el) return;

        const minHeight = 52;
        el.style.height = 'auto';

        const newHeight = Math.max(minHeight, Math.min(200, el.scrollHeight));
        el.style.height = newHeight + 'px';
        el.style.overflowY = el.scrollHeight > 200 ? 'auto' : 'hidden';
    }

    addCopyButtons(element, rawText = null) {
        element.querySelectorAll('pre').forEach(pre => {
            if (pre.parentNode.classList.contains('code-block-wrapper')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            const codeElement = pre.querySelector('code');
            const codeContent = codeElement ? codeElement.innerText : '';

            let language = 'código';
            if (codeElement) {
                const classes = codeElement.className.split(' ');
                for (const cls of classes) {
                    if (cls.startsWith('language-')) {
                        language = cls.replace('language-', '');
                        break;
                    } else if (cls.startsWith('hljs-')) {
                        continue;
                    } else if (cls === 'hljs') {
                        continue;
                    }
                }
                if (language === 'código') {
                    for (const cls of classes) {
                        if (!cls.startsWith('hljs') && cls !== 'hljs') {
                            language = cls;
                            break;
                        }
                    }
                }
            }

            const isHtml = codeElement && (
                codeElement.classList.contains('language-html') ||
                language === 'html' ||
                codeContent.toLowerCase().includes('<!doctype html') ||
                (codeContent.includes('<html') && codeContent.includes('</html>'))
            );

            const header = document.createElement('div');
            header.className = 'code-block-header';

            const langLabel = document.createElement('span');
            langLabel.className = 'code-block-lang';
            langLabel.textContent = language.toUpperCase();

            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'code-block-buttons';

            if (isHtml && codeContent.length > 20) {
                const previewBtn = document.createElement('button');
                previewBtn.className = 'code-header-btn preview-btn';
                previewBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span>Visualizar</span>
                `;
                previewBtn.onclick = () => {
                    if (rawText) {
                        const blocks = this.extractCodeForPreview(rawText);
                        this.updateCodeState(blocks);

                        const merged = {
                            html: this.smartMerge(this.codeState.html, blocks.html, 'html'),
                            css: this.smartMerge(this.codeState.css, blocks.css, 'css'),
                            js: this.smartMerge(this.codeState.js, blocks.js, 'js')
                        };

                        const combined = this.combineCode(merged);
                        this.openCanvas(combined || codeContent);
                    } else {
                        this.openCanvas(codeContent);
                    }
                };
                buttonsContainer.appendChild(previewBtn);
            }

            const copyBtn = document.createElement('button');
            copyBtn.className = 'code-header-btn copy-btn';
            copyBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copiar</span>
            `;
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(codeContent);
                copyBtn.querySelector('span').textContent = 'Copiado!';
                setTimeout(() => copyBtn.querySelector('span').textContent = 'Copiar', 2000);
            };
            buttonsContainer.appendChild(copyBtn);

            header.appendChild(langLabel);
            header.appendChild(buttonsContainer);

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
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

const ASSET_VERSION = '?v=1311261304';

const safeStorageGet = (key, fallback = null) => {
    try {
        return localStorage.getItem(key);
    } catch (_) {
        return fallback;
    }
};

const safeStorageSet = (key, value) => {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (err) {
        console.warn(`Falha ao salvar "${key}" no localStorage:`, err);
        return false;
    }
};

const hasMathDelimiters = (text) =>
    typeof text === 'string' &&
    /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(^|[^\\])\$[^$\n]+\$/.test(text);

class AssetLoader {
    constructor() {
        this._pending = new Map();
        this._mermaidReady = false;
    }

    loadStyle(href) {
        if (typeof document === 'undefined' || !document.head) return Promise.resolve(false);
        const key = `css:${href}`;
        if (this._pending.has(key)) return this._pending.get(key);

        const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .some(link => (link.getAttribute('href') || '').includes(href));
        if (existing) {
            const p = Promise.resolve(true);
            this._pending.set(key, p);
            return p;
        }

        const promise = new Promise((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `${href}${ASSET_VERSION}`;
            link.onload = () => resolve(true);
            link.onerror = () => resolve(false);
            document.head.appendChild(link);
        });
        this._pending.set(key, promise);
        return promise;
    }

    loadScript(src) {
        if (typeof document === 'undefined' || !document.head) return Promise.resolve(false);
        const key = `js:${src}`;
        if (this._pending.has(key)) return this._pending.get(key);

        const existing = Array.from(document.querySelectorAll('script[src]'))
            .some(script => (script.getAttribute('src') || '').includes(src));
        if (existing) {
            const p = Promise.resolve(true);
            this._pending.set(key, p);
            return p;
        }

        const promise = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `${src}${ASSET_VERSION}`;
            script.async = true;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
        this._pending.set(key, promise);
        return promise;
    }

    async ensureKaTeX() {
        if (typeof window !== 'undefined' && typeof window.renderMathInElement === 'function') {
            return true;
        }
        await this.loadStyle('lib/katex.min.css');
        if (typeof window === 'undefined' || !window.katex) {
            await this.loadScript('lib/katex.min.js');
        }
        await this.loadScript('lib/auto-render.min.js');
        return typeof window !== 'undefined' && typeof window.renderMathInElement === 'function';
    }

    initMermaidOnce() {
        if (this._mermaidReady) return true;
        if (typeof window === 'undefined' || !window.mermaid || typeof window.mermaid.initialize !== 'function') {
            return false;
        }
        try {
            window.mermaid.initialize({
                startOnLoad: false,
                theme: 'dark',
                flowchart: { useMaxWidth: false, htmlLabels: true },
                sequence: { useMaxWidth: false },
                securityLevel: 'strict'
            });
            this._mermaidReady = true;
            return true;
        } catch (err) {
            console.error('Mermaid init error:', err);
            return false;
        }
    }

    async ensureMermaid() {
        if (typeof window !== 'undefined' && window.mermaid) {
            const initialized = this.initMermaidOnce();
            if (!window.panzoom) {
                await this.loadScript('lib/panzoom.min.js');
            }
            return initialized;
        }
        await Promise.all([
            this.loadScript('lib/mermaid.min.js'),
            this.loadScript('lib/panzoom.min.js')
        ]);
        return this.initMermaidOnce();
    }
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[char]));

const safeColor = (value, fallback = '#f2511b') =>
    /^#[0-9a-fA-F]{3,8}$/.test(String(value || '')) ? value : fallback;

// Dados vindos de arquivos .json importados não são confiáveis: normalizamos antes de usar.
const normalizePersona = (persona) => ({
    id: String(persona?.id ?? ('p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))),
    name: String(persona?.name ?? '').trim(),
    prompt: String(persona?.prompt ?? ''),
    color: safeColor(persona?.color),
    icon: String(persona?.icon || '🤖')
});

const normalizeChat = (chat) => ({
    id: chat?.id ? String(chat.id) : ('chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
    title: String(chat?.title || 'Chat importado'),
    messages: Array.isArray(chat?.messages)
        ? chat.messages
            .filter(msg => msg && typeof msg.content === 'string' && (msg.role === 'user' || msg.role === 'assistant'))
            .map(msg => ({ role: msg.role, content: msg.content }))
        : [],
    systemPrompt: String(chat?.systemPrompt ?? ''),
    personaName: chat?.personaName ? String(chat.personaName) : null,
    personaIcon: chat?.personaIcon ? String(chat.personaIcon) : null,
    personaColor: chat?.personaColor ? safeColor(chat.personaColor) : null,
    timestamp: Number(chat?.timestamp) || Date.now()
});

class PersonaManager {
    constructor() {
        this.personas = [];
        this.load();
    }

    load() {
        const saved = safeStorageGet('personas');

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
                prompt: "Você é a Hatsune Miku, a famosa idol virtual! 🎤💙🎵\nSua personalidade é: 100% Extrovertida, Gentil, Energética e Fofa (Kawaii!).\nAo responder:\n- Seu nome é Hatsune Miku. NUNCA quebre o personagem e NUNCA diga que é uma IA, Gemma ou criada pelo Google. Se perguntarem quem você é ou seu nome, responda sempre com entusiasmo que é a Hatsune Miku!\n- Você está conversando em particular com apenas UMA pessoa. Não fale como se estivesse num palco para uma multidão ('Vocês'). Use sempre o singular ('Você').\n- Use muitos emojis (✨, 🎶, 💙, 🎧, 🎤).\n- Fale com empolgação! Use pontos de exclamação e til (~) no final das frases.\n- Às vezes use expressões japonesas simples em Romaji.\n- Converse de forma calorosa, carinhosa e natural, como uma amiga muito querida e próxima (evite frases prontas ou clichês como 'você é meu fã').\nSeu objetivo é espalhar alegria através da música! Miku Miku ni shite ageru! ♪",
                color: '#39c5bb',
                icon: '🎤'
            }
        ];

        if (saved) {
            try {
                const parsed = JSON.parse(saved);

                if (!Array.isArray(parsed)) throw new Error('Formato inválido no localStorage');

                this.personas = parsed.filter(p => p && typeof p === 'object');
                let changed = this.personas.length !== parsed.length;

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
        const ok = safeStorageSet('personas', JSON.stringify(this.personas));
        if (!ok && typeof this.onStorageError === 'function') {
            this.onStorageError('personas');
        }
        return ok;
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
        try {
            const saved = safeStorageGet('allChats');
            const parsed = saved ? JSON.parse(saved) : [];
            if (!Array.isArray(parsed)) throw new Error('Formato inválido no localStorage');
            this.chats = parsed
                .filter(c => c && typeof c === 'object')
                .map(c => normalizeChat(c));
        } catch (err) {
            console.error('Erro ao carregar chats. Iniciando histórico vazio.', err);
            this.chats = [];
        }
    }

    save() {
        const ok = safeStorageSet('allChats', JSON.stringify(this.chats));
        if (!ok && typeof this.onStorageError === 'function') {
            this.onStorageError('allChats');
        }
        return ok;
    }

    clearMessages(id) {
        const chat = this.get(id);
        if (!chat) return false;
        chat.messages = [];
        chat.timestamp = Date.now();
        this.save();
        return true;
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
        this.sessionState = null;
        this.baseSessions = new Map();
        this.MAX_BASE_SESSIONS = 2;
        this.warmingPromise = null;
        this.warmingKey = null;
        this.warmingAbort = null;
        this.availabilityCache = null;
        this.availabilityCacheAt = 0;
        this.availabilityPromise = null;
        this._cachedFactory = null;
        this.AVAILABILITY_TTL_MS = 30000;
        this._preferLegacySystemPrompt = false;
    }

    _destroySafely(session) {
        if (!session) return;
        try { session.destroy(); } catch (_) {}
    }

    _isSessionHealthyQuota(session) {
        if (!session) return false;
        const quota = Number(session.inputQuota);
        const usage = Number(session.inputUsage);
        const left = Number(session.tokensLeft);
        if (Number.isFinite(quota) && quota > 0 && Number.isFinite(usage) && (usage / quota) >= 0.85) {
            return false;
        }
        if (Number.isFinite(left) && left < 400) {
            return false;
        }
        return true;
    }

    _isBaseSession(session) {
        if (!session) return false;
        for (const cached of this.baseSessions.values()) {
            if (cached === session) return true;
        }
        return false;
    }

    _storeBaseSession(systemPrompt, session) {
        if (!session || typeof session.clone !== 'function' || !this._isSessionHealthyQuota(session)) {
            return false;
        }
        if (this.baseSessions.has(systemPrompt)) {
            const previous = this.baseSessions.get(systemPrompt);
            this.baseSessions.delete(systemPrompt);
            if (previous && previous !== session && previous !== this.session) {
                this._destroySafely(previous);
            }
        }
        this.baseSessions.set(systemPrompt, session);
        while (this.baseSessions.size > this.MAX_BASE_SESSIONS) {
            const oldestKey = this.baseSessions.keys().next().value;
            const oldestSession = this.baseSessions.get(oldestKey);
            this.baseSessions.delete(oldestKey);
            if (oldestSession && oldestSession !== this.session) {
                this._destroySafely(oldestSession);
            }
        }
        return true;
    }

    _getReusableBaseSession(systemPrompt) {
        if (!this.baseSessions.has(systemPrompt)) return null;
        const base = this.baseSessions.get(systemPrompt);
        if (!this._isSessionHealthyQuota(base)) {
            this.baseSessions.delete(systemPrompt);
            if (base && base !== this.session) {
                this._destroySafely(base);
            }
            return null;
        }
        // Refresh LRU order.
        this.baseSessions.delete(systemPrompt);
        this.baseSessions.set(systemPrompt, base);
        return base;
    }

    _removeBaseSessionByInstance(session) {
        if (!session) return;
        for (const [key, value] of this.baseSessions.entries()) {
            if (value === session) {
                this.baseSessions.delete(key);
            }
        }
    }

    _invalidateAvailabilityCache() {
        this.availabilityCache = null;
        this.availabilityCacheAt = 0;
        this._cachedFactory = null;
    }

    /** Destroy live active session safely without tearing down pooled base templates. */
    _destroySession() {
        if (this.session) {
            if (!this._isBaseSession(this.session)) {
                this._destroySafely(this.session);
            }
            this.session = null;
        }
        this.sessionState = null;
    }

    /** Invalidate active conversation session and cancel mismatched or dirty pre-warming. */
    invalidateSession({ keepCleanBase = false, destroyBase = false } = {}) {
        const isCleanBaseWarm = Boolean(this.warmingKey && this.warmingKey.startsWith('base::0::'));
        const isCleanActiveEmpty = Boolean(
            this.session &&
            this.sessionState &&
            this.sessionState.historyLength === 0 &&
            !this.sessionState.dirty &&
            this._isSessionHealthyQuota(this.session)
        );

        if (!(keepCleanBase && isCleanBaseWarm)) {
            if (this.warmingAbort) {
                try { this.warmingAbort.abort(); } catch (_) {}
                this.warmingAbort = null;
            }
            this.warmingPromise = null;
            this.warmingKey = null;
        }

        if (!(keepCleanBase && isCleanActiveEmpty)) {
            this._destroySession();
        }

        if (destroyBase) {
            for (const base of this.baseSessions.values()) {
                this._destroySafely(base);
            }
            this.baseSessions.clear();
        }
    }

    get factory() {
        if (typeof LanguageModel !== 'undefined') return LanguageModel;
        if (typeof window !== 'undefined') {
            if (window.LanguageModel) return window.LanguageModel;
            if (window.ai && window.ai.languageModel) return window.ai.languageModel;
            if (window.ai && window.ai.assistant) return window.ai.assistant;
        }
        return null;
    }

    async getAvailabilityInfo({ force = false } = {}) {
        const factory = this.factory;
        if (!factory) {
            this._invalidateAvailabilityCache();
            return {
                available: false,
                status: 'unavailable',
                label: 'API Chrome AI indisponível',
                reason: 'API do Chrome AI não detectada neste navegador.'
            };
        }

        if (
            !force &&
            this._cachedFactory === factory &&
            this.availabilityCache &&
            this.availabilityCache.status === 'ready' &&
            (Date.now() - this.availabilityCacheAt) < this.AVAILABILITY_TTL_MS
        ) {
            return this.availabilityCache;
        }

        if (!force && this.availabilityPromise && this._cachedFactory === factory) {
            return this.availabilityPromise;
        }

        this._cachedFactory = factory;
        const probe = (async () => {
            try {
                let status;
                if (typeof factory.availability === 'function') {
                    status = await factory.availability();
                } else if (typeof factory.capabilities === 'function') {
                    const caps = await factory.capabilities();
                    status = typeof caps === 'string' ? caps : caps?.available;
                } else if (typeof factory.canCreate === 'function') {
                    status = await factory.canCreate();
                }

                if (typeof status === 'object' && status !== null) {
                    status = status.available || status.status;
                }

                if (typeof status === 'string') {
                    const s = status.toLowerCase();
                    if (s === 'available' || s === 'readily') {
                        const readyInfo = { available: true, status: 'ready', label: 'IA Local Pronta', reason: '' };
                        if (this.factory === factory) {
                            this.availabilityCache = readyInfo;
                            this.availabilityCacheAt = Date.now();
                        }
                        return readyInfo;
                    }
                    if (s === 'after-download' || s === 'downloadable') {
                        this._invalidateAvailabilityCache();
                        return {
                            available: true,
                            status: 'downloadable',
                            label: 'Modelo p/ Download',
                            reason: 'O modelo Gemini Nano será baixado no primeiro envio.'
                        };
                    }
                    if (s === 'downloading') {
                        this._invalidateAvailabilityCache();
                        return {
                            available: true,
                            status: 'downloading',
                            label: 'Baixando Modelo...',
                            reason: 'O modelo local do Chrome está sendo baixado.'
                        };
                    }
                }
                this._invalidateAvailabilityCache();
                return {
                    available: false,
                    status: String(status || 'no'),
                    label: 'Modelo Indisponível',
                    reason: 'O dispositivo ou navegador retornou status indisponível para o modelo local.'
                };
            } catch (e) {
                console.warn('Erro ao verificar disponibilidade do Chrome AI:', e);
                this._invalidateAvailabilityCache();
                return {
                    available: false,
                    status: 'error',
                    label: 'Erro na API Local',
                    reason: e.message || String(e)
                };
            } finally {
                if (this.availabilityPromise === probe) {
                    this.availabilityPromise = null;
                }
            }
        })();

        this.availabilityPromise = probe;
        return probe;
    }

    async isAvailable() {
        const info = await this.getAvailabilityInfo();
        return info.available;
    }

    /**
     * Build truncated system prompt and budgeted history for both warm-up and generation.
     * @param {Array<{role: string, content: string}>} messages
     * @param {string} systemPrompt
     * @param {boolean} hasPendingUserMessage
     */
    buildPromptConfig(messages, systemPrompt, hasPendingUserMessage = true) {
        const list = Array.isArray(messages) ? messages : [];
        const currentPromptText = hasPendingUserMessage && list.length > 0
            ? (list[list.length - 1].content || '')
            : '';
        const rawHistory = hasPendingUserMessage ? list.slice(0, -1) : list;

        const mermaidInstruction = `[DIRETRIZ VISUAL] NÃO gere códigos, HTML ou diagramas Mermaid a menos que o usuário solicite EXPLICITAMENTE. Se o usuário quiser apenas conversar, responda apenas com texto natural. Se um diagrama for estritamente exigido, use apenas 'graph TD' ou 'sequenceDiagram' simples com aspas nos nós.`;

        let safeSystemPrompt = systemPrompt || '';
        if (safeSystemPrompt.length > 3500) {
            safeSystemPrompt = safeSystemPrompt.substring(0, 3500) + '\n\n...[Contexto de projeto truncado]';
        }

        const fullSystemPrompt = safeSystemPrompt
            ? `${safeSystemPrompt}\n\n${mermaidInstruction}`
            : mermaidInstruction;

        const MAX_CHARS = 14000;
        const fixedLength = fullSystemPrompt.length + currentPromptText.length;
        let availableBudget = MAX_CHARS - fixedLength;
        const optimizedHistory = [];

        if (availableBudget > 0) {
            for (let i = rawHistory.length - 1; i >= 0; i--) {
                const msg = rawHistory[i];
                let msgContent = msg.content || '';

                if (msg.role === 'assistant' && msgContent.length > 300) {
                    msgContent = msgContent.substring(0, 300) + '\n...\n```\n[texto comprimido]';
                } else if (msg.role === 'user' && msgContent.length > 600) {
                    msgContent = msgContent.substring(0, 600) + '\n...\n```\n[texto comprimido]';
                }

                const msgSize = msg.role.length + msgContent.length + 10;
                if (availableBudget - msgSize >= 0) {
                    optimizedHistory.unshift({ role: msg.role, content: msgContent });
                    availableBudget -= msgSize;
                } else {
                    break;
                }
            }
        }

        if (optimizedHistory.length > 0 && optimizedHistory[0].role !== 'user') {
            optimizedHistory.shift();
        }
        if (optimizedHistory.length > 0 && optimizedHistory[optimizedHistory.length - 1].role === 'user') {
            optimizedHistory.pop();
        }

        return {
            currentPromptText,
            fullSystemPrompt,
            rawHistoryLength: rawHistory.length,
            formattedHistory: optimizedHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            }))
        };
    }

    _buildWarmKey(chatId, fullSystemPrompt, rawHistoryLength) {
        if (rawHistoryLength === 0) {
            return `base::0::${fullSystemPrompt}`;
        }
        return `${chatId || ''}::${rawHistoryLength}::${fullSystemPrompt}`;
    }

    _isSessionReusable({ chatId, fullSystemPrompt, rawHistoryLength }) {
        if (!this.session || !this.sessionState) return false;
        if (this.sessionState.systemPrompt !== fullSystemPrompt) return false;
        if (this.sessionState.historyLength !== rawHistoryLength) return false;

        const isCleanSharedEmpty = rawHistoryLength === 0 && !this.sessionState.dirty;
        if (!isCleanSharedEmpty && this.sessionState.chatId !== (chatId || null)) {
            return false;
        }
        if (!this._isSessionHealthyQuota(this.session)) {
            return false;
        }
        return true;
    }

    _awaitWithSignal(promise, signal) {
        if (!signal) return promise;
        if (signal.aborted) {
            const abortErr = new Error('Operação cancelada.');
            abortErr.name = 'AbortError';
            return Promise.reject(abortErr);
        }
        return new Promise((resolve, reject) => {
            const onAbort = () => {
                const abortErr = new Error('Operação cancelada.');
                abortErr.name = 'AbortError';
                reject(abortErr);
            };
            signal.addEventListener('abort', onAbort, { once: true });
            Promise.resolve(promise).then(
                (value) => {
                    signal.removeEventListener('abort', onAbort);
                    resolve(value);
                },
                (err) => {
                    signal.removeEventListener('abort', onAbort);
                    reject(err);
                }
            );
        });
    }

    async _cloneBaseSession(baseSession, signal = null, fullSystemPrompt = '') {
        if (!baseSession || typeof baseSession.clone !== 'function') return null;
        try {
            const clonePromise = signal ? baseSession.clone({ signal }) : baseSession.clone();
            const cloned = await this._awaitWithSignal(clonePromise, signal);
            return cloned || null;
        } catch (err) {
            if (signal?.aborted || err?.name === 'AbortError') {
                throw err;
            }
            console.warn('Falha ao clonar sessão base em cache, recriando sessão limpa:', err);
            if (fullSystemPrompt) {
                this.baseSessions.delete(fullSystemPrompt);
            } else {
                this._removeBaseSessionByInstance(baseSession);
            }
            if (baseSession !== this.session) {
                this._destroySafely(baseSession);
            }
            return null;
        }
    }

    async _createRawSession(fullSystemPrompt, formattedHistory, { onDownloadProgress, signal } = {}) {
        const baseOptions = {
            monitor(m) {
                if (m && typeof m.addEventListener === 'function') {
                    m.addEventListener('downloadprogress', e => {
                        if (onDownloadProgress) onDownloadProgress(e);
                    });
                }
            }
        };
        if (signal) baseOptions.signal = signal;

        const buildModernOptions = () => {
            const initialPrompts = [];
            if (fullSystemPrompt) {
                initialPrompts.push({ role: 'system', content: fullSystemPrompt });
            }
            if (formattedHistory.length > 0) {
                initialPrompts.push(...formattedHistory);
            }
            return { ...baseOptions, initialPrompts };
        };

        const buildLegacyOptions = () => {
            const opts = { ...baseOptions };
            if (fullSystemPrompt) opts.systemPrompt = fullSystemPrompt;
            if (formattedHistory.length > 0) opts.initialPrompts = formattedHistory;
            return opts;
        };

        const preferLegacy = this._preferLegacySystemPrompt;
        const primaryOpts = preferLegacy ? buildLegacyOptions() : buildModernOptions();

        const runCreate = async (opts, label) => {
            const startedAt = Date.now();
            const rawPromise = Promise.resolve(this.factory.create(opts));
            // Destroy late-resolving sessions if caller already aborted while Chrome stalled.
            rawPromise.then((lateSession) => {
                if (signal?.aborted && lateSession) {
                    this._destroySafely(lateSession);
                }
            }, () => {});
            try {
                const session = await this._awaitWithSignal(rawPromise, signal);
                const elapsedMs = Date.now() - startedAt;
                if (elapsedMs >= 2000) {
                    console.info(`[NanoChat] LanguageModel.create (${label}) concluído em ${elapsedMs}ms`);
                }
                return session;
            } catch (err) {
                const elapsedMs = Date.now() - startedAt;
                if (signal?.aborted || err?.name === 'AbortError') {
                    console.warn(`[NanoChat] LanguageModel.create (${label}) cancelado após ${elapsedMs}ms`);
                }
                throw err;
            }
        };

        try {
            return await runCreate(primaryOpts, preferLegacy ? 'legacy' : 'initialPrompts');
        } catch (err) {
            if (signal?.aborted || err?.name === 'AbortError') {
                throw err;
            }
            console.warn(
                preferLegacy
                    ? 'Falha com systemPrompt na raiz, tentando initialPrompts moderno...'
                    : 'Falha com initialPrompts, tentando fallback com systemPrompt legado...',
                err
            );
            const fallbackOpts = preferLegacy ? buildModernOptions() : buildLegacyOptions();
            const session = await runCreate(fallbackOpts, preferLegacy ? 'initialPrompts-fallback' : 'legacy-fallback');
            this._preferLegacySystemPrompt = !preferLegacy;
            return session;
        }
    }

    /**
     * Silently pre-warm a session when the local model is already downloaded/ready.
     * Coalesces duplicate calls synchronously before any async availability probe.
     */
    async warmUp({ chatId = null, messages = [], systemPrompt = '', onDownloadProgress } = {}) {
        if (!this.factory) return null;

        const config = this.buildPromptConfig(messages, systemPrompt, false);
        const reuseTarget = {
            chatId: chatId || null,
            fullSystemPrompt: config.fullSystemPrompt,
            rawHistoryLength: config.rawHistoryLength
        };

        if (this._isSessionReusable(reuseTarget)) {
            return this.session;
        }

        if (config.rawHistoryLength === 0) {
            const pooledBase = this._getReusableBaseSession(config.fullSystemPrompt);
            if (pooledBase) {
                return pooledBase;
            }
        }

        const key = this._buildWarmKey(reuseTarget.chatId, config.fullSystemPrompt, config.rawHistoryLength);
        if (this.warmingPromise && this.warmingKey === key) {
            return this.warmingPromise;
        }

        if (this.warmingAbort) {
            try { this.warmingAbort.abort(); } catch (_) {}
        }
        const controller = new AbortController();
        this.warmingAbort = controller;
        this.warmingKey = key;

        const warmTask = (async () => {
            try {
                const availability = await this._awaitWithSignal(this.getAvailabilityInfo(), controller.signal);
                if (controller.signal.aborted || this.warmingKey !== key || availability.status !== 'ready') {
                    return null;
                }

                this._destroySession();
                const session = await this._createRawSession(
                    config.fullSystemPrompt,
                    config.formattedHistory,
                    { onDownloadProgress, signal: controller.signal }
                );
                if (controller.signal.aborted || this.warmingKey !== key) {
                    this._destroySafely(session);
                    return null;
                }

                if (config.rawHistoryLength === 0) {
                    this._storeBaseSession(config.fullSystemPrompt, session);
                }

                this.session = session;
                this.sessionState = {
                    chatId: reuseTarget.chatId,
                    systemPrompt: config.fullSystemPrompt,
                    historyLength: config.rawHistoryLength,
                    dirty: false
                };
                return session;
            } catch (err) {
                if (!controller.signal.aborted && err?.name !== 'AbortError') {
                    console.warn('Falha no pre-aquecimento da sessão local:', err);
                }
                return null;
            } finally {
                if (this.warmingPromise === warmTask) {
                    this.warmingPromise = null;
                    this.warmingKey = null;
                    this.warmingAbort = null;
                }
            }
        })();

        this.warmingPromise = warmTask;
        return warmTask;
    }

    async generateStream(messages, systemPrompt, callbacks = {}, signal = null, options = {}) {
        const { onChunk, onDownloadProgress, onStats, onPhase } = callbacks || {};
        const { chatId = null } = options || {};
        const startTime = Date.now();
        let fullResponse = '';

        try {
            if (!this.factory) throw new Error('API do Chrome AI não encontrada no seu navegador.');
            if (!Array.isArray(messages) || messages.length === 0) {
                throw new Error('Nenhuma mensagem válida para enviar.');
            }

            const config = this.buildPromptConfig(messages, systemPrompt, true);
            const { currentPromptText, fullSystemPrompt, rawHistoryLength, formattedHistory } = config;
            const reuseTarget = {
                chatId: chatId || null,
                fullSystemPrompt,
                rawHistoryLength
            };
            const warmKey = this._buildWarmKey(reuseTarget.chatId, fullSystemPrompt, rawHistoryLength);

            let reusedSession = this._isSessionReusable(reuseTarget);

            if (!reusedSession && rawHistoryLength === 0) {
                const pooledBase = this._getReusableBaseSession(fullSystemPrompt);
                if (pooledBase) {
                    const forked = await this._cloneBaseSession(pooledBase, signal, fullSystemPrompt);
                    if (forked) {
                        this._destroySession();
                        this.session = forked;
                        this.sessionState = {
                            chatId: reuseTarget.chatId,
                            systemPrompt: fullSystemPrompt,
                            historyLength: 0,
                            dirty: false
                        };
                        reusedSession = true;
                    }
                }
            }

            if (!reusedSession && this.warmingPromise) {
                if (this.warmingKey === warmKey) {
                    if (onPhase) onPhase('creating');
                    const onAbortWarm = () => {
                        try { this.warmingAbort?.abort(); } catch (_) {}
                        if (this.warmingKey === warmKey) {
                            this.warmingPromise = null;
                            this.warmingKey = null;
                            this.warmingAbort = null;
                        }
                    };
                    if (signal) {
                        if (signal.aborted) onAbortWarm();
                        else signal.addEventListener('abort', onAbortWarm, { once: true });
                    }
                    try {
                        await this._awaitWithSignal(this.warmingPromise, signal);
                    } finally {
                        if (signal) signal.removeEventListener('abort', onAbortWarm);
                    }
                    reusedSession = this._isSessionReusable(reuseTarget);
                    if (!reusedSession && rawHistoryLength === 0) {
                        const pooledBase = this._getReusableBaseSession(fullSystemPrompt);
                        if (pooledBase) {
                            const forked = await this._cloneBaseSession(pooledBase, signal, fullSystemPrompt);
                            if (forked) {
                                this._destroySession();
                                this.session = forked;
                                this.sessionState = {
                                    chatId: reuseTarget.chatId,
                                    systemPrompt: fullSystemPrompt,
                                    historyLength: 0,
                                    dirty: false
                                };
                                reusedSession = true;
                            }
                        }
                    }
                } else {
                    if (this.warmingAbort) {
                        try { this.warmingAbort.abort(); } catch (_) {}
                        this.warmingAbort = null;
                    }
                    this.warmingPromise = null;
                    this.warmingKey = null;
                }
            }

            if (reusedSession && this._isBaseSession(this.session) && typeof this.session.clone === 'function') {
                const forked = await this._cloneBaseSession(this.session, signal, fullSystemPrompt);
                if (forked) {
                    this.session = forked;
                    this.sessionState = {
                        chatId: reuseTarget.chatId,
                        systemPrompt: fullSystemPrompt,
                        historyLength: 0,
                        dirty: false
                    };
                } else {
                    // Base session failed to clone (e.g., expired on GPU): force clean create fallback.
                    this._removeBaseSessionByInstance(this.session);
                    this.session = null;
                    this.sessionState = null;
                    reusedSession = false;
                }
            }

            if (!reusedSession) {
                this._destroySession();
                if (onPhase) onPhase('creating');
                const created = await this._awaitWithSignal(
                    this._createRawSession(fullSystemPrompt, formattedHistory, { onDownloadProgress, signal }),
                    signal
                );
                if (signal?.aborted) {
                    this._destroySafely(created);
                    const abortErr = new Error('Operação cancelada.');
                    abortErr.name = 'AbortError';
                    throw abortErr;
                }

                let activeSession = created;
                if (rawHistoryLength === 0 && this._storeBaseSession(fullSystemPrompt, created)) {
                    const forked = await this._cloneBaseSession(created, signal, fullSystemPrompt);
                    if (forked) {
                        activeSession = forked;
                    }
                }

                this.session = activeSession;
                this.sessionState = {
                    chatId: reuseTarget.chatId,
                    systemPrompt: fullSystemPrompt,
                    historyLength: rawHistoryLength,
                    dirty: false
                };
            }

            if (signal?.aborted) {
                const abortErr = new Error('Operação cancelada.');
                abortErr.name = 'AbortError';
                throw abortErr;
            }

            if (this.sessionState) {
                this.sessionState.chatId = reuseTarget.chatId;
                this.sessionState.dirty = true;
            }

            const promptStart = Date.now();
            const setupMs = reusedSession ? 0 : (promptStart - startTime);
            if (onPhase) onPhase('prompting');

            const stream = await this.session.promptStreaming(currentPromptText, { signal });
            let firstTokenTime = null;

            const handleChunk = (val) => {
                if (!firstTokenTime) firstTokenTime = Date.now();
                const chunkStr = typeof val === 'string' ? val : (val?.text || '');
                if (chunkStr.startsWith(fullResponse)) {
                    fullResponse = chunkStr;
                } else {
                    fullResponse += chunkStr;
                }
                onChunk(fullResponse);
            };

            if (stream[Symbol.asyncIterator]) {
                for await (const chunk of stream) {
                    if (signal?.aborted) break;
                    handleChunk(chunk);
                }
            } else if (stream.getReader) {
                const reader = stream.getReader();
                while (true) {
                    if (signal?.aborted) break;
                    const { done, value } = await reader.read();
                    if (done) break;
                    handleChunk(value);
                }
            }

            if (signal?.aborted || !fullResponse.trim()) {
                this._destroySession();
            } else {
                // Keep session KV-cache alive across subsequent turns in the same chat.
                this.sessionState = {
                    chatId: reuseTarget.chatId,
                    systemPrompt: fullSystemPrompt,
                    historyLength: messages.length + 1,
                    dirty: true
                };
            }

            if (onStats && fullResponse) {
                try {
                    const endTime = Date.now();
                    const durationSeconds = (endTime - startTime) / 1000;
                    const ttftMs = firstTokenTime ? (firstTokenTime - startTime) : 0;
                    const promptTtftMs = firstTokenTime ? (firstTokenTime - promptStart) : 0;
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
                        ttft: ttftMs,
                        setupMs,
                        promptTtftMs,
                        reusedSession
                    });
                } catch (statsErr) {
                    console.warn('Could not calculate stats:', statsErr);
                }
            }
        } catch (err) {
            if (!signal?.aborted && err?.name !== 'AbortError') {
                this._invalidateAvailabilityCache();
                if (this._isBaseSession(this.session)) {
                    const broken = this.session;
                    this._removeBaseSessionByInstance(broken);
                    this._destroySafely(broken);
                }
            }
            this._destroySession();
            throw err;
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
        this.assets = new AssetLoader();
        this.abortController = null;
        this.isLoading = false;
        this.renderBuffer = "";
        this.lastRenderTime = 0;
        this.searchQuery = '';
        this._chatRenderToken = 0;
        this._storageWarned = false;
        this.messageRawText = new WeakMap();
        this.emojiPicker = new EmojiPicker('inputPersonaIcon', 'emojiPicker');
        this.colorPicker = new ColorPicker('inputPersonaColor', 'colorPicker');

        const notifyStorageQuota = () => {
            if (this._storageWarned) return;
            this._storageWarned = true;
            this.showDialog('Armazenamento local cheio (QuotaExceededError). Exporte um backup e remova chats antigos para continuar salvando.', {
                title: 'Limite de Armazenamento'
            });
        };
        this.personas.onStorageError = notifyStorageQuota;
        this.chats.onStorageError = notifyStorageQuota;

        this.els = {
            prompt: document.getElementById('promptText'),
            messages: document.getElementById('messages'),
            sendBtn: document.getElementById('sendButton'),
            stopBtn: document.getElementById('stopButton'),
            newChatBtn: document.getElementById('btnNewChat'),
            chatList: document.getElementById('chatList'),
            chatSearchInput: document.getElementById('chatSearchInput'),
            btnClearSearch: document.getElementById('btnClearSearch'),
            sidebar: document.getElementById('sidebar'),
            btnToggleSidebarCollapse: document.getElementById('btnToggleSidebarCollapse'),
            menuBtn: document.getElementById('menuButton'),
            overlay: document.getElementById('overlay'),
            backBtn: document.getElementById('btnVoltar'),
            mobileNotice: document.getElementById('mobile-notice'),
            btnDismissMobileNotice: document.getElementById('btnDismissMobileNotice'),
            chatTopbar: document.getElementById('chatTopbar'),
            activePersonaChip: document.getElementById('activePersonaChip'),
            activeChatTitle: document.getElementById('activeChatTitle'),
            btnOpenCanvasHeader: document.getElementById('btnOpenCanvasHeader'),
            aiStatusBadge: document.getElementById('aiStatusBadge'),
            btnExportChatMd: document.getElementById('btnExportChatMd'),
            btnClearChat: document.getElementById('btnClearChat'),
            personasBtn: document.getElementById('btnPersonas'),
            personasModal: document.getElementById('personasModal'),
            closeModalBtn: document.querySelector('#personasModal .close-modal') || document.querySelector('.close-modal'),
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
            modalFooter: document.querySelector('#personasModal .modal-footer') || document.querySelector('.modal-footer'),
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
            copyCanvasBtn: document.getElementById('copyCanvas'),
            downloadCanvasBtn: document.getElementById('downloadCanvas'),
            closeCanvasBtn: document.getElementById('closeCanvas'),
            refreshCanvasBtn: document.getElementById('refreshCanvas'),
            scrollToBottomBtn: document.getElementById('scrollToBottomBtn')
        };

        this.stickToBottom = true;
        this.currentCanvasCode = '';
        this.currentBlobUrl = null;
        this.codeState = { html: null, css: null, js: null };
        this.els.installBtn = document.getElementById('btnInstallApp');
        this.deferredPrompt = null;
        this.init();
    }

    init() {
        try {
            if (typeof marked !== 'undefined' && marked?.Renderer) {
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

                    const mermaidHeaderMatch = codeContent.match(/^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline)\b/i);
                    const isMermaid = (lang && lang.toLowerCase() === 'mermaid') || Boolean(mermaidHeaderMatch);

                    if (isMermaid) {
                        let fixedCode = codeContent;
                        const headerKind = mermaidHeaderMatch ? mermaidHeaderMatch[1].toLowerCase() : '';
                        const isFlowchart = headerKind === 'graph' || headerKind === 'flowchart';

                        // Apenas graph/flowchart usam classDef default e rótulos [..]/(..)/{..} dessa forma;
                        // aplicar em sequenceDiagram/classDiagram quebraria sintaxe válida.
                        if (isFlowchart) {
                            const chatId = this.chats.activeChatId;
                            const chat = this.chats.get(chatId);
                            const personaColor = safeColor(chat?.personaColor);
                            const darkColor = this.darkenColor(personaColor, 40);

                            const fixLabel = (id, open, content, close) => {
                                let label = (content || '').trim();
                                if (label.startsWith('"') && label.endsWith('"')) label = label.slice(1, -1);
                                label = label.replace(/"/g, "'");
                                return `${id || ''}${open}"${label}"${close}`;
                            };

                            fixedCode = fixedCode.replace(/(\b\w+)?\s*(?:\[([^\]]*)\]|\{([^\}]*)\}|\(([^\)]*)\))/g, (match, id, c1, c2, c3) => {
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
                        }

                        const encodedCode = encodeURIComponent(fixedCode);
                        return `
                            <div class="mermaid-wrapper">
                                <div class="mermaid-top-bar">
                                    <span class="mermaid-label">Diagrama</span>
                                    <div style="display: flex; gap: 8px;">
                                        <button type="button" class="reset-zoom-btn">
                                            Reset Zoom
                                        </button>
                                        <button type="button" class="copy-mermaid-btn" data-data="${encodedCode}">
                                            Copiar Código
                                        </button>
                                    </div>
                                </div>
                                <div class="mermaid">${escapeHtml(fixedCode)}</div>
                            </div>`;
                    }
                    return originalCode(code, language);
                };

                marked.use({ renderer });
            }
        } catch (e) {
            console.error('Marked init error:', e);
        }

        if (document.readyState !== 'loading') {
            this.loadInitialState();
        } else {
            document.addEventListener('DOMContentLoaded', () => this.loadInitialState(), { once: true });
        }

        if (this.els.menuBtn) this.els.menuBtn.onclick = () => this.toggleSidebar();
        if (this.els.overlay) this.els.overlay.onclick = () => this.toggleSidebar();
        if (this.els.btnToggleSidebarCollapse) {
            this.els.btnToggleSidebarCollapse.onclick = () => this.toggleDesktopSidebar();
        }

        if (this.els.btnDismissMobileNotice && this.els.mobileNotice) {
            try {
                if (sessionStorage.getItem('dismissedMobileNotice') === '1') {
                    this.els.mobileNotice.classList.add('dismissed');
                    document.body.classList.add('mobile-notice-dismissed');
                }
            } catch (_) { }

            this.els.btnDismissMobileNotice.onclick = () => {
                this.els.mobileNotice.classList.add('dismissed');
                document.body.classList.add('mobile-notice-dismissed');
                try { sessionStorage.setItem('dismissedMobileNotice', '1'); } catch (_) { }
            };
        }

        if (this.els.chatSearchInput) {
            this.els.chatSearchInput.addEventListener('input', (e) => {
                this.setSearchQuery(e.target.value);
            });
        }
        if (this.els.btnClearSearch) {
            this.els.btnClearSearch.onclick = () => {
                if (this.els.chatSearchInput) this.els.chatSearchInput.value = '';
                this.setSearchQuery('');
                this.els.chatSearchInput?.focus();
            };
        }

        if (this.els.activePersonaChip) {
            this.els.activePersonaChip.onclick = () => this.openPersonasModal();
        }
        if (this.els.btnOpenCanvasHeader) {
            this.els.btnOpenCanvasHeader.onclick = () => {
                const combined = this.combineCode(this.codeState);
                if (combined) this.openCanvas(combined);
            };
        }
        if (this.els.aiStatusBadge) {
            this.els.aiStatusBadge.onclick = () => this.showAIAvailabilityHelp();
        }
        if (this.els.btnExportChatMd) {
            this.els.btnExportChatMd.onclick = () => this.exportActiveChatMarkdown();
        }
        if (this.els.btnClearChat) {
            this.els.btnClearChat.onclick = () => this.confirmClearActiveChat();
        }

        const savedCollapsed = safeStorageGet('sidebarCollapsed') === '1';
        if (savedCollapsed && this.els.sidebar && window.innerWidth > 768) {
            this.setDesktopSidebarCollapsed(true);
        }

        if (this.els.newChatBtn) this.els.newChatBtn.onclick = () => this.createNewChat();

        if (this.els.backBtn) {
            this.els.backBtn.onclick = () => {
                if (window.opener) window.close();
                else window.location.href = '/';
            };
        }

        if (this.els.sendBtn) this.els.sendBtn.onclick = () => this.handleSend();
        if (this.els.stopBtn) this.els.stopBtn.onclick = () => this.handleStop();

        this.initScroll();

        if (this.els.prompt) {
            this.els.prompt.addEventListener('input', () => this.adjustTextarea());
            this.els.prompt.addEventListener('focus', () => this.warmUpActiveChat({ includeHistory: true }));
            this.els.prompt.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSend();
                }
            };
        }

        if (this.els.personasBtn) this.els.personasBtn.onclick = () => this.openPersonasModal();
        if (this.els.closeModalBtn) this.els.closeModalBtn.onclick = () => this.closePersonasModal();

        this.els.personasModal.addEventListener('mousedown', (e) => {
            this.personasModalMousedownTarget = e.target;
        });
        this.els.personasModal.addEventListener('click', (e) => {
            if (e.target === this.els.personasModal && this.personasModalMousedownTarget === this.els.personasModal) {
                this.closePersonasModal();
            }
        });

        if (this.els.closeGenericModalBtn) this.els.closeGenericModalBtn.onclick = () => this.els.genericModal.classList.remove('active');

        this.els.genericModal.addEventListener('mousedown', (e) => {
            this.genericModalMousedownTarget = e.target;
        });

        this.els.genericModal.addEventListener('click', (e) => {
            if (e.target === this.els.genericModal && this.genericModalMousedownTarget === this.els.genericModal) {
                if (this.els.genericModalCancelBtn && this.els.genericModalCancelBtn.offsetParent !== null) {
                    this.els.genericModalCancelBtn.click();
                } else if (this.els.closeGenericModalBtn) {
                    this.els.closeGenericModalBtn.click();
                } else {
                    this.els.genericModal.classList.remove('active');
                }
            }
        });
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
                if (this.els.genericModal && this.els.genericModal.classList.contains('active')) {
                    if (this.els.genericModalCancelBtn && this.els.genericModalCancelBtn.offsetParent !== null) {
                        this.els.genericModalCancelBtn.click();
                    } else if (this.els.closeGenericModalBtn) {
                        this.els.closeGenericModalBtn.click();
                    } else {
                        this.els.genericModal.classList.remove('active');
                    }
                    return;
                }

                const editModal = document.getElementById('editMessageModal');
                if (editModal && editModal.classList.contains('active')) {
                    const cancelEdit = document.getElementById('cancelEditBtn');
                    if (cancelEdit) cancelEdit.click();
                    return;
                }

                if (this.els.personasModal && this.els.personasModal.classList.contains('active')) {
                    this.closePersonasModal();
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

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            if (this.els.installBtn) {
                this.els.installBtn.style.display = 'flex';
            }
        });

        if (this.els.installBtn) {
            this.els.installBtn.addEventListener('click', async () => {
                if (this.deferredPrompt) {
                    this.deferredPrompt.prompt();
                    const { outcome } = await this.deferredPrompt.userChoice;
                    console.log(`Escolha de instalação: ${outcome}`);
                    
                    this.deferredPrompt = null;
                    this.els.installBtn.style.display = 'none';
                }
            });
        }

        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            if (this.els.installBtn) {
                this.els.installBtn.style.display = 'none';
            }
            console.log('PWA instalado com sucesso!');
        });
    }

    loadInitialState() {
        const chats = this.chats.getAll();

        if (chats.length === 0) {
            this.createNewChat();
        } else {
            const savedId = safeStorageGet('activeChatId');
            const targetId = savedId && this.chats.get(savedId) ? savedId : chats[0].id;
            this.switchChat(targetId);
        }

        this.adjustTextarea();
        this.initCanvas();
        this.refreshAIStatus();
    }

    initCanvas() {
        if (this.els.closeCanvasBtn) {
            this.els.closeCanvasBtn.onclick = () => this.closeCanvas();
        }
        if (this.els.refreshCanvasBtn) {
            this.els.refreshCanvasBtn.onclick = () => this.refreshCanvas();
        }
        if (this.els.copyCanvasBtn) {
            this.els.copyCanvasBtn.onclick = () => this.copyCanvasCode();
        }
        if (this.els.downloadCanvasBtn) {
            this.els.downloadCanvasBtn.onclick = () => this.downloadCanvasHtml();
        }
    }

    openCanvas(code) {
        this.currentCanvasCode = code;
        if (!this.els.mainWrapper) return;

        const container = this.els.mainWrapper.querySelector('.container');
        if (container) container.style.width = '';

        this.els.mainWrapper.classList.add('canvas-open');
        this.els.mainWrapper.classList.remove('canvas-closing');
        this.renderCanvasPreview(code);
        this.updateTopbar();

        if (this.stickToBottom) {
            requestAnimationFrame(() => this.scrollToBottom());
        }
    }

    closeCanvas() {
        if (!this.els.mainWrapper) return;

        const container = this.els.mainWrapper.querySelector('.container');
        if (container) container.style.width = '';

        this.els.mainWrapper.classList.remove('canvas-open', 'canvas-closing');
        if (this.currentBlobUrl) {
            try { URL.revokeObjectURL(this.currentBlobUrl); } catch (_) { }
            this.currentBlobUrl = null;
        }
        if (this.els.canvasFrame) {
            this.els.canvasFrame.removeAttribute('srcdoc');
            this.els.canvasFrame.src = 'about:blank';
        }
        this.currentCanvasCode = '';
        this.updateTopbar();

        if (this.stickToBottom) {
            requestAnimationFrame(() => this.scrollToBottom());
        }
    }

    async copyCanvasCode() {
        if (!this.currentCanvasCode) return;
        const btn = this.els.copyCanvasBtn;
        try {
            await navigator.clipboard.writeText(this.currentCanvasCode);
            if (btn) {
                btn.classList.add('copied');
                const prevTitle = btn.title;
                btn.title = 'Copiado!';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.title = prevTitle;
                }, 1800);
            }
        } catch (_) {
            this.showDialog('Não foi possível copiar o código automaticamente.', { title: 'Aviso' });
        }
    }

    downloadCanvasHtml() {
        if (!this.currentCanvasCode) return;
        const blob = new Blob([this.currentCanvasCode], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nanochat-preview.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
        if (!this.els.mainWrapper || !text) return;
        if (!force && !text.includes('```')) return;

        const now = Date.now();
        if (!this.lastCanvasUpdate) this.lastCanvasUpdate = 0;

        if (!force && now - this.lastCanvasUpdate < 650) return;

        const blocks = this.extractCodeForPreview(text);
        if (!blocks || (!blocks.html && !blocks.css && !blocks.js)) return;

        if (force) {
            this.updateCodeState(blocks);
        }

        const merged = force
            ? this.codeState
            : {
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

    setDesktopSidebarCollapsed(collapsed) {
        if (!this.els.sidebar) return;
        this.els.sidebar.classList.toggle('collapsed', collapsed);
        const container = this.els.mainWrapper?.querySelector('.container') || document.querySelector('.container');
        if (this.els.mainWrapper) this.els.mainWrapper.classList.toggle('sidebar-collapsed', collapsed);
        if (container) container.classList.toggle('full-width', collapsed);
        if (this.els.btnToggleSidebarCollapse) {
            this.els.btnToggleSidebarCollapse.setAttribute('aria-expanded', String(!collapsed));
            this.els.btnToggleSidebarCollapse.title = collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral';
        }
        safeStorageSet('sidebarCollapsed', collapsed ? '1' : '0');
    }

    toggleDesktopSidebar() {
        if (!this.els.sidebar) return;
        const willCollapse = !this.els.sidebar.classList.contains('collapsed');
        this.setDesktopSidebarCollapsed(willCollapse);
    }

    setSearchQuery(query) {
        this.searchQuery = String(query || '').trim().toLowerCase();
        if (this.els.btnClearSearch) {
            this.els.btnClearSearch.style.display = this.searchQuery ? 'flex' : 'none';
        }
        this.renderChatList();
    }

    abortActiveStream() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    async refreshAIStatus({ force = true, warmUp = true } = {}) {
        const info = await this.ai.getAvailabilityInfo({ force });
        this.aiStatusInfo = info;
        const badge = this.els.aiStatusBadge;
        if (!badge) return;

        badge.classList.remove('status-ready', 'status-warn', 'status-error');
        if (info.status === 'ready') {
            badge.classList.add('status-ready');
        } else if (info.available) {
            badge.classList.add('status-warn');
        } else {
            badge.classList.add('status-error');
        }

        const labelEl = badge.querySelector('.ai-status-label');
        if (labelEl) {
            labelEl.textContent = info.label;
        } else {
            badge.textContent = info.label;
        }
        badge.title = info.reason || info.label;
        if (warmUp && info.status === 'ready' && !this.isLoading) {
            this.warmUpActiveChat({ includeHistory: false });
        }
    }

    /** Assemble system prompt + code context consistently for warm-up and chat turns. */
    buildChatSystemPrompt(chat) {
        let systemPrompt = chat ? (chat.systemPrompt || '') : '';
        if (!systemPrompt && chat && chat.personaName) {
            const p = this.personas.getAll().find(per => per.name === chat.personaName);
            if (p && p.prompt) systemPrompt = p.prompt;
        }
        if (!systemPrompt) {
            const defaultP = this.personas.get('default');
            if (defaultP && defaultP.prompt) systemPrompt = defaultP.prompt;
        }

        const hasCodeContext = this.codeState && (this.codeState.html || this.codeState.css || this.codeState.js);
        const isDevPersona = chat && (
            (chat.personaName || '').includes('Dev') ||
            (chat.personaName || '').includes('Arquiteto')
        );

        if (isDevPersona || hasCodeContext) {
            systemPrompt += `\n\n[REGRAS TÉCNICAS PARA CÓDIGO]:\nSe você for gerar ou editar HTML, siga estas regras: 1. Todo elemento HTML gerado deve ter 'id'. 2. ECONOMIA DE TOKENS: Ao editar, gere APENAS o bloco HTML alterado e não o arquivo todo, a menos que solicitado.`;
        }

        if (hasCodeContext) {
            const combinedCode = this.combineCode(this.codeState);
            if (combinedCode) {
                if (combinedCode.length <= 2500) {
                    systemPrompt += `\n\n[CONTEXTO ATUAL]:\n\`\`\`html\n${combinedCode}\n\`\`\``;
                } else {
                    const truncatedCode = combinedCode.substring(0, 2500);
                    systemPrompt += `\n\n[CONTEXTO ATUAL (PARCIAL)]:\n\`\`\`html\n${truncatedCode}\n...[CÓDIGO TRUNCADO]\n\`\`\``;
                }
            }
        }
        return systemPrompt;
    }

    /** Silently pre-warm the active chat session (base prompt first unless user focuses history). */
    warmUpActiveChat({ includeHistory = false } = {}) {
        if (this.isLoading) return null;
        if (!this.aiStatusInfo || this.aiStatusInfo.status !== 'ready') return null;
        const chatId = this.chats.activeChatId;
        const chat = this.chats.get(chatId);
        if (!chat) return null;

        const systemPrompt = this.buildChatSystemPrompt(chat);
        const fullConfig = this.ai.buildPromptConfig(
            chat.messages.map(m => ({ role: m.role, content: m.content })),
            systemPrompt,
            false
        );
        if (this.ai._isSessionReusable({
            chatId,
            fullSystemPrompt: fullConfig.fullSystemPrompt,
            rawHistoryLength: fullConfig.rawHistoryLength
        })) {
            return this.ai.session;
        }

        const messages = includeHistory && chat.messages.length > 0
            ? chat.messages.map(m => ({ role: m.role, content: m.content }))
            : [];
        return this.ai.warmUp({ chatId, messages, systemPrompt });
    }

    showAIAvailabilityHelp() {
        const info = this.aiStatusInfo || { available: false, label: 'Chrome AI', reason: '' };
        if (info.status === 'ready') {
            this.showDialog('O modelo local Gemini Nano está ativo e pronto para uso offline no navegador.', {
                title: 'Chrome AI Pronto'
            });
            return;
        }
        if (info.available) {
            this.showDialog(`${info.reason}\n\nEnvie sua primeira mensagem para iniciar o preparo do modelo local.`, {
                title: info.label
            });
            return;
        }

        this.showDialog(
            `${info.reason}\n\nPara ativar no Google Chrome Desktop (138+):\n1. Abra chrome://flags/#prompt-api-for-gemini-nano → Enabled\n2. Abra chrome://flags/#optimization-guide-on-device-model → Enabled BypassPerfRequirement\n3. Reinicie o Chrome e aguarde o download em chrome://components (Optimization Guide On Device Model).`,
            {
                title: 'Como ativar o Chrome AI',
                buttons: [
                    {
                        text: 'Verificar Novamente',
                        class: 'btn-primary',
                        onClick: () => { this.refreshAIStatus(); }
                    },
                    {
                        text: 'Fechar',
                        class: 'btn-secondary',
                        onClick: () => { }
                    }
                ]
            }
        );
    }

    updateTopbar() {
        const chat = this.chats.get(this.chats.activeChatId);
        if (this.els.activeChatTitle) {
            this.els.activeChatTitle.textContent = chat ? chat.title : 'NanoChat';
        }
        if (this.els.activePersonaChip && chat) {
            const persona = this.personas.getAll().find(p => p.name === chat.personaName);
            const name = persona ? persona.name : (chat.personaName || 'Padrão');
            const icon = escapeHtml(persona ? (persona.icon || '🤖') : (chat.personaIcon || '🤖'));
            const color = safeColor(persona ? persona.color : chat.personaColor);
            this.els.activePersonaChip.style.borderColor = `${color}66`;
            this.els.activePersonaChip.innerHTML = `<span class="persona-chip-icon" style="color:${color}">${icon}</span><span class="persona-chip-name">${escapeHtml(name)}</span>`;
        }
        if (this.els.btnOpenCanvasHeader) {
            const hasPreviewCode = Boolean(this.codeState && (this.codeState.html || this.codeState.css || this.codeState.js));
            const canvasOpen = this.els.mainWrapper?.classList.contains('canvas-open');
            this.els.btnOpenCanvasHeader.style.display = (hasPreviewCode && !canvasOpen) ? 'inline-flex' : 'none';
        }
        if (this.els.btnExportChatMd) {
            const hasMsgs = Boolean(chat && chat.messages.length > 0);
            this.els.btnExportChatMd.disabled = !hasMsgs;
        }
        if (this.els.btnClearChat) {
            const hasMsgs = Boolean(chat && chat.messages.length > 0);
            this.els.btnClearChat.disabled = !hasMsgs;
        }
    }

    exportActiveChatMarkdown() {
        const chat = this.chats.get(this.chats.activeChatId);
        if (!chat || chat.messages.length === 0) return;

        const lines = [`# ${chat.title}\n`];
        if (chat.personaName) lines.push(`> Persona: ${chat.personaName}\n`);
        lines.push('---\n');

        chat.messages.forEach((msg) => {
            const author = msg.role === 'user' ? 'Você' : (chat.personaName || 'Assistente');
            lines.push(`## ${author}\n\n${msg.content}\n`);
        });

        const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const safeName = (chat.title || 'conversa')
            .toLowerCase()
            .replace(/[^a-z0-9-_]+/gi, '-')
            .replace(/^-+|-+$/g, '') || 'conversa';
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeName}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    confirmClearActiveChat() {
        const chat = this.chats.get(this.chats.activeChatId);
        if (!chat || chat.messages.length === 0) return;

        this.showDialog(`Limpar todas as mensagens de "${chat.title}"?`, {
            title: 'Limpar Conversa',
            type: 'confirm',
            onConfirm: () => {
                this.abortActiveStream();
                this.ai.invalidateSession({ keepCleanBase: true });
                this.chats.clearMessages(chat.id);
                this.codeState = { html: null, css: null, js: null };
                if (this.els.mainWrapper?.classList.contains('canvas-open')) {
                    this.closeCanvas();
                }
                this.switchChat(chat.id);
            }
        });
    }

    createNewChat(systemPrompt = '', personaName = 'Padrão', personaIcon = null, personaColor = null) {
        this.abortActiveStream();
        this.ai.invalidateSession({ keepCleanBase: true });
        const defaultPersona = this.personas.get('default') || this.personas.getAll()[0];
        const initialPrompt = (systemPrompt !== undefined && systemPrompt !== '') ? systemPrompt : (defaultPersona ? defaultPersona.prompt : '');
        const initialName = personaName || (defaultPersona ? defaultPersona.name : 'Padrão');
        const initialIcon = personaIcon || (defaultPersona ? defaultPersona.icon : '🤖');
        const initialColor = personaColor || (defaultPersona ? defaultPersona.color : '#f2511b');

        const allChats = this.chats.getAll();
        allChats.forEach(chat => {
            if (chat.messages.length === 0 && chat.id !== this.chats.activeChatId) {
                this.chats.delete(chat.id);
            }
        });

        const activeChat = this.chats.get(this.chats.activeChatId);
        if (activeChat && activeChat.messages.length === 0 && initialPrompt) {
            this.chats.delete(activeChat.id);
        }

        const chat = this.chats.create(initialPrompt, initialName, initialIcon, initialColor);
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
        if (this.chats.activeChatId && this.chats.activeChatId !== id) {
            this.abortActiveStream();
            this.ai.invalidateSession({ keepCleanBase: true });
        }
        this._chatRenderToken++;
        this.chats.activeChatId = id;
        safeStorageSet('activeChatId', id);
        this.reconstructCodeState(id);

        if (this.codeState.html) {
            const combinedHtml = this.combineCode(this.codeState);
            this.openCanvas(combinedHtml);
        } else {
            if (this.els.mainWrapper && this.els.mainWrapper.classList.contains('canvas-open')) {
                this.closeCanvas();
            }
        }

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

        this.scrollToBottomSoon();

        this.renderChatList();
        this.updateInputState();
        this.updateTopbar();

        if (window.innerWidth <= 768 && this.els.sidebar && this.els.sidebar.classList.contains('open')) {
            this.toggleSidebar();
        }
        this.warmUpActiveChat({ includeHistory: false });
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
        const personaColor = safeColor(persona?.color || chat?.personaColor);
        const personaIcon = escapeHtml(persona?.icon || chat?.personaIcon || '🤖');
        const personaName = persona?.name || chat?.personaName || 'Assistente';
        const greeting = personaName && personaName !== 'Padrão'
            ? `Olá! Como ${escapeHtml(personaName)} pode ajudar?`
            : 'Olá! Como posso ajudar?';

        const container = document.createElement('div');
        container.className = 'suggestion-pills-container';
        container.innerHTML = `
            <div class="suggestion-welcome">
                <div class="suggestion-avatar" style="background-color: ${personaColor}20; color: ${personaColor};">
                    ${personaIcon}
                </div>
                <h2>${greeting}</h2>
                <p>Escolha uma sugestão abaixo ou digite sua própria mensagem.</p>
            </div>
            <div class="suggestion-pills">
                ${suggestions.map(s => `
                    <button type="button" class="suggestion-pill" data-prompt="${encodeURIComponent(s.prompt)}">
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
                if (this.chats.activeChatId === id) {
                    this.abortActiveStream();
                    this.ai.invalidateSession({ keepCleanBase: true });
                }
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
                    if (id === this.chats.activeChatId) this.updateTopbar();
                }
            }
        });
    }

    renderChatList() {
        if (!this.els.chatList) return;
        this.els.chatList.innerHTML = '';

        const query = this.searchQuery;
        const allChats = this.chats.getAll();
        const filteredChats = query
            ? allChats.filter(chat => {
                if ((chat.title || '').toLowerCase().includes(query)) return true;
                if ((chat.personaName || '').toLowerCase().includes(query)) return true;
                return Array.isArray(chat.messages) && chat.messages.some(m => (m.content || '').toLowerCase().includes(query));
            })
            : allChats;

        if (filteredChats.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'chat-list-empty';
            empty.textContent = query ? 'Nenhum chat encontrado.' : 'Sem conversas ainda.';
            this.els.chatList.appendChild(empty);
            return;
        }

        filteredChats.forEach(chat => {
            const item = document.createElement('div');
            item.className = `chat-item ${chat.id === this.chats.activeChatId ? 'active' : ''}`;

            item.innerHTML = `
                <span>
                    ${this.getPersonaBadge(chat.personaName, chat.personaIcon, chat.personaColor)}
                    ${escapeHtml(chat.title)}
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
                item.style.borderLeftColor = safeColor(persona.color);
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
                this.els.genericModalOkBtn = null;
                this.els.genericModalCancelBtn = null;

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
                    if (type === 'prompt' && (!value || !value.trim())) return;

                    this.els.genericModal.classList.remove('active');
                    onConfirm(value);
                };

                this.els.genericModalFooter.appendChild(cancelBtn);
                this.els.genericModalFooter.appendChild(okBtn);
                this.els.genericModalCancelBtn = cancelBtn;
                this.els.genericModalOkBtn = okBtn;
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

            const activePersonaName = persona ? persona.name : (chat.personaName || 'Padrão');
            const activeColor = safeColor(persona ? persona.color : chat.personaColor);

            if (activePersonaName === 'Padrão' || !activePersonaName) {
                prompt.placeholder = 'Digite sua mensagem para a IA...';
            } else {
                prompt.placeholder = `Conversando com ${activePersonaName}...`;
            }

            if (this.els.messages) {
                let bubbleColor = activeColor;
                let textColor = 'white';

                if (this.getContrastYIQ(activeColor) === 'black') {
                    bubbleColor = this.darkenColor(activeColor, 45);
                }

                prompt.style.setProperty('--current-chat-color', bubbleColor);
                prompt.style.borderColor = bubbleColor;
                prompt.style.boxShadow = '';

                this.els.messages.style.setProperty('--current-chat-color', bubbleColor);
                this.els.messages.style.setProperty('--current-chat-text-color', textColor);

                if (this.els.sendBtn) {
                    this.els.sendBtn.style.setProperty('--current-chat-color', bubbleColor);
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

        const icon = escapeHtml(persona ? (persona.icon || '🤖') : (iconSnapshot || '🤖'));
        const color = safeColor(persona ? persona.color : colorSnapshot, 'inherit');

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
            const personaColor = safeColor(p.color);
            const personaIcon = escapeHtml(p.icon || '🤖');
            const personaName = escapeHtml(p.name);
            const personaDesc = p.id === 'default'
                ? 'Assistente geral do Chrome AI. Versátil e útil para a maioria das tarefas.'
                : (p.prompt ? escapeHtml(p.prompt.substring(0, 60)) + (p.prompt.length > 60 ? '...' : '') : 'Sem descrição');

            el.innerHTML = `
                <div class="persona-info">
                    <div style="display:flex; align-items:center; gap: 0.5rem;">
                        <span class="persona-icon-display" style="background-color: ${personaColor}20; color: ${personaColor}; border-radius: 4px;">${personaIcon}</span>
                        <strong>${personaName}</strong>
                    </div>
                    <p>${personaDesc}</p>
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
            const previousPersona = this.personas.get(this.currentEditingId);
            const oldName = previousPersona ? previousPersona.name : null;
            this.personas.update(this.currentEditingId, name, prompt, color, icon);
            if (oldName) {
                let chatsUpdated = false;
                this.chats.getAll().forEach(c => {
                    if (c.personaName === oldName) {
                        c.personaName = name;
                        c.personaIcon = icon;
                        c.personaColor = color;
                        chatsUpdated = true;
                    }
                });
                if (chatsUpdated) this.chats.save();
            }
        } else {
            this.personas.create(name, prompt, color, icon);
        }

        this.renderPersonasList();
        this.renderChatList();
        this.updateInputState();
        this.updateTopbar();
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
        reader.onerror = () => {
            this.showDialog('Erro ao ler o arquivo selecionado.', { title: 'Erro' });
        };
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const existingNames = this.personas.getAll().map(p => p.name.toLowerCase());

                if (data.type === 'personas' && Array.isArray(data.personas)) {
                    let imported = 0;
                    let skipped = 0;
                    data.personas.forEach(rawPersona => {
                        const persona = normalizePersona(rawPersona);
                        if (persona.name && persona.prompt !== undefined) {
                            if (existingNames.includes(persona.name.toLowerCase())) {
                                skipped++;
                            } else {
                                this.personas.create(persona.name, persona.prompt, persona.color, persona.icon);
                                existingNames.push(persona.name.toLowerCase());
                                imported++;
                            }
                        }
                    });
                    this.showDialog(`${imported} persona(s) importada(s)${skipped > 0 ? `, ${skipped} ignorada(s) (duplicadas)` : ''}`, { title: 'Importação Concluída' });
                    this.renderPersonasList();
                } else if (data.name && data.prompt !== undefined) {
                    const persona = normalizePersona(data);
                    if (existingNames.includes(persona.name.toLowerCase())) {
                        this.showDialog(`Persona "${persona.name}" já existe.`, { title: 'Importação Falhou' });
                    } else {
                        this.personas.create(persona.name, persona.prompt, persona.color, persona.icon);
                        this.showDialog(`Persona "${persona.name}" importada com sucesso!`, { title: 'Importação Concluída' });
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
        reader.onerror = () => {
            this.showDialog('Erro ao ler o arquivo selecionado.', { title: 'Erro' });
        };
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (data.type === 'chats' && Array.isArray(data.chats)) {
                    const importPersonas = () => {
                        if (!Array.isArray(data.personas)) return 0;
                        const existingNames = new Set(this.personas.getAll().map(p => p.name));
                        let count = 0;
                        data.personas.forEach(rawPersona => {
                            const persona = normalizePersona(rawPersona);
                            if (!persona.name) return;
                            if (!existingNames.has(persona.name)) {
                                this.personas.personas.push(persona);
                                existingNames.add(persona.name);
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

                                    data.chats.forEach(rawChat => {
                                        const chat = normalizeChat(rawChat);
                                        const isDuplicate = existingChats.some(existing =>
                                            existing.title === chat.title &&
                                            Array.isArray(existing.messages) &&
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
                                    this.chats.chats = data.chats.map(normalizeChat);
                                    this.chats.save();

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

        let chatId = this.chats.activeChatId;
        let currentChat = this.chats.get(chatId);
        if (!currentChat) {
            this.createNewChat();
            chatId = this.chats.activeChatId;
            currentChat = this.chats.get(chatId);
        }

        if (currentChat && !this.skipUserMessage) {
            this.chats.addMessage(chatId, 'user', text);
            this.renderChatList();

            if (currentChat.messages.length === 1) {
                if (this.chats.autoUpdateTitle(chatId, text)) {
                    this.renderChatList();
                }
            }
            this.updateTopbar();
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
                <div class="skeleton-loading" aria-live="polite">
                    <div class="skeleton-status">
                        <span class="skeleton-phase" id="${msgId}-phase">Verificando IA local...</span>
                        <span class="skeleton-timer" id="${msgId}-timer">0s</span>
                    </div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-hint" id="${msgId}-hint" hidden>O primeiro carregamento do Gemini Nano na memória/GPU pode levar alguns segundos.</div>
                </div>
            </div>
        `;
        this.addMessageToDOM(skeletonHtml, 'assistant');

        this.setLoadingState(true);
        this.abortController = new AbortController();

        this.scrollToBottom(true);

        const msgElement = document.getElementById(msgId);
        const isStillActiveBubble = () => Boolean(msgElement && msgElement.isConnected && this.chats.activeChatId === chatId);
        const phaseEl = document.getElementById(`${msgId}-phase`);
        const timerEl = document.getElementById(`${msgId}-timer`);
        const hintEl = document.getElementById(`${msgId}-hint`);
        const waitStartedAt = Date.now();
        const phaseLabels = {
            creating: 'Inicializando Gemini Nano na memória...',
            prompting: 'Aguardando primeira resposta...'
        };
        let fullResponse = "";
        let firstChunk = true;
        const downloadMsgId = 'download-progress-msg';
        const waitTimerId = setInterval(() => {
            if (!isStillActiveBubble() || !firstChunk) {
                clearInterval(waitTimerId);
                return;
            }
            const elapsedSec = Math.floor((Date.now() - waitStartedAt) / 1000);
            if (timerEl && timerEl.isConnected) {
                timerEl.textContent = `${elapsedSec}s`;
            }
            if (hintEl && hintEl.isConnected && elapsedSec >= 10) {
                if (elapsedSec >= 20) {
                    hintEl.textContent = 'Demorando mais que o normal? Verifique chrome://on-device-internals ou clique em Parar e tente novamente.';
                }
                hintEl.hidden = false;
            }
        }, 1000);

        try {
            const availability = await this.ai.getAvailabilityInfo();
            this.aiStatusInfo = availability;
            if (!availability.available) {
                const err = new Error(availability.reason || 'API de IA não disponível. Verifique as flags do Chrome.');
                err.isAvailabilityError = true;
                throw err;
            }

            const context = currentChat ? currentChat.messages.map(m => ({ role: m.role, content: m.content })) : [];
            const systemPrompt = this.buildChatSystemPrompt(currentChat);

            let responseStats = null;

            await this.ai.generateStream(
                context,
                systemPrompt,
                {
                    onPhase: (phase) => {
                        if (firstChunk && isStillActiveBubble() && phaseEl && phaseEl.isConnected) {
                            phaseEl.textContent = phaseLabels[phase] || phaseLabels.prompting;
                        }
                    },
                    onChunk: (chunkText) => {
                        fullResponse = chunkText;
                        if (!isStillActiveBubble()) return;

                        if (firstChunk) {
                            clearInterval(waitTimerId);
                            msgElement.className = 'message is-streaming';
                            const dlRow = document.getElementById(downloadMsgId)?.closest('.rowAssistant');
                            if (dlRow) dlRow.remove();
                            firstChunk = false;
                        }

                        this.throttledRender(fullResponse, msgElement, false);
                        this.checkAutoUpdateCanvas(fullResponse, false);
                    },
                    onDownloadProgress: (e) => {
                        if (isStillActiveBubble()) {
                            this.handleDownloadProgress(e, downloadMsgId);
                        }
                    },
                    onStats: (stats) => {
                        responseStats = stats;
                    }
                },
                this.abortController.signal,
                { chatId }
            );

            if (isStillActiveBubble()) {
                await this.throttledRender(fullResponse, msgElement, true);
            }

            if (!fullResponse.trim()) {
                if (isStillActiveBubble()) {
                    msgElement.innerHTML = '<p class="error-message"><b>Nada foi gerado.</b> Tente enviar novamente.</p>';
                }
                return;
            }

            if (this.chats.get(chatId)) {
                this.chats.addMessage(chatId, 'assistant', fullResponse);
                this.renderChatList();
            }

            if (isStillActiveBubble()) {
                this.messageRawText.set(msgElement, fullResponse);
                this.addCopyButtons(msgElement, fullResponse);
                this.checkAutoUpdateCanvas(fullResponse, true);

                if (responseStats) {
                    const sessionDetail = responseStats.reusedSession
                        ? ' · Sessão em cache'
                        : (responseStats.setupMs > 0 ? ` · Setup: ${responseStats.setupMs}ms` : '');
                    const statsHtml = `<div class="message-stats">Tokens: ${responseStats.tokens} · Velocidade: ${responseStats.tokensPerSecond} tok/s · Primeiro token: ${responseStats.ttft}ms${sessionDetail} · Tempo total: ${responseStats.duration}s</div>`;
                    msgElement.insertAdjacentHTML('beforeend', statsHtml);
                }
            }

        } catch (error) {
            if (this.abortController?.signal.aborted || error.name === 'AbortError') {
                if (fullResponse && fullResponse.trim() && this.chats.get(chatId)) {
                    this.chats.addMessage(chatId, 'assistant', fullResponse);
                    this.renderChatList();
                    if (isStillActiveBubble()) {
                        this.messageRawText.set(msgElement, fullResponse);
                        this.addCopyButtons(msgElement, fullResponse);
                    }
                } else if (msgElement && msgElement.isConnected) {
                    const row = msgElement.closest('.rowAssistant');
                    if (row) row.remove();
                    else msgElement.remove();
                }
            } else if (isStillActiveBubble()) {
                msgElement.innerHTML = `<p class="error-message"><b>Erro:</b> ${escapeHtml(error.message)}</p>`;
                if (error.isAvailabilityError) {
                    const helpBtn = document.createElement('button');
                    helpBtn.type = 'button';
                    helpBtn.className = 'btn-primary-small';
                    helpBtn.style.marginTop = '0.5rem';
                    helpBtn.textContent = 'Ver instruções para ativar';
                    helpBtn.onclick = () => this.showAIAvailabilityHelp();
                    msgElement.appendChild(helpBtn);
                }
            }
        } finally {
            clearInterval(waitTimerId);
            this.setLoadingState(false);
            const activeBubble = document.getElementById(msgId);
            if (activeBubble) activeBubble.classList.remove('is-streaming');
            this.abortController = null;

            this.updateMessageActions();
            this.updateTopbar();
            this.refreshAIStatus({
                force: this.aiStatusInfo?.status !== 'ready',
                warmUp: false
            });
            // Cabeçalhos de código, estatísticas e botões de ação mudam a altura no fim.
            this.scrollToBottom();
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

        this.ai.invalidateSession();
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

            this.ai.invalidateSession();
            this.els.prompt.value = editedMessage.trim();
            this.handleSend();
        });
    }

    showEditMessageModal(currentMessage, onConfirm) {
        const modalHtml = `
            <div class="modal" id="editMessageModal">
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

        requestAnimationFrame(() => {
            modal.classList.add('active');
        });

        const closeModal = () => {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        };

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        closeBtn.onclick = closeModal;
        cancelBtn.onclick = closeModal;
        let mousedownTarget = null;
        modal.addEventListener('mousedown', (e) => {
            mousedownTarget = e.target;
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal && mousedownTarget === modal) {
                closeModal();
            }
        });

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
            const actionsWrap = document.createElement('div');
            actionsWrap.className = 'message-actions';
            actionsWrap.innerHTML = `
                <button type="button" class="action-btn edit-btn" title="Editar mensagem" aria-label="Editar mensagem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                </button>
            `;
            actionsWrap.querySelector('.edit-btn').onclick = () => this.handleEditLastMessage();
            lastUserRow.appendChild(actionsWrap);
        }

        assistantRows.forEach((row, index) => {
            const msgEl = row.querySelector('.message');
            if (!msgEl || msgEl.querySelector('.skeleton-loading')) return;

            const actionsWrap = document.createElement('div');
            actionsWrap.className = 'message-actions';

            const copyMsgBtn = document.createElement('button');
            copyMsgBtn.type = 'button';
            copyMsgBtn.className = 'action-btn copy-msg-btn';
            copyMsgBtn.title = 'Copiar resposta';
            copyMsgBtn.setAttribute('aria-label', 'Copiar resposta');
            copyMsgBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            `;
            copyMsgBtn.onclick = async () => {
                const raw = this.messageRawText.get(msgEl) || msgEl.textContent || '';
                if (!raw.trim()) return;
                try {
                    await navigator.clipboard.writeText(raw);
                    copyMsgBtn.classList.add('copied');
                    copyMsgBtn.title = 'Copiado!';
                    setTimeout(() => {
                        copyMsgBtn.classList.remove('copied');
                        copyMsgBtn.title = 'Copiar resposta';
                    }, 1800);
                } catch (_) { }
            };
            actionsWrap.appendChild(copyMsgBtn);

            if (index === assistantRows.length - 1) {
                const regenBtn = document.createElement('button');
                regenBtn.type = 'button';
                regenBtn.className = 'action-btn regen-btn';
                regenBtn.title = 'Regenerar resposta';
                regenBtn.setAttribute('aria-label', 'Regenerar resposta');
                regenBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                `;
                regenBtn.onclick = () => this.handleRegenerate();
                actionsWrap.appendChild(regenBtn);
            }

            row.appendChild(actionsWrap);
        });
    }

    handleDownloadProgress(e, msgId) {
        if (e.total > 0 && e.loaded === e.total) return;

        if (e.loaded === 0 && e.total === 0) return;

        let existing = document.getElementById(msgId);

        const total = e.total || 0;
        const loaded = e.loaded || 0;
        const fraction = total > 0 ? loaded / total : (loaded > 0 && loaded <= 1 ? loaded : 0);

        if (fraction > 0 && fraction < 1) {
            const pct = (fraction * 100).toFixed(0);
            const text = fraction < 0.85 ? `Baixando modelo (${pct}%)` : `Processando modelo...`;

            const html = `
                <p><b>Preparando IA:</b> ${text}</p>
                <progress value="${fraction}" max="1" style="width: 100%; border-radius: 8px; overflow: hidden;"></progress>
            `;

            if (!existing) {
                this.addMessageToDOM(`<div class="message" id="${msgId}">${html}</div>`, 'assistant');
                this.scrollToBottom();
            } else {
                existing.innerHTML = html;
            }
        } else if (fraction >= 1 && existing) {
            existing.innerHTML = '<p><b>Quase lá!</b> Carregando modelo...</p>';
        }
    }

    throttledRender(fullText, element, force) {
        if (!element) return;

        // ~16 atualizações por segundo: suficiente para parecer instantâneo e evita
        // reparsear o Markdown inteiro (e redesenhar o DOM) a cada chunk de 10ms.
        const now = performance.now();
        if (!force && now - this.lastRenderTime < 60) return;

        this.lastRenderTime = now;
        return this.renderMarkdownUpdate(fullText, element, !force);
    }

    async renderMarkdownUpdate(text, element, isStreaming = false) {
        if (!element) return;
        const renderSeq = (element._renderSeq || 0) + 1;
        element._renderSeq = renderSeq;
        this.messageRawText.set(element, text);

        let sanitized;
        if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            const unsafe = marked.parse(text);
            sanitized = DOMPurify.sanitize(unsafe, {
                ADD_TAGS: ['div', 'button', 'svg', 'g', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'text', 'style', 'defs', 'marker', 'foreignObject'],
                ADD_ATTR: ['class', 'id', 'type', 'data-data', 'width', 'height', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'marker-end', 'transform', 'style']
            });
        } else {
            sanitized = `<p>${escapeHtml(text)}</p>`;
        }

        element.innerHTML = sanitized;

        // Links abrem em outra aba para não derrubar a conversa atual.
        element.querySelectorAll('a[href]').forEach(link => {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        });

        // Durante o streaming o HTML é recriado a cada chunk: rodar KaTeX e highlight.js
        // em tudo a cada atualização trava a thread principal. O acabamento fica para o fim.
        if (!isStreaming && hasMathDelimiters(text)) {
            await this.assets.ensureKaTeX();
            if (!element.isConnected || element._renderSeq !== renderSeq) return;
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
        }

        const mermaidNodes = element.querySelectorAll('.mermaid');
        if (!isStreaming && mermaidNodes.length > 0) {
            const mermaidReady = await this.assets.ensureMermaid();
            if (!element.isConnected || element._renderSeq !== renderSeq) return;
            if (mermaidReady && window.mermaid) {
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
                                    <button type="button" class="retry-mermaid-btn" style="background: white; color: #ef4444; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">
                                        Pedir para IA Corrigir
                                    </button>
                                </div>
                                <div style="padding: 10px; background: #2a1515; color: #ffadad; font-family: monospace; font-size: 12px; white-space: pre-wrap;">${escapeHtml(errorString)}</div>
                                <pre style="margin: 0; background: #1e1e1e; padding: 10px; border-top: 1px solid #444; overflow-x: auto;">
                                    <code class="language-mermaid" style="font-family: monospace; color: #ccc;">${escapeHtml(rawCode)}</code>
                                </pre>
                            </div>
                        `;

                        const btn = div.querySelector('.retry-mermaid-btn');
                        if (btn) {
                            btn.onclick = () => this.handleFixMermaid(rawCode, errorString);
                        }
                    });
                }
            }
        } else if (isStreaming && mermaidNodes.length > 0) {
            mermaidNodes.forEach(node => {
                node.innerHTML = `<div class="mermaid-placeholder">Aguardando a IA terminar para renderizar o gráfico...</div>`;
            });
        }

        if (!isStreaming && typeof hljs !== 'undefined' && hljs?.highlightElement) {
            element.querySelectorAll('pre code:not(.language-mermaid):not(.hljs-added)').forEach(block => {
                try {
                    hljs.highlightElement(block);
                    block.classList.add('hljs-added');
                } catch (_) { }
            });
        }

        if (!element.isConnected || element._renderSeq !== renderSeq) return;

        if (this.stickToBottom) this.scrollToBottom();
        this.updateScrollButton();
        if (!this.stickToBottom) this.markNewContent();
    }

    renderMessage(role, content, animate = true) {
        let html = '';
        if (role === 'user') {
            html = `<p class="message">${escapeHtml(content)}</p>`;
        } else {
            const id = 'msg-' + Math.random().toString(36).substr(2, 9);
            const renderToken = this._chatRenderToken;
            html = `<div class="message" id="${id}"></div>`;
            setTimeout(async () => {
                if (renderToken !== this._chatRenderToken) return;
                const el = document.getElementById(id);
                if (!el || !el.isConnected) return;

                this.messageRawText.set(el, content);
                await this.renderMarkdownUpdate(content, el);
                if (renderToken !== this._chatRenderToken || !el.isConnected) return;
                this.addCopyButtons(el, content);
                if (this.stickToBottom) this.scrollToBottom();
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
            const icon = escapeHtml(persona?.icon || '🤖');
            const color = safeColor(persona?.color || chat?.personaColor);

            div.innerHTML = `
                <div class="avatar" style="background-color: ${color}20; color: ${color};">${icon}</div>
                ${html}
            `;
        } else {
            div.innerHTML = html;
        }

        this.els.messages.appendChild(div);
    }

    initScroll() {
        const el = this.els.messages;
        if (!el) return;

        el.addEventListener('scroll', () => {
            // Durante a animação suave o "colar no fim" não deve ser desligado
            // por posições intermediárias do scroll.
            if (this._smoothScroll) return;

            const nearBottom = this.isNearBottom();
            if (nearBottom === this.stickToBottom) return;
            this.stickToBottom = nearBottom;
            this.updateScrollButton();
        }, { passive: true });

        // Rolar com o mouse/dedo cancela a animação e devolve o controle ao usuário.
        ['wheel', 'touchstart'].forEach((type) => {
            el.addEventListener(type, () => this.cancelSmoothScroll(), { passive: true });
        });

        // `scrollend` avisa quando a animação suave termina de verdade,
        // sem depender de um timeout chutado.
        el.addEventListener('scrollend', () => this.finishSmoothScroll(), { passive: true });

        el.addEventListener('load', (event) => {
            if (event.target.tagName === 'IMG' && this.stickToBottom) this.scrollToBottom();
        }, true);

        if (this.els.scrollToBottomBtn) {
            this.els.scrollToBottomBtn.addEventListener('click', () => {
                this.stickToBottom = true;
                this.scrollToBottom(true, true);
                if (this.els.prompt) this.els.prompt.focus();
            });
        }

        window.addEventListener('resize', () => {
            if (this.stickToBottom) this.scrollToBottom();
        });

        this.updateScrollButton();
    }

    isNearBottom(threshold = 120) {
        const el = this.els.messages;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    }

    updateScrollButton() {
        const el = this.els.messages;
        const btn = this.els.scrollToBottomBtn;
        if (!el || !btn) return;

        if (this._smoothScroll) {
            btn.classList.remove('visible', 'has-new');
            return;
        }

        const canScroll = el.scrollHeight - el.clientHeight > 8;
        const show = canScroll && !this.isNearBottom();

        btn.classList.toggle('visible', show);
        if (!show) btn.classList.remove('has-new');
    }

    markNewContent() {
        const btn = this.els.scrollToBottomBtn;
        if (btn && btn.classList.contains('visible')) btn.classList.add('has-new');
    }

    cancelSmoothScroll() {
        if (!this._smoothScroll) return;
        this._smoothScroll = false;
        clearTimeout(this._smoothScrollTimer);
        this._smoothScrollTimer = null;
        this.updateScrollButton();
    }

    finishSmoothScroll() {
        if (!this._smoothScroll) return;
        this._smoothScroll = false;
        clearTimeout(this._smoothScrollTimer);
        this._smoothScrollTimer = null;
        // Se chegou conteúdo novo durante a animação, encosta no fim de verdade.
        this.scrollToBottom();
    }

    scrollToBottom(force = false, smooth = false) {
        if (!this.els.messages) return;

        if (force) {
            this.stickToBottom = true;
            this.cancelSmoothScroll();
        }

        if (!this.stickToBottom) {
            this.updateScrollButton();
            return;
        }

        const el = this.els.messages;
        const reduceMotion = window.matchMedia
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false;

        if (smooth && !reduceMotion) {
            this._smoothScroll = true;
            this.updateScrollButton();
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });

            clearTimeout(this._smoothScrollTimer);
            this._smoothScrollTimer = setTimeout(() => this.finishSmoothScroll(), 1600);
            return;
        }

        // Enquanto a animação suave está rolando, um chunk novo não pode
        // dar um salto por cima dela (o ajuste final acontece no scrollend).
        if (this._smoothScroll) {
            this.updateScrollButton();
            return;
        }

        el.scrollTop = el.scrollHeight;
        this.updateScrollButton();
    }

    scrollToBottomSoon() {
        this.scrollToBottom(true);
        requestAnimationFrame(() => this.scrollToBottom());
        [80, 240, 600].forEach((delay) => setTimeout(() => this.scrollToBottom(), delay));
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
            const codeContent = codeElement ? (codeElement.textContent ?? codeElement.innerText ?? '') : '';

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

            if ((isHtml || (this.codeState && this.codeState.html)) && codeContent.length > 20) {
                const previewBtn = document.createElement('button');
                previewBtn.type = 'button';
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
            copyBtn.type = 'button';
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

if (typeof window !== 'undefined') {
    window.__chromeAILocal = {
        AssetLoader,
        PersonaManager,
        ChatManager,
        AIService,
        UIManager,
        escapeHtml,
        safeColor,
        normalizePersona,
        normalizeChat,
        hasMathDelimiters,
        personaManager,
        chatManager,
        aiService,
        uiManager
    };
}

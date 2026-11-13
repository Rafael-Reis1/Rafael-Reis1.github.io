import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(APP_DIR, 'chromeAILocal.html');
const APP_JS_PATH = path.join(APP_DIR, 'app.js');
const SW_JS_PATH = path.join(APP_DIR, 'sw.js');

let JSDOM;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    console.log('\nℹ️  jsdom não instalado — pulando testes do NanoChat (chromeAILocal).\n');
    process.exit(0);
}

let passed = 0;
let failed = 0;

async function check(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`PASS ${name}`);
    } catch (err) {
        failed++;
        console.error(`FAIL ${name}: ${err.stack || err}`);
    }
}

function createBootedDOM(options = {}) {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const markedCode = fs.readFileSync(path.join(APP_DIR, 'lib', 'marked.min.js'), 'utf8');
    const purifyCode = fs.readFileSync(path.join(APP_DIR, 'lib', 'purify.min.js'), 'utf8');
    const hljsCode = fs.readFileSync(path.join(APP_DIR, 'lib', 'highlight.min.js'), 'utf8');
    const appCode = fs.readFileSync(APP_JS_PATH, 'utf8');

    const dom = new JSDOM(html, {
        url: 'http://localhost/chromeAILocal/chromeAILocal.html',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });

    const { window } = dom;
    const blobTracker = { created: [], revoked: [] };
    let blobSeq = 0;
    const clipboardWrites = [];
    const appendedHeadResources = [];

    // Mock localStorage customizável (inclui simulação de dados corrompidos ou QuotaExceededError)
    const storageMap = new Map(Object.entries(options.initialStorage || {}));
    const storageMock = {
        getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
        setItem: (k, v) => {
            if (options.throwOnSet && options.throwOnSet(k, v)) {
                const err = new Error('QuotaExceededError');
                err.name = 'QuotaExceededError';
                throw err;
            }
            storageMap.set(String(k), String(v));
        },
        removeItem: (k) => storageMap.delete(String(k)),
        clear: () => storageMap.clear()
    };

    Object.defineProperty(window, 'localStorage', { value: storageMock, configurable: true });
    Object.defineProperty(window, 'sessionStorage', {
        value: {
            _map: new Map(),
            getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
            setItem(k, v) { this._map.set(String(k), String(v)); },
            removeItem(k) { this._map.delete(String(k)); },
            clear() { this._map.clear(); }
        },
        configurable: true
    });

    window.URL.createObjectURL = (blob) => {
        const url = `blob:http://localhost/mock-${++blobSeq}`;
        blobTracker.created.push({ url, blob });
        return url;
    };
    window.URL.revokeObjectURL = (url) => {
        blobTracker.revoked.push(url);
    };

    window.HTMLElement.prototype.scrollTo = function () {};
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    Object.defineProperty(window.navigator, 'clipboard', {
        value: {
            writeText: async (text) => {
                clipboardWrites.push(text);
            }
        },
        configurable: true
    });

    // Rastreia scripts/estilos injetados sob demanda por AssetLoader
    const origAppendChild = window.HTMLHeadElement.prototype.appendChild;
    window.HTMLHeadElement.prototype.appendChild = function (node) {
        const res = origAppendChild.call(this, node);
        if (node && (node.tagName === 'SCRIPT' || node.tagName === 'LINK')) {
            const url = node.src || node.href || '';
            appendedHeadResources.push({ tag: node.tagName, url });
            setTimeout(() => {
                if (typeof options.onAssetLoad === 'function') {
                    options.onAssetLoad(url, window);
                }
                if (typeof node.onload === 'function') node.onload();
            }, 0);
        }
        return res;
    };

    if (options.languageModel) {
        window.LanguageModel = options.languageModel;
    }

    const vmContext = dom.getInternalVMContext();
    vm.runInContext(markedCode, vmContext);
    vm.runInContext(purifyCode, vmContext);
    vm.runInContext(hljsCode, vmContext);
    vm.runInContext(appCode, vmContext);

    // Simula window 'load' caso readyState ainda não esteja 'complete'
    window.dispatchEvent(new window.Event('load'));

    return { dom, window, blobTracker, clipboardWrites, appendedHeadResources, storageMap };
}

const flush = (ms = 25) => new Promise((r) => setTimeout(r, ms));

await check('HTML remove dependências não usadas e não bloqueia head com Mermaid/KaTeX', async () => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    assert.ok(!html.includes('axios.min.js'), 'axios não utilizado deve ter sido removido');
    assert.ok(!html.includes('all.min.css'), 'Font Awesome não utilizado deve ter sido removido');
    assert.ok(!html.includes('arrow_back_white.webp'), 'Preload de imagem não usada deve ter sido removido');
    assert.ok(!html.includes('src="lib/mermaid.min.js'), 'mermaid.min.js (3.3MB) não deve carregar de forma síncrona no head');
    assert.ok(!html.includes('src="lib/katex.min.js'), 'katex.min.js não deve carregar de forma síncrona no head');
    assert.ok(html.includes('<script defer src="lib/marked.min.js'), 'marked deve usar defer');
    assert.ok(html.includes('<script defer src="app.js'), 'app.js deve usar defer');
});

await check('Storage corrompido não derruba inicialização e normaliza chats/personas inválidos', async () => {
    const { window } = createBootedDOM({
        initialStorage: {
            personas: '{corrupt json',
            allChats: 'not-valid-json['
        }
    });
    await flush();

    const api = window.__chromeAILocal;
    assert.ok(api.personas || api.personaManager, 'app deve inicializar');
    assert.ok(api.personaManager.getAll().length >= 6, 'personas padrão restauradas');
    assert.equal(api.chatManager.getAll().length, 1, 'deve criar 1 chat inicial limpo');
    assert.ok(api.chatManager.getAll()[0].id.length > 0, 'chat inicial deve ter id não vazio');

    window.close();
});

await check('ChatManager.load sanitiza chats sem id ou com mensagens malformadas', async () => {
    const { window } = createBootedDOM({
        initialStorage: {
            allChats: JSON.stringify([
                {
                    id: '',
                    title: 'Conversa Antiga',
                    personaName: 'Padrão',
                    personaColor: 'javascript:alert(1)',
                    messages: [
                        { role: 'user', content: 'Oi' },
                        { role: 'system', content: 'ignorar' },
                        { role: 'assistant', content: 'Olá!' },
                        null
                    ]
                },
                null
            ])
        }
    });
    await flush();

    const { chatManager } = window.__chromeAILocal;
    const chats = chatManager.getAll();
    assert.equal(chats.length, 1);
    assert.ok(chats[0].id.startsWith('chat-'), 'id vazio deve ganhar fallback seguro');
    assert.equal(chats[0].personaColor, '#f2511b', 'cor inválida deve cair no fallback');
    assert.equal(chats[0].messages.length, 2, 'apenas user/assistant válidos devem permanecer');

    window.close();
});

await check('QuotaExceededError ao salvar não gera exceção não tratada e exibe alerta ao usuário', async () => {
    let failSave = false;
    const { window } = createBootedDOM({
        throwOnSet: (key) => failSave && key === 'allChats'
    });
    await flush();

    const { chatManager, uiManager } = window.__chromeAILocal;
    failSave = true;
    const ok = chatManager.addMessage(chatManager.activeChatId, 'user', 'teste') ?? true;
    assert.equal(chatManager.save(), false);
    assert.ok(uiManager.els.genericModal.classList.contains('active'), 'modal de aviso de quota deve abrir');
    assert.match(uiManager.els.genericModalMessage.textContent, /Armazenamento local cheio/i);

    window.close();
});

await check('Renderização escapa XSS em suggestion pills, erro de Mermaid e mantém sequenceDiagram intacto', async () => {
    let capturedMermaidInput = '';
    const { window, document } = (() => {
        const ctx = createBootedDOM({
            onAssetLoad: (url, win) => {
                if (url.includes('mermaid.min.js')) {
                    win.mermaid = {
                        initialize(cfg) {
                            win._mermaidConfig = cfg;
                        },
                        async run({ nodes }) {
                            capturedMermaidInput = nodes[0].textContent;
                            throw new Error('<img src=x onerror=alert(1)> falha sintaxe');
                        }
                    };
                }
            }
        });
        return { window: ctx.window, document: ctx.window.document };
    })();
    await flush();

    const { uiManager } = window.__chromeAILocal;
    uiManager.createNewChat(
        'prompt',
        'EvilPersona',
        '<img src=x onerror=alert(1)>',
        'expression(alert(2))'
    );
    await flush();

    const avatar = document.querySelector('.suggestion-avatar');
    assert.ok(avatar, 'avatar de boas-vindas deve existir');
    assert.equal(document.querySelector('.suggestion-avatar img'), null, 'ícone malicioso não deve injetar tag <img>');
    assert.ok(avatar.textContent.includes('<img src=x'), 'ícone deve ser escapado como texto');

    // Agora testa Mermaid com sequenceDiagram + payload <img onerror> no código
    const msgEl = document.createElement('div');
    msgEl.className = 'message';
    document.getElementById('messages').appendChild(msgEl);

    await uiManager.renderMarkdownUpdate(
        '```mermaid\nsequenceDiagram\nAlice->>Bob: Olá (tudo bem) <img src=x onerror=alert(9)>\n```',
        msgEl,
        false
    );

    assert.equal(window._mermaidConfig.securityLevel, 'strict', 'Mermaid deve inicializar com securityLevel strict');
    assert.ok(!capturedMermaidInput.includes('classDef default'), 'sequenceDiagram não deve receber classDef de flowchart');
    assert.ok(capturedMermaidInput.includes('Olá (tudo bem)'), 'parênteses em sequenceDiagram não devem ser reescritos');
    assert.equal(msgEl.querySelector('.mermaid-error-wrapper img'), null, 'erro de Mermaid não pode interpretar HTML não escapado');
    assert.ok(msgEl.textContent.includes('<img src=x onerror=alert(1)> falha sintaxe'));

    window.close();
});

await check('AssetLoader carrega KaTeX sob demanda apenas quando há delimitadores matemáticos', async () => {
    let mathRenderedCount = 0;
    const { window, appendedHeadResources } = createBootedDOM({
        onAssetLoad: (url, win) => {
            if (url.includes('auto-render.min.js')) {
                win.renderMathInElement = () => {
                    mathRenderedCount++;
                };
            }
        }
    });
    await flush();

    const { uiManager } = window.__chromeAILocal;
    const messages = window.document.getElementById('messages');

    const plainEl = window.document.createElement('div');
    messages.appendChild(plainEl);
    await uiManager.renderMarkdownUpdate('Texto comum sem fórmulas matemáticas.', plainEl, false);
    assert.equal(appendedHeadResources.length, 0, 'texto sem fórmula não deve carregar KaTeX ou Mermaid');

    const mathEl = window.document.createElement('div');
    messages.appendChild(mathEl);
    await uiManager.renderMarkdownUpdate('Equação famosa: $E = mc^2$', mathEl, false);
    await flush();

    assert.ok(appendedHeadResources.some(r => r.url.includes('lib/katex.min.css')), 'deve carregar CSS do KaTeX sob demanda');
    assert.ok(appendedHeadResources.some(r => r.url.includes('lib/katex.min.js')), 'deve carregar JS do KaTeX sob demanda');
    assert.equal(mathRenderedCount, 1, 'deve invocar renderMathInElement após carregar KaTeX');

    window.close();
});

await check('AIService não duplica systemPrompt no promptStreaming e protege session.destroy()', async () => {
    const promptsSent = [];
    let createOpts = null;

    const { window } = createBootedDOM({
        languageModel: {
            async availability() { return 'available'; },
            async create(opts) {
                createOpts = opts;
                return {
                    async promptStreaming(text) {
                        promptsSent.push(text);
                        return (async function* () {
                            yield 'Resposta ';
                            yield 'completa.';
                        })();
                    },
                    destroy() {
                        throw new Error('destroy fail simulado');
                    }
                };
            }
        }
    });
    await flush();

    const { aiService } = window.__chromeAILocal;
    const chunks = [];
    await aiService.generateStream(
        [{ role: 'user', content: 'Explique closures' }],
        'INSTRUCAO_SISTEMA_UNICA',
        { onChunk: (t) => chunks.push(t) },
        new AbortController().signal
    );

    assert.equal(promptsSent.length, 1);
    assert.equal(promptsSent[0], 'Explique closures', 'promptStreaming deve receber apenas a mensagem do usuário, sem duplicar systemPrompt');
    assert.ok(Array.isArray(createOpts.initialPrompts), 'API moderna deve usar initialPrompts para system prompt');
    assert.ok(
        createOpts.initialPrompts.some(p => p.role === 'system' && p.content.includes('INSTRUCAO_SISTEMA_UNICA')),
        'systemPrompt deve ir em initialPrompts com role system'
    );
    assert.equal(createOpts.systemPrompt, undefined, 'não deve enviar systemPrompt legado na raiz quando initialPrompts é aceito');
    assert.equal(chunks[chunks.length - 1], 'Resposta completa.');

    window.close();
});

await check('Fluxo completo de chat atualiza topbar, status da IA, botões de ação e suporta busca/sidebar/canvas', async () => {
    const { window, blobTracker, clipboardWrites } = createBootedDOM({
        languageModel: {
            async availability() { return 'available'; },
            async create() {
                return {
                    async promptStreaming() {
                        return (async function* () {
                            yield 'Aqui está:\n```html\n<div id="hero">Olá Mundo</div>\n```';
                        })();
                    },
                    destroy() {}
                };
            }
        }
    });
    await flush();

    const doc = window.document;
    const { uiManager } = window.__chromeAILocal;

    assert.match(doc.getElementById('aiStatusBadge').textContent, /IA Local Pronta/i);

    const prompt = doc.getElementById('promptText');
    prompt.value = 'Crie um hero simples';
    await uiManager.handleSend();
    await flush();

    assert.equal(doc.getElementById('activeChatTitle').textContent, 'Crie um hero simples');
    assert.ok(doc.querySelector('.rowAssistant .copy-msg-btn'), 'resposta do assistente deve ter botão Copiar');
    assert.ok(doc.querySelector('.rowAssistant .regen-btn'), 'última resposta deve ter botão Regenerar');
    assert.ok(doc.querySelector('.rowUser .edit-btn'), 'última pergunta deve ter botão Editar');

    // Canvas abriu automaticamente sem travar width inline em 400px e gerou Blob URL
    const wrapper = doc.getElementById('mainWrapper');
    assert.ok(wrapper.classList.contains('canvas-open'), 'Canvas deve abrir para bloco HTML');
    assert.equal(wrapper.querySelector('.container').style.width, '', 'largura do chat não deve ser travada inline em 400px');
    assert.equal(blobTracker.created.length, 1, 'Blob de preview deve ter sido criado');

    // Botão Copiar HTML no Canvas
    doc.getElementById('copyCanvas').click();
    await flush();
    assert.equal(clipboardWrites.length, 1);
    assert.ok(clipboardWrites[0].includes('Olá Mundo'));

    // Fechar Canvas revoga Blob URL e libera src do iframe
    doc.getElementById('closeCanvas').click();
    assert.ok(!wrapper.classList.contains('canvas-open'));
    assert.equal(blobTracker.revoked.length, 1, 'closeCanvas deve revogar o Blob URL criado');
    assert.equal(doc.getElementById('canvasFrame').src, 'about:blank');

    // Segundo chat e filtro na barra lateral
    uiManager.createNewChat('', 'Dev Frontend Sênior', '💻', '#3b82f6');
    const secondPrompt = doc.getElementById('promptText');
    assert.equal(secondPrompt.style.getPropertyValue('--current-chat-color'), '#3b82f6', 'prompt deve herdar a cor da persona para borda e foco');
    const cssText = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    assert.match(cssText, /\.form-control:focus-visible\s*\{[^}]*outline:\s*none/i, 'foco no textarea principal não deve desenhar outline laranja conflitante sobre a cor da persona');
    secondPrompt.value = 'Outro assunto XYZ';
    await uiManager.handleSend();
    await flush();

    const search = doc.getElementById('chatSearchInput');
    search.value = 'Crie um';
    search.dispatchEvent(new window.Event('input'));
    assert.equal(doc.querySelectorAll('#chatList .chat-item').length, 1, 'busca deve filtrar para 1 chat');

    doc.getElementById('btnClearSearch').click();
    assert.equal(doc.querySelectorAll('#chatList .chat-item').length, 2, 'limpar busca deve restaurar ambos os chats');

    // Collapse desktop sidebar
    doc.getElementById('btnToggleSidebarCollapse').click();
    assert.ok(doc.getElementById('sidebar').classList.contains('collapsed'));
    assert.ok(wrapper.classList.contains('sidebar-collapsed'));

    // Dismiss mobile notice
    doc.getElementById('btnDismissMobileNotice').click();
    assert.ok(doc.getElementById('mobile-notice').classList.contains('dismissed'));

    // Não deve duplicar patch de CSS no final do streaming (force=true)
    uiManager.codeState = {
        html: '<div id="app">Oi</div>',
        css: 'body { color: #fff; background: #111; font-size: 16px; margin: 0; padding: 0; }',
        js: null
    };
    uiManager.checkAutoUpdateCanvas('```css\n.card { color: red; }\n```', true);
    const patchCount = (uiManager.codeState.css.match(/\/\* Patch \*\//g) || []).length;
    assert.equal(patchCount, 1, 'checkAutoUpdateCanvas(force=true) não deve aplicar patch duplicado no CSS');

    // showDialog consecutivo mantendo referências corretas para Enter/OK
    let confirmed = false;
    uiManager.showDialog('Confirmar?', {
        type: 'confirm',
        onConfirm: () => { confirmed = true; }
    });
    assert.ok(uiManager.els.genericModalOkBtn?.isConnected, 'referência de genericModalOkBtn deve permanecer conectada ao DOM');
    uiManager.els.genericModalOkBtn.click();
    assert.equal(confirmed, true);

    window.close();
});

await check('switchChat no meio do streaming aborta geração anterior sem vazar conteúdo', async () => {
    let abortedSeen = false;
    const { window } = createBootedDOM({
        languageModel: {
            async availability() { return 'available'; },
            async create() {
                return {
                    async promptStreaming(_prompt, { signal }) {
                        signal.addEventListener('abort', () => { abortedSeen = true; });
                        return (async function* () {
                            yield 'Parcial ';
                            await new Promise((r) => setTimeout(r, 80));
                            yield 'não deve aparecer no chat B';
                        })();
                    },
                    destroy() {}
                };
            }
        }
    });
    await flush();

    const doc = window.document;
    const { uiManager, chatManager } = window.__chromeAILocal;
    const chatAId = chatManager.activeChatId;

    doc.getElementById('promptText').value = 'Mensagem longa no chat A';
    const sendPromise = uiManager.handleSend();
    await flush(15);

    uiManager.createNewChat('', 'Padrão', '🤖', '#f2511b');
    const chatBId = chatManager.activeChatId;
    assert.notEqual(chatAId, chatBId);

    await sendPromise;
    await flush(30);

    assert.equal(abortedSeen, true, 'trocar de chat no meio do stream deve abortar a requisição ativa');
    assert.equal(chatManager.get(chatBId).messages.length, 0, 'chat B não deve receber chunks do chat A');

    window.close();
});

await check('Service Worker usa cache versionado, ignoreSearch e lista limpa de CORE_ASSETS', async () => {
    const swCode = fs.readFileSync(SW_JS_PATH, 'utf8');
    const listeners = {};
    let matchOpts = null;

    const sandbox = {
        URL,
        Response: globalThis.Response,
        Promise,
        caches: {
            async open() { return { put: async () => {} }; },
            async keys() { return []; },
            async match(_req, opts) {
                matchOpts = opts;
                return new globalThis.Response('cached ok', { status: 200 });
            }
        },
        fetch: async () => { throw new Error('offline'); },
        self: {
            location: { origin: 'http://localhost' },
            skipWaiting: async () => {},
            clients: { claim: async () => {} },
            addEventListener(ev, fn) { listeners[ev] = fn; }
        }
    };

    vm.runInNewContext(swCode, sandbox);
    assert.ok(!swCode.includes('axios.min.js'), 'SW não deve referenciar axios.min.js removido');
    assert.ok(!swCode.includes('all.min.css'), 'SW não deve referenciar all.min.css removido');
    assert.ok(typeof listeners.fetch === 'function');

    let responded = null;
    await new Promise((resolve) => {
        listeners.fetch({
            request: { method: 'GET', mode: 'same-origin', url: 'http://localhost/chromeAILocal/app.js?v=999999' },
            respondWith(p) {
                responded = p;
                resolve();
            }
        });
    });

    const res = await responded;
    assert.equal(res.status, 200);
    assert.equal(matchOpts?.ignoreSearch, true, 'SW deve usar ignoreSearch para compatibilidade offline com ?v=...');
});

await check('AIService faz fallback legado de systemPrompt, respeita quota e cancela create() via AbortSignal', async () => {
    const createCalls = [];
    let sessionDestroyCount = 0;

    const { window } = createBootedDOM({
        languageModel: {
            async availability() { return 'downloadable'; },
            async create(opts) {
                createCalls.push(opts);
                if (opts.initialPrompts && !opts.systemPrompt) {
                    throw new Error('Legacy build requires root systemPrompt');
                }
                return {
                    inputQuota: 1000,
                    inputUsage: 900, // >= 85%: próximo turno deve recriar sessão
                    async promptStreaming() {
                        return (async function* () {
                            yield 'ok';
                        })();
                    },
                    destroy() { sessionDestroyCount++; }
                };
            }
        }
    });
    await flush();

    const { aiService } = window.__chromeAILocal;
    assert.equal(createCalls.length, 0, 'warmUp não deve disparar download nem create() quando status é downloadable');

    await aiService.generateStream(
        [{ role: 'user', content: 'Oi' }],
        'SYS_FALLBACK',
        { onChunk: () => {} },
        new AbortController().signal,
        { chatId: 'chat-a' }
    );
    assert.equal(createCalls.length, 2, 'deve tentar initialPrompts primeiro e fazer fallback para systemPrompt');
    assert.ok(createCalls[1].systemPrompt.includes('SYS_FALLBACK'));

    // Próximo envio no mesmo chat deve ir direto ao formato legado memorizado e recriar por cota >= 85%
    await aiService.generateStream(
        [
            { role: 'user', content: 'Oi' },
            { role: 'assistant', content: 'ok' },
            { role: 'user', content: 'Mais um' }
        ],
        'SYS_FALLBACK',
        { onChunk: () => {} },
        new AbortController().signal,
        { chatId: 'chat-a' }
    );
    assert.equal(createCalls.length, 3, 'deve memorizar preferência legada e recriar sessão devido ao uso >= 85%');
    assert.equal(sessionDestroyCount, 1, 'sessão antiga acima da cota deve ser destruída antes de criar nova');

    // Testa cancelamento de create() pendente via AbortSignal
    aiService.factory.create = (opts) => new Promise((resolve) => {
        if (opts.signal) {
            opts.signal.addEventListener('abort', () => {}, { once: true });
        }
        setTimeout(() => resolve({ async promptStreaming() {}, destroy() {} }), 5000);
    });
    const abortCtrl = new AbortController();
    setTimeout(() => abortCtrl.abort(), 15);
    await assert.rejects(
        () => aiService.generateStream(
            [{ role: 'user', content: 'Cancelar' }],
            'SYS',
            { onChunk: () => {} },
            abortCtrl.signal,
            { chatId: 'chat-b' }
        ),
        (err) => err && err.name === 'AbortError'
    );

    window.close();
});

await check('Pre-aquecimento (warmUp) e reúso de KV-cache evitam LanguageModel.create() repetido e exibem fase no skeleton', async () => {
    let createCount = 0;
    let destroyCount = 0;
    const promptsReceived = [];
    const seenSignals = [];

    const { window } = createBootedDOM({
        languageModel: {
            async availability() { return 'available'; },
            async create(opts) {
                createCount++;
                seenSignals.push(Boolean(opts.signal));
                return {
                    inputQuota: 4000,
                    inputUsage: 100,
                    async promptStreaming(prompt) {
                        promptsReceived.push(prompt);
                        await new Promise(r => setTimeout(r, 20));
                        return (async function* () {
                            yield `Resposta para: ${prompt}`;
                        })();
                    },
                    destroy() { destroyCount++; }
                };
            }
        }
    });
    await flush();

    const doc = window.document;
    const { uiManager } = window.__chromeAILocal;

    assert.equal(createCount, 1, 'boot com IA ready deve pré-aquecer exatamente 1 sessão');
    assert.equal(seenSignals[0], true, 'create() deve receber AbortSignal');

    // Foco repetido no textarea não deve recriar sessão já aquecida
    const promptInput = doc.getElementById('promptText');
    promptInput.dispatchEvent(new window.Event('focus'));
    await flush();
    assert.equal(createCount, 1, 'warmUp duplicado deve ser coalescido sem criar nova sessão');

    // Turno 1: envia sem triggerar novo create() e mostra skeleton com fase enquanto aguarda stream
    promptInput.value = 'Olá';
    const sendPromise1 = uiManager.handleSend();
    await flush(1);
    const phaseEl = doc.querySelector('.skeleton-phase');
    const timerEl = doc.querySelector('.skeleton-timer');
    assert.ok(phaseEl && phaseEl.textContent.trim().length > 0, 'skeleton deve exibir indicador textual de fase');
    assert.ok(timerEl, 'skeleton deve exibir contador de tempo');

    await sendPromise1;
    await flush();
    assert.equal(createCount, 1, 'turno 1 deve reutilizar sessão pré-aquecida');
    assert.match(doc.querySelector('.message-stats')?.textContent || '', /Sessão em cache/i);

    // Turno 2 no mesmo chat: reutiliza o KV-cache vivo sem destruir nem chamar create()
    promptInput.value = 'Como vai?';
    await uiManager.handleSend();
    await flush();
    assert.equal(createCount, 1, 'turno 2 no mesmo chat deve manter a mesma sessão (KV-cache)');
    assert.equal(destroyCount, 0, 'não deve destruir sessão entre turnos válidos do mesmo chat');
    assert.deepEqual(promptsReceived, ['Olá', 'Como vai?']);

    // Regenerar resposta invalida sessão antiga antes de reenviar
    uiManager.handleRegenerate();
    await flush(8);
    assert.ok(destroyCount >= 1, 'regenerar deve invalidar sessão antiga antes de gerar novamente');
    assert.ok(createCount >= 2, 'novo envio após regeneração deve criar nova sessão limpa');

    window.close();
});

console.log(`\nResumo chromeAILocal: ${passed} passou, ${failed} falhou.`);
if (failed > 0) process.exit(1);

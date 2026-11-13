(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.ApiInspectorCore = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    /* ---------------------------------------------------------------------- */
    /* JSON                                                                   */
    /* ---------------------------------------------------------------------- */

    function transformJsonValue(val, { sortKeys = false, stripNulls = false } = {}) {
        if (Array.isArray(val)) {
            return val
                .map(item => transformJsonValue(item, { sortKeys, stripNulls }))
                .filter(item => !(stripNulls && item === null));
        }
        if (val && typeof val === 'object') {
            let keys = Object.keys(val);
            if (sortKeys) {
                keys = keys.slice().sort((a, b) => a.localeCompare(b));
            }
            const out = {};
            for (const key of keys) {
                const nextVal = transformJsonValue(val[key], { sortKeys, stripNulls });
                if (stripNulls && (nextVal === null || nextVal === '')) continue;
                out[key] = nextVal;
            }
            return out;
        }
        return val;
    }

    function processJson(rawText, options = {}) {
        const text = String(rawText || '').trim();
        if (!text) {
            return { ok: true, empty: true, output: '', error: '', summary: '0 bytes' };
        }
        try {
            const parsed = JSON.parse(text);
            const transformed = transformJsonValue(parsed, options);
            const indent = options.mode === 'minify' ? 0 : (options.mode === 'pretty-4' ? 4 : 2);
            const output = indent === 0
                ? JSON.stringify(transformed)
                : JSON.stringify(transformed, null, indent);

            const bytes = typeof TextEncoder !== 'undefined'
                ? new TextEncoder().encode(output).length
                : output.length;
            let detail = `${bytes} bytes`;
            if (Array.isArray(transformed)) detail += ` · Array (${transformed.length})`;
            else if (transformed && typeof transformed === 'object') detail += ` · ${Object.keys(transformed).length} chaves`;

            return { ok: true, empty: false, output, error: '', summary: detail };
        } catch (err) {
            return { ok: false, empty: false, output: '', error: err.message || 'JSON inválido', summary: 'Erro de sintaxe' };
        }
    }

    /* ---------------------------------------------------------------------- */
    /* XML / SOAP                                                             */
    /* ---------------------------------------------------------------------- */

    function validateXmlStructure(xmlText) {
        if (typeof root.DOMParser === 'function') {
            try {
                const parser = new root.DOMParser();
                const doc = parser.parseFromString(xmlText, 'application/xml');
                const parserError = doc.querySelector('parsererror');
                if (parserError) {
                    const msg = String(parserError.textContent || 'XML inválido').split('\n')[0].trim();
                    return { valid: false, error: msg || 'XML inválido' };
                }
                return { valid: true, error: '' };
            } catch {
                // Fall back to balanced tag stack check
            }
        }

        // Fallback stack check for plain Node unit testing without DOMParser
        const stripped = xmlText
            .replace(/<\?[\s\S]*?\?>/g, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
        const tagRegex = /<\/?([A-Za-z_][\w:.-]*)(?:\s[^>]*)?(\/?)>/g;
        const stack = [];
        let match;
        let sawRoot = false;
        while ((match = tagRegex.exec(stripped)) !== null) {
            sawRoot = true;
            const full = match[0];
            const tagName = match[1];
            const selfClose = match[2] === '/';
            if (full.startsWith('</')) {
                const expected = stack.pop();
                if (expected !== tagName) {
                    return { valid: false, error: `Tag </${tagName}> inesperada (esperado </${expected || 'nenhum'}>)` };
                }
            } else if (!selfClose) {
                stack.push(tagName);
            }
        }
        if (!sawRoot) return { valid: false, error: 'Nenhuma tag XML encontrada' };
        if (stack.length > 0) return { valid: false, error: `Tag <${stack[stack.length - 1]}> não fechada` };
        return { valid: true, error: '' };
    }

    function processXml(rawText, options = {}) {
        const text = String(rawText || '').trim();
        if (!text) {
            return { ok: true, empty: true, output: '', error: '', summary: '0 bytes' };
        }

        const validation = validateXmlStructure(text);
        if (!validation.valid) {
            return { ok: false, empty: false, output: '', error: validation.error, summary: 'XML inválido' };
        }

        const tokens = [];
        const tokenRe = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]+>|[^<]+/g;
        let m;
        while ((m = tokenRe.exec(text)) !== null) {
            tokens.push(m[0]);
        }

        if (options.mode === 'minify') {
            const minified = tokens
                .map(tok => (tok.startsWith('<') ? tok.replace(/\s+/g, ' ').replace(/>\s+</g, '><') : tok.trim()))
                .filter(tok => tok !== '')
                .join('');
            return { ok: true, empty: false, output: minified, error: '', summary: `${minified.length} bytes` };
        }

        const indentUnit = options.mode === 'pretty-4' ? '    ' : '  ';
        let depth = 0;
        const lines = [];

        for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];
            if (!tok.startsWith('<')) {
                const trimmed = tok.trim();
                if (!trimmed) continue;
                lines.push(`${indentUnit.repeat(depth)}${trimmed}`);
                continue;
            }

            if (tok.startsWith('</')) {
                depth = Math.max(0, depth - 1);
                lines.push(`${indentUnit.repeat(depth)}${tok}`);
                continue;
            }

            if (tok.startsWith('<?') || tok.startsWith('<!')) {
                lines.push(`${indentUnit.repeat(depth)}${tok}`);
                continue;
            }

            const isSelfClosing = tok.endsWith('/>');
            // Collapse <tag>text</tag> cleanly on one line
            const nextTok = tokens[i + 1];
            const afterNext = tokens[i + 2];
            if (!isSelfClosing && nextTok && !nextTok.startsWith('<') && afterNext && afterNext.startsWith('</')) {
                const inner = nextTok.trim();
                lines.push(`${indentUnit.repeat(depth)}${tok}${inner}${afterNext}`);
                i += 2;
                continue;
            }

            lines.push(`${indentUnit.repeat(depth)}${tok}`);
            if (!isSelfClosing) {
                depth++;
            }
        }

        const output = lines.join('\n');
        return { ok: true, empty: false, output, error: '', summary: `${output.length} bytes · ${lines.length} linhas` };
    }

    /* ---------------------------------------------------------------------- */
    /* Base64 & URL (UTF-8 safe)                                              */
    /* ---------------------------------------------------------------------- */

    function encodeBase64Utf8(str, urlSafe = false) {
        const bytes = new TextEncoder().encode(String(str ?? ''));
        let bin = '';
        for (let i = 0; i < bytes.length; i++) {
            bin += String.fromCharCode(bytes[i]);
        }
        const b64 = typeof root.btoa === 'function'
            ? root.btoa(bin)
            : Buffer.from(bytes).toString('base64');
        if (!urlSafe) return b64;
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function decodeBase64Utf8(input) {
        let cleaned = String(input || '').trim().replace(/\s+/g, '');
        cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/');
        while (cleaned.length % 4 !== 0) cleaned += '=';

        let bytes;
        if (typeof root.atob === 'function') {
            const bin = root.atob(cleaned);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) {
                bytes[i] = bin.charCodeAt(i);
            }
        } else {
            bytes = new Uint8Array(Buffer.from(cleaned, 'base64'));
        }
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }

    function transformEncoding(rawText, op) {
        const text = String(rawText ?? '');
        if (!text) return { ok: true, output: '', error: '' };
        try {
            if (op === 'b64-encode') return { ok: true, output: encodeBase64Utf8(text, false), error: '' };
            if (op === 'b64url-encode') return { ok: true, output: encodeBase64Utf8(text, true), error: '' };
            if (op === 'b64-decode') return { ok: true, output: decodeBase64Utf8(text), error: '' };
            if (op === 'url-encode') return { ok: true, output: encodeURIComponent(text), error: '' };
            if (op === 'url-decode') return { ok: true, output: decodeURIComponent(text), error: '' };
            return { ok: false, output: '', error: 'Operação desconhecida' };
        } catch (err) {
            return { ok: false, output: '', error: err.message || 'Entrada inválida para conversão' };
        }
    }

    /* ---------------------------------------------------------------------- */
    /* JWT Decoder                                                            */
    /* ---------------------------------------------------------------------- */

    function formatRelativeDuration(diffMs) {
        const abs = Math.abs(diffMs);
        const mins = Math.floor(abs / 60000);
        if (mins < 60) return `${mins} min`;
        const hours = Math.floor(mins / 60);
        if (hours < 48) return `${hours}h ${mins % 60}m`;
        const days = Math.floor(hours / 24);
        return `${days}d`;
    }

    function decodeJwt(rawToken, nowMs = Date.now()) {
        const cleaned = String(rawToken || '').trim().replace(/^Bearer\s+/i, '');
        if (!cleaned) {
            return { ok: true, empty: true, header: {}, payload: {}, claims: [] };
        }
        const parts = cleaned.split('.');
        if (parts.length !== 3 || !parts[0] || !parts[1]) {
            return { ok: false, empty: false, error: 'JWT deve conter 3 segmentos separados por ponto (header.payload.signature).' };
        }

        try {
            const header = JSON.parse(decodeBase64Utf8(parts[0]));
            const payload = JSON.parse(decodeBase64Utf8(parts[1]));
            const claims = [];

            if (header.alg) {
                claims.push({ label: 'Algoritmo', value: String(header.alg), cls: 'accent' });
            }

            if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
                const expMs = payload.exp * 1000;
                const diff = expMs - nowMs;
                const formatted = new Date(expMs).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                if (diff > 0) {
                    claims.push({ label: `Válido até ${formatted}`, value: `(em ${formatRelativeDuration(diff)})`, cls: 'success' });
                } else {
                    claims.push({ label: `Expirado em ${formatted}`, value: `(há ${formatRelativeDuration(diff)})`, cls: 'danger' });
                }
            } else {
                claims.push({ label: 'Expiração', value: 'Sem exp definida', cls: '' });
            }

            if (typeof payload.iat === 'number' && Number.isFinite(payload.iat)) {
                claims.push({
                    label: 'Emitido em',
                    value: new Date(payload.iat * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                    cls: ''
                });
            }

            if (payload.sub) {
                claims.push({ label: 'sub', value: String(payload.sub), cls: '' });
            }

            return { ok: true, empty: false, header, payload, claims };
        } catch (err) {
            return { ok: false, empty: false, error: `Falha ao decodificar JWT: ${err.message}` };
        }
    }

    /* ---------------------------------------------------------------------- */
    /* DOM Wiring                                                             */
    /* ---------------------------------------------------------------------- */

    function initDom() {
        if (typeof document === 'undefined') return;
        const Tools = root.MiniTools;
        if (!Tools) return;

        Tools.bindHomeButton('#btnVoltar');

        const tabBtns = Array.from(document.querySelectorAll('.tab-btn[data-tab]'));
        const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));

        function activateTab(tabId) {
            tabBtns.forEach(btn => {
                const active = btn.dataset.tab === tabId;
                btn.classList.toggle('is-active', active);
                btn.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            tabPanels.forEach(panel => {
                const targetId = panel.getAttribute('aria-labelledby');
                const btn = tabBtns.find(b => b.id === targetId);
                const active = Boolean(btn && btn.dataset.tab === tabId);
                panel.hidden = !active;
                panel.classList.toggle('is-active', active);
            });
        }

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => activateTab(btn.dataset.tab));
        });

        // 1. JSON wiring
        const jsonIn = document.getElementById('jsonInput');
        const jsonOut = document.getElementById('jsonOutput');
        const jsonStatus = document.getElementById('jsonStatus');
        const jsonMetrics = document.getElementById('jsonMetrics');
        const jsonMode = document.getElementById('jsonMode');
        const jsonSort = document.getElementById('jsonSortKeys');
        const jsonStrip = document.getElementById('jsonStripNulls');

        function setPill(el, text, cls = '') {
            if (!el) return;
            el.className = `stat-pill ${cls}`.trim();
            el.textContent = text;
            el.title = text;
        }

        function updateJson() {
            const res = processJson(jsonIn?.value || '', {
                mode: jsonMode?.value || 'pretty-2',
                sortKeys: Boolean(jsonSort && jsonSort.checked),
                stripNulls: Boolean(jsonStrip && jsonStrip.checked)
            });
            if (jsonOut) jsonOut.value = res.output;
            if (res.empty) {
                setPill(jsonStatus, 'Aguardando JSON');
                setPill(jsonMetrics, '0 bytes');
            } else if (res.ok) {
                setPill(jsonStatus, 'JSON válido', 'success');
                setPill(jsonMetrics, res.summary);
            } else {
                setPill(jsonStatus, `Erro: ${res.error}`, 'danger');
                setPill(jsonMetrics, 'Inválido');
            }
        }

        jsonIn?.addEventListener('input', updateJson);
        jsonMode?.addEventListener('change', updateJson);
        jsonSort?.addEventListener('change', updateJson);
        jsonStrip?.addEventListener('change', updateJson);

        document.getElementById('jsonSampleBtn')?.addEventListener('click', () => {
            if (!jsonIn) return;
            jsonIn.value = '{"sistema":"Portal Univale","versao":2,"ambiente":"homolog","modulos":["fluig","rh","ponto"],"observacao":null,"ativo":true}';
            updateJson();
        });
        document.getElementById('jsonClearBtn')?.addEventListener('click', () => {
            if (jsonIn) jsonIn.value = '';
            updateJson();
        });
        document.getElementById('jsonCopyBtn')?.addEventListener('click', async () => {
            if (!jsonOut?.value) return Tools.showToast('Nenhum JSON válido para copiar.', 'error');
            const ok = await Tools.copyText(jsonOut.value);
            if (ok) Tools.flashButtonText(document.getElementById('jsonCopyBtn'), 'Copiado!');
        });
        document.getElementById('jsonDownloadBtn')?.addEventListener('click', () => {
            if (!jsonOut?.value) return Tools.showToast('Nenhum JSON válido para baixar.', 'error');
            downloadText(jsonOut.value, 'payload.json', 'application/json;charset=utf-8');
        });

        // 2. XML wiring
        const xmlIn = document.getElementById('xmlInput');
        const xmlOut = document.getElementById('xmlOutput');
        const xmlStatus = document.getElementById('xmlStatus');
        const xmlMetrics = document.getElementById('xmlMetrics');
        const xmlMode = document.getElementById('xmlMode');

        function updateXml() {
            const res = processXml(xmlIn?.value || '', { mode: xmlMode?.value || 'pretty-2' });
            if (xmlOut) xmlOut.value = res.output;
            if (res.empty) {
                setPill(xmlStatus, 'Aguardando XML');
                setPill(xmlMetrics, '0 bytes');
            } else if (res.ok) {
                setPill(xmlStatus, 'XML válido', 'success');
                setPill(xmlMetrics, res.summary);
            } else {
                setPill(xmlStatus, `Erro: ${res.error}`, 'danger');
                setPill(xmlMetrics, 'Inválido');
            }
        }

        xmlIn?.addEventListener('input', updateXml);
        xmlMode?.addEventListener('change', updateXml);
        document.getElementById('xmlSampleBtn')?.addEventListener('click', () => {
            if (!xmlIn) return;
            xmlIn.value = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><getDataset><name>dsColaboradores</name><active>true</active></getDataset></soapenv:Body></soapenv:Envelope>';
            updateXml();
        });
        document.getElementById('xmlClearBtn')?.addEventListener('click', () => {
            if (xmlIn) xmlIn.value = '';
            updateXml();
        });
        document.getElementById('xmlCopyBtn')?.addEventListener('click', async () => {
            if (!xmlOut?.value) return Tools.showToast('Nenhum XML válido para copiar.', 'error');
            const ok = await Tools.copyText(xmlOut.value);
            if (ok) Tools.flashButtonText(document.getElementById('xmlCopyBtn'), 'Copiado!');
        });
        document.getElementById('xmlDownloadBtn')?.addEventListener('click', () => {
            if (!xmlOut?.value) return Tools.showToast('Nada para baixar ainda.', 'error');
            downloadText(xmlOut.value, 'documento.xml', 'application/xml;charset=utf-8');
        });

        // 3. JWT wiring
        const jwtIn = document.getElementById('jwtInput');
        const jwtStatus = document.getElementById('jwtStatus');
        const jwtClaimsBar = document.getElementById('jwtClaimsBar');
        const jwtHeaderOut = document.getElementById('jwtHeaderOut');
        const jwtPayloadOut = document.getElementById('jwtPayloadOut');

        function updateJwt() {
            const res = decodeJwt(jwtIn?.value || '');
            if (jwtClaimsBar) jwtClaimsBar.replaceChildren();
            if (res.empty) {
                setPill(jwtStatus, 'Decodificação 100% local');
                if (jwtHeaderOut) jwtHeaderOut.textContent = '{}';
                if (jwtPayloadOut) jwtPayloadOut.textContent = '{}';
                return;
            }
            if (!res.ok) {
                setPill(jwtStatus, res.error, 'danger');
                if (jwtHeaderOut) jwtHeaderOut.textContent = '{}';
                if (jwtPayloadOut) jwtPayloadOut.textContent = '{}';
                return;
            }
            setPill(jwtStatus, 'JWT decodificado', 'success');
            if (jwtHeaderOut) jwtHeaderOut.textContent = JSON.stringify(res.header, null, 2);
            if (jwtPayloadOut) jwtPayloadOut.textContent = JSON.stringify(res.payload, null, 2);
            if (jwtClaimsBar) {
                res.claims.forEach(c => {
                    const span = document.createElement('span');
                    span.className = `stat-pill ${c.cls}`.trim();
                    const strong = document.createElement('strong');
                    strong.textContent = c.value;
                    span.append(`${c.label}: `, strong);
                    jwtClaimsBar.appendChild(span);
                });
            }
        }

        jwtIn?.addEventListener('input', updateJwt);
        document.getElementById('jwtSampleBtn')?.addEventListener('click', () => {
            if (!jwtIn) return;
            const header = encodeBase64Utf8(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), true);
            const exp = Math.floor(Date.now() / 1000) + 3600;
            const iat = Math.floor(Date.now() / 1000) - 120;
            const payload = encodeBase64Utf8(JSON.stringify({ sub: 'mat.20481', nome: 'Rafael Reis', perfil: 'TI_DEV', iat, exp }), true);
            jwtIn.value = `${header}.${payload}.assinatura-exemplo-local`;
            updateJwt();
        });
        document.getElementById('jwtClearBtn')?.addEventListener('click', () => {
            if (jwtIn) jwtIn.value = '';
            updateJwt();
        });
        document.getElementById('jwtCopyHeaderBtn')?.addEventListener('click', async () => {
            if (await Tools.copyText(jwtHeaderOut?.textContent || '{}')) {
                Tools.showToast('Header copiado!', 'success', 1400);
            }
        });
        document.getElementById('jwtCopyPayloadBtn')?.addEventListener('click', async () => {
            if (await Tools.copyText(jwtPayloadOut?.textContent || '{}')) {
                Tools.showToast('Payload copiado!', 'success', 1400);
            }
        });

        // 4. Base64 & URL wiring
        const encodeIn = document.getElementById('encodeInput');
        const encodeOut = document.getElementById('encodeOutput');
        const encodeOp = document.getElementById('encodeOperation');
        const encodeStatus = document.getElementById('encodeStatus');
        const encodeLen = document.getElementById('encodeLen');

        function updateEncode() {
            const res = transformEncoding(encodeIn?.value || '', encodeOp?.value || 'b64-encode');
            if (encodeOut) encodeOut.value = res.output;
            if (encodeLen) {
                encodeLen.textContent = `${res.output.length} ${res.output.length === 1 ? 'caractere' : 'caracteres'}`;
            }
            if (!res.ok) {
                setPill(encodeStatus, `Erro: ${res.error}`, 'danger');
            } else {
                setPill(encodeStatus, 'UTF-8 pronto', res.output ? 'success' : '');
            }
        }

        encodeIn?.addEventListener('input', updateEncode);
        encodeOp?.addEventListener('change', updateEncode);
        document.getElementById('encodeSwapBtn')?.addEventListener('click', () => {
            if (!encodeIn || !encodeOut || !encodeOut.value) return;
            encodeIn.value = encodeOut.value;
            updateEncode();
        });
        document.getElementById('encodeCopyBtn')?.addEventListener('click', async () => {
            if (!encodeOut?.value) return Tools.showToast('Nada para copiar.', 'error');
            const ok = await Tools.copyText(encodeOut.value);
            if (ok) Tools.flashButtonText(document.getElementById('encodeCopyBtn'), 'Copiado!');
        });
        document.getElementById('encodeClearBtn')?.addEventListener('click', () => {
            if (encodeIn) encodeIn.value = '';
            updateEncode();
        });

        function downloadText(content, filename, mime) {
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => {
                try { URL.revokeObjectURL(url); } catch (_) {}
            }, 5000);
            Tools.showToast(`Arquivo ${filename} baixado!`, 'success', 1700);
        }

        root.__apiInspectorApp = {
            activateTab,
            processJson,
            processXml,
            decodeJwt,
            transformEncoding
        };
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initDom);
        } else {
            initDom();
        }
    }

    return {
        transformJsonValue,
        processJson,
        validateXmlStructure,
        processXml,
        encodeBase64Utf8,
        decodeBase64Utf8,
        transformEncoding,
        decodeJwt
    };
});

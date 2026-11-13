(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.LgpdKitCore = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    /* ---------------------------------------------------------------------- */
    /* CPF & CNPJ Validation and Generation                                   */
    /* ---------------------------------------------------------------------- */

    function digitsOnly(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function isValidCPF(input) {
        const digits = digitsOnly(input);
        if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

        let sum1 = 0;
        for (let i = 0; i < 9; i++) {
            sum1 += Number(digits[i]) * (10 - i);
        }
        const rem1 = (sum1 * 10) % 11;
        const d1 = rem1 === 10 ? 0 : rem1;
        if (d1 !== Number(digits[9])) return false;

        let sum2 = 0;
        for (let i = 0; i < 10; i++) {
            sum2 += Number(digits[i]) * (11 - i);
        }
        const rem2 = (sum2 * 10) % 11;
        const d2 = rem2 === 10 ? 0 : rem2;
        return d2 === Number(digits[10]);
    }

    function isValidCNPJ(input) {
        const digits = digitsOnly(input);
        if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

        const calcDigit = (base, weights) => {
            let sum = 0;
            for (let i = 0; i < weights.length; i++) {
                sum += Number(base[i]) * weights[i];
            }
            const rem = sum % 11;
            return rem < 2 ? 0 : 11 - rem;
        };

        const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const d1 = calcDigit(digits, w1);
        if (d1 !== Number(digits[12])) return false;
        const d2 = calcDigit(digits, w2);
        return d2 === Number(digits[13]);
    }

    function randomDigits(count) {
        const arr = new Uint8Array(count);
        if (typeof root.crypto !== 'undefined' && typeof root.crypto.getRandomValues === 'function') {
            root.crypto.getRandomValues(arr);
        } else {
            for (let i = 0; i < count; i++) {
                arr[i] = Math.floor(Math.random() * 256);
            }
        }
        return Array.from(arr, n => n % 10);
    }

    function formatCPF(digits) {
        return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    }

    function formatCNPJ(digits) {
        return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }

    function generateCPF(masked = true) {
        let base;
        do {
            base = randomDigits(9);
        } while (base.every(d => d === base[0]));

        let sum1 = 0;
        for (let i = 0; i < 9; i++) sum1 += base[i] * (10 - i);
        const rem1 = (sum1 * 10) % 11;
        const d1 = rem1 === 10 ? 0 : rem1;

        const withD1 = [...base, d1];
        let sum2 = 0;
        for (let i = 0; i < 10; i++) sum2 += withD1[i] * (11 - i);
        const rem2 = (sum2 * 10) % 11;
        const d2 = rem2 === 10 ? 0 : rem2;

        const raw = [...withD1, d2].join('');
        return masked ? formatCPF(raw) : raw;
    }

    function generateCNPJ(masked = true) {
        let head;
        do {
            head = randomDigits(8);
        } while (head.every(d => d === head[0]));
        const base = [...head, 0, 0, 0, 1];

        const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

        const s1 = base.reduce((acc, v, i) => acc + v * w1[i], 0);
        const d1 = s1 % 11 < 2 ? 0 : 11 - (s1 % 11);

        const withD1 = [...base, d1];
        const s2 = withD1.reduce((acc, v, i) => acc + v * w2[i], 0);
        const d2 = s2 % 11 < 2 ? 0 : 11 - (s2 % 11);

        const raw = [...withD1, d2].join('');
        return masked ? formatCNPJ(raw) : raw;
    }

    function validateDocumentList(rawText) {
        const lines = String(rawText || '')
            .split(/[\r\n,;]+/)
            .map(s => s.trim())
            .filter(Boolean);

        return lines.map(raw => {
            const digits = digitsOnly(raw);
            if (digits.length === 11) {
                const valid = isValidCPF(digits);
                return { raw, kind: 'CPF', valid, message: valid ? 'CPF válido' : 'CPF inválido' };
            }
            if (digits.length === 14) {
                const valid = isValidCNPJ(digits);
                return { raw, kind: 'CNPJ', valid, message: valid ? 'CNPJ válido' : 'CNPJ inválido' };
            }
            return { raw, kind: '?', valid: false, message: `${digits.length} dígitos (esperado 11 ou 14)` };
        });
    }

    /* ---------------------------------------------------------------------- */
    /* LGPD Text Masking                                                      */
    /* ---------------------------------------------------------------------- */

    /**
     * Masks sensitive personal and credential fields in freeform text/logs/JSON.
     * @param {string} rawText
     * @param {{style?: 'partial'|'token', cpf?: boolean, cnpj?: boolean, email?: boolean, phone?: boolean, secrets?: boolean, ip?: boolean}} [options]
     */
    function maskSensitiveText(rawText, options = {}) {
        const {
            style = 'partial',
            cpf = true,
            cnpj = true,
            email = true,
            phone = true,
            secrets = true,
            ip = false
        } = options;

        let text = String(rawText || '');
        const counts = { cpf: 0, cnpj: 0, email: 0, phone: 0, secrets: 0, ip: 0 };
        if (!text) return { output: '', counts, total: 0 };

        if (secrets) {
            text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, () => {
                counts.secrets++;
                return 'Bearer [TOKEN_OCULTO]';
            });
            text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, () => {
                counts.secrets++;
                return '[JWT_OCULTO]';
            });
            text = text.replace(/("(?:senha|password|pass|token|apiKey|api_key|secret|access_token)"\s*:\s*)"([^"\r\n]+)"/gi, (_, prefix) => {
                counts.secrets++;
                return `${prefix}"[OCULTO]"`;
            });
            text = text.replace(/(\b(?:senha|password|secret|api_key|token)\s*=\s*)([^\s&;,\r\n]+)/gi, (_, prefix) => {
                counts.secrets++;
                return `${prefix}[OCULTO]`;
            });
        }

        if (cnpj) {
            text = text.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, (m) => {
                counts.cnpj++;
                return style === 'token' ? '[CNPJ]' : `**.${m.slice(3, 6)}.***/****-${m.slice(-2)}`;
            });
            text = text.replace(/\b\d{14}\b/g, (m) => {
                if (!isValidCNPJ(m)) return m;
                counts.cnpj++;
                return style === 'token' ? '[CNPJ]' : `**${m.slice(2, 5)}*******${m.slice(-2)}`;
            });
        }

        if (cpf) {
            text = text.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, (m) => {
                counts.cpf++;
                return style === 'token' ? '[CPF]' : `***.${m.slice(4, 7)}.***-**`;
            });
            text = text.replace(/\b\d{11}\b/g, (m, offset, full) => {
                const before = full.slice(Math.max(0, offset - 20), offset).toLowerCase();
                if (!isValidCPF(m) && !/\bcpf\b/.test(before)) return m;
                counts.cpf++;
                return style === 'token' ? '[CPF]' : `***${m.slice(3, 6)}*****`;
            });
        }

        if (email) {
            text = text.replace(/\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, (_, user, domain) => {
                counts.email++;
                if (style === 'token') return '[EMAIL]';
                const head = user.length <= 2 ? user[0] : user.slice(0, 2);
                return `${head}***@${domain}`;
            });
        }

        if (phone) {
            text = text.replace(/(?:\+?55\s*)?(?:\(\s*\d{2}\s*\)\s*|\b\d{2}[\s-])9?\d{4}[-.\s]\d{4}\b/g, (m) => {
                counts.phone++;
                if (style === 'token') return '[TELEFONE]';
                const digits = digitsOnly(m);
                const last4 = digits.slice(-4);
                return `(XX) ****-${last4}`;
            });
        }

        if (ip) {
            text = text.replace(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, (m) => {
                counts.ip++;
                if (style === 'token') return '[IP]';
                const parts = m.split('.');
                return `${parts[0]}.${parts[1]}.***.***`;
            });
        }

        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        return { output: text, counts, total };
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

        tabBtns.forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));

        // --- LGPD Masker DOM ---
        const maskIn = document.getElementById('maskInput');
        const maskOut = document.getElementById('maskOutput');
        const maskStyleEl = document.getElementById('maskStyle');
        const maskSummaryEl = document.getElementById('maskSummaryBadge');
        const maskBreakdownEl = document.getElementById('maskBreakdown');

        const maskChecks = {
            cpf: document.getElementById('maskCpf'),
            cnpj: document.getElementById('maskCnpj'),
            email: document.getElementById('maskEmail'),
            phone: document.getElementById('maskPhone'),
            secrets: document.getElementById('maskSecrets'),
            ip: document.getElementById('maskIp')
        };

        function runMasking() {
            const res = maskSensitiveText(maskIn?.value || '', {
                style: maskStyleEl?.value === 'token' ? 'token' : 'partial',
                cpf: !maskChecks.cpf || maskChecks.cpf.checked,
                cnpj: !maskChecks.cnpj || maskChecks.cnpj.checked,
                email: !maskChecks.email || maskChecks.email.checked,
                phone: !maskChecks.phone || maskChecks.phone.checked,
                secrets: !maskChecks.secrets || maskChecks.secrets.checked,
                ip: Boolean(maskChecks.ip && maskChecks.ip.checked)
            });

            if (maskOut) maskOut.value = res.output;
            if (maskSummaryEl) {
                maskSummaryEl.className = `stat-pill ${res.total > 0 ? 'success' : ''}`.trim();
                maskSummaryEl.textContent = res.total === 1 ? '1 dado ocultado' : `${res.total} dados ocultados`;
            }

            if (maskBreakdownEl) {
                maskBreakdownEl.replaceChildren();
                const labels = [
                    ['CPF', res.counts.cpf],
                    ['CNPJ', res.counts.cnpj],
                    ['E-mail', res.counts.email],
                    ['Telefone', res.counts.phone],
                    ['Tokens/Senhas', res.counts.secrets],
                    ['IPv4', res.counts.ip]
                ];
                labels.forEach(([name, count]) => {
                    if (!count) return;
                    const pill = document.createElement('span');
                    pill.className = 'stat-pill accent';
                    const strong = document.createElement('strong');
                    strong.textContent = String(count);
                    pill.append(`${name}: `, strong);
                    maskBreakdownEl.appendChild(pill);
                });
            }
        }

        maskIn?.addEventListener('input', runMasking);
        maskStyleEl?.addEventListener('change', runMasking);
        Object.values(maskChecks).forEach(el => el?.addEventListener('change', runMasking));

        document.getElementById('maskSampleBtn')?.addEventListener('click', () => {
            if (!maskIn) return;
            const sampleCnpj = generateCNPJ(true);
            const sampleCpf = generateCPF(true);
            maskIn.value = [
                `Chamado #4821 — Colaborador Rafael Reis (${sampleCpf})`,
                `E-mail: rafael.reis@univale.br | Tel: (33) 99123-4567`,
                `Empresa: ${sampleCnpj}`,
                `Authorization: Bearer tok_super_secreto_123456`,
                `{"usuario":"rreis","senha":"MinhaSenhaForte!"}`
            ].join('\n');
            runMasking();
        });

        document.getElementById('maskCopyBtn')?.addEventListener('click', async () => {
            if (!maskOut?.value) return Tools.showToast('Nenhum texto para copiar.', 'error');
            const ok = await Tools.copyText(maskOut.value);
            if (ok) Tools.flashButtonText(document.getElementById('maskCopyBtn'), 'Copiado!');
        });

        document.getElementById('maskClearBtn')?.addEventListener('click', () => {
            if (maskIn) maskIn.value = '';
            runMasking();
        });

        // --- CPF / CNPJ Generator & Validator DOM ---
        const genTypeEl = document.getElementById('genType');
        const genQtyEl = document.getElementById('genQty');
        const genFormatEl = document.getElementById('genFormat');
        const genMaskedEl = document.getElementById('genMasked');
        const genOutEl = document.getElementById('genOutput');
        const genBadgeEl = document.getElementById('genCountBadge');

        function runGeneration() {
            const type = genTypeEl?.value === 'cnpj' ? 'cnpj' : 'cpf';
            const rawQty = parseInt(genQtyEl?.value || '5', 10);
            const qty = Number.isFinite(rawQty) ? Math.min(50, Math.max(1, rawQty)) : 5;
            if (genQtyEl && String(qty) !== genQtyEl.value) genQtyEl.value = String(qty);
            const masked = !genMaskedEl || genMaskedEl.checked;
            const formatMode = genFormatEl?.value === 'sql' ? 'sql' : 'lines';

            const items = Array.from({ length: qty }, () =>
                type === 'cnpj' ? generateCNPJ(masked) : generateCPF(masked)
            );
            const text = formatMode === 'sql'
                ? items.map(v => `'${v}'`).join(', ')
                : items.join('\n');

            if (genOutEl) genOutEl.value = text;
            if (genBadgeEl) {
                genBadgeEl.textContent = qty === 1 ? '1 gerado' : `${qty} gerados`;
            }
        }

        genTypeEl?.addEventListener('change', runGeneration);
        genQtyEl?.addEventListener('change', runGeneration);
        genFormatEl?.addEventListener('change', runGeneration);
        genMaskedEl?.addEventListener('change', runGeneration);
        document.getElementById('genBtn')?.addEventListener('click', runGeneration);
        document.getElementById('genCopyBtn')?.addEventListener('click', async () => {
            if (!genOutEl?.value) return;
            const ok = await Tools.copyText(genOutEl.value);
            if (ok) Tools.flashButtonText(document.getElementById('genCopyBtn'), 'Copiado!');
        });

        const valInEl = document.getElementById('valInput');
        const valListEl = document.getElementById('valResultsList');
        const valStatsEl = document.getElementById('valStats');

        function runValidation() {
            if (!valListEl) return;
            const results = validateDocumentList(valInEl?.value || '');
            valListEl.replaceChildren();

            if (results.length === 0) {
                const li = document.createElement('li');
                li.className = 'val-empty';
                li.textContent = 'Digite ou cole CPFs/CNPJs acima para validar.';
                valListEl.appendChild(li);
                if (valStatsEl) valStatsEl.textContent = '0 analisados';
                return;
            }

            let validCount = 0;
            results.forEach(item => {
                if (item.valid) validCount++;
                const li = document.createElement('li');
                li.className = 'val-item';

                const code = document.createElement('span');
                code.textContent = item.raw;

                const badge = document.createElement('span');
                badge.className = `val-status ${item.valid ? 'is-valid' : 'is-invalid'}`;
                badge.textContent = item.message;

                li.append(code, badge);
                valListEl.appendChild(li);
            });

            if (valStatsEl) {
                valStatsEl.textContent = `${validCount}/${results.length} válidos`;
            }
        }

        valInEl?.addEventListener('input', runValidation);

        runMasking();
        runGeneration();
        runValidation();

        root.__lgpdKitApp = {
            activateTab,
            generateCPF,
            generateCNPJ,
            isValidCPF,
            isValidCNPJ,
            validateDocumentList,
            maskSensitiveText
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
        digitsOnly,
        isValidCPF,
        isValidCNPJ,
        generateCPF,
        generateCNPJ,
        validateDocumentList,
        maskSensitiveText
    };
});

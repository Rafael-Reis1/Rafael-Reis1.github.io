(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.SumCore = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    /**
     * Parses a numeric string token cleanly handling Brazilian and US number formats.
     * Returns null when the token is not a valid finite number.
     * @param {string} rawToken
     * @param {'auto'|'br'|'us'} [localeMode='auto']
     * @returns {{value: number, decimals: number}|null}
     */
    function parseSmartNumber(rawToken, localeMode = 'auto') {
        if (typeof rawToken !== 'string') return null;
        let cleaned = rawToken.trim();
        if (!cleaned) return null;

        let negative = false;
        if (cleaned.startsWith('-')) {
            negative = true;
            cleaned = cleaned.slice(1).trim();
        }
        cleaned = cleaned.replace(/^R\$\s*|^\$\s*/i, '').replace(/\s+/g, '');
        cleaned = cleaned.replace(/[.,]+$/, '');
        if (!cleaned || !/^\d/.test(cleaned)) return null;

        const hasDot = cleaned.includes('.');
        const hasComma = cleaned.includes(',');
        let normalized = cleaned;

        if (hasDot && hasComma) {
            const lastDot = cleaned.lastIndexOf('.');
            const lastComma = cleaned.lastIndexOf(',');
            if (lastComma > lastDot) {
                normalized = cleaned.replace(/\./g, '').replace(',', '.');
            } else {
                normalized = cleaned.replace(/,/g, '');
            }
        } else if (hasComma) {
            const commas = (cleaned.match(/,/g) || []).length;
            if (commas > 1) {
                normalized = cleaned.replace(/,/g, '');
            } else if (localeMode === 'us' && /^\d{1,3},\d{3}$/.test(cleaned)) {
                normalized = cleaned.replace(/,/g, '');
            } else {
                normalized = cleaned.replace(',', '.');
            }
        } else if (hasDot) {
            const dots = (cleaned.match(/\./g) || []).length;
            if (dots > 1) {
                normalized = cleaned.replace(/\./g, '');
            } else if (localeMode !== 'us' && /^\d{1,3}\.\d{3}$/.test(cleaned)) {
                normalized = cleaned.replace(/\./g, '');
            }
        }

        if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
        const parsed = Number(normalized);
        if (!Number.isFinite(parsed)) return null;

        const value = negative && parsed !== 0 ? -parsed : parsed;
        const fracPart = normalized.split('.')[1] || '';
        return {
            value,
            decimals: Math.min(6, fracPart.length)
        };
    }

    /**
     * Extracts numeric values from freeform text and computes exact sum & summary metrics.
     * Avoids IEEE-754 drift via integer scaling when safely representable.
     * @param {string} rawText
     * @param {{ignoreDuplicates?: boolean, localeMode?: 'auto'|'br'|'us'}} [options]
     */
    function analyzeValues(rawText, options = {}) {
        const { ignoreDuplicates = false, localeMode = 'auto' } = options;
        const text = String(rawText || '');
        const tokenRegex = /-?\s*(?:R\$\s*|\$\s*)?\d[\d.,]*/gi;
        const rawTokens = text.match(tokenRegex) || [];

        const parsedEntries = [];
        for (const token of rawTokens) {
            const parsed = parseSmartNumber(token, localeMode);
            if (parsed !== null) {
                parsedEntries.push(parsed);
            }
        }

        let selected = parsedEntries;
        if (ignoreDuplicates) {
            const seen = new Set();
            selected = [];
            for (const entry of parsedEntries) {
                if (!seen.has(entry.value)) {
                    seen.add(entry.value);
                    selected.push(entry);
                }
            }
        }

        if (selected.length === 0) {
            return {
                values: [],
                rawCount: parsedEntries.length,
                count: 0,
                sum: 0,
                avg: 0,
                min: 0,
                max: 0,
                decimalText: '0.00',
                brlText: 'R$ 0,00'
            };
        }

        const maxDecimals = Math.max(2, ...selected.map(e => e.decimals));
        const factor = Math.pow(10, Math.min(6, maxDecimals));

        let scaledSum = 0;
        let useFloatFallback = false;
        for (const entry of selected) {
            const scaled = Math.round(entry.value * factor);
            if (!Number.isSafeInteger(scaledSum + scaled)) {
                useFloatFallback = true;
                break;
            }
            scaledSum += scaled;
        }

        let sum = useFloatFallback
            ? selected.reduce((acc, e) => acc + e.value, 0)
            : scaledSum / factor;

        if (Object.is(sum, -0) || Math.abs(sum) < 1e-9) {
            sum = 0;
        }

        const values = selected.map(e => e.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = sum / values.length;

        return {
            values,
            rawCount: parsedEntries.length,
            count: values.length,
            sum,
            avg,
            min,
            max,
            decimalText: sum.toFixed(2),
            brlText: formatCurrencyBRL(sum)
        };
    }

    /**
     * Formats a number cleanly in Brazilian Real style without locale inconsistencies across runtimes.
     * @param {number} num
     * @returns {string}
     */
    function formatCurrencyBRL(num) {
        const clean = Math.abs(num) < 1e-9 ? 0 : num;
        const sign = clean < 0 ? '-' : '';
        const absFixed = Math.abs(clean).toFixed(2);
        const [intPart, decPart] = absFixed.split('.');
        const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return `${sign}R$ ${grouped},${decPart}`;
    }

    function initDom() {
        if (typeof document === 'undefined') return;
        const Tools = root.MiniTools;
        if (!Tools) return;

        Tools.bindHomeButton('#btnVoltar');

        const inputEl = document.getElementById('numeros');
        const modeEl = document.getElementById('formatoNumero');
        const ignoreDupEl = document.getElementById('ignorar');
        const liveStatsEl = document.getElementById('soma-live-stats');
        const badgeCountEl = document.getElementById('soma-count-badge');
        const resultDecimalEl = document.getElementById('resultadoSoma');
        const resultBrlEl = document.getElementById('resultadoBRL');
        const extraStatsEl = document.getElementById('soma-extra-stats');

        const btnSum = document.getElementById('realizarSoma');
        const btnClear = document.getElementById('limpar');
        const btnCopyDec = document.getElementById('copiarBtn');
        const btnCopyBrl = document.getElementById('copiarBrlBtn');

        const popup = Tools.createPopupController(document.getElementById('somaPopup'), {
            backdropEl: document.getElementById('listaBackgroud'),
            closeButtons: [document.getElementById('fechar')]
        });

        let lastAnalysis = analyzeValues('');

        function getOptions() {
            const rawMode = modeEl ? modeEl.value : 'auto';
            return {
                ignoreDuplicates: Boolean(ignoreDupEl && ignoreDupEl.checked),
                localeMode: rawMode === 'br' || rawMode === 'us' ? rawMode : 'auto'
            };
        }

        function computeAndUpdateLive() {
            lastAnalysis = analyzeValues(inputEl ? inputEl.value : '', getOptions());
            if (liveStatsEl) {
                const countLabel = lastAnalysis.count === 1 ? '1 valor detectado' : `${lastAnalysis.count} valores detectados`;
                liveStatsEl.textContent = `${countLabel} • Total: ${lastAnalysis.brlText}`;
            }
            return lastAnalysis;
        }

        function renderPopupStats(analysis) {
            if (badgeCountEl) {
                badgeCountEl.textContent = analysis.count === 1 ? '1 valor' : `${analysis.count} valores`;
            }
            if (resultDecimalEl) resultDecimalEl.textContent = analysis.decimalText;
            if (resultBrlEl) resultBrlEl.textContent = analysis.brlText;

            if (extraStatsEl) {
                extraStatsEl.replaceChildren();
                const metrics = [
                    { label: 'Média', val: formatCurrencyBRL(analysis.avg) },
                    { label: 'Menor', val: formatCurrencyBRL(analysis.min) },
                    { label: 'Maior', val: formatCurrencyBRL(analysis.max) }
                ];
                metrics.forEach(m => {
                    const pill = document.createElement('span');
                    pill.className = 'stat-pill';
                    const txt = document.createTextNode(`${m.label}: `);
                    const strong = document.createElement('strong');
                    strong.textContent = m.val;
                    pill.append(txt, strong);
                    extraStatsEl.appendChild(pill);
                });
            }
        }

        function openSumModal() {
            const analysis = computeAndUpdateLive();
            renderPopupStats(analysis);
            popup.open();
        }

        if (inputEl) inputEl.addEventListener('input', computeAndUpdateLive);
        if (modeEl) modeEl.addEventListener('change', computeAndUpdateLive);
        if (ignoreDupEl) ignoreDupEl.addEventListener('change', computeAndUpdateLive);

        Tools.bindCtrlEnter(inputEl, openSumModal);

        if (btnSum) btnSum.addEventListener('click', openSumModal);

        if (btnClear) {
            btnClear.addEventListener('click', () => {
                if (inputEl) inputEl.value = '';
                computeAndUpdateLive();
                if (inputEl) inputEl.focus();
            });
        }

        if (btnCopyDec) {
            btnCopyDec.addEventListener('click', async () => {
                const ok = await Tools.copyText(resultDecimalEl ? resultDecimalEl.textContent : '0.00');
                if (ok) {
                    Tools.flashButtonText(btnCopyDec, 'Copiado!');
                } else {
                    Tools.showToast('Não foi possível copiar o valor.', 'error');
                }
            });
        }

        if (btnCopyBrl) {
            btnCopyBrl.addEventListener('click', async () => {
                const ok = await Tools.copyText(resultBrlEl ? resultBrlEl.textContent : 'R$ 0,00');
                if (ok) {
                    Tools.flashButtonText(btnCopyBrl, 'Copiado!');
                } else {
                    Tools.showToast('Não foi possível copiar o valor.', 'error');
                }
            });
        }

        computeAndUpdateLive();

        root.__sumApp = {
            parseSmartNumber,
            analyzeValues,
            formatCurrencyBRL,
            getLastAnalysis: () => lastAnalysis
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
        parseSmartNumber,
        analyzeValues,
        formatCurrencyBRL
    };
});

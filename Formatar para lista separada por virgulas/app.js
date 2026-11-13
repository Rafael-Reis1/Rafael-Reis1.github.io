(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.CsvCore = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    /**
     * Extracts and formats a list of numbers or delimited items into a comma-separated string.
     * @param {string} rawText
     * @param {{mode?: 'numbers'|'lines', quotes?: boolean, dedupe?: boolean, wrapParens?: boolean, spaceAfterComma?: boolean}} [options]
     * @returns {{items: string[], count: number, rawCount: number, output: string}}
     */
    function formatCommaList(rawText, options = {}) {
        const {
            mode = 'numbers',
            quotes = false,
            dedupe = false,
            wrapParens = false,
            spaceAfterComma = false
        } = options;

        const text = String(rawText || '');
        let items = [];

        if (mode === 'lines') {
            items = text
                .split(/[\r\n,;]+/)
                .map(s => s.trim())
                .filter(Boolean);
        } else {
            items = text.match(/\d+/g) || [];
        }

        const rawCount = items.length;
        if (dedupe) {
            items = Array.from(new Set(items));
        }

        if (items.length === 0) {
            return { items: [], count: 0, rawCount: 0, output: '' };
        }

        const separator = spaceAfterComma ? ', ' : ',';
        const formattedItems = quotes
            ? items.map(item => `'${mode === 'lines' ? item.replace(/'/g, "''") : item}'`)
            : items;

        let output = formattedItems.join(separator);
        if (wrapParens) {
            output = `(${output})`;
        }

        return {
            items,
            count: items.length,
            rawCount,
            output
        };
    }

    function initDom() {
        if (typeof document === 'undefined') return;
        const Tools = root.MiniTools;
        if (!Tools) return;

        Tools.bindHomeButton('#btnVoltar');

        const inputEl = document.getElementById('numeros');
        const modeEl = document.getElementById('modoExtracao');
        const quotesEl = document.getElementById('aspas');
        const dedupeEl = document.getElementById('duplicados');
        const parensEl = document.getElementById('parenteses');
        const spaceEl = document.getElementById('espaco');
        const statsEl = document.getElementById('csv-stats');
        const popupCountEl = document.getElementById('csv-popup-count');
        const outputEl = document.getElementById('listaFormatada');

        const btnFormat = document.getElementById('formataLista');
        const btnCopyDirect = document.getElementById('copiarDiretoBtn');
        const btnClear = document.getElementById('limpar');
        const btnCopyPopup = document.getElementById('copiarListaBtn');

        const popup = Tools.createPopupController(document.getElementById('listaFormatadaPopup'), {
            backdropEl: document.getElementById('listaBackgroud'),
            closeButtons: [document.getElementById('fechar')]
        });

        function readOptions() {
            return {
                mode: modeEl && modeEl.value === 'lines' ? 'lines' : 'numbers',
                quotes: Boolean(quotesEl && quotesEl.checked),
                dedupe: Boolean(dedupeEl && dedupeEl.checked),
                wrapParens: Boolean(parensEl && parensEl.checked),
                spaceAfterComma: Boolean(spaceEl && spaceEl.checked)
            };
        }

        function computeCurrent() {
            return formatCommaList(inputEl ? inputEl.value : '', readOptions());
        }

        function updateLiveStats() {
            if (!statsEl) return;
            const res = computeCurrent();
            const removed = res.rawCount - res.count;
            const label = res.count === 1 ? '1 item detectado' : `${res.count} itens detectados`;
            statsEl.textContent = removed > 0 ? `${label} (${removed} duplicados removidos)` : label;
        }

        function openFormattedModal() {
            const res = computeCurrent();
            if (!res.output) {
                Tools.showToast('Nenhum item válido encontrado na entrada.', 'error');
                return;
            }
            if (outputEl) outputEl.textContent = res.output;
            if (popupCountEl) {
                popupCountEl.textContent = res.count === 1 ? '1 item' : `${res.count} itens`;
            }
            popup.open();
        }

        async function copyDirectly() {
            const res = computeCurrent();
            if (!res.output) {
                Tools.showToast('Nenhum item válido encontrado na entrada.', 'error');
                return;
            }
            const ok = await Tools.copyText(res.output);
            if (ok) {
                Tools.flashButtonText(btnCopyDirect, 'Copiado!');
                Tools.showToast(`${res.count} itens copiados!`, 'success', 1500);
            } else {
                Tools.showToast('Não foi possível copiar a lista.', 'error');
            }
        }

        [inputEl, modeEl, quotesEl, dedupeEl, parensEl, spaceEl].forEach(el => {
            if (el) el.addEventListener(el.tagName === 'TEXTAREA' ? 'input' : 'change', updateLiveStats);
        });

        Tools.bindCtrlEnter(inputEl, openFormattedModal);

        if (btnFormat) btnFormat.addEventListener('click', openFormattedModal);
        if (btnCopyDirect) btnCopyDirect.addEventListener('click', copyDirectly);

        if (btnClear) {
            btnClear.addEventListener('click', () => {
                if (inputEl) inputEl.value = '';
                updateLiveStats();
                if (inputEl) inputEl.focus();
            });
        }

        if (btnCopyPopup) {
            btnCopyPopup.addEventListener('click', async () => {
                const text = outputEl ? outputEl.textContent : '';
                const ok = await Tools.copyText(text);
                if (ok) {
                    Tools.flashButtonText(btnCopyPopup, 'Copiado!');
                } else {
                    Tools.showToast('Não foi possível copiar o texto.', 'error');
                }
            });
        }

        updateLiveStats();

        root.__csvApp = {
            formatCommaList
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
        formatCommaList
    };
});

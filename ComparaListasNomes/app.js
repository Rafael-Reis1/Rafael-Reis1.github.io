(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.CompareCore = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    /**
     * Normalizes an item key according to comparison sensitivity flags.
     * @param {string} value
     * @param {{ignoreCase?: boolean, ignoreAccents?: boolean}} [options]
     * @returns {string}
     */
    function normalizeKey(value, options = {}) {
        const { ignoreCase = true, ignoreAccents = false } = options;
        let result = String(value || '').trim();
        if (ignoreAccents) {
            result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }
        if (ignoreCase) {
            result = result.toLowerCase();
        }
        return result;
    }

    /**
     * Parses raw textarea input into trimmed non-empty lines.
     * @param {string} text
     * @returns {string[]}
     */
    function parseLines(text) {
        return String(text || '')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);
    }

    /**
     * Builds frequency/unique maps preserving first display label per normalized key.
     * @param {string[]} items
     * @param {{ignoreCase?: boolean, ignoreAccents?: boolean}} options
     */
    function indexList(items, options) {
        const uniqueMap = new Map();
        const counts = new Map();
        items.forEach(item => {
            const key = normalizeKey(item, options);
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, item);
                counts.set(key, 1);
            } else {
                counts.set(key, counts.get(key) + 1);
            }
        });
        return { uniqueMap, counts };
    }

    /**
     * Sorts strings with locale awareness cleanly.
     * @param {string[]} arr
     * @returns {string[]}
     */
    function sortLocale(arr) {
        return arr.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    }

    /**
     * Compares two raw line-separated lists and computes intersections, differences, and duplicates.
     * @param {string} rawFirst
     * @param {string} rawSecond
     * @param {{ignoreCase?: boolean, ignoreAccents?: boolean}} [options]
     */
    function compareLists(rawFirst, rawSecond, options = {}) {
        const opts = {
            ignoreCase: options.ignoreCase !== false,
            ignoreAccents: Boolean(options.ignoreAccents)
        };

        const firstItems = parseLines(rawFirst);
        const secondItems = parseLines(rawSecond);

        const firstIndex = indexList(firstItems, opts);
        const secondIndex = indexList(secondItems, opts);

        const common = [];
        const onlyInFirst = [];
        const onlyInSecond = [];
        const duplicatesFirst = [];
        const duplicatesSecond = [];

        firstIndex.uniqueMap.forEach((label, key) => {
            if (secondIndex.uniqueMap.has(key)) {
                common.push(label);
            } else {
                onlyInFirst.push(label);
            }
            const count = firstIndex.counts.get(key) || 1;
            if (count > 1) {
                duplicatesFirst.push({ value: label, count, label: `${label} (${count}x)` });
            }
        });

        secondIndex.uniqueMap.forEach((label, key) => {
            if (!firstIndex.uniqueMap.has(key)) {
                onlyInSecond.push(label);
            }
            const count = secondIndex.counts.get(key) || 1;
            if (count > 1) {
                duplicatesSecond.push({ value: label, count, label: `${label} (${count}x)` });
            }
        });

        sortLocale(common);
        sortLocale(onlyInFirst);
        sortLocale(onlyInSecond);
        duplicatesFirst.sort((a, b) => a.value.localeCompare(b.value, 'pt-BR', { sensitivity: 'base' }));
        duplicatesSecond.sort((a, b) => a.value.localeCompare(b.value, 'pt-BR', { sensitivity: 'base' }));

        return {
            counts: {
                firstTotal: firstItems.length,
                firstUnique: firstIndex.uniqueMap.size,
                secondTotal: secondItems.length,
                secondUnique: secondIndex.uniqueMap.size
            },
            common,
            onlyInFirst,
            onlyInSecond,
            duplicatesFirst,
            duplicatesSecond
        };
    }

    /**
     * Formats a comparison result into tab-separated plain text for spreadsheets.
     * @param {ReturnType<typeof compareLists>} result
     * @returns {string}
     */
    function formatCompareTSV(result) {
        const headers = ['Em Comum', 'Ausentes (Só na 1ª)', 'Adicionais (Só na 2ª)', 'Duplicados (1ª)', 'Duplicados (2ª)'];
        const col1 = result.common;
        const col2 = result.onlyInFirst;
        const col3 = result.onlyInSecond;
        const col4 = result.duplicatesFirst.map(d => d.label);
        const col5 = result.duplicatesSecond.map(d => d.label);

        const maxRows = Math.max(col1.length, col2.length, col3.length, col4.length, col5.length);
        const lines = [headers.join('\t')];

        for (let i = 0; i < maxRows; i++) {
            lines.push([col1[i] || '', col2[i] || '', col3[i] || '', col4[i] || '', col5[i] || ''].join('\t'));
        }
        return lines.join('\n');
    }

    function initDom() {
        if (typeof document === 'undefined') return;
        const Tools = root.MiniTools;
        if (!Tools) return;

        Tools.bindHomeButton('#btnVoltar');

        const listaUmEl = document.getElementById('listaUm');
        const listaDoisEl = document.getElementById('listaDois');
        const countUmEl = document.getElementById('count-um');
        const countDoisEl = document.getElementById('count-dois');
        const ignoreCaseEl = document.getElementById('ignorarMaiusculas');
        const ignoreAccentsEl = document.getElementById('ignorarAcentos');
        const btnCompare = document.getElementById('formataLista');
        const btnClear = document.getElementById('limpar');
        const btnSwap = document.getElementById('inverterListas');
        const btnCopyAll = document.getElementById('copiarListaBtn');
        const btnCopyAbsent = document.getElementById('copiarAusentesBtn');
        const btnCopyExtra = document.getElementById('copiarAdicionaisBtn');
        const filterInput = document.getElementById('filtroResultado');
        const statsEl = document.getElementById('compare-stats');
        const resultContainer = document.getElementById('listaFormatada');

        const popup = Tools.createPopupController(document.getElementById('listaFormatadaPopup'), {
            backdropEl: document.getElementById('listaBackgroud'),
            closeButtons: [document.getElementById('fechar')]
        });

        let lastResult = null;

        function updateLiveCounts() {
            const opts = {
                ignoreCase: !ignoreCaseEl || ignoreCaseEl.checked,
                ignoreAccents: Boolean(ignoreAccentsEl && ignoreAccentsEl.checked)
            };
            const firstItems = parseLines(listaUmEl ? listaUmEl.value : '');
            const secondItems = parseLines(listaDoisEl ? listaDoisEl.value : '');
            const firstUnique = indexList(firstItems, opts).uniqueMap.size;
            const secondUnique = indexList(secondItems, opts).uniqueMap.size;

            if (countUmEl) {
                countUmEl.textContent = `${firstItems.length} ${firstItems.length === 1 ? 'item' : 'itens'} (${firstUnique} ${firstUnique === 1 ? 'único' : 'únicos'})`;
            }
            if (countDoisEl) {
                countDoisEl.textContent = `${secondItems.length} ${secondItems.length === 1 ? 'item' : 'itens'} (${secondUnique} ${secondUnique === 1 ? 'único' : 'únicos'})`;
            }
        }

        function renderStats(res) {
            if (!statsEl) return;
            statsEl.replaceChildren();
            const pills = [
                { label: 'Em comum', val: res.common.length, cls: 'success' },
                { label: 'Ausentes na 2ª', val: res.onlyInFirst.length, cls: 'danger' },
                { label: 'Adicionais na 2ª', val: res.onlyInSecond.length, cls: 'accent' },
                { label: 'Duplicados', val: res.duplicatesFirst.length + res.duplicatesSecond.length, cls: '' }
            ];
            pills.forEach(p => {
                const span = document.createElement('span');
                span.className = `stat-pill ${p.cls}`.trim();
                const text = document.createTextNode(`${p.label}: `);
                const strong = document.createElement('strong');
                strong.textContent = String(p.val);
                span.append(text, strong);
                statsEl.appendChild(span);
            });
        }

        function renderResultsTable(res, filterQuery = '') {
            if (!resultContainer) return;
            resultContainer.replaceChildren();

            const columns = [
                { title: `Em Comum (${res.common.length})`, values: res.common },
                { title: `Ausentes (${res.onlyInFirst.length})`, values: res.onlyInFirst },
                { title: `Adicionais (${res.onlyInSecond.length})`, values: res.onlyInSecond },
                { title: `Dupl. 1ª (${res.duplicatesFirst.length})`, values: res.duplicatesFirst.map(d => d.label) },
                { title: `Dupl. 2ª (${res.duplicatesSecond.length})`, values: res.duplicatesSecond.map(d => d.label) }
            ];

            const maxRows = Math.max(...columns.map(c => c.values.length));
            if (maxRows === 0) {
                const note = document.createElement('p');
                note.className = 'empty-table-note';
                note.textContent = 'Nenhum item encontrado para comparar.';
                resultContainer.appendChild(note);
                return;
            }

            const query = filterQuery.trim().toLowerCase();
            const rowsToRender = [];
            for (let i = 0; i < maxRows; i++) {
                const rowCells = columns.map(col => col.values[i] || '');
                if (!query || rowCells.some(cell => cell.toLowerCase().includes(query))) {
                    rowsToRender.push(rowCells);
                }
            }

            const table = document.createElement('table');
            table.id = 'tabelaResultados';

            const thead = document.createElement('thead');
            const headTr = document.createElement('tr');
            columns.forEach(col => {
                const th = document.createElement('th');
                const inner = document.createElement('div');
                inner.className = 'th-inner';

                const labelSpan = document.createElement('span');
                labelSpan.textContent = col.title;
                inner.appendChild(labelSpan);

                if (col.values.length > 0) {
                    const copyColBtn = document.createElement('button');
                    copyColBtn.type = 'button';
                    copyColBtn.className = 'btn-col-copy';
                    copyColBtn.textContent = 'Copiar';
                    copyColBtn.addEventListener('click', async () => {
                        const ok = await Tools.copyText(col.values.join('\n'));
                        Tools.showToast(ok ? 'Coluna copiada!' : 'Não foi possível copiar.', ok ? 'success' : 'error');
                    });
                    inner.appendChild(copyColBtn);
                }

                th.appendChild(inner);
                headTr.appendChild(th);
            });
            thead.appendChild(headTr);

            const tbody = document.createElement('tbody');
            rowsToRender.forEach(rowCells => {
                const tr = document.createElement('tr');
                rowCells.forEach(cellValue => {
                    const td = document.createElement('td');
                    td.textContent = cellValue;
                    if (cellValue !== '') {
                        td.dataset.copyable = 'true';
                        td.title = 'Clique para copiar';
                    }
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });

            table.append(thead, tbody);
            table.addEventListener('click', async (event) => {
                const td = event.target.closest('td[data-copyable="true"]');
                if (!td) return;
                const ok = await Tools.copyText(td.textContent);
                if (ok) {
                    table.querySelectorAll('td.copiada').forEach(el => el.classList.remove('copiada'));
                    td.classList.add('copiada');
                    Tools.showToast('Texto copiado!', 'success', 1400);
                } else {
                    Tools.showToast('Erro ao copiar célula.', 'error');
                }
            });

            resultContainer.appendChild(table);
        }

        function runComparison() {
            const firstText = listaUmEl ? listaUmEl.value : '';
            const secondText = listaDoisEl ? listaDoisEl.value : '';
            if (!firstText.trim() && !secondText.trim()) {
                Tools.showToast('Cole itens em ao menos uma das listas.', 'error');
                return;
            }

            lastResult = compareLists(firstText, secondText, {
                ignoreCase: !ignoreCaseEl || ignoreCaseEl.checked,
                ignoreAccents: Boolean(ignoreAccentsEl && ignoreAccentsEl.checked)
            });

            if (filterInput) filterInput.value = '';
            renderStats(lastResult);
            renderResultsTable(lastResult, '');
            if (btnCopyAbsent) btnCopyAbsent.disabled = lastResult.onlyInFirst.length === 0;
            if (btnCopyExtra) btnCopyExtra.disabled = lastResult.onlyInSecond.length === 0;
            popup.open();
        }

        if (listaUmEl) listaUmEl.addEventListener('input', updateLiveCounts);
        if (listaDoisEl) listaDoisEl.addEventListener('input', updateLiveCounts);
        if (ignoreCaseEl) ignoreCaseEl.addEventListener('change', updateLiveCounts);
        if (ignoreAccentsEl) ignoreAccentsEl.addEventListener('change', updateLiveCounts);

        Tools.bindCtrlEnter(listaUmEl, runComparison);
        Tools.bindCtrlEnter(listaDoisEl, runComparison);

        if (btnCompare) btnCompare.addEventListener('click', runComparison);

        if (btnClear) {
            btnClear.addEventListener('click', () => {
                if (listaUmEl) listaUmEl.value = '';
                if (listaDoisEl) listaDoisEl.value = '';
                updateLiveCounts();
            });
        }

        if (btnSwap) {
            btnSwap.addEventListener('click', () => {
                if (!listaUmEl || !listaDoisEl) return;
                const tmp = listaUmEl.value;
                listaUmEl.value = listaDoisEl.value;
                listaDoisEl.value = tmp;
                updateLiveCounts();
            });
        }

        if (filterInput) {
            filterInput.addEventListener('input', () => {
                if (lastResult) renderResultsTable(lastResult, filterInput.value);
            });
        }

        if (btnCopyAll) {
            btnCopyAll.addEventListener('click', async () => {
                if (!lastResult) return;
                const ok = await Tools.copyText(formatCompareTSV(lastResult));
                if (ok) {
                    Tools.flashButtonText(btnCopyAll, 'Copiado!');
                } else {
                    Tools.showToast('Não foi possível copiar a tabela.', 'error');
                }
            });
        }

        if (btnCopyAbsent) {
            btnCopyAbsent.addEventListener('click', async () => {
                if (!lastResult || lastResult.onlyInFirst.length === 0) return;
                const ok = await Tools.copyText(lastResult.onlyInFirst.join('\n'));
                Tools.showToast(ok ? 'Ausentes copiados!' : 'Erro ao copiar.', ok ? 'success' : 'error');
            });
        }

        if (btnCopyExtra) {
            btnCopyExtra.addEventListener('click', async () => {
                if (!lastResult || lastResult.onlyInSecond.length === 0) return;
                const ok = await Tools.copyText(lastResult.onlyInSecond.join('\n'));
                Tools.showToast(ok ? 'Adicionais copiados!' : 'Erro ao copiar.', ok ? 'success' : 'error');
            });
        }

        updateLiveCounts();

        root.__compareApp = {
            compareLists,
            formatCompareTSV,
            getLastResult: () => lastResult
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
        normalizeKey,
        parseLines,
        compareLists,
        formatCompareTSV
    };
});

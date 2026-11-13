(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.TextDiffCore = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const MAX_LCS_CELLS = 1600000;

    /**
     * Normalizes a single line for comparison according to active sensitivity flags.
     * @param {string} line
     * @param {{ignoreCase?: boolean, ignoreWhitespace?: boolean}} [options]
     * @returns {string}
     */
    function normalizeLine(line, options = {}) {
        let value = String(line ?? '');
        if (options.ignoreWhitespace) {
            value = value.trim().replace(/\s+/g, ' ');
        }
        if (options.ignoreCase) {
            value = value.toLowerCase();
        }
        return value;
    }

    /**
     * Splits text into lines preserving normalized comparison metadata.
     * @param {string} rawText
     * @param {{ignoreCase?: boolean, ignoreWhitespace?: boolean, ignoreEmptyLines?: boolean}} [options]
     * @returns {Array<{text: string, norm: string, lineNumber: number}>}
     */
    function prepareLines(rawText, options = {}) {
        const normalizedNewlines = String(rawText || '').replace(/\r\n?/g, '\n');
        if (!normalizedNewlines) return [];
        const rawLines = normalizedNewlines.split('\n');
        const prepared = [];
        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            if (options.ignoreEmptyLines && line.trim() === '') continue;
            prepared.push({
                text: line,
                norm: normalizeLine(line, options),
                lineNumber: i + 1
            });
        }
        return prepared;
    }

    /**
     * Computes Longest Common Subsequence matches over two sequences of keys.
     * Falls back cleanly to a greedy sync window for extremely large inputs.
     * @param {string[]} seqA
     * @param {string[]} seqB
     * @returns {Array<[number, number]>}
     */
    function computeLcsMatches(seqA, seqB) {
        const m = seqA.length;
        const n = seqB.length;
        if (m === 0 || n === 0) return [];

        let start = 0;
        while (start < m && start < n && seqA[start] === seqB[start]) {
            start++;
        }

        let endA = m - 1;
        let endB = n - 1;
        while (endA >= start && endB >= start && seqA[endA] === seqB[endB]) {
            endA--;
            endB--;
        }

        const matches = [];
        for (let i = 0; i < start; i++) matches.push([i, i]);

        const midA = endA - start + 1;
        const midB = endB - start + 1;

        if (midA > 0 && midB > 0) {
            if (midA * midB <= MAX_LCS_CELLS) {
                const cols = midB + 1;
                const dp = new Uint32Array((midA + 1) * cols);
                for (let i = midA - 1; i >= 0; i--) {
                    const aVal = seqA[start + i];
                    const rowOff = i * cols;
                    const nextRowOff = (i + 1) * cols;
                    for (let j = midB - 1; j >= 0; j--) {
                        if (aVal === seqB[start + j]) {
                            dp[rowOff + j] = dp[nextRowOff + j + 1] + 1;
                        } else {
                            const down = dp[nextRowOff + j];
                            const right = dp[rowOff + j + 1];
                            dp[rowOff + j] = down >= right ? down : right;
                        }
                    }
                }
                let i = 0;
                let j = 0;
                while (i < midA && j < midB) {
                    if (seqA[start + i] === seqB[start + j]) {
                        matches.push([start + i, start + j]);
                        i++;
                        j++;
                    } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
                        i++;
                    } else {
                        j++;
                    }
                }
            } else {
                // Bounded lookahead fallback to avoid OOM on gigantic pasted documents
                let i = start;
                let j = start;
                const lookahead = 200;
                while (i <= endA && j <= endB) {
                    if (seqA[i] === seqB[j]) {
                        matches.push([i, j]);
                        i++;
                        j++;
                    } else {
                        let foundI = -1;
                        let foundJ = -1;
                        for (let offset = 1; offset <= lookahead && (i + offset <= endA || j + offset <= endB); offset++) {
                            if (foundI === -1 && j + offset <= endB && seqA[i] === seqB[j + offset]) {
                                foundJ = j + offset;
                                break;
                            }
                            if (i + offset <= endA && seqA[i + offset] === seqB[j]) {
                                foundI = i + offset;
                                break;
                            }
                        }
                        if (foundJ !== -1) {
                            j = foundJ;
                        } else if (foundI !== -1) {
                            i = foundI;
                        } else {
                            i++;
                            j++;
                        }
                    }
                }
            }
        }

        const tailCount = (m - 1) - endA;
        for (let k = 0; k < tailCount; k++) {
            matches.push([endA + 1 + k, endB + 1 + k]);
        }
        return matches;
    }

    /**
     * Tokenizes a line into words, whitespace, and punctuation for intra-line word diffing.
     * @param {string} line
     * @returns {string[]}
     */
    function tokenizeInline(line) {
        return String(line || '').match(/\s+|[A-Za-zÀ-ÖØ-öø-ÿ0-9_]+|[^\sA-Za-zÀ-ÖØ-öø-ÿ0-9_]/g) || [];
    }

    /**
     * Computes token-level inline changes between two lines.
     * @param {string} lineA
     * @param {string} lineB
     * @param {{ignoreCase?: boolean, ignoreWhitespace?: boolean}} [options]
     * @returns {{leftTokens: Array<{text: string, changed: boolean}>, rightTokens: Array<{text: string, changed: boolean}>}}
     */
    function computeInlineWordDiff(lineA, lineB, options = {}) {
        const tokensA = tokenizeInline(lineA);
        const tokensB = tokenizeInline(lineB);
        if (tokensA.length * tokensB.length > 25000) {
            return {
                leftTokens: [{ text: lineA, changed: true }],
                rightTokens: [{ text: lineB, changed: true }]
            };
        }

        const keysA = tokensA.map(t => normalizeLine(t, options));
        const keysB = tokensB.map(t => normalizeLine(t, options));
        const matches = computeLcsMatches(keysA, keysB);

        const matchedA = new Set(matches.map(p => p[0]));
        const matchedB = new Set(matches.map(p => p[1]));

        const coalesce = (tokens, matchedSet) => {
            const grouped = [];
            tokens.forEach((tok, idx) => {
                const changed = !matchedSet.has(idx);
                if (grouped.length > 0 && grouped[grouped.length - 1].changed === changed) {
                    grouped[grouped.length - 1].text += tok;
                } else {
                    grouped.push({ text: tok, changed });
                }
            });
            return grouped;
        };

        return {
            leftTokens: coalesce(tokensA, matchedA),
            rightTokens: coalesce(tokensB, matchedB)
        };
    }

    /**
     * Computes paired side-by-side rows and summary counts between two texts.
     * @param {string} textA
     * @param {string} textB
     * @param {{ignoreCase?: boolean, ignoreWhitespace?: boolean, ignoreEmptyLines?: boolean}} [options]
     */
    function computeTextDiff(textA, textB, options = {}) {
        const linesA = prepareLines(textA, options);
        const linesB = prepareLines(textB, options);

        const matches = computeLcsMatches(
            linesA.map(l => l.norm),
            linesB.map(l => l.norm)
        );

        const ops = [];
        let cursorA = 0;
        let cursorB = 0;

        const flushChangeBlock = (endA, endB) => {
            const delSlice = linesA.slice(cursorA, endA);
            const addSlice = linesB.slice(cursorB, endB);
            const pairCount = Math.max(delSlice.length, addSlice.length);
            for (let k = 0; k < pairCount; k++) {
                const left = delSlice[k] || null;
                const right = addSlice[k] || null;
                if (left && right) {
                    const inline = computeInlineWordDiff(left.text, right.text, options);
                    ops.push({
                        type: 'modify',
                        leftLine: left.lineNumber,
                        leftText: left.text,
                        leftTokens: inline.leftTokens,
                        rightLine: right.lineNumber,
                        rightText: right.text,
                        rightTokens: inline.rightTokens
                    });
                } else if (left) {
                    ops.push({
                        type: 'delete',
                        leftLine: left.lineNumber,
                        leftText: left.text,
                        rightLine: null,
                        rightText: null
                    });
                } else if (right) {
                    ops.push({
                        type: 'insert',
                        leftLine: null,
                        leftText: null,
                        rightLine: right.lineNumber,
                        rightText: right.text
                    });
                }
            }
        };

        for (const [matchA, matchB] of matches) {
            if (matchA > cursorA || matchB > cursorB) {
                flushChangeBlock(matchA, matchB);
            }
            const lA = linesA[matchA];
            const lB = linesB[matchB];
            ops.push({
                type: 'equal',
                leftLine: lA.lineNumber,
                leftText: lA.text,
                rightLine: lB.lineNumber,
                rightText: lB.text
            });
            cursorA = matchA + 1;
            cursorB = matchB + 1;
        }

        if (cursorA < linesA.length || cursorB < linesB.length) {
            flushChangeBlock(linesA.length, linesB.length);
        }

        let equalCount = 0;
        let addedCount = 0;
        let removedCount = 0;
        let modifiedCount = 0;

        for (const row of ops) {
            if (row.type === 'equal') equalCount++;
            else if (row.type === 'insert') addedCount++;
            else if (row.type === 'delete') removedCount++;
            else if (row.type === 'modify') modifiedCount++;
        }

        return {
            rows: ops,
            stats: {
                equal: equalCount,
                added: addedCount,
                removed: removedCount,
                modified: modifiedCount,
                totalChanges: addedCount + removedCount + modifiedCount
            }
        };
    }

    /**
     * Generates a clean unified diff (.diff / patch) string from a computed diff result.
     * @param {{rows: Array}} diffResult
     * @returns {string}
     */
    function formatUnifiedPatch(diffResult) {
        if (!diffResult || !Array.isArray(diffResult.rows)) return '';
        const out = ['--- Original (A)', '+++ Alterado (B)'];
        for (const row of diffResult.rows) {
            if (row.type === 'equal') {
                out.push(` ${row.leftText}`);
            } else if (row.type === 'delete') {
                out.push(`-${row.leftText}`);
            } else if (row.type === 'insert') {
                out.push(`+${row.rightText}`);
            } else if (row.type === 'modify') {
                out.push(`-${row.leftText}`);
                out.push(`+${row.rightText}`);
            }
        }
        return out.join('\n');
    }

    function appendHighlightedTokens(td, tokens, markClass) {
        if (!tokens || tokens.length === 0) return;
        for (const token of tokens) {
            if (token.changed) {
                const mark = document.createElement('mark');
                mark.className = markClass;
                mark.textContent = token.text;
                td.appendChild(mark);
            } else {
                td.appendChild(document.createTextNode(token.text));
            }
        }
    }

    function initDom() {
        if (typeof document === 'undefined') return;
        const Tools = root.MiniTools;
        if (!Tools) return;

        Tools.bindHomeButton('#btnVoltar');

        const leftEl = document.getElementById('textOriginal');
        const rightEl = document.getElementById('textModified');
        const metaLeft = document.getElementById('metaOriginal');
        const metaRight = document.getElementById('metaModified');
        const onlyChangesEl = document.getElementById('onlyChanges');
        const ignoreWsEl = document.getElementById('ignoreWhitespace');
        const ignoreCaseEl = document.getElementById('ignoreCase');
        const ignoreEmptyEl = document.getElementById('ignoreEmptyLines');
        const viewButtons = Array.from(document.querySelectorAll('.seg-btn[data-view]'));
        const swapBtn = document.getElementById('swapTextsBtn');
        const jsonBtn = document.getElementById('prettyJsonBtn');
        const copyPatchBtn = document.getElementById('copyPatchBtn');
        const clearBtn = document.getElementById('clearBtn');
        const statsEl = document.getElementById('diffStats');
        const outputEl = document.getElementById('diffOutput');

        let currentView = 'split';
        let lastDiff = null;

        function updateTextMeta(textarea, targetEl) {
            if (!textarea || !targetEl) return;
            const val = textarea.value || '';
            const lines = val ? val.split(/\r?\n/).length : 0;
            targetEl.textContent = `${lines} ${lines === 1 ? 'linha' : 'linhas'} · ${val.length} caracteres`;
        }

        function getOptions() {
            return {
                ignoreWhitespace: Boolean(ignoreWsEl && ignoreWsEl.checked),
                ignoreCase: Boolean(ignoreCaseEl && ignoreCaseEl.checked),
                ignoreEmptyLines: Boolean(ignoreEmptyEl && ignoreEmptyEl.checked)
            };
        }

        function filterContextRows(rows) {
            if (!onlyChangesEl || !onlyChangesEl.checked) return rows;
            const visible = new Set();
            const contextRadius = 2;
            rows.forEach((row, idx) => {
                if (row.type !== 'equal') {
                    for (let k = Math.max(0, idx - contextRadius); k <= Math.min(rows.length - 1, idx + contextRadius); k++) {
                        visible.add(k);
                    }
                }
            });

            const sliced = [];
            let lastIncluded = -1;
            rows.forEach((row, idx) => {
                if (!visible.has(idx)) return;
                if (lastIncluded !== -1 && idx - lastIncluded > 1) {
                    sliced.push({ type: 'separator' });
                }
                sliced.push(row);
                lastIncluded = idx;
            });
            return sliced;
        }

        function renderStats(diff) {
            if (!statsEl) return;
            statsEl.replaceChildren();
            const hasInput = Boolean((leftEl && leftEl.value) || (rightEl && rightEl.value));
            if (!hasInput) {
                const pill = document.createElement('span');
                pill.className = 'stat-pill';
                pill.textContent = 'Aguardando textos';
                statsEl.appendChild(pill);
                return;
            }

            if (diff.stats.totalChanges === 0) {
                const pill = document.createElement('span');
                pill.className = 'stat-pill success';
                const strong = document.createElement('strong');
                strong.textContent = 'Textos idênticos';
                pill.appendChild(strong);
                statsEl.appendChild(pill);
            }

            const items = [
                { label: 'Adicionadas', val: diff.stats.added, cls: 'success' },
                { label: 'Removidas', val: diff.stats.removed, cls: 'danger' },
                { label: 'Alteradas', val: diff.stats.modified, cls: 'accent' },
                { label: 'Iguais', val: diff.stats.equal, cls: '' }
            ];
            items.forEach((item) => {
                const span = document.createElement('span');
                span.className = `stat-pill ${item.cls}`.trim();
                const strong = document.createElement('strong');
                strong.textContent = String(item.val);
                span.append(`${item.label}: `, strong);
                statsEl.appendChild(span);
            });
        }

        function renderDiffView() {
            if (!outputEl) return;
            outputEl.replaceChildren();

            const leftText = leftEl ? leftEl.value : '';
            const rightText = rightEl ? rightEl.value : '';

            updateTextMeta(leftEl, metaLeft);
            updateTextMeta(rightEl, metaRight);

            if (!leftText && !rightText) {
                lastDiff = computeTextDiff('', '', getOptions());
                renderStats(lastDiff);
                const p = document.createElement('p');
                p.className = 'diff-empty-note';
                p.textContent = 'Cole dois textos acima para visualizar as diferenças em tempo real.';
                outputEl.appendChild(p);
                return;
            }

            lastDiff = computeTextDiff(leftText, rightText, getOptions());
            renderStats(lastDiff);

            const rows = filterContextRows(lastDiff.rows);
            if (rows.length === 0) {
                const p = document.createElement('p');
                p.className = 'diff-empty-note';
                p.textContent = 'Nenhuma diferença encontrada com os filtros atuais.';
                outputEl.appendChild(p);
                return;
            }

            const table = document.createElement('table');
            table.className = 'diff-table';
            const tbody = document.createElement('tbody');

            if (currentView === 'split') {
                rows.forEach((row) => {
                    if (row.type === 'separator') {
                        const tr = document.createElement('tr');
                        tr.className = 'diff-separator-row';
                        const td = document.createElement('td');
                        td.colSpan = 4;
                        td.textContent = '⋯ linhas iguais ocultadas ⋯';
                        tr.appendChild(td);
                        tbody.appendChild(tr);
                        return;
                    }

                    const tr = document.createElement('tr');
                    const tdLnA = document.createElement('td');
                    tdLnA.className = 'diff-ln';
                    tdLnA.textContent = row.leftLine != null ? String(row.leftLine) : '';

                    const tdA = document.createElement('td');
                    tdA.className = 'diff-cell-split';

                    const tdLnB = document.createElement('td');
                    tdLnB.className = 'diff-ln';
                    tdLnB.textContent = row.rightLine != null ? String(row.rightLine) : '';

                    const tdB = document.createElement('td');
                    tdB.className = 'diff-cell-split';

                    if (row.type === 'equal') {
                        tdA.textContent = row.leftText;
                        tdB.textContent = row.rightText;
                    } else if (row.type === 'delete') {
                        tdA.classList.add('diff-cell-del');
                        tdA.textContent = row.leftText;
                        tdB.classList.add('diff-cell-empty');
                    } else if (row.type === 'insert') {
                        tdA.classList.add('diff-cell-empty');
                        tdB.classList.add('diff-cell-add');
                        tdB.textContent = row.rightText;
                    } else if (row.type === 'modify') {
                        tdA.classList.add('diff-cell-del');
                        appendHighlightedTokens(tdA, row.leftTokens, 'diff-word-del');
                        tdB.classList.add('diff-cell-add');
                        appendHighlightedTokens(tdB, row.rightTokens, 'diff-word-add');
                    }

                    tr.append(tdLnA, tdA, tdLnB, tdB);
                    tbody.appendChild(tr);
                });
            } else {
                const appendUnifiedRow = (cls, lnA, lnB, sign, content, tokens, markClass) => {
                    const tr = document.createElement('tr');
                    if (cls) tr.className = cls;
                    const td1 = document.createElement('td');
                    td1.className = 'diff-ln';
                    td1.textContent = lnA != null ? String(lnA) : '';
                    const td2 = document.createElement('td');
                    td2.className = 'diff-ln';
                    td2.textContent = lnB != null ? String(lnB) : '';
                    const tdSign = document.createElement('td');
                    tdSign.className = 'diff-sign';
                    tdSign.textContent = sign;
                    const tdBody = document.createElement('td');
                    if (tokens) {
                        appendHighlightedTokens(tdBody, tokens, markClass);
                    } else {
                        tdBody.textContent = content || '';
                    }
                    tr.append(td1, td2, tdSign, tdBody);
                    tbody.appendChild(tr);
                };

                rows.forEach((row) => {
                    if (row.type === 'separator') {
                        const tr = document.createElement('tr');
                        tr.className = 'diff-separator-row';
                        const td = document.createElement('td');
                        td.colSpan = 4;
                        td.textContent = '⋯ linhas iguais ocultadas ⋯';
                        tr.appendChild(td);
                        tbody.appendChild(tr);
                    } else if (row.type === 'equal') {
                        appendUnifiedRow('', row.leftLine, row.rightLine, ' ', row.leftText);
                    } else if (row.type === 'delete') {
                        appendUnifiedRow('diff-row-del', row.leftLine, null, '-', row.leftText);
                    } else if (row.type === 'insert') {
                        appendUnifiedRow('diff-row-add', null, row.rightLine, '+', row.rightText);
                    } else if (row.type === 'modify') {
                        appendUnifiedRow('diff-row-del', row.leftLine, null, '-', row.leftText, row.leftTokens, 'diff-word-del');
                        appendUnifiedRow('diff-row-add', null, row.rightLine, '+', row.rightText, row.rightTokens, 'diff-word-add');
                    }
                });
            }

            table.appendChild(tbody);
            outputEl.appendChild(table);
        }

        if (leftEl) leftEl.addEventListener('input', renderDiffView);
        if (rightEl) rightEl.addEventListener('input', renderDiffView);
        if (onlyChangesEl) onlyChangesEl.addEventListener('change', renderDiffView);
        if (ignoreWsEl) ignoreWsEl.addEventListener('change', renderDiffView);
        if (ignoreCaseEl) ignoreCaseEl.addEventListener('change', renderDiffView);
        if (ignoreEmptyEl) ignoreEmptyEl.addEventListener('change', renderDiffView);

        viewButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                currentView = btn.dataset.view === 'unified' ? 'unified' : 'split';
                viewButtons.forEach((other) => {
                    const active = other === btn;
                    other.classList.toggle('is-active', active);
                    other.setAttribute('aria-pressed', active ? 'true' : 'false');
                });
                renderDiffView();
            });
        });

        if (swapBtn) {
            swapBtn.addEventListener('click', () => {
                if (!leftEl || !rightEl) return;
                const tmp = leftEl.value;
                leftEl.value = rightEl.value;
                rightEl.value = tmp;
                renderDiffView();
            });
        }

        if (jsonBtn) {
            jsonBtn.addEventListener('click', () => {
                let formattedAny = false;
                let errorSide = '';
                [
                    { el: leftEl, name: 'A' },
                    { el: rightEl, name: 'B' }
                ].forEach(({ el, name }) => {
                    if (!el || !el.value.trim()) return;
                    try {
                        const parsed = JSON.parse(el.value);
                        el.value = JSON.stringify(parsed, null, 2);
                        formattedAny = true;
                    } catch {
                        errorSide = errorSide ? 'A e B' : name;
                    }
                });

                if (formattedAny) {
                    renderDiffView();
                    Tools.showToast(
                        errorSide ? `JSON formatado (texto ${errorSide} não era JSON válido).` : 'JSON formatado nos campos!',
                        errorSide ? 'info' : 'success',
                        1800
                    );
                } else {
                    Tools.showToast('Nenhum JSON válido detectado nos campos.', 'error');
                }
            });
        }

        if (copyPatchBtn) {
            copyPatchBtn.addEventListener('click', async () => {
                if (!lastDiff || (!leftEl?.value && !rightEl?.value)) {
                    Tools.showToast('Compare dois textos antes de copiar o diff.', 'error');
                    return;
                }
                const ok = await Tools.copyText(formatUnifiedPatch(lastDiff));
                if (ok) {
                    Tools.flashButtonText(copyPatchBtn, 'Copiado!');
                } else {
                    Tools.showToast('Não foi possível copiar o diff.', 'error');
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (leftEl) leftEl.value = '';
                if (rightEl) rightEl.value = '';
                renderDiffView();
                if (leftEl) leftEl.focus();
            });
        }

        renderDiffView();

        root.__textDiffApp = {
            computeTextDiff,
            computeInlineWordDiff,
            formatUnifiedPatch
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
        normalizeLine,
        prepareLines,
        computeLcsMatches,
        computeInlineWordDiff,
        computeTextDiff,
        formatUnifiedPatch
    };
});

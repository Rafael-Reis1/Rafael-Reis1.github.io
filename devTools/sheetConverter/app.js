(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.SheetConverterCore = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const DELIMITER_MAP = {
        tab: '\t',
        semicolon: ';',
        comma: ',',
        pipe: '|'
    };

    const DELIMITER_LABELS = {
        '\t': 'Tab (Excel)',
        ';': 'Ponto e vírgula (;)',
        ',': 'Vírgula (,)',
        '|': 'Pipe (|)'
    };

    /**
     * Detects the most likely column delimiter from the first few non-empty lines.
     * Prefers Tab since Excel/Sheets copy natively as TSV.
     * @param {string} rawText
     * @returns {string}
     */
    function detectDelimiter(rawText) {
        const sampleLines = String(rawText || '')
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .filter(l => l.trim() !== '')
            .slice(0, 6);

        if (sampleLines.length === 0) return '\t';

        const candidates = ['\t', ';', ',', '|'];
        let bestDelim = '\t';
        let bestScore = 0;

        for (const delim of candidates) {
            let outsideQuotesCounts = [];
            for (const line of sampleLines) {
                let inQuotes = false;
                let count = 0;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') {
                        inQuotes = !inQuotes;
                    } else if (!inQuotes && ch === delim) {
                        count++;
                    }
                }
                outsideQuotesCounts.push(count);
            }
            const first = outsideQuotesCounts[0];
            if (first === 0) continue;
            const consistent = outsideQuotesCounts.every(c => c === first);
            const score = first * (consistent ? 10 : 1) + (delim === '\t' ? 2 : 0);
            if (score > bestScore) {
                bestScore = score;
                bestDelim = delim;
            }
        }
        return bestDelim;
    }

    /**
     * Parses CSV/TSV text with RFC-4180 quote handling (including multiline quoted cells).
     * @param {string} rawText
     * @param {{delimiter?: string, hasHeader?: boolean}} [options]
     */
    function parseTabularText(rawText, options = {}) {
        const normalized = String(rawText || '').replace(/\r\n?/g, '\n').trim();
        if (!normalized) {
            return { delimiter: '\t', headers: [], rows: [] };
        }

        const requestedDelim = options.delimiter || 'auto';
        const delimiter = DELIMITER_MAP[requestedDelim] || (requestedDelim !== 'auto' ? requestedDelim : detectDelimiter(normalized));

        const parsedRows = [];
        let row = [];
        let cell = '';
        let inQuotes = false;

        for (let i = 0; i < normalized.length; i++) {
            const ch = normalized[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (normalized[i + 1] === '"') {
                        cell += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cell += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === delimiter) {
                row.push(cell);
                cell = '';
            } else if (ch === '\n') {
                row.push(cell);
                parsedRows.push(row);
                row = [];
                cell = '';
            } else {
                cell += ch;
            }
        }
        row.push(cell);
        parsedRows.push(row);

        const nonEmptyRows = parsedRows.filter(r => r.some(c => c.trim() !== ''));
        if (nonEmptyRows.length === 0) {
            return { delimiter, headers: [], rows: [] };
        }

        const maxCols = Math.max(...nonEmptyRows.map(r => r.length));
        const hasHeader = options.hasHeader !== false;

        let headers;
        let dataRows;

        if (hasHeader) {
            const rawHeader = nonEmptyRows[0];
            headers = Array.from({ length: maxCols }, (_, idx) => {
                const name = String(rawHeader[idx] || '').trim();
                return name || `col_${idx + 1}`;
            });
            dataRows = nonEmptyRows.slice(1);
        } else {
            headers = Array.from({ length: maxCols }, (_, idx) => `col_${idx + 1}`);
            dataRows = nonEmptyRows;
        }

        const paddedRows = dataRows.map(r =>
            Array.from({ length: maxCols }, (_, idx) => (r[idx] !== undefined ? r[idx].trim() : ''))
        );

        return { delimiter, headers, rows: paddedRows };
    }

    /**
     * Infers typed JS value from cell text without breaking leading-zero identifiers (like RA or CPF).
     * @param {string} raw
     * @param {boolean} inferTypes
     */
    function inferCellValue(raw, inferTypes = true) {
        const text = String(raw ?? '').trim();
        if (!inferTypes) return text;
        if (text === '' || text.toUpperCase() === 'NULL') return null;
        if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';

        // Keep leading zeros like "00123" as string so student/employee codes are not stripped.
        if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
            const num = Number(text);
            if (Number.isSafeInteger(num) || (!Number.isInteger(num) && Number.isFinite(num))) {
                return num;
            }
        }
        return text;
    }

    /**
     * Formats a safe SQL identifier, trimming risky chars while preserving readability.
     * @param {string} name
     * @returns {string}
     */
    function sanitizeSqlIdent(name, fallback = 'minha_tabela') {
        const clean = String(name || '').trim().replace(/\s+/g, '_').replace(/[^\w$.]/g, '');
        return clean || fallback;
    }

    function toSqlLiteral(raw, inferTypes) {
        const val = inferCellValue(raw, inferTypes);
        if (val === null) return 'NULL';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        return `'${String(val).replace(/'/g, "''")}'`;
    }

    /**
     * Generates SQL INSERT / UPDATE, JSON array, or Markdown table output.
     * @param {string} rawText
     * @param {{format?: string, tableName?: string, delimiter?: string, hasHeader?: boolean, inferTypes?: boolean}} [options]
     */
    function convertSheet(rawText, options = {}) {
        const {
            format = 'sql-insert',
            tableName = 'minha_tabela',
            delimiter = 'auto',
            hasHeader = true,
            inferTypes = true
        } = options;

        const parsed = parseTabularText(rawText, { delimiter, hasHeader });
        if (parsed.headers.length === 0) {
            return { ...parsed, output: '', ext: 'txt' };
        }

        const safeTable = sanitizeSqlIdent(tableName, 'minha_tabela');
        const sqlCols = parsed.headers.map(h => sanitizeSqlIdent(h, 'col'));

        if (format === 'json') {
            const objects = parsed.rows.map(row => {
                const obj = {};
                parsed.headers.forEach((h, i) => {
                    obj[h] = inferCellValue(row[i], inferTypes);
                });
                return obj;
            });
            return { ...parsed, output: JSON.stringify(objects, null, 2), ext: 'json' };
        }

        if (format === 'markdown') {
            const escPipe = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
            const headerLine = `| ${parsed.headers.map(escPipe).join(' | ')} |`;
            const sepLine = `| ${parsed.headers.map(() => '---').join(' | ')} |`;
            const bodyLines = parsed.rows.map(r => `| ${r.map(escPipe).join(' | ')} |`);
            return {
                ...parsed,
                output: [headerLine, sepLine, ...bodyLines].join('\n'),
                ext: 'md'
            };
        }

        if (parsed.rows.length === 0) {
            return { ...parsed, output: '-- Adicione ao menos uma linha de dados abaixo do cabeçalho.', ext: 'sql' };
        }

        if (format === 'sql-update') {
            if (sqlCols.length < 2) {
                return {
                    ...parsed,
                    output: '-- SQL UPDATE exige ao menos 2 colunas (1ª = chave WHERE, demais = SET).',
                    ext: 'sql'
                };
            }
            const keyCol = sqlCols[0];
            const statements = parsed.rows.map(row => {
                const setClauses = sqlCols.slice(1).map((col, idx) =>
                    `${col} = ${toSqlLiteral(row[idx + 1], inferTypes)}`
                );
                return `UPDATE ${safeTable} SET ${setClauses.join(', ')} WHERE ${keyCol} = ${toSqlLiteral(row[0], inferTypes)};`;
            });
            return { ...parsed, output: statements.join('\n'), ext: 'sql' };
        }

        const colList = sqlCols.join(', ');
        if (format === 'sql-insert-single') {
            const lines = parsed.rows.map(row => {
                const vals = row.map(v => toSqlLiteral(v, inferTypes)).join(', ');
                return `INSERT INTO ${safeTable} (${colList}) VALUES (${vals});`;
            });
            return { ...parsed, output: lines.join('\n'), ext: 'sql' };
        }

        // Default: batched sql-insert
        const tupleLines = parsed.rows.map(row => {
            const vals = row.map(v => toSqlLiteral(v, inferTypes)).join(', ');
            return `  (${vals})`;
        });
        return {
            ...parsed,
            output: `INSERT INTO ${safeTable} (${colList})\nVALUES\n${tupleLines.join(',\n')};`,
            ext: 'sql'
        };
    }

    function initDom() {
        if (typeof document === 'undefined') return;
        const Tools = root.MiniTools;
        if (!Tools) return;

        Tools.bindHomeButton('#btnVoltar');

        const inputEl = document.getElementById('sheetInput');
        const outputEl = document.getElementById('sheetOutput');
        const statsEl = document.getElementById('sheetStats');
        const delimBadgeEl = document.getElementById('detectedSepBadge');
        const formatEl = document.getElementById('outputFormat');
        const tableWrapperEl = document.getElementById('tableNameWrapper');
        const tableNameEl = document.getElementById('tableName');
        const delimiterEl = document.getElementById('delimiterMode');
        const headerEl = document.getElementById('hasHeader');
        const inferEl = document.getElementById('inferTypes');

        const sampleBtn = document.getElementById('sampleBtn');
        const copyBtn = document.getElementById('copyBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        const clearBtn = document.getElementById('clearBtn');

        let lastExt = 'sql';

        function syncTableFieldVisibility() {
            if (!tableWrapperEl || !formatEl) return;
            const isSql = formatEl.value.startsWith('sql');
            tableWrapperEl.classList.toggle('is-hidden', !isSql);
        }

        function updateConversion() {
            syncTableFieldVisibility();
            const res = convertSheet(inputEl ? inputEl.value : '', {
                format: formatEl ? formatEl.value : 'sql-insert',
                tableName: tableNameEl ? tableNameEl.value : 'minha_tabela',
                delimiter: delimiterEl ? delimiterEl.value : 'auto',
                hasHeader: !headerEl || headerEl.checked,
                inferTypes: !inferEl || inferEl.checked
            });

            lastExt = res.ext || 'txt';
            if (outputEl) outputEl.value = res.output;
            if (statsEl) {
                const rowCount = res.rows.length;
                const colCount = res.headers.length;
                statsEl.textContent = `${rowCount} ${rowCount === 1 ? 'linha' : 'linhas'} · ${colCount} ${colCount === 1 ? 'coluna' : 'colunas'}`;
            }
            if (delimBadgeEl) {
                const label = inputEl && inputEl.value.trim()
                    ? (DELIMITER_LABELS[res.delimiter] || res.delimiter)
                    : 'Auto';
                delimBadgeEl.textContent = `Separador: ${label}`;
            }
        }

        if (inputEl) inputEl.addEventListener('input', updateConversion);
        if (formatEl) formatEl.addEventListener('change', updateConversion);
        if (tableNameEl) tableNameEl.addEventListener('input', updateConversion);
        if (delimiterEl) delimiterEl.addEventListener('change', updateConversion);
        if (headerEl) headerEl.addEventListener('change', updateConversion);
        if (inferEl) inferEl.addEventListener('change', updateConversion);

        if (sampleBtn) {
            sampleBtn.addEventListener('click', () => {
                if (!inputEl) return;
                inputEl.value = [
                    'ra\tnome\tcurso\tbolsa\tativo',
                    '002145\tAna Silva\tSistemas de Informação\t1250.50\ttrue',
                    "002146\tBruno O'Brien\tDireito\tNULL\ttrue",
                    '002147\tCarla Mendes\tEngenharia Civil\t890\tfalse'
                ].join('\n');
                if (tableNameEl && !tableNameEl.value.trim()) {
                    tableNameEl.value = 'alunos';
                }
                updateConversion();
            });
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                const out = outputEl ? outputEl.value : '';
                if (!out.trim()) {
                    Tools.showToast('Cole uma tabela para converter antes de copiar.', 'error');
                    return;
                }
                const ok = await Tools.copyText(out);
                if (ok) {
                    Tools.flashButtonText(copyBtn, 'Copiado!');
                } else {
                    Tools.showToast('Erro ao copiar resultado.', 'error');
                }
            });
        }

        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                const out = outputEl ? outputEl.value : '';
                if (!out.trim()) {
                    Tools.showToast('Nada para baixar ainda.', 'error');
                    return;
                }
                const baseName = sanitizeSqlIdent(tableNameEl?.value, 'dados');
                const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${baseName}.${lastExt}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => {
                    try { URL.revokeObjectURL(url); } catch (_) {}
                }, 5000);
                Tools.showToast(`Arquivo ${baseName}.${lastExt} baixado!`, 'success', 1800);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (inputEl) inputEl.value = '';
                updateConversion();
                if (inputEl) inputEl.focus();
            });
        }

        updateConversion();

        root.__sheetConverterApp = {
            detectDelimiter,
            parseTabularText,
            convertSheet
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
        detectDelimiter,
        parseTabularText,
        inferCellValue,
        sanitizeSqlIdent,
        convertSheet
    };
});

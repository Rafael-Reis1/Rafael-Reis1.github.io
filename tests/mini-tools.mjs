import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MINI_TOOLS_JS = path.join(ROOT_DIR, 'assets', 'libs_comuns', 'mini-tools.js');
const COMPARE_DIR = path.join(ROOT_DIR, 'ComparaListasNomes');
const CSV_DIR = path.join(ROOT_DIR, 'Formatar para lista separada por virgulas');
const LINKS_DIR = path.join(ROOT_DIR, 'linksMD');
const SUM_DIR = path.join(ROOT_DIR, 'somaValores');

const CompareCore = require(path.join(COMPARE_DIR, 'app.js'));
const CsvCore = require(path.join(CSV_DIR, 'app.js'));
const LinksCore = require(path.join(LINKS_DIR, 'app.js'));
const SumCore = require(path.join(SUM_DIR, 'app.js'));

let JSDOM;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    console.log('\nℹ️  jsdom não instalado — pulando testes de DOM das mini ferramentas.\n');
    process.exit(0);
}

let passed = 0;
let failed = 0;

async function check(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`PASS ${name}`);
    } catch (error) {
        failed++;
        console.error(`FAIL ${name}: ${error.stack || error}`);
    }
}

async function mountToolDom(htmlFilePath, appJsPath, url) {
    const html = fs.readFileSync(htmlFilePath, 'utf8');
    const miniToolsCode = fs.readFileSync(MINI_TOOLS_JS, 'utf8');
    const appCode = fs.readFileSync(appJsPath, 'utf8');

    const dom = new JSDOM(html, {
        url,
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });

    const win = dom.window;
    win.__copiedHistory = [];
    win.navigator.clipboard = {
        writeText: async (text) => {
            win.__copiedHistory.push(text);
        }
    };
    win.URL.createObjectURL = () => 'blob:mock-download';
    win.URL.revokeObjectURL = () => {};
    win.HTMLAnchorElement.prototype.click = function () {
        win.__lastDownload = { href: this.href, download: this.download };
    };

    const vmContext = dom.getInternalVMContext();
    vm.runInContext(miniToolsCode, vmContext);
    vm.runInContext(appCode, vmContext);

    if (win.document.readyState === 'loading') {
        await new Promise(resolve => win.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }

    return { dom, win, doc: win.document };
}

// --- 1. Assets & HTML/Syntax Hygiene ---
await check('Shared mini-tools.js passes syntax check and tools use relative paths without alert()', () => {
    const syntax = spawnSync(process.execPath, ['--check', MINI_TOOLS_JS], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);

    const htmlFiles = [
        path.join(COMPARE_DIR, 'ComparaListasNomes.html'),
        path.join(CSV_DIR, 'Formatar para lista separada por virgulas.html'),
        path.join(LINKS_DIR, 'linksMD.html'),
        path.join(SUM_DIR, 'somaValores.html')
    ];

    for (const file of htmlFiles) {
        const html = fs.readFileSync(file, 'utf8');
        assert.ok(html.includes('../assets/libs_comuns/mini-tools.css'), `${file} must load mini-tools.css`);
        assert.ok(html.includes('../assets/libs_comuns/mini-tools.js'), `${file} must load mini-tools.js`);
        assert.ok(html.includes('src="../imgs/arrow_back_white.webp"'), `${file} must use relative arrow_back path`);
        assert.ok(html.includes('data-back-href="../devTools/devTools.html"'), `${file} must return to Suíte Dev hub`);
        assert.ok(!html.includes('class="dev-suite-nav"'), `${file} must not include redundant top switcher bar`);
        assert.ok(!html.includes('href="/imgs/'), `${file} must not use broken root-relative /imgs/ path`);
    }
});

// --- 2. ComparaListasNomes ---
await check('CompareCore handles intersections, differences, duplicates on both lists, and accent folding', () => {
    const res = CompareCore.compareLists(
        'João\nMaria\nJoão\nCarlos',
        'Joao\nAna\nANA\nPedro',
        { ignoreCase: true, ignoreAccents: true }
    );
    assert.deepEqual(res.common, ['João']);
    assert.deepEqual(res.onlyInFirst, ['Carlos', 'Maria']);
    assert.deepEqual(res.onlyInSecond, ['Ana', 'Pedro']);
    assert.deepEqual(res.duplicatesFirst.map(d => d.label), ['João (2x)']);
    assert.deepEqual(res.duplicatesSecond.map(d => d.label), ['Ana (2x)']);

    const tsv = CompareCore.formatCompareTSV(res);
    assert.ok(tsv.startsWith('Em Comum\tAusentes (Só na 1ª)\tAdicionais (Só na 2ª)\tDuplicados (1ª)\tDuplicados (2ª)'));
});

await check('ComparaListasNomes DOM renders safely without XSS and supports filter, invert, and cell copy', async () => {
    const { dom, win, doc } = await mountToolDom(
        path.join(COMPARE_DIR, 'ComparaListasNomes.html'),
        path.join(COMPARE_DIR, 'app.js'),
        'https://localhost/ComparaListasNomes/ComparaListasNomes.html'
    );

    assert.equal(doc.getElementById('btnVoltar')?.dataset?.backHref, '../devTools/devTools.html');

    const xssPayload = '<img src=x onerror="window.__xssTriggered=1">';
    doc.getElementById('listaUm').value = `${xssPayload}\nAlpha\nBeta`;
    doc.getElementById('listaDois').value = 'Beta\nGamma';
    doc.getElementById('listaUm').dispatchEvent(new win.Event('input'));

    assert.equal(doc.getElementById('count-um').textContent, '3 itens (3 únicos)');

    doc.getElementById('formataLista').click();
    const table = doc.getElementById('tabelaResultados');
    assert.ok(table, 'Results table must render');
    assert.equal(table.querySelectorAll('img').length, 0, 'XSS markup must not be parsed as HTML');
    assert.equal(win.__xssTriggered, undefined);

    const tds = Array.from(table.querySelectorAll('td[data-copyable="true"]'));
    const xssCell = tds.find(td => td.textContent === xssPayload);
    assert.ok(xssCell, 'XSS string should appear safely escaped via textContent');
    xssCell.click();
    await new Promise(r => setTimeout(r, 15));
    assert.equal(win.__copiedHistory.at(-1), xssPayload);

    // Filter down to "Gamma"
    const filter = doc.getElementById('filtroResultado');
    filter.value = 'gamma';
    filter.dispatchEvent(new win.Event('input'));
    assert.equal(doc.querySelectorAll('#tabelaResultados tbody tr').length, 1);

    // Escape closes popup
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(doc.getElementById('listaFormatadaPopup').classList.contains('is-open'), false);

    // Swap lists
    doc.getElementById('inverterListas').click();
    assert.ok(doc.getElementById('listaDois').value.includes('Alpha'));

    dom.window.close();
});

// --- 3. Formatar para lista separada por virgulas ---
await check('CsvCore supports numbers mode, lines mode, quotes escaping, deduplication, parens, and spacing', () => {
    const numRes = CsvCore.formatCommaList('IDs: 10, 20, 10 e 30', {
        mode: 'numbers',
        quotes: true,
        dedupe: true,
        wrapParens: true
    });
    assert.equal(numRes.output, "('10','20','30')");
    assert.equal(numRes.count, 3);

    const lineRes = CsvCore.formatCommaList("SKU-01\nO'Brien; SKU-01\nSKU-02", {
        mode: 'lines',
        quotes: true,
        dedupe: true,
        spaceAfterComma: true
    });
    assert.equal(lineRes.output, "'SKU-01', 'O''Brien', 'SKU-02'");
});

await check('Formatar Lista DOM updates live count, formats popup, and supports direct copy', async () => {
    const { dom, win, doc } = await mountToolDom(
        path.join(CSV_DIR, 'Formatar para lista separada por virgulas.html'),
        path.join(CSV_DIR, 'app.js'),
        'https://localhost/Formatar/Formatar.html'
    );

    const textarea = doc.getElementById('numeros');
    textarea.value = '101\n202\n101';
    textarea.dispatchEvent(new win.Event('input'));
    assert.equal(doc.getElementById('csv-stats').textContent, '3 itens detectados');

    doc.getElementById('duplicados').checked = true;
    doc.getElementById('duplicados').dispatchEvent(new win.Event('change'));
    assert.equal(doc.getElementById('csv-stats').textContent, '2 itens detectados (1 duplicados removidos)');

    doc.getElementById('aspas').checked = true;
    doc.getElementById('parenteses').checked = true;
    doc.getElementById('formataLista').click();
    assert.equal(doc.getElementById('listaFormatada').textContent, "('101','202')");

    doc.getElementById('copiarDiretoBtn').click();
    await new Promise(r => setTimeout(r, 15));
    assert.equal(win.__copiedHistory.at(-1), "('101','202')");

    dom.window.close();
});

// --- 4. linksMD ---
await check('LinksCore extracts dirty URLs, supports www/youtu.be/shorts/TOTVS, and escapes brackets', () => {
    const input = `
        Confira (https://youtu.be/dQw4w9WgXcQ).
        Repo: www.github.com/Rafael-Reis1/repo-teste,
        Docs: https://tdn.totvs.com/display/public?pageId=998877
        Wiki: https://en.wikipedia.org/wiki/Markdown_(markup)
        Duplicado: https://youtu.be/dQw4w9WgXcQ
    `;
    const md = LinksCore.generateMarkdown(input, { dedupe: true, asBulletList: true });
    assert.equal(md.count, 4);
    assert.ok(md.items[0].line === '- [YouTube - Vídeo (dQw4w9WgXcQ)](https://youtu.be/dQw4w9WgXcQ)');
    assert.ok(md.items[1].line === '- [GitHub: Rafael-Reis1/repo-teste](https://www.github.com/Rafael-Reis1/repo-teste)');
    assert.ok(md.items[2].line === '- [Documentação TOTVS (ID: 998877)](https://tdn.totvs.com/display/public?pageId=998877)');
    assert.ok(md.items[3].line === '- [en.wikipedia.org/wiki/Markdown_(markup)](https://en.wikipedia.org/wiki/Markdown_(markup))');
    assert.equal(LinksCore.buildMarkdownTitle('https://example.com/[v1]'), 'example.com/\\[v1\\]');
});

await check('linksMD DOM renders live preview, copies markdown, and downloads links.md', async () => {
    const { dom, win, doc } = await mountToolDom(
        path.join(LINKS_DIR, 'linksMD.html'),
        path.join(LINKS_DIR, 'app.js'),
        'https://localhost/linksMD/linksMD.html'
    );

    const textarea = doc.getElementById('links');
    textarea.value = 'https://rafael-reis1.github.io/';
    textarea.dispatchEvent(new win.Event('input'));

    assert.equal(doc.getElementById('links-stats').textContent, '1 link detectado');
    assert.equal(doc.getElementById('previewWrapper').hidden, false);
    assert.equal(doc.getElementById('markdownPreview').textContent, '[Portfólio do Rafael Reis](https://rafael-reis1.github.io/)');

    doc.getElementById('copiarMarkdown').click();
    await new Promise(r => setTimeout(r, 15));
    assert.equal(win.__copiedHistory.at(-1), '[Portfólio do Rafael Reis](https://rafael-reis1.github.io/)');

    doc.getElementById('gerarArquivo').click();
    assert.equal(win.__lastDownload.download, 'links.md');

    dom.window.close();
});

// --- 5. somaValores ---
await check('SumCore accurately parses BR/US/dot-decimal numbers, handles negatives, and prevents float drift', () => {
    assert.equal(SumCore.parseSmartNumber('R$ 1.234,56')?.value, 1234.56);
    assert.equal(SumCore.parseSmartNumber('10.50')?.value, 10.5);
    assert.equal(SumCore.parseSmartNumber('$1,234.56')?.value, 1234.56);
    assert.equal(SumCore.parseSmartNumber('- 50,25')?.value, -50.25);
    assert.equal(SumCore.parseSmartNumber('1.500', 'auto')?.value, 1500);
    assert.equal(SumCore.parseSmartNumber('1.500', 'us')?.value, 1.5);
    assert.equal(SumCore.parseSmartNumber('...'), null);

    const drift = SumCore.analyzeValues('0.1\n0.2');
    assert.equal(drift.sum, 0.3);
    assert.equal(drift.decimalText, '0.30');

    const mixed = SumCore.analyzeValues('R$ 1.000,50\n10.50\n10.50\n-11,00', { ignoreDuplicates: true });
    assert.equal(mixed.count, 3);
    assert.equal(mixed.decimalText, '1000.00');
    assert.equal(mixed.brlText, 'R$ 1.000,00');
    assert.equal(mixed.min, -11);
    assert.equal(mixed.max, 1000.5);

    const negZero = SumCore.analyzeValues('-0.00001\n0.00001');
    assert.equal(negZero.decimalText, '0.00');
    assert.equal(Object.is(negZero.sum, -0), false);
});

await check('somaValores DOM updates live totals and renders modal breakdown + copy buttons', async () => {
    const { dom, win, doc } = await mountToolDom(
        path.join(SUM_DIR, 'somaValores.html'),
        path.join(SUM_DIR, 'app.js'),
        'https://localhost/somaValores/somaValores.html'
    );

    const textarea = doc.getElementById('numeros');
    textarea.value = 'R$ 100,50\n49.50';
    textarea.dispatchEvent(new win.Event('input'));

    assert.equal(doc.getElementById('soma-live-stats').textContent, '2 valores detectados • Total: R$ 150,00');

    doc.getElementById('realizarSoma').click();
    assert.equal(doc.getElementById('resultadoSoma').textContent, '150.00');
    assert.equal(doc.getElementById('resultadoBRL').textContent, 'R$ 150,00');
    assert.equal(doc.getElementById('soma-count-badge').textContent, '2 valores');

    doc.getElementById('copiarBrlBtn').click();
    await new Promise(r => setTimeout(r, 15));
    assert.equal(win.__copiedHistory.at(-1), 'R$ 150,00');

    dom.window.close();
});

console.log(`\nResumo mini-tools: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
    process.exit(1);
}

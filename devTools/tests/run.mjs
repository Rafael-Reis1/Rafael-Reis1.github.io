import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEVTOOLS_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(DEVTOOLS_DIR, '..');

const HUB_HTML = path.join(DEVTOOLS_DIR, 'devTools.html');
const HUB_INDEX = path.join(DEVTOOLS_DIR, 'index.html');
const HUB_JS = path.join(DEVTOOLS_DIR, 'app.js');

const HubCore = require(HUB_JS);

let JSDOM;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    console.log('\nℹ️  jsdom não instalado — pulando testes de DOM da Suíte Dev.\n');
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

await check('DevTools Hub HTML e links apontam para arquivos existentes no repositório', () => {
    assert.ok(fs.existsSync(HUB_INDEX), 'devTools/index.html redirecionador deve existir');
    const html = fs.readFileSync(HUB_HTML, 'utf8');
    const dom = new JSDOM(html, { url: 'https://localhost/devTools/devTools.html' });
    const cards = Array.from(dom.window.document.querySelectorAll('#toolsGrid .tool-card'));
    assert.equal(cards.length, 9, 'Deve listar as 9 ferramentas Dev/TI');

    cards.forEach((card) => {
        const rawHref = card.getAttribute('href') || '';
        const cleanHref = rawHref.split('?')[0].split('#')[0];
        const resolved = path.resolve(DEVTOOLS_DIR, decodeURIComponent(cleanHref));
        assert.ok(fs.existsSync(resolved), `Link quebrado no card: ${rawHref} -> ${resolved}`);
    });

    dom.window.close();
});

await check('matchesToolFilter normaliza acentos, caixa e múltiplos termos', () => {
    const item = {
        title: 'Formatador de Listas (CSV)',
        description: 'Converta colunas soltas para SQL IN',
        keywords: 'csv virgula aspas parenteses',
        category: 'lists'
    };

    assert.equal(HubCore.matchesToolFilter(item, 'vírgula sql', 'all'), true);
    assert.equal(HubCore.matchesToolFilter(item, 'vírgula', 'lists'), true);
    assert.equal(HubCore.matchesToolFilter(item, 'vírgula', 'docs'), false);
    assert.equal(HubCore.matchesToolFilter(item, 'fluig', 'all'), false);
});

await check('DOM da Suíte Dev filtra por busca, categoria, exibe estado vazio e limpa filtros', () => {
    const html = fs.readFileSync(HUB_HTML, 'utf8');
    const appCode = fs.readFileSync(HUB_JS, 'utf8');
    const dom = new JSDOM(html, {
        url: 'https://localhost/devTools/devTools.html',
        runScripts: 'outside-only'
    });

    vm.runInContext(appCode, dom.getInternalVMContext());
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));

    const doc = dom.window.document;
    const countEl = doc.getElementById('toolsCount');
    const searchInput = doc.getElementById('toolSearch');
    const clearBtn = doc.getElementById('clearSearch');
    const emptyState = doc.getElementById('emptyState');

    assert.equal(countEl.textContent, '9 ferramentas disponíveis');
    assert.equal(emptyState.hidden, true);
    assert.equal(clearBtn.hidden, true);

    // Search by keyword without accents (markdown matches Links Markdown + Excel->SQL/MD)
    searchInput.value = 'markdown';
    searchInput.dispatchEvent(new dom.window.Event('input'));
    const mdMatches = Array.from(doc.querySelectorAll('#toolsGrid .tool-card:not(.hidden)'));
    assert.equal(mdMatches.length, 2);
    assert.equal(countEl.textContent, '2 ferramentas disponíveis');
    assert.equal(clearBtn.hidden, false);

    // Multi-word search narrows to single tool and singular grammar
    searchInput.value = 'links markdown';
    searchInput.dispatchEvent(new dom.window.Event('input'));
    const visibleAfterSearch = Array.from(doc.querySelectorAll('#toolsGrid .tool-card:not(.hidden)'));
    assert.equal(visibleAfterSearch.length, 1);
    assert.equal(visibleAfterSearch[0].dataset.tool, 'markdown');
    assert.equal(countEl.textContent, '1 ferramenta disponível');

    // Clear search button restores count
    clearBtn.click();
    assert.equal(searchInput.value, '');
    assert.equal(countEl.textContent, '9 ferramentas disponíveis');

    // Category filter: lists (4 tools), docs (2 tools), debug (3 tools)
    const listsPill = doc.querySelector('.filter-pill[data-category="lists"]');
    listsPill.click();
    assert.equal(listsPill.getAttribute('aria-pressed'), 'true');
    assert.equal(doc.querySelectorAll('#toolsGrid .tool-card:not(.hidden)').length, 4);

    const docsPill = doc.querySelector('.filter-pill[data-category="docs"]');
    docsPill.click();
    assert.equal(doc.querySelectorAll('#toolsGrid .tool-card:not(.hidden)').length, 2);

    const debugPill = doc.querySelector('.filter-pill[data-category="debug"]');
    debugPill.click();
    assert.equal(doc.querySelectorAll('#toolsGrid .tool-card:not(.hidden)').length, 3);

    // Empty state + Reset filters button
    searchInput.value = 'termo-inexistente-xyz';
    searchInput.dispatchEvent(new dom.window.Event('input'));
    assert.equal(doc.querySelectorAll('#toolsGrid .tool-card:not(.hidden)').length, 0);
    assert.equal(emptyState.hidden, false);

    doc.getElementById('resetFiltersBtn').click();
    assert.equal(searchInput.value, '');
    assert.equal(doc.querySelectorAll('#toolsGrid .tool-card:not(.hidden)').length, 9);
    assert.equal(emptyState.hidden, true);

    dom.window.close();
});

await check('DOM da Suíte Dev salva e restaura posição do scroll e filtros ao voltar de uma ferramenta', () => {
    const html = fs.readFileSync(HUB_HTML, 'utf8');
    const appCode = fs.readFileSync(HUB_JS, 'utf8');

    // Simula saída do hub após rolar e filtrar
    const dom1 = new JSDOM(html, {
        url: 'https://localhost/devTools/devTools.html',
        runScripts: 'outside-only'
    });
    vm.runInContext(appCode, dom1.getInternalVMContext());
    dom1.window.document.dispatchEvent(new dom1.window.Event('DOMContentLoaded', { bubbles: true }));

    const doc1 = dom1.window.document;
    doc1.querySelector('.filter-pill[data-category="debug"]').click();
    doc1.getElementById('toolSearch').value = 'lgpd';
    doc1.getElementById('toolSearch').dispatchEvent(new dom1.window.Event('input'));

    Object.defineProperty(dom1.window, 'scrollY', { value: 420, configurable: true });
    const card = doc1.querySelector('#toolsGrid .tool-card[data-tool="lgpd-kit"]');
    card.addEventListener('click', (e) => e.preventDefault());
    card.dispatchEvent(new dom1.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    const rawSaved = dom1.window.sessionStorage.getItem('devtools_hub_view_state');
    assert.ok(rawSaved, 'Clique no card deve salvar estado de visualização no sessionStorage');
    const parsedSaved = JSON.parse(rawSaved);
    assert.equal(parsedSaved.scrollY, 420);
    assert.equal(parsedSaved.category, 'debug');
    assert.equal(parsedSaved.query, 'lgpd');
    dom1.window.close();

    // Simula retorno ao hub via "← Suíte Dev"
    const dom2 = new JSDOM(html, {
        url: 'https://localhost/devTools/devTools.html',
        runScripts: 'outside-only'
    });
    let restoredTop = null;
    dom2.window.scrollTo = (arg1, arg2) => {
        restoredTop = typeof arg1 === 'object' ? arg1.top : arg2;
    };
    dom2.window.sessionStorage.setItem('devtools_hub_view_state', rawSaved);
    vm.runInContext(appCode, dom2.getInternalVMContext());
    dom2.window.document.dispatchEvent(new dom2.window.Event('DOMContentLoaded', { bubbles: true }));

    const doc2 = dom2.window.document;
    assert.equal(restoredTop, 420, 'Scroll vertical salvo deve ser restaurado no retorno');
    assert.equal(doc2.documentElement.scrollTop, 420);
    assert.equal(doc2.querySelector('.filter-pill[data-category="debug"]').getAttribute('aria-pressed'), 'true');
    assert.equal(doc2.getElementById('toolSearch').value, 'lgpd');
    assert.equal(doc2.querySelectorAll('#toolsGrid .tool-card:not(.hidden)').length, 1);
    assert.equal(dom2.window.sessionStorage.getItem('devtools_hub_view_state'), null, 'Estado restaurado deve ser consumido');

    // Simula salvamento seguido de retorno à Home limpando estado residual
    dom2.window.sessionStorage.setItem('devtools_hub_view_state', rawSaved);
    doc2.getElementById('btnVoltar').click();
    assert.equal(dom2.window.sessionStorage.getItem('devtools_hub_view_state'), null, 'Voltar para Home deve limpar estado salvo');

    dom2.window.close();
});

function mountToolDom(relHtmlPath, relAppPath) {
    const repoRoot = path.resolve(DEVTOOLS_DIR, '..');
    const htmlPath = path.join(DEVTOOLS_DIR, relHtmlPath);
    const appPath = path.join(DEVTOOLS_DIR, relAppPath);
    const miniToolsPath = path.join(repoRoot, 'assets', 'libs_comuns', 'mini-tools.js');

    const html = fs.readFileSync(htmlPath, 'utf8');
    const miniToolsCode = fs.readFileSync(miniToolsPath, 'utf8');
    const appCode = fs.readFileSync(appPath, 'utf8');

    const dom = new JSDOM(html, {
        url: `https://localhost/devTools/${relHtmlPath}`,
        runScripts: 'outside-only'
    });
    const ctx = dom.getInternalVMContext();
    vm.runInContext(miniToolsCode, ctx);
    vm.runInContext(appCode, ctx);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    return dom;
}

await check('TextDiffCore: LCS de linhas, diff por palavra, flags, patch e segurança DOM', async () => {
    const TextDiff = (await import('../textDiff/app.js')).default;

    const diff = TextDiff.computeTextDiff(
        'SELECT nome, cpf\nFROM alunos\nWHERE ativo = 1;',
        'SELECT nome, email\nFROM alunos\nWHERE ativo = 1;\nORDER BY nome;'
    );
    assert.equal(diff.stats.modified, 1);
    assert.equal(diff.stats.added, 1);
    assert.equal(diff.stats.removed, 0);
    assert.equal(diff.stats.equal, 2);

    const modRow = diff.rows.find(r => r.type === 'modify');
    assert.ok(modRow, 'Deve detectar linha modificada');
    assert.ok(modRow.leftTokens.some(t => t.changed && t.text === 'cpf'));
    assert.ok(modRow.rightTokens.some(t => t.changed && t.text === 'email'));

    const ignored = TextDiff.computeTextDiff('  Ola   Mundo \n\nLinha 2', 'ola mundo\nlinha 2', {
        ignoreCase: true,
        ignoreWhitespace: true,
        ignoreEmptyLines: true
    });
    assert.equal(ignored.stats.totalChanges, 0);

    const patch = TextDiff.formatUnifiedPatch(diff);
    assert.match(patch, /^--- Original \(A\)/);
    assert.match(patch, /^\+\+\+ Alterado \(B\)/m);
    assert.match(patch, /^-SELECT nome, cpf/m);
    assert.match(patch, /^\+ORDER BY nome;/m);

    const dom = mountToolDom('textDiff/textDiff.html', 'textDiff/app.js');
    const doc = dom.window.document;
    assert.equal(doc.getElementById('btnVoltar').dataset.backHref, '../devTools.html');
    assert.equal(doc.getElementById('compareBtn'), null, 'Comparação já ocorre em tempo real sem botão Comparar redundante');

    const leftEl = doc.getElementById('textOriginal');
    const rightEl = doc.getElementById('textModified');
    leftEl.value = '<script>alert(1)</script>\nEq1\nEq2\nEq3\nEq4\nEq5';
    rightEl.value = '<b>seguro</b>\nEq1\nEq2\nEq3\nEq4\nEq5';
    leftEl.dispatchEvent(new dom.window.Event('input'));
    rightEl.dispatchEvent(new dom.window.Event('input'));

    const out = doc.getElementById('diffOutput');
    assert.equal(out.querySelectorAll('script').length, 0, 'Payload XSS não pode virar script');
    assert.ok(out.textContent.includes('<script>alert(1)</script>'));
    assert.ok(out.textContent.includes('Eq5'));

    doc.querySelector('.seg-btn[data-view="unified"]').click();
    assert.ok(out.querySelector('.diff-sign'), 'Modo unificado deve renderizar coluna de sinal (+/-)');
    assert.ok(out.querySelector('.diff-row-del'), 'Modo unificado deve destacar linhas removidas');

    doc.getElementById('onlyChanges').click();
    assert.ok(!out.textContent.includes('Eq5'), 'Filtro só alterações deve ocultar linhas iguais distantes');

    dom.window.close();
});

await check('SheetConverterCore: TSV/CSV auto-detect, zeros à esquerda, SQL/JSON/MD e UI', async () => {
    const Sheet = (await import('../sheetConverter/app.js')).default;

    assert.equal(Sheet.detectDelimiter('id\tnome\tnota\n1\tAna\t9.5'), '\t');
    assert.equal(Sheet.detectDelimiter('id;nome;nota\n1;Ana;9.5'), ';');
    assert.equal(Sheet.detectDelimiter('id|nome|nota\n1|Ana|9.5'), '|');

    assert.equal(Sheet.inferCellValue('00123', true), '00123');
    assert.equal(Sheet.inferCellValue('42', true), 42);
    assert.equal(Sheet.inferCellValue('9.75', true), 9.75);
    assert.equal(Sheet.inferCellValue('NULL', true), null);
    assert.equal(Sheet.inferCellValue('true', true), true);

    const tsv = "ra\tnome\tativo\n00123\tMaria O'Reilly\ttrue\n00456\tJoão\tNULL";
    const insertBatch = Sheet.convertSheet(tsv, { format: 'sql-insert', tableName: 'alunos' });
    assert.match(insertBatch.output, /INSERT INTO alunos \(ra, nome, ativo\)/);
    assert.match(insertBatch.output, /'00123', 'Maria O''Reilly', TRUE/);
    assert.match(insertBatch.output, /'00456', 'João', NULL/);

    const updateSql = Sheet.convertSheet(tsv, { format: 'sql-update', tableName: 'alunos' });
    assert.match(updateSql.output, /UPDATE alunos SET nome = 'Maria O''Reilly', ativo = TRUE WHERE ra = '00123';/);

    const jsonRes = Sheet.convertSheet(tsv, { format: 'json' });
    const parsedJson = JSON.parse(jsonRes.output);
    assert.equal(parsedJson.length, 2);
    assert.equal(parsedJson[0].ra, '00123');
    assert.equal(parsedJson[1].ativo, null);

    const mdRes = Sheet.convertSheet("col1;col2\na|b;ok", { format: 'markdown' });
    assert.match(mdRes.output, /\| col1 \| col2 \|/);
    assert.match(mdRes.output, /\| a\\\|b \| ok \|/);

    const dom = mountToolDom('sheetConverter/sheetConverter.html', 'sheetConverter/app.js');
    const doc = dom.window.document;
    assert.equal(doc.getElementById('btnVoltar').dataset.backHref, '../devTools.html');
    doc.getElementById('sheetInput').value = tsv;
    doc.getElementById('sheetInput').dispatchEvent(new dom.window.Event('input'));
    assert.match(doc.getElementById('sheetOutput').value, /INSERT INTO/);
    assert.match(doc.getElementById('detectedSepBadge').textContent, /Tab/);

    dom.window.close();
});

await check('ApiInspectorCore: JSON, XML/SOAP, UTF-8 Base64/URL, JWT e abas DOM', async () => {
    const Api = (await import('../apiInspector/app.js')).default;

    const jOk = Api.processJson('{"b":2,"a":1,"vazio":null}', { mode: 'pretty-2', sortKeys: true, stripNulls: true });
    assert.equal(jOk.ok, true);
    assert.equal(jOk.output, '{\n  "a": 1,\n  "b": 2\n}');
    assert.equal(Api.processJson('{invalido').ok, false);

    const xmlOk = Api.processXml('<soap:Envelope><soap:Body><id>10</id></soap:Body></soap:Envelope>', { mode: 'pretty-2' });
    assert.equal(xmlOk.ok, true);
    assert.match(xmlOk.output, /  <soap:Body>\n    <id>10<\/id>/);
    assert.equal(Api.processXml('<root><aberto></root>').ok, false);

    const encoded = Api.transformEncoding('Atenção dev 🚀', 'b64url-encode').output;
    assert.ok(!encoded.includes('='), 'Base64URL não deve conter padding =');
    assert.equal(Api.transformEncoding(encoded, 'b64-decode').output, 'Atenção dev 🚀');

    const hdr = Api.encodeBase64Utf8(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), true);
    const pld = Api.encodeBase64Utf8(JSON.stringify({ sub: 'aluno_42', nome: 'Atenção', iat: 1700000000, exp: 1800000000 }), true);
    const fakeJwt = `Bearer ${hdr}.${pld}.assinatura_falsa`;

    const validJwt = Api.decodeJwt(fakeJwt, 1750000000 * 1000);
    assert.equal(validJwt.ok, true);
    assert.equal(validJwt.payload.nome, 'Atenção');
    assert.ok(validJwt.claims.some(c => c.cls === 'success' && c.label.startsWith('Válido até')));

    const expiredJwt = Api.decodeJwt(fakeJwt, 1850000000 * 1000);
    assert.ok(expiredJwt.claims.some(c => c.cls === 'danger' && c.label.startsWith('Expirado em')));

    const apiHtml = fs.readFileSync(path.join(DEVTOOLS_DIR, 'apiInspector/apiInspector.html'), 'utf8');
    assert.equal((apiHtml.match(/<\/body>/gi) || []).length, 1, 'HTML deve ter exatamente um </body> para não quebrar injeção de Live Server');

    const dom = mountToolDom('apiInspector/apiInspector.html', 'apiInspector/app.js');
    const doc = dom.window.document;
    assert.equal(doc.getElementById('btnVoltar').dataset.backHref, '../devTools.html');
    assert.equal(doc.getElementById('xmlInput').value, '', 'Campo XML deve iniciar vazio');
    doc.querySelector('.tab-btn[data-tab="jwt"]').click();
    doc.getElementById('jwtInput').value = fakeJwt;
    doc.getElementById('jwtInput').dispatchEvent(new dom.window.Event('input'));
    assert.match(doc.getElementById('jwtPayloadOut').textContent, /aluno_42/);

    dom.window.close();
});

await check('LgpdKitCore: módulo-11 CPF/CNPJ, mascaramento LGPD seletivo e UI', async () => {
    const Lgpd = (await import('../lgpdKit/app.js')).default;

    for (let i = 0; i < 8; i++) {
        const cpf = Lgpd.generateCPF(true);
        const cnpj = Lgpd.generateCNPJ(true);
        assert.equal(Lgpd.isValidCPF(cpf), true, `CPF gerado deveria ser válido: ${cpf}`);
        assert.equal(Lgpd.isValidCNPJ(cnpj), true, `CNPJ gerado deveria ser válido: ${cnpj}`);
    }
    assert.equal(Lgpd.isValidCPF('111.111.111-11'), false);
    assert.equal(Lgpd.isValidCNPJ('00.000.000/0000-00'), false);

    const validCpf = Lgpd.generateCPF(false);
    const validCpfFormatted = Lgpd.generateCPF(true);
    const validCnpjFormatted = Lgpd.generateCNPJ(true);

    const batch = Lgpd.validateDocumentList(`${validCpfFormatted}\n123.456.789-00\n${validCnpjFormatted}\n999`);
    assert.equal(batch.length, 4);
    assert.equal(batch[0].valid, true);
    assert.equal(batch[1].valid, false);
    assert.equal(batch[2].valid, true);
    assert.equal(batch[3].kind, '?');

    const rawText = [
        `CPF ${validCpfFormatted} e sem pontuação ${validCpf}`,
        `Matrícula 20260012345 e CNPJ ${validCnpjFormatted}`,
        'Email: rafael.reis@universidade.edu.br Tel: (11) 98765-4321',
        'Authorization: Bearer abcdef123456.token.sig IP: 192.168.10.25',
        '{"password": "segredo-super-forte"}'
    ].join('\n');

    const masked = Lgpd.maskSensitiveText(rawText, { style: 'partial', ip: true });
    assert.ok(!masked.output.includes(validCpfFormatted), 'CPF formatado deve ser mascarado');
    assert.ok(!masked.output.includes(validCpf), 'CPF numérico válido deve ser mascarado');
    assert.ok(masked.output.includes('20260012345'), 'RA/número aleatório de 11 dígitos inválido como CPF deve ser preservado');
    assert.ok(!masked.output.includes(validCnpjFormatted), 'CNPJ deve ser mascarado');
    assert.ok(!masked.output.includes('rafael.reis@universidade.edu.br'));
    assert.ok(!masked.output.includes('98765-4321'));
    assert.ok(!masked.output.includes('abcdef123456.token.sig'));
    assert.ok(!masked.output.includes('segredo-super-forte'));
    assert.ok(masked.output.includes('192.168.***.***'));

    const dom = mountToolDom('lgpdKit/lgpdKit.html', 'lgpdKit/app.js');
    const doc = dom.window.document;
    assert.equal(doc.getElementById('btnVoltar').dataset.backHref, '../devTools.html');
    doc.getElementById('maskSampleBtn').click();
    assert.ok(doc.getElementById('maskOutput').value.length > 0);
    assert.ok(!doc.getElementById('maskOutput').value.includes('joao.silva@univ.edu.br'));

    doc.querySelector('.tab-btn[data-tab="docs"]').click();
    doc.getElementById('genQty').value = '5';
    doc.getElementById('genBtn').click();
    const generated = doc.getElementById('genOutput').value.trim().split('\n');
    assert.equal(generated.length, 5);
    assert.ok(generated.every(line => Lgpd.isValidCPF(line)));

    dom.window.close();
});

console.log(`\nResumo devTools: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
    process.exit(1);
}

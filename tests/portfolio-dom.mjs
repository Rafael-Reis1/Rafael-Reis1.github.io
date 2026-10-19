/**
 * Smoke tests de comportamento da página inicial do portfólio (DOM simulado).
 * Requer jsdom: npm install
 * Executar: node tests/portfolio-dom.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

let JSDOM;
try {
    ({ JSDOM } = await import('jsdom'));
} catch (error) {
    console.log('\nℹ️  jsdom não instalado — pulando testes de DOM do portfólio.');
    console.log('   Rode "npm install" para executá-los.\n');
    process.exit(0);
}

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const appCode = fs.readFileSync(new URL('app.js', root), 'utf8');

const reposFixture = [
    {
        name: 'repo-teste',
        description: 'Descrição <img src=x onerror="window.__xss = true"> com HTML',
        html_url: 'https://github.com/Rafael-Reis1/repo-teste',
        language: 'TypeScript',
        fork: false,
        archived: false
    },
    {
        name: 'fork-ignorado',
        description: 'Fork não deve aparecer',
        html_url: 'https://github.com/Rafael-Reis1/fork-ignorado',
        language: 'JavaScript',
        fork: true,
        archived: false
    }
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
let failed = 0;

const check = async (name, fn) => {
    try {
        await fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failed++;
        console.error(`  ✗ ${name}`);
        console.error(`      ${error.message}`);
    }
};

console.log('\n🧪 Portfólio — testes de DOM\n');

const dom = new JSDOM(html, {
    url: 'https://rafael-reis1.github.io/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
});

const { window } = dom;
const { document } = window;

window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {}
});
window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
window.scrollTo = () => {};
window.fetch = async () => ({ ok: true, json: async () => reposFixture });

document.documentElement.classList.add('js');

window.eval(appCode);
document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
await wait(80);

await check('três abas e Sobre ativa inicialmente', () => {
    assert.equal(document.querySelectorAll('.navBar [role="tab"]').length, 3);
    assert.ok(document.getElementById('sobre').classList.contains('is-active'));
    assert.ok(!document.getElementById('portfolio').classList.contains('is-active'));
    assert.equal(document.getElementById('btnSobre').getAttribute('aria-selected'), 'true');
});

await check('troca de aba atualiza hash, classes e aria', () => {
    document.getElementById('btnPortfolio').click();
    assert.equal(window.location.hash, '#portfolio');
    assert.ok(document.getElementById('portfolio').classList.contains('is-active'));
    assert.ok(!document.getElementById('sobre').classList.contains('is-active'));
    assert.equal(document.getElementById('btnPortfolio').getAttribute('aria-selected'), 'true');
    assert.equal(document.getElementById('btnSobre').getAttribute('aria-selected'), 'false');
});

await check('página inicial renderiza 11 cards e contagem', () => {
    const cards = document.querySelectorAll('#bentoGrid .bento-card');
    assert.equal(cards.length, 11);
    assert.ok(cards[0].classList.contains('bento-hero'));
    assert.ok(cards[0].querySelector('.bento-card-image img'));
    assert.ok(document.getElementById('portfolioCount').textContent.includes('Mostrando 1–11 de 15 projetos'));
});

await check('descrição da API do GitHub é escapada (sem XSS)', async () => {
    const input = document.getElementById('searchInput');
    input.value = 'repo-teste';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await wait(400);

    assert.equal(window.__xss, undefined);
    assert.equal(document.querySelectorAll('#bentoGrid img[src="x"]').length, 0);
    assert.ok(document.querySelector('#bentoGrid').textContent.includes('<img src=x onerror='));

    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await wait(400);
});

await check('fork é filtrado da lista', () => {
    assert.ok(!document.querySelector('#bentoGrid').textContent.includes('fork-ignorado'));
});

await check('busca filtra por nome e ajusta contagem', async () => {
    const input = document.getElementById('searchInput');
    input.value = 'biblioteca';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await wait(400);

    assert.equal(document.querySelectorAll('#bentoGrid .bento-card').length, 1);
    assert.ok(document.getElementById('portfolioCount').textContent.includes('Mostrando 1–1 de 1 projeto'));
});

await check('busca sem resultado mostra estado vazio', async () => {
    const input = document.getElementById('searchInput');
    input.value = 'zzzz-nao-existe';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await wait(400);

    assert.equal(document.querySelectorAll('#bentoGrid .bento-card').length, 0);
    assert.ok(document.querySelector('#bentoGrid .empty-projects'));
});

await check('paginação navega para a segunda página', async () => {
    const input = document.getElementById('searchInput');
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await wait(400);

    const page2 = [...document.querySelectorAll('#paginationRepos .page-btn')]
        .find((button) => button.textContent === '2');
    assert.ok(page2, 'botão da página 2 não encontrado');

    page2.click();
    assert.equal(document.querySelectorAll('#bentoGrid .bento-card').length, 4);
    assert.ok(document.getElementById('portfolioCount').textContent.includes('Mostrando 12–15 de 15 projetos'));
});

await check('modal abre com iframe sob demanda e fecha no Escape', () => {
    document.getElementById('btnCurriculoDownload').click();
    const modal = document.getElementById('curriculoLive');
    const iframe = document.getElementById('actualCurriculoIframe');

    assert.ok(modal.classList.contains('show'));
    assert.ok(document.getElementById('overlay').classList.contains('show'));
    assert.equal(iframe.getAttribute('src'), 'Curriculo/Curriculo.html');
    assert.equal(document.activeElement, document.getElementById('closeButton'));

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    assert.ok(!modal.classList.contains('show'));
    assert.ok(!document.documentElement.classList.contains('modal-open'));
});

await check('navegação por teclado entre abas', () => {
    const sobre = document.getElementById('btnSobre');
    sobre.focus();
    sobre.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    assert.equal(document.getElementById('btnCurriculo').getAttribute('aria-selected'), 'true');
    assert.ok(document.getElementById('curriculo').classList.contains('is-active'));
});

await check('currículo tem resumo, competências, idiomas e CTA de download', () => {
    const section = document.getElementById('curriculo');
    const headings = [...section.querySelectorAll('h3')]
        .map((heading) => heading.textContent.trim());

    assert.deepEqual(headings, ['Resumo', 'Experiência', 'Educação', 'Competências', 'Idiomas']);
    assert.ok(section.querySelector('.cv-summary-text').textContent.includes('Engenheiro de Software'));
    assert.ok(section.querySelector('.cv-chips'));
    assert.ok(section.querySelector('.cv-languages'));
    assert.equal(
        section.querySelector('.cv-download #btnCurriculoDownload').getAttribute('href'),
        'Curriculo/Curriculo.html'
    );
    assert.equal(
        section.querySelector('.cv-rail').getAttribute('aria-label'),
        'Competências, idiomas e download do currículo'
    );
});

await check('deep link #curriculo ativa a aba correta', () => {
    window.history.pushState(null, '', '#curriculo');
    window.dispatchEvent(new window.Event('popstate'));

    assert.ok(document.getElementById('curriculo').classList.contains('is-active'));
    assert.equal(document.getElementById('btnCurriculo').getAttribute('aria-selected'), 'true');
});

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passaram, ${failed} falharam\n`);
process.exit(failed === 0 ? 0 : 1);

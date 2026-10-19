/**
 * Testes de regressão do Reading Manager.
 * Executar com: node reading/tests/run.mjs
 */
import assert from 'node:assert/strict';

import { processBookStats, calculateReadingStreaks, migrateLegacyHistory } from '../js/services/statsService.js';
import { toFirestorePayload, normalizeImportedBook, rm } from '../js/store/readingManager.js';

let passed = 0;
let failed = 0;

const test = async (name, fn) => {
    try {
        await fn();
        passed++;
        console.log(`  \u2713 ${name}`);
    } catch (error) {
        failed++;
        console.error(`  \u2717 ${name}`);
        console.error(`      ${error.message}`);
    }
};

const makeBook = (overrides = {}) => ({
    id: 'b1',
    title: 'Livro de Teste',
    author: 'Autora',
    pages: 300,
    status: 'read',
    readDate: '2024-05-10',
    timesRead: 0,
    tags: [],
    history: [],
    notes: [],
    ...overrides
});

const DATE_KEY = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

console.log('\n\uD83D\uDCDA Reading Manager \u2014 testes\n');

await test('paginômetro soma páginas de um ciclo completo', () => {
    const book = makeBook({
        history: [
            { id: 's', date: '2024-05-01', type: 'start', page: 0 },
            { id: 'p', date: '2024-05-05', type: 'progress', page: 100 },
            { id: 'f', date: '2024-05-10', type: 'finish', page: 300 }
        ]
    });

    processBookStats(book);

    assert.equal(book.computed.totalReadPages, 300);
    assert.equal(book.computed.activityByYear['2024'].finishes, 1);
    const heatmapTotal = Object.values(book.computed.heatmapDays).reduce((sum, pages) => sum + pages, 0);
    assert.equal(heatmapTotal, 300);
});

await test('releitura conta as páginas de cada ciclo', () => {
    const book = makeBook({
        history: [
            { id: 's1', date: '2023-01-01', type: 'start', page: 0 },
            { id: 'f1', date: '2023-01-20', type: 'finish', page: 300 },
            { id: 's2', date: '2024-01-01', type: 'start', page: 0 },
            { id: 'p2', date: '2024-01-05', type: 'progress', page: 50 },
            { id: 'f2', date: '2024-01-10', type: 'finish', page: 300 }
        ]
    });

    processBookStats(book);

    assert.equal(book.computed.totalReadPages, 600);
    assert.equal(book.computed.activityByYear['2023'].finishes, 1);
    assert.equal(book.computed.activityByYear['2024'].finishes, 1);
});

await test('voltar páginas não gera diff negativo nem reduz o total', () => {
    const book = makeBook({
        status: 'reading',
        readDate: null,
        history: [
            { id: 's', date: '2024-05-01', type: 'start', page: 0 },
            { id: 'p1', date: '2024-05-02', type: 'progress', page: 100 },
            { id: 'p2', date: '2024-05-03', type: 'progress', page: 80 }
        ]
    });

    processBookStats(book);

    assert.equal(book.computed.totalReadPages, 100);
});

await test('histórico com datas inválidas não quebra o cálculo', () => {
    const book = makeBook({
        readDate: null,
        status: 'reading',
        history: [
            { id: 'a', type: 'progress', page: 10 },
            { id: 'b', type: 'progress', page: 50, date: 'data-invalida' },
            { id: 'c', type: 'finish', page: 300, date: '2024-99-99' }
        ]
    });

    processBookStats(book);

    assert.equal(book.computed.totalReadPages, 300);
    assert.deepEqual(book.computed.heatmapDays, {});
});

await test('registros migrados/sintéticos não entram no heatmap', () => {
    const book = makeBook({
        readDate: null,
        history: [
            { id: 'MIGRATED_ST_1', date: '2020-01-01', type: 'start', page: 0, migrated: true },
            { id: 'MIGRATED_FI_1', date: '2020-01-02', type: 'finish', page: 300, migrated: true }
        ]
    });

    processBookStats(book);

    assert.equal(book.computed.totalReadPages, 300);
    assert.deepEqual(book.computed.heatmapDays, {});
    assert.equal(book.computed.activityByYear['Desconhecido'].pages, 300);
});

await test('ciclo atual não conta o que veio antes da última conclusão', () => {
    const book = makeBook({
        status: 're-reading',
        readPages: 80,
        readDate: '2023-01-10',
        history: [
            { id: 's1', date: '2023-01-01', type: 'start', page: 0 },
            { id: 'p1', date: '2023-01-05', type: 'progress', page: 120 },
            { id: 'f1', date: '2023-01-10', type: 'finish', page: 300 },
            { id: 's2', date: '2024-01-01', type: 'start', page: 0 },
            { id: 'p2', date: '2024-01-02', type: 'progress', page: 80 }
        ]
    });

    processBookStats(book);

    assert.equal(book.computed.currentCycleReadPages, 80);
    assert.equal(book.computed.currentCycleActiveDays, 1);
});

await test('streak conta dias consecutivos até hoje', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const dailyPages = {
        [DATE_KEY(twoDaysAgo)]: 10,
        [DATE_KEY(yesterday)]: 20,
        [DATE_KEY(today)]: 30
    };

    const streak = calculateReadingStreaks(dailyPages);

    assert.equal(streak.currentStreak, 3);
    assert.equal(streak.longestStreak, 3);
    assert.equal(streak.activeDays, 3);
    assert.equal(streak.avgPagesPerActiveDay, 20);
});

await test('migração não marca mais leituras reais de janeiro/2026 como sintéticas', async () => {
    const store = {
        books: [{
            id: 'b1',
            status: 'reading',
            pages: 100,
            history: [{ id: 'h1', date: '2026-01-15T12:00:00.000Z', page: 10, type: 'progress' }]
        }],
        updateMultipleCalls: [],
        async updateMultiple(updates) { this.updateMultipleCalls.push(updates); }
    };

    await migrateLegacyHistory(store);

    assert.equal(store.updateMultipleCalls.length, 0);
    assert.equal(store.books[0].history[0].migrated, undefined);
});

await test('migração cria histórico sintético para livro lido sem registros', async () => {
    const store = {
        books: [{ id: 'b2', status: 'read', pages: 200, readDate: '2024-03-01', history: [] }],
        updateMultipleCalls: [],
        async updateMultiple(updates) { this.updateMultipleCalls.push(updates); }
    };

    await migrateLegacyHistory(store);

    assert.equal(store.updateMultipleCalls.length, 1);
    const history = store.updateMultipleCalls[0].b2.history;
    assert.equal(history.length, 2);
    assert.equal(history[0].migrated, true);
    assert.equal(history[1].type, 'finish');
});

await test('toFirestorePayload remove campos derivados e indefinidos', () => {
    const payload = toFirestorePayload({
        title: 'Livro',
        computed: { totalReadPages: 10 },
        _tempPagesInPeriod: 5,
        notes: undefined,
        pages: 0
    });

    assert.deepEqual(payload, { title: 'Livro', pages: 0 });
});

await test('normalizeImportedBook valida e normaliza um backup', () => {
    const book = normalizeImportedBook({
        title: '  Duna  ',
        author: 'Frank Herbert',
        pages: '412',
        status: 'status-invalido',
        readPages: 9999,
        rating: 7,
        history: [
            { date: '', page: 5 },
            { date: '2020-01-01', page: 10, type: 'inventado' },
            { date: '2020-01-02', page: 20, type: 'finish', note: 'fim' }
        ],
        notes: [{ content: '  ' }, { content: 'Citação', location: 'p. 42' }]
    });

    assert.equal(book.title, 'Duna');
    assert.equal(book.pages, 412);
    assert.equal(book.status, 'want-to-read');
    assert.equal(book.rating, 5);
    assert.equal(book.readPages, 412);
    assert.equal(book.history.length, 2);
    assert.equal(book.history[0].type, 'progress');
    assert.equal(book.history[1].note, 'fim');
    assert.equal(book.notes.length, 1);
    assert.ok(book.id);
});

await test('normalizeImportedBook descarta registros sem título', () => {
    assert.equal(normalizeImportedBook({ author: 'Sem título' }), null);
    assert.equal(normalizeImportedBook(null), null);
    assert.equal(normalizeImportedBook('texto'), null);
});

await test('importação exige usuário autenticado e não apaga nada antes de validar', async () => {
    await assert.rejects(() => rm.import({ books: [] }, true), /autenticado/i);
    await assert.rejects(() => rm.import({ books: [] }), /Nenhum livro válido|autenticado/i);
});

await test('token de compartilhamento é impossível de adivinhar', () => {
    const token = rm.generateShareToken();
    assert.match(token, /^[A-Za-z0-9-]{16,64}$/);
    assert.notEqual(token, rm.generateShareToken());
});

await test('snapshot público de lista não vaza notas nem empréstimos', () => {
    const originalUid = rm.currentUid;
    const originalBooks = rm.books;
    const originalLists = rm.lists;

    try {
        rm.currentUid = () => 'uid_teste';
        rm.books = [
            {
                id: 'b1',
                title: 'Como Cultivar uma Vida de Leitura',
                author: 'C.S. Lewis',
                cover: 'https://exemplo.com/capa.jpg',
                status: 'read',
                rating: 5,
                pages: 200,
                readPages: 200,
                series: 'Vida',
                seriesNumber: 1,
                genre: 'Ensaios',
                customLists: ['list_1'],
                notes: [{ content: 'anotação privada' }],
                loanDetails: 'Emprestado para Fulano',
                loanDate: '2026-01-01'
            },
            { id: 'b2', title: 'Fora da lista', customLists: [] }
        ];
        rm.lists = [{ id: 'list_1', name: 'Favoritos', bookOrder: ['b1'] }];

        const snapshot = rm.buildSharedListSnapshot(rm.lists[0], 'token_teste');

        assert.equal(snapshot.ownerUid, 'uid_teste');
        assert.equal(snapshot.name, 'Favoritos');
        assert.equal(snapshot.books.length, 1);
        assert.deepEqual(snapshot.bookOrder, ['b1']);
        assert.deepEqual(
            Object.keys(snapshot.books[0]).sort(),
            ['author', 'cover', 'genre', 'id', 'pages', 'rating', 'readPages', 'series', 'seriesNumber', 'status', 'title'].sort()
        );
        assert.equal(snapshot.books[0].notes, undefined);
        assert.equal(snapshot.books[0].loanDetails, undefined);
    } finally {
        rm.currentUid = originalUid;
        rm.books = originalBooks;
        rm.lists = originalLists;
    }
});

await test('publicar lista sem login não cria link', async () => {
    assert.equal(await rm.publishSharedList('list_1', { create: true }), null);
});

console.log(`\n${failed === 0 ? '\u2705' : '\u274C'} ${passed} passaram, ${failed} falharam\n`);
process.exit(failed === 0 ? 0 : 1);

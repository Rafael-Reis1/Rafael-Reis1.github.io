/**
 * Testes de regressão do Finance Manager.
 * Executar com: node finance/tests/run.mjs
 */
import assert from 'node:assert/strict';

import { FinanceManager } from '../js/store/financeManager.js';
import { StatsView } from '../js/ui/statsView.js';
import { toDateString } from '../js/utils/helpers.js';

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

const round2 = (value) => Math.round(value * 100) / 100;

console.log('\n\uD83D\uDCB0 Finance Manager \u2014 testes\n');

await test('_parseAmount entende formato brasileiro e decimal simples', () => {
    const fm = new FinanceManager();

    assert.equal(fm._parseAmount('1.234,56'), 1234.56);
    assert.equal(fm._parseAmount('1234.56'), 1234.56);
    assert.equal(fm._parseAmount('R$ 10,50'), 10.5);
    assert.equal(fm._parseAmount(42), 42);
    assert.ok(Number.isNaN(fm._parseAmount('abc')));
});

await test('_sanitizeImportedTransaction valida e normaliza', () => {
    const fm = new FinanceManager();

    const valid = fm._sanitizeImportedTransaction({
        description: '  Mercado  ',
        amount: '1.234,56',
        date: '2026-02-10',
        type: 'expense',
        category: 'alimentacao',
        isPaid: true
    });

    assert.equal(valid.description, 'Mercado');
    assert.equal(valid.amount, 1234.56);
    assert.equal(valid.date, '2026-02-10');
    assert.equal(valid.isPaid, true);
    assert.ok(valid.id);

    assert.equal(fm._sanitizeImportedTransaction({ amount: 10, date: '2026-02-10', type: 'expense' }), null);
    assert.equal(fm._sanitizeImportedTransaction({ description: 'X', amount: 0, date: '2026-02-10', type: 'expense' }), null);
    assert.equal(fm._sanitizeImportedTransaction({ description: 'X', amount: 10, date: '2026-13-40', type: 'expense' }), null);
    assert.equal(fm._sanitizeImportedTransaction({ description: 'X', amount: 10, date: '2026-02-10', type: 'outro' }), null);
});

await test('_sanitizeImportedTransaction descarta ids com barra e aplica categoria padrão', () => {
    const fm = new FinanceManager();

    const transaction = fm._sanitizeImportedTransaction({
        id: '../malicioso',
        description: 'Sem categoria',
        amount: '10,00',
        date: '2026-02-10',
        type: 'income'
    });

    assert.ok(!transaction.id.includes('/'));
    assert.equal(transaction.category, 'outros_receita');
});

await test('_sanitizeImportedSubscription valida dia e valor', () => {
    const fm = new FinanceManager();

    const valid = fm._sanitizeImportedSubscription({
        name: 'Streaming', amount: '29,90', day: 10, type: 'expense'
    });

    assert.equal(valid.name, 'Streaming');
    assert.equal(valid.amount, 29.9);
    assert.equal(valid.day, 10);
    assert.equal(valid.active, true);

    assert.equal(fm._sanitizeImportedSubscription({ name: 'X', amount: 10, day: 32 }), null);
    assert.equal(fm._sanitizeImportedSubscription({ name: 'X', amount: 0, day: 10 }), null);
});

await test('parcelamento divide o valor, ajusta o arredondamento e mantém o total', () => {
    const fm = new FinanceManager();

    fm.add({
        description: 'Compra parcelada',
        amount: 1000,
        date: '2026-01-31',
        type: 'expense',
        category: 'compras',
        installments: 3
    });

    assert.equal(fm.transactions.length, 3);
    assert.deepEqual(
        fm.transactions.map(t => t.date),
        ['2026-01-31', '2026-02-28', '2026-03-31']
    );
    assert.equal(round2(fm.transactions.reduce((sum, t) => sum + t.amount, 0)), 1000);
    assert.equal(fm.transactions[0].installmentCurrent, 1);
    assert.equal(fm.transactions[2].installmentTotal, 3);
    assert.ok(fm.transactions[0].groupId);
    assert.equal(fm.transactions[0].groupId, fm.transactions[1].groupId);
});

await test('parcelamento distribui a sobra dos centavos na primeira parcela', () => {
    const fm = new FinanceManager();

    fm.add({
        description: 'Três vezes',
        amount: 100,
        date: '2026-03-10',
        type: 'expense',
        category: 'compras',
        installments: 3
    });

    assert.deepEqual(fm.transactions.map(t => t.amount), [33.34, 33.33, 33.33]);
    assert.equal(round2(fm.transactions.reduce((sum, t) => sum + t.amount, 0)), 100);
});

await test('deleteSeries("future") remove as próximas e renumera as restantes', () => {
    const fm = new FinanceManager();
    fm.transactions = [
        { id: 'a', description: 'Curso (1/3)', date: '2026-01-05', amount: 100, groupId: 'g1', installmentCurrent: 1, installmentTotal: 3 },
        { id: 'b', description: 'Curso (2/3)', date: '2026-02-05', amount: 100, groupId: 'g1', installmentCurrent: 2, installmentTotal: 3 },
        { id: 'c', description: 'Curso (3/3)', date: '2026-03-05', amount: 100, groupId: 'g1', installmentCurrent: 3, installmentTotal: 3 }
    ];

    const success = fm.deleteSeries('g1', 'future', '2026-02-01');

    assert.equal(success, true);
    assert.equal(fm.transactions.length, 1);
    assert.equal(fm.transactions[0].id, 'a');
    assert.equal(fm.transactions[0].description, 'Curso (1/1)');
    assert.equal(fm.transactions[0].installmentTotal, 1);
});

await test('getFilteredView soma receitas, despesas e vencidas', () => {
    const fm = new FinanceManager();
    const today = toDateString(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    fm.transactions = [
        { id: '1', description: 'Salário', amount: 200, date: today, type: 'income', category: 'salario', isPaid: true },
        { id: '2', description: 'Mercado', amount: 100, date: today, type: 'expense', category: 'alimentacao', isPaid: true },
        { id: '3', description: 'Conta atrasada', amount: 50, date: toDateString(yesterday), type: 'expense', category: 'moradia', isPaid: false }
    ];

    const view = fm.getFilteredView({});

    assert.equal(view.summary.income, 200);
    assert.equal(view.summary.expense, 150);
    assert.equal(view.summary.balance, 50);
    assert.equal(view.summary.overdueExpenses, 50);
    assert.equal(view.visible.length, 3);
});

await test('getBalance ignora despesa vencida ainda não paga', () => {
    const fm = new FinanceManager();
    const today = toDateString(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    fm.transactions = [
        { id: '1', description: 'Entrada', amount: 200, date: today, type: 'income', category: 'salario', isPaid: true },
        { id: '2', description: 'Paga', amount: 100, date: today, type: 'expense', category: 'alimentacao', isPaid: true },
        { id: '3', description: 'Atrasada', amount: 50, date: toDateString(yesterday), type: 'expense', category: 'moradia', isPaid: false }
    ];

    assert.equal(fm.getBalance(), 100);
});

await test('import (replace) grava, conta e reporta inválidos', async () => {
    const fm = new FinanceManager();

    const result = await fm.import({
        transactions: [
            { description: 'Válida', amount: '10,00', date: '2026-01-10', type: 'expense' },
            { description: 'Também válida', amount: '20,00', date: '2026-01-11', type: 'income' },
            { description: '', amount: '30,00', date: '2026-01-12', type: 'expense' }
        ]
    }, true);

    assert.equal(result.imported, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.total, 2);
    assert.equal(fm.transactions.length, 2);
});

await test('import (merge) não duplica ids existentes', async () => {
    const fm = new FinanceManager();
    fm.transactions = [{ id: 'fixo', description: 'Já existe', amount: 5, date: '2026-01-01', type: 'expense', category: 'outros' }];

    const result = await fm.import({
        transactions: [
            { id: 'fixo', description: 'Já existe', amount: 5, date: '2026-01-01', type: 'expense' },
            { id: 'novo', description: 'Nova', amount: 7, date: '2026-01-02', type: 'expense' }
        ]
    }, false);

    assert.equal(result.imported, 1);
    assert.equal(fm.transactions.length, 2);
});

await test('export inclui versão, configurações e transações', async () => {
    const fm = new FinanceManager();
    fm.transactions = [{ id: '1', description: 'X', amount: 10, date: '2026-01-01', type: 'expense' }];

    const data = await fm.export();

    assert.equal(data.version, '1.2');
    assert.equal(data.transactions.length, 1);
    assert.deepEqual(data.subscriptions, []);
    assert.equal(data.settings.budgetTargetPct, 80);
});

await test('clear() zera transações, assinaturas e configurações', () => {
    const fm = new FinanceManager();
    fm.transactions = [{ id: '1' }];
    fm.subscriptions = [{ id: 's1' }];
    fm.settings = { emailNotifications: false, budgetTargetPct: 30 };

    fm.clear();

    assert.deepEqual(fm.transactions, []);
    assert.deepEqual(fm.subscriptions, []);
    assert.equal(fm.settings.budgetTargetPct, 80);
    assert.equal(fm.settings.emailNotifications, true);
});

await test('assinaturas geram os meses pulados (backfill)', () => {
    const fm = new FinanceManager();
    const sub = {
        id: 's1', name: 'Streaming', amount: 29.9, day: 10,
        type: 'expense', category: 'lazer', active: true,
        lastGenerated: '2026-01'
    };

    const { transactions, lastGenerated } = fm.buildMissingSubscriptionCharges(
        sub, [], new Date(2026, 3, 15)
    );

    assert.equal(transactions.length, 3);
    assert.deepEqual(transactions.map(t => t.date), ['2026-02-10', '2026-03-10', '2026-04-10']);
    assert.equal(lastGenerated, '2026-04');
    assert.ok(transactions.every(t => t.isPaid === false && t.subscriptionId === 's1' && t.isRecurring === true));
});

await test('backfill não duplica mês que já tem lançamento da assinatura', () => {
    const fm = new FinanceManager();
    const sub = {
        id: 's1', name: 'Streaming', amount: 29.9, day: 10,
        type: 'expense', category: 'lazer', active: true,
        lastGenerated: '2026-01'
    };

    const existing = [{ id: 'x', subscriptionId: 's1', date: '2026-03-10' }];
    const { transactions } = fm.buildMissingSubscriptionCharges(sub, existing, new Date(2026, 3, 15));

    assert.deepEqual(transactions.map(t => t.date), ['2026-02-10', '2026-04-10']);
});

await test('backfill ajusta o dia para o último dia do mês', () => {
    const fm = new FinanceManager();
    const sub = {
        id: 's1', name: 'Aluguel', amount: 1500, day: 31,
        type: 'expense', category: 'moradia', active: true,
        lastGenerated: '2026-01'
    };

    const { transactions } = fm.buildMissingSubscriptionCharges(sub, [], new Date(2026, 1, 15));

    assert.deepEqual(transactions.map(t => t.date), ['2026-02-28']);
});

await test('backfill é limitado a 24 meses', () => {
    const fm = new FinanceManager();
    const sub = {
        id: 's1', name: 'Antiga', amount: 10, day: 5,
        type: 'expense', category: 'outros', active: true,
        lastGenerated: '2020-01'
    };

    const { transactions, lastGenerated } = fm.buildMissingSubscriptionCharges(sub, [], new Date(2026, 1, 15));

    assert.equal(transactions.length, 24);
    assert.equal(transactions[0].date.slice(0, 7), '2024-03');
    assert.equal(transactions[transactions.length - 1].date.slice(0, 7), '2026-02');
    assert.equal(lastGenerated, '2026-02');
});

await test('backfill usa a data de criação quando não há lastGenerated', () => {
    const fm = new FinanceManager();
    const sub = {
        id: 's1', name: 'Legado', amount: 20, day: 15,
        type: 'expense', category: 'outros', active: true,
        lastGenerated: '',
        createdAt: '2025-12-15T12:00:00.000Z'
    };

    const { transactions } = fm.buildMissingSubscriptionCharges(sub, [], new Date(2026, 1, 20));

    assert.deepEqual(transactions.map(t => t.date), ['2025-12-15', '2026-01-15', '2026-02-15']);
});

await test('backfill não gera meses futuros e ignora assinatura inativa', () => {
    const fm = new FinanceManager();
    const future = {
        id: 's1', name: 'Futuro', amount: 20, day: 5,
        type: 'expense', category: 'outros', active: true,
        lastGenerated: '2026-12'
    };
    const inactive = {
        id: 's2', name: 'Cancelada', amount: 20, day: 5,
        type: 'expense', category: 'outros', active: false,
        lastGenerated: '2025-01'
    };

    const futureResult = fm.buildMissingSubscriptionCharges(future, [], new Date(2026, 1, 15));
    const inactiveResult = fm.buildMissingSubscriptionCharges(inactive, [], new Date(2026, 1, 15));

    assert.equal(futureResult.transactions.length, 0);
    assert.equal(futureResult.lastGenerated, '2026-02');
    assert.equal(inactiveResult.transactions.length, 0);
    assert.equal(inactiveResult.lastGenerated, null);
});

await test('StatsView formata valores e datas sem depender do DOM', () => {
    const view = Object.create(StatsView.prototype);

    assert.ok(view.formatCurrency(1234.5).includes('1.234,50'));
    assert.equal(view.formatDateBR('2026-02-10'), '10/02/2026');
    assert.equal(view.getMonthName(0), 'Janeiro');
    assert.equal(view.escapeHtml('<b>'), '&lt;b&gt;');
});

await test('StatsView usa a meta do manager e cai no padrão 80 sem dados', () => {
    const view = Object.create(StatsView.prototype);
    view.fm = { getBudgetTargetPct: () => 65 };

    assert.equal(view.getBudgetTargetPct(), 65);
    assert.equal(Object.create(StatsView.prototype).getBudgetTargetPct(), 80);
});

console.log(`\n${failed === 0 ? '\u2705' : '\u274C'} ${passed} passaram, ${failed} falharam\n`);
process.exit(failed === 0 ? 0 : 1);

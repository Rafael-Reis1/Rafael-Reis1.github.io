import { auth, db, firebase } from '../services/firebase.js';
import { normalize, parseDateOnly, getYearMonth, todayString, tomorrowString, toDateString } from '../utils/helpers.js';

export class FinanceManager {
    constructor() {
        this.transactions = [];
        this.subscriptions = [];
        this._hasPendingChanges = false;
        this.unsubscribeListener = null;
        this.unsubscribeSubsListener = null;
        this.onSubsUpdateCallback = null;
        this.excludedCategories = new Set();
        this.excludedIncomeCategories = new Set();
        // `emailNotifications` é consumido pelas Cloud Functions de envio (fora deste repositório).
        this.settings = { emailNotifications: true, budgetTargetPct: 80 };
    }

    async fetchSettings(uid) {
        try {
            const doc = await db.collection('finance_data').doc(uid).get();
            if (doc.exists && doc.data().settings) {
                this.settings = { ...this.settings, ...doc.data().settings };
                if (this.settings.budgetTargetPct) {
                    try {
                        localStorage.setItem('finance_budget_target_pct', String(this.settings.budgetTargetPct));
                    } catch (e) {}
                }
            }
        } catch (e) {
            console.error('Error fetching settings:', e);
        }
    }

    getSettings() {
        return this.settings;
    }

    getBudgetTargetPct() {
        const fromSettings = Number(this.settings?.budgetTargetPct);
        if (fromSettings >= 10 && fromSettings <= 100) return fromSettings;
        try {
            const fromLocal = Number(localStorage.getItem('finance_budget_target_pct'));
            if (fromLocal >= 10 && fromLocal <= 100) return fromLocal;
        } catch (e) {}
        return 80;
    }

    async setBudgetTargetPct(pct) {
        const cleanPct = Math.max(10, Math.min(100, Math.round(Number(pct) || 80)));
        this.settings = { ...this.settings, budgetTargetPct: cleanPct };
        try {
            localStorage.setItem('finance_budget_target_pct', String(cleanPct));
        } catch (e) {}

        if (this.currentUid()) {
            try {
                await db.collection('finance_data').doc(this.currentUid()).set({
                    settings: { budgetTargetPct: cleanPct }
                }, { merge: true });
            } catch (e) {
                console.error('Erro ao salvar meta de orçamento no Firebase:', e);
            }
        }
        return cleanPct;
    }

    async toggleEmailNotifications() {
        if (!this.currentUid()) return;

        const newValue = !this.settings.emailNotifications;
        this.settings.emailNotifications = newValue;

        try {
            await db.collection('finance_data').doc(this.currentUid()).set({
                settings: { emailNotifications: newValue }
            }, { merge: true });
            return newValue;
        } catch (e) {
            console.error('Error saving settings:', e);
            this.settings.emailNotifications = !newValue;
            throw e;
        }
    }

    async setEmailNotifications(enabled) {
        if (!this.currentUid()) return;
        this.settings.emailNotifications = enabled;
        try {
            await db.collection('finance_data').doc(this.currentUid()).set({
                settings: { emailNotifications: enabled }
            }, { merge: true });
        } catch (e) {
            console.error('Error saving settings:', e);
            throw e;
        }
    }

    async initListener(user, onUpdateCallback) {
        if (!user) return;

        await this.migrateLegacyData(user);

        this.stopListener();

        await this.fetchSettings(user.uid);

        const transactionsRef = db.collection('finance_data').doc(user.uid).collection('transactions');

        this.unsubscribeListener = transactionsRef.onSnapshot((snapshot) => {
            this.transactions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            if (onUpdateCallback) onUpdateCallback();
        }, (error) => {
            console.error('Erro no Listener de Transações:', error);
        });

        const subsRef = db.collection('finance_data').doc(user.uid).collection('subscriptions');

        this.unsubscribeSubsListener = subsRef.onSnapshot((snapshot) => {
            this.subscriptions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            if (this.onSubsUpdateCallback) this.onSubsUpdateCallback();
        }, (error) => {
            console.error('Erro no Listener de Assinaturas:', error);
        });
    }

    stopListener() {
        if (this.unsubscribeListener) {
            this.unsubscribeListener();
            this.unsubscribeListener = null;
        }
        this.stopSubscriptionsListener();
    }

    stopSubscriptionsListener() {
        if (this.unsubscribeSubsListener) {
            this.unsubscribeSubsListener();
            this.unsubscribeSubsListener = null;
        }
    }

    get hasPendingChanges() {
        return this._hasPendingChanges;
    }

    set hasPendingChanges(value) {
        this._hasPendingChanges = value;
    }

    load() {
        this.transactions = [];
    }

    clear() {
        this.transactions = [];
        this.subscriptions = [];
        this.settings = { emailNotifications: true, budgetTargetPct: 80 };
        this.hasPendingChanges = false;
    }

    async migrateLegacyData(user) {
        if (!user) return;
        const userRef = db.collection('finance_data').doc(user.uid);

        try {
            const doc = await userRef.get();
            if (doc.exists && doc.data().transactions && Array.isArray(doc.data().transactions)) {
                const legacyTransactions = doc.data().transactions;
                const total = legacyTransactions.length;

                if (total === 0) return;

                for (let i = 0; i < total; i += 500) {
                    const chunk = legacyTransactions.slice(i, i + 500);
                    const batch = db.batch();

                    chunk.forEach(t => {
                        if (!t || typeof t !== 'object') return;

                        const data = { ...t };
                        delete data.id;
                        Object.keys(data).forEach(key => {
                            if (data[key] === undefined) delete data[key];
                        });

                        const docId = (typeof t.id === 'string' && t.id) ? t.id : this.generateId();
                        const ref = userRef.collection('transactions').doc(docId);
                        batch.set(ref, data);
                    });

                    await batch.commit();
                }

                await userRef.update({
                    transactions: firebase.firestore.FieldValue.delete(),
                    migratedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (e) {
            console.error('Erro na migração:', e);
        }
    }



    getAll() {
        return [...this.transactions].sort((a, b) => {
            const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
            if (dateCompare !== 0) return dateCompare;
            return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        });
    }

    get(id) {
        return this.transactions.find(t => t.id === id);
    }

    add(transaction, onSyncError = null, onOffline = null) {
        let transactionsToAdd = [];
        const installments = transaction.installments || 1;
        const groupId = installments > 1 ? this.generateId() : null;

        if (installments > 1) {
            const baseDate = parseDateOnly(transaction.date) || new Date();
            const installmentValue = Math.round((transaction.amount / installments) * 100) / 100;
            const totalCalculated = installmentValue * installments;
            const diff = Math.round((transaction.amount - totalCalculated) * 100) / 100;

            for (let i = 0; i < installments; i++) {
                const originalDay = baseDate.getDate();
                const currentMonth = baseDate.getMonth();
                const targetMonth = currentMonth + i;

                const y = baseDate.getFullYear() + Math.floor(targetMonth / 12);
                const m = targetMonth % 12;

                const daysInMonth = new Date(y, m + 1, 0).getDate();

                const targetDay = Math.min(originalDay, daysInMonth);

                const mFormatted = String(m + 1).padStart(2, '0');
                const dFormatted = String(targetDay).padStart(2, '0');
                const dateStr = `${y}-${mFormatted}-${dFormatted}`;

                let amount = installmentValue;
                if (i === 0 && diff !== 0) amount += diff;
                // Evita artefatos de ponto flutuante (ex.: 33.339999999999996).
                amount = Math.round(amount * 100) / 100;

                transactionsToAdd.push({
                    id: this.generateId(),
                    ...transaction,
                    amount: amount,
                    description: `${transaction.description} (${i + 1}/${installments})`,
                    date: dateStr,
                    groupId: groupId,
                    installmentCurrent: i + 1,
                    installmentTotal: installments,
                    isPaid: false,
                    createdAt: new Date().toISOString()
                });
            }
        } else {
            transactionsToAdd.push({
                id: this.generateId(),
                ...transaction,
                isPaid: false,
                createdAt: new Date().toISOString()
            });
        }

        this.transactions.push(...transactionsToAdd);

        if (this.currentUid()) {
            const batch = db.batch();
            const userRef = db.collection('finance_data').doc(this.currentUid()).collection('transactions');

            transactionsToAdd.forEach(t => {
                const ref = userRef.doc(t.id);
                batch.set(ref, t);
            });

            if (navigator.onLine) {
                batch.commit().catch(() => {
                    this.hasPendingChanges = true;
                    if (onSyncError) onSyncError();
                });
            } else {
                batch.commit().catch(() => {
                    this.hasPendingChanges = true;
                });
                if (onOffline) onOffline();
            }
        }

        return transactionsToAdd[0];
    }

    update(id, data, onSyncError = null, onOffline = null) {
        const index = this.transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            this.transactions[index] = { ...this.transactions[index], ...data };
            const updatedTransaction = this.transactions[index];

            if (this.currentUid()) {
                const ref = db.collection('finance_data').doc(this.currentUid())
                    .collection('transactions').doc(id);

                ref.update(data).catch((e) => {
                    console.error(e);
                    if (onSyncError) onSyncError();
                });

                if (!navigator.onLine && onOffline) onOffline();
            }
            return updatedTransaction;
        }
        return null;
    }

    delete(id, onSyncError = null, onOffline = null) {
        return this.deleteSeries(null, 'single', null, id, onSyncError, onOffline);
    }

    deleteSeries(groupId, mode, referenceDate = null, id = null, onSyncError = null, onOffline = null) {
        let transactionsToDelete = [];

        if (mode === 'single') {
            const t = this.get(id);
            if (t) transactionsToDelete.push(t);
        } else if (mode === 'future') {
            transactionsToDelete = this.transactions.filter(t => t.groupId === groupId && t.date >= referenceDate);
        } else if (mode === 'all') {
            transactionsToDelete = this.transactions.filter(t => t.groupId === groupId);
        }

        if (transactionsToDelete.length === 0) return false;

        const idsToDelete = new Set(transactionsToDelete.map(t => t.id));

        let remainingTransactions = [];
        if (groupId && mode !== 'all') {
            remainingTransactions = this.transactions
                .filter(t => t.groupId === groupId && !idsToDelete.has(t.id))
                .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
        }

        this.transactions = this.transactions.filter(t => !idsToDelete.has(t.id));

        const updatesToRemaining = [];
        if (remainingTransactions.length > 0) {
            const newTotal = remainingTransactions.length;
            remainingTransactions.forEach((t, index) => {
                const newCurrent = index + 1;
                
                const baseDescription = t.description.replace(/\s*\(\d+\/\d+\)$/, '');
                const newDescription = `${baseDescription} (${newCurrent}/${newTotal})`;

                t.description = newDescription;
                t.installmentCurrent = newCurrent;
                t.installmentTotal = newTotal;

                updatesToRemaining.push({
                    id: t.id,
                    description: newDescription,
                    installmentCurrent: newCurrent,
                    installmentTotal: newTotal
                });
            });
        }

        if (this.currentUid()) {
            const batch = db.batch();
            const userRef = db.collection('finance_data').doc(this.currentUid()).collection('transactions');

            transactionsToDelete.forEach(t => {
                const ref = userRef.doc(t.id);
                batch.delete(ref);
            });

            updatesToRemaining.forEach(updateData => {
                const ref = userRef.doc(updateData.id);
                batch.update(ref, {
                    description: updateData.description,
                    installmentCurrent: updateData.installmentCurrent,
                    installmentTotal: updateData.installmentTotal
                });
            });

            if (navigator.onLine) {
                batch.commit().catch(() => {
                    this.hasPendingChanges = true;
                    if (onSyncError) onSyncError();
                });
            } else {
                batch.commit().catch(() => {
                    this.hasPendingChanges = true;
                });
                if (onOffline) onOffline();
            }
        }
        return true;
    }

    getGroupTransactions(groupId) {
        return this.transactions
            .filter(t => t.groupId === groupId)
            .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /** UID do usuário logado (ou null quando o SDK não carregou/está deslogado). */
    currentUid() {
        return auth && auth.currentUser ? auth.currentUser.uid : null;
    }

    getBalance() {
        const todayStr = todayString();

        return this.transactions.reduce((acc, t) => {
            if (!t || typeof t.date !== 'string' || t.date > todayStr) return acc;

            const amount = Number(t.amount) || 0;

            if (t.type === 'income') return acc + amount;
            if (t.type !== 'expense') return acc;

            if (!t.isPaid && t.date < todayStr) return acc;

            return acc - amount;
        }, 0);
    }

    _searchTerms(filters = {}) {
        return normalize(filters.search || '').split(/\s+/).filter(Boolean);
    }

    _matchesCommon(t, filters, searchTerms) {
        if (filters.startDate && t.date < filters.startDate) return false;
        if (filters.endDate && t.date > filters.endDate) return false;

        if (filters.category) {
            if (filters.category === 'outros') {
                if (t.category !== 'outros' && t.category !== 'outros_receita') return false;
            } else if (t.category !== filters.category) {
                return false;
            }
        }

        if (searchTerms.length > 0) {
            const description = normalize(t.description || '');
            if (!searchTerms.every(term => description.includes(term))) return false;
        }

        return true;
    }

    _effectiveEndDate(filters = {}) {
        if (filters.endDate || filters.status || filters.search) return filters.endDate || '';

        const tomorrowStr = tomorrowString();
        if (!filters.startDate || filters.startDate <= tomorrowStr) return tomorrowStr;

        return '';
    }

    _matchesStatus(t, status, todayStr) {
        if (!status) return true;

        if (status === 'paid') return t.isPaid === true;
        if (status === 'overdue') return !t.isPaid && t.date < todayStr;
        if (status === 'pending') return !t.isPaid && t.date >= todayStr;

        return true;
    }

    getFilteredView(filters = {}) {
        const todayStr = todayString();
        const searchTerms = this._searchTerms(filters);
        const effectiveEndDate = this._effectiveEndDate(filters);
        const typeFilter = filters.type || '';
        const statusFilter = filters.status || '';

        const all = [];
        const visible = [];
        const expenseByCategory = {};
        const incomeByCategory = {};

        const summary = {
            income: 0,
            expense: 0,
            balance: 0,
            futureExpenses: 0,
            futureIncomes: 0,
            overdueExpenses: 0,
            overdueIncomes: 0
        };

        const countsFutureExpenses = !typeFilter || typeFilter === 'expense';
        const countsFutureIncomes = !typeFilter || typeFilter === 'income';
        const allowsPending = !statusFilter || statusFilter === 'pending';
        const allowsOverdue = !statusFilter || statusFilter === 'overdue';

        this.transactions.forEach(t => {
            if (!t || typeof t.date !== 'string') return;
            if (t.type !== 'income' && t.type !== 'expense') return;

            const tDate = t.date.substring(0, 10);
            const withinEndDate = !effectiveEndDate || tDate <= effectiveEndDate;

            if (!this._matchesCommon(t, filters, searchTerms)) return;
            if (!this._matchesStatus(t, statusFilter, todayStr)) return;

            const amount = Number(t.amount) || 0;

            if (withinEndDate) {
                all.push(t);

                if (t.type === 'expense') {
                    expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + amount;
                } else {
                    incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + amount;
                }
            }

            if (typeFilter && t.type !== typeFilter) return;

            if (t.isPaid !== true) {
                if (t.type === 'expense') {
                    if (t.date >= todayStr && countsFutureExpenses && allowsPending) {
                        summary.futureExpenses += amount;
                    }
                    if (t.date < todayStr && countsFutureExpenses && allowsOverdue) {
                        summary.overdueExpenses += amount;
                    }
                } else {
                    if (t.date >= todayStr && countsFutureIncomes && allowsPending) {
                        summary.futureIncomes += amount;
                    }
                    if (t.date < todayStr && countsFutureIncomes && allowsOverdue) {
                        summary.overdueIncomes += amount;
                    }
                }
            }

            if (!withinEndDate) return;

            const isExcluded = t.type === 'expense'
                ? this.excludedCategories.has(t.category)
                : this.excludedIncomeCategories.has(t.category);

            if (isExcluded) return;

            visible.push(t);
            if (t.type === 'income') summary.income += amount;
            else summary.expense += amount;
        });

        const sortByDate = (a, b) => {
            const dateCompare = b.date.localeCompare(a.date);
            if (dateCompare !== 0) return dateCompare;
            return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        };

        all.sort(sortByDate);
        visible.sort(sortByDate);

        summary.balance = summary.income - summary.expense;

        return { all, visible, summary, expenseByCategory, incomeByCategory };
    }

    togglePaid(id, onSyncError = null, onOffline = null) {
        const index = this.transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            const currentPaid = this.transactions[index].isPaid || false;
            this.transactions[index].isPaid = !currentPaid;

            if (this.currentUid()) {
                const ref = db.collection('finance_data').doc(this.currentUid())
                    .collection('transactions').doc(id);

                ref.update({ isPaid: !currentPaid }).catch((e) => {
                    console.error(e);
                    if (onSyncError) onSyncError();
                });

                if (!navigator.onLine && onOffline) onOffline();
            }
            return this.transactions[index];
        }
        return null;
    }

    getMonthlyIncome(year, month, filters = {}) {
        const todayStr = todayString();

        return this.transactions
            .filter(t => {
                const ym = getYearMonth(t.date);
                if (t.type !== 'income' || !ym || ym.year !== year || ym.month !== month) return false;

                if (filters.status === 'overdue') return false;
                if (filters.status && !this._matchesStatus(t, filters.status, todayStr)) return false;

                if (filters.category && t.category !== filters.category) return false;
                if (filters.search && !this._matchesCommon(t, { search: filters.search }, this._searchTerms(filters))) return false;

                return true;
            })
            .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    }

    getMonthlyExpense(year, month, filters = {}) {
        const todayStr = todayString();

        return this.transactions
            .filter(t => {
                const ym = getYearMonth(t.date);
                if (t.type !== 'expense' || !ym || ym.year !== year || ym.month !== month) return false;

                if (filters.status && !this._matchesStatus(t, filters.status, todayStr)) return false;
                if (filters.category && !this._matchesCommon(t, { category: filters.category }, [])) return false;
                if (filters.search && !this._matchesCommon(t, { search: filters.search }, this._searchTerms(filters))) return false;

                return true;
            })
            .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    }

    getExpensesByCategory(year, month) {
        return this._groupByCategory('expense', year, month);
    }

    getIncomesByCategory(year, month) {
        return this._groupByCategory('income', year, month);
    }

    _groupByCategory(type, year, month) {
        const byCategory = {};

        this.transactions.forEach(t => {
            if (t.type !== type) return;

            const ym = getYearMonth(t.date);
            if (!ym || ym.year !== year || ym.month !== month) return;

            byCategory[t.category] = (byCategory[t.category] || 0) + (Number(t.amount) || 0);
        });

        return byCategory;
    }

    getFilteredTransactions(filters = {}, ignoreExclusions = false) {
        const todayStr = todayString();
        const searchTerms = this._searchTerms(filters);
        const effectiveEndDate = this._effectiveEndDate(filters);

        return this.transactions.filter(t => {
            if (!t || typeof t.date !== 'string') return false;

            const tDate = t.date.substring(0, 10);

            if (filters.startDate && tDate < filters.startDate) return false;
            if (effectiveEndDate && tDate > effectiveEndDate) return false;
            if (filters.type && t.type !== filters.type) return false;
            if (!this._matchesStatus(t, filters.status, todayStr)) return false;
            if (!this._matchesCommon(t, filters, searchTerms)) return false;

            if (!ignoreExclusions) {
                if (t.type === 'expense' && this.excludedCategories.has(t.category)) return false;
                if (t.type === 'income' && this.excludedIncomeCategories.has(t.category)) return false;
            }

            return true;
        }).sort((a, b) => {
            const dateParams = b.date.localeCompare(a.date);
            if (dateParams !== 0) return dateParams;
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
    }

    getFilteredTotals(filters = {}) {
        const transactions = this.getFilteredTransactions(filters);

        let income = 0;
        let expense = 0;

        transactions.forEach(t => {
            const amount = Number(t.amount) || 0;
            if (t.type === 'income') income += amount;
            else if (t.type === 'expense') expense += amount;
        });

        return { income, expense, balance: income - expense };
    }

    _sumByCategory(filters, type) {
        const transactions = this.getFilteredTransactions({ ...filters, type }, true);
        const byCategory = {};

        transactions.forEach(t => {
            byCategory[t.category] = (byCategory[t.category] || 0) + (Number(t.amount) || 0);
        });

        return byCategory;
    }

    getFilteredExpensesByCategory(filters = {}) {
        return this._sumByCategory(filters, 'expense');
    }

    getFilteredIncomesByCategory(filters = {}) {
        return this._sumByCategory(filters, 'income');
    }

    getAvailableMonths() {
        const months = new Set();

        this.transactions.forEach(t => {
            const ym = getYearMonth(t.date);
            if (!ym) return;
            months.add(`${ym.year}-${String(ym.month + 1).padStart(2, '0')}`);
        });

        return Array.from(months).sort().reverse();
    }

    getAvailableCategories() {
        const categories = new Set();
        this.transactions.forEach(t => categories.add(t.category));
        return Array.from(categories);
    }

    async export() {
        let subscriptions = [];
        if (this.currentUid()) {
            const subsSnapshot = await db.collection('finance_data')
                .doc(this.currentUid())
                .collection('subscriptions')
                .get();
            subscriptions = subsSnapshot.docs.map(doc => doc.data());
        }

        return {
            version: '1.2',
            exportedAt: new Date().toISOString(),
            transactions: this.transactions,
            subscriptions: subscriptions,
            settings: {
                budgetTargetPct: this.getBudgetTargetPct(),
                emailNotifications: this.settings?.emailNotifications !== false
            }
        };
    }

    _sanitizeImportedSettings(raw) {
        if (!raw || typeof raw !== 'object') return null;

        const settings = {};

        const pct = Number(raw.budgetTargetPct);
        if (Number.isFinite(pct) && pct >= 10 && pct <= 100) {
            settings.budgetTargetPct = Math.round(pct);
        }

        if (typeof raw.emailNotifications === 'boolean') {
            settings.emailNotifications = raw.emailNotifications;
        }

        return Object.keys(settings).length > 0 ? settings : null;
    }

    async _applyImportedSettings(rawSettings) {
        const settings = this._sanitizeImportedSettings(rawSettings);
        if (!settings) return;

        this.settings = { ...this.settings, ...settings };

        if (typeof settings.budgetTargetPct === 'number') {
            try {
                localStorage.setItem('finance_budget_target_pct', String(settings.budgetTargetPct));
            } catch (e) {}
        }

        if (this.currentUid()) {
            try {
                await db.collection('finance_data').doc(this.currentUid()).set({
                    settings
                }, { merge: true });
            } catch (e) {
                console.error('Erro ao restaurar configurações:', e);
            }
        }
    }

    _sanitizeId(value) {
        if (typeof value !== 'string') return this.generateId();

        const id = value.trim();
        if (!id || id === '.' || id === '..' || id.includes('/')) return this.generateId();

        return id;
    }

    _parseAmount(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
        if (typeof value !== 'string') return NaN;

        let text = value.replace(/[^\d,.-]/g, '').trim();
        if (!text) return NaN;

        if (text.includes(',')) {
            text = text.replace(/\./g, '').replace(',', '.');
        }

        const parsed = Number(text);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    _sanitizeImportedTransaction(raw) {
        if (!raw || typeof raw !== 'object') return null;

        const description = String(raw.description ?? '').trim();
        const amount = this._parseAmount(raw.amount);
        const date = parseDateOnly(raw.date);
        const type = raw.type === 'income' ? 'income' : raw.type === 'expense' ? 'expense' : null;

        if (!description || !Number.isFinite(amount) || amount <= 0 || !date || !type) return null;

        const category = (typeof raw.category === 'string' && raw.category.trim())
            ? raw.category.trim()
            : (type === 'income' ? 'outros_receita' : 'outros');

        const transaction = {
            id: this._sanitizeId(raw.id),
            description,
            amount,
            date: toDateString(date),
            type,
            category,
            isPaid: raw.isPaid === true,
            createdAt: (typeof raw.createdAt === 'string' && raw.createdAt) ? raw.createdAt : new Date().toISOString()
        };

        if (typeof raw.groupId === 'string' && raw.groupId.trim()) transaction.groupId = raw.groupId.trim();
        if (Number.isInteger(raw.installmentCurrent) && raw.installmentCurrent > 0) {
            transaction.installmentCurrent = raw.installmentCurrent;
        }
        if (Number.isInteger(raw.installmentTotal) && raw.installmentTotal > 1) {
            transaction.installmentTotal = raw.installmentTotal;
        }
        if (typeof raw.subscriptionId === 'string' && raw.subscriptionId.trim()) {
            transaction.subscriptionId = raw.subscriptionId.trim();
        }
        if (raw.isRecurring === true) transaction.isRecurring = true;
        if (Number.isInteger(raw.installments) && raw.installments > 1) transaction.installments = raw.installments;

        return transaction;
    }

    _sanitizeImportedSubscription(raw) {
        if (!raw || typeof raw !== 'object') return null;

        const name = String(raw.name ?? '').trim();
        const amount = this._parseAmount(raw.amount);
        const day = Number(raw.day);

        if (!name || !Number.isFinite(amount) || amount <= 0) return null;
        if (!Number.isInteger(day) || day < 1 || day > 31) return null;

        const type = raw.type === 'income' ? 'income' : 'expense';

        return {
            id: this._sanitizeId(raw.id),
            name,
            amount,
            day,
            type,
            category: (typeof raw.category === 'string' && raw.category.trim())
                ? raw.category.trim()
                : (type === 'income' ? 'outros_receita' : 'outros'),
            active: raw.active !== false,
            lastGenerated: typeof raw.lastGenerated === 'string' ? raw.lastGenerated : '',
            createdAt: (typeof raw.createdAt === 'string' && raw.createdAt) ? raw.createdAt : new Date().toISOString()
        };
    }

    async _writeTransactionChunks(items) {
        const uid = this.currentUid();
        if (!uid || items.length === 0) return items.length;

        const collectionRef = db.collection('finance_data').doc(uid).collection('transactions');
        let written = 0;

        for (let i = 0; i < items.length; i += 500) {
            const chunk = items.slice(i, i + 500);
            const batch = db.batch();
            chunk.forEach(t => batch.set(collectionRef.doc(t.id), t));

            try {
                await batch.commit();
            } catch (error) {
                console.error('Falha ao gravar transações importadas:', error);
                throw new Error(
                    `Falha ao gravar as transações (${written} de ${items.length}). ` +
                    'Nada foi apagado — verifique a conexão e tente novamente.'
                );
            }

            written += chunk.length;
        }

        return written;
    }

    async _deleteTransactionsNotIn(keepIds) {
        const uid = this.currentUid();
        if (!uid) return 0;

        let deleted = 0;
        try {
            const collectionRef = db.collection('finance_data').doc(uid).collection('transactions');
            const snapshot = await collectionRef.get();
            const obsolete = snapshot.docs.filter(doc => !keepIds.has(doc.id));

            for (let i = 0; i < obsolete.length; i += 500) {
                const batch = db.batch();
                obsolete.slice(i, i + 500).forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                deleted += Math.min(500, obsolete.length - i);
            }
        } catch (error) {
            console.error('Limpeza de transações antigas incompleta:', error);
        }

        return deleted;
    }

    async _writeSubscriptionChunks(items) {
        const uid = this.currentUid();
        if (!uid || items.length === 0) return items.length;

        const subsRef = db.collection('finance_data').doc(uid).collection('subscriptions');
        let written = 0;

        for (let i = 0; i < items.length; i += 500) {
            const chunk = items.slice(i, i + 500);
            const batch = db.batch();
            chunk.forEach(s => batch.set(subsRef.doc(s.id), s));

            try {
                await batch.commit();
            } catch (error) {
                console.error('Falha ao gravar assinaturas importadas:', error);
                throw new Error(
                    `Falha ao gravar as assinaturas (${written} de ${items.length}). ` +
                    'Nada foi apagado — verifique a conexão e tente novamente.'
                );
            }

            written += chunk.length;
        }

        return written;
    }

    async _deleteSubscriptionsNotIn(keepIds) {
        const uid = this.currentUid();
        if (!uid) return 0;

        let deleted = 0;
        try {
            const subsRef = db.collection('finance_data').doc(uid).collection('subscriptions');
            const snapshot = await subsRef.get();
            const obsolete = snapshot.docs.filter(doc => !keepIds.has(doc.id));

            for (let i = 0; i < obsolete.length; i += 500) {
                const batch = db.batch();
                obsolete.slice(i, i + 500).forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                deleted += Math.min(500, obsolete.length - i);
            }
        } catch (error) {
            console.error('Limpeza de assinaturas antigas incompleta:', error);
        }

        return deleted;
    }

    /**
     * Importa um backup de forma segura: valida tudo, grava os registros novos
     * e só então remove o que ficou de fora (modo `replace`). Se a gravação
     * falhar, nenhum dado existente é apagado.
     */
    async import(data, replace = false) {
        if (!data || !Array.isArray(data.transactions)) {
            throw new Error('Formato de dados inválido: lista de transações ausente');
        }

        const seenIds = new Set();
        const sanitized = data.transactions.map(t => this._sanitizeImportedTransaction(t));
        const newImportedData = sanitized.filter(t => {
            if (!t) return false;

            if (seenIds.has(t.id)) t.id = this.generateId();
            seenIds.add(t.id);

            return true;
        });
        const skipped = sanitized.length - newImportedData.length;

        if (newImportedData.length === 0) {
            throw new Error('Nenhuma transação válida encontrada no arquivo');
        }

        let importedCount = 0;
        let deletedTransactions = 0;

        if (replace) {
            importedCount = await this._writeTransactionChunks(newImportedData);
            deletedTransactions = await this._deleteTransactionsNotIn(new Set(newImportedData.map(t => t.id)));
            this.transactions = newImportedData;
        } else {
            const existingIds = new Set(this.transactions.map(t => t.id));
            const distinctNew = newImportedData.filter(t => !existingIds.has(t.id));

            importedCount = await this._writeTransactionChunks(distinctNew);
            this.transactions = [...this.transactions, ...distinctNew];
        }

        let subscriptionsImported = 0;

        if (Array.isArray(data.subscriptions)) {
            const subsToImport = data.subscriptions
                .map(s => this._sanitizeImportedSubscription(s))
                .filter(Boolean);

            if (replace) {
                subscriptionsImported = await this._writeSubscriptionChunks(subsToImport);
                await this._deleteSubscriptionsNotIn(new Set(subsToImport.map(s => s.id)));
                this.subscriptions = subsToImport;
            } else {
                let existingIds = new Set(this.subscriptions.map(s => s.id));
                if (this.currentUid()) {
                    try {
                        const snap = await db.collection('finance_data').doc(this.currentUid())
                            .collection('subscriptions').get();
                        existingIds = new Set(snap.docs.map(doc => doc.id));
                    } catch (error) {
                        console.warn('Não foi possível conferir assinaturas existentes:', error);
                    }
                }

                const distinctSubs = subsToImport.filter(s => !existingIds.has(s.id));
                subscriptionsImported = await this._writeSubscriptionChunks(distinctSubs);
                if (distinctSubs.length > 0) {
                    this.subscriptions = [...this.subscriptions, ...distinctSubs];
                }
            }
        }

        await this._applyImportedSettings(data.settings);

        this.lastImportSkipped = skipped;
        this.lastImportDeleted = deletedTransactions;

        return {
            imported: importedCount,
            skipped,
            subscriptionsImported,
            deletedTransactions,
            total: this.transactions.length
        };
    }

    async addSubscription(data) {
        if (!this.currentUid()) return null;

        const subscription = {
            id: this.generateId(),
            name: data.name,
            amount: data.amount,
            category: data.category,
            day: data.day,
            type: data.type || 'expense',
            active: true,
            lastGenerated: '',
            createdAt: new Date().toISOString()
        };

        const subRef = db.collection('finance_data')
            .doc(this.currentUid())
            .collection('subscriptions')
            .doc(subscription.id);

        await subRef.set(subscription);
        return subscription;
    }

    getSubscriptions() {
        return this.subscriptions;
    }

    async cancelSubscription(id) {
        if (!this.currentUid()) return;

        const subRef = db.collection('finance_data')
            .doc(this.currentUid())
            .collection('subscriptions')
            .doc(id);

        await subRef.update({ active: false });
    }

    async activateSubscription(id) {
        if (!this.currentUid()) return;

        const subRef = db.collection('finance_data')
            .doc(this.currentUid())
            .collection('subscriptions')
            .doc(id);

        await subRef.update({ active: true });
    }

    async deleteSubscription(id) {
        if (!this.currentUid()) return;

        const subRef = db.collection('finance_data')
            .doc(this.currentUid())
            .collection('subscriptions')
            .doc(id);

        await subRef.delete();
    }

    async updateSubscription(id, data) {
        if (!this.currentUid()) return;

        const subRef = db.collection('finance_data')
            .doc(this.currentUid())
            .collection('subscriptions')
            .doc(id);

        await subRef.update({
            name: data.name,
            amount: data.amount,
            day: data.day,
            category: data.category,
            type: data.type || 'expense'
        });
    }

    /** Converte 'YYYY-MM' em { year, month } (month 0-11) ou null. */
    _parseMonthKey(key) {
        if (typeof key !== 'string') return null;
        const match = key.match(/^(\d{4})-(\d{2})$/);
        if (!match) return null;

        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        if (month < 0 || month > 11) return null;

        return { year, month };
    }

    _monthKey(year, month) {
        return `${year}-${String(month + 1).padStart(2, '0')}`;
    }

    /**
     * Calcula as cobranças que faltam para uma assinatura, do mês seguinte ao
     * último gerado (ou da criação) até o mês de referência. Não grava nada.
     * Meses que já têm lançamento daquela assinatura são ignorados, e o
     * backfill é limitado a `maxMonths` para não criar uma dívida artificial.
     */
    buildMissingSubscriptionCharges(sub, existingTransactions = [], referenceDate = new Date(), maxMonths = 24) {
        if (!sub || sub.active === false) return { transactions: [], lastGenerated: null };

        const amount = Number(sub.amount);
        if (!Number.isFinite(amount) || amount <= 0) return { transactions: [], lastGenerated: null };

        const refYear = referenceDate.getFullYear();
        const refMonth = referenceDate.getMonth();
        const currentKey = this._monthKey(refYear, refMonth);
        const endIndex = refYear * 12 + refMonth;

        let startIndex;
        const lastGenerated = this._parseMonthKey(sub.lastGenerated);
        if (lastGenerated) {
            startIndex = lastGenerated.year * 12 + lastGenerated.month + 1;
        } else {
            const createdAt = sub.createdAt ? new Date(sub.createdAt) : null;
            if (createdAt && !Number.isNaN(createdAt.getTime())) {
                startIndex = createdAt.getFullYear() * 12 + createdAt.getMonth();
            } else {
                startIndex = endIndex;
            }
        }

        if (startIndex > endIndex) return { transactions: [], lastGenerated: currentKey };

        const firstIndex = Math.max(startIndex, endIndex - (maxMonths - 1));

        const existingMonths = new Set(
            (existingTransactions || [])
                .filter(t => t && t.subscriptionId === sub.id && typeof t.date === 'string')
                .map(t => t.date.slice(0, 7))
        );

        const day = Math.max(1, Math.min(31, parseInt(sub.day, 10) || 1));
        const type = sub.type === 'income' ? 'income' : 'expense';
        const category = sub.category || (type === 'income' ? 'outros_receita' : 'outros');
        const createdAtIso = new Date().toISOString();

        const transactions = [];
        for (let index = firstIndex; index <= endIndex; index++) {
            const year = Math.floor(index / 12);
            const month = index % 12;
            const key = this._monthKey(year, month);
            if (existingMonths.has(key)) continue;

            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}`;

            transactions.push({
                id: this.generateId(),
                description: sub.name,
                amount,
                date,
                type,
                category,
                subscriptionId: sub.id,
                isPaid: false,
                isRecurring: true,
                createdAt: createdAtIso
            });
        }

        return { transactions, lastGenerated: currentKey };
    }

    async checkRecurringExpenses(specificSubId = null) {
        const uid = this.currentUid();
        if (!uid) return 0;

        const now = new Date();
        const currentKey = this._monthKey(now.getFullYear(), now.getMonth());

        try {
            let subscriptionsToCheck = [];
            
            if (specificSubId) {
                const subRef = db.collection('finance_data')
                    .doc(uid)
                    .collection('subscriptions')
                    .doc(specificSubId);
                const subDoc = await subRef.get();
                if (subDoc.exists) {
                    subscriptionsToCheck = [{ id: subDoc.id, ...subDoc.data() }];
                }
            } else {
                const subsSnapshot = await db.collection('finance_data')
                    .doc(uid)
                    .collection('subscriptions')
                    .get();
                subscriptionsToCheck = subsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            const userRef = db.collection('finance_data').doc(uid);
            let generated = 0;

            for (const sub of subscriptionsToCheck) {
                // Assinatura cancelada: só avança o marcador para não cobrar o período inativo
                // caso ela seja reativada depois.
                if (sub.active === false) {
                    if (sub.lastGenerated !== currentKey) {
                        await userRef.collection('subscriptions').doc(sub.id)
                            .update({ lastGenerated: currentKey });
                    }
                    continue;
                }

                const { transactions, lastGenerated } = this.buildMissingSubscriptionCharges(sub, this.transactions, now);
                if (!lastGenerated) continue;

                const pointerNeedsUpdate = sub.lastGenerated !== lastGenerated;
                if (transactions.length === 0 && !pointerNeedsUpdate) continue;

                const batch = db.batch();
                const transactionsRef = userRef.collection('transactions');

                transactions.forEach(t => batch.set(transactionsRef.doc(t.id), t));
                batch.update(userRef.collection('subscriptions').doc(sub.id), { lastGenerated });

                await batch.commit();

                if (transactions.length > 0) {
                    this.transactions.push(...transactions);
                    generated += transactions.length;
                }
            }

            return generated;
        } catch (error) {
            console.error('Erro ao verificar assinaturas:', error);
            return 0;
        }
    }
}


import { auth, db, firebase } from '../services/firebase.js';
import { normalize } from '../utils/helpers.js';

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
        this.settings = { emailNotifications: true };
    }

    async fetchSettings(uid) {
        try {
            const doc = await db.collection('finance_data').doc(uid).get();
            if (doc.exists && doc.data().settings) {
                this.settings = { ...this.settings, ...doc.data().settings };
            }
        } catch (e) {
            console.error('Error fetching settings:', e);
        }
    }

    getSettings() {
        return this.settings;
    }

    async toggleEmailNotifications() {
        if (!auth.currentUser) return;

        const newValue = !this.settings.emailNotifications;
        this.settings.emailNotifications = newValue;

        try {
            await db.collection('finance_data').doc(auth.currentUser.uid).set({
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
        if (!auth.currentUser) return;
        this.settings.emailNotifications = enabled;
        try {
            await db.collection('finance_data').doc(auth.currentUser.uid).set({
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

        this.fetchSettings(user.uid);

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
                        const ref = userRef.collection('transactions').doc(t.id);
                        batch.set(ref, t);
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
        return [...this.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    get(id) {
        return this.transactions.find(t => t.id === id);
    }

    add(transaction, onSyncError = null, onOffline = null) {
        let transactionsToAdd = [];
        const installments = transaction.installments || 1;
        const groupId = installments > 1 ? this.generateId() : null;

        if (installments > 1) {
            const baseDate = new Date(transaction.date + 'T12:00:00');
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

        if (auth.currentUser) {
            const batch = db.batch();
            const userRef = db.collection('finance_data').doc(auth.currentUser.uid).collection('transactions');

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
                batch.commit();
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

            if (auth.currentUser) {
                const ref = db.collection('finance_data').doc(auth.currentUser.uid)
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
                .sort((a, b) => new Date(a.date) - new Date(b.date));
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

        if (auth.currentUser) {
            const batch = db.batch();
            const userRef = db.collection('finance_data').doc(auth.currentUser.uid).collection('transactions');

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
                batch.commit();
                if (onOffline) onOffline();
            }
        }
        return true;
    }

    getGroupTransactions(groupId) {
        return this.transactions
            .filter(t => t.groupId === groupId)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getBalance() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        return this.transactions
            .filter(t => t.date <= dateStr)
            .reduce((acc, t) => {
                if (t.type === 'income') {
                    return acc + t.amount;
                } else {
                    if (!t.isPaid && t.date < dateStr) return acc;
                    return acc - t.amount;
                }
            }, 0);
    }

    getFutureExpenses(filters = {}) {
        if (filters.type && filters.type !== 'expense') return 0;

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        return this.transactions
            .filter(t => {
                if (t.date < dateStr) return false;
                if (t.type === 'income') return false;
                if (t.type !== 'expense') return false;
                if (t.isPaid === true) return false;

                if (filters.status && filters.status !== 'pending') return false;
                if (filters.startDate && t.date < filters.startDate) return false;
                if (filters.endDate && t.date > filters.endDate) return false;
                if (filters.category) {
                    if (filters.category === 'outros') {
                        if (t.category !== 'outros' && t.category !== 'outros_receita') return false;
                    } else if (t.category !== filters.category) {
                        return false;
                    }
                }
                const normalize = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (filters.search && !normalize(t.description).includes(normalize(filters.search))) return false;

                return true;
            })
            .reduce((acc, t) => acc + t.amount, 0);
    }

    getFutureIncomes(filters = {}) {
        if (filters.type && filters.type !== 'income') return 0;

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        return this.transactions
            .filter(t => {
                if (t.date < dateStr) return false;
                if (t.type !== 'income') return false;
                if (t.isPaid === true) return false;

                if (filters.status && filters.status !== 'pending') return false;
                if (filters.startDate && t.date < filters.startDate) return false;
                if (filters.endDate && t.date > filters.endDate) return false;
                if (filters.category) {
                    if (filters.category === 'outros') {
                        if (t.category !== 'outros' && t.category !== 'outros_receita') return false;
                    } else if (t.category !== filters.category) {
                        return false;
                    }
                }
                const normalize = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (filters.search && !normalize(t.description).includes(normalize(filters.search))) return false;

                return true;
            })
            .reduce((acc, t) => acc + t.amount, 0);
    }

    getOverdueExpenses(filters = {}) {
        if (filters.type && filters.type !== 'expense') return 0;

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        return this.transactions
            .filter(t => {
                if (t.date >= dateStr) return false;
                if (t.type !== 'expense') return false;
                if (t.isPaid === true) return false;

                if (filters.status && filters.status !== 'overdue') return false;
                if (filters.startDate && t.date < filters.startDate) return false;
                if (filters.endDate && t.date > filters.endDate) return false;
                if (filters.category) {
                    if (filters.category === 'outros') {
                        if (t.category !== 'outros' && t.category !== 'outros_receita') return false;
                    } else if (t.category !== filters.category) {
                        return false;
                    }
                }
                const normalize = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (filters.search && !normalize(t.description).includes(normalize(filters.search))) return false;

                return true;
            })
            .reduce((acc, t) => acc + t.amount, 0);
    }

    getOverdueIncomes(filters = {}) {
        if (filters.type && filters.type !== 'income') return 0;

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        return this.transactions
            .filter(t => {
                if (t.date >= dateStr) return false;
                if (t.type !== 'income') return false;
                if (t.isPaid === true) return false;

                if (filters.status && filters.status !== 'overdue') return false;
                if (filters.startDate && t.date < filters.startDate) return false;
                if (filters.endDate && t.date > filters.endDate) return false;
                if (filters.category) {
                    if (filters.category === 'outros') {
                        if (t.category !== 'outros' && t.category !== 'outros_receita') return false;
                    } else if (t.category !== filters.category) {
                        return false;
                    }
                }
                const normalize = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (filters.search && !normalize(t.description).includes(normalize(filters.search))) return false;

                return true;
            })
            .reduce((acc, t) => acc + t.amount, 0);
    }

    togglePaid(id, onSyncError = null, onOffline = null) {
        const index = this.transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            const currentPaid = this.transactions[index].isPaid || false;
            this.transactions[index].isPaid = !currentPaid;

            if (auth.currentUser) {
                const ref = db.collection('finance_data').doc(auth.currentUser.uid)
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
        return this.transactions
            .filter(t => {
                const d = new Date(t.date);
                if (t.type !== 'income' || d.getFullYear() !== year || d.getMonth() !== month) return false;

                if (filters.status && filters.status === 'overdue' && t.type === 'income') return false;
                if (filters.status === 'paid' && t.isPaid !== true) return false;
                if (filters.status === 'pending' && t.isPaid === true) return false;

                if (filters.category && t.category !== filters.category) return false;
                if (filters.search) {
                    const normalize = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    if (!normalize(t.description).includes(normalize(filters.search))) return false;
                }
                return true;
            })
            .reduce((acc, t) => acc + t.amount, 0);
    }

    getMonthlyExpense(year, month, filters = {}) {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        return this.transactions
            .filter(t => {
                const d = new Date(t.date);
                if (t.type !== 'expense' || d.getFullYear() !== year || d.getMonth() !== month) return false;

                if (filters.status) {
                    if (filters.status === 'paid' && !t.isPaid) return false;
                    if (filters.status === 'overdue' && (t.isPaid || t.date >= todayStr)) return false;
                    if (filters.status === 'pending') {
                        if (t.isPaid) return false;
                        if (t.date < todayStr) return false;
                    }
                }

                if (filters.category) {
                    if (filters.category === 'outros') {
                        if (t.category !== 'outros') return false;
                    } else if (t.category !== filters.category) {
                        return false;
                    }
                }
                if (filters.search) {
                    const normalize = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    if (!normalize(t.description).includes(normalize(filters.search))) return false;
                }
                return true;
            })
            .reduce((acc, t) => acc + t.amount, 0);
    }

    getExpensesByCategory(year, month) {
        const expenses = this.transactions.filter(t => {
            const d = new Date(t.date);
            return t.type === 'expense' && d.getFullYear() === year && d.getMonth() === month;
        });

        const byCategory = {};
        expenses.forEach(t => {
            if (!byCategory[t.category]) {
                byCategory[t.category] = 0;
            }
            byCategory[t.category] += t.amount;
        });

        return byCategory;
    }

    getIncomesByCategory(year, month) {
        const incomes = this.transactions.filter(t => {
            const d = new Date(t.date);
            return t.type === 'income' && d.getFullYear() === year && d.getMonth() === month;
        });

        const byCategory = {};
        incomes.forEach(t => {
            if (!byCategory[t.category]) {
                byCategory[t.category] = 0;
            }
            byCategory[t.category] += t.amount;
        });

        return byCategory;
    }

    getFilteredTransactions(filters = {}, ignoreExclusions = false) {
        const normalize = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        let effectiveEndDate = filters.endDate;
        if (!effectiveEndDate && !filters.status && !filters.search) {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const year = tomorrow.getFullYear();
            const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
            const day = String(tomorrow.getDate()).padStart(2, '0');
            const tomorrowStr = `${year}-${month}-${day}`;

            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            if (!filters.startDate || filters.startDate <= tomorrowStr) {
                effectiveEndDate = tomorrowStr;
            }
        }

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        return this.transactions.filter(t => {
            const tDate = t.date.substring(0, 10);
            if (filters.startDate && tDate < filters.startDate) return false;

            if (effectiveEndDate && tDate > effectiveEndDate) return false;

            if (filters.type && t.type !== filters.type) return false;

            if (filters.status) {
                if (filters.status === 'paid' && !t.isPaid) return false;
                if (filters.status === 'overdue') {
                    if (t.isPaid || t.date >= todayStr) return false;
                }
                if (filters.status === 'pending') {
                    if (t.isPaid) return false;
                    if (t.date < todayStr) return false;
                }
            }

            if (filters.category) {
                if (filters.category === 'outros') {
                    if (t.category !== 'outros' && t.category !== 'outros_receita') return false;
                } else {
                    if (t.category !== filters.category) return false;
                }
            }

            if (filters.search) {
                const searchTerms = normalize(filters.search).split(/\s+/).filter(Boolean);
                const description = normalize(t.description);
                const matchesAll = searchTerms.every(term => description.includes(term));
                if (!matchesAll) return false;
            }

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

        const income = transactions
            .filter(t => t.type === 'income')
            .reduce((acc, t) => acc + t.amount, 0);

        const expense = transactions
            .filter(t => t.type === 'expense')
            .reduce((acc, t) => acc + t.amount, 0);

        return { income, expense, balance: income - expense };
    }

    getFilteredExpensesByCategory(filters = {}) {
        const transactions = this.getFilteredTransactions({ ...filters, type: 'expense' }, true);
        const byCategory = {};
        transactions.forEach(t => {
            if (!byCategory[t.category]) byCategory[t.category] = 0;
            byCategory[t.category] += t.amount;
        });
        return byCategory;
    }

    getFilteredIncomesByCategory(filters = {}) {
        const transactions = this.getFilteredTransactions({ ...filters, type: 'income' }, true);
        const byCategory = {};
        transactions.forEach(t => {
            if (!byCategory[t.category]) byCategory[t.category] = 0;
            byCategory[t.category] += t.amount;
        });
        return byCategory;
    }

    getAvailableMonths() {
        const months = new Set();
        this.transactions.forEach(t => {
            const d = new Date(t.date);
            months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
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
        if (auth.currentUser) {
            const subsSnapshot = await db.collection('finance_data')
                .doc(auth.currentUser.uid)
                .collection('subscriptions')
                .get();
            subscriptions = subsSnapshot.docs.map(doc => doc.data());
        }

        return {
            version: '1.1',
            exportedAt: new Date().toISOString(),
            transactions: this.transactions,
            subscriptions: subscriptions
        };
    }

    async import(data, replace = false) {
        if (!data || !data.transactions || !Array.isArray(data.transactions)) {
            throw new Error('Formato de dados inválido');
        }

        const newImportedData = data.transactions;

        if (replace) {
            this.transactions = newImportedData;

            if (auth.currentUser) {
                const userRef = db.collection('finance_data').doc(auth.currentUser.uid);
                const collectionRef = userRef.collection('transactions');

                const snapshot = await collectionRef.get();
                const totalToDelete = snapshot.size;
                const deleteDocs = snapshot.docs;

                for (let i = 0; i < totalToDelete; i += 500) {
                    const batch = db.batch();
                    deleteDocs.slice(i, i + 500).forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }

                const totalToAdd = newImportedData.length;
                for (let i = 0; i < totalToAdd; i += 500) {
                    const chunk = newImportedData.slice(i, i + 500);
                    const batch = db.batch();
                    chunk.forEach(t => {
                        const ref = collectionRef.doc(t.id);
                        batch.set(ref, t);
                    });
                    await batch.commit();
                }
            }

        } else {
            const existingIds = new Set(this.transactions.map(t => t.id));
            const distinctNew = newImportedData.filter(t => !existingIds.has(t.id));

            this.transactions = [...this.transactions, ...distinctNew];

            if (auth.currentUser && distinctNew.length > 0) {
                const collectionRef = db.collection('finance_data').doc(auth.currentUser.uid).collection('transactions');
                const totalToAdd = distinctNew.length;

                for (let i = 0; i < totalToAdd; i += 500) {
                    const chunk = distinctNew.slice(i, i + 500);
                    const batch = db.batch();
                    chunk.forEach(t => {
                        const ref = collectionRef.doc(t.id);
                        batch.set(ref, t);
                    });
                    await batch.commit();
                }
            }
        }

        if (data.subscriptions && Array.isArray(data.subscriptions) && auth.currentUser) {
            const subsRef = db.collection('finance_data').doc(auth.currentUser.uid).collection('subscriptions');
            let subsToImport = data.subscriptions;

            if (replace) {
                const subsSnapshot = await subsRef.get();
                const subsToDelete = subsSnapshot.docs;
                for (let i = 0; i < subsToDelete.length; i += 500) {
                    const batch = db.batch();
                    subsToDelete.slice(i, i + 500).forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }
            } else {
                const currentSubsSnapshot = await subsRef.get();
                const existingSubIds = new Set(currentSubsSnapshot.docs.map(doc => doc.id));
                subsToImport = subsToImport.filter(s => !existingSubIds.has(s.id));
            }

            for (let i = 0; i < subsToImport.length; i += 500) {
                const chunk = subsToImport.slice(i, i + 500);
                const batch = db.batch();
                chunk.forEach(s => {
                    const ref = subsRef.doc(s.id);
                    batch.set(ref, s);
                });
                await batch.commit();
            }
        }

        return this.transactions.length;
    }

    async addSubscription(data) {
        if (!auth.currentUser) return null;

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
            .doc(auth.currentUser.uid)
            .collection('subscriptions')
            .doc(subscription.id);

        await subRef.set(subscription);
        return subscription;
    }

    getSubscriptions() {
        return this.subscriptions;
    }

    async cancelSubscription(id) {
        if (!auth.currentUser) return;

        const subRef = db.collection('finance_data')
            .doc(auth.currentUser.uid)
            .collection('subscriptions')
            .doc(id);

        await subRef.update({ active: false });
    }

    async activateSubscription(id) {
        if (!auth.currentUser) return;

        const subRef = db.collection('finance_data')
            .doc(auth.currentUser.uid)
            .collection('subscriptions')
            .doc(id);

        await subRef.update({ active: true });
    }

    async deleteSubscription(id) {
        if (!auth.currentUser) return;

        const subRef = db.collection('finance_data')
            .doc(auth.currentUser.uid)
            .collection('subscriptions')
            .doc(id);

        await subRef.delete();
    }

    async updateSubscription(id, data) {
        if (!auth.currentUser) return;

        const subRef = db.collection('finance_data')
            .doc(auth.currentUser.uid)
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

    async checkRecurringExpenses(specificSubId = null) {
        if (!auth.currentUser) return;

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        try {
            let subscriptionsToCheck = [];
            
            if (specificSubId) {
                const subRef = db.collection('finance_data')
                    .doc(auth.currentUser.uid)
                    .collection('subscriptions')
                    .doc(specificSubId);
                const subDoc = await subRef.get();
                if (subDoc.exists) {
                    subscriptionsToCheck = [{ id: subDoc.id, ...subDoc.data() }];
                }
            } else {
                const subsSnapshot = await db.collection('finance_data')
                    .doc(auth.currentUser.uid)
                    .collection('subscriptions')
                    .get();
                subscriptionsToCheck = subsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            for (const sub of subscriptionsToCheck) {
                if (sub.active === false) continue;
                
                if (sub.lastGenerated === currentMonth) continue;

                const alreadyExists = this.transactions.some(t => 
                    t.subscriptionId === sub.id && 
                    t.date && t.date.startsWith(currentMonth)
                );

                if (alreadyExists) {
                    const subRef = db.collection('finance_data')
                        .doc(auth.currentUser.uid)
                        .collection('subscriptions')
                        .doc(sub.id);
                    await subRef.update({ lastGenerated: currentMonth });
                    continue;
                }

                const day = Math.min(sub.day, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
                const transactionDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                const batch = db.batch();

                const transactionId = this.generateId();
                const transactionRef = db.collection('finance_data')
                    .doc(auth.currentUser.uid)
                    .collection('transactions')
                    .doc(transactionId);

                const transaction = {
                    id: transactionId,
                    description: sub.name,
                    amount: sub.amount,
                    date: transactionDate,
                    type: sub.type || 'expense',
                    category: sub.category,
                    subscriptionId: sub.id,
                    createdAt: new Date().toISOString()
                };

                batch.set(transactionRef, transaction);

                const subRef = db.collection('finance_data')
                    .doc(auth.currentUser.uid)
                    .collection('subscriptions')
                    .doc(sub.id);

                batch.update(subRef, { lastGenerated: currentMonth });

                await batch.commit();
            }
        } catch (error) {
            console.error('Erro ao verificar assinaturas:', error);
        }
    }
}


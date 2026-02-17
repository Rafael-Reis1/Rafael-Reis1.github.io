const firebaseConfig = {
    apiKey: "AIzaSyCvI-ATmTj-zAzbGnKLx1Fq7i29KoULwro",
    authDomain: "finance-app-e50b8.firebaseapp.com",
    projectId: "finance-app-e50b8",
    storageBucket: "finance-app-e50b8.firebasestorage.app",
    messagingSenderId: "339147531228",
    appId: "1:339147531228:web:6eb3aca1de8798e6d52519",
    measurementId: "G-ZHX9XRD3TK"
};

try {
    firebase.initializeApp(firebaseConfig);
} catch (e) {
    console.error('Firebase Init Error', e);
}
const auth = firebase.auth();
const db = firebase.firestore();
db.enablePersistence({ synchronizeTabs: true })
    .catch((err) => {
        if (err.code == 'unimplemented') {
            console.warn('Persistência offline indisponível neste navegador/modo.');
        }
    });

const googleProvider = new firebase.auth.GoogleAuthProvider();

const CATEGORIES = {
    expense: {
        alimentacao: '🍔',
        transporte: '🚗',
        moradia: '🏠',
        saude: '💊',
        educacao: '📚',
        lazer: '🎬',
        vestuario: '👕',
        compras: '🛒',
        servicos: '🔧',
        outros: '📦'
    },
    income: {
        salario: '💵',
        freelance: '💼',
        investimentos: '📈',
        presente: '🎁',
        outros_receita: '📦'
    }
};

const CATEGORY_NAMES = {
    alimentacao: 'Alimentação',
    transporte: 'Transporte',
    moradia: 'Moradia',
    saude: 'Saúde',
    educacao: 'Educação',
    lazer: 'Lazer',
    vestuario: 'Vestuário',
    compras: 'Compras',
    servicos: 'Serviços',
    outros: 'Outros',
    salario: 'Salário',
    freelance: 'Freelance',
    investimentos: 'Investimentos',
    presente: 'Presente',
    outros_receita: 'Outros'
};

const normalize = (str) => {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

const EXPENSE_COLORS = {
    alimentacao: '#ff7043',
    transporte: '#ffca28',
    moradia: '#d32f2f',
    saude: '#880e4f',
    educacao: '#673ab7',
    lazer: '#f06292',
    vestuario: '#00bcd4',
    compras: '#2962ff',
    servicos: '#26a69a',
    outros: '#9e9e9e'
};

const INCOME_COLORS = {
    salario: '#16a34a',
    freelance: '#4f46e5',
    investimentos: '#9333ea',
    presente: '#fbc02d',
    outros_receita: '#9e9e9e'
};

class CustomSelect {
    constructor(originalSelect) {
        this.originalSelect = originalSelect;
        this.originalSelect.style.display = 'none';
        this.customSelect = null;
        this.trigger = null;
        this.optionsList = null;
        this.isOpen = false;

        this.init();
        this.setupObservers();
    }

    init() {
        this.customSelect = document.createElement('div');
        this.customSelect.classList.add('custom-select-container');

        this.originalSelect.customSelect = this;

        this.render();

        this.originalSelect.parentNode.insertBefore(this.customSelect, this.originalSelect.nextSibling);

        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.customSelect.contains(e.target)) {
                this.close();
            }
        });
    }

    render() {
        this.customSelect.innerHTML = '';

        this.trigger = document.createElement('div');
        this.trigger.classList.add('select-trigger');
        this.updateTriggerText();

        this.trigger.addEventListener('click', () => {
            this.toggle();
        });

        this.optionsList = document.createElement('div');
        this.optionsList.classList.add('custom-options');

        this.buildOptions();

        const arrow = document.createElement('div');
        arrow.classList.add('select-arrow');
        arrow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        this.trigger.appendChild(arrow);

        this.customSelect.appendChild(this.trigger);
        this.customSelect.appendChild(this.optionsList);
    }

    buildOptions() {
        const groups = this.originalSelect.querySelectorAll('optgroup');
        const directOptions = this.originalSelect.querySelectorAll(':scope > option');

        if (directOptions.length > 0) {
            directOptions.forEach(opt => {
                this.optionsList.appendChild(this.createOptionElement(opt));
            });
        }

        groups.forEach(group => {
            const groupLabel = document.createElement('div');
            groupLabel.classList.add('custom-option-group');
            groupLabel.textContent = group.label;
            this.optionsList.appendChild(groupLabel);

            const groupOptions = group.querySelectorAll('option');
            groupOptions.forEach(opt => {
                this.optionsList.appendChild(this.createOptionElement(opt));
            });
        });
    }

    createOptionElement(option) {
        const div = document.createElement('div');
        div.classList.add('custom-option');
        div.innerHTML = this.formatContent(option.textContent);
        div.dataset.value = option.value;

        if (option.selected) {
            div.classList.add('selected');
        }

        div.addEventListener('click', () => {
            this.selectOption(option);
        });

        return div;
    }

    selectOption(optionElement) {
        this.originalSelect.value = optionElement.value;

        const event = new Event('change', { bubbles: true });
        this.originalSelect.dispatchEvent(event);

        this.updateTriggerText();
        this.close();

        const allOptions = this.optionsList.querySelectorAll('.custom-option');
        allOptions.forEach(el => el.classList.remove('selected'));

        const selected = Array.from(allOptions).find(el => el.dataset.value === optionElement.value);
        if (selected) selected.classList.add('selected');
    }

    updateTriggerText() {
        const selectedOption = this.originalSelect.options[this.originalSelect.selectedIndex];
        if (selectedOption) {
            let textSpan = this.trigger.querySelector('.trigger-text');
            if (!textSpan) {
                textSpan = document.createElement('div');
                textSpan.classList.add('trigger-text');
                this.trigger.prepend(textSpan);
            }
            textSpan.innerHTML = this.formatContent(selectedOption.textContent);
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        document.querySelectorAll('.custom-select-container').forEach(el => {
            if (el !== this.customSelect) el.classList.remove('active');
        });
        document.querySelectorAll('.custom-options').forEach(el => {
            if (el !== this.optionsList) el.classList.remove('open');
        });

        this.customSelect.classList.add('active');
        this.optionsList.classList.add('open');
        this.isOpen = true;
    }

    close() {
        this.customSelect.classList.remove('active');
        this.optionsList.classList.remove('open');
        this.isOpen = false;
    }

    setupObservers() {
        this.observer = new MutationObserver(() => {
            this.optionsList.innerHTML = '';
            this.buildOptions();
            this.updateTriggerText();
        });

        this.observer.observe(this.originalSelect, { childList: true, subtree: true });

        this.originalSelect.addEventListener('change', () => {
            this.updateTriggerText();
            const allOptions = this.optionsList.querySelectorAll('.custom-option');
            allOptions.forEach(el => {
                if (el.dataset.value === this.originalSelect.value) el.classList.add('selected');
                else el.classList.remove('selected');
            });
        });
    }

    formatContent(text) {
        const trimmed = text.trim();
        const emojiMatch = trimmed.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u);
        if (emojiMatch) {
            const emoji = emojiMatch[0];
            const rest = trimmed.substring(emoji.length).trim();
            return `<span class="opt-icon">${emoji}</span><span class="opt-text">${rest}</span>`;
        }
        return trimmed;
    }
}

class FinanceManager {
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
        this.transactions = this.transactions.filter(t => !idsToDelete.has(t.id));

        if (auth.currentUser) {
            const batch = db.batch();
            const userRef = db.collection('finance_data').doc(auth.currentUser.uid).collection('transactions');

            transactionsToDelete.forEach(t => {
                const ref = userRef.doc(t.id);
                batch.delete(ref);
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
                    if (t.type !== 'expense') return false;
                    if (t.isPaid || t.date >= todayStr) return false;
                }
                if (filters.status === 'pending') {
                    if (t.type !== 'expense') return false;
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
            category: data.category
        });
    }

    async checkRecurringExpenses() {
        if (!auth.currentUser) return;

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        try {
            const subscriptions = await this.getSubscriptions();

            for (const sub of subscriptions) {
                if (sub.active === false) continue;
                if (sub.lastGenerated === currentMonth) continue;

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
                    type: 'expense',
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

class UIController {
    constructor(financeManager) {
        this.fm = financeManager;
        this.chart = null;
        this.currentFilters = {
            startDate: '',
            endDate: '',
            type: '',
            category: '',
            status: '',
            search: ''
        };
        this.pendingDeleteId = null;
        this.pendingImportData = null;

        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.mousedownTarget = null;

        this.btnLogin = document.getElementById('btnLogin');
        this.loginText = document.getElementById('loginText');
        this.userInfo = document.getElementById('userInfo');
        this.userAvatar = document.getElementById('userAvatar');
        this.userDropdown = document.getElementById('userDropdown');
        this.btnLogout = document.getElementById('btnLogout');
        this.userName = document.getElementById('userName');
        this.userEmail = document.getElementById('userEmail');
        this.btnImportMenu = document.getElementById('btnImportMenu');
        this.btnExportMenu = document.getElementById('btnExportMenu');
        this.btnEmailToggle = document.getElementById('btnEmailToggle');
        this.txtEmailToggle = document.getElementById('txtEmailToggle');

        this.initElements();
        this.initEventListeners();

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');


        this.setDefaultDate();
        this.render();
    }

    initElements() {
        this.balanceValue = document.getElementById('balanceValue');
        this.balanceLabel = document.querySelector('.card.balance .card-label');
        this.incomeValue = document.getElementById('incomeValue');
        this.expenseValue = document.getElementById('expenseValue');
        this.incomeLabel = document.getElementById('incomeLabel');
        this.expenseLabel = document.getElementById('expenseLabel');

        this.chartCanvas = document.getElementById('categoryChart');
        this.noChartData = document.getElementById('noChartData');
        this.incomeChartCanvas = document.getElementById('incomeChart');
        this.noIncomeData = document.getElementById('noIncomeData');

        this.searchInput = document.getElementById('searchInput');
        this.btnOpenFilters = document.getElementById('btnOpenFilters');
        this.activeFiltersContainer = document.getElementById('activeFilters');

        this.filterModal = document.getElementById('filterModal');
        this.filterForm = document.getElementById('filterForm');
        this.filterStartDate = document.getElementById('filterStartDate');
        this.filterEndDate = document.getElementById('filterEndDate');
        this.filterType = document.getElementById('filterType');
        this.filterCategory = document.getElementById('filterCategory');
        this.filterStatus = document.getElementById('filterStatus');
        this.btnClearFilters = document.getElementById('btnClearFilters');
        this.btnApplyFilters = document.getElementById('btnApplyFilters');
        this.closeFilterModal = document.getElementById('closeFilterModal');

        this.transactionsList = document.getElementById('transactionsList');
        this.transactionCount = document.getElementById('transactionCount');
        this.noTransactions = document.getElementById('noTransactions');

        this.editModal = document.getElementById('editModal');
        this.editForm = document.getElementById('editForm');
        this.modalTitle = document.getElementById('modalTitle');
        this.deleteModal = document.getElementById('deleteModal');
        this.deleteInfo = document.getElementById('deleteInfo');
        this.importModal = document.getElementById('importModal');

        this.btnExport = document.getElementById('btnExport');
        this.btnImport = document.getElementById('btnImport');
        this.btnAddTransaction = document.getElementById('btnAddTransaction');
        this.fileInput = document.getElementById('fileInput');

        this.paginationControls = document.getElementById('paginationControls');
        this.btnPrevPage = document.getElementById('btnPrevPage');
        this.btnNextPage = document.getElementById('btnNextPage');
        this.pageInfo = document.getElementById('pageInfo');
        this.loginOverlay = document.getElementById('loginOverlay');
        this.btnLoginOverlay = document.getElementById('btnLoginOverlay');

        this.toast = document.getElementById('toast');

        this.subsModal = document.getElementById('subsModal');
        this.subsForm = document.getElementById('subsForm');
        this.subsList = document.getElementById('subsList');
        this.noSubs = document.getElementById('noSubs');
        this.btnSubscriptions = document.getElementById('btnSubscriptions');
        this.subsTotalValue = document.getElementById('subsTotalValue');

        this.cancelSubModal = document.getElementById('cancelSubModal');
        this.cancelSubInfo = document.getElementById('cancelSubInfo');
        this.cancelingSubId = null;

        this.deleteSubModal = document.getElementById('deleteSubModal');
        this.deleteSubInfo = document.getElementById('deleteSubInfo');
        this.deletingSubId = null;

        this.unsubscribeModal = document.getElementById('unsubscribeModal');
        this.closeUnsubscribeModal = document.getElementById('closeUnsubscribeModal');
        this.confirmUnsubscribe = document.getElementById('confirmUnsubscribe');

        this.isEditing = false;
        this.editingId = null;
    }

    initEventListeners() {
        this.btnLogin.addEventListener('click', () => this.handleAuthClick());

        this.userAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            this.userDropdown.classList.toggle('active');
        });

        this.btnLogout.addEventListener('click', () => {
            this.fm.clear();
            auth.signOut();
            this.userDropdown.classList.remove('active');
            this.render();
            this.showToast('Você saiu com sucesso.', 'success');
        });

        this.btnLoginOverlay.addEventListener('click', () => this.handleAuthClick());

        this.btnPrevPage.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.render();
            }
        });

        this.btnNextPage.addEventListener('click', () => {
            const totalPages = Math.ceil(this.fm.getFilteredTransactions(this.currentFilters).length / this.itemsPerPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.render();
            }
        });

        document.addEventListener('click', (e) => {
            if (!this.userDropdown.contains(e.target) && !this.userAvatar.contains(e.target)) {
                this.userDropdown.classList.remove('active');
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModals = Array.from(document.querySelectorAll('.modal.active'));
                if (activeModals.length > 0) {
                    activeModals.sort((a, b) => {
                        const zA = parseInt(window.getComputedStyle(a).zIndex) || 1000;
                        const zB = parseInt(window.getComputedStyle(b).zIndex) || 1000;
                        return zB - zA;
                    });

                    const topModal = activeModals[0];
                    this.closeModal(topModal);
                    e.stopImmediatePropagation();
                    e.preventDefault();

                    if (topModal.id === 'editModal') {
                        topModal.style.zIndex = '';
                    }
                }
            }
        });

        auth.onAuthStateChanged(async (user) => {
            this.updateAuthUI(user);
            if (user) {
                await this.fm.initListener(user, () => {
                    this.render();
                });
                await this.fm.checkRecurringExpenses();
            } else {
                this.fm.stopListener();
                this.fm.clear();
                this.render();
            }
        });

        window.addEventListener('online', async () => {
            this.showToast('Conexão restabelecida!', 'success');
        });

        window.addEventListener('offline', () => {
            this.showToast('Você está offline. Alterações serão salvas localmente.', 'info');
        });

        this.btnAddTransaction.addEventListener('click', () => this.openAddModal());

        this.searchInput.addEventListener('input', () => {
            this.currentFilters.search = this.searchInput.value;
            this.currentPage = 1;
            this.renderDashboard();
            this.renderChart();
            this.renderIncomeChart();
            this.renderTransactionsList();
        });

        this.btnOpenFilters.addEventListener('click', () => this.openFilterModal());
        if (this.closeFilterModal) {
            this.closeFilterModal.addEventListener('click', () => this.closeModal(this.filterModal));
        }

        this.filterStartDate.addEventListener('change', () => {
            this.filterEndDate.min = this.filterStartDate.value;
            if (this.filterEndDate.value && this.filterEndDate.value < this.filterStartDate.value) {
                this.filterEndDate.value = this.filterStartDate.value;
            }
        });

        this.filterEndDate.addEventListener('change', () => {
            this.filterStartDate.max = this.filterEndDate.value;
            if (this.filterStartDate.value && this.filterStartDate.value > this.filterEndDate.value) {
                this.filterStartDate.value = this.filterEndDate.value;
            }
        });

        this.btnClearFilters.addEventListener('click', () => {
            this.filterForm.reset();

            this.currentFilters = {
                startDate: '',
                endDate: '',
                type: '',
                category: '',
                status: '',
                search: this.currentFilters.search
            };

            this.setDatePickerValue(this.filterStartDate, '');
            this.setDatePickerValue(this.filterEndDate, '');

            if (this.filterStartDate._flatpickr) this.filterStartDate._flatpickr.set('maxDate', '');
            if (this.filterEndDate._flatpickr) this.filterEndDate._flatpickr.set('minDate', '');

            this.filterType.dispatchEvent(new Event('change', { bubbles: true }));
            this.filterCategory.dispatchEvent(new Event('change', { bubbles: true }));
            this.filterStatus.dispatchEvent(new Event('change', { bubbles: true }));

            this.updateFilterOptions();
            this.renderActiveFilters();
            this.currentPage = 1;
            this.render();
        });

        this.btnApplyFilters.addEventListener('click', () => {
            this.currentFilters.startDate = this.filterStartDate.value;
            this.currentFilters.endDate = this.filterEndDate.value;
            this.currentFilters.type = this.filterType.value;
            this.currentFilters.category = this.filterCategory.value;

            if (this.filterType.value === 'income') {
                this.filterStatus.value = '';
                this.filterStatus.dispatchEvent(new Event('change', { bubbles: true }));
                this.currentFilters.status = '';
            } else {
                this.currentFilters.status = this.filterStatus.value;
            }

            this.currentPage = 1;
            this.closeModal(this.filterModal, true);
            this.render();
        });

        this.filterType.addEventListener('change', () => {
            this.updateFilterOptions();
        });

        this.btnExport.addEventListener('click', () => {
            this.handleExport();
        });

        this.btnExportMenu.addEventListener('click', () => {
            this.handleExport();
            this.userDropdown.classList.remove('active');
        });

        this.btnImport.addEventListener('click', () => this.fileInput.click());

        this.btnImportMenu.addEventListener('click', () => {
            this.fileInput.click();
            this.userDropdown.classList.remove('active');
        });

        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        document.getElementById('closeEditModal').addEventListener('click', () => this.closeModal(this.editModal));
        document.getElementById('cancelEdit').addEventListener('click', () => this.closeModal(this.editModal));
        this.editForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        document.getElementById('editType').addEventListener('change', () => this.updateEditCategoryOptions());

        const recurringCheckbox = document.getElementById('isRecurring');
        const recurringOptions = document.getElementById('recurringOptions');
        recurringCheckbox.addEventListener('change', (e) => {
            recurringOptions.style.display = e.target.checked ? 'flex' : 'none';
        });

        document.getElementById('closeDeleteModal').addEventListener('click', () => this.closeModal(this.deleteModal));
        document.getElementById('cancelDelete').addEventListener('click', () => this.closeModal(this.deleteModal));
        document.getElementById('confirmDelete').addEventListener('click', () => this.handleDeleteConfirm());

        document.getElementById('deleteSingle').addEventListener('click', () => this.handleSeriesDelete('single'));
        document.getElementById('deleteFuture').addEventListener('click', () => this.handleSeriesDelete('future'));
        document.getElementById('deleteAll').addEventListener('click', () => this.handleSeriesDelete('all'));
        document.getElementById('cancelSeriesDelete').addEventListener('click', () => this.closeModal(this.deleteModal));

        document.getElementById('closeSeriesModal').addEventListener('click', () => this.closeModal(document.getElementById('seriesModal')));

        document.getElementById('closeImportModal').addEventListener('click', () => this.closeModal(this.importModal));
        document.getElementById('cancelImport').addEventListener('click', () => this.closeModal(this.importModal));
        document.getElementById('mergeImport').addEventListener('click', () => this.handleImportConfirm(false));
        document.getElementById('replaceImport').addEventListener('click', () => this.handleImportConfirm(true));

        const amountInput = document.getElementById('editAmount');
        amountInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value === '') value = '0';
            const amount = (parseInt(value) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            e.target.value = amount;
        });

        const seriesModal = document.getElementById('seriesModal');
        const allModals = [
            this.editModal,
            this.deleteModal,
            this.importModal,
            this.filterModal,
            seriesModal,
            this.subsModal,
            this.cancelSubModal,
            this.deleteSubModal
        ];

        allModals.forEach(modal => {
            if (modal) {
                modal.addEventListener('mousedown', (e) => {
                    this.mousedownTarget = e.target;
                });

                modal.addEventListener('click', (e) => {
                    if (e.target === modal && this.mousedownTarget === modal) {
                        this.closeModal(modal);
                    }
                });
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal(this.editModal);
                this.closeModal(this.deleteModal);
                this.closeModal(this.importModal);
                this.closeModal(this.filterModal);
                this.closeModal(seriesModal);
                this.closeModal(this.subsModal);
                this.closeModal(this.cancelSubModal);
                this.closeModal(this.deleteSubModal);
            }
        });

        const btnPrivacy = document.getElementById('btnPrivacy');
        const privacyIconShow = document.getElementById('privacyIconShow');
        const privacyIconHide = document.getElementById('privacyIconHide');

        if (localStorage.getItem('privacyMode') === 'true') {
            document.body.classList.add('privacy-mode');
            btnPrivacy.classList.add('active');
            privacyIconShow.style.display = 'none';
            privacyIconHide.style.display = 'block';
        }

        btnPrivacy.addEventListener('click', () => {
            const isActive = document.body.classList.toggle('privacy-mode');
            btnPrivacy.classList.toggle('active', isActive);
            privacyIconShow.style.display = isActive ? 'none' : 'block';
            privacyIconHide.style.display = isActive ? 'block' : 'none';
            localStorage.setItem('privacyMode', isActive);
            this.showToast(isActive ? 'Modo privacidade ativado' : 'Modo privacidade desativado', 'success');
        });

        this.btnSubscriptions.addEventListener('click', () => {
            this.userDropdown.classList.remove('active');
            this.openSubsModal();
        });

        document.getElementById('closeSubsModal').addEventListener('click', () => this.closeModal(this.subsModal));
        document.getElementById('cancelSubs').addEventListener('click', () => this.closeModal(this.subsModal));

        document.getElementById('btnAddSub').addEventListener('click', () => this.showSubsFormView(false));
        document.getElementById('backToSubsList').addEventListener('click', () => this.showSubsListView());

        const subsAmountInput = document.getElementById('subsAmount');
        subsAmountInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value === '') value = '0';
            const amount = (parseInt(value) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            e.target.value = amount;
        });

        this.subsForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const rawAmount = document.getElementById('subsAmount').value;
            const amount = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.'));
            const day = parseInt(document.getElementById('subsDay').value);
            const editId = document.getElementById('subsEditId').value;

            if (amount <= 0) {
                this.showToast('O valor deve ser maior que zero', 'error');
                return;
            }

            if (day < 1 || day > 31) {
                this.showToast('Dia deve ser entre 1 e 31', 'error');
                return;
            }

            const data = {
                name: document.getElementById('subsName').value.trim(),
                amount: amount,
                day: day,
                category: document.getElementById('subsCategory').value
            };

            try {
                if (editId) {
                    await this.fm.updateSubscription(editId, data);
                    this.showToast('Despesa fixa atualizada!', 'success');
                } else {
                    await this.fm.addSubscription(data);
                    await this.fm.checkRecurringExpenses();
                    this.showToast('Despesa fixa adicionada!', 'success');
                }
                this.subsForm.reset();
                document.getElementById('subsEditId').value = '';
                this.showSubsListView();
                this.renderSubscriptionsList();
            } catch (error) {
                this.showToast('Erro ao salvar despesa fixa', 'error');
            }
        });

        document.getElementById('closeCancelSubModal').addEventListener('click', () => this.closeModal(this.cancelSubModal));
        document.getElementById('cancelSubNo').addEventListener('click', () => this.closeModal(this.cancelSubModal));

        document.getElementById('cancelSubYes').addEventListener('click', async () => {
            if (this.cancelingSubId) {
                await this.fm.cancelSubscription(this.cancelingSubId);
                this.closeModal(this.cancelSubModal);
                this.showToast('Despesa fixa cancelada', 'success');
                this.renderSubscriptionsList();
                this.cancelingSubId = null;
            }
        });

        document.getElementById('closeDeleteSubModal').addEventListener('click', () => this.closeModal(this.deleteSubModal));
        document.getElementById('cancelDeleteSub').addEventListener('click', () => this.closeModal(this.deleteSubModal));

        document.getElementById('confirmDeleteSub').addEventListener('click', async () => {
            if (this.deletingSubId) {
                try {
                    await this.fm.deleteSubscription(this.deletingSubId);
                    this.closeModal(this.deleteSubModal);
                    this.showToast('Assinatura excluída permanentemente', 'success');
                    this.renderSubscriptionsList();
                    this.deletingSubId = null;
                } catch (error) {
                    console.error('Erro ao excluir assinatura:', error);
                }
            }
        });

        if (this.btnEmailToggle) {
            this.btnEmailToggle.addEventListener('click', () => this.handleEmailToggle());
        }

        if (this.closeUnsubscribeModal) {
            this.closeUnsubscribeModal.addEventListener('click', () => this.closeModal(this.unsubscribeModal));
        }
        if (this.confirmUnsubscribe) {
            this.confirmUnsubscribe.addEventListener('click', () => this.closeModal(this.unsubscribeModal));
        }
    }

    setDefaultDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        this.setDatePickerValue(document.getElementById('editDate'), dateStr);
    }

    getCategoryColor(type, category) {
        if (type === 'income') return 'var(--income-color)';
        return EXPENSE_COLORS[category] || 'var(--text-primary)';
    }

    getCategoryColorBg(type, category) {
        if (type === 'income') return 'rgba(34, 197, 94, 0.1)';
        const color = EXPENSE_COLORS[category];
        return color ? color + '20' : 'rgba(255, 255, 255, 0.05)';
    }

    updateEditCategoryOptions(preserveValue = null) {
        const type = document.getElementById('editType').value;
        const categorySelect = document.getElementById('editCategory');

        const categories = CATEGORIES[type] || {};

        categorySelect.innerHTML = '';

        for (const [key, icon] of Object.entries(categories)) {
            const label = CATEGORY_NAMES[key] || key;
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${icon} ${label}`;
            categorySelect.appendChild(option);
        }

        if (preserveValue && categories[preserveValue]) {
            categorySelect.value = preserveValue;
        }
    }

    render() {
        this.renderActiveFilters();
        this.renderDashboard();

        const typeFilter = this.currentFilters.type;
        if (!typeFilter || typeFilter === 'expense') {
            this.renderChart();
        } else {
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
                this.noChartData.style.display = 'block';
                this.chartCanvas.style.display = 'none';
            }
        }

        if (!typeFilter || typeFilter === 'income') {
            this.renderIncomeChart();
        } else {
            if (this.incomeChart) {
                this.incomeChart.destroy();
                this.incomeChart = null;
                this.noIncomeData.style.display = 'block';
                this.incomeChartCanvas.style.display = 'none';
            }
        }

        this.updateFilterOptions();
        this.renderTransactionsList();
    }

    renderActiveFilters() {
        this.activeFiltersContainer.innerHTML = '';
        const filters = [];

        if (this.currentFilters.startDate) {
            const [y, m, d] = this.currentFilters.startDate.split('-');
            filters.push({ key: 'startDate', label: `Início: ${d}/${m}/${y}` });
        }
        if (this.currentFilters.endDate) {
            const [y, m, d] = this.currentFilters.endDate.split('-');
            filters.push({ key: 'endDate', label: `Fim: ${d}/${m}/${y}` });
        }
        if (this.currentFilters.type) {
            const label = this.currentFilters.type === 'income' ? 'Receitas' : 'Despesas';
            filters.push({ key: 'type', label: label });
        }
        if (this.currentFilters.category) {
            const name = CATEGORY_NAMES[this.currentFilters.category] || this.currentFilters.category;
            filters.push({ key: 'category', label: name });
        }
        if (this.currentFilters.status) {
            let label = this.currentFilters.status;
            if (label === 'overdue') label = '🚨 Vencidas';
            else if (label === 'pending') label = '📅 A Vencer';
            else if (label === 'paid') label = '✅ Pagas';
            filters.push({ key: 'status', label: label });
        }

        filters.forEach(filter => {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            chip.innerHTML = `
                <span>${filter.label}</span>
                <button type="button" aria-label="Remover filtro">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;
            chip.querySelector('button').addEventListener('click', () => this.removeFilter(filter.key));
            this.activeFiltersContainer.appendChild(chip);
        });
    }

    removeFilter(key) {
        this.currentFilters[key] = '';

        if (key === 'startDate') {
            this.setDatePickerValue(this.filterStartDate, '');
            if (this.filterEndDate._flatpickr) {
                this.filterEndDate._flatpickr.set('minDate', '');
            }
        }
        if (key === 'endDate') {
            this.setDatePickerValue(this.filterEndDate, '');
            if (this.filterStartDate._flatpickr) {
                this.filterStartDate._flatpickr.set('maxDate', '');
            }
        }
        if (key === 'type') {
            this.filterType.value = '';
            this.filterType.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (key === 'status') {
            this.filterStatus.value = '';
            this.filterStatus.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.updateFilterOptions();
        if (key === 'category') {
            this.filterCategory.value = '';
            this.filterCategory.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (key === 'search') this.searchInput.value = '';

        this.currentPage = 1;
        this.render();
    }

    renderDashboard() {
        const filters = {
            startDate: this.currentFilters.startDate || null,
            endDate: this.currentFilters.endDate || null,
            type: this.currentFilters.type || null,
            category: this.currentFilters.category || null,
            status: this.currentFilters.status || null,
            search: this.currentFilters.search || null
        };

        const totals = this.fm.getFilteredTotals(filters);

        let displayBalance;
        const isFiltered = filters.startDate || filters.endDate || filters.category || filters.search || filters.status;

        if (isFiltered) {
            displayBalance = totals.balance;
            this.balanceLabel.textContent = 'Resultado do Filtro';
        } else {
            displayBalance = this.fm.getBalance();
            this.balanceLabel.textContent = 'Saldo Atual';
        }

        const futureExpenses = this.fm.getFutureExpenses(filters);

        const overdueExpenses = this.fm.getOverdueExpenses(filters);

        this.balanceValue.textContent = this.formatCurrency(displayBalance);
        this.incomeValue.textContent = this.formatCurrency(totals.income);
        this.expenseValue.textContent = this.formatCurrency(totals.expense);

        const futureElement = document.getElementById('futureValue');
        const futureCard = document.querySelector('.card.future');
        if (futureElement && futureCard) {
            futureElement.textContent = this.formatCurrency(futureExpenses);
            if (futureExpenses === 0) {
                futureCard.style.display = 'none';
            } else {
                futureCard.style.display = 'flex';
            }
        }

        const overdueElement = document.getElementById('overdueValue');
        const overdueCard = document.querySelector('.card.overdue');
        if (overdueElement && overdueCard) {
            overdueElement.textContent = this.formatCurrency(overdueExpenses);
            if (overdueExpenses === 0) {
                overdueCard.style.display = 'none';
            } else {
                overdueCard.style.display = 'flex';
            }
        }
    }

    updateDashboardFiltered() {
        this.renderDashboard();
        this.renderTransactionsList();
    }

    renderChart() {
        const expenses = this.fm.getFilteredExpensesByCategory({
            startDate: this.currentFilters.startDate || null,
            endDate: this.currentFilters.endDate || null,
            category: this.currentFilters.category || null,
            status: this.currentFilters.status || null,
            search: this.currentFilters.search || null
        });
        const categories = Object.keys(expenses);
        this.expenseChartCategories = categories;

        if (categories.length === 0) {
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }
            this.chartCanvas.style.display = 'none';
            this.noChartData.style.display = 'block';

            const hasFilter = this.currentFilters.startDate || this.currentFilters.endDate || this.currentFilters.type || this.currentFilters.category || this.currentFilters.status || this.currentFilters.search;
            this.noChartData.textContent = hasFilter ? 'Sem dados para o filtro selecionado' : 'Adicione despesas para ver o gráfico';
            return;
        }

        this.chartCanvas.style.display = 'block';
        this.noChartData.style.display = 'none';

        const labels = categories.map(c => CATEGORY_NAMES[c] || c);
        const data = categories.map(c => expenses[c]);
        const colors = categories.map(c => EXPENSE_COLORS[c] || '#6b7280');

        if (this.chart) {
            this.chart.data.labels = labels;
            this.chart.data.datasets[0].data = data;
            this.chart.data.datasets[0].backgroundColor = colors;
            this.chart.update();
        } else {
            this.chart = new Chart(this.chartCanvas, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            onHover: (e) => e.native.target.style.cursor = 'pointer',
                            onLeave: (e) => e.native.target.style.cursor = 'default',
                            onClick: (e, legendItem, legend) => {
                                const index = legendItem.index;
                                const chart = legend.chart;
                                chart.toggleDataVisibility(index);
                                chart.update();

                                const category = this.expenseChartCategories[index];
                                if (this.fm.excludedCategories.has(category)) {
                                    this.fm.excludedCategories.delete(category);
                                } else {
                                    this.fm.excludedCategories.add(category);
                                }

                                setTimeout(() => {
                                    this.updateDashboardFiltered();
                                }, 0);
                            },
                            labels: {
                                color: 'rgba(255, 255, 255, 0.7)',
                                padding: 15,
                                font: {
                                    family: 'Inter',
                                    size: 12
                                },
                                generateLabels: (chart) => {
                                    const data = chart.data;
                                    if (data.labels.length && data.datasets.length) {
                                        return data.labels.map((label, i) => {
                                            const meta = chart.getDatasetMeta(0);
                                            const style = meta.controller.getStyle(i);

                                            return {
                                                text: label,
                                                fontColor: 'rgba(255, 255, 255, 0.7)',
                                                fillStyle: !chart.getDataVisibility(i) ? 'rgba(255, 255, 255, 0.1)' : style.backgroundColor,
                                                strokeStyle: !chart.getDataVisibility(i) ? 'rgba(255, 255, 255, 0.1)' : style.borderColor,
                                                lineWidth: style.borderWidth,
                                                hidden: !chart.getDataVisibility(i),
                                                index: i
                                            };
                                        });
                                    }
                                    return [];
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const value = context.raw;
                                    const total = context.dataset.data.reduce((acc, val, i) => {
                                        return context.chart.getDataVisibility(i) ? acc + val : acc;
                                    }, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${context.label}: ${this.formatCurrency(value)} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    cutout: '60%'
                }
            });
        }
    }

    renderIncomeChart() {
        const incomes = this.fm.getFilteredIncomesByCategory({
            startDate: this.currentFilters.startDate || null,
            endDate: this.currentFilters.endDate || null,
            category: this.currentFilters.category || null,
            status: this.currentFilters.status || null,
            search: this.currentFilters.search || null
        });
        const categories = Object.keys(incomes);
        this.incomeChartCategories = categories;

        if (categories.length === 0) {
            if (this.incomeChart) {
                this.incomeChart.destroy();
                this.incomeChart = null;
            }
            this.incomeChartCanvas.style.display = 'none';
            this.noIncomeData.style.display = 'block';

            const hasFilter = this.currentFilters.startDate || this.currentFilters.endDate || this.currentFilters.type || this.currentFilters.category || this.currentFilters.status || this.currentFilters.search;
            this.noIncomeData.textContent = hasFilter ? 'Sem dados para o filtro selecionado' : 'Adicione receitas para ver o gráfico';
            return;
        }

        this.incomeChartCanvas.style.display = 'block';
        this.noIncomeData.style.display = 'none';

        const labels = categories.map(c => CATEGORY_NAMES[c] || c);
        const data = categories.map(c => incomes[c]);
        const colors = categories.map(c => INCOME_COLORS[c] || '#22c55e');

        if (this.incomeChart) {
            this.incomeChart.data.labels = labels;
            this.incomeChart.data.datasets[0].data = data;
            this.incomeChart.data.datasets[0].backgroundColor = colors;
            this.incomeChart.update();
        } else {
            this.incomeChart = new Chart(this.incomeChartCanvas, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            onHover: (e) => e.native.target.style.cursor = 'pointer',
                            onLeave: (e) => e.native.target.style.cursor = 'default',
                            onClick: (e, legendItem, legend) => {
                                const index = legendItem.index;
                                const chart = legend.chart;
                                chart.toggleDataVisibility(index);
                                chart.update();

                                const category = this.incomeChartCategories[index];
                                if (this.fm.excludedIncomeCategories.has(category)) {
                                    this.fm.excludedIncomeCategories.delete(category);
                                } else {
                                    this.fm.excludedIncomeCategories.add(category);
                                }

                                setTimeout(() => {
                                    this.updateDashboardFiltered();
                                }, 0);
                            },
                            labels: {
                                color: 'rgba(255, 255, 255, 0.7)',
                                padding: 15,
                                font: {
                                    family: 'Inter',
                                    size: 12
                                },
                                generateLabels: (chart) => {
                                    const data = chart.data;
                                    if (data.labels.length && data.datasets.length) {
                                        return data.labels.map((label, i) => {
                                            const meta = chart.getDatasetMeta(0);
                                            const style = meta.controller.getStyle(i);

                                            return {
                                                text: label,
                                                fontColor: 'rgba(255, 255, 255, 0.7)',
                                                fillStyle: !chart.getDataVisibility(i) ? 'rgba(255, 255, 255, 0.1)' : style.backgroundColor,
                                                strokeStyle: !chart.getDataVisibility(i) ? 'rgba(255, 255, 255, 0.1)' : style.borderColor,
                                                lineWidth: style.borderWidth,
                                                hidden: !chart.getDataVisibility(i),
                                                index: i
                                            };
                                        });
                                    }
                                    return [];
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const value = context.raw;
                                    const total = context.dataset.data.reduce((acc, val, i) => {
                                        return context.chart.getDataVisibility(i) ? acc + val : acc;
                                    }, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${context.label}: ${this.formatCurrency(value)} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    cutout: '60%'
                }
            });
        }
    }

    updateFilterOptions() {
        const selectedType = this.filterType.value;
        const previousCategory = this.filterCategory.value;

        const filterStatusContainer = this.filterStatus.closest('.form-group');
        if (filterStatusContainer) {
            if (selectedType === 'income') {
                filterStatusContainer.style.display = 'none';
            } else {
                filterStatusContainer.style.display = 'block';
            }
        }

        const categories = this.fm.getAvailableCategories();
        this.filterCategory.innerHTML = '<option value="">🔍 Todas as categorias</option>';

        const uniqueOptions = new Set();

        categories.forEach(c => {
            const isExpense = CATEGORIES.expense[c] || c === 'outros';
            const isIncome = CATEGORIES.income[c] || c === 'outros_receita';

            if (selectedType === 'expense' && !isExpense) return;
            if (selectedType === 'income' && !isIncome) return;

            let key = c;
            let emoji = CATEGORIES.expense[c] || CATEGORIES.income[c] || '';
            let name = CATEGORY_NAMES[c] || c;

            if (c === 'outros' || c === 'outros_receita') {
                key = 'outros';
                emoji = '📦';
                name = 'Outros';
            }

            if (!uniqueOptions.has(key)) {
                uniqueOptions.add(key);
                this.filterCategory.innerHTML += `<option value="${key}">${emoji} ${name}</option>`;
            }
        });

        if (previousCategory && uniqueOptions.has(previousCategory)) {
            this.filterCategory.value = previousCategory;
        }
    }

    renderTransactionsList() {
        let transactions = this.fm.getFilteredTransactions(this.currentFilters);

        if (this.transactionCount) {
            this.transactionCount.textContent = `(${transactions.length})`;
        }

        this.transactionsList.innerHTML = '';

        const hasFilter = this.currentFilters.startDate || this.currentFilters.endDate || this.currentFilters.type || this.currentFilters.category || this.currentFilters.status || this.currentFilters.search;

        if (transactions.length === 0) {
            this.noTransactions.style.display = 'flex';
            this.paginationControls.style.display = 'none';

            const title = this.noTransactions.querySelector('h3');
            const msg = this.noTransactions.querySelector('p');

            if (hasFilter) {
                title.textContent = 'Nenhuma transação encontrada';
                msg.textContent = 'Tente ajustar os filtros para ver mais resultados.';
            } else {
                title.textContent = 'Nenhuma transação ainda';
                msg.textContent = 'Clique em "+ Adicionar" para começar a controlar seus gastos!';
            }
            return;
        }

        this.noTransactions.style.display = 'none';
        this.paginationControls.style.display = 'flex';

        const totalItems = transactions.length;
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);

        if (this.currentPage > totalPages) this.currentPage = totalPages || 1;
        if (this.currentPage < 1) this.currentPage = 1;

        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const pageItems = transactions.slice(start, end);

        this.pageInfo.textContent = `Página ${this.currentPage} de ${totalPages}`;
        if (this.currentPage === 1) {
            this.btnPrevPage.classList.add('disabled');
        } else {
            this.btnPrevPage.classList.remove('disabled');
        }
        this.btnPrevPage.removeAttribute('disabled');

        if (this.currentPage >= totalPages) {
            this.btnNextPage.classList.add('disabled');
        } else {
            this.btnNextPage.classList.remove('disabled');
        }
        this.btnNextPage.removeAttribute('disabled');

        pageItems.forEach(t => {
            const el = document.createElement('div');

            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

            let statusClass = '';
            if (t.isPaid) {
                statusClass = 'paid';
            } else if (t.type === 'expense') {
                if (t.date < todayStr) {
                    statusClass = 'overdue';
                } else if (t.date === todayStr || t.date === tomorrowStr) {
                    statusClass = 'due-today';
                }
            }
            el.className = `transaction-item ${t.type} ${statusClass}`.trim();

            let icon = CATEGORIES[t.type]?.[t.category];
            if (!icon) {
                icon = CATEGORIES.expense[t.category] || CATEGORIES.income[t.category];
            }
            icon = icon || (t.type === 'expense' ? '💸' : '💰');
            const categoryName = CATEGORY_NAMES[t.category] || t.category;
            const sign = t.type === 'income' ? '+' : '-';
            const date = new Date(t.date + 'T12:00:00');
            const hasSeries = t.groupId;
            const isPaid = t.isPaid === true;
            const paidClass = isPaid ? 'checked' : '';

            el.innerHTML = `
                <div class="transaction-info">
                    <div class="transaction-icon" style="background: ${this.getCategoryColorBg(t.type, t.category)}; color: ${this.getCategoryColor(t.type, t.category)}">
                        ${icon}
                    </div>
                    <div class="transaction-details">
                        <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0;">
                            <span class="transaction-desc" title="${this.escapeHtml(t.description)}">${this.escapeHtml(t.description)}</span>
                            ${t.subscriptionId ? `
                                <span class="subscription-badge" title="Despesa Recorrente">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                                    </svg>
                                </span>
                            ` : ''}
                        </div>
                        <div class="transaction-meta">
                            ${this.formatDate(t.date)} ${t.category ? `• ${this.getCategoryName(t.category)}` : ''} 
                        </div>
                    </div>
                </div>
                <div class="transaction-actions">
                    <span class="transaction-amount ${t.type}">
                        ${sign} ${this.formatCurrency(t.amount)}
                    </span>
                    <div class="action-buttons">
                        ${hasSeries ? `
                        <button class="action-btn series-btn" onclick="app.openSeriesModal('${t.groupId}')" title="Ver Série">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                                <polyline points="2 17 12 22 22 17"></polyline>
                                <polyline points="2 12 12 17 22 12"></polyline>
                            </svg>
                        </button>
                        ` : ''}
                        ${t.type === 'expense' ? `
                        <button class="action-btn paid-btn ${paidClass}" onclick="app.togglePaid('${t.id}')" title="${isPaid ? 'Marcar como não pago' : 'Marcar como pago'}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </button>
                        ` : ''}
                        <button class="action-btn edit" onclick="app.openEditModal('${t.id}')" title="Editar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="action-btn delete" onclick="app.openDeleteModal('${t.id}')" title="Excluir">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            el.querySelector('.edit').addEventListener('click', () => this.openEditModal(t.id));
            el.querySelector('.delete').addEventListener('click', () => this.openDeleteModal(t.id));

            this.transactionsList.appendChild(el);
        });
    }

    togglePaid(id) {
        this.fm.togglePaid(id);
        this.render();

        const seriesModal = document.getElementById('seriesModal');
        if (seriesModal && seriesModal.classList.contains('active')) {
            const t = this.fm.get(id);
            if (t && t.groupId) {
                this.openSeriesModal(t.groupId);
            }
        }
    }

    openFilterModal() {
        this.setDatePickerValue(this.filterStartDate, this.currentFilters.startDate);
        this.setDatePickerValue(this.filterEndDate, this.currentFilters.endDate);
        this.filterType.value = this.currentFilters.type;

        this.filterType.dispatchEvent(new Event('change', { bubbles: true }));
        this.updateFilterOptions();

        this.filterCategory.value = this.currentFilters.category;
        this.filterCategory.dispatchEvent(new Event('change', { bubbles: true }));

        this.filterStatus.value = this.currentFilters.status;
        this.filterStatus.dispatchEvent(new Event('change', { bubbles: true }));

        this.openModal(this.filterModal);
    }

    openAddModal() {
        this.isEditing = false;
        this.editingId = null;
        this.modalTitle.textContent = 'Nova Transação';

        document.getElementById('editId').value = '';
        document.getElementById('editDescription').value = '';
        document.getElementById('editAmount').value = '';
        document.getElementById('editType').value = 'expense';
        document.getElementById('editType').dispatchEvent(new Event('change', { bubbles: true }));

        const isRecurringInput = document.getElementById('isRecurring');
        const recurringGroup = isRecurringInput.closest('.checkbox-group');

        isRecurringInput.checked = false;
        isRecurringInput.disabled = false;
        if (recurringGroup) recurringGroup.style.display = 'flex';

        document.getElementById('recurringOptions').style.display = 'none';

        document.getElementById('recurringInstallments').value = '';

        this.updateEditCategoryOptions();
        this.setDefaultDate();

        this.openModal(this.editModal);
    }

    openEditModal(id) {
        const t = this.fm.get(id);
        if (!t) return;

        this.isEditing = true;
        this.editingId = id;
        this.modalTitle.textContent = 'Editar Transação';

        document.getElementById('editId').value = t.id;
        document.getElementById('editDescription').value = t.description;
        document.getElementById('editAmount').value = t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        this.setDatePickerValue(document.getElementById('editDate'), t.date);
        document.getElementById('editType').value = t.type;
        document.getElementById('editType').dispatchEvent(new Event('change', { bubbles: true }));

        const isRecurringInput = document.getElementById('isRecurring');
        const recurringGroup = isRecurringInput.closest('.checkbox-group');

        if (recurringGroup) recurringGroup.style.display = 'none';

        isRecurringInput.checked = t.isRecurring || false;
        isRecurringInput.disabled = true;
        document.getElementById('recurringOptions').style.display = 'none';

        this.updateEditCategoryOptions(t.category);
        document.getElementById('editCategory').dispatchEvent(new Event('change', { bubbles: true }));

        this.editModal.style.zIndex = '1010';
        this.openModal(this.editModal);
    }

    handleFormSubmit(e) {
        e.preventDefault();

        const rawAmount = document.getElementById('editAmount').value;
        const parseAmount = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.'));

        if (parseAmount <= 0) {
            this.showToast('O valor deve ser maior que zero', 'error');
            return;
        }

        const data = {
            description: document.getElementById('editDescription').value.trim(),
            amount: parseAmount,
            date: document.getElementById('editDate').value,
            type: document.getElementById('editType').value,
            category: document.getElementById('editCategory').value
        };

        const isRecurring = document.getElementById('isRecurring').checked;
        if (isRecurring && !this.isEditing) {
            const installments = parseInt(document.getElementById('recurringInstallments').value);
            if (!installments || installments < 2) {
                this.showToast('Informe o número de parcelas (mínimo 2)', 'error');
                document.getElementById('recurringInstallments').focus();
                return;
            }
            data.isRecurring = true;
            data.installments = installments;
        }

        const syncErrorCallback = () => {
            this.showToast('Erro ao sincronizar com a nuvem. Será sincronizado ao reconectar.', 'error');
        };

        const offlineCallback = () => {
            this.showToast('Você está offline. Será sincronizado ao reconectar.', 'info');
        };

        if (this.isEditing && this.editingId) {
            this.fm.update(this.editingId, data, syncErrorCallback, offlineCallback);
            this.showToast('Transação atualizada!', 'success');

            const seriesModal = document.getElementById('seriesModal');
            if (seriesModal && seriesModal.classList.contains('active')) {
                const t = this.fm.get(this.editingId);
                if (t && t.groupId) {
                    this.openSeriesModal(t.groupId);
                }
            }
        } else {
            this.fm.add(data, syncErrorCallback, offlineCallback);
            this.showToast(data.installments ? 'Parcelas geradas com sucesso!' : 'Transação adicionada!', 'success');
        }

        this.closeModal(this.editModal, true);
        this.render();
    }

    openDeleteModal(id) {
        const t = this.fm.get(id);
        if (!t) return;

        this.pendingDeleteId = id;
        this.pendingDeleteGroup = t.groupId || null;
        this.pendingDeleteDate = t.date;

        const sign = t.type === 'income' ? '+' : '-';
        const safeDesc = this.escapeHtml(t.description);

        this.deleteInfo.innerHTML = `
            <span class="delete-desc" title="${safeDesc}">${safeDesc}</span>
            <span class="delete-amount">${sign} ${this.formatCurrency(t.amount)}</span>
        `;

        const defaultActions = document.getElementById('defaultDeleteActions');
        const seriesActions = document.getElementById('seriesDeleteActions');

        if (this.pendingDeleteGroup) {
            defaultActions.style.display = 'none';
            seriesActions.style.display = 'grid';
        } else {
            defaultActions.style.display = 'flex';
            seriesActions.style.display = 'none';
        }

        this.openModal(this.deleteModal);
    }

    handleDeleteConfirm() {
        if (this.pendingDeleteId) {
            this.handleSeriesDelete('single');
        }
    }

    handleSeriesDelete(mode) {
        if (!this.pendingDeleteId) return;

        const syncErrorCallback = () => {
            this.showToast('Erro ao sincronizar com a nuvem. Será sincronizado ao reconectar.', 'error');
        };

        const offlineCallback = () => {
            this.showToast('Você está offline. Será sincronizado ao reconectar.', 'info');
        };

        const success = this.fm.deleteSeries(
            this.pendingDeleteGroup,
            mode,
            this.pendingDeleteDate,
            this.pendingDeleteId,
            syncErrorCallback,
            offlineCallback
        );

        if (success) {
            this.pendingDeleteId = null;
            this.pendingDeleteGroup = null;
            this.pendingDeleteDate = null;
            this.closeModal(this.deleteModal, true);
            this.render();

            let msg = 'Transação excluída!';
            if (mode === 'future') msg = 'Transações futuras excluídas!';
            if (mode === 'all') msg = 'Série excluída com sucesso!';
            this.showToast(msg, 'success');
        }
    }


    togglePaid(id) {
        this.fm.togglePaid(id);
        this.render();

        const seriesModal = document.getElementById('seriesModal');
        if (seriesModal && seriesModal.classList.contains('active')) {
            const t = this.fm.get(id);
            if (t && t.groupId) {
                this.openSeriesModal(t.groupId);
            }
        }
    }

    handleFormSubmit(e) {
        e.preventDefault();

        const rawAmount = document.getElementById('editAmount').value;
        const parseAmount = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.'));

        if (parseAmount <= 0) {
            this.showToast('O valor deve ser maior que zero', 'error');
            return;
        }

        const data = {
            description: document.getElementById('editDescription').value.trim(),
            amount: parseAmount,
            date: document.getElementById('editDate').value,
            type: document.getElementById('editType').value,
            category: document.getElementById('editCategory').value
        };

        const isRecurring = document.getElementById('isRecurring').checked;
        if (isRecurring && !this.isEditing) {
            const installments = parseInt(document.getElementById('recurringInstallments').value);
            if (!installments || installments < 2) {
                this.showToast('Informe o número de parcelas (mínimo 2)', 'error');
                document.getElementById('recurringInstallments').focus();
                return;
            }
            data.isRecurring = true;
            data.installments = installments;
        }

        const syncErrorCallback = () => {
            this.showToast('Erro ao sincronizar com a nuvem. Será sincronizado ao reconectar.', 'error');
        };

        const offlineCallback = () => {
            this.showToast('Você está offline. Será sincronizado ao reconectar.', 'info');
        };

        if (this.isEditing && this.editingId) {
            this.fm.update(this.editingId, data, syncErrorCallback, offlineCallback);
            this.showToast('Transação atualizada!', 'success');

            const seriesModal = document.getElementById('seriesModal');
            if (seriesModal && seriesModal.classList.contains('active')) {
                const t = this.fm.get(this.editingId);
                if (t && t.groupId) {
                    this.openSeriesModal(t.groupId);
                }
            }
        } else {
            this.fm.add(data, syncErrorCallback, offlineCallback);
            this.showToast(data.installments ? 'Parcelas geradas com sucesso!' : 'Transação adicionada!', 'success');
        }

        this.closeModal(this.editModal, true);
        this.render();
    }

    openSeriesModal(groupId) {
        const transactions = this.fm.getGroupTransactions(groupId);
        if (!transactions || transactions.length === 0) return;

        this.seriesModal = document.getElementById('seriesModal');
        const listContainer = document.getElementById('seriesList');
        const summaryContainer = document.getElementById('seriesSummary');

        listContainer.innerHTML = '';

        const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
        const remainingAmount = transactions
            .filter(t => !t.isPaid)
            .reduce((sum, t) => sum + t.amount, 0);

        summaryContainer.innerHTML = `
            <div class="series-stat">
                <span>Total da Série</span>
                <strong>${this.formatCurrency(totalAmount)}</strong>
            </div>
            <div class="series-stat">
                <span>Restante a Pagar</span>
                <strong>${this.formatCurrency(remainingAmount)}</strong>
            </div>
        `;

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

        transactions.forEach(t => {
            const isPaid = t.isPaid === true;
            let statusClass = 'future';

            if (isPaid) {
                statusClass = 'paid';
            } else {
                if (t.date < todayStr) {
                    statusClass = 'overdue';
                } else if (t.date === todayStr || t.date === tomorrowStr) {
                    statusClass = 'due-today';
                }
            }

            const div = document.createElement('div');
            div.className = `series-item ${statusClass}`;

            const icon = CATEGORIES.expense[t.category] || CATEGORIES.income[t.category] || '📦';

            div.innerHTML = `
            <div style="display: flex; align-items: center; flex: 1; min-width: 0;">
                <span class="transaction-icon" style="margin-right: 1rem; background: ${this.getCategoryColorBg(t.type, t.category)}; color: ${this.getCategoryColor(t.type, t.category)}">${icon}</span>
                <div class="series-item-info">
                    <span class="series-desc" title="${this.escapeHtml(t.description)}">${this.escapeHtml(t.description)}</span>
                    <span class="series-date">${this.formatDate(t.date)} • ${CATEGORY_NAMES[t.category] || t.category}</span>
                </div>
            </div>
            
            <div class="series-item-actions">
                <button class="series-action-btn btn-pay" title="${isPaid ? 'Marcar como não pago' : 'Marcar como pago'}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </button>
                
                <button class="series-action-btn btn-edit" title="Editar">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>

                <span class="series-item-amount currency-${t.type}">
                    ${this.formatCurrency(t.amount)}
                </span>
            </div>
        `;

            div.querySelector('.btn-pay').addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePaid(t.id);
            });

            div.querySelector('.btn-edit').addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEditModal(t.id);
            });

            listContainer.appendChild(div);
        });

        this.openModal(this.seriesModal);
    }

    async openSubsModal() {
        this.showSubsListView();
        this.renderSubscriptionsList();
        this.openModal(this.subsModal);

        this.fm.onSubsUpdateCallback = () => {
            if (this.subsModal.classList.contains('active')) {
                this.renderSubscriptionsList();
            }
        };
    }

    renderSubscriptionsList() {
        this.subsList.innerHTML = '';

        try {
            const subscriptions = this.fm.getSubscriptions();

            if (subscriptions.length === 0) {
                this.noSubs.style.display = 'block';
                if (this.subsTotalValue) this.subsTotalValue.textContent = this.formatCurrency(0);
                return;
            }

            this.noSubs.style.display = 'none';

            const total = subscriptions
                .filter(sub => sub.active !== false)
                .reduce((sum, sub) => sum + (parseFloat(sub.amount) || 0), 0);

            if (this.subsTotalValue) {
                this.subsTotalValue.textContent = this.formatCurrency(total);
            }

            subscriptions.forEach(sub => {
                const icon = CATEGORIES.expense[sub.category] || '📦';
                const div = document.createElement('div');
                const isActive = sub.active !== false;
                div.className = `subs-item ${isActive ? '' : 'inactive'}`;

                let actionButtons = '';
                if (isActive) {
                    actionButtons = `
                        <button class="btn-edit-sub" data-id="${sub.id}" title="Editar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn-cancel-sub" data-id="${sub.id}" title="Cancelar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    `;
                } else {
                    actionButtons = `
                         <button class="btn-edit-sub" data-id="${sub.id}" title="Editar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn-activate-sub" data-id="${sub.id}" title="Reativar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                        </button>
                        <button class="btn-delete-sub" data-id="${sub.id}" title="Excluir Permanentemente">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    `;
                }

                div.innerHTML = `
                    <div class="subs-item-info">
                        <span class="subs-icon">${icon}</span>
                        <div class="subs-details">
                            <span class="subs-name">${this.escapeHtml(sub.name)}</span>
                            <span class="subs-meta">Dia ${sub.day} • ${CATEGORY_NAMES[sub.category] || sub.category}</span>
                        </div>
                    </div>
                    <div class="subs-item-actions">
                        <div class="subs-action-buttons">
                            ${actionButtons}
                        </div>
                        <span class="subs-amount">${this.formatCurrency(sub.amount)}</span>
                    </div>
                `;

                div.querySelector('.btn-edit-sub').addEventListener('click', () => {
                    this.showSubsFormView(true, sub);
                });

                if (isActive) {
                    div.querySelector('.btn-cancel-sub').addEventListener('click', (e) => {
                        const id = e.currentTarget.dataset.id;
                        const name = sub.name;
                        const amount = this.formatCurrency(sub.amount);
                        this.openCancelSubModal(id, name, amount);
                    });
                } else {
                    div.querySelector('.btn-activate-sub').addEventListener('click', async (e) => {
                        const id = e.currentTarget.dataset.id;
                        try {
                            await this.fm.activateSubscription(id);
                            this.showToast('Assinatura reativada com sucesso!', 'success');
                        } catch (error) {
                            console.error(error);
                            this.showToast('Erro ao reativar assinatura', 'error');
                        }
                    });

                    div.querySelector('.btn-delete-sub').addEventListener('click', (e) => {
                        const id = e.currentTarget.dataset.id;
                        const name = sub.name;
                        this.openDeleteSubModal(id, name);
                    });
                }

                this.subsList.appendChild(div);
            });
        } catch (error) {
            console.error('Erro ao carregar assinaturas:', error);
            this.showToast('Erro ao carregar assinaturas', 'error');
        }
    }

    openCancelSubModal(id, name, amount) {
        this.cancelingSubId = id;
        this.cancelSubInfo.innerHTML = `
            <span class="delete-desc">${this.escapeHtml(name)}</span>
            <span class="delete-amount">${amount}/mês</span>
        `;
        this.openModal(this.cancelSubModal);
    }

    openDeleteSubModal(id, name) {
        this.deletingSubId = id;
        this.deleteSubInfo.innerHTML = `
            <span class="delete-desc">${this.escapeHtml(name)}</span>
        `;
        this.openModal(this.deleteSubModal);
    }

    showSubsListView() {
        this.subsModal.classList.add('showing-list');
        document.getElementById('subsListView').style.display = 'flex';
        document.getElementById('subsFormView').style.display = 'none';
        document.getElementById('subsModalTitle').textContent = 'Despesas Fixas';
        this.subsForm.reset();
        document.getElementById('subsEditId').value = '';
    }

    showSubsFormView(isEdit = false, sub = null) {
        this.subsModal.classList.remove('showing-list');
        document.getElementById('subsListView').style.display = 'none';
        document.getElementById('subsFormView').style.display = 'block';

        if (isEdit && sub) {
            document.getElementById('subsModalTitle').textContent = 'Editar Despesa Fixa';
            document.getElementById('subsName').value = sub.name;
            document.getElementById('subsAmount').value = (sub.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            document.getElementById('subsDay').value = sub.day;
            const categorySelect = document.getElementById('subsCategory');
            categorySelect.value = sub.category;
            categorySelect.dispatchEvent(new Event('change'));
            document.getElementById('subsEditId').value = sub.id;
            document.getElementById('subsSubmitBtn').textContent = 'Salvar';
        } else {
            document.getElementById('subsModalTitle').textContent = 'Nova Despesa Fixa';
            this.subsForm.reset();
            document.getElementById('subsEditId').value = '';
            document.getElementById('subsSubmitBtn').textContent = 'Adicionar';
        }
    }

    async handleExport() {
        const data = await this.fm.export();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `financas_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showToast('Backup exportado com sucesso!', 'success');
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                this.pendingImportData = data;
                this.openModal(this.importModal);
            } catch (err) {
                this.showToast('Arquivo inválido!', 'error');
            }
        };
        reader.readAsText(file);
        this.fileInput.value = '';
    }

    async handleImportConfirm(replace) {
        if (!this.pendingImportData) return;

        const btnMerge = document.getElementById('mergeImport');
        const btnReplace = document.getElementById('replaceImport');
        const btnCancel = document.getElementById('cancelImport');

        const originalMergeText = btnMerge.textContent;
        const originalReplaceText = btnReplace.textContent;

        btnMerge.disabled = true;
        btnReplace.disabled = true;
        btnCancel.disabled = true;

        if (replace) {
            btnReplace.textContent = 'Importando...';
        } else {
            btnMerge.textContent = 'Importando...';
        }

        try {
            const count = await this.fm.import(this.pendingImportData, replace);
            this.pendingImportData = null;
            this.closeModal(this.importModal, true);
            this.render();
            this.showToast(`${replace ? 'Dados substituídos' : 'Dados mesclados'}! ${count} transações.`, 'success');
        } catch (err) {
            this.showToast('Erro ao importar: ' + err.message, 'error');
        } finally {
            btnMerge.disabled = false;
            btnReplace.disabled = false;
            btnCancel.disabled = false;
            btnMerge.textContent = originalMergeText;
            btnReplace.textContent = originalReplaceText;
        }
    }

    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    }

    setDatePickerValue(element, value) {
        if (!element) return;
        if (element._flatpickr) {
            element._flatpickr.setDate(value, true);
        } else {
            element.value = value;
        }
    }

    formatDate(dateString) {
        if (!dateString) return '';
        if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = dateString.split('-');
            return `${day}/${month}/${year}`;
        }
        try {
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        } catch (e) {
            return dateString;
        }
    }

    getCategoryName(key) {
        return CATEGORY_NAMES[key] || key;
    }

    getCategoryColor(type, key) {
        if (type === 'income') return 'var(--income-color)';
        return EXPENSE_COLORS[key] || 'var(--text-primary)';
    }

    getCategoryColorBg(type, key) {
        if (type === 'income') return 'rgba(34, 197, 94, 0.1)';
        return 'rgba(255, 255, 255, 0.05)';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    openModal(modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeModal(modal, isSubmit = false) {
        if (!modal) return;

        modal.classList.remove('active');
        document.body.style.overflow = '';

        if (modal === this.editModal) {
            this.editForm.reset();
            this.setDefaultDate();
            document.getElementById('editType').dispatchEvent(new Event('change', { bubbles: true }));
        } else if (modal === this.subsModal) {
            this.showSubsListView();
        }
        else if (modal === this.filterModal) {
            if (!isSubmit) {
                this.filterForm.reset();
            }
        }
    }

    handleAuthClick() {
        if (auth.currentUser) {
            auth.signOut().then(() => {
                this.fm.stopListener();
                this.showToast('Você saiu com sucesso!', 'success');
            }).catch(e => {
                this.showToast('Erro ao sair.', 'error');
            });
        } else {
            auth.signInWithPopup(googleProvider).then((result) => {
                this.showToast(`Bem-vindo, ${result.user.displayName}!`, 'success');
            }).catch((error) => {
                console.error(error);
                this.showToast('Erro no login Google.', 'error');
            });
        }
    }

    async handleEmailToggle() {
        if (this.btnEmailToggle) this.btnEmailToggle.disabled = true;

        try {
            const newState = await this.fm.toggleEmailNotifications();
            if (this.txtEmailToggle) {
                this.txtEmailToggle.innerHTML = newState ? 'Notificações Email' : 'Email Desativado';
            }
            if (this.btnEmailToggle) {
                this.btnEmailToggle.style.opacity = newState ? '1' : '0.5';
                const svg = this.btnEmailToggle.querySelector('svg');
                if (svg) svg.style.color = newState ? 'inherit' : 'gray';
            }
            this.showToast(`Notificações por email ${newState ? 'ativadas' : 'desativadas'}.`, 'success');
        } catch (e) {
            this.showToast('Erro ao atualizar configurações.', 'error');
        } finally {
            if (this.btnEmailToggle) this.btnEmailToggle.disabled = false;
        }
    }

    updateAuthUI(user) {
        const authLoading = document.getElementById('authLoading');
        const authContent = document.getElementById('authContent');

        if (user) {
            this.loginOverlay.style.display = 'none';
            this.btnLogin.style.display = 'none';
            this.userInfo.style.display = 'block';
            this.userAvatar.src = user.photoURL;
            if (this.userName) this.userName.textContent = user.displayName;
            if (this.userEmail) this.userEmail.textContent = user.email;

            if (this.btnImport) this.btnImport.style.display = 'none';
            if (this.btnExport) this.btnExport.style.display = 'none';

            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('email') === 'off') {
                this.fm.setEmailNotifications(false).then(() => {
                    this.openModal(this.unsubscribeModal);
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);
                }).catch(e => console.error(e));
            }

            setTimeout(() => {
                const settings = this.fm.getSettings();
                if (this.txtEmailToggle) {
                    this.txtEmailToggle.innerHTML = settings.emailNotifications ? 'Notificações Email' : 'Email Desativado';
                }
                if (this.btnEmailToggle) {
                    this.btnEmailToggle.style.opacity = settings.emailNotifications ? '1' : '0.5';
                    const svg = this.btnEmailToggle.querySelector('svg');
                    if (svg) svg.style.color = settings.emailNotifications ? 'inherit' : 'gray';
                }
            }, 1000);

        } else {
            this.loginOverlay.style.display = 'flex';

            if (authLoading) authLoading.style.display = 'none';
            if (authContent) authContent.style.display = 'flex';

            this.btnLogin.style.display = 'flex';
            this.btnLogin.title = 'Login com Google';
            this.loginText.textContent = 'Google Login';
            this.userInfo.style.display = 'none';
            this.userAvatar.src = '';
            if (this.userDropdown) this.userDropdown.classList.remove('active');

            if (this.btnImport) this.btnImport.style.display = 'flex';
            if (this.btnExport) this.btnExport.style.display = 'flex';
        }
    }


    showToast(message, type = '') {
        this.toast.textContent = message;
        this.toast.className = `toast show ${type}`;

        setTimeout(() => {
            this.toast.classList.remove('show');
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const financeManager = new FinanceManager();
    const ui = new UIController(financeManager);

    window.app = ui;
    window.financeApp = { financeManager, ui };

    let deferredPrompt;
    const installButton = document.getElementById('installAppBtn');

    if (installButton) {
        installButton.style.display = 'none';

        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) return;

            installButton.style.display = 'none';
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        if (installButton) {
            installButton.style.display = 'flex';
        }
    });

    window.addEventListener('appinstalled', () => {
        if (installButton) {
            installButton.style.display = 'none';
        }
        deferredPrompt = null;
    });

    document.querySelectorAll('select').forEach(select => {
        new CustomSelect(select);
    });

    const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (typeof flatpickr !== 'undefined' && !isMobile) {
        const baseConfig = {
            locale: 'pt',
            dateFormat: 'Y-m-d',
            altInput: true,
            altFormat: 'd/m/Y',
            disableMobile: true,
            theme: 'dark',
            allowInput: true,
            onReady: function (selectedDates, dateStr, instance) {
                const input = instance.altInput;
                input.setAttribute('inputmode', 'numeric');
                input.addEventListener('input', (e) => {
                    let v = e.target.value.replace(/\D/g, '');
                    if (v.length > 8) v = v.substring(0, 8);

                    if (v.length > 4) {
                        e.target.value = `${v.substring(0, 2)}/${v.substring(2, 4)}/${v.substring(4)}`;
                    } else if (v.length > 2) {
                        e.target.value = `${v.substring(0, 2)}/${v.substring(2)}`;
                    } else {
                        e.target.value = v;
                    }
                });
            }
        };

        flatpickr("#editDate", baseConfig);

        const startDatePicker = flatpickr("#filterStartDate", {
            ...baseConfig,
            onChange: function (selectedDates, dateStr, instance) {
                endDatePicker.set('minDate', dateStr);
            }
        });

        const endDatePicker = flatpickr("#filterEndDate", {
            ...baseConfig,
            onChange: function (selectedDates, dateStr, instance) {
                startDatePicker.set('maxDate', dateStr);
            }
        });
    }
});

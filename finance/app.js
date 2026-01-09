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
db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('Persistência falhou: Múltiplas abas abertas.');
        } else if (err.code == 'unimplemented') {
            console.warn('Persistência não suportada neste navegador.');
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
        salario: '💰',
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

const CATEGORY_COLORS = {
    alimentacao: '#ff7043',
    transporte: '#ffca28',
    moradia: '#d32f2f',
    saude: '#880e4f',
    educacao: '#795548',
    lazer: '#f06292',
    vestuario: '#00bcd4',
    compras: '#ffeb3b',
    servicos: '#5d4037',
    outros: '#9e9e9e'
};

class FinanceManager {
    constructor() {
        this.transactions = [];
        this._hasPendingChanges = false;
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

    save(onSyncError = null, onOffline = null) {
        if (auth.currentUser && navigator.onLine) {
            this.syncToCloud(auth.currentUser).then(() => {
                this.hasPendingChanges = false;
            }).catch(() => {
                this.hasPendingChanges = true;
                if (onSyncError) onSyncError();
            });
        } else if (auth.currentUser) {
            this.hasPendingChanges = true;
            if (onOffline) onOffline();
        }
    }

    clear() {
        this.transactions = [];
        this.hasPendingChanges = false;
    }

    async syncToCloud(user) {
        if (!user) return;
        try {
            await db.collection('finance_data').doc(user.uid).set({
                transactions: this.transactions,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Dados sincronizados com a nuvem');
        } catch (error) {
            console.error('Erro ao salvar na nuvem:', error);
            throw error;
        }
    }

    async syncFromCloud(user) {
        if (!user) return;
        try {
            const doc = await db.collection('finance_data').doc(user.uid).get();
            if (doc.exists) {
                const data = doc.data();
                if (data.transactions) {
                    const cloudTransactions = data.transactions;

                    this.transactions = cloudTransactions;

                    return true;
                }
            } else {
                if (this.transactions.length > 0) {
                    this.syncToCloud(user);
                }
            }
        } catch (error) {
            console.error('Erro ao baixar da nuvem:', error);
            throw error;
        }
        return false;
    }

    getAll() {
        return [...this.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    get(id) {
        return this.transactions.find(t => t.id === id);
    }

    add(transaction, onSyncError = null, onOffline = null) {
        const newTransaction = {
            id: this.generateId(),
            ...transaction,
            createdAt: new Date().toISOString()
        };
        this.transactions.push(newTransaction);
        this.save(onSyncError, onOffline);
        return newTransaction;
    }

    update(id, data, onSyncError = null, onOffline = null) {
        const index = this.transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            this.transactions[index] = { ...this.transactions[index], ...data };
            this.save(onSyncError, onOffline);
            return this.transactions[index];
        }
        return null;
    }

    delete(id, onSyncError = null, onOffline = null) {
        const index = this.transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            this.transactions.splice(index, 1);
            this.save(onSyncError, onOffline);
            return true;
        }
        return false;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getBalance() {
        return this.transactions.reduce((acc, t) => {
            return t.type === 'income' ? acc + t.amount : acc - t.amount;
        }, 0);
    }

    getMonthlyIncome(year, month) {
        return this.transactions
            .filter(t => {
                const d = new Date(t.date);
                return t.type === 'income' && d.getFullYear() === year && d.getMonth() === month;
            })
            .reduce((acc, t) => acc + t.amount, 0);
    }

    getMonthlyExpense(year, month) {
        return this.transactions
            .filter(t => {
                const d = new Date(t.date);
                return t.type === 'expense' && d.getFullYear() === year && d.getMonth() === month;
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

    getFilteredTransactions(filters = {}) {
        const normalize = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        return this.transactions.filter(t => {
            const tDate = t.date.substring(0, 10);
            if (filters.startDate && tDate < filters.startDate) return false;
            if (filters.endDate && tDate > filters.endDate) return false;
            if (filters.type && t.type !== filters.type) return false;

            if (filters.category) {
                if (filters.category === 'outros') {
                    if (t.category !== 'outros' && t.category !== 'outros_receita') return false;
                } else {
                    if (t.category !== filters.category) return false;
                }
            }

            if (filters.search && !normalize(t.description).includes(normalize(filters.search))) return false;
            return true;
        }).sort((a, b) => {
            const dateParams = b.date.localeCompare(a.date);
            if (dateParams !== 0) return dateParams;
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
    }

    getFilteredTotals(filters = {}) {
        const transactions = this.getFilteredTransactions(filters);
        const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
        const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
        return { income, expense, balance: income - expense };
    }

    getFilteredExpensesByCategory(filters = {}) {
        const transactions = this.getFilteredTransactions({ ...filters, type: 'expense' });
        const byCategory = {};
        transactions.forEach(t => {
            if (!byCategory[t.category]) byCategory[t.category] = 0;
            byCategory[t.category] += t.amount;
        });
        return byCategory;
    }

    getFilteredIncomesByCategory(filters = {}) {
        const transactions = this.getFilteredTransactions({ ...filters, type: 'income' });
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

    export() {
        return {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            transactions: this.transactions
        };
    }

    import(data, replace = false) {
        if (!data || !data.transactions || !Array.isArray(data.transactions)) {
            throw new Error('Formato de dados inválido');
        }

        if (replace) {
            this.transactions = data.transactions;
        } else {
            const existingIds = new Set(this.transactions.map(t => t.id));
            const newTransactions = data.transactions.filter(t => !existingIds.has(t.id));
            this.transactions = [...this.transactions, ...newTransactions];
        }

        this.save();
        return this.transactions.length;
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
            search: ''
        };
        this.pendingDeleteId = null;
        this.pendingImportData = null;

        this.currentPage = 1;
        this.itemsPerPage = 50;

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

        this.initElements();
        this.initEventListeners();
        this.setDefaultDate();
        this.render();
    }

    initElements() {
        this.balanceValue = document.getElementById('balanceValue');
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
        this.btnClearFilters = document.getElementById('btnClearFilters');
        this.btnApplyFilters = document.getElementById('btnApplyFilters');
        this.closeFilterModal = document.getElementById('closeFilterModal');

        this.transactionsList = document.getElementById('transactionsList');
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

        auth.onAuthStateChanged(async (user) => {
            this.updateAuthUI(user);
            if (user) {
                if (this.fm.hasPendingChanges && navigator.onLine) {
                    try {
                        await this.fm.syncToCloud(user);
                        this.fm.hasPendingChanges = false;
                        this.showToast('Alterações pendentes enviadas!', 'success');
                    } catch (e) {
                        this.showToast('Erro ao enviar alterações pendentes.', 'error');
                        return;
                    }
                }

                if (navigator.onLine) {
                    try {
                        const updated = await this.fm.syncFromCloud(user);
                        if (updated) {
                            this.render();
                        }
                    } catch (e) {
                        this.showToast('Erro ao sincronizar. Verifique sua conexão.', 'error');
                    }
                }
            }
        });

        const offlineBadge = document.getElementById('offlineBadge');

        window.addEventListener('online', async () => {
            offlineBadge.classList.remove('visible');
            this.showToast('Conexão restabelecida!', 'success');

            if (auth.currentUser) {
                if (this.fm.hasPendingChanges) {
                    try {
                        await this.fm.syncToCloud(auth.currentUser);
                        this.fm.hasPendingChanges = false;
                        this.showToast('Alterações locais enviadas!', 'success');
                    } catch (e) {
                        this.showToast('Erro ao enviar alterações locais.', 'error');
                        return;
                    }
                }

                try {
                    const updated = await this.fm.syncFromCloud(auth.currentUser);
                    if (updated) {
                        this.render();
                    }
                } catch (e) {
                    this.showToast('Erro ao baixar dados da nuvem.', 'error');
                }
            }
        });

        window.addEventListener('offline', () => {
            offlineBadge.classList.add('visible');
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
            this.filterEndDate.min = '';
            this.filterStartDate.max = '';
            this.updateFilterOptions();
        });

        this.btnApplyFilters.addEventListener('click', () => {
            this.currentFilters.startDate = this.filterStartDate.value;
            this.currentFilters.endDate = this.filterEndDate.value;
            this.currentFilters.type = this.filterType.value;
            this.currentFilters.category = this.filterCategory.value;

            this.currentFilters.category = this.filterCategory.value;

            this.currentPage = 1;
            this.closeModal(this.filterModal);
            this.render();
        });

        this.filterType.addEventListener('change', () => {
            this.updateFilterOptions();
        });

        this.filterModal.addEventListener('click', (e) => {
            if (e.target === this.filterModal) this.closeModal(this.filterModal);
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

        document.getElementById('closeDeleteModal').addEventListener('click', () => this.closeModal(this.deleteModal));
        document.getElementById('cancelDelete').addEventListener('click', () => this.closeModal(this.deleteModal));
        document.getElementById('confirmDelete').addEventListener('click', () => this.handleDeleteConfirm());

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

        [this.editModal, this.deleteModal, this.importModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal(modal);
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal(this.editModal);
                this.closeModal(this.deleteModal);
                this.closeModal(this.editModal);
                this.closeModal(this.deleteModal);
                this.closeModal(this.importModal);
                this.closeModal(this.filterModal);
            }
        });
    }

    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('editDate').value = today;
    }

    getCategoryColor(type, category) {
        if (type === 'income') return 'var(--income-color)';
        return CATEGORY_COLORS[category] || 'var(--text-primary)';
    }

    getCategoryColorBg(type, category) {
        if (type === 'income') return 'rgba(34, 197, 94, 0.1)';
        const color = CATEGORY_COLORS[category];
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
            this.filterStartDate.value = '';
            this.filterEndDate.min = '';
        }
        if (key === 'endDate') {
            this.filterEndDate.value = '';
            this.filterStartDate.max = '';
        }
        if (key === 'type') {
            this.filterType.value = '';
            this.updateFilterOptions();
        }
        if (key === 'category') this.filterCategory.value = '';
        if (key === 'search') this.searchInput.value = '';

        this.currentPage = 1;
        this.render();
    }

    renderDashboard() {
        const totals = this.fm.getFilteredTotals({
            startDate: this.currentFilters.startDate || null,
            endDate: this.currentFilters.endDate || null,
            type: this.currentFilters.type || null,
            category: this.currentFilters.category || null,
            search: this.currentFilters.search || null
        });

        const balance = this.fm.getBalance();

        const hasFilter = this.currentFilters.startDate || this.currentFilters.endDate || this.currentFilters.type || this.currentFilters.category || this.currentFilters.search;
        this.incomeLabel.textContent = hasFilter ? 'Receitas' : 'Receitas (Total)';
        this.expenseLabel.textContent = hasFilter ? 'Despesas' : 'Despesas (Total)';

        this.balanceValue.textContent = this.formatCurrency(balance);
        this.incomeValue.textContent = this.formatCurrency(totals.income);
        this.expenseValue.textContent = this.formatCurrency(totals.expense);
    }

    renderChart() {
        const expenses = this.fm.getFilteredExpensesByCategory({
            startDate: this.currentFilters.startDate || null,
            endDate: this.currentFilters.endDate || null,
            category: this.currentFilters.category || null,
            search: this.currentFilters.search || null
        });
        const categories = Object.keys(expenses);

        if (categories.length === 0) {
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }
            this.chartCanvas.style.display = 'none';
            this.noChartData.style.display = 'block';
            return;
        }

        this.chartCanvas.style.display = 'block';
        this.noChartData.style.display = 'none';

        const labels = categories.map(c => CATEGORY_NAMES[c] || c);
        const data = categories.map(c => expenses[c]);
        const colors = categories.map(c => CATEGORY_COLORS[c] || '#6b7280');

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
                            labels: {
                                color: 'rgba(255, 255, 255, 0.7)',
                                padding: 15,
                                font: {
                                    family: 'Inter',
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const value = context.raw;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
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
            search: this.currentFilters.search || null
        });
        const categories = Object.keys(incomes);

        const INCOME_COLORS = {
            salario: '#16a34a',
            freelance: '#4f46e5',
            investimentos: '#9333ea',
            presente: '#06b6d4',
            outros_receita: '#475569'
        };

        if (categories.length === 0) {
            if (this.incomeChart) {
                this.incomeChart.destroy();
                this.incomeChart = null;
            }
            this.incomeChartCanvas.style.display = 'none';
            this.noIncomeData.style.display = 'block';
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
                            labels: {
                                color: 'rgba(255, 255, 255, 0.7)',
                                padding: 15,
                                font: {
                                    family: 'Inter',
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const value = context.raw;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
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

        const categories = this.fm.getAvailableCategories();
        this.filterCategory.innerHTML = '<option value="">Todas as categorias</option>';

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

        this.transactionsList.innerHTML = '';

        if (transactions.length === 0) {
            this.noTransactions.style.display = 'flex';
            this.paginationControls.style.display = 'none';
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
        this.btnPrevPage.disabled = this.currentPage === 1;
        this.btnNextPage.disabled = this.currentPage === totalPages;

        pageItems.forEach(t => {
            const el = document.createElement('div');
            el.className = `transaction-item ${t.type}`;

            let icon = CATEGORIES[t.type]?.[t.category];
            if (!icon) {
                icon = CATEGORIES.expense[t.category] || CATEGORIES.income[t.category];
            }
            icon = icon || (t.type === 'expense' ? '💸' : '💰');
            const categoryName = CATEGORY_NAMES[t.category] || t.category;
            const sign = t.type === 'income' ? '+' : '-';
            const date = new Date(t.date + 'T12:00:00');

            el.innerHTML = `
                <div class="transaction-info">
                    <div class="transaction-icon" style="background: ${this.getCategoryColorBg(t.type, t.category)}; color: ${this.getCategoryColor(t.type, t.category)}">
                        ${icon}
                    </div>
                    <div class="transaction-details">
                        <span class="transaction-desc">${t.description}</span>
                        <div class="transaction-meta">
                            <span class="transaction-date">${date.toLocaleDateString('pt-BR')}</span>
                            -
                            <span class="transaction-cat">${categoryName}</span>
                        </div>
                    </div>
                </div>
                <div class="transaction-actions">
                    <div class="action-buttons">
                        <button class="action-btn edit" title="Editar">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="action-btn delete" title="Excluir">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                    <span class="transaction-amount ${t.type}">
                        ${sign} ${this.formatCurrency(t.amount)}
                    </span>
                </div>
            `;

            el.querySelector('.edit').addEventListener('click', () => this.openEditModal(t.id));
            el.querySelector('.delete').addEventListener('click', () => this.openDeleteModal(t.id));

            this.transactionsList.appendChild(el);
        });
    }

    openFilterModal() {
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
        document.getElementById('editDate').value = t.date;
        document.getElementById('editType').value = t.type;
        this.updateEditCategoryOptions(t.category);

        this.openModal(this.editModal);
    }

    handleFormSubmit(e) {
        e.preventDefault();

        const rawAmount = document.getElementById('editAmount').value;
        const parseAmount = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.'));

        const data = {
            description: document.getElementById('editDescription').value.trim(),
            amount: parseAmount,
            date: document.getElementById('editDate').value,
            type: document.getElementById('editType').value,
            category: document.getElementById('editCategory').value
        };

        const syncErrorCallback = () => {
            this.showToast('Erro ao sincronizar com a nuvem. Será sincronizado ao reconectar.', 'error');
        };

        const offlineCallback = () => {
            this.showToast('Você está offline. Será sincronizado ao reconectar.', 'info');
        };

        if (this.isEditing && this.editingId) {
            this.fm.update(this.editingId, data, syncErrorCallback, offlineCallback);
            this.showToast('Transação atualizada!', 'success');
        } else {
            this.fm.add(data, syncErrorCallback, offlineCallback);
            this.showToast('Transação adicionada!', 'success');
        }

        this.closeModal(this.editModal);
        this.render();
    }

    openDeleteModal(id) {
        const t = this.fm.get(id);
        if (!t) return;

        this.pendingDeleteId = id;
        const sign = t.type === 'income' ? '+' : '-';

        const safeDesc = this.escapeHtml(t.description);

        this.deleteInfo.innerHTML = `
            <span class="delete-desc" title="${safeDesc}">${safeDesc}</span>
            <span class="delete-amount">${sign} ${this.formatCurrency(t.amount)}</span>
        `;
        this.openModal(this.deleteModal);
    }

    handleDeleteConfirm() {
        if (this.pendingDeleteId) {
            const syncErrorCallback = () => {
                this.showToast('Erro ao sincronizar com a nuvem. Será sincronizado ao reconectar.', 'error');
            };

            const offlineCallback = () => {
                this.showToast('Você está offline. Será sincronizado ao reconectar.', 'info');
            };

            this.fm.delete(this.pendingDeleteId, syncErrorCallback, offlineCallback);
            this.pendingDeleteId = null;
            this.closeModal(this.deleteModal);
            this.render();
            this.showToast('Transação excluída!', 'success');
        }
    }

    handleExport() {
        const data = this.fm.export();
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

    handleImportConfirm(replace) {
        if (!this.pendingImportData) return;

        try {
            const count = this.fm.import(this.pendingImportData, replace);
            this.pendingImportData = null;
            this.closeModal(this.importModal);
            this.render();
            this.showToast(`${replace ? 'Dados substituídos' : 'Dados mesclados'}! ${count} transações.`, 'success');
        } catch (err) {
            this.showToast('Erro ao importar: ' + err.message, 'error');
        }
    }

    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
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

    closeModal(modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    handleAuthClick() {
        if (auth.currentUser) {
            auth.signOut().then(() => {
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

    window.financeApp = { financeManager, ui };
});

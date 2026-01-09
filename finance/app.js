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
const googleProvider = new firebase.auth.GoogleAuthProvider();

const CATEGORIES = {
    expense: {
        alimentacao: '🍔',
        transporte: '🚗',
        moradia: '🏠',
        saude: '💊',
        educacao: '📚',
        lazer: '🎮',
        compras: '🛒',
        servicos: '🔧',
        outros_despesa: '📦'
    },
    income: {
        salario: '💼',
        freelance: '💻',
        investimentos: '📈',
        presente: '🎁',
        outros_receita: '💰'
    }
};

const CATEGORY_NAMES = {
    alimentacao: 'Alimentação',
    transporte: 'Transporte',
    moradia: 'Moradia',
    saude: 'Saúde',
    educacao: 'Educação',
    lazer: 'Lazer',
    compras: 'Compras',
    servicos: 'Serviços',
    outros_despesa: 'Outros',
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
    compras: '#ffeb3b',
    servicos: '#5d4037',
    outros_despesa: '#9e9e9e'
};

class FinanceManager {
    constructor() {
        this.transactions = [];
        this.load();
    }

    load() {
        try {
            const data = localStorage.getItem('finance_transactions');
            this.transactions = data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Erro ao carregar transações:', e);
            this.transactions = [];
        }
    }

    save() {
        localStorage.setItem('finance_transactions', JSON.stringify(this.transactions));
        if (auth.currentUser) {
            this.syncToCloud(auth.currentUser);
        }
    }

    async syncToCloud(user) {
        if (!user) return;
        try {
            await db.collection('finance_data').doc(user.uid).set({
                transactions: this.transactions,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Dados salvos na nuvem');
        } catch (error) {
            console.error('Erro ao salvar na nuvem:', error);
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

                    this.save();
                    return true;
                }
            } else {
                if (this.transactions.length > 0) {
                    this.syncToCloud(user);
                }
            }
        } catch (error) {
            console.error('Erro ao baixar da nuvem:', error);
        }
        return false;
    }

    getAll() {
        return [...this.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    get(id) {
        return this.transactions.find(t => t.id === id);
    }

    add(transaction) {
        const newTransaction = {
            id: this.generateId(),
            ...transaction,
            createdAt: new Date().toISOString()
        };
        this.transactions.push(newTransaction);
        this.save();
        return newTransaction;
    }

    update(id, data) {
        const index = this.transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            this.transactions[index] = { ...this.transactions[index], ...data };
            this.save();
            return this.transactions[index];
        }
        return null;
    }

    delete(id) {
        const index = this.transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            this.transactions.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Cálculos
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
            if (filters.category && t.category !== filters.category) return false;
            if (filters.search && !normalize(t.description).includes(normalize(filters.search))) return false;
            return true;
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

        this.btnLogin = document.getElementById('btnLogin');
        this.loginText = document.getElementById('loginText');
        this.userInfo = document.getElementById('userInfo');
        this.userAvatar = document.getElementById('userAvatar');

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

        this.toast = document.getElementById('toast');

        this.isEditing = false;
        this.editingId = null;
    }

    initEventListeners() {
        this.btnLogin.addEventListener('click', () => this.handleAuthClick());

        auth.onAuthStateChanged(user => {
            this.updateAuthUI(user);
            if (user) {
                this.fm.syncFromCloud(user).then(updated => {
                    if (updated) {
                        this.render();
                        this.showToast('Dados sincronizados da nuvem!', 'success');
                    }
                });
            }
        });

        const offlineBadge = document.getElementById('offlineBadge');

        window.addEventListener('online', () => {
            offlineBadge.classList.remove('visible');
            this.showToast('Conexão restabelecida!', 'success');

            if (auth.currentUser) {
                this.showToast('Sincronizando...', 'info');
                this.fm.syncFromCloud(auth.currentUser).then(updated => {
                    if (updated) {
                        this.render();
                        this.showToast('Dados atualizados da nuvem!', 'success');
                    } else {
                        this.showToast('Sincronização concluída.', 'success');
                    }
                });
            }
        });

        window.addEventListener('offline', () => {
            offlineBadge.classList.add('visible');
            this.showToast('Você está offline. Alterações serão salvas localmente.', 'info');
        });

        this.btnAddTransaction.addEventListener('click', () => this.openAddModal());

        this.searchInput.addEventListener('input', () => {
            this.currentFilters.search = this.searchInput.value;
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
        });

        this.btnApplyFilters.addEventListener('click', () => {
            this.currentFilters.startDate = this.filterStartDate.value;
            this.currentFilters.endDate = this.filterEndDate.value;
            this.currentFilters.type = this.filterType.value;
            this.currentFilters.category = this.filterCategory.value;

            this.closeModal(this.filterModal);
            this.render();
        });

        this.filterModal.addEventListener('click', (e) => {
            if (e.target === this.filterModal) this.closeModal(this.filterModal);
        });

        this.btnExport.addEventListener('click', () => this.handleExport());
        this.btnImport.addEventListener('click', () => this.fileInput.click());
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

    updateEditCategoryOptions() {
        const type = document.getElementById('editType').value;
        const categorySelect = document.getElementById('editCategory');
        const optgroups = categorySelect.querySelectorAll('optgroup');

        optgroups.forEach(group => {
            const isExpense = group.label === 'Despesas';
            group.style.display = (type === 'expense' && isExpense) || (type === 'income' && !isExpense) ? '' : 'none';
        });

        const visibleOptions = Array.from(categorySelect.options).filter(opt => {
            const parent = opt.parentElement;
            return parent.style.display !== 'none';
        });

        if (visibleOptions.length > 0 && !visibleOptions.some(opt => opt.value === categorySelect.value)) {
            categorySelect.value = visibleOptions[0].value;
        }
    }

    render() {
        this.renderActiveFilters();
        this.renderDashboard();
        this.renderChart();
        this.renderIncomeChart();
        this.updateFilterOptions();
        this.renderTransactionsList();
    }

    openFilterModal() {
        this.filterStartDate.value = this.currentFilters.startDate;
        this.filterEndDate.value = this.currentFilters.endDate;
        this.filterType.value = this.currentFilters.type;
        this.filterCategory.value = this.currentFilters.category;

        this.openModal(this.filterModal);
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
        this.render();
    }

    renderDashboard() {
        const totals = this.fm.getFilteredTotals({
            startDate: this.currentFilters.startDate || null,
            endDate: this.currentFilters.endDate || null,
            category: this.currentFilters.category || null,
            search: this.currentFilters.search || null
        });

        const balance = this.fm.getBalance();

        const hasFilter = this.currentFilters.startDate || this.currentFilters.endDate || this.currentFilters.category || this.currentFilters.search;
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


        const categories = this.fm.getAvailableCategories();
        this.filterCategory.innerHTML = '<option value="">Todas as categorias</option>';
        categories.forEach(c => {
            const emoji = CATEGORIES.expense[c] || CATEGORIES.income[c] || '';
            const name = CATEGORY_NAMES[c] || c;
            this.filterCategory.innerHTML += `<option value="${c}">${emoji} ${name}</option>`;
        });
    }

    renderTransactionsList() {
        let transactions = this.fm.getFilteredTransactions(this.currentFilters);

        if (transactions.length === 0) {
            this.transactionsList.innerHTML = '';
            this.noTransactions.style.display = 'flex';
            return;
        }

        this.noTransactions.style.display = 'none';
        this.transactionsList.innerHTML = transactions.map(t => this.createTransactionItem(t)).join('');

        this.transactionsList.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => this.openEditModal(btn.dataset.id));
        });

        this.transactionsList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => this.openDeleteModal(btn.dataset.id));
        });
    }

    createTransactionItem(t) {
        const emoji = CATEGORIES[t.type]?.[t.category] || '💵';
        const categoryName = CATEGORY_NAMES[t.category] || t.category;
        const [year, month, day] = t.date.split('T')[0].split('-');
        const date = `${day}/${month}/${year}`;
        const sign = t.type === 'income' ? '+' : '-';

        return `
            <div class="transaction-item ${t.type}">
                <div class="transaction-info">
                    <div class="transaction-icon">${emoji}</div>
                    <div class="transaction-details">
                        <span class="transaction-description">${this.escapeHtml(t.description)}</span>
                        <span class="transaction-meta">${categoryName} • ${date}</span>
                    </div>
                </div>
                <span class="transaction-amount">${sign} ${this.formatCurrency(t.amount)}</span>
                <div class="transaction-actions">
                    <button class="action-btn edit-btn" data-id="${t.id}" title="Editar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="action-btn delete delete-btn" data-id="${t.id}" title="Excluir">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
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
        document.getElementById('editAmount').value = t.amount;
        document.getElementById('editDate').value = t.date;
        document.getElementById('editType').value = t.type;
        this.updateEditCategoryOptions();
        document.getElementById('editCategory').value = t.category;

        this.openModal(this.editModal);
    }

    handleFormSubmit(e) {
        e.preventDefault();

        const data = {
            description: document.getElementById('editDescription').value.trim(),
            amount: parseFloat(document.getElementById('editAmount').value),
            date: document.getElementById('editDate').value,
            type: document.getElementById('editType').value,
            category: document.getElementById('editCategory').value
        };

        if (this.isEditing && this.editingId) {
            this.fm.update(this.editingId, data);
            this.showToast('Transação atualizada!', 'success');
        } else {
            this.fm.add(data);
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
        this.deleteInfo.textContent = `${t.description} ${sign} ${this.formatCurrency(t.amount)}`;
        this.openModal(this.deleteModal);
    }

    handleDeleteConfirm() {
        if (this.pendingDeleteId) {
            this.fm.delete(this.pendingDeleteId);
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
        if (user) {
            this.btnLogin.title = 'Logout';
            this.loginText.textContent = 'Sair';
            this.userAvatar.src = user.photoURL;
            this.userInfo.style.display = 'flex';
        } else {
            this.btnLogin.title = 'Login com Google';
            this.loginText.textContent = 'Google Login';
            this.userInfo.style.display = 'none';
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

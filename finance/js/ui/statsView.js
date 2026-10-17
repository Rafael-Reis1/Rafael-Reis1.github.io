import { CATEGORY_NAMES, CATEGORIES, EXPENSE_COLORS } from '../utils/constants.js';

export class StatsView {
    constructor(financeManager) {
        this.fm = financeManager;
        this.modal = document.getElementById('statsModal');
        this.container = document.getElementById('statsContent');
        this.closeBtn = document.getElementById('closeStatsModal');

        const now = new Date();
        this.currentYear = now.getFullYear();
        this.currentMonth = now.getMonth(); // 0-indexed (0 = Jan, 9 = Out)

        // Estado do seletor
        this.navYear = this.currentYear;
        this.navMonth = this.currentMonth;
        this.selectedPeriod = 'current_month'; // 'current_month', 'prev_month', 'last_3m', 'year', 'all'
        this.activeTab = 'daily'; // 'daily' | 'history'
        this.heatmapSpan = 12; // 6 | 12 meses
        this.rankingTab = 'largest'; // 'largest' | 'frequent'
        this.expandedCategories = new Set();
        this.isEditingBudgetTarget = false;

        this.chartInstance = null;
        this.tooltipEl = null;

        this.init();
    }

    getBudgetTargetPct() {
        if (this.fm && typeof this.fm.getBudgetTargetPct === 'function') {
            return this.fm.getBudgetTargetPct();
        }
        const fromFm = Number(this.fm?.settings?.budgetTargetPct);
        if (fromFm >= 10 && fromFm <= 100) return fromFm;
        try {
            const fromLocal = Number(localStorage.getItem('finance_budget_target_pct'));
            if (fromLocal >= 10 && fromLocal <= 100) return fromLocal;
        } catch (e) {}
        return 80;
    }

    setBudgetTargetPct(pct) {
        const cleanPct = Math.max(10, Math.min(100, Math.round(Number(pct) || 80)));
        if (this.fm && typeof this.fm.setBudgetTargetPct === 'function') {
            this.fm.setBudgetTargetPct(cleanPct);
        } else {
            if (this.fm && this.fm.settings) {
                this.fm.settings.budgetTargetPct = cleanPct;
            }
            try {
                localStorage.setItem('finance_budget_target_pct', String(cleanPct));
            } catch (e) {}
        }
        this.isEditingBudgetTarget = false;
        this.render();
    }

    init() {
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        // Cria tooltip flutuante para o heatmap se não existir
        if (!document.getElementById('statsTooltip')) {
            this.tooltipEl = document.createElement('div');
            this.tooltipEl.id = 'statsTooltip';
            this.tooltipEl.className = 'stats-tooltip';
            document.body.appendChild(this.tooltipEl);
        } else {
            this.tooltipEl = document.getElementById('statsTooltip');
        }

        // Oculta tooltip ao rolar o modal
        const modalBody = this.modal?.querySelector('.modal-body');
        if (modalBody) {
            modalBody.addEventListener('scroll', () => {
                if (this.tooltipEl) this.tooltipEl.style.opacity = '0';
            }, { passive: true });
        }

        // Atalho de teclado: Setas ← e → para navegar entre meses quando o modal está aberto
        document.addEventListener('keydown', (e) => {
            if (!this.modal || !this.modal.classList.contains('active')) return;
            const tag = document.activeElement?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.stepMonth(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.stepMonth(1);
            }
        });
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    formatCurrency(val) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    }

    formatDateBR(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }

    open() {
        if (!this.modal) return;
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Redefine para o mês atual ao abrir
        const now = new Date();
        this.navYear = now.getFullYear();
        this.navMonth = now.getMonth();
        this.selectedPeriod = 'current_month';
        this.expandedCategories.clear();
        this.isEditingBudgetTarget = false;

        this.render();
    }

    close() {
        if (!this.modal) return;
        this.modal.classList.remove('active');
        if (document.querySelectorAll('.modal.active').length === 0) {
            document.body.style.overflow = '';
        }
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
        if (this.tooltipEl) {
            this.tooltipEl.style.opacity = '0';
        }
    }

    setPeriod(period) {
        this.selectedPeriod = period;
        this.expandedCategories.clear();
        const now = new Date();

        if (period === 'current_month') {
            this.navYear = now.getFullYear();
            this.navMonth = now.getMonth();
        } else if (period === 'prev_month') {
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            this.navYear = prev.getFullYear();
            this.navMonth = prev.getMonth();
        } else if (period === 'year') {
            this.navYear = now.getFullYear();
        }

        this.render();
    }

    jumpToMonth(year, month) {
        this.navYear = year;
        this.navMonth = month;
        this.expandedCategories.clear();

        const now = new Date();
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (year === now.getFullYear() && month === now.getMonth()) {
            this.selectedPeriod = 'current_month';
        } else if (year === prev.getFullYear() && month === prev.getMonth()) {
            this.selectedPeriod = 'prev_month';
        } else {
            this.selectedPeriod = 'custom_month';
        }

        this.activeTab = 'daily';
        if (this.tooltipEl) this.tooltipEl.style.opacity = '0';
        this.render();
    }

    stepMonth(direction) {
        let m = this.navMonth + direction;
        let y = this.navYear;
        if (m < 0) {
            m = 11;
            y--;
        } else if (m > 11) {
            m = 0;
            y++;
        }
        this.jumpToMonth(y, m);
    }

    setActiveTab(tab) {
        this.activeTab = tab;
        const dailyBtn = document.getElementById('tabDailyBtn');
        const histBtn = document.getElementById('tabHistBtn');
        if (dailyBtn && histBtn) {
            dailyBtn.classList.toggle('active', tab === 'daily');
            histBtn.classList.toggle('active', tab === 'history');
        }
        const titleSpan = document.getElementById('statsChartTitle');
        if (titleSpan) {
            const isFuture = this.currentChartData?.isFutureMonth;
            titleSpan.textContent = tab === 'daily'
                ? (isFuture ? 'Contas Agendadas por Dia' : 'Gastos Diários e Picos')
                : 'Evolução Receita x Despesa (Últimos 6 Meses)';
        }
        this.renderCharts();
    }

    getMonthName(monthIdx) {
        const names = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        return names[monthIdx] || '';
    }

    render() {
        if (!this.container) return;

        const now = new Date();
        const allTx = this.fm.getAll();
        const subscriptions = this.fm.getSubscriptions() || [];

        // Identifica limites do período ativo
        const isMonthlyMode = ['current_month', 'prev_month', 'custom_month'].includes(this.selectedPeriod);
        const isYearMode = this.selectedPeriod === 'year';
        const isLast3mMode = this.selectedPeriod === 'last_3m';
        const isAllMode = this.selectedPeriod === 'all';

        let startDateStr = '';
        let endDateStr = '';
        let periodTitle = '';
        let daysEvaluated = 30;
        let daysEvaluatedLabel = '';
        let monthsEvaluated = 1;

        if (isMonthlyMode) {
            const startD = new Date(this.navYear, this.navMonth, 1);
            const endD = new Date(this.navYear, this.navMonth + 1, 0);
            const daysInMonth = endD.getDate();
            startDateStr = `${this.navYear}-${String(this.navMonth + 1).padStart(2, '0')}-01`;
            endDateStr = `${this.navYear}-${String(this.navMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
            periodTitle = `${this.getMonthName(this.navMonth)} de ${this.navYear}`;

            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            const isCurrentActiveMonth = (this.navYear === currentYear && this.navMonth === currentMonth);
            const isFutureMonth = (this.navYear > currentYear || (this.navYear === currentYear && this.navMonth > currentMonth));
            const isPastMonth = (this.navYear < currentYear || (this.navYear === currentYear && this.navMonth < currentMonth));
            daysEvaluated = isCurrentActiveMonth ? Math.max(1, now.getDate()) : daysInMonth;
            daysEvaluatedLabel = isCurrentActiveMonth 
                ? `${daysEvaluated} dias decorridos` 
                : (isFutureMonth ? `Planejado sobre ${daysInMonth} dias` : `${daysInMonth} dias no mês`);
            monthsEvaluated = 1;
        } else if (isLast3mMode) {
            const endD = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            const startD = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            startDateStr = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-01`;
            endDateStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
            periodTitle = 'Últimos 3 Meses';

            const evalEndD = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const diffMs = evalEndD.getTime() - startD.getTime();
            daysEvaluated = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
            daysEvaluatedLabel = `${daysEvaluated} dias (3 meses)`;
            monthsEvaluated = 3;
        } else if (isYearMode) {
            const endD = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            const startD = new Date(now.getFullYear(), now.getMonth() - 11, 1);
            startDateStr = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-01`;
            endDateStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
            periodTitle = 'Últimos 12 Meses';

            const evalEndD = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const diffMs = evalEndD.getTime() - startD.getTime();
            daysEvaluated = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
            daysEvaluatedLabel = `${daysEvaluated} dias (12 meses)`;
            monthsEvaluated = 12;
        } else {
            periodTitle = 'Todo o Histórico';
            let earliestDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            allTx.forEach(t => {
                if (t.date && t.date < earliestDateStr) earliestDateStr = t.date;
            });
            startDateStr = earliestDateStr;
            endDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const eD = new Date(`${earliestDateStr}T12:00:00`);
            const diffMs = now.getTime() - eD.getTime();
            daysEvaluated = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
            daysEvaluatedLabel = `${daysEvaluated} dias registrados`;

            const earliestYear = eD.getFullYear();
            const earliestMonth = eD.getMonth();
            monthsEvaluated = Math.max(1, ((now.getFullYear() - earliestYear) * 12) + (now.getMonth() - earliestMonth) + 1);
        }

        // Transações filtradas para o período
        const periodTx = allTx.filter(t => {
            if (!t.date) return false;
            if (startDateStr && t.date < startDateStr) return false;
            if (endDateStr && t.date > endDateStr) return false;
            return true;
        });

        // Identificação de Custos Fixos ativos para classificação
        const activeFixedExpenses = subscriptions.filter(s => s.active !== false && s.type === 'expense');
        const fixedNamesSet = new Set(activeFixedExpenses.map(s => (s.name || '').trim().toLowerCase()).filter(Boolean));

        // Cálculos Financeiros
        let totalIncome = 0;
        let totalExpense = 0;
        const dailyExpenses = {}; // 'YYYY-MM-DD' => sum
        const dailyTxMap = {}; // 'YYYY-MM-DD' => [txs]
        const categoryExpenses = {};
        const categoryTxMap = {}; // catKey => [txs]
        const monthlyAgg = {}; // 'YYYY-MM' => { income, expense, txs }
        const expenseTransactions = [];
        const merchantAggMap = {}; // normDesc => { displayDesc, category, count, totalAmount, lastDate }
        let largestExpense = null;

        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        let pastExpenses = 0;
        let futureScheduledExpenses = 0;
        let fixedSubExpenseTotal = 0;
        let installmentExpenseTotal = 0;
        let variableExpenseTotal = 0;
        let variablePastExpenses = 0;

        periodTx.forEach(t => {
            const amt = Number(t.amount) || 0;
            const mKey = t.date ? t.date.substring(0, 7) : '';
            if (mKey) {
                if (!monthlyAgg[mKey]) monthlyAgg[mKey] = { income: 0, expense: 0, txs: 0 };
                if (t.type === 'income') monthlyAgg[mKey].income += amt;
                if (t.type === 'expense') monthlyAgg[mKey].expense += amt;
                monthlyAgg[mKey].txs++;
            }

            if (t.type === 'income') {
                totalIncome += amt;
            } else if (t.type === 'expense') {
                totalExpense += amt;
                if (t.date <= todayStr) {
                    pastExpenses += amt;
                } else {
                    futureScheduledExpenses += amt;
                }

                const rawDesc = (t.description || '').trim();
                const baseDesc = rawDesc.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
                const normDesc = baseDesc.toLowerCase();
                const isFixedSub = Boolean(t.subscriptionId || (normDesc && fixedNamesSet.has(normDesc)));
                const isInstallment = Boolean(t.groupId || (Number(t.installmentTotal) > 1) || /\(\d+\/\d+\)/.test(rawDesc));
                const isCommitted = isFixedSub || isInstallment;

                if (isFixedSub) {
                    fixedSubExpenseTotal += amt;
                } else if (isInstallment) {
                    installmentExpenseTotal += amt;
                } else {
                    variableExpenseTotal += amt;
                }

                if (t.date <= todayStr && !isCommitted) {
                    variablePastExpenses += amt;
                }

                dailyExpenses[t.date] = (dailyExpenses[t.date] || 0) + amt;
                if (!dailyTxMap[t.date]) dailyTxMap[t.date] = [];
                dailyTxMap[t.date].push(t);

                categoryExpenses[t.category] = (categoryExpenses[t.category] || 0) + amt;
                if (!categoryTxMap[t.category]) categoryTxMap[t.category] = [];
                categoryTxMap[t.category].push({ ...t, amount: amt, isFixedSub, isInstallment });

                const enrichedTx = { ...t, amount: amt, isFixedSub, isInstallment };
                expenseTransactions.push(enrichedTx);

                if (normDesc) {
                    if (!merchantAggMap[normDesc]) {
                        merchantAggMap[normDesc] = {
                            displayDesc: baseDesc || rawDesc,
                            category: t.category,
                            count: 0,
                            totalAmount: 0,
                            lastDate: t.date
                        };
                    }
                    merchantAggMap[normDesc].count++;
                    merchantAggMap[normDesc].totalAmount += amt;
                    if (t.date > merchantAggMap[normDesc].lastDate) {
                        merchantAggMap[normDesc].lastDate = t.date;
                    }
                }

                if (!largestExpense || amt > largestExpense.amount) {
                    largestExpense = enrichedTx;
                }
            }
        });

        const currentBalance = totalIncome - totalExpense;

        // Análise de Dias & Médias
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const isCurrentActiveMonth = (this.navYear === currentYear && this.navMonth === currentMonth && isMonthlyMode);
        const isFutureMonth = isMonthlyMode && (this.navYear > currentYear || (this.navYear === currentYear && this.navMonth > currentMonth));
        const isPastMonth = isMonthlyMode && (this.navYear < currentYear || (this.navYear === currentYear && this.navMonth < currentMonth));
        const daysInMonth = isMonthlyMode ? new Date(this.navYear, this.navMonth + 1, 0).getDate() : 30;

        const expenseBaseForAvg = isCurrentActiveMonth ? pastExpenses : totalExpense;
        const dailyAverage = expenseBaseForAvg > 0 ? (expenseBaseForAvg / daysEvaluated) : 0;

        // Picos de Gastos (Spike Outlier Detection para modo mensal)
        let maxSpikeDay = null;
        let maxSpikeMultiplier = 0;
        let zeroSpendDaysCount = 0;

        if (isMonthlyMode) {
            for (let d = 1; d <= daysEvaluated; d++) {
                const dStr = `${this.navYear}-${String(this.navMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayTotal = dailyExpenses[dStr] || 0;

                if (dayTotal === 0) {
                    zeroSpendDaysCount++;
                } else if (dailyAverage > 0) {
                    const mult = dayTotal / dailyAverage;
                    if (mult >= 1.5 && mult > maxSpikeMultiplier) {
                        maxSpikeMultiplier = mult;
                        maxSpikeDay = {
                            date: dStr,
                            dayNum: d,
                            total: dayTotal,
                            multiplier: mult.toFixed(1),
                            items: dailyTxMap[dStr] || []
                        };
                    }
                }
            }
        }

        // Mês Mais Oneroso (para modos macro: last_3m, year, all)
        let mostExpensiveMonth = null;
        if (!isMonthlyMode) {
            let maxMonthExp = 0;
            Object.entries(monthlyAgg).forEach(([mKey, data]) => {
                if (data.expense > maxMonthExp) {
                    maxMonthExp = data.expense;
                    const [yStr, mStr] = mKey.split('-');
                    const mIdx = parseInt(mStr, 10) - 1;
                    mostExpensiveMonth = {
                        monthKey: mKey,
                        name: this.getMonthName(mIdx),
                        label: `${this.getMonthName(mIdx)}/${yStr.substring(2)}`,
                        expense: maxMonthExp,
                        pctOfTotal: totalExpense > 0 ? Math.round((maxMonthExp / totalExpense) * 100) : 0
                    };
                }
            });
        }

        // Previsão de Fechamento (Forecast)
        let forecastBalance = 0;
        let forecastExpense = 0;
        let forecastStatus = 'positive'; // 'positive' | 'negative'
        let forecastText = '';

        if (isCurrentActiveMonth) {
            // Previsão realista: despesas realizadas até hoje + contas agendadas a vencer até o fim do mês
            forecastExpense = pastExpenses + futureScheduledExpenses;
            forecastBalance = totalIncome - forecastExpense;
            forecastStatus = forecastBalance >= 0 ? 'positive' : 'negative';

            if (forecastBalance >= 0) {
                if (futureScheduledExpenses > 0) {
                    forecastText = `Sobra com ${this.formatCurrency(futureScheduledExpenses)} a vencer`;
                } else {
                    forecastText = `Saldo atual sem contas a vencer`;
                }
            } else {
                if (futureScheduledExpenses > 0) {
                    forecastText = `Déficit com ${this.formatCurrency(futureScheduledExpenses)} a vencer`;
                } else {
                    forecastText = `Déficit atual nos lançamentos`;
                }
            }
        } else if (isFutureMonth) {
            forecastBalance = currentBalance;
            forecastExpense = totalExpense;
            forecastStatus = forecastBalance >= 0 ? 'positive' : 'negative';
            if (totalIncome === 0) {
                forecastText = `${this.formatCurrency(totalExpense)} em contas agendadas`;
            } else if (forecastBalance >= 0) {
                forecastText = `Sobra agendada de ${this.formatCurrency(forecastBalance)}`;
            } else {
                forecastText = `Déficit agendado de ${this.formatCurrency(Math.abs(forecastBalance))}`;
            }
        } else if (isPastMonth) {
            forecastBalance = currentBalance;
            forecastExpense = totalExpense;
            forecastStatus = forecastBalance >= 0 ? 'positive' : 'negative';
            forecastText = forecastBalance >= 0 ? 'Mês fechado no verde' : 'Mês fechado no vermelho';
        } else {
            forecastBalance = currentBalance;
            forecastExpense = totalExpense;
            forecastStatus = forecastBalance >= 0 ? 'positive' : 'negative';
            forecastText = forecastBalance >= 0 ? 'Período superavitário' : 'Período deficitário';
        }

        // Taxa de Poupança (% Economia)
        const savingsRate = totalIncome > 0 ? Math.max(0, ((totalIncome - totalExpense) / totalIncome) * 100).toFixed(1) : '0';

        // Comprometimento Fixo (proporcional à renda média mensal do período)
        const totalFixedMonthly = activeFixedExpenses.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
        const avgMonthlyIncome = totalIncome / Math.max(1, monthsEvaluated);
        const fixedCommitmentRate = avgMonthlyIncome > 0 ? Math.min(100, Math.round((totalFixedMonthly / avgMonthlyIncome) * 100)) : 0;

        // Barra de Consumo do Orçamento (em tempo real durante o mês corrente)
        const budgetExpense = isCurrentActiveMonth ? pastExpenses : totalExpense;
        const isConsumptionOver = totalIncome > 0 && budgetExpense > totalIncome;
        const rawConsumptionRate = totalIncome > 0 ? (budgetExpense / totalIncome) * 100 : 0;
        const consumptionRate = Math.round(rawConsumptionRate);
        const overAmount = Math.max(0, budgetExpense - totalIncome);
        const overPct = (rawConsumptionRate - 100).toFixed(1);

        const remainingIncome = Math.max(0, totalIncome - budgetExpense);
        const willBeOverbudget = isCurrentActiveMonth && (futureScheduledExpenses > remainingIncome);
        const projectedDeficit = willBeOverbudget ? (futureScheduledExpenses - remainingIncome) : 0;
        const trueFreeAmount = isCurrentActiveMonth ? Math.max(0, remainingIncome - futureScheduledExpenses) : remainingIncome;

        // Meta de Teto Personalizada (% da Receita)
        const budgetTargetPct = this.getBudgetTargetPct();
        const hasCustomTarget = budgetTargetPct < 100;
        const targetLimitAmount = totalIncome * (budgetTargetPct / 100);
        const targetSavingsAmount = Math.max(0, totalIncome - targetLimitAmount);
        const isOverTarget = hasCustomTarget && totalIncome > 0 && budgetExpense > targetLimitAmount && !isConsumptionOver;
        const remainingToTarget = Math.max(0, targetLimitAmount - budgetExpense);
        const overTargetAmount = Math.max(0, budgetExpense - targetLimitAmount);

        // Divisão Fixos/Parcelados vs Variáveis (Estilo de Vida)
        const committedExpenseTotal = fixedSubExpenseTotal + installmentExpenseTotal;
        const committedPct = totalExpense > 0 ? Math.round((committedExpenseTotal / totalExpense) * 100) : 0;
        const variablePct = totalExpense > 0 ? (100 - committedPct) : 0;

        // Projeção de Fechamento por Ritmo (Run-Rate) para o Mês Atual
        const daysRemaining = isCurrentActiveMonth ? Math.max(0, daysInMonth - daysEvaluated) : 0;
        const variableDailyPace = (isCurrentActiveMonth && daysEvaluated > 0) ? (variablePastExpenses / daysEvaluated) : 0;
        const projectedExtraVariable = variableDailyPace * daysRemaining;
        const runRateTotalExpense = pastExpenses + futureScheduledExpenses + projectedExtraVariable;
        const runRateBalance = totalIncome - runRateTotalExpense;

        // Segmentação da barra quando ultrapassa 100%
        let budgetCoveredPct = 100;
        let budgetOverPct = 0;
        if (isConsumptionOver) {
            budgetCoveredPct = Math.max(1, Math.min(99, Math.round((totalIncome / budgetExpense) * 100)));
            budgetOverPct = 100 - budgetCoveredPct;
        }

        // Comparativo Mês Anterior (MoM)
        const prevMonthDate = new Date(this.navYear, this.navMonth - 1, 1);
        const prevMonthStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
        const prevMonthEndD = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0);
        const prevMonthEnd = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-${String(prevMonthEndD.getDate()).padStart(2, '0')}`;

        const prevMonthCatExpenses = {};
        allTx.forEach(t => {
            if (t.type === 'expense' && t.date >= prevMonthStart && t.date <= prevMonthEnd) {
                prevMonthCatExpenses[t.category] = (prevMonthCatExpenses[t.category] || 0) + (Number(t.amount) || 0);
            }
        });

        // Categorias ordenadas por valor (todas as categorias ativas no período)
        const sortedCats = Object.entries(categoryExpenses)
            .sort((a, b) => b[1] - a[1]);

        // Top 5 Maiores Despesas Individuais e Top 5 Mais Frequentes / Acumuladas
        const top5Expenses = [...expenseTransactions]
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);

        const top5Frequent = Object.values(merchantAggMap)
            .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.totalAmount - a.totalAmount))
            .slice(0, 5);

        let chartSectionTitle = '';
        if (isMonthlyMode) {
            if (isFutureMonth) {
                chartSectionTitle = this.activeTab === 'daily' ? 'Contas Agendadas por Dia' : 'Evolução Receita x Despesa (Últimos 6 Meses)';
            } else {
                chartSectionTitle = this.activeTab === 'daily' ? 'Gastos Diários e Picos' : 'Evolução Receita x Despesa (Últimos 6 Meses)';
            }
        } else if (isLast3mMode) {
            chartSectionTitle = 'Comparativo Mensal (Últimos 3 Meses)';
        } else if (isYearMode) {
            chartSectionTitle = 'Balanço Mensal (Últimos 12 Meses)';
        } else if (isAllMode) {
            chartSectionTitle = 'Evolução Histórica por Ano';
        }

        // Bloco reutilizável de Composição Fixos vs Variáveis + Projeção Run-Rate
        const splitAndRunRateHtml = totalExpense > 0 ? `
            <div class="stats-split-section">
                <div class="stats-split-header">
                    <span class="stats-split-item committed" title="Fixos: ${this.formatCurrency(fixedSubExpenseTotal)} | Parcelas: ${this.formatCurrency(installmentExpenseTotal)}">
                        <span class="stats-split-dot committed"></span>
                        🔒 Fixos & Parcelas: <strong class="privacy-blur">${this.formatCurrency(committedExpenseTotal)}</strong> <small>(${committedPct}%)</small>
                    </span>
                    <span class="stats-split-item variable" title="Gastos variáveis e compras avulsas do período">
                        <span class="stats-split-dot variable"></span>
                        ⚡ Variáveis / Livres: <strong class="privacy-blur">${this.formatCurrency(variableExpenseTotal)}</strong> <small>(${variablePct}%)</small>
                    </span>
                </div>
                <div class="stats-split-bar">
                    <div class="stats-split-fill committed" style="width: ${committedPct}%;" title="Comprometido (Fixos + Parcelas): ${committedPct}%"></div>
                    <div class="stats-split-fill variable" style="width: ${variablePct}%;" title="Variáveis (Estilo de Vida): ${variablePct}%"></div>
                </div>
                ${(isCurrentActiveMonth && daysRemaining > 0 && variablePastExpenses > 0) ? `
                    <div class="stats-runrate-box">
                        <div class="stats-runrate-text">
                            <span>🔮 <strong>Simulação de Ritmo Diário (${daysRemaining} ${daysRemaining === 1 ? 'dia restante' : 'dias restantes'}):</strong></span>
                            <span class="privacy-blur">Se mantiver <strong>${this.formatCurrency(variableDailyPace)}/dia</strong> em gastos livres${futureScheduledExpenses > 0 ? ` + ${this.formatCurrency(futureScheduledExpenses)} agendados` : ''}, o total gasto chegaria a <strong>${this.formatCurrency(runRateTotalExpense)}</strong></span>
                        </div>
                        ${totalIncome > 0 ? `
                            <span class="stats-runrate-badge ${runRateBalance >= 0 ? 'positive' : 'negative'} privacy-blur">
                                ${runRateBalance >= 0 ? `Simulação: +${this.formatCurrency(runRateBalance)}` : `Simulação: -${this.formatCurrency(Math.abs(runRateBalance))}`}
                            </span>
                        ` : `
                            <span class="stats-runrate-badge neutral privacy-blur">
                                +${this.formatCurrency(projectedExtraVariable)} variáveis até o fim do mês
                            </span>
                        `}
                    </div>
                ` : ''}
            </div>
        ` : '';

        // Montagem do HTML
        let html = `
            <!-- Barra de Filtros e Navegação -->
            <div class="stats-nav-bar">
                <div class="stats-filters">
                    <button class="stats-chip ${this.selectedPeriod === 'current_month' ? 'active' : ''}" data-period="current_month">
                        Este Mês
                    </button>
                    <button class="stats-chip ${this.selectedPeriod === 'prev_month' ? 'active' : ''}" data-period="prev_month">
                        Mês Anterior
                    </button>
                    <button class="stats-chip ${this.selectedPeriod === 'last_3m' ? 'active' : ''}" data-period="last_3m">
                        Últimos 3 Meses
                    </button>
                    <button class="stats-chip ${this.selectedPeriod === 'year' ? 'active' : ''}" data-period="year">
                        Últimos 12 Meses
                    </button>
                    <button class="stats-chip ${this.selectedPeriod === 'all' ? 'active' : ''}" data-period="all">
                        Todo Período
                    </button>
                </div>

                ${isMonthlyMode ? `
                    <div class="stats-month-stepper">
                        <button class="stats-step-btn" id="statsPrevMonth" title="Mês Anterior (Atalho: Tecla ←)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                        </button>
                        <span class="stats-current-label">${periodTitle}</span>
                        <button class="stats-step-btn" id="statsNextMonth" title="Próximo Mês (Atalho: Tecla →)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>
                    </div>
                ` : `
                    <div class="stats-current-label" style="text-align: right;">${periodTitle}</div>
                `}
            </div>

            <!-- Cards Principais de KPIs (3 grandes) -->
            <div class="stats-summary">
                <div class="stats-kpi-card ${forecastStatus === 'positive' ? 'forecast-positive' : 'forecast-negative'}">
                    <div class="stats-kpi-value ${forecastStatus === 'positive' ? 'positive' : 'negative'}">
                        ${this.formatCurrency(forecastBalance)}
                    </div>
                    <div class="stats-kpi-label">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${(isCurrentActiveMonth || isFutureMonth) ? `
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            ` : `
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            `}
                        </svg>
                        ${isCurrentActiveMonth ? 'Balanço c/ Agendados' : (isFutureMonth ? 'Balanço Agendado' : (isMonthlyMode ? 'Saldo do Mês' : 'Saldo do Período'))}
                    </div>
                    <div class="stats-kpi-sub">${forecastText}</div>
                </div>

                <div class="stats-kpi-card highlight">
                    <div class="stats-kpi-value">
                        ${savingsRate}%
                    </div>
                    <div class="stats-kpi-label">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="19" x2="12" y2="5"></line>
                            <polyline points="5 12 12 5 19 12"></polyline>
                        </svg>
                        ${isFutureMonth ? 'Previsão de Economia' : 'Taxa de Poupança'}
                    </div>
                    <div class="stats-kpi-sub">
                        ${totalIncome > 0 
                            ? (isFutureMonth 
                                ? `${this.formatCurrency(Math.max(0, currentBalance))} previstos` 
                                : `${this.formatCurrency(Math.max(0, currentBalance))} guardados`) 
                            : (isFutureMonth ? 'Aguardando receitas futuras' : 'Sem receita registrada')}
                    </div>
                </div>

                <div class="stats-kpi-card">
                    <div class="stats-kpi-value">
                        ${this.formatCurrency(dailyAverage)}
                    </div>
                    <div class="stats-kpi-label">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        ${isFutureMonth ? 'Gasto Médio Previsto' : 'Média de Gasto Diário'}
                    </div>
                    <div class="stats-kpi-sub">
                        ${isFutureMonth ? `Planejado sobre ${daysInMonth} dias` : `Calculado sobre ${daysEvaluatedLabel}`}
                    </div>
                </div>
            </div>

            <!-- Grid de 4 Cards Menores de Insights (Estilo Reading) -->
            <div class="stats-grid-extra">
                <!-- Card 1: Maior Pico de Gastos (mensal) ou Mês de Maior Gasto (macro) -->
                ${isMonthlyMode ? `
                    <div class="stats-mini-card ${maxSpikeDay ? 'spike-card' : ''}">
                        <div class="stats-mini-label" title="${isFutureMonth ? 'Pico Agendado' : 'Maior Pico'}">
                            ${isFutureMonth ? '🚨 Pico Agendado' : '🚨 Maior Pico'}
                        </div>
                        <div class="stats-mini-title" title="${maxSpikeDay ? `Dia ${String(maxSpikeDay.dayNum).padStart(2, '0')}/${String(this.navMonth + 1).padStart(2, '0')}` : 'Sem picos atípicos'}">
                            ${maxSpikeDay ? `Dia ${String(maxSpikeDay.dayNum).padStart(2, '0')}/${String(this.navMonth + 1).padStart(2, '0')}` : 'Sem picos atípicos'}
                        </div>
                        <div class="stats-mini-badge">
                            ${maxSpikeDay ? `🔥 ${this.formatCurrency(maxSpikeDay.total)} <small>(${maxSpikeDay.multiplier}x)</small>` : 'Gastos lineares ✅'}
                        </div>
                    </div>
                ` : `
                    <div class="stats-mini-card ${mostExpensiveMonth ? 'spike-card' : ''}">
                        <div class="stats-mini-label" title="Mês de Pico">
                            🚨 Mês de Pico
                        </div>
                        <div class="stats-mini-title" title="${mostExpensiveMonth ? mostExpensiveMonth.label : 'Sem registros'}">
                            ${mostExpensiveMonth ? mostExpensiveMonth.label : 'Sem registros'}
                        </div>
                        <div class="stats-mini-badge">
                            ${mostExpensiveMonth ? `🔥 ${this.formatCurrency(mostExpensiveMonth.expense)} <small>(${mostExpensiveMonth.pctOfTotal}%)</small>` : 'Gastos lineares ✅'}
                        </div>
                    </div>
                `}

                <!-- Card 2: Maior Despesa Isolada -->
                <div class="stats-mini-card">
                    <div class="stats-mini-label" title="${isFutureMonth ? 'Maior Conta' : 'Maior Despesa'}">
                        ${isFutureMonth ? '🛒 Maior Conta' : '🛒 Maior Despesa'}
                    </div>
                    <div class="stats-mini-title" title="${largestExpense ? this.escapeHtml(largestExpense.description) : '-'}">
                        ${largestExpense ? this.escapeHtml(largestExpense.description) : 'Nenhuma'}
                    </div>
                    <div class="stats-mini-badge">
                        ${largestExpense ? this.formatCurrency(largestExpense.amount) : 'R$ 0,00'}
                    </div>
                </div>

                <!-- Card 3: Dias Sem Gastos (mensal) ou Média Mensal (macro) -->
                ${isMonthlyMode ? `
                    <div class="stats-mini-card">
                        <div class="stats-mini-label" title="${isFutureMonth ? 'Dias Sem Contas' : 'Sem Gastos'}">
                            ${isFutureMonth ? '📅 Dias Sem Contas' : '🌱 Sem Gastos'}
                        </div>
                        <div class="stats-mini-title">
                            ${isFutureMonth 
                                ? `${zeroSpendDaysCount} ${zeroSpendDaysCount === 1 ? 'dia livre' : 'dias livres'}` 
                                : `${zeroSpendDaysCount} ${zeroSpendDaysCount === 1 ? 'dia' : 'dias'}`}
                        </div>
                        <div class="stats-mini-badge ${zeroSpendDaysCount > 0 ? 'success' : ''}">
                            ${isFutureMonth 
                                ? (zeroSpendDaysCount > 0 ? 'Sem contas agendadas' : 'Contas em todos os dias')
                                : (zeroSpendDaysCount > 0 ? 'Economia ativa 👏' : 'Todos com registro')}
                        </div>
                    </div>
                ` : `
                    <div class="stats-mini-card">
                        <div class="stats-mini-label" title="Média Mensal">
                            📊 Média Mensal
                        </div>
                        <div class="stats-mini-title privacy-blur">
                            ${this.formatCurrency(totalExpense / Math.max(1, monthsEvaluated))}
                        </div>
                        <div class="stats-mini-badge">
                            Base: ${monthsEvaluated} ${monthsEvaluated === 1 ? 'mês' : 'meses'}
                        </div>
                    </div>
                `}

                <!-- Card 4: Comprometimento Fixo -->
                <div class="stats-mini-card">
                    <div class="stats-mini-label" title="Custos Fixos">
                        🔒 Custos Fixos
                    </div>
                    <div class="stats-mini-title privacy-blur">
                        ${totalIncome > 0 ? `${fixedCommitmentRate}% da Renda` : `${this.formatCurrency(totalFixedMonthly)} fixos`}
                    </div>
                    <div class="stats-mini-badge">
                        ${totalIncome > 0 ? `${this.formatCurrency(totalFixedMonthly)}/mês fixos` : 'Assinaturas agendadas'}
                    </div>
                </div>
            </div>

            <!-- Barra de Consumo da Receita + Meta de Teto + Divisão Fixos/Variáveis + Run-Rate -->
            ${totalIncome > 0 ? `
                <div class="stats-goal-card ${isConsumptionOver ? 'overbudget' : ''}">
                    <div class="stats-goal-header">
                        <div class="stats-goal-title">
                            ${isConsumptionOver ? `
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                    <line x1="12" y1="9" x2="12" y2="13"></line>
                                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                </svg>
                                <span>Consumo do Orçamento (${periodTitle})</span>
                                <span class="stats-overbudget-pill">Orçamento Estourado</span>
                            ` : `
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: var(--accent-color);">
                                    <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
                                </svg>
                                <span>Consumo do Orçamento (${periodTitle})</span>
                            `}
                            <button type="button" class="stats-target-pill ${hasCustomTarget ? 'active' : ''}" id="btnToggleBudgetTarget" title="Configurar Teto de Gastos / Meta de Economia">
                                🎯 ${hasCustomTarget ? `Teto: ${budgetTargetPct}%` : 'Definir Meta'} ✎
                            </button>
                        </div>
                        <div class="stats-goal-stats">
                            ${this.formatCurrency(budgetExpense)} <small>/ ${this.formatCurrency(totalIncome)}</small>
                            ${isConsumptionOver ? `
                                <span class="stats-overbudget-badge">🚨 ${consumptionRate}% (+${this.formatCurrency(overAmount)})</span>
                            ` : `
                                <small>(${consumptionRate}%)</small>
                            `}
                        </div>
                    </div>

                    ${this.isEditingBudgetTarget ? `
                        <div class="stats-target-editor">
                            <div class="stats-target-editor-top">
                                <span class="stats-target-editor-label">🎯 Teto máximo de gastos (% da receita — sincronizado na nuvem):</span>
                                <div class="stats-target-custom" title="Digite qualquer percentual personalizado entre 10% e 100%">
                                    <span class="stats-target-custom-label">Personalizado:</span>
                                    <input type="number" id="customTargetInput" min="10" max="100" value="${budgetTargetPct}">
                                    <span>%</span>
                                    <button type="button" id="btnApplyCustomTarget" class="stats-target-apply-btn">OK</button>
                                </div>
                            </div>
                            <div class="stats-target-presets">
                                ${[50, 60, 70, 80, 90, 100].map(p => `
                                    <button type="button" class="stats-target-preset-btn ${budgetTargetPct === p ? 'active' : ''}" data-target-pct="${p}">
                                        ${p === 100 ? '100% (Sem meta)' : `${p}% (Poupar ${100 - p}%)`}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${isConsumptionOver ? `
                        <div class="stats-goal-bar-bg overbudget">
                            <div class="stats-goal-bar-fill budget-limit" style="width: ${budgetCoveredPct}%;" title="Renda coberta: ${this.formatCurrency(totalIncome)} (100%)"></div>
                            <div class="stats-goal-bar-fill budget-over" style="width: ${budgetOverPct}%;" title="Excedente: ${this.formatCurrency(overAmount)} (+${overPct}%)"></div>
                            <div class="stats-goal-marker" style="left: ${budgetCoveredPct}%;" title="Limite da Renda (100%)"></div>
                        </div>
                        <div class="stats-goal-sub">
                            <span>Renda atingida (100%)</span>
                            <span class="stats-goal-over-text">Excedeu em <strong>+${this.formatCurrency(overAmount)}</strong> (+${overPct}%)</span>
                        </div>
                    ` : `
                        <div class="stats-goal-bar-bg">
                            <div class="stats-goal-bar-fill ${isOverTarget ? 'over-target' : ''}" style="width: ${Math.min(100, consumptionRate)}%;"></div>
                            ${hasCustomTarget ? `
                                <div class="stats-goal-target-marker" style="left: ${budgetTargetPct}%;" title="Meta de Teto: ${budgetTargetPct}% (${this.formatCurrency(targetLimitAmount)}) — Economia planejada: ${this.formatCurrency(targetSavingsAmount)} (${100 - budgetTargetPct}%)"></div>
                            ` : ''}
                        </div>
                        <div class="stats-goal-sub">
                            ${isFutureMonth ? `
                                <span>Saldo restante previsto: <strong style="color: var(--income-color);">${this.formatCurrency(remainingIncome)}</strong></span>
                                <span>${hasCustomTarget ? (isOverTarget ? `<strong style="color: #fbbf24;">⚠️ +${this.formatCurrency(overTargetAmount)} acima da meta (${budgetTargetPct}%)</strong>` : `🎯 Margem na meta (${budgetTargetPct}%): ${this.formatCurrency(remainingToTarget)}`) : `${Math.max(0, 100 - consumptionRate)}% livre`}</span>
                            ` : willBeOverbudget ? `
                                <span>Sobra atual: <strong style="color: #fbbf24;">${this.formatCurrency(remainingIncome)}</strong> <small style="color: #fbbf24;">(${this.formatCurrency(futureScheduledExpenses)} a vencer ⚠️)</small></span>
                                <span style="color: #f87171; font-weight: 600;">Balanço c/ agendados: -${this.formatCurrency(projectedDeficit)}</span>
                            ` : (isCurrentActiveMonth && futureScheduledExpenses > 0) ? `
                                <span>Livre para gastar: <strong style="color: var(--income-color);">${this.formatCurrency(trueFreeAmount)}</strong> <small style="color: var(--text-secondary);">(${this.formatCurrency(futureScheduledExpenses)} a vencer)</small></span>
                                <span>${hasCustomTarget ? (isOverTarget ? `<strong style="color: #fbbf24;">⚠️ +${this.formatCurrency(overTargetAmount)} acima da meta (${budgetTargetPct}%)</strong>` : `🎯 Na meta (${budgetTargetPct}%): restam ${this.formatCurrency(remainingToTarget)}`) : `${Math.max(0, Math.round((trueFreeAmount / totalIncome) * 100))}% livre`}</span>
                            ` : `
                                <span>Disponível para gastar: <strong style="color: var(--income-color);">${this.formatCurrency(remainingIncome)}</strong></span>
                                <span>${hasCustomTarget ? (isOverTarget ? `<strong style="color: #fbbf24;">⚠️ +${this.formatCurrency(overTargetAmount)} acima da meta (${budgetTargetPct}%)</strong>` : `🎯 Na meta (${budgetTargetPct}%): restam ${this.formatCurrency(remainingToTarget)}`) : `${Math.max(0, 100 - consumptionRate)}% restante`}</span>
                            `}
                        </div>
                    `}

                    ${splitAndRunRateHtml}
                </div>
            ` : (totalExpense > 0 ? `
                <div class="stats-goal-card">
                    <div class="stats-goal-header">
                        <div class="stats-goal-title">
                            <span>⚖️ Composição de Gastos (${periodTitle})</span>
                        </div>
                        <div class="stats-goal-stats privacy-blur">
                            ${this.formatCurrency(totalExpense)}
                        </div>
                    </div>
                    ${splitAndRunRateHtml}
                </div>
            ` : '')}

            <!-- Seção de Gráficos e Heatmap -->
            <div class="stats-section-box">
                <div class="stats-section-header">
                    <div class="stats-section-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="20" x2="18" y2="10"></line>
                            <line x1="12" y1="20" x2="12" y2="4"></line>
                            <line x1="6" y1="20" x2="6" y2="14"></line>
                        </svg>
                        <span id="statsChartTitle">${chartSectionTitle}</span>
                    </div>
                    ${isMonthlyMode ? `
                        <div class="stats-tab-group">
                            <button class="stats-tab-btn ${this.activeTab === 'daily' ? 'active' : ''}" id="tabDailyBtn">
                                📅 Por Dia
                            </button>
                            <button class="stats-tab-btn ${this.activeTab === 'history' ? 'active' : ''}" id="tabHistBtn">
                                📈 Histórico 6M
                            </button>
                        </div>
                    ` : ''}
                </div>

                <div class="stats-chart-wrapper">
                    <canvas id="statsChartCanvas"></canvas>
                </div>
            </div>

            <!-- Mapa de Atividade e Gastos Diários (Estilo GitHub / Reading) -->
            <div class="stats-section-box">
                <div class="stats-section-header">
                    <div class="stats-section-title">
                        <span>🔥 Mapa de Atividade e Gastos</span>
                        <small style="font-size: 0.775rem; color: var(--text-muted); font-weight: 400;" id="statsHeatmapSubtitle">
                            (${this.heatmapSpan === 6 ? 'Últimos 6 Meses' : 'Últimos 12 Meses'})
                        </small>
                    </div>
                    <div class="stats-tab-group">
                        <button class="stats-tab-btn ${this.heatmapSpan === 6 ? 'active' : ''}" id="heatmapSpan6Btn">
                            6 Meses
                        </button>
                        <button class="stats-tab-btn ${this.heatmapSpan === 12 ? 'active' : ''}" id="heatmapSpan12Btn">
                            12 Meses
                        </button>
                    </div>
                </div>
                <div class="stats-heatmap-wrapper" id="statsHeatmapWrapper"></div>
                <div class="stats-heatmap-legend">
                    <span>Zero Gasto</span>
                    <div class="stats-legend-cells">
                        <div class="stats-legend-cell level-0"></div>
                        <div class="stats-legend-cell level-1"></div>
                        <div class="stats-legend-cell level-2"></div>
                        <div class="stats-legend-cell level-3"></div>
                        <div class="stats-legend-cell level-4"></div>
                    </div>
                    <span>Pico Alto</span>
                </div>
            </div>

            <!-- Comparativo de Categorias com Drill-down Interativo -->
            ${sortedCats.length > 0 ? `
                <div class="stats-section-box">
                    <div class="stats-section-header">
                        <div class="stats-section-title">
                            ${isFutureMonth ? `🏷️ Contas Agendadas por Categoria (${periodTitle})` : (isMonthlyMode ? '⚖️ Principais Categorias vs Mês Anterior' : `🏷️ Principais Categorias (${periodTitle})`)}
                        </div>
                        <span class="stats-section-hint">👆 Clique na categoria para ver os itens</span>
                    </div>
                    <div class="stats-categories-list">
                        ${sortedCats.map(([catKey, amt]) => {
                            const icon = CATEGORIES.expense[catKey] || '📦';
                            const name = CATEGORY_NAMES[catKey] || catKey;
                            const prevAmt = prevMonthCatExpenses[catKey] || 0;
                            const diff = amt - prevAmt;
                            const pctOfTotal = totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0;
                            const catColor = EXPENSE_COLORS[catKey] || '#f2511b';
                            const isExpanded = this.expandedCategories.has(catKey);
                            const catTxs = (categoryTxMap[catKey] || []).slice().sort((a, b) => b.amount - a.amount);
                            const visibleCatTxs = catTxs.slice(0, 8);
                            const hiddenCatTxsCount = Math.max(0, catTxs.length - visibleCatTxs.length);

                            let diffHtml = '';
                            if (isMonthlyMode) {
                                if (prevAmt === 0) {
                                    diffHtml = `<span class="stats-cat-badge neutral">Novo este mês</span>`;
                                } else if (diff > 0) {
                                    const pct = Math.round((diff / prevAmt) * 100);
                                    diffHtml = `<span class="stats-cat-badge danger">🔺 +${pct}% (+${this.formatCurrency(diff)})</span>`;
                                } else if (diff < 0) {
                                    const pct = Math.round((Math.abs(diff) / prevAmt) * 100);
                                    diffHtml = `<span class="stats-cat-badge success">🔻 -${pct}% (-${this.formatCurrency(Math.abs(diff))})</span>`;
                                } else {
                                    diffHtml = `<span class="stats-cat-badge neutral">= Estável</span>`;
                                }
                            } else {
                                const monthlyCatAvg = amt / Math.max(1, monthsEvaluated);
                                diffHtml = `<span class="stats-cat-badge neutral">Média: ${this.formatCurrency(monthlyCatAvg)}/mês</span>`;
                            }

                            return `
                                <div class="stats-cat-card clickable ${isExpanded ? 'expanded' : ''}" data-cat="${catKey}">
                                    <div class="stats-cat-top">
                                        <div class="stats-cat-info">
                                            <div class="stats-cat-icon-wrap" style="background: ${catColor}1f; border-color: ${catColor}40;">
                                                <span>${icon}</span>
                                            </div>
                                            <div class="stats-cat-details">
                                                <span class="stats-cat-name">
                                                    ${name}
                                                    <svg class="stats-cat-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                        <polyline points="6 9 12 15 18 9"></polyline>
                                                    </svg>
                                                </span>
                                                <span class="stats-cat-share">${pctOfTotal}% do total • ${catTxs.length} ${catTxs.length === 1 ? 'item' : 'itens'}</span>
                                            </div>
                                        </div>
                                        <div class="stats-cat-value-wrap">
                                            <span class="stats-cat-amount">${this.formatCurrency(amt)}</span>
                                            ${diffHtml}
                                        </div>
                                    </div>
                                    <div class="stats-cat-bar-bg">
                                        <div class="stats-cat-bar-fill" style="width: ${pctOfTotal}%; background: ${catColor}; box-shadow: 0 0 8px ${catColor}50;"></div>
                                    </div>
                                    <div class="stats-cat-drilldown">
                                        <div class="stats-drill-list">
                                            ${visibleCatTxs.map(tx => {
                                                const [yS, mS, dS] = (tx.date || '').split('-');
                                                const shortDate = isMonthlyMode ? `${dS}/${mS}` : `${dS}/${mS}/${(yS || '').substring(2)}`;
                                                const itemShare = amt > 0 ? Math.round((tx.amount / amt) * 100) : 0;
                                                const tagBadge = tx.isFixedSub
                                                    ? '<span class="stats-drill-tag fixed">🔒 Fixo</span>'
                                                    : (tx.isInstallment ? '<span class="stats-drill-tag installment">💳 Parcela</span>' : (tx.date > todayStr ? '<span class="stats-drill-tag future">⏳ Agendado</span>' : ''));
                                                return `
                                                    <div class="stats-drill-item">
                                                        <div class="stats-drill-left">
                                                            <span class="stats-drill-date">${shortDate}</span>
                                                            <span class="stats-drill-desc" title="${this.escapeHtml(tx.description)}">${this.escapeHtml(tx.description)}</span>
                                                            ${tagBadge}
                                                        </div>
                                                        <div class="stats-drill-right privacy-blur">
                                                            <strong>${this.formatCurrency(tx.amount)}</strong>
                                                            <small>(${itemShare}%)</small>
                                                        </div>
                                                    </div>
                                                `;
                                            }).join('')}
                                            ${hiddenCatTxsCount > 0 ? `
                                                <div class="stats-drill-more">+ ${hiddenCatTxsCount} ${hiddenCatTxsCount === 1 ? 'outro lançamento' : 'outros lançamentos'} nesta categoria</div>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Ranking de Despesas: Top 5 Maiores Gastos & Mais Frequentes (Vilões) -->
            ${top5Expenses.length > 0 ? `
                <div class="stats-section-box">
                    <div class="stats-section-header">
                        <div class="stats-section-title">
                            <span>🏆 Ranking de Despesas (${periodTitle})</span>
                        </div>
                        <div class="stats-tab-group">
                            <button type="button" class="stats-tab-btn ${this.rankingTab === 'largest' ? 'active' : ''}" id="tabRankLargest">
                                🏆 Top 5 Maiores
                            </button>
                            <button type="button" class="stats-tab-btn ${this.rankingTab === 'frequent' ? 'active' : ''}" id="tabRankFrequent">
                                🔁 Mais Frequentes
                            </button>
                        </div>
                    </div>

                    <!-- Aba 1: Top 5 Maiores Gastos Individuais -->
                    <div class="stats-ranking-list" id="rankListLargest" style="${this.rankingTab === 'largest' ? '' : 'display: none;'}">
                        ${top5Expenses.map((tx, idx) => {
                            const icon = CATEGORIES.expense[tx.category] || '📦';
                            const catName = CATEGORY_NAMES[tx.category] || tx.category;
                            const pct = totalExpense > 0 ? Math.round((tx.amount / totalExpense) * 100) : 0;
                            const badgeType = tx.isFixedSub ? '🔒 Fixo' : (tx.isInstallment ? '💳 Parcelado' : '⚡ Variável');
                            return `
                                <div class="stats-ranking-item">
                                    <div class="stats-ranking-left">
                                        <span class="stats-rank-pos rank-${idx + 1}">${idx + 1}º</span>
                                        <div class="stats-ranking-icon">${icon}</div>
                                        <div class="stats-ranking-info">
                                            <span class="stats-ranking-desc" title="${this.escapeHtml(tx.description)}">${this.escapeHtml(tx.description)}</span>
                                            <span class="stats-ranking-meta">${this.formatDateBR(tx.date)} • ${catName} • ${badgeType}</span>
                                        </div>
                                    </div>
                                    <div class="stats-ranking-right privacy-blur">
                                        <span class="stats-ranking-amount">${this.formatCurrency(tx.amount)}</span>
                                        <span class="stats-ranking-share">${pct}% do total</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <!-- Aba 2: Top 5 Mais Frequentes / Acumulados -->
                    <div class="stats-ranking-list" id="rankListFrequent" style="${this.rankingTab === 'frequent' ? '' : 'display: none;'}">
                        ${top5Frequent.map((item, idx) => {
                            const icon = CATEGORIES.expense[item.category] || '📦';
                            const catName = CATEGORY_NAMES[item.category] || item.category;
                            const pct = totalExpense > 0 ? Math.round((item.totalAmount / totalExpense) * 100) : 0;
                            const avg = item.totalAmount / Math.max(1, item.count);
                            return `
                                <div class="stats-ranking-item">
                                    <div class="stats-ranking-left">
                                        <span class="stats-rank-freq">${item.count}x</span>
                                        <div class="stats-ranking-icon">${icon}</div>
                                        <div class="stats-ranking-info">
                                            <span class="stats-ranking-desc" title="${this.escapeHtml(item.displayDesc)}">${this.escapeHtml(item.displayDesc)}</span>
                                            <span class="stats-ranking-meta">${catName} • Média de ${this.formatCurrency(avg)} por lançamento</span>
                                        </div>
                                    </div>
                                    <div class="stats-ranking-right privacy-blur">
                                        <span class="stats-ranking-amount">${this.formatCurrency(item.totalAmount)}</span>
                                        <span class="stats-ranking-share">${pct}% do total</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}
        `;

        this.container.innerHTML = html;

        this.currentChartData = {
            isMonthlyMode,
            isFutureMonth,
            isYearMode,
            isLast3mMode,
            isAllMode,
            daysInMonth,
            dailyExpenses,
            dailyTxMap,
            dailyAverage,
            maxSpikeDay,
            allTx,
            navYear: this.navYear,
            navMonth: this.navMonth
        };

        // Anexa Event Listeners
        this.attachEventListeners();
        this.renderCharts();
        this.renderHeatmap();
    }

    attachEventListeners() {
        // Chips de Período
        this.container.querySelectorAll('.stats-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const p = chip.dataset.period;
                if (p) this.setPeriod(p);
            });
        });

        // Stepper de Mês
        const prevBtn = document.getElementById('statsPrevMonth');
        const nextBtn = document.getElementById('statsNextMonth');
        if (prevBtn) prevBtn.addEventListener('click', () => this.stepMonth(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => this.stepMonth(1));

        // Meta de Teto do Orçamento
        const toggleTargetBtn = document.getElementById('btnToggleBudgetTarget');
        if (toggleTargetBtn) {
            toggleTargetBtn.addEventListener('click', () => {
                this.isEditingBudgetTarget = !this.isEditingBudgetTarget;
                this.render();
            });
        }

        this.container.querySelectorAll('.stats-target-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const pct = Number(btn.dataset.targetPct);
                if (pct) this.setBudgetTargetPct(pct);
            });
        });

        const applyCustomTargetBtn = document.getElementById('btnApplyCustomTarget');
        const customTargetInput = document.getElementById('customTargetInput');
        if (applyCustomTargetBtn && customTargetInput) {
            applyCustomTargetBtn.addEventListener('click', () => {
                this.setBudgetTargetPct(customTargetInput.value);
            });
            customTargetInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.setBudgetTargetPct(customTargetInput.value);
                }
            });
        }

        // Drill-down Interativo nas Categorias
        this.container.querySelectorAll('.stats-cat-card.clickable').forEach(card => {
            card.addEventListener('click', () => {
                const catKey = card.dataset.cat;
                if (!catKey) return;
                if (this.expandedCategories.has(catKey)) {
                    this.expandedCategories.delete(catKey);
                    card.classList.remove('expanded');
                } else {
                    this.expandedCategories.add(catKey);
                    card.classList.add('expanded');
                }
            });
        });

        // Abas do Ranking (Top 5 Maiores vs Mais Frequentes)
        const tabRankLargest = document.getElementById('tabRankLargest');
        const tabRankFrequent = document.getElementById('tabRankFrequent');
        const rankListLargest = document.getElementById('rankListLargest');
        const rankListFrequent = document.getElementById('rankListFrequent');
        if (tabRankLargest && tabRankFrequent && rankListLargest && rankListFrequent) {
            tabRankLargest.addEventListener('click', () => {
                this.rankingTab = 'largest';
                tabRankLargest.classList.add('active');
                tabRankFrequent.classList.remove('active');
                rankListLargest.style.display = '';
                rankListFrequent.style.display = 'none';
            });
            tabRankFrequent.addEventListener('click', () => {
                this.rankingTab = 'frequent';
                tabRankFrequent.classList.add('active');
                tabRankLargest.classList.remove('active');
                rankListFrequent.style.display = '';
                rankListLargest.style.display = 'none';
            });
        }

        // Abas do Gráfico
        const dailyBtn = document.getElementById('tabDailyBtn');
        const histBtn = document.getElementById('tabHistBtn');
        if (dailyBtn) dailyBtn.addEventListener('click', () => this.setActiveTab('daily'));
        if (histBtn) histBtn.addEventListener('click', () => this.setActiveTab('history'));

        // Abas do Heatmap (6M / 12M)
        const span6Btn = document.getElementById('heatmapSpan6Btn');
        const span12Btn = document.getElementById('heatmapSpan12Btn');
        if (span6Btn) span6Btn.addEventListener('click', () => this.setHeatmapSpan(6));
        if (span12Btn) span12Btn.addEventListener('click', () => this.setHeatmapSpan(12));
    }

    setHeatmapSpan(span) {
        if (this.heatmapSpan === span) return;
        this.heatmapSpan = span;
        const sub = document.getElementById('statsHeatmapSubtitle');
        if (sub) sub.textContent = `(${span === 6 ? 'Últimos 6 Meses' : 'Últimos 12 Meses'})`;

        const btn6 = document.getElementById('heatmapSpan6Btn');
        const btn12 = document.getElementById('heatmapSpan12Btn');
        if (btn6) btn6.classList.toggle('active', span === 6);
        if (btn12) btn12.classList.toggle('active', span === 12);

        this.renderHeatmap();
    }

    renderCharts() {
        const canvas = document.getElementById('statsChartCanvas');
        if (!canvas) return;

        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }

        const {
            isMonthlyMode,
            isFutureMonth,
            isYearMode,
            isLast3mMode,
            daysInMonth,
            dailyExpenses,
            dailyTxMap,
            dailyAverage,
            maxSpikeDay,
            allTx,
            navYear,
            navMonth
        } = this.currentChartData || {};

        const ctx = canvas.getContext('2d');
        const allTransactions = allTx || this.fm.getAll();

        if (isMonthlyMode) {
            if (this.activeTab === 'daily') {
                // Gráfico de Gastos Diários do Mês com destaque no pico e linha da média
                const numDays = daysInMonth || new Date(navYear, navMonth + 1, 0).getDate();
                const labels = [];
                const dataValues = [];
                const backgroundColors = [];
                const borderColors = [];

                for (let d = 1; d <= numDays; d++) {
                    labels.push(`${d}`);
                    const dStr = `${navYear}-${String(navMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const val = (dailyExpenses && dailyExpenses[dStr]) || 0;
                    dataValues.push(val);

                    // Destaque para o pico
                    if (maxSpikeDay && maxSpikeDay.dayNum === d) {
                        backgroundColors.push('rgba(242, 81, 27, 0.95)');
                        borderColors.push('#ffffff');
                    } else if (val > dailyAverage * 1.2 && val > 0) {
                        backgroundColors.push('rgba(242, 81, 27, 0.6)');
                        borderColors.push('#f2511b');
                    } else if (val > 0) {
                        backgroundColors.push('rgba(99, 102, 241, 0.6)');
                        borderColors.push('#6366f1');
                    } else {
                        backgroundColors.push('rgba(255, 255, 255, 0.05)');
                        borderColors.push('rgba(255, 255, 255, 0.1)');
                    }
                }

                // Linha da média diária como dataset de linha
                const averageLineData = new Array(numDays).fill(Math.round(dailyAverage || 0));

                this.chartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: isFutureMonth ? 'Contas no Dia' : 'Gasto no Dia',
                                data: dataValues,
                                backgroundColor: backgroundColors,
                                borderColor: borderColors,
                                borderWidth: 1,
                                borderRadius: 4,
                                order: 2
                            },
                            {
                                type: 'line',
                                label: isFutureMonth ? 'Média Prevista' : 'Média Diária',
                                data: averageLineData,
                                borderColor: '#fbbf24',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                pointRadius: 0,
                                fill: false,
                                order: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false
                        },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: {
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    font: { size: 11, family: 'Inter' }
                                }
                            },
                            tooltip: {
                                backgroundColor: '#18192d',
                                titleColor: '#fff',
                                bodyColor: '#fff',
                                footerColor: '#a5b4fc',
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                                borderWidth: 1,
                                callbacks: {
                                    title: (items) => `Dia ${String(items[0].label).padStart(2, '0')}/${String(navMonth + 1).padStart(2, '0')}`,
                                    label: (context) => {
                                        if (context.dataset.type === 'line') {
                                            return `Média: ${this.formatCurrency(context.raw)}`;
                                        }
                                        return `${isFutureMonth ? 'Agendado' : 'Gasto'}: ${this.formatCurrency(context.raw)}`;
                                    },
                                    footer: (items) => {
                                        if (!dailyTxMap || !items.length) return '';
                                        const dayNum = items[0].label;
                                        const dStr = `${navYear}-${String(navMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                                        const dayTxs = dailyTxMap[dStr];
                                        if (!dayTxs || dayTxs.length === 0) return '';
                                        const sorted = [...dayTxs].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
                                        const top = sorted[0];
                                        return dayTxs.length > 1
                                            ? `Principal: ${top.description} (+${dayTxs.length - 1})`
                                            : `Item: ${top.description}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: {
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    font: { size: 10 }
                                }
                            },
                            y: {
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: {
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    font: { size: 10 },
                                    callback: (v) => 'R$ ' + v
                                }
                            }
                        }
                    }
                });
            } else {
                // Histórico dos Últimos 6 Meses (ancorado ao mês navegado)
                this.renderMultiMonthChart(ctx, 6, allTransactions, navYear, navMonth);
            }
        } else if (isLast3mMode) {
            // Últimos 3 Meses
            this.renderMultiMonthChart(ctx, 3, allTransactions);
        } else if (isYearMode) {
            // Últimos 12 Meses
            this.renderMultiMonthChart(ctx, 12, allTransactions);
        } else {
            // Todo Período (Anual ou Histórico Completo)
            this.renderAllPeriodChart(ctx, allTransactions);
        }
    }

    renderMultiMonthChart(ctx, count, allTransactions, anchorYear, anchorMonth) {
        const now = new Date();
        const baseYear = anchorYear !== undefined ? anchorYear : now.getFullYear();
        const baseMonth = anchorMonth !== undefined ? anchorMonth : now.getMonth();
        const months = [];
        const monthTargets = [];
        const incomes = [];
        const expenses = [];

        for (let i = count - 1; i >= 0; i--) {
            const targetD = new Date(baseYear, baseMonth - i, 1);
            const y = targetD.getFullYear();
            const m = targetD.getMonth();
            const mLabel = `${this.getMonthName(m).substring(0, 3)}/${String(y).substring(2)}`;
            months.push(mLabel);
            monthTargets.push({ year: y, month: m });

            const startStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
            const endD = new Date(y, m + 1, 0);
            const endStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;

            let inc = 0;
            let exp = 0;
            allTransactions.forEach(t => {
                if (t.date >= startStr && t.date <= endStr) {
                    if (t.type === 'income') inc += Number(t.amount) || 0;
                    if (t.type === 'expense') exp += Number(t.amount) || 0;
                }
            });

            incomes.push(inc);
            expenses.push(exp);
        }

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Receitas',
                        data: incomes,
                        backgroundColor: 'rgba(34, 197, 94, 0.75)',
                        borderColor: '#22c55e',
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: 'Despesas',
                        data: expenses,
                        backgroundColor: 'rgba(242, 81, 27, 0.75)',
                        borderColor: '#f2511b',
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onHover: (event, elements) => {
                    if (event?.native?.target) {
                        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const target = monthTargets[idx];
                        if (target) this.jumpToMonth(target.year, target.month);
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: { size: 11, family: 'Inter' }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#18192d',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        footerColor: '#a5b4fc',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: (c) => `${c.dataset.label}: ${this.formatCurrency(c.raw)}`,
                            footer: (items) => {
                                const idx = items[0].dataIndex;
                                const diff = (incomes[idx] || 0) - (expenses[idx] || 0);
                                return `Saldo Líquido: ${diff >= 0 ? '+' : ''}${this.formatCurrency(diff)}\n👆 Clique para abrir o mês`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: { size: 11 }
                        }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: { size: 10 },
                            callback: (v) => 'R$ ' + v
                        }
                    }
                }
            }
        });
    }

    renderYearChart(ctx, year, allTransactions) {
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const incomes = [];
        const expenses = [];

        for (let m = 0; m < 12; m++) {
            const startStr = `${year}-${String(m + 1).padStart(2, '0')}-01`;
            const endD = new Date(year, m + 1, 0);
            const endStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;

            let inc = 0;
            let exp = 0;
            allTransactions.forEach(t => {
                if (t.date >= startStr && t.date <= endStr) {
                    if (t.type === 'income') inc += Number(t.amount) || 0;
                    if (t.type === 'expense') exp += Number(t.amount) || 0;
                }
            });

            incomes.push(inc);
            expenses.push(exp);
        }

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Receitas',
                        data: incomes,
                        backgroundColor: 'rgba(34, 197, 94, 0.75)',
                        borderColor: '#22c55e',
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: 'Despesas',
                        data: expenses,
                        backgroundColor: 'rgba(242, 81, 27, 0.75)',
                        borderColor: '#f2511b',
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onHover: (event, elements) => {
                    if (event?.native?.target) {
                        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const mIdx = elements[0].index;
                        this.jumpToMonth(year, mIdx);
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: { size: 11, family: 'Inter' }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#18192d',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        footerColor: '#a5b4fc',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        callbacks: {
                            title: (items) => `${this.getMonthName(items[0].dataIndex)} de ${year}`,
                            label: (c) => `${c.dataset.label}: ${this.formatCurrency(c.raw)}`,
                            footer: (items) => {
                                const idx = items[0].dataIndex;
                                const diff = (incomes[idx] || 0) - (expenses[idx] || 0);
                                return `Saldo Líquido: ${diff >= 0 ? '+' : ''}${this.formatCurrency(diff)}\n👆 Clique para abrir o mês`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: { size: 11 }
                        }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: { size: 10 },
                            callback: (v) => 'R$ ' + v
                        }
                    }
                }
            }
        });
    }

    renderAllPeriodChart(ctx, allTransactions) {
        const yearSet = new Set();
        allTransactions.forEach(t => {
            if (t.date && t.date.length >= 4) {
                yearSet.add(parseInt(t.date.substring(0, 4), 10));
            }
        });
        if (yearSet.size === 0) {
            yearSet.add(new Date().getFullYear());
        }

        const sortedYears = Array.from(yearSet).sort((a, b) => a - b);

        if (sortedYears.length <= 1) {
            this.renderYearChart(ctx, sortedYears[0], allTransactions);
            return;
        }

        const labels = sortedYears.map(String);
        const incomes = [];
        const expenses = [];

        sortedYears.forEach(y => {
            const startStr = `${y}-01-01`;
            const endStr = `${y}-12-31`;

            let inc = 0;
            let exp = 0;
            allTransactions.forEach(t => {
                if (t.date >= startStr && t.date <= endStr) {
                    if (t.type === 'income') inc += Number(t.amount) || 0;
                    if (t.type === 'expense') exp += Number(t.amount) || 0;
                }
            });

            incomes.push(inc);
            expenses.push(exp);
        });

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Receitas',
                        data: incomes,
                        backgroundColor: 'rgba(34, 197, 94, 0.75)',
                        borderColor: '#22c55e',
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: 'Despesas',
                        data: expenses,
                        backgroundColor: 'rgba(242, 81, 27, 0.75)',
                        borderColor: '#f2511b',
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: { size: 11, family: 'Inter' }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#18192d',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        callbacks: {
                            title: (items) => `Ano de ${items[0].label}`,
                            label: (c) => `${c.dataset.label}: ${this.formatCurrency(c.raw)}`,
                            footer: (items) => {
                                const idx = items[0].dataIndex;
                                const diff = (incomes[idx] || 0) - (expenses[idx] || 0);
                                return `Saldo Líquido: ${diff >= 0 ? '+' : ''}${this.formatCurrency(diff)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: { size: 11 }
                        }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: { size: 10 },
                            callback: (v) => 'R$ ' + v
                        }
                    }
                }
            }
        });
    }

    renderHeatmap() {
        const wrapper = document.getElementById('statsHeatmapWrapper');
        if (!wrapper) return;

        wrapper.innerHTML = '';

        const allTx = this.fm.getAll();
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // Agregação de todas as despesas diárias
        const dailyExpenses = {};
        const dailyTxMap = {};
        allTx.forEach(t => {
            if (t.type === 'expense' && t.date) {
                const amt = Number(t.amount) || 0;
                dailyExpenses[t.date] = (dailyExpenses[t.date] || 0) + amt;
                if (!dailyTxMap[t.date]) dailyTxMap[t.date] = [];
                dailyTxMap[t.date].push(t);
            }
        });

        // Define data final: se estiver em modo mensal, finaliza no fim do mês navegado; senão, na data de hoje
        let endDate;
        if (['current_month', 'prev_month', 'custom_month'].includes(this.selectedPeriod)) {
            endDate = new Date(this.navYear, this.navMonth + 1, 0);
        } else {
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }

        const numWeeks = this.heatmapSpan === 6 ? 26 : 52;
        const totalDays = numWeeks * 7;

        // Alinha a semana final no sábado (day 6)
        const endDayOfWeek = endDate.getDay();
        const gridEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + (6 - endDayOfWeek));

        // Início no domingo (day 0) exatamente numWeeks semanas antes
        const gridStart = new Date(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate() - totalDays + 1);

        // Calcula média diária no período do grid para calibrar os 4 níveis de cor
        let windowExpenses = 0;
        let daysWithExpensesCount = 0;
        let checkDate = new Date(gridStart);
        while (checkDate <= gridEnd) {
            const y = checkDate.getFullYear();
            const m = String(checkDate.getMonth() + 1).padStart(2, '0');
            const d = String(checkDate.getDate()).padStart(2, '0');
            const key = `${y}-${m}-${d}`;
            const exp = dailyExpenses[key] || 0;
            if (exp > 0) {
                windowExpenses += exp;
                daysWithExpensesCount++;
            }
            checkDate.setDate(checkDate.getDate() + 1);
        }
        const windowDailyAvg = daysWithExpensesCount > 0 ? (windowExpenses / daysWithExpensesCount) : 50;

        // Monta os contadores de colunas por mês para o cabeçalho
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const monthColCounts = [];
        let currMonth = gridStart.getMonth();
        let colsInCurrMonth = 0;

        let iterWeek = new Date(gridStart);
        for (let w = 0; w < numWeeks; w++) {
            const m = iterWeek.getMonth();
            if (m !== currMonth) {
                monthColCounts.push({ month: currMonth, cols: colsInCurrMonth });
                currMonth = m;
                colsInCurrMonth = 1;
            } else {
                colsInCurrMonth++;
            }
            iterWeek.setDate(iterWeek.getDate() + 7);
        }
        if (colsInCurrMonth > 0) {
            monthColCounts.push({ month: currMonth, cols: colsInCurrMonth });
        }

        // Cabeçalho dos meses
        let monthsHtml = '<div class="stats-heatmap-months">';
        for (const mc of monthColCounts) {
            const label = mc.cols >= 2 ? monthNames[mc.month] : '';
            const widthPct = ((mc.cols / numWeeks) * 100).toFixed(3);
            monthsHtml += `<div class="stats-month-label" style="width: ${widthPct}%;">${label}</div>`;
        }
        monthsHtml += '</div>';

        // Elemento com rolagem horizontal
        const scrollEl = document.createElement('div');
        scrollEl.className = 'stats-heatmap-scroll';
        scrollEl.innerHTML = monthsHtml;

        const bodyEl = document.createElement('div');
        bodyEl.className = 'stats-heatmap-body';

        // Rótulos dos dias da semana (Seg, Qua, Sex)
        const daysLabelsEl = document.createElement('div');
        daysLabelsEl.className = 'stats-heatmap-days-labels';
        const weekDayNames = ['', 'Seg', '', 'Qua', '', 'Sex', ''];
        weekDayNames.forEach(name => {
            const span = document.createElement('span');
            span.className = 'stats-day-label';
            span.textContent = name;
            daysLabelsEl.appendChild(span);
        });
        bodyEl.appendChild(daysLabelsEl);

        // Grade de Semanas
        const weeksContainer = document.createElement('div');
        weeksContainer.className = 'stats-heatmap-weeks';

        let curCellDate = new Date(gridStart);
        for (let w = 0; w < numWeeks; w++) {
            const weekCol = document.createElement('div');
            weekCol.className = 'stats-heatmap-week';

            for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
                const y = curCellDate.getFullYear();
                const m = String(curCellDate.getMonth() + 1).padStart(2, '0');
                const d = String(curCellDate.getDate()).padStart(2, '0');
                const dStr = `${y}-${m}-${d}`;

                const total = dailyExpenses[dStr] || 0;
                const txs = dailyTxMap[dStr] || [];

                let levelClass = 'level-0';
                if (total > 0) {
                    if (total >= windowDailyAvg * 2.0) {
                        levelClass = 'level-4';
                    } else if (total >= windowDailyAvg * 1.2) {
                        levelClass = 'level-3';
                    } else if (total >= windowDailyAvg * 0.5) {
                        levelClass = 'level-2';
                    } else {
                        levelClass = 'level-1';
                    }
                }

                const cell = document.createElement('div');
                cell.className = `stats-heatmap-cell ${levelClass}`;
                cell.dataset.date = dStr;
                cell.dataset.total = total;
                cell.dataset.count = txs.length;

                // Marcação sutil se for o mês navegado
                if (this.navYear === curCellDate.getFullYear() && this.navMonth === curCellDate.getMonth()) {
                    cell.classList.add('is-nav-month');
                }

                // Tooltip e clique para ir ao mês correspondente
                const cellDateCopy = new Date(curCellDate);
                const cellYear = cellDateCopy.getFullYear();
                const cellMonth = cellDateCopy.getMonth();
                const isMonthlyActive = ['current_month', 'prev_month', 'custom_month'].includes(this.selectedPeriod);
                const isOtherMonth = !isMonthlyActive || this.navYear !== cellYear || this.navMonth !== cellMonth;

                cell.addEventListener('click', () => {
                    this.jumpToMonth(cellYear, cellMonth);
                });

                cell.addEventListener('mouseenter', () => {
                    if (!this.tooltipEl) return;
                    const formattedDate = cellDateCopy.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const isFuture = dStr > todayStr;
                    let tooltipContent = `<strong>${formattedDate}</strong>: ${this.formatCurrency(total)}`;
                    if (txs.length > 0) {
                        const labelWord = isFuture 
                            ? `${txs.length} conta${txs.length > 1 ? 's agendadas' : ' agendada'}`
                            : `${txs.length} transaç${txs.length > 1 ? 'ões' : 'ão'}`;
                        tooltipContent += `<br><span style="opacity:0.8;">${labelWord}</span>`;
                        const sortedTxs = [...txs].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
                        const topDesc = this.escapeHtml(sortedTxs[0].description);
                        tooltipContent += `<br><small style="color:var(--accent-color);">${topDesc}${txs.length > 1 ? ` (+${txs.length - 1})` : ''}</small>`;
                    } else {
                        tooltipContent += `<br><small style="color:var(--income-color);">${isFuture ? '🌱 Sem contas agendadas' : '🌱 Sem gastos'}</small>`;
                    }
                    if (isOtherMonth) {
                        tooltipContent += `<br><small style="opacity:0.65;">👆 Clique para abrir ${monthNames[cellMonth]}/${String(cellYear).substring(2)}</small>`;
                    }
                    this.tooltipEl.innerHTML = tooltipContent;
                    this.tooltipEl.style.opacity = '1';

                    const rect = cell.getBoundingClientRect();
                    const tooltipWidth = this.tooltipEl.offsetWidth || 160;
                    const halfWidth = tooltipWidth / 2;
                    const rawLeft = rect.left + (rect.width / 2);
                    const clampedLeft = Math.max(halfWidth + 12, Math.min(window.innerWidth - halfWidth - 12, rawLeft));
                    this.tooltipEl.style.left = `${clampedLeft}px`;

                    if (rect.top < 110) {
                        this.tooltipEl.style.top = `${rect.bottom + 10}px`;
                        this.tooltipEl.style.transform = 'translate(-50%, 0)';
                    } else {
                        this.tooltipEl.style.top = `${rect.top - 10}px`;
                        this.tooltipEl.style.transform = 'translate(-50%, -100%)';
                    }
                });

                cell.addEventListener('mouseleave', () => {
                    if (this.tooltipEl) this.tooltipEl.style.opacity = '0';
                });

                weekCol.appendChild(cell);
                curCellDate.setDate(curCellDate.getDate() + 1);
            }

            weeksContainer.appendChild(weekCol);
        }

        bodyEl.appendChild(weeksContainer);
        scrollEl.appendChild(bodyEl);
        wrapper.appendChild(scrollEl);

        // Auto-scroll suave para o final em telas menores
        setTimeout(() => {
            if (wrapper.scrollWidth > wrapper.clientWidth) {
                wrapper.scrollLeft = wrapper.scrollWidth;
            }
        }, 30);
    }
}

/**
 * Renderização e Controle Visual do Modal de Estatísticas, Heatmap e Detalhes de Período
 */
import { escapeHTML } from '../utils/helpers.js';

export const StatsView = {
    renderHeatMap(dailyPages, year) {
        const container = document.getElementById('heatmapContainer');
        if (!container) return;

        const now = new Date();
        let startDate, endDate;

        const isNumericYear = !isNaN(year) && year !== 'Desconhecido';

        if (year === 'all' || !isNumericYear) {
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            startDate = new Date(endDate);
            startDate.setFullYear(endDate.getFullYear() - 1);
            startDate.setDate(startDate.getDate() - startDate.getDay());
        } else {
            startDate = new Date(year, 0, 1);
            startDate.setDate(startDate.getDate() - startDate.getDay());
            endDate = new Date(year, 11, 31);
        }

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            container.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 1rem;">Não foi possível gerar o mapa para este período.</p>';
            return;
        }

        const formatDate = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        let currentDate = new Date(startDate);
        let weeksHtml = '<div class="heatmap-weeks">';
        let currentWeekHtml = '';
        let dayCount = 0;
        let activeDaysCount = 0;
        
        let monthColCounts = [];
        let currentMonth = startDate.getMonth();
        let colsInCurrentMonth = 0;

        while (currentDate <= endDate || currentDate.getDay() !== 0) {
            if (dayCount > 400) break; 
            
            if (currentDate.getDay() === 0) {
                let m = currentDate.getMonth();
                if (m !== currentMonth) {
                    monthColCounts.push({ month: currentMonth, cols: colsInCurrentMonth });
                    currentMonth = m;
                    colsInCurrentMonth = 1;
                } else {
                    colsInCurrentMonth++;
                }
            }

            const dateKey = formatDate(currentDate);
            const pages = dailyPages[dateKey] || 0;
            let level = 0;

            if (pages > 0) {
                activeDaysCount++;
                if (pages < 20) level = 1;
                else if (pages < 50) level = 2;
                else if (pages < 100) level = 3;
                else level = 4;
            }

            const isCurrentYear = year === 'all' || currentDate.getFullYear() == year;
            const isFuture = currentDate > now;
            const isEmpty = !isCurrentYear || isFuture;

            const tooltip = `${currentDate.toLocaleDateString('pt-BR')} - ${pages} Pág.`;
            const onclick = isEmpty ? '' : `onclick="App.showMessage('Atividade de Leitura', '${tooltip}', '🔥')"`;

            currentWeekHtml += `<div class="heatmap-cell level-${level} ${isEmpty ? 'empty' : ''}" title="${isEmpty ? '' : tooltip}" ${onclick}></div>`;
            
            currentDate.setDate(currentDate.getDate() + 1);
            dayCount++;

            if (dayCount % 7 === 0) {
                weeksHtml += `<div class="heatmap-week">${currentWeekHtml}</div>`;
                currentWeekHtml = '';
            }
        }
        weeksHtml += '</div>';

        if (colsInCurrentMonth > 0) {
            monthColCounts.push({ month: currentMonth, cols: colsInCurrentMonth });
        }

        let monthsHtml = '<div class="heatmap-months" style="display: flex; margin-left: 35px; gap: 0; margin-bottom: 5px;">';
        for (let mc of monthColCounts) {
            const labelName = mc.cols >= 2 ? monthNames[mc.month] : '';
            monthsHtml += `<div style="width: calc(${mc.cols} * var(--heatmap-col-width)); font-size: 0.65rem; color: var(--text-muted); flex-shrink: 0; overflow: hidden;">${labelName}</div>`;
        }
        monthsHtml += '</div>';

        let html = '<div class="heatmap-wrapper">' + monthsHtml + '<div class="heatmap-grid">';
        
        html += '<div class="heatmap-labels-days">';
        weekDays.forEach((day, i) => {
            if (i % 2 !== 0) html += `<div class="day-label">${day}</div>`;
            else html += `<div class="day-label"></div>`;
        });
        html += '</div>';
        
        html += weeksHtml;
        html += '</div></div>';
        
        if (activeDaysCount > 0) {
            html += `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 5px; text-align: right;">${activeDaysCount} dias com atividade registrados</div>`;
        }

        container.innerHTML = html;
    },

    renderStatsDashboard(statsState, allBooks) {
        const container = document.getElementById('statsContent');
        if (!container) return;
        const { data, selectedYear } = statsState;

        const years = Object.keys(data.years).sort((a, b) => b - a).filter(y => y !== 'Desconhecido');
        if (data.years['Desconhecido']) years.push('Desconhecido');

        let html = `<div class="stats-filters">
            <button class="chip ${selectedYear === 'all' ? 'active' : ''}" onclick="App.setStatsYear('all')">Todos</button>`;
        years.forEach(y => {
            html += `<button class="chip ${selectedYear == y ? 'active' : ''}" onclick="App.setStatsYear('${y}')">${y}</button>`;
        });
        html += `</div>`;

        const current = selectedYear === 'all' ? data.all : data.years[selectedYear];
        if (!current) { container.innerHTML = html + '<p>Sem dados.</p>'; return; }

        const avg = current.ratedCount > 0 ? (current.ratingSum / current.ratedCount).toFixed(1) : '-';

        let topAuth = '-'; let maxAuth = 0;
        for (const [auth, cnt] of Object.entries(current.authors)) {
            if (cnt > maxAuth) { maxAuth = cnt; topAuth = auth; }
        }

        const mNamesFull = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        let maxMonthVal = 0;
        let maxMonthIdx = -1;
        current.monthlyDist.forEach((val, idx) => {
            if (val > maxMonthVal) {
                maxMonthVal = val;
                maxMonthIdx = idx;
            }
        });
        const activeMonth = maxMonthIdx >= 0 ? mNamesFull[maxMonthIdx] : '-';

        const longest = current.longestBook || { title: '-', pages: '' };
        const shortest = current.shortestBook || { title: '-', pages: '' };

        html += `
            <div class="stats-summary">
                <div class="summary-card" onclick="App.openPeriodDetails('${selectedYear === 'all' ? 'all' : 'year'}', '${selectedYear}', 'finishes')" style="cursor: pointer;">
                    <div class="summary-value">${current.booksCount}</div>
                    <div class="summary-label">Livros Concluídos</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${current.pages.toLocaleString()}</div>
                    <div class="summary-label">Páginas Lidas</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">★ ${avg}</div>
                    <div class="summary-label">Média de Avaliação</div>
                </div>
            </div>

            <div class="stats-grid-extra" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                 <div class="summary-card" style="align-items: flex-start; text-align: left; padding: 1.25rem;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Livro Mais Longo</div>
                    <div style="font-weight: 600; color: white; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;" title="${longest.title}">${longest.title}</div>
                    <div style="font-size: 0.9rem; color: var(--accent-color);">${longest.pages ? longest.pages + ' pág' : '-'}</div>
                </div>
                 <div class="summary-card" style="align-items: flex-start; text-align: left; padding: 1.25rem;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Livro Mais Curto</div>
                    <div style="font-weight: 600; color: white; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;" title="${shortest.title}">${shortest.title}</div>
                    <div style="font-size: 0.9rem; color: var(--accent-color);">${shortest.pages ? shortest.pages + ' pág' : '-'}</div>
                </div>
                 <div class="summary-card" style="align-items: flex-start; text-align: left; padding: 1.25rem;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Autor Mais Lido</div>
                    <div style="font-weight: 600; color: white; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;" title="${topAuth}">${topAuth}</div>
                    <div style="font-size: 0.9rem; color: var(--accent-color);">${maxAuth > 0 ? maxAuth + ' livros' : '-'}</div>
                </div>
                 <div class="summary-card" style="align-items: flex-start; text-align: left; padding: 1.25rem;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Mês Mais Ativo</div>
                    <div style="font-weight: 600; color: white; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;" title="${activeMonth}">${activeMonth}</div>
                    <div style="font-size: 0.9rem; color: var(--accent-color);">${maxMonthVal > 0 ? maxMonthVal + ' livros' : '-'}</div>
                </div>
            </div>
            
            <div class="chart-container">
                <div class="chart-title">Mapa de Calor de Leitura</div>
                <div id="heatmapContainer"></div>
                <div class="heatmap-legend">
                    <span>Menos</span>
                    <div class="legend-cells">
                        <div class="heatmap-cell level-0"></div>
                        <div class="heatmap-cell level-1"></div>
                        <div class="heatmap-cell level-2"></div>
                        <div class="heatmap-cell level-3"></div>
                        <div class="heatmap-cell level-4"></div>
                    </div>
                    <span>Mais</span>
                </div>
            </div>
        `;

        if (selectedYear !== 'all' && selectedYear !== 'Desconhecido') {
            const booksInGoal = (allBooks || []).filter(b => b.goalYear == selectedYear);
            const goalTotal = booksInGoal.length;

            if (goalTotal > 0) {
                const goalRead = booksInGoal.filter(b => b.status === 'read').length;
                const progressPercent = Math.round((goalRead / goalTotal) * 100);

                html = `
                    <div class="goal-progress-container">
                        <div class="goal-header">
                            <div class="goal-title">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-8c0 1.93-1.57 3.5-3.5 3.5s-3.5-1.57-3.5-3.5 1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5z"/>
                                </svg>
                                Meta de Leitura ${selectedYear}
                            </div>
                            <div class="goal-stats">
                                ${goalRead}/${goalTotal} <small>lidos</small>
                            </div>
                        </div>
                        <div class="goal-bar-bg">
                            <div class="goal-bar-fill" style="width: ${progressPercent}%"></div>
                        </div>
                    </div>
                ` + html;
            }
        }

        html += `<div class="chart-container">`;
        if (selectedYear === 'all') {
            html += `<div class="chart-title">Livros Concluídos por Ano</div><div class="chart-bars">`;
            const ySorted = Object.keys(data.years).sort((a, b) => a - b).filter(y => y !== 'Desconhecido');
            let maxY = 0; ySorted.forEach(y => maxY = Math.max(maxY, data.years[y].booksCount));
            if (maxY === 0) maxY = 1;

            ySorted.forEach(y => {
                const c = data.years[y].booksCount;
                const h = Math.max((c / maxY) * 100, 4);
                html += `<div class="bar-group" title="${c} livros" onclick="App.openPeriodDetails('year', '${y}', 'finishes')"><div class="bar-value">${c > 0 ? c : ''}</div><div class="bar" style="height:${h}%"></div><div class="bar-label">${y}</div></div>`;
            });
            html += `</div>`;
            html += `</div>`;
        } else if (selectedYear === 'Desconhecido') {
            html += `<div class="chart-title">Livros sem Data Definida</div>
                        <div style="display: flex; justify-content: center; align-items: center; padding: 2rem;">
                            <button class="btn btn-primary" onclick="App.openPeriodDetails('year', 'Desconhecido', 'finishes')">Ver Lista Completa (${current.booksCount} livros)</button>
                        </div>`;
        } else {
            html += `<div class="chart-title">Volume de Leitura - Páginas (${selectedYear})</div><div class="chart-bars">`;
            const mNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            let maxP = Math.max(...current.monthlyPagesDist, 0);
            if (maxP === 0) maxP = 1;

            current.monthlyPagesDist.forEach((pVal, i) => {
                const h = Math.max((pVal / Math.max(maxP, 1)) * 100, 4);
                html += `<div class="bar-group" title="${pVal.toLocaleString()} páginas" onclick="App.openPeriodDetails('month', '${i}', 'pages')"><div class="bar-value">${pVal > 0 ? pVal : ''}</div><div class="bar" style="height:${h}%"></div><div class="bar-label">${mNames[i]}</div></div>`;
            });
            html += `</div>`;

            html += `<div style="margin-bottom: 2.5rem;"></div>`;

            html += `<div class="chart-title">Livros Concluídos por Mês (${selectedYear})</div><div class="chart-bars">`;
            let maxM = Math.max(...current.monthlyDist, 0);
            if (maxM === 0) maxM = 1;

            current.monthlyDist.forEach((c, i) => {
                const h = Math.max((c / maxM) * 100, 4);
                html += `<div class="bar-group" title="${c} livros" onclick="App.openPeriodDetails('month', '${i}', 'finishes')"><div class="bar-value">${c > 0 ? c : ''}</div><div class="bar" style="height:${h}%"></div><div class="bar-label">${mNames[i]}</div></div>`;
            });
            html += `</div>`;
        }
        html += `</div>`;

        container.innerHTML = html;
        this.renderHeatMap(current.dailyPages, selectedYear);
    },

    openPeriodDetails(type, value, mode = 'pages', allBooks = [], selectedYear = 'all') {
        const modal = document.getElementById('periodDetailsModal');
        const content = document.getElementById('periodDetailsContent');
        const title = document.getElementById('periodDetailsTitle');
        if (!modal || !content) return;

        let books = [];
        let periodLabel = '';
        let targetKey = '';

        if (type === 'all') {
            periodLabel = 'Todo o Período';
        } else if (type === 'year') {
            targetKey = value.toString();
            periodLabel = targetKey;
        } else if (type === 'month') {
            const yearStr = selectedYear.toString();
            const monthIdx = parseInt(value);
            targetKey = `${yearStr}-${String(monthIdx + 1).padStart(2, '0')}`;
            const mNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            periodLabel = `${mNames[monthIdx]} de ${yearStr}`;
        }

        books = allBooks.filter(book => {
            if (!book.computed) return false;
            if (type === 'all') {
                const totalFinishes = Object.values(book.computed.activityByYear || {}).reduce((acc, y) => acc + y.finishes, 0);
                
                if (mode === 'finishes') {
                    if (totalFinishes === 0) return false;
                } else {
                    if (book.computed.totalReadPages === 0) return false;
                }
                
                book._tempPagesInPeriod = book.computed.totalReadPages;
                return true;
            }

            const stats = type === 'year' ? book.computed.activityByYear[targetKey] : book.computed.activityByMonth[targetKey];
            const hasGoal = (type === 'year' && book.goalYear == targetKey);
            
            if (stats || hasGoal) {
                if (mode === 'finishes' && (!stats || stats.finishes === 0) && !hasGoal) return false;
                if (mode === 'pages' && (!stats || stats.pages === 0)) return false;

                book._tempPagesInPeriod = stats ? stats.pages : 0;
                return true;
            }
            return false;
        });

        books.sort((a, b) => new Date(b.readDate || 0) - new Date(a.readDate || 0));

        if (title) title.textContent = `Leituras: ${periodLabel} (${books.length})`;

        if (books.length === 0) {
            content.innerHTML = `<div class="empty-state"><p>Nenhum livro ${mode === 'finishes' ? 'concluído' : 'lido'} para este período.</p></div>`;
        } else {
            let html = '<div class="books-list-compact">';
            books.forEach(book => {
                const isPlaceholder = !book.cover || book.cover.includes('placehold.co') || book.cover.includes('Sem+Capa');
                const finalCover = isPlaceholder ? '' : book.cover;
                
                const pagesInPeriod = book._tempPagesInPeriod || 0;
                const escTitle = escapeHTML(book.title);
                const escAuthor = escapeHTML(book.author);

                html += `
                    <div class="api-result-item" onclick="App.editBook('${book.id}')">
                        <div class="api-result-cover-container ${isPlaceholder ? 'is-placeholder' : ''}">
                             <img src="${finalCover}" class="api-result-cover" loading="lazy" alt="${escTitle}"
                                  style="${isPlaceholder ? 'display:none' : ''}"
                                  onerror="this.style.display='none'; this.nextElementSibling.classList.add('visible'); this.parentElement.classList.add('is-placeholder');">
                             
                             <div class="book-cover-placeholder ${isPlaceholder ? 'visible' : ''}" style="border-radius: 4px;">
                                <div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center;">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.5;">
                                       <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                                       <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                                    </svg>
                                </div>
                             </div>
                        </div>
                        <div class="api-result-info">
                            <div class="api-result-title">${escTitle}</div>
                            <div class="api-result-author">${escAuthor}</div>
                            <div style="font-size: 0.75rem; color: var(--accent-color); margin-top: 2px;">
                               ${book.rating > 0 ? '★ ' + book.rating + ' • ' : ''} 
                               ${pagesInPeriod > 0 ? `${pagesInPeriod.toLocaleString()} pág lidas` : (book.pages ? book.pages + ' pág' : '')}
                            </div>
                        </div>
                    </div>`;
            });
            html += '</div>';
            content.innerHTML = html;
        }

        modal.classList.add('active');
    }
};

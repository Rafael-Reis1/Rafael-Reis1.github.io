/**
 * Renderização e Controle Visual do Modal de Estatísticas, Heatmap e Detalhes de Período
 */
import { escapeHTML } from '../utils/helpers.js';
import { calculateReadingStreaks } from '../services/statsService.js';

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

            const tooltip = `${currentDate.toLocaleDateString('pt-BR')} - ${pages} Pág.${pages > 0 ? ' (clique para ver livros)' : ''}`;
            const onclick = isEmpty
                ? ''
                : (pages > 0
                    ? `onclick="App.openPeriodDetails('day', '${dateKey}', 'pages')"`
                    : `onclick="App.showToast('${currentDate.toLocaleDateString('pt-BR')}: Nenhuma página registrada')"`);

            currentWeekHtml += `<div class="heatmap-cell level-${level} ${isEmpty ? 'empty' : ''}" title="${isEmpty ? '' : tooltip}" ${onclick} style="${pages > 0 && !isEmpty ? 'cursor: pointer;' : ''}"></div>`;
            
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
            html += `<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span>💡 Clique em um dia aceso para ver o que você leu</span>
                <span>${activeDaysCount} dias com atividade registrados</span>
            </div>`;
        }

        container.innerHTML = html;
    },

    renderStatsDashboard(statsState, allBooks) {
        const container = document.getElementById('statsContent');
        if (!container) return;
        const { data, selectedYear } = statsState;

        const currentYearStr = String(new Date().getFullYear());
        const yearsSet = new Set(Object.keys(data.years).filter(y => y !== 'Desconhecido'));
        yearsSet.add(currentYearStr);
        const years = [...yearsSet].sort((a, b) => b - a);
        if (data.years['Desconhecido']) years.push('Desconhecido');

        let html = `<div class="stats-filters">
            <button class="chip ${selectedYear === 'all' ? 'active' : ''}" onclick="App.setStatsYear('all')">Todos</button>`;
        years.forEach(y => {
            html += `<button class="chip ${selectedYear == y ? 'active' : ''}" onclick="App.setStatsYear('${y}')">${y}</button>`;
        });
        html += `</div>`;

        const current = selectedYear === 'all'
            ? data.all
            : (data.years[selectedYear] || {
                books: [], booksCount: 0, pages: 0, ratingSum: 0, ratedCount: 0,
                monthlyDist: new Array(12).fill(0), longestBook: null, shortestBook: null,
                authors: {}, dailyPages: {}, monthlyPagesDist: new Array(12).fill(0)
            });

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
        const escLongestTitle = escapeHTML(longest.title);
        const escShortestTitle = escapeHTML(shortest.title);
        const escTopAuth = escapeHTML(topAuth);

        // Calcular Streaks e Ritmo
        const streakInfo = calculateReadingStreaks(current.dailyPages);

        // Calcular tempo médio para concluir um livro e velocidade com timer
        let allCompletionDays = [];
        let totalTimerMin = 0;
        let totalTimerPages = 0;
        const formatCounts = { physical: 0, ebook: 0, audiobook: 0 };
        const genreCounts = {};

        current.books.forEach(b => {
            if (b.computed) {
                if (b.computed.completionDays && b.computed.completionDays.length > 0) {
                    allCompletionDays.push(...b.computed.completionDays);
                }
                totalTimerMin += b.computed.totalReadingMinutes || 0;
                totalTimerPages += b.computed.pagesWithTimer || 0;
            }

            const fmts = Array.isArray(b.readFormat) && b.readFormat.length > 0
                ? b.readFormat
                : (b.tags || []).filter(t => ['physical', 'ebook', 'audiobook'].includes(t));
            fmts.forEach(f => {
                if (formatCounts[f] !== undefined) formatCounts[f]++;
            });

            if (b.genre && b.genre.trim()) {
                const primaryGenre = b.genre.split(',')[0].trim();
                genreCounts[primaryGenre] = (genreCounts[primaryGenre] || 0) + 1;
            }
        });

        const avgCompletionDays = allCompletionDays.length > 0
            ? Math.round(allCompletionDays.reduce((a, b) => a + b, 0) / allCompletionDays.length)
            : null;

        const avgSpeedPph = totalTimerMin >= 5 && totalTimerPages > 0
            ? Math.round((totalTimerPages / totalTimerMin) * 60)
            : null;

        // Bloco de Meta Anual (Quantitativa + Livros com Tag Meta)
        let goalSectionHtml = '';
        if (selectedYear !== 'all' && selectedYear !== 'Desconhecido') {
            const booksInGoal = (allBooks || []).filter(b => b.goalYear == selectedYear);
            const goalTagTotal = booksInGoal.length;
            const goalTagRead = booksInGoal.filter(b => b.status === 'read').length;

            const savedTargetBooks = parseInt(localStorage.getItem(`rm_yearly_goal_books_${selectedYear}`)) || 0;
            const effectiveTarget = savedTargetBooks > 0 ? savedTargetBooks : goalTagTotal;
            const effectiveRead = savedTargetBooks > 0 ? current.booksCount : goalTagRead;

            if (effectiveTarget > 0) {
                const progressPercent = Math.min(100, Math.round((effectiveRead / effectiveTarget) * 100));
                let paceText = '';
                let paceClass = 'pace-ontrack';
                const nowYear = new Date().getFullYear();
                if (parseInt(selectedYear) === nowYear) {
                    const startOfYear = new Date(nowYear, 0, 1);
                    const dayOfYear = Math.max(1, Math.ceil((new Date() - startOfYear) / (1000 * 60 * 60 * 24)));
                    const expectedByNow = (effectiveTarget * dayOfYear) / 365;
                    const diff = effectiveRead - expectedByNow;
                    if (effectiveRead >= effectiveTarget) {
                        paceText = 'Meta anual concluída! Parabéns!';
                        paceClass = 'pace-completed';
                    } else if (diff >= 0.5) {
                        paceText = `Adiantado (+${diff.toFixed(1)} livro(s) acima do ritmo ideal)`;
                        paceClass = 'pace-ahead';
                    } else if (diff <= -0.8) {
                        paceText = `Atrasado (${Math.abs(diff).toFixed(1)} livro(s) abaixo do ritmo ideal)`;
                        paceClass = 'pace-behind';
                    } else {
                        paceText = `No ritmo ideal para concluir até dezembro`;
                        paceClass = 'pace-ontrack';
                    }
                }

                goalSectionHtml = `
                    <div class="goal-progress-container">
                        <div class="goal-card-header">
                            <div class="goal-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-8c0 1.93-1.57 3.5-3.5 3.5s-3.5-1.57-3.5-3.5 1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5z"/>
                                </svg>
                                <span>Meta de Leitura ${selectedYear}</span>
                            </div>
                            <button type="button" class="goal-adjust-btn" onclick="App.promptYearlyGoal('${selectedYear}')" title="Ajustar meta numérica anual">
                                Ajustar
                            </button>
                        </div>
                        <div class="goal-readout">
                            <div class="goal-numbers">
                                <span class="goal-current">${effectiveRead}</span>
                                <span class="goal-target">de ${effectiveTarget} livros</span>
                            </div>
                            <div class="goal-badge">${progressPercent}% concluído</div>
                        </div>
                        <div class="goal-bar-bg">
                            <div class="goal-bar-fill" style="width: ${progressPercent}%"></div>
                        </div>
                        ${paceText || (goalTagTotal > 0 && savedTargetBooks > 0) ? `
                        <div class="goal-footer">
                            ${paceText ? `
                            <div class="goal-pace ${paceClass}">
                                <span class="pace-dot"></span>
                                <span>${paceText}</span>
                            </div>` : ''}
                            ${goalTagTotal > 0 && savedTargetBooks > 0 ? `<div class="goal-tag-note">Lista da Meta: ${goalTagRead}/${goalTagTotal} concluídos</div>` : ''}
                        </div>` : ''}
                    </div>
                `;
            } else {
                goalSectionHtml = `
                    <div class="goal-empty-container">
                        <div class="goal-empty-info">
                            <div class="goal-empty-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-8c0 1.93-1.57 3.5-3.5 3.5s-3.5-1.57-3.5-3.5 1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5z"/>
                                </svg>
                                <span>Meta de Leitura ${selectedYear}</span>
                            </div>
                            <p class="goal-empty-desc">Defina uma meta anual para acompanhar seu ritmo e projeção de livros.</p>
                        </div>
                        <button type="button" class="goal-empty-btn" onclick="App.promptYearlyGoal('${selectedYear}')">
                            Definir Meta ${selectedYear}
                        </button>
                    </div>
                `;
            }
        }

        html += goalSectionHtml;

        html += `
            <div class="stats-summary">
                <div class="summary-card" onclick="App.openPeriodDetails('${selectedYear === 'all' ? 'all' : 'year'}', '${selectedYear}', 'finishes')" style="cursor: pointer;" title="Clique para ver os livros concluídos">
                    <div class="summary-value">${current.booksCount}</div>
                    <div class="summary-label">Livros Concluídos</div>
                </div>
                <div class="summary-card" onclick="App.openPeriodDetails('${selectedYear === 'all' ? 'all' : 'year'}', '${selectedYear}', 'pages')" style="cursor: pointer;" title="Clique para ver os livros lidos">
                    <div class="summary-value">${current.pages.toLocaleString('pt-BR')}</div>
                    <div class="summary-label">Páginas Lidas</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">★ ${avg}</div>
                    <div class="summary-label">Média de Avaliação</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value" style="color: #fb923c;">🔥 ${streakInfo.currentStreak} <small style="font-size: 0.85rem; font-weight: 500; color: var(--text-muted);">dias</small></div>
                    <div class="summary-label">Ofensiva (Recorde: ${streakInfo.longestStreak}d)</div>
                </div>
            </div>

            <div class="stats-grid-extra">
                 <div class="summary-card record-card">
                    <div class="record-card-label">Livro Mais Longo</div>
                    <div class="record-card-title" title="${escLongestTitle}">${escLongestTitle}</div>
                    <div class="record-card-value">${longest.pages ? longest.pages + ' pág' : '-'}</div>
                </div>
                 <div class="summary-card record-card">
                    <div class="record-card-label">Livro Mais Curto</div>
                    <div class="record-card-title" title="${escShortestTitle}">${escShortestTitle}</div>
                    <div class="record-card-value">${shortest.pages ? shortest.pages + ' pág' : '-'}</div>
                </div>
                 <div class="summary-card record-card">
                    <div class="record-card-label">Autor Mais Lido</div>
                    <div class="record-card-title" title="${escTopAuth}">${escTopAuth}</div>
                    <div class="record-card-value">${maxAuth > 0 ? maxAuth + ' livros' : '-'}</div>
                </div>
                 <div class="summary-card record-card">
                    <div class="record-card-label">Mês Mais Ativo</div>
                    <div class="record-card-title" title="${activeMonth}">${activeMonth}</div>
                    <div class="record-card-value">${maxMonthVal > 0 ? maxMonthVal + ' livros' : '-'}</div>
                </div>
            </div>

            <div class="stats-grid-pace">
                <div class="summary-card pace-card" title="Calculado dividindo apenas as páginas registradas com data no histórico pelo total de dias em que houve leitura registrada.">
                    <div class="pace-header">
                        <span class="pace-title">Ritmo em Dias Ativos</span>
                        <span class="pace-badge">
                            ${streakInfo.activeDays > 0 ? `${(streakInfo.totalPagesInHeatmap || 0).toLocaleString('pt-BR')} págs ÷ ${streakInfo.activeDays} dias` : 'Sem registros'}
                        </span>
                    </div>
                    <div class="pace-value">
                        <span>⚡ ${streakInfo.avgPagesPerActiveDay > 0 ? streakInfo.avgPagesPerActiveDay + ' pág/dia' : '-'}</span>
                        ${avgSpeedPph ? `<span class="pace-timer">(~${avgSpeedPph} pág/h no timer)</span>` : ''}
                    </div>
                    <div class="pace-desc">
                        Calculado sobre dias com leitura datada no histórico.
                    </div>
                </div>

                <div class="summary-card pace-card" title="Média de dias entre a data de início (ou 1º progresso) e a data de conclusão. Ignora livros marcados como lidos sem histórico real de início e fim.">
                    <div class="pace-header">
                        <span class="pace-title">Tempo Médio / Livro</span>
                        <span class="pace-badge">
                            ${allCompletionDays.length > 0 ? `${allCompletionDays.length} de ${current.booksCount} concluídos` : 'Sem ciclo completo'}
                        </span>
                    </div>
                    <div class="pace-value">
                        <span>⏱️ ${avgCompletionDays ? avgCompletionDays + ' dias / livro' : '-'}</span>
                    </div>
                    <div class="pace-desc">
                        Calculado sobre livros com histórico real de início e término.
                    </div>
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

        // Distribuição de Formatos e Gêneros (se houver dados)
        const totalFormats = formatCounts.physical + formatCounts.ebook + formatCounts.audiobook;
        const topGenresList = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        const hasFormats = totalFormats > 0;
        const hasGenres = topGenresList.length > 0;

        if (hasFormats || hasGenres) {
            const isSingle = (hasFormats && !hasGenres) || (!hasFormats && hasGenres);
            html += `<div class="stats-grid-charts ${isSingle ? 'is-single-chart' : ''}">`;
            if (totalFormats > 0) {
                const pPct = Math.round((formatCounts.physical / totalFormats) * 100);
                const ePct = Math.round((formatCounts.ebook / totalFormats) * 100);
                const aPct = Math.round((formatCounts.audiobook / totalFormats) * 100);
                html += `
                    <div class="chart-container" style="margin-bottom: 0;">
                        <div class="chart-title">Formatos Preferidos</div>
                        <div style="display: flex; flex-direction: column; gap: 0.65rem; margin-top: 0.75rem;">
                            <div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
                                    <span>📚 Físico (${formatCounts.physical})</span>
                                    <span style="color: var(--text-secondary);">${pPct}%</span>
                                </div>
                                <div class="goal-bar-bg" style="height: 7px;"><div class="goal-bar-fill" style="width: ${pPct}%; background: var(--color-physical);"></div></div>
                            </div>
                            <div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
                                    <span>📱 E-book (${formatCounts.ebook})</span>
                                    <span style="color: var(--text-secondary);">${ePct}%</span>
                                </div>
                                <div class="goal-bar-bg" style="height: 7px;"><div class="goal-bar-fill" style="width: ${ePct}%; background: var(--color-ebook);"></div></div>
                            </div>
                            <div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
                                    <span>🎧 Audiobook (${formatCounts.audiobook})</span>
                                    <span style="color: var(--text-secondary);">${aPct}%</span>
                                </div>
                                <div class="goal-bar-bg" style="height: 7px;"><div class="goal-bar-fill" style="width: ${aPct}%; background: var(--color-audiobook);"></div></div>
                            </div>
                        </div>
                    </div>
                `;
            }

            if (topGenresList.length > 0) {
                const maxG = topGenresList[0][1] || 1;
                html += `
                    <div class="chart-container" style="margin-bottom: 0;">
                        <div class="chart-title">Gêneros Mais Lidos</div>
                        <div style="display: flex; flex-direction: column; gap: 0.55rem; margin-top: 0.75rem;">
                            ${topGenresList.map(([gName, gCount]) => {
                                const gPct = Math.round((gCount / maxG) * 100);
                                return `
                                    <div>
                                        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 3px;">
                                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(gName)}</span>
                                            <span style="color: var(--accent-color); font-weight: 600;">${gCount}</span>
                                        </div>
                                        <div class="goal-bar-bg" style="height: 6px;"><div class="goal-bar-fill" style="width: ${gPct}%;"></div></div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
            html += `</div>`;
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
                html += `<div class="bar-group" title="${pVal.toLocaleString('pt-BR')} páginas" onclick="App.openPeriodDetails('month', '${i}', 'pages')"><div class="bar-value">${pVal > 0 ? pVal : ''}</div><div class="bar" style="height:${h}%"></div><div class="bar-label">${mNames[i]}</div></div>`;
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
        } else if (type === 'day') {
            targetKey = value.toString();
            const dObj = new Date(targetKey + 'T12:00:00');
            periodLabel = !isNaN(dObj.getTime()) ? dObj.toLocaleDateString('pt-BR') : targetKey;
        }

        books = allBooks.filter(book => {
            if (!book.computed) return false;
            book._tempDayNotes = [];

            if (type === 'day') {
                const dayPages = book.computed.heatmapDays ? (book.computed.heatmapDays[targetKey] || 0) : 0;
                if (dayPages <= 0) return false;
                book._tempPagesInPeriod = dayPages;

                if (Array.isArray(book.history)) {
                    book.history.forEach(h => {
                        if (!h.date || !h.note) return;
                        const d = h.date.length === 10 ? new Date(h.date + 'T12:00:00') : new Date(h.date);
                        const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        if (dKey === targetKey) {
                            book._tempDayNotes.push(h.note);
                        }
                    });
                }
                return true;
            }

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
                const dayNotesHtml = (book._tempDayNotes && book._tempDayNotes.length > 0)
                    ? `<div style="margin-top: 6px; font-size: 0.78rem; color: var(--text-secondary); background: rgba(255,255,255,0.04); padding: 6px 8px; border-radius: 6px; border-left: 2px solid var(--accent-color);">💬 "${escapeHTML(book._tempDayNotes.join(' | '))}"</div>`
                    : '';

                html += `
                    <div class="api-result-item" onclick="if (App.openBookDetails) { App.openBookDetails('${book.id}'); } else { App.editBook('${book.id}'); }">
                        <div class="api-result-cover-container ${isPlaceholder ? 'is-placeholder' : ''}">
                             ${!isPlaceholder && finalCover ? `
                             <img src="${finalCover}" class="api-result-cover" loading="lazy" alt="${escTitle}"
                                  onerror="this.style.display='none'; const p = this.closest('.api-result-cover-container'); if (p) { p.classList.add('is-placeholder'); const ph = p.querySelector('.book-cover-placeholder'); if (ph) ph.classList.add('visible'); }">
                             ` : ''}
                             
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
                               ${pagesInPeriod > 0 ? `${pagesInPeriod.toLocaleString('pt-BR')} pág lidas` : (book.pages ? book.pages + ' pág' : '')}
                            </div>
                            ${dayNotesHtml}
                        </div>
                    </div>`;
            });
            html += '</div>';
            content.innerHTML = html;
        }

        modal.classList.add('active');
    }
};


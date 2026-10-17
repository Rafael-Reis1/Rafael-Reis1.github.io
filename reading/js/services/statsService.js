/**
 * Serviço de Regras de Negócio e Processamento de Estatísticas de Leitura (Paginômetro e Heatmap)
 */

export function processBookStats(book) {
    const isSynthetic = (h) => h.migrated || h.isFallbackDate || (h.id && (String(h.id).startsWith('mig_') || String(h.id).startsWith('MIGRATED_')));
    const p = parseInt(book.pages) || 0;
    
    book.computed = {
        totalReadPages: 0,
        hasFinishedBefore: book.status === 'read' || ['re-reading', 'rereading'].includes(book.status) || (book.timesRead > 0),
        activityByYear: {},
        activityByMonth: {},
        heatmapDays: {},
        totalReadingMinutes: 0,
        pagesWithTimer: 0,
        completionDays: []
    };

    const ensureYear = (y) => {
        if (!book.computed.activityByYear[y]) {
            book.computed.activityByYear[y] = { pages: 0, finishes: 0, active: false };
        }
        return book.computed.activityByYear[y];
    };

    const ensureMonth = (ym) => {
        if (!book.computed.activityByMonth[ym]) {
            book.computed.activityByMonth[ym] = { pages: 0, finishes: 0, active: false };
        }
        return book.computed.activityByMonth[ym];
    };

    let lastPage = 0;
    let cycleStartDate = null;
    const sortedHistory = [...(book.history || [])].sort((a, b) => new Date(a.date) - new Date(b.date));

    sortedHistory.forEach(h => {
        let diff = 0;
        const pageNum = parseInt(h.page) || 0;
        
        if (h.type === 'finish') {
            diff = p - lastPage;
            lastPage = 0;
            if (cycleStartDate && !isSynthetic(h)) {
                const finishDate = h.date.length === 10 ? new Date(h.date + 'T12:00:00') : new Date(h.date);
                const diffMs = finishDate - cycleStartDate;
                if (diffMs > 60000) {
                    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                    book.computed.completionDays.push(days);
                }
            }
            cycleStartDate = null;
        } else if (h.type === 'start') {
            lastPage = 0;
            if (!isSynthetic(h)) {
                cycleStartDate = h.date.length === 10 ? new Date(h.date + 'T12:00:00') : new Date(h.date);
            }
        } else {
            diff = pageNum - lastPage;
            lastPage = pageNum;
            if (!cycleStartDate && !isSynthetic(h)) {
                cycleStartDate = h.date.length === 10 ? new Date(h.date + 'T12:00:00') : new Date(h.date);
            }
        }

        const durMin = parseFloat(h.durationMinutes) || 0;
        if (durMin > 0 && diff > 0) {
            book.computed.totalReadingMinutes += durMin;
            book.computed.pagesWithTimer += diff;
        }

        if (diff > 0 || h.type === 'finish') {
            if (diff > 0) book.computed.totalReadPages += diff;

            if (isSynthetic(h) && !book.readDate) {
                if (diff > 0) {
                    ensureYear('Desconhecido').pages += diff;
                    ensureYear('Desconhecido').active = true;
                    ensureMonth('Desconhecido').pages += diff;
                    ensureMonth('Desconhecido').active = true;
                }
                if (h.type === 'finish') {
                    ensureYear('Desconhecido').finishes++;
                    ensureMonth('Desconhecido').finishes++;
                }
                return;
            }

            let d = h.date.length === 10 ? new Date(h.date + 'T12:00:00') : new Date(h.date);
            const isEpoch = d.getFullYear() <= 1970;

            const year = isEpoch ? 'Desconhecido' : d.getFullYear();
            const month = d.getMonth();
            const ym = isEpoch ? 'Desconhecido' : `${year}-${String(month + 1).padStart(2, '0')}`;
            const day = d.getDate();
            const dKey = isEpoch ? '1970-01-01' : `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            if (diff > 0) {
                ensureYear(year).pages += diff;
                ensureYear(year).active = true;
                ensureMonth(ym).pages += diff;
                ensureMonth(ym).active = true;
                
                if (!isSynthetic(h) && !isEpoch) {
                    book.computed.heatmapDays[dKey] = (book.computed.heatmapDays[dKey] || 0) + diff;
                }
            }

            if (h.type === 'finish') {
                ensureYear(year).finishes++;
                ensureMonth(ym).finishes++;
            }
        }
    });

    const isRereading = ['re-reading', 'rereading'].includes(book.status);
    const historyFinishes = sortedHistory.filter(h => h.type === 'finish').length;
    
    if (historyFinishes === 0 && (book.status === 'read' || isRereading)) {
        let year, month, ym;
        if (book.readDate) {
            const d = new Date(book.readDate + 'T12:00:00');
            year = d.getFullYear();
            month = d.getMonth();
            ym = `${year}-${String(month + 1).padStart(2, '0')}`;
        } else {
            year = 'Desconhecido';
            ym = 'Desconhecido';
        }

        book.computed.totalReadPages += p;
        ensureYear(year).pages += p;
        ensureYear(year).finishes += 1;
        ensureYear(year).active = true;

        ensureMonth(ym).pages += p;
        ensureMonth(ym).finishes += 1;
        ensureMonth(ym).active = true;
    }

    const manualSessions = parseInt(book.timesRead) || 0;
    if (manualSessions > 0) {
        const manualPages = manualSessions * p;
        book.computed.totalReadPages += manualPages;
        
        ensureYear('Desconhecido').pages += manualPages;
        ensureYear('Desconhecido').finishes += manualSessions;
        ensureYear('Desconhecido').active = true;
        
        ensureMonth('Desconhecido').pages += manualPages;
        ensureMonth('Desconhecido').finishes += manualSessions;
        ensureMonth('Desconhecido').active = true;
    }

    if ((!book.history || book.history.length === 0) && book.status !== 'read' && (book.readPages || 0) > 0) {
        let year = 'Desconhecido';
        let ym = 'Desconhecido';
        if (book.readDate) {
            const d = new Date(book.readDate + 'T12:00:00');
            year = d.getFullYear();
            ym = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        
        const rPages = parseInt(book.readPages) || 0;
        book.computed.totalReadPages += rPages;
        ensureYear(year).pages += rPages;
        ensureYear(year).active = true;
        ensureMonth(ym).pages += rPages;
        ensureMonth(ym).active = true;
    }

    if (book.goalYear) {
        ensureYear(parseInt(book.goalYear));
    }
}

export function calculateReadingStreaks(dailyPages = {}) {
    const activeDates = Object.entries(dailyPages)
        .filter(([dateKey, pages]) => pages > 0 && dateKey !== '1970-01-01')
        .map(([dateKey]) => dateKey)
        .sort();

    if (activeDates.length === 0) {
        return { currentStreak: 0, longestStreak: 0, activeDays: 0, avgPagesPerActiveDay: 0, totalPagesInHeatmap: 0 };
    }

    const totalPagesInHeatmap = activeDates.reduce((acc, d) => acc + (dailyPages[d] || 0), 0);
    const avgPagesPerActiveDay = Math.round(totalPagesInHeatmap / activeDates.length);

    let longestStreak = 1;
    let tempStreak = 1;

    for (let i = 1; i < activeDates.length; i++) {
        const prev = new Date(activeDates[i - 1] + 'T12:00:00');
        const curr = new Date(activeDates[i] + 'T12:00:00');
        const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            tempStreak++;
            if (tempStreak > longestStreak) longestStreak = tempStreak;
        } else if (diffDays > 1) {
            tempStreak = 1;
        }
    }

    const formatDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const activeSet = new Set(activeDates);
    let currentStreak = 0;
    let checkDate = null;

    if (activeSet.has(formatDateKey(today))) {
        checkDate = new Date(today);
    } else if (activeSet.has(formatDateKey(yesterday))) {
        checkDate = new Date(yesterday);
    }

    while (checkDate && activeSet.has(formatDateKey(checkDate))) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
    }

    return {
        currentStreak,
        longestStreak,
        activeDays: activeDates.length,
        avgPagesPerActiveDay,
        totalPagesInHeatmap
    };
}


export async function migrateLegacyHistory(rm) {
    if (!rm.books || rm.books.length === 0) return;
    
    const updates = {};
    let totalUpdated = 0;

    rm.books.forEach(book => {
        let history = book.history || [];
        let changed = false;
        if (history.length > 1) {
            const sortedHistory = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
            const sanitized = [];
            let lastFinish = null;
            let historyWasCleaned = false;

            for (const entry of sortedHistory) {
                if (entry.type === 'finish') {
                    if (lastFinish && (new Date(entry.date) - new Date(lastFinish.date) < 86400000)) {
                        historyWasCleaned = true;
                        const idx = sanitized.indexOf(lastFinish);
                        if (idx !== -1) sanitized.splice(idx, 1);
                        sanitized.push(entry);
                        lastFinish = entry;
                        continue;
                    }
                    lastFinish = entry;
                }
                sanitized.push(entry);
            }

            if (historyWasCleaned) {
                history = sanitized;
                changed = true;
            }
        }

        const hasFinish = history.some(h => h.type === 'finish');
        if (book.status === 'read' && !hasFinish) {
            let date = book.readDate || book.createdAt;
            let isFallback = false;
            
            if (!date && book.year) {
                date = `${book.year}-01-01`;
            } else if (!date) {
                date = new Date().toISOString();
                isFallback = true;
            }

            const syntheticHistory = [
                { id: `MIGRATED_ST_${book.id}_${Date.now()}`, date: date, type: 'start', page: 0, migrated: true, isFallbackDate: isFallback },
                { id: `MIGRATED_FI_${book.id}_${Date.now()}`, date: date, type: 'finish', page: parseInt(book.pages) || 0, migrated: true, isFallbackDate: isFallback }
            ];
            
            history = [...history, ...syntheticHistory];
            changed = true;
        } else if (history.length > 0) {
            let needsHealing = false;
            const healedHistory = history.map(h => {
                const d = new Date(h.date);
                const isJan2026 = d.getFullYear() === 2026 && d.getMonth() === 0;
                const isPrefixed = h.id && (String(h.id).startsWith('mig_') || String(h.id).startsWith('MIGRATED_'));
                
                if (isJan2026 && !h.migrated && !isPrefixed) {
                    needsHealing = true;
                    return { ...h, migrated: true, isFallbackDate: true };
                }
                return h;
            });

            if (needsHealing) {
                history = healedHistory;
                changed = true;
            }
        }

        if (changed) {
            updates[book.id] = { history };
            totalUpdated++;
        }
    });

    if (totalUpdated > 0) {
        await rm.updateMultiple(updates);
        const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        if (isDev) console.log(`✅ Sanitização concluída: ${totalUpdated} livros corrigidos.`);
    }
}

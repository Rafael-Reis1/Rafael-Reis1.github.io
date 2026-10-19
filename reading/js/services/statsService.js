/**
 * Serviço de Regras de Negócio e Processamento de Estatísticas de Leitura (Paginômetro e Heatmap)
 */

/**
 * Converte o campo `date` de um registro de histórico em Date, sem lançar erro.
 * Aceita string ISO, 'YYYY-MM-DD' e Timestamp do Firestore. Retorna null se inválido.
 */
const parseEntryDate = (value) => {
    if (!value) return null;
    if (typeof value === 'object' && typeof value.toDate === 'function') {
        const converted = value.toDate();
        return isNaN(converted.getTime()) ? null : converted;
    }
    const text = String(value);
    const parsed = text.length === 10 ? new Date(`${text}T12:00:00`) : new Date(text);
    return isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const entryTime = (entry) => {
    const parsed = parseEntryDate(entry && entry.date);
    return parsed ? parsed.getTime() : 0;
};

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
    const sortedHistory = [...(book.history || [])]
        .filter(h => h && typeof h === 'object')
        .sort((a, b) => entryTime(a) - entryTime(b));

    sortedHistory.forEach(h => {
        let diff = 0;
        const pageNum = parseInt(h.page) || 0;
        
        if (h.type === 'finish') {
            diff = p - lastPage;
            lastPage = 0;
            if (cycleStartDate && !isSynthetic(h)) {
                const finishDate = parseEntryDate(h.date);
                const diffMs = finishDate ? finishDate - cycleStartDate : 0;
                if (diffMs > 60000) {
                    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                    book.computed.completionDays.push(days);
                }
            }
            cycleStartDate = null;
        } else if (h.type === 'start') {
            lastPage = 0;
            const startDate = parseEntryDate(h.date);
            if (!isSynthetic(h) && startDate) {
                cycleStartDate = startDate;
            }
        } else {
            diff = pageNum - lastPage;
            lastPage = pageNum;
            const progressDate = parseEntryDate(h.date);
            if (!cycleStartDate && !isSynthetic(h) && progressDate) {
                cycleStartDate = progressDate;
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

            const entryDate = parseEntryDate(h.date);
            const isEpoch = !entryDate || entryDate.getFullYear() <= 1970;

            const year = isEpoch ? 'Desconhecido' : entryDate.getFullYear();
            const month = isEpoch ? 0 : entryDate.getMonth();
            const ym = isEpoch ? 'Desconhecido' : `${year}-${String(month + 1).padStart(2, '0')}`;
            const dKey = isEpoch ? '1970-01-01' : formatDateKey(entryDate);

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
        const fallbackDate = parseEntryDate(book.readDate);
        if (fallbackDate && fallbackDate.getFullYear() > 1970) {
            year = fallbackDate.getFullYear();
            month = fallbackDate.getMonth();
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
        const fallbackDate = parseEntryDate(book.readDate);
        if (fallbackDate && fallbackDate.getFullYear() > 1970) {
            year = fallbackDate.getFullYear();
            ym = `${year}-${String(fallbackDate.getMonth() + 1).padStart(2, '0')}`;
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

    // -------------------------------------------------------------------------
    // CÁLCULO ESPECÍFICO DO CICLO ATUAL (PARA LEITURA/RELEITURA ATIVA E RITMO REAL)
    // -------------------------------------------------------------------------
    const lastFinishIndex = sortedHistory.map(h => h.type).lastIndexOf('finish');
    const currentCycleEntries = lastFinishIndex !== -1 ? sortedHistory.slice(lastFinishIndex + 1) : sortedHistory;

    const currentCycleHeatmapDays = {};
    let currentCycleStartDate = null;
    let lastPageInCycle = 0;

    currentCycleEntries.forEach(h => {
        const pageNum = parseInt(h.page) || 0;
        const entryDate = parseEntryDate(h.date);
        let diff = 0;
        if (h.type === 'start') {
            lastPageInCycle = 0;
            if (!isSynthetic(h) && entryDate) {
                currentCycleStartDate = entryDate;
            }
        } else if (h.type !== 'finish') {
            diff = pageNum - lastPageInCycle;
            lastPageInCycle = pageNum;
            if (!currentCycleStartDate && !isSynthetic(h) && entryDate) {
                currentCycleStartDate = entryDate;
            }
            if (diff > 0 && !isSynthetic(h) && entryDate && entryDate.getFullYear() > 1970) {
                const dKey = formatDateKey(entryDate);
                currentCycleHeatmapDays[dKey] = (currentCycleHeatmapDays[dKey] || 0) + diff;
            }
        }
    });

    const isCurrentlyActive = ['reading', 're-reading', 'rereading'].includes(book.status);
    const currentActiveDays = Object.keys(currentCycleHeatmapDays).length;
    const currentReadPages = isCurrentlyActive ? Math.min(p, Math.max(0, parseInt(book.readPages) || 0)) : (book.status === 'read' ? p : 0);

    let currentCyclePace = 0;
    if (currentActiveDays > 0 && currentReadPages > 0) {
        currentCyclePace = Math.max(1, Math.round(currentReadPages / currentActiveDays));
    } else if (currentCycleStartDate && currentReadPages > 0) {
        const daysElapsed = Math.max(1, Math.ceil((new Date() - currentCycleStartDate) / (1000 * 60 * 60 * 24)));
        currentCyclePace = Math.max(1, Math.round(currentReadPages / daysElapsed));
    }

    book.computed.currentCycleActiveDays = currentActiveDays;
    book.computed.currentCycleReadPages = currentReadPages;
    book.computed.currentCyclePace = currentCyclePace;

    // Ritmo de conclusão do livro lido baseado no tempo real da leitura (lastCompDays)
    const compDays = book.computed.completionDays;
    const lastCompDays = compDays.length > 0 ? compDays[compDays.length - 1] : null;
    book.computed.lastCompletionPace = (lastCompDays !== null && lastCompDays > 0 && p > 0)
        ? (p / lastCompDays)
        : null;
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
            const sortedHistory = [...history].sort((a, b) => entryTime(a) - entryTime(b));
            const sanitized = [];
            let lastFinish = null;
            let historyWasCleaned = false;

            for (const entry of sortedHistory) {
                if (entry.type === 'finish') {
                    const entryMs = entryTime(entry);
                    const lastFinishMs = lastFinish ? entryTime(lastFinish) : 0;
                    if (lastFinish && entryMs > 0 && lastFinishMs > 0 && (entryMs - lastFinishMs) < 86400000) {
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
        }

        if (changed) {
            updates[book.id] = { history };
            totalUpdated++;
        }
    });

    if (totalUpdated > 0) {
        await rm.updateMultiple(updates);
        const isDev = typeof window !== 'undefined'
            && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        if (isDev) console.log(`✅ Sanitização concluída: ${totalUpdated} livros corrigidos.`);
    }
}

/**
 * Gerador de Card Visual Social (Canvas PNG 1080x1350) para Instagram e WhatsApp
 * Com centralização vertical perfeita, eliminação de espaços ociosos e design dinâmico por estado.
 */

function wrapCanvasText(ctx, text, maxWidth, maxLines = 8) {
    const cleanText = (text || '').replace(/\r\n/g, '\n').trim();
    if (!cleanText) return [];
    const paragraphs = cleanText.split(/\n+/);
    const lines = [];

    for (const para of paragraphs) {
        const words = para.split(/\s+/).filter(Boolean);
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
                if (lines.length >= maxLines) break;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine && lines.length < maxLines) {
            lines.push(currentLine);
        }
        if (lines.length >= maxLines) break;
    }

    const totalRenderedLen = lines.join(' ').replace(/\s+/g, ' ').trim().length;
    const totalOriginalLen = cleanText.replace(/\s+/g, ' ').trim().length;
    if (lines.length === maxLines && totalOriginalLen > totalRenderedLen) {
        lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,;:\s…]*$/, '') + '…';
    }

    return lines;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function createStarPath(ctx, cx, cy, outerRadius, innerRadius) {
    const spikes = 5;
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        let x = cx + Math.cos(rot) * outerRadius;
        let y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
}

function drawCenteredStarRating(ctx, centerX, centerY, rating, starRadius = 16, gap = 8) {
    const safeRating = Math.max(0, Math.min(5, parseFloat(rating) || 0));
    const starsWidth = 5 * (starRadius * 2) + 4 * gap;
    const badgeGap = 12;
    const badgeW = 64;
    const badgeH = 32;
    const totalW = starsWidth + badgeGap + badgeW;
    const startX = centerX - totalW / 2;

    for (let i = 0; i < 5; i++) {
        const cx = startX + starRadius + i * (starRadius * 2 + gap);
        const cy = centerY;

        ctx.save();
        createStarPath(ctx, cx, cy, starRadius, starRadius * 0.46);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fill();
        ctx.restore();

        const fillAmount = Math.max(0, Math.min(1, safeRating - i));
        if (fillAmount > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(cx - starRadius, cy - starRadius, starRadius * 2 * fillAmount, starRadius * 2);
            ctx.clip();
            createStarPath(ctx, cx, cy, starRadius, starRadius * 0.46);
            ctx.fillStyle = '#fbbf24';
            ctx.fill();
            ctx.restore();
        }
    }

    const badgeX = startX + starsWidth + badgeGap;
    ctx.save();
    drawRoundedRect(ctx, badgeX, centerY - badgeH / 2, badgeW, badgeH, 10);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
    ctx.stroke();

    ctx.font = 'bold 19px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(safeRating.toFixed(1), badgeX + badgeW / 2, centerY + 1);
    ctx.restore();
}

function extractGoogleDriveId(url) {
    if (!url || typeof url !== 'string') return null;
    if (!url.includes('drive.google.com') && !url.includes('docs.google.com') && !url.includes('googleusercontent.com')) {
        return null;
    }
    const byPath = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (byPath) return byPath[1];
    const byQuery = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (byQuery) return byQuery[1];
    return null;
}

function tryLoadSingleImage(src, timeoutMs = 4000) {
    return new Promise((resolve) => {
        if (!src) {
            resolve(null);
            return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(null), timeoutMs);
        img.onload = () => {
            clearTimeout(timer);
            try {
                if (!img.naturalWidth || !img.naturalHeight) {
                    resolve(null);
                    return;
                }
                const testCanvas = document.createElement('canvas');
                testCanvas.width = 2;
                testCanvas.height = 2;
                const testCtx = testCanvas.getContext('2d');
                testCtx.drawImage(img, 0, 0, 2, 2);
                testCanvas.toDataURL('image/png');
                resolve(img);
            } catch (err) {
                resolve(null);
            }
        };
        img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
        };
        img.src = src;
    });
}

async function fetchFallbackCoverUrl(book) {
    if (!book) return null;
    const title = (book.title || '').trim();
    const author = (book.author || '').trim();

    try {
        const q = encodeURIComponent(`${title} ${author}`);
        const res = await fetch(`https://openlibrary.org/search.json?q=${q}&limit=2&fields=cover_i,title`);
        const data = await res.json();
        if (data.docs && data.docs[0] && data.docs[0].cover_i) {
            return `https://covers.openlibrary.org/b/id/${data.docs[0].cover_i}-L.jpg`;
        }
    } catch (e) {}

    try {
        const qTitle = encodeURIComponent(title);
        const resTitle = await fetch(`https://openlibrary.org/search.json?title=${qTitle}&limit=2&fields=cover_i,title`);
        const dataTitle = await resTitle.json();
        if (dataTitle.docs && dataTitle.docs[0] && dataTitle.docs[0].cover_i) {
            return `https://covers.openlibrary.org/b/id/${dataTitle.docs[0].cover_i}-L.jpg`;
        }
    } catch (e) {}

    return null;
}

async function loadImageSafe(book) {
    const url = book?.cover || '';
    const candidates = [];

    if (url && !url.includes('placehold.co') && !url.includes('Sem+Capa')) {
        const driveId = extractGoogleDriveId(url);
        if (driveId) {
            candidates.push(`https://lh3.googleusercontent.com/d/${driveId}=w1000`);
            candidates.push(`https://lh3.googleusercontent.com/d/${driveId}`);
            candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(`https://lh3.googleusercontent.com/d/${driveId}=w1000`)}&w=800&output=png`);
            candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`)}&w=800&output=png`);
        } else {
            const httpsUrl = url.replace(/^http:\/\//i, 'https://');
            candidates.push(httpsUrl);
            candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(httpsUrl)}&w=800&output=png`);
        }
    }

    for (const candidate of candidates) {
        const img = await tryLoadSingleImage(candidate, 3500);
        if (img) return img;
    }

    const fallbackUrl = await fetchFallbackCoverUrl(book);
    if (fallbackUrl) {
        const img = await tryLoadSingleImage(fallbackUrl, 4000);
        if (img) return img;
    }

    return null;
}

function drawCoverWithEffects(ctx, coverImg, titleStr, authorStr, x, y, w, h, radius = 22) {
    ctx.save();
    drawRoundedRect(ctx, x, y, w, h, radius);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 48;
    ctx.shadowOffsetY = 22;
    ctx.fillStyle = '#181a30';
    ctx.fill();
    ctx.clip();

    if (coverImg) {
        ctx.drawImage(coverImg, x, y, w, h);

        const spineGrad = ctx.createLinearGradient(x, y, x + 26, y);
        spineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
        spineGrad.addColorStop(0.25, 'rgba(255, 255, 255, 0.06)');
        spineGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.24)');
        spineGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = spineGrad;
        ctx.fillRect(x, y, 26, h);
    } else {
        const phGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        phGrad.addColorStop(0, '#312e81');
        phGrad.addColorStop(0.5, '#1e1b4b');
        phGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = phGrad;
        ctx.fillRect(x, y, w, h);

        drawRoundedRect(ctx, x + 18, y + 18, w - 36, h - 36, 12);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px Outfit, Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const phLines = wrapCanvasText(ctx, titleStr, w - 60, 4);
        const startY = y + h / 2 - ((phLines.length - 1) * 34) / 2;
        phLines.forEach((line, idx) => {
            ctx.fillText(line, x + w / 2, startY + idx * 34);
        });
    }
    ctx.restore();

    ctx.save();
    drawRoundedRect(ctx, x, y, w, h, radius);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.stroke();
    ctx.restore();
}

function drawCenteredPillsRow(ctx, centerX, y, pills, maxRowWidth = 860) {
    if (!pills || pills.length === 0) return 0;
    const height = 40;
    const padX = 18;
    const gap = 12;

    ctx.save();
    ctx.font = '600 17px Inter, system-ui, sans-serif';

    const measured = [];
    let totalW = 0;
    for (const p of pills) {
        const textStr = (p.text || '').trim();
        const hasLeadingEmoji = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(textStr);
        const showDot = p.dotColor && !hasLeadingEmoji;
        const w = ctx.measureText(textStr).width + padX * 2 + (showDot ? 18 : 0);
        if (measured.length > 0 && totalW + gap + w > maxRowWidth) break;
        if (measured.length > 0) totalW += gap;
        measured.push({ ...p, text: textStr, width: w, showDot });
        totalW += w;
    }

    let curX = centerX - totalW / 2;
    for (const p of measured) {
        drawRoundedRect(ctx, curX, y, p.width, height, height / 2);
        ctx.fillStyle = p.bg || 'rgba(255, 255, 255, 0.06)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = p.border || 'rgba(255, 255, 255, 0.14)';
        ctx.stroke();

        let textX = curX + padX;
        if (p.showDot) {
            ctx.beginPath();
            ctx.arc(textX + 5, y + height / 2, 5, 0, Math.PI * 2);
            ctx.fillStyle = p.dotColor;
            ctx.fill();
            textX += 18;
        }

        ctx.fillStyle = p.color || 'rgba(255, 255, 255, 0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.text, textX, y + height / 2 + 1);

        curX += p.width + gap;
    }
    ctx.restore();
    return height;
}

function getDynamicDateLabel(book, options = {}) {
    const { isQuoteMode = false, quoteDate = '' } = options;

    const parseDate = (val) => {
        if (!val || val === '1970-01-01') return null;
        try {
            const str = String(val).trim();
            if (!str) return null;
            if (/^\d{4}$/.test(str)) {
                const yr = parseInt(str);
                if (yr > 1980) return { yearOnly: true, year: yr };
            }
            const d = str.length === 10 ? new Date(str + 'T12:00:00') : new Date(str);
            if (!isNaN(d.getTime()) && d.getFullYear() > 1980) {
                return d;
            }
        } catch (e) {}
        return null;
    };

    const formatDateShort = (d) => {
        if (!d) return '';
        if (d.yearOnly) return `${d.year}`;
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const status = book.status || 'want-to-read';
    const isRead = status === 'read';
    const isReReading = ['re-reading', 'rereading'].includes(status);
    const isReading = ['reading', 're-reading', 'rereading'].includes(status) && !isReReading;
    const isWantToRead = status === 'want-to-read';

    // Se estiver compartilhando uma citação com data específica
    if (isQuoteMode && quoteDate) {
        const qD = parseDate(quoteDate);
        if (qD) {
            return `Nota em ${formatDateShort(qD)}`;
        }
    }

    // 1. Livro Lido
    if (isRead) {
        const historyArr = Array.isArray(book.history) ? book.history : [];
        const finishes = historyArr.filter(h => h.type === 'finish');
        const lastFinish = finishes.length > 0 ? finishes[finishes.length - 1] : null;
        const rDate = parseDate(book.readDate) || (lastFinish ? parseDate(lastFinish.date) : null);

        if (rDate) {
            return `Lido em ${formatDateShort(rDate)}`;
        }
        if (book.year && parseInt(book.year) > 1980) {
            return `Lido em ${book.year}`;
        }
        return 'Leitura concluída';
    }

    // 2. Relendo atualmente
    if (isReReading) {
        const rDate = parseDate(book.readDate);
        if (rDate) {
            return `Relendo • Lido em ${rDate.yearOnly ? rDate.year : rDate.getFullYear()}`;
        }
        return 'Relendo atualmente';
    }

    // 3. Lendo agora
    if (isReading) {
        const historyArr = Array.isArray(book.history) ? book.history : [];
        const startEntry = historyArr.find(h => h.type === 'start') || historyArr[0];
        const sDate = startEntry ? parseDate(startEntry.date) : parseDate(book.createdAt);
        if (sDate) {
            return `Iniciado em ${formatDateShort(sDate)}`;
        }
        return 'Lendo atualmente';
    }

    // 4. Na lista de leitura (Quero Ler)
    if (isWantToRead) {
        if (book.goalYear && parseInt(book.goalYear) >= 2000) {
            return `Na meta de ${book.goalYear}`;
        }
        const cDate = parseDate(book.createdAt);
        if (cDate) {
            return `Adicionado em ${formatDateShort(cDate)}`;
        }
        return 'Na lista de leitura';
    }

    // 5. Abandonado / Pausado
    if (status === 'abandoned') {
        const historyArr = Array.isArray(book.history) ? book.history : [];
        const lastEntry = historyArr[historyArr.length - 1];
        const pDate = lastEntry ? parseDate(lastEntry.date) : null;
        if (pDate) {
            return `Pausado em ${formatDateShort(pDate)}`;
        }
        return 'Leitura pausada';
    }

    return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function generateShareCard(book, options = {}) {
    const {
        quoteText = '',
        quoteLocation = '',
        quoteDate = ''
    } = options;

    const W = 1080;
    const H = 1350; // Proporção perfeita 4:5 vertical (Instagram Feed & WhatsApp)
    const centerX = W / 2;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const coverImg = await loadImageSafe(book);

    const rawQuote = (quoteText || '').trim();
    const isQuoteMode = rawQuote.length > 0;
    const explicitQuote = rawQuote.replace(/^["“'”]\s*/, '').replace(/\s*["”'"]$/, '').trim() || rawQuote;
    const cleanQuoteLocation = (quoteLocation || '').replace(/^[—–-]\s*/, '').trim();

    const titleStr = book.title || 'Sem Título';
    const authorStr = book.author || 'Autor Desconhecido';
    const isFavorite = Array.isArray(book.tags) && book.tags.includes('favorite');

    const status = book.status || 'want-to-read';
    const isReading = ['reading', 're-reading', 'rereading'].includes(status);
    const isReReading = ['re-reading', 'rereading'].includes(status);
    const isRead = status === 'read';
    const isWantToRead = status === 'want-to-read';

    // 1. Fundo com Ambient Glow da Capa
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#060712');
    bgGrad.addColorStop(0.5, '#0f1124');
    bgGrad.addColorStop(1, '#050610');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    if (coverImg) {
        ctx.save();
        ctx.filter = 'blur(75px) saturate(1.8) brightness(0.46)';
        ctx.globalAlpha = 0.82;
        ctx.drawImage(coverImg, -140, -140, W + 280, H + 280);
        ctx.restore();

        const vig = ctx.createRadialGradient(W / 2, H * 0.44, 120, W / 2, H / 2, W * 0.86);
        vig.addColorStop(0, 'rgba(8, 9, 20, 0.15)');
        vig.addColorStop(0.65, 'rgba(6, 7, 16, 0.72)');
        vig.addColorStop(1, 'rgba(4, 5, 12, 0.94)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
    } else {
        const accentRadial = ctx.createRadialGradient(W * 0.82, H * 0.2, 20, W * 0.82, H * 0.2, 600);
        accentRadial.addColorStop(0, isRead ? 'rgba(16, 185, 129, 0.3)' : 'rgba(242, 81, 27, 0.32)');
        accentRadial.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = accentRadial;
        ctx.fillRect(0, 0, W, H);
    }

    // 2. Moldura Elegante
    const framePadX = 54;
    const framePadY = 54;
    const frameW = W - framePadX * 2;
    const frameH = H - framePadY * 2;

    ctx.save();
    drawRoundedRect(ctx, framePadX, framePadY, frameW, frameH, 38);
    ctx.fillStyle = 'rgba(14, 16, 30, 0.65)';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = isFavorite ? 'rgba(234, 179, 8, 0.32)' : 'rgba(255, 255, 255, 0.13)';
    ctx.stroke();
    ctx.restore();

    // 3. Barra Superior
    const topY = framePadY + 36;
    let statusPill = { label: 'LENDO AGORA', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.45)' };
    if (isReReading) {
        statusPill = { label: 'RELENDO AGORA', color: '#f87171', bg: 'rgba(239, 68, 68, 0.18)', border: 'rgba(239, 68, 68, 0.45)' };
    } else if (isRead) {
        statusPill = { label: 'LEITURA CONCLUÍDA', color: '#34d399', bg: 'rgba(16, 185, 129, 0.18)', border: 'rgba(16, 185, 129, 0.45)' };
    } else if (isWantToRead) {
        const hasGoal = book.goalYear && parseInt(book.goalYear) >= 2000;
        const isDesired = Array.isArray(book.tags) && book.tags.includes('desired');
        if (hasGoal) {
            statusPill = { 
                label: `NA META DE ${book.goalYear}`, 
                color: '#a3e635', 
                bg: 'rgba(132, 204, 22, 0.18)', 
                border: 'rgba(132, 204, 22, 0.45)' 
            };
        } else if (isDesired) {
            statusPill = { 
                label: 'DESEJADO', 
                color: '#c084fc', 
                bg: 'rgba(168, 85, 247, 0.18)', 
                border: 'rgba(168, 85, 247, 0.45)' 
            };
        } else {
            statusPill = { 
                label: 'QUERO LER', 
                color: '#60a5fa', 
                bg: 'rgba(59, 130, 246, 0.18)', 
                border: 'rgba(59, 130, 246, 0.45)' 
            };
        }
    } else if (status === 'abandoned') {
        statusPill = { label: 'LEITURA PAUSADA', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.18)', border: 'rgba(148, 163, 184, 0.45)' };
    }

    if (isQuoteMode) {
        statusPill = { label: 'CITAÇÃO EM DESTAQUE', color: '#fb923c', bg: 'rgba(242, 81, 27, 0.18)', border: 'rgba(242, 81, 27, 0.45)' };
    }

    ctx.save();
    ctx.font = 'bold 16px Inter, system-ui, sans-serif';
    const pillText = statusPill.label;
    const pillTextW = ctx.measureText(pillText).width;
    const pillW = pillTextW + 32;
    const pillH = 36;
    const pillX = framePadX + 38;
    drawRoundedRect(ctx, pillX, topY, pillW, pillH, pillH / 2);
    ctx.fillStyle = statusPill.bg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = statusPill.border;
    ctx.stroke();

    ctx.fillStyle = statusPill.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pillText, pillX + pillW / 2, topY + pillH / 2 + 1);

    ctx.font = '600 17px Outfit, Inter, system-ui, sans-serif';
    ctx.fillStyle = statusPill.color;
    ctx.textAlign = 'right';
    ctx.fillText('Minha Biblioteca', framePadX + frameW - 38, topY + pillH / 2 + 1);
    ctx.restore();

    // Dados auxiliares de leitura
    const totalPages = Math.max(0, parseInt(book.pages) || 0);
    const rawReadPages = Math.max(0, parseInt(book.readPages) || 0);
    const readPages = isRead ? totalPages : Math.min(totalPages || rawReadPages, rawReadPages);
    const progressPercent = isRead
        ? 100
        : (totalPages > 0 ? Math.min(100, Math.round((readPages / totalPages) * 100)) : 0);

    const compDaysArr = book.computed?.completionDays || [];
    const lastCompDays = compDaysArr.length > 0 ? compDaysArr[compDaysArr.length - 1] : null;
    const activeDaysCount = Object.keys(book.computed?.heatmapDays || {}).length;
    const totalReadComputed = book.computed?.totalReadPages || readPages || 0;
    const avgPace = activeDaysCount > 0 ? Math.max(1, Math.round(totalReadComputed / activeDaysCount)) : 0;
    const historyArr = Array.isArray(book.history) ? book.history : [];
    const finishesCount = historyArr.filter(h => h.type === 'finish').length;
    const totalTimesRead = (parseInt(book.timesRead) || 0) + finishesCount;

    // Pré-cálculo de texto do título
    const titleFontSize = titleStr.length > 40 ? 36 : 42;
    const titleLineH = Math.round(titleFontSize * 1.22);
    ctx.font = `bold ${titleFontSize}px Outfit, Inter, system-ui, sans-serif`;
    const renderTLines = wrapCanvasText(ctx, titleStr, 840, 2);

    ctx.font = '500 25px Inter, system-ui, sans-serif';
    const renderALines = wrapCanvasText(ctx, authorStr, 800, 1);

    // =========================================================================
    // CÁLCULO DE CENTRALIZAÇÃO VERTICAL PERFEITA ENTRE O TOPO E O RODAPÉ
    // =========================================================================
    const hubW = frameW - 76;
    const hubX = framePadX + 38;

    // Métricas inteligentes para modo Citação / Anotação
    let quoteFontSize = 30;
    let quoteLineH = 46;
    let maxQuoteLines = 8;
    if (explicitQuote.length > 320) {
        quoteFontSize = 23;
        quoteLineH = 35;
        maxQuoteLines = 10;
    } else if (explicitQuote.length > 180) {
        quoteFontSize = 26;
        quoteLineH = 39;
        maxQuoteLines = 9;
    } else if (explicitQuote.length > 90) {
        quoteFontSize = 28;
        quoteLineH = 42;
        maxQuoteLines = 8;
    }

    ctx.font = `italic 400 ${quoteFontSize}px Georgia, "Times New Roman", serif`;
    const quoteContentW = hubW - 96; // 48px de padding interno em cada lado
    const quoteLines = isQuoteMode ? wrapCanvasText(ctx, explicitQuote, quoteContentW, maxQuoteLines) : [];
    const quoteHeaderH = 62; // Espaço superior para aspas decorativas “ e respiro

    // Se for anotação com várias linhas, compacta a capa suavemente para não espremer o texto
    const coverH = isQuoteMode
        ? (quoteLines.length >= 7 ? 260 : quoteLines.length >= 4 ? 295 : 330)
        : 480;
    const coverW = Math.round(coverH * (2 / 3));

    const hasReadingPace = (avgPace > 0);

    let hubH = 175;
    if (isQuoteMode) {
        const textH = quoteLines.length * quoteLineH;
        const refAreaH = cleanQuoteLocation ? 64 : 32;
        hubH = Math.max(180, quoteHeaderH + textH + refAreaH);
    } else if (isWantToRead) {
        hubH = 155;
    } else if (isReading) {
        hubH = hasReadingPace ? 142 : 112;
    } else if (isRead) {
        hubH = 132;
    }

    const seriesH = (book.series && book.series.trim()) ? 28 : 0;
    const titleH = renderTLines.length * titleLineH;
    const authorH = renderALines[0] ? 30 : 0;
    const ratingH = (book.rating > 0) ? 36 : 0;

    const gapCoverToTitle = isQuoteMode ? 32 : 42;
    const gapSeriesToTitle = (book.series && book.series.trim()) ? 8 : 0;
    const gapTitleToAuthor = 10;
    const gapAuthorToRating = (book.rating > 0) ? 18 : 0;
    const gapRatingToHub = isQuoteMode ? 22 : 26;

    const totalCenterContentH = coverH + gapCoverToTitle + seriesH + gapSeriesToTitle + titleH + gapTitleToAuthor + authorH + gapAuthorToRating + ratingH + gapRatingToHub + hubH;

    const topBarBottomY = topY + 44;
    const footerTopY = framePadY + frameH - 60;
    const availableH = footerTopY - topBarBottomY;

    // Ponto de início vertical matematicamente centralizado!
    const verticalSlack = Math.max(20, availableH - totalCenterContentH);
    const startCenterY = topBarBottomY + Math.round(verticalSlack / 2);

    // 4. Hero Capa Centralizada
    const coverX = centerX - coverW / 2;
    const coverY = startCenterY;

    drawCoverWithEffects(ctx, coverImg, titleStr, authorStr, coverX, coverY, coverW, coverH, 20);

    // Selo flutuante de Favorito
    if (isFavorite) {
        ctx.save();
        const favW = 142;
        const favH = 34;
        const favX = coverX + coverW - favW + 12;
        const favY = coverY - 10;
        drawRoundedRect(ctx, favX, favY, favW, favH, 17);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#eab308';
        ctx.fill();
        ctx.font = 'bold 14px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FAVORITO', favX + favW / 2, favY + favH / 2 + 1);
        ctx.restore();
    }

    let cursorY = coverY + coverH + gapCoverToTitle;

    // 5. Série (se houver)
    if (book.series && book.series.trim()) {
        const seriesLabel = `${book.series.trim()}${book.seriesNumber ? ` • VOL. ${book.seriesNumber}` : ''}`.toUpperCase();
        ctx.font = 'bold 16px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#fb923c';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(seriesLabel, centerX, cursorY);
        cursorY += seriesH + gapSeriesToTitle;
    }

    // 6. Título do Livro
    ctx.font = `bold ${titleFontSize}px Outfit, Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    renderTLines.forEach(line => {
        ctx.fillText(line, centerX, cursorY);
        cursorY += titleLineH;
    });

    // 7. Autor
    cursorY += gapTitleToAuthor;
    ctx.font = '500 24px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.76)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (renderALines[0]) {
        ctx.fillText(renderALines[0], centerX, cursorY);
        cursorY += authorH;
    }

    // 8. Estrelas de Avaliação
    if (book.rating > 0) {
        cursorY += gapAuthorToRating;
        drawCenteredStarRating(ctx, centerX, cursorY + 16, book.rating, 16, 8);
        cursorY += ratingH;
    }

    // 9. Hub Dinâmico
    cursorY += gapRatingToHub;

    if (isQuoteMode) {
        ctx.save();
        // 1. Fundo glassmorphism do card de anotação
        drawRoundedRect(ctx, hubX, cursorY, hubW, hubH, 26);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
        ctx.stroke();

        // 2. Aspas decorativas estilizadas no topo esquerdo do card
        ctx.font = 'bold 54px Georgia, "Times New Roman", serif';
        ctx.fillStyle = 'rgba(251, 146, 60, 0.7)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('“', hubX + 44, cursorY + 20);

        // 3. Linhas da anotação com alinhamento à esquerda e espaçamento editorial
        ctx.font = `italic 400 ${quoteFontSize}px Georgia, "Times New Roman", serif`;
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let qY = cursorY + quoteHeaderH;
        quoteLines.forEach(line => {
            ctx.fillText(line, hubX + 48, qY);
            qY += quoteLineH;
        });

        // 4. Contexto / Referência posicionado com segurança na base (sem nunca colidir com a borda)
        if (cleanQuoteLocation) {
            const refY = cursorY + hubH - 32;
            ctx.font = '600 20px Inter, system-ui, sans-serif';
            ctx.fillStyle = '#fb923c';
            ctx.textBaseline = 'middle';

            const maxRefW = hubW - 96;
            let renderedRef = cleanQuoteLocation;
            if (ctx.measureText(renderedRef).width > maxRefW) {
                while (renderedRef.length > 3 && ctx.measureText(renderedRef + '…').width > maxRefW) {
                    renderedRef = renderedRef.slice(0, -1);
                }
                renderedRef += '…';
            }
            ctx.textAlign = 'right';
            ctx.fillText(renderedRef, hubX + hubW - 48, refY);
        }
        ctx.restore();
    } else if (isReading && totalPages > 0) {
        ctx.save();
        drawRoundedRect(ctx, hubX, cursorY, hubW, hubH, 26);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = isReReading ? 'rgba(249, 115, 22, 0.35)' : 'rgba(59, 130, 246, 0.35)';
        ctx.stroke();

        ctx.font = 'bold 36px Outfit, Inter, system-ui, sans-serif';
        ctx.fillStyle = isReReading ? '#fb923c' : '#38bdf8';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`${progressPercent}%`, hubX + 28, cursorY + 46);

        ctx.font = '600 20px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(`Página ${readPages} de ${totalPages}`, hubX + 130, cursorY + 44);

        const remainingPgs = Math.max(0, totalPages - readPages);
        ctx.font = '500 17px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.textAlign = 'right';
        ctx.fillText(`Faltam ${remainingPgs} págs`, hubX + hubW - 28, cursorY + 44);

        const barX = hubX + 28;
        const barY = cursorY + 66;
        const barW = hubW - 56;
        const barH = 18;

        drawRoundedRect(ctx, barX, barY, barW, barH, 9);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();

        if (progressPercent > 0) {
            const fillW = Math.max(barH, Math.round((barW * progressPercent) / 100));
            drawRoundedRect(ctx, barX, barY, fillW, barH, 9);
            const barGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
            if (isReReading) {
                barGrad.addColorStop(0, '#f2511b');
                barGrad.addColorStop(1, '#fbbf24');
            } else {
                barGrad.addColorStop(0, '#3b82f6');
                barGrad.addColorStop(1, '#38bdf8');
            }
            ctx.fillStyle = barGrad;
            ctx.fill();
        }

        if (avgPace > 0) {
            const infoParts = [`${avgPace} pág/dia`];
            if (remainingPgs > 0) {
                const estDays = Math.ceil(remainingPgs / avgPace);
                infoParts.push(`~${estDays} ${estDays === 1 ? 'dia' : 'dias'} restantes`);
            }
            ctx.font = '600 16px Inter, system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(infoParts.join('   •   '), centerX, cursorY + 112);
        }
        ctx.restore();
    } else if (isRead) {
        ctx.save();
        drawRoundedRect(ctx, hubX, cursorY, hubW, hubH, 26);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
        ctx.stroke();

        const col3 = (avgPace > 0)
            ? { label: 'RITMO MÉDIO', value: `${avgPace} pág/dia` }
            : (totalTimesRead > 1)
                ? { label: 'RELEITURAS', value: `${totalTimesRead}ª vez lido` }
                : { label: 'STATUS', value: '100% Concluído' };

        const statCols = [
            { label: 'PÁGINAS', value: totalPages > 0 ? `${totalPages}` : 'Concluído' },
            { label: 'TEMPO DE LEITURA', value: lastCompDays !== null ? `${lastCompDays} ${lastCompDays === 1 ? 'dia' : 'dias'}` : 'Finalizado' },
            col3
        ];

        const boxH = 86;
        const boxY = cursorY + Math.round((hubH - boxH) / 2);

        const colW = (hubW - 56 - 32) / 3;
        statCols.forEach((col, idx) => {
            const cx = hubX + 28 + idx * (colW + 16);
            drawRoundedRect(ctx, cx, boxY, colW, boxH, 16);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.fill();

            ctx.font = '600 13px Inter, system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(col.label, cx + colW / 2, boxY + 30);

            ctx.font = 'bold 23px Outfit, Inter, system-ui, sans-serif';
            ctx.fillStyle = '#34d399';
            ctx.fillText(col.value, cx + colW / 2, boxY + 64);
        });

        ctx.restore();
    } else {
        ctx.save();
        drawRoundedRect(ctx, hubX, cursorY, hubW, hubH, 26);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = statusPill.border || 'rgba(59, 130, 246, 0.35)';
        ctx.stroke();

        ctx.font = '600 20px Outfit, Inter, system-ui, sans-serif';
        ctx.fillStyle = statusPill.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Aguardando na Estante', centerX, cursorY + 38);

        const wantPills = [];
        if (book.goalYear && parseInt(book.goalYear) >= 2000) {
            wantPills.push({ text: `Meta ${book.goalYear}`, color: '#a3e635', border: 'rgba(132, 204, 22, 0.5)' });
        }
        if (totalPages > 0) wantPills.push({ text: `${totalPages} páginas` });
        if (book.genre && book.genre.trim()) wantPills.push({ text: `${book.genre.split(',')[0].trim()}` });
        if (book.publisher && book.publisher.trim()) wantPills.push({ text: `${book.publisher.trim()}` });

        drawCenteredPillsRow(ctx, centerX, cursorY + 76, wantPills, hubW - 40);
        ctx.restore();
    }

    // 10. Rodapé Fixo no Fundo da Moldura
    const footerY = framePadY + frameH - 32;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(framePadX + 44, footerY - 26);
    ctx.lineTo(framePadX + frameW - 44, footerY - 26);
    ctx.stroke();

    // 10.1 Lado Esquerdo: Identidade do Webapp do Rafael Reis
    ctx.font = '600 17px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const brandUrl = 'rafael-reis1.github.io';
    ctx.fillStyle = statusPill.color;
    ctx.fillText(brandUrl, framePadX + 44, footerY);

    // 10.2 Lado Direito: Contexto / Data Dinâmica
    const dynamicDateLabel = getDynamicDateLabel(book, { isQuoteMode, quoteDate });
    ctx.font = '600 17px Inter, system-ui, sans-serif';
    ctx.fillStyle = statusPill.color;
    ctx.textAlign = 'right';
    ctx.fillText(dynamicDateLabel, framePadX + frameW - 44, footerY);
    ctx.restore();

    return canvas;
}

export async function shareOrDownloadCard(book, options = {}, onToast = null) {
    try {
        if (onToast) onToast('Gerando card visual...');
        const canvas = await generateShareCard(book, options);
        const dataUrl = canvas.toDataURL('image/png');

        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const safeName = (book.title || 'livro').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
        const fileName = `card-${safeName || 'leitura'}.png`;

        const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

        if (isMobileDevice && options.allowNativeShare !== false && navigator.canShare && blob) {
            const file = new File([blob], fileName, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
                try {
                    const shareText = options.quoteText
                        ? `"${options.quoteText}" — ${book.title}\n\nMinha Biblioteca: https://rafael-reis1.github.io/reading/reading.html\nWebapp desenvolvido por Rafael Reis`
                        : `${book.title} (${book.author})\n\nMinha Biblioteca: https://rafael-reis1.github.io/reading/reading.html\nWebapp desenvolvido por Rafael Reis`;

                    await navigator.share({
                        files: [file],
                        title: `${book.title} — Minha Biblioteca`,
                        text: shareText,
                        url: 'https://rafael-reis1.github.io/reading/reading.html'
                    });
                    return { method: 'share', fileName };
                } catch (err) {
                    if (err.name === 'AbortError') return { method: 'cancelled', fileName };
                }
            }
        }

        const link = document.createElement('a');
        link.href = blob ? URL.createObjectURL(blob) : dataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (blob) {
            setTimeout(() => URL.createObjectURL(link.href), 5000);
        }
        if (onToast) onToast('Card salvo em PNG com sucesso!');
        return { method: 'download', fileName };
    } catch (error) {
        console.error('Erro ao gerar card:', error);
        if (onToast) onToast('Não foi possível gerar o card.', 'error');
        throw error;
    }
}

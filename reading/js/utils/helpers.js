/**
 * Funções utilitárias compartilhadas no Reading Manager
 */

export const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

export const escapeHTML = (str) => {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

export const starSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="star-pill-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

export const cleanCoverUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    let processed = url.trim();
    if (!processed || processed === 'null') return '';

    if (processed.startsWith('http:')) {
        processed = processed.replace('http:', 'https:');
    }

    if (processed.includes('books.google.com') || processed.includes('googleapis.com')) {
        processed = processed.replace(/&edge=curl/gi, '').replace(/\?edge=curl&/gi, '?');
    }

    if (processed.includes('drive.google.com')) {
        const fileIdMatch = processed.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const ucIdMatch = processed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        const id = fileIdMatch ? fileIdMatch[1] : (ucIdMatch ? ucIdMatch[1] : null);
        if (id && !processed.includes('thumbnail?id=')) {
            processed = `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
        }
    }

    return processed;
};

export const generateEntryId = (prefix = 'entry') => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
};

/**
 * Normaliza e valida uma URL de imagem antes de injetá-la em um atributo HTML.
 * Rejeita esquemas executáveis (javascript:, vbscript:) e mantém URLs relativas
 * que já existiam na biblioteca. O escaping do atributo é responsabilidade do caller.
 */
export const safeImageUrl = (url) => {
    const cleaned = cleanCoverUrl(url);
    if (!cleaned) return '';
    if (/^(?:javascript|vbscript|file):/i.test(cleaned)) return '';
    return cleaned;
};

/**
 * Valida o formato de um UID do Firebase (usado em links de compartilhamento).
 */
export const isValidFirebaseUid = (uid) => {
    return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
};

export const formatDaysAgo = (dateStr) => {
    if (!dateStr) return '';
    const d = dateStr.length === 10 ? new Date(dateStr + 'T12:00:00') : new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now - d;
    const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    if (days === 0) return 'hoje';
    if (days === 1) return 'há 1 dia';
    return `há ${days} dias`;
};


/**
 * Modelo de Dados e Normalização de Livro
 */

export const BookModel = {
    create(data) {
        return {
            id: Date.now().toString(),
            title: (data.title || '').trim(),
            author: (data.author || '').trim(),
            pages: parseInt(data.pages) || 0,
            status: data.status || 'want-to-read',
            cover: data.cover || '',
            tags: data.tags || [],
            readFormat: data.readFormat || [],
            rating: parseFloat(data.rating) || 0,
            readPages: data.status === 'read' ? (parseInt(data.pages) || 0) : 0,
            timesRead: 0,
            readDate: data.readDate || null,
            history: [],
            notes: [],
            createdAt: new Date().toISOString(),
            year: data.readDate ? parseInt(data.readDate.split('-')[0]) : new Date().getFullYear(),
            goalYear: data.goalYear ? parseInt(data.goalYear) : null,
            loanDetails: data.loanDetails || '',
            loanDate: data.loanDate || null
        };
    }
};

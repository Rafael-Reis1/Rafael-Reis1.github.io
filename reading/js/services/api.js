/**
 * Integração com APIs externas de Livros e IA (Google Books, OpenLibrary, Gemini)
 */

export const GoogleBooksAPI = {
    async search(query) {
        if (!query || query.length < 3) return [];
        try {
            const cleanQ = query.trim();
            const isIsbn = /^(?:97[89])?\d{9}[\dXx]$/.test(cleanQ.replace(/[-\s]/g, ''));
            const qParam = isIsbn ? `isbn:${cleanQ.replace(/[-\s]/g, '')}` : cleanQ;
            const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(qParam)}&maxResults=20`);
            const data = await response.json();
            return data.items || [];
        } catch (error) {
            console.error('API Error:', error);
            return [];
        }
    }
};

export const OpenLibraryAPI = {
    async search(query) {
        if (!query || query.length < 3) return [];
        try {
            const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&fields=key,title,author_name,cover_i,number_of_pages_median,first_publish_year,isbn,subject,publisher`);
            const data = await response.json();

            return (data.docs || []).map(doc => ({
                id: 'ol:' + doc.key.replace('/works/', ''),
                volumeInfo: {
                    title: doc.title,
                    authors: doc.author_name || ['Autor Desconhecido'],
                    pageCount: doc.number_of_pages_median || 0,
                    publishedDate: doc.first_publish_year ? doc.first_publish_year.toString() : '',
                    categories: doc.subject ? doc.subject.slice(0, 3) : [],
                    publisher: doc.publisher ? doc.publisher[0] : '',
                    industryIdentifiers: doc.isbn ? [{ type: 'ISBN', identifier: doc.isbn[0] }] : [],
                    imageLinks: {
                        thumbnail: doc.cover_i
                            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
                            : null
                    }
                },
                source: 'OpenLibrary'
            }));
        } catch (error) {
            console.error('OpenLibrary API Error:', error);
            return [];
        }
    },

    async getWorkDetails(workId) {
        try {
            const response = await fetch(`https://openlibrary.org/works/${workId}.json`);
            return await response.json();
        } catch (error) {
            console.error('OL Details Error:', error);
            return null;
        }
    }
};

export const GeminiAPI = {
    async getRecomendacoes(livrosBase, todosOsTitulos) {
        if (!livrosBase || livrosBase.length === 0) return [];

        const normalizedExisting = new Set(
            (todosOsTitulos || []).map(t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim())
        );

        // Priorizar livros com nota >= 4 ou favoritos, senão usar os lidos/lendo mais recentes
        const topBooks = [...livrosBase].sort((a, b) => {
            const favA = a.tags && a.tags.includes('favorite') ? 1 : 0;
            const favB = b.tags && b.tags.includes('favorite') ? 1 : 0;
            if (favB !== favA) return favB - favA;
            if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });

        // Extrair autores e gêneros mais recorrentes/bem avaliados
        const authorScores = new Map();
        const genreScores = new Map();

        topBooks.forEach(b => {
            const weight = (b.rating >= 4.5 ? 3 : b.rating >= 4 ? 2 : 1) + (b.tags && b.tags.includes('favorite') ? 2 : 0);
            if (b.author && b.author.trim() && b.author !== 'Autor Desconhecido') {
                const prev = authorScores.get(b.author) || { score: 0, sampleBook: b.title, rating: b.rating };
                authorScores.set(b.author, {
                    score: prev.score + weight,
                    sampleBook: b.rating >= (prev.rating || 0) ? b.title : prev.sampleBook,
                    rating: Math.max(prev.rating || 0, b.rating || 0)
                });
            }
            if (b.genre && b.genre.trim()) {
                const g = b.genre.split(',')[0].trim();
                const prevG = genreScores.get(g) || { score: 0, sampleBook: b.title };
                genreScores.set(g, { score: prevG.score + weight, sampleBook: prevG.sampleBook });
            }
        });

        const topAuthors = [...authorScores.entries()]
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, 5);

        const topGenres = [...genreScores.entries()]
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, 3);

        const suggestions = [];
        const seenTitles = new Set(normalizedExisting);

        // 1. Buscar outras obras dos autores favoritos
        const queries = [
            ...topAuthors.map(([author, meta]) => ({
                query: `inauthor:"${author}"`,
                fallbackQuery: author,
                reason: meta.rating >= 4
                    ? `Porque você avaliou "${meta.sampleBook}" de ${author} com ★ ${meta.rating}`
                    : `Outra obra de ${author}, autor de "${meta.sampleBook}"`
            })),
            ...topGenres.map(([genre, meta]) => ({
                query: `subject:"${genre}"`,
                fallbackQuery: genre,
                reason: `Destaque em ${genre} (inspirado em "${meta.sampleBook}")`
            }))
        ];

        for (const qObj of queries) {
            try {
                let items = await GoogleBooksAPI.search(qObj.query);
                if (!items || items.length === 0) {
                    items = await GoogleBooksAPI.search(qObj.fallbackQuery);
                }
                for (const item of (items || [])) {
                    const info = item.volumeInfo || {};
                    const rawTitle = (info.title || '').trim();
                    if (!rawTitle) continue;
                    const normTitle = rawTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    if (seenTitles.has(normTitle)) continue;
                    const isAlreadyOwnedSimilar = [...seenTitles].some(existing =>
                        existing.length > 4 && (normTitle.includes(existing) || existing.includes(normTitle))
                    );
                    if (isAlreadyOwnedSimilar) continue;

                    seenTitles.add(normTitle);
                    suggestions.push({
                        title: rawTitle,
                        author: info.authors ? info.authors[0] : qObj.fallbackQuery,
                        reason: qObj.reason,
                        prefetchedItem: item
                    });
                    if (suggestions.length >= 12) break;
                }
                if (suggestions.length >= 12) break;
            } catch (e) {
                console.warn('Erro ao buscar recomendação:', e);
            }
        }

        return suggestions;
    }
};


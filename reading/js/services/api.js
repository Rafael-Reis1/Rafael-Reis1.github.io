/**
 * Integração com APIs externas de Livros e IA (Google Books, OpenLibrary, Gemini)
 */

export const GoogleBooksAPI = {
    async search(query) {
        if (!query || query.length < 3) return [];
        try {
            const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20`);
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
            const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&fields=key,title,author_name,cover_i,number_of_pages_median,first_publish_year`);
            const data = await response.json();

            return (data.docs || []).map(doc => ({
                id: 'ol:' + doc.key.replace('/works/', ''),
                volumeInfo: {
                    title: doc.title,
                    authors: doc.author_name || ['Autor Desconhecido'],
                    pageCount: doc.number_of_pages_median || 0,
                    publishedDate: doc.first_publish_year ? doc.first_publish_year.toString() : '',
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
        // TRAVA DE SEGURANÇA: Retorna imediatamente para evitar consumo da API Gemini
        return [];

        // if (!livrosBase || livrosBase.length === 0) return [];
        // try {
        //     const gerarRecomendacoes = firebase.functions().httpsCallable('gerarRecomendacoesLivros');
        //     const response = await gerarRecomendacoes({
        //         livrosBase: livrosBase,
        //         todosOsTitulos: todosOsTitulos
        //     });
        //     return response.data || [];
        // } catch (error) {
        //     console.error("Erro na Function do Firebase:", error);
        //     return [];
        // }
    }
};

/**
 * Serviço de Armazenamento Local (localStorage fallback)
 */

export const StorageService = {
    KEY: 'reading_app_data',

    getBooks() {
        const data = localStorage.getItem(this.KEY);
        return data ? JSON.parse(data) : [];
    },

    saveBook(book) {
        const books = this.getBooks();
        books.push(book);
        localStorage.setItem(this.KEY, JSON.stringify(books));
    },

    updateBook(updatedBook) {
        let books = this.getBooks();
        books = books.map(b => b.id === updatedBook.id ? updatedBook : b);
        localStorage.setItem(this.KEY, JSON.stringify(books));
    },

    deleteBook(id) {
        let books = this.getBooks();
        books = books.filter(b => b.id !== id);
        localStorage.setItem(this.KEY, JSON.stringify(books));
    },

    clearAll() {
        localStorage.removeItem(this.KEY);
    }
};

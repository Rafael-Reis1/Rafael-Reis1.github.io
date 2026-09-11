/**
 * Gerenciador de Estado, Sincronização em Tempo Real e CRUD de Livros/Listas
 */
import { auth, db } from '../services/firebase.js';

export class ReadingManager {
    constructor() {
        this.books = [];
        this.lists = [];
        this.unsubscribeListener = null;
        this.unsubscribeListsListener = null;
    }

    async initListener(user, onUpdateCallback) {
        if (!user) return;

        this.stopListener();

        const libraryRef = db.collection('library_data').doc(user.uid);
        const booksRef = libraryRef.collection('books');
        const listsRef = libraryRef.collection('lists');

        this.unsubscribeListener = booksRef.onSnapshot((snapshot) => {
            this.books = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            if (onUpdateCallback) onUpdateCallback();
        }, (error) => {
            console.error('Erro no Listener de Livros:', error);
        });

        this.unsubscribeListsListener = listsRef.onSnapshot((snapshot) => {
            this.lists = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            if (onUpdateCallback) onUpdateCallback();
        }, (error) => {
            console.error('Erro no Listener de Listas:', error);
        });
    }

    stopListener() {
        if (this.unsubscribeListener) {
            this.unsubscribeListener();
            this.unsubscribeListener = null;
        }
        if (this.unsubscribeListsListener) {
            this.unsubscribeListsListener();
            this.unsubscribeListsListener = null;
        }
    }

    clear() {
        this.books = [];
        this.lists = [];
    }

    getAll() {
        return [...this.books].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    get(id) {
        return this.books.find(b => b.id === id);
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    add(book) {
        const newBook = {
            ...book,
            id: this.generateId(),
            createdAt: new Date().toISOString()
        };

        this.books.push(newBook);

        if (auth.currentUser) {
            const ref = db.collection('library_data').doc(auth.currentUser.uid)
                .collection('books').doc(newBook.id);
            ref.set(newBook).catch(e => console.error('Sync error:', e));
        }

        return newBook;
    }

    update(id, data) {
        const index = this.books.findIndex(b => b.id === id);
        if (index !== -1) {
            this.books[index] = { ...this.books[index], ...data };

            if (auth.currentUser) {
                const ref = db.collection('library_data').doc(auth.currentUser.uid)
                    .collection('books').doc(id);
                ref.update(data).catch(e => console.error('Sync error:', e));
            }

            return this.books[index];
        }
        return null;
    }

    addList(listData) {
        const newList = {
            ...listData,
            id: 'list_' + this.generateId(),
            createdAt: new Date().toISOString()
        };
        this.lists.push(newList);
        if (auth.currentUser) {
            const ref = db.collection('library_data').doc(auth.currentUser.uid)
                .collection('lists').doc(newList.id);
            ref.set(newList).catch(e => console.error('Sync error:', e));
        }
        return newList;
    }

    updateList(id, data) {
        const index = this.lists.findIndex(l => l.id === id);
        if (index !== -1) {
            this.lists[index] = { ...this.lists[index], ...data };
            if (auth.currentUser) {
                const ref = db.collection('library_data').doc(auth.currentUser.uid)
                    .collection('lists').doc(id);
                ref.update(data).catch(e => console.error('Sync error:', e));
            }
            return this.lists[index];
        }
        return null;
    }

    deleteList(id) {
        this.lists = this.lists.filter(l => l.id !== id);
        if (auth.currentUser) {
            const ref = db.collection('library_data').doc(auth.currentUser.uid)
                .collection('lists').doc(id);
            ref.delete().catch(e => console.error('Sync error:', e));
        }
    }

    async updateMultiple(updates) {
        if (!auth.currentUser || Object.keys(updates).length === 0) return;

        const userRef = db.collection('library_data').doc(auth.currentUser.uid).collection('books');
        const updateEntries = Object.entries(updates);

        for (let i = 0; i < updateEntries.length; i += 400) {
            const batch = db.batch();
            const chunk = updateEntries.slice(i, i + 400);

            chunk.forEach(([id, data]) => {
                const index = this.books.findIndex(b => b.id === id);
                if (index !== -1) {
                    this.books[index] = { ...this.books[index], ...data };
                    batch.update(userRef.doc(id), data);
                }
            });

            await batch.commit();
        }
    }

    delete(id) {
        this.books = this.books.filter(b => b.id !== id);

        if (auth.currentUser) {
            const ref = db.collection('library_data').doc(auth.currentUser.uid)
                .collection('books').doc(id);
            ref.delete().catch(e => console.error('Sync error:', e));
        }

        return true;
    }

    export() {
        return {
            books: this.books,
            lists: this.lists,
            exportedAt: new Date().toISOString(),
            version: '1.0'
        };
    }

    async import(data, replace = false, onProgress = null) {
        if (!data.books || !Array.isArray(data.books)) {
            throw new Error('Formato inválido');
        }

        if (!auth.currentUser) {
            throw new Error('Usuário não autenticado');
        }

        const userRef = db.collection('library_data').doc(auth.currentUser.uid).collection('books');
        const listsRef = db.collection('library_data').doc(auth.currentUser.uid).collection('lists');

        if (replace) {
            if (onProgress) onProgress('Limpando biblioteca atual...');
            try {
                const existing = await Promise.race([
                    userRef.get(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
                ]);
                
                for (let i = 0; i < existing.docs.length; i += 400) {
                    const batch = db.batch();
                    const chunk = existing.docs.slice(i, i + 400);
                    chunk.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }

                const existingLists = await Promise.race([
                    listsRef.get(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
                ]);
                
                for (let i = 0; i < existingLists.docs.length; i += 400) {
                    const batch = db.batch();
                    const chunk = existingLists.docs.slice(i, i + 400);
                    chunk.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }
            } catch (e) {
                const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
                if (isDev) console.warn('Limpeza via nuvem lenta ou offline. Continuando...');
            }
        }

        const total = data.books.length;
        for (let i = 0; i < total; i += 400) {
            if (onProgress) onProgress(`Importando livros (${Math.min(i + 400, total)} de ${total})...`);
            const batch = db.batch();
            const chunk = data.books.slice(i, i + 400);
            chunk.forEach(book => {
                const id = book.id || this.generateId();
                const ref = userRef.doc(id);
                batch.set(ref, { ...book, id });
            });
            
            try {
                await Promise.race([
                    batch.commit(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
                ]);
            } catch (e) {
                const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
                if (isDev) console.warn('Commit demorado ou offline. Continuando em background...');
                break;
            }
        }

        if (data.lists && Array.isArray(data.lists)) {
            const totalLists = data.lists.length;
            for (let i = 0; i < totalLists; i += 400) {
                if (onProgress) onProgress(`Importando listas (${Math.min(i + 400, totalLists)} de ${totalLists})...`);
                const batch = db.batch();
                const chunk = data.lists.slice(i, i + 400);
                chunk.forEach(list => {
                    const id = list.id || ('list_' + this.generateId());
                    const ref = listsRef.doc(id);
                    batch.set(ref, { ...list, id });
                });
                
                try {
                    await Promise.race([
                        batch.commit(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
                    ]);
                } catch (e) {
                    const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
                    if (isDev) console.warn('Commit listas demorado ou offline. Continuando em background...');
                    break;
                }
            }
        }

        return total;
    }
}

export const rm = new ReadingManager();

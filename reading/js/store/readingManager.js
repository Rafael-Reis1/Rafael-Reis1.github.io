/**
 * Gerenciador de Estado, Sincronização em Tempo Real e CRUD de Livros/Listas
 */
import { auth, db, firebase } from '../services/firebase.js';
import { generateEntryId } from '../utils/helpers.js';

const VALID_STATUSES = new Set(['read', 'reading', 'want-to-read', 're-reading', 'rereading', 'abandoned']);
const VALID_ENTRY_TYPES = new Set(['start', 'progress', 'finish']);
const VALID_FORMATS = new Set(['physical', 'ebook', 'audiobook']);

/**
 * Remove campos derivados/efêmeros (`computed`, `_temp*`, `undefined`) antes de
 * persistir. Esses dados são recalculados em memória e não devem ir para o banco.
 */
export const toFirestorePayload = (data) => {
    const payload = {};
    if (!data || typeof data !== 'object') return payload;

    Object.entries(data).forEach(([key, value]) => {
        if (key === 'computed' || key.startsWith('_')) return;
        if (value === undefined) return;
        payload[key] = value;
    });

    return payload;
};

const stripDerived = (id, data) => {
    const book = { id, ...data };
    delete book.computed;
    Object.keys(book).forEach(key => {
        if (key.startsWith('_')) delete book[key];
    });
    return book;
};

const toText = (value) => (value === null || value === undefined ? '' : String(value));
const toInt = (value, fallback = 0) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toNumberOrNull = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const toIsoOrNull = (value) => {
    if (!value) return null;
    const text = toText(value);
    const date = text.length === 10 ? new Date(`${text}T12:00:00`) : new Date(text);
    return Number.isNaN(date.getTime()) ? null : text;
};
const toStringArray = (value) => (Array.isArray(value) ? value.filter(v => typeof v === 'string' && v.trim()) : []);

const withTimeout = (promise, ms, message) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
    ]);
};

// Hash simples (djb2) para evitar reescrever a lista pública sem necessidade.
const hashString = (input) => {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
};

/**
 * Normaliza um livro vindo de backup. Retorna null quando o registro é inválido
 * (sem título), permitindo que a importação continue com os demais.
 */
export const normalizeImportedBook = (raw) => {
    if (!raw || typeof raw !== 'object') return null;

    const title = toText(raw.title).trim();
    if (!title) return null;

    const pages = Math.max(0, toInt(raw.pages));
    const status = VALID_STATUSES.has(raw.status) ? raw.status : 'want-to-read';
    const readDate = toIsoOrNull(raw.readDate);
    const createdAt = toIsoOrNull(raw.createdAt) || new Date().toISOString();

    const history = (Array.isArray(raw.history) ? raw.history : [])
        .filter(entry => entry && typeof entry === 'object' && toIsoOrNull(entry.date))
        .map(entry => {
            const normalized = {
                id: toText(entry.id) || generateEntryId('hist'),
                date: toIsoOrNull(entry.date),
                page: Math.max(0, toInt(entry.page)),
                type: VALID_ENTRY_TYPES.has(entry.type) ? entry.type : 'progress'
            };
            const note = toText(entry.note).trim();
            if (note) normalized.note = note;
            const duration = toInt(entry.durationMinutes);
            if (duration > 0) normalized.durationMinutes = duration;
            if (entry.migrated) normalized.migrated = true;
            if (entry.isFallbackDate) normalized.isFallbackDate = true;
            return normalized;
        });

    const notes = (Array.isArray(raw.notes) ? raw.notes : [])
        .filter(note => note && typeof note === 'object' && toText(note.content).trim())
        .map(note => ({
            id: toText(note.id) || generateEntryId('note'),
            content: toText(note.content).trim(),
            location: toText(note.location).trim(),
            createdAt: toIsoOrNull(note.createdAt) || createdAt,
            ...(toIsoOrNull(note.updatedAt) ? { updatedAt: toIsoOrNull(note.updatedAt) } : {})
        }));

    let readPages = Math.max(0, toInt(raw.readPages));
    if (pages > 0 && readPages > pages) readPages = pages;

    const yearFromDate = readDate ? toInt(readDate.slice(0, 4), null) : null;

    return {
        id: toText(raw.id).trim() || generateEntryId('book'),
        title,
        author: toText(raw.author).trim(),
        pages,
        status,
        cover: toText(raw.cover).trim(),
        tags: toStringArray(raw.tags),
        customLists: toStringArray(raw.customLists),
        readFormat: toStringArray(raw.readFormat).filter(format => VALID_FORMATS.has(format)),
        rating: Math.min(5, Math.max(0, toNumberOrNull(raw.rating) || 0)),
        readPages,
        timesRead: Math.max(0, toInt(raw.timesRead)),
        readDate,
        history,
        notes,
        createdAt,
        year: toInt(raw.year, 0) || yearFromDate || toInt(createdAt.slice(0, 4), null),
        goalYear: toInt(raw.goalYear, 0) || null,
        loanDetails: toText(raw.loanDetails).trim(),
        loanDate: toIsoOrNull(raw.loanDate),
        description: toText(raw.description).trim(),
        genre: toText(raw.genre).trim(),
        series: toText(raw.series).trim(),
        seriesNumber: toNumberOrNull(raw.seriesNumber),
        isbn: toText(raw.isbn).trim(),
        publisher: toText(raw.publisher).trim(),
        publishedYear: toInt(raw.publishedYear, 0) || null
    };
};

const normalizeImportedList = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const name = toText(raw.name).trim();
    if (!name) return null;

    const normalized = {
        id: toText(raw.id).trim() || `list_${generateEntryId('list')}`,
        name,
        createdAt: toIsoOrNull(raw.createdAt) || new Date().toISOString()
    };
    if (Number.isFinite(toInt(raw.order, NaN))) normalized.order = toInt(raw.order);
    if (Array.isArray(raw.bookOrder)) normalized.bookOrder = toStringArray(raw.bookOrder);
    return normalized;
};

export class ReadingManager {
    constructor() {
        this.books = [];
        this.lists = [];
        this.settings = {};
        this.unsubscribeListener = null;
        this.unsubscribeListsListener = null;
        this.unsubscribeSettingsListener = null;
    }

    async initListener(user, onUpdateCallback) {
        if (!user) return;

        this.stopListener();

        const libraryRef = db.collection('library_data').doc(user.uid);
        const booksRef = libraryRef.collection('books');
        const listsRef = libraryRef.collection('lists');

        this.unsubscribeListener = booksRef.onSnapshot((snapshot) => {
            this.books = snapshot.docs.map(doc => stripDerived(doc.id, doc.data()));

            if (onUpdateCallback) onUpdateCallback();
        }, (error) => {
            console.error('Erro no Listener de Livros:', error);
        });

        this.unsubscribeListsListener = listsRef.onSnapshot((snapshot) => {
            this.lists = snapshot.docs.map(doc => stripDerived(doc.id, doc.data()));

            if (onUpdateCallback) onUpdateCallback();
        }, (error) => {
            console.error('Erro no Listener de Listas:', error);
        });

        // Configurações que antes viviam só no localStorage (ex.: meta anual) passam a sincronizar.
        this.unsubscribeSettingsListener = libraryRef.onSnapshot((doc) => {
            this.settings = doc.exists ? (doc.data() || {}) : {};

            if (onUpdateCallback) onUpdateCallback();
        }, (error) => {
            console.error('Erro no Listener de Configurações:', error);
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
        if (this.unsubscribeSettingsListener) {
            this.unsubscribeSettingsListener();
            this.unsubscribeSettingsListener = null;
        }
    }

    clear() {
        this.books = [];
        this.lists = [];
        this.settings = {};
    }

    /** Metas anuais numéricas, vindas do Firestore com fallback para o cache local. */
    getYearlyGoals() {
        const goals = {};
        const remoteGoals = this.settings && this.settings.yearlyGoals;

        // Quando o Firestore já respondeu, ele é a fonte da verdade (inclusive para metas removidas).
        if (remoteGoals && typeof remoteGoals === 'object') {
            Object.entries(remoteGoals).forEach(([year, count]) => {
                const parsed = parseInt(count, 10);
                if (Number.isFinite(parsed) && parsed > 0) goals[year] = parsed;
            });
            return goals;
        }

        try {
            Object.keys(localStorage).forEach(key => {
                const match = key.match(/^rm_yearly_goal_books_(\d{4})$/);
                if (match) {
                    const parsed = parseInt(localStorage.getItem(key), 10);
                    if (Number.isFinite(parsed) && parsed > 0) goals[match[1]] = parsed;
                }
            });
        } catch (error) {
            // localStorage indisponível (modo privado/SSR): segue só com o que veio do Firestore.
        }

        return goals;
    }

    async setYearlyGoal(year, count) {
        const parsedYear = String(parseInt(year, 10) || '');
        const parsedCount = Math.max(0, parseInt(count, 10) || 0);
        if (!parsedYear) return this.getYearlyGoals();

        const goals = this.getYearlyGoals();
        if (parsedCount > 0) goals[parsedYear] = parsedCount;
        else delete goals[parsedYear];

        this.settings = { ...this.settings, yearlyGoals: goals };

        try {
            if (parsedCount > 0) {
                localStorage.setItem(`rm_yearly_goal_books_${parsedYear}`, String(parsedCount));
            } else {
                localStorage.removeItem(`rm_yearly_goal_books_${parsedYear}`);
            }
            localStorage.setItem('rm_yearly_goals', JSON.stringify(goals));
        } catch (error) {
            console.warn('Não foi possível salvar a meta localmente:', error);
        }

        if (this.currentUid()) {
            const ref = db.collection('library_data').doc(this.currentUid());
            try {
                await ref.set({ yearlyGoals: goals }, { merge: true });
            } catch (error) {
                console.error('Sync error:', error);
            }
        }

        return goals;
    }

    // -------------------------------------------------------------------------
    // COMPARTILHAMENTO DE LISTAS
    // O link público usa uma cópia enxuta em `shared_lists/{token}`. Assim a
    // biblioteca (notas, empréstimos, avaliações) deixa de ficar legível por
    // qualquer pessoa que tenha a UID.
    // -------------------------------------------------------------------------

    generateShareToken() {
        const cryptoObj = typeof crypto !== 'undefined' ? crypto : null;
        if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
            return cryptoObj.randomUUID();
        }
        const bytes = new Uint8Array(16);
        if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
            cryptoObj.getRandomValues(bytes);
        } else {
            for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /** Dados públicos de uma lista: apenas o que aparece no card compartilhado. */
    buildSharedListSnapshot(list, token) {
        const books = this.books
            .filter(book => Array.isArray(book.customLists) && book.customLists.includes(list.id))
            .slice(0, 300)
            .map(book => ({
                id: book.id,
                title: book.title || '',
                author: book.author || '',
                cover: book.cover || '',
                status: book.status || 'want-to-read',
                rating: parseFloat(book.rating) || 0,
                pages: parseInt(book.pages, 10) || 0,
                readPages: parseInt(book.readPages, 10) || 0,
                series: book.series || '',
                seriesNumber: book.seriesNumber === undefined ? null : book.seriesNumber,
                genre: book.genre || ''
            }));

        return {
            token,
            ownerUid: this.currentUid(),
            listId: list.id,
            name: list.name || 'Lista',
            books,
            bookOrder: Array.isArray(list.bookOrder) ? list.bookOrder.slice(0, 300) : [],
            bookCount: books.length,
            updatedAt: new Date().toISOString()
        };
    }

    async publishSharedList(listId, { create = false } = {}) {
        if (!this.currentUid() || !db) return null;

        const list = this.lists.find(l => l.id === listId);
        if (!list) return null;

        const sharedLists = this.settings.sharedLists || {};
        const existing = sharedLists[listId];
        if (!existing && !create) return null;

        const token = existing && existing.token ? existing.token : this.generateShareToken();
        const snapshot = this.buildSharedListSnapshot(list, token);
        const hash = hashString(JSON.stringify({
            name: snapshot.name,
            books: snapshot.books,
            bookOrder: snapshot.bookOrder
        }));

        if (existing && existing.hash === hash && !create) return token;

        await db.collection('shared_lists').doc(token).set(snapshot);
        try {
            await this.saveSharedListMeta(listId, { token, hash, updatedAt: snapshot.updatedAt });
        } catch (error) {
            // O link já funciona; sem o metadado ele apenas não é sincronizado/revogado automaticamente.
            console.warn('Link publicado, mas o token não pôde ser salvo no perfil:', error);
        }
        return token;
    }

    async saveSharedListMeta(listId, meta) {
        this.settings = {
            ...this.settings,
            sharedLists: { ...(this.settings.sharedLists || {}), [listId]: meta }
        };

        if (!this.currentUid() || !db) return;

        // `set` com merge faz merge profundo do map, preservando as outras listas.
        await db.collection('library_data').doc(this.currentUid())
            .set({ sharedLists: { [listId]: meta } }, { merge: true });
    }

    async revokeSharedList(listId) {
        const sharedLists = this.settings.sharedLists || {};
        const entry = sharedLists[listId];
        if (!entry) return;

        const { [listId]: _removed, ...remaining } = sharedLists;
        this.settings = { ...this.settings, sharedLists: remaining };

        if (!this.currentUid() || !db) return;

        try {
            if (entry.token) {
                await db.collection('shared_lists').doc(entry.token).delete();
            }
        } catch (error) {
            console.warn('Não foi possível remover a lista pública:', error);
        }

        try {
            const fieldValue = firebase && firebase.firestore ? firebase.firestore.FieldValue : null;
            if (fieldValue) {
                await db.collection('library_data').doc(this.currentUid()).set({
                    sharedLists: { [listId]: fieldValue.delete() }
                }, { merge: true });
            }
        } catch (error) {
            console.warn('Não foi possível limpar o token local:', error);
        }
    }

    /** Atualiza todos os links públicos conhecidos e remove os de listas excluídas. */
    async syncSharedLists() {
        if (!this.currentUid() || !db) return;

        const sharedLists = this.settings.sharedLists || {};
        const listIds = Object.keys(sharedLists);
        if (listIds.length === 0) return;

        const existingLists = new Set(this.lists.map(list => list.id));
        for (const listId of listIds) {
            if (!existingLists.has(listId)) {
                await this.revokeSharedList(listId);
                continue;
            }
            try {
                await this.publishSharedList(listId);
            } catch (error) {
                console.warn('Falha ao sincronizar lista compartilhada:', error);
            }
        }
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

    /** UID do usuário logado (ou null quando o SDK não carregou/está deslogado). */
    currentUid() {
        return auth && auth.currentUser ? auth.currentUser.uid : null;
    }

    add(book) {
        const newBook = {
            ...book,
            id: this.generateId(),
            createdAt: new Date().toISOString()
        };

        this.books.push(newBook);

        if (this.currentUid()) {
            const ref = db.collection('library_data').doc(this.currentUid())
                .collection('books').doc(newBook.id);
            // Grava apenas os campos persistíveis; campos derivados ficam só em memória.
            ref.set(toFirestorePayload(newBook)).catch(e => console.error('Sync error:', e));
        }

        return newBook;
    }

    update(id, data) {
        const index = this.books.findIndex(b => b.id === id);
        if (index === -1) return null;

        const payload = toFirestorePayload(data);
        this.books[index] = { ...this.books[index], ...payload };

        if (this.currentUid() && Object.keys(payload).length > 0) {
            const ref = db.collection('library_data').doc(this.currentUid())
                .collection('books').doc(id);
            ref.update(payload).catch(e => console.error('Sync error:', e));
        }

        return this.books[index];
    }

    addList(listData) {
        const newList = {
            ...listData,
            id: 'list_' + this.generateId(),
            createdAt: new Date().toISOString()
        };
        this.lists.push(newList);
        if (this.currentUid()) {
            const ref = db.collection('library_data').doc(this.currentUid())
                .collection('lists').doc(newList.id);
            ref.set(toFirestorePayload(newList)).catch(e => console.error('Sync error:', e));
        }
        return newList;
    }

    updateList(id, data) {
        const index = this.lists.findIndex(l => l.id === id);
        if (index === -1) return null;

        const payload = toFirestorePayload(data);
        this.lists[index] = { ...this.lists[index], ...payload };

        if (this.currentUid() && Object.keys(payload).length > 0) {
            const ref = db.collection('library_data').doc(this.currentUid())
                .collection('lists').doc(id);
            ref.update(payload).catch(e => console.error('Sync error:', e));
        }

        return this.lists[index];
    }

    deleteList(id) {
        this.lists = this.lists.filter(l => l.id !== id);
        if (this.currentUid()) {
            const ref = db.collection('library_data').doc(this.currentUid())
                .collection('lists').doc(id);
            ref.delete().catch(e => console.error('Sync error:', e));
        }
    }

    async updateMultiple(updates) {
        const entries = Object.entries(updates || {}).filter(([, data]) => data && typeof data === 'object');
        if (entries.length === 0) return 0;

        // Atualiza o estado local primeiro (funciona também offline/deslogado).
        entries.forEach(([id, data]) => {
            const index = this.books.findIndex(b => b.id === id);
            if (index !== -1) {
                this.books[index] = { ...this.books[index], ...toFirestorePayload(data) };
            }
        });

        if (!this.currentUid()) return entries.length;

        const userRef = db.collection('library_data').doc(this.currentUid()).collection('books');
        let written = 0;

        for (let i = 0; i < entries.length; i += 400) {
            const batch = db.batch();
            const chunk = entries.slice(i, i + 400);

            chunk.forEach(([id, data]) => {
                const payload = toFirestorePayload(data);
                if (Object.keys(payload).length > 0) {
                    batch.update(userRef.doc(id), payload);
                }
            });

            await batch.commit();
            written += chunk.length;
        }

        return written;
    }

    delete(id) {
        this.books = this.books.filter(b => b.id !== id);

        if (this.currentUid()) {
            const ref = db.collection('library_data').doc(this.currentUid())
                .collection('books').doc(id);
            ref.delete().catch(e => console.error('Sync error:', e));
        }

        return true;
    }

    export() {
        // Exporta sem campos derivados para manter o backup limpo.
        return {
            books: this.books.map(book => toFirestorePayload(stripDerived(book.id, book))),
            lists: this.lists.map(list => toFirestorePayload(list)),
            exportedAt: new Date().toISOString(),
            version: '1.1'
        };
    }

    /**
     * Importa um backup de forma segura:
     * 1) valida e normaliza tudo antes de tocar no banco;
     * 2) grava os registros válidos;
     * 3) só então remove o que não faz parte do backup (modo `replace`).
     * Se a gravação falhar no meio, nada é apagado.
     */
    async import(data, replace = false, onProgress = null) {
        if (!data || !Array.isArray(data.books)) {
            throw new Error('Formato inválido: o arquivo precisa conter a lista "books".');
        }
        if (!this.currentUid()) {
            throw new Error('Usuário não autenticado');
        }

        let skippedBooks = 0;
        const books = [];
        data.books.forEach(raw => {
            const normalized = normalizeImportedBook(raw);
            if (normalized) books.push(normalized);
            else skippedBooks++;
        });

        let skippedLists = 0;
        const lists = [];
        (Array.isArray(data.lists) ? data.lists : []).forEach(raw => {
            const normalized = normalizeImportedList(raw);
            if (normalized) lists.push(normalized);
            else skippedLists++;
        });

        if (books.length === 0) {
            throw new Error('Nenhum livro válido encontrado no arquivo.');
        }

        const userRef = db.collection('library_data').doc(this.currentUid()).collection('books');
        const listsRef = db.collection('library_data').doc(this.currentUid()).collection('lists');

        const writeCollection = async (ref, items, label) => {
            const total = items.length;
            for (let i = 0; i < total; i += 400) {
                const chunk = items.slice(i, i + 400);
                const batch = db.batch();
                chunk.forEach(item => batch.set(ref.doc(item.id), toFirestorePayload(item)));

                if (onProgress) {
                    onProgress(`${label} (${Math.min(i + 400, total)} de ${total})...`);
                }

                try {
                    await withTimeout(batch.commit(), 20000, 'tempo esgotado ao gravar');
                } catch (error) {
                    console.error(`Importação de ${label} falhou:`, error);
                    throw new Error(
                        `Falha ao gravar ${label.toLowerCase()} (${Math.min(i + 400, total)} de ${total}). ` +
                        'Nenhum livro foi apagado — verifique a conexão e tente novamente.'
                    );
                }
            }
            return total;
        };

        await writeCollection(userRef, books, 'Importando livros');
        if (lists.length > 0) {
            await writeCollection(listsRef, lists, 'Importando listas');
        }

        let deletedBooks = 0;
        let deletedLists = 0;
        // Só limpamos listas quando o backup realmente traz essa informação,
        // para não apagar listas ao importar backups antigos (v1.0).
        const backupHasLists = Array.isArray(data.lists);

        if (replace) {
            if (onProgress) onProgress('Removendo registros que não estão no backup...');

            const keepBooks = new Set(books.map(book => book.id));
            const keepLists = new Set(lists.map(list => list.id));

            const deleteObsolete = async (ref, keep, label) => {
                let removed = 0;
                try {
                    const snapshot = await withTimeout(ref.get(), 15000, 'tempo esgotado ao ler a biblioteca atual');
                    const obsolete = snapshot.docs.filter(doc => !keep.has(doc.id));

                    for (let i = 0; i < obsolete.length; i += 400) {
                        const batch = db.batch();
                        obsolete.slice(i, i + 400).forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        removed += Math.min(400, obsolete.length - i);
                    }
                } catch (error) {
                    // A gravação já foi concluída; apenas avisamos que a limpeza ficou pendente.
                    console.error(`Limpeza de ${label} incompleta:`, error);
                }
                return removed;
            };

            deletedBooks = await deleteObsolete(userRef, keepBooks, 'livros');
            deletedLists = backupHasLists ? await deleteObsolete(listsRef, keepLists, 'listas') : 0;
        }

        return {
            importedBooks: books.length,
            importedLists: lists.length,
            skippedBooks,
            skippedLists,
            deletedBooks,
            deletedLists
        };
    }
}

export const rm = new ReadingManager();

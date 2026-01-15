
const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

const GoogleBooksAPI = {
    async search(query) {
        if (!query || query.length < 3) return [];
        try {
            const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`);
            const data = await response.json();
            return data.items || [];
        } catch (error) {
            console.error('API Error:', error);
            return [];
        }
    }
};

const OpenLibraryAPI = {
    async search(query) {
        if (!query || query.length < 3) return [];
        try {
            const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5&fields=key,title,author_name,cover_i,number_of_pages_median,first_publish_year`);
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

const BookModel = {
    create(data) {
        return {
            id: Date.now().toString(),
            title: data.title.trim(),
            author: data.author.trim(),
            pages: parseInt(data.pages) || 0,
            status: data.status || 'want-to-read',
            cover: data.cover || 'https://placehold.co/200x300?text=Sem+Capa',
            tags: data.tags || [],
            rating: parseFloat(data.rating) || 0,
            readPages: data.status === 'read' ? (parseInt(data.pages) || 0) : 0,
            timesRead: 0,
            readDate: data.readDate || null,
            history: [],
            createdAt: new Date().toISOString(),
            year: data.readDate ? parseInt(data.readDate.split('-')[0]) : new Date().getFullYear(),
            goalYear: data.goalYear ? parseInt(data.goalYear) : null
        };
    }
};

const firebaseConfig = {
    apiKey: "AIzaSyCvI-ATmTj-zAzbGnKLx1Fq7i29KoULwro",
    authDomain: "finance-app-e50b8.firebaseapp.com",
    projectId: "finance-app-e50b8",
    storageBucket: "finance-app-e50b8.firebasestorage.app",
    messagingSenderId: "339147531228",
    appId: "1:339147531228:web:6eb3aca1de8798e6d52519",
    measurementId: "G-ZHX9XRD3TK"
};

try {
    firebase.initializeApp(firebaseConfig);
} catch (e) {
    console.error('Firebase Init Error', e);
}
const auth = firebase.auth();
const db = firebase.firestore();
db.enablePersistence({ synchronizeTabs: true })
    .catch((err) => {
        if (err.code == 'unimplemented') {
            console.warn('Persistência offline indisponível neste navegador/modo.');
        }
    });

const googleProvider = new firebase.auth.GoogleAuthProvider();

class ReadingManager {
    constructor() {
        this.books = [];
        this.unsubscribeListener = null;
    }

    async initListener(user, onUpdateCallback) {
        if (!user) return;

        this.stopListener();

        const booksRef = db.collection('library_data').doc(user.uid).collection('books');

        this.unsubscribeListener = booksRef.onSnapshot((snapshot) => {
            this.books = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            if (onUpdateCallback) onUpdateCallback();
        }, (error) => {
            console.error('Erro no Listener de Livros:', error);
        });
    }

    stopListener() {
        if (this.unsubscribeListener) {
            this.unsubscribeListener();
            this.unsubscribeListener = null;
        }
    }

    clear() {
        this.books = [];
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
            exportedAt: new Date().toISOString(),
            version: '1.0'
        };
    }

    async import(data, replace = false) {
        if (!data.books || !Array.isArray(data.books)) {
            throw new Error('Formato inválido');
        }

        if (!auth.currentUser) {
            throw new Error('Usuário não autenticado');
        }

        const userRef = db.collection('library_data').doc(auth.currentUser.uid).collection('books');

        if (replace) {
            const existing = await userRef.get();
            const batch = db.batch();
            existing.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }

        const importBatch = db.batch();
        data.books.forEach(book => {
            const id = book.id || this.generateId();
            const ref = userRef.doc(id);
            importBatch.set(ref, { ...book, id });
        });
        await importBatch.commit();

        return data.books.length;
    }
}

const rm = new ReadingManager();

const StorageService = {
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


const App = {
    state: {
        filter: 'all',
        yearFilter: 'all',
        books: [],
        searchResults: [],
        sortBy: 'recent',
        currentPage: 1,
        itemsPerPage: 30,
        searchQuery: ''
    },

    init() {
        this.cacheDOM();

        this.bindEvents();

        this.bindMobileEvents();
        this.initDatePicker();
        this.initStats();
        this.refresh();
    },

    initDatePicker() {
        if (typeof flatpickr !== 'undefined') {
            const config = {
                locale: 'pt',
                dateFormat: 'Y-m-d',
                altInput: true,
                altFormat: 'd/m/Y',
                disableMobile: true,
                theme: 'dark',
                allowInput: true,
                appendTo: document.getElementById('bookModal'),
                onReady: function (selectedDates, dateStr, instance) {
                    const input = instance.altInput;
                    input.setAttribute('inputmode', 'numeric');
                    input.addEventListener('input', (e) => {
                        let v = e.target.value.replace(/\D/g, '');
                        if (v.length > 8) v = v.substring(0, 8);
                        if (v.length > 4) {
                            e.target.value = `${v.substring(0, 2)}/${v.substring(2, 4)}/${v.substring(4)}`;
                        } else if (v.length > 2) {
                            e.target.value = `${v.substring(0, 2)}/${v.substring(2)}`;
                        } else {
                            e.target.value = v;
                        }
                    });
                }
            };
            this.datePicker = flatpickr("#bookReadDate", config);
        }
    },

    cacheDOM() {
        this.dom = {
            grid: document.getElementById('booksGrid'),
            sidebarLinks: document.querySelectorAll('.nav-item[data-filter]'),
            counts: {
                all: document.getElementById('count-all'),
                read: document.getElementById('count-read'),
                reading: document.getElementById('count-reading'),
                want: document.getElementById('count-want'),
                rereading: document.getElementById('count-rereading'),
                abandoned: document.getElementById('count-abandoned'),
                favorite: document.getElementById('count-favorite'),
                desired: document.getElementById('count-desired'),
                borrowed: document.getElementById('count-borrowed'),
                physical: document.getElementById('count-physical'),
                owned: document.getElementById('count-owned'),
                lent: document.getElementById('count-lent'),
                target: document.getElementById('count-target'),
                ebook: document.getElementById('count-ebook'),
                audiobook: document.getElementById('count-audiobook'),
            },
            totalPagesRead: document.getElementById('total-pages-read'),
            resultsCount: document.getElementById('resultsCount'),
            currentSectionLabel: document.getElementById('currentSectionLabel'),
            yearContainer: document.querySelector('.year-filters'),

            addBtn: document.getElementById('btnAddBook'),
            modal: document.getElementById('bookModal'),
            closeModalBtn: document.getElementById('closeBookModal'),
            cancelModalBtn: document.getElementById('cancelBook'),
            bookForm: document.getElementById('bookForm'),
            groupReadDate: document.getElementById('groupReadDate'),

            statusTrigger: document.getElementById('statusTrigger'),
            statusOptions: document.getElementById('statusOptions'),
            statusHiddenInput: document.getElementById('bookStatus'),
            triggerText: document.getElementById('triggerText'),
            triggerIndicator: document.getElementById('triggerIndicator'),
            customOptions: document.querySelectorAll('.custom-option'),

            apiSearch: document.getElementById('apiSearch'),
            apiResults: document.getElementById('apiResults'),
            searchRow: document.querySelector('.search-row'),
            formDivider: document.querySelector('.form-divider'),
            searchLoader: document.getElementById('searchLoader'),

            btnSort: document.getElementById('btnSort'),
            sortDropdown: document.getElementById('sortDropdown'),
            sortOptions: document.querySelectorAll('.dropdown-item[data-sort]'),

            historyModal: document.getElementById('historyModal'),
            closeHistoryModalBtn: document.getElementById('closeHistoryModal'),
            historyForm: document.getElementById('historyForm'),
            historyList: document.getElementById('historyList'),
            historyProgressBar: document.getElementById('historyProgressBar'),
            historyProgressText: document.getElementById('historyProgressText'),
            btnOpenHistoryFromModal: document.getElementById('btnOpenHistoryFromModal'),

            deleteModal: document.getElementById('deleteModal'),
            closeDeleteModalBtn: document.getElementById('closeDeleteModal'),
            cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
            confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
            deleteModalMessage: document.getElementById('deleteModalMessage'),

            messageModal: document.getElementById('messageModal'),
            messageOkBtn: document.getElementById('messageOkBtn'),
            messageTitle: document.getElementById('messageTitle'),
            messageText: document.getElementById('messageText'),
            messageIcon: document.getElementById('messageIcon'),

            paginationControls: document.getElementById('paginationControls'),
            btnPrevPage: document.getElementById('btnPrevPage'),
            btnNextPage: document.getElementById('btnNextPage'),
            pageInfo: document.getElementById('pageInfo'),

            bookSearch: document.getElementById('bookSearch'),

            btnMenu: document.getElementById('btnMenu'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),

            btnLogin: document.getElementById('btnLogin'),
            userInfo: document.getElementById('userInfo'),
            userAvatar: document.getElementById('userAvatar'),
            userDropdown: document.getElementById('userDropdown'),
            userName: document.getElementById('userName'),
            userEmail: document.getElementById('userEmail'),
            btnExportMenu: document.getElementById('btnExportMenu'),
            btnImportMenu: document.getElementById('btnImportMenu'),
            btnLogout: document.getElementById('btnLogout'),
            fileInput: document.getElementById('fileInput'),

            loginOverlay: document.getElementById('loginOverlay'),
            authLoading: document.getElementById('authLoading'),
            authContent: document.getElementById('authContent'),
            btnLoginOverlay: document.getElementById('btnLoginOverlay'),

            messageModal: document.getElementById('messageModal'),
            messageTitle: document.getElementById('messageTitle'),
            messageText: document.getElementById('messageText'),
            messageIcon: document.getElementById('messageIcon'),
            messageOkBtn: document.getElementById('messageOkBtn')
        };
    },

    deleteCallback: null,



    bindEvents() {
        this.dom.sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const filter = e.currentTarget.dataset.filter;
                this.setFilter(filter);

                this.dom.sidebarLinks.forEach(l => l.classList.remove('active'));
                e.currentTarget.classList.add('active');

                if (window.innerWidth <= 768) {
                    this.dom.sidebar.classList.remove('active');
                    this.dom.sidebarOverlay.classList.remove('active');
                }
            });
        });

        const toggleGoalInput = () => {
            const targetCheckbox = document.querySelector('input[name="tags"][value="target"]');
            const groupGoalYear = document.getElementById('groupGoalYear');
            if (targetCheckbox && groupGoalYear) {
                groupGoalYear.style.display = targetCheckbox.checked ? 'flex' : 'none';
            }
        };

        document.querySelectorAll('input[name="tags"]').forEach(cb => {
            cb.addEventListener('change', toggleGoalInput);
        });



        this.dom.yearContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.chip');
            if (!chip) return;

            this.dom.yearContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            this.state.yearFilter = chip.dataset.year;
            this.render();
        });

        this.dom.addBtn.addEventListener('click', () => {
            this.dom.bookForm.reset();
            const groupGoalYear = document.getElementById('groupGoalYear');
            if (groupGoalYear) groupGoalYear.style.display = 'none';

            document.getElementById('bookId').value = '';

            this.dom.statusHiddenInput.value = 'want-to-read';
            this.dom.triggerText.textContent = 'Quero Ler';
            this.dom.triggerIndicator.className = 'status-indicator status-want';
            this.dom.customOptions.forEach(op => op.classList.remove('selected'));
            const defaultOp = Array.from(this.dom.customOptions).find(op => op.dataset.value === 'want-to-read');
            if (defaultOp) defaultOp.classList.add('selected');

            if (this.dom.groupReadDate) this.dom.groupReadDate.style.display = 'none';
            if (this.datePicker) this.datePicker.clear();

            const groupRating = document.getElementById('groupRating');
            if (groupRating) groupRating.style.display = 'none';
            document.getElementById('bookRating').value = 0;
            if (this.updateStarRatingWidget) this.updateStarRatingWidget(0);

            document.getElementById('modalTitle').textContent = 'Adicionar Livro';

            if (this.dom.btnOpenHistoryFromModal) {
                this.dom.btnOpenHistoryFromModal.style.display = 'none';
            }

            if (this.dom.searchRow) this.dom.searchRow.style.display = 'flex';
            if (this.dom.formDivider) this.dom.formDivider.style.display = 'flex';

            this.openModal();
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.sort-dropdown-container')) {
                this.dom.sortDropdown.classList.remove('show');
            }
        });

        this.dom.btnSort.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dom.sortDropdown.classList.toggle('show');
        });

        this.dom.sortOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                const sortType = e.currentTarget.dataset.sort;
                this.setSort(sortType);

                this.dom.sortOptions.forEach(opt => opt.classList.remove('active'));
                e.currentTarget.classList.add('active');

                this.dom.sortDropdown.classList.remove('show');
            });
        });



        this.dom.statusTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dom.statusOptions.classList.toggle('open');
            this.dom.statusTrigger.parentElement.classList.toggle('active');
        });

        this.dom.customOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = option.dataset.value;
                const label = option.dataset.label;
                const statusClass = option.dataset.class;

                this.dom.statusHiddenInput.value = value;

                if (this.dom.groupReadDate) {
                    this.dom.groupReadDate.style.display = (value === 'read') ? '' : 'none';
                    if (value === 'read' && this.datePicker && !this.datePicker.input.value) {
                        this.datePicker.setDate(new Date());
                    }
                }

                const groupRating = document.getElementById('groupRating');
                if (groupRating) {
                    groupRating.style.display = (value === 'read') ? '' : 'none';
                }

                this.dom.triggerText.textContent = label;
                this.dom.triggerIndicator.className = `status-indicator ${statusClass}`;

                this.dom.customOptions.forEach(op => op.classList.remove('selected'));
                option.classList.add('selected');

                this.dom.statusOptions.classList.remove('open');
                this.dom.statusTrigger.parentElement.classList.remove('active');
            });
        });

        const starWidget = document.getElementById('starRatingWidget');
        if (starWidget) {
            const stars = starWidget.querySelectorAll('.star-icon');
            const hiddenInput = document.getElementById('bookRating');
            const ratingDisplay = document.getElementById('ratingValueDisplay');

            const updateStars = (val) => {
                ratingDisplay.textContent = val.toFixed(1);
                stars.forEach(star => {
                    const index = parseInt(star.dataset.index);
                    star.classList.remove('filled', 'half-filled');
                    star.style.fill = 'transparent';

                    if (val >= index) {
                        star.classList.add('filled');
                    } else if (val >= index - 0.5) {
                        star.classList.add('half-filled');
                        if (!document.getElementById('halfGradient')) {
                            const svgNS = "http://www.w3.org/2000/svg";
                            const defsSvg = document.createElementNS(svgNS, "svg");
                            defsSvg.style.position = "absolute";
                            defsSvg.style.width = "0";
                            defsSvg.style.height = "0";
                            defsSvg.innerHTML = `<defs><linearGradient id="halfGradient"><stop offset="50%" stop-color="#f2511b"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs>`;
                            document.body.appendChild(defsSvg);
                        }
                        star.style.fill = 'url(#halfGradient)';
                    }
                });
            };

            starWidget.addEventListener('mousemove', (e) => {
                const targetStar = e.target.closest('.star-icon');
                if (!targetStar) return;

                const starRect = targetStar.getBoundingClientRect();
                const starIndex = parseInt(targetStar.dataset.index);
                const offsetX = e.clientX - starRect.left;

                if (starIndex === 1 && offsetX < (starRect.width * 0.3)) {
                    updateStars(0);
                    return;
                }

                const isLeftHalf = offsetX < (starRect.width / 2);
                const currentVal = isLeftHalf ? starIndex - 0.5 : starIndex;
                updateStars(currentVal);
            });

            starWidget.addEventListener('mouseleave', () => {
                const savedVal = parseFloat(hiddenInput.value) || 0;
                updateStars(savedVal);
            });

            starWidget.addEventListener('click', (e) => {
                const targetStar = e.target.closest('.star-icon');
                if (!targetStar) return;
                const starRect = targetStar.getBoundingClientRect();
                const starIndex = parseInt(targetStar.dataset.index);
                const offsetX = e.clientX - starRect.left;

                if (starIndex === 1 && offsetX < (starRect.width * 0.3)) {
                    hiddenInput.value = 0;
                    updateStars(0);
                    return;
                }

                const isLeftHalf = offsetX < (starRect.width / 2);
                let val = isLeftHalf ? starIndex - 0.5 : starIndex;

                const currentVal = parseFloat(hiddenInput.value) || 0;
                if (currentVal === val) val = 0;

                hiddenInput.value = val;
                updateStars(val);
            });

            this.updateStarRatingWidget = updateStars;
        }

        this.dom.bookForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleBookSubmit();
        });

        this.dom.historyForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const bookId = document.getElementById('historyBookId').value;
            const inputVal = document.getElementById('newCurrentPage').value;
            const isPercentage = document.getElementById('isPercentage').checked;

            if (inputVal === '') {
                this.showMessage('Atenção', 'Por favor, informe a página ou porcentagem atual.', '⚠️');
                return;
            }

            let val = parseInt(inputVal);
            if (val === 0) {
                this.showMessage('Atenção', 'O valor não pode ser zero.', '⚠️');
                return;
            }

            const book = this.state.books.find(b => b.id === bookId);
            if (!book) return;

            let newPageCount = val;

            if (isPercentage) {
                newPageCount = Math.round((val / 100) * book.pages);
            }

            if (newPageCount === (book.readPages || 0)) {
                this.showMessage('Atenção', 'O progresso informado é igual ao atual.', '⚠️');
                return;
            }

            this.updateProgress(bookId, newPageCount);
        });

        document.getElementById('isPercentage').addEventListener('change', (e) => {
            const input = document.getElementById('newCurrentPage');
            const label = document.getElementById('lblHistoryInput');

            if (e.target.checked) {
                label.textContent = 'Porcentagem Concluída';
                input.placeholder = '0-100';
                input.max = 100;
            } else {
                label.textContent = 'Página Atual';
                input.placeholder = 'Número da página';
                input.removeAttribute('max');
            }
        });

        this.dom.grid.addEventListener('click', (e) => this.handleGridClick(e));

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.book-card')) {
                document.querySelectorAll('.options-menu.active').forEach(m => m.classList.remove('active'));
            }

            if (this.dom.statusOptions.classList.contains('open') && !e.target.closest('.custom-select-container')) {
                this.dom.statusOptions.classList.remove('open');
                this.dom.statusTrigger.parentElement.classList.remove('active');
            }

            if (this.dom.apiResults.classList.contains('active') && !e.target.closest('.api-search-group')) {
                this.dom.apiResults.classList.remove('active');
            }
        });

        this.setupModalCloseAttributes(this.dom.modal, () => this.closeModal());
        this.setupModalCloseAttributes(this.dom.historyModal, () => {
            this.dom.historyModal.classList.remove('active');
        });
        this.setupModalCloseAttributes(this.dom.deleteModal, () => this.closeDeleteModal());
        this.setupModalCloseAttributes(this.dom.messageModal, () => {
            this.dom.messageModal.classList.remove('active');
        });

        this.dom.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.dom.cancelModalBtn.addEventListener('click', () => this.closeModal());
        this.dom.closeHistoryModalBtn.addEventListener('click', () => {
            this.dom.historyModal.classList.remove('active');
        });

        if (this.dom.messageOkBtn) {
            this.dom.messageOkBtn.addEventListener('click', () => {
                this.dom.messageModal.classList.remove('active');
            });
        }

        if (this.dom.btnOpenHistoryFromModal) {
            this.dom.btnOpenHistoryFromModal.addEventListener('click', () => {
                const bookId = document.getElementById('bookId').value;
                if (bookId) {
                    this.openHistoryModal(bookId);
                }
            });
        }

        this.dom.closeDeleteModalBtn.addEventListener('click', () => this.closeDeleteModal());
        this.dom.cancelDeleteBtn.addEventListener('click', () => this.closeDeleteModal());

        this.dom.deleteModal.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        });

        this.dom.confirmDeleteBtn.addEventListener('click', () => {
            if (this.deleteCallback) {
                this.deleteCallback();
                this.closeDeleteModal();
            }
        });

        this.dom.messageOkBtn.addEventListener('click', () => {
            this.dom.messageModal.classList.remove('active');
        });

        this.dom.apiSearch.addEventListener('input', debounce((e) => {
            if (document.getElementById('bookId').value) return;
            this.handleAPISearch(e.target.value);
        }, 500));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModal = document.querySelector('.modal.active');
                if (activeModal) activeModal.classList.remove('active');
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
            }
        });

        this.dom.btnPrevPage.addEventListener('click', () => {
            if (this.state.currentPage > 1) {
                this.state.currentPage--;
                this.render();
            }
        });

        this.dom.btnNextPage.addEventListener('click', () => {
            this.state.currentPage++;
            this.render();
        });

        this.dom.bookSearch.addEventListener('input', debounce((e) => {
            this.state.searchQuery = e.target.value.trim();
            this.state.currentPage = 1;
            this.render();
        }, 300));

        this.dom.btnLogin.addEventListener('click', () => this.handleAuthClick());
        if (this.dom.btnLoginOverlay) {
            this.dom.btnLoginOverlay.addEventListener('click', () => this.handleAuthClick());
        }

        this.dom.userAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dom.userDropdown.classList.toggle('active');
        });

        this.dom.btnLogout.addEventListener('click', () => {
            if (this.dom.authLoading) this.dom.authLoading.style.display = 'flex';
            if (this.dom.authContent) this.dom.authContent.style.display = 'none';
            if (this.dom.loginOverlay) this.dom.loginOverlay.classList.remove('hidden');

            rm.clear();
            auth.signOut();
            this.dom.userDropdown.classList.remove('active');
            this.refresh();
        });

        this.dom.btnExportMenu.addEventListener('click', () => {
            const data = rm.export();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `minha-biblioteca-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.dom.userDropdown.classList.remove('active');
        });

        this.dom.btnImportMenu.addEventListener('click', () => {
            this.dom.fileInput.click();
            this.dom.userDropdown.classList.remove('active');
        });

        this.dom.fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);
                const count = await rm.import(data, true);
                this.showMessage('Sucesso!', `${count} livros importados com sucesso.`, '✅');
            } catch (err) {
                this.showMessage('Erro', 'Falha ao importar: ' + err.message, '❌');
            }
            e.target.value = '';
        });

        document.addEventListener('click', (e) => {
            if (!this.dom.userDropdown.contains(e.target) && !this.dom.userAvatar.contains(e.target)) {
                this.dom.userDropdown.classList.remove('active');
            }
        });

        auth.onAuthStateChanged(async (user) => {

            try {
                this.updateAuthUI(user);
            } catch (e) {
                console.error('Error updating UI:', e);
            }

            if (user) {
                await rm.initListener(user, () => {
                    this.refresh();
                });
            } else {
                rm.stopListener();
                rm.clear();
                this.refresh();
            }
        });
    },

    handleAuthClick() {
        const loading = document.getElementById('authLoading');
        const content = document.getElementById('authContent');

        if (loading) loading.style.display = 'flex';
        if (content) content.style.display = 'none';

        auth.signInWithPopup(googleProvider).catch((error) => {
            console.error('Erro no login:', error);
            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'flex';
            alert('Erro ao fazer login: ' + error.message);
        });
    },

    updateAuthUI(user) {
        const overlay = document.getElementById('loginOverlay');
        const loading = document.getElementById('authLoading');
        const content = document.getElementById('authContent');
        const userInfo = document.getElementById('userInfo');
        const btnLogin = document.getElementById('btnLogin');

        if (!overlay || !loading || !content) {
            console.error('CRITICAL: Auth elements not found in DOM');
            alert('Erro Crítico: Elementos de login não encontrados na página.');
            return;
        }

        if (user) {
            overlay.style.display = 'none';
            overlay.classList.add('hidden');

            if (btnLogin) btnLogin.style.display = 'none';
            if (userInfo) {
                userInfo.style.display = 'flex';
                const avatar = document.getElementById('userAvatar');
                const name = document.getElementById('userName');
                const email = document.getElementById('userEmail');

                if (avatar) avatar.src = user.photoURL || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(user.email));
                if (name) name.textContent = user.displayName || 'Leitor';
                if (email) email.textContent = user.email;
            }
        } else {
            overlay.style.display = 'flex';
            overlay.classList.remove('hidden');

            loading.style.display = 'none';
            content.style.display = 'flex';

            if (btnLogin) btnLogin.style.display = 'flex';
            if (userInfo) userInfo.style.display = 'none';
        }
    },

    bindMobileEvents() {
        if (this.dom.btnMenu) {
            this.dom.btnMenu.addEventListener('click', () => {
                this.dom.sidebar.classList.toggle('active');
                this.dom.sidebarOverlay.classList.toggle('active');
            });
        }

        if (this.dom.sidebarOverlay) {
            this.dom.sidebarOverlay.addEventListener('click', () => {
                this.dom.sidebar.classList.remove('active');
                this.dom.sidebarOverlay.classList.remove('active');
            });
        }

        const closeSidebar = () => {
            if (this.dom.sidebar.classList.contains('active')) {
                this.dom.sidebar.classList.remove('active');
                this.dom.sidebarOverlay.classList.remove('active');
            }
        };

        const navItems = this.dom.sidebar.querySelectorAll('.nav-item');
        navItems.forEach(item => item.addEventListener('click', closeSidebar));

        const paginometer = document.getElementById('paginometerCard');
        if (paginometer) {
            paginometer.addEventListener('click', closeSidebar);
        }

        const btnCloseSidebar = document.getElementById('btnCloseSidebar');
        if (btnCloseSidebar) {
            btnCloseSidebar.addEventListener('click', closeSidebar);
        }
    },

    setupModalCloseAttributes(modal, closeCallback) {
        let mousedownTarget = null;

        modal.addEventListener('mousedown', (e) => {
            mousedownTarget = e.target;
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal && mousedownTarget === modal) {
                closeCallback();
            }
            mousedownTarget = null;
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeCallback();
            }
        });
    },

    refresh() {
        this.state.books = rm.books;
        this.updateCounts();

        const activeStatuses = ['read', 'reading', 're-reading', 'rereading', 'abandoned'];
        const totalPagesRead = this.state.books.reduce((total, book) => {
            const isActiveStatus = activeStatuses.includes(book.status);

            if (!isActiveStatus) {
                return total;
            }

            const history = book.history || [];
            if (history.length === 0) {
                if (book.status === 'read') return total + (book.pages * (book.timesRead || 1));
                return total + (book.readPages || 0);
            }

            let bookTotal = 0;
            let currentCycleProgress = 0;
            const sortedHistory = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));

            sortedHistory.forEach(entry => {
                if (entry.type === 'finish') {
                    bookTotal += book.pages;
                    currentCycleProgress = 0;
                } else if (entry.type === 'start') {
                    currentCycleProgress = 0;
                } else {
                    currentCycleProgress = entry.page || 0;
                }
            });

            return total + bookTotal + currentCycleProgress;
        }, 0);

        if (this.dom.totalPagesRead) {
            this.dom.totalPagesRead.textContent = totalPagesRead.toLocaleString('pt-BR');
        }

        this.renderYearFilters();
        this.render();
    },

    setSort(sortType) {
        this.state.sortBy = sortType;
        this.render();
    },

    setSort(sortType) {
        this.state.sortBy = sortType;
        this.render();
    },

    setFilter(filter) {
        this.state.filter = filter;
        this.state.currentPage = 1;
        this.state.yearFilter = 'all';

        const labels = {
            'all': '📚 Minha Biblioteca',
            'read': '✅ Lidos',
            'reading': '📖 Lendo',
            'want-to-read': '🔖 Quero Ler',
            're-reading': '🔄 Relendo',
            'abandoned': '🚫 Abandonados',
            'favorite': '❤️ Favoritos',
            'desired': '✨ Desejados',
            'borrowed': '📘 Emprestados',
            'physical': '📚 Físicos',
            'owned': '📦 Tenho',
            'lent': '🤝 Emprestei',
            'target': '🎯 Meta',
            'ebook': '📱 E-book',
            'audiobook': '🎧 Audiobook'
        };

        const colors = {
            'all': '',
            'read': '#065f46',
            'reading': '#9a3412',
            'want-to-read': '#1e40af',
            're-reading': '#991b1b',
            'abandoned': '#334155',
            'favorite': '#9d174d',
            'desired': '#6b21a8',
            'borrowed': '#155e75',
            'physical': '#713f12',
            'owned': '#134e4a',
            'lent': '#3730a3',
            'target': '#3f6212',
            'ebook': '#075985',
            'audiobook': '#86198f'
        };

        const header = document.querySelector('.header');
        const h1 = header ? header.querySelector('h1') : null;

        if (header && h1) {
            if (filter === 'all') {
                h1.innerHTML = '📚 Minha Biblioteca <span id="currentSectionLabel"></span>';
                this.dom.currentSectionLabel = h1.querySelector('#currentSectionLabel');

                header.style.background = '';
                header.style.borderBottom = '';
                header.classList.remove('header-active-filter');
            } else {
                const color = colors[filter];
                if (color) {
                    const sidebarItem = document.querySelector(`.nav-item[data-filter="${filter}"]`);
                    let iconHtml = '';
                    let labelText = labels[filter] || filter;

                    if (sidebarItem) {
                        const iconEl = sidebarItem.querySelector('.nav-icon');
                        if (iconEl) iconHtml = iconEl.innerHTML;

                        const labelEl = sidebarItem.querySelector('.nav-label');
                        if (labelEl) labelText = labelEl.textContent;
                    }

                    header.style.background = color;
                    header.style.borderBottom = 'none';
                    header.classList.add('header-active-filter');

                    h1.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="display: flex; align-items: center; justify-content: center;">${iconHtml}</div>
                            <span>${labelText}</span>
                        </div>
                    `;
                }
            }
        }

        this.renderYearFilters();
        this.render();
    },

    getFilteredBooks() {
        let filtered = this.state.books;

        if (this.state.searchQuery) {
            const normalize = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const terms = normalize(this.state.searchQuery).split(/\s+/).filter(t => t);
            filtered = filtered.filter(book => {
                const titleNorm = normalize(book.title);
                const authorNorm = normalize(book.author);
                return terms.every(term =>
                    titleNorm.includes(term) || authorNorm.includes(term)
                );
            });
        }

        if (this.state.filter !== 'all') {
            filtered = filtered.filter(book => {
                return book.status === this.state.filter || (book.tags && book.tags.includes(this.state.filter));
            });
        }

        if (this.state.yearFilter !== 'all') {
            if (this.state.filter === 'target') {
                filtered = filtered.filter(book => book.goalYear && book.goalYear.toString() === this.state.yearFilter);
            } else {
                filtered = filtered.filter(book => book.year.toString() === this.state.yearFilter);
            }
        }

        return filtered;
    },

    renderYearFilters() {
        if (!this.dom.yearContainer) return;

        let html = '';

        if (this.state.filter === 'target') {
            const years = [...new Set(this.state.books
                .filter(book => book.goalYear && book.tags && book.tags.includes('target'))
                .map(book => book.goalYear)
            )].sort((a, b) => b - a);

            if (years.length > 0) {
                if (this.state.yearFilter === 'all' || !years.includes(parseInt(this.state.yearFilter))) {
                    this.state.yearFilter = years[0].toString();
                }

                years.forEach(year => {
                    html += `<button class="chip ${this.state.yearFilter === year.toString() ? 'active' : ''}" data-year="${year}">${year}</button>`;
                });
            } else {
                html += `<button class="chip active" disabled>Sem metas</button>`;
                this.state.yearFilter = 'none';
            }

        } else {
            const years = [...new Set(this.state.books.map(book => book.year))].sort((a, b) => b - a);

            html += `<button class="chip ${this.state.yearFilter === 'all' ? 'active' : ''}" data-year="all">Todos</button>`;
            years.forEach(year => {
                html += `<button class="chip ${this.state.yearFilter === year.toString() ? 'active' : ''}" data-year="${year}">${year}</button>`;
            });
        }

        this.dom.yearContainer.innerHTML = html;
    },

    render() {
        const filtered = this.getFilteredBooks();
        const sorted = this.sortBooks(filtered);

        this.dom.resultsCount.textContent = `${sorted.length} encontrados`;
        this.dom.grid.innerHTML = '';

        if (sorted.length === 0) {
            this.dom.grid.innerHTML = `
            <div class="empty-state">
                <p>Nenhum livro encontrado nesta categoria.</p>
            </div>
        `;
            this.dom.paginationControls.style.display = 'none';
            return;
        }

        const totalItems = sorted.length;
        const totalPages = Math.ceil(totalItems / this.state.itemsPerPage);

        if (this.state.currentPage > totalPages) this.state.currentPage = totalPages || 1;
        if (this.state.currentPage < 1) this.state.currentPage = 1;

        const start = (this.state.currentPage - 1) * this.state.itemsPerPage;
        const end = start + this.state.itemsPerPage;
        const pageBooks = sorted.slice(start, end);

        if (totalPages <= 1) {
            this.dom.paginationControls.style.display = 'none';
        } else {
            this.dom.paginationControls.style.display = 'flex';
            this.dom.pageInfo.textContent = `Página ${this.state.currentPage} de ${totalPages}`;
            this.dom.btnPrevPage.disabled = this.state.currentPage === 1;
            this.dom.btnNextPage.disabled = this.state.currentPage === totalPages;
        }

        pageBooks.forEach(book => {
            const card = document.createElement('div');
            card.className = `book-card status-${book.status}`;
            const isPlaceholder = !book.cover || book.cover.includes('placehold.co') || book.cover.includes('Sem+Capa');

            card.innerHTML = `
            <div class="book-cover-container skeleton ${isPlaceholder ? 'is-placeholder' : ''}">
                <img src="${book.cover}" alt="${book.title}" class="book-cover" style="${isPlaceholder ? 'display:none' : ''}" onload="this.parentElement.classList.remove('skeleton')" onerror="this.style.display='none'; this.nextElementSibling.classList.add('visible'); this.parentElement.classList.add('is-placeholder'); this.parentElement.classList.remove('skeleton')">
                
                <div class="book-cover-placeholder ${isPlaceholder ? 'visible' : ''}">
                    <div class="placeholder-title">${book.title}</div>
                    <div class="placeholder-author">${book.author}</div>
                </div>

                <!-- Bookmark Icon SVG -->
                <svg class="bookmark-icon" viewBox="0 0 24 32" fill="currentColor">
                    <path d="M0 0h24v32l-12-8-12 8z"/>
                </svg>
                <div class="title-overlay">${book.title}</div>
            </div>

            <!-- NEW: Moved outside container so it's not clipped -->
            <button class="btn-options" data-id="${book.id}" title="Opções">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="19" cy="12" r="1"></circle>
                    <circle cx="5" cy="12" r="1"></circle>
                </svg>
            </button>
            <div class="options-menu" id="menu-${book.id}">
                <ul>
                    <li><button class="menu-item edit-btn" data-id="${book.id}">✏️ Editar</button></li>
                    <li><button class="menu-item delete-btn" data-id="${book.id}">🗑️ Excluir</button></li>
                </ul>
            </div>
            
            <div class="book-footer">
                <div class="reading-progress">
                    ${this.calculateProgress(book)}%
                </div>
                <div class="book-rating">
                    <span>★</span> ${book.rating > 0 ? book.rating.toFixed(1) : '-'}
                </div>
            </div>
        `;

            if (['reading', 'rereading', 're-reading'].includes(book.status)) {
                const menuList = card.querySelector('.options-menu ul');
                const updateItem = document.createElement('li');
                updateItem.innerHTML = `
                <button class="menu-item" onclick="App.openHistoryModal('${book.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    Atualizar Progresso
                </button>
            `;
                if (menuList) {
                    menuList.insertBefore(updateItem, menuList.firstChild);
                }
            }
            this.dom.grid.appendChild(card);
        });
    },

    sortBooks(books) {
        return [...books].sort((a, b) => {
            switch (this.state.sortBy) {
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'author':
                    return a.author.localeCompare(b.author);
                case 'rating':
                    return b.rating - a.rating;
                case 'read-date':
                    return new Date(b.readDate || 0) - new Date(a.readDate || 0);
                case 'recent':
                default:
                    return new Date(b.createdAt) - new Date(a.createdAt);
            }
        });
    },

    toggleMenu(id) {
        document.querySelectorAll('.options-menu.active').forEach(m => {
            if (m.id !== `menu-${id}`) m.classList.remove('active');
        });
        const menu = document.getElementById(`menu-${id}`);
        if (menu) menu.classList.toggle('active');
    },

    handleGridClick(e) {
        const target = e.target;

        const btnOptions = target.closest('.btn-options');
        if (btnOptions) {
            e.stopPropagation();
            this.toggleMenu(btnOptions.dataset.id);
            return;
        }

        const btnEdit = target.closest('.edit-btn');
        if (btnEdit) {
            e.stopPropagation();
            this.editBook(btnEdit.dataset.id);
            const menu = btnEdit.closest('.options-menu');
            if (menu) menu.classList.remove('active');
            return;
        }

        const btnDelete = target.closest('.delete-btn');
        if (btnDelete) {
            e.stopPropagation();
            this.openDeleteModal('Tem certeza que deseja excluir este livro?', () => {
                rm.delete(btnDelete.dataset.id);
                this.refresh();
            });
            return;
        }

        document.querySelectorAll('.options-menu.active').forEach(m => m.classList.remove('active'));
    },

    calculateProgress(book) {
        if (book.status === 'read') return 100;
        if (book.pages === 0) return 0;
        return Math.round((book.readPages / book.pages) * 100);
    },

    updateCounts() {
        const books = this.state.books;

        const count = (fn) => books.filter(fn).length;

        this.dom.counts.all.textContent = books.length;
        this.dom.counts.read.textContent = count(b => b.status === 'read');
        this.dom.counts.reading.textContent = count(b => b.status === 'reading');
        this.dom.counts.want.textContent = count(b => b.status === 'want-to-read');
        this.dom.counts.rereading.textContent = count(b => b.status === 're-reading');
        this.dom.counts.abandoned.textContent = count(b => b.status === 'abandoned');

        this.dom.counts.favorite.textContent = count(b => b.tags && b.tags.includes('favorite'));
        this.dom.counts.desired.textContent = count(b => b.tags && b.tags.includes('desired'));
        this.dom.counts.borrowed.textContent = count(b => b.tags && b.tags.includes('borrowed'));
        this.dom.counts.physical.textContent = count(b => b.tags && b.tags.includes('physical'));
        this.dom.counts.owned.textContent = count(b => b.tags && b.tags.includes('owned'));
        this.dom.counts.lent.textContent = count(b => b.tags && b.tags.includes('lent'));
        this.dom.counts.target.textContent = count(b => b.tags && b.tags.includes('target'));
        this.dom.counts.ebook.textContent = count(b => b.tags && b.tags.includes('ebook'));
        this.dom.counts.audiobook.textContent = count(b => b.tags && b.tags.includes('audiobook'));
    },

    openModal() {
        this.dom.modal.classList.add('active');
    },

    closeModal() {
        this.dom.modal.classList.remove('active');
        this.dom.bookForm.reset();
        this.dom.apiResults.classList.remove('active');
        this.dom.apiResults.innerHTML = '';
        this.dom.apiSearch.value = '';
        document.getElementById('modalTitle').textContent = 'Adicionar Livro';
        document.getElementById('bookId').value = '';

        if (this.dom.searchRow) this.dom.searchRow.style.display = 'flex';
        if (this.dom.formDivider) this.dom.formDivider.style.display = 'flex';

        setTimeout(() => {
            const defaultOption = this.dom.customOptions[0];
            if (defaultOption) defaultOption.click();
        }, 100);
    },

    async handleAPISearch(query) {
        if (!query || query.length < 3) {
            this.dom.apiResults.classList.remove('active');
            return;
        }

        this.dom.searchLoader.style.display = 'block';

        try {
            const [googleResults, olResults] = await Promise.allSettled([
                GoogleBooksAPI.search(query),
                OpenLibraryAPI.search(query)
            ]);

            const gBooks = googleResults.status === 'fulfilled' ? googleResults.value : [];
            const olBooks = olResults.status === 'fulfilled' ? olResults.value : [];

            const combined = [...gBooks];

            const getYear = (dateStr) => dateStr ? dateStr.substring(0, 4) : '0000';

            const existingSignatures = new Set(
                gBooks.map(b => {
                    const t = b.volumeInfo.title.toLowerCase().trim();
                    const a = (b.volumeInfo.authors[0] || '').toLowerCase().trim();
                    const y = getYear(b.volumeInfo.publishedDate);
                    return `${t}|${a}|${y}`;
                })
            );

            olBooks.forEach(book => {
                const t = book.volumeInfo.title.toLowerCase().trim();
                const a = (book.volumeInfo.authors[0] || '').toLowerCase().trim();
                const y = getYear(book.volumeInfo.publishedDate);
                const sig = `${t}|${a}|${y}`;

                if (!existingSignatures.has(sig)) {
                    combined.push(book);
                }
            });

            this.state.searchResults = combined;
            this.displayAPIResults(combined);

        } catch (error) {
            console.error('Search Error:', error);
            this.state.searchResults = [];
            this.displayAPIResults([]);
        } finally {
            this.dom.searchLoader.style.display = 'none';
        }
    },

    displayAPIResults(books) {
        if (books.length === 0) {
            this.dom.apiResults.innerHTML = '<div style="padding: 10px; color: var(--text-muted); font-size: 0.85rem;">Nenhum livro encontrado.</div>';
            this.dom.apiResults.classList.add('active');
            return;
        }

        let html = '';
        books.forEach(book => {
            const info = book.volumeInfo;
            const cover = info.imageLinks ? info.imageLinks.thumbnail : 'https://placehold.co/45x65?text=Capa';
            const title = info.title;
            const author = info.authors ? info.authors.join(', ') : 'Autor desconhecido';

            html += `
                <div class="api-result-item" onclick="App.selectBookFromAPI('${book.id}')">
                    <div class="api-result-cover-container ${!info.imageLinks ? 'is-placeholder' : ''}">
                         <img src="${cover}" class="api-result-cover" alt="${title}" 
                              style="${!info.imageLinks ? 'display:none' : ''}" 
                              onerror="this.style.display='none'; this.nextElementSibling.classList.add('visible'); this.parentElement.classList.add('is-placeholder');">
                         <div class="book-cover-placeholder ${!info.imageLinks ? 'visible' : ''}">
                            <div class="placeholder-title">${title}</div>
                            <div class="placeholder-author">${author}</div>
                         </div>
                    </div>
                    <div class="api-result-info">
                        <div class="api-result-title">${title}</div>
                        <div class="api-result-author">${author}</div>
                    </div>
                </div>
            `;
        });

        this.dom.apiResults.innerHTML = html;
        this.dom.apiResults.classList.add('active');
    },

    async selectBookFromAPI(bookId) {
        const cachedBook = this.state.searchResults.find(b => b.id === bookId);

        if (cachedBook) {
            this.populateFormWithBook(cachedBook.volumeInfo);
            this.dom.apiResults.classList.remove('active');
            this.dom.apiSearch.value = '';
            document.getElementById('bookTitle').focus();
            return;
        }

        try {
            if (bookId.startsWith('ol:')) {
                return;
            }

            const response = await fetch(`https://www.googleapis.com/books/v1/volumes/${bookId}`);
            const data = await response.json();
            this.populateFormWithBook(data.volumeInfo);

            this.dom.apiResults.classList.remove('active');
            this.dom.apiSearch.value = '';
            document.getElementById('bookTitle').focus();
        } catch (error) {
            console.error('Error selecting book:', error);
        }
    },

    populateFormWithBook(info) {
        document.getElementById('bookTitle').value = info.title || '';
        document.getElementById('bookAuthor').value = info.authors ? info.authors[0] : '';
        document.getElementById('bookPages').value = info.pageCount || '';

        let coverUrl = '';
        if (info.imageLinks) {
            coverUrl = info.imageLinks.thumbnail || info.imageLinks.smallThumbnail;
            if (coverUrl) coverUrl = coverUrl.replace('http:', 'https:');
        }
        document.getElementById('bookCover').value = coverUrl;
    },

    editBook(id) {
        const book = this.state.books.find(b => b.id === id);
        if (!book) return;

        if (!book) return;

        document.getElementById('modalTitle').textContent = 'Editar Livro';

        if (this.dom.searchRow) this.dom.searchRow.style.display = 'none';
        if (this.dom.formDivider) this.dom.formDivider.style.display = 'none';

        document.getElementById('bookId').value = book.id;
        document.getElementById('bookTitle').value = book.title;
        document.getElementById('bookAuthor').value = book.author;
        document.getElementById('bookPages').value = book.pages;
        document.getElementById('bookCover').value = book.cover;

        if (this.datePicker) {
            this.datePicker.setDate(book.readDate || null);
        }

        this.dom.statusHiddenInput.value = book.status;

        if (this.dom.groupReadDate) {
            this.dom.groupReadDate.style.display = (book.status === 'read') ? '' : 'none';
        }

        const groupRating = document.getElementById('groupRating');
        if (groupRating) {
            groupRating.style.display = (book.status === 'read') ? '' : 'none';
            const ratingInput = document.getElementById('bookRating');
            if (ratingInput) ratingInput.value = book.rating || 0;
            if (this.updateStarRatingWidget) {
                this.updateStarRatingWidget(book.rating || 0);
            }
        }

        const matchingOption = Array.from(this.dom.customOptions).find(op => op.dataset.value === book.status);
        if (matchingOption) {
            this.dom.triggerText.textContent = matchingOption.dataset.label;
            this.dom.triggerIndicator.className = `status-indicator ${matchingOption.dataset.class}`;

            this.dom.customOptions.forEach(op => op.classList.remove('selected'));
            matchingOption.classList.add('selected');
        }

        document.querySelectorAll('input[name="tags"]').forEach(checkbox => {
            checkbox.checked = book.tags.includes(checkbox.value);
        });

        document.getElementById('modalTitle').textContent = 'Editar Livro';

        document.getElementById('bookGoalYear').value = book.goalYear || '';
        const targetCheckbox = document.querySelector('input[name="tags"][value="target"]');
        const groupGoalYear = document.getElementById('groupGoalYear');
        if (targetCheckbox && groupGoalYear) {
            groupGoalYear.style.display = targetCheckbox.checked ? 'flex' : 'none';
        }

        if (this.dom.btnOpenHistoryFromModal) {
            this.dom.btnOpenHistoryFromModal.style.display = 'flex';
        }

        this.openModal();
    },

    handleBookSubmit() {
        const id = document.getElementById('bookId').value;
        const readDateVal = document.getElementById('bookReadDate').value;

        const formData = {
            title: document.getElementById('bookTitle').value.trim(),
            author: document.getElementById('bookAuthor').value.trim(),
            pages: document.getElementById('bookPages').value,
            status: document.getElementById('bookStatus').value,
            cover: document.getElementById('bookCover').value,
            readDate: readDateVal || null,
            rating: document.getElementById('bookRating').value || 0,
            goalYear: document.getElementById('bookGoalYear').value || null,
            tags: []
        };

        document.querySelectorAll('input[name="tags"]:checked').forEach(checkbox => {
            formData.tags.push(checkbox.value);
        });

        if (id) {
            const existingBook = this.state.books.find(b => b.id === id);
            if (existingBook) {
                const newStatus = formData.status;
                const oldStatus = existingBook.status;

                const isRereading = newStatus === 'rereading' || newStatus === 're-reading';
                const wasRereading = oldStatus === 'rereading' || oldStatus === 're-reading';

                let newReadPages = existingBook.readPages || 0;
                let newTimesRead = existingBook.timesRead || 0;
                let history = existingBook.history || [];

                if (newStatus === 'read' && oldStatus !== 'read') {
                    newReadPages = parseInt(formData.pages) || 0;
                    history.push({
                        date: new Date().toISOString(),
                        page: newReadPages,
                        type: 'finish'
                    });
                } else if ((newStatus === 'reading' || isRereading) && oldStatus === 'read') {
                    newReadPages = 0;
                    history.push({
                        date: new Date().toISOString(),
                        page: 0,
                        type: 'start'
                    });
                } else if (isRereading && !wasRereading && oldStatus !== 'read') {
                    newReadPages = 0;
                    history.push({
                        date: new Date().toISOString(),
                        page: 0,
                        type: 'start'
                    });
                } else if (newStatus === 'want-to-read') {
                    newReadPages = 0;
                }

                const updatedBook = {
                    ...existingBook,
                    ...formData,
                    pages: parseInt(formData.pages) || 0,
                    readPages: newReadPages,
                    timesRead: newTimesRead,
                    history: history,
                    rating: parseFloat(formData.rating) || 0,
                    rating: parseFloat(formData.rating) || 0,
                    year: formData.readDate ? parseInt(formData.readDate.split('-')[0]) : existingBook.year,
                    rating: parseFloat(formData.rating) || 0,
                    year: formData.readDate ? parseInt(formData.readDate.split('-')[0]) : existingBook.year,
                    goalYear: formData.tags.includes('target') ? (formData.goalYear ? parseInt(formData.goalYear) : new Date().getFullYear()) : null
                };
                rm.update(updatedBook.id, updatedBook);
            }
        } else {
            const titleLower = formData.title.toLowerCase().trim();
            const authorLower = formData.author.toLowerCase().trim();
            const duplicate = this.state.books.find(b =>
                b.title.toLowerCase().trim() === titleLower &&
                b.author.toLowerCase().trim() === authorLower
            );

            if (duplicate) {
                this.showMessage('Livro já existe', `"${formData.title}" de ${formData.author} já está na sua lista.`, '⚠️');
                return;
            }

            const newBookData = {
                ...formData,
                rating: parseFloat(formData.rating) || 0,
                ...formData,
                rating: parseFloat(formData.rating) || 0,
                year: formData.readDate ? parseInt(formData.readDate.split('-')[0]) : new Date().getFullYear(),
                rating: parseFloat(formData.rating) || 0,
                year: formData.readDate ? parseInt(formData.readDate.split('-')[0]) : new Date().getFullYear(),
                goalYear: formData.tags.includes('target') ? (formData.goalYear ? parseInt(formData.goalYear) : new Date().getFullYear()) : null
            };
            const newBook = BookModel.create(newBookData);
            rm.add(newBook);
        }

        this.refresh();
        this.closeModal();
    },

    openHistoryModal(bookId) {
        const book = this.state.books.find(b => b.id === bookId);
        if (!book) return;

        document.getElementById('historyBookId').value = book.id;
        document.getElementById('historyBookTitle').textContent = book.title;
        document.getElementById('historyTotalPages').value = book.pages;
        document.getElementById('newCurrentPage').value = '';

        const isPercentage = document.getElementById('isPercentage');
        isPercentage.checked = false;
        document.getElementById('lblHistoryInput').textContent = 'Página Atual';
        document.getElementById('newCurrentPage').placeholder = 'Número da página';
        document.getElementById('newCurrentPage').removeAttribute('max');

        const percent = Math.round(((book.readPages || 0) / book.pages) * 100);
        this.dom.historyProgressText.textContent = `${percent}%`;
        this.dom.historyProgressBar.style.width = `${percent}%`;

        const isActiveReading = book.status === 'reading' || book.status === 're-reading';
        const pageInput = document.getElementById('newCurrentPage');
        const percentCheckbox = document.getElementById('isPercentage');
        const submitBtn = this.dom.historyForm.querySelector('button[type="submit"]');

        pageInput.disabled = !isActiveReading;
        percentCheckbox.disabled = !isActiveReading;
        if (submitBtn) {
            submitBtn.disabled = !isActiveReading;
            submitBtn.style.opacity = isActiveReading ? '1' : '0.5';
            submitBtn.style.cursor = isActiveReading ? 'pointer' : 'not-allowed';
        }

        this.renderHistoryList(book);

        this.toggleMenu(bookId);
        this.dom.historyModal.classList.add('active');
    },

    renderHistoryList(book) {
        if (!book.history || book.history.length === 0) {
            this.dom.historyList.innerHTML = '<p class="empty-msg">Nenhum registro ainda.</p>';
            return;
        }

        const sortedHistory = [...book.history].sort((a, b) => new Date(b.date) - new Date(a.date));

        this.dom.historyList.innerHTML = sortedHistory.map(entry => {
            const date = new Date(entry.date).toLocaleDateString();
            let label = `Pág. ${entry.page}`;
            let icon = '📖';

            if (entry.type === 'finish') {
                label = 'Finalizado';
                icon = '🏆';
            } else if (entry.type === 'start') {
                label = 'Iniciado';
                icon = '🚀';
            }

            return `
                <div class="history-item ${entry.type || 'progress'}">
                    <div class="history-info">
                        <span class="history-icon">${icon}</span>
                        <div class="history-details">
                            <span class="history-date">${date}</span>
                            <span class="history-val">${label}</span>
                        </div>
                    </div>
                    <div class="history-actions">
                        <div class="action-buttons">
                            <button type="button" class="action-btn delete" onclick="App.deleteHistoryItem('${book.id}', '${entry.date}')" title="Excluir">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    deleteHistoryItem(bookId, dateStr) {
        const book = this.state.books.find(b => b.id === bookId);
        if (!book) return;

        const entryToDelete = book.history.find(h => h.date === dateStr);
        if (entryToDelete && entryToDelete.type === 'start') {
            const hasFutureEntries = book.history.some(h => new Date(h.date) > new Date(dateStr));
            if (hasFutureEntries) {
                this.showMessage('Atenção', 'Não é possível excluir o início da leitura enquanto houver progresso registrado depois dele.', '⚠️');
                return;
            }
        }

        this.openDeleteModal('Tem certeza que deseja excluir esse registro?', () => {
            book.history = book.history.filter(h => h.date !== dateStr);

            if (book.history.length > 0) {
                const latest = book.history.filter(h => !h.type || h.type === 'progress' || h.type === 'finish').reduce((prev, current) => {
                    return (new Date(prev.date) > new Date(current.date)) ? prev : current;
                }, book.history[0]);
                book.readPages = latest.type === 'finish' ? book.pages : (latest.page || 0);
            } else {
                book.readPages = 0;
            }

            rm.update(book.id, book);
            this.refresh();

            const percent = Math.round((book.readPages / book.pages) * 100);
            this.dom.historyProgressText.textContent = `${percent}%`;
            this.dom.historyProgressBar.style.width = `${percent}%`;
            document.getElementById('newCurrentPage').value = book.readPages;

            this.renderHistoryList(book);
        });
    },

    updateProgress(bookId, newPage) {
        const book = this.state.books.find(b => b.id === bookId);
        if (!book) return;

        if (newPage > book.pages) newPage = book.pages;
        if (newPage < 0) newPage = 0;

        let wasFinished = false;
        let entryType = 'progress';

        if (newPage === book.pages) {
            book.status = 'read';
            wasFinished = true;
            entryType = 'finish';
            if (!book.readDate) {
                book.readDate = new Date().toISOString().split('T')[0];
            }
        }

        book.readPages = newPage;

        if (!book.history) book.history = [];
        book.history.push({
            date: new Date().toISOString(),
            page: newPage,
            type: entryType
        });

        rm.update(book.id, book);
        this.refresh();
        this.dom.historyModal.classList.remove('active');

        if (wasFinished) {
            this.showMessage('Parabéns!', 'Você concluiu este livro!');
        }
    },

    openDeleteModal(message, callback) {
        this.dom.deleteModalMessage.textContent = message;
        this.deleteCallback = callback;
        this.dom.deleteModal.classList.add('active');
    },

    closeDeleteModal() {
        this.dom.deleteModal.classList.remove('active');
        this.deleteCallback = null;
    },

    showMessage(title, text, icon = '🎉') {
        this.dom.messageTitle.textContent = title;
        this.dom.messageText.textContent = text;
        this.dom.messageIcon.textContent = icon;
        this.dom.messageModal.classList.add('active');
    },

    initStats() {
        const paginometer = document.getElementById('paginometerCard');
        if (paginometer) {
            paginometer.addEventListener('click', () => this.openStatsModal());
        }
    },


    setStatsYear(year) {
        if (!this.statsState) return;
        this.statsState.selectedYear = year;
        this.renderStatsDashboard();
    },

    closeStatsModal() {
        const modal = document.getElementById('statsModal');
        if (modal) modal.classList.remove('active');
    },

    openStatsModal() {
        const modal = document.getElementById('statsModal');
        const container = document.getElementById('statsContent');
        if (!modal || !container) return;

        const createStatObj = () => ({
            books: [], booksCount: 0,
            pages: 0,
            ratingSum: 0, ratedCount: 0,
            monthlyDist: new Array(12).fill(0),
            longestBook: null,
            shortestBook: null,
            authors: {}
        });

        const statsData = {
            years: {},
            all: createStatObj()
        };

        this.state.books.forEach(book => {
            const isRead = book.status === 'read';
            const timesRead = book.timesRead || 0;
            const hasProgress = (book.readPages && book.readPages > 0) || timesRead > 0;

            if (book.status === 'want-to-read' && !hasProgress) return;

            let year = 'Desconhecido';
            let month = -1;

            if (book.readDate) {
                const parts = book.readDate.split('-');
                if (parts.length === 3) {
                    year = parseInt(parts[0]);
                    month = parseInt(parts[1]) - 1;
                } else {
                    const d = new Date(book.readDate);
                    year = d.getFullYear();
                    month = d.getMonth();
                }
            }

            if (!statsData.years[year]) statsData.years[year] = createStatObj();

            const updateStats = (target, b) => {
                target.books.push(b);

                if (b.status === 'read') {
                    target.booksCount++;
                }

                const p = parseInt(b.pages) || 0;

                let effortPages = 0;
                const history = b.history || [];

                if (history.length > 0) {
                    let currentCycleProgress = 0;
                    const sortedHistory = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));

                    sortedHistory.forEach(entry => {
                        if (entry.type === 'finish') {
                            effortPages += p;
                            currentCycleProgress = 0;
                        } else if (entry.type === 'start') {
                            currentCycleProgress = 0;
                        } else {
                            currentCycleProgress = entry.page || 0;
                        }
                    });
                    effortPages += currentCycleProgress;
                } else {
                    if (b.status === 'read') {
                        effortPages = p * (b.timesRead || 1);
                    } else {
                        effortPages = (b.readPages || 0);
                        if (b.timesRead > 0) {
                            effortPages += (p * b.timesRead);
                        }
                    }
                }

                target.pages += effortPages;

                if (b.rating > 0) {
                    target.ratingSum += parseFloat(b.rating);
                    target.ratedCount++;
                }

                if (month >= 0) target.monthlyDist[month]++;

                if (p > 0) {
                    if (!target.longestBook || p > parseInt(target.longestBook.pages)) target.longestBook = b;
                    if (!target.shortestBook || p < parseInt(target.shortestBook.pages)) target.shortestBook = b;
                }

                if (b.author) {
                    target.authors[b.author] = (target.authors[b.author] || 0) + 1;
                }
            };

            updateStats(statsData.years[year], book);
            updateStats(statsData.all, book);
        });

        this.statsState = { data: statsData, selectedYear: 'all' };
        this.renderStatsDashboard();
        modal.classList.add('active');
    },

    renderStatsDashboard() {
        const container = document.getElementById('statsContent');
        if (!container) return;
        const { data, selectedYear } = this.statsState;

        const years = Object.keys(data.years).sort((a, b) => b - a).filter(y => y !== 'Desconhecido');
        if (data.years['Desconhecido']) years.push('Desconhecido');

        let html = `<div class="stats-filters">
            <button class="chip ${selectedYear === 'all' ? 'active' : ''}" onclick="App.setStatsYear('all')">Todos</button>`;
        years.forEach(y => {
            html += `<button class="chip ${selectedYear == y ? 'active' : ''}" onclick="App.setStatsYear('${y}')">${y}</button>`;
        });
        html += `</div>`;

        const current = selectedYear === 'all' ? data.all : data.years[selectedYear];
        if (!current) { container.innerHTML = html + '<p>Sem dados.</p>'; return; }

        const avg = current.ratedCount > 0 ? (current.ratingSum / current.ratedCount).toFixed(1) : '-';

        let topAuth = '-'; let maxAuth = 0;
        for (const [auth, cnt] of Object.entries(current.authors)) {
            if (cnt > maxAuth) { maxAuth = cnt; topAuth = auth; }
        }

        const mNamesFull = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        let maxMonthVal = 0;
        let maxMonthIdx = -1;
        current.monthlyDist.forEach((val, idx) => {
            if (val > maxMonthVal) {
                maxMonthVal = val;
                maxMonthIdx = idx;
            }
        });
        const activeMonth = maxMonthIdx >= 0 ? mNamesFull[maxMonthIdx] : '-';

        const longest = current.longestBook || { title: '-', pages: '' };
        const shortest = current.shortestBook || { title: '-', pages: '' };

        html += `
            <div class="stats-summary">
                <div class="summary-card">
                    <div class="summary-value">${current.booksCount}</div>
                    <div class="summary-label">Livros Lidos</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${current.pages.toLocaleString()}</div>
                    <div class="summary-label">Páginas Lidas</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">★ ${avg}</div>
                    <div class="summary-label">Média de Avaliação</div>
                </div>
            </div>

            <div class="stats-grid-extra" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                 <div class="summary-card" style="align-items: flex-start; text-align: left; padding: 1.25rem;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Livro Mais Longo</div>
                    <div style="font-weight: 600; color: white; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;" title="${longest.title}">${longest.title}</div>
                    <div style="font-size: 0.9rem; color: var(--accent-color);">${longest.pages ? longest.pages + ' pág' : '-'}</div>
                </div>
                 <div class="summary-card" style="align-items: flex-start; text-align: left; padding: 1.25rem;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Livro Mais Curto</div>
                    <div style="font-weight: 600; color: white; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;" title="${shortest.title}">${shortest.title}</div>
                    <div style="font-size: 0.9rem; color: var(--accent-color);">${shortest.pages ? shortest.pages + ' pág' : '-'}</div>
                </div>
                 <div class="summary-card" style="align-items: flex-start; text-align: left; padding: 1.25rem;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Autor Mais Lido</div>
                    <div style="font-weight: 600; color: white; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;" title="${topAuth}">${topAuth}</div>
                    <div style="font-size: 0.9rem; color: var(--accent-color);">${maxAuth > 0 ? maxAuth + ' livros' : '-'}</div>
                </div>
                 <div class="summary-card" style="align-items: flex-start; text-align: left; padding: 1.25rem;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Mês Mais Ativo</div>
                    <div style="font-weight: 600; color: white; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;" title="${activeMonth}">${activeMonth}</div>
                    <div style="font-size: 0.9rem; color: var(--accent-color);">${maxMonthVal > 0 ? maxMonthVal + ' livros' : '-'}</div>
                </div>
            </div>
        `;



        if (selectedYear !== 'all' && selectedYear !== 'Desconhecido') {
            const booksInGoal = this.state.books.filter(b => b.goalYear == selectedYear);
            const goalTotal = booksInGoal.length;

            if (goalTotal > 0) {
                const goalRead = booksInGoal.filter(b => b.status === 'read').length;
                const progressPercent = Math.round((goalRead / goalTotal) * 100);

                html = `
                    <div class="goal-progress-container">
                        <div class="goal-header">
                            <div class="goal-title">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-8c0 1.93-1.57 3.5-3.5 3.5s-3.5-1.57-3.5-3.5 1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5z"/>
                                </svg>
                                Meta de Leitura ${selectedYear}
                            </div>
                            <div class="goal-stats">
                                ${goalRead}/${goalTotal} <small>lidos</small>
                            </div>
                        </div>
                        <div class="goal-bar-bg">
                            <div class="goal-bar-fill" style="width: ${progressPercent}%"></div>
                        </div>
                    </div>
                ` + html;
            }
        }

        html += `<div class="chart-container">`;
        if (selectedYear === 'all') {
            html += `<div class="chart-title">Livros por Ano</div><div class="chart-bars">`;
            const ySorted = Object.keys(data.years).sort((a, b) => a - b).filter(y => y !== 'Desconhecido');
            let maxY = 0; ySorted.forEach(y => maxY = Math.max(maxY, data.years[y].booksCount));
            if (maxY === 0) maxY = 1;

            ySorted.forEach(y => {
                const c = data.years[y].booksCount;
                const h = Math.max((c / maxY) * 100, 4);
                html += `<div class="bar-group" title="${c} livros" onclick="App.openPeriodDetails('year', '${y}')"><div class="bar" style="height:${h}%"></div><div class="bar-label">${y}</div></div>`;
            });
            html += `</div>`;
            html += `</div>`;
        } else if (selectedYear === 'Desconhecido') {
            html += `<div class="chart-title">Livros sem Data Definida</div>
    <div style="display: flex; justify-content: center; align-items: center; padding: 2rem;">
        <button class="btn btn-primary" onclick="App.openPeriodDetails('year', 'Desconhecido')">Ver Lista Completa (${current.booksCount} livros)</button>
    </div>`;
        } else {
            html += `<div class="chart-title">Leituras Mensais(${selectedYear})</div><div class="chart-bars">`;
            const mNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            let maxM = Math.max(...current.monthlyDist, 0);
            if (maxM === 0) maxM = 1;

            current.monthlyDist.forEach((c, i) => {
                const h = Math.max((c / maxM) * 100, 4);
                html += `<div class="bar-group" title="${c} livros" onclick="App.openPeriodDetails('month', '${i}')"><div class="bar" style="height:${h}%"></div><div class="bar-label">${mNames[i]}</div></div>`;
            });
            html += `</div>`;
        }
        html += `</div>`;

        container.innerHTML = html;
    },
    openPeriodDetails(type, value) {
        const modal = document.getElementById('periodDetailsModal');
        const content = document.getElementById('periodDetailsContent');
        const title = document.getElementById('periodDetailsTitle');
        if (!modal || !content) return;

        let books = [];
        let periodLabel = '';

        if (type === 'year') {
            const yearStr = value.toString();
            periodLabel = yearStr;
            books = this.state.books.filter(b => {
                const isRead = b.status === 'read' || (b.readPages === parseInt(b.pages) && parseInt(b.pages) > 0);
                if (!isRead && (b.timesRead || 0) === 0) return false;

                if (yearStr === 'Desconhecido') {
                    if (!b.readDate) return true;
                } else {
                    if (b.readDate && b.readDate.startsWith(yearStr)) return true;
                }

                if (b.history && b.history.length > 0) {
                    return b.history.some(h => {
                        if (h.type !== 'finish') return false;
                        const hYear = new Date(h.date).getFullYear().toString();
                        if (yearStr === 'Desconhecido') return false;
                        return hYear === yearStr;
                    });
                }
                return false;
            });
        } else if (type === 'month') {
            const yearStr = this.statsState.selectedYear;
            const monthIdx = parseInt(value);
            const mNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            periodLabel = `${mNames[monthIdx]} de ${yearStr} `;

            books = this.state.books.filter(b => {
                const isRead = b.status === 'read' || (b.readPages === parseInt(b.pages) && parseInt(b.pages) > 0);
                if (!isRead && (b.timesRead || 0) === 0) return false;

                let matches = false;

                if (b.readDate) {
                    const d = new Date(b.readDate);
                    const parts = b.readDate.split('-');
                    let bYear = d.getFullYear();
                    let bMonth = d.getMonth();

                    if (parts.length === 3) {
                        bYear = parseInt(parts[0]);
                        bMonth = parseInt(parts[1]) - 1;
                    }

                    if (bYear.toString() === yearStr && bMonth === monthIdx) matches = true;
                }

                if (!matches && b.history && b.history.length > 0) {
                    matches = b.history.some(h => {
                        if (h.type !== 'finish') return false;
                        const d = new Date(h.date);
                        return d.getFullYear().toString() === yearStr && d.getMonth() === monthIdx;
                    });
                }

                return matches;
            });
        }

        books.sort((a, b) => new Date(b.readDate || 0) - new Date(a.readDate || 0));

        title.textContent = `Leituras: ${periodLabel} (${books.length})`;

        if (books.length === 0) {
            content.innerHTML = '<div class="empty-state"><p>Nenhum livro encontrado para este período.</p></div>';
        } else {
            let html = '<div class="books-list-compact">';
            books.forEach(book => {
                const cover = book.cover || 'https://placehold.co/45x65?text=Capa';
                const isPlaceholder = !book.cover || book.cover.includes('placehold.co');

                html += `
                    <div class="api-result-item" onclick="App.editBook('${book.id}'); document.getElementById('periodDetailsModal').classList.remove('active');">
                        <div class="api-result-cover-container ${isPlaceholder ? 'is-placeholder' : ''}">
                             <img src="${cover}" class="api-result-cover" alt="${book.title}"
                                  style="${isPlaceholder ? 'display:none' : ''}"
                                  onerror="this.style.display='none'; this.nextElementSibling.classList.add('visible'); this.parentElement.classList.add('is-placeholder');">
                             <div class="book-cover-placeholder ${isPlaceholder ? 'visible' : ''}">
                                <div class="placeholder-title">${book.title}</div>
                                <div class="placeholder-author">${book.author}</div>
                             </div>
                        </div>
                        <div class="api-result-info">
                            <div class="api-result-title">${book.title}</div>
                            <div class="api-result-author">${book.author}</div>
                            <div style="font-size: 0.75rem; color: var(--accent-color); margin-top: 2px;">
                               ${book.rating > 0 ? '★ ' + book.rating : ''} 
                               ${book.pages ? ' • ' + book.pages + ' pág' : ''}
                            </div>
                        </div>
                    </div>`;
            });
            html += '</div>';
            content.innerHTML = html;
        }

        modal.classList.add('active');
    }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
    App.init();

    const closePeriod = () => document.getElementById('periodDetailsModal').classList.remove('active');
    const closeBtn = document.getElementById('closePeriodDetailsModal');
    const closeBtnFooter = document.getElementById('btnClosePeriodDetails');
    const modal = document.getElementById('periodDetailsModal');

    if (closeBtn) closeBtn.addEventListener('click', closePeriod);
    if (closeBtnFooter) closeBtnFooter.addEventListener('click', closePeriod);
    if (modal) {
        App.setupModalCloseAttributes(modal, closePeriod);
    }

    let deferredPrompt;
    const installButton = document.getElementById('installAppBtn');

    if (installButton) {
        installButton.style.display = 'none';

        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) return;

            installButton.style.display = 'none';
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome} `);
            deferredPrompt = null;
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        if (installButton) {
            installButton.style.display = 'flex';
        }
    });

    window.addEventListener('appinstalled', () => {
        console.log('PWA was installed');
        if (installButton) {
            installButton.style.display = 'none';
        }
        deferredPrompt = null;
    });
});

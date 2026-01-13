
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

const BookModel = {
    create(data) {
        return {
            id: Date.now().toString(),
            title: data.title,
            author: data.author,
            pages: parseInt(data.pages) || 0,
            status: data.status || 'want-to-read',
            cover: data.cover || 'https://placehold.co/200x300?text=Sem+Capa',
            tags: data.tags || [],
            rating: 0,
            readPages: 0,
            createdAt: new Date().toISOString(),
            year: new Date().getFullYear()
        };
    }
};

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
    }
};

const App = {
    state: {
        filter: 'all',
        yearFilter: 'all',
        books: [],
        searchResults: [],
        sortBy: 'recent'
    },

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.refresh();
    },

    cacheDOM() {
        this.dom = {
            grid: document.getElementById('booksGrid'),
            sidebarLinks: document.querySelectorAll('.nav-item'),
            counts: {
                all: document.getElementById('count-all'),
                read: document.getElementById('count-read'),
                reading: document.getElementById('count-reading'),
                want: document.getElementById('count-want'),
                rereading: document.getElementById('count-rereading'),
                abandoned: document.getElementById('count-abandoned'),
                favorite: document.getElementById('count-favorite'),
                desired: document.getElementById('count-desired'),
                rated: document.getElementById('count-rated'),
                reviewed: document.getElementById('count-reviewed'),
                owned: document.getElementById('count-owned'),
                lent: document.getElementById('count-lent'),
                target: document.getElementById('count-target'),
                ebook: document.getElementById('count-ebook'),
                audiobook: document.getElementById('count-audiobook'),
            },
            resultsCount: document.getElementById('resultsCount'),
            yearContainer: document.querySelector('.year-filters'),

            addBtn: document.getElementById('btnAddBook'),
            modal: document.getElementById('bookModal'),
            closeModalBtn: document.getElementById('closeBookModal'),
            cancelModalBtn: document.getElementById('cancelBook'),
            bookForm: document.getElementById('bookForm'),

            statusTrigger: document.getElementById('statusTrigger'),
            statusOptions: document.getElementById('statusOptions'),
            statusHiddenInput: document.getElementById('bookStatus'),
            triggerText: document.getElementById('triggerText'),
            triggerIndicator: document.getElementById('triggerIndicator'),
            customOptions: document.querySelectorAll('.custom-option'),

            apiSearch: document.getElementById('apiSearch'),
            apiResults: document.getElementById('apiResults'),
            apiSearch: document.getElementById('apiSearch'),
            apiResults: document.getElementById('apiResults'),
            searchLoader: document.getElementById('searchLoader'),

            btnSort: document.getElementById('btnSort'),
            sortDropdown: document.getElementById('sortDropdown'),
            sortOptions: document.querySelectorAll('.dropdown-item[data-sort]')
        };
    },

    bindEvents() {
        this.dom.sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const filter = e.currentTarget.dataset.filter;
                this.setFilter(filter);

                this.dom.sidebarLinks.forEach(l => l.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
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

        this.dom.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.dom.cancelModalBtn.addEventListener('click', () => this.closeModal());

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

                this.dom.triggerText.textContent = label;
                this.dom.triggerIndicator.className = `status-indicator ${statusClass}`;

                this.dom.customOptions.forEach(op => op.classList.remove('selected'));
                option.classList.add('selected');

                this.dom.statusOptions.classList.remove('open');
                this.dom.statusTrigger.parentElement.classList.remove('active');
            });
        });

        this.dom.bookForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveBook();
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

        this.dom.apiSearch.addEventListener('input', debounce((e) => {
            this.handleAPISearch(e.target.value);
        }, 500));
    },

    refresh() {
        this.state.books = StorageService.getBooks();
        this.updateCounts();
        this.renderYearFilters();
        this.render();
    },

    setSort(sortType) {
        this.state.sortBy = sortType;
        this.render();
    },

    setFilter(filter) {
        this.state.filter = filter;
        this.render();
    },

    getFilteredBooks() {
        let filtered = this.state.books;

        if (this.state.filter !== 'all') {
            filtered = filtered.filter(book => {
                return book.status === this.state.filter || (book.tags && book.tags.includes(this.state.filter));
            });
        }

        if (this.state.yearFilter !== 'all') {
            filtered = filtered.filter(book => book.year.toString() === this.state.yearFilter);
        }

        return filtered;
    },

    renderYearFilters() {
        if (!this.dom.yearContainer) return;

        const years = [...new Set(this.state.books.map(book => book.year))].sort((a, b) => b - a);

        let html = `<button class="chip ${this.state.yearFilter === 'all' ? 'active' : ''}" data-year="all">Todos</button>`;

        years.forEach(year => {
            html += `<button class="chip ${this.state.yearFilter === year.toString() ? 'active' : ''}" data-year="${year}">${year}</button>`;
        });

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
            return;
        }

        sorted.forEach(book => {
            const card = document.createElement('div');
            card.className = `book-card status-${book.status}`;
            card.innerHTML = `
                <div class="book-cover-container">
                    <img src="${book.cover}" alt="${book.title}" class="book-cover">
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
                    <button class="menu-item edit-btn" data-id="${book.id}">✏️ Editar</button>
                    <button class="menu-item delete-btn" data-id="${book.id}">🗑️ Excluir</button>
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
            if (confirm('Tem certeza que deseja excluir este livro?')) {
                StorageService.deleteBook(btnDelete.dataset.id);
                this.refresh();
            }
            return;
        }

        document.querySelectorAll('.options-menu.active').forEach(m => m.classList.remove('active'));
    },

    calculateProgress(book) {
        if (book.status === 'read') return 100;
        if (book.pages === 0) return 0;
        return Math.floor((book.readPages / book.pages) * 100);
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
        this.dom.counts.rated.textContent = count(b => b.tags && b.tags.includes('rated'));
        this.dom.counts.reviewed.textContent = count(b => b.tags && b.tags.includes('reviewed'));
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
        const results = await GoogleBooksAPI.search(query);
        this.dom.searchLoader.style.display = 'none';

        this.state.searchResults = results;
        this.displayAPIResults(results);
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
                    <img src="${cover}" class="api-result-cover" alt="${title}">
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

        document.getElementById('bookId').value = book.id;
        document.getElementById('bookTitle').value = book.title;
        document.getElementById('bookAuthor').value = book.author;
        document.getElementById('bookPages').value = book.pages;
        document.getElementById('bookCover').value = book.cover;

        this.dom.statusHiddenInput.value = book.status;

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
        this.openModal();
    },

    handleSaveBook() {
        const id = document.getElementById('bookId').value;

        const formData = {
            title: document.getElementById('bookTitle').value,
            author: document.getElementById('bookAuthor').value,
            pages: document.getElementById('bookPages').value,
            status: document.getElementById('bookStatus').value,
            cover: document.getElementById('bookCover').value,
            tags: []
        };

        document.querySelectorAll('input[name="tags"]:checked').forEach(checkbox => {
            formData.tags.push(checkbox.value);
        });

        if (id) {
            const existingBook = this.state.books.find(b => b.id === id);
            const updatedBook = { ...existingBook, ...formData, pages: parseInt(formData.pages) || 0 };
            StorageService.updateBook(updatedBook);
        } else {
            const newBook = BookModel.create(formData);
            StorageService.saveBook(newBook);
        }

        this.refresh();
        this.closeModal();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

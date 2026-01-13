
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
            readPages: data.status === 'read' ? (parseInt(data.pages) || 0) : 0,
            timesRead: 0,
            readDate: null,
            history: [],
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
            apiSearch: document.getElementById('apiSearch'),
            apiResults: document.getElementById('apiResults'),
            searchLoader: document.getElementById('searchLoader'),

            btnSort: document.getElementById('btnSort'),
            sortDropdown: document.getElementById('sortDropdown'),
            sortDropdown: document.getElementById('sortDropdown'),
            sortOptions: document.querySelectorAll('.dropdown-item[data-sort]'),

            historyModal: document.getElementById('historyModal'),
            closeHistoryModalBtn: document.getElementById('closeHistoryModal'),
            historyForm: document.getElementById('historyForm'),
            historyList: document.getElementById('historyList'),
            historyProgressBar: document.getElementById('historyProgressBar'),
            historyProgressText: document.getElementById('historyProgressText'),

            deleteModal: document.getElementById('deleteModal'),
            closeDeleteModalBtn: document.getElementById('closeDeleteModal'),
            cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
            confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
            deleteModalMessage: document.getElementById('deleteModalMessage'),

            messageModal: document.getElementById('messageModal'),
            messageOkBtn: document.getElementById('messageOkBtn'),
            messageTitle: document.getElementById('messageTitle'),
            messageText: document.getElementById('messageText'),
            messageIcon: document.getElementById('messageIcon')
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
            this.dom.bookForm.reset();
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
                    this.dom.groupReadDate.style.display = (value === 'read') ? 'block' : 'none';
                    if (value === 'read' && this.datePicker && !this.datePicker.input.value) {
                        this.datePicker.setDate(new Date());
                    }
                }

                // Show/Hide Rating
                const groupRating = document.getElementById('groupRating');
                if (groupRating) {
                    groupRating.style.display = (value === 'read') ? 'block' : 'none';
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
        this.state.books = StorageService.getBooks();
        this.updateCounts();

        const totalPagesRead = this.state.books.reduce((total, book) => {
            const completedCycles = book.timesRead || 0;
            const currentProgress = book.readPages || 0;
            return total + (completedCycles * book.pages) + currentProgress;
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
                <div class="book-cover-container skeleton">
                    <img src="${book.cover}" alt="${book.title}" class="book-cover" onload="this.parentElement.classList.remove('skeleton')" onerror="this.parentElement.classList.remove('skeleton'); this.src='https://placehold.co/200x300?text=Sem+Capa'">
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
                StorageService.deleteBook(btnDelete.dataset.id);
                this.refresh();
            });
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

        if (this.datePicker) {
            this.datePicker.setDate(book.readDate || null);
        }

        this.dom.statusHiddenInput.value = book.status;

        if (this.dom.groupReadDate) {
            this.dom.groupReadDate.style.display = (book.status === 'read') ? 'block' : 'none';
        }

        const groupRating = document.getElementById('groupRating');
        if (groupRating) {
            groupRating.style.display = (book.status === 'read') ? 'block' : 'none';
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
        this.openModal();
    },

    handleBookSubmit() {
        const id = document.getElementById('bookId').value;
        const readDateVal = document.getElementById('bookReadDate').value;

        const formData = {
            title: document.getElementById('bookTitle').value,
            author: document.getElementById('bookAuthor').value,
            pages: document.getElementById('bookPages').value,
            status: document.getElementById('bookStatus').value,
            cover: document.getElementById('bookCover').value,
            readDate: readDateVal || null,
            rating: document.getElementById('bookRating').value || 0,
            tags: []
        };

        document.querySelectorAll('input[name="tags"]:checked').forEach(checkbox => {
            formData.tags.push(checkbox.value);
        });

        if (id) {
            const existingBook = this.state.books.find(b => b.id === id);

            let newReadPages = parseInt(formData.pages) || 0;
            const isRereading = formData.status === 'rereading' || formData.status === 're-reading';
            const wasRereading = existingBook.status === 'rereading' || existingBook.status === 're-reading';
            let newTimesRead = existingBook.timesRead || 0;

            if (isRereading && !wasRereading) {
                newReadPages = 0;
                if (existingBook.status === 'read' || existingBook.readPages >= existingBook.pages) {
                    newTimesRead++;
                }
            } else if (existingBook) {
                newReadPages = existingBook.readPages || 0;
                if (isRereading && !wasRereading) newReadPages = 0;
            }

            if (formData.status === 'read') {
                newReadPages = parseInt(formData.pages) || 0;
            }

            const updatedBook = {
                ...existingBook,
                ...formData,
                pages: parseInt(formData.pages) || 0,
                readPages: newReadPages,
                timesRead: newTimesRead,
                rating: parseFloat(formData.rating) || 0
            };
            StorageService.updateBook(updatedBook);
        } else {
            const newBookData = {
                ...formData,
                rating: parseFloat(formData.rating) || 0
            };
            const newBook = BookModel.create(newBookData);
            StorageService.saveBook(newBook);
        }

        this.refresh();
        this.closeModal();
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
            return `
                <div class="history-item">
                    <div class="history-info">
                        <span class="history-date">${date}</span>
                        <span class="history-val">Pág. ${entry.page}</span>
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
        this.openDeleteModal('Tem certeza que deseja excluir esse registro?', () => {
            const book = this.state.books.find(b => b.id === bookId);
            if (!book) return;

            book.history = book.history.filter(h => h.date !== dateStr);

            if (book.history.length > 0) {
                const latest = book.history.reduce((prev, current) => {
                    return (new Date(prev.date) > new Date(current.date)) ? prev : current;
                });
                book.readPages = latest.page;
            } else {
                book.readPages = 0;
            }

            StorageService.updateBook(book);

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
        if (newPage === book.pages) {
            book.status = 'read';
            wasFinished = true;
            if (!book.readDate) {
                book.readDate = new Date().toISOString().split('T')[0];
            }
        }

        book.readPages = newPage;

        if (!book.history) book.history = [];
        book.history.push({
            date: new Date().toISOString(),
            page: newPage
        });

        StorageService.updateBook(book);
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

    initStats() {
        const paginometer = document.getElementById('paginometerCard');
        if (paginometer) {
            paginometer.addEventListener('click', () => this.openStatsModal());
        }
    },

    openStatsModal() {
        const modal = document.getElementById('statsModal');
        const container = document.getElementById('statsContent');
        if (!modal || !container) return;

        const statsByYear = {};

        this.state.books.forEach(book => {
            const hasPages = parseInt(book.pages) > 0;
            const isRead = book.status === 'read';

            if (isRead || (book.timesRead && book.timesRead > 0)) {
                let year = 'Sem data';
                if (book.readDate) {
                    year = new Date(book.readDate).getFullYear();
                }

                if (!statsByYear[year]) statsByYear[year] = { books: 0, pages: 0 };

                if (isRead) {
                    statsByYear[year].books += 1;
                    statsByYear[year].pages += (parseInt(book.pages) || 0);
                }
            }
        });

        let sortedYears = Object.keys(statsByYear).sort((a, b) => b - a);

        if (sortedYears.includes('Sem data')) {
            sortedYears = sortedYears.filter(y => y !== 'Sem data');
            sortedYears.push('Sem data');
        }

        let html = '';
        if (sortedYears.length === 0) {
            html = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Nenhuma leitura concluída encontrada.</p>';
        } else {
            sortedYears.forEach(year => {
                const data = statsByYear[year];
                if (data.books === 0) return;

                html += `
                <div class="stat-year-card" style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px; margin-bottom: 0.75rem; border: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="background: var(--accent-gradient); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 1.1rem;">
                            ${year}
                        </div>
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.9rem;">Livros Lidos</div>
                            <div style="color: var(--text-primary); font-weight: 600; font-size: 1.1rem;">${data.books}</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="color: var(--text-secondary); font-size: 0.9rem;">Páginas</div>
                        <div style="color: var(--accent-color); font-weight: 600; font-size: 1.1rem;">${data.pages.toLocaleString()}</div>
                    </div>
                </div>`;
            });
        }

        container.innerHTML = html;
        modal.classList.add('active');
    },

    closeStatsModal() {
        const modal = document.getElementById('statsModal');
        if (modal) modal.classList.remove('active');
    },

    showMessage(title, text, icon = '🎉') {
        this.dom.messageTitle.textContent = title;
        this.dom.messageText.textContent = text;
        this.dom.messageIcon.textContent = icon;
        this.dom.messageModal.classList.add('active');
    },

    openStatsModal() {
        const modal = document.getElementById('statsModal');
        const container = document.getElementById('statsContent');
        if (!modal || !container) return;

        const statsData = {
            years: {},
            all: { books: [], pages: 0, ratingSum: 0, ratedCount: 0, monthlyDist: new Array(12).fill(0) }
        };

        this.state.books.forEach(book => {
            if (book.status !== 'read' && (!book.timesRead || book.timesRead === 0)) return;

            let date = book.readDate ? new Date(book.readDate) : new Date(book.createdAt);

            let year = 'Desconhecido';
            let month = -1;

            if (book.readDate) {
                const d = new Date(book.readDate);
                year = d.getFullYear();
                month = d.getMonth();
            } else if (book.year) {
                year = book.year;
            }

            if (!statsData.years[year]) {
                statsData.years[year] = {
                    books: [],
                    pages: 0,
                    ratingSum: 0,
                    ratedCount: 0,
                    monthlyDist: new Array(12).fill(0)
                };
            }

            const yData = statsData.years[year];
            yData.books.push(book);
            yData.pages += (parseInt(book.pages) || 0);
            if (book.rating > 0) {
                yData.ratingSum += book.rating;
                yData.ratedCount++;
            }
            if (month >= 0) {
                yData.monthlyDist[month]++;
            }

            statsData.all.books.push(book);
            statsData.all.pages += (parseInt(book.pages) || 0);
            if (book.rating > 0) {
                statsData.all.ratingSum += book.rating;
                statsData.all.ratedCount++;
            }
            if (month >= 0) {
                statsData.all.monthlyDist[month]++;
            }
        });

        this.statsState = {
            data: statsData,
            selectedYear: 'all'
        };

        this.renderStatsDashboard();
        modal.classList.add('active');
    },

    renderStatsDashboard() {
        const container = document.getElementById('statsContent');
        if (!container) return;

        const { data, selectedYear } = this.statsState;

        const years = Object.keys(data.years).sort((a, b) => b - a);

        let filtersHtml = `
            <div class="stats-filters">
                <button class="chip ${selectedYear === 'all' ? 'active' : ''}" onclick="App.setStatsYear('all')">Todos</button>
        `;

        years.forEach(year => {
            filtersHtml += `<button class="chip ${selectedYear == year ? 'active' : ''}" onclick="App.setStatsYear('${year}')">${year}</button>`;
        });
        filtersHtml += `</div>`;

        let currentData = selectedYear === 'all' ? data.all : data.years[selectedYear];

        if (!currentData) currentData = { books: [], pages: 0, ratingSum: 0, ratedCount: 0, monthlyDist: [] };

        const totalBooks = currentData.books.length;
        const totalPages = currentData.pages;
        const avgRating = currentData.ratedCount > 0
            ? (currentData.ratingSum / currentData.ratedCount).toFixed(1)
            : '-';

        const summaryHtml = `
            <div class="stats-summary">
                <div class="summary-card">
                    <div class="summary-value">${totalBooks}</div>
                    <div class="summary-label">Livros Lidos</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${totalPages.toLocaleString()}</div>
                    <div class="summary-label">Páginas Lidas</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">★ ${avgRating}</div>
                    <div class="summary-label">Média de Avaliação</div>
                </div>
            </div>
        `;

        let chartHtml = '';
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

        if (selectedYear === 'all') {
            const sortedYears = Object.keys(data.years).sort((a, b) => a - b);
            let barsHtml = '';

            let maxVal = 0;
            sortedYears.forEach(y => maxVal = Math.max(maxVal, data.years[y].books.length));
            if (maxVal === 0) maxVal = 1;

            sortedYears.forEach(y => {
                const count = data.years[y].books.length;
                const height = Math.max((count / maxVal) * 100, 4);

                barsHtml += `
                    <div class="bar-group" title="${count} livros em ${y}">
                        <div class="bar" style="height: ${height}%;"></div>
                        <div class="bar-tooltip">${count} livros</div>
                        <div class="bar-label">${y}</div>
                    </div>
                `;
            });

            chartHtml = `
                <div class="chart-container">
                    <div class="chart-title">Livros por Ano</div>
                    <div class="chart-bars">
                        ${barsHtml}
                    </div>
                </div>
            `;

        } else {
            let barsHtml = '';
            let maxVal = Math.max(...currentData.monthlyDist);
            if (maxVal === 0) maxVal = 1;

            currentData.monthlyDist.forEach((count, index) => {
                const height = Math.max((count / maxVal) * 100, 4);

                barsHtml += `
                    <div class="bar-group">
                        <div class="bar" style="height: ${height}%;"></div>
                        <div class="bar-tooltip">${count} livros</div>
                        <div class="bar-label">${monthNames[index]}</div>
                    </div>
                `;
            });

            chartHtml = `
                <div class="chart-container">
                    <div class="chart-title">Leituras por Mês (${selectedYear})</div>
                    <div class="chart-bars">
                        ${barsHtml}
                    </div>
                </div>
            `;
        }

        container.innerHTML = filtersHtml + summaryHtml + chartHtml;
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
            if (!isRead && timesRead === 0) return;

            let year = 'Desconhecido';
            let month = -1;

            if (book.readDate) {
                const d = new Date(book.readDate);
                year = d.getFullYear();
                month = d.getMonth();
            } else if (book.year) {
                year = book.year;
            }

            if (!statsData.years[year]) statsData.years[year] = createStatObj();

            const updateStats = (target, b) => {
                target.books.push(b);
                target.booksCount++;
                const p = parseInt(b.pages) || 0;
                target.pages += p;

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

        html += `<div class="chart-container">`;
        if (selectedYear === 'all') {
            html += `<div class="chart-title">Livros por Ano</div><div class="chart-bars">`;
            const ySorted = Object.keys(data.years).sort((a, b) => a - b).filter(y => y !== 'Desconhecido');
            let maxY = 0; ySorted.forEach(y => maxY = Math.max(maxY, data.years[y].booksCount));
            if (maxY === 0) maxY = 1;

            ySorted.forEach(y => {
                const c = data.years[y].booksCount;
                const h = Math.max((c / maxY) * 100, 4);
                html += `<div class="bar-group" title="${c}"><div class="bar" style="height:${h}%"></div><div class="bar-label">${y}</div></div>`;
            });
            html += `</div>`;
        } else {
            html += `<div class="chart-title">Leituras Mensais (${selectedYear})</div><div class="chart-bars">`;
            const mNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            let maxM = Math.max(...current.monthlyDist, 0);
            if (maxM === 0) maxM = 1;

            current.monthlyDist.forEach((c, i) => {
                const h = Math.max((c / maxM) * 100, 4);
                html += `<div class="bar-group" title="${c}"><div class="bar" style="height:${h}%"></div><div class="bar-label">${mNames[i]}</div></div>`;
            });
            html += `</div>`;
        }
        html += `</div>`;

        container.innerHTML = html;
    }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

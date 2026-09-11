import { debounce, escapeHTML, starSvg } from './js/utils/helpers.js';
import { BookModel } from './js/models/Book.js';
import { auth, db, googleProvider } from './js/services/firebase.js';
import { GoogleBooksAPI, OpenLibraryAPI, GeminiAPI } from './js/services/api.js';
import { rm } from './js/store/readingManager.js';
import { processBookStats, migrateLegacyHistory } from './js/services/statsService.js';
import { StatsView } from './js/ui/statsView.js';
import { openListBooksModal, initListBooksEvents } from './js/ui/listBooksModal.js';

const App = {
    state: {
        filter: 'all',
        formatFilter: 'all',
        books: [],
        searchResults: [],
        sortBy: 'recent',
        currentPage: 1,
        itemsPerPage: window.innerWidth > 768 ? 200 : 30,
        searchQuery: '',
        currentBookTitle: '',
        migrated: false
    },

    init() {
        this.cacheDOM();

        this.state.filter = localStorage.getItem('rm_filter') || 'all';
        this.state.formatFilter = localStorage.getItem('rm_formatFilter') || 'all';
        this.state.sortBy = localStorage.getItem('rm_sortBy') || 'recent';

        document.body.appendChild(this.dom.statusOptions)
        this.bindEvents();
        this.bindMobileEvents();
        this.initDatePicker();
        this.initStats();

        this.setFilter(this.state.filter);
        this.setSort(this.state.sortBy);
        this.refresh();
    },

    async migrateLegacyHistory() {
        return migrateLegacyHistory(rm);
    },

    initDatePicker() {
        const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (typeof flatpickr !== 'undefined' && !isMobile) {
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
            this.loanDatePicker = flatpickr("#loanDate", config);
        }

        document.querySelectorAll('.format-filters, .year-filters').forEach(filters => {
            filters.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    filters.scrollLeft += e.deltaY;
                }
            }, { passive: false });
        });
    },

    cacheDOM() {
        const getById = (id) => document.getElementById(id);
        this.dom = {
            grid: getById('booksGrid'),
            sidebarLinks: document.querySelectorAll('.nav-item[data-filter]'),
            counts: {
                all: getById('count-all'),
                read: getById('count-read'),
                reading: getById('count-reading'),
                want: getById('count-want'),
                rereading: getById('count-rereading'),
                abandoned: getById('count-abandoned'),
                favorite: getById('count-favorite'),
                desired: getById('count-desired'),
                borrowed: getById('count-borrowed'),
                physical: getById('count-physical'),
                owned: getById('count-owned'),
                lent: getById('count-lent'),
                target: getById('count-target'),
                ebook: getById('count-ebook'),
                audiobook: getById('count-audiobook'),
            },
            totalPagesRead: getById('total-pages-read'),
            resultsCount: getById('resultsCount'),
            currentSectionLabel: getById('currentSectionLabel'),
            btnCreateList: getById('btnCreateList'),
            createListModal: getById('createListModal'),
            closeCreateListModal: getById('closeCreateListModal'),
            closeCreateListModalAction: getById('closeCreateListModalAction'),
            createListForm: getById('createListForm'),

            renameListModal: getById('renameListModal'),
            closeRenameListModal: getById('closeRenameListModal'),
            closeRenameListModalAction: getById('closeRenameListModalAction'),
            renameListForm: getById('renameListForm'),

            addBtn: getById('btnAddBook'),
            modal: getById('bookModal'),
            modalTitle: getById('modalTitle'),
            closeModalBtn: getById('closeBookModal'),
            cancelModalBtn: getById('cancelBook'),
            bookForm: getById('bookForm'),
            groupReadDate: getById('groupReadDate'),
            rowReadFormat: getById('rowReadFormat'),
            groupReadFormat: getById('groupReadFormat'),

            bookId: getById('bookId'),
            bookTitle: getById('bookTitle'),
            bookAuthor: getById('bookAuthor'),
            bookPages: getById('bookPages'),
            bookCover: getById('bookCover'),
            bookReadDate: getById('bookReadDate'),
            bookRating: getById('bookRating'),
            bookGoalYear: getById('bookGoalYear'),
            loanDetails: getById('loanDetails'),
            loanDate: getById('loanDate'),
            bookTimesRead: getById('bookTimesRead'),
            groupRating: getById('groupRating'),
            lblLoanDetails: getById('lblLoanDetails'),

            statusTrigger: getById('statusTrigger'),
            statusOptions: getById('statusOptions'),
            statusHiddenInput: getById('bookStatus'),
            triggerText: getById('triggerText'),
            triggerIndicator: getById('triggerIndicator'),
            customOptions: document.querySelectorAll('.custom-option'),

            apiSearch: getById('apiSearch'),
            apiResults: getById('apiResults'),
            searchRow: document.querySelector('.search-row'),
            formDivider: document.querySelector('.form-divider'),
            searchLoader: getById('searchLoader'),

            btnSort: getById('btnSort'),
            sortDropdown: getById('sortDropdown'),
            sortOptions: document.querySelectorAll('.dropdown-item[data-sort]'),

            quickActionModal: getById('quickActionModal'),
            closeQuickActionModalBtn: getById('closeQuickActionModal'),
                        closeHistoryModalBtn: getById('closeHistoryModal'),
            historyForm: getById('historyForm'),
            historyList: getById('historyList'),
            historyProgressBar: getById('historyProgressBar'),
            historyProgressText: getById('historyProgressText'),
            btnOpenHistoryFromModal: getById('btnOpenHistoryFromModal'),
            historyBookId: getById('historyBookId'),
            historyTotalPages: getById('historyTotalPages'),
            historyEntryId: getById('historyEntryId'),
            historyBookTitle: getById('historyBookTitle'),
            newCurrentPage: getById('newCurrentPage'),
            isPercentage: getById('isPercentage'),
            lblHistoryInput: getById('lblHistoryInput'),
            historyNoteContent: getById('historyNoteContent'),

                        closeNotesModalBtn: getById('closeNotesModal'),
            notesForm: getById('notesForm'),
            notesList: getById('notesList'),
            notesBookId: getById('notesBookId'),
            noteId: getById('noteId'),

            deleteModal: getById('deleteModal'),
            closeDeleteModalBtn: getById('closeDeleteModal'),
            cancelDeleteBtn: getById('cancelDeleteBtn'),
            confirmDeleteBtn: getById('confirmDeleteBtn'),
            deleteModalMessage: getById('deleteModalMessage'),

            messageModal: getById('messageModal'),
            messageOkBtn: getById('messageOkBtn'),
            messageTitle: getById('messageTitle'),
            messageText: getById('messageText'),
            messageIcon: getById('messageIcon'),

            statsModal: getById('statsModal'),
            periodDetailsModal: getById('periodDetailsModal'),
            periodDetailsContent: getById('periodDetailsContent'),
            periodDetailsTitle: getById('periodDetailsTitle'),
            closePeriodDetailsModalBtn: getById('closePeriodDetailsModal'),
            btnClosePeriodDetails: getById('btnClosePeriodDetails'),

            paginationControls: getById('paginationControls'),
            btnPrevPage: getById('btnPrevPage'),
            btnNextPage: getById('btnNextPage'),
            pageInfo: getById('pageInfo'),

            bookSearch: getById('bookSearch'),

            btnMenu: getById('btnMenu'),
            sidebar: getById('sidebar'),
            sidebarOverlay: getById('sidebarOverlay'),

            btnLogin: getById('btnLogin'),
            userInfo: getById('userInfo'),
            userAvatar: getById('userAvatar'),
            userDropdown: getById('userDropdown'),
            userName: getById('userName'),
            userEmail: getById('userEmail'),
            btnExportMenu: getById('btnExportMenu'),
            btnImportMenu: getById('btnImportMenu'),
            btnLogout: getById('btnLogout'),
            fileInput: getById('fileInput'),

            loginOverlay: getById('loginOverlay'),
            authLoading: document.getElementById('authLoading'),
            authContent: document.getElementById('authContent'),
            btnLoginOverlay: document.getElementById('btnLoginOverlay'),
            btnAnonymousLogin: document.getElementById('btnAnonymousLogin'),

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
                
                const customLists = document.querySelectorAll('#customListsContainer .nav-item');
                if (customLists) {
                    customLists.forEach(l => l.classList.remove('active'));
                }
                
                e.currentTarget.classList.add('active');

                if (window.innerWidth <= 768) {
                    this.dom.sidebar.classList.remove('active');
                    this.dom.sidebarOverlay.classList.remove('active');
                }
            });
        });

        this.dom.btnCreateList.addEventListener('click', () => {
            this.dom.createListModal.classList.add('active');
            setTimeout(() => document.getElementById('listName').focus(), 100);
            
            if (window.innerWidth <= 768) {
                this.dom.sidebar.classList.remove('active');
                this.dom.sidebarOverlay.classList.remove('active');
            }
        });

        const closeCreateModal = () => {
            this.dom.createListModal.classList.remove('active');
            this.dom.createListForm.reset();
        };

        this.dom.closeCreateListModal.addEventListener('click', closeCreateModal);
        this.dom.closeCreateListModalAction.addEventListener('click', closeCreateModal);
        this.setupModalCloseAttributes(this.dom.createListModal, closeCreateModal);

        this.dom.createListForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('listName').value.trim();
            if (name) {
                const newList = rm.addList({ name });
                closeCreateModal();
                this.renderCustomLists();
                if (newList && newList.id) {
                    this.setFilter(newList.id);
                }
            }
        });

        const closeRenameModal = () => {
            this.dom.renameListModal.classList.remove('active');
            this.dom.renameListForm.reset();
        };

        this.dom.closeRenameListModal.addEventListener('click', closeRenameModal);
        this.dom.closeRenameListModalAction.addEventListener('click', closeRenameModal);
        this.setupModalCloseAttributes(this.dom.renameListModal, closeRenameModal);

        this.dom.renameListForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const listId = document.getElementById('renameListId').value;
            const newName = document.getElementById('renameListName').value.trim();
            if (newName && listId) {
                rm.updateList(listId, {
                    name: newName,
                    updatedAt: new Date().toISOString()
                });
                closeRenameModal();
                this.renderCustomLists();
                if (this.state.filter === listId) {
                    this.setFilter(listId);
                }
                this.showToast('Lista renomeada com sucesso!');
            }
        });

        const handleTagChanges = (e) => {
            const targetCheckbox = document.querySelector('input[name="tags"][value="target"]');
            const groupGoalYear = document.getElementById('groupGoalYear');
            
            const borrowedCheckbox = document.querySelector('input[name="tags"][value="borrowed"]');
            const lentCheckbox = document.querySelector('input[name="tags"][value="lent"]');
            const groupLoanInfo = document.getElementById('groupLoanInfo');
            const lblLoanDetails = document.getElementById('lblLoanDetails');
            const inputLoanDetails = document.getElementById('loanDetails');

            if (targetCheckbox && groupGoalYear) {
                groupGoalYear.style.display = targetCheckbox.checked ? 'flex' : 'none';
            }

            if (e && e.target.name === 'tags') {
                if (e.target.value === 'borrowed' && e.target.checked) {
                    lentCheckbox.checked = false;
                } else if (e.target.value === 'lent' && e.target.checked) {
                    borrowedCheckbox.checked = false;
                }
            }

            if (borrowedCheckbox.checked || lentCheckbox.checked) {
                groupLoanInfo.style.display = 'flex';
                const lblLoanDate = document.getElementById('lblLoanDate');
                const inputLoanDate = document.getElementById('loanDate');

                if (borrowedCheckbox.checked) {
                    lblLoanDate.textContent = 'Peguei em';
                    lblLoanDetails.textContent = 'De quem você pegou?';
                    inputLoanDetails.placeholder = 'Nome da pessoa ou local';
                } else {
                    lblLoanDate.textContent = 'Emprestei em';
                    lblLoanDetails.textContent = 'Para quem você emprestou?';
                    inputLoanDetails.placeholder = 'Nome da pessoa ou local';
                }

                if (!inputLoanDate.value) {
                    if (this.loanDatePicker) {
                        this.loanDatePicker.setDate(new Date());
                    } else {
                        inputLoanDate.value = new Date().toISOString().split('T')[0];
                    }
                }
            } else {
                groupLoanInfo.style.display = 'none';
                inputLoanDetails.value = '';
                if (this.loanDatePicker) this.loanDatePicker.clear();
                else document.getElementById('loanDate').value = '';
            }
        };

        document.querySelectorAll('input[name="tags"]').forEach(cb => {
            cb.addEventListener('change', handleTagChanges);
        });

        this.dom.addBtn.addEventListener('click', () => {
            if (this.state.filter.startsWith('list_')) {
                const listId = this.state.filter;
                openListBooksModal(listId);
                return;
            }

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
            if (this.datePicker) {
                this.datePicker.clear();
            } else if (this.dom.bookReadDate) {
                this.dom.bookReadDate.value = '';
            }

            if (this.dom.rowReadFormat) this.dom.rowReadFormat.style.display = 'none';
            if (this.dom.groupReadFormat) {
                document.querySelectorAll('input[name="readFormat"]').forEach(cb => cb.checked = false);
            }

            this.renderCustomListsCheckboxes([]);

            const groupRating = document.getElementById('groupRating');
            if (groupRating) groupRating.style.display = 'none';
            document.getElementById('bookRating').value = 0;
            if (this.updateStarRatingWidget) this.updateStarRatingWidget(0);

            const groupTimesRead = document.getElementById('groupTimesRead');
            if (groupTimesRead) groupTimesRead.style.display = 'none';
            const inputTimesRead = document.getElementById('bookTimesRead');
            inputTimesRead.value = 0;
            inputTimesRead.disabled = false;

            document.getElementById('modalTitle').textContent = 'Adicionar Livro';
            document.getElementById('deleteBookBtn').style.display = 'none';

            if (this.dom.btnOpenHistoryFromModal) {
                this.dom.btnOpenHistoryFromModal.style.display = 'none';
            }

            if (this.dom.searchRow) {
                this.dom.searchRow.style.display = 'flex';
            }
            if (this.dom.formDivider) {
                this.dom.formDivider.style.display = 'flex';
            }

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

        statusTrigger.addEventListener('click', (e) => {
            const rect = statusTrigger.getBoundingClientRect();
            
            statusOptions.style.top = `${rect.bottom + 8}px`;
            statusOptions.style.left = `${rect.left}px`;
            statusOptions.style.width = `${rect.width}px`;

            statusOptions.classList.toggle('open');
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
                    if (value === 'read') {
                        if (this.datePicker) {
                            this.datePicker.setDate(new Date());
                        } else if (this.dom.bookReadDate) {
                            this.dom.bookReadDate.value = new Date().toISOString().split('T')[0];
                        }
                    }
                }

                const groupRating = document.getElementById('groupRating');
                const rowReadFormat = document.getElementById('rowReadFormat');
                const groupTimesRead = document.getElementById('groupTimesRead');
                const isReadStatus = ['read', 'reading', 're-reading', 'rereading'].includes(value);

                if (groupRating) {
                    groupRating.style.display = (value === 'read') ? '' : 'none';
                }
                if (rowReadFormat) {
                    rowReadFormat.style.display = isReadStatus ? '' : 'none';
                }
                if (groupTimesRead) {
                    groupTimesRead.style.display = isReadStatus ? 'flex' : 'none';
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

        const deleteBookBtn = document.getElementById('deleteBookBtn');
        if(deleteBookBtn) {
            deleteBookBtn.addEventListener('click', () => {
                const bookId = this.dom.bookId.value;
                if (bookId) {
                    this.closeModal();
                    this.openDeleteModal('Tem certeza que deseja excluir este livro?', () => {
                        rm.delete(bookId);
                        this.refresh();
                    });
                }
            });
        }

        this.dom.historyForm.addEventListener('submit', (e) => this.handleHistorySubmit(e));

        this.dom.newCurrentPage.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                this.dom.historyNoteContent.focus();
            }
        });

        this.dom.historyNoteContent.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && e.shiftKey) {
                e.preventDefault();
                this.dom.newCurrentPage.focus();
            }
        });

        document.getElementById('btnAddHistory').addEventListener('click', () => this.showHistoryFormView());
        document.getElementById('backToHistoryList').addEventListener('click', () => this.showHistoryListView());

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
        this.setupModalCloseAttributes(this.dom.quickActionModal, () => {
            this.dom.quickActionModal.classList.remove('active');
            this.toggleBodyScroll(false);
        });
        this.setupModalCloseAttributes(this.dom.deleteModal, () => this.closeDeleteModal());
        this.setupModalCloseAttributes(this.dom.messageModal, () => {
            this.dom.messageOkBtn.click();
        });

        if (this.dom.statsModal) {
            this.setupModalCloseAttributes(this.dom.statsModal, () => this.closeStatsModal());
        }

        if (this.dom.periodDetailsModal) {
            this.setupModalCloseAttributes(this.dom.periodDetailsModal, () => {
                this.dom.periodDetailsModal.classList.remove('active');
                this.toggleBodyScroll(false);
            });
        }

        this.dom.closeModalBtn.addEventListener('click', () => this.closeModal());
        if (this.dom.closeQuickActionModalBtn) {
            this.dom.closeQuickActionModalBtn.addEventListener('click', () => {
                this.dom.quickActionModal.classList.remove('active');
                this.toggleBodyScroll(false);
            });
        }
        
        const tabBtns = this.dom.quickActionModal.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('tab-history').style.display = tab === 'history' ? 'flex' : 'none';
                document.getElementById('tab-notes').style.display = tab === 'notes' ? 'flex' : 'none';
                this.showHistoryListView();
                this.showNotesListView();
            });
        });
        this.dom.cancelModalBtn.addEventListener('click', () => this.closeModal());
        this.dom.closeHistoryModalBtn.addEventListener('click', () => {
            this.dom.quickActionModal.classList.remove('active');
            this.toggleBodyScroll(false);
        });
        this.dom.closeNotesModalBtn.addEventListener('click', () => {
            this.dom.quickActionModal.classList.remove('active');
            this.toggleBodyScroll(false);
        });

        if (this.dom.messageOkBtn) {
            this.dom.messageOkBtn.addEventListener('click', () => {
                this.dom.messageModal.classList.remove('active');
                this.toggleBodyScroll(false);
            });
        }

        if (this.dom.btnOpenHistoryFromModal) {
            this.dom.btnOpenHistoryFromModal.addEventListener('click', () => {
                const bookId = document.getElementById('bookId').value;
                if (bookId) {
                    this.openQuickActionModal(bookId, 'history');
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
            if (this.dom.messageOkBtn.onclick) {
                this.dom.messageOkBtn.onclick();
            } else {
                this.dom.messageModal.classList.remove('active');
                this.toggleBodyScroll(false);
            }
        });

        if (this.dom.notesForm) {
            this.dom.notesForm.addEventListener('submit', (e) => this.handleNoteSubmit(e));
        }

        document.getElementById('btnAddNote').addEventListener('click', () => this.showNotesFormView());
        document.getElementById('backToNotesList').addEventListener('click', () => this.showNotesListView());

        this.dom.apiSearch.addEventListener('input', debounce((e) => {
            if (document.getElementById('bookId').value) return;
            this.handleAPISearch(e.target.value);
        }, 500));

        if (!window._escListenerAttached) {
            document.addEventListener('keydown', (e) => {
                if (window.App && window.App.handleEscKey) {
                    window.App.handleEscKey(e);
                }
            });
            window._escListenerAttached = true;
        }

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

        if (this.dom.btnAnonymousLogin) {
            this.dom.btnAnonymousLogin.addEventListener('click', () => this.handleAnonymousLogin());
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
            localStorage.clear();

            this.state.filter = 'all';
            this.state.formatFilter = 'all';
            this.state.searchQuery = '';
            this.dom.bookSearch.value = '';
            this.setFilter('all'); 
            rm.clear();
            auth.signOut();
            this.dom.userDropdown.classList.remove('active');
            this.refresh();
            this.showToast('Você saiu com sucesso.', 'success');
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

            const loading = document.getElementById('authLoading');
            const content = document.getElementById('authContent');
            const overlay = document.getElementById('loginOverlay');
            const loadingText = loading.querySelector('p');
            const originalText = loadingText.textContent;

            if (overlay) {
                overlay.style.display = 'flex';
                overlay.classList.remove('hidden');
            }
            if (loading) {
                loading.style.display = 'flex';
                loadingText.textContent = 'Importando livros...';
            }
            if (content) content.style.display = 'none';

            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                const count = await rm.import(data, true, (msg) => {
                    if (loadingText) loadingText.textContent = msg;
                });

                setTimeout(() => {
                    if (overlay && overlay.style.display !== 'none') {
                        overlay.style.display = 'none';
                        overlay.classList.add('hidden');
                    }
                }, 10000);

                if (overlay) {
                    overlay.style.display = 'none';
                    overlay.classList.add('hidden');
                }
                await this.migrateLegacyHistory();
                this.refresh();
                
                this.showToast(`${count} livros importados com sucesso.`, 'success');
            } catch (err) {
                if (overlay) {
                    overlay.style.display = 'none';
                    overlay.classList.add('hidden');
                }
                this.showMessage('Erro', 'Falha ao importar: ' + err.message, '❌');
            } finally {
                if (loadingText) loadingText.textContent = originalText;
                e.target.value = '';
            }
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
                    if (!this.state.migrated && rm.books.length > 0) {
                        this.state.migrated = true;
                        this.migrateLegacyHistory();
                    }
                });
            } else {
                rm.stopListener();
                rm.clear();
                this.refresh();
            }
        });

        const formatContainer = document.getElementById('formatFilters');
        if (formatContainer) {
            formatContainer.addEventListener('click', (e) => {
                const chip = e.target.closest('.chip');
                if (!chip) return;

                this.state.formatFilter = chip.dataset.format;
                localStorage.setItem('rm_formatFilter', this.state.formatFilter);
                this.state.currentPage = 1;
                
                this.renderFormatFilters();
                this.render();
            });
        }

        document.querySelector('#bookForm .modal-body').addEventListener('scroll', () => {
            if (this.dom.statusOptions.classList.contains('open')) {
                this.dom.statusOptions.classList.remove('open');
                this.dom.statusTrigger.parentElement.classList.remove('active');
            }
        });
    },

    handleAnonymousLogin() {
        const loading = document.getElementById('authLoading');
        const content = document.getElementById('authContent');

        if (loading) loading.style.display = 'flex';
        if (content) content.style.display = 'none';

        auth.signInAnonymously().then(() => {
            this.showToast(`Bem-vindo! Você está testando como visitante.`, 'success');
        }).catch((error) => {
            console.error('Erro no login anônimo:', error);
            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'flex';
            alert('Erro ao acessar como visitante: ' + error.message);
        });
    },

    handleAuthClick() {
        const loading = document.getElementById('authLoading');
        const content = document.getElementById('authContent');

        if (loading) loading.style.display = 'flex';
        if (content) content.style.display = 'none';

        auth.signInWithPopup(googleProvider).then((result) => {
            this.showToast(`Bem-vindo, ${result.user.displayName}!`, 'success');
        }).catch((error) => {
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

                if (avatar) avatar.src = user.photoURL || 'https://ui-avatars.com/api/?name=Visi+tante&background=random';
                if (name) name.textContent = user.displayName || 'Visitante';
                if (email) email.textContent = user.email || 'Conta Temporária';
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
    },

    processBookStats(book) {
        return processBookStats(book);
    },

    refresh() {
        this.state.books = rm.books;
        const dailyPages = {};
        let totalPagesRead = 0;

        const activeStatuses = ['read', 'reading', 're-reading', 'rereading', 'abandoned'];
        
        this.state.books.forEach(book => {
            this.processBookStats(book);
            
            if (activeStatuses.includes(book.status)) {
                totalPagesRead += book.computed.totalReadPages;
                Object.entries(book.computed.heatmapDays).forEach(([date, pages]) => {
                    dailyPages[date] = (dailyPages[date] || 0) + pages;
                });
            }
        });

        this.updateCounts();

        if (this.dom.totalPagesRead) {
            this.dom.totalPagesRead.textContent = totalPagesRead.toLocaleString('pt-BR');
        }

        this.renderCustomLists();
        this.renderHeatMap(dailyPages, 'all');

        const isNotesModalOpen = this.dom.notesModal && this.dom.notesModal.classList.contains('active');
        if (isNotesModalOpen) return;

        this.setFilter(this.state.filter);
    },

    setSort(sortType, shouldRender = true) {
        this.state.sortBy = sortType;
        localStorage.setItem('rm_sortBy', sortType);
        
        if (this.dom.sortOptions) {
            this.dom.sortOptions.forEach(opt => {
                opt.classList.toggle('active', opt.dataset.sort === sortType);
            });
        }

        if (shouldRender) this.render();
    },

    setFilter(filter) {
        this.state.filter = filter;
        localStorage.setItem('rm_filter', filter);
        this.state.currentPage = 1;

        let defaultSort = 'recent';
        let isCustomList = false;

        if (['read', 'reading', 're-reading'].includes(filter)) {
            defaultSort = 'read-date';
        } else if (['favorite'].includes(filter)) {
            defaultSort = 'rating';
        } else if (filter === 'want-to-read' || (filter && filter.startsWith('list_'))) {
            defaultSort = 'custom';
            isCustomList = true;
        }

        const sortCustomOption = document.getElementById('sortCustomOption');
        if (sortCustomOption) {
            sortCustomOption.style.display = isCustomList ? 'flex' : 'none';
        }
        
        this.setSort(defaultSort, false);

        if (this.dom.sidebarLinks) {
            this.dom.sidebarLinks.forEach(link => {
                link.classList.toggle('active', link.dataset.filter === filter);
            });
        }

        const labels = {
            'all': 'Minha Biblioteca',
            'read': 'Lidos',
            'reading': 'Lendo',
            'want-to-read': 'Quero Ler',
            're-reading': 'Relendo',
            'abandoned': 'Abandonados',
            'favorite': 'Favoritos',
            'desired': 'Desejados',
            'borrowed': 'Emprestados',
            'physical': 'Físicos',
            'owned': 'Tenho',
            'lent': 'Emprestei',
            'target': 'Meta',
            'ebook': 'Ebook',
            'audiobook': 'Audiobook',
            'recommended': 'Recomendados'
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
            'audiobook': '#86198f',
            'recommended': '#d97706'
        };

        const header = document.querySelector('.header');
        const h1 = header ? header.querySelector('h1') : null;

        if (header && h1) {
            const headerLeft = h1.closest('.header-left');
            if (headerLeft) {
                const existingActions = headerLeft.querySelector('.list-actions-dropdown');
                if (existingActions) {
                    existingActions.remove();
                }
            }

            if (filter === 'all') {
                h1.innerHTML = 'Minha Biblioteca <span id="currentSectionLabel"></span>';

                const themeMeta = document.querySelector('meta[name="theme-color"]');
                if (themeMeta) themeMeta.setAttribute('content', '#0f0c29');

                header.style.background = '';
                header.style.borderBottom = '';
                header.classList.remove('header-active-filter');
            } else {
                const color = colors[filter] || ''; 
                const themeMeta = document.querySelector('meta[name="theme-color"]');
                if (themeMeta) {
                    themeMeta.setAttribute('content', color || '#0f0c29');
                }
                
                header.style.background = color;
                header.style.borderBottom = color ? 'none' : '';
                
                if (color) {
                    header.classList.add('header-active-filter');
                } else {
                    header.classList.remove('header-active-filter');
                }

                let labelText = labels[filter] || filter;
                let extraAction = '';

                if (filter.startsWith('list_')) {
                    const listObj = rm.lists.find(l => l.id === filter);
                    if (listObj) {
                        labelText = listObj.name;
                        extraAction = `
                            <div class="list-actions-dropdown" style="position: relative; margin-left: 0.5rem; flex-shrink: 0;">
                                <button class="btn-icon" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show');" style="display: flex; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem; border-radius: 10px; border: 1px solid var(--glass-border); color: var(--text-primary); background: transparent; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(6, 7, 26, 0.3)'; this.style.borderColor='var(--accent-color)';" onmouseout="this.style.background='transparent'; this.style.borderColor='var(--glass-border)';">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="1.5"></circle>
                                        <circle cx="12" cy="6" r="1.5"></circle>
                                        <circle cx="12" cy="18" r="1.5"></circle>
                                    </svg>
                                </button>
                                <div class="dropdown-menu" style="width: 160px; right: 0; left: auto;">
                                    <button onclick="App.renameCustomList('${filter}')" class="dropdown-item">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        Renomear
                                    </button>
                                    <button onclick="App.shareList('${filter}')" class="dropdown-item">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                                        Compartilhar
                                    </button>
                                    <div class="dropdown-divider"></div>
                                    <button onclick="App.deleteCustomList('${filter}')" class="dropdown-item danger">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                        Excluir Lista
                                    </button>
                                </div>
                            </div>
                        `;
                    } else {
                        labelText = 'Carregando lista...';
                    }
                }

                h1.textContent = labelText;
                
                const headerLeft = h1.closest('.header-left');
                if (headerLeft) {
                    const existingActions = headerLeft.querySelector('.list-actions-dropdown');
                    if (existingActions) {
                        existingActions.remove();
                    }
                    if (extraAction) {
                        h1.insertAdjacentHTML('afterend', extraAction);
                    }
                }
            }
        }

        this.render();
        this.renderFormatFilters();
    },

    checkFormatFilter(book, f, currentTab) {
        if (f === 'all') return true;

        if (['physical', 'ebook', 'audiobook'].includes(f)) {
            if (['read', 'reading', 're-reading', 'rereading'].includes(currentTab)) {
                if (book.readFormat) {
                    const readFormats = Array.isArray(book.readFormat) ? book.readFormat : [book.readFormat];
                    const validReadFormats = readFormats.filter(fmt => fmt);
                    if (validReadFormats.length > 0) {
                        return validReadFormats.includes(f);
                    }
                }
            }
            return book.tags && book.tags.includes(f);
        }

        if (f === 'no-format') {
            if (['read', 'reading', 're-reading', 'rereading'].includes(currentTab)) {
                const readFormats = book.readFormat ? (Array.isArray(book.readFormat) ? book.readFormat : [book.readFormat]) : [];
                const validReadFormats = readFormats.filter(fmt => fmt && ['physical', 'ebook', 'audiobook'].includes(fmt));
                return validReadFormats.length === 0;
            }
            
            const hasGeneralFormat = book.tags && book.tags.some(tag => ['physical', 'ebook', 'audiobook'].includes(tag));
            return !hasGeneralFormat;
        }

        if (['read', 'reading', 'want-to-read', 're-reading', 'abandoned'].includes(f)) {
            return book.status === f;
        }
        
        if (['owned', 'favorite', 'desired'].includes(f)) {
            return book.tags && book.tags.includes(f);
        }

        if (f === '5-stars') return book.rating === 5;
        if (f === '4-stars') return book.rating >= 4;

        if (['started', 'halfway', 'final-stretch', 'early', 'late'].includes(f)) {
            const prog = this.calculateProgress(book);
            if (f === 'started') return prog > 0 && prog < 25;
            if (f === 'halfway') return prog >= 25 && prog <= 75;
            if (f === 'final-stretch') return prog > 75 && prog < 100;
            if (f === 'early') return prog < 20;
            if (f === 'late') return prog > 50;
            return false;
        }

        if (!isNaN(f) && f.length === 4) {
            return book.goalYear && book.goalYear.toString() === f;
        }
        if (f === 'completed') return book.status === 'read';
        if (f === 'pending') return book.status !== 'read';

        if (f === 'short') return book.pages > 0 && book.pages < 200;
        if (f === 'long') return book.pages > 500;

        return true;
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
                if (this.state.filter.startsWith('list_')) {
                    const listId = this.state.filter;
                    return book.customLists && book.customLists.includes(listId);
                }
                return book.status === this.state.filter || (book.tags && book.tags.includes(this.state.filter));
            });
        }

        if (this.state.formatFilter !== 'all') {
            const f = this.state.formatFilter;
            filtered = filtered.filter(book => this.checkFormatFilter(book, f, this.state.filter));
        }

        return filtered;
    },

    renderFormatFilters() {
        const container = document.getElementById('formatFilters');
        if (!container) return;

        let formats = [];

        switch(this.state.filter) {
            case 'read':
                formats = [
                    { id: 'all', label: 'Todos os Formatos' },
                    { id: 'physical', label: 'Físicos' },
                    { id: 'ebook', label: 'Ebooks' },
                    { id: 'audiobook', label: 'Audiobooks' },
                    { id: 'no-format', label: 'Sem formato' },
                    { id: '5-stars', label: `Favoritos (5 ${starSvg})` },
                    { id: '4-stars', label: `Recomendados (4 ${starSvg}+)` }
                ];
                break;
            case 'reading':
            case 're-reading':
                formats = [
                    { id: 'all', label: 'Todos' },
                    { id: 'started', label: 'Iniciado (<25%)' },
                    { id: 'halfway', label: 'Na Metade (25-75%)' },
                    { id: 'final-stretch', label: 'Reta Final (>75%)' }
                ];
                break;
            case 'want-to-read':
                formats = [
                    { id: 'all', label: 'Todos' },
                    { id: 'owned', label: 'Tenho' },
                    { id: 'desired', label: 'Desejado' },
                    { id: 'short', label: 'Curtos (<200p)' },
                    { id: 'long', label: 'Tijolaços (>500p)' }
                ];
                break;
            case 'owned':
                formats = [
                    { id: 'all', label: 'Todos' },
                    { id: 'physical', label: 'Físico' },
                    { id: 'ebook', label: 'Ebook' },
                    { id: 'audiobook', label: 'Audiobook' },
                    { id: 'no-format', label: 'Sem formato' }
                ];
                break;
            case 'lent':
                formats = [
                    { id: 'all', label: 'Todos' },
                    { id: 'read', label: 'Lido' },
                    { id: 'want-to-read', label: 'Quero ler' }
                ];
                break;
            case 'favorite':
            case 'physical':
            case 'ebook':
            case 'audiobook':
            case 'borrowed':
                formats = [
                    { id: 'all', label: 'Todos' },
                    { id: 'read', label: 'Lido' },
                    { id: 'reading', label: 'Lendo' },
                    { id: 'want-to-read', label: 'Quero ler' }
                ];
                break;
            case 'abandoned':
                formats = [
                    { id: 'all', label: 'Todos' },
                    { id: 'early', label: 'Início (<20%)' },
                    { id: 'late', label: 'Quase lá (>50%)' },
                    { id: 'physical', label: 'Físicos' },
                    { id: 'ebook', label: 'Ebooks' },
                    { id: 'audiobook', label: 'Audiobook' },
                    { id: 'no-format', label: 'Sem formato' }
                ];
                break;
            case 'desired':
                formats = [
                    { id: 'all', label: 'Todos' },
                    { id: 'physical', label: 'Físicos' },
                    { id: 'ebook', label: 'Ebooks' },
                    { id: 'no-format', label: 'Sem formato' },
                    { id: 'short', label: 'Curtos (<200p)' },
                    { id: 'long', label: 'Tijolaços (>500p)' }
                ];
                break;
            case 'target':
                const targetYears = [...new Set(this.state.books
                    .filter(b => b.goalYear && b.tags && b.tags.includes('target'))
                    .map(b => b.goalYear.toString())
                )].sort((a, b) => b - a);

                formats = [{ id: 'all', label: 'Todas as Metas' }];
                targetYears.forEach(year => {
                    formats.push({ id: year, label: `Meta ${year}` });
                });
                formats.push({ id: 'completed', label: 'Concluídas' });
                formats.push({ id: 'pending', label: 'Pendentes' });
                break;
            case 'all':
                formats = [
                    { id: 'all', label: 'Todos os Formatos' },
                    { id: 'physical', label: 'Físicos' },
                    { id: 'ebook', label: 'Ebooks' },
                    { id: 'audiobook', label: 'Audiobooks' },
                    { id: 'no-format', label: 'Sem formato' }
                ];
                break;
        }

        if (formats.length > 0) {
            let booksInTab = [...this.state.books];
            if (this.state.filter !== 'all') {
                booksInTab = booksInTab.filter(book => book.status === this.state.filter || (book.tags && book.tags.includes(this.state.filter)));
            }

            formats = formats.filter(f => {
                if (f.id === 'all') return true;
                return booksInTab.some(book => this.checkFormatFilter(book, f.id, this.state.filter));
            });

            if (formats.length <= 1) {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'flex';
            
            if (!formats.find(f => f.id === this.state.formatFilter)) {
                this.state.formatFilter = 'all';
            }

            container.innerHTML = formats.map(format => 
                `<button class="chip ${this.state.formatFilter === format.id ? 'active' : ''}" data-format="${format.id}">${format.label}</button>`
            ).join('');
        } else {
            container.style.display = 'none';
            this.state.formatFilter = 'all'; 
            container.innerHTML = '';
        }
    },

    renderCustomLists() {
        const container = document.getElementById('customListsContainer');
        if (!container) return;

        let displayLists = rm.lists.filter(l => !l.id.startsWith('sys_'));
        
        displayLists.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 999999;
            const orderB = b.order !== undefined ? b.order : 999999;
            if (orderA !== orderB) return orderA - orderB;
            return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        });

        if (!displayLists || displayLists.length === 0) {
            container.innerHTML = '<div style="padding: 0.5rem 1rem; color: var(--text-muted); font-size: 0.85rem;">Nenhuma lista criada.</div>';
            return;
        }

        const listsHTML = displayLists.map(list => {
            const count = this.state.books.filter(b => b.customLists && b.customLists.includes(list.id)).length;
            const isActive = this.state.filter === list.id ? 'active' : '';
            return `
                <a href="javascript:void(0)" class="nav-item ${isActive}" data-filter="${list.id}" draggable="false" ondragstart="return false;">
                    <div class="nav-icon drag-handle" style="color: var(--text-muted); cursor: grab;" title="Arraste para reordenar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <line x1="3" y1="6" x2="3.01" y2="6"></line>
                            <line x1="3" y1="12" x2="3.01" y2="12"></line>
                            <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                    </div>
                    <span class="nav-label" title="${list.name}">${list.name}</span>
                    <span class="nav-count">${count}</span>
                </a>
            `;
        }).join('');

        container.innerHTML = listsHTML;

        const listItems = container.querySelectorAll('.nav-item');
        listItems.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const filter = e.currentTarget.dataset.filter;
                this.setFilter(filter);

                this.dom.sidebarLinks.forEach(l => l.classList.remove('active'));
                listItems.forEach(l => l.classList.remove('active'));
                
                e.currentTarget.classList.add('active');

                if (window.innerWidth <= 768) {
                    this.dom.sidebar.classList.remove('active');
                    this.dom.sidebarOverlay.classList.remove('active');
                }
            });
        });

        if (typeof Sortable !== 'undefined') {
            if (this.customListsSortable) {
                this.customListsSortable.destroy();
            }
            this.customListsSortable = Sortable.create(container, {
                animation: 150,
                handle: '.nav-icon',
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                forceFallback: true,
                fallbackClass: 'sortable-fallback',
                fallbackOnBody: true,
                delay: window.innerWidth <= 768 ? 200 : 0,
                delayOnTouchOnly: true,
                onStart: () => {
                    document.body.classList.add('is-dragging');
                },
                onEnd: (evt) => {
                    setTimeout(() => document.body.classList.remove('is-dragging'), 50);
                    const items = container.querySelectorAll('.nav-item');
                    items.forEach((item, index) => {
                        const listId = item.dataset.filter;
                        const listObj = rm.lists.find(l => l.id === listId);
                        if (listObj && listObj.order !== index) {
                            listObj.order = index;
                            rm.updateList(listId, { order: index });
                        }
                    });
                }
            });
        }
    },

    renderCustomListsCheckboxes(selectedLists = []) {
        const container = document.getElementById('customListsCheckboxes');
        const row = document.getElementById('rowCustomLists');
        if (!container || !row) return;

        if (!rm.lists || rm.lists.length === 0) {
            row.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        let sortedLists = [...rm.lists];
        sortedLists.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 999999;
            const orderB = b.order !== undefined ? b.order : 999999;
            if (orderA !== orderB) return orderA - orderB;
            return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        });

        row.style.display = 'flex';
        const html = sortedLists.map(list => {
            return `
                <label class="tag-checkbox">
                    <input type="checkbox" name="customLists" value="${list.id}" hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                    <span>${list.name}</span>
                </label>
            `;
        });
        
        container.innerHTML = html.join('');
        
        document.querySelectorAll('input[name="customLists"]').forEach(cb => {
            cb.checked = selectedLists.includes(cb.value);
        });
    },

    shareList(listId) {
        if (!auth.currentUser) return;
        
        let path = window.location.pathname;
        if (!path.includes('.html') && !path.endsWith('/')) {
            path += '/share.html';
        } else if (!path.includes('.html')) {
            path += 'share.html';
        } else {
            path = path.replace(/[^/]*\.html$/, 'share.html');
        }
        
        const url = window.location.origin + path + '?u=' + auth.currentUser.uid + '&list=' + listId;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                this.showMessage('Link Copiado!', 'O link para sua lista foi copiado para a área de transferência. Agora é só enviar para os amigos!', '🔗');
            }).catch(() => {
                this.showMessage('Link para Compartilhar', `Copie o link abaixo para compartilhar:\n\n${url}`, '🔗');
            });
        } else {
            this.showMessage('Link para Compartilhar', `Copie o link abaixo para compartilhar:\n\n${url}`, '🔗');
        }
    },
    renameCustomList(listId) {
        const listObj = rm.lists.find(l => l.id === listId);
        if (!listObj) return;

        const renameInput = document.getElementById('renameListName');
        const renameIdInput = document.getElementById('renameListId');
        
        if (renameInput && renameIdInput && this.dom.renameListModal) {
            renameIdInput.value = listId;
            renameInput.value = listObj.name;
            this.dom.renameListModal.classList.add('active');
            setTimeout(() => renameInput.focus(), 100);
        }
    },

    deleteCustomList(listId) {
        const listObj = rm.lists.find(l => l.id === listId);
        if (!listObj) return;

        this.openDeleteModal(`Tem certeza que deseja excluir a lista "${listObj.name}"? Isso não apagará os livros, apenas removerá eles desta lista.`, () => {
            rm.deleteList(listId);
            
            const updates = {};
            this.state.books.forEach(book => {
                if (book.customLists && book.customLists.includes(listId)) {
                    book.customLists = book.customLists.filter(id => id !== listId);
                    updates[book.id] = { customLists: book.customLists };
                }
            });

            if (Object.keys(updates).length > 0) {
                rm.updateMultiple(updates);
            }

            this.setFilter('all');
            this.refresh();
        });
    },

    handleEscKey(e) {
        if (e.key === 'Escape') {
            if (e.repeat) return;

            const activeModals = Array.from(document.querySelectorAll('.modal.active'));

            if (activeModals.length > 0) {
                e.preventDefault();
                e.stopImmediatePropagation();

                const topModal = activeModals.sort((a, b) => {
                    const zA = parseInt(window.getComputedStyle(a).zIndex) || 0;
                    const zB = parseInt(window.getComputedStyle(b).zIndex) || 0;
                    return zB - zA;
                })[0];

                if (topModal) {
                    const closeBtn = topModal.querySelector('.modal-close') ||
                        topModal.querySelector('.btn-secondary[id^="cancel"]') ||
                        topModal.querySelector('.modal-footer .btn-secondary') ||
                        topModal.querySelector('#messageOkBtn');

                    if (closeBtn) {
                        closeBtn.click();
                    } else {
                        topModal.classList.remove('active');
                        const remainingModals = document.querySelectorAll('.modal.active').length;
                        if (remainingModals === 0) {
                            App.toggleBodyScroll(false);
                        }
                    }
                }
            }
        }
    },



    render() {
        if (this.state.filter === 'recommended') {
            this.renderRecommendationsTab();
            return;
        }

        const toolbarRight = document.querySelector('.toolbar-right');
        if (toolbarRight) {
            const searchWrapper = toolbarRight.querySelector('.search-wrapper');
            const sortContainer = toolbarRight.querySelector('.sort-dropdown-container');
            if (searchWrapper) searchWrapper.style.display = 'flex';
            if (sortContainer) sortContainer.style.display = 'block';
            this.dom.addBtn.style.display = 'flex';
            
            const btnGerar = document.getElementById('btnGerarRecomendacoes');
            if (btnGerar) btnGerar.style.display = 'none';
        }
        
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

        const isCustomizable = this.state.filter === 'want-to-read' || (this.state.filter && this.state.filter.startsWith('list_'));
        const canDrag = this.state.sortBy === 'custom' && 
                        isCustomizable && 
                        !this.state.searchQuery && 
                        this.state.formatFilter === 'all';

        let effectiveItemsPerPage = this.state.itemsPerPage;
        if (canDrag) {
            effectiveItemsPerPage = 999999;
        }

        const totalItems = sorted.length;
        const totalPages = Math.ceil(totalItems / effectiveItemsPerPage);

        if (this.state.currentPage > totalPages) this.state.currentPage = totalPages || 1;
        if (this.state.currentPage < 1) this.state.currentPage = 1;

        const start = (this.state.currentPage - 1) * effectiveItemsPerPage;
        const end = start + effectiveItemsPerPage;
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
            
            const escTitle = escapeHTML(book.title);
            const escAuthor = escapeHTML(book.author);

            card.innerHTML = `
            <div class="book-cover-container ${isPlaceholder ? 'is-placeholder' : 'skeleton'}">
                <img src="${book.cover}" loading="lazy" alt="${escTitle}" class="book-cover" style="${isPlaceholder ? 'display:none' : ''}" onload="this.parentElement.classList.remove('skeleton')" onerror="this.style.display='none'; this.nextElementSibling.classList.add('visible'); this.parentElement.classList.add('is-placeholder'); this.parentElement.classList.remove('skeleton')">
                
                <div class="book-cover-placeholder ${isPlaceholder ? 'visible' : ''}">
                    <div class="placeholder-title">${escTitle}</div>
                    <div class="placeholder-author">${escAuthor}</div>
                </div>

                <svg class="bookmark-icon" viewBox="0 0 24 32" fill="currentColor">
                    <path d="M0 0h24v32l-12-8-12 8z"/>
                </svg>
                <div class="title-overlay">${escTitle}</div>

                <button class="quick-add-btn" data-id="${book.id}" title="Ações Rápidas (Progresso/Anotações)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            </div>
            
            <div class="book-footer">
                <div class="reading-progress">
                    ${this.calculateProgress(book)}%
                </div>
                <div class="book-rating">
                    ${starSvg} ${book.rating > 0 ? book.rating.toFixed(1) : '-'}
                </div>
            </div>
        `;

            this.dom.grid.appendChild(card);
        });

        if (this.sortableInstance) {
            this.sortableInstance.destroy();
            this.sortableInstance = null;
        }

        if (canDrag) {
            this.dom.grid.classList.add('is-sortable');
        } else {
            this.dom.grid.classList.remove('is-sortable');
        }

        if (canDrag && window.Sortable) {
            this.sortableInstance = Sortable.create(this.dom.grid, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                forceFallback: true,
                fallbackClass: 'sortable-fallback',
                fallbackOnBody: true,
                scroll: true,
                scrollSensitivity: 120,
                scrollSpeed: 30,
                bubbleScroll: true,
                delay: window.innerWidth <= 768 ? 200 : 0,
                delayOnTouchOnly: true,
                onStart: () => {
                    document.body.classList.add('is-dragging');
                },
                onEnd: (evt) => {
                    setTimeout(() => document.body.classList.remove('is-dragging'), 50);
                    if (evt.oldIndex === evt.newIndex) return;

                    const listId = this.state.filter === 'want-to-read' ? 'sys_want_to_read' : this.state.filter;
                    const absoluteOldIndex = (this.state.currentPage - 1) * effectiveItemsPerPage + evt.oldIndex;
                    const absoluteNewIndex = (this.state.currentPage - 1) * effectiveItemsPerPage + evt.newIndex;
                    
                    const newSortedIds = sorted.map(b => b.id);
                    const [moved] = newSortedIds.splice(absoluteOldIndex, 1);
                    newSortedIds.splice(absoluteNewIndex, 0, moved);
                    
                    const existingList = rm.lists.find(l => l.id === listId);
                    if (existingList) {
                        rm.updateList(listId, { bookOrder: newSortedIds });
                    } else {
                        const newList = {
                            id: listId,
                            name: 'System Order',
                            createdAt: new Date().toISOString(),
                            bookOrder: newSortedIds
                        };
                        rm.lists.push(newList);
                        if (auth.currentUser) {
                            db.collection('library_data').doc(auth.currentUser.uid)
                                .collection('lists').doc(listId)
                                .set(newList).catch(e => console.error('Sync error:', e));
                        }
                    }
                }
            });
        }
    },

    sortBooks(books) {
        const isCustomizable = this.state.filter === 'want-to-read' || (this.state.filter && this.state.filter.startsWith('list_'));
        if (this.state.sortBy === 'custom' && isCustomizable) {
            const listId = this.state.filter === 'want-to-read' ? 'sys_want_to_read' : this.state.filter;
            const list = rm.lists.find(l => l.id === listId);
            if (list && list.bookOrder) {
                return [...books].sort((a, b) => {
                    const indexA = list.bookOrder.indexOf(a.id);
                    const indexB = list.bookOrder.indexOf(b.id);
                    const posA = indexA !== -1 ? indexA : 999999;
                    const posB = indexB !== -1 ? indexB : 999999;
                    if (posA !== posB) return posA - posB;
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });
            }
        }

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

    handleGridClick(e) {
        if (document.body.classList.contains('is-dragging')) {
            e.stopPropagation();
            e.preventDefault();
            return;
        }

        const target = e.target;

        const btnQuickAdd = target.closest('.quick-add-btn');
        if (btnQuickAdd) {
            e.stopPropagation();
            this.openQuickActionModal(btnQuickAdd.dataset.id, 'history');
            return;
        }

        const bookCoverContainer = target.closest('.book-cover-container');
        if (bookCoverContainer) {
            e.stopPropagation();
            const btn = bookCoverContainer.querySelector('.quick-add-btn');
            if (btn) {
                this.editBook(btn.dataset.id);
            }
            return;
        }
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

    toggleBodyScroll(active) {
        if (active) {
            document.body.style.overflow = 'hidden';
        } else {
            const activeModals = document.querySelectorAll('.modal.active');
            if (activeModals.length === 0) {
                document.body.style.overflow = '';
            }
        }
    },

    openModal(modalElement) {
        if (this.closeModalTimer) {
            clearTimeout(this.closeModalTimer);
            this.closeModalTimer = null;
        }
        const modal = modalElement || this.dom.modal;

        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) {
            modalBody.scrollTop = 0;
        } else {
            modal.scrollTop = 0;
        }

        modal.classList.add('active');
        this.toggleBodyScroll(true);
    },

    closeModal() {
        this.dom.modal.classList.remove('active');
        this.toggleBodyScroll(false);

        if (this.closeModalTimer) clearTimeout(this.closeModalTimer);

        this.closeModalTimer = setTimeout(() => {
            this.dom.bookForm.reset();
            this.dom.apiResults.classList.remove('active');
            this.dom.apiResults.innerHTML = '';
            this.dom.apiSearch.value = '';
            document.getElementById('modalTitle').textContent = 'Adicionar Livro';
            document.getElementById('deleteBookBtn').style.display = 'none';
            document.getElementById('bookId').value = '';
            if (this.dom.searchRow) this.dom.searchRow.style.display = 'flex';
            if (this.dom.formDivider) this.dom.formDivider.style.display = 'flex';

            const groupGoalYear = document.getElementById('groupGoalYear');
            const groupLoanInfo = document.getElementById('groupLoanInfo');
            if (groupGoalYear) groupGoalYear.style.display = 'none';
            if (groupLoanInfo) groupLoanInfo.style.display = 'none';
            document.getElementById('loanDetails').value = '';
            if (this.loanDatePicker) this.loanDatePicker.clear();
            else document.getElementById('loanDate').value = '';

            const defaultOption = this.dom.customOptions[0];
            if (defaultOption) defaultOption.click();
        }, 300);
    },

    async handleAPISearch(query) {
        if (!query || query.trim().length < 3) {
            this.dom.apiResults.classList.remove('active');
            return;
        }
        
        if (this.apiSearchTimeout) clearTimeout(this.apiSearchTimeout);
        
        this.apiSearchTimeout = setTimeout(async () => {
            this.dom.apiResults.innerHTML = '<div class="api-loading">Buscando na nuvem...</div>';
            this.dom.apiResults.classList.add('active');

            try {
                const results = await Promise.allSettled([
                    GoogleBooksAPI.search(query),
                    OpenLibraryAPI.search(query)
                ]);

                const gBooks = results[0].status === 'fulfilled' ? results[0].value : [];
                const olBooks = results[1].status === 'fulfilled' ? results[1].value : [];

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
                this.renderAPISearchResults(combined);
            } catch (error) {
                console.error('API Search error:', error);
                this.dom.apiResults.innerHTML = '<div class="api-loading">Erro na busca.</div>';
            }
        }, 500);
    },

    renderAPISearchResults(books) {
        if (books.length === 0) {
            this.dom.apiResults.innerHTML = '<div class="api-loading">Nenhum livro encontrado.</div>';
            return;
        }

        let html = '';
        books.forEach(book => {
            const info = book.volumeInfo;
            let coverUrl = '';
            if (info.imageLinks) {
                const thumb = info.imageLinks.thumbnail || info.imageLinks.smallThumbnail;
                if (thumb) coverUrl = thumb.replace('http:', 'https:');
            }
            const finalCover = (coverUrl && coverUrl !== 'null') ? coverUrl : '';
            
            const title = info.title || 'Título desconhecido';
            const author = info.authors ? info.authors.join(', ') : 'Autor desconhecido';
            
            const escTitle = escapeHTML(title);
            const escAuthor = escapeHTML(author);

            const isPlaceholder = !info.imageLinks;

            html += `
                <div class="api-result-item" onclick="App.selectBookFromAPI('${book.id}')">
                    <div class="api-result-cover-container ${isPlaceholder ? 'is-placeholder' : ''}">
                         <img src="${finalCover}" class="api-result-cover" loading="lazy" alt="${escTitle}" 
                              style="${isPlaceholder ? 'display:none' : ''}" 
                              onerror="this.style.display='none'; this.nextElementSibling.classList.add('visible'); this.parentElement.classList.add('is-placeholder');">
                         
                         <div class="book-cover-placeholder ${isPlaceholder ? 'visible' : ''}" style="border-radius: 4px;">
                            <div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.5;">
                                   <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                                   <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                                </svg>
                            </div>
                         </div>
                    </div>
                    <div class="api-result-info">
                        <div class="api-result-title">${escTitle}</div>
                        <div class="api-result-author">${escAuthor}</div>
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

        this.dom.modalTitle.textContent = 'Editar Livro';

        if (this.dom.searchRow) this.dom.searchRow.style.display = 'none';
        if (this.dom.formDivider) this.dom.formDivider.style.display = 'none';

        this.dom.bookId.value = book.id;
        this.dom.bookTitle.value = book.title;
        this.dom.bookAuthor.value = book.author;
        this.dom.bookPages.value = book.pages;
        this.dom.bookCover.value = book.cover;

        if (this.datePicker) {
            let displayDate = null;
            if (book.readDate && book.readDate !== '1970-01-01') {
                displayDate = book.readDate.includes('T') ? book.readDate : book.readDate + 'T12:00:00';
            }
            this.datePicker.setDate(displayDate);
        } else if (this.dom.bookReadDate) {
            this.dom.bookReadDate.value = (book.readDate && book.readDate !== '1970-01-01') ? book.readDate.split('T')[0] : '';
        }

        this.dom.statusHiddenInput.value = book.status;

        if (this.dom.groupReadDate) {
            this.dom.groupReadDate.style.display = (book.status === 'read') ? '' : 'none';
        }

        const isReadStatus = ['read', 'reading', 're-reading', 'rereading'].includes(book.status);

        if (this.dom.groupRating) {
            this.dom.groupRating.style.display = (book.status === 'read') ? '' : 'none';
            if (this.dom.bookRating) this.dom.bookRating.value = book.rating || 0;
            if (this.updateStarRatingWidget) {
                this.updateStarRatingWidget(book.rating || 0);
            }
        }

        if (this.dom.rowReadFormat) {
            this.dom.rowReadFormat.style.display = isReadStatus ? '' : 'none';
            const readFormats = Array.isArray(book.readFormat) ? book.readFormat : (book.readFormat ? [book.readFormat] : []);
            document.querySelectorAll('input[name="readFormat"]').forEach(cb => {
                cb.checked = readFormats.includes(cb.value);
            });
        }

        const matchingOption = Array.from(this.dom.customOptions).find(op => op.dataset.value === book.status);
        if (matchingOption) {
            this.dom.triggerText.textContent = matchingOption.dataset.label;
            this.dom.triggerIndicator.className = `status-indicator ${matchingOption.dataset.class}`;

            this.dom.customOptions.forEach(op => op.classList.remove('selected'));
            matchingOption.classList.add('selected');
        }

        const groupTimesRead = document.getElementById('groupTimesRead');
        if (groupTimesRead) {
            const isActiveRead = ['read', 'reading', 're-reading', 'rereading'].includes(book.status);
            groupTimesRead.style.display = isActiveRead ? 'flex' : 'none';
            
            const historyFinishes = (book.history || []).filter(h => h.type === 'finish').length;
            
            const totalTimesRead = (book.timesRead || 0) + historyFinishes;
            
            const input = document.getElementById('bookTimesRead');
            input.value = totalTimesRead;
            input.disabled = true;
        }

        document.querySelectorAll('input[name="tags"]').forEach(checkbox => {
            checkbox.checked = book.tags.includes(checkbox.value);
        });

        this.renderCustomListsCheckboxes(book.customLists || []);

        document.getElementById('modalTitle').textContent = 'Editar Livro';

        document.getElementById('bookGoalYear').value = book.goalYear || '';
        const targetCheckbox = document.querySelector('input[name="tags"][value="target"]');
        const groupGoalYear = document.getElementById('groupGoalYear');
        if (targetCheckbox && groupGoalYear) {
            groupGoalYear.style.display = targetCheckbox.checked ? 'flex' : 'none';
        }

        document.getElementById('loanDetails').value = book.loanDetails || '';
        if (this.loanDatePicker) {
            this.loanDatePicker.setDate(book.loanDate || null);
        } else {
            document.getElementById('loanDate').value = book.loanDate || '';
        }
        
        const borrowedCheckbox = document.querySelector('input[name="tags"][value="borrowed"]');
        const lentCheckbox = document.querySelector('input[name="tags"][value="lent"]');
        const groupLoanInfo = document.getElementById('groupLoanInfo');
        const lblLoanDetails = document.getElementById('lblLoanDetails');
        
        if (borrowedCheckbox.checked || lentCheckbox.checked) {
            groupLoanInfo.style.display = 'flex';
            const lblLoanDate = document.getElementById('lblLoanDate');
            lblLoanDate.textContent = borrowedCheckbox.checked ? 'Peguei em' : 'Emprestei em';
            lblLoanDetails.textContent = borrowedCheckbox.checked ? 'De quem você pegou?' : 'Para quem você emprestou?';
        } else {
            groupLoanInfo.style.display = 'none';
        }

        if (this.dom.btnOpenHistoryFromModal) {
            this.dom.btnOpenHistoryFromModal.style.display = 'flex';
        }

        const deleteBookBtn = document.getElementById('deleteBookBtn');
        if (deleteBookBtn) {
            deleteBookBtn.style.display = 'inline-flex';
            deleteBookBtn.dataset.id = book.id;
        }

        this.openModal();
    },

    handleBookSubmit() {
        const id = this.dom.bookId.value;
        const title = this.dom.bookTitle.value.trim();
        const author = this.dom.bookAuthor.value.trim();
        const pages = this.dom.bookPages.value;
        const status = this.dom.statusHiddenInput.value;

        if (!title || !author) {
            this.showMessage('Campos Obrigatórios', 'Por favor, preencha o título e o autor.', '⚠️');
            return;
        }

        const submitBtn = this.dom.bookForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            setTimeout(() => { if (submitBtn) submitBtn.disabled = false; }, 2000);
        }

        const readDateVal = this.dom.bookReadDate.value;

        let processedCover = this.dom.bookCover.value.trim();
        if (processedCover.includes('drive.google.com')) {
            const fileIdMatch = processedCover.match(/\/d\/([a-zA-Z0-9_-]+)/);
            const ucIdMatch = processedCover.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            const id = fileIdMatch ? fileIdMatch[1] : (ucIdMatch ? ucIdMatch[1] : null);
            
            if (id && !processedCover.includes('thumbnail?id=')) {
                processedCover = `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
            }
        }

        const formData = {
            title: title,
            author: author,
            pages: pages,
            status: status,
            cover: processedCover,
            readDate: readDateVal || null,
            rating: this.dom.bookRating.value || 0,
            goalYear: this.dom.bookGoalYear.value || null,
            loanDetails: this.dom.loanDetails.value || '',
            loanDate: this.dom.loanDate.value || null,
            timesRead: parseInt(this.dom.bookTimesRead.value) || 0,
            readFormat: [],
            tags: []
        };

        formData.customLists = [];
        document.querySelectorAll('input[name="customLists"]:checked').forEach(checkbox => {
            formData.customLists.push(checkbox.value);
        });

        const isReadOrReread = ['read', 're-reading', 'rereading'].includes(formData.status);
        if (isReadOrReread && !formData.readDate) {
            formData.readDate = '1970-01-01';
        }

        if (['read', 're-reading', 'rereading'].includes(formData.status) && formData.timesRead === 0) {
            formData.timesRead = 1;
        }

        document.querySelectorAll('input[name="readFormat"]:checked').forEach(checkbox => {
            formData.readFormat.push(checkbox.value);
        });

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
                
                const historyFinishes = (existingBook.history || []).filter(h => h.type === 'finish').length;
                let newTimesRead = Math.max(0, (parseInt(formData.timesRead) || 0) - historyFinishes);
                
                let history = existingBook.history || [];

                if (newStatus === 'read' && oldStatus !== 'read') {
                    newReadPages = parseInt(formData.pages) || 0;
                    history.push({
                        id: `auto_fi_${Date.now()}`,
                        date: new Date().toISOString(),
                        page: newReadPages,
                        type: 'finish'
                    });
                } else if (newStatus === 'reading' && oldStatus === 'read') {
                    newReadPages = 0;
                    const lastFinishIndex = [...history].reverse().findIndex(h => h.type === 'finish');
                    if (lastFinishIndex !== -1) {
                        const actualIndex = history.length - 1 - lastFinishIndex;
                        history.splice(actualIndex, 1);
                    }
                } else if (isRereading && oldStatus === 'read') {
                    newReadPages = 0;
                    history.push({
                        id: `auto_st_${Date.now()}`,
                        date: new Date().toISOString(),
                        page: 0,
                        type: 'start'
                    });
                } else if (isRereading && !wasRereading && oldStatus !== 'read') {
                    newReadPages = 0;
                    history.push({
                        id: `auto_st_${Date.now()}`,
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
                    title: (formData.title || '').trim() || existingBook.title,
                    author: (formData.author || '').trim() || existingBook.author,
                    pages: parseInt(formData.pages) || 0,
                    readPages: newReadPages,
                    timesRead: newTimesRead,
                    history: history,
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
                year: formData.readDate ? parseInt(formData.readDate.split('-')[0]) : new Date().getFullYear(),
                goalYear: formData.tags.includes('target') ? (formData.goalYear ? parseInt(formData.goalYear) : new Date().getFullYear()) : null
            };
            const newBook = BookModel.create(newBookData);
            
            const initialStatus = newBook.status;
            const pagesTotal = parseInt(newBook.pages) || 0;
            const now = new Date().toISOString();
            const logDate = formData.readDate
                ? (formData.readDate.includes('T') ? formData.readDate : formData.readDate + 'T12:00:00') 
                : now;

            if (initialStatus === 'read') {
                newBook.history.push({ id: `auto_st_${Date.now()}`, date: logDate, type: 'start', page: 0 });
                newBook.history.push({ id: `auto_fi_${Date.now()}`, date: logDate, type: 'finish', page: pagesTotal });
                newBook.readPages = pagesTotal;
            } else if (initialStatus === 'reading' || initialStatus === 're-reading' || initialStatus === 'rereading') {
                newBook.history.push({ id: `auto_st_${Date.now()}`, date: now, type: 'start', page: 0 });
                newBook.readPages = 0;
            }

            const newHistoryFinishes = newBook.history.filter(h => h.type === 'finish').length;
            newBook.timesRead = Math.max(0, formData.timesRead - newHistoryFinishes);

            rm.add(newBook);
        }

        this.refresh();
        this.closeModal();
    },

    showNotesListView() {
        document.getElementById('notesListView').style.display = 'flex';
        document.getElementById('notesFormView').style.display = 'none';
        this.dom.notesForm.reset();
        document.getElementById('noteId').value = '';
    },

    showNotesFormView(note = null) {
        document.getElementById('notesListView').style.display = 'none';
        document.getElementById('notesFormView').style.display = 'flex';

        if (note) {
            document.getElementById('noteId').value = note.id;
            document.getElementById('noteContent').value = note.content;
            document.getElementById('noteLocation').value = note.location || '';
        } else {
            document.getElementById('noteId').value = '';
            this.dom.notesForm.reset();
        }
        setTimeout(() => document.getElementById('noteContent').focus(), 50);
    },

    async openQuickActionModal(bookId, tab = 'history') {
        const book = this.state.books.find(b => b.id === bookId);
        if (!book) return;

        this.state.currentBookTitle = book.title;
        
        this.dom.historyBookId.value = bookId;
        this.dom.historyTotalPages.value = book.pages;
        this.dom.historyBookTitle.textContent = book.title;
        this.showHistoryListView();
        this.renderHistoryList(book);
        this.updateModalProgressHeader(book);

        this.dom.notesBookId.value = bookId;
        this.showNotesListView();
        this.renderNotesList(book.notes || []);

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
        if(tabBtn) tabBtn.classList.add('active');
        
        document.querySelectorAll('.quick-action-tab-content').forEach(content => content.style.display = 'none');
        const tabContent = document.getElementById(`tab-${tab}`);
        if(tabContent) tabContent.style.display = 'flex';

        this.dom.quickActionModal.style.zIndex = '1050';
        this.openModal(this.dom.quickActionModal);
        
        const tabBtns = this.dom.quickActionModal.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.click();
            }
        });
    },

    showHistoryListView() {
        document.getElementById('historyListView').style.display = 'flex';
        document.getElementById('historyFormView').style.display = 'none';
        this.dom.historyForm.reset();
        document.getElementById('historyEntryId').value = '';
    },

    showHistoryFormView(entry = null) {
        document.getElementById('historyListView').style.display = 'none';
        document.getElementById('historyFormView').style.display = 'flex';

        if (entry) {
            this.dom.historyEntryId.value = entry.date;
            this.dom.newCurrentPage.value = entry.page;
            this.dom.historyNoteContent.value = entry.note || '';
            this.dom.isPercentage.checked = false;
            this.dom.lblHistoryInput.textContent = 'Página Atual';
        } else {
            this.dom.historyEntryId.value = '';
            this.dom.historyForm.reset();
            this.dom.isPercentage.checked = false;
            this.dom.lblHistoryInput.textContent = 'Página Atual';
        }
        setTimeout(() => this.dom.newCurrentPage.focus(), 50);
    },

    renderHistoryList(book) {
        if (!book.history || book.history.length === 0) {
            this.dom.historyList.innerHTML = '<div class="empty-msg" style="margin: auto; padding-bottom: 2rem;">Nenhum registro ainda.<br>Que tal registrar sua primeira leitura?</div>';
            return;
        }

        const sortedHistory = [...book.history].sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (dateA - dateB !== 0) return dateB - dateA;
            
            const typeOrder = { 'start': 0, 'progress': 1, 'finish': 2 };
            const orderA = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 1;
            const orderB = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 1;
            return orderB - orderA;
        });

        this.dom.historyList.innerHTML = sortedHistory.map(entry => {
            const dateDisplay = this.formatRelativeDate(entry.date);
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
                <div class="history-item ${entry.type || 'progress'}" style="flex-direction: column; align-items: stretch; gap: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
                        <div class="history-info">
                            <span class="history-icon">${icon}</span>
                            <div class="history-details">
                                <span class="history-date">${dateDisplay}</span>
                                <div class="history-val">
                                    <span class="note-location-tag" style="margin-top: 0;">${label}</span>
                                </div>
                            </div>
                        </div>
                    <div class="history-actions">
                        <div class="action-buttons">
                            <button type="button" class="action-btn edit" onclick="App.editHistoryItem('${book.id}', '${entry.date}')" title="Editar">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button type="button" class="action-btn delete" onclick="App.deleteHistoryItem('${book.id}', '${entry.date}')" title="Excluir">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    </div>
                    ${entry.note ? `
                    <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding-left: 4px; padding-right: 4px;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Comentário</span>
                            <button type="button" class="action-btn" onclick="App.copyHistoryNoteToClipboard('${book.id}', '${entry.date}')" title="Copiar comentário" style="opacity: 0.7;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            </button>
                        </div>
                        <div class="note-text" style="margin-top: 0;">${escapeHTML(entry.note)}</div>
                    </div>` : ''}
                </div>
            `;
        }).join('');
    },

    copyHistoryNoteToClipboard(bookId, dateStr) {
        const book = this.state.books.find(b => b.id === bookId);
        if (!book) return;
        const entry = book.history.find(h => h.date === dateStr);
        if (entry && entry.note) {
            navigator.clipboard.writeText(entry.note).then(() => {
                this.showToast('Comentário copiado!', 'success');
            });
        }
    },

    deleteHistoryItem(bookId, dateStr) {
        const book = this.state.books.find(b => b.id === bookId);
        if (!book) return;

        const entryToDelete = book.history.find(h => h.date === dateStr);
        
        if (entryToDelete) {
            const hasFutureEntries = book.history.some(h => new Date(h.date) > new Date(dateStr));
            
            if (hasFutureEntries) {
                if (entryToDelete.type === 'start') {
                    this.showMessage('Atenção', 'Não é possível excluir o início da leitura enquanto houver progresso registrado depois dele.', '⚠️');
                    return;
                }
                if (entryToDelete.type === 'finish') {
                    this.showMessage('Atenção', 'Não é possível excluir a conclusão de uma leitura anterior. Exclua a releitura atual primeiro.', '⚠️');
                    return;
                }
            }
        }

        this.openDeleteModal('Tem certeza que deseja excluir esse registro?', () => {
            book.history = book.history.filter(h => h.date !== dateStr);
            this.recalculateBookProgress(book);

            rm.update(book.id, book);
            this.refresh();

            const percent = Math.round((book.readPages / book.pages) * 100);
            this.dom.historyProgressText.textContent = `${percent}%`;
            this.dom.historyProgressBar.style.width = `${percent}%`;
            document.getElementById('newCurrentPage').value = book.readPages;

            this.renderHistoryList(book);
        });
    },

    editHistoryItem(bookId, dateStr) {
        const book = this.state.books.find(b => b.id === bookId);
        if (!book) return;

        const entry = book.history.find(h => h.date === dateStr);
        if (entry) {
            this.showHistoryFormView(entry);
        }
    },

    renderHeatMap(dailyPages, year) {
        StatsView.renderHeatMap(dailyPages, year);
    },

    recalculateBookProgress(book) {
        if (!book.history || book.history.length === 0) {
            book.readPages = 0;
            if (['read', 'reading', 're-reading', 'rereading'].includes(book.status)) {
                book.status = 'want-to-read';
            }
            return;
        }

        const sortedHistory = [...book.history].sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (dateA - dateB !== 0) return dateA - dateB;
            
            const typeOrder = { 'start': 0, 'progress': 1, 'finish': 2 };
            const orderA = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 1;
            const orderB = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 1;
            return orderA - orderB;
        });

        const latestEntry = sortedHistory[sortedHistory.length - 1];
        
        const totalFinishes = sortedHistory.filter(h => h.type === 'finish').length;

        if (latestEntry.type === 'finish') {
            book.status = 'read';
            book.readPages = parseInt(book.pages) || 0;
        } else {
            book.readPages = parseInt(latestEntry.page) || 0;
            
            if (totalFinishes > 0) {
                book.status = 're-reading';
            } else {
                book.status = 'reading';
            }
        }
    },

    async handleHistorySubmit(e) {
        e.preventDefault();
        const bookId = document.getElementById('historyBookId').value;
        const entryId = document.getElementById('historyEntryId').value;
        const inputVal = document.getElementById('newCurrentPage').value;
        const noteVal = document.getElementById('historyNoteContent').value.trim();
        const isPercentage = document.getElementById('isPercentage').checked;

        if (inputVal === '') {
            this.showMessage('Atenção', 'Por favor, informe a página ou porcentagem atual.', '⚠️');
            return;
        }

        const submitBtn = this.dom.historyForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            setTimeout(() => { if (submitBtn) submitBtn.disabled = false; }, 1500);
        }

        let val = parseInt(inputVal);
        const book = this.state.books.find(b => b.id === bookId);
        if (!book) return;

        let newPageCount = val;
        if (isPercentage) {
            newPageCount = Math.round((val / 100) * book.pages);
        }

        if (newPageCount > book.pages) newPageCount = book.pages;
        if (newPageCount < 0) newPageCount = 0;

        if (entryId) {
            const entryIndex = book.history.findIndex(h => h.date === entryId);
            if (entryIndex !== -1) {
                const entry = book.history[entryIndex];
                entry.page = newPageCount;
                entry.note = noteVal;
                
                if (newPageCount === book.pages) {
                    entry.type = 'finish';
                    if (!book.readDate) {
                        const now = new Date();
                        book.readDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    }
                } else if (entry.type === 'finish') {
                    entry.type = 'progress';
                }

                this.recalculateBookProgress(book);
                await rm.update(book.id, book);
                this.refresh();
                if (newPageCount === book.pages) return;
            }
        } else {
            let lastHistoryPage = 0;
            if (book.history && book.history.length > 0) {
                const sortedH = [...book.history].sort((a, b) => new Date(a.date) - new Date(b.date));
                lastHistoryPage = sortedH[sortedH.length - 1].page || 0;
            } else {
                lastHistoryPage = book.readPages || 0;
            }

            if (newPageCount === lastHistoryPage) {
                this.showMessage('Atenção', 'O progresso informado é igual ao último registro.', '⚠️');
                return;
            }
            await this.updateProgress(bookId, newPageCount, noteVal);
            if (newPageCount === book.pages) return;
        }
        
        this.renderHistoryList(book); 
        this.updateModalProgressHeader(book);
        this.showHistoryListView();
    },

    calculateProgress(book) {
        const pages = parseInt(book.pages) || 0;
        if (pages <= 0) return 0;
        
        const history = book.history || [];
        if (history.length === 0) {
            if (book.status === 'read') return 100;
            return Math.min(100, Math.round(((parseInt(book.readPages) || 0) / pages) * 100));
        }

        const sortedH = [...history].sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (dateA - dateB !== 0) return dateA - dateB;
            
            const typeOrder = { 'start': 0, 'progress': 1, 'finish': 2 };
            const orderA = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 1;
            const orderB = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 1;
            return orderA - orderB;
        });

        let lastStartIndex = -1;
        for (let i = sortedH.length - 1; i >= 0; i--) {
            if (sortedH[i].type === 'start') {
                lastStartIndex = i;
                break;
            }
        }

        const currentCycle = lastStartIndex !== -1 ? sortedH.slice(lastStartIndex) : sortedH;
        const lastEntry = currentCycle[currentCycle.length - 1];

        if (lastEntry.type === 'finish') return 100;
        
        if (lastEntry.type === 'start' && currentCycle.length === 1) return 0;

        let maxPage = 0;
        currentCycle.forEach(h => {
            if (h.type === 'finish') {
                maxPage = pages;
            } else {
                const p = parseInt(h.page) || 0;
                if (p > maxPage) maxPage = p;
            }
        });

        const progress = Math.min(100, Math.round((maxPage / pages) * 100));
        return isNaN(progress) ? 0 : progress;
    },

    updateModalProgressHeader(book) {
        const percent = this.calculateProgress(book);
        if (this.dom.historyProgressText) {
            this.dom.historyProgressText.textContent = `${percent}%`;
        }
        if (this.dom.historyProgressBar) {
            this.dom.historyProgressBar.style.width = `${percent}%`;
        }
    },

    async updateProgress(bookId, newPage, note = '') {
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
            const now = new Date();
            book.readDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }

        book.readPages = newPage;

        if (!book.history) book.history = [];
        book.history.push({
            date: new Date().toISOString(),
            page: newPage,
            type: entryType,
            note: note
        });

        await rm.update(book.id, book);
        this.refresh();

        if (wasFinished) {
            this.closeAllModals();
            this.showMessage('Parabéns!', 'Você concluiu este livro!');
        } else {
            this.showToast(`Progresso atualizado: ${newPage} pág.`, 'success');
        }
    },

    openDeleteModal(message, callback) {
        this.dom.deleteModalMessage.textContent = message;
        this.deleteCallback = callback;
        this.dom.deleteModal.style.zIndex = '1100';
        this.dom.deleteModal.classList.add('active');
        this.toggleBodyScroll(true);
    },

    closeDeleteModal() {
        this.dom.deleteModal.classList.remove('active');
        this.toggleBodyScroll(false);
        this.deleteCallback = null;
    },

    closeAllModals() {
        if (this.closeModal) this.closeModal();
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    },

    showMessage(title, text, icon = '✨') {
        this.dom.messageTitle.textContent = title;
        this.dom.messageText.innerHTML = text.replace(/\n/g, '<br>');
        this.dom.messageIcon.innerHTML = icon;
        this.dom.messageModal.style.zIndex = '1200';
        this.dom.messageModal.classList.add('active');
        this.toggleBodyScroll(true);
        
        this.dom.messageOkBtn.onclick = () => {
            this.dom.messageModal.classList.remove('active');
            
            const activeModals = document.querySelectorAll('.modal.active, .modal-overlay.active');
            if (activeModals.length === 0) {
                this.toggleBodyScroll(false);
            }

            if (icon === '🎉' || icon === '✅' || icon === '🏆' || icon === '✨') {
                this.closeAllModals();
            }
        };
    },

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        toast.innerHTML = `
            <span class="toast-message">${message}</span>
        `;
        
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    },

    formatRelativeDate(dateString) {
        if (!dateString) return '';
        
        let date;
        if (dateString.includes('T00:00:00.000Z')) {
            date = new Date(dateString.replace('T00:00:00.000Z', 'T12:00:00'));
        }
        else if (dateString.length === 10) {
            date = new Date(dateString + 'T12:00:00');
        }
        else {
            date = new Date(dateString);
        }
        
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();
        
        if (isToday) return 'Hoje';
        if (isYesterday) return 'Ontem';
        
        return date.toLocaleDateString('pt-BR');
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

    closePeriodDetails() {
        const modal = document.getElementById('periodDetailsModal');
        if (modal) {
            modal.classList.remove('active');
            this.toggleBodyScroll(false);
        }
    },

    closeStatsModal() {
        const modal = document.getElementById('statsModal');
        if (modal) {
            modal.classList.remove('active');
            this.toggleBodyScroll(false);
        }
    },

    openStatsModal() {
        const modal = document.getElementById('statsModal');
        const container = document.getElementById('statsContent');
        if (!modal || !container) return;

        const createStatObj = () => ({
            books: [], booksCount: 0,
            pages: 0, ratingSum: 0, ratedCount: 0,
            monthlyDist: new Array(12).fill(0),
            longestBook: null, shortestBook: null,
            authors: {}, dailyPages: {},
            monthlyPagesDist: new Array(12).fill(0)
        });

        const statsData = { years: {}, all: createStatObj() };

        this.state.books.forEach(book => {
            const hasProgress = book.computed.totalReadPages > 0 || book.goalYear;
            if (book.status === 'want-to-read' && !hasProgress) return;

            const processForYear = (target, targetYear) => {
                let yearStats;
                if (targetYear === 'all') {
                    yearStats = { pages: book.computed.totalReadPages, finishes: 0, active: false };
                    Object.values(book.computed.activityByYear).forEach(y => {
                        yearStats.finishes += y.finishes;
                        if (y.active) yearStats.active = true;
                    });
                } else {
                    yearStats = book.computed.activityByYear[targetYear];
                }

                if (!yearStats) {
                    if (book.goalYear == targetYear) {
                        target.books.push(book);
                    }
                    return;
                }

                target.books.push(book);
                if (yearStats.finishes > 0) {
                    target.booksCount++;
                }
                
                target.pages += yearStats.pages;

                for (let m = 0; m < 12; m++) {
                    const ym = targetYear === 'all' ? null : `${targetYear}-${String(m + 1).padStart(2, '0')}`;
                    
                    if (targetYear === 'all') {
                        Object.entries(book.computed.activityByMonth).forEach(([key, mData]) => {
                            if (key.endsWith(`-${String(m + 1).padStart(2, '0')}`)) {
                                target.monthlyDist[m] += mData.finishes;
                                target.monthlyPagesDist[m] += mData.pages;
                            }
                        });
                    } else {
                        const mData = book.computed.activityByMonth[ym];
                        if (mData) {
                            target.monthlyDist[m] += mData.finishes;
                            target.monthlyPagesDist[m] += mData.pages;
                        }
                    }
                }

                if (targetYear === 'all') {
                    Object.entries(book.computed.heatmapDays).forEach(([dKey, pgs]) => {
                        target.dailyPages[dKey] = (target.dailyPages[dKey] || 0) + pgs;
                    });
                } else {
                    Object.entries(book.computed.heatmapDays).forEach(([dKey, pgs]) => {
                        if (dKey.startsWith(targetYear + '-')) {
                            target.dailyPages[dKey] = (target.dailyPages[dKey] || 0) + pgs;
                        }
                    });
                }

                if (book.rating > 0 && yearStats.finishes > 0) {
                    target.ratingSum += parseFloat(book.rating);
                    target.ratedCount++;
                }

                const p = parseInt(book.pages) || 0;
                if (p > 0 && yearStats.finishes > 0) {
                    if (!target.longestBook || p > parseInt(target.longestBook.pages)) target.longestBook = book;
                    if (!target.shortestBook || p < parseInt(target.shortestBook.pages)) target.shortestBook = book;
                }

                if (book.author && yearStats.finishes > 0) {
                    target.authors[book.author] = (target.authors[book.author] || 0) + yearStats.finishes;
                }
            };

            const yearsOfActivity = Object.keys(book.computed.activityByYear);
            if (book.goalYear && !yearsOfActivity.includes(book.goalYear.toString())) {
                yearsOfActivity.push(book.goalYear.toString());
            }

            yearsOfActivity.forEach(y => {
                if (!statsData.years[y]) statsData.years[y] = createStatObj();
                processForYear(statsData.years[y], y);
            });
            processForYear(statsData.all, 'all');
        });

        this.statsState = { data: statsData, selectedYear: 'all' };
        this.renderStatsDashboard();
        modal.classList.add('active');
        this.toggleBodyScroll(true);
    },

    renderStatsDashboard() {
        StatsView.renderStatsDashboard(this.statsState, this.state.books);
    },
    
    openPeriodDetails(type, value, mode = 'pages') {
        StatsView.openPeriodDetails(type, value, mode, this.state.books, this.statsState ? this.statsState.selectedYear : 'all');
        this.toggleBodyScroll(true);
    },

    async handleNoteSubmit(e) {
        e.preventDefault();
        try {
            const bookId = document.getElementById('notesBookId').value;
            const noteId = document.getElementById('noteId').value;
            const content = document.getElementById('noteContent').value;
            const location = document.getElementById('noteLocation').value;

            if (!content.trim()) return;

            const book = this.state.books.find(b => b.id === bookId);
            if (book) {
                book.notes = book.notes || [];

                if (noteId) {
                    const noteIndex = book.notes.findIndex(n => n.id === noteId);
                    if (noteIndex !== -1) {
                        book.notes[noteIndex] = {
                            ...book.notes[noteIndex],
                            content: content.trim(),
                            location: location.trim(),
                            updatedAt: new Date().toISOString()
                        };
                    }
                } else {
                    const newNote = {
                        id: Date.now().toString(),
                        content: content.trim(),
                        location: location.trim(),
                        createdAt: new Date().toISOString()
                    };
                    book.notes.push(newNote);
                }

                await rm.update(bookId, { notes: book.notes });
                this.showNotesListView();
                this.renderNotesList(book.notes);
                this.dom.notesForm.reset();
            }
        } catch (error) {
            console.error("Erro ao salvar nota:", error);
            alert("Erro ao salvar anotação. Tente novamente.");
        }
    },

    renderNotesList(notes) {
        const list = this.dom.notesList;
        if (!list) return;

        if (!notes || notes.length === 0) {
            list.innerHTML = '<div class="empty-msg" style="margin: auto; padding-bottom: 2rem;">Nenhuma anotação ainda.<br>Que tal registrar sua primeira reflexão?</div>';
            return;
        }

        list.innerHTML = notes.map(note => {
            const escContent = escapeHTML(note.content);
            const escLocation = escapeHTML(note.location);
            
            return `
            <div class="history-item note-item">
                <div class="note-content-wrapper">
                    <div class="note-header">
                        <div class="note-meta">
                            <span class="history-date">${this.formatRelativeDate(note.createdAt)} às ${new Date(note.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            ${note.location ? `<span class="note-location-tag">${escLocation}</span>` : ''}
                        </div>
                        <div class="action-buttons">
                        <button type="button" class="action-btn" onclick="App.copyNoteToClipboard('${note.id}')" title="Copiar anotação">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                            <button type="button" class="action-btn edit" onclick="App.editNoteItem('${document.getElementById('notesBookId').value}', '${note.id}')" title="Editar nota">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button type="button" class="action-btn delete" onclick="App.deleteNoteItem('${document.getElementById('notesBookId').value}', '${note.id}')" title="Excluir nota">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 6h18"></path>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="note-text">${escContent}</div>
                </div>
            </div>
        `}).join('');
    },

    copyNoteToClipboard(noteId) {
        const bookId = document.getElementById('notesBookId').value;
        const book = this.state.books.find(b => b.id === bookId);
        const note = book.notes.find(n => n.id === noteId);
        
        if (note) {
            navigator.clipboard.writeText(note.content).then(() => {
                this.showToast('Anotação copiada!', 'success');
            });
        }
    },

    deleteNoteItem(bookId, noteId) {
        this.openDeleteModal('Deseja realmente excluir esta anotação?', () => {
            const book = rm.get(bookId);
            if (!book || !book.notes) return;

            book.notes = book.notes.filter(n => n.id !== noteId);
            rm.update(bookId, { notes: book.notes });
            this.renderNotesList(book.notes);
        });
    },

    editNoteItem(bookId, noteId) {
        const book = this.state.books.find(b => b.id === bookId);
        if (!book || !book.notes) return;

        const note = book.notes.find(n => n.id === noteId);
        if (note) {
            this.showNotesFormView(note);
        }
    },

    renderRecommendationsTab() {
        this.dom.grid.innerHTML = '';
        if (this.dom.paginationControls) this.dom.paginationControls.style.display = 'none';
        
        const toolbarRight = document.querySelector('.toolbar-right');
        if (toolbarRight) {
            const searchWrapper = toolbarRight.querySelector('.search-wrapper');
            const sortContainer = toolbarRight.querySelector('.sort-dropdown-container');
            if (searchWrapper) searchWrapper.style.display = 'none';
            if (sortContainer) sortContainer.style.display = 'none';
            this.dom.addBtn.style.display = 'none';
            
            let btnGerar = document.getElementById('btnGerarRecomendacoes');
            if (!btnGerar) {
                btnGerar = document.createElement('button');
                btnGerar.id = 'btnGerarRecomendacoes';
                btnGerar.className = 'btn btn-primary'; 
                btnGerar.innerHTML = '✨ Gerar Novas Recomendações';
                btnGerar.onclick = () => App.generateNewRecommendations();
                toolbarRight.appendChild(btnGerar);
            }
            btnGerar.style.display = 'flex';
        }

        const cachedRecommendations = JSON.parse(localStorage.getItem('rm_recommendations') || '[]');

        if (cachedRecommendations.length > 0) {
            this.dom.resultsCount.textContent = `Encontramos ${cachedRecommendations.length} tesouros!`;
            
            cachedRecommendations.forEach((book, index) => {
                const info = book.volumeInfo;
                const thumb = info.imageLinks ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail) : null;
                const coverUrl = thumb ? thumb.replace('http:', 'https:') : '';
                const escTitle = escapeHTML(info.title || 'Título desconhecido');
                const escAuthor = escapeHTML(info.authors ? info.authors[0] : 'Autor desconhecido');
                const escReason = escapeHTML(book.geminiReason || 'Excelente adição à sua biblioteca.');
                const isPlaceholder = !coverUrl;

                const card = document.createElement('div');
                card.className = 'book-card';
                card.style.cursor = 'pointer';
                card.id = `rec-card-${index}`;
                
                card.onclick = () => {
                    App.dom.addBtn.click();
                    document.getElementById('bookTitle').value = info.title || '';
                    document.getElementById('bookAuthor').value = escAuthor;
                    document.getElementById('bookPages').value = info.pageCount || '';
                    document.getElementById('bookCover').value = coverUrl || '';
                };

                card.innerHTML = `
                        <div class="book-cover-container ${isPlaceholder ? '' : 'skeleton'}" style="${isPlaceholder ? 'background: linear-gradient(135deg, #1e293b, #0f172a); display: flex; align-items: center; justify-content: center;' : ''}">
                            
                            ${isPlaceholder 
                                ? `<div class="placeholder-icon" style="display:flex; flex-direction:column; align-items:center; opacity:0.2; color:white;">
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                                </div>`
                                : `<img src="${coverUrl}" class="book-cover" onload="this.parentElement.classList.remove('skeleton')">`
                            }

                            <div class="title-overlay" style="transform: translateY(0); background: linear-gradient(to top, rgba(0, 0, 0, 0.98) 40%, rgba(0, 0, 0, 0.7) 80%, transparent); padding: 2rem 0.75rem 0.75rem; height: auto; display: flex; flex-direction: column; justify-content: flex-end; z-index: 10;">
                            <div style="font-size: 0.85rem; font-weight: bold; margin-bottom: 6px; color: white; line-height: 1.2;">${escTitle}</div>
                            <div style="font-size: 0.75rem; font-weight: normal; color: #fbbf24; font-style: italic; line-height: 1.3;">
                                💡 ${escReason}
                            </div>
                        </div>
                    </div>
                `;
                this.dom.grid.appendChild(card);
            });
            return;
        }

        this.dom.grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding-top: 4rem;"><div style="font-size: 3.5rem; margin-bottom: 1rem;">✨</div><h3 style="color: white; margin-bottom: 10px;">Descubra Novas Leituras</h3><p>Vamos analisar os seus livros favoritos para sugerir algo especial.</p></div>`;
    },

    async generateNewRecommendations() {
        const livrosBase = this.state.books.filter(b => b.status !== 'abandoned');
        const todosOsTitulos = this.state.books.map(b => b.title.toLowerCase().trim());

        if (livrosBase.length === 0) {
            this.showMessage(
                'Precisamos conhecer o seu gosto! 🕵️‍♂️', 
                'Adicione alguns livros à sua biblioteca primeiro. Assim, a IA terá uma base para sugerir leituras que combinem com você.', 
                '📚'
            );
            return;
        }

        this.dom.grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><div class="spinner" style="margin-bottom:20px;"></div><p>Procurando livros que combinem contigo...</p></div>';

        try {
            const sugestoesBrutas = await GeminiAPI.getRecomendacoes(livrosBase, todosOsTitulos);
            const sugestoes = sugestoesBrutas.filter(s => !todosOsTitulos.includes(s.title.toLowerCase().trim()));

            if (sugestoes.length === 0) throw new Error("Sem sugestões novas.");

            const resultadosIniciais = sugestoes.map(sug => ({
                id: `temp-${Math.random()}`,
                volumeInfo: { title: sug.title, authors: [sug.author], imageLinks: null },
                geminiReason: sug.reason
            }));

            this.state.searchResults = resultadosIniciais;
            localStorage.setItem('rm_recommendations', JSON.stringify(resultadosIniciais));
            this.renderRecommendationsTab();

            const BATCH_SIZE = 5;
            for (let i = 0; i < sugestoes.length; i += BATCH_SIZE) {
                const currentBatch = sugestoes.slice(i, i + BATCH_SIZE);
                
                const batchPromises = currentBatch.map(async (sug, batchIdx) => {
                    const globalIdx = i + batchIdx;
                    try {
                        let busca = await GoogleBooksAPI.search(`${sug.title} ${sug.author}`);
                        
                        if (!busca || busca.length === 0) {
                            busca = await GoogleBooksAPI.search(sug.title);
                        }

                        if (!busca || busca.length === 0) {
                            busca = await OpenLibraryAPI.search(`${sug.title} ${sug.author}`);
                            
                            if (!busca || busca.length === 0) {
                                busca = await OpenLibraryAPI.search(sug.title);
                            }
                        }

                        if (busca && busca.length > 0) {
                            const realBook = { ...busca[0], geminiReason: sug.reason };
                            this.state.searchResults[globalIdx] = realBook;
                            localStorage.setItem('rm_recommendations', JSON.stringify(this.state.searchResults));
                            this.updateSingleRecCard(globalIdx, realBook);
                        }
                    } catch (e) {
                        console.error(`Erro crítico ao buscar capa para: ${sug.title}`, e);
                    }
                });

                await Promise.all(batchPromises);
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (error) {
            console.error(error);
            this.renderRecommendationsTab(); 
        }
    },

    updateSingleRecCard(index, bookData) {
        const card = document.getElementById(`rec-card-${index}`);
        if (!card) return;

        const info = bookData.volumeInfo;
        let coverUrl = '';
        if (info.imageLinks) {
            const thumb = info.imageLinks.thumbnail || info.imageLinks.smallThumbnail;
            if (thumb) coverUrl = thumb.replace('http:', 'https:');
        }
        
        card.onclick = () => {
            App.dom.addBtn.click();
            document.getElementById('bookTitle').value = info.title || '';
            document.getElementById('bookAuthor').value = info.authors ? info.authors[0] : '';
            document.getElementById('bookPages').value = info.pageCount || 0;
            document.getElementById('bookCover').value = coverUrl || '';
        };

        if (coverUrl) {
            const container = card.querySelector('.book-cover-container');
            container.innerHTML = `
                <img src="${coverUrl}" class="book-cover" onload="this.parentElement.classList.remove('skeleton')">
                <div class="title-overlay" style="transform: translateY(0); background: linear-gradient(to top, rgba(0, 0, 0, 0.98) 40%, rgba(0, 0, 0, 0.7) 80%, transparent); padding: 2rem 0.75rem 0.75rem; height: auto; display: flex; flex-direction: column; justify-content: flex-end; z-index: 10;">
                    <div style="font-size: 0.85rem; font-weight: bold; margin-bottom: 6px; color: white; line-height: 1.2;">${escapeHTML(info.title)}</div>
                    <div style="font-size: 0.75rem; font-weight: normal; color: #fbbf24; font-style: italic; line-height: 1.3;">
                        💡 ${escapeHTML(bookData.geminiReason)}
                    </div>
                </div>
            `;
            container.classList.add('skeleton');
        }
    },
    openListBooksModal(listId) {
        openListBooksModal(listId, this);
    }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
    App.init();
    initListBooksEvents(App);

    const closePeriod = () => document.getElementById('periodDetailsModal').classList.remove('active');
    const closeBtn = document.getElementById('closePeriodDetailsModal');
    const closeBtnFooter = document.getElementById('btnClosePeriodDetails');
    const modal = document.getElementById('periodDetailsModal');

    if (closeBtn) closeBtn.addEventListener('click', closePeriod);
    if (closeBtnFooter) closeBtnFooter.addEventListener('click', closePeriod);
    if (modal) {
        App.setupModalCloseAttributes(modal, closePeriod);
    }
    
    const listBooksModal = document.getElementById('listBooksModal');
    if (listBooksModal) {
        App.setupModalCloseAttributes(listBooksModal, () => {
            listBooksModal.classList.remove('active');
            App.toggleBodyScroll(false);
        });
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
        if (installButton) {
            installButton.style.display = 'none';
        }
        deferredPrompt = null;
    });
});

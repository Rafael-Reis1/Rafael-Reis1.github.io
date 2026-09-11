/**
 * Controlador do Modal de Seleção de Livros para Listas Customizadas
 */
import { escapeHTML } from '../utils/helpers.js';
import { auth, db, firebase } from '../services/firebase.js';
import { rm } from '../store/readingManager.js';

let listBooksCurrentListId = null;
let listBooksSelection = new Set();
let listBooksAll = [];
let appInstance = null;

export function openListBooksModal(listId, App) {
    if (!listId) return;
    appInstance = App || window.App;
    listBooksCurrentListId = listId;
    listBooksSelection.clear();
    const listObj = rm.lists.find(l => l.id === listId);
    const titleElem = document.getElementById('listBooksModalTitle');
    if (titleElem) titleElem.textContent = `Adicionar à: ${listObj ? listObj.name : 'Lista'}`;
    
    const searchInput = document.getElementById('listBooksSearch');
    if (searchInput) searchInput.value = '';

    const filterElem = document.getElementById('listBooksFilter');
    if (filterElem) filterElem.value = 'all';

    const filterText = document.getElementById('listBooksFilterText');
    if (filterText) filterText.textContent = 'Todos os Livros';

    const filterIndicator = document.getElementById('listBooksFilterIndicator');
    if (filterIndicator) {
        filterIndicator.className = 'status-indicator status-all';
        filterIndicator.style.background = '';
    }

    document.querySelectorAll('#listBooksFilterOptions .custom-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === 'all');
    });

    if (document.getElementById('listBooksTagFilter')) {
        document.getElementById('listBooksTagFilter').value = 'all';
        document.getElementById('listBooksTagFilterText').textContent = 'Todas as Tags';
        const tagIcon = document.getElementById('listBooksTagFilterIcon');
        if (tagIcon) {
            tagIcon.style.display = 'flex';
            tagIcon.className = 'nav-icon icon-all';
            tagIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z" /></svg>`;
        }
        document.querySelectorAll('#listBooksTagFilterOptions .custom-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === 'all');
        });
    }

    listBooksAll = appInstance && appInstance.state ? [...appInstance.state.books] : [];
    
    listBooksAll.forEach(book => {
        if (book.customLists && book.customLists.includes(listId)) {
            listBooksSelection.add(book.id);
        }
    });
    
    renderListBooksModal();
    const modal = document.getElementById('listBooksModal');
    if (modal) modal.classList.add('active');
    if (appInstance) appInstance.toggleBodyScroll(true);
}

export function renderListBooksModal() {
    const grid = document.getElementById('listBooksGrid');
    const emptyState = document.getElementById('listBooksEmpty');
    if (!grid) return;

    const normalize = (str) => str ? str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
    const searchElem = document.getElementById('listBooksSearch');
    const rawSearch = searchElem ? searchElem.value : '';
    const searchTerm = normalize(rawSearch);
    const filterStatusElem = document.getElementById('listBooksFilter');
    const filterStatus = filterStatusElem ? filterStatusElem.value : 'all';
    const tagFilterElem = document.getElementById('listBooksTagFilter');
    const filterTag = tagFilterElem ? tagFilterElem.value : 'all';
    
    grid.innerHTML = '';
    
    let filtered = listBooksAll.filter(book => {
        if (filterStatus !== 'all' && book.status !== filterStatus) return false;
        if (filterTag !== 'all') {
            if (!book.tags || !book.tags.includes(filterTag)) return false;
        }
        if (searchTerm) {
            const terms = searchTerm.split(/\s+/).filter(t => t);
            const titleNorm = normalize(book.title);
            const authorNorm = normalize(book.author);
            
            const match = terms.every(term => titleNorm.includes(term) || authorNorm.includes(term));
            if (!match) return false;
        }
        return true;
    });
    
    if (filtered.length === 0) {
        grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    } else {
        grid.style.display = 'grid';
        if (emptyState) emptyState.style.display = 'none';
        
        filtered.forEach(book => {
            const isSelected = listBooksSelection.has(book.id);
            
            const item = document.createElement('div');
            item.className = `list-selection-item status-${book.status} ${isSelected ? 'selected' : ''}`;
            item.onclick = () => {
                if (listBooksSelection.has(book.id)) {
                    listBooksSelection.delete(book.id);
                    item.classList.remove('selected');
                } else {
                    listBooksSelection.add(book.id);
                    item.classList.add('selected');
                }
            };
            
            const isPlaceholder = !book.cover || book.cover.includes('placehold.co') || book.cover.includes('Sem+Capa');
            const escTitle = escapeHTML(book.title);
            const escAuthor = escapeHTML(book.author || '');
            
            const coverHtml = `
            <div class="book-cover-container ${isPlaceholder ? 'is-placeholder' : 'skeleton'}" style="height: 100%; border-radius: 8px;">
                <img src="${book.cover}" loading="lazy" alt="${escTitle}" class="book-cover" style="${isPlaceholder ? 'display:none' : ''}; height: 100%; width: 100%; object-fit: cover;" onload="this.parentElement.classList.remove('skeleton')" onerror="this.style.display='none'; this.nextElementSibling.classList.add('visible'); this.parentElement.classList.add('is-placeholder'); this.parentElement.classList.remove('skeleton')">
                
                <div class="book-cover-placeholder ${isPlaceholder ? 'visible' : ''}">
                    <div class="placeholder-title">${escTitle}</div>
                    <div class="placeholder-author">${escAuthor}</div>
                </div>

                <svg class="bookmark-icon" viewBox="0 0 24 32" fill="currentColor">
                    <path d="M0 0h24v32l-12-8-12 8z"/>
                </svg>
            </div>
            `;
            
            item.innerHTML = `
                ${coverHtml}
                <svg class="list-selection-check" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
            
            grid.appendChild(item);
        });
    }
}

export function initListBooksEvents(App) {
    appInstance = App || window.App;

    const searchInput = document.getElementById('listBooksSearch');
    if (searchInput) searchInput.addEventListener('input', renderListBooksModal);

    const listBooksFilterTrigger = document.getElementById('listBooksFilterTrigger');
    const listBooksFilterOptions = document.getElementById('listBooksFilterOptions');
    const listBooksFilterInput = document.getElementById('listBooksFilter');
    const listBooksFilterText = document.getElementById('listBooksFilterText');
    const listBooksFilterIndicator = document.getElementById('listBooksFilterIndicator');

    if (listBooksFilterOptions) {
        document.body.appendChild(listBooksFilterOptions);
    }

    if (listBooksFilterTrigger && listBooksFilterOptions) {
        listBooksFilterTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const tagOpts = document.getElementById('listBooksTagFilterOptions');
            if (tagOpts) tagOpts.classList.remove('open');
            
            const rect = listBooksFilterTrigger.getBoundingClientRect();
            listBooksFilterOptions.style.top = `${rect.bottom + 8}px`;
            listBooksFilterOptions.style.left = `${rect.left}px`;
            listBooksFilterOptions.style.width = `${rect.width}px`;
            
            listBooksFilterOptions.classList.toggle('open');
        });

        listBooksFilterOptions.querySelectorAll('.custom-option').forEach(option => {
            option.addEventListener('click', () => {
                const value = option.dataset.value;
                const label = option.dataset.label;
                const statusClass = option.dataset.class;
                
                listBooksFilterOptions.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                if (listBooksFilterInput) listBooksFilterInput.value = value;
                if (listBooksFilterText) listBooksFilterText.textContent = label;
                
                if (listBooksFilterIndicator) {
                    listBooksFilterIndicator.className = 'status-indicator';
                    if (statusClass) {
                        listBooksFilterIndicator.classList.add(statusClass);
                        listBooksFilterIndicator.style.background = '';
                    } else {
                        listBooksFilterIndicator.style.background = 'transparent';
                    }
                }
                
                listBooksFilterOptions.classList.remove('open');
                renderListBooksModal();
            });
        });
    }

    const listBooksTagFilterTrigger = document.getElementById('listBooksTagFilterTrigger');
    const listBooksTagFilterOptions = document.getElementById('listBooksTagFilterOptions');
    const listBooksTagFilterInput = document.getElementById('listBooksTagFilter');
    const listBooksTagFilterText = document.getElementById('listBooksTagFilterText');

    if (listBooksTagFilterOptions) {
        document.body.appendChild(listBooksTagFilterOptions);
    }

    if (listBooksTagFilterTrigger && listBooksTagFilterOptions) {
        listBooksTagFilterTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            
            if (listBooksFilterOptions) listBooksFilterOptions.classList.remove('open');
            
            const rect = listBooksTagFilterTrigger.getBoundingClientRect();
            listBooksTagFilterOptions.style.top = `${rect.bottom + 8}px`;
            listBooksTagFilterOptions.style.left = `${rect.left}px`;
            listBooksTagFilterOptions.style.width = `${rect.width}px`;
            
            listBooksTagFilterOptions.classList.toggle('open');
        });

        listBooksTagFilterOptions.querySelectorAll('.custom-option').forEach(option => {
            option.addEventListener('click', () => {
                const value = option.dataset.value;
                const label = option.dataset.label;
                
                listBooksTagFilterOptions.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                if (listBooksTagFilterInput) listBooksTagFilterInput.value = value;
                if (listBooksTagFilterText) listBooksTagFilterText.textContent = label;
                
                const iconDiv = option.querySelector('.nav-icon');
                const targetIconDiv = document.getElementById('listBooksTagFilterIcon');
                if (targetIconDiv) {
                    if (iconDiv) {
                        targetIconDiv.innerHTML = iconDiv.innerHTML;
                        targetIconDiv.className = iconDiv.className;
                        targetIconDiv.style.display = 'flex';
                    } else {
                        targetIconDiv.innerHTML = '';
                        targetIconDiv.className = '';
                        targetIconDiv.style.display = 'none';
                    }
                }
                
                listBooksTagFilterOptions.classList.remove('open');
                renderListBooksModal();
            });
        });
    }

    document.addEventListener('click', (e) => {
        if (listBooksFilterOptions && listBooksFilterOptions.classList.contains('open') && !e.target.closest('#listBooksFilterContainer')) {
            listBooksFilterOptions.classList.remove('open');
        }
        
        if (listBooksTagFilterOptions && listBooksTagFilterOptions.classList.contains('open') && !e.target.closest('#listBooksTagFilterContainer')) {
            listBooksTagFilterOptions.classList.remove('open');
        }
        
        if (!e.target.closest('.list-actions-dropdown')) {
            document.querySelectorAll('.list-actions-dropdown .dropdown-menu.show').forEach(m => m.classList.remove('show'));
        }
    });

    const btnSaveListBooks = document.getElementById('btnSaveListBooks');
    if (btnSaveListBooks) {
        btnSaveListBooks.addEventListener('click', async () => {
            if (!listBooksCurrentListId || !auth.currentUser) return;
            
            const btn = document.getElementById('btnSaveListBooks');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div> Salvando...';
            btn.disabled = true;
            const grid = document.getElementById('listBooksGrid');
            if (grid) {
                grid.style.pointerEvents = 'none';
                grid.style.opacity = '0.6';
            }
            
            try {
                const batch = db.batch();
                let operations = 0;
                
                listBooksAll.forEach(book => {
                    const hasList = !!(book.customLists && book.customLists.includes(listBooksCurrentListId));
                    const shouldHaveList = listBooksSelection.has(book.id);
                    
                    if (hasList !== shouldHaveList) {
                        const bookRef = db.collection('library_data').doc(auth.currentUser.uid).collection('books').doc(book.id);
                        
                        let newLists = book.customLists ? [...book.customLists] : [];
                        if (shouldHaveList) {
                            if (!newLists.includes(listBooksCurrentListId)) {
                                newLists.push(listBooksCurrentListId);
                            }
                        } else {
                            newLists = newLists.filter(id => id !== listBooksCurrentListId);
                        }
                        
                        batch.update(bookRef, {
                            customLists: newLists,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        operations++;
                    }
                });
                
                if (operations > 0) {
                    await batch.commit();
                    if (appInstance) appInstance.showToast(`${operations} livro(s) atualizados com sucesso!`);
                } else {
                    if (appInstance) appInstance.showToast('Nenhuma alteração foi feita.');
                }
                
                const listModal = document.getElementById('listBooksModal');
                if (listModal) listModal.classList.remove('active');
                if (appInstance) appInstance.toggleBodyScroll(false);
                
            } catch (e) {
                console.error("Erro ao salvar lista:", e);
                if (appInstance) appInstance.showToast('Erro ao atualizar a lista', 'error');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
                if (grid) {
                    grid.style.pointerEvents = '';
                    grid.style.opacity = '1';
                }
            }
        });
    }

    const btnCloseTop = document.getElementById('btnCloseListBooksTop');
    if (btnCloseTop) {
        btnCloseTop.addEventListener('click', () => {
            const m = document.getElementById('listBooksModal');
            if (m) m.classList.remove('active');
            if (appInstance) appInstance.toggleBodyScroll(false);
        });
    }

    const btnCloseBottom = document.getElementById('btnCloseListBooksBottom');
    if (btnCloseBottom) {
        btnCloseBottom.addEventListener('click', () => {
            const m = document.getElementById('listBooksModal');
            if (m) m.classList.remove('active');
            if (appInstance) appInstance.toggleBodyScroll(false);
        });
    }
}

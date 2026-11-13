(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.DevToolsHub = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    /**
     * Normalizes accents, casing, and whitespace for resilient search matching.
     * @param {string} value
     * @returns {string}
     */
    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    /**
     * Determines whether a single tool descriptor matches query and category filters.
     * @param {{title?: string, description?: string, keywords?: string, category?: string}} item
     * @param {string} [query='']
     * @param {string} [category='all']
     * @returns {boolean}
     */
    function matchesToolFilter(item, query = '', category = 'all') {
        const activeCategory = category || 'all';
        if (activeCategory !== 'all' && item.category !== activeCategory) {
            return false;
        }
        const term = normalizeText(query);
        if (!term) return true;

        const haystack = normalizeText([
            item.title,
            item.description,
            item.keywords,
            item.category
        ].join(' '));

        return term.split(/\s+/).every(token => haystack.includes(token));
    }

    const VIEW_STATE_KEY = 'devtools_hub_view_state';

    function getSafeSessionStorage() {
        try {
            return typeof root.sessionStorage !== 'undefined' ? root.sessionStorage : null;
        } catch {
            return null;
        }
    }

    function readViewState(storage) {
        if (!storage) return null;
        try {
            const raw = storage.getItem(VIEW_STATE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            const scrollY = Number(parsed.scrollY);
            return {
                scrollY: Number.isFinite(scrollY) && scrollY > 0 ? Math.round(scrollY) : 0,
                category: typeof parsed.category === 'string' ? parsed.category : 'all',
                query: typeof parsed.query === 'string' ? parsed.query : ''
            };
        } catch {
            return null;
        }
    }

    function saveViewState(storage, state) {
        if (!storage) return;
        try {
            storage.setItem(VIEW_STATE_KEY, JSON.stringify({
                scrollY: Math.max(0, Math.round(Number(state?.scrollY) || 0)),
                category: typeof state?.category === 'string' ? state.category : 'all',
                query: typeof state?.query === 'string' ? state.query : ''
            }));
        } catch {
            // Ignora erro de cota/privacidade em contextos restritos
        }
    }

    function clearViewState(storage) {
        if (!storage) return;
        try {
            storage.removeItem(VIEW_STATE_KEY);
        } catch {
            // Ignora erro de acesso em contextos restritos
        }
    }

    function getScrollTop() {
        if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
        return Math.max(0, Math.round(
            window.scrollY ||
            window.pageYOffset ||
            document.documentElement?.scrollTop ||
            document.body?.scrollTop ||
            0
        ));
    }

    function setScrollTop(y) {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        const top = Math.max(0, Math.round(Number(y) || 0));
        if (typeof window.scrollTo === 'function') {
            window.scrollTo({ top, left: 0, behavior: 'auto' });
        }
        if (document.documentElement) document.documentElement.scrollTop = top;
        if (document.body) document.body.scrollTop = top;
    }

    function initDom() {
        if (typeof document === 'undefined') return;
        const storage = getSafeSessionStorage();

        const btnVoltar = document.getElementById('btnVoltar');
        if (btnVoltar) {
            btnVoltar.addEventListener('click', () => {
                clearViewState(storage);
                const backHref = btnVoltar.dataset.backHref || '../';
                if (typeof window !== 'undefined') {
                    window.location.href = backHref;
                }
            });
        }

        const searchInput = document.getElementById('toolSearch');
        const clearBtn = document.getElementById('clearSearch');
        const filterButtons = Array.from(document.querySelectorAll('.filter-pill'));
        const cards = Array.from(document.querySelectorAll('#toolsGrid .tool-card'));
        const countEl = document.getElementById('toolsCount');
        const emptyState = document.getElementById('emptyState');
        const resetBtn = document.getElementById('resetFiltersBtn');

        let activeCategory = 'all';

        function applyFilters() {
            const query = searchInput ? searchInput.value : '';
            if (clearBtn) {
                clearBtn.hidden = query.trim().length === 0;
            }

            let visibleCount = 0;
            cards.forEach(card => {
                const descriptor = {
                    title: card.querySelector('h2')?.textContent || '',
                    description: card.querySelector('p')?.textContent || '',
                    keywords: card.dataset.keywords || '',
                    category: card.dataset.category || ''
                };
                const isMatch = matchesToolFilter(descriptor, query, activeCategory);
                card.classList.toggle('hidden', !isMatch);
                if (isMatch) visibleCount++;
            });

            if (countEl) {
                countEl.textContent = visibleCount === 1
                    ? '1 ferramenta disponível'
                    : `${visibleCount} ferramentas disponíveis`;
            }

            if (emptyState) {
                emptyState.hidden = visibleCount > 0;
            }
        }

        function resetAllFilters() {
            activeCategory = 'all';
            filterButtons.forEach(btn => {
                const isAll = btn.dataset.category === 'all';
                btn.classList.toggle('is-active', isAll);
                btn.setAttribute('aria-pressed', isAll ? 'true' : 'false');
            });
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            applyFilters();
        }

        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                activeCategory = btn.dataset.category || 'all';
                filterButtons.forEach(other => {
                    const active = other === btn;
                    other.classList.toggle('is-active', active);
                    other.setAttribute('aria-pressed', active ? 'true' : 'false');
                });
                applyFilters();
            });
        });

        if (searchInput) {
            searchInput.addEventListener('input', applyFilters);
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && searchInput.value) {
                    e.preventDefault();
                    searchInput.value = '';
                    applyFilters();
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.focus();
                }
                applyFilters();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', resetAllFilters);
        }

        document.addEventListener('keydown', (e) => {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            const target = e.target;
            const isEditable = target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            );
            if (!isEditable && searchInput) {
                e.preventDefault();
                searchInput.focus();
            }
        });

        cards.forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                saveViewState(storage, {
                    scrollY: getScrollTop(),
                    category: activeCategory,
                    query: searchInput ? searchInput.value : ''
                });
            });
        });

        const savedState = readViewState(storage);
        if (savedState) {
            clearViewState(storage);
            const hasMatchingCategory = filterButtons.some(btn => btn.dataset.category === savedState.category);
            activeCategory = hasMatchingCategory ? savedState.category : 'all';
            filterButtons.forEach(btn => {
                const active = (btn.dataset.category || 'all') === activeCategory;
                btn.classList.toggle('is-active', active);
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            if (searchInput && savedState.query) {
                searchInput.value = savedState.query;
            }
        }

        applyFilters();

        if (savedState && savedState.scrollY > 0) {
            const targetY = savedState.scrollY;
            let userInteracted = false;
            const markInteracted = () => { userInteracted = true; };
            window.addEventListener('wheel', markInteracted, { once: true, passive: true });
            window.addEventListener('touchstart', markInteracted, { once: true, passive: true });

            setScrollTop(targetY);
            if (typeof root.requestAnimationFrame === 'function') {
                root.requestAnimationFrame(() => {
                    if (!userInteracted) setScrollTop(targetY);
                });
            }
            window.addEventListener('load', () => {
                if (!userInteracted) setScrollTop(targetY);
            }, { once: true });
        }

        root.__devToolsHub = {
            applyFilters,
            resetAllFilters
        };
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initDom);
        } else {
            initDom();
        }
    }

    return {
        normalizeText,
        matchesToolFilter,
        readViewState,
        saveViewState,
        clearViewState
    };
});

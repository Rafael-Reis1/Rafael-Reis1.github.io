const CARD_PAGE_SIZE = 12;
const REPOS_CACHE_KEY = 'github_repos_cache_v2';
const REPOS_CACHE_DURATION = 10 * 60 * 1000;

const TABS = {
    btnSobre: 'sobre',
    btnCurriculo: 'curriculo',
    btnPortfolio: 'portfolio'
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeHref = (url) => {
    const value = String(url || '');
    if (/^https?:\/\//i.test(value)) return value;
    if (/^\/(?!\/)/.test(value)) return value;
    return '#';
};

const normalizeText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const readStorage = (storage, key, fallback = null) => {
    try {
        const value = storage.getItem(key);
        return value === null ? fallback : value;
    } catch (error) {
        return fallback;
    }
};

const writeStorage = (storage, key, value) => {
    try {
        storage.setItem(key, String(value));
    } catch (error) {
        // Armazenamento indisponível (modo privado): a navegação continua funcionando.
    }
};

let fadeObserver = null;

document.addEventListener('DOMContentLoaded', () => {
    try {
        setupTabs();
        setupDragScroll();
        setupModal();
        fetchAndDisplayRepos();
        setupAnimations();
    } catch (error) {
        console.error('Falha ao inicializar o portfólio:', error);
        // Sem JS funcionando, todas as seções voltam a ficar visíveis.
        document.documentElement.classList.remove('js');
    }
});

/* -------------------------------------------------------------------------- */
/* Tabs (com deep link, histórico e navegação por teclado)                     */
/* -------------------------------------------------------------------------- */

function setupTabs() {
    const nav = document.querySelector('.navBar');
    if (!nav) return;

    const buttons = Array.from(nav.querySelectorAll('[role="tab"]'));
    const sections = Object.values(TABS)
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    const btnIdFromHash = () => {
        const id = decodeURIComponent(window.location.hash.replace('#', ''));
        return Object.keys(TABS).find((key) => TABS[key] === id) || null;
    };

    const activate = (btnId, { updateHistory = false, focus = false } = {}) => {
        const targetId = TABS[btnId];
        const targetSection = targetId ? document.getElementById(targetId) : null;
        const targetButton = btnId ? document.getElementById(btnId) : null;
        if (!targetSection || !targetButton) return;

        buttons.forEach((button) => {
            const isActive = button === targetButton;
            button.classList.toggle('btnAccentColor', isActive);
            button.setAttribute('aria-selected', String(isActive));
            button.tabIndex = isActive ? 0 : -1;
        });

        sections.forEach((section) => {
            section.classList.toggle('is-active', section === targetSection);
        });

        writeStorage(sessionStorage, 'activeTab', btnId);
        if (updateHistory && window.location.hash !== `#${targetId}`) {
            history.pushState({ tab: targetId }, '', `#${targetId}`);
        }

        if (focus) targetButton.focus();

        // As seções escondidas não são observadas; ao abrir, anima os cards visíveis.
        setupAnimations();
    };

    const syncFromLocation = () => {
        const btnId = btnIdFromHash();
        if (btnId) {
            activate(btnId, { updateHistory: false });
        } else if (!window.location.hash) {
            // Voltou para a raiz: restaura a aba inicial em vez de deixar a URL e a tela divergirem.
            activate('btnSobre', { updateHistory: false });
        }
    };

    buttons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            activate(button.id, { updateHistory: true });
        });

        button.addEventListener('keydown', (event) => {
            const currentIndex = buttons.indexOf(button);
            let nextIndex = null;

            if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttons.length;
            else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = buttons.length - 1;

            if (nextIndex === null) return;

            event.preventDefault();
            activate(buttons[nextIndex].id, { updateHistory: true, focus: true });
        });
    });

    document.querySelectorAll('[data-tab-target]').forEach((element) => {
        element.addEventListener('click', (event) => {
            event.preventDefault();
            activate(element.dataset.tabTarget, { updateHistory: true });
        });
    });

    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);

    const savedTab = readStorage(sessionStorage, 'activeTab');
    const initialTab = btnIdFromHash() || (TABS[savedTab] ? savedTab : 'btnSobre');
    activate(initialTab, { updateHistory: false });
}

/* -------------------------------------------------------------------------- */
/* Carrossel de habilidades (arraste + teclado)                               */
/* -------------------------------------------------------------------------- */

function setupDragScroll() {
    const slider = document.getElementById('habilidadesContainer');
    if (!slider) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    slider.addEventListener('mousedown', (event) => {
        isDown = true;
        slider.style.cursor = 'grabbing';
        startX = event.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
    });

    slider.addEventListener('mouseleave', () => {
        isDown = false;
        slider.style.cursor = '';
    });

    slider.addEventListener('mouseup', () => {
        isDown = false;
        slider.style.cursor = '';
    });

    slider.addEventListener('mousemove', (event) => {
        if (!isDown) return;
        event.preventDefault();
        const walk = (event.pageX - slider.offsetLeft - startX) * 2;
        slider.scrollLeft = scrollLeft - walk;
    });

    slider.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        slider.scrollBy({
            left: event.key === 'ArrowRight' ? 180 : -180,
            behavior: prefersReducedMotion() ? 'auto' : 'smooth'
        });
    });

    slider.querySelectorAll('img').forEach((image) => {
        image.addEventListener('dragstart', (event) => event.preventDefault());
    });
}

/* -------------------------------------------------------------------------- */
/* Modal do currículo                                                          */
/* -------------------------------------------------------------------------- */

function setupModal() {
    const trigger = document.getElementById('btnCurriculoDownload');
    const modal = document.getElementById('curriculoLive');
    const overlay = document.getElementById('overlay');
    const closeButton = document.getElementById('closeButton');
    const iframe = document.getElementById('actualCurriculoIframe');

    if (!trigger || !modal || !overlay || !closeButton) return;

    let lastFocusedElement = null;
    let isOpen = false;

    const focusableElements = () => Array.from(
        modal.querySelectorAll('a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])')
    ).filter((element) => element.offsetParent !== null);

    const openModal = () => {
        if (isOpen) return;
        isOpen = true;
        lastFocusedElement = document.activeElement;

        if (iframe && !iframe.getAttribute('src') && iframe.dataset.src) {
            iframe.src = iframe.dataset.src;
        }

        const applyOpen = () => {
            modal.classList.add('show');
            overlay.classList.add('show');
            document.documentElement.classList.add('modal-open');
        };

        if (document.startViewTransition && !prefersReducedMotion()) {
            const transition = document.startViewTransition(applyOpen);
            if (transition.ready) {
                transition.ready.then(
                    () => closeButton.focus(),
                    () => closeButton.focus()
                );
            } else {
                closeButton.focus();
            }
        } else {
            applyOpen();
            closeButton.focus();
        }

        document.addEventListener('keydown', handleKeydown);
    };

    const restoreFocus = () => {
        if (lastFocusedElement && document.contains(lastFocusedElement)
            && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    };

    const closeModal = () => {
        if (!isOpen) return;
        isOpen = false;

        const applyClose = () => {
            modal.classList.remove('show');
            overlay.classList.remove('show');
            document.documentElement.classList.remove('modal-open');
        };

        if (document.startViewTransition && !prefersReducedMotion()) {
            const transition = document.startViewTransition(applyClose);
            if (transition.finished) {
                transition.finished.then(restoreFocus, restoreFocus);
            } else {
                restoreFocus();
            }
        } else {
            applyClose();
            restoreFocus();
        }

        document.removeEventListener('keydown', handleKeydown);
    };

    const handleKeydown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeModal();
            return;
        }

        if (event.key !== 'Tab') return;

        const elements = focusableElements();
        if (elements.length === 0) return;

        const first = elements[0];
        const last = elements[elements.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    trigger.addEventListener('click', (event) => {
        // Permite abrir em nova aba com Ctrl/Cmd/Shift + clique.
        if (event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        openModal();
    });

    overlay.addEventListener('click', closeModal);
    closeButton.addEventListener('click', closeModal);
}

/* -------------------------------------------------------------------------- */
/* Projetos                                                                    */
/* -------------------------------------------------------------------------- */

function fetchAndDisplayRepos() {
    const extraRepos = [
        {
            name: 'Minha Biblioteca',
            description: 'Gerencie seus livros e leituras com listas customizadas, heatmap de atividades, sincronização em tempo real com Firebase e uma interface moderna.',
            html_url: '/reading/reading.html',
            tech: 'Firebase · PWA',
            accent: 'hsl(24, 78%, 62%)',
            featured: true,
            image: 'imgs/projetos/minha-biblioteca.svg'
        },
        {
            name: 'Financeiro Pessoal',
            description: 'Gerencie suas finanças com dashboard interativo, gráficos por categoria, filtros avançados e backup em JSON.',
            html_url: '/finance/finance.html',
            tech: 'Firebase · Chart.js',
            accent: 'hsl(152, 68%, 58%)',
            featured: true,
            image: 'imgs/projetos/financeiro-pessoal.svg'
        },
        {
            name: 'Criador de Livretos PDF',
            description: 'Transforme qualquer PDF em livreto (booklet) pronto para impressão. Faz a imposição de páginas automaticamente, reorganizando-as para encadernação com visualização em tempo real.',
            html_url: '/pdfFormatter/pdfFormater.html',
            tech: 'PDF.js · Canvas',
            accent: 'hsl(2, 72%, 62%)',
            featured: true,
            image: 'imgs/projetos/criador-livretos.svg'
        },
        {
            name: 'WebDrop P2P',
            description: "Plataforma P2P para transferência de arquivos e streaming de vídeo/tela em tempo real via WebRTC. Possui integração nativa com OBS Studio (Clean Feed), suporte a PWA (Mobile/Desktop), 'Share Target' e arquitetura Serverless com reconexão inteligente.",
            html_url: '/P2PShare/P2PShare.html',
            tech: 'WebRTC · PWA',
            accent: 'hsl(198, 72%, 60%)',
            featured: true,
            image: 'imgs/projetos/webdrop-p2p.svg'
        },
        {
            name: 'Estúdio de Imagem com IA',
            description: 'Suíte completa de edição 100% client-side (Privacidade garantida). Inclui IA para remoção de fundo e OCR, além de compressão, conversão, filtros e ferramentas de censura automática.',
            html_url: '/imgConver/imgConver.html',
            tech: 'Canvas · IA local',
            accent: 'hsl(282, 68%, 66%)',
            featured: true,
            image: 'imgs/projetos/estudio-imagem.svg'
        },
        {
            name: 'Leitor de Logs TOTVS/Fluig',
            description: 'Ferramenta moderna para leitura e análise de logs. Possui filtros exclusivos, busca em tempo real e visualização inteligente de stack traces.',
            html_url: '/Leitor-logs-totvs-fluig/leitor.html',
            tech: 'File API · Regex',
            accent: 'hsl(42, 78%, 60%)',
            featured: true,
            image: 'imgs/projetos/leitor-logs.svg'
        },
        {
            name: 'Gemini Nano Web App',
            description: 'Experimente a velocidade e privacidade da IA rodando direto no dispositivo. Utiliza a API Gemini Nano embutida no Chrome.',
            html_url: '/chromeAILocal/chromeAILocal.html',
            tech: 'Chrome AI',
            accent: 'hsl(220, 72%, 64%)',
            featured: true,
            image: 'imgs/projetos/gemini-nano.svg'
        },
        {
            name: 'Formatador de Listas (CSV)',
            description: 'Formate facilmente qualquer lista de números ou textos em uma string limpa e separada por vírgulas.',
            html_url: '/Formatar para lista separada por virgulas/Formatar para lista separada por virgulas.html',
            tech: 'JavaScript',
            accent: 'hsl(168, 66%, 58%)',
            featured: true,
            image: 'imgs/projetos/formatador-listas.svg'
        },
        {
            name: 'Comparador de Listas',
            description: 'Analise rapidamente duas listas para identificar elementos ausentes, extras ou duplicados entre elas.',
            html_url: '/ComparaListasNomes/ComparaListasNomes.html',
            tech: 'JavaScript',
            accent: 'hsl(320, 66%, 64%)',
            featured: true,
            image: 'imgs/projetos/comparador-listas.svg'
        },
        {
            name: 'Ambilight Web Player',
            description: 'Crie uma experiência de visualização mais imersiva com um brilho ambiente dinâmico e reativo para seus vídeos.',
            html_url: '/Ambient-Light-Effect/Ambient-Light-Effect.html',
            tech: 'SVG · CSS',
            accent: 'hsl(190, 70%, 60%)',
            featured: true,
            image: 'imgs/projetos/ambilight.svg'
        },
        {
            name: 'Calculadora de Listas',
            description: 'Utilitário simples para somar uma lista de valores, lidando com formatos complexos como moeda (R$), números negativos e separadores mistos.',
            html_url: '/somaValores/somaValores.html',
            tech: 'JavaScript',
            accent: 'hsl(100, 66%, 58%)',
            featured: true,
            image: 'imgs/projetos/calculadora-listas.svg'
        },
        {
            name: 'Gerador de Links Markdown',
            description: 'Organize links instantaneamente. Converte URLs soltas em Markdown formatado, com reconhecimento automático de títulos para YouTube, GitHub, Redes Sociais e Documentações.',
            html_url: '/linksMD/linksMD.html',
            tech: 'JavaScript',
            accent: 'hsl(262, 68%, 66%)',
            featured: true,
            image: 'imgs/projetos/links-markdown.svg'
        },
        {
            name: 'Agenda Inteligente',
            description: 'Calendário robusto no estilo Google Agenda, com suporte a eventos de múltiplos dias em barras contínuas, visualizações por semana/mês e design com Glassmorphism.',
            html_url: '/weekAgenda/weekAgenda.html',
            tech: 'JavaScript · CSS',
            accent: 'hsl(210, 70%, 62%)',
            featured: false,
            image: 'imgs/projetos/agenda-inteligente.svg'
        },
        {
            name: 'Portal do Colaborador - Univale',
            description: 'Desenvolvido do zero com HTML, CSS e JS. Integração via API com a plataforma Fluig.',
            html_url: 'https://portalcolaborador.univale.br/',
            tech: 'Fluig · REST',
            accent: 'hsl(12, 78%, 60%)',
            featured: true,
            image: 'imgs/projetos/portal-colaborador.svg'
        }
    ];

    const searchInput = document.getElementById('searchInput');
    const countElement = document.getElementById('portfolioCount');

    let allFetchedRepos = [];
    let currentFilter = '';

    class PaginatedList {
        constructor(data, itemsPerPage, containerId, paginationId, renderItemCallback) {
            this.data = data;
            this.itemsPerPage = itemsPerPage;
            this.container = document.getElementById(containerId);
            this.paginationContainer = document.getElementById(paginationId);
            this.renderItemCallback = renderItemCallback;
            this.containerId = containerId;

            const savedPage = readStorage(sessionStorage, `pagina_${this.containerId}`);
            this.currentPage = savedPage ? Math.max(1, parseInt(savedPage, 10) || 1) : 1;

            this.filteredData = [...data];

            if (!this.container || !this.paginationContainer) return;
        }

        updateData(newData) {
            this.data = newData;
            this.filter(currentFilter, false, false);
        }

        filter(searchTerm, animate = false, resetPage = true) {
            const term = normalizeText(searchTerm);

            this.filteredData = this.data.filter((item) => {
                if (!term) return true;
                return [
                    item.name,
                    getRepoDisplayName(item.name),
                    item.description,
                    item.tech,
                    item.language
                ].some((value) => normalizeText(value).includes(term));
            });

            if (resetPage) {
                this.currentPage = 1;
                writeStorage(sessionStorage, `pagina_${this.containerId}`, '1');
            }

            this.render(animate);
        }

        pageSize(page = this.currentPage) {
            // O primeiro card é um hero de 2 colunas; 11 itens fecham a grade em 4 linhas.
            return page === 1 ? Math.max(1, this.itemsPerPage - 1) : this.itemsPerPage;
        }

        render(animate = true) {
            this.container.innerHTML = '';
            this.paginationContainer.innerHTML = '';

            if (this.filteredData.length === 0) {
                this.container.innerHTML = '<p class="empty-projects">Nenhum projeto encontrado. Tente outro termo.</p>';
                if (countElement) countElement.textContent = '';
                return;
            }

            const firstPageSize = this.pageSize(1);
            const totalPages = this.filteredData.length <= firstPageSize
                ? 1
                : 1 + Math.ceil((this.filteredData.length - firstPageSize) / this.itemsPerPage);
            if (this.currentPage > totalPages) {
                this.currentPage = totalPages;
                writeStorage(sessionStorage, `pagina_${this.containerId}`, totalPages);
            }

            const startIndex = this.currentPage === 1
                ? 0
                : firstPageSize + (this.currentPage - 2) * this.itemsPerPage;
            const pageSize = this.pageSize(this.currentPage);
            const endIndex = Math.min(startIndex + pageSize, this.filteredData.length);
            const pageData = this.filteredData.slice(startIndex, endIndex);

            if (countElement) {
                countElement.textContent = `Mostrando ${startIndex + 1}–${endIndex} de ${this.filteredData.length} ${this.filteredData.length === 1 ? 'projeto' : 'projetos'}`;
            }

            pageData.forEach((item, index) => {
                const card = this.renderItemCallback(item, index, this.currentPage);
                if (!animate) {
                    card.classList.add('visible');
                }
                this.container.appendChild(card);
            });

            this.renderPagination(totalPages);
            if (animate) setupAnimations();
        }

        renderPagination(totalPages) {
            if (totalPages <= 1) return;

            const createButton = (label, page, { disabled = false, active = false, ariaLabel = '' } = {}) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `page-btn ${active ? 'active' : ''}`.trim();
                button.textContent = label;
                button.disabled = disabled;
                if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
                if (active) button.setAttribute('aria-current', 'page');

                if (!disabled && !active) {
                    button.addEventListener('click', () => {
                        this.currentPage = page;
                        writeStorage(sessionStorage, `pagina_${this.containerId}`, page);
                        this.render();
                        this.scrollToTop();
                    });
                }

                return button;
            };

            this.paginationContainer.appendChild(
                createButton('‹', this.currentPage - 1, {
                    disabled: this.currentPage === 1,
                    ariaLabel: 'Página anterior'
                })
            );

            for (let page = 1; page <= totalPages; page++) {
                const isNearCurrent = Math.abs(page - this.currentPage) <= 1;
                const isEdge = page === 1 || page === totalPages;

                if (isEdge || isNearCurrent) {
                    this.paginationContainer.appendChild(
                        createButton(String(page), page, {
                            active: page === this.currentPage,
                            ariaLabel: `Página ${page}`
                        })
                    );
                } else if (Math.abs(page - this.currentPage) === 2) {
                    const dots = document.createElement('span');
                    dots.className = 'page-dots';
                    dots.textContent = '…';
                    dots.setAttribute('aria-hidden', 'true');
                    this.paginationContainer.appendChild(dots);
                }
            }

            this.paginationContainer.appendChild(
                createButton('›', this.currentPage + 1, {
                    disabled: this.currentPage === totalPages,
                    ariaLabel: 'Próxima página'
                })
            );
        }

        scrollToTop() {
            const section = document.getElementById('portfolio');
            if (!section) return;
            const offset = window.scrollY + section.getBoundingClientRect().top - 20;
            window.scrollTo({ top: Math.max(offset, 0), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        }
    }

    const bentoList = new PaginatedList([], CARD_PAGE_SIZE, 'bentoGrid', 'paginationRepos', createBentoCard);

    if (searchInput) {
        let timeout = null;

        searchInput.addEventListener('input', (event) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                currentFilter = event.target.value;
                writeStorage(sessionStorage, 'portfolioFilter', currentFilter);
                bentoList.filter(currentFilter, true, true);
            }, 250);
        });

        const storedFilter = readStorage(sessionStorage, 'portfolioFilter', '') || '';
        if (storedFilter) {
            searchInput.value = storedFilter;
            currentFilter = storedFilter;
        }
    }

    const cached = readStorage(localStorage, REPOS_CACHE_KEY);
    let staleCache = null;
    let shouldFetch = true;

    if (cached) {
        try {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < REPOS_CACHE_DURATION) {
                handleReposData(data);
                shouldFetch = false;
            } else {
                staleCache = data;
            }
        } catch (error) {
            console.warn('Cache de repositórios inválido, buscando novamente...');
        }
    }

    if (shouldFetch) {
        fetch('https://api.github.com/users/Rafael-Reis1/repos?per_page=100&sort=pushed&direction=desc')
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((data) => {
                writeStorage(localStorage, REPOS_CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    data
                }));
                handleReposData(data);
            })
            .catch((error) => {
                console.error('Erro ao buscar repositórios:', error);
                // Usa o cache vencido (se houver) em vez de sumir com os repositórios.
                handleReposData(staleCache || []);
            });
    }

    function handleReposData(data) {
        const extraNames = new Set(extraRepos.map((repo) => repo.name.toLowerCase()));

        const githubRepos = (Array.isArray(data) ? data : [])
            .filter((repo) => repo && !repo.fork && !repo.archived)
            .filter((repo) => {
                const name = String(repo.name || '').toLowerCase();
                // Fora: o próprio site e o repositório de perfil (README do GitHub).
                return name && name !== 'rafael-reis1.github.io' && name !== 'rafael-reis1';
            })
            .filter((repo) => !extraNames.has(repo.name.toLowerCase()))
            .map((repo) => ({ ...repo, isGithub: true }));

        allFetchedRepos = githubRepos;

        bentoList.updateData([...extraRepos, ...allFetchedRepos]);
    }
}

const COVER_PALETTE = ['#f2511b', '#4f8cff', '#37b24d', '#9b6dff', '#e8b931', '#22b8cf', '#ff6b9d', '#a3e635'];

function hashString(value) {
    let hash = 0;
    for (const char of String(value || '')) {
        hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    }
    return hash;
}

function getRepoInitials(name) {
    const stopwords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'para', 'por', 'the', 'of', 'and', 'to', 'in']);
    const words = String(name || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter((word) => word && !stopwords.has(word.toLowerCase()));

    if (words.length === 0) return 'GH';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

function getRepoDisplayName(name) {
    const minorWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'para', 'por', 'a', 'o', 'as', 'os']);
    return String(name || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map((word, index) => {
            if (!word) return '';
            if (/[A-Z]/.test(word)) return word;
            if (index > 0 && minorWords.has(word)) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

function createRepoCover(name, accent) {
    const initials = getRepoInitials(name);
    const hash = hashString(name);
    const glowX = 0.72 + (hash % 19) / 100;
    const glowY = 0.08 + ((hash >>> 5) % 17) / 100;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420" width="800" height="420">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#151632"/>
      <stop offset="1" stop-color="#080916"/>
    </linearGradient>
    <radialGradient id="glow" cx="${glowX}" cy="${glowY}" r="0.75">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0v48" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="800" height="420" fill="url(#bg)"/>
  <rect width="800" height="420" fill="url(#glow)"/>
  <rect width="800" height="420" fill="url(#grid)" opacity="0.55"/>
  <text x="610" y="340" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="210" font-weight="800" fill="${accent}" opacity="0.16">${initials}</text>
  <rect x="52" y="52" width="72" height="6" rx="3" fill="${accent}"/>
  <circle cx="748" cy="372" r="26" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="2"/>
  <circle cx="748" cy="372" r="8" fill="${accent}" fill-opacity="0.45"/>
</svg>`;

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function createBentoCard(repo, index, currentPage = 1) {
    const isHero = index === 0 && currentPage === 1;
    const href = safeHref(repo.html_url);
    const isExternal = /^https?:\/\//i.test(href);
    const isInternal = !repo.isGithub;

    const card = document.createElement('a');
    card.href = href;
    if (isExternal) {
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
    }
    card.className = `bento-card fade-in ${isHero ? 'bento-hero' : 'bento-feat'}`;
    if (!isInternal) card.title = repo.name;

    const languageAccents = {
        JavaScript: '#F7DF1E',
        TypeScript: '#3178C6',
        HTML: '#E34C26',
        CSS: '#2449E4',
        'C#': '#68217A',
        Java: '#ED8B00'
    };

    const language = repo.tech || repo.language || 'Web';
    const languageAccent = repo.accent
        || languageAccents[repo.language]
        || COVER_PALETTE[hashString(repo.name) % COVER_PALETTE.length];
    const coverAccent = repo.accent
        || COVER_PALETTE[hashString(`${repo.name}-cover`) % COVER_PALETTE.length];
    const displayName = isInternal ? repo.name : getRepoDisplayName(repo.name);
    const cover = repo.image || createRepoCover(repo.name, coverAccent);
    const coverLoading = repo.image ? (isHero ? 'eager' : 'lazy') : 'eager';
    const description = String(repo.description || '').trim()
        || (isInternal
            ? 'Aplicação web interativa.'
            : repo.language ? `Código aberto em ${language}.` : 'Código aberto no GitHub.');

    const badge = isInternal
        ? '<div class="bento-badge internal">Aplicação Web</div>'
        : '<div class="bento-badge github"><img src="imgs/GitHub.svg" alt="" aria-hidden="true">Repositório</div>';

    const imageHtml = `<div class="bento-card-image"><img src="${escapeHtml(cover)}" alt="" loading="${coverLoading}" decoding="async"></div>`;

    card.innerHTML = `
        ${imageHtml}
        <div class="bento-card-header">
            ${badge}
            ${isExternal ? '<span class="bento-card-arrow" aria-hidden="true">↗</span>' : ''}
        </div>
        <div class="bento-card-content">
            <h3 class="bento-card-title">${escapeHtml(displayName)}</h3>
            <p class="bento-card-desc" title="${escapeHtml(description)}">${escapeHtml(description)}</p>
            <div class="bento-card-bottom">
                <span class="bento-card-lang" style="color:${escapeHtml(languageAccent)}">${escapeHtml(language)}</span>
            </div>
        </div>
    `;

    return card;
}

/* -------------------------------------------------------------------------- */
/* Animações                                                                   */
/* -------------------------------------------------------------------------- */

function setupAnimations() {
    if (fadeObserver) {
        fadeObserver.disconnect();
        fadeObserver = null;
    }

    const elements = document.querySelectorAll('.fade-in:not(.visible)');
    if (elements.length === 0) return;

    if (prefersReducedMotion()) {
        elements.forEach((element) => element.classList.add('visible'));
        return;
    }

    fadeObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                fadeObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

    elements.forEach((element) => fadeObserver.observe(element));
}

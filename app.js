
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupDragScroll();
    setupModal();
    fetchAndDisplayRepos();
    setupAnimations();
});

function setupTabs() {
    const tabs = {
        'btnSobre': 'sobre',
        'btnCurriculo': 'curriculo',
        'btnPortfolio': 'portfolio'
    };

    const mainInfo = document.querySelector('.mainInfo');
    const sections = Object.values(tabs).map(id => document.getElementById(id));
    const buttons = Object.keys(tabs).map(id => document.getElementById(id));

    let resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            if (entry.target.style.display !== 'none') {
                mainInfo.style.height = entry.target.offsetHeight + 'px';
            }
        }
    });

    const activateTab = (btnId) => {
        const targetId = tabs[btnId];
        const targetSection = document.getElementById(targetId);
        const btn = document.getElementById(btnId);

        if (!targetSection || !btn) return;

        buttons.forEach(b => b.classList.remove('btnAccentColor'));
        btn.classList.add('btnAccentColor');

        sections.forEach(sec => resizeObserver.unobserve(sec));

        sections.forEach(sec => {
            sec.style.opacity = 0;
            setTimeout(() => {
                if (sec !== targetSection) sec.style.display = 'none';
            }, 250);
        });

        targetSection.style.display = 'block';

        resizeObserver.observe(targetSection);

        mainInfo.style.height = targetSection.offsetHeight + 'px';

        setTimeout(() => {
            targetSection.style.opacity = 1;
        }, 100);

        sessionStorage.setItem('activeTab', btnId);
    };

    buttons.forEach(btn => {
        btn.addEventListener('click', () => activateTab(btn.id));
    });

    const savedTab = sessionStorage.getItem('activeTab');
    if (savedTab && tabs[savedTab]) {
        const targetId = tabs[savedTab];
        const targetSection = document.getElementById(targetId);
        const btn = document.getElementById(savedTab);

        if (targetSection && btn) {
            buttons.forEach(b => b.classList.remove('btnAccentColor'));
            btn.classList.add('btnAccentColor');
            sections.forEach(sec => {
                sec.style.opacity = 0;
                sec.style.display = 'none';
            });
            targetSection.style.display = 'block';
            targetSection.style.opacity = 1;

            resizeObserver.observe(targetSection);

            mainInfo.style.height = targetSection.offsetHeight + 'px';
        }
    } else {
        const initialSection = document.getElementById('sobre');
        if (initialSection) {
            resizeObserver.observe(initialSection);
            mainInfo.style.height = initialSection.offsetHeight + 'px';
        }
    }

    document.getElementById('github')?.addEventListener('click', () => window.open('https://github.com/Rafael-Reis1', 'github'));
    document.getElementById('LinkedIn')?.addEventListener('click', () => window.open('https://www.LinkedIn.com/in/rafael-reis-00331b85/', 'LinkedIn'));
    document.getElementById('mail')?.addEventListener('click', () => window.location.href = 'mailto:reisr5941@gmail.com?subject=Sobre desenvolvimento web.&body=Quero te contratar para criar meu site!');
}

function setupDragScroll() {
    const slider = document.getElementById('habilidadesContainer');
    if (!slider) return;

    let isDown = false;
    let startX;
    let scrollLeft;

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
    });
    slider.addEventListener('mouseleave', () => isDown = false);
    slider.addEventListener('mouseup', () => isDown = false);
    slider.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - slider.offsetLeft;
        const walk = (x - startX) * 2;
        slider.scrollLeft = scrollLeft - walk;
    });

    slider.querySelectorAll('img').forEach(img => {
        img.addEventListener('dragstart', e => e.preventDefault());
    });
}

function setupModal() {
    const btnDownload = document.getElementById('btnCurriculoDownload');
    const modal = document.getElementById('curriculoLive');
    const overlay = document.getElementById('overlay');
    const closeBtn = document.getElementById('closeButton');
    const downloadBtnModal = document.getElementById('downloadButtonModal');

    if (!btnDownload || !modal || !overlay) return;

    function toggleModal(show) {
        if (document.startViewTransition) {
            document.startViewTransition(() => {
                if (show) {
                    modal.style.display = 'block';
                    modal.classList.add('show');
                    btnDownload.style.display = 'none';
                    overlay.style.display = 'block';
                    overlay.classList.add('show');
                    closeBtn.style.display = 'flex';
                    closeBtn.classList.add('show');
                    downloadBtnModal.classList.add('show');
                } else {
                    modal.style.display = 'none';
                    modal.classList.remove('show');
                    btnDownload.style.display = 'flex';
                    overlay.style.display = 'none';
                    overlay.classList.remove('show');
                    closeBtn.style.display = 'none';
                    closeBtn.classList.remove('show');
                    downloadBtnModal.classList.remove('show');
                }
            });
        } else {
            if (show) {
                modal.style.display = 'block';
                modal.offsetHeight;
                modal.classList.add('show');
                btnDownload.style.display = 'none';
                overlay.style.display = 'block';
                setTimeout(() => overlay.classList.add('show'), 10);
                closeBtn.style.display = 'flex';
                setTimeout(() => closeBtn.classList.add('show'), 10);
                downloadBtnModal.classList.add('show');
            } else {
                modal.classList.remove('show');
                overlay.classList.remove('show');
                closeBtn.classList.remove('show');
                downloadBtnModal.classList.remove('show');

                setTimeout(() => {
                    modal.style.display = 'none';
                    btnDownload.style.display = 'flex';
                    overlay.style.display = 'none';
                    closeBtn.style.display = 'none';
                }, 300);
            }
        }
    }

    btnDownload.addEventListener('click', () => toggleModal(true));
    overlay.addEventListener('click', () => toggleModal(false));
    closeBtn.addEventListener('click', () => toggleModal(false));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) toggleModal(false);
    });

    downloadBtnModal.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = 'docs/Currículo.pdf';
        link.download = 'Currículo.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

function fetchAndDisplayRepos() {
    const extraRepos = [
        {
            name: 'Financeiro Pessoal',
            description: "Gerencie suas finanças com dashboard interativo, gráficos por categoria, filtros avançados e backup em JSON.",
            html_url: '/finance/finance.html',
            language: 'JavaScript',
            featured: true,
            image: 'imgs/JavaScript.svg'
        },
        {
            name: 'Minha Biblioteca',
            description: "Organize seus livros e leituras. Sincronização em tempo real com Firebase e interface moderna.",
            html_url: '/reading/reading.html',
            language: 'JavaScript',
            featured: true,
            image: 'imgs/JavaScript.svg'
        },
        {
            name: 'PDF Booklet Maker',
            description: "Transforme qualquer PDF em livreto (booklet) pronto para impressão. Faz a imposição de páginas automaticamente, reorganizando-as para encadernação com visualização em tempo real.",
            html_url: '/pdfFormatter/pdfFormater.html',
            language: 'JavaScript',
            featured: true,
            image: 'imgs/JavaScript.svg'
        },
        {
            name: 'P2P Share & Stream',
            description: "Plataforma P2P para transferência de arquivos e streaming de vídeo/tela em tempo real via WebRTC. Possui integração nativa com OBS Studio (Clean Feed), suporte a PWA (Mobile/Desktop), 'Share Target' e arquitetura Serverless com reconexão inteligente.",
            html_url: '/P2PShare/P2PShare.html',
            language: 'JavaScript',
            featured: true,
            image: 'imgs/JavaScript.svg'
        },
        {
            name: 'Ferramentas de Imagem & IA',
            description: "Suíte completa de edição 100% client-side (Privacidade garantida). Inclui IA para remoção de fundo e OCR, além de compressão, conversão, filtros e ferramentas de censura automática.",
            html_url: '/imgConver/imgConver.html',
            language: 'JavaScript',
            featured: true,
            image: 'imgs/JavaScript.svg'
        },
        {
            name: 'Leitor de Logs Totvs Fluig',
            description: "Ferramenta moderna para leitura e análise de logs. Possui filtros exclusivos, busca em tempo real e visualização inteligente de stack traces.",
            html_url: '/Leitor-logs-totvs-fluig/leitor.html',
            language: 'JavaScript',
            featured: true,
            image: 'imgs/JavaScript.svg'
        },
        {
            name: 'Gemini Nano Web App',
            description: "Experience the speed and privacy of on-device AI. Uses Chrome's built-in Gemini Nano API.",
            html_url: '/chromeAILocal/chromeAILocal.html',
            language: 'HTML',
            featured: true,
            image: 'imgs/JavaScript.svg'
        },
        {
            name: 'Formatar para lista de números separada por vírgulas',
            description: 'Easily format any list of numbers into a clean, comma-separated list.',
            html_url: '/Formatar para lista separada por virgulas/Formatar para lista separada por virgulas.html',
            language: 'HTML',
            featured: true,
            image: 'imgs/Html 5.svg'
        },
        {
            name: 'Compara 2 listas de nomes',
            description: "Quickly analyze any two lists to see what's missing, extra, or repeated.",
            html_url: '/ComparaListasNomes/ComparaListasNomes.html',
            language: 'HTML',
            featured: true,
            image: 'imgs/Html 5.svg'
        },
        {
            name: 'Efeito de luz ambiente imersivo',
            description: "Create a more immersive viewing experience with a dynamic ambient glow for your videos.",
            html_url: '/Ambient-Light-SVG-Filters/Ambient-Light-SVG-Filters.html',
            language: 'HTML',
            featured: true,
            image: 'imgs/CSS3.svg'
        },
        {
            name: 'Soma lista de valores',
            description: "A simple calculator to sum a list of values, handling complex formats like currency (R$), negatives, and mixed separators.",
            html_url: '/somaValores/somaValores.html',
            language: 'HTML',
            featured: true,
            image: 'imgs/JavaScript.svg'
        },
        {
            name: 'Gerador de Links Markdown',
            description: "Organize links instantaneamente. Converte URLs soltas em Markdown formatado, com reconhecimento automático de títulos para YouTube, GitHub, Redes Sociais e Documentações.",
            html_url: '/linksMD/linksMD.html',
            language: 'JavaScript',
            featured: true,
            image: 'imgs/JavaScript.svg'
        },
        {
            name: 'Portal do Colaborador - Univale',
            description: "Desenvolvido do zero com HTML, CSS e JS. Integração via API com a plataforma Fluig.",
            html_url: 'https://portalcolaborador.univale.br/',
            language: 'HTML',
            featured: true,
            image: 'imgs/JavaScript.svg'
        }
    ];

    const reposTitle = document.querySelector('.subtitleReposi');
    const searchInput = document.getElementById('searchInput');

    let allFetchedRepos = [];
    let currentFilter = '';

    class PaginatedList {
        constructor(data, itemsPerPage, containerId, paginationId, renderItemCallback) {
            this.data = data;
            this.itemsPerPage = itemsPerPage;
            this.container = document.getElementById(containerId);
            this.paginationContainer = document.getElementById(paginationId);
            this.renderItemCallback = renderItemCallback;
            this.currentPage = 1;
            this.filteredData = [...data];
        }

        updateData(newData) {
            this.data = newData;
            this.filter(currentFilter, currentFilter === '');
        }

        filter(searchTerm, animate = false) {
            this.filteredData = this.data.filter(item => {
                const term = searchTerm.toLowerCase();
                return item.name.toLowerCase().includes(term) ||
                    (item.description && item.description.toLowerCase().includes(term));
            });
            this.currentPage = 1;
            this.render(animate);
        }

        render(animate = true) {
            this.container.innerHTML = '';
            this.paginationContainer.innerHTML = '';

            if (this.filteredData.length === 0) {
                this.container.innerHTML = '<p style="text-align: center; color: var(--text-color); width: 100%; padding: 20px;">Nenhum resultado encontrado.</p>';
                return;
            }

            const startIndex = (this.currentPage - 1) * this.itemsPerPage;
            const endIndex = startIndex + this.itemsPerPage;
            const pageItems = this.filteredData.slice(startIndex, endIndex);

            pageItems.forEach(item => {
                const card = this.renderItemCallback(item);
                if (!animate) {
                    card.classList.remove('fade-in');
                }
                this.container.appendChild(card);
            });

            this.renderPagination();
            if (animate) {
                setupAnimations();
            }
        }

        renderPagination() {
            const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
            if (totalPages <= 1) return;

            const createBtn = (text, onClick, disabled = false, active = false) => {
                const btn = document.createElement('button');
                btn.innerText = text;
                btn.className = `pagination-btn ${active ? 'active' : ''}`;
                btn.disabled = disabled;
                btn.addEventListener('click', onClick);
                return btn;
            };

            this.paginationContainer.appendChild(createBtn('<', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.render();
                }
            }, this.currentPage === 1));

            let startPage = Math.max(1, this.currentPage - 2);
            let endPage = Math.min(totalPages, startPage + 4);

            if (endPage - startPage < 4) {
                startPage = Math.max(1, endPage - 4);
            }

            for (let i = startPage; i <= endPage; i++) {
                this.paginationContainer.appendChild(createBtn(i, () => {
                    this.currentPage = i;
                    this.render();
                }, false, i === this.currentPage));
            }

            this.paginationContainer.appendChild(createBtn('>', () => {
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.render();
                }
            }, this.currentPage === totalPages));
        }
    }

    const featuredList = new PaginatedList(
        extraRepos,
        6,
        'destaquesContainer',
        'paginationDestaques',
        createFeaturedCard
    );
    featuredList.render();

    const reposList = new PaginatedList(
        [],
        6,
        'repos',
        'paginationRepos',
        createRepoCard
    );

    searchInput.addEventListener('input', (e) => {
        currentFilter = e.target.value;
        featuredList.filter(currentFilter, false);
        reposList.filter(currentFilter, false);
    });

    const CACHE_KEY = 'github_repos_cache';
    const CACHE_DURATION = 5 * 60 * 1000;

    const cached = localStorage.getItem(CACHE_KEY);
    const now = new Date().getTime();

    let shouldFetch = true;

    if (cached) {
        try {
            const { timestamp, data } = JSON.parse(cached);
            if (now - timestamp < CACHE_DURATION) {
                handleReposData(data);
                shouldFetch = false;
            }
        } catch (e) {
            console.warn('Cache inválido, buscando novamente...');
        }
    }

    if (shouldFetch) {
        fetch('https://api.github.com/users/Rafael-Reis1/repos')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: new Date().getTime(),
                    data: data
                }));
                handleReposData(data);
            })
            .catch(err => {
                console.error('Error fetching repos:', err);
                if (reposTitle) reposTitle.style.display = 'none';
            });
    }

    function handleReposData(data) {
        const extraRepoNames = extraRepos.map(r => r.name.toLowerCase());
        allFetchedRepos = data.filter(repo => !extraRepoNames.includes(repo.name.toLowerCase()));

        if (allFetchedRepos.length > 0) {
            if (reposTitle) reposTitle.style.display = 'block';

            reposList.updateData(allFetchedRepos);
        }
    }
}

function createFeaturedCard(repo) {
    const card = document.createElement('a');
    card.href = repo.html_url;

    card.className = 'destaqueCard fade-in';

    const imgSrc = repo.image || 'imgs/GitHub.svg';

    card.innerHTML = `
        <div class="destaqueImg" style="background: #2a2b3d; display: flex; align-items: center; justify-content: center; height: 200px;">
            <img src="${imgSrc}" alt="${repo.name}" style="height: 60%; width: auto;">
        </div>
        <div class="destaqueInfo">
            <h3>${repo.name}</h3>
            <p>${repo.description || 'Sem descrição'}</p>
        </div>
    `;
    return card;
}

function createRepoCard(repo) {
    const card = document.createElement('a');
    card.href = repo.html_url;
    card.target = "_blank";
    card.className = 'destaqueCard fade-in';

    let imgSrc = 'imgs/GitHub.svg';
    if (repo.language) {
        const lang = repo.language.toLowerCase();
        if (lang.includes('html')) imgSrc = 'imgs/Html 5.svg';
        else if (lang.includes('css')) imgSrc = 'imgs/CSS3.svg';
        else if (lang.includes('javascript')) imgSrc = 'imgs/JavaScript.svg';
        else if (lang.includes('c#')) imgSrc = 'imgs/C Sharp Logo.svg';
        else if (lang.includes('typescript')) imgSrc = 'imgs/JavaScript.svg';
    }

    card.innerHTML = `
        <div class="destaqueImg" style="background: #2a2b3d; display: flex; align-items: center; justify-content: center; height: 200px;">
            <img src="${imgSrc}" alt="${repo.name}" style="height: 60%; width: auto;">
        </div>
        <div class="destaqueInfo">
            <h3>${repo.name}</h3>
            <p>${repo.description || 'Sem descrição'}</p>
        </div>
    `;
    return card;
}

function setupAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

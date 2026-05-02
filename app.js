document.addEventListener('DOMContentLoaded', () => {
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    setupTabs();
    setupDragScroll();
    setupModal();
    fetchAndDisplayRepos();
    setupAnimations();

    window.addEventListener('scroll', () => {
        sessionStorage.setItem('scrollPosition', window.scrollY);
    });
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
            targetSection.querySelectorAll('.fade-in:not(.visible)').forEach(el => {
                el.classList.add('visible');
            });
        }, 150);

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

    document.getElementById('btnVerPortfolio')?.addEventListener('click', () => activateTab('btnPortfolio'));
    document.getElementById('btnContato')?.addEventListener('click', () => window.location.href = 'mailto:reisr5941@gmail.com?subject=Contato via Portfólio');
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
        if (show) {
            document.documentElement.style.overflow = 'hidden';
        } else {
            document.documentElement.style.overflow = '';
        }

        if (document.startViewTransition) {
            document.startViewTransition(() => {
                if (show) {
                    modal.style.display = 'block';
                    modal.classList.add('show');
                    overlay.style.display = 'block';
                    overlay.classList.add('show');
                    closeBtn.style.display = 'flex';
                    closeBtn.classList.add('show');
                    downloadBtnModal.classList.add('show');
                } else {
                    modal.classList.remove('show');
                    overlay.style.display = 'none';
                    overlay.classList.remove('show');
                    closeBtn.style.display = 'none';
                    closeBtn.classList.remove('show');
                    downloadBtnModal.classList.remove('show');
                }
            });
        } else {
            if (show) {
                modal.offsetHeight;
                modal.classList.add('show');
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
            this.containerId = containerId;

            const savedPage = sessionStorage.getItem(`pagina_${this.containerId}`);
            this.currentPage = savedPage ? parseInt(savedPage, 10) : 1;

            this.filteredData = [...data];
        }

        updateData(newData) {
            this.data = newData;
            this.filter(currentFilter, currentFilter === '', false);
        }

        filter(searchTerm, animate = false, resetarPagina = true) {
            this.filteredData = this.data.filter(item => {
                const term = searchTerm.toLowerCase();
                return item.name.toLowerCase().includes(term) ||
                    (item.description && item.description.toLowerCase().includes(term));
            });
            
            if (resetarPagina) {
                this.currentPage = 1;
                sessionStorage.setItem(`pagina_${this.containerId}`, this.currentPage);
            }
            
            const repoCount = document.getElementById('repo-count');
            if(repoCount) repoCount.textContent = this.filteredData.length;

            this.render(animate);
        }

        render(animate = true) {
            this.container.innerHTML = '';
            this.paginationContainer.innerHTML = '';

            if (this.filteredData.length === 0) {
                this.container.innerHTML = '<p style="text-align: center; color: var(--text-color); width: 100%; padding: 20px;">Nenhum repositório encontrado.</p>';
                return;
            }

            const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
            if (this.currentPage > totalPages && totalPages > 0) {
                this.currentPage = totalPages;
                sessionStorage.setItem(`pagina_${this.containerId}`, this.currentPage);
            }

            const startIndex = (this.currentPage - 1) * this.itemsPerPage;
            const endIndex = startIndex + this.itemsPerPage;
            const pageData = this.filteredData.slice(startIndex, endIndex);

            pageData.forEach((item, index) => {
                const card = this.renderItemCallback(item, index, this.currentPage);
                if (!animate) {
                    card.classList.remove('fade-in');
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }
                this.container.appendChild(card);
            });

            this.renderPagination(totalPages);
            if (animate) setupAnimations();
        }

        renderPagination(totalPages) {
            if (totalPages <= 1) return;

            const createBtn = (text, page, disabled = false, active = false) => {
                const btn = document.createElement('button');
                btn.className = `page-btn ${active ? 'active' : ''}`;
                btn.innerHTML = text;
                btn.disabled = disabled;
                if (!disabled && !active) {
                    btn.addEventListener('click', () => {
                        this.currentPage = page;
                        sessionStorage.setItem(`pagina_${this.containerId}`, this.currentPage);
                        this.render();
                        
                        const sectionHeader = document.querySelector('.bento-header');
                        if (sectionHeader) {
                            const yOffset = -20; 
                            const y = sectionHeader.getBoundingClientRect().top + window.pageYOffset + yOffset;
                            window.scrollTo({top: y, behavior: 'smooth'});
                        }
                    });
                }
                return btn;
            };

            this.paginationContainer.appendChild(createBtn('&lt;', this.currentPage - 1, this.currentPage === 1));

            for (let i = 1; i <= totalPages; i++) {
                if (
                    i === 1 || 
                    i === totalPages || 
                    (i >= this.currentPage - 1 && i <= this.currentPage + 1)
                ) {
                    this.paginationContainer.appendChild(createBtn(i, i, false, i === this.currentPage));
                } else if (
                    i === this.currentPage - 2 || 
                    i === this.currentPage + 2
                ) {
                    const dots = document.createElement('span');
                    dots.className = 'page-dots';
                    dots.innerText = '...';
                    this.paginationContainer.appendChild(dots);
                }
            }

            this.paginationContainer.appendChild(createBtn('&gt;', this.currentPage + 1, this.currentPage === totalPages));
        }
    }

    const bentoList = new PaginatedList([], 11, 'bentoGrid', 'paginationRepos', createBentoCard);

    if (searchInput) {
        let timeout = null;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                currentFilter = e.target.value;
                bentoList.filter(currentFilter, true, true); 
            }, 300);
        });

        const storedFilter = sessionStorage.getItem('portfolioFilter') || '';
        if (storedFilter) {
            searchInput.value = storedFilter;
            currentFilter = storedFilter;
        }
    }

    const CACHE_KEY = 'github_repos_cache';
    const CACHE_DURATION = 10 * 60 * 1000;

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
                bentoList.updateData([...extraRepos]);
            });
    }

    function handleReposData(data) {
        const extraRepoNames = extraRepos.map(r => r.name.toLowerCase());
        allFetchedRepos = data.filter(repo => !extraRepoNames.includes(repo.name.toLowerCase()));
        
        allFetchedRepos.forEach(repo => repo.isGithub = true);

        if (bentoList) {
            bentoList.updateData([...extraRepos, ...allFetchedRepos]);
        }
    }
}

function createBentoCard(repo, index, currentPage = 1) {
    const isHero = (index === 0 && currentPage === 1);
    const card = document.createElement('a');
    card.href = repo.html_url;
    if (repo.html_url.startsWith('http')) { card.target = '_blank'; card.rel = 'noopener'; }
    card.className = `bento-card fade-in ${isHero ? 'bento-hero' : 'bento-feat'}`;

    const lang = repo.language || 'Web';
    const langAccents = {
        'JavaScript': '#F7DF1E', 'TypeScript': '#3178C6',
        'HTML': '#E34C26', 'CSS': '#2449E4',
        'C#': '#68217A', 'Java': '#ED8B00',
    };
    const accent = langAccents[lang] || '#f2511b';
    const imgSrc = repo.image || 'imgs/JavaScript.svg';

    const isInternal = !repo.isGithub;
    const badgeHtml = isInternal 
        ? `<div class="bento-badge internal">Aplicação Web</div>`
        : `<div class="bento-badge github"><img src="imgs/GitHub.svg" alt="GitHub">GitHub Repo</div>`;

    card.innerHTML = `
        <div class="bento-card-header">
            ${badgeHtml}
            ${!isInternal ? '<span class="bento-card-arrow">↗</span>' : ''}
        </div>
        <div class="bento-card-content">
            <h3 class="bento-card-title">${repo.name}</h3>
            <p class="bento-card-desc">${repo.description || 'Sem descrição'}</p>
            <div class="bento-card-bottom">
                <span class="bento-card-lang" style="color:${accent}">${lang}</span>
            </div>
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

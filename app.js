
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

    const initialSection = document.getElementById('sobre');
    if (initialSection) {
        mainInfo.style.height = initialSection.offsetHeight + 'px';
    }

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = tabs[btn.id];
            const targetSection = document.getElementById(targetId);

            buttons.forEach(b => b.classList.remove('btnAccentColor'));
            btn.classList.add('btnAccentColor');

            sections.forEach(sec => {
                sec.style.opacity = 0;
                setTimeout(() => {
                    if (sec !== targetSection) sec.style.display = 'none';
                }, 250);
            });

            targetSection.style.display = 'block';
            mainInfo.style.height = targetSection.offsetHeight + 'px';

            setTimeout(() => {
                targetSection.style.opacity = 1;
            }, 100);
        });
    });

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
            html_url: '/Compara 2 listas de nomes/Compara 2 listas de nomes.html',
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
            name: 'Gemini Nano Web App',
            description: "Experience the speed and privacy of on-device AI. Uses Chrome's built-in Gemini Nano API.",
            html_url: '/chromeAILocal/chromeAILocal.html',
            language: 'HTML',
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

    fetch('https://api.github.com/users/Rafael-Reis1/repos')
        .then(response => response.json())
        .then(data => {
            const extraRepoNames = extraRepos.map(r => r.name.toLowerCase());
            const filteredData = data.filter(repo => !extraRepoNames.includes(repo.name.toLowerCase()));

            const allRepos = [...extraRepos, ...filteredData];
            const featuredContainer = document.querySelector('.destaquesContainer');
            const reposContainer = document.getElementById('repos');

            featuredContainer.innerHTML = '';
            reposContainer.innerHTML = '';

            allRepos.forEach(repo => {
                if (repo.featured) {
                    const card = createFeaturedCard(repo);
                    featuredContainer.appendChild(card);
                } else if (repo.description) {
                    const card = createRepoCard(repo);
                    reposContainer.appendChild(card);
                }
            });

            setupAnimations();
        })
        .catch(err => console.error('Error fetching repos:', err));
}

function createFeaturedCard(repo) {
    const card = document.createElement('a');
    card.href = repo.html_url;
    card.className = 'destaqueCard fade-in';

    const imgSrc = repo.image || 'imgs/GitHub.svg';

    card.innerHTML = `
        <div class="destaqueImg" style="background: #2a2b3d; display: flex; align-items: center; justify-content: center; height: 200px;">
            <img src="${imgSrc}" alt="${repo.name}" style="width: 100px; height: 100px; object-fit: contain;">
        </div>
        <div class="destaqueInfo">
            <h3>${repo.name}</h3>
            <p>${repo.description}</p>
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
            <img src="${imgSrc}" alt="${repo.language || 'GitHub Repo'}" style="width: 100px; height: 100px; object-fit: contain;">
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

    document.querySelectorAll('.fade-in, .infoCard, .infos').forEach(el => {
        el.classList.add('fade-in');
        observer.observe(el);
    });
}

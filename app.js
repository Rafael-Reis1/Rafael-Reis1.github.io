window.onload = function() {
    const btnSobre = document.getElementById('btnSobre');
    const btnCurriculo = document.getElementById('btnCurriculo');
    const btnPortfolio = document.getElementById('btnPortfolio');
    const sobre = document.getElementById('sobre');
    const curriculo = document.getElementById('curriculo');
    const github = document.getElementById('github');
    const instagram = document.getElementById('instagram');
    const LinkedIn = document.getElementById('LinkedIn');
    const mail = document.getElementById('mail');
    const mainInfo = document.querySelector('.mainInfo');
    const portfolio = document.getElementById('portfolio');
    const btnCurriculoDownload = document.getElementById('btnCurriculoDownload');
    const curriculoLive = document.getElementById('curriculoLive');
    const overlay = document.getElementById('overlay');
    const closeButton = document.getElementById('closeButton');
    const downloadButtonModal = document.getElementById('downloadButtonModal');
    mainInfo.style.height = sobre.offsetHeight + 'px';

    const habilidadesContainer = document.getElementById('habilidadesContainer');
    let isDragging = false;
    let startX;
    let scrollLeft;

    habilidadesContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.pageX - habilidadesContainer.offsetLeft;
        scrollLeft = habilidadesContainer.scrollLeft;
    });

    habilidadesContainer.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    habilidadesContainer.addEventListener('mouseup', () => {
        isDragging = false;
    });

    habilidadesContainer.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const x = e.pageX - habilidadesContainer.offsetLeft;
        const walk = (x - startX) * 2;
        habilidadesContainer.scrollLeft = scrollLeft - walk;
    });

    const imagens = habilidadesContainer.querySelectorAll('img');

    imagens.forEach(img => {
        img.addEventListener('dragstart', (e) => {
            e.preventDefault();
        });
    });

    btnSobre.onclick = function() {
        sobre.style.display = 'block';
        setTimeout(function() {
            sobre.style.opacity = 1;
        }, 100);

        mainInfo.style.height = sobre.offsetHeight + 'px';
        btnSobre.classList.add('btnAccentColor');
        btnCurriculo.classList.remove('btnAccentColor');
        btnPortfolio.classList.remove('btnAccentColor');
        curriculo.style.opacity = 0;
        portfolio.style.opacity = 0;
        
        setTimeout(function() {
            curriculo.style.display = 'none';
            portfolio.style.display = 'none';
        }, 250); 
    }

    btnCurriculo.onclick = function() {
        curriculo.style.display = 'block';
        setTimeout(function() {
            curriculo.style.opacity = 1;
        }, 100);

        mainInfo.style.height = curriculo.offsetHeight + 'px';
        btnSobre.classList.remove('btnAccentColor');
        btnCurriculo.classList.add('btnAccentColor');
        btnPortfolio.classList.remove('btnAccentColor');
        sobre.style.opacity = 0;
        portfolio.style.opacity = 0;
        
        setTimeout(function() {
            sobre.style.display = 'none';
            portfolio.style.display = 'none';
        }, 250); 
    }

    btnPortfolio.onclick = function() {
        portfolio.style.display = 'block';
        setTimeout(function() {
            portfolio.style.opacity = 1;
        }, 100);

        mainInfo.style.height = portfolio.offsetHeight + 'px';
        btnSobre.classList.remove('btnAccentColor');
        btnCurriculo.classList.remove('btnAccentColor');
        btnPortfolio.classList.add('btnAccentColor');
        sobre.style.opacity = 0;
        curriculo.style.opacity = 0;

        setTimeout(function() {
            curriculo.style.display = 'none';
            sobre.style.display = 'none';
        }, 250);
    }

    github.onclick = function() {
        window.open('https://github.com/Rafael-Reis1', 'github');
    }

    instagram.onclick = function() {
        window.open('https://www.instagram.com/rafael.reis1', 'insta');
    }

    LinkedIn.onclick = function() {
        window.open('https://www.LinkedIn.com/in/rafael-reis-00331b85/', 'LinkedIn');
    }

    mail.onclick = function() {
        window.location.href = 'mailto:reisr5941@gmail.com?subject=Sobre desenvolvimento web.&body=Quero te contratar para criar meu site!';
    }

    btnCurriculoDownload.onclick = function() {
        if (!document.startViewTransition) {
            curriculoLive.style.display = 'block';
            curriculoLive.classList.add('show');
            btnCurriculoDownload.style.display = 'none';
            overlay.style.display = 'block';
            overlay.classList.add('show');
            closeButton.style.display = 'flex';
            closeButton.classList.add('show');
            downloadButtonModal.classList.add('show');
            return;
        }

        document.startViewTransition(() => {
            curriculoLive.style.display = 'block';
            curriculoLive.classList.add('show');
            btnCurriculoDownload.style.display = 'none';
            overlay.style.display = 'block';
            overlay.classList.add('show');
            closeButton.style.display = 'flex';
            closeButton.classList.add('show');
            downloadButtonModal.classList.add('show');
            curriculoLive.style.viewTransitionName = 'shared-curriculo-area';
        });
    }

    overlay.addEventListener('click', closeIframe);
    closeButton.addEventListener('click', closeIframe);
    downloadButtonModal.addEventListener('click', () => {
        const filePath = 'docs/Currículo.pdf';
        const fileName = 'Currículo.pdf';
        const link = document.createElement('a');
        link.href = filePath;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    function closeIframe() {
        if (!document.startViewTransition) {
            curriculoLive.style.display = 'none';
            curriculoLive.classList.remove('show');
            btnCurriculoDownload.style.display = 'flex';
            overlay.style.display = 'none';
            overlay.classList.remove('show');
            closeButton.style.display = 'none';
            closeButton.classList.remove('show');
            downloadButtonModal.classList.remove('show');
            return;
        }

        document.startViewTransition(() => {
            curriculoLive.style.display = 'none';
            curriculoLive.classList.remove('show');
            btnCurriculoDownload.style.display = 'flex';
            overlay.style.display = 'none';
            overlay.classList.remove('show');
            closeButton.style.display = 'none';
            closeButton.classList.remove('show');
            downloadButtonModal.classList.remove('show');
            curriculoLive.style.viewTransitionName = '';
            btnCurriculoDownload.style.viewTransitionName = 'shared-curriculo-area';
        });
    }

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && curriculoLive.classList.contains('show')) {
            closeIframe();
        }
    });

    fetch('https://api.github.com/users/Rafael-Reis1/repos')
    .then(response => response.json())
    .then(data => {
        const reposDiv = document.getElementById('repos');
        data.unshift(
            {
                name: 'Formatar para lista de números separada por vírgulas',
                description: 'Easily format any list of numbers into a clean, comma-separated list.',
                html_url: '/Formatar para lista separada por virgulas/Formatar para lista separada por virgulas.html',
                language: 'HTML'
            },
            {
                name: 'Compara 2 listas de nomes',
                description: "Quickly analyze any two lists to see what's missing, extra, or repeated.",
                html_url: '/Compara 2 listas de nomes/Compara 2 listas de nomes.html',
                language: 'HTML'
            },
            {
                name: 'Efeito de luz ambiente imersivo',
                description: "Create a more immersive viewing experience with a dynamic ambient glow for your videos.",
                html_url: '/Ambient-Light-SVG-Filters/Ambient-Light-SVG-Filters.html',
                language: 'HTML'
            }
        );
        data.forEach((repo, index) => {
            if(repo.description) {
                const card = document.createElement('div');
                card.classList.add('card');
                const iconSvg = index < 3 
                    ? `
                        <svg xmlns="http://www.w3.org/2000/svg" fill="#f7f7f7" height="25" viewBox="0 0 24 24" width="17" style="flex-shrink: 0; min-width: 16px; min-height: 25px;">
                            <path d="M0 0h24v24H0z" fill="none"/>
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                        </svg>
                        ` 
                    : `
                        <svg aria-hidden="true" fill="#f7f7f7" height="25" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-repo mr-1 color-fg-muted" style="flex-shrink: 0; min-width: 16px; min-height: 25px;">
                            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"></path>
                        </svg>
                        `;
                card.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; gap: 5px;">
                            ${iconSvg}
                            <h3><a href="${repo.html_url}" target="${repo.name}">${repo.name}</a></h3>
                        </div>
                        <p style="font-weight: 300; font-size: 15px;">${repo.description || 'Sem descrição'}</p>
                        <p style="font-weight: 200; font-size: 15px;">${repo.language|| 'Sem linguagem'}</p>
                    </div>
                `;
                reposDiv.appendChild(card);
            }
        });
    });
}

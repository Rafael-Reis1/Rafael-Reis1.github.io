window.onload = function() {
    const btnSobre = document.getElementById('btnSobre');
    const btnCurriculo = document.getElementById('btnCurriculo');
    const btnPortfolio = document.getElementById('btnPortfolio');
    const sobre = document.getElementById('sobre');
    const curriculo = document.getElementById('curriculo');
    const github = document.getElementById('github');
    const instagram = document.getElementById('instagram');
    const linkedin = document.getElementById('linkedin');
    const mail = document.getElementById('mail');
    const mainInfo = document.querySelector('.mainInfo');
    const portfolio = document.getElementById('portfolio');
    const btnCurriculoDownload = document.getElementById('btnCurriculoDownload');
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
        const walk = (x - startX) * 2; // Ajuste a velocidade do scroll
        habilidadesContainer.scrollLeft = scrollLeft - walk;
    });

    const imagens = habilidadesContainer.querySelectorAll('img');

    imagens.forEach(img => {
        img.addEventListener('dragstart', (e) => {
            e.preventDefault(); // Impede o comportamento padrão de arrastar
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
        window.open('https://github.com/Rafael-Reis1', '_blank');
    }

    instagram.onclick = function() {
        window.open('https://www.instagram.com/rafael.reis1', '_blank');
    }

    linkedin.onclick = function() {
        window.open('https://www.linkedin.com/in/rafael-reis-00331b85/', '_blank');
    }

    mail.onclick = function() {
        window.location.href = 'mailto:reisr5941@gmail.com?subject=Sobre desenvolvimento web.&body=Quero te contratar para criar meu site!';
    }

    btnCurriculoDownload.onclick = function() {
        window.open('docs/Currículo.pdf', '_blank');
    }

    fetch('https://api.github.com/users/Rafael-Reis1/repos')
    .then(response => response.json())
    .then(data => {
        const reposDiv = document.getElementById('repos');
        data.forEach(repo => {
            if(repo.description) {
                const card = document.createElement('div');
                card.classList.add('card');
                card.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 5px; min-width: 10px">
                    <div style="display: flex; gap: 5px;">
                        <svg aria-hidden="true" fill="#f7f7f7" height="25" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-repo mr-1 color-fg-muted">
                            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"></path>
                        </svg>
                        <h3><a href="${repo.html_url}" target="_blank">${repo.name}</a></h3>
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

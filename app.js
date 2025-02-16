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
    mainInfo.style.height = sobre.offsetHeight + 'px';

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
}
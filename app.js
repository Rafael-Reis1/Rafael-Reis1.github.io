window.onload = function() {
    const btnSobre = document.getElementById('btnSobre');
    const btnCurriculo = document.getElementById('btnCurriculo');
    const btnPortfolio = document.getElementById('btnPortfolio');
    const sobre = document.getElementById('sobre');
    const github = document.getElementById('github');
    const instagram = document.getElementById('instagram');
    const linkedin = document.getElementById('linkedin');

    btnSobre.onclick = function() {
        btnSobre.classList.add('btnAccentColor');
        btnCurriculo.classList.remove('btnAccentColor');
        btnPortfolio.classList.remove('btnAccentColor');
        sobre.style.opacity = 1;
    }

    btnCurriculo.onclick = function() {
        btnSobre.classList.remove('btnAccentColor');
        btnCurriculo.classList.add('btnAccentColor');
        btnPortfolio.classList.remove('btnAccentColor');
        sobre.style.opacity = 0;
    }

    btnPortfolio.onclick = function() {
        btnSobre.classList.remove('btnAccentColor');
        btnCurriculo.classList.remove('btnAccentColor');
        btnPortfolio.classList.add('btnAccentColor');
        sobre.style.opacity = 0;
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
}
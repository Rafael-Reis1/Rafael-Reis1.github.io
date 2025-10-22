window.onload = function() {
    document.getElementById('formataLista').onclick = function() {
        let arrayDeNumeros = document.getElementById('numeros').value.match(/\d+/g);
        if (arrayDeNumeros) {
            if(document.getElementById('aspas').checked) {
                abrirPopup(`'${arrayDeNumeros.join("','")}'`)
            }
            else {
                abrirPopup(arrayDeNumeros.join(','));
            }
        }
    }

    document.getElementById('fechar').onclick = function() {
        fecharPopup();
    }

    document.getElementById('listaBackgroud').onclick = function() {
        fecharPopup();
    }

    document.getElementById('limpar').onclick = function() {
        document.getElementById('numeros').value = '';
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            fecharPopup();
        }
    });

    function abrirPopup(numerosComVirgula) {
        const listaFormatadaPopup = document.getElementById('listaFormatadaPopup');
        const popupCards = document.querySelectorAll('.popupCard');
        const listaFormatada = document.getElementById('listaFormatada');
        const copiarBtn = document.getElementById('copiarListaBtn');
        
        listaFormatadaPopup.style.display = 'flex';

        setTimeout(() => {
            popupCards.forEach(popupCard => {
                listaFormatadaPopup.style.opacity = '1';
                listaFormatadaPopup.style.pointerEvents = 'all';
                popupCard.style.transition = 'all 300ms cubic-bezier(.12,.12,0,1)';
                popupCard.style.filter = 'blur(0px)';
                popupCard.style.opacity = 1;
                popupCard.style.scale = 1;
            });
        }, 10);
        
        listaFormatada.innerText = numerosComVirgula;

        copiarBtn.onclick = async function() {
            try {
                await navigator.clipboard.writeText(listaFormatada.innerText);
                const textoOriginal = copiarBtn.innerText;
                copiarBtn.innerText = 'Copiado!';
                setTimeout(() => {
                    copiarBtn.innerText = textoOriginal;
                }, 1500);
            } catch (err) {
                console.error('Falha ao copiar: ', err);
                alert('Não foi possível copiar o texto.');
            }
        }
    }

    function fecharPopup() {
        const listaFormatadaPopup = document.getElementById('listaFormatadaPopup');
        const popupCards = document.querySelectorAll('.popupCard');
        
        listaFormatadaPopup.style.transition = 'opacity 400ms cubic-bezier(.12,.12,0,1)';
        listaFormatadaPopup.style.opacity = 0;
        
        popupCards.forEach(popupCard => {
            popupCard.style.transition = 'all 400ms cubic-bezier(.12,.12,0,1)';
            popupCard.style.filter = 'blur(50px)';
            popupCard.style.opacity = 0;
            popupCard.style.scale = 0;
        });

        setTimeout(() => {
            listaFormatadaPopup.style.display = 'none';
        }, 400); 
    }
};
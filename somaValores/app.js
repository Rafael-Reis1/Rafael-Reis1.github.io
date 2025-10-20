window.onload = function() {
    document.getElementById('realizarSoma').onclick = function() {
        let textoCompleto = document.getElementById('numeros').value;

        const regexValores = /-?\s*(?:R\$\s*)?[\d\.,]+/g;
        let arrayDeStrings = textoCompleto.match(regexValores);

        if (arrayDeStrings) {
            let arrayDeNumeros = arrayDeStrings
                .map(item => {
                    let valorLimpo = item
                        .replace('R$', '')
                        .replace(/\s/g, '')
                        .replace(/\./g, '')
                        .replace(',', '.');

                    let numero = parseFloat(valorLimpo);

                    if (isNaN(numero)) {
                        return null;
                    }
                    
                    return numero; 
                })
                .filter(num => num !== null);

            if (arrayDeNumeros.length > 0) {
                let soma = 0;
                
                if (document.getElementById('ignorar').checked) {
                    let numerosUnicos = [...new Set(arrayDeNumeros)];
                    soma = numerosUnicos.reduce((total, num) => total + num, 0);
                } else {
                    soma = arrayDeNumeros.reduce((total, num) => total + num, 0);
                }
                
                abrirPopup(soma.toFixed(2)); 

            } else {
                abrirPopup('0.00');
            }
        } else {
            abrirPopup('0.00');
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

    function abrirPopup(valorTotal) {
        const somaPopup = document.getElementById('somaPopup');
        const popupCards = document.querySelectorAll('.popupCard');
        const resultadoSoma = document.getElementById('resultadoSoma');
        const copiarBtn = document.getElementById('copiarBtn');
        
        somaPopup.style.display = 'flex';
        somaPopup.style.opacity = 1;

        setTimeout(() => {
            popupCards.forEach(popupCard => {
                popupCard.style.transition = 'all 300ms cubic-bezier(.12,.12,0,1)';
                popupCard.style.filter = 'blur(0px)';
                popupCard.style.opacity = 1;
                popupCard.style.scale = 1;
            });
        }, 10);
        
        resultadoSoma.innerText = valorTotal;

        copiarBtn.onclick = async function() {
            try {
                await navigator.clipboard.writeText(resultadoSoma.innerText);
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
        const somaPopup = document.getElementById('somaPopup');
        const popupCards = document.querySelectorAll('.popupCard');
        
        somaPopup.style.transition = 'opacity 400ms cubic-bezier(.12,.12,0,1)';
        somaPopup.style.opacity = 0;
        
        popupCards.forEach(popupCard => {
            popupCard.style.transition = 'all 400ms cubic-bezier(.12,.12,0,1)';
            popupCard.style.filter = 'blur(50px)';
            popupCard.style.opacity = 0;
            popupCard.style.scale = 0;
        });

        setTimeout(() => {
            somaPopup.style.display = 'none';
        }, 400); 
    }
};

window.onload = function() {
    document.getElementById('formataLista').onclick = function() {
        compararListas();
    }

    document.getElementById('fechar').onclick = function() {
        fecharPopup();
    }

    document.getElementById('listaBackgroud').onclick = function() {
        fecharPopup();
    }

    document.getElementById('limpar').onclick = function() {
        document.getElementById('listaUm').value = '';
        document.getElementById('listaDois').value = '';
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            fecharPopup();
        }
    });

    function abrirPopup(tabela) {
        const listaFormatadaPopup = document.getElementById('listaFormatadaPopup');
        const popupCards = document.querySelectorAll('.popupCard');
        const listaFormatada = document.getElementById('listaFormatada');
        const copiarBtn = document.getElementById('copiarListaBtn');
        
        listaFormatadaPopup.style.display = 'flex';
        listaFormatadaPopup.style.opacity = 1;

        setTimeout(() => {
            popupCards.forEach(popupCard => {
                popupCard.style.transition = 'all 300ms cubic-bezier(.12,.12,0,1)';
                popupCard.style.filter = 'blur(0px)';
                popupCard.style.opacity = 1;
                popupCard.style.scale = 1;
            });
        }, 10);
        
        listaFormatada.innerText = tabela;

        copiarBtn.onclick = async function() {
            try {
                await navigator.clipboard.writeText(tabela);
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

    function compararListas() {
        const textoBase = document.getElementById('listaUm').value;
        const textoVerificar = document.getElementById('listaDois').value;

        const listaBase = textoBase.split('\n').map(nome => nome.trim()).filter(nome => nome !== '');
        const listaVerificar = textoVerificar.split('\n').map(nome => nome.trim()).filter(nome => nome !== '');

        const setBase = new Set(listaBase);
        const setVerificar = new Set(listaVerificar);

        const vistos = new Set();
        const duplicadosSet = new Set();
        listaVerificar.forEach(nome => {
            vistos.has(nome) ? duplicadosSet.add(nome) : vistos.add(nome);
        });
        const nomesRepetidos = Array.from(duplicadosSet);

        const nomesFaltando = listaBase.filter(nome => !setVerificar.has(nome));

        const nomesAMais = listaVerificar.filter(nome => !setBase.has(nome));

        const todosOsNomesUnicos = new Set([...listaBase, ...listaVerificar]);
        const masterList = Array.from(todosOsNomesUnicos).sort();

        const linhasAlinhadas = [];
        for (const nome of masterList) {
            const nomeNaBase = setBase.has(nome) ? nome : '';
            const nomeNaVerificar = setVerificar.has(nome) ? nome : '';
            linhasAlinhadas.push({ col1: nomeNaBase, col2: nomeNaVerificar });
        }

        const titulos = [
            "Lista Original",   
            "Lista Secundária",
            "Ausentes na Lista Secundária",
            "Exclusivos na Lista Secundária",
            "Nomes Duplicados na Lista Secundária"
        ];
        let resultadoFinal = titulos.join('\t') + '\n';

        const maxRows = Math.max(
            linhasAlinhadas.length,
            nomesFaltando.length,
            nomesAMais.length,
            nomesRepetidos.length
        );

        for (let i = 0; i < maxRows; i++) {
            const col1 = linhasAlinhadas[i] ? linhasAlinhadas[i].col1 : '';
            const col2 = linhasAlinhadas[i] ? linhasAlinhadas[i].col2 : '';

            const col3 = nomesFaltando[i] || '';

            const col4 = nomesAMais[i] || '';
            const col5 = nomesRepetidos[i] || '';

            const linha = [col1, col2, col3, col4, col5].join('\t');
            resultadoFinal += linha + '\n';
        }

        if (document.getElementById('output')) {
            document.getElementById('output').value = resultadoFinal;
        }
    
        if (resultadoFinal && typeof abrirPopup === 'function') {
            abrirPopup(resultadoFinal);
        }
    }
};
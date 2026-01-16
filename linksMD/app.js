window.onload = function() {
    document.getElementById('gerarArquivo').onclick = function() {
        gerarArquivoMD();
    }

    document.getElementById('limpar').onclick = function() {
        document.getElementById('links').value = '';
    }
};

function gerarArquivoMD() {
    const textoBruto = document.getElementById("links").value;
    const listaBruta = textoBruto.split(/[\s,]+/);

    const linksProcessados = listaBruta
        .filter(item => item.trim() !== "" && item.includes("http"))
        .map(link => {
            const url = link.trim();
            let titulo = "Link Externo";

            try {
                const urlObj = new URL(url);
                const dominio = urlObj.hostname.replace('www.', '');
                const path = urlObj.pathname;
                const params = urlObj.searchParams;

                if (dominio.includes('rafael-reis1.github.io')) {
                    titulo = "Portfólio do Rafael Reis";
                } else if (dominio.includes('totvs.com') && params.has('pageId')) {
                    titulo = `Documentação TOTVS (ID: ${params.get('pageId')})`;
                } else if (dominio.includes('youtube.com') || dominio.includes('youtu.be')) {
                    if (params.has('v')) titulo = `YouTube - Vídeo (${params.get('v')})`;
                    else if (path.includes('@')) titulo = `YouTube - Canal (${path.replace('/', '')})`;
                    else titulo = `YouTube Link`;
                } else if (dominio.includes('github.com')) {
                    const repoInfo = path.substring(1); 
                    titulo = repoInfo ? `GitHub: ${repoInfo}` : 'GitHub Home';
                } else if (dominio.includes('linkedin.com')) {
                    if (path.includes('/in/')) titulo = `LinkedIn Perfil: ${path.split('/in/')[1].replace('/', '')}`;
                    else titulo = `LinkedIn`;
                } else if (dominio.includes('instagram.com')) {
                    const user = path.split('/')[1];
                    titulo = user ? `Instagram: @${user}` : 'Instagram';
                } else if (dominio.includes('docs.google.com')) {
                    titulo = `Documento Google`;
                } else {
                    const caminhoLimpo = path === '/' ? '' : path;
                    titulo = `${dominio}${caminhoLimpo}`;
                }
            } catch (error) {
                titulo = url;
            }

            return `[${titulo}](${url})`;
        });

    if (linksProcessados.length === 0) {
        alert("Nenhum link válido encontrado!");
        return;
    }

    const textoFinal = linksProcessados.join('\n');
    const arquivo = new Blob([textoFinal], { type: 'text/markdown' });
    const linkDownload = document.createElement("a");
    
    linkDownload.href = URL.createObjectURL(arquivo);
    linkDownload.download = "links.md";

    document.body.appendChild(linkDownload);
    linkDownload.click();
    document.body.removeChild(linkDownload);
}

document.getElementById('btnVoltar').onclick = function() {
    if (window.opener) {
        window.close();
    } else {
        window.location.href = '../index.html';
    }
};

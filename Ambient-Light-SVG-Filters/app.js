document.getElementById('btnVoltar').onclick = function() {
    if (window.opener) {
        window.close();
    } else {
        window.location.href = '../index.html';
    }
};

async function adicionarVideo() {
    const input = document.getElementById('inputUrl');
    const url = input.value;
    const videoId = extrairIdYoutube(url);

    if (!videoId) {
        alert("Link inválido!");
        return;
    }

    const btn = document.getElementById('btnAdicionar');
    
    if (btn) {
        var textoOriginal = btn.innerText;
        btn.innerText = "Verificando...";
        btn.disabled = true;
    }

    try {
        const checkUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
        const response = await fetch(checkUrl);
        const data = await response.json();

        if (data.error) {
            alert("🚫 Vídeo Bloqueado!\nO dono deste vídeo não permite reprodução em outros sites (Direitos Autorais).");
            return;
        }

        const containerPrincipal = document.querySelector('.container');
        const snapArea = document.createElement('div');
        snapArea.className = 'snap-area';

        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';

        const iframe = document.createElement('iframe');
        iframe.loading = "lazy";
        iframe.className = "ambilight";
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
        iframe.title = data.title || 'YouTube video player';
        iframe.frameBorder = "0";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;

        videoContainer.appendChild(iframe);
        snapArea.appendChild(videoContainer);
        
        containerPrincipal.insertBefore(snapArea, containerPrincipal.firstChild);

        window.scrollTo({ top: 0, behavior: 'smooth' });
        input.value = '';

    } catch (error) {
        console.error("Erro ao verificar:", error);
        alert("Erro de conexão ao tentar verificar o vídeo.");
    } finally {
        if (btn) {
            btn.innerText = textoOriginal;
            btn.disabled = false;
        }
    }
}

function extrairIdYoutube(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}
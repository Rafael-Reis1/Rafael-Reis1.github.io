document.getElementById('btnVoltar').onclick = function() {
    if (window.opener) {
        window.close();
    } else {
        window.location.href = '/';
    }
};

let ytApiReady = false;
let globalVideoCounter = 0;

const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

window.onYouTubeIframeAPIReady = function() {
    ytApiReady = true;
    
    // Usa um IntersectionObserver para inicializar os players apenas quando eles aparecerem na tela
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const container = entry.target;
                const fgIframe = container.querySelector('.ambilight');
                // Se ainda não foi inicializado (não tem id configurado)
                if (fgIframe && !fgIframe.id) {
                    setupAmbilightPair(container, fgIframe);
                }
                obs.unobserve(container); // Para de observar após carregar
            }
        });
    }, { rootMargin: "300px 0px" }); // Carrega quando o vídeo estiver a 300px de aparecer na tela

    document.querySelectorAll('.video-container').forEach(container => {
        observer.observe(container);
    });
};

function setupAmbilightPair(container, fgIframe) {
    globalVideoCounter++;
    const fgId = 'fg-video-' + globalVideoCounter;
    const bgId = 'bg-video-' + globalVideoCounter;
    const currentOrigin = window.location.origin;

    let newSrc = fgIframe.src;
    if (newSrc.endsWith('&')) newSrc = newSrc.slice(0, -1);
    if (!newSrc.includes('enablejsapi=1')) {
        newSrc += (newSrc.includes('?') ? '&' : '?') + 'enablejsapi=1&origin=' + currentOrigin;
    } else if (!newSrc.includes('origin=')) {
        newSrc += '&origin=' + currentOrigin;
    }

    const newFgIframe = fgIframe.cloneNode(true);
    newFgIframe.src = newSrc;
    newFgIframe.id = fgId;
    fgIframe.parentNode.replaceChild(newFgIframe, fgIframe);
    fgIframe = newFgIframe;

    const bgIframe = document.createElement('iframe');
    let bgSrc = fgIframe.src;
    if (!bgSrc.includes('mute=1')) bgSrc += '&mute=1';
    if (!bgSrc.includes('controls=0')) bgSrc += '&controls=0';
    if (!bgSrc.includes('disablekb=1')) bgSrc += '&disablekb=1';
    bgIframe.src = bgSrc;
    bgIframe.className = 'ambilight-bg';
    bgIframe.id = bgId;
    bgIframe.setAttribute('aria-hidden', 'true');
    bgIframe.setAttribute('tabindex', '-1');
    bgIframe.loading = "lazy";
    bgIframe.allow = "autoplay";
    
    container.insertBefore(bgIframe, fgIframe);

    let bgPlayer;
    let fgPlayer = new YT.Player(fgId, {
        events: {
            'onReady': function() {
                bgPlayer = new YT.Player(bgId, {
                    events: {
                        'onReady': function() {
                            bgPlayer.mute();
                        }
                    }
                });
            },
            'onStateChange': function(event) {
                if (!bgPlayer || typeof bgPlayer.playVideo !== 'function') return;
                
                if (event.data === YT.PlayerState.PLAYING) {
                    bgPlayer.playVideo();
                    
                    const fgTime = fgPlayer.getCurrentTime();
                    const bgTime = bgPlayer.getCurrentTime();
                    if (Math.abs(fgTime - bgTime) > 0.3) {
                        bgPlayer.seekTo(fgTime, true);
                    }
                } else if (event.data === YT.PlayerState.PAUSED) {
                    bgPlayer.pauseVideo();
                } else if (event.data === YT.PlayerState.ENDED) {
                    bgPlayer.stopVideo();
                }
            }
        }
    });
}

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
        const currentOrigin = window.location.origin;
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&origin=${currentOrigin}`;
        iframe.title = data.title || 'YouTube video player';
        iframe.frameBorder = "0";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;

        videoContainer.appendChild(iframe);
        snapArea.appendChild(videoContainer);
        
        containerPrincipal.insertBefore(snapArea, containerPrincipal.firstChild);

        if (ytApiReady) {
            setupAmbilightPair(videoContainer, iframe);
        }

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
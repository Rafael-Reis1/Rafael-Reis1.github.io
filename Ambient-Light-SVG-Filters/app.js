document.getElementById('btnVoltar').onclick = function() {
    if (window.opener) {
        window.close();
    } else {
        window.location.href = '../index.html';
    }
};

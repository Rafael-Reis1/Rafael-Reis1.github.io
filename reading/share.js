const firebaseConfig = {
    apiKey: "AIzaSyCvI-ATmTj-zAzbGnKLx1Fq7i29KoULwro",
    authDomain: "finance-app-e50b8.firebaseapp.com",
    projectId: "finance-app-e50b8",
    storageBucket: "finance-app-e50b8.firebasestorage.app",
    messagingSenderId: "339147531228",
    appId: "1:339147531228:web:6eb3aca1de8798e6d52519",
    measurementId: "G-ZHX9XRD3TK"
};

try {
    firebase.initializeApp(firebaseConfig);
} catch (e) {
    console.error('Firebase Init Error', e);
}

const db = firebase.firestore();

function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim().replace(/^http:\/\//i, 'https://');
    if (!trimmed || trimmed === 'null') return '';
    if (/^(?:javascript|vbscript|file):/i.test(trimmed)) return '';
    return trimmed;
}

/**
 * A página pública lê apenas `shared_lists/{token}` — uma cópia enxuta
 * (título, autor, capa) escrita pelo dono da lista. A biblioteca privada
 * (notas, empréstimos, avaliações) não é mais acessível por aqui.
 */
function init() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('l');

    if (token) {
        if (!/^[A-Za-z0-9-]{16,64}$/.test(token)) {
            showError("Link inválido. Verifique se o endereço foi copiado por completo.");
            return;
        }
        watchSharedList(token);
        return;
    }

    if (params.get('u') && params.get('list')) {
        showError("Este link usa o formato antigo e não é mais válido. Peça para quem compartilhou gerar um novo link.");
        return;
    }

    showError("Link inválido. Faltam parâmetros na URL.");
}

function watchSharedList(token) {
    db.collection('shared_lists').doc(token).onSnapshot((doc) => {
        if (!doc.exists) {
            showError("Este link expirou ou a lista deixou de ser compartilhada.");
            return;
        }
        renderList(doc.data());
    }, (error) => {
        console.error('Erro ao carregar lista compartilhada:', error);
        showError("Não foi possível carregar a lista. Tente novamente em alguns instantes.");
    });
}

function renderList(data) {
    const title = (data && data.name) ? data.name : 'Lista Compartilhada';

    document.getElementById('listTitle').textContent = title;
    document.title = `${title} - Lista compartilhada`;

    document.getElementById('loadingMsg').style.display = 'none';

    const books = Array.isArray(data && data.books) ? [...data.books] : [];

    if (books.length === 0) {
        document.getElementById('booksGrid').style.display = 'none';
        showError("Esta lista ainda está vazia.");
        return;
    }

    document.getElementById('errorMsg').style.display = 'none';

    // Respeita a ordem personalizada salva pelo dono da lista.
    const order = Array.isArray(data.bookOrder) ? data.bookOrder : [];
    if (order.length > 0) {
        const orderMap = new Map(order.map((id, index) => [id, index]));
        books.sort((a, b) => {
            const indexA = orderMap.has(a.id) ? orderMap.get(a.id) : 999999;
            const indexB = orderMap.has(b.id) ? orderMap.get(b.id) : 999999;
            return indexA - indexB;
        });
    }

    renderBooks(books);
}

function renderBooks(books) {
    const grid = document.getElementById('booksGrid');
    grid.style.display = 'grid';
    grid.innerHTML = '';

    books.forEach(book => {
        const card = document.createElement('div');
        const status = /^[a-z0-9-]{1,32}$/i.test(book.status || '') ? book.status : 'want-to-read';
        card.className = `book-card status-${status}`;

        const coverUrl = safeImageUrl(book.cover);
        const isPlaceholder = !coverUrl || coverUrl.includes('placehold.co') || coverUrl.includes('Sem+Capa');
        const escTitle = escapeHTML(book.title);
        const escAuthor = escapeHTML(book.author);

        card.innerHTML = `
        <div class="book-cover-container ${isPlaceholder ? 'is-placeholder' : 'skeleton'}">
            ${!isPlaceholder ? `
            <img src="${escapeHTML(coverUrl)}" loading="lazy" alt="${escTitle}" class="book-cover" onload="this.parentElement?.classList?.remove('skeleton')" onerror="this.style.display='none'; const p = this.closest('.book-cover-container'); if (p) { p.classList.add('is-placeholder'); p.classList.remove('skeleton'); const ph = p.querySelector('.book-cover-placeholder'); if (ph) ph.classList.add('visible'); }">
            ` : ''}

            <div class="book-cover-placeholder ${isPlaceholder ? 'visible' : ''}">
                <div class="placeholder-title">${escTitle}</div>
                <div class="placeholder-author">${escAuthor}</div>
            </div>

            <div class="title-overlay">${escTitle}</div>
        </div>
        `;

        card.addEventListener('click', () => {
            const searchQuery = encodeURIComponent(`${book.title} ${book.author}`);
            const amazonUrl = `https://www.amazon.com.br/s?k=${searchQuery}&tag=rafaelreis0f-20`;
            window.open(amazonUrl, '_blank', 'noopener,noreferrer');
        });

        grid.appendChild(card);
    });
}

function showError(msg) {
    document.getElementById('loadingMsg').style.display = 'none';
    const errorEl = document.getElementById('errorMsg');
    errorEl.style.display = 'block';
    errorEl.textContent = msg;
}

window.addEventListener('DOMContentLoaded', init);

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

const starSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="star-pill-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

function calculateProgress(book) {
    if (book.status === 'read' || book.status === 're-reading' || book.status === 'rereading') {
        return 100;
    }
    const current = parseInt(book.readPages) || 0;
    const total = parseInt(book.pages) || 1;
    if (current === 0) return 0;
    const p = Math.round((current / total) * 100);
    return Math.min(p, 100);
}

async function init() {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('u');
    const listId = params.get('list');

    if (!userId || !listId) {
        showError("Link inválido. Faltam parâmetros na URL.");
        return;
    }

    try {
        const listDoc = await db.collection('library_data').doc(userId).collection('lists').doc(listId).get();
        
        if (!listDoc.exists) {
            showError("Lista não encontrada ou foi excluída.");
            return;
        }

        const listData = listDoc.data();
        document.getElementById('listTitle').textContent = listData.name || 'Lista Compartilhada';
        document.title = (listData.name || 'Lista') + " - Compartilhada";

        db.collection('library_data').doc(userId).collection('books')
            .where('customLists', 'array-contains', listId)
            .onSnapshot((snapshot) => {
                const books = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                books.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                document.getElementById('loadingMsg').style.display = 'none';
                
                if (books.length === 0) {
                    showError("Esta lista está vazia.");
                    document.getElementById('booksGrid').style.display = 'none';
                    return;
                } else {
                    document.getElementById('errorMsg').style.display = 'none';
                }

                renderBooks(books);
            }, (error) => {
                console.error(error);
                showError("Ocorreu um erro ao carregar os livros. Verifique se as permissões do Firebase (Rules) foram configuradas para permitir leitura.");
            });

    } catch (e) {
        console.error(e);
        showError("Ocorreu um erro ao conectar com o banco de dados.");
    }
}

function renderBooks(books) {
    const grid = document.getElementById('booksGrid');
    grid.style.display = 'grid';
    grid.innerHTML = '';

    books.forEach(book => {
        const card = document.createElement('div');
        card.className = `book-card status-${book.status}`;
        
        const isPlaceholder = !book.cover || book.cover.includes('placehold.co') || book.cover.includes('Sem+Capa');
        const escTitle = escapeHTML(book.title);
        const escAuthor = escapeHTML(book.author);

        card.innerHTML = `
        <div class="book-cover-container ${isPlaceholder ? 'is-placeholder' : 'skeleton'}">
            <img src="${book.cover}" loading="lazy" alt="${escTitle}" class="book-cover" style="${isPlaceholder ? 'display:none' : ''}" onload="this.parentElement.classList.remove('skeleton')" onerror="this.style.display='none'; this.nextElementSibling.classList.add('visible'); this.parentElement.classList.add('is-placeholder'); this.parentElement.classList.remove('skeleton')">
            
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
            window.open(amazonUrl, '_blank');
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

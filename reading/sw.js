const CACHE_NAME = 'reading-app-?v=1109261133';
const urlsToCache = [
    '/reading/reading.html',
    '/reading/style.css?v=1109261133',
    '/reading/css/base/variables.css?v=1109261133',
    '/reading/css/base/reset.css?v=1109261133',
    '/reading/css/layout/layout.css?v=1109261133',
    '/reading/css/layout/header.css?v=1109261133',
    '/reading/css/layout/sidebar.css?v=1109261133',
    '/reading/css/components/buttons.css?v=1109261133',
    '/reading/css/components/forms.css?v=1109261133',
    '/reading/css/components/toolbar.css?v=1109261133',
    '/reading/css/components/books.css?v=1109261133',
    '/reading/css/components/modals.css?v=1109261133',
    '/reading/css/components/history.css?v=1109261133',
    '/reading/css/components/stats.css?v=1109261133',
    '/reading/css/components/heatmap.css?v=1109261133',
    '/reading/css/components/lists.css?v=1109261133',
    '/reading/css/components/auth.css?v=1109261133',
    '/reading/css/components/toast.css?v=1109261133',
    '/reading/css/components/flatpickr.css?v=1109261133',
    '/reading/css/utils/animations.css?v=1109261133',
    '/reading/css/utils/drag-drop.css?v=1109261133',
    '/reading/css/utils/responsive.css?v=1109261133',
    '/reading/app.js?v=1109261133',
    '/reading/js/utils/helpers.js',
    '/reading/js/models/Book.js',
    '/reading/js/services/firebase.js',
    '/reading/js/services/api.js',
    '/reading/js/services/storage.js',
    '/reading/js/services/statsService.js',
    '/reading/js/store/readingManager.js',
    '/reading/js/ui/statsView.js',
    '/reading/js/ui/listBooksModal.js',
    '/reading/icon-512.png',
    '/reading/icon-maskable.png',
    '/reading/manifest.json?v=1109261133',
    '../assets/libs_comuns/firebase/10.7.1/firebase-app-compat.js',
    '../assets/libs_comuns/firebase/10.7.1/firebase-auth-compat.js',
    '../assets/libs_comuns/firebase/10.7.1/firebase-firestore-compat.js',
    '../assets/libs_comuns/flatpickr/flatpickr.min.css',
    '../assets/libs_comuns/flatpickr/flatpickr.js',
    '../assets/libs_comuns/flatpickr/pt.js',
    '../assets/libs_comuns/fonts.css'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    


    if (!event.request.url.startsWith(self.location.origin)) {
        return; 
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

const CACHE_NAME = 'reading-app-?v=1702260157';
const urlsToCache = [
    '/reading/reading.html',
    '/reading/style.css?v=1702260157',
    '/reading/app.js?v=1702260157',
    '/reading/icon-512.png',
    '/reading/icon-maskable.png',
    '/reading/manifest.json?v=1702260157',
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

    if (event.request.url.startsWith('https://firestore.googleapis.com') ||
        event.request.url.startsWith('https://www.googleapis.com') ||
        (event.request.url.includes('firebase') && !event.request.url.includes(self.registration.scope.origin))) {
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

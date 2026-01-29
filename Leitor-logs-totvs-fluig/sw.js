const CACHE_NAME = 'leitor-logs-?v=2901261353';
const urlsToCache = [
    './leitor.html',
    './style.css?v=2901261353',
    './app.js?v=2901261353',
    './manifest.json?v=2901261353',
    './assets/upload.webp',
    './assets/upload_blue.webp',
    '../assets/libs_comuns/fonts.css',
    '../imgs/arrow_back_white.webp',
    '../favicon.svg'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

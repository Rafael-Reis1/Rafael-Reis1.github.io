const CACHE_NAME = 'leitor-logs-?v=1611260410';
const urlsToCache = [
    './leitor.html',
    './style.css?v=1611260410',
    './app.js?v=1611260410',
    './logWorker.js?v=1611260410',
    './manifest.json?v=1611260410',
    './assets/upload.webp?v=1611260410',
    './assets/upload_blue.webp?v=1611260410',
    '../assets/libs_comuns/fonts.css?v=1611260410',
    '../imgs/arrow_back_white.webp?v=1611260410',
    '../favicon.svg?v=1611260410'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames.map((cacheName) => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                    return null;
                })
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const reqUrl = new URL(event.request.url);
    if (reqUrl.origin !== self.location.origin) return;

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.ok) {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
                }
                return networkResponse;
            })
            .catch(() =>
                caches.match(event.request).then((cached) => cached || caches.match(event.request, { ignoreSearch: true }))
            )
    );
});

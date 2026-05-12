const CACHE_NAME = 'chrome-ai-local-v1';
const urlsToCache = [
    './chromeAILocal.html',
    './style.css',
    './app.js',
    '../favicon.svg',
    './lib/axios.min.js',
    '../assets/libs_comuns/fonts.css',
    './lib/all.min.css',
    './lib/marked.min.js',
    './lib/purify.min.js',
    './lib/atom-one-dark.min.css',
    './lib/highlight.min.js',
    './lib/katex.min.css',
    './lib/katex.min.js',
    './lib/auto-render.min.js',
    './lib/mermaid.min.js',
    './lib/panzoom.min.js'
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

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
                    return response;
                }

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

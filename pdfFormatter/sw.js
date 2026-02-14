const CACHE_NAME = 'pdf-booklet-?v=1402260337';
const urlsToCache = [
    './pdfFormater.html',
    './style.css?v=1402260337',
    './app.js?v=1402260337',
    '../style.css?v=1402260337',
    './manifest.json?v=1402260337',
    '/imgs/arrow_back_white.webp',
    '../Leitor-logs-totvs-fluig/assets/upload.webp',
    '../Leitor-logs-totvs-fluig/assets/upload_blue.webp',
    './lib/pdf.min.js',
    './lib/pdf.worker.min.js',
    './lib/pdf-lib.min.js',
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
    if (event.request.method === 'POST' && event.request.url.includes('pdfFormater.html')) {
        event.respondWith(
            (async () => {
                try {
                    const formData = await event.request.formData();
                    const file = formData.get('file');

                    if (file) {
                        const cache = await caches.open('share-cache');
                        const headers = new Headers();
                        headers.append('Content-Type', file.type);
                        headers.append('X-Original-Filename', encodeURIComponent(file.name));

                        await cache.put('shared-file', new Response(file, { headers }));
                    }

                    return Response.redirect('./pdfFormater.html?share_target=true', 303);
                } catch (err) {
                    console.error('Error handling share target:', err);
                    return Response.redirect('./pdfFormater.html?error=share_failed', 303);
                }
            })()
        );
        return;
    }

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

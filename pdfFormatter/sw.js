const CACHE_NAME = 'pdf-booklet-?v=1311260750';
const urlsToCache = [
    './pdfFormater.html',
    './style.css?v=1311260750',
    './booklet-core.js?v=1311260750',
    './app.js?v=1311260750',
    '../style.css?v=1311260750',
    './manifest.json?v=1311260750',
    '../imgs/arrow_back_white.webp',
    '../favicon.svg?v=1311260750',
    '../Leitor-logs-totvs-fluig/assets/upload.webp',
    '../Leitor-logs-totvs-fluig/assets/upload_blue.webp',
    './lib/pdf.min.js?v=1311260750',
    './lib/pdf.worker.min.js',
    './lib/pdf-lib.min.js?v=1311260750',
    '../assets/libs_comuns/fonts.css?v=1311260750'
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
                    if (cacheName !== CACHE_NAME && cacheName !== 'share-cache') {
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
                        headers.append('Content-Type', file.type || 'application/pdf');
                        headers.append('X-Original-Filename', encodeURIComponent(file.name || 'documento.pdf'));

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

    if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
                    return response;
                }

                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then(cache => cache.put(event.request, responseToCache));
                return response;
            })
            .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
});

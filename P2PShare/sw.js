const CACHE_NAME = 'p2pshare-?v=1901260116';
const urlsToCache = [
    './P2PShare.html',
    './style.css?v=1901260116',
    './app.js?v=1901260116',
    './manifest.json?v=1901260116',
    './assets/icon-512.png',
    '/imgs/arrow_back_white.webp',
    '../Leitor-logs-totvs-fluig/assets/upload.webp',
    '../Leitor-logs-totvs-fluig/assets/upload_blue.webp',
    './lib/simplepeer.min.js',
    '../assets/libs_comuns/firebase/9.6.1/firebase-app-compat.js',
    '../assets/libs_comuns/firebase/9.6.1/firebase-database-compat.js',
    './lib/qrcode.min.js',
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
    if (event.request.method === 'POST' && event.request.url.includes('P2PShare.html')) {
        event.respondWith(
            (async () => {
                try {
                    const formData = await event.request.formData();
                    const file = formData.get('file');

                    if (file) {
                        const cache = await caches.open('share-cache');
                        await cache.put('shared-file', new Response(file));
                        const metadata = JSON.stringify({
                            name: file.name,
                            type: file.type,
                            lastModified: file.lastModified
                        });
                        await cache.put('shared-meta', new Response(metadata));
                    }

                    return Response.redirect('./P2PShare.html?share_target=true', 303);
                } catch (err) {
                    console.error('Error handling share target:', err);
                    return Response.redirect('./P2PShare.html?error=share_failed', 303);
                }
            })()
        );
        return;
    }

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

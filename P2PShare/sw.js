const CACHE_NAME = 'p2pshare-v20261113-2';
const SHARE_CACHE_NAME = 'share-cache';
const urlsToCache = [
    './',
    './P2PShare.html',
    './style.css',
    './p2p-core.js',
    './app.js',
    './manifest.json',
    './assets/icon-512.png',
    './lib/simplepeer.min.js',
    './lib/qrcode.min.js',
    '../imgs/arrow_back_white.webp',
    '../favicon.svg',
    '../Leitor-logs-totvs-fluig/assets/upload.webp',
    '../Leitor-logs-totvs-fluig/assets/upload_blue.webp',
    '../assets/libs_comuns/firebase/9.6.1/firebase-app-compat.js',
    '../assets/libs_comuns/firebase/9.6.1/firebase-database-compat.js',
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
                    if (cacheName !== CACHE_NAME && cacheName !== SHARE_CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                    return Promise.resolve();
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
                        const cache = await caches.open(SHARE_CACHE_NAME);
                        await cache.put('shared-file', new Response(file));

                        const metadata = JSON.stringify({
                            name: file.name,
                            type: getMimeTypeFromExtension(file.name) || file.type || 'application/octet-stream',
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

    if (event.request.method !== 'GET') return;

    const reqUrl = new URL(event.request.url);
    const isAppShellAsset =
        reqUrl.origin === self.location.origin &&
        (reqUrl.pathname.endsWith('.html') ||
            reqUrl.pathname.endsWith('/P2PShare/') ||
            reqUrl.pathname.endsWith('/P2PShare/style.css') ||
            reqUrl.pathname.endsWith('/P2PShare/app.js') ||
            reqUrl.pathname.endsWith('/P2PShare/p2p-core.js') ||
            reqUrl.pathname.endsWith('/P2PShare/manifest.json'));

    if (isAppShellAsset) {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.ok) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, copy))
                            .catch(() => {});
                    }
                    return networkResponse;
                })
                .catch(() => caches.match(event.request, { ignoreSearch: true }))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true })
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).then(networkResponse => {
                    if (
                        networkResponse &&
                        networkResponse.ok &&
                        reqUrl.origin === self.location.origin
                    ) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, copy))
                            .catch(() => {});
                    }
                    return networkResponse;
                });
            })
    );
});

function getMimeTypeFromExtension(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'mkv': 'video/x-matroska',
        'wmv': 'video/x-ms-wmv',
        'flv': 'video/x-flv',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'txt': 'text/plain',
        'csv': 'text/csv',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'apk': 'application/vnd.android.package-archive',
        'svg': 'image/svg+xml',
        'json': 'application/json',
        'xml': 'application/xml',
        'exe': 'application/x-msdownload',
        'msi': 'application/x-msdownload'
    };
    return mimeTypes[ext];
}

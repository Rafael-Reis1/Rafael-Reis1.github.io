const CACHE_NAME = 'p2pshare-?v=2201261222';
const urlsToCache = [
    './P2PShare.html',
    './style.css?v=2201261222',
    './app.js?v=2201261222',
    './manifest.json?v=2201261222',
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

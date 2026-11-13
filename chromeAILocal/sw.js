const CACHE_VERSION = '?v=1311260750';
const CACHE_NAME = 'chrome-ai-local-' + CACHE_VERSION.replace(/\W+/g, '');

const CORE_ASSETS = [
    './chromeAILocal.html',
    './style.css',
    './app.js',
    './manifest.json',
    './lib/marked.min.js',
    './lib/purify.min.js',
    './lib/atom-one-dark.min.css',
    './lib/highlight.min.js'
];

const OPTIONAL_ASSETS = [
    '../assets/libs_comuns/fonts.css',
    '../favicon.svg',
    './lib/katex.min.css',
    './lib/katex.min.js',
    './lib/auto-render.min.js',
    './lib/mermaid.min.js',
    './lib/panzoom.min.js'
];

async function cacheAssetSafely(cache, url) {
    try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res && res.ok) {
            await cache.put(url, res);
        }
    } catch (_) {
        // Ignora falhas individuais de rede para não impedir a instalação offline.
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(CORE_ASSETS.map((url) => cacheAssetSafely(cache, url)));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter((name) => name !== CACHE_NAME && name.startsWith('chrome-ai-local'))
                .map((name) => caches.delete(name))
        );
        await self.clients.claim();

        // Pré-carrega bibliotecas pesadas (KaTeX, Mermaid, Panzoom) em segundo plano sem travar o boot.
        const cache = await caches.open(CACHE_NAME);
        await Promise.allSettled(OPTIONAL_ASSETS.map((url) => cacheAssetSafely(cache, url)));
    })());
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    const isNavigation = event.request.mode === 'navigate';
    const isVendorLib = url.pathname.includes('/lib/') || url.pathname.includes('/assets/') || url.pathname.includes('/webfonts/');

    if (!isNavigation && isVendorLib) {
        // Bibliotecas versionadas: cache-first com busca ignorando querystring de cache busting.
        event.respondWith((async () => {
            const cached = await caches.match(event.request, { ignoreSearch: true });
            if (cached) return cached;

            const response = await fetch(event.request);
            if (response && response.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(event.request, response.clone()).catch(() => {});
            }
            return response;
        })());
        return;
    }

    // HTML, CSS, JS e manifesto do app: network-first para entregas sempre atualizadas, com fallback offline.
    event.respondWith((async () => {
        try {
            const response = await fetch(event.request);
            if (response && response.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(event.request, response.clone()).catch(() => {});
            }
            return response;
        } catch (_) {
            const cached = await caches.match(event.request, { ignoreSearch: true });
            if (cached) return cached;
            if (isNavigation) {
                const shell = await caches.match('./chromeAILocal.html', { ignoreSearch: true });
                if (shell) return shell;
            }
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        }
    })());
});

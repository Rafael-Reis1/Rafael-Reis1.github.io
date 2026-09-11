const CACHE_NAME = 'finance-app-?v=1109261159';
const urlsToCache = [
    '/finance/finance.html',
    '/finance/style.css?v=1109261159',
    '/finance/css/base/variables.css?v=1109261159',
    '/finance/css/base/reset.css?v=1109261159',
    '/finance/css/layout/layout.css?v=1109261159',
    '/finance/css/layout/header.css?v=1109261159',
    '/finance/css/components/buttons.css?v=1109261159',
    '/finance/css/components/forms.css?v=1109261159',
    '/finance/css/components/filters.css?v=1109261159',
    '/finance/css/components/dashboard.css?v=1109261159',
    '/finance/css/components/charts.css?v=1109261159',
    '/finance/css/components/transactions.css?v=1109261159',
    '/finance/css/components/series.css?v=1109261159',
    '/finance/css/components/subscriptions.css?v=1109261159',
    '/finance/css/components/modals.css?v=1109261159',
    '/finance/css/components/auth.css?v=1109261159',
    '/finance/css/components/toast.css?v=1109261159',
    '/finance/css/components/flatpickr.css?v=1109261159',
    '/finance/css/utils/animations.css?v=1109261159',
    '/finance/css/utils/responsive.css?v=1109261159',
    '/finance/app.js?v=1109261159',
    '/finance/js/services/firebase.js',
    '/finance/js/utils/constants.js',
    '/finance/js/utils/helpers.js',
    '/finance/js/components/CustomSelect.js',
    '/finance/js/store/financeManager.js',
    '/finance/js/ui/uiController.js',
    '/finance/icon-512.png',
    '/finance/icon-maskable.png',
    '/finance/manifest.json?v=1109261159',
    '../assets/libs_comuns/firebase/10.7.1/firebase-app-compat.js',
    '../assets/libs_comuns/firebase/10.7.1/firebase-auth-compat.js',
    '../assets/libs_comuns/firebase/10.7.1/firebase-firestore-compat.js',
    './lib/chart.js',
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

    if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
        return;
    }

    if (event.request.url.startsWith('https://firestore.googleapis.com') ||
        event.request.url.startsWith('https://www.googleapis.com') ||
        (event.request.url.includes('firebase') && !event.request.url.includes(self.location.origin))) {
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

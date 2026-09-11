// AIX SEC OPS – Service Worker (PWA)
const CACHE_NAME = 'aix-secops-v1';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './mock-data.js',
  './manifest.json',
  './icons/icon.svg'
];

// Install: Pre-cache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Never cache live API or proxy calls!
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // STRICT REQUIREMENT: Never cache live FlightRadar24 or CORS proxy requests
  const isLiveApiOrProxy =
    url.includes('flightradar24.com') ||
    url.includes('corsproxy.io') ||
    url.includes('allorigins.win') ||
    url.includes('codetabs.com') ||
    url.includes('api.allorigins');

  if (isLiveApiOrProxy || event.request.method !== 'GET') {
    // Network-only, bypass cache completely
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell caching (stale-while-revalidate for local static assets)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Return cached or fallback
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});

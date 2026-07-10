// Service Worker pro "Bučovice bez majitelů"
// Cíl: appka jde nainstalovat na plochu a otevře se i bez signálu (cache).
// GPS a mapové dlaždice pořád potřebují internet — offline funguje jen spuštění appky.

const CACHE_NAME = 'bucovice-landlord-v1';
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Strategie: síť, pokud nejde -> cache (ať appka jde otevřít i bez signálu,
// ale při připojení se vždy nejdřív zkusí čerstvá verze).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

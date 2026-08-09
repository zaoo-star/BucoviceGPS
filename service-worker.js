// Service worker pro Bučpoly.
//
// POZOR: tenhle soubor byl psaný od nuly, ne jako úprava původního. Pokud jsi v tom svém
// cachoval ještě něco dalšího, přidej to do seznamu SOUBORY níž.
//
// Dvě věci, na kterých tu záleží:
// 1) Název cache obsahuje verzi → při každém vydání se stará cache smaže a hráči se nemůžou
//    zaseknout na staré verzi hry. Zaseknutí na staré verzi bylo příčinou toho, že staré
//    klienty přepisovaly data ostatním i po nasazení oprav.
// 2) Samotná hra se bere VŽDY nejdřív ze sítě. Do cache se sáhne, jen když není signál.
const VERZE = '2.6';
const CACHE = 'bucpoly-v' + VERZE;

// Vlastní soubory.
const SOUBORY = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Knihovny z CDN. Bez nich se hra offline vůbec nevykreslí — Leaflet dělá mapu a Firebase
// přihlášení. Cachují se zvlášť, protože jsou z cizí domény a nesmí shodit celou instalaci,
// když zrovna nejsou dostupné.
const KNIHOVNY = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
];

// Každý soubor zvlášť. `cache.addAll` selže jako celek, když jediný z nich vrátí 404 —
// a tichá neúspěšná instalace znamená, že offline režim prostě nefunguje a nikdo neví proč.
async function ulozBezpecne(cache, seznam){
  await Promise.all(seznam.map(url =>
    cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
  ));
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await ulozBezpecne(cache, SOUBORY);
    await ulozBezpecne(cache, KNIHOVNY);
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const klice = await caches.keys();
    await Promise.all(klice.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Zpráva z appky: "nečekej a převezmi řízení" (hráč odklikl nabídku aktualizace).
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  let url;
  try { url = new URL(e.request.url); } catch (_) { return; }

  // Živá data se nikdy necachují — mapové dlaždice, Firebase i Overpass musí být aktuální.
  // Mapové dlaždice se NESMÍ cachovat — pravidla poskytovatelů to zakazují a je to
  // přesně ten důvod, proč nás OpenStreetMap zablokoval. `cartocdn` a `openstreetmap.fr`
  // jsou nové zdroje dlaždic, `tile.` pokrývá zbytek.
  const zivaData = /firebaseio|googleapis|overpass|cartocdn|basemaps|openstreetmap|tile\./.test(url.hostname + url.pathname);
  if (zivaData) return;

  const cizi = url.origin !== self.location.origin;

  // Knihovny z CDN: nejdřív cache (jsou verzované, nemění se), jinak síť.
  if (cizi) {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(odpoved => {
        if (odpoved && (odpoved.ok || odpoved.type === 'opaque')) {
          const kopie = odpoved.clone();
          caches.open(CACHE).then(c => c.put(e.request, kopie)).catch(() => {});
        }
        return odpoved;
      }).catch(() => caches.match(e.request)))
    );
    return;
  }

  // Samotná hra: nejdřív síť, cache až jako záchrana bez signálu.
  const jeHra = url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (jeHra) {
    e.respondWith(
      fetch(e.request)
        .then(odpoved => {
          if (odpoved && odpoved.ok) {
            const kopie = odpoved.clone();
            caches.open(CACHE).then(c => c.put(e.request, kopie)).catch(() => {});
          }
          return odpoved;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Ostatní vlastní soubory (ikony, manifest): z cache, na pozadí se doplní.
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(odpoved => {
      if (odpoved && odpoved.ok) {
        const kopie = odpoved.clone();
        caches.open(CACHE).then(c => c.put(e.request, kopie)).catch(() => {});
      }
      return odpoved;
    }))
  );
});

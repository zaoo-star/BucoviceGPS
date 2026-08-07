// Service worker pro Bučpoly.
// Klíčová věc: název cache obsahuje verzi. Při každém vydání se změní, stará cache se smaže
// a hráči se nemůžou zaseknout na staré verzi hry. Přesně to způsobovalo, že staré klienty
// přepisovaly data ostatním, i když už byla nasazená oprava.
const VERZE = '2.3';
const CACHE = 'bucpoly-v' + VERZE;

// Co se má držet offline. Mapové dlaždice a Firebase se schválně necachují —
// ty musí být vždycky živé.
const SOUBORY = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SOUBORY)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(klice => Promise.all(klice.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Zpráva z appky: "nečekej a převezmi řízení" (hráč odklikl nabídku aktualizace).
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Nikdy necachovat: cizí domény (mapy, Firebase, Overpass) a cokoli kromě GET.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Samotnou hru bereme VŽDY nejdřív ze sítě — do cache sáhneme, jen když není signál.
  // Opačné pořadí (cache first) je přesně to, co drží hráče na staré verzi.
  const jeHra = url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (jeHra) {
    e.respondWith(
      fetch(e.request)
        .then(odpoved => {
          const kopie = odpoved.clone();
          caches.open(CACHE).then(c => c.put(e.request, kopie)).catch(() => {});
          return odpoved;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(odpoved => {
      const kopie = odpoved.clone();
      caches.open(CACHE).then(c => c.put(e.request, kopie)).catch(() => {});
      return odpoved;
    }))
  );
});

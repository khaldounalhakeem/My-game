/* NeuroSpark service worker: caches the app so it works offline. */
const CACHE = 'neurospark-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/core.js',
  'js/engine.js',
  'js/app.js',
  'js/data/words.js',
  'js/games/shared.js',
  'js/games/memory.js',
  'js/games/speed.js',
  'js/games/attention.js',
  'js/games/flexibility.js',
  'js/games/problem.js',
  'js/games/language.js',
  'js/games/math.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Network first (so updates show up), falling back to the cache when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

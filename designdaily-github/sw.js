// DesignDaily Service Worker — v2
const CACHE = 'designdaily-v2';
const OFFLINE_URL = './index.html';

// Fichiers à mettre en cache immédiatement à l'installation
const PRECACHE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-48.png',
];

// Installation — mise en cache des ressources statiques
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activation — nettoyage des anciens caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — stratégie Cache First pour les assets, Network First pour RSS
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Requêtes RSS/API → Network First (données fraîches)
  const isApi = ['api.rss2json.com','api.allorigins.win','corsproxy.io','rss2json.com']
    .some(h => url.hostname.includes(h));

  if (isApi) {
    e.respondWith(
      fetch(e.request)
        .then(r => r)
        .catch(() => new Response('[]', { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  // Assets locaux → Cache First
  if (url.origin === self.location.origin || e.request.mode === 'navigate') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          // Mettre en cache les nouvelles ressources locales
          if (r.ok && e.request.method === 'GET') {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return r;
        }).catch(() => caches.match(OFFLINE_URL));
      })
    );
    return;
  }

  // Tout le reste → Network avec fallback cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

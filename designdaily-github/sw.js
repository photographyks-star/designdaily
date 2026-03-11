// DesignDaily Service Worker — v3 (cache agressif)
const CACHE = 'designdaily-v3';
const PRECACHE = ['./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-48.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Navigation → toujours servir index.html depuis le cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(c => c || fetch(e.request))
    );
    return;
  }

  // Assets locaux → Cache First
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(c => {
        if (c) return c;
        return fetch(e.request).then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(cache => cache.put(e.request, clone));
          }
          return r;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // APIs RSS → Network First + mise en cache pour offline
  const isRssApi = ['api.rss2json.com','api.allorigins.win','corsproxy.io']
    .some(h => url.hostname.includes(h));

  if (isRssApi) {
    e.respondWith(
      fetch(e.request.clone()).then(r => {
        if (r.ok) {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return r;
      }).catch(() =>
        caches.match(e.request).then(c =>
          c || new Response('{}', { headers: { 'Content-Type': 'application/json' } })
        )
      )
    );
    return;
  }

  // Reste → Network avec fallback cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

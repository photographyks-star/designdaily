// DesignDaily — Service Worker
// Rôle : permettre l'ouverture de l'app sans connexion, et charger la dernière version dès qu'il y a du réseau.
const CACHE = 'designdaily-v13';
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

// Une réponse issue d'une redirection ne peut pas servir à ouvrir une page : on la recopie proprement
async function clean(r) {
  if (!r.redirected) return r;
  return new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers });
}

// Page de l'app : la version en ligne d'abord (3,5 s maximum), sinon la copie gardée sur l'appareil
async function pageNetworkFirst() {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await Promise.race([
      fetch('./index.html', { cache: 'no-store' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3500)),
    ]);
    if (fresh && fresh.ok) {
      const page = await clean(fresh);
      cache.put('./index.html', page.clone());
      return page;
    }
  } catch (err) { /* pas de réseau : on passe à la copie locale */ }
  const cached = await cache.match('./index.html');
  return cached || fetch('./index.html');
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Tout ce qui vient d'un autre site (relais des flux, images) passe directement par le réseau :
  // les articles sont déjà gardés par l'app elle-même, inutile de les stocker une seconde fois ici.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  const isPage = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isPage) { e.respondWith(pageNetworkFirst()); return; }

  // Fichiers de l'app (icônes, manifeste) : copie locale d'abord
  e.respondWith(
    caches.match(e.request).then(c => c || fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, copy)); }
      return r;
    }))
  );
});

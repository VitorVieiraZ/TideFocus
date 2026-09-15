// Tide Focus service worker.
// Allowlist interception: only same-origin + Google Fonts are handled here.
// YouTube, Google Identity/Drive, and Spotify requests fall through untouched.
const CACHE = 'tidefocus-v2';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFontCss = url.hostname === 'fonts.googleapis.com';
  const isFontFile = url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFontCss && !isFontFile) return;

  // Navigations: network-first so an online reload always gets the latest deploy;
  // the cache is only an offline fallback.
  if (req.mode === 'navigate' || (sameOrigin && url.pathname.endsWith('/index.html'))) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
    );
    return;
  }

  // Font CSS: stale-while-revalidate (Google rotates the served CSS per UA).
  if (isFontCss) {
    e.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          caches.open(CACHE).then(c => c.put(req, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Font files + same-origin static assets: cache-first (immutable in practice).
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }))
  );
});

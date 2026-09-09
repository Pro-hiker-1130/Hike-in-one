const CACHE_NAME = 'waypoints-v3';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './countries-50m.geo.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle same-origin app-shell files; let everything else (map tiles,
  // fonts, CDN scripts) go straight to the network as normal.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first: while the app is under active development, a redeploy
  // should show up on the next reload. Cache is only a fallback for offline use.
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});

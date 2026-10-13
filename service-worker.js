const CACHE_NAME = 'waypoints-v5';
const APP_SHELL = ['./', './index.html', './catalog-core.js', './manifest.json', './icon-192.png', './icon-512.png', './countries-50m.geo.json'];

// The app can't boot without these (index.html calls L.map() immediately),
// so they have to be cached too or "offline" means a blank page on the
// trail. All are pinned to exact versions, so cache-first is safe.
const CDN_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js',
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.108.0/dist/umd/supabase.js',
];
const CACHE_FIRST_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all([
        cache.addAll(APP_SHELL).catch(() => {}),
        // One at a time rather than addAll, so one CDN hiccup doesn't
        // throw away the rest.
        ...CDN_LIBS.map((url) => cache.add(url).catch(() => {})),
      ])
    )
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
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Versioned libraries and fonts: cache-first. Everything else off-origin
  // (map tiles, Supabase, Strava) goes straight to the network as before.
  if (CACHE_FIRST_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // App shell: network-first, so a redeploy shows up on the next reload;
  // the cache is only a fallback for offline use.
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

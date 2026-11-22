// Offline-first app shell. Bump VERSION to invalidate the cache.
const VERSION = 'banglanorm-v1.1.0';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'src/app.js', 'src/core.js', 'src/diff.js', 'src/i18n.js', 'src/unicode-names.js', 'src/worker.js',
  'fonts/inter.woff2', 'fonts/noto-sans-bengali.woff2', 'fonts/noto-sans-bengali-latin.woff2',
  'fonts/noto-serif-bengali.woff2', 'fonts/hind-siliguri-400.woff2', 'fonts/hind-siliguri-600.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Network first (so a new deploy shows up right away), cache as the offline fallback.
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))));
});

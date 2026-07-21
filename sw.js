/* Service worker — installable + offline shell.
   Static shell: cache-first. Live data: network-first with cache fallback. */
const VERSION = 'warroom-v1';
const SHELL = [
  './', './index.html', './styles.css',
  './engine-core.js', './app.js', './geo-world.js', './geo-usa.js',
  './manifest.webmanifest', './icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch proxy/feed requests

  // live data: network-first
  if (url.pathname.endsWith('/data/feeds.json') || url.pathname.endsWith('/data/history.json')) {
    e.respondWith(
      fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; })
        .catch(() => caches.match(req))
    );
    return;
  }
  // shell: cache-first
  e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => {
    if (r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(VERSION).then(cc => cc.put(req, cp)); }
    return r;
  }).catch(() => c)));
});

/* Service worker — installable shell + offline fallback.
   Shell: cache-first.  Live data: network-first with cache fallback. */
const VERSION = 'warroom-v2';
const SHELL = [
  './', './index.html', './styles.css', './app.js',
  './engine-core.js', './geo-world.js', './geo-usa.js',
  './manifest.webmanifest', './icon.svg', './icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never intercept relay/feed traffic

  if (url.pathname.endsWith('/data/feeds.json') || url.pathname.endsWith('/data/history.json')) {
    e.respondWith(
      fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; })
        .catch(() => caches.match(req))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
      return r;
    }).catch(() => hit))
  );
});

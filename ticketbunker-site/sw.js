// TicketBunker app shell. Pages always come from the network first, so a new release is
// seen straight away. Only the static shell, planning pages and city guides are
// kept for poor signal; inventory pages always need the network for fresh prices.
// Versioned scripts, styles and images are served from cache. Nothing from /api or
// other sites is stored. Version 2 clears previously cached inventory HTML.
const CACHE = 'tb-shell-v2';
const OFFLINE_PAGES = new Set(['/', '/index', '/city-guides', '/plan-your-trip', '/hotels', '/travel', '/car-hire', '/vip-transfers', '/restaurants', '/stag-hen-weekends']);
const offlinePage = path => OFFLINE_PAGES.has(path) || /^\/guides\/[^/]+$/.test(path);
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/']).catch(() => {}))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    const offline = offlinePage(url.pathname);
    e.respondWith(fetch(req).then(res => { if (res.ok && offline) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => (offline ? caches.match(req) : Promise.resolve()).then(hit => hit || caches.match('/'))));
    return;
  }
  if (url.search.includes('v=') || /\.(png|jpe?g|webp|svg|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
  }
});

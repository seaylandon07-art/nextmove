/* NextMove service worker: opens instantly and works offline once visited.
   App files: cached, refreshed in the background. Pages: network first. API: never cached. */
const V = 'nm-v7';
const CORE = ['/', '/index.html', '/web.js', '/core.js', '/ui.js', '/chess.js', '/explain.js', '/pieces.js', '/play.js', '/review.js', '/analysis.js', '/train.js', '/progress.js', '/home.js', '/rewards.js', '/plus.js', '/social.js',
  '/sf.js', '/sf.wasm', '/fonts/instrument-sans.woff2', '/book.json', '/courses.json', '/gambits.json', '/endgames.json', '/puzzles.json', '/icons/logo.svg', '/manifest.webmanifest',
  '/sfx/move.mp3', '/sfx/capture.mp3', '/sfx/check.mp3', '/sfx/castle.mp3', '/sfx/promote.mp3', '/sfx/start.mp3', '/sfx/end.mp3', '/sfx/good.mp3', '/sfx/bad.mp3'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') {   // page: try the network so updates show up, fall back to the cached app
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put('/', cp)); return r; }).catch(() => caches.match('/')));
    return;
  }
  const heavy = /\.(wasm|woff2|mp3|jpg|png|svg)$/.test(u.pathname) || /^\/(sf\.js|sf-asm\.js|puzzles\.json|courses\.json|book\.json|gambits\.json|endgames\.json)$/.test(u.pathname);
  if (!heavy) {   // code: always try the network first so a deploy never mixes old and new files
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.open(V).then(async c => {   // big files: cached copy now, fresh copy for next time
    const hit = await c.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

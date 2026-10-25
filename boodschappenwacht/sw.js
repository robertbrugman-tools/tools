// Minimale service worker: maakt de app installeerbaar en toont de laatste versie als je offline bent.
// Aanbiedingen (de server-functie) worden nooit gecachet.
const V = 'bw-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(['./'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.mode !== 'navigate') return;
  e.respondWith(fetch(r).then((res) => { const copy = res.clone(); caches.open(V).then((c) => c.put(r, copy)); return res; }).catch(() => caches.match(r).then((m) => m || caches.match('./'))));
});

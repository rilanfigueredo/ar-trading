// Ar_Trading v__VERSION__ — service worker mínimo: la app se instala en el móvil,
// pero los datos y la pantalla siempre vienen del servidor (red primero).
// Solo guarda una copia para mostrar un aviso si no hay conexión.
const CACHE = 'ar-shell-__VERSION__';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/login' || url.pathname === '/logout') return;   // datos y sesión: nunca de copia
  e.respondWith(fetch(req).then((r) => {
    if (r.ok && r.type === 'basic') { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); }
    return r;
  }).catch(() => caches.match(req).then((m) => m || new Response('Sin conexión con el servidor.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
});

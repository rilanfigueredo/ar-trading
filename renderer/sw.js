// Service worker de Ar_Trading (v0.26): hace que el móvil pueda instalarla como app y abrir la pantalla al instante.
// Estrategia: primero la red (así siempre ves la versión nueva); si no hay red, la última copia guardada. NUNCA guarda /api/* (datos y configuración).
'use strict';
const CACHE = 'ar-trading-shell-1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname === '/acceso') return;
  e.respondWith(fetch(r).then((res) => {
    if (res && res.ok && res.type === 'basic') { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(r, copia)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(r).then((m) => m || Response.error())));
});

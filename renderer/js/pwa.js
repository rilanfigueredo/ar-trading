// v0.26: registra el service worker (solo en modo navegador; en Electron no hace falta).
(function () {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  if (window.desktopApi) return;
  const ok = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!ok) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
})();

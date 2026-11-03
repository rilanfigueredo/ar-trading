// Registro de la app instalable (v0.26). Solo en el navegador con conexión segura (https o localhost); en la app de escritorio no hace nada.
(function () {
  'use strict';
  if (window.desktopApi || !('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin conexión segura: la página funciona igual, solo no se instala como app */ });
})();

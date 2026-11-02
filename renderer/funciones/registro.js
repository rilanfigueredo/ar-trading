// Lista de funciones de la pantalla de tarjetas (v0.24). La leen la interfaz (como TVFunciones.registro) y el servidor (require).
// PARA SUMAR UNA FUNCIÓN NUEVA:  1) una entrada en LISTA  2) su interfaz en renderer/funciones/<id>/index.html
//                                3) su módulo en src/funciones/<id>/modulo.js (se descubre solo; ver puente.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TVFunciones_registro = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Iconos grandes de trazo con degradado (id único por icono, porque todos conviven en la misma página)
  const svg = (id, c1, c2, d) => '<svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="url(#ic-' + id + ')" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<defs><linearGradient id="ic-' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' + d + '</svg>';
  // tipo 'grafico': usa el gráfico del programa (se abre en la misma pestaña, igual que siempre).
  // tipo 'modulo': interfaz propia en un marco aislado (renderer/funciones/<id>/) + módulo en src/funciones/<id>/ con canales "<prefijo>:<nombre>".
  const LISTA = [
    { id: 'grafico', tipo: 'grafico', titulo: 'Gráfico limpio', desc: 'Un gráfico de velas en blanco, listo para analizar.', listo: true,
      icono: svg('g', '#00e5ee', '#2962ff', '<path d="M8 54V10M8 54h48"/><path d="M20 20v26M16 27h8v12h-8zM34 12v32M30 19h8v16h-8zM48 24v24M44 31h8v10h-8z"/><path d="M13 47l15-12 10 6 17-21" stroke-dasharray="1 6"/>') },
    { id: 'liq', tipo: 'grafico', titulo: 'Mapa de liquidaciones', desc: 'Dónde se concentran las liquidaciones estimadas.', listo: true,
      icono: svg('l', '#ffb020', '#ff3d7f', '<path d="M10 14h22M10 24h40M10 34h28M10 44h46M10 54h18"/><circle cx="50" cy="14" r="4"/><circle cx="52" cy="34" r="3"/>') },
    { id: 'simulador', tipo: 'modulo', prefijo: 'simulador', titulo: 'Simulador de posiciones', desc: 'Prueba apalancamiento, margen y precio de liquidación.', listo: false, nota: 'Llega en la v0.25',
      icono: svg('s', '#7cffb2', '#00c2ff', '<rect x="12" y="6" width="40" height="52" rx="8"/><path d="M20 16h24v8H20zM22 36h4M30 36h4M38 36h4M22 46h4M30 46h4M38 46h4"/>') },
    { id: 'blockchain', tipo: 'modulo', prefijo: 'blockchain', titulo: 'Monitor de blockchain', desc: 'Comisiones, mempool y bloques de Bitcoin al momento.', listo: false, nota: 'Llega en la v0.25',
      icono: svg('b', '#b734fe', '#4d7cff', '<path d="M32 6l16 9v18L32 42 16 33V15z"/><path d="M16 15l16 9 16-9M32 24v18"/><path d="M10 46l12 6M54 46l-12 6M26 56h12"/>') },
    { id: 'noticias', tipo: 'modulo', prefijo: 'noticias', titulo: 'Noticias macro', desc: 'Calendario económico, datos publicados y reporte.', listo: true,
      icono: svg('n', '#ffe14d', '#ff7a1a', '<rect x="8" y="12" width="48" height="44" rx="8"/><path d="M8 25h48M20 6v12M44 6v12"/><path d="M16 44l8-8 7 5 9-11 8 6"/>') },
  ];
  const PRESERVADOS = ['inicio', 'config', 'window', 'service', 'data', 'shared', 'klines'];
  const porId = (id) => LISTA.find((f) => f.id === id) || null;
  return {
    LISTA, PRESERVADOS, porId,
    // ¿es un valor válido para la pestaña? ('' = gráfico normal; 'inicio' = pantalla de tarjetas; id de un módulo)
    limpiar: (v) => { if (v === 'inicio') return 'inicio'; const f = porId(v); return f && f.tipo === 'modulo' && f.listo ? f.id : ''; },
    titulo: (v) => (v === 'inicio' ? 'Nueva pestaña' : (porId(v) || {}).titulo || ''),
  };
});

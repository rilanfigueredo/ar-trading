// Lista de funciones de la pantalla de tarjetas (v0.24). La leen la interfaz (como TVFunciones.registro) y el servidor (require).
// PARA SUMAR UNA FUNCIÓN NUEVA:  1) una entrada en LISTA  2) su interfaz en renderer/funciones/<id>/index.html
//                                3) su módulo en src/funciones/<id>/modulo.js (se descubre solo; ver puente.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TVFunciones_registro = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const svg = (d) => '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  // tipo 'grafico': usa el gráfico del programa (se abre en la misma pestaña, igual que siempre).
  // tipo 'modulo': interfaz propia en un marco aislado (renderer/funciones/<id>/) + módulo en src/funciones/<id>/ con canales "<prefijo>:<nombre>".
  const LISTA = [
    { id: 'grafico', tipo: 'grafico', titulo: 'Gráfico limpio', desc: 'Un gráfico de velas en blanco, listo para analizar.', listo: true,
      icono: svg('<path d="M4 4v16h16"/><path d="M8 15l3-4 3 2 4-6"/>') },
    { id: 'liq', tipo: 'grafico', titulo: 'Mapa de liquidaciones', desc: 'Dónde se concentran las liquidaciones estimadas.', listo: true,
      icono: svg('<path d="M4 6h8M4 10h13M4 14h6M4 18h16"/>') },
    { id: 'simulador', tipo: 'modulo', prefijo: 'simulador', titulo: 'Simulador de posiciones', desc: 'Prueba apalancamiento, margen y precio de liquidación.', listo: false, nota: 'Llega en la v0.25',
      icono: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0"/>') },
    { id: 'blockchain', tipo: 'modulo', prefijo: 'blockchain', titulo: 'Monitor de blockchain', desc: 'Comisiones, mempool y bloques de Bitcoin al momento.', listo: false, nota: 'Llega en la v0.25',
      icono: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M17 13v8M13 17h8"/>') },
    { id: 'noticias', tipo: 'modulo', prefijo: 'noticias', titulo: 'Noticias macro', desc: 'Calendario económico, datos publicados y reporte.', listo: true,
      icono: svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>') },
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

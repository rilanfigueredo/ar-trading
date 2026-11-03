// Función «Monitor de blockchain» (v0.25): une el núcleo del monitor (monitor.js) con el puente de funciones.
// Fuentes: mempool.space (bloques, dificultad) y Bitstamp (precios). Si una falla, se avisa; nunca se cambia de fuente en silencio.
// v0.26.2: consulta cada «pollSeconds» (por defecto 30 s) SOLO mientras la pestaña esté abierta y a la vista (la pantalla pregunta cada 5 s).
// Si nadie pregunta durante 20 s, se detiene del todo y no consume nada; al volver a la pestaña se reanuda. Datos en <datos del programa>/funciones/blockchain/historial.json (si existía el del monitor suelto, se copia una vez).
'use strict';
const fs = require('fs');
const path = require('path');
const { createClient } = require('./api');
const { createFileStore } = require('./store');
const { createPriceClient } = require('./prices');
const { createMonitor, dayRangeToUnix } = require('./monitor');

const CANALES = ['estado', 'actualizar', 'rango', 'ajustes', 'ajustar', 'probar'];

function migrar(carpeta, antigua) {
  try {
    const destino = path.join(carpeta, 'historial.json');
    const origen = antigua && path.join(antigua, 'historial.json');
    if (origen && !fs.existsSync(destino) && fs.existsSync(origen)) { fs.copyFileSync(origen, destino); return 'Se copió tu historial del monitor de blockchain anterior. El original no se tocó.'; }
  } catch (e) { return 'No se pudo copiar el historial anterior: ' + e.message; }
  return null;
}

function crear(entorno) {
  const nota = migrar(entorno.carpeta, entorno.appData ? path.join(entorno.appData, 'ar-monitor-modulo2') : null);
  const notificar = typeof entorno.notificar === 'function' ? entorno.notificar : () => {};
  const monitor = createMonitor({
    api: createClient({ fetchFn: entorno.fetch, timeoutMs: 10000 }),
    prices: createPriceClient({ fetchFn: entorno.fetch }),
    store: createFileStore(fs, path.join(entorno.carpeta, 'historial.json')),
    notifier: notificar,
    now: entorno.ahora,
  });
  let ultima = null, timer = null, cerrado = false, buenaUltima = true, ultimoUso = 0, activo = false;
  const ahoraMs = () => (entorno.ahora || Date.now)();
  const VIGENCIA = 20000;

  async function consultar(forzar) {
    const v = await monitor.refresh(forzar);
    buenaUltima = !!v.ok;
    if (nota && v) v.nota = nota;
    ultima = v;
    return v;
  }
  function programar() {
    clearTimeout(timer); activo = false;
    if (cerrado || ahoraMs() - ultimoUso > VIGENCIA) return;       // nadie mira la pestaña: parado
    activo = true;
    const s = monitor.getSettings().pollSeconds;
    timer = setTimeout(async () => { if (ahoraMs() - ultimoUso <= VIGENCIA) { try { await consultar(false); } catch (e) { /* ya queda como error en la vista */ } } programar(); }, (buenaUltima ? s : Math.min(s, 15)) * 1000);
    if (timer.unref) timer.unref();
  }

  const acciones = {
    // Lo último que se sabe (al instante). Si aún no hay nada, lo guardado en el equipo.
    estado: async () => ultima || monitor.cachedView() || { ok: false, cargando: true },
    actualizar: () => consultar(true),
    rango: (desde, hasta) => {
      const r = dayRangeToUnix(desde, hasta, (entorno.ahora || Date.now)());
      if (r.error) return { ok: false, error: r.error };
      return monitor.rangeAverage(r.from, r.to);
    },
    ajustes: () => monitor.getSettings(),
    ajustar: (p) => { const s = monitor.setSettings(p && typeof p === 'object' ? p : {}); programar(); return s; },
    probar: () => { notificar([{ title: 'Ar_Trading', body: 'Aviso de prueba: si lo ve, las notificaciones funcionan.' }]); return true; },
  };
  return {
    monitor,
    async llamar(nombre, args) {
      ultimoUso = ahoraMs();
      if (!activo && !cerrado) { if (!ultima) consultar(true).catch(() => {}); programar(); }
      const f = acciones[nombre]; if (!f) throw new Error('Canal desconocido.'); return f(...args); },
    cerrar() { cerrado = true; clearTimeout(timer); },
  };
}

module.exports = { id: 'blockchain', prefijo: 'blockchain', canales: CANALES, crear };

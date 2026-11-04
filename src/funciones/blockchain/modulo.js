// Función «Monitor de blockchain» (v0.25): une el núcleo del monitor (monitor.js) con el puente de funciones.
// Fuentes: mempool.space (bloques, dificultad) y Bitstamp (precios). Si una falla, se avisa; nunca se cambia de fuente en silencio.
// Consulta sola cada «pollSeconds» (por defecto 30 s) mientras el programa esté abierto, para poder avisar de bloques nuevos aunque la
// pestaña no se esté mirando. Datos en <datos del programa>/funciones/blockchain/historial.json (si existía el del monitor suelto, se copia una vez).
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
  let ultima = null, timer = null, cerrado = false, buenaUltima = true;

  async function consultar(forzar) {
    const v = await monitor.refresh(forzar);
    buenaUltima = !!v.ok;
    if (nota && v) v.nota = nota;
    ultima = v;
    return v;
  }
  function programar() {
    clearTimeout(timer);
    if (cerrado) return;
    const s = monitor.getSettings().pollSeconds;
    timer = setTimeout(async () => { try { await consultar(false); } catch (e) { /* ya queda como error en la vista */ } programar(); }, (buenaUltima ? s : Math.min(s, 15)) * 1000);
    if (timer.unref) timer.unref();
  }
  consultar(true).catch(() => {}).then(programar);

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
    async llamar(nombre, args) { const f = acciones[nombre]; if (!f) throw new Error('Canal desconocido.'); return f(...args); },
    cerrar() { cerrado = true; clearTimeout(timer); },
  };
}

module.exports = { id: 'blockchain', prefijo: 'blockchain', canales: CANALES, crear };

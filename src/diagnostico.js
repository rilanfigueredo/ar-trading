// Registro de problemas y modo seguro (v0.26.1).
// 1) Escribe <datos>/registro.log con lo importante de cada arranque: versión, equipo, errores, ventana sin responder, procesos caídos y consumo.
// 2) Si la vez anterior el programa no llegó a estar estable (se colgó o se cerró a la fuerza antes de 25 s), arranca en MODO SEGURO:
//    sin aceleración de gráficos y sin el guardado de liquidaciones en segundo plano, y lo avisa. El modo seguro se queda hasta que el usuario lo quite.
// Todo son archivos pequeños y funciones simples: si algo aquí falla, el programa sigue (nunca debe impedir abrirlo).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_LOG = 512 * 1024;
const SEGUNDOS_ESTABLE = 25;

function crear({ dir, ahora = () => new Date() }) {
  const logF = path.join(dir, 'registro.log');
  const marcaF = path.join(dir, 'arranque.json');
  const hora = () => { const d = ahora(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  let lineas = 0;

  function log(msg) {
    try {
      if (++lineas > 4000) return;                                   // tope por arranque: un error que se repite no llena el disco
      fs.mkdirSync(dir, { recursive: true });
      try { if (fs.statSync(logF).size > MAX_LOG) fs.renameSync(logF, logF + '.old'); } catch (e) { /* aún no existe */ }
      fs.appendFileSync(logF, `${hora()}  ${msg}\n`, 'utf8');
    } catch (e) { /* un registro que falla no debe romper nada */ }
  }

  const leer = () => { try { const m = JSON.parse(fs.readFileSync(marcaF, 'utf8')); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; } };
  const escribir = (m) => { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(marcaF + '.tmp', JSON.stringify(m), 'utf8'); fs.renameSync(marcaF + '.tmp', marcaF); } catch (e) { /* ok */ } };

  // Se llama UNA vez al arrancar, antes de que Electron esté listo. Devuelve { seguro, nuevo, motivo }.
  function arrancar({ version = '', hwAccelActual = true } = {}) {
    const m = leer();
    const anteriorMal = m.estable === false;                          // la vez anterior nunca llegó a «estable» ni se cerró bien
    let seguro = m.seguro === true, nuevo = false, motivo = m.motivo || '';
    const hwAntes = typeof m.hwAntes === 'boolean' ? m.hwAntes : hwAccelActual;
    if (anteriorMal && !seguro) { seguro = true; nuevo = true; motivo = 'La vez anterior el programa no llegó a abrir bien (se colgó o se cerró a la fuerza).'; }
    escribir({ estable: false, seguro, motivo, hwAntes: seguro && !m.seguro ? hwAccelActual : hwAntes, version, desde: ahora().toISOString() });
    log(`──── Arranque v${version}${seguro ? ' · MODO SEGURO' + (nuevo ? ' (nuevo: ' + motivo + ')' : '') : ''}`);
    return { seguro, nuevo, motivo, hwAntes: seguro && !m.seguro ? hwAccelActual : hwAntes };
  }
  // El programa estuvo abierto y respondiendo el tiempo suficiente, o se cerró con normalidad.
  function estable() { const m = leer(); if (m.estable !== true) { m.estable = true; escribir(m); } }
  // El usuario quita el modo seguro (Ajustes > Programa). Devuelve la aceleración que tenía antes para restaurarla.
  function salirDeSeguro() { const m = leer(); const hw = typeof m.hwAntes === 'boolean' ? m.hwAntes : true; escribir(Object.assign(m, { seguro: false, motivo: '', estable: m.estable === true })); log('Modo seguro desactivado por el usuario'); return { hwAccel: hw }; }
  const estado = () => { const m = leer(); return { seguro: m.seguro === true, motivo: m.motivo || '', registro: logF }; };

  // Cabecera con datos del equipo (sirve para entender el problema sin pedir nada más al usuario)
  function cabecera({ app, version }) {
    try {
      const c = os.cpus() || [];
      log(`Versión ${version} · ${process.platform} ${os.release()} ${process.arch} · Electron ${process.versions.electron} (Chromium ${process.versions.chrome}) · empaquetado: ${app.isPackaged}`);
      log(`Equipo: ${c.length} núcleos ${c[0] ? c[0].model.trim() : ''} · RAM ${Math.round(os.totalmem() / 1048576)} MB (libre ${Math.round(os.freemem() / 1048576)} MB)`);
    } catch (e) { /* ok */ }
  }

  function rendimiento(app) {
    try {
      const p = app.getAppMetrics().map((x) => ({ tipo: x.type, cpu: Math.round(x.cpu.percentCPUUsage * 10) / 10, mb: Math.round(x.memory.workingSetSize / 1024) }));
      return { procesos: p, mb: p.reduce((s, x) => s + x.mb, 0), cpu: Math.round(p.reduce((s, x) => s + x.cpu, 0) * 10) / 10 };
    } catch (e) { return { procesos: [], mb: 0, cpu: 0 }; }
  }

  // Vigilancia mientras el programa está abierto. getWin() devuelve la ventana principal (o null).
  function vigilar({ app, getWin }) {
    process.on('uncaughtException', (e) => log('ERROR no controlado: ' + ((e && e.stack) || e)));
    process.on('unhandledRejection', (e) => log('ERROR promesa: ' + ((e && e.stack) || e)));
    app.on('child-process-gone', (_e, d) => log(`PROCESO CAÍDO: ${d.type} (${d.reason}, código ${d.exitCode})${d.name ? ' ' + d.name : ''}`));
    app.on('render-process-gone', (_e, _wc, d) => log(`VENTANA CAÍDA: ${d.reason} (código ${d.exitCode})`));
    try { log('Gráficos (GPU): ' + JSON.stringify(app.getGPUFeatureStatus())); } catch (e) { /* ok */ }
    // ¿se bloquea el proceso principal? (mide cuánto tarda en volver un temporizador de 1 s)
    let t0 = Date.now();
    const lag = setInterval(() => { const dt = Date.now() - t0 - 1000; if (dt > 1500) log(`El proceso principal estuvo bloqueado ${Math.round(dt / 100) / 10} s`); t0 = Date.now(); }, 1000);
    // consumo: cada minuto los primeros 5 minutos y luego cada 10
    let n = 0;
    const cons = () => { const r = rendimiento(app); log(`Consumo: ${r.mb} MB · CPU ${r.cpu} % (${r.procesos.map((x) => x.tipo + ' ' + x.mb).join(', ')})`); };
    const iv = setInterval(() => { n++; if (n <= 5 || n % 10 === 0) cons(); }, 60000);
    const t25 = setTimeout(() => { estable(); log(`Estable: ${SEGUNDOS_ESTABLE} s abierto y respondiendo`); }, SEGUNDOS_ESTABLE * 1000);
    [lag, iv, t25].forEach((t) => t.unref && t.unref());
    return { ventana(w) {
      let errores = 0;
      w.on('unresponsive', () => log('LA VENTANA DEJÓ DE RESPONDER'));
      w.on('responsive', () => log('La ventana volvió a responder'));
      w.webContents.on('console-message', (e, level, message, line, source) => {
        const m = e && typeof e === 'object' && 'message' in e ? e : { level, message, lineNumber: line, sourceId: source };   // Electron nuevo pasa un objeto
        if ((m.level === 3 || m.level === 'error') && errores++ < 40) log(`Error en pantalla: ${String(m.message).slice(0, 300)} (${path.basename(String(m.sourceId || ''))}:${m.lineNumber})`);
      });
      w.webContents.once('did-finish-load', () => log('Pantalla principal cargada'));
    } };
  }

  return { log, arrancar, estable, salirDeSeguro, estado, cabecera, rendimiento, vigilar, logF, marcaF };
}

module.exports = { crear, SEGUNDOS_ESTABLE };

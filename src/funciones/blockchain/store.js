'use strict';
// Historial y ajustes guardados en el equipo del usuario (un archivo JSON).
// El acceso al disco se inyecta (fs), así se prueba sin tocar archivos reales.

const MAX_LOG = 3000; // ~3 semanas de bloques

const DEFAULT_SETTINGS = {
  notifyNewBlock: false,   // aviso en cada bloque nuevo (apagado por defecto: llega cada ~10 min)
  notifyRetarget: true,    // aviso cuando empieza un nuevo período de dificultad
  notifyNear: true,        // aviso cuando falten pocos bloques para el ajuste
  nearBlocks: 144,         // "pocos" = 144 bloques (~1 día). Editable.
  pollSeconds: 30,         // cada cuánto se consulta la fuente. Editable (mínimo 15).
};

function emptyState() {
  return {
    version: 1,
    settings: Object.assign({}, DEFAULT_SETTINGS),
    blockMarks: {},   // { "altura": marca de tiempo } de bloques ya consultados (inicios de período, halvings)
    adjustments: [],  // historial de ajustes de dificultad (caché)
    adjustmentsFetchedForEpoch: null,
    blockLog: [],     // bloques vistos: { h, ts, seen }
    prices: {},       // precios históricos de Bitstamp ya consultados: { "hora Unix": {price, precision} }
    priceNow: null,   // último precio actual conocido: { price, ts, fetchedAtMs }
    lastView: null,   // última pantalla completa (para mostrarla sin conexión)
  };
}

function normalizeSettings(s) {
  const out = Object.assign({}, DEFAULT_SETTINGS, s || {});
  out.pollSeconds = Math.max(15, Math.round(Number(out.pollSeconds) || DEFAULT_SETTINGS.pollSeconds));
  out.nearBlocks = Math.max(1, Math.min(2016, Math.round(Number(out.nearBlocks) || DEFAULT_SETTINGS.nearBlocks)));
  out.notifyNewBlock = !!out.notifyNewBlock;
  out.notifyRetarget = !!out.notifyRetarget;
  out.notifyNear = !!out.notifyNear;
  return out;
}

// Añade bloques al registro: sin repetir alturas, ordenado, con tope.
function addToLog(state, blocks, seenMs) {
  const byH = new Map(state.blockLog.map((e) => [e.h, e]));
  for (const b of blocks) {
    if (!byH.has(b.height)) byH.set(b.height, { h: b.height, ts: b.timestamp, seen: seenMs });
  }
  const all = Array.from(byH.values()).sort((a, b) => a.h - b.h);
  state.blockLog = all.length > MAX_LOG ? all.slice(all.length - MAX_LOG) : all;
  return state;
}

// Últimos n bloques con el tiempo desde el bloque anterior (solo si es consecutivo).
function recentWithIntervals(state, n) {
  const log = state.blockLog;
  const out = [];
  for (let i = log.length - 1; i >= 0 && out.length < n; i--) {
    const cur = log[i];
    const prev = i > 0 ? log[i - 1] : null;
    const gap = prev && prev.h === cur.h - 1 ? cur.ts - prev.ts : null;
    out.push({ height: cur.h, timestamp: cur.ts, secondsSincePrev: gap });
  }
  return out;
}

function createFileStore(fs, filePath, nowFn) {
  const now = nowFn || (() => Date.now());
  return {
    // Devuelve { state, warning }. Si el archivo está dañado, se aparta (no se borra) y se avisa.
    load() {
      let text;
      try {
        if (!fs.existsSync(filePath)) return { state: emptyState(), warning: null };
        text = fs.readFileSync(filePath, 'utf8');
      } catch (e) {
        return { state: emptyState(), warning: 'No se pudo leer el historial (' + e.message + '). Se empieza uno nuevo.' };
      }
      try {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || data.version !== 1) throw new Error('formato desconocido');
        const base = emptyState();
        const state = Object.assign(base, data);
        state.settings = normalizeSettings(data.settings);
        if (!Array.isArray(state.blockLog)) state.blockLog = [];
        if (!Array.isArray(state.adjustments)) state.adjustments = [];
        if (!state.blockMarks || typeof state.blockMarks !== 'object') state.blockMarks = {};
        if (!state.prices || typeof state.prices !== 'object') state.prices = {};
        if (!state.lastView || typeof state.lastView !== 'object') state.lastView = null;
        return { state, warning: null };
      } catch (e) {
        const bad = filePath + '.danado-' + now();
        let moved = false;
        try { fs.renameSync(filePath, bad); moved = true; } catch (_) { /* nada */ }
        return {
          state: emptyState(),
          warning: 'El historial guardado estaba dañado (' + e.message + '). ' + (moved ? 'Se guardó una copia aparte y ' : '') + 'se empieza uno nuevo.',
        };
      }
    },
    save(state) {
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
      fs.renameSync(tmp, filePath);
    },
  };
}

module.exports = { emptyState, normalizeSettings, addToLog, recentWithIntervals, createFileStore, DEFAULT_SETTINGS, MAX_LOG };

// Almacén local del mapa de liquidaciones (v0.23): guarda en data/liq/ lo que se va recibiendo mientras el programa está encendido,
// para que el mapa tenga memoria. Archivos: candles.json (velas 5 min), oi-<exchange>.json (interés abierto en USD), events.jsonl (liquidaciones reales).
'use strict';
const fs = require('fs');
const path = require('path');

const KEEP_SEC = 35 * 86400;
const EX = ['binance', 'bybit', 'okx'];

function create(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const st = { candles: [], oi: { binance: [], bybit: [], okx: [] }, events: [], ver: 0 };
  const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return null; } };
  const wr = (f, o) => { const p = path.join(dir, f); fs.writeFileSync(p + '.tmp', JSON.stringify(o)); fs.renameSync(p + '.tmp', p); };
  const c = rd('candles.json'); if (Array.isArray(c)) st.candles = c.map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4] }));
  EX.forEach((ex) => { const o = rd('oi-' + ex + '.json'); if (Array.isArray(o)) st.oi[ex] = o.map((r) => ({ t: r[0], usd: r[1] })); });
  try {
    fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').forEach((ln) => { if (!ln) return; try { const e = JSON.parse(ln); if (e && e.t) st.events.push(e); } catch (er) { /* línea dañada */ } });
  } catch (e) { /* aún no hay */ }
  const firstRun = !st.candles.length && !st.oi.binance.length && !st.oi.bybit.length && !st.oi.okx.length;
  let dirty = false, timer = null;
  const merge = (arr, rows, key) => {                 // une por tiempo (las filas nuevas pisan a las viejas) y ordena
    const m = new Map(arr.map((r) => [r.t, r]));
    rows.forEach((r) => m.set(r.t, r));
    return Array.from(m.values()).sort((a, b) => a.t - b.t);
  };
  const prune = () => { const lim = Math.floor(Date.now() / 1000) - KEEP_SEC; st.candles = st.candles.filter((r) => r.t >= lim); EX.forEach((ex) => { st.oi[ex] = st.oi[ex].filter((r) => r.t >= lim); }); st.events = st.events.filter((e) => e.t >= lim); };
  const flush = () => {
    clearTimeout(timer); timer = null;
    if (!dirty) return;
    dirty = false;
    try {
      fs.mkdirSync(dir, { recursive: true });
      prune();
      wr('candles.json', st.candles.map((r) => [r.t, r.o, r.h, r.l, r.c]));
      EX.forEach((ex) => wr('oi-' + ex + '.json', st.oi[ex].map((r) => [r.t, r.usd])));
      fs.writeFileSync(path.join(dir, 'events.jsonl'), st.events.map((e) => JSON.stringify(e)).join('\n') + (st.events.length ? '\n' : ''));
    } catch (e) { /* disco lleno o sin permisos: no se detiene el mapa; el aviso lo da el servicio */ st.writeError = e.message; }
  };
  const touch = () => { dirty = true; st.ver++; if (!timer) { timer = setTimeout(flush, 5000); if (timer.unref) timer.unref(); } };
  return {
    state: st, firstRun, flush,
    addCandles(rows) { if (rows.length) { st.candles = merge(st.candles, rows); touch(); } },
    addOi(ex, rows) { if (rows.length) { st.oi[ex] = merge(st.oi[ex], rows); touch(); } },
    addEvent(e) { st.events.push(e); if (st.events.length > 200000) st.events.shift(); touch(); },
  };
}
module.exports = { create, EX };

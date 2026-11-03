// Almacén local del mapa de liquidaciones: guarda en data/liq/ lo que se va recibiendo mientras el programa está encendido.
// v0.23.5: ARCHIVO PERMANENTE (nada se borra): arch-oi-<exchange>.jsonl (solo se AÑADE al final) y events-AAAA-MM.jsonl (liquidaciones
// reales, un archivo por mes; v0.23.6: los meses cerrados se comprimen, ver events.js). En memoria (y en candles.json / oi-<ex>.json) solo
// quedan los últimos 40 días, que es lo que usa el mapa estimado. v0.23.6: las velas de 5 min YA NO se archivan (son públicas en Binance);
// el archivo arch-candles5m.jsonl de versiones anteriores se deja como está.
'use strict';
const fs = require('fs');
const path = require('path');
const Events = require('./events');

const MEM_SEC = 40 * 86400;           // ventana en memoria
const EX = ['binance', 'bybit', 'okx'];

function create(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const st = { candles: [], oi: { binance: [], bybit: [], okx: [] }, events: [], ver: 0 };
  const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return null; } };
  const wr = (f, o) => { const p = path.join(dir, f); fs.writeFileSync(p + '.tmp', JSON.stringify(o)); fs.renameSync(p + '.tmp', p); };
  const c = rd('candles.json'); if (Array.isArray(c)) st.candles = c.map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4] }));
  EX.forEach((ex) => { const o = rd('oi-' + ex + '.json'); if (Array.isArray(o)) st.oi[ex] = o.map((r) => ({ t: r[0], usd: r[1] })); });
  const readLines = (f, fn) => { try { fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((ln) => { if (!ln) return; try { fn(JSON.parse(ln)); } catch (er) { /* línea dañada: se salta */ } }); } catch (e) { /* aún no hay */ } };
  // eventos: el archivo viejo (events.jsonl) + los meses recientes (los anteriores se quedan en disco sin cargarse)
  readLines('events.jsonl', (e) => { if (e && e.t) st.events.push(e); });
  const ev = Events.create(dir);
  st.events = st.events.concat(ev.load(Date.now() / 1000 - MEM_SEC));
  st.events.sort((a, b) => a.t - b.t);
  const dedup = []; st.events.forEach((e) => { const q = dedup[dedup.length - 1]; if (!q || q.t !== e.t || q.ex !== e.ex || q.price !== e.price || q.usd !== e.usd) dedup.push(e); }); st.events = dedup.slice(-200000);
  const firstRun = !st.candles.length && !st.oi.binance.length && !st.oi.bybit.length && !st.oi.okx.length;

  // Archivo permanente de series (velas 5 min e interés abierto): solo se añaden filas con tiempo MAYOR al último ya archivado.
  const lastOf = (f) => { let last = 0; try { const fd = fs.openSync(path.join(dir, f), 'r'); const size = fs.fstatSync(fd).size; const len = Math.min(size, 4096); const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, size - len); fs.closeSync(fd); const ln = b.toString('utf8').split('\n').filter(Boolean); for (let i = ln.length - 1; i >= 0 && !last; i--) { try { const j = JSON.parse(ln[i]); last = (Array.isArray(j) ? j[0] : j.t) || 0; } catch (e) { /* línea cortada */ } } } catch (e) { last = 0; } return last; };
  const archLast = {}; EX.forEach((ex) => { archLast[ex] = lastOf('arch-oi-' + ex + '.jsonl'); });
  const archive = (key, file, rows, toLine) => {
    const fresh = rows.filter((r) => r.t > archLast[key]);
    if (!fresh.length) return;
    try { fs.appendFileSync(path.join(dir, file), fresh.map((r) => JSON.stringify(toLine(r))).join('\n') + '\n'); archLast[key] = fresh[fresh.length - 1].t; } catch (e) { st.writeError = e.message; }
  };
  const archiveAll = () => { EX.forEach((ex) => archive(ex, 'arch-oi-' + ex + '.jsonl', st.oi[ex], (r) => [r.t, r.usd])); };
  archiveAll();   // lo que ya estaba guardado de versiones anteriores pasa al archivo permanente

  const firstOf = (f) => { try { const fd = fs.openSync(path.join(dir, f), 'r'); const b = Buffer.alloc(512); const n = fs.readSync(fd, b, 0, 512, 0); fs.closeSync(fd); const j = JSON.parse(b.toString('utf8', 0, n).split('\n')[0]); return (Array.isArray(j) ? j[0] : j.t) || null; } catch (e) { return null; } };
  const fsize = (f) => { try { return fs.statSync(path.join(dir, f)).size; } catch (e) { return 0; } };
  const info = () => {
    const out = [];
    EX.forEach((ex) => out.push({ id: 'liq-oi-' + ex, name: 'Interés abierto ' + ({ binance: 'Binance', bybit: 'Bybit', okx: 'OKX' })[ex] + ' (cada 5 min)', from: firstOf('arch-oi-' + ex + '.jsonl'), to: archLast[ex] || null, bytes: fsize('arch-oi-' + ex + '.jsonl') }));
    const e = ev.info();
    out.push({ id: 'liq-events', name: 'Liquidaciones reales BTCUSDT (Binance, Bybit, OKX)', from: e.from, to: e.to, bytes: e.bytes, err: e.error });
    return out;
  };
  let dirtySeries = false, timer = null;
  const merge = (arr, rows) => {                      // une por tiempo (las filas nuevas pisan a las viejas) y ordena
    const m = new Map(arr.map((r) => [r.t, r]));
    rows.forEach((r) => m.set(r.t, r));
    return Array.from(m.values()).sort((a, b) => a.t - b.t);
  };
  const trimMem = () => { const lim = Math.floor(Date.now() / 1000) - MEM_SEC; st.candles = st.candles.filter((r) => r.t >= lim); EX.forEach((ex) => { st.oi[ex] = st.oi[ex].filter((r) => r.t >= lim); }); };
  const flush = () => {
    clearTimeout(timer); timer = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      ev.flush();
      if (dirtySeries) {
        dirtySeries = false;
        archiveAll();                                // primero al archivo permanente (nunca se recorta)
        trimMem();
        wr('candles.json', st.candles.map((r) => [r.t, r.o, r.h, r.l, r.c]));
        EX.forEach((ex) => wr('oi-' + ex + '.json', st.oi[ex].map((r) => [r.t, r.usd])));
      }
    } catch (e) { /* disco lleno o sin permisos: no se detiene el mapa; el aviso lo da el servicio */ st.writeError = e.message; }
  };
  const touch = () => { st.ver++; if (!timer) { timer = setTimeout(flush, 5000); if (timer.unref) timer.unref(); } };
  return {
    state: st, firstRun, flush, info, compress: () => ev.compress(), compressAsync: () => ev.compressAsync(),
    addCandles(rows) { if (rows.length) { st.candles = merge(st.candles, rows); dirtySeries = true; touch(); } },
    addOi(ex, rows) { if (rows.length) { st.oi[ex] = merge(st.oi[ex], rows); dirtySeries = true; touch(); } },
    addEvent(e) { st.events.push(e); ev.add(e); if (st.events.length > 200000) st.events.shift(); touch(); },
  };
}
module.exports = { create, EX };

// Servicio del mapa de liquidaciones (v0.23): descarga el historial disponible, escucha las liquidaciones reales (WebSocket),
// actualiza cada 5 minutos y calcula el mapa estimado bajo petición. Informa del estado POR EXCHANGE (nunca sustituye una fuente en silencio).
'use strict';
const path = require('path');
const S = require('./sources');
const E = require('./estimate');
const Store = require('./store');

const HIST_DAYS = { binance: 30, bybit: 7, okx: 5 };            // lo que se pide al arrancar (Binance da 30 días, OKX guarda 1440 entradas = 5 días)
const POLL_MS = 5 * 60 * 1000;
const hash = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

// ---------- Fuente simulada (TV_MOCK=1): precio y OI creíbles, liquidaciones cada pocos segundos ----------
function mockPrice(tSec) { return require('../core').mockPrice('BTCUSDT', tSec * 1000); }   // el mismo precio simulado que las velas del gráfico
function mockDeps() {
  const candlesAt = (from, to) => { const out = []; for (let t = Math.floor(from / 300) * 300; t < to; t += 300) { const o = mockPrice(t), c = mockPrice(t + 300); out.push({ t, o, c, h: Math.max(o, c) + 25 * hash(t + 1), l: Math.min(o, c) - 25 * hash(t + 2) }); } return out; };
  const oiAt = (ex, t) => { const k = { binance: 1, bybit: 0.45, okx: 0.3 }[ex]; return k * (7.5e9 + 9e8 * Math.sin(t / 150000) + 3.5e8 * Math.sin(t / 9000) + 2.5e8 * Math.sin(t / 2100 + 1) + 6e7 * (hash(Math.floor(t / 300) + (ex === 'okx' ? 7 : 0)) - 0.5)); };
  return {
    mock: true,
    candles: async (fromMs, toMs) => candlesAt(fromMs / 1000, Math.min(toMs, Date.now()) / 1000),
    oi: async (ex, fromMs, toMs) => { const out = []; for (let t = Math.floor(fromMs / 300000) * 300; t * 1000 < Math.min(toMs, Date.now()); t += 300) out.push({ t, usd: oiAt(ex, t) }); return out; },
    mmr: async (ex) => ({ value: S.MMR_DEFAULT[ex], source: 'default' }),
    openSocket(ex, onEvent, onState) {
      onState('ok', 'simulado');
      let n = 0;
      const timer = setInterval(() => { n++; const t = Math.floor(Date.now() / 1000); const p = mockPrice(t); const side = hash(n + ex.length) < 0.5 ? 0 : 1; onEvent({ t, ex, side, price: Math.round((p + (side ? 1 : -1) * 0.003 * p * hash(n)) * 10) / 10, usd: Math.exp(9 + 6 * hash(n + 3)) }); }, 2500);
      if (timer.unref) timer.unref();
      return { close() { clearInterval(timer); } };
    },
  };
}
function realDeps() {
  const getJson = async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (res.status === 429 || res.status === 418) throw new Error('el exchange pidió ir más despacio (' + res.status + ')');
    if (!res.ok) throw new Error('respondió ' + res.status);
    return res.json();
  };
  return {
    mock: false,
    candles: (f, t) => S.binanceCandles(getJson, f, t),
    oi: (ex, f, t, priceAt) => S.liveOiJobs[ex](getJson, f, t, priceAt),
    async mmr(ex) {
      if (ex === 'binance') return { value: S.MMR_DEFAULT.binance, source: 'default', note: 'Binance no publica los tramos sin clave API: se usa un valor por defecto (0,4 %, no verificado).' };
      try { return { value: await (ex === 'bybit' ? S.bybitMmr : S.okxMmr)(getJson), source: 'live' }; }
      catch (e) { return { value: S.MMR_DEFAULT[ex], source: 'default', note: 'No se pudo leer el margen de ' + ex + ' (' + e.message + '): se usa un valor por defecto (no verificado).' }; }
    },
    openSocket: (ex, onEvent, onState) => S.openLiqSocket(ex, onEvent, onState),
  };
}

function create(opt) {
  const deps = opt.deps || (opt.mock ? mockDeps() : realDeps());
  const store = Store.create(opt.dir);
  const status = {};
  Store.EX.forEach((ex) => { status[ex] = { state: 'cargando', msg: 'Descargando el historial…', ws: 'sin conectar', wsMsg: '', mmr: S.MMR_DEFAULT[ex], mmrSource: 'default', mmrNote: '', rows: store.state.oi[ex].length }; });
  const socks = [];
  let pollT = null, stopped = false, cache = null;
  const priceAtFn = () => { const m = new Map(store.state.candles.map((c) => [c.t, c.c])); return (t) => m.get(Math.floor(t / 300) * 300) || null; };

  async function backfill(ex) {
    const st = status[ex];
    try {
      const now = Date.now();
      const have = store.state.oi[ex];
      const lastT = have.length ? have[have.length - 1].t * 1000 : 0;
      const from = Math.max(now - HIST_DAYS[ex] * 86400000, lastT ? lastT - 600000 : 0);
      const rows = await deps.oi(ex, from, now, priceAtFn());
      store.addOi(ex, rows);
      st.rows = store.state.oi[ex].length;
      st.state = st.rows >= 2 ? 'ok' : 'error';
      st.msg = st.rows >= 2 ? '' : 'La fuente respondió sin datos de interés abierto.';
      st.lastOk = Date.now();
    } catch (e) { st.state = store.state.oi[ex].length >= 2 ? 'aviso' : 'error'; st.msg = 'Interés abierto: ' + e.message + (store.state.oi[ex].length >= 2 ? ' (se usa lo guardado)' : ''); }
  }
  async function refreshCandles() {
    const now = Date.now(), cs = store.state.candles;
    const from = cs.length ? cs[cs.length - 1].t * 1000 - 600000 : now - 30 * 86400000;
    store.addCandles(await deps.candles(Math.max(from, now - 30 * 86400000), now));
  }
  async function cycle(first) {
    try { await refreshCandles(); cache = null; }
    catch (e) { Store.EX.forEach((ex) => { status[ex].state = status[ex].state === 'ok' ? 'aviso' : 'error'; status[ex].msg = 'Precio (velas de Binance Futuros): ' + e.message; }); }
    if (store.state.candles.length < 2) return;
    await Promise.all(Store.EX.map(backfill));
    cache = null;
  }
  async function start() {
    Store.EX.forEach((ex) => {
      deps.mmr(ex).then((m) => { Object.assign(status[ex], { mmr: m.value, mmrSource: m.source, mmrNote: m.note || '' }); cache = null; }).catch(() => {});
      const sock = deps.openSocket(ex, (ev) => { store.addEvent(ev); status[ex].lastEvent = ev.t; }, (state, txt) => { status[ex].ws = state === 'ok' ? 'ok' : 'error'; status[ex].wsMsg = txt || ''; });
      socks.push(sock);
    });
    await cycle(true);
    if (!stopped) { pollT = setInterval(() => { cycle(false); }, POLL_MS); if (pollT.unref) pollT.unref(); }
  }
  function stop() { stopped = true; clearInterval(pollT); socks.forEach((s) => { try { s.close(); } catch (e) { /* ok */ } }); store.flush(); }

  // Mapa estimado. p: { ex: 'binance,bybit,okx', levs: '5,10,25,50,100', w: '10,25,30,20,15', colSec, halfLife, binSize, sinceDays }
  function getMap(p) {
    p = p || {};
    const exs = String(p.ex || 'binance,bybit,okx').split(',').filter((x) => Store.EX.includes(x));
    const levOn = E.LEVS.map((l) => String(p.levs || '5,10,25,50,100').split(',').map(Number).includes(l));
    const weights = String(p.w || '').split(',').map(Number);
    const colSec = Math.max(300, Math.min(86400, Number(p.colSec) || 3600));
    const halfLife = p.halfLife === undefined || p.halfLife === '' ? 72 : Math.max(0, Number(p.halfLife));
    const binSize = Math.max(0.01, Number(p.binSize) || 10);
    const sinceDays = Math.max(0.1, Math.min(35, Number(p.sinceDays) || 14));
    const since = Math.floor(Date.now() / 1000) - sinceDays * 86400;
    const key = [exs, levOn, weights, colSec, halfLife, binSize, sinceDays | 0, store.state.ver].join('|');
    const candles = store.state.candles;
    const warnings = [];
    let lists = [];
    if (!cache || cache.key !== key) {
      const per = {};
      exs.forEach((ex) => {
        const oi = store.state.oi[ex];
        if (candles.length < 2 || oi.length < 2) return;
        per[ex] = E.estimate({ candles, oi, mmr: status[ex].mmr, weights, levOn, binSize, colSec, halfLifeH: halfLife, since });
      });
      cache = { key, per };
    }
    exs.forEach((ex) => { if (cache.per[ex]) lists.push(cache.per[ex].segs); });
    let segs = E.mergeSegs(lists);
    // se descartan los segmentos casi invisibles (< 0,1 % del mayor) para no enviar datos que no se ven
    let mx = 0; segs.forEach((r) => { const t = r[4] + r[5] + r[6] + r[7] + r[8]; if (t > mx) mx = t; });
    segs = segs.filter((r) => r[4] + r[5] + r[6] + r[7] + r[8] >= mx * 0.001);
    const last = candles.length ? candles[candles.length - 1] : null;
    const evs = store.state.events.filter((e) => exs.includes(e.ex) && e.t >= since).slice(-4000).map((e) => [e.t, e.ex, e.side, e.price, Math.round(e.usd)]);
    const t0 = Math.min.apply(null, exs.map((ex) => (store.state.oi[ex][0] ? store.state.oi[ex][0].t : Infinity)));
    const out = {
      ok: true, mock: !!deps.mock, binSize, now: Math.floor(Date.now() / 1000), price: last ? last.c : null, lastT: last ? last.t : null,
      segs, events: evs, firstRun: store.firstRun, historyFrom: Number.isFinite(t0) ? t0 : null, since,
      status: JSON.parse(JSON.stringify(status)), weights: E.normWeights(weights), writeError: store.state.writeError || '',
    };
    return out;
  }
  return { start, stop, getMap, status: () => JSON.parse(JSON.stringify(status)), store, deps };
}
module.exports = { create, mockDeps, mockPrice };

'use strict';
// Controlador del Módulo 2. Une: fuente de datos (api), historial (store), avisos (notifier).
// Todo se inyecta, así se prueba con datos simulados. Devuelve "modelos de vista" listos para pintar.

const chain = require('../../../renderer/funciones/blockchain/chain');
const storeLib = require('./store');
const notifyLib = require('./notify');

const MAX_SEGMENTS = 24;       // tramos para la gráfica de un rango (limita las consultas)
const GENESIS_TS = 1231006505; // bloque 0 (3 ene 2009). A verificar contra la fuente al primer uso.

function msg(e) { return e && e.message ? e.message : String(e); }

// "2026-10-01" -> [inicio del día local, fin del día local] en segundos Unix, con tope en "ahora".
function dayRangeToUnix(fromYmd, toYmd, nowMs) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
  };
  const a = parse(fromYmd), b = parse(toYmd);
  if (!a || !b) return { error: 'Escriba las dos fechas completas.' };
  const from = Math.floor(new Date(a.y, a.mo, a.d, 0, 0, 0).getTime() / 1000);
  let to = Math.floor(new Date(b.y, b.mo, b.d, 23, 59, 59).getTime() / 1000);
  const nowS = Math.floor(nowMs / 1000);
  if (to > nowS) to = nowS;
  if (from >= to) return { error: 'La fecha inicial debe ser anterior a la final.' };
  if (from < GENESIS_TS) return { error: 'No hay bloques antes del 3 de enero de 2009.' };
  return { from, to };
}

function createMonitor(deps) {
  const api = deps.api;
  const store = deps.store;
  const prices = deps.prices || null;   // cliente de precios (Bitstamp). Opcional.
  const notifier = deps.notifier || (() => {});
  const now = deps.now || (() => Date.now());

  const loaded = store.load();
  let state = loaded.state;
  const startupWarning = loaded.warning;
  let last = null;       // último modelo de vista completo
  let prevStatus = null; // para decidir avisos
  let inflight = null;

  // ---- Precios (Bitstamp). Los históricos se guardan para siempre; solo "precio actual" cambia.
  async function buildPrices(ctx) {
    const out = { source: prices ? 'Bitstamp BTC/USD' : null, epochStart: null, epochPrevStart: null, now: null, eras: {}, down: false };
    if (!prices) return out;
    let down = false;
    const lookup = async (ts) => {
      if (ts == null) return null;
      const key = String(ts);
      if (state.prices[key]) return state.prices[key];
      if (down) return null;
      try {
        const r = await prices.priceAt(ts);
        if (r.price != null) {
          state.prices[key] = { price: r.price, precision: r.precision };
          return state.prices[key];
        }
        return { price: null, reason: r.reason };
      } catch (e) {
        down = true;
        ctx.errors.push({ section: 'Precios (Bitstamp)', message: msg(e) });
        return null;
      }
    };
    out.epochStart = await lookup(ctx.startTs);
    const cur = ctx.adjRows && ctx.adjRows[0] && ctx.adjRows[0].startHeight === ctx.ep.startHeight ? ctx.adjRows[1] : null;
    out.epochPrevStart = cur ? await lookup(cur.startTimestamp) : null;
    for (const r of ctx.eras) {
      const endTs = r.inProgress ? null : state.blockMarks[String((r.era + 1) * chain.HALVING)];
      out.eras[r.era] = { start: await lookup(r.startTimestamp), end: r.inProgress ? null : await lookup(endTs) };
    }
    if (!down) {
      try {
        const t = await prices.ticker();
        state.priceNow = { price: t.price, ts: t.ts, fetchedAtMs: now() };
        out.now = Object.assign({ stale: false }, state.priceNow);
      } catch (e) {
        down = true;
        ctx.errors.push({ section: 'Precios (Bitstamp)', message: msg(e) });
      }
    }
    if (!out.now && state.priceNow) out.now = Object.assign({ stale: true }, state.priceNow);
    out.down = down;
    return out;
  }

  async function buildFull(tipHeightHint) {
    const errors = [];
    const attempt = async (section, fn) => {
      try { return await fn(); } catch (e) { errors.push({ section, message: msg(e) }); return null; }
    };

    // 1) Núcleo: sin esto no hay nada que mostrar -> si falla, se propaga.
    const recent = await api.recentBlocks();
    const tip = recent[0];
    storeLib.addToLog(state, recent, now());

    // 2) Bloque de inicio del período actual.
    const ep = chain.epochProgress(tip.height);
    const startKey = String(ep.startHeight);
    let startTs = state.blockMarks[startKey];
    if (startTs == null) {
      if (tip.height === ep.startHeight) startTs = tip.timestamp;
      else {
        const b = await attempt('Período actual', () => api.blockAtHeight(ep.startHeight));
        if (b) { startTs = b.timestamp; state.blockMarks[startKey] = b.timestamp; }
      }
    }
    const startBlock = startTs != null ? { height: ep.startHeight, timestamp: startTs } : null;
    const live = chain.currentEpoch({ height: tip.height, timestamp: tip.timestamp }, startBlock);
    live.startTimestamp = startTs != null ? startTs : null;

    // 3) Historial de ajustes (una vez por período).
    if (state.adjustments.length === 0 || state.adjustmentsFetchedForEpoch !== ep.index) {
      const adj = await attempt('Historial de períodos', () => api.adjustments());
      if (adj) { state.adjustments = adj; state.adjustmentsFetchedForEpoch = ep.index; }
    }

    // 4) Marcas de tiempo de los halvings (se guardan para siempre).
    for (const h of chain.halvingHeightsNeeded(tip.height)) {
      if (state.blockMarks[String(h)] == null) {
        const b = await attempt('Eras (bloque ' + h + ')', () => api.blockAtHeight(h));
        if (b) state.blockMarks[String(h)] = b.timestamp;
      }
    }

    const tipSimple = { height: tip.height, timestamp: tip.timestamp };
    const eras = chain.eraTable(state.blockMarks, tipSimple);
    const currentEraAvg = eras.length ? eras[0].avgSeconds : null;

    // Cambio de dificultad del último ajuste (para el aviso de "nuevo período").
    const adjRows = chain.epochTable(state.adjustments, live);
    const lastChange = adjRows.length && adjRows[0].startHeight === ep.startHeight ? adjRows[0].changeFromPrev : null;

    const view = {
      ok: true,
      source: api.source,
      baseUrl: api.baseUrl,
      fetchedAtMs: now(),
      warning: startupWarning,
      tip: tipSimple,
      difficulty: tip.difficulty,
      epoch: live,
      epochs: adjRows,
      eras,
      halving: chain.nextHalving(tipSimple, currentEraAvg),
      recent: storeLib.recentWithIntervals(state, 15),
      settings: state.settings,
      errors,
    };

    // 5) Precios de Bitstamp (si fallan, el resto sigue y se avisa).
    view.prices = await buildPrices({ tip, startTs, adjRows, ep, eras, errors });

    // 6) Guardar datos y la última pantalla completa (para verla sin conexión).
    state.lastView = Object.assign({}, view, { errors: [], warning: null, cached: false });
    try { store.save(state); } catch (e) { errors.push({ section: 'Historial local', message: 'No se pudo guardar: ' + msg(e) }); }

    // 7) Avisos.
    const status = { height: tip.height, epochIndex: ep.index, blocksRemaining: ep.blocksRemaining };
    const alerts = notifyLib.decide(prevStatus, status, state.settings, { lastChange });
    prevStatus = status;
    if (alerts.length) { try { notifier(alerts); } catch (_) { /* un aviso fallido no debe tumbar el monitor */ } }

    return view;
  }

  // Pantalla reconstruida SOLO con lo que ya está guardado en el equipo (sin red).
  // Sirve cuando no hay "última pantalla" pero sí bloques, marcas e historial vistos antes (por ejemplo, de la v0.3).
  function viewFromState() {
    const log = state.blockLog;
    if (!log.length) return null;
    const lastE = log[log.length - 1];
    const tip = { height: lastE.h, timestamp: lastE.ts };
    const ep = chain.epochProgress(tip.height);
    const startTs = state.blockMarks[String(ep.startHeight)];
    const live = chain.currentEpoch(tip, startTs != null ? { height: ep.startHeight, timestamp: startTs } : null);
    live.startTimestamp = startTs != null ? startTs : null;
    const eras = chain.eraTable(state.blockMarks, tip);
    const cp = (ts) => (ts != null && state.prices[String(ts)]) || null;
    const priceEras = {};
    for (const r of eras) {
      priceEras[r.era] = { start: cp(r.startTimestamp), end: r.inProgress ? null : cp(state.blockMarks[String((r.era + 1) * chain.HALVING)]) };
    }
    return {
      ok: true, cached: true, rebuilt: true,
      source: api.source, baseUrl: api.baseUrl,
      fetchedAtMs: lastE.seen || now(),
      warning: startupWarning,
      tip, difficulty: null,
      epoch: live,
      epochs: chain.epochTable(state.adjustments, live),
      eras,
      halving: chain.nextHalving(tip, eras.length ? eras[0].avgSeconds : null),
      recent: storeLib.recentWithIntervals(state, 15),
      settings: state.settings,
      errors: [],
      prices: { source: prices ? 'Bitstamp BTC/USD' : null, epochStart: cp(startTs), epochPrevStart: null, now: state.priceNow ? Object.assign({ stale: true }, state.priceNow) : null, eras: priceEras, down: false },
    };
  }

  // Última pantalla guardada en el equipo (sirve para mostrar algo al instante, aunque no haya conexión).
  function cachedView() {
    if (state.lastView) return Object.assign({}, state.lastView, { ok: true, cached: true, errors: [], warning: startupWarning, settings: state.settings });
    return viewFromState();
  }

  // Consulta la fuente. Si la altura no cambió, no repite la descarga pesada (salvo force).
  async function refresh(force) {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const h = await api.tipHeight();
        if (!force && last && last.tip.height === h) {
          last = Object.assign({}, last, { fetchedAtMs: now() });
          return last;
        }
        last = await buildFull(h);
        return last;
      } catch (e) {
        // La fuente falló: se avisa; se conservan los últimos datos buenos, marcados como viejos.
        return {
          ok: false,
          source: api.source,
          error: msg(e),
          warning: startupWarning,
          stale: last || cachedView(),
          settings: state.settings,
          failedAtMs: now(),
        };
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  // Promedio de velocidad entre dos instantes (segundos Unix), más la evolución por tramos.
  // Los tramos se miden con hasta MAX_SEGMENTS+1 consultas a la fuente (bloque más cercano a cada instante).
  async function rangeAverage(fromSec, toSec) {
    try {
      const [a, b] = await Promise.all([api.blockAtTime(fromSec), api.blockAtTime(toSec)]);
      const r = chain.rangeAverage(a, b);
      if (!r) return { ok: false, error: 'Ese rango es demasiado corto: ambos extremos caen en el mismo bloque.' };
      let series = null, stats = null, seriesError = null;
      const n = Math.min(MAX_SEGMENTS, Math.floor(r.blocks / 6));
      if (n >= 4) {
        try {
          const times = [];
          for (let i = 1; i < n; i++) times.push(Math.floor(r.fromBlock.timestamp + ((r.toBlock.timestamp - r.fromBlock.timestamp) * i) / n));
          const mids = [];
          for (let i = 0; i < times.length; i += 6) mids.push(...await Promise.all(times.slice(i, i + 6).map((t) => api.blockAtTime(t))));
          series = chain.segmentsFromSamples([r.fromBlock].concat(mids, [r.toBlock]));
          stats = chain.segmentStats(series);
          if (!stats) series = null;
        } catch (e) { seriesError = msg(e); series = null; stats = null; }
      }
      return { ok: true, range: r, series, stats, seriesError, source: api.source };
    } catch (e) {
      return { ok: false, error: msg(e) };
    }
  }

  function getSettings() { return state.settings; }

  function setSettings(partial) {
    state.settings = storeLib.normalizeSettings(Object.assign({}, state.settings, partial));
    try { store.save(state); } catch (_) { /* se reintenta en el próximo guardado */ }
    if (last) last = Object.assign({}, last, { settings: state.settings });
    return state.settings;
  }

  return { refresh, rangeAverage, getSettings, setSettings, cachedView };
}

module.exports = { createMonitor, dayRangeToUnix, GENESIS_TS };

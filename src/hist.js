// Datos históricos PROPIOS (v0.23.5): velas de 1 minuto y funding de Binance Futuros (BTCUSDT), guardados para siempre en data/hist/.
// - Velas 1 m: un archivo por mes (klines1m-AAAA-MM.jsonl, filas [t, o, h, l, c, volumen]); hacia adelante cada 5 min y hacia atrás
//   (relleno poco a poco, sin saturar a Binance) hasta `backfillDays` días.
// - Funding: funding-binance.jsonl (filas [t, tasa, precio de referencia]); el historial completo son pocas consultas.
// Si una fuente falla, el error queda en el estado (nunca se sustituye en silencio) y se reintenta en el siguiente ciclo.
'use strict';
const fs = require('fs');
const path = require('path');

const SYMBOL = 'BTCUSDT';
const MIN = 60;
const POLL_MS = 5 * 60 * 1000;
const FUNDING_GENESIS_MS = Date.UTC(2019, 8, 10);
const monthOf = (t) => new Date(t * 1000).toISOString().slice(0, 7);
const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

function realDeps() {
  const getJson = async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (res.status === 429 || res.status === 418) throw new Error('Binance pidió ir más despacio (' + res.status + ')');
    if (!res.ok) throw new Error('Binance respondió ' + res.status);
    return res.json();
  };
  return {
    mock: false,
    klines: (startMs, endMs) => getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${SYMBOL}&interval=1m&limit=1000&startTime=${startMs}` + (endMs ? `&endTime=${endMs}` : '')),
    funding: (startMs) => getJson(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${SYMBOL}&limit=1000&startTime=${startMs}`),
    sleep: sleepReal,
  };
}
function mockDeps() {
  const price = (tMs) => require('./core').mockPrice(SYMBOL, tMs);
  return {
    mock: true,
    klines: async (startMs, endMs) => {
      const out = []; const first = Math.ceil(startMs / 60000) * 60000; const stop = Math.min(endMs || Infinity, Date.now());
      for (let t = first; t < stop && out.length < 1000; t += 60000) { const o = price(t), c = price(t + 60000); out.push([t, o, Math.max(o, c) * 1.0004, Math.min(o, c) * 0.9996, c, 10 + (t / 60000) % 7]); }
      return out;
    },
    funding: async (startMs) => { const out = []; for (let t = Math.ceil(startMs / 28800000) * 28800000; t < Date.now() && out.length < 1000; t += 28800000) out.push({ fundingTime: t, fundingRate: String(0.0001 * Math.sin(t / 5e8)), markPrice: String(price(t)) }); return out; },
    sleep: () => sleepReal(5),          // cede el turno para no bloquear el programa mientras se simula
  };
}

function create(opt) {
  const dir = opt.dir;
  const deps = opt.deps || (opt.mock ? mockDeps() : realDeps());
  const backfillDays = opt.backfillDays || (opt.mock ? 20 : 365);
  const sleep = deps.sleep || sleepReal;
  fs.mkdirSync(dir, { recursive: true });
  const kFile = (m) => path.join(dir, `klines1m-${m}.jsonl`);
  const fFile = path.join(dir, 'funding-binance.jsonl');
  const meta = { k: { from: null, to: null, rows: 0 }, f: { from: null, to: null, rows: 0 } };
  const status = { klines: { state: 'cargando', err: '', backfilling: false }, funding: { state: 'cargando', err: '' } };
  let stopped = false, pollT = null, running = false;

  const readRows = (file) => { try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter((r) => r && Number.isFinite(r[0])); } catch (e) { return []; } };
  const writeRows = (file, rows) => { fs.writeFileSync(file + '.tmp', rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); fs.renameSync(file + '.tmp', file); };
  const mergeInto = (file, rows) => {                  // une por tiempo (lo nuevo pisa a lo viejo) y guarda ordenado
    const m = new Map(readRows(file).map((r) => [r[0], r]));
    rows.forEach((r) => m.set(r[0], r));
    const all = Array.from(m.values()).sort((a, b) => a[0] - b[0]);
    writeRows(file, all);
    return all;
  };
  function scan() {
    const files = fs.readdirSync(dir).filter((f) => /^klines1m-\d{4}-\d{2}\.jsonl$/.test(f)).sort();
    meta.k = { from: null, to: null, rows: 0 };
    files.forEach((f) => { const r = readRows(path.join(dir, f)); if (!r.length) return; meta.k.rows += r.length; if (meta.k.from === null) meta.k.from = r[0][0]; meta.k.to = r[r.length - 1][0]; });
    const fr = readRows(fFile);
    meta.f = { from: fr.length ? fr[0][0] : null, to: fr.length ? fr[fr.length - 1][0] : null, rows: fr.length };
  }
  function saveKlines(rows) {                           // rows: formato Binance [openTime ms, o, h, l, c, v, ...]
    const by = {};
    rows.forEach((r) => { const t = Math.floor(r[0] / 1000); (by[monthOf(t)] = by[monthOf(t)] || []).push([t, +r[1], +r[2], +r[3], +r[4], +r[5]]); });
    Object.keys(by).forEach((m) => mergeInto(kFile(m), by[m]));
    scan();
  }
  async function forward() {
    const now = Date.now();
    let start = meta.k.to !== null ? (meta.k.to + MIN) * 1000 : now - 2 * 86400000;
    for (let g = 0; g < 400 && !stopped && start < now - 60000; g++) {
      const rows = await deps.klines(start);
      if (!Array.isArray(rows) || !rows.length) break;
      saveKlines(rows);
      start = rows[rows.length - 1][0] + 60000;
      if (rows.length < 1000) break;
      await sleep(250);
    }
  }
  async function backward() {
    const target = Date.now() - backfillDays * 86400000;
    status.klines.backfilling = true;
    try {
      for (let g = 0; g < 400 && !stopped; g++) {
        const have = meta.k.from === null ? Date.now() : meta.k.from * 1000;
        if (have <= target + 60000) break;
        const start = Math.max(target, have - 1000 * 60000);
        const rows = await deps.klines(start, have - 60000);
        if (!Array.isArray(rows) || !rows.length) break;
        saveKlines(rows);
        if (meta.k.from * 1000 >= have) break;          // no avanzó: se acaba (la fuente no tiene más hacia atrás)
        await sleep(300);
      }
    } finally { status.klines.backfilling = meta.k.from !== null && meta.k.from * 1000 > target + 120000 && !stopped; }
  }
  async function fundingSync() {
    let start = meta.f.to !== null ? (meta.f.to + 1) * 1000 : FUNDING_GENESIS_MS;
    for (let g = 0; g < 60 && !stopped; g++) {
      const rows = await deps.funding(start);
      if (!Array.isArray(rows) || !rows.length) break;
      mergeInto(fFile, rows.map((r) => [Math.floor(r.fundingTime / 1000), +r.fundingRate, +r.markPrice]));
      scan();
      start = rows[rows.length - 1].fundingTime + 1;
      if (rows.length < 1000) break;
      await sleep(250);
    }
  }
  async function cycle() {
    if (running) return;
    running = true;
    try {
      try { await forward(); status.klines.err = ''; status.klines.state = meta.k.rows ? 'ok' : 'error'; }
      catch (e) { status.klines.err = 'Velas de 1 minuto: ' + e.message; status.klines.state = meta.k.rows ? 'aviso' : 'error'; }
      try { await fundingSync(); status.funding.err = ''; status.funding.state = meta.f.rows ? 'ok' : 'error'; }
      catch (e) { status.funding.err = 'Funding: ' + e.message; status.funding.state = meta.f.rows ? 'aviso' : 'error'; }
      try { await backward(); } catch (e) { status.klines.err = 'Relleno hacia atrás: ' + e.message; if (status.klines.state === 'ok') status.klines.state = 'aviso'; }
    } finally { running = false; }
  }
  async function start() {
    scan();
    await cycle();
    if (!stopped) { pollT = setInterval(() => { cycle(); }, POLL_MS); if (pollT.unref) pollT.unref(); }
  }
  function stop() { stopped = true; clearInterval(pollT); }
  const sizeOf = (re) => { let b = 0; try { fs.readdirSync(dir).filter((f) => re.test(f)).forEach((f) => { b += fs.statSync(path.join(dir, f)).size; }); } catch (e) { /* nada */ } return b; };
  function getStatus() {
    return {
      klines: Object.assign({ name: 'Velas de 1 minuto (Binance Futuros BTCUSDT)', from: meta.k.from, to: meta.k.to, rows: meta.k.rows, bytes: sizeOf(/^klines1m-/), targetDays: backfillDays }, status.klines),
      funding: Object.assign({ name: 'Funding (Binance Futuros BTCUSDT)', from: meta.f.from, to: meta.f.to, rows: meta.f.rows, bytes: sizeOf(/^funding-/) }, status.funding),
    };
  }
  return { start, stop, cycle, status: getStatus, scan, _meta: meta };
}
module.exports = { create, SYMBOL };

// Núcleo de datos: cliente de Binance (con respaldo) y modo de datos simulados.
// Lo usan tanto la app de escritorio (main.js) como el modo navegador (server.js).
'use strict';

const HOSTS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://data-api.binance.vision',
];

const MOCK = () => process.env.TV_MOCK === '1';

const IV_MS = {
  '1s': 1000, '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000,
  '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '8h': 28800000,
  '12h': 43200000, '1d': 86400000, '1w': 604800000,
};
const VALID_INTERVALS = Object.keys(IV_MS).concat(['1M']);
const WEEK_OFFSET = 345600000; // las velas semanales de Binance abren el lunes 00:00 UTC
const GENESIS = Date.UTC(2017, 7, 17);

const FUTURES_HOSTS = ['https://fapi.binance.com'];

// ---------- Otros exchanges (v0.11): Bybit y KuCoin, solo spot ----------
// Todos devuelven las velas en el mismo formato de Binance: [tiempoMs, apertura, máximo, mínimo, cierre, volumen].
const EXCHANGE_IDS = ['binance', 'bybit', 'kucoin', 'bitstamp'];
const EX_HOSTS = {
  bybit: ['https://api.bybit.com', 'https://api.bytick.com'],
  kucoin: ['https://api.kucoin.com'],
  bitstamp: ['https://www.bitstamp.net'],
};
// Bitstamp (v0.12): velas por "step" en segundos; no tiene 1 s, 8 h, 1 semana ni 1 mes (se arman desde las de 1 día o menores).
const BITSTAMP_STEP = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '12h': 43200, '1d': 86400 };
const BYBIT_IV = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720', '1d': 'D', '1w': 'W', '1M': 'M' };
const KUCOIN_IV = { '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1hour', '2h': '2hour', '4h': '4hour', '6h': '6hour', '8h': '8hour', '12h': '12hour', '1d': '1day', '1w': '1week', '1M': '1month' };
const MONTH_MS = 31 * 86400000;
const ivMs = (iv) => (iv === '1M' ? MONTH_MS : IV_MS[iv]);

// Bybit: lista en orden descendente de [inicioMs, a, máx, mín, c, vol, turnover].
function parseBybitKlines(json) {
  if (!json || Number(json.retCode) !== 0) throw new Error('Bybit: ' + ((json && json.retMsg) || 'respuesta no válida'));
  const list = (json.result && json.result.list) || [];
  return list.map((r) => [Number(r[0]), r[1], r[2], r[3], r[4], r[5]]).sort((a, b) => a[0] - b[0]);
}
// Bitstamp: { data: { pair, ohlc: [{ timestamp (s), open, high, low, close, volume }] } } en orden ascendente.
function parseBitstampKlines(json) {
  if (!json || !json.data || !Array.isArray(json.data.ohlc)) {
    const why = json && (json.reason || (json.errors && JSON.stringify(json.errors)) || json.message);
    throw new Error('Bitstamp: ' + (why || 'respuesta no válida'));
  }
  return json.data.ohlc.map((r) => [Number(r.timestamp) * 1000, r.open, r.high, r.low, r.close, r.volume]).sort((a, b) => a[0] - b[0]);
}
// KuCoin: lista en orden descendente de [segundos, apertura, CIERRE, máximo, mínimo, volumen, turnover] (ojo: el cierre va antes que el máximo).
function parseKucoinKlines(json) {
  if (!json || String(json.code) !== '200000') throw new Error('KuCoin: ' + ((json && json.msg) || 'respuesta no válida'));
  return (json.data || []).map((r) => [Number(r[0]) * 1000, r[1], r[3], r[4], r[2], r[5]]).sort((a, b) => a[0] - b[0]);
}

// Control de peticiones (v0.22): TODAS las ventanas piden datos por aquí, así que se reparten con un solo control:
// máximo de pedidos a la vez por servidor, peticiones iguales en curso compartidas y reintento con espera si el exchange pide ir más despacio.
const MAX_PARALLEL = 6;
const slots = {};          // host -> { active, waiting: [] }
function acquire(host) {
  const sl = slots[host] || (slots[host] = { active: 0, waiting: [] });
  if (sl.active < MAX_PARALLEL) { sl.active++; return Promise.resolve(); }
  return new Promise((resolve) => sl.waiting.push(resolve));
}
function release(host) {
  const sl = slots[host];
  const next = sl.waiting.shift();
  if (next) next(); else sl.active--;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRIES = 3;
const pending = new Map();

async function fetchOnce(host, path, qs) {
  await acquire(host);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let res;
    try { res = await fetch(`${host}${path}${qs ? '?' + qs : ''}`, { signal: ctrl.signal }); } finally { clearTimeout(timer); }
    const exName = host.includes('bybit') || host.includes('bytick') ? 'Bybit' : host.includes('kucoin') ? 'KuCoin' : host.includes('bitstamp') ? 'Bitstamp' : 'Binance';
    if (res.status === 429 || res.status === 418) {
      const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
      const e = new Error(`${exName} pidió ir más despacio (límite de peticiones). Espera un momento.`);
      e.retryMs = ra > 0 ? Math.min(ra * 1000, 8000) : 0; e.transient = true;
      throw e;
    }
    if (!res.ok) { const e = new Error(`${exName} respondió ${res.status}`); e.transient = res.status >= 500; throw e; }
    return await res.json();
  } finally { release(host); }
}

async function httpGetRaw(path, params, hosts) {
  const qs = new URLSearchParams(params || {}).toString();
  let lastErr = null;
  for (const host of hosts || HOSTS) {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try { return await fetchOnce(host, path, qs); } catch (e) {
        lastErr = e;
        const transient = e.transient;                       // solo límite de peticiones y errores 5xx; un fallo de red pasa de inmediato al siguiente servidor
        if (!transient || attempt === RETRIES) break;
        await sleep(e.retryMs || 700 * Math.pow(2, attempt));   // 0,7 s, 1,4 s, 2,8 s
      }
    }
  }
  const hs = (hosts || HOSTS)[0] || '';
  throw new Error('No se pudo conectar con ' + (hs.includes('bybit') ? 'Bybit' : hs.includes('kucoin') ? 'KuCoin' : hs.includes('bitstamp') ? 'Bitstamp' : 'Binance') + ': ' + (lastErr && lastErr.message ? lastErr.message : lastErr));
}

function httpGet(path, params, hosts) {
  const key = (hosts || HOSTS).join(',') + path + '?' + new URLSearchParams(params || {}).toString();
  if (pending.has(key)) return pending.get(key);
  const p = httpGetRaw(path, params, hosts);
  pending.set(key, p);
  const done = () => pending.delete(key);
  p.then(done, done);
  return p;
}

// ---------- Datos simulados (solo para pruebas sin internet) ----------
function hash(n) {
  let x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
function symSeed(symbol) {
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  return h;
}
function mockPrice(symbol, t) {
  const s = symSeed(symbol);
  const base = 50 + (s % 900) * (symbol.startsWith('BTC') ? 60 : 1);
  const d = 86400000;
  return base * Math.exp(
    0.35 * Math.sin(t / (d * 230) + s) +
    0.12 * Math.sin(t / (d * 17) + 1) +
    0.02 * Math.sin(t / (3600000 * 9) + 2) +
    0.0015 * Math.sin(t / 180000)
  );
}
function alignMock(interval, t) {
  if (interval === '1M') {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  const iv = IV_MS[interval];
  if (interval === '1w') return Math.floor((t - WEEK_OFFSET) / iv) * iv + WEEK_OFFSET;
  return Math.floor(t / iv) * iv;
}
function nextMock(interval, t) {
  if (interval === '1M') {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return t + IV_MS[interval];
}
function prevMock(interval, t) {
  if (interval === '1M') {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
  }
  return t - IV_MS[interval];
}
function mockCandle(symbol, interval, t) {
  const now = Date.now();
  const end = Math.min(nextMock(interval, t), now);
  const o = mockPrice(symbol, t);
  const c = mockPrice(symbol, end);
  const h = Math.max(o, c) * (1 + 0.004 * hash(t + 1));
  const l = Math.min(o, c) * (1 - 0.004 * hash(t + 2));
  const v = 100 * (1 + hash(t + 3));
  // Como Binance: [apertura, o, h, l, c, volumen, cierre, volumen en dólares, operaciones, volumen de compra agresiva, ...]
  const buy = v * (0.3 + 0.4 * hash(t + 4));
  return [t, String(o), String(h), String(l), String(c), String(v), t + 1, String(v * o), 100, String(buy), String(buy * o), '0'];
}
function mockKlines({ symbol, interval, startTime, endTime, limit }) {
  const lim = Math.min(Number(limit) || 500, 1000);
  const now = Date.now();
  const out = [];
  if (startTime !== undefined && startTime !== '') {
    let t = alignMock(interval, Math.max(Number(startTime), GENESIS));
    while (out.length < lim && t <= now) {
      out.push(mockCandle(symbol, interval, t));
      t = nextMock(interval, t);
    }
    return out;
  }
  let t = alignMock(interval, Math.min(endTime !== undefined && endTime !== '' ? Number(endTime) : now, now));
  while (out.length < lim && t >= GENESIS) {
    out.unshift(mockCandle(symbol, interval, t));
    t = prevMock(interval, t);
  }
  return out;
}
const MOCK_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'TRXUSDT', 'RAYUSDT', 'DOGEUSDT', 'ADAUSDT', 'LINKUSDT'];

// ---------- Operaciones (aggTrades) para velas por volumen ----------
// Simulación: 5 operaciones por segundo, con ids consecutivos desde una fecha fija.
const MOCK_T0 = Date.UTC(2024, 0, 1);
const MOCK_STEP = 200; // ms entre operaciones simuladas
function mockTrade(symbol, id) {
  const t = MOCK_T0 + id * MOCK_STEP;
  const h = hash(id * 1.37 + symSeed(symbol));
  const qty = Math.round((0.02 + 1.2 * h * h * h + (hash(id + 9) > 0.995 ? 25 : 0)) * 1000) / 1000;
  const price = Math.round(mockPrice(symbol, t) * (1 + 0.0006 * (hash(id + 5) - 0.5)) * 100) / 100;
  return [id, price, qty, t];
}
function mockAggTrades({ symbol, fromId, limit }) {
  const lim = Math.min(Number(limit) || 500, 1000);
  const maxId = Math.floor((Date.now() - MOCK_T0) / MOCK_STEP);
  let start = fromId !== undefined && fromId !== '' ? Number(fromId) : maxId - lim + 1;
  start = Math.max(0, start);
  const rows = [];
  for (let id = start; id < start + lim && id <= maxId; id++) rows.push(mockTrade(symbol, id));
  return rows;
}

const tradeCache = new Map();
function cachedTrades(key, fn) {
  const hit = tradeCache.get(key);
  const now = Date.now();
  if (hit && now - hit.t < 1000) return hit.p;
  const p = fn();
  tradeCache.set(key, { t: now, p });
  p.catch(() => tradeCache.delete(key));
  if (tradeCache.size > 200) {
    for (const [k, v] of tradeCache) if (now - v.t > 5000) tradeCache.delete(k);
  }
  return p;
}
const parseTrade = (x) => [Number(x.a), parseFloat(x.p), parseFloat(x.q), Number(x.T)];

// Devuelve { market: 'futures'|'spot', rows: [[id, precio, cantidad, tiempoMs], ...] }
async function aggTrades({ symbol, fromId, limit, market }) {
  if (!/^[A-Z0-9]{3,20}$/.test(String(symbol))) throw new Error('Símbolo inválido');
  const lim = Math.min(Number(limit) || 1000, 1000);
  const hasFrom = fromId !== undefined && fromId !== null && fromId !== '';
  if (MOCK()) return { market: 'futures', rows: mockAggTrades({ symbol, fromId: hasFrom ? Number(fromId) : undefined, limit: lim }) };
  const params = { symbol, limit: String(lim) };
  if (hasFrom) params.fromId = String(Math.max(0, Math.floor(Number(fromId))));
  const order = market === 'spot' ? ['spot'] : market === 'futures' ? ['futures'] : ['futures', 'spot'];
  let lastErr = null;
  for (const m of order) {
    try {
      const key = `${m}|${symbol}|${params.fromId || 'last'}|${lim}`;
      const rows = await cachedTrades(key, async () => {
        const raw = m === 'futures'
          ? await httpGet('/fapi/v1/aggTrades', params, FUTURES_HOSTS)
          : await httpGet('/api/v3/aggTrades', params);
        return raw.map(parseTrade);
      });
      return { market: m, rows };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Sin datos de operaciones');
}

// ---------- API pública del núcleo ----------
const hasVal = (v) => v !== undefined && v !== null && v !== '';

async function klinesBybit({ symbol, interval, startTime, endTime, limit }) {
  const iv = BYBIT_IV[interval];
  if (!iv) throw new Error(`Bybit no ofrece velas de ${interval}.`);
  const lim = Math.min(Number(limit) || 500, 1000);
  const p = { category: 'spot', symbol, interval: iv, limit: String(lim) };
  // Bybit pide inicio y fin juntos: si falta uno se calcula con el tamaño de la vela.
  if (hasVal(startTime)) {
    p.start = String(Math.floor(Number(startTime)));
    p.end = String(hasVal(endTime) ? Math.floor(Number(endTime)) : Math.floor(Number(startTime)) + lim * ivMs(interval));
  } else if (hasVal(endTime)) p.end = String(Math.floor(Number(endTime)));
  const json = await httpGet('/v5/market/kline', p, EX_HOSTS.bybit);
  return parseBybitKlines(json).slice(0, lim);
}
async function klinesKucoin({ symbol, interval, startTime, endTime, limit }) {
  const iv = KUCOIN_IV[interval];
  if (!iv) throw new Error(`KuCoin no ofrece velas de ${interval}.`);
  const lim = Math.min(Number(limit) || 500, 1000);
  const native = await nativeSymbol('kucoin', symbol);
  const span = (hasVal(startTime) ? lim : Math.max(lim, 1000)) * ivMs(interval); // sin inicio se mira una ventana amplia hacia atrás
  let a, b;
  if (hasVal(startTime)) { a = Math.floor(Number(startTime)); b = hasVal(endTime) ? Math.floor(Number(endTime)) : a + span; }
  else { b = hasVal(endTime) ? Math.floor(Number(endTime)) : Date.now(); a = b - span; }
  const p = { symbol: native, type: iv, startAt: String(Math.max(0, Math.floor(a / 1000))), endAt: String(Math.floor(b / 1000)) };
  const json = await httpGet('/api/v1/market/candles', p, EX_HOSTS.kucoin);
  const rows = parseKucoinKlines(json);
  // KuCoin entrega las más recientes primero: si hay más de las pedidas, se conservan las del extremo pedido.
  return hasVal(startTime) ? rows.slice(0, lim) : rows.slice(-lim);
}

// Primera vela que existe en Bitstamp para ese activo y paso (se pide desde el año 0: devuelve la más antigua). Se guarda en memoria.
const bitstampFirstCache = {};
async function bitstampFirst(native, step) {
  const key = native + '|' + step;
  if (bitstampFirstCache[key] !== undefined) return bitstampFirstCache[key];
  // v0.22.18: el inicio se saca SIEMPRE de las velas de 1 día (es el dato fiable: 15/08/2011 en BTCUSD). Antes se probaba con el paso pedido
  // (1 h, 3 h...) y si Bitstamp contestaba con una vela más reciente, el gráfico creía que el historial ya se había acabado y dejaba de ir atrás.
  let first = null;
  const json = await httpGet(`/api/v2/ohlc/${native}/`, { step: '86400', limit: '1', start: '0' }, EX_HOSTS.bitstamp);
  const rows = parseBitstampKlines(json);
  if (rows.length) first = rows[0];
  if (first) bitstampFirstCache[key] = first;      // si no se pudo saber, no se guarda (se vuelve a intentar)
  return first;
}

async function klinesBitstamp({ symbol, interval, startTime, endTime, limit, probe }) {
  const step = BITSTAMP_STEP[interval];
  if (!step) throw new Error(`Bitstamp no ofrece velas de ${interval}.`);
  const lim = Math.min(Number(limit) || 500, 1000);
  const native = await nativeSymbol('bitstamp', symbol);
  // Sondeo "¿hay velas más antiguas?": Bitstamp NO tiene velas en los minutos/horas sin operaciones, así que una ventana vacía
  // no significa que se acabó el historial. Se compara con la primera vela real del activo.
  if (probe) {
    const first = await bitstampFirst(native, step);
    const end = hasVal(endTime) ? Number(endTime) : Date.now();
    return first && first[0] <= end ? [first] : [];
  }
  // Bitstamp trabaja en segundos; se pide una ventana de exactamente "limit" velas.
  let a, b;
  if (hasVal(startTime)) { a = Math.ceil(Number(startTime) / 1000); b = hasVal(endTime) ? Math.floor(Number(endTime) / 1000) : a + lim * step; }
  else { b = hasVal(endTime) ? Math.floor(Number(endTime) / 1000) : Math.floor(Date.now() / 1000); a = b - lim * step; }
  const p = { step: String(step), limit: String(lim), start: String(Math.max(0, a)), end: String(b) };
  const json = await httpGet(`/api/v2/ohlc/${native}/`, p, EX_HOSTS.bitstamp);
  const rows = parseBitstampKlines(json);
  return hasVal(startTime) ? rows.slice(0, lim) : rows.slice(-lim);
}

// ---------- Velas desde operaciones reales (v0.18) ----------
const trades = require('./trades');
let tradeStore = null, tradeDir = null;
function setDataDir(dir) { tradeDir = dir; }
function getTradeStore() {
  if (!tradeStore) {
    const path = require('path');
    const dir = path.join(tradeDir || path.join(__dirname, '..', 'data'), 'trades' + (MOCK() ? '-simulado' : ''), 'BTCUSDT');
    tradeStore = trades.createStore({ dir, deps: MOCK() ? trades.mockDeps() : trades.realDeps() });
  }
  return tradeStore;
}
function tradeStatus() { return getTradeStore().status(); }
// Mapa de liquidaciones (v0.23): servicio en src/liq/. Arranca con el programa para ir guardando memoria.
let liqSvc = null;
function getLiq() {
  const path = require('path');
  if (!liqSvc) {
    liqSvc = require('./liq').create({ dir: path.join(tradeDir || path.join(__dirname, '..', 'data'), 'liq' + (MOCK() ? '-simulado' : '')), mock: MOCK() });
    liqSvc.start().catch(() => {});
  }
  return liqSvc;
}
function liqStart() { try { getLiq(); } catch (e) { /* el aviso lo da liqMap */ } }
async function liqMap(p) { return getLiq().getMap(p); }
function shutdown() { if (tradeStore) tradeStore.shutdown(); if (liqSvc) liqSvc.stop(); }

async function klines({ exchange, symbol, interval, startTime, endTime, limit, minQty, maxQty, mode, days, probe }) {
  if (exchange === 'bnftrades') return getTradeStore().bars({ symbol, interval, startTime, endTime, limit, minQty, maxQty, mode, days });
  const ex = exchange || 'binance';
  if (!EXCHANGE_IDS.includes(ex)) throw new Error('Exchange no válido');
  if (!/^[A-Z0-9]{3,20}$/.test(String(symbol))) throw new Error('Símbolo inválido');
  if (!VALID_INTERVALS.includes(interval)) throw new Error('Intervalo inválido');
  if (MOCK()) return mockKlines({ symbol, interval, startTime, endTime, limit });
  if (ex === 'bybit') return klinesBybit({ symbol, interval, startTime, endTime, limit });
  if (ex === 'kucoin') return klinesKucoin({ symbol, interval, startTime, endTime, limit });
  if (ex === 'bitstamp') return klinesBitstamp({ symbol, interval, startTime, endTime, limit, probe: probe === true || probe === 'true' || probe === '1' });
  const p = { symbol, interval, limit: String(Math.min(Number(limit) || 500, 1000)) };
  if (hasVal(startTime)) p.startTime = String(Math.floor(Number(startTime)));
  if (hasVal(endTime)) p.endTime = String(Math.floor(Number(endTime)));
  return httpGet('/api/v3/klines', p);
}

const symbolCache = {};
async function symbols(arg) {
  const ex = (arg && arg.exchange) || 'binance';
  if (!EXCHANGE_IDS.includes(ex)) throw new Error('Exchange no válido');
  if (symbolCache[ex]) return symbolCache[ex];
  if (MOCK()) {
    if (ex === 'bitstamp') return (symbolCache[ex] = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'LTCUSD', 'ADAUSD', 'DOGEUSD', 'LINKUSD', 'ETHBTC', 'BTCEUR'].map((s) => ({ symbol: s, base: s.slice(0, -3), quote: s.slice(-3), native: s.toLowerCase() })));
    const list = MOCK_SYMBOLS.filter((s) => !(ex === 'bybit' && s === 'RAYUSDT') && !(ex === 'kucoin' && s === 'BNBUSDT'));
    return (symbolCache[ex] = list.map((s) => ({ symbol: s, base: s.replace('USDT', ''), quote: 'USDT' })));
  }
  let list;
  if (ex === 'bybit') {
    list = [];
    let cursor = '';
    for (let i = 0; i < 10; i++) {
      const p = { category: 'spot', limit: '1000' };
      if (cursor) p.cursor = cursor;
      const json = await httpGet('/v5/market/instruments-info', p, EX_HOSTS.bybit);
      if (Number(json.retCode) !== 0) throw new Error('Bybit: ' + json.retMsg);
      (json.result.list || []).forEach((x) => { if (x.status === 'Trading') list.push({ symbol: x.symbol, base: x.baseCoin, quote: x.quoteCoin }); });
      cursor = json.result.nextPageCursor || '';
      if (!cursor) break;
    }
  } else if (ex === 'bitstamp') {
    const json = await httpGet('/api/v2/trading-pairs-info/', {}, EX_HOSTS.bitstamp);
    if (!Array.isArray(json)) throw new Error('Bitstamp: ' + ((json && (json.reason || json.message)) || 'respuesta no válida'));
    list = json.filter((x) => x.trading === 'Enabled' && /^[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(String(x.name)))
      .map((x) => { const [b2, q2] = x.name.split('/'); return { symbol: (b2 + q2).toUpperCase(), base: b2.toUpperCase(), quote: q2.toUpperCase(), native: x.url_symbol }; });
  } else if (ex === 'kucoin') {
    const json = await httpGet('/api/v2/symbols', {}, EX_HOSTS.kucoin);
    if (String(json.code) !== '200000') throw new Error('KuCoin: ' + (json.msg || 'respuesta no válida'));
    list = json.data.filter((x) => x.enableTrading).map((x) => ({ symbol: x.baseCurrency + x.quoteCurrency, base: x.baseCurrency, quote: x.quoteCurrency, native: x.symbol }));
  } else {
    const info = await httpGet('/api/v3/exchangeInfo');
    list = info.symbols
      .filter((s) => s.status === 'TRADING' && s.isSpotTradingAllowed)
      .map((s) => ({ symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset }));
  }
  return (symbolCache[ex] = list);
}
// Nombre de un símbolo en el formato del exchange (KuCoin usa BTC-USDT).
async function nativeSymbol(ex, symbol) {
  if (ex !== 'kucoin' && ex !== 'bitstamp') return symbol;
  const list = await symbols({ exchange: ex });
  const f = list.find((x) => x.symbol === symbol);
  if (!f) throw new Error(`${ex === 'kucoin' ? 'KuCoin' : 'Bitstamp'} no tiene el activo ${symbol}.`);
  return f.native;
}

// ---------- Precios actuales y cambio de 24 h (listas de seguimiento) ----------
function mockTickers(syms) {
  const now = Date.now();
  const out = {};
  syms.forEach((s) => {
    const p = mockPrice(s, now), q = mockPrice(s, now - 86400000);
    out[s] = { price: p, pct: ((p - q) / q) * 100 };
  });
  return out;
}
const tickerCache = {};
// Devuelve { SÍMBOLO: { price, pct } } de los símbolos pedidos; los que el exchange no conoce simplemente no aparecen.
async function tickers({ exchange, symbols: syms }) {
  const ex = exchange || 'binance';
  if (!EXCHANGE_IDS.includes(ex)) throw new Error('Exchange no válido');
  const want = (Array.isArray(syms) ? syms : String(syms || '').split(',')).filter((x) => /^[A-Z0-9]{3,20}$/.test(x));
  if (!want.length) return {};
  if (MOCK()) return mockTickers(want);
  const now = Date.now();
  let hit = tickerCache[ex + '|' + want.join(',')];
  if (hit && now - hit.t < 2500) return hit.v;
  const out = {};
  if (ex === 'binance') {
    for (let i = 0; i < want.length; i += 100) {
      const part = want.slice(i, i + 100);
      const rows = await httpGet('/api/v3/ticker/24hr', { symbols: JSON.stringify(part), type: 'MINI' });
      rows.forEach((r) => {
        const open = parseFloat(r.openPrice), last = parseFloat(r.lastPrice);
        out[r.symbol] = { price: last, pct: open ? ((last - open) / open) * 100 : 0 };
      });
    }
  } else if (ex === 'bybit') {
    const json = await httpGet('/v5/market/tickers', { category: 'spot' }, EX_HOSTS.bybit);
    if (Number(json.retCode) !== 0) throw new Error('Bybit: ' + json.retMsg);
    const set = new Set(want);
    json.result.list.forEach((r) => { if (set.has(r.symbol)) out[r.symbol] = { price: parseFloat(r.lastPrice), pct: parseFloat(r.price24hPcnt) * 100 }; });
  } else if (ex === 'bitstamp') {
    // Un pedido por activo (Bitstamp no tiene una lista general fiable); los que no existan se omiten.
    await Promise.all(want.slice(0, 40).map(async (s) => {
      let native;
      try { native = await nativeSymbol('bitstamp', s); } catch (e) { return; }
      const r = await httpGet(`/api/v2/ticker/${native}/`, {}, EX_HOSTS.bitstamp);
      const last = parseFloat(r.last);
      let pct = parseFloat(r.percent_change_24);
      if (!isFinite(pct)) { const o = parseFloat(r.open_24 !== undefined ? r.open_24 : r.open); pct = o ? ((last - o) / o) * 100 : 0; }
      out[s] = { price: last, pct };
    }));
  } else {
    const json = await httpGet('/api/v1/market/allTickers', {}, EX_HOSTS.kucoin);
    if (String(json.code) !== '200000') throw new Error('KuCoin: ' + (json.msg || 'respuesta no válida'));
    const set = new Set(want);
    json.data.ticker.forEach((r) => {
      const k = String(r.symbol).replace('-', '');
      if (set.has(k)) out[k] = { price: parseFloat(r.last), pct: parseFloat(r.changeRate) * 100 };
    });
  }
  Object.keys(out).forEach((k) => { if (!isFinite(out[k].price)) delete out[k]; });
  tickerCache[ex + '|' + want.join(',')] = { t: now, v: out };
  return out;
}

// ---------- Prueba de conexión (v0.17): ¿qué fuentes de datos responden en este equipo y a qué velocidad? ----------
async function timedFetch(url, opts, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 12000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}));
    return { res, ms: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}
const dayStr = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
async function testConnection() {
  if (MOCK()) return { mock: true, results: [{ name: 'Datos simulados', ok: true, ms: 0, detail: 'Modo de prueba: no se contacta con ninguna fuente real.' }] };
  const out = [];
  const run = async (name, fn) => {
    const t0 = Date.now();
    try { const detail = await fn(); out.push({ name, ok: true, ms: Date.now() - t0, detail }); }
    catch (e) { out.push({ name, ok: false, ms: Date.now() - t0, detail: (e && e.name === 'AbortError') ? 'No respondió en 12 segundos' : (e && e.message) || String(e) }); }
  };
  const json = async (url) => { const { res } = await timedFetch(url); if (!res.ok) throw new Error(`Respondió ${res.status}`); return res.json(); };
  await run('Binance Spot · velas (con volumen de compra)', async () => {
    const r = await json('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=2');
    if (!Array.isArray(r) || !r.length) throw new Error('Respuesta vacía');
    return r[0].length > 9 ? 'Correcto: trae el volumen de compra agresiva (el delta se puede calcular).' : 'Responde pero SIN volumen de compra: el delta no se podría calcular.';
  });
  await run('Binance Futuros · velas', async () => {
    const r = await json('https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=2');
    if (!Array.isArray(r) || !r.length) throw new Error('Respuesta vacía');
    return 'Correcto.';
  });
  await run('Binance Futuros · operaciones (aggTrades)', async () => {
    const r = await json('https://fapi.binance.com/fapi/v1/aggTrades?symbol=BTCUSDT&limit=1000');
    if (!Array.isArray(r) || r.length < 2) throw new Error('Respuesta vacía');
    const span = (r[r.length - 1].T - r[0].T) / 1000;
    return `${r.length} operaciones en ${span.toFixed(1)} s (≈ ${span > 0 ? Math.round(r.length / span) : '?'} por segundo). Indica el lado agresor: ${r[0].m !== undefined ? 'sí' : 'NO'}.`;
  });
  await run('Binance · archivo histórico de operaciones (data.binance.vision)', async () => {
    const url = `https://data.binance.vision/data/futures/um/daily/aggTrades/BTCUSDT/BTCUSDT-aggTrades-${dayStr(3)}.zip`;
    const head = await timedFetch(url, { method: 'HEAD' });
    if (!head.res.ok) throw new Error(`El archivo de ${dayStr(3)} respondió ${head.res.status}`);
    const size = Number(head.res.headers.get('content-length')) || 0;
    const part = await timedFetch(url, { headers: { Range: 'bytes=0-1999999' } }, 20000);
    const buf = part.res.ok || part.res.status === 206 ? (await part.res.arrayBuffer()).byteLength : 0;
    const mbs = buf ? (buf / 1048576) / (Math.max(part.ms, 1) / 1000) : 0;
    return `Existe. Un día pesa ${(size / 1048576).toFixed(0)} MB comprimido; velocidad medida ${mbs.toFixed(1)} MB/s (≈ ${mbs ? Math.ceil(size / 1048576 / mbs) : '?'} s por día).`;
  });
  await run('Bybit · operaciones recientes', async () => {
    const r = await json('https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=BTCUSDT&limit=1000');
    const n = r && r.result && r.result.list ? r.result.list.length : 0;
    if (!n) throw new Error('Respuesta vacía');
    return `${n} operaciones.`;
  });
  await run('Bybit · archivo histórico (dirección sin verificar)', async () => {
    const { res } = await timedFetch(`https://public.bybit.com/trading/BTCUSDT/BTCUSDT${dayStr(3)}.csv.gz`, { method: 'HEAD' });
    if (!res.ok) throw new Error(`Respondió ${res.status}`);
    return `Existe (${((Number(res.headers.get('content-length')) || 0) / 1048576).toFixed(0)} MB).`;
  });
  await run('Coinbase · operaciones recientes', async () => {
    const r = await json('https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=100');
    if (!Array.isArray(r) || !r.length) throw new Error('Respuesta vacía');
    return `${r.length} operaciones.`;
  });
  return { mock: false, results: out };
}

module.exports = { mockPrice, setDataDir, tradeStatus, shutdown, liqStart, liqMap, testConnection, klines, symbols, aggTrades, tickers, parseBybitKlines, parseKucoinKlines, parseBitstampKlines, EXCHANGE_IDS };

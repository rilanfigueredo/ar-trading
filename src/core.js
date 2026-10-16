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

async function httpGet(path, params, hosts) {
  const qs = new URLSearchParams(params || {}).toString();
  let lastErr = null;
  for (const host of hosts || HOSTS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(`${host}${path}${qs ? '?' + qs : ''}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status === 418) {
        throw new Error('Binance pidió ir más despacio (límite de peticiones). Espera un momento.');
      }
      if (!res.ok) throw new Error(`Binance respondió ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('No se pudo conectar con Binance: ' + (lastErr && lastErr.message ? lastErr.message : lastErr));
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
  return [t, String(o), String(h), String(l), String(c), String(v)];
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
async function klines({ symbol, interval, startTime, endTime, limit }) {
  if (!/^[A-Z0-9]{3,20}$/.test(String(symbol))) throw new Error('Símbolo inválido');
  if (!VALID_INTERVALS.includes(interval)) throw new Error('Intervalo inválido');
  if (MOCK()) return mockKlines({ symbol, interval, startTime, endTime, limit });
  const p = { symbol, interval, limit: String(Math.min(Number(limit) || 500, 1000)) };
  if (startTime !== undefined && startTime !== null && startTime !== '') p.startTime = String(Math.floor(Number(startTime)));
  if (endTime !== undefined && endTime !== null && endTime !== '') p.endTime = String(Math.floor(Number(endTime)));
  return httpGet('/api/v3/klines', p);
}

let symbolCache = null;
async function symbols() {
  if (symbolCache) return symbolCache;
  if (MOCK()) return (symbolCache = MOCK_SYMBOLS.map((s) => ({ symbol: s, base: s.replace('USDT', ''), quote: 'USDT' })));
  const info = await httpGet('/api/v3/exchangeInfo');
  symbolCache = info.symbols
    .filter((s) => s.status === 'TRADING' && s.isSpotTradingAllowed)
    .map((s) => ({ symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset }));
  return symbolCache;
}

module.exports = { klines, symbols, aggTrades };

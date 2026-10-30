// Fuentes del mapa de liquidaciones (v0.23): Binance Futuros USDT, Bybit v5 (linear) y OKX (SWAP), solo BTCUSDT.
// Todo son consultas PÚBLICAS (sin clave). Cada función recibe `getJson(url)` para poder probarse sin red.
// VERIFICADO en la documentación oficial: Binance forceOrder y openInterestHist, Bybit allLiquidation, nombres de canales/endpoints de OKX.
// NO VERIFICADO (formato tomado de memoria; se comprueba en el PC del usuario): campos de OKX, Bybit open-interest/risk-limit, Binance openInterest.
'use strict';

const SYMBOL = 'BTCUSDT';
const OKX_INST = 'BTC-USDT-SWAP';
const OKX_CTVAL = 0.01;                               // BTC por contrato en BTC-USDT-SWAP (NO verificado en vivo)
const STEP = 300;

// ---------- Velas de 5 min (precio común para todos los exchanges) ----------
async function binanceCandles(getJson, fromMs, toMs) {
  const out = [];
  let start = fromMs;
  for (let g = 0; g < 40 && start < toMs; g++) {
    const rows = await getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${SYMBOL}&interval=5m&limit=1500&startTime=${start}`);
    if (!Array.isArray(rows) || !rows.length) break;
    rows.forEach((r) => out.push({ t: Math.floor(r[0] / 1000), o: +r[1], h: +r[2], l: +r[3], c: +r[4] }));
    const lastT = rows[rows.length - 1][0];
    if (lastT + 300000 <= start) break;
    start = lastT + 300000;
    if (rows.length < 1500) break;
  }
  return out;
}

// ---------- Interés abierto histórico (dólares) ----------
// Binance: /futures/data/openInterestHist (5m, máx 500 por llamada, SOLO los últimos 30 días)
async function binanceOiHist(getJson, fromMs, toMs) {
  const out = [];
  let start = fromMs;
  for (let g = 0; g < 40 && start < toMs; g++) {
    const rows = await getJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${SYMBOL}&period=5m&limit=500&startTime=${start}&endTime=${Math.min(toMs, start + 500 * 300000)}`);
    if (!Array.isArray(rows)) throw new Error('respuesta inesperada de openInterestHist');
    rows.forEach((r) => out.push({ t: Math.floor(r.timestamp / 1000), usd: +r.sumOpenInterestValue }));
    if (!rows.length) { start += 500 * 300000; continue; }
    start = rows[rows.length - 1].timestamp + 300000;
  }
  return out.filter((r) => r.usd > 0);
}
// Bybit v5: /v5/market/open-interest (intervalTime 5min, máx 200 por página, cursor). Devuelve contratos (BTC) → se pasa a USD con el precio.
async function bybitOiHist(getJson, fromMs, toMs, priceAt) {
  const out = [];
  let cursor = '';
  for (let g = 0; g < 60; g++) {
    const r = await getJson(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${SYMBOL}&intervalTime=5min&limit=200&startTime=${fromMs}&endTime=${toMs}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    if (!r || r.retCode !== 0 || !r.result || !Array.isArray(r.result.list)) throw new Error('respuesta inesperada de Bybit open-interest' + (r && r.retMsg ? ': ' + r.retMsg : ''));
    r.result.list.forEach((x) => { const t = Math.floor(+x.timestamp / 1000); const p = priceAt(t); if (p) out.push({ t, usd: +x.openInterest * p }); });
    cursor = r.result.nextPageCursor || '';
    if (!cursor || !r.result.list.length) break;
  }
  return out.sort((a, b) => a.t - b.t).filter((r) => r.usd > 0);
}
// OKX: /api/v5/rubik/stat/contracts/open-interest-history (5m, máx 100, solo las últimas 1440 entradas). Fila: [ts, oi, oiCcy, oiUsd]
async function okxOiHist(getJson, fromMs, toMs, priceAt) {
  const out = [];
  let end = toMs + 1;
  for (let g = 0; g < 20; g++) {
    const r = await getJson(`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=${OKX_INST}&period=5m&limit=100&end=${end}`);
    if (!r || r.code !== '0' || !Array.isArray(r.data)) throw new Error('respuesta inesperada de OKX open-interest-history' + (r && r.msg ? ': ' + r.msg : ''));
    if (!r.data.length) break;
    let minTs = Infinity;
    r.data.forEach((x) => {
      const ts = +x[0]; minTs = Math.min(minTs, ts);
      const t = Math.floor(ts / 1000); const p = priceAt(t);
      const usd = +x[3] > 0 ? +x[3] : (+x[2] > 0 && p ? +x[2] * p : 0);
      if (usd > 0) out.push({ t, usd });
    });
    if (minTs <= fromMs) break;
    end = minTs;
  }
  return out.filter((r) => r.t * 1000 >= fromMs).sort((a, b) => a.t - b.t);
}

// ---------- Margen de mantenimiento del primer tramo (mmr) ----------
// Binance: leverageBracket es USER_DATA (exige clave API): no hay forma pública. Se usa el valor por defecto y se AVISA.
async function bybitMmr(getJson) {
  const r = await getJson(`https://api.bybit.com/v5/market/risk-limit?category=linear&symbol=${SYMBOL}`);
  const list = r && r.result && r.result.list;
  const first = Array.isArray(list) && list[0];
  const v = first && +first.maintenanceMargin;
  if (!(v > 0 && v < 0.05)) throw new Error('risk-limit sin maintenanceMargin válido');
  return v;
}
async function okxMmr(getJson) {
  const r = await getJson(`https://www.okx.com/api/v5/public/position-tiers?instType=SWAP&tdMode=isolated&instFamily=BTC-USDT`);
  const first = r && r.code === '0' && Array.isArray(r.data) && r.data[0];
  const v = first && +first.mmr;
  if (!(v > 0 && v < 0.05)) throw new Error('position-tiers sin mmr válido');
  return v;
}
const MMR_DEFAULT = { binance: 0.004, bybit: 0.005, okx: 0.004 };       // valores por defecto, NO verificados

// ---------- Interés abierto actual (consulta rápida cada pocos minutos) ----------
const liveOiJobs = {
  binance: (getJson, from, to) => binanceOiHist(getJson, from, to),
  bybit: (getJson, from, to, priceAt) => bybitOiHist(getJson, from, to, priceAt),
  okx: (getJson, from, to, priceAt) => okxOiHist(getJson, from, to, priceAt),
};

// ---------- Liquidaciones reales (WebSocket) ----------
// Evento común: { t (s), ex, side: 0 largo liquidado | 1 corto liquidado, price, usd }
function parseBinanceForce(m) {
  const o = m && m.o;
  if (!o || o.s !== SYMBOL) return null;
  const price = +o.ap > 0 ? +o.ap : +o.p;
  return { t: Math.floor((+o.T || +m.E) / 1000), ex: 'binance', side: o.S === 'SELL' ? 0 : 1, price, usd: +o.q * price };   // SELL forzada = largo liquidado
}
function parseBybitLiq(m) {
  if (!m || typeof m.topic !== 'string' || m.topic.indexOf('allLiquidation.') !== 0 || !Array.isArray(m.data)) return [];
  return m.data.filter((d) => d.s === SYMBOL).map((d) => ({ t: Math.floor(+d.T / 1000), ex: 'bybit', side: d.S === 'Buy' ? 0 : 1, price: +d.p, usd: +d.v * +d.p }));   // Buy = largo liquidado (documentación)
}
function parseOkxLiq(m) {
  if (!m || !m.arg || m.arg.channel !== 'liquidation-orders' || !Array.isArray(m.data)) return [];
  const out = [];
  m.data.forEach((d) => {
    if (d.instId !== OKX_INST) return;
    (d.details || []).forEach((x) => {
      const long = x.posSide === 'long' || (x.posSide !== 'short' && x.side === 'sell');
      const price = +x.bkPx;
      out.push({ t: Math.floor(+x.ts / 1000), ex: 'okx', side: long ? 0 : 1, price, usd: +x.sz * OKX_CTVAL * price });
    });
  });
  return out.filter((e) => e.price > 0);
}

// Conexión WebSocket con reconexión. onEvent(evento), onState(estado, texto)
function openLiqSocket(ex, onEvent, onState, WS) {
  const Sock = WS || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  if (!Sock) { onState('error', 'este Node no trae WebSocket'); return { close() {} }; }
  const cfg = {
    binance: { url: 'wss://fstream.binance.com/market/ws/!forceOrder@arr', sub: null, ping: null },
    bybit: { url: 'wss://stream.bybit.com/v5/public/linear', sub: { op: 'subscribe', args: ['allLiquidation.' + SYMBOL] }, ping: '{"op":"ping"}' },
    okx: { url: 'wss://ws.okx.com:8443/ws/v5/public', sub: { op: 'subscribe', args: [{ channel: 'liquidation-orders', instType: 'SWAP' }] }, ping: 'ping' },
  }[ex];
  let ws = null, closed = false, timer = null, pingT = null, tries = 0;
  const connect = () => {
    if (closed) return;
    try { ws = new Sock(cfg.url); } catch (e) { onState('error', e.message); schedule(); return; }
    ws.addEventListener('open', () => {
      tries = 0; onState('ok', 'conectado');
      if (cfg.sub) ws.send(JSON.stringify(cfg.sub));
      if (cfg.ping) pingT = setInterval(() => { try { ws.send(cfg.ping); } catch (e) { /* se reconecta */ } }, 20000);
      if (pingT && pingT.unref) pingT.unref();
    });
    ws.addEventListener('message', (ev) => {
      try {
        const txt = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString();
        if (txt === 'pong') return;
        const m = JSON.parse(txt);
        if (ex === 'binance') { const e = parseBinanceForce(m); if (e) onEvent(e); }
        else (ex === 'bybit' ? parseBybitLiq(m) : parseOkxLiq(m)).forEach(onEvent);
      } catch (e) { /* mensaje ajeno */ }
    });
    ws.addEventListener('close', (ev) => { clearInterval(pingT); if (!closed) { onState('error', 'conexión cerrada' + (ev && ev.code ? ' (código ' + ev.code + ')' : '') + ', reintentando'); schedule(); } });
    ws.addEventListener('error', () => { /* el cierre posterior avisa */ });
  };
  const schedule = () => { tries++; timer = setTimeout(connect, Math.min(60000, 2000 * tries)); if (timer.unref) timer.unref(); };
  connect();
  return { close() { closed = true; clearTimeout(timer); clearInterval(pingT); try { ws && ws.close(); } catch (e) { /* nada */ } } };
}

module.exports = { binanceCandles, binanceOiHist, bybitOiHist, okxOiHist, bybitMmr, okxMmr, MMR_DEFAULT, liveOiJobs, parseBinanceForce, parseBybitLiq, parseOkxLiq, openLiqSocket, SYMBOL, STEP };

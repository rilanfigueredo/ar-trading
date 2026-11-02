// Red SIMULADA del monitor de blockchain (v0.25): imita mempool.space y Bitstamp para pruebas (TV_MOCK=1). No es dato real.
'use strict';
const resp = (cuerpo, status = 200) => ({ ok: status < 400, status, json: async () => cuerpo, text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) });

// ahoraMs: reloj simulado. Cada bloque tarda 580 s; el último se halló hace 5 minutos.
function crear(ahoraMs, op) {
  const o = Object.assign({ tip: 985000, falla: false, sinPrecios: false }, op);
  const nowS = Math.floor(ahoraMs / 1000);
  const tsDe = (h) => nowS - 300 - (o.tip - h) * 580;
  const hDe = (ts) => Math.max(0, Math.min(o.tip, Math.round(o.tip - (nowS - 300 - ts) / 580)));
  const hash = (h) => h.toString(16).padStart(64, '0');
  const bloque = (h) => ({ height: h, timestamp: tsDe(h), id: hash(h), difficulty: 1.2e14 + h });
  return function responder(url) {
    const u = new URL(url), p = u.pathname;
    if (o.falla) return resp({}, 503);
    if (u.hostname.includes('mempool')) {
      if (p === '/api/blocks/tip/height') return resp(String(o.tip));
      if (p === '/api/v1/blocks') return resp(Array.from({ length: 15 }, (_, i) => bloque(o.tip - i)));
      let m = /^\/api\/block-height\/(\d+)$/.exec(p); if (m) return resp(hash(+m[1]));
      m = /^\/api\/block\/([0-9a-f]{64})$/.exec(p); if (m) return resp(bloque(parseInt(m[1], 16)));
      m = /^\/api\/v1\/mining\/blocks\/timestamp\/(\d+)$/.exec(p); if (m) { const h = hDe(+m[1]); return resp({ height: h, timestamp: tsDe(h), hash: hash(h) }); }
      if (p === '/api/v1/mining/difficulty-adjustments') {
        const filas = []; for (let h = Math.floor(o.tip / 2016) * 2016; h >= 2016 * 470; h -= 2016) filas.push([tsDe(h), h, 1.1e14 + h * 1e6]);
        return resp(filas);
      }
      return resp({}, 404);
    }
    if (u.hostname.includes('bitstamp')) {
      if (o.sinPrecios) return resp({}, 503);
      if (p.startsWith('/api/v2/ticker/')) return resp({ last: '95000.50', timestamp: String(nowS) });
      if (p.startsWith('/api/v2/ohlc/')) { const s = +u.searchParams.get('start'); return resp({ data: { ohlc: [{ timestamp: String(s), open: String(20000 + (s % 7919)), high: '1', low: '1', close: '1', volume: '1' }] } }); }
      return resp({}, 404);
    }
    return null;
  };
}
module.exports = { crear };

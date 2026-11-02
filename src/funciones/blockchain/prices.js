'use strict';
// Precios de Bitstamp (pública, gratuita, sin clave): el mismo mercado del gráfico BITSTAMP:BTCUSD.
// Bitstamp cotiza en dólares (USD). Si falla, se lanza SourceError con el nombre «Bitstamp»;
// el resto del monitor sigue funcionando sin precios.

const { SourceError, makeGet } = require('./http');

const SOURCE = 'Bitstamp';
const FIRST_TS = 1314835200; // 1 sep 2011: antes de esto Bitstamp no tiene datos
// Se intenta primero la vela de 1 minuto; si ese minuto no tuvo operaciones, la de 1 hora; luego la de 1 día.
const STEPS = [[60, 'minuto'], [3600, 'hora'], [86400, 'día']];

function num(x) { const n = Number(x); return isFinite(n) && n > 0 ? n : null; }

function createPriceClient(opts) {
  const o = opts || {};
  const baseUrl = (o.baseUrl || 'https://www.bitstamp.net').replace(/\/+$/, '');
  const pair = o.pair || 'btcusd';
  const get = makeGet({ fetchFn: o.fetchFn, baseUrl, timeoutMs: o.timeoutMs || 10000, source: SOURCE, retries: o.retries, retryDelayMs: o.retryDelayMs, sleep: o.sleep });

  return {
    source: SOURCE,
    pair,

    // Precio de apertura de la vela que contiene el instante ts (segundos Unix).
    // Devuelve { price, precision, candleTs } o { price:null, reason }.
    async priceAt(ts) {
      if (!(ts >= FIRST_TS)) return { price: null, reason: 'Bitstamp aún no operaba en esa fecha (empezó en 2011)' };
      for (const [step, label] of STEPS) {
        const s = Math.floor(ts / step) * step;
        const p = '/api/v2/ohlc/' + pair + '/?step=' + step + '&start=' + s + '&end=' + (s + step) + '&limit=10';
        const body = await get(p);
        const list = body && body.data && body.data.ohlc;
        if (!Array.isArray(list)) throw new SourceError(p, 'respuesta con forma inesperada', SOURCE);
        // Solo se acepta la vela exacta de ese período: nunca una vecina.
        const c = list.find((x) => x && Number(x.timestamp) === s);
        if (c) {
          const price = num(c.open);
          if (price == null) throw new SourceError(p, 'precio con forma inesperada', SOURCE);
          return { price, precision: label, candleTs: s };
        }
      }
      return { price: null, reason: 'Bitstamp no tiene velas para ese día' };
    },

    // Precio actual (último negocio).
    async ticker() {
      const p = '/api/v2/ticker/' + pair + '/';
      const body = await get(p);
      const price = body ? num(body.last) : null;
      if (price == null) throw new SourceError(p, 'precio actual con forma inesperada', SOURCE);
      const ts = Number(body.timestamp);
      return { price, ts: isFinite(ts) && ts > 0 ? ts : null };
    },
  };
}

module.exports = { createPriceClient, SOURCE, FIRST_TS };

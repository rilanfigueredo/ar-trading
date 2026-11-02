'use strict';
// Cliente de mempool.space (pública, gratuita, sin clave).
// Regla: si algo falla o llega con forma inesperada, se lanza SourceError. NUNCA se cambia de fuente en silencio.

const SOURCE = 'mempool.space';

const { SourceError, makeGet } = require('./http');

function isInt(x) { return typeof x === 'number' && Number.isInteger(x) && x >= 0; }

function createClient(opts) {
  const o = opts || {};
  const baseUrl = (o.baseUrl || 'https://mempool.space').replace(/\/+$/, '');
  const get = makeGet({ fetchFn: o.fetchFn, baseUrl, timeoutMs: o.timeoutMs, source: SOURCE, retries: o.retries, retryDelayMs: o.retryDelayMs, sleep: o.sleep });

  function block(raw, path) {
    if (!raw || !isInt(raw.height) || !isInt(raw.timestamp)) throw new SourceError(path, 'datos de bloque con forma inesperada');
    return { height: raw.height, timestamp: raw.timestamp, id: raw.id || raw.hash || null, difficulty: typeof raw.difficulty === 'number' ? raw.difficulty : null };
  }

  return {
    source: SOURCE,
    baseUrl,

    // Altura del último bloque (llamada muy liviana).
    async tipHeight() {
      const p = '/api/blocks/tip/height';
      const t = await get(p, 'text');
      const h = Number(t);
      if (!isInt(h)) throw new SourceError(p, 'altura con forma inesperada');
      return h;
    },

    // Últimos bloques (más nuevo primero), con hora de cada uno.
    async recentBlocks() {
      const p = '/api/v1/blocks';
      const arr = await get(p);
      if (!Array.isArray(arr) || arr.length === 0) throw new SourceError(p, 'lista de bloques con forma inesperada');
      return arr.map((b) => block(b, p));
    },

    // Bloque de una altura exacta: primero su hash, luego sus datos.
    async blockAtHeight(height) {
      const p1 = '/api/block-height/' + height;
      const hash = await get(p1, 'text');
      if (!/^[0-9a-f]{64}$/i.test(hash)) throw new SourceError(p1, 'hash con forma inesperada');
      const p2 = '/api/block/' + hash;
      const b = block(await get(p2), p2);
      if (b.height !== height) throw new SourceError(p2, 'devolvió el bloque ' + b.height + ' en vez del ' + height);
      return b;
    },

    // Bloque más cercano a un instante (segundos Unix).
    async blockAtTime(unixSeconds) {
      const p = '/api/v1/mining/blocks/timestamp/' + Math.floor(unixSeconds);
      const raw = await get(p);
      if (!raw || !isInt(raw.height)) throw new SourceError(p, 'datos con forma inesperada');
      let ts = raw.timestamp;
      if (typeof ts === 'string') ts = Math.floor(Date.parse(ts) / 1000);
      if (!isInt(ts)) throw new SourceError(p, 'hora del bloque con forma inesperada');
      return { height: raw.height, timestamp: ts, id: raw.hash || null };
    },

    // Historial de ajustes de dificultad: [{height, timestamp, difficulty}], validado.
    async adjustments() {
      const p = '/api/v1/mining/difficulty-adjustments';
      const arr = await get(p);
      if (!Array.isArray(arr) || arr.length === 0) throw new SourceError(p, 'historial con forma inesperada');
      const out = arr.map((r) => {
        if (!Array.isArray(r) || r.length < 3 || !isInt(r[0]) || !isInt(r[1]) || typeof r[2] !== 'number' || !(r[2] > 0)) {
          throw new SourceError(p, 'fila del historial con forma inesperada');
        }
        if (r[1] % 2016 !== 0) throw new SourceError(p, 'ajuste en una altura que no es múltiplo de 2016 (' + r[1] + ')');
        return { timestamp: r[0], height: r[1], difficulty: r[2] };
      });
      return out;
    },
  };
}

module.exports = { createClient, SourceError, SOURCE };

'use strict';
// Consulta HTTP común a todas las fuentes. Sin interfaz, sin disco.
// - Tiempo límite por consulta.
// - UN reintento (misma fuente) si falla la red, se agota el tiempo o responde error 5xx.
// - El mensaje de error incluye la causa real (por ejemplo ECONNRESET), no solo "fetch failed".
// Nunca cambia de fuente: si falla, lanza SourceError con el nombre de la fuente.

class SourceError extends Error {
  constructor(endpoint, reason, source) {
    const src = source || 'mempool.space';
    super('La fuente ' + src + ' falló (' + endpoint + '): ' + reason + '. No se cambió a otra fuente.');
    this.name = 'SourceError';
    this.source = src;
    this.endpoint = endpoint;
    this.reason = reason;
    this.retryable = false;
  }
}

function describeNetError(e) {
  if (!e) return 'error de red';
  let txt = e.message ? String(e.message) : 'error de red';
  const c = e.cause;
  const code = c && (c.code || c.message);
  if (code && txt.indexOf(String(code)) === -1) txt += ': ' + code;
  return txt;
}

const sleepDefault = (ms) => new Promise((r) => setTimeout(r, ms));

function makeGet(o) {
  const fetchFn = o.fetchFn || (typeof fetch === 'function' ? fetch : null);
  if (!fetchFn) throw new Error('No hay función de red disponible');
  const baseUrl = String(o.baseUrl).replace(/\/+$/, '');
  const timeoutMs = o.timeoutMs || 15000;
  const source = o.source || 'mempool.space';
  const retries = o.retries == null ? 1 : o.retries;
  const retryDelayMs = o.retryDelayMs == null ? 1500 : o.retryDelayMs;
  const sleep = o.sleep || sleepDefault;

  function fail(path, reason, retryable) {
    const e = new SourceError(path, reason, source);
    e.retryable = !!retryable;
    return e;
  }

  async function once(path, kind) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetchFn(baseUrl + path, ctl ? { signal: ctl.signal } : undefined);
    } catch (e) {
      const why = e && e.name === 'AbortError' ? 'sin respuesta en ' + Math.round(timeoutMs / 1000) + ' s' : 'sin conexión (' + describeNetError(e) + ')';
      throw fail(path, why, true);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!res || !res.ok) {
      const st = res ? res.status : 0;
      throw fail(path, 'respuesta HTTP ' + (res ? res.status : 'vacía'), st >= 500 || st === 0);
    }
    try {
      if (kind === 'text') return (await res.text()).trim();
      return await res.json();
    } catch (e) {
      throw fail(path, 'respuesta ilegible', false);
    }
  }

  return async function get(path, kind) {
    let last;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0 && retryDelayMs > 0) await sleep(retryDelayMs);
      try { return await once(path, kind); } catch (e) {
        last = e;
        if (!(e instanceof SourceError) || !e.retryable) throw e;
      }
    }
    throw last;
  };
}

module.exports = { SourceError, makeGet, describeNetError };

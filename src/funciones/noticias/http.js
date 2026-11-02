'use strict';
// Pide un JSON. Los errores nunca incluyen la dirección completa (puede llevar la clave).
async function pedir(fetchFn, url, fuente, opciones = {}, tipo = 'json') {
  let r;
  try {
    const o = Object.assign({ headers: { 'User-Agent': 'Ar_Monitor/0.1', Accept: 'application/json' } }, opciones);
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout && !o.signal) o.signal = AbortSignal.timeout(20000);
    r = await fetchFn(url, o);
  } catch (e) {
    throw new Error(`${fuente}: sin conexión o tiempo agotado`);
  }
  if (!r.ok) {
    const extra = r.status === 429 ? ' (límite de uso de la fuente; espera unos minutos)' : '';
    throw new Error(`${fuente}: respondió con error ${r.status}${extra}`);
  }
  try { return tipo === 'texto' ? await r.text() : await r.json(); } catch (e) {
    throw new Error(`${fuente}: la respuesta no se pudo leer (puede ser un límite de uso o un cambio de formato)`);
  }
}
module.exports = { pedir };

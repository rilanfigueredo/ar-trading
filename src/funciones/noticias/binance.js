'use strict';
const { pedir } = require('./http');
const BASE = 'https://api.binance.com/api/v3/klines';
const H = 3600e3, M5 = 300e3;

async function velas(t0, fetchFn) {
  const ini = t0 - (t0 % M5);
  const url = `${BASE}?symbol=BTCUSDT&interval=5m&startTime=${ini}&endTime=${ini + 24 * H + M5}&limit=1000`;
  const j = await pedir(fetchFn, url, 'Binance');
  if (!Array.isArray(j)) throw new Error('Binance: respuesta inesperada');
  return j.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
}
// Rendimientos desde el precio de apertura de la vela de la publicación.
function reaccion(lista, t0) {
  const ini = t0 - (t0 % M5);
  const por = new Map(lista.map((v) => [v.t, v]));
  const p0 = por.get(ini);
  if (!p0) return null;
  const en = (h) => { const v = por.get(ini + h * H); return v ? v.o / p0.o - 1 : null; };
  let hi = -Infinity, lo = Infinity, n = 0;
  for (let k = 0; k < 12; k++) {
    const v = por.get(ini + k * M5);
    if (v) { hi = Math.max(hi, v.h); lo = Math.min(lo, v.l); n++; }
  }
  return { r1h: en(1), r4h: en(4), r24h: en(24), rango1h: n === 12 ? (hi - lo) / p0.o : null };
}
function mediana(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function resumir(lista, campo) {
  const v = lista.map((x) => x[campo]).filter((x) => x != null);
  return {
    n: v.length, mediana: mediana(v),
    promedio: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null,
    positivos: v.filter((x) => x > 0).length,
  };
}
function resumenGrupo(lista) {
  return { n: lista.length, r1h: resumir(lista, 'r1h'), r4h: resumir(lista, 'r4h'), r24h: resumir(lista, 'r24h'), rango1h: resumir(lista, 'rango1h') };
}
// reacciones: [{grupo, r1h, r4h, r24h, rango1h}]
function resumenReaccion(reacciones) {
  return {
    todos: resumenGrupo(reacciones),
    subio: resumenGrupo(reacciones.filter((r) => r.grupo === 'subio')),
    bajo: resumenGrupo(reacciones.filter((r) => r.grupo === 'bajo')),
  };
}
async function reaccionesDe(muestrasLista, fetchFn, ahora) {
  const out = [];
  for (const m of muestrasLista) {
    if (m.t0 > ahora - H) continue; // aún no pasó ni 1 hora
    const r = reaccion(await velas(m.t0, fetchFn), m.t0);
    if (r) out.push(Object.assign({ grupo: m.grupo, fechaPub: m.fechaPub }, r));
  }
  return out;
}
module.exports = { velas, reaccion, mediana, resumir, resumenReaccion, reaccionesDe };

// Estimador del mapa de liquidaciones (v0.23). LÓGICA PURA (se prueba en Node, test/liq.test.js).
// IMPORTANTE: es una ESTIMACIÓN. Los exchanges no publican posiciones individuales. Todo lo marcado "SUPOSICIÓN" es una hipótesis, no un dato.
//
// Método (documentado también en docs/CONOCIMIENTO.md):
//  1. Cada intervalo de 5 min, si el interés abierto (OI, en dólares) SUBE, ese aumento son posiciones nuevas.
//     Entrada = cierre del intervalo. SUPOSICIÓN.
//  2. Se reparte entre largos y cortos según el movimiento del precio en ese intervalo (sube → algo más de largos):
//     largos = 0,5 + sesgo·clamp(retorno/0,3 %, -1, 1), con sesgo = 0,2 (rango 30–70 %). SUPOSICIÓN.
//  3. Cada parte se reparte entre 5x, 10x, 25x, 50x y 100x con pesos editables (por defecto 10/25/30/20/15 %). SUPOSICIÓN.
//  4. Precio de liquidación (margen aislado, sin comisiones ni importe de mantenimiento):
//        largo = entrada · (1 − 1/L + mmr)      corto = entrada · (1 + 1/L − mmr)
//     con mmr = margen de mantenimiento del primer tramo del exchange (se usa el del primer tramo para todos). SUPOSICIÓN.
//  5. Si el OI BAJA, se cierran posiciones: todos los niveles vivos de ese exchange se reducen en la misma proporción.
//  6. Antigüedad: cada nivel pierde peso con una vida media editable (por defecto 72 h): las posiciones viejas suelen estar ya cerradas. SUPOSICIÓN.
//  7. Cuando el precio cruza un nivel (mínimo ≤ nivel largo, o máximo ≥ nivel corto), el nivel se CONSUME: el segmento termina ahí.
//
// Salida: segmentos [bin, t0, t1, lado, w5, w10, w25, w50, w100] (t1 = 0 → sigue vivo; lado 0 = largos, 1 = cortos; w en dólares).
'use strict';

const LEVS = [5, 10, 25, 50, 100];
const DEFAULT_WEIGHTS = [0.10, 0.25, 0.30, 0.20, 0.15];
const STEP = 300;                                  // segundos por intervalo (5 min)

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function normWeights(w) {
  const a = LEVS.map((_, i) => (Number.isFinite(+w && +w[i]) && +w[i] > 0 ? +w[i] : 0));
  const s = a.reduce((x, y) => x + y, 0);
  return s > 0 ? a.map((x) => x / s) : DEFAULT_WEIGHTS.slice();
}

// Precio de liquidación estimado
function liqPrice(side, entry, lev, mmr) {
  return side === 0 ? entry * (1 - 1 / lev + mmr) : entry * (1 + 1 / lev - mmr);
}

// candles: [{ t (s), o, h, l, c }] en cuadrícula de 5 min; oi: [{ t (s), usd }]. Devuelve { segs, alive, steps }.
function estimate(opt) {
  const candles = opt.candles || [], oiRows = opt.oi || [];
  const mmr = opt.mmr > 0 ? opt.mmr : 0.004;
  const w = normWeights(opt.weights);
  const levOn = opt.levOn || [true, true, true, true, true];
  const binSize = opt.binSize > 0 ? opt.binSize : 10;
  const colSec = Math.max(STEP, opt.colSec || 3600);
  const bias = opt.bias === undefined ? 0.2 : opt.bias;
  const halfLife = opt.halfLifeH === undefined ? 72 : opt.halfLifeH;            // 0 = sin envejecimiento
  const since = opt.since || 0;
  if (candles.length < 2 || oiRows.length < 2) return { segs: [], steps: 0 };
  // OI en cada vela: el último dato con t ≤ t de la vela + 5 min (se arrastra el anterior si falta)
  const oiAt = new Array(candles.length);
  let j = 0, last = null;
  for (let i = 0; i < candles.length; i++) {
    while (j < oiRows.length && oiRows[j].t <= candles[i].t + STEP) { last = oiRows[j].usd; j++; }
    oiAt[i] = last;
  }
  // G(t): factor global (cierres de posiciones + envejecimiento). Peso efectivo = raw · G(ahora).
  const decay = halfLife > 0 ? Math.pow(0.5, STEP / (halfLife * 3600)) : 1;
  let G = 1;
  const Gs = new Array(candles.length).fill(1);
  const alive = [new Map(), new Map()];                // por lado: bin → [{ t0, lev, raw }]
  const sorted = [[], []];                            // bins vivos ordenados (ascendente)
  const done = [];                                    // { bin, side, t0, t1, lev, raw, g }
  const ins = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } if (arr[lo] !== v) arr.splice(lo, 0, v); };
  const del = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } if (arr[lo] === v) arr.splice(lo, 1); };

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    // 7. consumo por el precio de esta vela
    const L = alive[0], S = alive[1];
    while (sorted[0].length && sorted[0][sorted[0].length - 1] * binSize >= c.l) {
      const b = sorted[0].pop();
      for (const e of L.get(b)) done.push({ bin: b, side: 0, t0: e.t0, t1: c.t, lev: e.lev, raw: e.raw, g: G });
      L.delete(b);
    }
    while (sorted[1].length && sorted[1][0] * binSize <= c.h) {
      const b = sorted[1].shift();
      for (const e of S.get(b)) done.push({ bin: b, side: 1, t0: e.t0, t1: c.t, lev: e.lev, raw: e.raw, g: G });
      S.delete(b);
    }
    // 5/6. cierres y envejecimiento
    const prev = i > 0 ? oiAt[i - 1] : null, cur = oiAt[i];
    G *= decay;
    let dOI = 0;
    if (prev !== null && cur !== null) dOI = cur - prev;
    if (dOI < 0 && prev > 0) G *= Math.max(0, 1 - (-dOI) / prev);
    Gs[i] = G;
    // 1–4. posiciones nuevas
    if (dOI > 0) {
      const ret = c.o > 0 ? (c.c - c.o) / c.o : 0;
      const longShare = 0.5 + bias * clamp(ret / 0.003, -1, 1);
      for (let k = 0; k < LEVS.length; k++) {
        if (!levOn[k]) continue;
        [0, 1].forEach((side) => {
          const usd = dOI * (side === 0 ? longShare : 1 - longShare) * w[k];
          if (!(usd > 0)) return;
          const p = liqPrice(side, c.c, LEVS[k], mmr);
          if (!(p > 0)) return;
          const bin = Math.floor(p / binSize);
          // un nivel que ya está del otro lado del precio actual no se crea
          if (side === 0 && bin * binSize >= c.c) return;
          if (side === 1 && bin * binSize <= c.c) return;
          const m = alive[side];
          if (!m.has(bin)) { m.set(bin, []); ins(sorted[side], bin); }
          m.get(bin).push({ t0: c.t, lev: k, raw: usd / G });
        });
      }
    }
  }
  // Agregado por columna de tiempo (colSec) para no enviar miles de segmentos
  const q = (t) => Math.floor(t / colSec) * colSec;
  const agg = new Map();
  const add = (bin, side, t0, t1, lev, wt) => {
    if (!(wt > 0)) return;
    const k = bin + '|' + side + '|' + q(t0) + '|' + (t1 ? q(t1) : 0);
    let r = agg.get(k);
    if (!r) { r = [bin, q(t0), t1 ? q(t1) : 0, side, 0, 0, 0, 0, 0]; agg.set(k, r); }
    r[4 + lev] += wt;
  };
  done.forEach((d) => { if (d.t1 >= since) add(d.bin, d.side, d.t0, d.t1, d.lev, d.raw * d.g); });
  [0, 1].forEach((side) => alive[side].forEach((list, bin) => list.forEach((e) => add(bin, side, e.t0, 0, e.lev, e.raw * G))));
  const segs = [];
  agg.forEach((r) => { if (r[2] === 0 || r[2] > since) segs.push(r); });
  return { segs, steps: candles.length, G };
}

// Une varios resultados (modo combinado) sumando segmentos iguales
function mergeSegs(lists) {
  const m = new Map();
  lists.forEach((segs) => segs.forEach((r) => {
    const k = r[0] + '|' + r[3] + '|' + r[1] + '|' + r[2];
    const a = m.get(k);
    if (!a) m.set(k, r.slice()); else for (let i = 4; i < 9; i++) a[i] += r[i];
  }));
  return Array.from(m.values());
}

module.exports = { estimate, mergeSegs, liqPrice, normWeights, LEVS, DEFAULT_WEIGHTS, STEP };

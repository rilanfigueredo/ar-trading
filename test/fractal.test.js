// Pruebas del motor de Fractal (v0.26.12)
const assert = require('assert');
const F = require('../renderer/js/fractal.js');

// serie determinista con una estructura: barrido de mínimo y subida
function gen(n, seed, scale, off) {
  let x = seed; const rnd = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
  const bars = []; let p = 100 * scale;
  for (let i = 0; i < n; i++) {
    const o = p, c = p + (rnd() - 0.5) * 2 * scale, h = Math.max(o, c) + rnd() * scale, l = Math.min(o, c) - rnd() * scale;
    bars.push({ time: off + i * 60, open: o, high: h, low: l, close: c }); p = c;
  }
  return bars;
}
// estructura: 20 velas -> baja, barre mínimo con mecha, sube
function structure(scale, base, off, step) {
  const pts = [100, 98, 96, 97, 95, 93, 94, 92, 90, 91, 90.5, 92, 95, 98, 101, 104, 106, 108, 110, 112];
  const bars = [];
  for (let i = 0; i < pts.length; i++) {
    const o = i ? pts[i - 1] : pts[0], c = pts[i];
    let l = Math.min(o, c) - 0.5; if (i === 10) l = 84;
    bars.push({ time: off + i * step, open: base + o * scale, high: base + (Math.max(o, c) + 0.5) * scale, low: base + l * scale, close: base + c * scale });
  }
  return bars;
}

// 1) patrón + búsqueda en misma serie escalada (invariante a la escala de precio)
const st = structure(1, 0, 0, 60);
const pat = F.buildPattern(st, 0, 19 * 60, 60);
assert.ok(pat.ok);
assert.strictEqual(pat.feat.n, 20);
assert.ok(pat.feat.m.wickLo > 0.05, 'mecha inferior detectada');
assert.ok(pat.feat.m.sweepLo >= 1, 'barrido de mínimo detectado');

const noise1 = gen(300, 7, 1, 1e6), noise2 = gen(300, 9, 1, 1e6 + 400 * 60);
const stx = structure(5, 1000, 1e6 + 300 * 60, 60);
// tras la estructura el precio continúa
const haystack = noise1.concat(stx, gen(200, 3, 5, 1e6 + 400 * 60));
const s = F.fixSearch({ minScore: 85 });
const r = F.search(pat.feat, haystack, s, { tfSec: 60 });
assert.ok(r.matches.length >= 1, 'encuentra la estructura escalada');
const best = r.matches[0];
assert.ok(best.score >= 90, 'parecido alto: ' + best.score);
assert.ok(Math.abs(best.i0 - 300) <= 3, 'posición correcta: ' + best.i0);

// 2) distinto largo: la misma estructura con el doble de velas (misma forma)
function stretch(bars, k) {
  const out = [];
  bars.forEach((b, i) => { for (let j = 0; j < k; j++) out.push({ time: b.time + j * 30, open: b.open, high: b.high, low: b.low, close: b.close }); });
  return out;
}
const st2 = stretch(st, 2);
const r2 = F.search(pat.feat, gen(200, 5, 1, 0).concat(st2.map((b, i) => Object.assign({}, b, { time: 1e7 + i * 30 })), gen(200, 6, 1, 2e7)), F.fixSearch({ minScore: 70, lenTol: 1 }), { tfSec: 30 });
assert.ok(r2.matches.length >= 1, 'estructura con otro número de velas');

// 3) espejo
const mir = F.mirrorFeat(pat.feat);
assert.ok(Math.abs(mir.m.wickHi - pat.feat.m.wickLo) < 1e-9);
assert.ok(Math.abs(mir.m.net + pat.feat.m.net) < 1e-9);
const inv = st.map((b) => ({ time: b.time + 5e6, open: 200 - b.open, high: 200 - b.low, low: 200 - b.high, close: 200 - b.close }));
const rNo = F.search(pat.feat, noise2.slice(0, 0).concat(inv), F.fixSearch({ minScore: 90 }), { tfSec: 60 });
const rMi = F.search(pat.feat, inv, F.fixSearch({ minScore: 90, mirror: true }), { tfSec: 60 });
assert.strictEqual(rNo.matches.length, 0, 'sin espejo no coincide');
assert.ok(rMi.matches.length >= 1 && rMi.matches[0].mirrored, 'con espejo coincide');

// 4) excluir la propia estructura marcada
const rEx = F.search(pat.feat, st, F.fixSearch({ minScore: 90 }), { tfSec: 60, exclude: { t0: 0, t1: 20 * 60 } });
assert.strictEqual(rEx.matches.length, 0);

// 5) medida obligatoria: pedir barrido de mínimo en un tramo sin barridos no coincide
const s5 = F.fixSearch({ minScore: 50 }); s5.meas.sweepLo.req = true;
const sub = F.compare(pat.feat, F.featOf(F.arraysOf(gen(40, 1, 1, 0)), 0, 20), s5);
assert.ok(sub.score === -1 || sub.score < 100);

// 6) validaciones
assert.strictEqual(F.buildPattern(st, 0, 2 * 60, 60).ok, false);
assert.strictEqual(F.buildPattern(st, 5e9, 6e9, 60).ok, false);
const fx = F.fixSearch({ minScore: 10, depth: 5, meas: { n: { w: 9 } } });
assert.strictEqual(fx.minScore, 50); assert.strictEqual(fx.depth, 1000); assert.strictEqual(fx.meas.n.w, 9); assert.ok(fx.meas.hiPos);
assert.strictEqual(F.fixSearch(null).minScore, 80);
console.log('fractal.test.js OK');

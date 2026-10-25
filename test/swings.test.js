// Swings (v0.22.4): las 3 reglas del ejemplo «Swings (3 velas + barrido + ruptura)»
const assert = require('assert');
const S = require('../renderer/js/scriptcore.js');
global.window = {}; require('../renderer/js/scriptexamples.js');
const code = global.window.TVScriptExamples.find((e) => e.name.startsWith('Swings')).code;
const mk = (rows) => ({ time: rows.map((_, i) => 1700000000 + i * 3600), open: rows.map((r) => r[0]), high: rows.map((r) => r[1]), low: rows.map((r) => r[2]), close: rows.map((r) => r[3]), volume: rows.map(() => 1), buy: null });
const mirror = (rows) => rows.map(([o, h, l, c]) => [30 - o, 30 - l, 30 - h, 30 - c]);
const run = (rows, params) => S.run({ code, params, data: mk(rows), meta: { name: 'T' } });
const circ = (r, idx, pos) => r.marks.some((m) => m.idx === idx && m.pos === pos && m.shape === 'circle');

const A = [[10, 11, 9, 10], [10, 15, 10, 14], [14, 13, 9.5, 10], [10, 12, 9, 11], [11, 17, 10.5, 16.5]];            // la 3.ª vela toma el mínimo; ruptura en la 5.ª
const B = [[10, 11, 9, 10], [10, 15, 11, 14], [14, 14, 11.5, 12], [12, 13, 11.2, 12], [12, 13, 10.5, 11], [11, 16, 11, 15.5]]; // barrido en la 5.ª vela (4.ª a la derecha)
const C = [[10, 11, 9, 10], [10, 15, 11, 14], [14, 14, 12, 13], [13, 14.5, 12, 14], [14, 14.8, 12.5, 14]];            // nunca toma el mínimo: no es swing
const D = [[10, 11, 9, 10], [10, 15, 11, 14], [14, 14, 12, 13], [13, 16, 12.5, 15], [15, 15, 12, 13], [13, 17, 13, 17]]; // máximo más extremo antes del barrido
const E = [[10, 11, 9, 10], [10, 15, 10, 14], [14, 13, 9.5, 10], [10, 15.5, 9, 14.8], [14.8, 14.9, 13, 14.9]];        // barrido, pero solo la mecha pasa el máximo: sin ruptura

for (const [name, rows, ref, barr, rup, price] of [['A', A, 1, 2, 4, 15], ['B', B, 1, 4, 5, 15], ['D', D, 3, 4, 5, 16]]) {
  const r = run(rows);
  assert.ok(circ(r, ref, 'above'), name + ': marca del swing alto');
  assert.ok(r.segments.some((s) => s.i1 === ref && s.i2 === rup && s.price === price), name + ': línea hasta la ruptura');
  assert.ok(r.marks.some((m) => m.idx === rup && m.shape === 'arrowUp'), name + ': flecha de ruptura');
  // el espejo es un swing bajo con la misma estructura
  const m = run(mirror(rows));
  assert.ok(circ(m, ref, 'below'), name + ': swing bajo');
  assert.ok(m.segments.some((s) => s.i1 === ref && s.i2 === rup && Math.abs(s.price - (30 - price)) < 1e-9), name + ': espejo línea');
  assert.ok(m.marks.some((x) => x.idx === rup && x.shape === 'arrowDown'), name + ': espejo flecha');
}
{
  const r = run(D); assert.ok(!circ(r, 1, 'above'), 'D: el pivote anterior se funde con el máximo más extremo');
  const c = run(C); assert.ok(!c.marks.some((m) => m.idx === 1), 'C: sin barrido no hay swing');
  const e = run(E); assert.ok(circ(e, 1, 'above'), 'E: hay swing con barrido');
  assert.ok(!e.marks.some((m) => m.shape === 'arrowUp'), 'E: la mecha sola no rompe');
  assert.ok(e.segments.some((s) => s.i1 === 1 && s.i2 === 4 && s.style === 'dotted'), 'E: pendiente con línea punteada');
  const e2 = run(E, { 'Mostrar swings con barrido pero sin ruptura aún': false });
  assert.ok(!e2.marks.some((m) => m.idx === 1), 'E: se puede ocultar lo pendiente');
}
// rendimiento: 30.000 velas con ruido
{
  let p = 100, seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = [];
  for (let i = 0; i < 30000; i++) { const o = p, c = p + (rnd() - 0.5) * 2; p = c; rows.push([o, Math.max(o, c) + rnd(), Math.min(o, c) - rnd(), c]); }
  const t0 = Date.now(); const r = run(rows); const ms = Date.now() - t0;
  console.log('swings 30000 velas:', ms, 'ms,', r.marks.length, 'marcas'); assert.ok(ms < 2500);
}
console.log('swings.test.js OK');

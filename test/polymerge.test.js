// Fusionar y dividir polilíneas (v0.22.16)
const assert = require('assert');
const D = require('../renderer/js/draw.js');
let drawings = [];
const store = D.createStore(() => drawings, () => ({}), () => {}, () => []);
const sym = 'BTCUSDT';
const mk = (pts, extra) => Object.assign(D.defaults('poly'), { type: 'poly', pts: pts.map(([t, p]) => ({ t, p })) }, extra || {});
store.add(sym, mk([[10, 1], [20, 2], [30, 3], [40, 4], [50, 5]], { color: '#ff0000', labels: { 1: 'A' }, segs: { 2: { hidden: true } } }));
store.add(sym, mk([[60, 1], [70, 2], [80, 3]], { color: '#00ff00', capB: 'bar', labels: { 0: 'X' } }));
const ids = store.list(sym).map((d) => d.id);
const m = store.mergePolys(sym, ids.slice().reverse());
assert.strictEqual(m.pts.length, 8);
assert.deepStrictEqual(m.parts.map((q) => q.n), [5, 3]);
assert.strictEqual(m.labels[1], 'A'); assert.strictEqual(m.labels[5], 'X');
assert.ok(m.segs[2].hidden);
assert.strictEqual(m.capB, 'bar');
assert.strictEqual(store.list(sym).filter((d) => d.type === 'poly').length, 1);
const back = store.splitPoly(sym, m.id);
assert.deepStrictEqual(back.map((d) => d.pts.length), [5, 3]);
assert.strictEqual(back[0].color, '#ff0000'); assert.strictEqual(back[1].color, '#00ff00');
assert.strictEqual(back[1].labels[0], 'X'); assert.ok(back[0].segs[2].hidden); assert.strictEqual(back[1].capB, 'bar');
// dividir en un tramo
const one = store.add(sym, mk([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]]));
assert.deepStrictEqual(store.splitPoly(sym, one.id, 0), []);       // quedaría 1 punto
const parts = store.splitPoly(sym, one.id, 2);
assert.deepStrictEqual(parts.map((d) => d.pts.length), [3, 3]);
console.log('polymerge.test.js OK');

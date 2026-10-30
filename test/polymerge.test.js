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
// plantillas: todas las propiedades por defecto de cada herramienta se guardan y se aplican (v0.22.18)
{
  const D2 = require('../renderer/js/draw.js');
  for (const t of Object.keys(D2.TYPES)) {
    if (D2.TYPES[t].ephemeral) continue;
    const dd = D2.defaults(t);
    const miss = Object.keys(dd).filter((k) => !D2.TEMPLATE_KEYS.includes(k));
    assert.deepStrictEqual(miss, [], t + ' tiene propiedades fuera de las plantillas: ' + miss);
  }
  const prefs = {};
  const root2 = []; const st2 = D2.createStore(() => root2, () => prefs, () => {}, () => []);
  const a = st2.add('X', Object.assign(D2.defaults('trend'), { type: 'trend', pts: [{ t: 1, p: 1 }, { t: 2, p: 2 }], capA: 'circle', capB: 'arrow' }));
  st2.saveTemplate('trend', 'Puntas', a);
  const b = st2.add('X', Object.assign(D2.defaults('trend'), { type: 'trend', pts: [{ t: 3, p: 1 }, { t: 4, p: 2 }] }));
  const tpl = st2.userTemplates('trend')[0];
  assert.ok(st2.applyTemplate('X', b.id, tpl.id));
  assert.strictEqual(st2.get('X', b.id).capA, 'circle'); assert.strictEqual(st2.get('X', b.id).capB, 'arrow');
}
console.log('plantillas OK');

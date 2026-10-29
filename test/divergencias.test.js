// Divergencias RSI vs swings (v0.22.14)
const assert = require('assert');
const S = require('../renderer/js/scriptcore.js');
global.window = {}; require('../renderer/js/scriptexamples.js');
const code = global.window.TVScriptExamples.find((e) => e.name.startsWith('Divergencias')).code;
const mk = (rows) => ({ time: rows.map((_, i) => 1700000000 + i * 3600), open: rows.map((r) => r[0]), high: rows.map((r) => r[1]), low: rows.map((r) => r[2]), close: rows.map((r) => r[3]), volume: rows.map(() => 1), buy: null });
const run = (rows, params) => S.run({ code, params, data: mk(rows), meta: { name: 'T' } });
function rnd(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
function walk(n, seed) {
  const r = rnd(seed); let p = 100; const rows = [];
  for (let i = 0; i < n; i++) { const o = p; p = p + (r() - 0.5) * 3 + Math.sin(i / 25) * 0.8; const h = Math.max(o, p) + r() * 1.2, l = Math.min(o, p) - r() * 1.2; rows.push([o, h, l, p]); }
  return rows;
}
const mirror = (rows) => rows.map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c]);
const rows = walk(3000, 11);
const r = run(rows);
assert.ok(!r.error, 'sin error: ' + (r.error && r.error.message));
const txt = r.marks.filter((m) => /^D\d /.test(m.text));
assert.ok(txt.length > 10, 'hay divergencias: ' + txt.length);
assert.ok(txt.every((m) => /^D\d [+-]\d+\.\d%\/[+-]\d+\.\d F\d+\.\d \d+% (NC|C|S)$/.test(m.text)), 'formato del texto');
assert.ok(r.marks.some((m) => m.text === 'C'), 'hay confirmadas');
assert.ok(txt.some((m) => / NC$/.test(m.text)) || txt.some((m) => / S$/.test(m.text)), 'hay no confirmadas o superadas');
assert.ok(r.plots.length === 3, '3 líneas: RSI y las dos de divergencia');
// ninguna divergencia bajista (marca arriba) tiene precio a la baja ni RSI al alza
txt.filter((m) => m.pos === 'above').forEach((m) => { const mm = /([+-]\d+\.\d)%\/([+-]\d+\.\d)/.exec(m.text); assert.ok(+mm[1] >= 0 && +mm[2] <= 0, 'bajista: precio sube y RSI baja ' + m.text); });
txt.filter((m) => m.pos === 'below').forEach((m) => { const mm = /([+-]\d+\.\d)%\/([+-]\d+\.\d)/.exec(m.text); assert.ok(+mm[1] <= 0 && +mm[2] >= 0, 'alcista: precio baja y RSI sube ' + m.text); });
// espejo: el RSI de un precio espejado es 100 - RSI, así que las señales son las mismas con el signo cambiado
const m = run(mirror(rows));
const key = (res, flip) => res.marks.filter((x) => /^D\d /.test(x.text)).map((x) => x.idx + ':' + ((x.pos === 'above') !== flip ? 'A' : 'B') + ':' + x.text.split(' ').pop()).sort().join(',');
assert.strictEqual(key(m, true), key(r, false), 'espejo simétrico');
// los parámetros se respetan: con fuerza mínima altísima no hay señales
const nada = run(rows, { 'Fuerza mínima para mostrar': 100000 });
assert.ok(!nada.marks.some((x) => /^D\d/.test(x.text)), 'fuerza mínima');
// sin repintar: con menos velas, las señales ya confirmadas antes del corte no cambian
const cut = 2000;
const short = run(rows.slice(0, cut));
const conf = (res, lim) => res.marks.filter((x) => x.text === 'C' && x.idx < lim).map((x) => x.idx + x.pos).sort().join(',');
assert.strictEqual(conf(short, cut - 300), conf(r, cut - 300), 'confirmadas sin repintar');
// rendimiento
const t0 = Date.now(); run(walk(30000, 5)); const ms = Date.now() - t0;
assert.ok(ms < 4000, 'rendimiento ' + ms);
console.log('divergencias.test.js OK (' + txt.length + ' señales; 30.000 velas en ' + ms + ' ms)');

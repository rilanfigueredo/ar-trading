const assert = require('assert');
const L = require('../renderer/js/lib.js');
const t = (id) => L.tfById(id);
const eq = assert.strictEqual;
const c0 = (time, o, h, l, cl, v = 1) => ({ time, open: o, high: h, low: l, close: cl, volume: v });
const c = c0;

// 40m: 8 velas de 5m -> 1 vela
{
  const base = [];
  for (let i = 0; i < 16; i++) base.push(c(i * 300, i, i + 2, i - 1, i + 1));
  const out = L.aggregate(base, L.makeTf('m', 40));
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].time, 0);
  assert.strictEqual(out[0].open, 0);
  assert.strictEqual(out[0].close, 8);
  assert.strictEqual(out[0].high, 9);
  assert.strictEqual(out[0].low, -1);
  assert.strictEqual(out[0].volume, 8);
  assert.strictEqual(out[1].time, 2400);
}
// 4D: bloques de 4 dias desde el primer dia
{
  const a = Date.UTC(2017, 7, 17) / 1000;
  const base = [];
  for (let i = 0; i < 9; i++) base.push(c(a + i * 86400, 10, 10 + i, 5, 10));
  const out = L.aggregate(base, L.makeTf('d', 4), a);
  assert.strictEqual(out.length, 3);
  assert.strictEqual(out[0].time, a);
  assert.strictEqual(out[1].time, a + 4 * 86400);
  assert.strictEqual(out[2].time, a + 8 * 86400);
  assert.strictEqual(out[0].high, 13);
}
// 4 meses: ene-abr, may-ago, sep-dic
{
  const base = [];
  for (let m = 0; m < 12; m++) base.push(c(Date.UTC(2024, m, 1) / 1000, 1, 1 + m, 1, 1));
  const out = L.aggregate(base, L.makeTf('M', 4));
  assert.strictEqual(out.length, 3);
  assert.strictEqual(out[0].time, Date.UTC(2024, 0, 1) / 1000);
  assert.strictEqual(out[1].time, Date.UTC(2024, 4, 1) / 1000);
  assert.strictEqual(out[2].time, Date.UTC(2024, 8, 1) / 1000);
  assert.strictEqual(out[2].high, 12);
}
// merge: reemplaza la ultima y agrega nuevas
{
  const base = [c(0, 1, 1, 1, 1), c(60, 1, 1, 1, 1)];
  L.mergeCandles(base, [c(60, 1, 2, 1, 2), c(120, 2, 2, 2, 2)]);
  assert.strictEqual(base.length, 3);
  assert.strictEqual(base[1].close, 2);
  L.mergeCandles(base, [c(-60, 0, 0, 0, 0)]);
  assert.strictEqual(base[0].time, -60);
}
// SMA y EMA
{
  const s = L.sma([1, 2, 3, 4, 5], 3);
  assert.deepStrictEqual(s, [null, null, 2, 3, 4]);
  const e = L.ema([1, 2, 3, 4, 5], 3);
  assert.strictEqual(e[2], 2);
  assert.strictEqual(e[3], 3);
  assert.strictEqual(e[4], 4);
  const e2 = L.ema([2, 4, 6, 5], 3); // semilla 4, k=0.5 -> 4.5
  assert.strictEqual(e2[3], 4.5);
}
assert.strictEqual(L.themedColor('#000000', 'dark'), '#e0e3eb');
assert.strictEqual(L.themedColor('#2962ff', 'dark'), '#2962ff');

// --- Temporalidades personalizadas ---
{
  const a = L.makeTf('m', 620);
  eq(a.id, 'm:620'); eq(a.base, '5m'); eq(a.ratio, 124); eq(a.kind, 'fixed');
  const b = L.makeTf('m', 24);
  eq(b.base, '3m'); eq(b.ratio, 8);
  const c = L.makeTf('h', '4,3');
  eq(c.id, 'm:258'); eq(c.label, '4h 18m'); eq(c.base, '3m'); eq(c.ratio, 86);
  eq(L.makeTf('h', 4.3).id, 'm:258');
  eq(L.makeTf('h', 1).id, 'm:60'); eq(L.makeTf('h', 1).kind, 'native');
  eq(L.makeTf('h', 24).id, 'd:1');
  eq(L.makeTf('h', 168).id, 'w:1');
  eq(L.makeTf('d', 1.5).id, 'm:2160');
  eq(L.makeTf('w', 2).kind, 'anchor');
  eq(L.makeTf('M', 4).kind, 'months');
  eq(L.makeTf('h', 4.3333).note.length > 0, true); // aviso de redondeo
  assert.throws(() => L.makeTf('m', 0), /mayor que 0/);
  assert.throws(() => L.makeTf('m', 'abc'), /mayor que 0/);
  assert.throws(() => L.makeTf('M', 1.5), /enteros/);
  assert.throws(() => L.makeTf('M', 100), /60/);
  // ids antiguos
  eq(L.tfById('1h').id, 'm:60'); eq(L.tfById('4D').id, 'd:4'); eq(L.tfById('4M').id, 'M:4'); eq(L.tfById('basura').id, 'm:60');
  // agregación de 24m desde velas de 3m
  const base = [];
  for (let i = 0; i < 20; i++) base.push(c0(i * 180, i, i + 1, i - 1, i + 0.5));
  const out = L.aggregate(base, b);
  eq(out.length, 3); eq(out[0].time, 0); eq(out[1].time, 1440);
  eq(out[0].open, 0); eq(out[0].close, 7.5); eq(out[0].high, 8); eq(out[0].low, -1);
  // 4 horas 18 min: los bloques abren en múltiplos de 258 min desde 00:00 UTC
  const cb = L.aggregate([c0(0, 1, 1, 1, 1), c0(15480, 2, 2, 2, 2)], c);
  eq(cb.length, 2); eq(cb[1].time, 15480);
  // 5 meses: no divide 12, se cuenta desde el primer mes con datos
  const m5 = L.makeTf('M', 5);
  eq(L.needsAnchor(m5), true); eq(L.needsAnchor(L.makeTf('M', 4)), false);
  const a0 = Date.UTC(2020, 2, 1) / 1000; // marzo 2020
  const mb = [];
  for (let m = 0; m < 10; m++) mb.push(c0(Date.UTC(2020, 2 + m, 1) / 1000, 1, 1 + m, 1, 1));
  const mo = L.aggregate(mb, m5, a0);
  eq(mo.length, 2); eq(mo[0].time, a0); eq(mo[1].time, Date.UTC(2020, 7, 1) / 1000);
}
console.log('Todas las pruebas pasaron');

// ---- Velas por volumen ----
{
  const assert = require('assert');
  const L = require('../renderer/js/lib.js');
  const t = L.tfById('v:256'); assert.strictEqual(t.kind, 'vol'); assert.strictEqual(t.vol, 256);
  assert.strictEqual(L.makeTf('v', '0,5').id, 'v:0.5'); assert.strictEqual(L.tfById('v:0.5').vol, 0.5);
  const trades = [[1, 100, 4, 1000000], [2, 102, 3, 1001000], [3, 99, 5, 1002000], [4, 101, 10, 1003000], [5, 105, 1, 1003500]];
  const bars = [];
  L.volAppend(bars, trades, 10);
  assert.strictEqual(bars.length, 3);
  assert.deepStrictEqual([bars[0].open, bars[0].high, bars[0].low, bars[0].close, bars[0].volume], [100, 102, 99, 99, 10]);
  assert.strictEqual(bars[1].open, 99); assert.strictEqual(bars[1].close, 101); assert.strictEqual(bars[1].volume, 10);
  assert.strictEqual(bars[2].volume, 3); assert.strictEqual(bars[2].close, 105);
  assert.ok(bars[0].time < bars[1].time && bars[1].time < bars[2].time);
  // incremental = completo
  const b2 = []; trades.forEach((x) => L.volAppend(b2, [x], 10));
  assert.deepStrictEqual(b2.map((b) => [b.open, b.high, b.low, b.close, b.volume]), bars.map((b) => [b.open, b.high, b.low, b.close, b.volume]));
  // prepend: construye hacia atrás con volumen exacto y tiempos crecientes
  const all = []; for (let i = 1; i <= 400; i++) all.push([i, 100 + (i % 7), 0.3 + (i % 5) * 0.1, 1700000000000 + i * 200]);
  const cut = 250;
  const fb = []; L.volAppend(fb, all.filter((x) => x[0] >= cut), 5);
  const n0 = fb.length;
  const added = L.volPrepend(fb, all.filter((x) => x[0] < cut), 5);
  assert.ok(added > 10);
  for (let i = 0; i < added; i++) assert.ok(Math.abs(fb[i].volume - 5) < 1e-6);
  for (let i = 1; i < fb.length; i++) assert.ok(fb[i].time > fb[i - 1].time);
  const sumOld = all.filter((x) => x[0] < cut).reduce((a, x) => a + x[2], 0) + (fb[added].aQ - fb[added].aq);
  assert.ok(added * 5 <= sumOld + 1e-6 && (added + 1) * 5 > sumOld - 1e-6);
  assert.strictEqual(fb.length, n0 + added);
  console.log('Pruebas de velas por volumen: ok');
}

// ---- Temporalidades desde 1 segundo ----
{
  const assert = require('assert');
  const L = require('../renderer/js/lib.js');
  assert.strictEqual(L.makeTf('s', 1).id, 's:1');
  assert.strictEqual(L.makeTf('s', 30).sec, 30);
  assert.strictEqual(L.makeTf('s', 90).id, 's:90');
  assert.strictEqual(L.makeTf('m', 1.5).id, 's:90');
  assert.strictEqual(L.makeTf('m', 5).id, 'm:5');
  assert.strictEqual(L.makeTf('s', 3600).id, 'm:60');
  assert.throws(() => L.makeTf('s', 0.4));
  assert.strictEqual(L.tfById('s:45').label, '45s');
  assert.strictEqual(L.tfById('s:30').base, '1s');
  console.log('Pruebas de segundos: ok');
}

// ---- v0.8: duraciones "raras" se ajustan para no armarlas con miles de velas de 1 minuto / 1 segundo
{
  const a = L.makeTf('d', 30.1);               // 30 d 2 h 24 m: v0.12 respeta la duración exacta (14448 velas de 3 m por barra)
  eq(a.base, '3m'); eq(a.sec, 2600640); eq(a.ratio, 14448); assert.ok(/exacta/i.test(a.note));
  const b = L.makeTf('d', 29.53);
  eq(b.id, 'd:30');                            // 29,53 d necesitaría 42523 velas de 1 m por barra: se ajusta
  const x = L.makeTf('s', 1200000);             // 13 d 21 h 20 m: exacta con velas de 5 m (4000 por barra)
  eq(x.sec, 1200000); eq(x.base, '5m'); eq(x.ratio, 4000); eq(x.kind, 'fixed'); assert.ok(/exacta/i.test(x.note));
  eq(L.bucketStart(x, 1200000 * 3 + 5), 1200000 * 3);  // cada barra dura exactamente 1.200.000 s
  eq(L.makeTf('s', 1200001).id, 'w:2');         // con velas de 1 s no se puede: se ajusta (y se avisa)
  const c = L.makeTf('s', 3601);                // 1 h 1 s -> 1 h
  eq(c.id, 'm:60'); assert.ok(c.note.length > 0);
  const d = L.makeTf('h', 5.0083);              // 5 h 30 s -> 5 h
  eq(d.id, 'm:300');
  const e = L.makeTf('m', 137);                 // 2 h 17 m: ratio 137 (< 300) se respeta tal cual
  eq(e.id, 'm:137'); eq(e.base, '1m'); eq(e.ratio, 137);
  const f = L.makeTf('d', 25.5);                // 25 d 12 h se arma con velas de 12 h
  eq(f.base, '12h'); eq(f.sec, 25.5 * 86400); eq(f.label, '25d 12h');
  // con velas base de 1 s nunca más de MAX_RATIO por barra; en general nunca más de MAX_EXACT_RATIO
  for (const [u, v] of [['d', 33.3], ['d', 27.77], ['h', 71.3], ['w', 4.3], ['h', 9.99], ['m', 1234], ['s', 100001]]) {
    const t = L.makeTf(u, v);
    assert.ok(t.ratio <= L.MAX_EXACT_RATIO, `${u}${v} -> ratio ${t.ratio}`);
    if (t.base === '1s') assert.ok(t.ratio <= L.MAX_RATIO, `${u}${v} -> ratio ${t.ratio}`);
  }
  eq(L.labelDur(2600640), '30 d 2 h 24 m');
}
console.log('Pruebas de duraciones grandes: ok');

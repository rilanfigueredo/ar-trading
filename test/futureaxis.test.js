const assert = require('assert');
const FA = require('../renderer/js/futureaxis.js');
const t0 = Date.UTC(2026, 9, 24) / 1000, t1 = Date.UTC(2028, 9, 24) / 1000;
// 2 años con ~60 px por mes: marcas mensuales o más amplias, ordenadas y dentro del rango
const px = 60 / (30 * 86400);
const k = FA.ticks(t0, t1, px, true, 90);
assert(k.length > 5 && k.length < 40, 'cantidad de marcas ' + k.length);
for (let i = 1; i < k.length; i++) assert(k[i].t > k[i - 1].t);
assert(k.every((x) => x.t >= t0 && x.t <= t1));
assert(k.some((x) => x.type === 0), 'debe haber una marca de año');
// 1 hora por vela, 8 px por vela: marcas dentro del día
const h = FA.ticks(t0, t0 + 3 * 86400, 8 / 3600, true, 90);
assert(h.length > 5 && h.some((x) => x.type === 3));
assert.deepStrictEqual(FA.ticks(5, 5, 1, true), []);
console.log('futureaxis OK');

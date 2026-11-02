'use strict';
const assert = require('assert'); const { analyzeTrade, closeNet } = require('../renderer/funciones/simulador/exits'); const ch = require('../renderer/funciones/simulador/charts');
let ok = 0; const t = (n, f) => { f(); ok++; console.log('OK  ' + n); };
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-6, m + ': ' + a + ' vs ' + b);
const base = { side: 'short', capital: 500, avgEntry: 100000, qty: 0.0125, entryFees: 0.625, wb: 499.375 };
t('cierre parcial a mercado y TP sobre lo que queda (cálculo a mano)', () => {
  const r = analyzeTrade({ ...base, closes: [{ price: 98000, pct: 25 }], closeType: 'taker',
    tps: [{ price: 94000, pct: 50 }, { price: 90000, pct: 50 }] });
  const c = 0.003125 * 2000 - 0.003125 * 98000 * 0.0005, t1 = 0.0046875 * 6000 - 0.0046875 * 94000 * 0.0002, t2 = 0.0046875 * 10000 - 0.0046875 * 90000 * 0.0002;
  near(r.closeRows[0].net, c, 'cierre'); near(r.tpRows[0].net, t1, 'tp1'); near(r.tpRows[1].net, t2, 'tp2');
  near(r.bestCase, c + t1 + t2 - 0.625, 'total'); near(r.remainingPct, 75, 'resta');
  assert(r.closeRows[0].liqAfter > 0 && r.tpRows[1].liqAfter === null);
});
t('cierre con pérdida se detecta (short cerrando por encima de la entrada)', () => {
  assert(closeNet({ side: 'short', qty: 0.0125, avg: 100000, pct: 25, price: 101000 }).net < 0);
  assert(closeNet({ side: 'long', qty: 0.0125, avg: 100000, pct: 25, price: 99000 }).net < 0);
  assert(closeNet({ side: 'long', qty: 0.0125, avg: 100000, pct: 25, price: 101000 }).net > 0);
});
t('stop: pérdida total, tras cierres parciales, riesgo y relación', () => {
  const r = analyzeTrade({ ...base, closes: [{ price: 98000, pct: 50 }], tps: [{ price: 90000, pct: 100 }], sl: 105000 });
  near(r.slWhole.total, -(0.0125 * 5000) - 0.0125 * 105000 * 0.0005 - 0.625, 'sl');
  assert(r.slAfterCloses.total > r.slWhole.total, 'cerrar antes reduce la pérdida'); near(r.riskPct, -r.slWhole.total / 5, 'riesgo');
  near(r.rr, r.bestCase / r.riskUSDT, 'rr');
});
t('avisos: cierres > 100%, TP sin 100%', () => {
  const r = analyzeTrade({ ...base, closes: [{ price: 98000, pct: 60 }, { price: 97000, pct: 60 }], tps: [{ price: 90000, pct: 40 }] });
  assert(r.warn.some((w) => w.includes('cierres parciales suman')) && r.warn.some((w) => w.includes('sin cerrar')));
});
t('gráficos devuelven SVG', () => {
  const m = ch.priceMap([{ label: 'Entrada', price: 100, kind: 'entry' }, { label: 'Liquidación', price: 140, kind: 'liq' }, { label: 'TP 1', price: 90, kind: 'tp' }]);
  assert(m.startsWith('<svg') && m.includes('Liquidación'));
  assert(ch.barsPnL([{ label: 'a', value: 5, text: '+5' }, { label: 'b', value: -3, text: '-3' }]).includes('<rect'));
  assert(ch.bars([{ label: '1', value: 10, text: '10%' }]).includes('<rect')); assert(ch.donut(30, 'x').includes('circle'));
  assert.strictEqual(ch.priceMap([{ label: 'a', price: 1 }]), '');
});
console.log('\n' + ok + ' pruebas correctas');
(function () {
  const { analyzeTrade: a } = require('../renderer/funciones/simulador/exits'); const c = require('../renderer/funciones/simulador/calc');
  const b = { side: 'short', capital: 500, avgEntry: 100000, qty: 0.0125, entryFees: 0.625, wb: 499.375, leverage: 50 };
  const r = a({ ...b, closes: [{ price: 98000, pct: 50 }, { price: 96000, pct: 25 }] });
  near(r.closeRows[0].marginReleased, 0.00625 * 100000 / 50, 'margen liberado'); near(r.closeRows[0].returns, r.closeRows[0].marginReleased + r.closeRows[0].net, 'vuelve');
  assert(r.bestCase !== null && r.warn.some((w) => w.includes('abierta')), 'solo cierres: resultado y aviso');
  assert(r.closeRows[0].liqAfter > 0 && r.closeRows[1].liqAfter > r.closeRows[0].liqAfter, 'cada cierre aleja la liquidación');
  const o = { side: 'short', capital: 500, leverage: 50, takerFee: 0.0005, pctBase: 'available', entries: [{ price: 80000, marginPct: 5 }, { price: 87000, marginPct: 4 }], targetDistancePct: 40 };
  const e = c.exposureForTarget(o); near(e.finalDistancePct, 40, 0.5, 'distancia'); near(e.pcts[0] / e.pcts[1], 5 / 4, 1e-9, 'proporción de tus %');
  assert(e.k < 1 && e.currentDistancePct < 40, 'hay que reducir'); const e2 = c.exposureForTarget({ ...o, targetDistancePct: 5 }); assert(e2.k > 1, 'puedes aumentar');
  console.log('OK  cierres: margen liberado, solo-cierres y exposición con tus propios %'); ok += 1;
})();

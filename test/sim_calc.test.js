'use strict';
const assert = require('assert');
const c = require('../renderer/funciones/simulador/calc');
let ok = 0; const t = (n, f) => { f(); ok++; console.log('OK  ' + n); };
const near = (a, b, tol, m) => assert(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`);

t('cum de tramos (fórmula Binance)', () => {
  const x = c.withCum(c.DEFAULT_TIERS);
  [0, 300, 1500, 12000, 132000, 482000, 2982000, 14482000].forEach((v, i) => near(x[i].cum, v, 0.01, 'cum' + i));
});
t('margen de mantenimiento: ejemplo oficial 260.000 al 1% - 1.300 = 1.300', () => {
  near(260000 * 0.01 - 1300, 1300, 1e-9, 'mm');
});
t('ejemplo OFICIAL de Binance (cruzado BTCUSDT) = 26.316,89', () => {
  const lp = c.liqFormula({ side: 'long', qty: 109.488, entry: 32481.98, wb: 1535443.01,
    cum: 16300, mmr: 0.025, tmm: 356512.508, upnl: -448192.89 });
  near(lp, 26316.89, 0.05, 'lp');
});
t('escalera short 50x, capital 500, 3 entradas de 5% (sin comisiones)', () => {
  const st = c.simulateLadder({ side: 'short', capital: 500, leverage: 50, takerFee: 0,
    entries: [{ price: 100000, marginPct: 5 }, { price: 102000, marginPct: 5 }, { price: 105060, marginPct: 5 }] });
  near(st[0].notional, 1250, 1e-9, 'nocional'); near(st[2].totalMarginPct, 15, 1e-9, '15%');
  [139442, 120705, 115492].forEach((v, i) => {
    near(st[i].liq, v, 1.5, 'liq' + i);
    // comprobación independiente (forma cerrada, tramo 1): (WB/Q + EP)/(1+MMR)
    near(st[i].liq, (500 / st[i].totalQty + st[i].avgEntry) / 1.004, 1e-6, 'cerrada' + i);
  });
  assert(st[0].liq > st[1].liq && st[1].liq > st[2].liq, 'cada promediación acerca la liquidación');
});
t('20x queda más lejos que 50x con las mismas entradas', () => {
  const e = [{ price: 100000, marginPct: 5 }, { price: 102000, marginPct: 5 }, { price: 105060, marginPct: 5 }];
  const a = c.simulateLadder({ side: 'short', capital: 500, leverage: 20, takerFee: 0, entries: e });
  const b = c.simulateLadder({ side: 'short', capital: 500, leverage: 50, takerFee: 0, entries: e });
  assert(a[2].liq > b[2].liq);
});
t('comisiones acercan la liquidación', () => {
  const e = [{ price: 100000, marginPct: 5 }];
  const a = c.simulateLadder({ side: 'short', capital: 500, leverage: 50, takerFee: 0, entries: e });
  const b = c.simulateLadder({ side: 'short', capital: 500, leverage: 50, takerFee: 0.0005, entries: e });
  assert(b[0].liq < a[0].liq);
});
t('long con poco apalancamiento: sin liquidación', () => {
  const st = c.simulateLadder({ side: 'long', capital: 500, leverage: 1, takerFee: 0, entries: [{ price: 100000, marginPct: 5 }] });
  assert.strictEqual(st[0].liq, null);
});
t('salto de tramo: posición grande cambia la tasa', () => {
  const r = c.liqPrice({ side: 'short', qty: 20, entry: 100000, wb: 1e6 });
  assert(r.rate >= 0.005, 'tasa subió de tramo');
});
t('advertencia: margen supera capital', () => {
  const st = c.simulateLadder({ side: 'long', capital: 100, leverage: 10, entries: [{ price: 100, marginPct: 120 }] });
  assert(st[0].warn.length > 0);
});
console.log(`\n${ok} pruebas correctas`);

'use strict';
const assert = require('assert'); const c = require('../renderer/funciones/simulador/calc'); const { analyzeExits } = require('../renderer/funciones/simulador/exits');
let ok = 0; const t = (n, f) => { f(); ok++; console.log('OK  ' + n); };
const near = (a, b, tol, m) => assert(Math.abs(a - b) <= tol, m + ': ' + a + ' vs ' + b);
const E3 = [{ price: 100000, marginPct: 5 }, { price: 102000, marginPct: 5 }, { price: 105060, marginPct: 5 }];
const base = { side: 'short', capital: 500, leverage: 50, takerFee: 0, entries: E3 };

t('3 punto de equilibrio: el neto en ese precio es 0', () => {
  const st = c.simulateLadder({ ...base, takerFee: 0.0005 }), l = st[2];
  const p = l.breakEvenTaker, net = -1 * l.totalQty * (p - l.avgEntry) - l.totalQty * p * 0.0005 - l.fees;
  near(net, 0, 1e-6, 'neto'); assert(l.breakEvenMaker > l.breakEvenTaker, 'maker cobra menos');
});
t('5 resultado si toca el stop tras cada entrada', () => {
  const st = c.simulateLadder({ ...base, sl: 106000 });
  near(st[0].slNet, -(0.0125 * 6000), 1e-9, 'sl1'); assert(st[2].slNet < st[1].slNet && st[1].slNet < st[0].slNet);
});
t('3 estado de cuenta: ratio de margen sube con cada entrada', () => {
  const st = c.simulateLadder(base);
  assert(st[2].marginRatioPct > st[0].marginRatioPct); near(st[0].upnl, 0, 1e-9, 'upnl1');
  near(st[1].upnl, -1 * st[1].totalQty * (102000 - st[1].avgEntry), 1e-9, 'upnl2');
});
t('6 funding: pagar acerca la liquidación, recibir la aleja', () => {
  const o = { ...base, entries: [E3[0]], holdHours: 24 };
  const pay = c.simulateLadder({ ...o, side: 'long', fundingRatePct: 0.01 })[0], rec = c.simulateLadder({ ...o, fundingRatePct: 0.01 })[0];
  near(pay.fundingCost, 1250 * 0.0001 * 3, 1e-9, 'long paga'); near(rec.fundingCost, -1250 * 0.0001 * 3, 1e-9, 'short recibe');
  const none = c.simulateLadder({ ...o, fundingRatePct: 0 })[0]; assert(rec.liq > none.liq, 'recibir aleja');
});
t('7 comisión de liquidación', () => {
  const l = c.simulateLadder({ ...base, entries: [E3[0]] })[0];
  near(l.liqInfo.clearanceFee, 0.0125 * l.liq * 0.0125, 1e-9, 'fee'); assert(l.liqInfo.remaining >= 0);
});
t('8 lectura de tramos: formato simple y fila pegada de Binance', () => {
  const a = c.parseTiers('0,0.004,150\n300000,0.005'); assert.strictEqual(a.length, 2); assert.strictEqual(a[0].maxLev, 150);
  const b = c.parseTiers('1\t0 - 300,000\t150x\t0.40%\t0\n2\t300,000 - 800,000\t100x\t0.50%\t300');
  assert.deepStrictEqual(b.map((x) => [x.floor, x.rate, x.maxLev]), [[0, 0.004, 150], [300000, 0.005, 100]]);
  const d = c.parseTiers('0 < Position ≤ 5,000 · 1.50%'); near(d[0].rate, 0.015, 1e-12, 'anuncio');
});
t('9 validaciones: lote, mínimo y apalancamiento máximo', () => {
  const st = c.simulateLadder({ ...base, lotStep: 0.001, minNotional: 100, entries: [E3[0]] });
  near(st[0].totalQty, 0.012, 1e-12, 'lote'); near(st[0].notional, 1200, 1e-9, 'nocional');
  const tiny = c.simulateLadder({ ...base, lotStep: 0.001, entries: [{ price: 100000, marginPct: 0.1 }] });
  assert(tiny[0].warn.length && tiny[0].liq === null);
  const hi = c.simulateLadder({ ...base, leverage: 200, entries: [E3[0]] }); assert(hi[0].warn.some((w) => w.includes('máximo')));
});
t('10 aislado: liquidación con el margen de la posición', () => {
  const st = c.simulateLadder({ ...base, mode: 'isolated', leverage: 20, entries: [E3[0]] });
  near(st[0].liq, (25 / 0.005 + 100000) / 1.004, 1e-6, 'aislado');
});
t('12 entrada límite (maker): comisión menor y sin deslizamiento', () => {
  const mk = c.simulateLadder({ ...base, takerFee: 0.0005, makerFee: 0.0002, slippagePct: 0.1, entries: [{ ...E3[0], type: 'maker' }] })[0];
  const tk = c.simulateLadder({ ...base, takerFee: 0.0005, makerFee: 0.0002, slippagePct: 0.1, entries: [E3[0]] })[0];
  assert(mk.fees < tk.fees); near(mk.avgEntry, 100000, 1e-9, 'sin deslizamiento'); near(tk.avgEntry, 99900, 1e-9, 'short vende más bajo');
});
t('1 liquidación después de cada TP parcial', () => {
  const st = c.simulateLadder(base)[2];
  const r = analyzeExits({ side: 'short', capital: 500, avgEntry: st.avgEntry, qty: st.totalQty, entryFees: 0, wb: st.wb,
    tps: [{ price: 95000, pct: 50 }, { price: 90000, pct: 50 }] });
  assert(r.tpRows[0].liqAfter > st.liq, 'más lejos'); assert.strictEqual(r.tpRows[1].liqAfter, null);
});
t('2 exposición máxima: la distancia final cumple el objetivo', () => {
  const r = c.maxExposure({ ...base, prices: [100000, 102000, 105060], targetDistancePct: 20 });
  assert(!r.limitedByCapital); near(r.finalDistancePct, 20, 0.01, 'dist'); assert(r.totalMarginPct > 0 && r.totalMarginPct < 100);
});
t('salvavidas: agregar saldo aleja la liquidación y el monto necesario cumple el objetivo', () => {
  const l = c.simulateLadder({ ...base })[2], price = 105060;
  const g = c.lifeguard({ side: 'short', qty: l.totalQty, avgEntry: l.avgEntry, wb: l.wb, price, deposits: [200, 300], targetDistancePct: 40 });
  assert(g.rows[1].liq > g.rows[0].liq && g.rows[2].liq > g.rows[1].liq); near(g.rows[2].total, 500, 1e-9, 'acumulado');
  const chk = c.liqPrice({ side: 'short', qty: l.totalQty, entry: l.avgEntry, wb: l.wb + g.needed.amount }).price;
  near((chk - price) / price * 100, 40, 1e-6, 'objetivo');
});
console.log('\n' + ok + ' pruebas correctas');
const c2 = require('../renderer/funciones/simulador/calc'); const near2 = (a, b, tol, m) => assert(Math.abs(a - b) <= tol, m + ': ' + a + ' vs ' + b);
(function () {
  const o = { side: 'short', capital: 500, leverage: 50, takerFee: 0.0005, entries: [{ price: 80000, marginPct: 5 }, { price: 87000, marginPct: 4 }, { price: 90000, marginPct: 5 }] };
  const a = c2.simulateLadder({ ...o, pctBase: 'available' }), b = c2.simulateLadder(o);
  near2(a[0].margin, 25, 1e-9, 'm1'); near2(a[1].availBefore, 500 - 25 - 1250 * 0.0005, 1e-9, 'saldo 2');
  near2(a[1].margin, 0.04 * (500 - 25 - 0.625), 1e-9, 'm2 = 4% del saldo disponible'); near2(b[1].margin, 20, 1e-9, 'm2 base inicial = 4% de 500');
  near2(a[2].availBefore, 500 - 25 - 0.625 - a[1].margin - a[1].notional * 0.0005, 1e-9, 'saldo 3'); assert(a[2].margin < 0.05 * 500 - 1, 'm3 sobre ~455');
  const r = c2.maxExposure({ ...o, pctBase: 'available', prices: [80000, 87000, 90000], targetDistancePct: 20 });
  near2(r.finalDistancePct, 20, 0.01, 'exposición con saldo disponible'); near2(r.marginPerEntry, r.marginPctPerEntry / 100 * 500, 1e-6, 'primera entrada');
  console.log('OK  el % se calcula sobre el saldo disponible (no sobre el capital inicial)');
})();

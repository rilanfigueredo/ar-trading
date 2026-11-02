'use strict';
const assert = require('assert'); const { analyzeExits } = require('../renderer/funciones/simulador/exits');
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-6, m + ': ' + a + ' vs ' + b);
let ok = 0; const t = (n, f) => { f(); ok++; console.log('OK  ' + n); };
const base = { side: 'short', capital: 500, avgEntry: 100000, qty: 0.0125, entryFees: 0.625,
  tps: [{ price: 95000, pct: 50 }, { price: 90000, pct: 50 }], sl: 105000 };
t('ganancia por TP (cálculo a mano)', () => {
  const r = analyzeExits(base);
  near(r.tpRows[0].net, 31.13125, 'tp1'); near(r.tpRows[1].net, 62.3875, 'tp2'); near(r.totalNet, 92.89375, 'total');
});
t('stop loss, riesgo % y relación riesgo/beneficio', () => {
  const r = analyzeExits(base);
  near(r.slRow.totalNet, -63.78125, 'sl'); near(r.riskPct, 63.78125 / 5, 'riesgo%'); near(r.rr, 92.89375 / 63.78125, 'rr');
});
t('long: signos invertidos', () => {
  const r = analyzeExits({ ...base, side: 'long', tps: [{ price: 105000, pct: 100 }], sl: 95000 });
  near(r.tpRows[0].gross, 62.5, 'gross'); near(r.slRow.gross, -62.5, 'sl');
});
t('escenario: 50% ahora y resto al TP', () => {
  const r = analyzeExits({ ...base, partial: { pct: 50, price: 97000, tpIndex: 0 } });
  const a = 0.00625 * 3000 - 0.00625 * 97000 * 0.0005, b = 0.00625 * 5000 - 0.00625 * 95000 * 0.0002;
  near(r.scenario.partialTotal, a + b - 0.625, 'parcial');
  near(r.scenario.waitVsNow, (0.0125 * 5000 - 0.0125 * 95000 * 0.0002) - (0.0125 * 3000 - 0.0125 * 97000 * 0.0005), 'esperar');
});
t('avisos: TP sin 100%, SL tras liquidación, deslizamiento', () => {
  const r = analyzeExits({ ...base, tps: [{ price: 95000, pct: 60 }], liq: 104000, slippagePct: 0.1 });
  assert(r.warn.some((w) => w.includes('sin cerrar'))); assert(r.warn.some((w) => w.includes('liquidación')));
  near(r.slRow.effPrice, 105105, 'slip');
});
console.log('\n' + ok + ' pruebas correctas');

// Pruebas del simulador de estrategias y del motor de scripts en modo estrategia (v0.21)
const assert = require('assert');
const S = require('../renderer/js/scriptcore.js');
const BT = require('../renderer/js/backtest.js');
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// velas a mano: [open, high, low, close]
function mk(rows) {
  const d = { time: [], open: [], high: [], low: [], close: [], volume: [], buy: null };
  rows.forEach((r, i) => { d.time.push(1700000000 + i * 3600); d.open.push(r[0]); d.high.push(r[1]); d.low.push(r[2]); d.close.push(r[3]); d.volume.push(10); });
  return d;
}
const flat = (n, p = 100) => Array.from({ length: n }, () => [p, p + 1, p - 1, p]);
// ejecuta una estrategia de prueba: `rules` va dentro de onBar(function (i, pos) { ... })
const go = (rows, rules, opts = '') => S.run({ code: `strategy({ capital: 1000, size: 100, commission: 0, makerCommission: 0, slippage: 0 ${opts} });\nonBar(function (i, pos) {\n${rules}\n});`, data: mk(rows), meta: { name: 'T' } });
const tr = (r, k = 0) => r.strategy.trades[k];

// 1) La orden de la vela i se ejecuta en la APERTURA de la vela i+1
{
  const rows = flat(10); rows[3] = [105, 106, 104, 105]; // la apertura de la vela 3 es 105
  const r = go(rows, `if (i === 2) entry('long');`);
  assert.strictEqual(tr(r).entryIdx, 3);
  near(tr(r).entryPrice, 105);
  assert.strictEqual(tr(r).open, true);
}
// 2) Comisión y deslizamiento: compra a 100 con 1 % de deslizamiento y 0,1 % de comisión por lado
{
  const rows = flat(10); rows[5] = [110, 111, 109, 110];
  const code = `strategy({ capital: 1000, size: 100, commission: 0.1, makerCommission: 0.1, slippage: 1 });
onBar(function (i, pos) { if (i === 1) entry('long'); if (i === 4) exit(); });`;
  const r = S.run({ code, data: mk(rows), meta: {} });
  const t = tr(r);
  near(t.entryPrice, 101);                 // 100 * 1,01
  near(t.exitPrice, 110 * 0.99);           // vende en la apertura de la vela 5 con deslizamiento
  const qty = 1000 / 101;
  const fees = qty * 101 * 0.001 + qty * (110 * 0.99) * 0.001;
  near(t.pnl, qty * (110 * 0.99 - 101) - fees);
  near(r.strategy.report.capitalEnd, 1000 + t.pnl);
  near(r.strategy.report.fees, fees);
}
// 3) Stop loss dentro de la vela (con la vela de entrada incluida) y con hueco de apertura
{
  const rows = flat(10);
  rows[4] = [100, 101, 94, 96];            // toca el stop de 95
  const r = go(rows, `if (i === 2) entry('long', { sl: 95 });`);
  assert.strictEqual(tr(r).reason, 'stop'); assert.strictEqual(tr(r).exitIdx, 4); near(tr(r).exitPrice, 95);
  const rows2 = flat(10);
  rows2[4] = [90, 92, 88, 91];             // abre por debajo del stop: sale a la apertura (peor precio)
  const r2 = go(rows2, `if (i === 2) entry('long', { sl: 95 });`);
  near(tr(r2).exitPrice, 90);
}
// 4) Objetivo: límite al precio; con hueco, a la apertura (mejor)
{
  const rows = flat(10); rows[4] = [100, 107, 99, 105];
  const r = go(rows, `if (i === 2) entry('long', { tp: 106 });`);
  assert.strictEqual(tr(r).reason, 'objetivo'); near(tr(r).exitPrice, 106); near(tr(r).pnl, 1000 * (106 - 100) / 100);
  const rows2 = flat(10); rows2[4] = [110, 112, 109, 111];
  const r2 = go(rows2, `if (i === 2) entry('long', { tp: 106 });`);
  near(tr(r2).exitPrice, 110);
}
// 5) Stop y objetivo en la misma vela: se asume el stop y se avisa
{
  const rows = flat(10); rows[4] = [100, 110, 90, 100];
  const r = go(rows, `if (i === 2) entry('long', { sl: 95, tp: 105 });`);
  assert.strictEqual(tr(r).reason, 'stop'); assert.strictEqual(r.strategy.report.ambiguous, 1);
}
// 6) Cortos: ganan cuando baja
{
  const rows = flat(10); rows[5] = [90, 91, 89, 90];
  const r = go(rows, `if (i === 1) entry('short'); if (i === 4) exit();`);
  assert.strictEqual(tr(r).side, 'short'); near(tr(r).pnl, 1000 * (100 - 90) / 100);
  const sl = go(flat(10).map((x, i) => (i === 4 ? [100, 106, 99, 105] : x)), `if (i === 1) entry('short', { slPct: 5 });`);
  assert.strictEqual(tr(sl).reason, 'stop'); near(tr(sl).exitPrice, 105); assert.ok(tr(sl).pnl < 0);
}
// 7) Invertir: entrar en sentido contrario cierra y abre en la misma apertura
{
  const rows = flat(10); rows[5] = [102, 103, 101, 102];
  const r = go(rows, `if (i === 1) entry('long'); if (i === 4) entry('short');`);
  assert.strictEqual(r.strategy.trades.length, 2);
  assert.strictEqual(tr(r, 0).reason, 'inversión'); assert.strictEqual(tr(r, 1).side, 'short');
  assert.strictEqual(tr(r, 0).exitIdx, tr(r, 1).entryIdx);
  // entrar en el mismo sentido con posición abierta no hace nada
  const r2 = go(rows, `if (i === 1 || i === 3) entry('long');`);
  assert.strictEqual(r2.strategy.trades.length, 1);
}
// 8) Tamaño en % del capital
{
  const rows = flat(10); rows[5] = [110, 111, 109, 110];
  const r = go(rows, `if (i === 1) entry('long', { size: 50 }); if (i === 4) exit();`);
  near(tr(r).qty, 5); near(tr(r).pnl, 5 * 10);
}
// 9) Stop del lado equivocado: la orden se rechaza y se cuenta
{
  const r = go(flat(10), `if (i === 1) entry('long', { sl: 120 });`);
  assert.strictEqual(r.strategy.trades.length, 0); assert.strictEqual(r.strategy.report.rejected, 1);
  assert.ok(/lado equivocado/.test(r.strategy.report.rejectedWhy));
}
// 10) exit({sl}) mueve el stop; sin posición da error con línea y vela
{
  const rows = flat(12); rows[3] = [100, 120, 100, 118]; rows[4] = [118, 119, 117, 118]; rows[5] = [118, 119, 117, 118]; rows[6] = [118, 119, 109, 110];
  const r = go(rows, `if (i === 1) entry('long'); if (i === 3) exit({ sl: 112 });`);
  assert.strictEqual(tr(r).reason, 'stop'); near(tr(r).exitPrice, 112);
  try { go(flat(10), `if (i === 2) exit({ sl: 95 });`); assert.fail('debía fallar'); } catch (e) {
    const x = S.explainError(e, '');
    assert.ok(/posición abierta/.test(x.message), x.message); assert.ok(/vela 3/.test(x.message), x.message);
  }
}
// 11) Capital (equity) marcado al cierre y operación abierta al final
{
  const rows = flat(6); rows[4] = [100, 111, 99, 110]; rows[5] = [110, 111, 109, 110];
  const r = go(rows, `if (i === 1) entry('long');`);
  const eq = r.strategy.equity;
  near(eq[0], 1000); near(eq[2], 1000); near(eq[4], 1100); near(eq[5], 1100);
  assert.strictEqual(tr(r).open, true); near(r.strategy.report.openPnl, 100);
  assert.strictEqual(r.strategy.report.trades, 0); near(r.strategy.report.capitalEnd, 1100);
}
// 12) Informe: factor de beneficio, acierto y caída máxima
{
  // dos operaciones largas: +10 % y -5 %
  const rows = flat(20);
  rows[3] = [100, 100, 100, 100]; rows[6] = [110, 110, 110, 110];       // entra 3 a 100, sale 6 a 110
  rows[8] = [110, 110, 110, 110]; rows[11] = [104.5, 104.5, 104.5, 104.5]; // entra 8 a 110, sale 11 a 104,5
  for (let i = 4; i < 6; i++) rows[i] = [105, 106, 104, 105];
  for (let i = 9; i < 11; i++) rows[i] = [108, 109, 107, 108];
  const r = go(rows, `if (i === 2 || i === 7) entry('long'); if (i === 5 || i === 10) exit();`);
  const rp = r.strategy.report;
  assert.strictEqual(rp.trades, 2); assert.strictEqual(rp.wins, 1); assert.strictEqual(rp.losses, 1);
  near(rp.winRate, 50);
  near(rp.grossProfit, 100); near(rp.grossLoss, 1100 * 0.05);
  near(rp.profitFactor, 100 / 55);
  near(rp.capitalEnd, 1000 + 100 - 55);
  assert.ok(rp.maxDD >= 55 - 1e-6 && rp.maxDDPct > 0);
}
// 13) Capital agotado: un corto que pierde más que el capital deja de operar
{
  const rows = flat(10); rows[4] = [100, 300, 99, 250]; rows[5] = [250, 251, 249, 250];
  const r = go(rows, `if (i === 1) entry('short'); if (i === 6) entry('long');`);
  assert.strictEqual(r.strategy.report.busted, true); near(r.strategy.report.capitalEnd, 0);
  assert.strictEqual(r.strategy.trades.filter((t) => !t.open).length, 1);
}

// 14) Comisión maker en el objetivo y taker en el resto; valores por defecto de Binance Futuros
{
  const rows = flat(10); rows[4] = [100, 107, 99, 105];
  const code = `strategy({ capital: 1000, size: 100, commission: 0.05, makerCommission: 0.02, slippage: 0 });
onBar(function (i, pos) { if (i === 2) entry('long', { tp: 106 }); });`;
  const r = S.run({ code, data: mk(rows), meta: {} });
  const t = r.strategy.trades[0], qty = 1000 / 100;
  assert.strictEqual(t.reason, 'objetivo');
  near(t.fees, qty * 100 * 0.0005 + qty * 106 * 0.0002);       // entrada taker 0,05 % + salida maker 0,02 %
  const d = S.run({ code: `strategy({}); onBar(function (i) {});`, data: mk(flat(10)), meta: {} });
  const by = (l) => d.inputs.find((i) => i.label === l).value;
  near(by('Comisión taker (% por lado, órdenes de mercado)'), 0.05); near(by('Comisión maker (% por lado, objetivos)'), 0.02); near(by('Deslizamiento (% por orden de mercado)'), 0.01);
}
// 15) Tamaño en monto fijo y en contratos; sin apalancamiento (se reduce al capital)
{
  const rows = flat(10); rows[5] = [110, 111, 109, 110];
  const mkc = (type, size, rules) => S.run({ code: `strategy({ capital: 1000, sizeType: '${type}', size: ${size}, commission: 0, makerCommission: 0, slippage: 0 });\nonBar(function (i, pos) {\n${rules}\n});`, data: mk(rows), meta: {} });
  const a = mkc('amount', 400, `if (i === 1) entry('long'); if (i === 4) exit();`);
  near(a.strategy.trades[0].qty, 4); near(a.strategy.trades[0].pnl, 40);
  const c = mkc('contracts', 2.5, `if (i === 1) entry('long'); if (i === 4) exit();`);
  near(c.strategy.trades[0].qty, 2.5); near(c.strategy.trades[0].pnl, 25);
  const big = mkc('amount', 5000, `if (i === 1) entry('long'); if (i === 4) exit();`);
  near(big.strategy.trades[0].qty, 10); assert.strictEqual(big.strategy.report.reduced, 1);
  // se puede cambiar el tipo de tamaño desde los parámetros del gráfico
  const p = S.run({ code: `strategy({ capital: 1000, commission: 0, makerCommission: 0, slippage: 0 });\nonBar(function (i) { if (i === 1) entry('long'); });`, params: { 'Tipo de tamaño': 'Contratos', 'Tamaño': 3 }, data: mk(rows), meta: {} });
  near(p.strategy.trades[0].qty, 3);
  assert.throws(() => S.run({ code: `strategy({ sizeType: 'percent', size: 150 }); onBar(function () {});`, data: mk(rows), meta: {} }), (e) => /hasta 100/.test(e.message));
  assert.throws(() => S.run({ code: `strategy({ sizeType: 'raro' }); onBar(function () {});`, data: mk(rows), meta: {} }), (e) => /sizeType/.test(e.message));
}

// ---------- Reglas del motor ----------
{
  const rows = flat(120);
  const mustFail = (code, re) => { try { S.run({ code, data: mk(rows), meta: {} }); assert.fail('debía fallar: ' + code); } catch (e) { const x = S.explainError(e, code); assert.ok(re.test(x.message), x.message); return x; } };
  mustFail(`entry('long');`, /dentro de onBar/);
  mustFail(`strategy({}); entry('long');`, /dentro de onBar/);
  mustFail(`strategy({}); `, /necesita onBar/);
  mustFail(`onBar(function () {});`, /declara antes strategy/);
  mustFail(`indicator({}); strategy({});`, /indicador o una estrategia/);
  mustFail(`strategy({}); indicator({});`, /indicador o una estrategia/);
  mustFail(`strategy({ capital: -5 }); onBar(function () {});`, /capital/);
  mustFail(`strategy({}); onBar(function (i) { entry('largo'); });`, /'long' o 'short'/);
  mustFail(`strategy({}); onBar(function (i) { entry('long', { sl: 1, slPct: 2 }); });`, /no los dos/);
  // error con línea dentro de onBar
  const x = mustFail(`strategy({});\nonBar(function (i) {\n  const a = nada + 1;\n});`, /nada/);
  assert.strictEqual(x.line, 3);
  // los parámetros del simulador son editables y se reflejan
  const code = `strategy({ capital: 1000 });\nonBar(function (i) { if (i === 1) entry('long'); });`;
  const r = S.run({ code, params: { 'Capital inicial': 5000, 'Tamaño': 10 }, data: mk(rows), meta: {} });
  near(r.strategy.settings.capital, 5000); near(r.strategy.trades[0].qty, 500 / 100.01); // 10 % de 5000 con el deslizamiento por defecto (0,01 %)
  assert.ok(r.inputs.some((i) => i.label === 'Comisión taker (% por lado, órdenes de mercado)' && i.builtin));
}
// ---------- Control de datos del futuro ----------
{
  const N = 200, rows = [];
  for (let i = 0; i < N; i++) { const c = 100 + Math.sin(i / 6) * 10; rows.push([i ? rows[i - 1][3] : c, c + 1, c - 1, c]); }
  const run = (rules, pre = '', rs = rows) => S.run({ code: `strategy({});\n${pre}\nonBar(function (i, pos) {\n${rules}\n});`, data: mk(rs), meta: {} });
  // legítima: usa la vela actual y las anteriores
  const ok = run(`if (i > 3 && close[i] > close[i - 3] && pos.side === null) entry('long'); else if (close[i] < close[i - 1] && pos.side === 'long') exit();`);
  assert.strictEqual(ok.strategy.lookahead.checked, true);
  // con medias de la librería también
  assert.strictEqual(run(`if (up[i]) entry('long'); if (dn[i]) exit();`, `const f = ta.ema(close, 5), l = ta.ema(close, 20); const up = ta.crossover(f, l), dn = ta.crossunder(f, l);`).strategy.lookahead.checked, true);
  // trampa 1: mirar la vela siguiente
  assert.throws(() => run(`if (i + 1 < close.length && close[i + 1] > close[i]) entry('long'); else if (pos.side === 'long') exit();`), (e) => /datos del futuro/.test(e.message));
  // trampa 2: normalizar con el máximo de TODAS las velas
  const trend = rows.map((r, i) => r.map((v) => v + i * 0.5));   // con tendencia, el máximo de toda la lista está en las últimas velas
  assert.throws(() => run(`if (close[i] > 0.9 * top) entry('long'); else if (pos.side === 'long') exit();`, `const top = Math.max.apply(null, close);`, trend), (e) => /datos del futuro/.test(e.message));
  // trampa 3: mirar adelante en una lista de ta.* (la primera barrera lo corta con un mensaje claro)
  assert.throws(() => run(`if (f[i + 1] > f[i]) entry('long'); else if (pos.side === 'long') exit();`, `const f = ta.ema(close, 5);`), (e) => /Estás en la vela \d+ y pides la vela \d+/.test(e.message));
  // trampa 4: una lista armada antes, ya "adelantada" (la segunda barrera: se repite la estrategia con menos velas)
  assert.throws(() => run(`if (next[i] > close[i]) entry('long'); else if (pos.side === 'long') exit();`, `const next = close.map(function (v, j) { return close[j + 1]; });`), (e) => /datos del futuro/.test(e.message));
  // rendimiento: 30000 velas
  {
    const big = []; let c = 100;
    for (let i = 0; i < 30000; i++) { const o = c; c = Math.max(1, c + Math.sin(i / 50) * 0.8 + Math.sin(i * 1.7) * 0.4); big.push([o, Math.max(o, c) + 0.3, Math.min(o, c) - 0.3, c]); }
    const t0 = Date.now();
    const r = run(`if (up[i]) entry('long', { slPct: 3 }); else if (dn[i]) exit();`, `const up = ta.crossover(ta.ema(close, 10), ta.ema(close, 30)), dn = ta.crossunder(ta.ema(close, 10), ta.ema(close, 30));`, big);
    const ms = Date.now() - t0;
    console.log('30000 velas:', ms, 'ms,', r.strategy.trades.length, 'operaciones, control:', JSON.stringify(r.strategy.lookahead));
    assert.ok(ms < 2500, 'demasiado lento: ' + ms);
    assert.strictEqual(r.strategy.lookahead.checked, true);
  }
  // pocas velas: el control no se puede hacer y se dice
  const few = S.run({ code: `strategy({}); onBar(function (i) { if (i === 3) entry('long'); });`, data: mk(flat(20)), meta: {} });
  assert.strictEqual(few.strategy.lookahead.checked, false);
}
// ---------- Un indicador normal sigue igual ----------
{
  const r = S.run({ code: `indicator({ overlay: true }); plot(ta.sma(close, 5));`, data: mk(flat(30)), meta: {} });
  assert.strictEqual(r.strategy, undefined); assert.strictEqual(r.plots.length, 1);
}
// ---------- Simulador directo ----------
{
  const d = mk(flat(5));
  const sim = BT.create({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }, { capital: 100, size: 100, commission: 0, slippage: 0 });
  for (let i = 0; i < 5; i++) sim.step(i);
  const f = sim.finish();
  assert.strictEqual(f.trades.length, 0); near(f.report.capitalEnd, 100); assert.strictEqual(f.report.winRate, null);
}
console.log('backtest.test.js: todo bien');

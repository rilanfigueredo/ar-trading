// Pruebas del mapa de liquidaciones (v0.23): estimador, parsers de los exchanges, almacén, servicio simulado y lógica pura del dibujo.
'use strict';
const assert = require('assert');
const os = require('os'), path = require('path'), fs = require('fs');
process.env.TV_MOCK = '1';
const E = require('../src/liq/estimate');
const S = require('../src/liq/sources');
const L = require('../src/liq');
const Store = require('../src/liq/store');
const M = require('../renderer/js/liqmap.js');

// --- precio de liquidación (fórmula documentada) ---
assert.ok(Math.abs(E.liqPrice(0, 100000, 10, 0.004) - 100000 * (1 - 0.1 + 0.004)) < 1e-6);
assert.ok(Math.abs(E.liqPrice(1, 100000, 100, 0.004) - 100000 * (1 + 0.01 - 0.004)) < 1e-6);

// --- estimador: nivel largo se crea con OI creciente y se CONSUME cuando el precio baja hasta él ---
const mk = (prices, oi) => ({ candles: prices.map((p, i) => ({ t: 1000000 + i * 300, o: p[0], h: p[1], l: p[2], c: p[3] })), oi: oi.map((u, i) => ({ t: 1000000 + i * 300, usd: u })) });
{
  const flat = []; for (let i = 0; i < 6; i++) flat.push([100000, 100010, 99990, 100000]);
  const a = mk(flat.concat([[100000, 100000, 80000, 85000]]), [1e9, 1.1e9, 1.2e9, 1.3e9, 1.4e9, 1.5e9, 1.5e9]);
  const r = E.estimate({ candles: a.candles, oi: a.oi, mmr: 0.004, binSize: 10, colSec: 300, halfLifeH: 0 });
  assert.ok(r.segs.some((s) => s[3] === 0 && s[2] === 0) === false, 'tras el desplome no queda ningún largo vivo por encima del mínimo');
  assert.ok(r.segs.some((s) => s[3] === 0 && s[2] > 0), 'los largos barridos quedan como segmento terminado');
  assert.ok(r.segs.some((s) => s[3] === 1 && s[2] === 0), 'los cortos (arriba) siguen vivos');
}
{ // OI que baja reduce los niveles vivos en proporción
  const flat = []; for (let i = 0; i < 6; i++) flat.push([100000, 100010, 99990, 100000]);
  const up = mk(flat, [1e9, 1.2e9, 1.4e9, 1.4e9, 1.4e9, 1.4e9]), dn = mk(flat, [1e9, 1.2e9, 1.4e9, 0.7e9, 0.7e9, 0.7e9]);
  const sum = (r) => r.segs.reduce((x, s) => x + s[4] + s[5] + s[6] + s[7] + s[8], 0);
  const a = E.estimate({ candles: up.candles, oi: up.oi, mmr: 0.004, halfLifeH: 0 }), b = E.estimate({ candles: dn.candles, oi: dn.oi, mmr: 0.004, halfLifeH: 0 });
  assert.ok(sum(b) < sum(a) * 0.7, 'al bajar el OI baja el total');
}
{ // el envejecimiento reduce el peso
  const flat = []; for (let i = 0; i < 300; i++) flat.push([100000, 100010, 99990, 100000]);
  const oi = []; for (let i = 0; i < 300; i++) oi.push(1e9 + (i < 3 ? i * 1e8 : 2e8));
  const a = mk(flat, oi);
  const sum = (r) => r.segs.reduce((x, s) => x + s[4] + s[5] + s[6] + s[7] + s[8], 0);
  assert.ok(sum(E.estimate({ candles: a.candles, oi: a.oi, mmr: 0.004, halfLifeH: 24 })) < sum(E.estimate({ candles: a.candles, oi: a.oi, mmr: 0.004, halfLifeH: 0 })) * 0.7);
}
assert.deepStrictEqual(E.normWeights([0, 0, 0, 0, 0]), E.DEFAULT_WEIGHTS);
assert.ok(Math.abs(E.normWeights([1, 1, 1, 1, 1]).reduce((x, y) => x + y, 0) - 1) < 1e-9);
assert.strictEqual(E.estimate({ candles: [], oi: [] }).segs.length, 0);
assert.strictEqual(E.mergeSegs([[[1, 0, 0, 0, 1, 0, 0, 0, 0]], [[1, 0, 0, 0, 2, 0, 0, 0, 0]]])[0][4], 3);

// --- parsers de liquidaciones (formatos de la documentación) ---
const bn = S.parseBinanceForce({ e: 'forceOrder', E: 1700000000500, o: { s: 'BTCUSDT', S: 'SELL', ap: '60000', p: '59000', q: '0.5', T: 1700000000400 } });
assert.deepStrictEqual([bn.ex, bn.side, bn.price, bn.usd, bn.t], ['binance', 0, 60000, 30000, 1700000000]);
assert.strictEqual(S.parseBinanceForce({ o: { s: 'ETHUSDT', S: 'BUY', p: '1', q: '1' } }), null);
const by = S.parseBybitLiq({ topic: 'allLiquidation.BTCUSDT', type: 'snapshot', ts: 1, data: [{ T: 1700000000000, s: 'BTCUSDT', S: 'Buy', v: '0.01', p: '60000' }, { T: 1, s: 'ETHUSDT', S: 'Sell', v: '1', p: '1' }] });
assert.strictEqual(by.length, 1); assert.deepStrictEqual([by[0].side, by[0].usd], [0, 600]);
const ok = S.parseOkxLiq({ arg: { channel: 'liquidation-orders', instType: 'SWAP' }, data: [{ instId: 'BTC-USDT-SWAP', details: [{ posSide: 'short', side: 'buy', sz: '100', bkPx: '60000', ts: '1700000000000' }] }, { instId: 'ETH-USDT-SWAP', details: [{ posSide: 'long', sz: '1', bkPx: '1', ts: '1' }] }] });
assert.strictEqual(ok.length, 1); assert.deepStrictEqual([ok[0].side, ok[0].usd], [1, 100 * 0.01 * 60000]);

// --- fuentes con respuestas simuladas (formato documentado): error claro si el formato no es el esperado ---
(async () => {
  const rows = []; for (let i = 0; i < 3; i++) rows.push({ symbol: 'BTCUSDT', sumOpenInterest: '1', sumOpenInterestValue: String(1e9 + i), timestamp: 1700000000000 + i * 300000 });
  let calls = 0;
  const oi = await S.binanceOiHist(async () => (calls++ === 0 ? rows : []), 1700000000000, 1700000000000 + 3 * 300000);
  assert.strictEqual(oi.length, 3);
  await assert.rejects(() => S.bybitOiHist(async () => ({ retCode: 10001, retMsg: 'x' }), 0, 1, () => 1), /Bybit open-interest/);
  await assert.rejects(() => S.okxOiHist(async () => ({ code: '50000', msg: 'bad' }), 0, 1, () => 1), /OKX open-interest-history/);
  const bo = await S.bybitOiHist(async () => ({ retCode: 0, result: { list: [{ openInterest: '10', timestamp: '1700000300000' }, { openInterest: '9', timestamp: '1700000000000' }], nextPageCursor: '' } }), 0, 1, () => 60000);
  assert.deepStrictEqual(bo.map((r) => r.usd), [540000, 600000]);
  const oo = await S.okxOiHist(async () => ({ code: '0', data: [['1700000300000', '5', '5', '300000']] }), 1700000000000, 1700000400000, () => 60000);
  assert.strictEqual(oo[0].usd, 300000);

  // --- almacén ---
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liqtest'));
  const st = Store.create(dir);
  assert.strictEqual(st.firstRun, true);
  const now = Math.floor(Date.now() / 1000);
  st.addCandles([{ t: now - 600, o: 1, h: 2, l: 0.5, c: 1.5 }]); st.addOi('okx', [{ t: now - 600, usd: 5 }]); st.addEvent({ t: now - 10, ex: 'okx', side: 0, price: 1, usd: 2 });
  st.flush();
  const st2 = Store.create(dir);
  assert.strictEqual(st2.firstRun, false); assert.strictEqual(st2.state.candles.length, 1); assert.strictEqual(st2.state.oi.okx[0].usd, 5); assert.strictEqual(st2.state.events.length, 1);

  // --- servicio con datos simulados ---
  const svc = L.create({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'liqsvc')), mock: true });
  await svc.start();
  const m = svc.getMap({ ex: 'binance,bybit,okx' });
  assert.ok(m.ok && m.mock && m.segs.length > 100, 'mapa simulado con segmentos');
  assert.ok(m.price > 0);
  assert.strictEqual(m.status.binance.state, 'ok');
  const one = svc.getMap({ ex: 'bybit' });
  assert.ok(one.segs.length > 0 && one.segs.length <= m.segs.length + 5);
  assert.strictEqual(svc.getMap({ ex: 'nada' }).segs.length, 0);
  // un exchange que falla se avisa, no se sustituye
  const bad = L.mockDeps(); bad.oi = async (ex) => { if (ex === 'bybit') throw new Error('prueba de fallo'); return L.mockDeps().oi(ex, Date.now() - 86400000, Date.now()); };
  const svc2 = L.create({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'liqbad')), deps: bad });
  await svc2.start();
  assert.strictEqual(svc2.status().bybit.state, 'error'); assert.ok(/prueba de fallo/.test(svc2.status().bybit.msg)); assert.strictEqual(svc2.status().binance.state, 'ok');
  assert.strictEqual(svc2.getMap({ ex: 'bybit' }).segs.length, 0, 'sin datos de bybit no se inventa nada');
  svc.stop(); svc2.stop();

  // --- lógica pura del dibujo ---
  const d = M.defaults(); assert.strictEqual(d.on, false);
  assert.deepStrictEqual(M.clean(null), d);
  const c = M.clean({ on: 1, mode: 'zzz', days: 5, w: [1, 2], scale: 99, levs: { 5: false }, pw: 1 });
  assert.strictEqual(c.mode, 'comb'); assert.strictEqual(c.days, 14); assert.deepStrictEqual(c.w, d.w); assert.strictEqual(c.scale, 4); assert.strictEqual(c.levs[5], false); assert.strictEqual(c.levs[10], true); assert.strictEqual(c.pw, 10); assert.strictEqual(d.bin, 0);
  assert.strictEqual(M.params(d, 80000).binSize, '10'); assert.strictEqual(M.params(d, 3400).binSize, '0.5');
  const p = M.params(M.clean({ mode: 'comb', src: { okx: false }, levs: { 100: false } }));
  assert.strictEqual(p.ex, 'binance,bybit'); assert.strictEqual(p.levs, '5,10,25,50');
  assert.strictEqual(M.params(M.clean({ mode: 'okx' })).ex, 'okx');
  assert.deepStrictEqual(M.rampColor(0), [31, 159, 163]); assert.deepStrictEqual(M.rampColor(1), [255, 31, 31]);
  const segs = [[100, 0, 0, 1, 5, 0, 0, 0, 0], [101, 0, 0, 1, 50, 0, 0, 0, 0], [102, 0, 0, 1, 20, 0, 0, 0, 0], [50, 0, 10, 0, 99, 0, 0, 0, 0], [50, 0, 0, 0, 7, 0, 0, 0, 0]];
  const prof = M.profile(segs, 10);
  assert.strictEqual(prof.length, 4, 'el perfil solo cuenta niveles vivos');
  const pk = M.peaks(prof, 2, 0.004); assert.strictEqual(pk[0].bin, 101); assert.strictEqual(pk.length, 2);
  const cu = M.cumulative(prof, 1010); assert.strictEqual(cu.up.length, 2); assert.strictEqual(cu.dn.length, 2); assert.ok(cu.max > 0);
  console.log('liq.test.js OK');
})().catch((e) => { console.error(e); process.exit(1); });

// Pruebas de las velas por bloques de Bitcoin (v0.16) con datos de EJEMPLO (no es mempool.space real).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../renderer/js/lib.js');
delete process.env.TV_MOCK;
const core = require('../src/core.js');
const eq = assert.strictEqual;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

// --- temporalidades ---
eq(L.tfById('blk').id, 'b:1'); eq(L.tfById('b:144').n, 144); eq(L.tfById('b:2016').sec, 2016 * 600);
assert.throws(() => L.makeTf('b', 1.5), /entero/); assert.throws(() => L.makeTf('b', 5000), /máximo/);
eq(L.BLOCK_IV(13), '1m'); eq(L.BLOCK_IV(144), '5m'); eq(L.BLOCK_IV(2016), '1h');

// --- velas de n bloques ---
// bloques 9..17: el bloque h sale en t = 6000 + (h-10)*600 s, mueve h BTC y h/100 BTC de comisión, con 100+h transacciones.
const recs = [];
for (let h = 9; h <= 17; h++) recs.push([h, 6000 + (h - 10) * 600, h * 1e8, h * 1e6, 100 + h, 1000]);
// velas de 1 minuto m: apertura m, máximo m+0.5, mínimo m, cierre m
const mins = [];
for (let m = 0; m < 400; m++) mins.push([m * 60000, m, m + 0.5, m, m]);
{
  const bars = L.blockCandles(recs, mins, 60000, 4, null);
  eq(bars.length, 2);                              // grupos [12..15] (completo, tiene su bloque anterior 11) y [16..17] (en formación)
  eq(bars[1].partial, true); eq(bars[1].close, 169);   // sin "ahora": llega hasta la hora del bloque 17
  const b = bars[0];
  eq(b.h0, 12); eq(b.h1, 15); eq(b.blocks, 4); eq(b.partial, false);
  eq(b.time, 6600);                                // hora del bloque 11 (apertura de la vela)
  eq(b.open, 110); eq(b.close, 149); eq(b.high, 149.5); eq(b.low, 110);
  close(b.volume, 54); close(b.fees, 0.54); eq(b.txs, 454); close(b.durMin, 40); close(b.volPerMin, 54 / 40);
}
{
  const bars = L.blockCandles(recs, mins, 60000, 4, 11000 * 1000);   // con "ahora" el último grupo (incompleto) se muestra en formación
  eq(bars.length, 2);
  const f = bars[1];   // con "ahora" el grupo en formación llega hasta el minuto actual
  eq(f.partial, true); eq(f.blocks, 2); eq(f.h0, 16); eq(f.h1, 17); eq(f.open, 150); eq(f.close, 183); close(f.volume, 33);
  assert.ok(bars[1].time > bars[0].time);
}
{
  const one = L.blockCandles(recs, mins, 60000, 1, null);    // 1 bloque por vela
  eq(one.length, 8); eq(one[0].h0, 10); close(one[0].volume, 10);
  for (let i = 1; i < one.length; i++) assert.ok(one[i].time > one[i - 1].time);
}

// --- bloques de mempool.space con caché en disco (fetch de ejemplo) ---
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arblk-'));
  core.setDataDir(dir);
  const TIP = 5000;
  let calls = 0;
  const mk = (h) => ({ height: h, timestamp: 1000 + h * 600, tx_count: 10 + h % 7, size: 1000, extras: { totalOutputAmt: h * 1e8, totalFees: 1e6 } });
  global.fetch = async (url) => {
    calls++;
    const u = String(url);
    const body = u.endsWith('/api/blocks/tip/height') ? TIP : (() => { const st = Number(u.split('/').pop()); const a = []; for (let h = st; h > st - 15 && h >= 0; h--) a.push(mk(h)); return a; })();
    return { ok: true, status: 200, json: async () => body };
  };
  let r = await core.blockRecords({ tipOnly: 1 });
  eq(r.tip, TIP);
  r = await core.blockRecords({ lo: 4900, hi: 5000, budget: 2 });          // 2 peticiones de 15 bloques no alcanzan
  assert.ok(r.missing > 0 && r.rows.length > 0 && r.rows[r.rows.length - 1][0] === 5000, 'baja primero lo más nuevo');
  r = await core.blockRecords({ lo: 4900, hi: 5000, budget: 40 });
  eq(r.missing, 0); eq(r.rows.length, 101); eq(r.rows[0][0], 4900); eq(r.rows[100][2], 5000 * 1e8);
  const before = calls;
  await core.blockRecords({ lo: 4900, hi: 5000, budget: 40 });
  eq(calls, before, 'lo ya descargado no se vuelve a pedir');
  await new Promise((res) => setTimeout(res, 3000));                        // espera al guardado en disco
  assert.ok(fs.existsSync(path.join(dir, 'blocks', 'c2.json')), 'se guarda en disco');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('blocks.test.js OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

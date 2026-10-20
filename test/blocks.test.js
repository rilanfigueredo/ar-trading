// Pruebas de las velas por bloque (v0.15) con bloques y precios SIMULADOS (no es mempool.space real).
const assert = require('assert');
process.env.TV_MOCK = '1';
const L = require('../renderer/js/lib.js');
const core = require('../src/core.js');
(async () => {
  const tf = L.tfById('blk');
  assert.strictEqual(tf.kind, 'block'); assert.strictEqual(L.normalizeId('blk'), 'blk');
  assert.strictEqual(L.tfFor(tf, 'bitstamp').unavailable, undefined);
  const r = await core.blockBars({ symbol: 'BTCUSDT', count: 60 });
  assert.strictEqual(r.rows.length, 60);
  for (let i = 0; i < r.rows.length; i++) {
    const b = r.rows[i];
    assert.ok(b.high >= Math.max(b.open, b.close) - 1e-9 && b.low <= Math.min(b.open, b.close) + 1e-9, 'OHLC coherente');
    assert.ok(b.volume > 0 && b.txs > 0);
    if (i) { assert.ok(b.time > r.rows[i - 1].time, 'tiempos crecientes'); assert.strictEqual(b.height, r.rows[i - 1].height + 1); }
  }
  const older = await core.blockBars({ symbol: 'BTCUSDT', endHeight: r.rows[0].height - 1, count: 30 });
  assert.strictEqual(older.rows[older.rows.length - 1].height, r.rows[0].height - 1);
  await assert.rejects(() => core.blockBars({ symbol: 'ETHUSDT', count: 5 }), /solo existen para Bitcoin/);
  console.log('blocks.test.js OK');
})().catch((e) => { console.error(e); process.exit(1); });

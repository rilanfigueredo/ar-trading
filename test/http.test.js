// v0.22: control de peticiones (reintento ante límite, peticiones iguales compartidas, máximo en paralelo)
const assert = require('assert');
const core = require('../src/core');
(async () => {
  let n = 0;
  const body = { retCode: 0, result: { list: [['1000', '1', '2', '0.5', '1.5', '3']] } };
  global.fetch = async () => { n++; return n === 1 ? { ok: false, status: 429, headers: { get: () => '0' }, json: async () => ({}) } : { ok: true, status: 200, headers: { get: () => null }, json: async () => body }; };
  const r = await core.klines({ exchange: 'bybit', symbol: 'BTCUSDT', interval: '1h', startTime: 1000, limit: 1 });
  assert.strictEqual(r.length, 1); assert.strictEqual(n, 2, 'reintenta una vez tras el 429');
  // 3 pedidos iguales a la vez = 1 sola petición real
  n = 10;
  const rr = await Promise.all([1, 2, 3].map(() => core.klines({ exchange: 'bybit', symbol: 'BTCUSDT', interval: '1h', startTime: 2000, limit: 1 })));
  assert.strictEqual(n, 11); assert.strictEqual(rr[2].length, 1);
  // máximo en paralelo
  let act = 0, peak = 0;
  global.fetch = async () => { act++; peak = Math.max(peak, act); await new Promise((x) => setTimeout(x, 20)); act--; return { ok: true, status: 200, headers: { get: () => null }, json: async () => body }; };
  await Promise.all(Array.from({ length: 30 }, (_, i) => core.klines({ exchange: 'bybit', symbol: 'BTCUSDT', interval: '1h', startTime: 5000 + i, limit: 1 })));
  assert.ok(peak <= 6 && peak >= 2, 'pico ' + peak);
  // error 429 persistente: avisa con un mensaje claro
  global.fetch = async () => ({ ok: false, status: 429, headers: { get: () => '0' }, json: async () => ({}) });
  await assert.rejects(core.klines({ exchange: 'bybit', symbol: 'BTCUSDT', interval: '1h', startTime: 9000, limit: 1 }), /ir más despacio/);
  console.log('http.test.js OK');
})().catch((e) => { console.error(e); process.exit(1); });

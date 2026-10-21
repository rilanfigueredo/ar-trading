// Pruebas de "Probar conexión" y de los datos de delta, con respuestas de EJEMPLO (no son los servicios reales).
const assert = require('assert');
const L = require('../renderer/js/lib.js');
delete process.env.TV_MOCK;
const core = require('../src/core.js');
const eq = assert.strictEqual;

// delta
{
  const k = [0, '1', '2', '1', '2', '10', 0, '0', 1, '7', '0', '0'];
  const c = L.parseKline(k);
  eq(c.buy, 7); eq(L.deltaOf(c), 4);
  eq(L.parseKline([0, 1, 1, 1, 1, 1]).buy, undefined); eq(L.deltaOf(L.parseKline([0, 1, 1, 1, 1, 1])), null);
  const a = L.aggregate([{ time: 0, open: 1, high: 2, low: 1, close: 2, volume: 10, buy: 7 }, { time: 60, open: 2, high: 3, low: 2, close: 3, volume: 4, buy: 1 }], L.makeTf('m', 2), 0);
  eq(a.length, 1); eq(a[0].volume, 14); eq(a[0].buy, 8); eq(L.deltaOf(a[0]), 2);
  const mixed = L.aggregate([{ time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1, buy: 1 }, { time: 60, open: 1, high: 1, low: 1, close: 1, volume: 1 }], L.makeTf('m', 2), 0);
  eq(mixed[0].buy, undefined);        // si falta el dato en una vela no se inventa
  assert.deepStrictEqual(L.cumDelta([{ volume: 10, buy: 7 }, { volume: 4, buy: 1 }, { volume: 1 }]), [4, 2, 2]);
}

(async () => {
  // prueba de conexión: todo responde bien salvo Bybit (archivo) y Coinbase
  global.fetch = async (url, opts) => {
    const u = String(url);
    const mk = (body, ok = true, status = 200, headers = {}) => ({ ok, status, headers: { get: (h) => headers[h.toLowerCase()] || null }, json: async () => body, arrayBuffer: async () => new ArrayBuffer(2000000) });
    if (u.startsWith('https://api.binance.com')) return mk([[0, '1', '1', '1', '1', '1', 0, '0', 1, '1', '0', '0']]);
    if (u.includes('fapi.binance.com/fapi/v1/klines')) return mk([[0, '1', '1', '1', '1', '1']]);
    if (u.includes('aggTrades?')) return mk([{ T: 1000, m: true }, { T: 3000, m: false }]);
    if (u.includes('data.binance.vision')) return mk(null, true, (opts && opts.headers) ? 206 : 200, { 'content-length': '104857600' });
    if (u.includes('bybit.com/v5')) return mk({ result: { list: [1, 2, 3] } });
    if (u.includes('public.bybit.com')) return mk(null, false, 404);
    throw new Error('sin red');
  };
  const r = await core.testConnection();
  const by = (n) => r.results.find((x) => x.name.includes(n));
  if (process.env.DBG) console.log(r.results);
  eq(by('Spot').ok, true); assert.ok(/volumen de compra/.test(by('Spot').detail));
  eq(by('aggTrades').ok, true); assert.ok(/por segundo/.test(by('aggTrades').detail));
  eq(by('data.binance.vision').ok, true); assert.ok(/100 MB/.test(by('data.binance.vision').detail));
  eq(by('archivo histórico (dirección').ok, false); assert.ok(/404/.test(by('archivo histórico (dirección').detail));
  eq(by('Coinbase').ok, false);        // falla y se informa, sin romper el resto
  eq(r.results.length, 7);
  console.log('connection.test.js OK');
})().catch((e) => { console.error(e); process.exit(1); });

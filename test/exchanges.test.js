// Pruebas de Bybit/KuCoin con respuestas de ejemplo (NO es el servicio real) y de la adaptación de temporalidades.
const assert = require('assert');
const eq = assert.strictEqual;
const L = require('../renderer/js/lib.js');
delete process.env.TV_MOCK;
const core = require('../src/core.js');

// --- parsers ---
{
  const r = core.parseBybitKlines({ retCode: 0, result: { list: [['2000', '2', '4', '1', '3', '10', '30'], ['1000', '1', '3', '0.5', '2', '5', '9']] } });
  assert.deepStrictEqual(r, [[1000, '1', '3', '0.5', '2', '5'], [2000, '2', '4', '1', '3', '10']]);
  assert.throws(() => core.parseBybitKlines({ retCode: 10001, retMsg: 'mal' }), /Bybit: mal/);
  // KuCoin: [seg, apertura, CIERRE, máximo, mínimo, volumen]
  const k = core.parseKucoinKlines({ code: '200000', data: [['2', '2', '3', '4', '1', '10', '30'], ['1', '1', '2', '3', '0.5', '5', '9']] });
  assert.deepStrictEqual(k, [[1000, '1', '3', '0.5', '2', '5'], [2000, '2', '4', '1', '3', '10']]);
  assert.throws(() => core.parseKucoinKlines({ code: '400100', msg: 'x' }), /KuCoin: x/);
}

// --- peticiones con fetch falso ---
const calls = [];
let answers = [];
global.fetch = async (url) => {
  calls.push(String(url));
  const a = answers.shift();
  return { ok: true, status: 200, json: async () => a };
};
(async () => {
  answers = [{ retCode: 0, result: { list: [['2000', '2', '4', '1', '3', '10', '1'], ['1000', '1', '3', '0.5', '2', '5', '1']] } }];
  const bb = await core.klines({ exchange: 'bybit', symbol: 'BTCUSDT', interval: '1h', startTime: 1000, limit: 2 });
  eq(bb.length, 2); eq(bb[0][0], 1000);
  assert.ok(calls[0].startsWith('https://api.bybit.com/v5/market/kline?'));
  assert.ok(calls[0].includes('category=spot') && calls[0].includes('interval=60') && calls[0].includes('start=1000') && calls[0].includes('end='));
  await assert.rejects(core.klines({ exchange: 'bybit', symbol: 'BTCUSDT', interval: '1s', limit: 2 }), /Bybit no ofrece/);

  calls.length = 0;
  answers = [
    { code: '200000', data: [{ symbol: 'BTC-USDT', baseCurrency: 'BTC', quoteCurrency: 'USDT', enableTrading: true }] },
    { code: '200000', data: [['2', '2', '3', '4', '1', '10', '1'], ['1', '1', '2', '3', '0.5', '5', '1']] },
  ];
  const kc = await core.klines({ exchange: 'kucoin', symbol: 'BTCUSDT', interval: '1h', startTime: 1000, limit: 2 });
  eq(kc.length, 2);
  assert.ok(calls.some((u) => u.includes('/api/v1/market/candles') && u.includes('symbol=BTC-USDT') && u.includes('type=1hour')));

  // tickers
  calls.length = 0;
  answers = [{ retCode: 0, result: { list: [{ symbol: 'ETHUSDT', lastPrice: '2000', price24hPcnt: '0.05' }, { symbol: 'XXXUSDT', lastPrice: '1', price24hPcnt: '0' }] } }];
  const t1 = await core.tickers({ exchange: 'bybit', symbols: ['ETHUSDT'] });
  eq(t1.ETHUSDT.price, 2000); assert.ok(Math.abs(t1.ETHUSDT.pct - 5) < 1e-9); eq(t1.XXXUSDT, undefined);
  answers = [{ code: '200000', data: { ticker: [{ symbol: 'ETH-USDT', last: '2000', changeRate: '-0.02' }] } }];
  const t2 = await core.tickers({ exchange: 'kucoin', symbols: ['ETHUSDT'] });
  assert.ok(Math.abs(t2.ETHUSDT.pct + 2) < 1e-9);
  answers = [[{ symbol: 'ETHUSDT', openPrice: '100', lastPrice: '110' }]];
  const t3 = await core.tickers({ exchange: 'binance', symbols: ['ETHUSDT'] });
  assert.ok(Math.abs(t3.ETHUSDT.pct - 10) < 1e-9);

  // Bitstamp: símbolos, velas y precios
  answers = [[{ name: 'BTC/USD', url_symbol: 'btcusd', trading: 'Enabled' }, { name: 'ETH/EUR', url_symbol: 'etheur', trading: 'Enabled' }, { name: 'OLD/USD', url_symbol: 'oldusd', trading: 'Disabled' }]];
  const bs = await core.symbols({ exchange: 'bitstamp' });
  assert.deepStrictEqual(bs.map((x) => x.symbol), ['BTCUSD', 'ETHEUR']); eq(bs[0].native, 'btcusd'); eq(bs[1].quote, 'EUR');
  calls.length = 0;
  answers = [{ data: { pair: 'BTC/USD', ohlc: [{ timestamp: '2000', open: '2', high: '4', low: '1', close: '3', volume: '10' }, { timestamp: '1000', open: '1', high: '3', low: '0.5', close: '2', volume: '5' }] } }];
  const bk = await core.klines({ exchange: 'bitstamp', symbol: 'BTCUSD', interval: '1h', startTime: 1000000, limit: 2 });
  assert.deepStrictEqual(bk, [[1000000, '1', '3', '0.5', '2', '5'], [2000000, '2', '4', '1', '3', '10']]);
  assert.ok(calls[0].startsWith('https://www.bitstamp.net/api/v2/ohlc/btcusd/?') && calls[0].includes('step=3600') && calls[0].includes('start=1000') && calls[0].includes('end=8200') && calls[0].includes('limit=2'), calls[0]);
  await assert.rejects(core.klines({ exchange: 'bitstamp', symbol: 'BTCUSD', interval: '1w', limit: 2 }), /Bitstamp no ofrece/);
  await assert.rejects(async () => core.parseBitstampKlines({ code: 'x', errors: ['mal'] }), /Bitstamp/);
  answers = [{ last: '100', percent_change_24: '2.5', open_24: '97' }];
  const bt = await core.tickers({ exchange: 'bitstamp', symbols: ['BTCUSD'] });
  eq(bt.BTCUSD.price, 100); eq(bt.BTCUSD.pct, 2.5);

  // fallo de red: el mensaje nombra al exchange
  global.fetch = async () => { throw new Error('caído'); };
  await assert.rejects(core.tickers({ exchange: 'bybit', symbols: ['BTCUSDT', 'SOLUSDT'] }), /Bybit/);

  // --- tfFor ---
  const t = (id) => L.tfById(id);
  assert.ok(L.tfFor(t('s:30'), 'bybit').unavailable);
  assert.ok(!L.tfFor(t('s:30'), 'binance').unavailable);
  assert.ok(!L.tfFor(t('m:60'), 'kucoin').unavailable);
  const x = L.tfFor(t('m:480'), 'bybit');
  assert.ok(!x.unavailable); eq(x.base, '4h');
  eq(L.tfFor(t('m:480'), 'kucoin').base, '8h');
  eq(L.exchangeName('kucoin'), 'KuCoin');
  // Bitstamp no tiene 1 s, 8 h, 1 semana ni 1 mes
  assert.ok(L.tfFor(t('s:30'), 'bitstamp').unavailable);
  eq(L.tfFor(t('m:480'), 'bitstamp').base, '4h');
  const wk = L.tfFor(t('w:1'), 'bitstamp'); eq(wk.base, '1d'); eq(wk.kind, 'anchor'); eq(wk.sec, 604800);
  eq(new Date(L.bucketStart(wk, L.GENESIS_SEC + 3 * 86400 + 5, L.GENESIS_SEC) * 1000).getUTCDay(), 1); // las semanas empiezan en lunes
  const mo = L.tfFor(t('M:1'), 'bitstamp'); eq(mo.base, '1d'); eq(mo.kind, 'months'); eq(mo.n, 1);
  eq(L.tfFor(t('M:4'), 'bitstamp').n, 4);
  eq(L.tfFor(t('w:1'), 'bybit').base, '1w');
  console.log('exchanges.test.js OK');
})().catch((e) => { console.error(e); process.exit(1); });

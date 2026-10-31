'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const svc = require('../src/service');
const Store = require('../src/store');
const L = require('../renderer/js/lib.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artsvc-'));
// aceleración: por defecto encendida; se guarda y se lee
assert.strictEqual(svc.read(dir).hwAccel, true);
svc.write(dir, { hwAccel: false });
assert.strictEqual(svc.read(dir).hwAccel, false);
fs.writeFileSync(path.join(dir, 'service.json'), '{roto');
assert.strictEqual(svc.read(dir).hwAccel, true, 'archivo roto = valor por defecto');

// tema del sistema
assert.strictEqual(L.resolveTheme('system', true), 'light');
assert.strictEqual(L.resolveTheme('system', false), 'dark');
assert.strictEqual(L.resolveTheme('light', false), 'light');
assert.strictEqual(L.resolveTheme('dark', true), 'dark');
assert.strictEqual(L.resolveTheme('raro', true), 'dark');

// reseteo de fábrica: deja la carpeta como nueva (sin config, ventanas ni ajustes de servicio; CONSERVA operaciones y liquidaciones)
const store = Store.create(dir);
store.setConfig('w1', { theme: 'light', charts: [], scripts: [{ id: 'x' }] });
store.addWindow('w2'); store.setConfig('w2', { layout: '2h' });
svc.write(dir, { hwAccel: false, dataDir: '/mnt/externo', recordTrades: true });
fs.mkdirSync(path.join(dir, 'liq', 'x'), { recursive: true }); fs.writeFileSync(path.join(dir, 'liq', 'x', 'a.json'), '{}');
fs.mkdirSync(path.join(dir, 'trades', 'BTCUSDT'), { recursive: true });
fs.writeFileSync(path.join(dir, 'otra-cosa.txt'), 'no tocar');
const core = require('../src/core');
core.setDataDir(dir);
svc.factoryReset({ dir, store, core, restart: false });
const left = fs.readdirSync(dir).sort();
assert.deepStrictEqual(left, ['liq', 'otra-cosa.txt', 'service.json', 'trades'], 'los datos históricos se conservan: ' + left);
const kept = svc.read(dir); assert.ok(kept.hwAccel === true && kept.dataDir === '/mnt/externo' && kept.recordTrades === true, 'el reseteo conserva carpeta de datos y grabación');
assert.ok(fs.existsSync(path.join(dir, 'liq', 'x', 'a.json')) && fs.existsSync(path.join(dir, 'trades', 'BTCUSDT')));
assert.strictEqual(store.listWindows().length, 1, 'vuelve a una sola pestaña');
const fresh = store.getConfig('w1');
assert.ok(!fresh || !fresh.theme || fresh.theme !== 'light', 'el tema guardado ya no está');
assert.ok(!fresh || !(fresh.scripts && fresh.scripts.length), 'sin scripts guardados');
fs.rmSync(dir, { recursive: true, force: true });
console.log('service.test.js OK');

// ---------- v0.23.5: datos propios ----------
(async () => {
  const Hist = require('../src/hist');
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'arhist-'));
  const NOW = Date.now();
  let calls = 0;
  const deps = {
    sleep: async () => {},
    klines: async (startMs, endMs) => { calls++; const out = []; const stop = Math.min(endMs || Infinity, NOW); for (let t = Math.ceil(startMs / 60000) * 60000; t < stop && out.length < 1000; t += 60000) out.push([t, 100, 101, 99, 100.5, 3, 0]); return out; },
    funding: async (s) => { const out = []; for (let t = Math.ceil(s / 28800000) * 28800000; t < NOW && out.length < 1000; t += 28800000) out.push({ fundingTime: t, fundingRate: '0.0001', markPrice: '100' }); return out; },
  };
  const h = Hist.create({ dir: d2, deps, backfillDays: 3 });
  await h.cycle();
  let st = h.status();
  assert.ok(st.klines.rows >= 3 * 1440 - 5, 'velas 1m: ~3 días hacia atrás, hay ' + st.klines.rows);
  assert.ok(st.klines.to * 1000 > NOW - 120000, 'velas hasta casi ahora');
  assert.ok(st.funding.rows > 1000 && st.funding.from * 1000 <= Date.UTC(2019, 8, 11), 'funding desde 2019, hay ' + st.funding.rows);
  assert.ok(st.klines.bytes > 0 && st.klines.state === 'ok' && st.funding.state === 'ok');
  // no se duplica y no se pierde nada al repetir
  const before = st.klines.rows; await h.cycle(); assert.ok(h.status().klines.rows >= before && h.status().klines.rows <= before + 6);
  // reanuda tras cerrar: un objeto nuevo lee lo guardado
  const h2 = Hist.create({ dir: d2, deps, backfillDays: 3 }); h2.scan(); assert.strictEqual(h2.status().klines.rows, h.status().klines.rows);
  // si la fuente falla, el error se muestra y lo guardado se conserva
  const bad = Hist.create({ dir: d2, deps: Object.assign({}, deps, { klines: async () => { throw new Error('sin red'); } }), backfillDays: 10 }); bad.scan(); await bad.cycle();
  assert.ok(/sin red/.test(bad.status().klines.err) && bad.status().klines.state === 'aviso' && bad.status().klines.rows > 0);

  // almacén de liquidaciones: archivo permanente y sin recorte
  const LS = require('../src/liq/store');
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'arliq-'));
  const old = Math.floor(Date.now() / 1000) - 400 * 86400;
  let s1 = LS.create(d3);
  s1.addCandles([{ t: old, o: 1, h: 2, l: 0.5, c: 1.5 }, { t: old + 300, o: 1, h: 2, l: 0.5, c: 1.6 }]);
  s1.addOi('binance', [{ t: old, usd: 5 }]);
  s1.addEvent({ t: old, ex: 'binance', side: 0, price: 1, usd: 10 });
  s1.addEvent({ t: Math.floor(Date.now() / 1000), ex: 'okx', side: 1, price: 2, usd: 20 });
  s1.flush();
  assert.ok(fs.readFileSync(path.join(d3, 'arch-candles5m.jsonl'), 'utf8').trim().split('\n').length === 2, 'el archivo guarda velas de hace 400 días');
  assert.ok(fs.existsSync(path.join(d3, 'arch-oi-binance.jsonl')));
  assert.strictEqual(s1.state.candles.length, 0, 'en memoria solo los últimos 40 días');
  const s2 = LS.create(d3);                              // reabrir: eventos viejos siguen en disco; los recientes se cargan
  assert.strictEqual(s2.state.events.length, 1);
  s2.addCandles([{ t: old + 600, o: 1, h: 1, l: 1, c: 1 }]); s2.flush();
  assert.strictEqual(fs.readFileSync(path.join(d3, 'arch-candles5m.jsonl'), 'utf8').trim().split('\n').length, 3, 'solo se añade, sin duplicar');
  fs.rmSync(d2, { recursive: true, force: true }); fs.rmSync(d3, { recursive: true, force: true });
  console.log('datos propios OK');
})().catch((e) => { console.error(e); process.exit(1); });

// copia de seguridad y cambio de carpeta
(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'arbk-')), dest = fs.mkdtempSync(path.join(os.tmpdir(), 'arbk2-'));
  fs.mkdirSync(path.join(base, 'hist')); fs.writeFileSync(path.join(base, 'hist', 'a.jsonl'), '[1,2]\n');
  fs.mkdirSync(path.join(base, 'trades', 'BTCUSDT'), { recursive: true }); fs.writeFileSync(path.join(base, 'trades', 'BTCUSDT', 'x.trd'), 'abc');
  fs.writeFileSync(path.join(base, 'config.json'), '{}');
  const r = await svc.backup(base, dest);
  assert.ok(fs.existsSync(path.join(r.path, 'hist', 'a.jsonl')) && fs.existsSync(path.join(r.path, 'trades', 'BTCUSDT', 'x.trd')));
  assert.ok(!fs.existsSync(path.join(r.path, 'config.json')), 'la copia es de datos, no de ajustes');
  await assert.rejects(() => svc.backup(base, path.join(base, 'dentro')), /dentro/);
  // carpeta elegida que no existe/ no se puede escribir -> se avisa y se usa la de siempre
  fs.writeFileSync(path.join(base, 'service.json'), JSON.stringify({ dataDir: path.join(base, 'config.json', 'imposible') }));
  const res = svc.resolveDataDir(base); assert.strictEqual(res.dir, base); assert.ok(/No puedo usar la carpeta/.test(res.error));
  fs.writeFileSync(path.join(base, 'service.json'), JSON.stringify({ dataDir: dest + '/nueva' }));
  assert.strictEqual(svc.resolveDataDir(base).dir, dest + '/nueva');
  fs.rmSync(base, { recursive: true, force: true }); fs.rmSync(dest, { recursive: true, force: true });
  console.log('copia y carpeta OK');
})().catch((e) => { console.error(e); process.exit(1); });

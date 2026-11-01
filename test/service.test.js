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
svc.write(dir, { hwAccel: false, dataDir: '/mnt/externo' });
fs.mkdirSync(path.join(dir, 'liq', 'x'), { recursive: true }); fs.writeFileSync(path.join(dir, 'liq', 'x', 'a.json'), '{}');
fs.mkdirSync(path.join(dir, 'trades', 'BTCUSDT'), { recursive: true });
fs.writeFileSync(path.join(dir, 'otra-cosa.txt'), 'no tocar');
const core = require('../src/core');
core.setDataDir(dir);
svc.factoryReset({ dir, store, core, restart: false });
const left = fs.readdirSync(dir).sort();
assert.deepStrictEqual(left, ['liq', 'otra-cosa.txt', 'service.json', 'trades'], 'los datos históricos se conservan: ' + left);
const kept = svc.read(dir); assert.ok(kept.hwAccel === true && kept.dataDir === '/mnt/externo', 'el reseteo conserva la carpeta de datos');
assert.ok(fs.existsSync(path.join(dir, 'liq', 'x', 'a.json')) && fs.existsSync(path.join(dir, 'trades', 'BTCUSDT')));
assert.strictEqual(store.listWindows().length, 1, 'vuelve a una sola pestaña');
const fresh = store.getConfig('w1');
assert.ok(!fresh || !fresh.theme || fresh.theme !== 'light', 'el tema guardado ya no está');
assert.ok(!fresh || !(fresh.scripts && fresh.scripts.length), 'sin scripts guardados');
fs.rmSync(dir, { recursive: true, force: true });
console.log('service.test.js OK');

// ---------- v0.23.5: datos propios ----------
(async () => {
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
  assert.ok(!fs.existsSync(path.join(d3, 'arch-candles5m.jsonl')), 'las velas de 5 min (públicas) ya no se archivan');
  assert.ok(fs.existsSync(path.join(d3, 'arch-oi-binance.jsonl')));
  assert.strictEqual(s1.state.candles.length, 0, 'en memoria solo los últimos 40 días');
  const s2 = LS.create(d3);                              // reabrir: eventos viejos siguen en disco; los recientes se cargan
  assert.strictEqual(s2.state.events.length, 1);
  s2.addOi('binance', [{ t: old, usd: 5 }, { t: old + 300, usd: 6 }]); s2.flush();
  assert.strictEqual(fs.readFileSync(path.join(d3, 'arch-oi-binance.jsonl'), 'utf8').trim().split('\n').length, 2, 'el interés abierto solo se añade, sin duplicar');
  fs.rmSync(d3, { recursive: true, force: true });
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

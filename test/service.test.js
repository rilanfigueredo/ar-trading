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

// reseteo de fábrica: deja la carpeta como nueva (sin config, ventanas, datos descargados ni ajustes de servicio)
const store = Store.create(dir);
store.setConfig('w1', { theme: 'light', charts: [], scripts: [{ id: 'x' }] });
store.addWindow('w2'); store.setConfig('w2', { layout: '2h' });
svc.write(dir, { hwAccel: false });
fs.mkdirSync(path.join(dir, 'liq', 'x'), { recursive: true }); fs.writeFileSync(path.join(dir, 'liq', 'x', 'a.json'), '{}');
fs.mkdirSync(path.join(dir, 'trades', 'BTCUSDT'), { recursive: true });
fs.writeFileSync(path.join(dir, 'otra-cosa.txt'), 'no tocar');
const core = require('../src/core');
core.setDataDir(dir);
svc.factoryReset({ dir, store, core, restart: false });
const left = fs.readdirSync(dir).sort();
assert.deepStrictEqual(left, ['otra-cosa.txt'], 'queda solo lo ajeno: ' + left);
assert.strictEqual(store.listWindows().length, 1, 'vuelve a una sola pestaña');
const fresh = store.getConfig('w1');
assert.ok(!fresh || !fresh.theme || fresh.theme !== 'light', 'el tema guardado ya no está');
assert.ok(!fresh || !(fresh.scripts && fresh.scripts.length), 'sin scripts guardados');
fs.rmSync(dir, { recursive: true, force: true });
console.log('service.test.js OK');

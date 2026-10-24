// Pruebas del almacén de configuración con varias ventanas (v0.22)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('../src/store.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'artr-'));

// 1) Configuración de la v0.21 (todo junto) = ventana w1, sin perder nada; una ventana nueva no hereda los gráficos
{
  const d = tmp();
  const legacy = { version: 11, layout: '2h', active: 1, charts: [{ symbol: 'ETHUSDT' }, { symbol: 'SOLUSDT' }], sync: { cross: true, time: true }, drawings: { ETHUSDT: [1] }, folders: {}, bt: { h: 300 },
    theme: 'dark', tz: 'UTC', templates: [{ id: 't1', name: 'Mi diseño', data: { a: 1 } }], scripts: [{ id: 's1', name: 'x', code: 'y' }], lists: [{ id: 'l1' }], tfs: ['m:60'], palette: ['#ffffff'], timer: true, draw: { favs: [] }, listActive: 'l1' };
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify(legacy));
  const st = Store.create(d);
  const w1 = st.getConfig('w1');
  assert.strictEqual(w1.layout, '2h'); assert.strictEqual(w1.charts[1].symbol, 'SOLUSDT'); assert.strictEqual(w1.templates[0].name, 'Mi diseño'); assert.strictEqual(w1.tz, 'UTC');
  const w2 = st.getConfig('w2');                                    // ventana nueva: comparte lo global, pero no los gráficos
  assert.strictEqual(w2.charts, undefined); assert.strictEqual(w2.layout, undefined); assert.strictEqual(w2.templates[0].name, 'Mi diseño'); assert.strictEqual(w2.theme, 'dark');
  // se guarda w1 sin cambios: los gráficos pasan a win-w1.json y config.json queda solo con lo compartido
  st.setConfig('w1', w1);
  assert.ok(fs.existsSync(path.join(d, 'win-w1.json')));
  const shared = JSON.parse(fs.readFileSync(path.join(d, 'config.json'), 'utf8'));
  assert.strictEqual(shared.charts, undefined); assert.strictEqual(shared.templates.length, 1);
  assert.strictEqual(Store.create(d).getConfig('w1').charts[0].symbol, 'ETHUSDT');   // al reabrir sigue igual
}
// 2) Dos ventanas con configuración propia; lo compartido solo lo escribe quien lo cambió (no se pisan)
{
  const d = tmp();
  const st = Store.create(d);
  assert.strictEqual(st.getConfig('w1'), null);
  const base = { version: 11, theme: 'dark', tz: 'local', templates: [], palette: ['#fff'], tfs: ['m:60'], timer: true, lists: [], listActive: 'l1', scripts: [], draw: {} };
  const a = Object.assign({ layout: '1', active: 0, charts: [{ symbol: 'BTCUSDT', tf: 'm:60' }], sync: {}, drawings: {}, folders: {}, bt: {} }, base);
  st.setConfig('w1', a);
  st.addWindow('w2');
  const b0 = st.getConfig('w2');
  const b = Object.assign({}, b0, { layout: '4', charts: [{ symbol: 'ETHUSDT', tf: 'd:1' }], active: 0, sync: {}, drawings: {}, folders: {}, bt: {} });
  // A crea una plantilla; B cambia el tema (sin enterarse de la plantilla todavía)
  const a2 = Object.assign({}, a, { templates: [{ id: 't1', name: 'A', data: {} }] });
  const ra = st.setConfig('w1', a2);
  assert.deepStrictEqual(Object.keys(ra.changed), ['templates']);
  const b2 = Object.assign({}, b, { theme: 'light' });
  const rb = st.setConfig('w2', b2);
  assert.deepStrictEqual(Object.keys(rb.changed), ['theme']);       // B no vuelve a escribir la lista de plantillas vieja
  const fresh = Store.create(d);
  assert.strictEqual(fresh.getConfig('w1').templates.length, 1); assert.strictEqual(fresh.getConfig('w1').theme, 'light');
  assert.strictEqual(fresh.getConfig('w1').charts[0].symbol, 'BTCUSDT'); assert.strictEqual(fresh.getConfig('w2').charts[0].symbol, 'ETHUSDT'); assert.strictEqual(fresh.getConfig('w2').layout, '4');
  // aviso de otra ventana: se da por leído y no se reescribe
  st.markShared('w2', { templates: a2.templates });
  assert.deepStrictEqual(st.setConfig('w2', Object.assign({}, b2, { templates: a2.templates })).changed, {});
}
// 3) Registro de ventanas: de 1 a 10, ids libres, cerrar una la borra
{
  const d = tmp();
  const st = Store.create(d);
  assert.deepStrictEqual(st.listWindows().map((w) => w.id), ['w1']);
  const ids = ['w1'];
  for (let i = 0; i < 9; i++) { const id = st.newWindowId(); assert.ok(id); st.addWindow(id); ids.push(id); }
  assert.strictEqual(st.listWindows().length, 10);
  assert.strictEqual(st.newWindowId(), null);
  assert.throws(() => st.addWindow('w11'), /no válida/);
  st.setConfig('w3', { layout: '1', charts: [{ symbol: 'XRPUSDT' }] });
  st.removeWindow('w3');
  assert.strictEqual(st.listWindows().length, 9); assert.ok(!fs.existsSync(path.join(d, 'win-w3.json')));
  assert.strictEqual(st.newWindowId(), 'w3');
  st.setBounds('w2', { x: 10, y: 20, width: 800, height: 600 });
  assert.deepStrictEqual(Store.create(d).listWindows().find((w) => w.id === 'w2').bounds, { x: 10, y: 20, width: 800, height: 600 });
  assert.throws(() => st.getConfig('../hack'), /no válida/);
}
console.log('store.test.js OK');

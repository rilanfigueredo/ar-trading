// v0.23.6: compresión sin pérdida, candado de un solo escritor, huecos, ETH y arranque automático (todo sin red).
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const Events = require('../src/liq/events');
const Writer = require('../src/writer');
const S = require('../src/liq/sources');
const Auto = require('../src/autostart');
const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), n));

// --- compresión de meses cerrados ---
(function () {
  const d = tmp('arev-');
  const ev = Events.create(d);
  const t1 = Date.UTC(2025, 0, 15) / 1000, t2 = Date.UTC(2025, 1, 3) / 1000, now = Date.now() / 1000;
  const rows = [];
  for (let i = 0; i < 500; i++) rows.push({ t: t1 + i, ex: 'binance', side: i % 2, price: 90000 + i, usd: 1000 + i });
  for (let i = 0; i < 50; i++) rows.push({ t: t2 + i, ex: 'okx', side: 1, price: 95000 + i, usd: 5000 + i });
  rows.push({ t: Math.floor(now), ex: 'bybit', side: 0, price: 1, usd: 2 });
  rows.forEach((e) => ev.add(e)); ev.flush();
  const orig = fs.readFileSync(path.join(d, 'events-2025-01.jsonl'));
  const r = ev.compress();
  assert.deepStrictEqual([r.files, r.errors.length], [2, 0], 'se comprimen los 2 meses cerrados: ' + JSON.stringify(r));
  assert.ok(r.saved > 0);
  assert.ok(!fs.existsSync(path.join(d, 'events-2025-01.jsonl')) && fs.existsSync(path.join(d, 'events-2025-01.jsonl.gz')));
  assert.ok(fs.existsSync(path.join(d, 'events-' + new Date().toISOString().slice(0, 7) + '.jsonl')), 'el mes actual NO se comprime');
  assert.ok(zlib.gunzipSync(fs.readFileSync(path.join(d, 'events-2025-01.jsonl.gz'))).equals(orig), 'el .gz es idéntico al original');
  // se lee igual con .gz
  const all = Events.create(d).load(Date.UTC(2025, 0, 1) / 1000);
  assert.strictEqual(all.length, rows.length, 'no se pierde ni un evento: ' + all.length);
  const inf = Events.create(d).info(); assert.ok(inf.from === t1 && inf.to === Math.floor(now) && inf.months === 3);
  // segunda pasada: nada que hacer; evento tardío de un mes ya comprimido: se une sin duplicar
  assert.strictEqual(ev.compress().files, 0);
  const ev2 = Events.create(d); ev2.add({ t: t1 + 1000, ex: 'binance', side: 0, price: 1, usd: 1 }); ev2.add(rows[0]); ev2.flush();
  assert.strictEqual(ev2.load(Date.UTC(2025, 0, 1) / 1000).length, rows.length + 1, 'se leen .gz y .jsonl juntos, sin duplicar');
  assert.strictEqual(ev2.compress().files, 1);
  assert.strictEqual(Events.create(d).load(Date.UTC(2025, 0, 1) / 1000).length, rows.length + 1);
  // si la comprobación falla, el original se conserva
  const d2 = tmp('arev2-'); const e3 = Events.create(d2); e3.add({ t: t1, ex: 'okx', side: 0, price: 1, usd: 1 }); e3.flush();
  const real = zlib.gunzipSync; zlib.gunzipSync = () => Buffer.from('otra cosa');
  const bad = e3.compress(); zlib.gunzipSync = real;
  assert.ok(bad.errors.length === 1 && fs.existsSync(path.join(d2, 'events-2025-01.jsonl')) && !fs.existsSync(path.join(d2, 'events-2025-01.jsonl.gz')), 'si no coincide, el original queda intacto');
  fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(d2, { recursive: true, force: true });
  console.log('compresión OK');
})();

// --- candado de un solo escritor + huecos ---
(function () {
  const d = tmp('arwr-');
  const a = Writer.create({ dir: d, kind: 'servicio', port: 1234 });
  assert.ok(a.acquire().ok);
  const b = Writer.create({ dir: d, kind: 'app' });
  const rb = b.acquire(); assert.ok(!rb.ok && rb.owner && rb.owner.kind === 'servicio' && rb.owner.port === 1234, 'la app ve que el servicio guarda');
  a.release();
  assert.ok(b.acquire().ok, 'al soltar el candado, el otro lo toma'); b.release();
  // candado de un proceso muerto / latido viejo: se retira
  const lf = path.join(d, 'writer.lock');
  fs.writeFileSync(lf, JSON.stringify({ kind: 'servicio', pid: process.pid, port: 1, started: 1, beat: Math.floor(Date.now() / 1000) - 600 }));
  assert.strictEqual(Writer.owner(d), null, 'latido de hace 10 min = muerto');
  const c = Writer.create({ dir: d, kind: 'app' }); assert.ok(c.acquire().ok, 'toma el relevo del candado muerto');
  // un proceso que ya no existe también cuenta como muerto
  c.release();
  fs.writeFileSync(lf, JSON.stringify({ kind: 'servicio', pid: 2147483000, port: 1, started: 1, beat: Math.floor(Date.now() / 1000) }));
  assert.strictEqual(Writer.owner(d), null);
  fs.unlinkSync(lf);
  // huecos: sesiones con espacios entre ellas
  const now = Math.floor(Date.now() / 1000);
  fs.writeFileSync(path.join(d, 'cobertura.jsonl'), [{ s: now - 10000, e: now - 9000 }, { s: now - 9050, e: now - 8000 }, { s: now - 5000, e: now - 4000 }].map((x) => JSON.stringify(x)).join('\n') + '\n');
  const g = Writer.gaps(d);
  assert.strictEqual(g.first, now - 10000);
  assert.deepStrictEqual(g.list.slice(0, 2), [{ from: now - 8000, to: now - 5000 }, { from: now - 4000, to: null }], 'hueco entre sesiones y hueco abierto (nadie guarda ahora): ' + JSON.stringify(g.list));
  // sesión que no cerró bien (apagón): se anota hasta su último latido
  fs.writeFileSync(path.join(d, 'session.json'), JSON.stringify({ s: now - 3000, beat: now - 2000, who: 'app' }));
  const e = Writer.create({ dir: d, kind: 'app' }); e.acquire(); e.release();
  assert.ok(fs.readFileSync(path.join(d, 'cobertura.jsonl'), 'utf8').includes('"crash":1'));
  fs.rmSync(d, { recursive: true, force: true });
  console.log('candado y huecos OK');
})();

// --- ETH: parsers y servicio simulado ---
(async function () {
  const both = ['BTCUSDT', 'ETHUSDT'];
  const be = S.parseBinanceForce({ o: { s: 'ETHUSDT', S: 'BUY', ap: '2000', q: '2', T: 1700000000000 } }, both);
  assert.deepStrictEqual([be.sym, be.side, be.usd], ['ETHUSDT', 1, 4000]);
  assert.strictEqual(S.parseBinanceForce({ o: { s: 'ETHUSDT', S: 'BUY', p: '1', q: '1' } }), null, 'sin pedirlo, ETH no se toma');
  const oe = S.parseOkxLiq({ arg: { channel: 'liquidation-orders' }, data: [{ instId: 'ETH-USDT-SWAP', details: [{ posSide: 'long', sz: '10', bkPx: '2000', ts: '1700000000000' }] }] }, both);
  assert.deepStrictEqual([oe[0].sym, oe[0].usd], ['ETHUSDT', 10 * 0.1 * 2000]);
  const L = require('../src/liq');
  const d = tmp('areth-');
  const sock = (ex, onEvent, onState, syms) => { onState('ok', 'test'); setTimeout(() => { onEvent({ t: 1700000000, ex, sym: 'BTCUSDT', side: 0, price: 1, usd: 1 }); onEvent({ t: 1700000001, ex, sym: 'ETHUSDT', side: 1, price: 2, usd: 3 }); onEvent({ t: 1700000002, ex, sym: 'SOLUSDT', side: 1, price: 2, usd: 3 }); }, 5); assert.deepStrictEqual(syms, both); return { close() {} }; };
  const deps = Object.assign({}, L.mockDeps(), { openSocket: sock });
  const svc = L.create({ dir: d, deps, compressDelayMs: 0, assets: ['ETHUSDT', 'ETHUSDT', 'NOEXISTE'] });
  await svc.start(); await new Promise((r) => setTimeout(r, 60));
  await new Promise((r) => setTimeout(r, 300));
  const rows = svc.dataInfo(); svc.stop();
  const eth = rows.find((x) => x.id === 'liq-events-ETHUSDT');
  assert.ok(eth && eth.bytes > 0, 'ETH tiene su propio archivo y peso');
  assert.ok(!rows.find((x) => x.id === 'liq-events-SOLUSDT'), 'un activo no elegido no se guarda');
  assert.ok(fs.existsSync(path.join(d, 'ETHUSDT')) && fs.readdirSync(path.join(d, 'ETHUSDT')).some((f) => /^events-/.test(f)));
  assert.ok(!fs.readFileSync(path.join(d, fs.readdirSync(d).find((f) => /^events-/.test(f))), 'utf8').includes('ETHUSDT'), 'los eventos de BTC no se mezclan con los de ETH');
  assert.ok(svc.compressInfo().at, 'la compresión corrió (sin bloquear) poco después de arrancar');
  fs.rmSync(d, { recursive: true, force: true });
  console.log('ETH OK');
  // v0.26.2: la compresión que no bloquea da el mismo resultado y no pierde datos
  const Ev = require('../src/liq/events');
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cmpa-'));
  const lin = []; for (let i = 0; i < 2000; i++) lin.push(JSON.stringify({ t: 1759300000 + i, ex: 'binance', side: 'long', price: 60000 + i, usd: 1000 + i }));
  fs.writeFileSync(path.join(d2, 'events-2025-10.jsonl'), lin.join('\n') + '\n');
  const e9 = Ev.create(d2); const ra = await e9.compressAsync(Date.parse('2026-11-03') / 1000);
  assert.strictEqual(ra.files, 1); assert.deepStrictEqual(ra.errors, []);
  assert.ok(!fs.existsSync(path.join(d2, 'events-2025-10.jsonl')) && fs.existsSync(path.join(d2, 'events-2025-10.jsonl.gz')));
  assert.strictEqual(e9.load(1759300000 - 1).length, 2000, 'tras comprimir se leen los mismos 2000 eventos');
  assert.strictEqual((await e9.compressAsync(Date.parse('2026-11-03') / 1000)).files, 0);
  fs.rmSync(d2, { recursive: true, force: true });
  console.log('compresión sin bloqueo OK');
})().catch((e) => { console.error(e); process.exit(1); });

// --- arranque automático (carpeta Inicio de Windows): se prueba con una carpeta cualquiera ---
(function () {
  const d = tmp('arau-');
  const opt = { exe: 'C:\\Program Files\\Ar_Trading\\Ar_Trading.exe', servicio: 'C:\\x\\servicio.js', userData: 'C:\\Users\\a b\\AppData\\Roaming\\Ar_Trading', electronAsNode: true, dir: d };
  assert.ok(!Auto.isEnabled(d));
  const f = Auto.enable(opt);
  assert.ok(Auto.isEnabled(d) && fs.existsSync(f));
  const txt = fs.readFileSync(f, 'utf8');
  assert.ok(txt.includes('ELECTRON_RUN_AS_NODE=1') && txt.includes('--userdata') && txt.includes('sh.Run') && txt.includes(', 0, False'), 'sin ventana y con la misma carpeta de datos');
  assert.ok(txt.includes('""C:\\Program Files\\Ar_Trading\\Ar_Trading.exe""') || txt.includes('""'), 'comillas de VBScript dobladas');
  assert.ok(Auto.disable(d) && !Auto.isEnabled(d) && Auto.disable(d) === false);
  fs.rmSync(d, { recursive: true, force: true });
  console.log('arranque automático OK');
})();

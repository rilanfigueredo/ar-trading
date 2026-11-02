'use strict';
// Pruebas del Módulo 2 con DATOS SIMULADOS. Ejecutar: node test/run.js
const assert = require('assert');
const chain = require('../renderer/funciones/blockchain/chain');
const { createClient, SourceError } = require('../src/funciones/blockchain/api');
const storeLib = require('../src/funciones/blockchain/store');
const notifyLib = require('../src/funciones/blockchain/notify');
const { createMonitor, dayRangeToUnix } = require('../src/funciones/blockchain/monitor');
const charts = require('../renderer/funciones/blockchain/charts');
const { createPriceClient } = require('../src/funciones/blockchain/prices');
const http = require('../src/funciones/blockchain/http');

let pass = 0, fail = 0;
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------- Datos simulados ----------
const T0 = 1760600000;                 // instante base simulado
const startOf = (h) => h;              // claridad
// Marca de tiempo simulada de un bloque: 580 s por bloque desde la altura 970000.
const tsOf = (h) => T0 + (h - 970000) * 580;

function fakeChain(tipH) {
  const state = { tip: tipH, calls: [], failTip: false, failHeights: false, failAdj: false };
  const adjHeights = [];
  for (let h = 2016 * 470; h <= Math.floor(tipH / 2016) * 2016; h += 2016) adjHeights.push(h);
  const api = {
    source: 'mempool.space', baseUrl: 'https://mempool.space',
    async tipHeight() { state.calls.push('tip'); if (state.failTip) throw new SourceError('/api/blocks/tip/height', 'sin conexión (simulada)'); return state.tip; },
    async recentBlocks() {
      state.calls.push('recent');
      if (state.failTip) throw new SourceError('/api/v1/blocks', 'sin conexión (simulada)');
      const out = [];
      for (let i = 0; i < 15; i++) out.push({ height: state.tip - i, timestamp: tsOf(state.tip - i), difficulty: 140e12 });
      return out;
    },
    async blockAtHeight(h) {
      state.calls.push('h' + h);
      if (state.failHeights) throw new SourceError('/api/block-height/' + h, 'respuesta HTTP 500');
      // Halvings simulados: 600 s por bloque hacia atrás desde 970000 (solo para pruebas).
      return { height: h, timestamp: h >= 970000 ? tsOf(h) : tsOf(970000) - (970000 - h) * 600 };
    },
    async blockAtTime(ts) {
      state.calls.push('t' + ts);
      const h = 970000 + Math.round((ts - T0) / 580);
      return { height: h, timestamp: tsOf(h) };
    },
    async adjustments() {
      state.calls.push('adj');
      if (state.failAdj) throw new SourceError('/api/v1/mining/difficulty-adjustments', 'respuesta HTTP 429');
      return adjHeights.map((h, i) => ({ height: h, timestamp: tsOf(h), difficulty: 100e12 * Math.pow(1.01, i) }));
    },
  };
  return { api, state };
}

function memStore(initial) {
  let saved = null;
  const lib = storeLib;
  return {
    load() { return { state: initial || lib.emptyState(), warning: null }; },
    save(s) { saved = JSON.parse(JSON.stringify(s)); },
    get saved() { return saved; },
  };
}

// ---------- chain.js ----------
test('avance del período: bloque 973456 -> 1744 de 2016, faltan 272, 86,5 %', () => {
  const p = chain.epochProgress(973456);
  assert.strictEqual(p.startHeight, 971712);
  assert.strictEqual(p.nextRetargetHeight, 973728);
  assert.strictEqual(p.blocksInto, 1744);
  assert.strictEqual(p.blocksRemaining, 272);
  assert.ok(near(p.percent, 86.5, 0.05));
});

test('cambio estimado: 562,4 s -> +6,69 %; 600 s -> 0; topes del protocolo', () => {
  assert.ok(near(chain.estimateChange(562.4), 6.69, 0.02));
  assert.ok(near(chain.estimateChange(600), 0, 1e-9));
  assert.strictEqual(chain.estimateChange(1), 300);
  assert.strictEqual(chain.estimateChange(1e9), -75);
  assert.strictEqual(chain.estimateChange(0), null);
});

test('período actual: promedio, cambio estimado y fecha estimada', () => {
  const start = { height: 971712, timestamp: 1000000 };
  const tip = { height: 973456, timestamp: 1000000 + 1744 * 562.4 };
  const e = chain.currentEpoch(tip, start);
  assert.ok(near(e.avgSeconds, 562.4, 1e-6));
  assert.ok(near(e.estimatedChange, 6.69, 0.02));
  assert.ok(near(e.etaMs / 1000, tip.timestamp + 272 * 562.4, 1e-3));
  assert.ok(near(e.etaTargetMs / 1000, tip.timestamp + 272 * 600, 1e-3));
});

test('período actual sin bloque de inicio: no inventa promedio', () => {
  const e = chain.currentEpoch({ height: 973456, timestamp: 5 }, null);
  assert.strictEqual(e.avgSeconds, null);
  assert.strictEqual(e.estimatedChange, null);
  assert.strictEqual(e.blocksRemaining, 272);
});

test('inicio de período recién estrenado (0 bloques): sin promedio', () => {
  const e = chain.currentEpoch({ height: 971712, timestamp: 9 }, { height: 971712, timestamp: 9 });
  assert.strictEqual(e.avgSeconds, null);
});

test('tabla de períodos: promedios y cambio entre ajustes', () => {
  const E = chain.EPOCH;
  const entries = [
    { height: 100 * E, timestamp: 1000, difficulty: 100 },
    { height: 101 * E, timestamp: 1000 + E * 600, difficulty: 110 },
    { height: 102 * E, timestamp: 1000 + E * 600 + E * 500, difficulty: 120 },
  ];
  const live = { startHeight: 102 * E, avgSeconds: 550 };
  const t = chain.epochTable(entries, live);
  assert.strictEqual(t.length, 3);
  assert.strictEqual(t[0].startHeight, 102 * E);        // más nuevo primero
  assert.strictEqual(t[0].inProgress, true);
  assert.strictEqual(t[0].avgSeconds, 550);
  assert.ok(near(t[1].avgSeconds, 500, 1e-9));
  assert.ok(near(t[2].avgSeconds, 600, 1e-9));
  assert.ok(near(t[1].changeFromPrev, 10, 1e-9));
  assert.strictEqual(t[2].changeFromPrev, null);
});

test('eras: número de era, recompensa, tabla con promedios', () => {
  assert.strictEqual(chain.eraIndex(209999), 0);
  assert.strictEqual(chain.eraIndex(210000), 1);
  assert.strictEqual(chain.eraIndex(840000), 4);
  assert.strictEqual(chain.subsidyBtc(0), 50);
  assert.strictEqual(chain.subsidyBtc(4), 3.125);
  const marks = { 0: 0, 210000: 210000 * 600, 420000: 210000 * 600 + 210000 * 540 };
  const tip = { height: 420000 + 1000, timestamp: marks[420000] + 1000 * 700 };
  const rows = chain.eraTable(marks, tip);
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[0].era, 2);
  assert.strictEqual(rows[0].inProgress, true);
  assert.ok(near(rows[0].avgSeconds, 700, 1e-9));
  assert.ok(near(rows[1].avgSeconds, 540, 1e-9));
  assert.ok(near(rows[2].avgSeconds, 600, 1e-9));
});

test('eras: si falta una marca, esa fila queda sin promedio (no se inventa)', () => {
  const rows = chain.eraTable({ 0: 0 }, { height: 215000, timestamp: 215000 * 600 });
  assert.strictEqual(rows[0].avgSeconds, null);   // era 1: falta la marca de 210000
  assert.strictEqual(rows[1].avgSeconds, null);   // era 0: falta la marca final
});

test('próximo halving: bloques que faltan y fechas', () => {
  const h = chain.nextHalving({ height: 1000000, timestamp: 1000 }, 580);
  assert.strictEqual(h.height, 1050000);
  assert.strictEqual(h.blocksRemaining, 50000);
  assert.strictEqual(h.newSubsidy, 1.5625);
  assert.strictEqual(h.etaTargetMs, (1000 + 50000 * 600) * 1000);
  assert.strictEqual(h.etaMs, (1000 + 50000 * 580) * 1000);
});

test('rango de fechas: promedio, advertencia de rango corto, orden invertido', () => {
  const r = chain.rangeAverage({ height: 100, timestamp: 0 }, { height: 1100, timestamp: 580000 });
  assert.ok(near(r.avgSeconds, 580, 1e-9));
  assert.ok(near(r.vsTargetPercent, (580 / 600 - 1) * 100, 1e-9));
  assert.strictEqual(r.shortRange, false);
  const s = chain.rangeAverage({ height: 1100, timestamp: 580000 }, { height: 1120, timestamp: 591600 });
  assert.strictEqual(s.shortRange, true);
  assert.strictEqual(chain.rangeAverage({ height: 5, timestamp: 1 }, { height: 5, timestamp: 1 }), null);
});

test('formato de duración', () => {
  assert.strictEqual(chain.formatDuration(90061), '1 d 1 h');
  assert.strictEqual(chain.formatDuration(3700), '1 h 1 min');
  assert.strictEqual(chain.formatDuration(125), '2 min 5 s');
  assert.strictEqual(chain.formatDuration(null), '—');
});

// ---------- api.js ----------
function resp(body, ok, status, text) {
  return { ok: ok !== false, status: status || 200, json: async () => body, text: async () => (text != null ? text : String(body)) };
}

test('api: altura actual correcta', async () => {
  const c = createClient({ retryDelayMs: 0, fetchFn: async (u) => { assert.ok(u.endsWith('/api/blocks/tip/height')); return resp(null, true, 200, '973456\n'); } });
  assert.strictEqual(await c.tipHeight(), 973456);
});

test('api: HTTP 500 -> SourceError que dice qué falló y que NO se cambió de fuente', async () => {
  const c = createClient({ retryDelayMs: 0, fetchFn: async () => resp(null, false, 500) });
  await assert.rejects(c.tipHeight(), (e) => e instanceof SourceError && /HTTP 500/.test(e.message) && /No se cambió a otra fuente/.test(e.message));
});

test('api: sin conexión -> SourceError', async () => {
  const c = createClient({ retryDelayMs: 0, fetchFn: async () => { throw new Error('ENOTFOUND'); } });
  await assert.rejects(c.recentBlocks(), (e) => e instanceof SourceError && /sin conexión/.test(e.message));
});

test('api: tiempo agotado -> SourceError', async () => {
  const c = createClient({ retryDelayMs: 0, timeoutMs: 20, fetchFn: (u, o) => new Promise((_, rej) => { o.signal.addEventListener('abort', () => { const e = new Error('abortado'); e.name = 'AbortError'; rej(e); }); }) });
  await assert.rejects(c.tipHeight(), (e) => e instanceof SourceError && /sin respuesta/.test(e.message));
});

test('api: datos con forma inesperada se rechazan (no se pintan)', async () => {
  const c1 = createClient({ retryDelayMs: 0, fetchFn: async () => resp(null, true, 200, 'hola') });
  await assert.rejects(c1.tipHeight(), SourceError);
  const c2 = createClient({ retryDelayMs: 0, fetchFn: async () => resp([{ height: 'x' }]) });
  await assert.rejects(c2.recentBlocks(), SourceError);
  const c3 = createClient({ retryDelayMs: 0, fetchFn: async () => resp([[1700000000, 100, 5e13, 1.0]]) }); // 100 no es múltiplo de 2016
  await assert.rejects(c3.adjustments(), (e) => /múltiplo de 2016/.test(e.message));
});

test('api: historial de ajustes válido y bloque por altura', async () => {
  const hash = 'a'.repeat(64);
  const c = createClient({
    fetchFn: async (u) => {
      if (u.endsWith('/difficulty-adjustments')) return resp([[1700000000, 4032, 5e13, 1.02], [1699000000, 2016, 4.9e13, 1.0]]);
      if (u.includes('/block-height/')) return resp(null, true, 200, hash);
      if (u.includes('/block/')) return resp({ id: hash, height: 840000, timestamp: 1713571767 });
      throw new Error('url inesperada ' + u);
    },
  });
  const a = await c.adjustments();
  assert.strictEqual(a.length, 2);
  assert.strictEqual(a[0].height, 4032);
  const b = await c.blockAtHeight(840000);
  assert.strictEqual(b.timestamp, 1713571767);
});

test('api: bloque que no es el pedido se rechaza', async () => {
  const hash = 'b'.repeat(64);
  const c = createClient({ retryDelayMs: 0, fetchFn: async (u) => (u.includes('/block-height/') ? resp(null, true, 200, hash) : resp({ id: hash, height: 5, timestamp: 1 })) });
  await assert.rejects(c.blockAtHeight(840000), (e) => /devolvió el bloque 5/.test(e.message));
});

test('api: bloque por fecha acepta hora ISO o en segundos', async () => {
  const c1 = createClient({ retryDelayMs: 0, fetchFn: async () => resp({ height: 700000, hash: 'h', timestamp: '2021-12-27T10:00:00.000Z' }) });
  assert.strictEqual((await c1.blockAtTime(1640000000)).timestamp, Date.parse('2021-12-27T10:00:00.000Z') / 1000);
  const c2 = createClient({ retryDelayMs: 0, fetchFn: async () => resp({ height: 700000, hash: 'h', timestamp: 1640599200 }) });
  assert.strictEqual((await c2.blockAtTime(1640000000)).timestamp, 1640599200);
});

// ---------- store.js ----------
test('historial: sin repetidos, ordenado y con tope', () => {
  const s = storeLib.emptyState();
  storeLib.addToLog(s, [{ height: 10, timestamp: 100 }, { height: 11, timestamp: 700 }], 1);
  storeLib.addToLog(s, [{ height: 11, timestamp: 700 }, { height: 12, timestamp: 1200 }], 2);
  assert.deepStrictEqual(s.blockLog.map((e) => e.h), [10, 11, 12]);
  const r = storeLib.recentWithIntervals(s, 3);
  assert.strictEqual(r[0].height, 12);
  assert.strictEqual(r[0].secondsSincePrev, 500);
  assert.strictEqual(r[2].secondsSincePrev, null);
  const big = storeLib.emptyState();
  const blocks = [];
  for (let i = 0; i < storeLib.MAX_LOG + 50; i++) blocks.push({ height: i, timestamp: i * 600 });
  storeLib.addToLog(big, blocks, 3);
  assert.strictEqual(big.blockLog.length, storeLib.MAX_LOG);
  assert.strictEqual(big.blockLog[big.blockLog.length - 1].h, storeLib.MAX_LOG + 49);
});

test('historial: hueco entre bloques no inventa intervalo', () => {
  const s = storeLib.emptyState();
  storeLib.addToLog(s, [{ height: 10, timestamp: 100 }, { height: 20, timestamp: 6100 }], 1);
  assert.strictEqual(storeLib.recentWithIntervals(s, 1)[0].secondsSincePrev, null);
});

test('archivo: guarda y recupera; archivo dañado se aparta y se avisa', () => {
  const files = new Map();
  const fs = {
    existsSync: (p) => files.has(p),
    readFileSync: (p) => files.get(p),
    writeFileSync: (p, t) => files.set(p, t),
    renameSync: (a, b) => { files.set(b, files.get(a)); files.delete(a); },
  };
  const st = storeLib.createFileStore(fs, '/x/h.json', () => 42);
  const first = st.load();
  assert.strictEqual(first.warning, null);
  first.state.blockMarks['840000'] = 123;
  st.save(first.state);
  assert.strictEqual(st.load().state.blockMarks['840000'], 123);
  files.set('/x/h.json', '{{{ roto');
  const bad = st.load();
  assert.ok(/dañado/.test(bad.warning));
  assert.ok(files.has('/x/h.json.danado-42'));       // no se borró: se apartó
  assert.deepStrictEqual(bad.state.blockLog, []);
});

test('ajustes: se normalizan (mínimos y máximos)', () => {
  const s = storeLib.normalizeSettings({ pollSeconds: 2, nearBlocks: 99999, notifyNewBlock: 1 });
  assert.strictEqual(s.pollSeconds, 15);
  assert.strictEqual(s.nearBlocks, 2016);
  assert.strictEqual(s.notifyNewBlock, true);
});

// ---------- notify.js ----------
const S_ALL = { notifyNewBlock: true, notifyRetarget: true, notifyNear: true, nearBlocks: 144 };
test('avisos: primer arranque no avisa', () => {
  assert.deepStrictEqual(notifyLib.decide(null, { height: 5, epochIndex: 1, blocksRemaining: 100 }, S_ALL), []);
});
test('avisos: bloque nuevo (uno y varios) y apagado', () => {
  const p = { height: 100, epochIndex: 1, blocksRemaining: 1000 };
  assert.strictEqual(notifyLib.decide(p, { height: 101, epochIndex: 1, blocksRemaining: 999 }, S_ALL).filter((a) => a.id === 'block').length, 1);
  assert.ok(/a/.test(notifyLib.decide(p, { height: 103, epochIndex: 1, blocksRemaining: 997 }, S_ALL)[0].body));
  assert.deepStrictEqual(notifyLib.decide(p, { height: 101, epochIndex: 1, blocksRemaining: 999 }, Object.assign({}, S_ALL, { notifyNewBlock: false })), []);
});
test('avisos: cruce de "faltan pocos bloques" ocurre una sola vez', () => {
  const a = notifyLib.decide({ height: 1, epochIndex: 1, blocksRemaining: 145 }, { height: 2, epochIndex: 1, blocksRemaining: 144 }, Object.assign({}, S_ALL, { notifyNewBlock: false }));
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].id, 'near');
  const b = notifyLib.decide({ height: 2, epochIndex: 1, blocksRemaining: 144 }, { height: 3, epochIndex: 1, blocksRemaining: 143 }, Object.assign({}, S_ALL, { notifyNewBlock: false }));
  assert.strictEqual(b.length, 0);
});
test('avisos: nuevo período con el cambio aplicado', () => {
  const a = notifyLib.decide({ height: 2015, epochIndex: 0, blocksRemaining: 1 }, { height: 2016, epochIndex: 1, blocksRemaining: 2016 }, Object.assign({}, S_ALL, { notifyNewBlock: false }), { lastChange: -3.456 });
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].id, 'retarget');
  assert.ok(/-3\.46/.test(a[0].body));
});

// ---------- monitor.js (con fuente simulada) ----------
test('monitor: primera lectura completa, sin avisos al arrancar', async () => {
  const { api, state } = fakeChain(973456);
  const alerts = [];
  const m = createMonitor({ api, store: memStore(), notifier: (l) => alerts.push(...l), now: () => 5000 });
  const v = await m.refresh();
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.tip.height, 973456);
  assert.strictEqual(v.epoch.blocksInto, 1744);
  assert.strictEqual(v.epoch.blocksRemaining, 272);
  assert.ok(near(v.epoch.avgSeconds, 580, 1e-9));            // simulado: 580 s por bloque
  assert.ok(near(v.epoch.estimatedChange, (600 / 580 - 1) * 100, 1e-9));
  assert.strictEqual(v.eras.length, 5);                       // eras 0 a 4
  assert.strictEqual(v.epochs.length, 13);            // la fuente simulada entrega 13 períodos
  assert.strictEqual(v.epochs[0].inProgress, true);
  assert.strictEqual(v.recent.length, 15);
  assert.strictEqual(v.recent[0].secondsSincePrev, 580);
  assert.strictEqual(alerts.length, 0);
  assert.strictEqual(state.calls.filter((c) => c === 'adj').length, 1);
});

test('monitor: misma altura no repite la descarga pesada', async () => {
  const { api, state } = fakeChain(973456);
  const m = createMonitor({ api, store: memStore(), now: () => 1 });
  await m.refresh();
  const heavy = state.calls.filter((c) => c === 'recent').length;
  await m.refresh();
  await m.refresh();
  assert.strictEqual(state.calls.filter((c) => c === 'recent').length, heavy);
  await m.refresh(true);
  assert.strictEqual(state.calls.filter((c) => c === 'recent').length, heavy + 1);
});

test('monitor: bloque nuevo avisa si está activado; guarda marcas y no las vuelve a pedir', async () => {
  const { api, state } = fakeChain(973456);
  const st = memStore();
  const alerts = [];
  const m = createMonitor({ api, store: st, notifier: (l) => alerts.push(...l), now: () => 1 });
  m.setSettings({ notifyNewBlock: true });
  await m.refresh();
  const heightCalls = state.calls.filter((c) => /^h\d+$/.test(c)).length;
  state.tip = 973457;
  const v = await m.refresh();
  assert.strictEqual(v.tip.height, 973457);
  assert.strictEqual(alerts.length, 1);
  assert.ok(/973/.test(alerts[0].body));
  assert.strictEqual(state.calls.filter((c) => /^h\d+$/.test(c)).length, heightCalls);  // sin consultas repetidas
  assert.ok(st.saved.blockMarks['840000'] != null);
});

test('monitor: aviso de nuevo período al cruzar el bloque de ajuste', async () => {
  const { api, state } = fakeChain(973727);
  const alerts = [];
  const m = createMonitor({ api, store: memStore(), notifier: (l) => alerts.push(...l), now: () => 1 });
  await m.refresh();
  state.tip = 973728;
  await m.refresh();
  assert.ok(alerts.some((a) => a.id === 'retarget'));
});

test('monitor: la fuente cae -> ok:false, mensaje claro, conserva datos viejos, no cambia de fuente', async () => {
  const { api, state } = fakeChain(973456);
  const m = createMonitor({ api, store: memStore(), now: () => 1 });
  await m.refresh();
  state.failTip = true;
  const v = await m.refresh();
  assert.strictEqual(v.ok, false);
  assert.ok(/mempool\.space/.test(v.error) && /No se cambió a otra fuente/.test(v.error));
  assert.strictEqual(v.stale.tip.height, 973456);
  state.failTip = false;
  assert.strictEqual((await m.refresh()).ok, true);          // se recupera sola
});

test('monitor: falla parcial (halvings / historial) -> el resto sigue y el error se muestra', async () => {
  const { api, state } = fakeChain(973456);
  state.failHeights = true;
  state.failAdj = true;
  const m = createMonitor({ api, store: memStore(), now: () => 1 });
  const v = await m.refresh();
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.tip.height, 973456);
  assert.ok(v.errors.length >= 2);
  assert.ok(v.errors.some((e) => /Historial de períodos/.test(e.section) && /HTTP 429/.test(e.message)));
  assert.ok(v.eras.every((r) => r.avgSeconds == null));       // sin marcas, sin promedios inventados
  assert.strictEqual(v.epoch.avgSeconds, null);               // falló el bloque de inicio: tampoco se inventa
});

test('monitor: promedio por rango de fechas con fuente simulada', async () => {
  const { api } = fakeChain(973456);
  const m = createMonitor({ api, store: memStore(), now: () => 1 });
  const r = await m.rangeAverage(T0, T0 + 580 * 1000);
  assert.strictEqual(r.ok, true);
  assert.ok(near(r.range.avgSeconds, 580, 1e-9));
  assert.strictEqual(r.range.blocks, 1000);
  const same = await m.rangeAverage(T0, T0 + 10);
  assert.strictEqual(same.ok, false);
});

test('monitor: rango de fechas, falla de la fuente -> mensaje claro', async () => {
  const { api } = fakeChain(973456);
  api.blockAtTime = async () => { throw new SourceError('/api/v1/mining/blocks/timestamp/1', 'respuesta HTTP 502'); };
  const m = createMonitor({ api, store: memStore(), now: () => 1 });
  const r = await m.rangeAverage(1, 2);
  assert.strictEqual(r.ok, false);
  assert.ok(/HTTP 502/.test(r.error) && /No se cambió a otra fuente/.test(r.error));
});

test('fechas: conversión día a día y validaciones', () => {
  const now = new Date(2026, 9, 27, 12, 0, 0).getTime();
  const ok = dayRangeToUnix('2026-10-01', '2026-10-20', now);
  assert.ok(ok.from < ok.to);
  assert.strictEqual(ok.to - ok.from, 20 * 86400 - 1);        // 20 días completos (sin cambio de hora ese mes)
  const capped = dayRangeToUnix('2026-10-01', '2026-12-31', now);
  assert.strictEqual(capped.to, Math.floor(now / 1000));       // no pasa de "ahora"
  assert.ok(dayRangeToUnix('2026-10-20', '2026-10-01', now).error);
  assert.ok(dayRangeToUnix('', '2026-10-01', now).error);
  assert.ok(dayRangeToUnix('2008-01-01', '2008-02-01', now).error);
});


// ---------- v0.2: informe de era, tramos, gráficos ----------
test('próximo halving: avance de la era en %', () => {
  const h = chain.nextHalving({ height: 840000 + 105000, timestamp: 1000 }, 600);
  assert.strictEqual(h.blocksInto, 105000);
  assert.ok(near(h.percent, 50, 1e-9));
});

test('informe de era: promedio, extremos, dificultad inicial/final y duración', () => {
  const E = chain.EPOCH;
  const base = 210000;
  const first = Math.ceil(base / E) * E;                      // primer período que empieza dentro de la era
  const mk = (i, avg, diff, ch, inProg) => ({ startHeight: first + i * E, endHeight: first + (i + 1) * E, startTimestamp: 1000 + i * 100, difficulty: diff, changeFromPrev: ch, avgSeconds: avg, inProgress: !!inProg });
  const epochs = [mk(3, 580, 130, 8, true), mk(2, 650, 120, -5), mk(1, 500, 126, 26), mk(0, 600, 100, null)].concat([{ startHeight: first - E, endHeight: first, startTimestamp: 1, difficulty: 1, changeFromPrev: 0, avgSeconds: 1, inProgress: false }]);
  const eraRow = { era: 1, startHeight: base, endHeight: base + 210000, subsidy: 25, startTimestamp: 5000, avgSeconds: 540, blocks: 210000, inProgress: false };
  const r = chain.eraReport(eraRow, epochs);
  assert.strictEqual(r.periods, 4);                           // el período anterior a la era no cuenta
  assert.strictEqual(r.fastest.avgSeconds, 500);
  assert.strictEqual(r.slowest.avgSeconds, 650);             // el período en curso no entra en extremos
  assert.strictEqual(r.difficultyStart, 100);
  assert.strictEqual(r.difficultyEnd, 130);
  assert.ok(near(r.growthFactor, 1.3, 1e-9));
  assert.ok(near(r.deviationPercent, (540 / 600 - 1) * 100, 1e-9));
  assert.strictEqual(r.durationSeconds, 540 * 210000);
  assert.strictEqual(r.endTimestamp, 5000 + 540 * 210000);
  assert.ok(near(r.expectedYears, 3.99, 0.01));
  assert.strictEqual(r.speedSeries.length, 4);
  assert.strictEqual(r.changeSeries.length, 3);
});

test('informe de era sin períodos entregados: no inventa nada', () => {
  const r = chain.eraReport({ era: 0, startHeight: 0, endHeight: 210000, subsidy: 50, startTimestamp: 0, avgSeconds: null, blocks: null, inProgress: false }, []);
  assert.strictEqual(r.periods, 0);
  assert.strictEqual(r.fastest, null);
  assert.strictEqual(r.growthFactor, null);
  assert.strictEqual(r.durationSeconds, null);
});

test('tramos: promedio por tramo, descarta muestras desordenadas, mínimo y máximo', () => {
  const segs = chain.segmentsFromSamples([
    { height: 0, timestamp: 0 }, { height: 10, timestamp: 5000 }, { height: 10, timestamp: 5000 }, { height: 20, timestamp: 11000 }, { height: 15, timestamp: 12000 }, { height: 30, timestamp: 14000 },
  ]);
  assert.strictEqual(segs.length, 3);
  assert.strictEqual(segs[0].avgSeconds, 500);
  assert.strictEqual(segs[1].avgSeconds, 600);
  assert.strictEqual(segs[2].avgSeconds, 300);
  const st = chain.segmentStats(segs);
  assert.strictEqual(st.min.avgSeconds, 300);
  assert.strictEqual(st.max.avgSeconds, 600);
  assert.strictEqual(chain.segmentStats([segs[0]]), null);
});

test('dificultad: hashes por bloque = dificultad x 2^32; 140,58 T ≈ 1,0 ZH/s', () => {
  const i = chain.difficultyInfo(140.58e12);
  assert.ok(near(i.hashesPerBlock / 1e23, 6.04, 0.01));
  assert.ok(near(i.impliedHashrate / 1e21, 1.006, 0.001));
  assert.strictEqual(chain.difficultyInfo(0), null);
});

test('gráficos: línea con referencia, barras, vacío y datos malos', () => {
  const pts = [0, 1, 2, 3].map((i) => ({ x: i * 100, y: 580 + i * 10, label: 'p' + i }));
  const svg = charts.lineChart({ series: [{ name: 'a', color: '#f7931a', points: pts }], refLines: [{ y: 600, label: 'Objetivo 600 s' }], xFormat: (x) => 'x' + x, yFormat: (y) => y + ' s' });
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.strictEqual((svg.match(/<circle/g) || []).length, 4);
  assert.ok(/Objetivo 600 s/.test(svg));
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
  assert.ok(/Sin datos/.test(charts.lineChart({ series: [{ points: [{ x: NaN, y: 1 }] }] })));
  const bar = charts.barChart({ bars: [{ label: 'a', y: 5 }, { label: 'b', y: -3 }, { label: 'c', y: 0 }] });
  assert.strictEqual((bar.match(/<rect/g) || []).length, 3);
  assert.ok(!/NaN|undefined|Infinity/.test(bar));
  assert.ok(/#ff6b6b/.test(bar) && /#3ccf91/.test(bar));
  assert.ok(/Sin datos/.test(charts.barChart({ bars: [] })));
  const one = charts.lineChart({ series: [{ points: [{ x: 5, y: 5 }] }] });
  assert.ok(!/NaN|undefined|Infinity/.test(one));
  assert.ok(/&lt;b&gt;/.test(charts.lineChart({ series: [{ points: [{ x: 1, y: 1, label: '<b>' }, { x: 2, y: 2 }] }] })));   // texto escapado
});

test('monitor: rango con gráfica: tramos, mínimo y máximo con fuente simulada', async () => {
  const { api } = fakeChain(973456);
  const m = createMonitor({ api, store: memStore(), now: () => 1 });
  const r = await m.rangeAverage(T0, T0 + 580 * 1200);
  assert.strictEqual(r.ok, true);
  assert.ok(r.series.length >= 20 && r.series.length <= 24);
  assert.ok(near(r.stats.min.avgSeconds, 580, 1e-6) && near(r.stats.max.avgSeconds, 580, 1e-6));
  assert.strictEqual(r.seriesError, null);
});

test('monitor: si fallan los tramos, el promedio sigue y se avisa por qué no hay gráfica', async () => {
  const { api } = fakeChain(973456);
  const orig = api.blockAtTime;
  let n = 0;
  api.blockAtTime = async (t) => { n++; if (n > 2) throw new SourceError('/api/v1/mining/blocks/timestamp/' + t, 'respuesta HTTP 429'); return orig(t); };
  const m = createMonitor({ api, store: memStore(), now: () => 1 });
  const r = await m.rangeAverage(T0, T0 + 580 * 1200);
  assert.strictEqual(r.ok, true);
  assert.ok(near(r.range.avgSeconds, 580, 1e-6));
  assert.strictEqual(r.series, null);
  assert.ok(/HTTP 429/.test(r.seriesError) && /No se cambió a otra fuente/.test(r.seriesError));
});

test('monitor: rango muy corto -> promedio sin gráfica y sin error', async () => {
  const { api } = fakeChain(973456);
  const m = createMonitor({ api, store: memStore(), now: () => 1 });
  const r = await m.rangeAverage(T0, T0 + 580 * 20);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.series, null);
  assert.strictEqual(r.seriesError, null);
});


// ---------- v0.4: reintento, causa del fallo, precios de Bitstamp, datos guardados ----------
test('red: un fallo momentáneo se reintenta una vez y se recupera', async () => {
  let n = 0;
  const get = http.makeGet({ baseUrl: 'https://x', retryDelayMs: 0, fetchFn: async () => { n++; if (n === 1) { const e = new Error('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e; } return resp(null, true, 200, '5'); } });
  assert.strictEqual(await get('/a', 'text'), '5');
  assert.strictEqual(n, 2);
});

test('red: si el reintento también falla, el mensaje incluye la causa real', async () => {
  const get = http.makeGet({ baseUrl: 'https://x', retryDelayMs: 0, source: 'mempool.space', fetchFn: async () => { const e = new Error('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e; } });
  await assert.rejects(get('/a'), (e) => e instanceof SourceError && /ECONNRESET/.test(e.message) && /No se cambió a otra fuente/.test(e.message));
});

test('red: error 5xx se reintenta; error 4xx (por ejemplo 429) NO', async () => {
  let n = 0;
  const g5 = http.makeGet({ baseUrl: 'https://x', retryDelayMs: 0, fetchFn: async () => { n++; return n === 1 ? resp(null, false, 503) : resp(null, true, 200, 'ok'); } });
  assert.strictEqual(await g5('/a', 'text'), 'ok');
  let m = 0;
  const g4 = http.makeGet({ baseUrl: 'https://x', retryDelayMs: 0, fetchFn: async () => { m++; return resp(null, false, 429); } });
  await assert.rejects(g4('/a'), /HTTP 429/);
  assert.strictEqual(m, 1);
});

function ohlcResp(list) { return resp({ data: { pair: 'BTC/USD', ohlc: list } }); }
const candle = (ts, open) => ({ timestamp: String(ts), open: String(open), high: '1', low: '1', close: '1', volume: '1' });

test('Bitstamp: toma la vela exacta del minuto (ignora velas vecinas)', async () => {
  const t = 1700000030;                                     // dentro del minuto 1699999980 + 60 = 1700000040? se calcula abajo
  const s = Math.floor(t / 60) * 60;
  const c = createPriceClient({ retryDelayMs: 0, fetchFn: async (u) => { assert.ok(/step=60/.test(u) && new RegExp('start=' + s).test(u)); return ohlcResp([candle(s - 60, 111), candle(s, 35000.5), candle(s + 60, 222)]); } });
  const r = await c.priceAt(t);
  assert.strictEqual(r.price, 35000.5);
  assert.strictEqual(r.precision, 'minuto');
});

test('Bitstamp: si ese minuto no operó, baja a vela de hora y luego de día, indicando la precisión', async () => {
  const t = 1500000000 + 777;
  const steps = [];
  const c = createPriceClient({ retryDelayMs: 0, fetchFn: async (u) => {
    const step = Number(/step=(\d+)/.exec(u)[1]); steps.push(step);
    if (step === 60) return ohlcResp([candle(Math.floor(t / 60) * 60 + 600, 9)]);      // solo una vela de otro minuto
    if (step === 3600) return ohlcResp([]);
    return ohlcResp([candle(Math.floor(t / 86400) * 86400, 2500)]);
  } });
  const r = await c.priceAt(t);
  assert.deepStrictEqual(steps, [60, 3600, 86400]);
  assert.strictEqual(r.price, 2500);
  assert.strictEqual(r.precision, 'día');
});

test('Bitstamp: antes de septiembre de 2011 no hay precio y no se consulta', async () => {
  let n = 0;
  const c = createPriceClient({ retryDelayMs: 0, fetchFn: async () => { n++; return ohlcResp([]); } });
  const r = await c.priceAt(1231006505);
  assert.strictEqual(r.price, null);
  assert.ok(/2011/.test(r.reason));
  assert.strictEqual(n, 0);
});

test('Bitstamp: precio actual y datos con forma inesperada', async () => {
  const c = createPriceClient({ retryDelayMs: 0, fetchFn: async () => resp({ last: '67890.12', timestamp: '1760000000' }) });
  const t = await c.ticker();
  assert.strictEqual(t.price, 67890.12);
  const bad = createPriceClient({ retryDelayMs: 0, fetchFn: async () => resp({ last: 'abc' }) });
  await assert.rejects(bad.ticker(), (e) => e instanceof SourceError && e.source === 'Bitstamp');
  const bad2 = createPriceClient({ retryDelayMs: 0, fetchFn: async () => resp({ data: {} }) });
  await assert.rejects(bad2.priceAt(1700000000), (e) => e.source === 'Bitstamp');
});

test('formato de duración completo: días, horas, minutos y segundos', () => {
  assert.strictEqual(chain.formatDHMS(126000000), '1458 d 8 h 0 min 0 s');
  assert.strictEqual(chain.formatDHMS(90061), '1 d 1 h 1 min 1 s');
  assert.strictEqual(chain.formatDHMS(null), '—');
  assert.ok(near(chain.priceChangePercent(100, 150), 50, 1e-9));
  assert.strictEqual(chain.priceChangePercent(0, 5), null);
});

function fakePrices() {
  const o = { calls: [], source: 'Bitstamp', down: false };
  o.priceAt = async (ts) => { o.calls.push(ts); if (o.down) throw new SourceError('/api/v2/ohlc/btcusd/', 'sin conexión (simulada)', 'Bitstamp'); if (ts < 1314835200) return { price: null, reason: 'Bitstamp aún no operaba en esa fecha (empezó en 2011)' }; return { price: 1000 + (ts % 1000), precision: 'minuto' }; };
  o.ticker = async () => { o.calls.push('t'); if (o.down) throw new SourceError('/api/v2/ticker/btcusd/', 'sin conexión (simulada)', 'Bitstamp'); return { price: 70000, ts: T0 }; };
  return o;
}

test('precios: inicio y fin de cada era, inicio del período, actual y período anterior', async () => {
  const { api } = fakeChain(973456);
  const fp = fakePrices();
  const m = createMonitor({ api, prices: fp, store: memStore(), now: () => 1 });
  const v = await m.refresh();
  assert.ok(v.prices && v.prices.epochStart.price > 0);
  assert.ok(v.prices.epochPrevStart.price > 0);
  assert.strictEqual(v.prices.now.price, 70000);
  assert.strictEqual(v.prices.now.stale, false);
  assert.strictEqual(v.prices.eras[0].start.price, null);       // 2009: Bitstamp no existía
  assert.ok(/2011/.test(v.prices.eras[0].start.reason));
  assert.ok(v.prices.eras[4].start.price > 0);                  // era en curso: tiene inicio
  assert.strictEqual(v.prices.eras[4].end, null);               // y su final es el precio actual
  assert.ok(v.prices.eras[3].end.price > 0 || v.prices.eras[3].end.price === null);
  assert.ok(v.epoch.startTimestamp > 0);
});

test('precios históricos se guardan: no se vuelven a pedir en la siguiente lectura completa', async () => {
  const { api } = fakeChain(973456);
  const fp = fakePrices();
  const m = createMonitor({ api, prices: fp, store: memStore(), now: () => 1 });
  await m.refresh();
  const valid = () => fp.calls.filter((c) => c !== 't' && c >= 1314835200).length;
  const first = valid();
  assert.ok(first >= 3);
  await m.refresh(true);
  assert.strictEqual(valid(), first);                            // ninguna consulta nueva de precios históricos
  assert.strictEqual(fp.calls.filter((c) => c === 't').length, 2); // el precio actual sí se renueva
});

test('precios: si Bitstamp cae, el resto sigue, se avisa y no se pide más en ese ciclo', async () => {
  const { api } = fakeChain(973456);
  const fp = fakePrices();
  fp.down = true;
  const m = createMonitor({ api, prices: fp, store: memStore(), now: () => 1 });
  const v = await m.refresh();
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.tip.height, 973456);
  assert.ok(v.errors.some((e) => /Precios \(Bitstamp\)/.test(e.section) && /Bitstamp falló/.test(e.message) && /No se cambió a otra fuente/.test(e.message)));
  assert.strictEqual(v.prices.down, true);
  assert.strictEqual(v.prices.epochStart, null);
  assert.ok(fp.calls.length <= 2);                               // se cortó en el primer fallo
});

test('precio actual viejo se conserva marcado como guardado si Bitstamp cae después', async () => {
  const { api, state } = fakeChain(973456);
  const fp = fakePrices();
  const m = createMonitor({ api, prices: fp, store: memStore(), now: () => 1 });
  await m.refresh();
  fp.down = true; state.tip = 973457;
  const v = await m.refresh();
  assert.strictEqual(v.prices.now.price, 70000);
  assert.strictEqual(v.prices.now.stale, true);
});

test('datos guardados: la última pantalla se persiste y se muestra al abrir sin conexión', async () => {
  const { api, state } = fakeChain(973456);
  const st = memStore();
  const m1 = createMonitor({ api, prices: fakePrices(), store: st, now: () => 5000 });
  await m1.refresh();
  assert.ok(st.saved.lastView && st.saved.lastView.tip.height === 973456);
  // Segunda sesión: sin conexión desde el primer intento.
  const { api: api2, state: s2 } = fakeChain(973456);
  s2.failTip = true;
  const m2 = createMonitor({ api: api2, store: memStore(JSON.parse(JSON.stringify(st.saved))), now: () => 9000 });
  const c = m2.cachedView();
  assert.strictEqual(c.ok, true);
  assert.strictEqual(c.cached, true);
  assert.strictEqual(c.tip.height, 973456);
  assert.strictEqual(c.fetchedAtMs, 5000);
  const v = await m2.refresh(true);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.stale.tip.height, 973456);               // se puede seguir viendo lo guardado
  assert.ok(/No se cambió a otra fuente/.test(v.error));
  assert.ok(v.stale.eras.length === 5 && v.stale.epochs.length === 13);
});

test('datos guardados: sin historial previo, no hay pantalla guardada', () => {
  const { api } = fakeChain(973456);
  const m = createMonitor({ api, store: memStore(), now: () => 1 });
  assert.strictEqual(m.cachedView(), null);
});

test('archivo de historial viejo (v0.3) sin campos nuevos se abre sin problema', () => {
  const files = new Map([['/x/h.json', JSON.stringify({ version: 1, settings: {}, blockMarks: { 840000: 5 }, adjustments: [], blockLog: [] })]]);
  const fs = { existsSync: (p) => files.has(p), readFileSync: (p) => files.get(p), writeFileSync() {}, renameSync() {} };
  const r = storeLib.createFileStore(fs, '/x/h.json').load();
  assert.strictEqual(r.warning, null);
  assert.deepStrictEqual(r.state.prices, {});
  assert.strictEqual(r.state.lastView, null);
  assert.strictEqual(r.state.blockMarks['840000'], 5);
});


test('datos guardados: sin "última pantalla" pero con bloques, marcas e historial vistos antes, se reconstruye al instante', () => {
  const E = chain.EPOCH;
  const st = storeLib.emptyState();
  const tipH = 973456, startH = 971712;
  storeLib.addToLog(st, [{ height: tipH - 1, timestamp: 1000000 + 100 }, { height: tipH, timestamp: 1000000 + 700 }], 4242);
  st.blockMarks[String(startH)] = 1000000 - 1744 * 560;
  st.blockMarks['0'] = 100; st.blockMarks['210000'] = 100 + 210000 * 600; st.blockMarks['420000'] = 100 + 420000 * 600; st.blockMarks['630000'] = 100 + 630000 * 600; st.blockMarks['840000'] = 100 + 840000 * 600;
  st.adjustments = [{ height: startH - E, timestamp: 1, difficulty: 100 }, { height: startH, timestamp: 2, difficulty: 110 }];
  const { api } = fakeChain(tipH);
  const m = createMonitor({ api, store: memStore(st), now: () => 99 });
  const c = m.cachedView();
  assert.strictEqual(c.ok, true);
  assert.strictEqual(c.cached, true);
  assert.strictEqual(c.rebuilt, true);
  assert.strictEqual(c.tip.height, tipH);
  assert.strictEqual(c.fetchedAtMs, 4242);
  assert.strictEqual(c.epoch.blocksRemaining, 272);
  assert.ok(c.epoch.avgSeconds > 0);
  assert.strictEqual(c.eras.length, 5);
  assert.strictEqual(c.epochs.length, 2);
  assert.strictEqual(c.recent.length, 2);
  assert.strictEqual(c.difficulty, null);
  assert.ok(!/NaN|undefined/.test(JSON.stringify(c)));
});

test('datos guardados: sin ningún bloque visto antes no se inventa nada', () => {
  const { api } = fakeChain(973456);
  const m = createMonitor({ api, store: memStore(storeLib.emptyState()), now: () => 1 });
  assert.strictEqual(m.cachedView(), null);
});

// ---------- ejecución ----------
(async () => {
  for (const t of pending) {
    try { await t.fn(); pass++; console.log('  ok   ' + t.name); }
    catch (e) { fail++; console.log('  FALLA ' + t.name + '\n        ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  }
  console.log('\n' + pass + ' pruebas pasan, ' + fail + ' fallan.');
  process.exit(fail ? 1 : 0);
})();

// Pruebas del motor de velas desde operaciones (src/trades.js) con la fuente simulada (un .zip real por día).
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../src/trades');

const eq = assert.strictEqual;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'artr-'));

(async () => {
  // 1) .zip y CSV: ida y vuelta + guardado propio
  {
    const dir = tmp();
    const csv = 'agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker\r\n100,60000.1,0.5,1,1,1700000000000,true\r\n101,60000.2,1.25,2,2,1700000000500,false\r\n102,59999.9,0.002,3,3,1700000001000,false\r\n';
    const zp = path.join(dir, 'x.zip');
    fs.writeFileSync(zp, T.makeZip('x.csv', Buffer.from(csv)));
    const b = await T.parseArchiveZip(zp);
    eq(b.n, 3); eq(b.id0, 100); eq(b.lastId, 102);
    eq(b.pt[0], 6000010); eq(b.s[0], 0); eq(b.s[1], 1); // is_buyer_maker=true -> vende el agresor
    const d = T.decode(T.encode(b.seg()));
    eq(d.n, 3); eq(d.id0, 100); eq(d.t[2], 1700000001000); eq(d.pt[2], 5999990); assert.ok(Math.abs(d.q[1] - 1.25) < 1e-6);
    assert.throws(() => { const x = new T.Builder(); x.push(1, 1, 60000.123, 1, true); }, /decimales/);
    // velas de 1 s con filtro
    const sb = T.secBars(d, 0, { active: false });
    eq(sb.N[0], 2); eq(sb.O[0], 60000.1); eq(sb.C[0], 60000.2); eq(sb.V[0], 1.75); assert.ok(Math.abs(sb.B[0] - 1.25) < 1e-6);
    const only = T.secBars(d, 0, { active: true, min: 1, max: 0, mode: 'only' });
    eq(only.N[0], 1); eq(only.O[0], 60000.2);
    const hl = T.secBars(d, 0, { active: true, min: 1, max: 0, mode: 'hl' });
    eq(hl.N[0], 2); assert.ok(Math.abs(hl.FV[0] - 1.25) < 1e-6);
    // cantidad exacta en el borde del filtro (float32): 0.7 debe entrar con min 0.7
    const bb = new T.Builder(); bb.push(1, 1000, 100, 0.7, true);
    eq(T.secBars(bb.seg(), 0, { active: true, min: 0.7, max: 0.7, mode: 'only' }).N[0], 1);
  }

  // 2) Almacén completo con la fuente simulada: archivo + hueco rellenado + vivo
  {
    const dir = tmp();
    const deps = T.mockDeps(); deps.wsWait = 500; deps.liveDelay = 50;
    const store = T.createStore({ dir, deps });
    const rows = await store.bars({ interval: '1m', limit: 1000, days: 2 }); // espera a que llegue el día pendiente
    assert.ok(rows.length > 1000 - 1 || rows.length > 100, 'trae velas');
    // comparar contra el cálculo directo (fuerza bruta) de un tramo ya cerrado
    const today = T.dayStart(Date.now());
    const d2 = today - 2 * T.DAY; // el archivo existe solo para anteayer y antes
    const a = Math.ceil((d2 - Date.UTC(2024, 0, 1)) / T.MOCK_STEP);
    const brute = new Map();
    for (let i = a; i < a + 5000; i++) {
      const r = T.mockTrade(i), k = Math.floor(r.T / 60000) * 60000, p = parseFloat(r.p), q = parseFloat(r.q);
      let c = brute.get(k); if (!c) { c = { o: p, h: p, l: p, c: p, v: 0, b: 0, n: 0 }; brute.set(k, c); }
      c.h = Math.max(c.h, p); c.l = Math.min(c.l, p); c.c = p; c.v += q; c.n++; if (!r.m) c.b += q;
    }
    const got = await store.bars({ interval: '1m', startTime: d2, limit: 20, days: 2 });
    eq(got.length, 20);
    const full = Array.from(brute.keys()).sort((x, y) => x - y).slice(0, 4); // las 4 primeras velas están completas
    full.forEach((k, i) => {
      const row = got.find((g) => g[0] === k), c = brute.get(k);
      assert.ok(row, 'existe la vela ' + k);
      eq(parseFloat(row[1]), c.o); eq(parseFloat(row[2]), c.h); eq(parseFloat(row[3]), c.l); eq(parseFloat(row[4]), c.c);
      assert.ok(Math.abs(parseFloat(row[5]) - c.v) < 1e-6, 'volumen'); assert.ok(Math.abs(parseFloat(row[9]) - c.b) < 1e-6, 'compra'); eq(row[8], c.n);
    });
    // filtro: "quitar" cambia el volumen; "resaltar" no lo cambia pero llena las columnas 12/13
    const fo = await store.bars({ interval: '1m', startTime: d2, limit: 20, days: 2, minQty: 0.5, mode: 'only' });
    const fh = await store.bars({ interval: '1m', startTime: d2, limit: 20, days: 2, minQty: 0.5, mode: 'hl' });
    const sum = (rs, c) => rs.reduce((s, r) => s + parseFloat(r[c]), 0);
    assert.ok(sum(fo, 5) < sum(got, 5) && sum(fo, 5) > 0, 'solo las grandes pesan menos');
    assert.ok(Math.abs(sum(fh, 5) - sum(got, 5)) < 1e-6, 'resaltar no cambia la vela');
    assert.ok(Math.abs(sum(fh, 12) - sum(fo, 5)) < 1e-6, 'el volumen resaltado = el de "quitar"');
    // el hueco de ayer y hoy se rellena con consultas y la vela en vivo llega
    await new Promise((r) => setTimeout(r, 2500));
    const st = store.status();
    eq(st.holes, 0); assert.ok(st.live.lastId > 0, 'hay operaciones en vivo'); eq(st.errors.length, 0, JSON.stringify(st.errors));
    const last = await store.bars({ interval: '1s', limit: 5, days: 2 });
    assert.ok(Date.now() - last[last.length - 1][0] < 5000, 'la última vela de 1 s es reciente');
    // la vela de ayer (relleno por consultas) existe y no hay saltos de más de 2 s entre operaciones (1 cada 400 ms)
    const yday = await store.bars({ interval: '1h', startTime: today - T.DAY, limit: 24, days: 2 });
    eq(yday.length, 24);
    eq(yday[0][8], 9000); // 3600 s / 0,4 s = 9000 operaciones por hora
    store.shutdown();
    // reapertura: lo guardado en disco se reconoce sin descargar otra vez
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.trd'));
    assert.ok(files.some((f) => f.startsWith('day__')) && files.some((f) => f.startsWith('seg__')), files.join());
    const deps2 = T.mockDeps(); let dl = 0; const d0 = deps2.download; deps2.download = async (...x) => { const r = await d0(...x); if (r === 'ok') dl++; return r; };
    const store2 = T.createStore({ dir, deps: deps2 });
    const again = await store2.bars({ interval: '1m', startTime: d2, limit: 20, days: 2 });
    eq(again.length, 20); eq(dl, 0, 'no vuelve a descargar los días ya guardados');
    store2.shutdown();
  }

  // 3) Cortes de la transmisión: se detecta el salto y se rellena; sin WebSocket se usan consultas y se avisa
  {
    const dir = tmp();
    const deps = T.mockDeps(); deps.wsWait = 300; deps.liveDelay = 100;
    deps.openWs = () => { throw new Error('sin WebSocket'); };
    const store = T.createStore({ dir, deps });
    await store.bars({ interval: '1m', limit: 10, days: 1 });
    await new Promise((r) => setTimeout(r, 1500));
    const st = store.status();
    eq(st.live.mode, 'rest'); assert.ok(/sin WebSocket/.test(st.live.note), st.live.note); assert.ok(st.live.lastId > 0);
    store.shutdown();
  }
  console.log('trades.test.js OK');
})().catch((e) => { console.error(e); process.exit(1); });

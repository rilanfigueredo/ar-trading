const assert = require('assert');
const D = require('../renderer/js/draw.js');
const G = D.geom;
const eq = assert.strictEqual;
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// distancia punto-segmento
close(G.distPointSeg(5, 5, 0, 0, 10, 0), 5);
close(G.distPointSeg(-3, 4, 0, 0, 10, 0), 5);   // más allá del extremo: distancia al extremo
close(G.distPointSeg(1, 1, 2, 2, 2, 2), Math.SQRT2); // segmento de largo cero

// recta con extensiones (izquierda/derecha = extremos en pantalla)
{
  const s = G.lineSegment(100, 100, 200, 150, true, true, 500);
  close(s[0], -50); close(s[2], 550);
  close(s[1], 100 + 0.5 * (-150)); close(s[3], 150 + 0.5 * 350);
  const t = G.lineSegment(200, 150, 100, 100, false, true, 500); // puntos en orden inverso
  eq(t[0], 100); eq(t[2], 550);
  const v = G.lineSegment(10, 0, 10, 50, true, true, 500); // vertical: no se extiende
  eq(v[0], 10); eq(v[2], 10);
}
// rayo: sale del primer punto
{
  const r = G.raySegment(100, 100, 200, 100, 500);
  eq(r[0], 100); eq(r[2], 550); eq(r[3], 100);
  const l = G.raySegment(200, 100, 100, 100, 500);
  eq(l[2], -50);
}
// canal: desplazamiento vertical de la paralela
close(G.channelOffset({ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 100, y: 80 }), 30);
close(G.channelOffset({ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 40, y: 20 }), 0); // C sobre la recta base
// Fibonacci: 0 en el segundo punto, 1 en el primero
close(G.fibPrice(100, 200, 0), 200);
close(G.fibPrice(100, 200, 1), 100);
close(G.fibPrice(100, 200, 0.5), 150);
close(G.fibPrice(100, 200, 1.618), 200 - 100 * 1.618);
eq(D.fibLevels().length, 11);
assert.ok(D.fibLevels().find((l) => l.v === 0.618).on);
// duración legible
eq(G.humanDur(12000), '3 h 20 m');
eq(G.humanDur(2 * 86400 + 3 * 3600), '2 d 3 h');
eq(G.humanDur(45 * 60), '45 m');
eq(G.humanDur(30), '30 s');
eq(G.humanDur(-90), '1 m');

// hitDistance
{
  const env = { measure: (t, s) => t.length * s * 0.5, yOfPrice: (p) => 500 - p };
  const trend = { type: 'trend', extL: false, extR: false };
  close(G.hitDistance(trend, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 50, 4, 600, env), 4);
  assert.ok(G.hitDistance(trend, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 300, 0, 600, env) > 100);
  trend.extR = true;
  close(G.hitDistance(trend, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 300, 0, 600, env), 0);
  close(G.hitDistance({ type: 'hline' }, [{ x: 10, y: 80 }], 300, 77, 600, env), 3);
  const rect = { type: 'rect' };
  close(G.hitDistance(rect, [{ x: 10, y: 10 }, { x: 110, y: 60 }], 60, 12, 600, env), 2);
  assert.ok(G.hitDistance(rect, [{ x: 10, y: 10 }, { x: 110, y: 60 }], 60, 35, 600, env) > 20); // el interior no cuenta
  const ch = { type: 'channel' };
  close(G.hitDistance(ch, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 40 }], 20, 40, 600, env), 0); // sobre la paralela
  const poly = { type: 'poly' };
  close(G.hitDistance(poly, [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], 52, 25, 600, env), 2);
  const txt = { type: 'text', text: 'Hola', size: 10 };
  close(G.hitDistance(txt, [{ x: 100, y: 100 }], 105, 95, 600, env), 0);
  assert.ok(G.hitDistance(txt, [{ x: 100, y: 100 }], 300, 95, 600, env) > 100);
  // Fibonacci: toca el nivel 0.5 (precios 100 y 200 -> 150 -> y=350)
  const fib = { type: 'fib', trendLine: false, extL: false, extR: false, pts: [{ t: 1, p: 100 }, { t: 2, p: 200 }], levels: [{ v: 0.5, on: true }, { v: 0.618, on: false }] };
  const P = [{ x: 50, y: 400 }, { x: 150, y: 300 }];
  close(G.hitDistance(fib, P, 100, 352, 600, env), 2);
  assert.ok(G.hitDistance(fib, P, 100, 382, 600, env) > 20); // el nivel 0.618 está apagado
}
// tiradores
eq(G.handlePoints({ type: 'hline' }, [{ x: 9999, y: 5 }], 600)[0].x, 586);
eq(G.handlePoints({ type: 'trend' }, [{ x: 1, y: 2 }, { x: 3, y: 4 }], 600).length, 2);

// valores por defecto
eq(D.defaults('rect').fill, true);
eq(D.defaults('fib').levels.length, 11);
assert.ok(D.defaults('text').size > 0);

// ---- almacén: agregar, deshacer, rehacer, duplicar, borrar, estilo recordado
{
  const root = {}; const prefs = { favs: [], styles: {} };
  let saves = 0;
  const st = D.createStore(() => root, () => prefs, () => { saves++; });
  const kinds = [];
  st.on((k) => kinds.push(k));
  const a = st.add('BTCUSDT', Object.assign(D.defaults('trend'), { type: 'trend', pts: [{ t: 1, p: 10 }, { t: 2, p: 20 }] }));
  assert.ok(a.id);
  eq(st.list('BTCUSDT').length, 1);
  eq(st.state.sel.id, a.id);
  assert.ok(saves > 0 && kinds.includes('change'));
  st.add('ETHUSDT', Object.assign(D.defaults('hline'), { type: 'hline', pts: [{ t: 1, p: 5 }] }));
  eq(st.list('BTCUSDT').length, 1); // por activo
  eq(st.list('ETHUSDT').length, 1);
  // duplicar con desplazamiento
  const c = st.duplicate('BTCUSDT', a.id, (pt) => ({ t: pt.t + 1, p: pt.p - 1 }));
  eq(st.list('BTCUSDT').length, 2);
  assert.notStrictEqual(c.id, a.id);
  eq(c.pts[0].t, 2); eq(c.pts[0].p, 9);
  eq(a.pts[0].t, 1); // el original no cambia
  // bloquear no cambia datos pero se guarda
  st.patch('BTCUSDT', a.id, { locked: true });
  eq(st.get('BTCUSDT', a.id).locked, true);
  // deshacer / rehacer
  assert.ok(st.undo('BTCUSDT'));
  eq(st.get('BTCUSDT', a.id).locked, false);
  assert.ok(st.undo('BTCUSDT'));
  eq(st.list('BTCUSDT').length, 1);
  assert.ok(st.redo('BTCUSDT'));
  eq(st.list('BTCUSDT').length, 2);
  // gesto largo (arrastrar) = un solo paso de deshacer
  st.begin('BTCUSDT');
  st.move('BTCUSDT', a.id, [{ t: 5, p: 5 }, { t: 6, p: 6 }]);
  st.move('BTCUSDT', a.id, [{ t: 7, p: 7 }, { t: 8, p: 8 }]);
  st.end();
  eq(st.get('BTCUSDT', a.id).pts[0].t, 7);
  assert.ok(st.undo('BTCUSDT'));
  eq(st.get('BTCUSDT', a.id).pts[0].t, 1);
  // estilo recordado para los próximos dibujos del mismo tipo
  st.patch('BTCUSDT', a.id, { color: '#123456', width: 4 });
  eq(st.typeDefaults('trend').color, '#123456');
  eq(st.typeDefaults('trend').width, 4);
  eq(st.typeDefaults('rect').color, D.defaults('rect').color);
  // cambios seguidos del mismo campo = un paso de deshacer
  st.patch('BTCUSDT', a.id, { color: '#111111' });
  st.patch('BTCUSDT', a.id, { color: '#222222' });
  st.patch('BTCUSDT', a.id, { color: '#333333' });
  st.undo('BTCUSDT');
  eq(st.get('BTCUSDT', a.id).color, '#123456');
  // borrar y limpiar
  st.remove('BTCUSDT', a.id);
  eq(st.get('BTCUSDT', a.id), null);
  st.setAll('BTCUSDT', 'locked', true);
  assert.ok(st.list('BTCUSDT').every((d) => d.locked));
  st.clear('BTCUSDT');
  eq(st.list('BTCUSDT').length, 0);
  assert.ok(st.undo('BTCUSDT'));
  eq(st.list('BTCUSDT').length, 1);
  // selección y herramienta
  st.select('BTCUSDT', st.list('BTCUSDT')[0].id);
  assert.ok(st.state.sel);
  st.setTool('fib');
  eq(st.state.tool, 'fib'); eq(st.state.sel, null);
}

console.log('draw.test.js OK');

// ---------- v0.8 ----------
{
  const G = D.geom;
  // rectángulo: 8 tiradores; arrastrar un lado solo cambia ese lado
  const pts = [{ t: 100, p: 50 }, { t: 200, p: 20 }];       // esquina arriba-izq. y abajo-der.
  const P = [{ x: 10, y: 10 }, { x: 110, y: 40 }];
  assert.strictEqual(G.rectHandles(P).length, 8);
  let r = G.resizeRectData(pts, P, 5, { t: 300, p: 999 });   // lado derecho
  assert.deepStrictEqual(r, [{ t: 100, p: 50 }, { t: 300, p: 20 }]);
  r = G.resizeRectData(pts, P, 4, { t: 999, p: 70 });        // lado de arriba
  assert.deepStrictEqual(r, [{ t: 100, p: 70 }, { t: 200, p: 20 }]);
  r = G.resizeRectData(pts, P, 3, { t: 50, p: 5 });          // esquina abajo-izq.
  assert.deepStrictEqual(r, [{ t: 50, p: 50 }, { t: 200, p: 5 }]);
  // recuadro de selección
  const rc = { x1: 0, y1: 0, x2: 100, y2: 100 };
  assert.ok(G.inRect({ type: 'trend' }, [{ x: 10, y: 10 }, { x: 90, y: 90 }], rc));
  assert.ok(!G.inRect({ type: 'trend' }, [{ x: 10, y: 10 }, { x: 190, y: 90 }], rc));
  assert.ok(G.inRect({ type: 'hline' }, [{ x: 500, y: 50 }], rc));
  // rayo horizontal
  assert.ok(G.hitDistance({ type: 'hray', pts: [{}] }, [{ x: 50, y: 50 }], 200, 52, 400, {}) <= 2);
  assert.ok(G.hitDistance({ type: 'hray', pts: [{}] }, [{ x: 50, y: 50 }], 10, 50, 400, {}) > 30);
  assert.ok(D.TYPES.hray && !D.TYPES.ray);
  ['trend', 'hline', 'hray'].forEach((t) => { const d = D.defaults(t); assert.ok('text' in d && 'tSize' in d && 'tV' in d && 'tH' in d, t); });
  assert.ok('center' in D.defaults('rect') && 'extL' in D.defaults('rect'));
}
{
  // almacén: selección múltiple, carpetas, plantillas, cancelar
  const root = {}, fol = {}, prefs = { favs: [], styles: {}, templates: {} };
  const st = D.createStore(() => root, () => prefs, () => {}, () => fol);
  const S = 'X';
  const mk = (t) => st.add(S, Object.assign(D.defaults(t), { type: t, pts: [{ t: 1, p: 1 }, { t: 2, p: 2 }] }));
  const a = mk('trend'), b = mk('rect'), c = mk('hline');
  st.selectMany(S, [a.id, b.id], false);
  assert.deepStrictEqual(st.selIds(S), [a.id, b.id]);
  st.select(S, c.id, 'toggle');
  assert.strictEqual(st.selIds(S).length, 3);
  st.select(S, c.id, 'toggle');
  assert.strictEqual(st.selIds(S).length, 2);
  // carpeta madre y subcarpeta
  const f1 = st.addFolder(S, { name: 'ESTRUCTURA 4H' });
  const f2 = st.addFolder(S, { name: 'LIQUIDEZ 4H', parent: f1.id, ids: [a.id] });
  const f3 = st.addFolder(S, { name: 'RANGOS 4H', parent: f1.id, ids: [b.id] });
  assert.strictEqual(st.get(S, a.id).folder, f2.id);
  assert.deepStrictEqual(st.folderItems(S, f1.id).sort(), [a.id, b.id].sort());
  assert.strictEqual(st.moveFolder(S, f1.id, f2.id), false);        // no se puede meter una carpeta en su hija
  assert.strictEqual(st.moveFolder(S, f3.id, f2.id), true);
  st.setFolderFlag(S, f1.id, 'hidden', true);
  assert.ok(st.get(S, a.id).hidden && st.get(S, b.id).hidden && !st.get(S, c.id).hidden);
  st.removeFolder(S, f2.id);                                         // los dibujos suben de nivel
  assert.strictEqual(st.get(S, a.id).folder, f1.id);
  st.undo(S);
  assert.strictEqual(st.get(S, a.id).folder, f2.id);
  // plantillas
  const t1 = st.saveTemplate('trend', 'Rojo', Object.assign({}, st.get(S, a.id), { color: '#ff0000', text: 'zona' }));
  assert.strictEqual(st.templates('trend').length, 1);
  st.setTool('trend', t1.id);
  assert.strictEqual(st.typeDefaults('trend').color, '#ff0000');
  assert.strictEqual(st.typeDefaults('trend').text, 'zona');
  st.setTool(null);
  assert.ok(st.applyTemplate(S, c.id, t1.id) === false);             // otra herramienta: no aplica
  prefs.favs.push('trend:' + t1.id);
  st.deleteTemplate('trend', t1.id);
  assert.deepStrictEqual(prefs.favs, []);
  // cancelar: revierte todo el gesto
  st.begin(S);
  st.patch(S, a.id, { color: '#00ff00' }); st.patch(S, a.id, { width: 5 });
  st.abort();
  assert.notStrictEqual(st.get(S, a.id).color, '#00ff00');
  // aceptar: un solo paso de deshacer
  const before = st.get(S, a.id).color;
  st.begin(S); st.patch(S, a.id, { color: '#00ff00' }); st.patch(S, a.id, { width: 5 }); st.end();
  st.undo(S);
  assert.strictEqual(st.get(S, a.id).color, before);
}
console.log('draw.test.js v0.8 OK');

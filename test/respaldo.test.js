// Pruebas del respaldo de configuración y del aviso de versiones (v0.26). Todo en carpetas temporales.
'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const R = require('../src/respaldo');
const A = require('../src/actualizar');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const w = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
let reloj = new Date('2026-11-02T10:00:00');
const ahora = () => { reloj = new Date(reloj.getTime() + 1000); return reloj; };

(async () => {
  const ud = tmp('ar-ud-'), dest = tmp('ar-bk-');
  w(path.join(ud, 'config.json'), '{"theme":"dark"}'); w(path.join(ud, 'win-w1.json'), '{"charts":[]}'); w(path.join(ud, 'win-w2.json'), '{"fn":"inicio"}');
  w(path.join(ud, 'service.json'), '{"hwAccel":true}'); w(path.join(ud, 'funciones', 'simulador', 'estado.json'), '{"ar_scen":[1]}');
  w(path.join(ud, 'funciones', 'noticias', 'lista.json'), '["USD"]'); w(path.join(ud, 'funciones', 'noticias', 'x.tmp'), 'tmp'); w(path.join(ud, 'funciones', 'simulador', 'estado.json.danado-1'), 'malo');
  w(path.join(ud, 'liq', 'enorme.bin'), 'datos grandes'); w(path.join(ud, 'Cache', 'x'), 'cache'); w(path.join(ud, 'win-w11.json'), 'no');

  // qué se respalda
  const rel = R.recoger(ud).map((f) => f.rel);
  ok(rel.join() === 'config.json,funciones/noticias/lista.json,funciones/simulador/estado.json,service.json,win-w1.json,win-w2.json', 'recoge solo configuración y funciones: ' + rel.join());

  // hacer + listar
  const r1 = R.hacer({ userData: ud, destino: dest, origen: 'manual', appVersion: '0.26.0', ahora });
  ok(r1.archivos === 6 && fs.existsSync(path.join(r1.ruta, 'archivos', 'funciones', 'simulador', 'estado.json')), 'copia los 6 archivos con su estructura');
  ok(!fs.existsSync(path.join(r1.ruta, 'archivos', 'liq')) && !fs.existsSync(path.join(r1.ruta, 'archivos', 'Cache')), 'no copia datos grandes ni caché');
  ok(R.listar(dest).length === 1 && R.listar(dest)[0].origen === 'manual' && R.listar(dest)[0].appVersion === '0.26.0', 'listar');
  fs.mkdirSync(path.join(dest, 'otra-carpeta')); w(path.join(dest, 'Ar_Trading_respaldo_falso', 'x'), '1');
  ok(R.listar(dest).length === 1, 'carpetas que no son respaldos se ignoran');

  // destino dentro de los datos del programa: se rechaza
  assert.throws(() => R.hacer({ userData: ud, destino: path.join(ud, 'copias') }), /dentro/); n++;
  assert.throws(() => R.hacer({ userData: ud, destino: '' }), /Elige/); n++;

  // automático: no repite si nada cambió; sí si cambió; rota
  const a1 = R.auto({ userData: ud, destino: dest, appVersion: 'x', ahora }); ok(a1.omitido === true, 'auto: sin cambios no repite (el último es el manual)');
  w(path.join(ud, 'win-w1.json'), '{"charts":[1]}');
  const a2 = R.auto({ userData: ud, destino: dest, appVersion: 'x', ahora }); ok(!a2.omitido && a2.origen === 'auto', 'auto: con cambios sí respalda');
  ok(R.auto({ userData: ud, destino: dest, ahora }).omitido === true, 'auto: justo después, no repite');
  for (let i = 0; i < 6; i++) { w(path.join(ud, 'win-w1.json'), '{"i":' + i + '}'); R.auto({ userData: ud, destino: dest, max: 3, ahora }); }
  const l = R.listar(dest);
  ok(l.filter((x) => x.origen === 'auto').length === 3, 'auto: rota a 3 (' + l.filter((x) => x.origen === 'auto').length + ')');
  ok(l.filter((x) => x.origen === 'manual').length === 1, 'auto: el manual nunca se borra solo');
  ok(R.auto({ userData: tmp('ar-vacio-'), destino: tmp('ar-bk2-'), ahora }).omitido === true, 'auto: sin configuración todavía no crea un respaldo vacío');

  // restaurar: vuelve a lo respaldado, guarda un «previo» y quita lo que sobraba
  const manual = R.listar(dest).find((x) => x.origen === 'manual');
  w(path.join(ud, 'config.json'), '{"theme":"light","cambio":true}'); w(path.join(ud, 'win-w3.json'), '{"nueva":1}'); fs.unlinkSync(path.join(ud, 'funciones', 'noticias', 'lista.json'));
  const res = R.restaurar({ userData: ud, ruta: manual.ruta, destino: dest, appVersion: '0.26.0', ahora });
  ok(res.restaurados === 6 && fs.readFileSync(path.join(ud, 'config.json'), 'utf8') === '{"theme":"dark"}', 'restaura config.json');
  ok(fs.existsSync(path.join(ud, 'funciones', 'noticias', 'lista.json')) && !fs.existsSync(path.join(ud, 'win-w3.json')), 'restaura lo borrado y quita lo que no existía en el respaldo');
  ok(fs.existsSync(path.join(ud, 'liq', 'enorme.bin')), 'no toca los datos grandes');
  const previo = R.listar(dest).find((x) => x.origen === 'previo'); ok(previo && fs.readFileSync(path.join(previo.ruta, 'archivos', 'config.json'), 'utf8').includes('"cambio":true'), 'antes de restaurar guarda un respaldo «previo» de lo que había');
  assert.throws(() => R.restaurar({ userData: ud, ruta: tmp('ar-nada-'), destino: dest }), /no es un respaldo/); n++;
  // un respaldo manipulado con una ruta peligrosa se rechaza
  const mal = R.hacer({ userData: ud, destino: dest, ahora }); w(path.join(mal.ruta, 'archivos', 'evil.exe'), 'x');
  assert.throws(() => R.restaurar({ userData: ud, ruta: mal.ruta, destino: dest }), /no permitido/); n++;
  ok(!fs.existsSync(path.join(ud, 'evil.exe')), 'nada se copió de un respaldo con archivos no permitidos');

  // ---- versiones
  ok(A.comparar('0.26.0', '0.25.0') === 1 && A.comparar('v0.25.0', '0.25.0') === 0 && A.comparar('0.9.9', '0.10.0') === -1 && A.comparar('1.0.0', '0.99.99') === 1 && A.comparar('x', '1.0.0') === null, 'comparar versiones');
  const resp = (st, j) => async () => ({ ok: st < 400, status: st, json: async () => j });
  let e = await A.estado({ actual: '0.25.0', fetchFn: resp(200, { tag_name: 'v0.26.0', html_url: 'https://x/r', body: 'nuevo', assets: [{ name: 'Ar_Trading-Instalador-0.26.0.exe', browser_download_url: 'https://x/a.exe' }] }) });
  ok(e.hayNueva === true && e.ultima === '0.26.0' && e.instalador === 'https://x/a.exe' && e.error === '', 'hay versión nueva');
  e = await A.estado({ actual: '0.26.0', fetchFn: resp(200, { tag_name: 'v0.26.0' }) }); ok(e.hayNueva === false && !e.error, 'al día');
  e = await A.estado({ actual: '0.27.0', fetchFn: resp(200, { tag_name: 'v0.26.0' }) }); ok(e.hayNueva === false, 'una versión local más nueva no avisa');
  e = await A.estado({ actual: '0.25.0', fetchFn: resp(404, {}) }); ok(!e.hayNueva && /no hay versiones/i.test(e.error), '404: aún sin publicaciones, se dice');
  e = await A.estado({ actual: '0.25.0', fetchFn: resp(403, {}) }); ok(!e.hayNueva && /403/.test(e.error), '403: límite de GitHub, se dice');
  e = await A.estado({ actual: '0.25.0', fetchFn: async () => { throw new Error('sin internet'); } }); ok(!e.hayNueva && /sin internet/.test(e.error), 'sin red: se dice el motivo, no se inventa «al día»');
  e = await A.estado({ actual: '0.25.0', fetchFn: resp(200, { tag_name: 'basura' }) }); ok(!e.hayNueva && /válido/.test(e.error), 'etiqueta rara: se avisa');

  console.log(`respaldo.test.js OK (${n} comprobaciones)`);
})().catch((e) => { console.log('FALLA: ' + (e.stack || e)); process.exit(1); });

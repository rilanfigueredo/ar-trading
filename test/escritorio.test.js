// Pruebas de src/escritorio.js (v0.26) con un «Electron» de mentira: respaldo, actualizaciones y acceso desde el móvil.
'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const Escritorio = require('../src/escritorio');
const Service = require('../src/service');
const Store = require('../src/store');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

(async () => {
  const ud = tmp('ar-esc-ud-'), docs = tmp('ar-esc-docs-'), otra = tmp('ar-esc-otra-');
  fs.writeFileSync(path.join(ud, 'config.json'), '{"theme":"dark"}'); fs.writeFileSync(path.join(ud, 'win-w1.json'), '{"charts":[]}');
  const handlers = {}; const enviados = []; const abiertos = []; const avisos = [];
  const ipcMain = { handle: (c, f) => { handlers[c] = f; } };
  const llamar = (c, ...a) => handlers[c]({}, ...a);
  let relanzado = 0, dialogRuta = null;
  const win = { isDestroyed: () => false, webContents: { send: (c, st) => enviados.push([c, st]) }, isMinimized: () => false, focus() {} };
  function Notif(o) { this.o = o; this.on = () => {}; this.show = () => avisos.push(o); } Notif.isSupported = () => true;
  const app = { getPath: (k) => (k === 'userData' ? ud : k === 'documents' ? docs : os.tmpdir()), getVersion: () => '0.26.0', isPackaged: false };
  const fetchReal = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.27.0', html_url: 'https://github.com/x/releases/v0.27.0', body: 'novedades de prueba', assets: [] }) });
  const store = Store.create(ud);
  const puerto = 41000 + Math.floor(Math.random() * 2000);
  Service.write(ud, { movilPuerto: puerto });
  const ext = Escritorio.registrar({ app, ipcMain, shell: { openPath: async () => '', openExternal: async (u) => { abiertos.push(u); } }, dialog: { showOpenDialog: async () => (dialogRuta ? { canceled: false, filePaths: [dialogRuta] } : { canceled: true, filePaths: [] }) },
    Notification: Notif, net: null, getWin: () => win, store, core: { shutdown() {} }, puente: { invocar: async () => ({ ok: true }) }, relanzar: () => { relanzado++; } });

  // ---- respaldo
  let r = await llamar('respaldo:get'); ok(r.destino === path.join(docs, 'Ar_Trading_Respaldo') && r.porDefecto && r.auto === true && r.lista.length === 0, 'respaldo: carpeta por defecto en Documentos, automático activado');
  r = await llamar('respaldo:hacer'); ok(r.ok && r.archivos >= 3, 'respaldo: manual (config, pestaña y service.json)');
  r = await llamar('respaldo:get'); ok(r.lista.length === 1 && r.lista[0].origen === 'manual', 'respaldo: aparece en la lista');
  dialogRuta = null; r = await llamar('respaldo:elegir'); ok(r.canceled === true, 'respaldo: cancelar el diálogo no cambia nada');
  dialogRuta = otra; r = await llamar('respaldo:elegir'); ok(r.ok && (await llamar('respaldo:get')).destino === otra && !(await llamar('respaldo:get')).porDefecto, 'respaldo: cambiar de carpeta');
  dialogRuta = path.join(ud, 'dentro'); r = await llamar('respaldo:elegir'); ok(r.ok === false && /dentro/.test(r.error) && (await llamar('respaldo:get')).destino === otra, 'respaldo: una carpeta dentro de los datos se rechaza y no cambia la actual');
  await llamar('respaldo:setAuto', false); ok((await llamar('respaldo:get')).auto === false && Service.read(ud).respaldoAuto === false, 'respaldo: apagar el automático se guarda');
  await llamar('respaldo:setAuto', true);
  r = await llamar('respaldo:usarDefecto'); ok(r.ok && Service.read(ud).respaldoDir === '', 'respaldo: volver a Documentos');
  const lista = (await llamar('respaldo:get')).lista;
  fs.writeFileSync(path.join(ud, 'config.json'), '{"theme":"light"}');
  r = await llamar('respaldo:restaurar', path.join(docs, 'no-existe')); ok(r.ok === false && /ya no está/.test(r.error), 'restaurar: solo respaldos de la carpeta de respaldos');
  r = await llamar('respaldo:restaurar', lista[0].ruta); ok(r.ok && relanzado === 1 && ext.estado.restaurando === true && fs.readFileSync(path.join(ud, 'config.json'), 'utf8') === '{"theme":"dark"}', 'restaurar: vuelve lo respaldado, avisa y reinicia el programa');
  ok((await llamar('respaldo:get')).lista.some((x) => x.origen === 'previo'), 'restaurar: deja un respaldo «previo»');
  ext.estado.restaurando = false;
  ext.respaldoAuto(); ok(true, 'respaldoAuto no lanza');

  // ---- actualizaciones (programa sin instalar: solo avisa y abre la descarga)
  let u = await llamar('update:get'); ok(u.fase === 'ninguna' && u.actual === '0.26.0' && u.instalable === false, 'update: estado inicial');
  u = await llamar('update:check'); ok(u.fase === 'disponible' && u.version === '0.27.0' && /novedades/.test(u.notas), 'update: detecta la 0.27.0');
  ok(avisos.length === 1 && /versión nueva/.test(avisos[0].title) && /0\.27\.0/.test(avisos[0].body), 'update: aviso de Windows');
  ok(enviados.some(([c, st]) => c === 'update:state' && st.fase === 'disponible'), 'update: el cartel recibe el aviso');
  await llamar('update:check'); ok(avisos.length === 1, 'update: no repite el aviso de la misma versión');
  r = await llamar('update:install'); ok(r.ok && abiertos[0] === 'https://github.com/x/releases/v0.27.0', 'update: sin instalador automático abre la página de la descarga');
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.26.0' }) });
  u = await llamar('update:check'); ok(u.fase === 'alDia', 'update: al día');
  globalThis.fetch = async () => { throw new Error('sin internet'); };
  u = await llamar('update:check'); ok(u.fase === 'error' && /sin internet/.test(u.error), 'update: sin red dice el motivo');

  // ---- móvil
  globalThis.fetch = fetchReal;
  let m = await llamar('movil:get'); ok(m.activo === false && !m.funcionando && m.codigo === '', 'móvil: apagado por defecto y sin código visible');
  m = await llamar('movil:set', true); ok(m.ok && m.activo && m.funcionando && /^\d{6}$/.test(m.codigo) && m.puerto === puerto, 'móvil: se enciende con código de 6 cifras');
  const base = `http://127.0.0.1:${puerto}`;
  let h = await fetch(base + '/api/tabs'); ok(h.status === 401, 'móvil: sin código la API está cerrada (también desde localhost)');
  h = await fetch(base + '/acceso', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'codigo=' + m.codigo });
  const cookie = (h.headers.get('set-cookie') || '').split(';')[0]; ok(h.status === 302 && cookie, 'móvil: con el código entra');
  h = await fetch(base + '/api/tabs', { headers: { cookie } }); ok(h.status === 200, 'móvil: con la sesión abre la API');
  const cod1 = m.codigo; m = await llamar('movil:codigoNuevo'); ok(m.ok && m.codigo !== cod1 || /^\d{6}$/.test(m.codigo), 'móvil: código nuevo');
  h = await fetch(base + '/api/tabs', { headers: { cookie } }); ok(h.status === 401, 'móvil: con código nuevo la sesión vieja se cierra');
  r = await llamar('movil:puerto', 80); ok(r.ok === false && /1024/.test(r.error), 'móvil: puerto no válido');
  r = await llamar('movil:puerto', 'abc'); ok(r.ok === false, 'móvil: puerto no numérico');
  m = await llamar('movil:set', false); ok(m.ok && !m.funcionando && m.codigo === '', 'móvil: se apaga y deja de escuchar');
  await new Promise((res) => setTimeout(res, 100));
  let cerrado = false; try { await fetch(base + '/api/tabs'); } catch (e) { cerrado = true; } ok(cerrado, 'móvil: apagado, el puerto ya no responde');
  // puerto ocupado: se explica y no queda encendido
  const ocupa = require('http').createServer().listen(puerto);
  await new Promise((res) => ocupa.once('listening', res));
  m = await llamar('movil:set', true); ok(m.ok && !m.funcionando && /ya está en uso/.test(m.error) && Service.read(ud).movilActivo === false, 'móvil: puerto ocupado → mensaje claro y queda apagado');
  ocupa.close();
  ext.alCerrar();
  console.log(`escritorio.test.js OK (${n} comprobaciones)`);
  process.exit(0);
})().catch((e) => { console.log('FALLA: ' + (e.stack || e)); process.exit(1); });

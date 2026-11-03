// Pruebas del servidor web y del acceso desde el móvil (v0.26): código de acceso, bloqueo tras intentos, cookie, rutas públicas y la app instalable (PWA).
'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const Web = require('../src/web');
const Store = require('../src/store');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const ROOT = path.join(__dirname, '..', 'renderer');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-web-'));
  const store = Store.create(dir);
  const core = { dataStatus: async () => ({ x: 1 }), shutdown() {}, resetData() {} };
  const puente = { invocar: async () => ({ ok: true, datos: 'hola' }) };
  const auth = { codigo: '123456', secreto: 'a'.repeat(64) };
  const abierto = Web.crear({ core, store, puente, root: ROOT, data: dir });                      // modo navegador (sin código)
  const cerrado = Web.crear({ core, store, puente, root: ROOT, data: dir, auth: () => auth, version: async () => ({ actual: '0.26.0', hayNueva: true, ultima: '0.27.0' }) });
  const escuchar = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
  const pa = await escuchar(abierto), pc = await escuchar(cerrado);
  const get = (p, port, o) => fetch(`http://127.0.0.1:${port}${p}`, Object.assign({ redirect: 'manual' }, o));
  const login = (codigo, port) => fetch(`http://127.0.0.1:${port}/acceso`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'codigo=' + codigo });

  // modo navegador: igual que antes, sin código
  let r = await get('/', pa); ok(r.status === 200 && /Ar_Trading/.test(await r.text()), 'navegador: la página abre sin código');
  r = await get('/api/tabs', pa); ok(r.status === 200 && Array.isArray(await r.json()), 'navegador: la API responde sin código');
  r = await get('/api/version', pa); ok(r.status === 200 && (await r.json()).error, 'navegador: /api/version sin información de versión lo dice');
  r = await get('/../package.json', pa); ok(r.status !== 200 || !/ar-trading/.test(await r.text()), 'no se sale de la carpeta del programa');
  r = await get('/%2e%2e/package.json', pa); ok(r.status === 403 || r.status === 404, 'no se sale con %2e%2e (' + r.status + ')');

  // con código: todo cerrado salvo lo público
  r = await get('/', pc); ok(r.status === 302 && r.headers.get('location') === '/acceso', 'móvil: sin código la página manda a /acceso');
  r = await get('/api/tabs', pc); ok(r.status === 401, 'móvil: la API pide el código');
  r = await get('/api/config?w=w1', pc); ok(r.status === 401, 'móvil: la configuración está protegida');
  r = await get('/api/fn', pc, { method: 'POST', body: '{}' }); ok(r.status === 401, 'móvil: las funciones están protegidas');
  r = await get('/js/app.js', pc); ok(r.status === 302, 'móvil: el código fuente tampoco se ve sin código');
  r = await get('/acceso', pc); ok(r.status === 200 && /Código de acceso/.test(await r.text()), 'móvil: la pantalla de entrada se ve');
  for (const p of ['/manifest.webmanifest', '/sw.js', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png']) { r = await get(p, pc); ok(r.status === 200, 'móvil: público para poder instalar la app: ' + p); }
  r = await get('/icons/../index.html', pc); ok(r.status !== 200, 'móvil: /icons/.. no abre otros archivos');

  // código incorrecto y correcto
  r = await login('000000', pc); ok(r.status === 401 && /incorrecto/.test(await r.text()) && !r.headers.get('set-cookie'), 'código incorrecto: no entra ni da cookie');
  r = await login('123456', pc); const ck = r.headers.get('set-cookie') || '';
  ok(r.status === 302 && r.headers.get('location') === '/' && /ar_acceso=[0-9a-f]{64}/.test(ck) && /HttpOnly/.test(ck) && /SameSite=Strict/.test(ck), 'código correcto: cookie segura y vuelve a la página');
  const cookie = ck.split(';')[0];
  r = await get('/', pc, { headers: { cookie } }); ok(r.status === 200, 'con cookie: abre la página');
  r = await get('/api/tabs', pc, { headers: { cookie } }); ok(r.status === 200, 'con cookie: abre la API');
  r = await get('/api/fn', pc, { method: 'POST', headers: { cookie }, body: '{"canal":"x:y"}' }); ok(r.status === 200 && (await r.json()).datos === 'hola', 'con cookie: las funciones responden');
  r = await get('/api/version', pc, { headers: { cookie } }); ok((await r.json()).hayNueva === true, 'con cookie: /api/version informa la versión nueva');
  r = await get('/api/tabs', pc, { headers: { cookie: 'ar_acceso=' + 'b'.repeat(64) } }); ok(r.status === 401, 'cookie falsa: rechazada');
  r = await get('/api/tabs', pc, { headers: { cookie: 'ar_acceso=zz' } }); ok(r.status === 401, 'cookie mal formada: rechazada');
  // desde el móvil no se pueden hacer cosas destructivas
  r = await get('/api/service/factoryreset', pc, { method: 'POST', headers: { cookie } }); ok(r.status === 403, 'móvil: no puede borrar datos de fábrica');
  r = await get('/api/data/assets', pc, { method: 'POST', headers: { cookie }, body: '[]' }); ok(r.status === 403, 'móvil: no puede cambiar el servicio');
  r = await get('/api/service/factoryreset', pa, { method: 'POST' }); ok(r.status === 200, 'navegador local: sigue pudiendo (como antes)');
  // si cambia el secreto (código nuevo), las cookies viejas dejan de valer
  auth.secreto = 'c'.repeat(64); auth.codigo = '654321';
  r = await get('/api/tabs', pc, { headers: { cookie } }); ok(r.status === 401, 'código nuevo: la sesión anterior se cierra');
  r = await login('123456', pc); ok(r.status === 401, 'código nuevo: el viejo ya no sirve');
  r = await login('654321', pc); ok(r.status === 302, 'código nuevo: el nuevo sirve');

  // bloqueo tras 5 intentos fallidos
  const bloqueado = Web.crear({ core, store, puente, root: ROOT, data: dir, auth: () => ({ codigo: '111111', secreto: 'd'.repeat(64) }) });
  const pb = await escuchar(bloqueado);
  for (let i = 0; i < 5; i++) await login('999999', pb);
  r = await login('111111', pb); ok(r.status === 429, 'tras 5 fallos se bloquea un minuto, aun con el código bueno (' + r.status + ')');

  // app instalable
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  ok(man.display === 'standalone' && man.start_url === '/' && man.name === 'Ar_Trading' && man.lang === 'es', 'manifiesto: nombre, inicio y modo app');
  ok(man.icons.some((i) => i.sizes === '192x192') && man.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any') && man.icons.some((i) => i.purpose === 'maskable'), 'manifiesto: iconos 192, 512 y maskable');
  ok(man.icons.every((i) => fs.existsSync(path.join(ROOT, i.src))), 'manifiesto: todos los iconos existen');
  const png = (f) => { const b = fs.readFileSync(path.join(ROOT, f)); return { ok: b.slice(0, 8).toString('hex') === '89504e470d0a1a0a', w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
  ok(png('icons/icon-192.png').w === 192 && png('icons/icon-512.png').h === 512 && png('icons/apple-touch-icon.png').w === 180 && png('icons/maskable-512.png').ok, 'iconos: PNG con el tamaño que dicen');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(/rel="manifest"/.test(html) && /apple-touch-icon/.test(html) && /name="viewport"/.test(html) && /theme-color/.test(html) && /js\/pwa\.js/.test(html), 'index.html: manifiesto, icono de iPhone, viewport, color y registro');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  ok(/\/api\//.test(sw) && /fetch\(r\)/.test(sw), 'sw.js: no guarda /api y va primero a la red');

  [abierto, cerrado, bloqueado].forEach((s) => s.close());
  console.log(`web.test.js OK (${n} comprobaciones)`);
  process.exit(0);
})().catch((e) => { console.log('FALLA: ' + (e.stack || e)); process.exit(1); });

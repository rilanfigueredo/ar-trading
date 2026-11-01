// Servicio 24/7 de Ar_Trading (v0.23.6): guarda las liquidaciones reales (y el interés abierto) aunque la app esté cerrada. Sin ventana.
// Uso: node servicio.js [--userdata CARPETA] [--port N]   (la app instalada lo lanza sola con su propio motor, ver src/autostart.js)
// Usa la MISMA carpeta de datos que la app (service.json > dataDir). Si la app ya está guardando, espera y toma el relevo cuando se cierre.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const userData = path.resolve(arg('userdata', path.join(__dirname, 'data')));
const Service = require('./src/service');
const core = require('./src/core');

const dd = Service.resolveDataDir(userData);
core.setDataDir(dd.dir); core.setDataNote({ dir: dd.dir, wanted: dd.wanted, error: dd.error });
const logF = path.join(dd.dir, 'servicio.log');
const log = (m) => {
  try { if (fs.existsSync(logF) && fs.statSync(logF).size > 1048576) fs.renameSync(logF, logF + '.old'); fs.mkdirSync(dd.dir, { recursive: true }); fs.appendFileSync(logF, new Date().toISOString() + ' ' + m + '\n'); } catch (e) { /* sin log */ }
};
process.on('uncaughtException', (e) => log('ERROR no controlado: ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => log('ERROR promesa: ' + (e && e.stack || e)));

let assetsKey = '';
const applyConfig = () => {
  const a = Service.read(userData).assets;
  const k = a.join(',');
  if (k === assetsKey) return false;
  core.setAssets(a); assetsKey = k; return true;
};

const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/ping') return send(res, 200, { ok: true, pid: process.pid });
    if (url.pathname === '/api/liqmap') return send(res, 200, await core.liqMap(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/data/status') return send(res, 200, await core.dataStatus());
    if (url.pathname === '/api/service/stop' && req.method === 'POST') { send(res, 200, { ok: true }); setTimeout(() => quit('detenido desde la app'), 200); return; }
    return send(res, 404, { error: 'No encontrado' });
  } catch (e) { return send(res, 500, { error: e.message }); }
});
function quit(why) { log('Servicio detenido: ' + why); try { core.shutdown(); } catch (e) { /* ok */ } process.exit(0); }
process.on('SIGINT', () => quit('SIGINT')); process.on('SIGTERM', () => quit('SIGTERM'));

const start = (port) => {
  server.once('error', (e) => { if (e.code === 'EADDRINUSE' && port) start(0); else { log('No pude abrir el puerto local: ' + e.message); process.exit(1); } });
  server.listen(port, '127.0.0.1', () => {
    const p = server.address().port;
    applyConfig(); core.setRole('servicio', p); core.liqStart();
    log(`Servicio iniciado (puerto ${p}, datos en ${dd.dir}${dd.error ? ' · AVISO: ' + dd.error : ''}, activos extra: ${assetsKey || 'ninguno'})`);
    console.log('Ar_Trading servicio 24/7 activo. Datos: ' + dd.dir);
    const t = setInterval(() => { if (applyConfig()) { core.restartLiq(); log('Activos cambiados: ' + (assetsKey || 'ninguno')); } }, 30000);   // los cambios hechos en Ajustes se aplican solos
    if (t.unref) t.unref();
  });
};
start(Number(arg('port', '37377')));

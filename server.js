// Modo navegador: sirve la interfaz en http://localhost:3000 (respaldo si Electron no funciona).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const core = require('./src/core');
core.setDataDir(path.join(__dirname, 'data'));
const store = require('./src/store').create(path.join(__dirname, 'data'));   // v0.22: configuración por ventana + parte compartida

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, 'renderer');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/klines') return send(res, 200, await core.klines(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/aggtrades') return send(res, 200, await core.aggTrades(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/tradestatus') return send(res, 200, core.tradeStatus());
    if (url.pathname === '/api/testconnection') return send(res, 200, await core.testConnection());
    if (url.pathname === '/api/symbols') return send(res, 200, await core.symbols(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/tickers') return send(res, 200, await core.tickers(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/config') {
      const w = url.searchParams.get('w') || 'w1';
      if (req.method === 'POST') {
        let data = '';
        for await (const chunk of req) data += chunk;
        const r = store.setConfig(w, JSON.parse(data));
        return send(res, 200, { ok: true, changed: r.changed });
      }
      return send(res, 200, store.getConfig(w));
    }
    if (url.pathname === '/api/tabs') return send(res, 200, store.tabs());
    if (url.pathname === '/api/window/active') {
      if (req.method === 'POST') { store.setActive(url.searchParams.get('w')); return send(res, 200, { ok: true }); }
      return send(res, 200, { id: store.getActive() });
    }
    if (url.pathname === '/api/windows') return send(res, 200, store.listWindows().map((x) => x.id));
    if (url.pathname === '/api/window/new' && req.method === 'POST') {
      const id = store.newWindowId();
      if (!id) return send(res, 200, { ok: false, error: `Máximo ${store.MAX_WINDOWS} pestañas. Cierra alguna.` });
      store.addWindow(id);
      return send(res, 200, { ok: true, id });
    }
    if (url.pathname === '/api/window/remove' && req.method === 'POST') {
      const id = url.searchParams.get('w');
      if (store.listWindows().length <= 1) return send(res, 200, { ok: false, error: 'No se puede cerrar la última pestaña.' });
      store.removeWindow(id);
      return send(res, 200, { ok: true });
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return send(res, 403, { error: 'No permitido' });
    const buf = fs.readFileSync(file);
    return send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    if (e.code === 'ENOENT') return send(res, 404, { error: 'No encontrado' });
    return send(res, 500, { error: e.message });
  }
});

process.on('SIGINT', () => { core.shutdown(); process.exit(0); });
process.on('SIGTERM', () => { core.shutdown(); process.exit(0); });
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Ar_Trading en modo navegador: http://localhost:${PORT}`);
});

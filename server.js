// Modo navegador: sirve la interfaz en http://localhost:3000 (respaldo si Electron no funciona).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const core = require('./src/core');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, 'renderer');
const CONFIG = path.join(__dirname, 'data', 'config.json');
core.setDataDir(path.join(__dirname, 'data'));
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
    if (url.pathname === '/api/blockrecords') return send(res, 200, await core.blockRecords(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/symbols') return send(res, 200, await core.symbols(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/tickers') return send(res, 200, await core.tickers(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/config') {
      if (req.method === 'POST') {
        let data = '';
        for await (const chunk of req) data += chunk;
        fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
        fs.writeFileSync(CONFIG, data);
        return send(res, 200, { ok: true });
      }
      try { return send(res, 200, fs.readFileSync(CONFIG, 'utf8')); } catch (e) { return send(res, 200, 'null'); }
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Ar_Trading en modo navegador: http://localhost:${PORT}`);
});

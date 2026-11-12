// Modo navegador: sirve la interfaz en http://localhost:3000 (respaldo si Electron no funciona).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { URL } = require('url');
const core = require('./src/core');
const Puente = require('./src/funciones/puente');
const DATA = process.env.AR_DATA_DIR || path.join(__dirname, 'data');   // AR_DATA_DIR: solo para pruebas
core.setDataDir(DATA);
const store = require('./src/store').create(DATA);   // v0.22: configuración por ventana + parte compartida

// v0.24: funciones. En el modo navegador no hay cifrado del sistema (las claves no se guardan) ni carpeta que abrir.
// Con TV_MOCK=1 (pruebas) la red de las funciones es simulada (test/noticias.datos.js) y el cifrado es de juguete.
const MOCK = process.env.TV_MOCK === '1';
const SIM = MOCK ? require('./test/noticias.datos') : null;
const puente = Puente.crearPuente({
  datosBase: DATA, appData: null, fetch: MOCK ? SIM.crearFetch() : (u, o) => fetch(u, o), ahora: MOCK ? () => SIM.AHORA : () => Date.now(),
  cifrador: MOCK ? { disponible: () => true, cifrar: (t) => Buffer.from(Buffer.from(t).map((b) => b ^ 0x5a)), descifrar: (b) => Buffer.from(b.map((x) => x ^ 0x5a)).toString() } : { disponible: () => false },
  abrirCarpeta: null,
});
const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, 'renderer');
const VERSION = require('./package.json').version;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
};
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.txt']);

// ---------- v0.26: modo nube (clave de acceso) ----------
// AR_PASSWORD = clave (mínimo 8 caracteres). AR_HOST = dirección donde escucha (por defecto solo este equipo).
// AR_TRUST_PROXY=1 = hay un proxy HTTPS delante (Caddy) en este mismo equipo: se confía en sus cabeceras.
const HOST = process.env.AR_HOST || '127.0.0.1';
const PASSWORD = process.env.AR_PASSWORD || '';
const TRUST_PROXY = process.env.AR_TRUST_PROXY === '1';
const LOOPBACK = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
if (PASSWORD && PASSWORD.length < 8) { console.error('AR_PASSWORD debe tener al menos 8 caracteres.'); process.exit(1); }
if (!LOOPBACK && !PASSWORD) { console.error('Por seguridad, si el servidor escucha fuera de este equipo (AR_HOST=' + HOST + ') es obligatorio definir AR_PASSWORD.'); process.exit(1); }
const AUTH = !!PASSWORD;
const SESSION_MS = 30 * 86400000;
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest();
const PW_HASH = AUTH ? sha(PASSWORD) : null;
function loadSecret() {
  if (process.env.AR_SECRET) return process.env.AR_SECRET;
  const f = path.join(DATA, 'secret.key');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { /* se crea */ }
  const k = crypto.randomBytes(32).toString('hex');
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(f, k, { mode: 0o600 }); } catch (e) { /* sin disco: la clave vale hasta reiniciar */ }
  return k;
}
const SECRET = AUTH ? loadSecret() : '';
const sign = (exp) => crypto.createHmac('sha256', SECRET).update(exp + '|' + PW_HASH.toString('hex')).digest('hex');
const makeToken = () => { const exp = String(Date.now() + SESSION_MS); return exp + '.' + sign(exp); };
function validToken(tok) {
  if (!tok) return false;
  const i = tok.indexOf('.');
  if (i < 1) return false;
  const exp = tok.slice(0, i), mac = tok.slice(i + 1);
  if (!(Number(exp) > Date.now())) return false;
  const good = Buffer.from(sign(exp)), got = Buffer.from(mac);
  return good.length === got.length && crypto.timingSafeEqual(good, got);
}
function cookieOf(req, name) {
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(req.headers.cookie || '');
  return m ? m[1] : '';
}
const clientIp = (req) => (TRUST_PROXY && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || '?';
const isHttps = (req) => TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https';
const fails = new Map();   // ip -> { n, until }
function lockedFor(ip) { const f = fails.get(ip); return f && f.until > Date.now() ? f.until - Date.now() : 0; }
function noteFail(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until && f.until <= Date.now()) { f.n = 0; f.until = 0; }
  f.n++;
  if (f.n >= 5) f.until = Date.now() + 15 * 60000;
  fails.set(ip, f);
  if (fails.size > 500) for (const [k, v] of fails) if (v.until < Date.now() && v.n < 5) fails.delete(k);
}
const PUBLIC = new Set(['/login', '/manifest.webmanifest', '/sw.js', '/assets/icon-192.png', '/assets/icon-512.png', '/assets/icon-maskable-512.png', '/assets/apple-touch-icon.png']);
function loginPage(msg) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0a102a"><title>Ar_Trading</title>
<style>html,body{height:100%;margin:0}body{background:#0a102a;color:#d1d4dc;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;display:flex;align-items:center;justify-content:center}
form{width:min(340px,90vw);background:#131a35;border:1px solid #2a3150;border-radius:12px;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,.4)}
h1{margin:0 0 4px;font-size:22px}p{margin:0 0 16px;color:#8a90a8;font-size:14px}
input{width:100%;box-sizing:border-box;font-size:18px;padding:12px;border-radius:8px;border:1px solid #2a3150;background:#0a102a;color:#fff}
button{width:100%;margin-top:12px;font-size:18px;padding:12px;border:0;border-radius:8px;background:#2962ff;color:#fff;font-weight:600}
.e{color:#ef5350;margin:10px 0 0;font-size:14px}</style></head><body>
<form method="post" action="/login"><h1>Ar_Trading</h1><p>Escribe tu clave de acceso.</p>
<input type="password" name="clave" autocomplete="current-password" autofocus required>
<button type="submit">Entrar</button>${msg ? '<div class="e">' + msg + '</div>' : ''}</form></body></html>`;
}

const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({ 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store' }, SEC, res.arExtra || {}, extra || {}));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
// Lee el cuerpo de una petición con tope de tamaño (evita que alguien llene la memoria).
async function readBody(req, max) {
  const lim = max || 12 * 1024 * 1024;
  let size = 0; const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > lim) { const e = new Error('Cuerpo demasiado grande'); e.status = 413; throw e; }
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString('utf8');
}
const staticCache = new Map();   // archivo -> { tag, raw, gz }
function sendStatic(req, res, file) {
  const st = fs.statSync(file);
  if (!st.isFile()) { const e = new Error('no'); e.code = 'ENOENT'; throw e; }
  const ext = path.extname(file);
  const tag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
  const hdr = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: tag, Vary: 'Accept-Encoding' };
  if (req.headers['if-none-match'] === tag) { res.writeHead(304, Object.assign({ ETag: tag }, SEC, res.arExtra || {})); return res.end(); }
  let ent = staticCache.get(file);
  if (!ent || ent.tag !== tag) {
    const raw = fs.readFileSync(file);
    ent = { tag, raw, gz: COMPRESS.has(ext) && raw.length > 1024 ? zlib.gzipSync(raw) : null };
    staticCache.set(file, ent);
  }
  const useGz = ent.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (useGz) hdr['Content-Encoding'] = 'gzip';
  res.writeHead(200, Object.assign(hdr, SEC, res.arExtra || {}));
  res.end(useGz ? ent.gz : ent.raw);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    // ---- v0.26: acceso con clave (solo si AR_PASSWORD está definida) ----
    if (AUTH) {
      const sec = isHttps(req) ? '; Secure' : '';
      if (url.pathname === '/login') {
        const ip = clientIp(req);
        if (req.method === 'POST') {
          const wait = lockedFor(ip);
          if (wait) return send(res, 429, loginPage('Demasiados intentos. Espera ' + Math.ceil(wait / 60000) + ' min.'), 'text/html; charset=utf-8');
          const body = new URLSearchParams(await readBody(req, 4096));
          const ok = crypto.timingSafeEqual(sha(body.get('clave') || ''), PW_HASH);
          if (!ok) { noteFail(ip); await new Promise((r) => setTimeout(r, 600)); return send(res, 401, loginPage('Clave incorrecta.'), 'text/html; charset=utf-8'); }
          fails.delete(ip);
          return send(res, 303, '', 'text/plain', { Location: '/', 'Set-Cookie': 'ar_sid=' + makeToken() + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + (SESSION_MS / 1000) + sec });
        }
        return send(res, 200, loginPage(''), 'text/html; charset=utf-8');
      }
      if (url.pathname === '/logout') return send(res, 303, '', 'text/plain', { Location: '/login', 'Set-Cookie': 'ar_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + sec });
      if (!PUBLIC.has(url.pathname) && !validToken(cookieOf(req, 'ar_sid'))) {
        if (url.pathname.startsWith('/api/')) return send(res, 401, { error: 'Sesión no iniciada' });
        return send(res, 302, '', 'text/plain', { Location: '/login' });
      }
    }
    if (url.pathname === '/sw.js') {
      const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').replace(/__VERSION__/g, VERSION);
      return send(res, 200, sw, 'text/javascript; charset=utf-8', { 'Service-Worker-Allowed': '/' });
    }
    if (url.pathname === '/api/klines') return send(res, 200, await core.klines(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/aggtrades') return send(res, 200, await core.aggTrades(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/liqmap') return send(res, 200, await core.liqMap(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/tradestatus') return send(res, 200, core.tradeStatus());
    if (url.pathname === '/api/testconnection') return send(res, 200, await core.testConnection());
    if (url.pathname === '/api/symbols') return send(res, 200, await core.symbols(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/tickers') return send(res, 200, await core.tickers(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/fn' && req.method === 'POST') {
      const data = await readBody(req);
      const b = JSON.parse(data || '{}');
      return send(res, 200, await puente.invocar(b.canal, b.args, b.inst));
    }
    if (url.pathname === '/api/config') {
      const w = url.searchParams.get('w') || 'w1';
      if (req.method === 'POST') {
        let data = '';
        data += await readBody(req);
        const r = store.setConfig(w, JSON.parse(data));
        return send(res, 200, { ok: true, changed: r.changed });
      }
      return send(res, 200, store.getConfig(w));
    }
    if (url.pathname === '/api/data/status') return send(res, 200, Object.assign(await core.dataStatus(), { desktop: false }));
    if (url.pathname === '/api/data/assets' && req.method === 'POST') {
      const data = await readBody(req);
      const Service = require('./src/service'), d = DATA;
      Service.write(d, { assets: JSON.parse(data) }); core.setAssets(Service.read(d).assets); core.restartLiq();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/service/get') return send(res, 200, { desktop: false, cloud: AUTH });
    if (url.pathname === '/api/service/factoryreset' && req.method === 'POST') {
      store.reset(); core.resetData({ restart: true });
      return send(res, 200, { ok: true });
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
    if (!file.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'No permitido' });
    return sendStatic(req, res, file);
  } catch (e) {
    if (e.status === 413) return send(res, 413, { error: e.message });
    if (e.code === 'ENOENT' || e.code === 'EISDIR') return send(res, 404, { error: 'No encontrado' });
    return send(res, 500, { error: e.message });
  }
});

process.on('SIGINT', () => { core.shutdown(); process.exit(0); });
process.on('SIGTERM', () => { core.shutdown(); process.exit(0); });
core.setRole('app'); core.setAssets(require('./src/service').read(DATA).assets); core.liqStart();
server.listen(PORT, HOST, () => {
  console.log(`Ar_Trading en modo navegador: http://${LOOPBACK ? 'localhost' : HOST}:${PORT}` + (AUTH ? ' (con clave de acceso)' : ''));
});

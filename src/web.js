// Servidor web de Ar_Trading (v0.26): sirve la interfaz y la API local. Lo usan:
//  - server.js (modo navegador, solo http://localhost, sin código de acceso: igual que antes) y
//  - main.js cuando activas «Acceso desde el móvil» (escucha en tu red; SIEMPRE exige el código de acceso, también a quien llegue por localhost,
//    porque un túnel como Tailscale entra por localhost).
// Con código de acceso: sin él solo se ve la pantalla de entrada (/acceso), el manifiesto y los iconos de la app. Se pierden 60 s tras 5 intentos fallidos.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
const PUBLICO = [/^\/acceso$/, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/icons\/[\w.-]+\.png$/];
const COOKIE = 'ar_acceso';

const PAGINA_ACCESO = (msg) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0a102a"><title>Ar_Trading</title><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a102a;color:#d1d4dc;font:16px system-ui,"Segoe UI",sans-serif}
form{background:#1e222d;border:1px solid #2a2e39;border-radius:12px;padding:28px;width:min(340px,86vw);text-align:center}img{width:72px;height:72px;border-radius:16px}
h1{font-size:20px;margin:12px 0 6px}p{color:#9aa0b0;font-size:14px;margin:0 0 16px}input{width:100%;box-sizing:border-box;padding:12px;font-size:22px;letter-spacing:.3em;text-align:center;background:#0a102a;color:#fff;border:1px solid #2a2e39;border-radius:8px}
button{margin-top:14px;width:100%;padding:12px;font-size:16px;background:#2962ff;color:#fff;border:0;border-radius:8px;cursor:pointer}.e{color:#ef5350;margin-top:12px;font-size:14px}</style></head>
<body><form method="post" action="/acceso"><img src="/icons/icon-192.png" alt=""><h1>Ar_Trading</h1><p>Escribe el código de acceso que aparece en Ajustes &gt; Móvil, en tu PC.</p>
<input name="codigo" inputmode="numeric" autocomplete="one-time-code" autofocus maxlength="12" aria-label="Código de acceso"><button>Entrar</button>${msg ? '<div class="e">' + msg + '</div>' : ''}</form></body></html>`;

// o: { core, store, puente, root, data, auth?: () => ({ codigo, secreto }) | null, version?: () => Promise<object> }
function crear(o) {
  const { core, store, puente } = o;
  const ROOT = path.resolve(o.root);
  const DATA = o.data;
  const fallos = new Map();   // ip -> { n, hasta }
  const send = (res, code, body, type, extra) => {
    res.writeHead(code, Object.assign({ 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store' }, extra || {}));
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const valorCookie = (secreto) => crypto.createHmac('sha256', String(secreto)).update('ar-acceso').digest('hex');
  const leerCookie = (req) => { const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([0-9a-f]+)').exec(req.headers.cookie || ''); return m ? m[1] : ''; };
  const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const auth = o.auth ? o.auth() : null;
      if (auth) {
        const ok = leerCookie(req) && igual(leerCookie(req), valorCookie(auth.secreto));
        if (url.pathname === '/acceso') {
          if (req.method === 'POST') {
            const ip = req.socket.remoteAddress || '?'; const f = fallos.get(ip) || { n: 0, hasta: 0 };
            if (Date.now() < f.hasta) return send(res, 429, PAGINA_ACCESO('Demasiados intentos. Espera un minuto.'), TYPES['.html']);
            let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 2000) break; }
            const codigo = new URLSearchParams(data).get('codigo') || '';
            if (igual(codigo.trim(), auth.codigo)) {
              fallos.delete(ip);
              const seguro = (req.headers['x-forwarded-proto'] || '') === 'https' ? '; Secure' : '';
              return send(res, 302, '', 'text/plain', { Location: '/', 'Set-Cookie': `${COOKIE}=${valorCookie(auth.secreto)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${seguro}` });
            }
            f.n++; if (f.n >= 5) { f.hasta = Date.now() + 60000; f.n = 0; } fallos.set(ip, f);
            return send(res, 401, PAGINA_ACCESO('Código incorrecto.'), TYPES['.html']);
          }
          return send(res, 200, PAGINA_ACCESO(''), TYPES['.html']);
        }
        if (!ok && !PUBLICO.some((r) => r.test(url.pathname))) {
          if (url.pathname.startsWith('/api/')) return send(res, 401, { error: 'Falta el código de acceso.' });
          return send(res, 302, '', 'text/plain', { Location: '/acceso' });
        }
      }
    if (url.pathname === '/api/klines') return send(res, 200, await core.klines(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/aggtrades') return send(res, 200, await core.aggTrades(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/liqmap') return send(res, 200, await core.liqMap(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/tradestatus') return send(res, 200, core.tradeStatus());
    if (url.pathname === '/api/testconnection') return send(res, 200, await core.testConnection());
    if (url.pathname === '/api/symbols') return send(res, 200, await core.symbols(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/tickers') return send(res, 200, await core.tickers(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/fn' && req.method === 'POST') {
      let data = ''; for await (const chunk of req) data += chunk;
      const b = JSON.parse(data || '{}');
      return send(res, 200, await puente.invocar(b.canal, b.args, b.inst));
    }
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
    if (url.pathname === '/api/data/status') return send(res, 200, Object.assign(await core.dataStatus(), { desktop: false }));
    if (url.pathname === '/api/data/assets' && req.method === 'POST') {
      if (auth) return send(res, 403, { error: 'No disponible desde el móvil: se cambia en el programa del PC.' });
      let data = ''; for await (const chunk of req) data += chunk;
      const Service = require('./service'), d = DATA;
      Service.write(d, { assets: JSON.parse(data) }); core.setAssets(Service.read(d).assets); core.restartLiq();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/service/get') return send(res, 200, { desktop: false });
    if (url.pathname === '/api/service/factoryreset' && req.method === 'POST') {
      if (auth) return send(res, 403, { error: 'No disponible desde el móvil: se cambia en el programa del PC.' });
      store.reset(); core.resetData({ restart: true });
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/version') return send(res, 200, o.version ? await o.version() : { actual: '', hayNueva: false, error: 'Sin información de versión.' });
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
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'No permitido' });
    const buf = fs.readFileSync(file);
    return send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream');
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'EISDIR') return send(res, 404, { error: 'No encontrado' });
      return send(res, 500, { error: e.message });
    }
  });
  return server;
}

module.exports = { crear, TYPES };

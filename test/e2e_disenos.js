// Prueba con navegador (v0.26.8): una pestaña guardada SIN designId (de antes de la 0.26.7) recupera el nombre de su diseño
// y, al cerrarla, ofrece actualizar ese diseño (no pide un nombre nuevo). Datos SIMULADOS (TV_MOCK=1).
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright no está instalado: se omite.'); process.exit(0); }
const PORT = 3113, URL = `http://127.0.0.1:${PORT}/`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-dz-'));
let pasan = 0, fallan = 0;
const ok = (c, m) => { if (c) pasan++; else { fallan++; console.log('  FALLA: ' + m); } };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const KEYS = ['layout', 'active', 'charts', 'sync', 'drawings', 'folders', 'bt', 'tfs', 'draw', 'listActive'];
(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { TV_MOCK: '1', PORT: String(PORT), AR_DATA_DIR: DATA }), stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(URL + 'api/tabs'); if (r.ok) break; } catch (e) { /* aún no */ } await esperar(250); }
    browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
    const errores = [];
    page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
    page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
    await page.goto(URL + '?w=w1'); await esperar(2500);
    const w1 = JSON.parse(fs.readFileSync(path.join(DATA, 'win-w1.json'), 'utf8'));
    const pick = (c) => { const o = {}; KEYS.forEach((k) => { if (c[k] !== undefined) o[k] = JSON.parse(JSON.stringify(c[k])); }); return o; };
    const dA = pick(w1), dB = pick(w1);
    dB.charts = dB.charts.map((c) => Object.assign({}, c, { symbol: 'ETHUSDT' }));
    const shared = JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8'));
    shared.designs = [{ id: 'dA', name: 'Mi diseño BTC', at: 1, thumb: null, data: dA }, { id: 'dB', name: 'Mi diseño ETH', at: 2, thumb: null, data: dB }];
    fs.writeFileSync(path.join(DATA, 'config.json'), JSON.stringify(shared));
    delete w1.designId; fs.writeFileSync(path.join(DATA, 'win-w1.json'), JSON.stringify(w1));   // pestaña "vieja" sin designId
    await page.reload(); await esperar(2500);
    const nombre = await page.$eval('#btnDesigns', (b) => b.textContent.trim());
    ok(/Mi diseño BTC/.test(nombre), 'al abrir, el botón muestra el diseño recuperado (sale: «' + nombre + '»)');
    await esperar(800);
    ok(JSON.parse(fs.readFileSync(path.join(DATA, 'win-w1.json'), 'utf8')).designId === 'dA', 'el diseño recuperado queda guardado en disco');
    await page.reload(); await esperar(2000);
    ok(/Mi diseño BTC/.test(await page.$eval('#btnDesigns', (b) => b.textContent.trim())), 'tras reiniciar sigue mostrando el diseño');
    // pestaña con gráficos que no coinciden con ningún diseño → diálogo de cierre con lista de diseños
    const w1b = JSON.parse(fs.readFileSync(path.join(DATA, 'win-w1.json'), 'utf8'));
    w1b.charts[0].symbol = 'SOLUSDT'; delete w1b.designId; fs.writeFileSync(path.join(DATA, 'win-w1.json'), JSON.stringify(w1b));
    fs.writeFileSync(path.join(DATA, 'win-w2.json'), JSON.stringify(w1b));
    const sh2 = JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8')); sh2.windows = [{ id: 'w1', bounds: null }, { id: 'w2', bounds: null }];
    fs.writeFileSync(path.join(DATA, 'config.json'), JSON.stringify(sh2));
    await page.reload(); await esperar(2500);
    await page.evaluate(() => { const t = document.querySelector('#tabBar .tab .tab-x'); if (t) t.click(); });
    await esperar(600);
    const hasSel = await page.$('#modalBox[data-kind="closetab"] select');
    ok(!!hasSel, 'el diálogo de cierre permite elegir un diseño existente');
    ok(errores.length === 0, 'cero errores de consola: ' + errores.join(' | '));
  } finally { if (browser) await browser.close(); srv.kill(); }
  console.log(`e2e diseños: ${pasan} bien, ${fallan} fallan`);
  process.exit(fallan ? 1 : 0);
})();

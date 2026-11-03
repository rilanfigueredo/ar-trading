// Pruebas con navegador (Playwright) de la pantalla de tarjetas y de las funciones (v0.24). Datos SIMULADOS (TV_MOCK=1).
// Uso:  node test/e2e_funciones.js        (arranca solo su propio servidor en el puerto 3112 con datos temporales)
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright no está instalado: se omiten las pruebas con navegador (npm i -D playwright).'); process.exit(0); }

const PORT = 3112, URL = `http://127.0.0.1:${PORT}/`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-e2e-'));
const SHOTS = process.env.SHOTS || '';
let pasan = 0, fallan = 0;
const ok = (c, m) => { if (c) pasan++; else { fallan++; console.log('  FALLA: ' + m); } };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(page, n) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } }

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { TV_MOCK: '1', PORT: String(PORT), AR_DATA_DIR: DATA }), stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(URL + 'api/tabs'); if (r.ok) break; } catch (e) { /* aún no */ } await esperar(250); }
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
    page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
    const fnCalls = [];
    page.on('request', (r) => { if (r.url().endsWith('/api/fn')) { try { fnCalls.push(JSON.parse(r.postData()).canal); } catch (e) { /* ok */ } } });
    const tabs = () => page.$$eval('#tabBar .tab .tab-name', (a) => a.map((x) => x.textContent));
    const clickMas = async () => { await page.click('#tabBar .tab-new'); await page.waitForSelector('.fn-pane:not(.off) .fn-cards'); };
    const abrir = async (id) => { await page.click(`.fn-pane:not(.off) button[data-abrir="${id}"]`); };

    await page.goto(URL); await page.waitForSelector('#grid .cell', { timeout: 15000 }); await esperar(800);
    ok((await tabs()).length === 1, 'arranca con 1 pestaña');
    ok(await page.isVisible('#toolbar'), 'pestaña 1: barra del gráfico visible (sin cambios)');
    await shot(page, '01_grafico_inicial');

    // --- 1 y 2: «+» abre directamente la pantalla de tarjetas
    await clickMas();
    ok((await tabs()).join('|') === 'FAVORITOS-BTCUSDT-1H|Nueva pestaña', 'el «+» crea la pestaña "Nueva pestaña": ' + (await tabs()).join('|'));
    ok(!(await page.isVisible('#toolbar')), 'en la pantalla de tarjetas no se ve la barra del gráfico');
    ok(await page.locator('.tab-menu').count() === 0, 'ya no hay menú desplegable del «+»');
    const tj = await page.$$eval('.fn-pane:not(.off) .fn-card', (a) => a.map((c) => ({ n: c.querySelector('.fn-card-n').textContent, d: c.querySelector('.fn-card-d').textContent, ic: !!c.querySelector('svg'), b: c.querySelector('button').textContent, off: c.querySelector('button').disabled })));
    ok(tj.length === 5, '5 tarjetas');
    ok(tj.map((x) => x.n).join('|') === 'Gráfico limpio|Mapa de liquidaciones|Simulador de posiciones|Monitor de blockchain|Noticias macro', 'nombres y orden: ' + tj.map((x) => x.n).join('|'));
    ok(tj.every((x) => x.ic && x.b === 'Abrir' && x.d.length > 10 && x.d.length < 70 && !x.d.includes('\n')), 'cada tarjeta: icono, botón «Abrir» y descripción de una línea');
    ok(tj.every((x) => !x.off), 'las 5 tarjetas habilitadas (v0.25: Simulador y Blockchain ya llegaron)');
    await shot(page, '02_tarjetas');

    // --- 3: Gráfico limpio funciona igual
    await abrir('grafico'); await page.waitForSelector('#toolbar', { state: 'visible' }); await page.waitForSelector('#grid:not(.tab-off) .cell');
    await esperar(1200);
    ok((await tabs())[1] === 'FAVORITOS-BTCUSDT-1H', 'Gráfico limpio: título de pestaña: ' + (await tabs())[1]);
    ok(await page.isVisible('#btnSymbol') && (await page.textContent('#btnSymbol')) === 'BTCUSDT', 'Gráfico limpio: BTCUSDT');
    ok((await page.$$('#grid:not(.tab-off) .cell canvas')).length > 0, 'Gráfico limpio: dibuja velas');
    await shot(page, '03_grafico_limpio');

    // --- 3b: Mapa de liquidaciones
    await clickMas(); await abrir('liq'); await page.waitForSelector('#toolbar', { state: 'visible' }); await esperar(1500);
    ok((await tabs())[2] === 'FAVORITOS-BTCUSDT-15MIN-LIQ', 'Mapa de liquidaciones: pestaña ' + (await tabs())[2]);
    const liqOn = await page.evaluate(() => window.__tv.cfg.charts[0].liq.on === true && window.__tv.cfg.charts[0].tf === 'm:15');
    ok(liqOn, 'Mapa de liquidaciones: capa activada, 15 min');
    await shot(page, '04_liquidaciones');

    // --- 4: Noticias macro en la misma pestaña
    await clickMas(); await abrir('noticias');
    await page.waitForSelector('iframe.fn-frame'); const fr = page.frameLocator('iframe.fn-frame');
    await fr.locator('#btnActualizar').waitFor({ timeout: 10000 }); await esperar(1500);
    ok((await tabs())[3] === 'Noticias macro', 'Noticias: título de pestaña = el de la función');
    ok(await page.isVisible('.fn-pane:not(.off) .fn-home-btn') && !(await page.isVisible('#toolbar')), 'Noticias: botón Inicio visible, sin barra de gráfico');
    await fr.locator('#btnActualizar').click(); await fr.locator('#tablaCal tbody tr').first().waitFor({ timeout: 10000 });
    const filas = await fr.locator('#tablaCal tbody tr').count();
    ok(filas > 0, 'Noticias: calendario con filas (' + filas + ')');
    await shot(page, '05_noticias_calendario');
    await fr.locator('.chips .btn').first().click(); await fr.locator('#mgrid .mcard').first().waitFor({ timeout: 20000 });
    ok(await fr.locator('#mgrid .mcard').count() === 6, 'Noticias: 6 tarjetas de mercado');
    ok(await fr.locator('.tgrid .tcard').count() > 0 && /sin dato|▲|▼|\d/.test(await fr.locator('#mgrid').textContent()), 'Noticias: reporte con tarjetas');
    ok(!/comprar|vender|riesgo alto/i.test(await fr.locator('#resultado').textContent()), 'Noticias: sin señales de compra/venta ni «riesgo alto»');
    await shot(page, '06_noticias_reporte');

    // --- 5: estilo = el de Ar_Trading (mismas variables), claro/oscuro, sin filtraciones
    const col = async (loc) => loc.evaluate((e) => { const s = getComputedStyle(e); return [s.backgroundColor, s.color, s.fontFamily]; });
    const bgPar = await page.evaluate(() => getComputedStyle(document.body).backgroundColor), fontPar = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    const [bgFr, , fontFr] = await col(fr.locator('body'));
    ok(bgPar === bgFr && /Segoe UI/.test(fontFr), `Noticias usa el fondo de Ar_Trading y la tipografía moderna común (oscuro): ${bgFr}`);
    const btnAct = await fr.locator('#btnActualizar').evaluate((e) => getComputedStyle(e).backgroundColor);
    ok(btnAct === 'rgb(41, 98, 255)', 'botón principal = azul de Ar_Trading: ' + btnAct);
    await page.click('.fn-pane:not(.off) .fn-theme'); await esperar(400);
    ok((await page.evaluate(() => document.body.dataset.theme)) === 'light', 'botón de tema: pasa a claro');
    const bgPar2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor), [bgFr2] = await col(fr.locator('body'));
    ok(bgPar2 === bgFr2 && bgFr2 !== bgFr, 'modo claro: el marco sigue el tema (' + bgFr2 + ')');
    await shot(page, '07_noticias_claro');
    await page.click('.fn-pane:not(.off) .fn-theme'); await esperar(300);
    // los estilos del marco no se filtran al programa y viceversa
    ok(await page.evaluate(() => !document.querySelector('link[href*="estilo.css"]')), 'los estilos de la función no están en la página principal');
    ok(await fr.locator('body').evaluate(() => !document.querySelector('link[href$="styles.css"]') && !document.getElementById('tabBar')), 'el marco no carga el CSS del gráfico');
    const tabBg = await page.$eval('#tabBar', (e) => getComputedStyle(e).backgroundColor); ok(tabBg !== 'rgba(0, 0, 0, 0)', 'barra de pestañas intacta');

    // --- 6: aislamiento de canales
    const crudo = await page.evaluate(async () => {
      const ifr = document.querySelector('iframe.fn-frame');
      return new Promise((res) => {
        const id = 9991; const h = (e) => { if (e.data && e.data.fn === 1 && e.data.id === id) { window.removeEventListener('message', h); res(e.data.resultado); } };
        window.addEventListener('message', h);
        ifr.contentWindow.Fn.invocar('blockchain:refrescar').then(res);   // desde el marco de Noticias a un canal ajeno
      });
    });
    ok(crudo && crudo.ok === false && /propios canales/.test(crudo.error), 'Noticias no puede llamar a canales de otra función: ' + (crudo && crudo.error));
    const r2 = await page.evaluate(() => fetch('/api/fn', { method: 'POST', body: JSON.stringify({ canal: 'config:get', args: [] }) }).then((r) => r.json()));
    ok(r2.ok === false, 'el puente rechaza canales internos del programa');
    const r3 = await page.evaluate(() => fetch('/api/fn', { method: 'POST', body: JSON.stringify({ canal: 'noticias:vista', args: [null] }) }).then((r) => r.json()));
    ok(r3.ok === true || typeof r3.error === 'string', 'un argumento raro no tumba el servidor');

    // --- 7: mismo monitor en dos pestañas: no se pisan los datos
    await clickMas(); await abrir('noticias'); await page.waitForSelector('.fn-pane:not(.off) iframe.fn-frame');
    const fr2 = page.frameLocator('.fn-pane:not(.off) iframe.fn-frame'); await fr2.locator('#btnActualizar').waitFor({ timeout: 10000 }); await esperar(1200);
    ok((await tabs()).filter((t) => t === 'Noticias macro').length === 2, 'dos pestañas de Noticias');
    await fr2.locator('.tabs .tab[data-tab="lista"]').click();
    const marcados = await fr2.locator('#checksLista input:checked').count();
    await fr2.locator('#checksLista input[value="GBP"]').evaluate((i) => { i.click(); }); await fr2.locator('#btnGuardarLista').click(); await esperar(600);
    const lista2 = await page.evaluate(() => fetch('/api/fn', { method: 'POST', body: JSON.stringify({ canal: 'noticias:estado', args: [], inst: 'w5' }) }).then((r) => r.json()));
    ok(lista2.datos.lista.includes('GBP') && lista2.datos.lista.length === marcados + 1, 'la lista guardada en una pestaña se ve en el módulo único (sin pisarse)');
    // la primera pestaña de Noticias sigue viva y con su propia vista
    ok(await page.locator('.fn-pane').count() >= 2, 'cada pestaña conserva su marco');

    // --- 8: relojes: Noticias renueva cada hora solo mientras su pestaña está abierta y a la vista
    await page.click('#tabBar .tab:nth-child(4)'); await esperar(500);                      // vuelve a la 1.ª pestaña de Noticias (con reporte)
    const frA = page.frameLocator('.fn-pane:not(.off) iframe.fn-frame');
    await frA.locator('#mgrid .mcard').first().waitFor();
    fnCalls.length = 0;
    await page.evaluate(() => document.querySelector('.fn-pane:not(.off) iframe.fn-frame').contentWindow.__noticias.forzarVencida());
    await page.click('#tabBar .tab:nth-child(1)'); await esperar(2500);                      // la deja de ver → no debe renovar
    ok(!fnCalls.includes('noticias:mercado'), 'con la pestaña fuera de vista no renueva el mercado');
    await page.click('#tabBar .tab:nth-child(4)'); await esperar(2500);                      // vuelve → pasó más de una hora → renueva
    ok(fnCalls.includes('noticias:mercado'), 'al volver a verla (más de 1 h) renueva el mercado');

    // --- 9: «Inicio» vuelve a las tarjetas y detiene la función
    await page.click('.fn-pane:not(.off) .fn-home-btn'); await page.waitForSelector('.fn-pane:not(.off) .fn-cards'); await esperar(700);
    ok((await tabs())[3] === 'Nueva pestaña', 'Inicio: la pestaña vuelve a «Nueva pestaña»');
    ok(await page.locator('iframe.fn-frame').count() === 1, 'Inicio: el marco de esa pestaña se cierra (solo queda el de la otra)');
    await shot(page, '08_inicio_de_vuelta');

    // --- 10: se recuerda al reabrir
    await page.click('#tabBar .tab:nth-child(5)'); await esperar(900);
    await page.reload(); await page.waitForSelector('#tabBar .tab'); await esperar(1500);
    ok((await tabs()).join('|') === 'FAVORITOS-BTCUSDT-1H|FAVORITOS-BTCUSDT-1H|FAVORITOS-BTCUSDT-15MIN-LIQ|Nueva pestaña|Noticias macro', 'tras recargar, los títulos se recuerdan: ' + (await tabs()).join('|'));
    ok(await page.waitForSelector('.fn-pane:not(.off) iframe.fn-frame', { timeout: 8000 }).then(() => true).catch(() => false), 'tras recargar, la pestaña activa vuelve a abrir Noticias');
    ok((await page.isVisible('#toolbar')) === false, 'tras recargar en una función no se ve la barra del gráfico');
    await page.click('#tabBar .tab:nth-child(1)'); await esperar(900);
    ok(await page.isVisible('#toolbar') && (await page.$$('#grid:not(.tab-off) .cell canvas')).length > 0, 'volver al gráfico de la pestaña 1 funciona');

    // --- 11 (v0.25): Simulador de posiciones — calcula y recuerda lo guardado
    await clickMas(); await abrir('simulador');
    await page.waitForSelector('.fn-pane:not(.off) iframe.fn-frame'); const fs1 = page.frameLocator('.fn-pane:not(.off) iframe.fn-frame');
    await fs1.locator('#r1 input').first().waitFor({ timeout: 10000 }); await esperar(600);
    ok((await tabs()).includes('Simulador de posiciones'), 'Simulador: título de pestaña');
    await fs1.locator('#ent input').nth(0).fill('100000'); await fs1.locator('#ent input').nth(1).fill('50');
    await fs1.locator('#sl').fill('101000'); await esperar(500);
    const dashTxt = await fs1.locator('#dash').innerText();
    ok(dashTxt.length > 50 && !/NaN|undefined/.test(dashTxt), 'Simulador: el reporte se calcula sin NaN (' + dashTxt.length + ' letras)');
    ok((await fs1.locator('#outA').innerText()).length > 5, 'Simulador: exposición máxima calculada');
    ok((await fs1.locator('svg').count()) > 0, 'Simulador: gráficos SVG dibujados');
    await fs1.locator('#scn').fill('Prueba v025'); await fs1.locator('#scs').click(); await esperar(700);
    const guard = await page.evaluate(() => fetch('/api/fn', { method: 'POST', body: JSON.stringify({ canal: 'simulador:cargar', args: [], inst: 'w1' }) }).then((r) => r.json()));
    ok(guard.ok && JSON.stringify(guard.datos).includes('Prueba v025'), 'Simulador: el escenario queda guardado en el programa');
    await shot(page, '09_simulador');
    await page.reload(); await page.waitForSelector('#tabBar .tab'); await esperar(1500);
    const fs2 = page.frameLocator('.fn-pane:not(.off) iframe.fn-frame'); await fs2.locator('#r1 input').first().waitFor({ timeout: 10000 }); await esperar(600);
    ok((await fs2.locator('#out6').innerText()).includes('Prueba v025'), 'Simulador: tras recargar sigue el escenario guardado');

    // --- 12 (v0.25): Monitor de blockchain — datos de la fuente simulada
    await clickMas(); await abrir('blockchain');
    await page.waitForSelector('.fn-pane:not(.off) iframe.fn-frame'); const fb = page.frameLocator('.fn-pane:not(.off) iframe.fn-frame');
    await fb.locator('#tab-resumen .card').first().waitFor({ timeout: 15000 }); await esperar(800);
    const resumen = await fb.locator('#tab-resumen').innerText();
    ok(resumen.includes('985.000') && /mempool\.space/.test(await fb.locator('#statusText').innerText()), 'Blockchain: bloque 985.000 y fuente mempool.space');
    ok(/95\.000,50/.test(resumen), 'Blockchain: precio actual de Bitstamp');
    await fb.locator('#tabs button[data-tab="eras"]').click(); await esperar(300);
    ok((await fb.locator('#tab-eras table tbody tr').count()) >= 5, 'Blockchain: tabla de eras (halvings)');
    await fb.locator('#tabs button[data-tab="velocidad"]').click(); await fb.locator('#dFrom').fill('2026-10-01'); await fb.locator('#dTo').fill('2026-10-20'); await fb.locator('#btnRange').click();
    await fb.locator('#rangeOut .range-grid').waitFor({ timeout: 15000 });
    ok(/58\d,\d s/.test(await fb.locator('#rangeOut').innerText()), 'Blockchain: promedio del rango ≈ 580 s');
    await fb.locator('#btnAvisos').click(); await fb.locator('#sNewBlock').check(); await esperar(700);
    const aj = await page.evaluate(() => fetch('/api/fn', { method: 'POST', body: JSON.stringify({ canal: 'blockchain:ajustes', args: [], inst: 'w1' }) }).then((r) => r.json()));
    ok(aj.ok && aj.datos.notifyNewBlock === true, 'Blockchain: los avisos se guardan');
    await shot(page, '10_blockchain');

    // --- 13 (v0.26): Ajustes > Respaldo / Móvil / Programa y app instalable (modo navegador)
    await page.click('#tabBar .tab:nth-child(1)'); await esperar(900);
    await page.click('#btnSettings'); await page.waitForSelector('.setwin .props-tab');
    const pestanas = await page.$$eval('.setwin .props-tab', (a) => a.map((x) => x.textContent));
    ok(pestanas.join('|') === 'General|Gráfico|Plantillas|Paleta|Datos|Servicio|Respaldo|Móvil|Programa', 'Ajustes: pestañas nuevas: ' + pestanas.join('|'));
    await page.click('.setwin .props-tab:has-text("Respaldo")'); await esperar(300);
    ok(/app de escritorio/.test(await page.innerText('.setwin .props-body')), 'Respaldo: en el navegador lo explica (solo app de escritorio)');
    await page.click('.setwin .props-tab:has-text("Móvil")'); await esperar(300);
    ok(/app de escritorio/.test(await page.innerText('.setwin .props-body')), 'Móvil: en el navegador lo explica');
    await page.click('.setwin .props-tab:has-text("Programa")'); await esperar(800);
    const prog = await page.innerText('.setwin .props-body');
    ok(/Versión instalada/.test(prog) && /Estás al día/.test(prog) && /Buscar actualizaciones/.test(prog), 'Programa: versión y estado de actualización');
    await shot(page, '11_ajustes_programa');
    await page.keyboard.press('Escape'); await esperar(300);
    const man = await page.evaluate(() => fetch('/manifest.webmanifest').then((r) => r.json()));
    ok(man.display === 'standalone' && man.icons.length >= 3, 'App instalable: manifiesto disponible');
    const swOk = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; });
    ok(swOk, 'App instalable: service worker registrado (localhost)');
    ok(await page.evaluate(() => !!document.querySelector('link[rel=manifest]') && !!document.querySelector('meta[name=theme-color]')), 'App instalable: etiquetas en la página');

    ok(errores.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e)).length === 0, 'cero errores de consola: ' + JSON.stringify(errores.slice(0, 4)));
  } catch (e) {
    fallan++; console.log('  ERROR en la prueba: ' + e.message);
  } finally {
    if (browser) await browser.close();
    srv.kill();
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* ok */ }
  }
  console.log(`\nPruebas con navegador: ${pasan} pasan, ${fallan} fallan`);
  process.exit(fallan ? 1 : 0);
})();

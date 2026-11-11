'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { AHORA, ZONA, FEED, crearFetch } = require('./noticias.datos');
const V = require('../src/funciones/noticias/valores'), T = require('../src/funciones/noticias/tiempo'), C = require('../src/funciones/noticias/calendario'), F = require('../src/funciones/noticias/fred');
const B = require('../src/funciones/noticias/binance'), CM = require('../src/funciones/noticias/comandos'), CH = require('../src/funciones/noticias/charts');
const { crearAlmacen } = require('../src/funciones/noticias/almacen'), { AppMacro } = require('../src/funciones/noticias/app');
let pasan = 0, fallan = 0;
function ok(c, m) { if (c) pasan++; else { fallan++; console.log('  FALLA: ' + m); } }
function cerca(a, b, m, e = 1e-9) { ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b}`); }
const cif = { disponible: () => true, cifrar: (s) => Buffer.from(Buffer.from(s).map((b) => b ^ 0x5a)), descifrar: (b) => Buffer.from(b.map((x) => x ^ 0x5a)).toString() };
const CLAVE = 'abcdefghijklmnopqrstuvwxyz123456';
function nuevaApp(fetchFn, conClave = true, t = { ahora: AHORA }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-'));
  const alm = crearAlmacen(dir, cif);
  const app = new AppMacro({ fetchFn, almacen: alm, ahora: () => t.ahora, zona: ZONA });
  app.iniciar();
  if (conClave) app.guardarClave(CLAVE);
  return { app, alm, dir, t };
}
(async () => {
  // valores
  ok(V.parsear('198K').num === 198 && V.parsear('198K').unidad === 'K', 'parsear K');
  ok(V.parsear('<1.25%').op === '<', 'parsear operador');
  ok(V.parsear('3.58|1.2') === null && V.parsear('') === null, 'parsear compuesto/vacío');
  ok(V.formatear(0.3, '%', 1) === '0.3 %', 'formatear');
  // tiempo
  ok(new Date(T.zonaAUtc('2026-10-29', '08:30', T.ZONA_ET)).toISOString() === '2026-10-29T12:30:00.000Z', '08:30 ET en horario de verano');
  ok(new Date(T.zonaAUtc('2026-11-05', '08:30', T.ZONA_ET)).toISOString() === '2026-11-05T13:30:00.000Z', '08:30 ET en horario normal');
  // calendario
  const ev = C.normalizarFeed(FEED);
  ok(ev.length === FEED.length, 'normalizar cuenta');
  ok(C.filtrar(ev, { rango: 'hoy', ahora: AHORA, zona: ZONA }).every((e) => T.claveDia(e.ms, ZONA) === '2026-10-29'), 'filtro hoy');
  ok(C.filtrar(ev, { monedas: ['USD'], importancias: ['alta'], ahora: AHORA, zona: ZONA }).length === 5, 'filtro USD alta');
  let err = null; try { C.normalizarFeed({ a: 1 }); } catch (e) { err = e; } ok(err && /Forex Factory/.test(err.message), 'feed inválido avisa la fuente');
  // transformar
  const mom = F.transformar([{ fecha: '2026-01-01', valor: 100 }, { fecha: '2026-02-01', valor: 100.3 }], 'mom');
  cerca(mom[0].valor, 0.3, 'mom', 1e-9);
  ok(F.transformar([{ fecha: '2026-01-01', valor: 5 }, { fecha: '2026-02-01', valor: 8 }], 'dif')[0].valor === 3, 'dif');
  const y = []; for (let i = 0; i < 14; i++) y.push({ fecha: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`, valor: 100 + i });
  ok(F.transformar(y, 'yoy').length === 2, 'yoy exige 12 meses');
  // evaluar por periodo (FRED sin clave)
  const evM = { ms: Date.parse('2026-10-29T12:30:00Z'), previoNum: { num: 0.2, op: '', original: '0.2%' } };
  const sM = [{ fecha: '2026-08-01', valor: 0.2 }, { fecha: '2026-09-01', valor: 0.3 }];
  let ev1 = F.evaluar({ tol: 0.06 }, evM, sM); ok(ev1.estado === 'publicado' && ev1.valor === 0.3, 'mensual: busca el mes anterior');
  ok(F.evaluar({ tol: 0.06 }, evM, [sM[0]]).estado === 'sin-publicar', 'mensual: FRED aún no lo tiene');
  ok(F.evaluar({ tol: 0.06 }, Object.assign({}, evM, { previoNum: { num: 0.9, op: '', original: '0.9%' } }), sM).estado === 'a-verificar', 'previo distinto -> a verificar');
  const evS = { ms: Date.parse('2026-10-29T12:30:00Z'), previoNum: { num: 194, op: '', original: '194K' } };
  ok(F.evaluar({ tol: 1.5, periodo: 'semanal' }, evS, [{ fecha: '2026-10-17', valor: 194 }, { fecha: '2026-10-24', valor: 200 }]).valor === 200, 'semanal: sábado anterior');
  ok(F.evaluar({ tol: 0.06, periodo: 'trimestral' }, { ms: Date.parse('2026-01-29T13:30:00Z'), previoNum: null }, [{ fecha: '2025-10-01', valor: 2 }]).valor === 2, 'trimestral cruza el año');
  ok(F.parsearCSV('observation_date,X\n2026-01-01,1.5\n2026-02-01,.\n2026-03-01,\n2026-04-01,2').length === 2, 'CSV ignora vacíos');
  // binance
  const vel = []; for (let k = 0; k <= 290; k++) vel.push({ t: 1000000 * 300 + k * 300000, o: 100000 + 10 * k, h: 100000 + 10 * k + 5, l: 100000 + 10 * k - 5, c: 0 });
  const r = B.reaccion(vel, 1000000 * 300);
  cerca(r.r1h, 0.0012, 'r1h', 1e-9); cerca(r.r4h, 0.0048, 'r4h', 1e-9); cerca(r.r24h, 0.0288, 'r24h', 1e-9);
  cerca(r.rango1h, (110 + 10) / 100000 + 0.0000, 'rango1h', 1e-4);
  ok(B.mediana([3, 1, 2]) === 2 && B.mediana([1, 2, 3, 4]) === 2.5, 'mediana');
  // comandos
  let c = CM.interpretar('reporte de la lista de seguimiento', { lista: ['USD', 'JPY', 'EUR'] });
  ok(c.accion === 'reporte' && c.monedas.length === 3, 'orden lista');
  c = CM.interpretar('solo EE. UU.', { lista: ['JPY'] }); ok(c.accion === 'reporte' && c.monedas.join() === 'USD', 'solo EE. UU.');
  c = CM.interpretar('Reporte de Japón y Eurozona'); ok(c.monedas.join() === 'JPY,EUR', 'japón y eurozona');
  c = CM.interpretar('calendario de hoy, alta importancia', { lista: ['USD'] }); ok(c.accion === 'calendario' && c.rango === 'hoy' && c.importancias.join() === 'alta', 'calendario hoy alta');
  ok(CM.interpretar('blablabla').accion === 'ayuda', 'orden desconocida -> ayuda');
  // gráficos escapan texto
  const svg = CH.graficoSorpresas([{ titulo: '<script>x</script>', nums: { previo: 1, esperado: 2, publicado: 3 }, textos: { previo: '1', esperado: '2', publicado: '3', min: '1', max: '3' } }]);
  ok(!svg.includes('<script>') && svg.startsWith('<svg'), 'SVG escapa texto');
  // almacén cifrado
  { const { app, dir } = nuevaApp(crearFetch());
    const crudo = fs.readFileSync(path.join(dir, 'fred.bin'), 'utf8');
    ok(!crudo.includes(CLAVE) && app.hayClave(), 'clave cifrada en disco');
    let e2 = null; try { app.guardarClave('corta'); } catch (e) { e2 = e; } ok(e2 && !e2.message.includes('corta'), 'clave mala rechazada'); }
  // flujo completo
  { const f = crearFetch(); const { app } = nuevaApp(f);
    const r1 = await app.ejecutarOrden('reporte de la lista de seguimiento');
    ok(r1.tipo === 'reporte' && r1.banners.length === 0, 'reporte sin errores');
    const us = r1.secciones.find((s) => s.moneda === 'USD');
    const pce = us.pasados.find((x) => x.titulo.startsWith('Core PCE'));
    ok(pce && pce.publicado === '0.3 %' && pce.direccion === 'en línea con lo esperado', 'PCE en línea: ' + JSON.stringify(pce));
    const gdp = us.pasados.find((x) => x.titulo === 'Advance GDP q/q');
    ok(gdp.publicado === '3.0 %' && gdp.sorpresa === '-0.2 pp' && gdp.direccion === 'más laxo que lo esperado', 'PIB: ' + JSON.stringify(gdp));
    const cl = us.pasados.find((x) => x.titulo === 'Unemployment Claims');
    ok(cl.publicado === '200K' && cl.direccion === 'más laxo que lo esperado', 'Claims: ' + JSON.stringify(cl));
    const ff = us.pasados.find((x) => x.titulo === 'Federal Funds Rate');
    ok(ff.estado === 'publicado' && ff.direccion.startsWith('en línea'), 'Fed funds');
    ok(us.reacciones.length === 3 && !us.reacciones.some((x) => x.titulo === 'Federal Funds Rate'), 'reacciones (sin Fed funds)');
    ok(gdp.mejor === 'peor' && cl.mejor === 'peor' && pce.mejor === 'igual', 'colores: PIB y claims peor, PCE igual');
    ok(r1.modelo.bloques.length === 5 && r1.modelo.svg.startsWith('<svg'), 'modelo de 5 datos con gráfico');
    ok(r1.mercado.length === 6 && r1.mercado.every((t) => t.svg.startsWith('<svg') && t.valor !== 'sin dato'), 'tarjetas de mercado');
    ok(r1.temas.some((t) => t.id === 'inflacion') && r1.temas.some((t) => t.id === 'empleo') && r1.temas.some((t) => t.id === 'tasas'), 'tarjetas por tema');
    const rc = us.reacciones.find((x) => x.titulo.startsWith('Core PCE'));
    ok(rc.resumen.todos.n === 12, 'n=12 publicaciones: ' + rc.resumen.todos.n);
    cerca(rc.resumen.todos.r1h.mediana, 0.0012, 'mediana +1h simulada', 1e-9);
    ok(rc.resumen.todos.r24h.n === 11, 'la última publicación aún no tiene +24 h');
    ok(rc.resumen.subio.n + rc.resumen.bajo.n <= 12 && rc.resumen.subio.n > 0, 'grupos subió/bajó');
    const eu = r1.secciones.find((s) => s.moneda === 'EUR');
    ok(eu.pasados[0].publicado === 'sin fuente' && !eu.tieneFuente, 'Eurozona sin fuente de publicados');
    ok(us.grafSorpresas.startsWith('<svg'), 'gráfico de sorpresas');
    ok(!/riesgo alto|comprar|vender/i.test(r1.texto), 'sin veredictos');
    ok(!r1.texto.includes(CLAVE) && !JSON.stringify(r1).includes(CLAVE), 'la clave nunca aparece en el reporte');
    ok(f.llamadas.every((u) => !u.includes('faireconomy')) === false && f.llamadas.filter((u) => u.includes('faireconomy')).length === 1, 'calendario descargado una sola vez');
    const v = app.vistaCalendario({ rango: 'hoy', monedas: ['USD'], importancias: ['alta', 'media'] });
    ok(v.filas.some((x) => x.publicado === '3.0 %'), 'panel muestra publicado');
    fs.writeFileSync(path.join(os.tmpdir(), 'reporte_muestra.txt'), r1.texto); }
  // calendario falla con caché -> banner rojo y datos viejos
  { const t = { ahora: AHORA }; const f1 = crearFetch(); const { app, alm, dir } = nuevaApp(f1, true, t);
    await app.actualizarCalendario({ forzar: true });
    t.ahora += 3600e3;
    const app2 = new AppMacro({ fetchFn: crearFetch({ feed: '429' }), almacen: alm, ahora: () => t.ahora, zona: ZONA }); app2.iniciar();
    await app2.actualizarCalendario({ forzar: true });
    const b = app2.banners();
    ok(b.length === 1 && b[0].fuente.includes('Forex Factory') && /viejos/.test(b[0].mensaje) && /límite/.test(b[0].mensaje), 'banner calendario 429: ' + JSON.stringify(b));
    ok(app2.vistaCalendario({}).total === FEED.length, 'conserva datos viejos');
    const app3 = new AppMacro({ fetchFn: crearFetch({ feed: 'html' }), almacen: crearAlmacen(fs.mkdtempSync(path.join(os.tmpdir(), 'm-')), cif), ahora: () => t.ahora, zona: ZONA }); app3.iniciar();
    const rr = await app3.ejecutarOrden('reporte de la lista'); ok(rr.tipo === 'error' && rr.banners.length === 1, 'sin caché y sin feed -> error claro'); }
  // FRED (CSV) falla
  { const { app } = nuevaApp(crearFetch({ fredCsv: '500' })); const r2 = await app.ejecutarOrden('solo EE. UU.');
    ok(r2.banners.some((b) => b.fuente.startsWith('FRED')) && r2.texto.includes('[ERROR DE FUENTE] FRED') && !r2.texto.includes(CLAVE), 'banner FRED');
    ok(r2.secciones[0].pasados.some((x) => x.publicado === 'falló FRED'), 'filas marcan falló FRED'); }
  // sin clave: valores sí, reacción no
  { const { app } = nuevaApp(crearFetch(), false); const r3 = await app.ejecutarOrden('solo EE. UU.');
    ok(r3.banners.length === 0 && r3.secciones[0].pasados.some((x) => x.publicado === '3.0 %') && r3.secciones[0].reacciones.length === 0 && r3.avisos.some((a) => a.includes('clave gratuita de FRED')), 'sin clave: valores publicados sí, reacción no, aviso claro'); }
  // Binance falla
  { const { app } = nuevaApp(crearFetch({ binance: '500' })); const r4 = await app.ejecutarOrden('solo EE. UU.');
    ok(r4.banners.some((b) => b.fuente === 'Binance') && r4.secciones[0].reacciones.length === 0 && r4.secciones[0].pasados.some((x) => x.publicado === '3.0 %'), 'banner Binance, resto intacto'); }
  // sin fechas de publicación
  { const { app } = nuevaApp(crearFetch({ sinFechas: true })); const r5 = await app.ejecutarOrden('solo EE. UU.');
    ok(r5.avisos.some((a) => a.includes('sin reacción histórica')) && r5.secciones[0].reacciones.length === 0, 'sin fechas: aviso y sin reacción'); }
  // este mes: usa semanas guardadas
  { const { app } = nuevaApp(crearFetch());
    await app.actualizarCalendario({ forzar: true });
    app.agregarHistorial(C.normalizarFeed([{ title: 'CPI m/m', country: 'USD', date: '2026-10-14T08:30:00-04:00', impact: 'High', forecast: '0.3%', previous: '0.4%' }]));
    const r7 = await app.ejecutarOrden('reporte solo EE. UU. este mes');
    ok(r7.periodo === 'mes' && r7.modelo.bloques[0].filas[0].titulo === 'CPI m/m', 'mes: el bloque CPI trae el del día 14');
    const cpi = r7.secciones[0].pasados.find((x) => x.titulo === 'CPI m/m');
    ok(cpi && cpi.publicado === '0.2 %' && cpi.mejor === 'mejor' && cpi.lectura === 'laxo' && r7.modelo.bloques[0].estado === 'laxo', 'mes: CPI salió mejor (verde)');
    ok(r7.avisos.some((a) => a.startsWith('Este mes')), 'mes: aviso de semanas guardadas');
    const rs = await app.ejecutarOrden('reporte solo EE. UU.'); ok(!rs.secciones[0].pasados.some((x) => x.titulo === 'CPI m/m'), 'semana no incluye el CPI del 14'); }
  // solo Japón: el gráfico sigue siendo de EE. UU.
  { const { app } = nuevaApp(crearFetch()); const rj = await app.ejecutarOrden('reporte solo Japón');
    ok(rj.secciones.length === 1 && rj.secciones[0].moneda === 'JPY' && rj.modelo.bloques.length === 5 && rj.modelo.bloques[2].filas.length > 0, 'modelo siempre de EE. UU.'); }
  // mercado cada hora: vuelve a descargar y, si falla, conserva lo anterior
  { const t = { ahora: AHORA }; const f = crearFetch(); const { app } = nuevaApp(f, true, t);
    await app.ejecutarOrden('solo EE. UU.');
    const n1 = f.llamadas.filter((u) => u.includes('id=DGS10')).length;
    t.ahora += 3600e3; const m = await app.mercadoAhora();
    ok(f.llamadas.filter((u) => u.includes('id=DGS10')).length === n1 + 1 && m.tarjetas.length === 6 && m.ts === t.ahora, 'mercado: nueva descarga cada hora');
    ok(m.tarjetas.every((x) => x.pct && x.rango && x.svg.includes('<circle')), 'tarjetas con variación, rango y gráfico');
    const f2 = crearFetch({ fredCsv: '500' }); app.fetchFn = f2; t.ahora += 3600e3;
    const m2 = await app.mercadoAhora();
    ok(m2.tarjetas.every((x) => x.valor !== 'sin dato') && m2.ts < t.ahora && m2.banners.some((b) => /datos viejos/.test(b.mensaje)), 'mercado: si falla, conserva datos viejos y avisa'); }
  // modelo de 5 datos: pesos, energía, confirmación y valor manual de ISM
  { const { app, dir } = nuevaApp(crearFetch());
    ok(T.fechaLarga(Date.parse('2026-11-05T15:00:00Z'), ZONA) === 'Jueves, 5 de noviembre', 'fecha larga en español');
    const r8 = await app.ejecutarOrden('solo EE. UU.'); const m = r8.modelo;
    ok(m.bloques.map((b) => b.peso).join() === '25,20,20,15,10' && m.confirmacion.peso === 10, 'pesos 25/20/20/15/10 + 10');
    ok(m.bloques[2].estado === 'mixto' && m.bloques[0].estado === 'sin datos', 'PCE en línea = mixto; CPI sin datos esta semana');
    const ism = m.bloques[3].filas[0]; ok(ism.titulo === 'ISM Services PMI' && ism.estado === 'manual-pendiente' && ism.publicado === 'falta tu valor', 'ISM pide tu valor');
    ok(m.bloques[4].items.length === 2 && m.bloques[4].items.every((i) => i.lectura === 'restrictivo') && m.confirmacion.items.length === 3, 'energía y confirmación leídas');
    ok(m.total.estado === 'restrictivo' && m.total.cobertura === 40, 'conjunto con cobertura 40 %: ' + JSON.stringify(m.total));
    app.guardarValorManual(ism.id, '53,2');
    const r9 = await app.ejecutarOrden('solo EE. UU.'); const i2 = r9.modelo.bloques[3].filas[0];
    ok(i2.publicado === '53.2' && i2.lectura === 'restrictivo' && i2.direccion.startsWith('más restrictivo') && r9.modelo.total.cobertura === 55, 'ISM con tu valor: ' + JSON.stringify([i2.publicado, i2.lectura, r9.modelo.total]));
    let e9 = null; try { app.guardarValorManual(ism.id, 'abc'); } catch (e) { e9 = e; } ok(!!e9, 'valor manual inválido');
    ok(/MODELO DE 5 DATOS/.test(r9.texto) && /Inclinación del conjunto: restrictivo/.test(r9.texto) && !/comprar|vender|riesgo alto/i.test(r9.texto), 'texto del modelo sin veredictos');
    const app2 = new AppMacro({ fetchFn: crearFetch(), almacen: crearAlmacen(dir, cif), ahora: () => AHORA, zona: ZONA }); app2.iniciar();
    const r10 = await app2.ejecutarOrden('solo EE. UU.'); ok(r10.modelo.bloques[3].filas[0].publicado === '53.2', 'el valor manual se conserva al reabrir'); }
  // calendario por orden
  { const { app } = nuevaApp(crearFetch()); const r6 = await app.ejecutarOrden('calendario de hoy alta'); ok(r6.tipo === 'calendario' && r6.filtros.rango === 'hoy', 'orden calendario'); }
  console.log(`\nPruebas: ${pasan} pasan, ${fallan} fallan`);
  process.exit(fallan ? 1 : 0);
})();

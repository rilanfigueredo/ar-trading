'use strict';
const { PAISES, TEMAS, buscarSerie, claveSerie } = require('./config');
const { formatear, redondear } = require('./valores');
const { horaLocal, claveDia, fechaHoraLocal, fechaLarga } = require('./tiempo');
const { graficoSorpresas, graficoReaccion, graficoTop5 } = require('./charts');

const ETIQUETA = {
  'sin-publicar': 'aún no aparece en FRED', 'a-verificar': 'a verificar', 'sin-clave': 'falta clave de FRED',
  error: 'falló FRED', 'manual-pendiente': 'falta tu valor', 'sin-dato': 'sin dato', 'sin-fuente': 'sin fuente', pendiente: 'pendiente',
};
const signo = (n, d) => (n > 0 ? '+' : '') + n.toFixed(d);
const pct = (f) => (f == null ? 's/d' : signo(f * 100, 2) + ' %');

function filaDe(ev, cfg, pub, ahora, zona) {
  const fila = {
    id: ev.id, dia: claveDia(ev.ms, zona), hora: horaLocal(ev.ms, zona), moneda: ev.moneda, titulo: ev.titulo,
    impacto: ev.impacto, previo: ev.previo || '—', esperado: ev.esperado || '—',
    publicado: '—', sorpresa: '', direccion: '', estado: 'pendiente', nota: '', nums: null, textos: null,
    serie: cfg ? claveSerie(cfg) : null, mejor: null, lectura: null, ms: ev.ms, fechaLarga: fechaLarga(ev.ms, zona), id: ev.id,
  };
  if (ev.ms > ahora) return fila;
  if (!cfg) { fila.estado = 'sin-fuente'; fila.publicado = ETIQUETA['sin-fuente']; return fila; }
  if (!pub) { fila.estado = 'sin-dato'; fila.publicado = ETIQUETA['sin-dato']; return fila; }
  fila.estado = pub.estado;
  if (pub.aviso) fila.nota = pub.aviso;
  if (pub.estado !== 'publicado') { fila.publicado = ETIQUETA[pub.estado] || pub.estado; return fila; }
  const decs = [ev.esperadoNum, ev.previoNum].filter(Boolean).map((x) => x.decimales);
  const dec = decs.length ? Math.max(...decs) : 1;
  const val = redondear(pub.valor, dec);
  fila.publicado = formatear(val, cfg.unidad, dec);
  const e = ev.esperadoNum && !ev.esperadoNum.op ? ev.esperadoNum.num : null;
  const p = ev.previoNum && !ev.previoNum.op ? ev.previoNum.num : null;
  fila.nums = { previo: p, esperado: e, publicado: val };
  const t = (v) => (v == null ? '—' : formatear(v, cfg.unidad, dec));
  const todos = [p, e, val].filter((x) => x != null);
  fila.textos = { previo: t(p), esperado: t(e), publicado: t(val), min: t(Math.min(...todos)), max: t(Math.max(...todos)) };
  if (e != null) {
    const dif = redondear(val - e, dec);
    fila.sorpresa = dif === 0 ? '0' : signo(dif, dec) + (cfg.unidad === '%' ? ' pp' : cfg.unidad);
    if (dif === 0) { fila.direccion = 'en línea con lo esperado'; fila.mejor = 'igual'; fila.lectura = 'neutro'; }
    else {
      const restrictivo = (dif > 0) === !!cfg.restrictivoSiSube;
      fila.direccion = restrictivo ? 'más restrictivo que lo esperado' : 'más laxo que lo esperado';
      fila.lectura = restrictivo ? 'restrictivo' : 'laxo';
      if (cfg.mejorSiSube === true || cfg.mejorSiSube === false) fila.mejor = (dif > 0) === cfg.mejorSiSube ? 'mejor' : 'peor';
    }
  }
  return fila;
}
function textoResumenReaccion(r) {
  const fila = (g) => `+1 h ${pct(g.r1h.mediana)}, +4 h ${pct(g.r4h.mediana)}, +24 h ${pct(g.r24h.mediana)}`;
  let t = `- ${r.titulo}: ${r.resumen.todos.n} publicaciones. Mediana de BTC: ${fila(r.resumen.todos)}.`;
  if (r.resumen.todos.n < 5) t += ' (muestra pequeña)';
  t += `\n    Si el dato subió frente al anterior (n=${r.resumen.subio.n}): ${fila(r.resumen.subio)}.`;
  t += `\n    Si el dato bajó (n=${r.resumen.bajo.n}): ${fila(r.resumen.bajo)}.`;
  return t;
}
// Datos de ALTA importancia de EE. UU. ya ocurridos: los 5 más recientes con esperado y publicado.
function topEEUU(eventosUS, series, publicados, ahora, zona) {
  const filas = eventosUS.filter((e) => e.moneda === 'USD' && e.impacto === 'alta' && e.ms <= ahora)
    .map((e) => filaDe(e, buscarSerie(series, e), publicados.get(e.id), ahora, zona));
  const buenas = filas.filter((f) => f.estado === 'publicado' && f.nums && f.nums.esperado != null).sort((a, b) => b.ms - a.ms);
  const top = buenas.slice(0, 5);
  const sinValor = filas.filter((f) => !buenas.includes(f)).map((f) => ({
    titulo: f.titulo, dia: f.dia, hora: f.hora,
    motivo: f.estado === 'sin-fuente' ? 'sin fuente gratuita de valores publicados' : (f.estado === 'publicado' ? 'sin valor esperado' : f.publicado),
  }));
  return { filas: top, sinValor };
}
const NUM = { restrictivo: 1, laxo: -1, neutro: 0 };
const etqPuntaje = (p) => (p == null ? 'sin datos' : (p > 0.25 ? 'restrictivo' : (p < -0.25 ? 'laxo' : 'mixto')));
// Modelo de 5 datos: lectura = publicado contra esperado (eventos) o cambio a 4 semanas (energía y mercado).
function armarModelo({ modelo, eventosUS, series, publicados, cambios, ahora, zona }) {
  const filaTitulo = (t) => {
    const evs = eventosUS.filter((e) => e.moneda === 'USD' && e.titulo === t);
    const pas = evs.filter((e) => e.ms <= ahora), fut = evs.filter((e) => e.ms > ahora);
    const e = pas.length ? pas[pas.length - 1] : fut[0];
    return e ? filaDe(e, buscarSerie(series, e), publicados.get(e.id), ahora, zona) : null;
  };
  const armar = (b) => {
    const filas = (b.titulos || []).map(filaTitulo).filter(Boolean);
    const items = (b.series || []).map((x) => cambios.find((c) => c.id === x.id)).filter(Boolean);
    const lect = [...filas.map((f) => f.lectura), ...items.map((i) => i.lectura)].filter(Boolean);
    const puntaje = lect.length ? lect.reduce((a, l) => a + NUM[l], 0) / lect.length : null;
    return { id: b.id, nombre: b.nombre, detalle: b.detalle || '', peso: b.peso, filas, items, puntaje, estado: etqPuntaje(puntaje) };
  };
  const bloques = modelo.bloques.map(armar);
  const conf = armar(modelo.confirmacion);
  const todos = [...bloques, conf];
  const pesoTot = todos.reduce((a, b) => a + b.peso, 0), disp = todos.filter((b) => b.puntaje != null);
  const pesoDisp = disp.reduce((a, b) => a + b.peso, 0);
  const total = pesoDisp ? disp.reduce((a, b) => a + b.peso * b.puntaje, 0) / pesoDisp : null;
  const conValor = bloques.flatMap((b) => b.filas).filter((f) => f.nums && f.nums.esperado != null);
  return { bloques, confirmacion: conf, total: { puntaje: total, estado: etqPuntaje(total), cobertura: pesoTot ? Math.round(pesoDisp / pesoTot * 100) : 0 }, svg: graficoTop5(conValor, 'lectura') };
}
function tarjetasPorTema(secciones, eventos, ahora, zona, series, publicados) {
  const out = [];
  for (const t of TEMAS) {
    const filas = [];
    for (const s of secciones) {
      const evs = eventos.filter((e) => e.moneda === s.moneda && (e.impacto === 'alta' || e.impacto === 'media') && t.re.test(e.titulo));
      if (!evs.length) continue;
      const pas = evs.filter((e) => e.ms <= ahora), fut = evs.filter((e) => e.ms > ahora);
      const e = pas.length ? pas[pas.length - 1] : fut[0];
      filas.push(filaDe(e, buscarSerie(series, e), publicados.get(e.id), ahora, zona));
    }
    if (filas.length) out.push({ id: t.id, nombre: t.nombre, filas });
  }
  return out;
}
function armarReporte({ monedas, eventos, series, publicados, reacciones, ahora, zona, avisos = [], periodo = 'semana', mercado = [], mercadoTs = null, eventosUS = null, modelo = null, cambios = [] }) {
  const secciones = [];
  for (const m of monedas) {
    const nombre = (PAISES[m] && PAISES[m].nombre) || m;
    const tieneFuente = series.some((s) => s.pais === m);
    const evs = eventos.filter((e) => e.moneda === m && e.impacto !== 'feriado');
    const cfgDe = (e) => buscarSerie(series, e);
    const pasados = evs.filter((e) => e.ms <= ahora && (e.impacto === 'alta' || e.impacto === 'media' || cfgDe(e)))
      .slice(-30).map((e) => filaDe(e, cfgDe(e), publicados.get(e.id), ahora, zona));
    const pendientes = evs.filter((e) => e.ms > ahora && (e.impacto === 'alta' || e.impacto === 'media'))
      .map((e) => Object.assign(filaDe(e, cfgDe(e), null, ahora, zona), { impactoTxt: e.impacto }));
    const claves = [...new Set(pasados.filter((f) => f.estado === 'publicado' && f.serie).map((f) => f.serie))];
    const reac = claves.map((c) => reacciones.get(c)).filter(Boolean).map((r) => Object.assign({}, r, { svg: graficoReaccion(r.resumen) }));
    secciones.push({ moneda: m, nombre, tieneFuente, pasados, pendientes, reacciones: reac, grafSorpresas: graficoSorpresas(pasados) });
  }
  const mod = modelo ? armarModelo({ modelo, eventosUS: eventosUS || eventos, series, publicados, cambios, ahora, zona }) : null;
  const temas = tarjetasPorTema(secciones, eventos, ahora, zona, series, publicados);
  const L = [];
  L.push(`REPORTE DE NOTICIAS MACRO (${periodo === 'mes' ? 'este mes' : 'esta semana'}) — generado ${fechaHoraLocal(ahora, zona)} (${zona})`);
  L.push(`Lista: ${monedas.map((m) => `${(PAISES[m] || {}).nombre || m} (${m})`).join(', ')}`);
  L.push('Fuentes: calendario Forex Factory (no oficial) · valores publicados de EE. UU. y mercado: FRED (CSV público) · BTC: velas de Binance (BTCUSDT)');
  const mer = mercado.filter((t) => t.valor !== 'sin dato');
  if (mer.length) { L.push('', 'MERCADO Y MACRO GLOBAL (último dato diario de FRED):'); mer.forEach((t) => L.push(`- ${t.nombre}: ${t.valor} (${t.cambio || 's/d'} vs dato anterior, ${t.fecha})`)); }
  if (mod) {
    const fmt = (b) => {
      L.push(`${b.nombre} (${b.peso} % del modelo): ${b.estado}`);
      b.filas.forEach((f) => L.push(`  - ${f.titulo} (${f.dia.slice(5)}): esperado ${f.esperado} → ${f.estado === 'publicado' ? 'salió ' + f.publicado : f.publicado}${f.direccion ? '; ' + f.direccion : ''}`));
      b.items.forEach((i) => L.push(`  - ${i.nombre}: ${i.valor}${i.cambio ? ', ' + i.cambio : ''}${i.lectura ? ' (' + i.lectura + ')' : ''}`));
    };
    L.push('', 'MODELO DE 5 DATOS DE EE. UU. (lectura = publicado contra esperado, o cambio a 4 semanas; pesos editables, a verificar):');
    L.push(`Inclinación del conjunto: ${mod.total.estado}${mod.total.puntaje == null ? '' : ' (' + signo(mod.total.puntaje, 2) + ')'}; cobertura ${mod.total.cobertura} % del peso. Describe los datos; no es una señal.`);
    mod.bloques.forEach(fmt); fmt(mod.confirmacion);
  }
  if (temas.length) {
    L.push('', 'POR TEMA (dato más reciente o próximo por país):');
    temas.forEach((t) => { L.push(`${t.nombre}:`); t.filas.forEach((f) => L.push(`  - ${f.moneda} ${f.titulo}: previo ${f.previo}, esperado ${f.esperado}, publicado ${f.publicado}${f.direccion ? '; ' + f.direccion : ''}`)); });
  }
  for (const s of secciones) {
    L.push('', `== ${s.nombre} (${s.moneda}) ==`);
    if (!s.tieneFuente) L.push('Valores publicados: sin fuente gratuita verificada; solo calendario (previo y esperado).');
    if (s.pasados.length) {
      L.push('Ya ocurridos esta semana:', '| Hora | Evento | Imp. | Previo | Esperado | Publicado | Sorpresa | Dirección |', '|---|---|---|---|---|---|---|---|');
      for (const f of s.pasados) L.push(`| ${f.dia.slice(5)} ${f.hora} | ${f.titulo} | ${f.impacto} | ${f.previo} | ${f.esperado} | ${f.publicado} | ${f.sorpresa || '—'} | ${f.direccion || '—'} |`);
      for (const f of s.pasados) if (f.nota) L.push(`Nota (${f.titulo}): ${f.nota}`);
    } else L.push('Sin eventos de importancia alta/media ya ocurridos esta semana.');
    if (s.reacciones.length) {
      L.push('', 'Reacción histórica de BTC tras publicaciones pasadas del mismo dato (precio de apertura de la vela de la publicación; mediana):');
      for (const r of s.reacciones) L.push(textoResumenReaccion(r));
    }
    if (s.pendientes.length) {
      L.push('', 'Pendientes esta semana (alta/media):', '| Hora | Evento | Imp. | Previo | Esperado |', '|---|---|---|---|---|');
      for (const f of s.pendientes) L.push(`| ${f.dia.slice(5)} ${f.hora} | ${f.titulo} | ${f.impacto} | ${f.previo} | ${f.esperado} |`);
    }
  }
  if (avisos.length) L.push('', 'Avisos:', ...avisos.map((a) => '- ' + a));
  L.push('', 'Notas: "más restrictivo/laxo" y "mejor/peor para la economía" siguen reglas editables en series_fred.json (a verificar por dato).',
    'La reacción histórica usa pocas publicaciones y no predice la siguiente. Este reporte describe datos; no es una señal de compra ni de venta.');
  return { generado: ahora, zona, monedas, periodo, secciones, avisos, mercado, mercadoTs, modelo: mod, temas, texto: L.join('\n') };
}
module.exports = { armarReporte, filaDe };

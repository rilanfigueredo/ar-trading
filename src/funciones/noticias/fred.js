'use strict';
const { pedir } = require('./http');
const { ZONA_ET, claveDia, zonaAUtc, mesesEntre } = require('./tiempo');
const CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv';   // público, sin clave (a verificar)
const API = 'https://api.stlouisfed.org/fred/series/observations'; // solo para fechas de publicación (clave gratuita)
const DIA = 864e5;
const NOMBRE = 'FRED (CSV público)';

function parsearCSV(texto) {
  const out = [];
  String(texto).split(/\r?\n/).slice(1).forEach((l) => {
    const c = l.split(',');
    const v = parseFloat(c[1]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(c[0] || '') && Number.isFinite(v)) out.push({ fecha: c[0], valor: v });
  });
  return out; // ascendente
}
async function leerObservaciones(id, desde, fetchFn) {
  const t = await pedir(fetchFn, `${CSV}?id=${encodeURIComponent(id)}&cosd=${desde}`, NOMBRE, {}, 'texto');
  const o = parsearCSV(t);
  if (!o.length) throw new Error(`${NOMBRE}: no trajo datos de ${id} (puede haber cambiado el formato)`);
  return o;
}
// obs: lista ascendente [{fecha, valor}]
function transformar(obs, tipo, divisor = 1) {
  const o = obs.filter((x) => Number.isFinite(x.valor));
  const res = [];
  for (let i = 0; i < o.length; i++) {
    let v = null;
    if (tipo === 'nivel') v = o[i].valor / divisor;
    else if (tipo === 'dif' && i >= 1) v = (o[i].valor - o[i - 1].valor) / divisor;
    else if (tipo === 'mom' && i >= 1) v = (o[i].valor / o[i - 1].valor - 1) * 100;
    else if (tipo === 'yoy' && i >= 12 && mesesEntre(o[i - 12].fecha, o[i].fecha) === 12) v = (o[i].valor / o[i - 12].valor - 1) * 100;
    if (v !== null) res.push({ fecha: o[i].fecha, valor: v });
  }
  return res;
}
function desdeDias(ahora, dias) { return new Date(ahora - dias * DIA).toISOString().slice(0, 10); }
async function leerSerie(cfg, ahora, fetchFn) {
  return transformar(await leerObservaciones(cfg.fred, desdeDias(ahora, 800), fetchFn), cfg.tipo, cfg.divisor || 1);
}
const pad = (n) => String(n).padStart(2, '0');
const suma = (dia, n) => new Date(Date.parse(dia + 'T00:00:00Z') + n * DIA).toISOString().slice(0, 10);
// Qué observación corresponde a este evento (según la regla del periodo). -1 si no está aún.
function indiceDe(cfg, ev, serieT) {
  const dia = claveDia(ev.ms, ZONA_ET);
  const [y, m] = dia.split('-').map(Number);
  const per = cfg.periodo || 'mensual';
  let objetivo;
  if (per === 'mensual') { objetivo = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`; return { i: serieT.findIndex((x) => x.fecha === objetivo), objetivo }; }
  if (per === 'trimestral') { let qm = Math.floor((m - 1) / 3) * 3 + 1 - 3, yy = y; if (qm < 1) { qm += 12; yy--; } objetivo = `${yy}-${pad(qm)}-01`; return { i: serieT.findIndex((x) => x.fecha === objetivo), objetivo }; }
  if (per === 'semanal') { const a = suma(dia, -8), b = suma(dia, -4); let k = -1; serieT.forEach((x, j) => { if (x.fecha >= a && x.fecha <= b) k = j; }); return { i: k, objetivo: b }; }
  objetivo = suma(dia, 1); // decision: primer dato desde el día siguiente
  return { i: serieT.findIndex((x) => x.fecha >= objetivo), objetivo };
}
function evaluar(cfg, ev, serieT) {
  const { i, objetivo } = indiceDe(cfg, ev, serieT);
  if (i < 0) {
    const ult = serieT[serieT.length - 1];
    return { estado: ult && ult.fecha < objetivo ? 'sin-publicar' : 'a-verificar' };
  }
  const tol = cfg.tol == null ? 0.06 : cfg.tol;
  const pen = serieT[i - 1];
  const p = ev.previoNum;
  if (p && !p.op && pen && Math.abs(pen.valor - p.num) > tol) {
    return { estado: 'a-verificar', aviso: `El dato anterior según FRED (${pen.valor.toFixed(2)}) no coincide con el previo del calendario (${p.original}); puede ser una revisión.` };
  }
  return { estado: 'publicado', valor: serieT[i].valor, fechaObs: serieT[i].fecha };
}
// Fechas de la primera publicación (necesita clave gratuita). A verificar con la API real (output_type=4).
async function fechasPublicacion(cfg, clave, fetchFn) {
  const p = new URLSearchParams({ series_id: cfg.fred, api_key: clave, file_type: 'json', output_type: '4', realtime_start: '2000-01-01', realtime_end: '9999-12-31', sort_order: 'desc', limit: '80' });
  const j = await pedir(fetchFn, API + '?' + p.toString(), 'FRED (API con clave)');
  if (!j || !Array.isArray(j.observations)) throw new Error('FRED (API con clave): respuesta inesperada');
  const m = {};
  for (const x of j.observations) if (x.date && x.realtime_start) m[x.date] = x.realtime_start;
  return m;
}
// Publicaciones pasadas para medir la reacción de BTC. grupo: subió/bajó/igual frente al dato anterior.
function muestras(cfg, serieT, fechas, n) {
  const out = [];
  if (!fechas) return out;
  const tol = cfg.tol == null ? 0.06 : cfg.tol;
  for (let i = serieT.length - 1; i >= 1 && out.length < n; i--) {
    const fp = fechas[serieT[i].fecha];
    if (!fp) continue;
    const cambio = serieT[i].valor - serieT[i - 1].valor;
    out.push({
      fechaObs: serieT[i].fecha, fechaPub: fp, valor: serieT[i].valor, previo: serieT[i - 1].valor,
      t0: zonaAUtc(fp, cfg.horaET, ZONA_ET),
      grupo: Math.abs(cambio) < tol / 2 ? 'igual' : (cambio > 0 ? 'subio' : 'bajo'),
    });
  }
  return out;
}
module.exports = { parsearCSV, leerObservaciones, transformar, leerSerie, indiceDe, evaluar, fechasPublicacion, muestras, NOMBRE, desdeDias };

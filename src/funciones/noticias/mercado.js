'use strict';
const { MERCADO } = require('./config');
const { leerObservaciones, desdeDias } = require('./fred');
const { formatear } = require('./valores');
const { graficoLinea } = require('./charts');
// Tarjetas de mercado y macro global (series diarias públicas de FRED, sin clave).
async function leerMercado(fetchFn, ahora) {
  const tarjetas = []; let error = null;
  for (const m of MERCADO) {
    try {
      const o = await leerObservaciones(m.id, desdeDias(ahora, 120), fetchFn);
      const ult = o[o.length - 1], ant = o[o.length - 2];
      const cambio = ant ? ult.valor - ant.valor : null;
      tarjetas.push({
        id: m.id, nombre: m.nombre, valor: formatear(ult.valor, m.unidad, m.dec), fecha: ult.fecha,
        cambio: cambio == null ? '' : (cambio > 0 ? '+' : '') + cambio.toFixed(m.dec), sube: cambio == null ? null : cambio > 0,
        pct: cambio == null || !ant.valor ? '' : (cambio > 0 ? '+' : '') + (cambio / Math.abs(ant.valor) * 100).toFixed(2) + ' %',
        rango: `${formatear(Math.min(...o.slice(-40).map((x) => x.valor)), m.unidad, m.dec)} – ${formatear(Math.max(...o.slice(-40).map((x) => x.valor)), m.unidad, m.dec)}`,
        svg: graficoLinea(o.slice(-40).map((x) => x.valor)),
      });
    } catch (e) { error = error || e.message; tarjetas.push({ id: m.id, nombre: m.nombre, valor: 'sin dato', fecha: '', cambio: '', sube: null, svg: '' }); }
  }
  return { tarjetas, error };
}
// Series del modelo (energía y confirmación): valor actual y cambio frente a hace 4 semanas.
async function leerCambios(items, fetchFn, ahora) {
  const out = []; let error = null;
  for (const it of items) {
    try {
      const o = await leerObservaciones(it.id, desdeDias(ahora, 100), fetchFn);
      const ult = o[o.length - 1];
      const corte = new Date(Date.parse(ult.fecha + 'T00:00:00Z') - 28 * 864e5).toISOString().slice(0, 10);
      let ant = o[0]; for (const x of o) if (x.fecha <= corte) ant = x;
      const dif = ult.valor - ant.valor;
      const cambio = it.tipo === 'pp' ? dif : (ant.valor ? dif / Math.abs(ant.valor) * 100 : 0);
      out.push({
        id: it.id, nombre: it.nombre, valor: formatear(ult.valor, it.unidad, it.dec), fecha: ult.fecha,
        cambio: (cambio > 0 ? '+' : '') + cambio.toFixed(it.tipo === 'pp' ? 2 : 1) + (it.tipo === 'pp' ? ' pp' : ' %') + ' en 4 semanas',
        lectura: cambio > it.umbral ? 'restrictivo' : (cambio < -it.umbral ? 'laxo' : 'neutro'),
      });
    } catch (e) { error = error || e.message; out.push({ id: it.id, nombre: it.nombre, valor: 'sin dato', fecha: '', cambio: '', lectura: null }); }
  }
  return { items: out, error };
}
module.exports = { leerMercado, leerCambios };

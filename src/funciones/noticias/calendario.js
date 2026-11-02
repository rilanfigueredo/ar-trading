'use strict';
const { parsear } = require('./valores');
const { claveDia, zonaLocal } = require('./tiempo');
const IMPACTO = { high: 'alta', medium: 'media', low: 'baja', holiday: 'feriado' };

function normalizarFeed(json) {
  if (!Array.isArray(json)) throw new Error('Calendario (Forex Factory): formato inesperado');
  const out = [];
  for (const it of json) {
    if (!it || typeof it !== 'object' || !it.title || !it.country) continue;
    const ms = Date.parse(it.date);
    if (Number.isNaN(ms)) continue;
    const previo = it.previous == null ? '' : String(it.previous);
    const esperado = it.forecast == null ? '' : String(it.forecast);
    out.push({
      id: `${String(it.country).toUpperCase()}|${it.title}|${ms}`,
      titulo: String(it.title),
      moneda: String(it.country).toUpperCase(),
      ms,
      impacto: IMPACTO[String(it.impact || '').toLowerCase()] || 'baja',
      previo, esperado,
      previoNum: parsear(previo),
      esperadoNum: parsear(esperado),
    });
  }
  if (!out.length) throw new Error('Calendario (Forex Factory): no trajo eventos válidos');
  return out.sort((a, b) => a.ms - b.ms || a.titulo.localeCompare(b.titulo));
}
function filtrar(eventos, { rango = 'semana', monedas = null, importancias = null, ahora = Date.now(), zona = zonaLocal() } = {}) {
  const hoy = claveDia(ahora, zona);
  return eventos.filter((e) => {
    if (monedas && !monedas.includes(e.moneda)) return false;
    const imp = e.impacto === 'feriado' ? 'baja' : e.impacto;
    if (importancias && !importancias.includes(imp)) return false;
    if (rango === 'hoy' && claveDia(e.ms, zona) !== hoy) return false;
    return true;
  });
}
module.exports = { normalizarFeed, filtrar };

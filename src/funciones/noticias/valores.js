'use strict';
// Lee textos como "3.2%", "198K", "-130.4B", "<1.25%". Devuelve null si no es un número simple.
function decimalesDe(s) {
  const p = String(s).replace(',', '.').split('.');
  return p[1] ? p[1].length : 0;
}
function parsear(texto) {
  const t = String(texto == null ? '' : texto).trim();
  if (!t || t.includes('|')) return null;
  const m = t.match(/^([<>]=?)?\s*(-?\d+(?:[.,]\d+)?)\s*([%KMBT]?)$/i);
  if (!m) return null;
  return {
    op: m[1] || '',
    num: parseFloat(m[2].replace(',', '.')),
    unidad: (m[3] || '').toUpperCase(),
    decimales: decimalesDe(m[2]),
    original: t,
  };
}
function formatear(num, unidad, dec) {
  if (num == null || Number.isNaN(num)) return '—';
  const n = Number(num).toFixed(dec);
  return unidad === '%' ? n + ' %' : n + (unidad || '');
}
function redondear(num, dec) {
  const f = Math.pow(10, dec);
  return Math.round(num * f + (num >= 0 ? 1e-9 : -1e-9)) / f;
}
module.exports = { parsear, formatear, redondear, decimalesDe };

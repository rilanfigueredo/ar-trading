'use strict';
const { PAISES } = require('./config');
function norm(t) {
  return ' ' + String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ]+/g, ' ').trim() + ' ';
}
const AYUDA = [
  'Escribe una orden o elige una de los botones. Ejemplos:',
  '• reporte de la lista de seguimiento',
  '• solo EE. UU.   /   reporte de Japón y Eurozona',
  '• calendario de hoy   /   calendario de la semana, alta importancia',
  '• reporte de la lista de seguimiento, este mes',
  'La app trabaja solo cuando envías una orden y luego queda inactiva.',
].join('\n');

function interpretar(texto, { lista = [] } = {}) {
  const t = norm(texto);
  if (t.trim() === '') return { accion: 'ayuda', mensaje: AYUDA };
  const monedas = [];
  for (const [cod, p] of Object.entries(PAISES)) {
    if (p.alias.some((a) => t.includes(' ' + a + ' ')) || t.includes(' ' + cod.toLowerCase() + ' ')) monedas.push(cod);
  }
  const usaLista = /\b(lista|seguimiento)\b/.test(t);
  const importancias = [];
  if (/\b(alta|altas|importante|importantes)\b/.test(t)) importancias.push('alta');
  if (/\b(media|medias)\b/.test(t)) importancias.push('media');
  if (/\b(baja|bajas)\b/.test(t)) importancias.push('baja');
  const rango = /\bhoy\b/.test(t) ? 'hoy' : 'semana';
  const periodo = /\b(mes|mensual)\b/.test(t) ? 'mes' : 'semana';
  const quiereAyuda = /\b(ayuda|comandos|que puedes)\b/.test(t);
  const quiereReporte = /\b(reporte|informe|resumen|sorpresa|publicados?|ultimos)\b/.test(t);
  const quiereCal = /\b(calendario|noticias|agenda|eventos|proximos|hoy|semana)\b/.test(t);
  if (quiereAyuda) return { accion: 'ayuda', mensaje: AYUDA };
  let sel = monedas.length ? monedas : (usaLista ? lista.slice() : []);
  if (!quiereReporte && !quiereCal && !sel.length) {
    return { accion: 'ayuda', mensaje: 'No entendí la orden.\n' + AYUDA };
  }
  const accion = quiereReporte ? 'reporte' : (quiereCal ? 'calendario' : 'reporte');
  if (!sel.length) sel = lista.slice();
  return { accion, monedas: sel, importancias: importancias.length ? importancias : ['alta', 'media', 'baja'], rango, periodo };
}
module.exports = { interpretar, AYUDA };

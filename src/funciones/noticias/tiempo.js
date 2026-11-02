'use strict';
const ZONA_ET = 'America/New_York';
function zonaLocal() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
}
function claveDia(ms, zona) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function horaLocal(ms, zona) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}
function fechaLarga(ms, zona) { // "Jueves, 5 de noviembre"
  const t = new Intl.DateTimeFormat('es', { timeZone: zona, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms));
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function fechaHoraLocal(ms, zona) {
  return claveDia(ms, zona) + ' ' + horaLocal(ms, zona);
}
function reloj(ms, zona) {
  const o = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms))) o[p.type] = p.value;
  return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
}
// "2026-10-29" + "08:30" en la zona dada -> milisegundos UTC (maneja horario de verano)
function zonaAUtc(fecha, hora, zona) {
  const [y, m, d] = fecha.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  const pared = Date.UTC(y, m - 1, d, h, mi);
  let ms = pared;
  for (let i = 0; i < 3; i++) ms -= reloj(ms, zona) - pared;
  return ms;
}
function mesesEntre(f1, f2) {
  const [y1, m1] = f1.split('-').map(Number);
  const [y2, m2] = f2.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}
module.exports = { ZONA_ET, zonaLocal, claveDia, horaLocal, fechaLarga, fechaHoraLocal, zonaAUtc, mesesEntre };

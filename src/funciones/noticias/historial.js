'use strict';
// Guarda los eventos de cada descarga del calendario para poder armar "este mes".
const { claveDia } = require('./tiempo');
const DIAS = 70;
function mezclar(guardados, nuevos, ahora) {
  const mapa = new Map();
  for (const e of guardados || []) mapa.set(e.id, e);
  for (const e of nuevos) mapa.set(e.id, e);
  const corte = ahora - DIAS * 864e5;
  return [...mapa.values()].filter((e) => e.ms >= corte).sort((a, b) => a.ms - b.ms);
}
function delMes(eventos, ahora, zona) {
  const mes = claveDia(ahora, zona).slice(0, 7);
  return eventos.filter((e) => claveDia(e.ms, zona).slice(0, 7) === mes);
}
module.exports = { mezclar, delMes };

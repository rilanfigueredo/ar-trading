'use strict';
// Decide qué avisos corresponden al pasar de un estado a otro. No muestra nada: solo devuelve la lista.
// prev / curr = { height, epochIndex, blocksRemaining }. Sin estado previo (primer arranque) no hay avisos.

function nf(n) { return Number(n).toLocaleString('es'); }

function decide(prev, curr, settings, extra) {
  const out = [];
  if (!prev || !curr || curr.height <= prev.height) return out;
  const x = extra || {};

  if (settings.notifyNewBlock) {
    const body = curr.height - prev.height === 1
      ? 'Bloque ' + nf(curr.height)
      : 'Bloques ' + nf(prev.height + 1) + ' a ' + nf(curr.height);
    out.push({ id: 'block', title: 'Nuevo bloque de Bitcoin', body });
  }

  if (settings.notifyRetarget && curr.epochIndex > prev.epochIndex) {
    const ch = typeof x.lastChange === 'number' ? ' Cambio aplicado: ' + (x.lastChange >= 0 ? '+' : '') + x.lastChange.toFixed(2) + ' %.' : '';
    out.push({ id: 'retarget', title: 'Nuevo período de dificultad', body: 'Empezó el período en el bloque ' + nf(curr.epochIndex * 2016) + '.' + ch });
  }

  if (settings.notifyNear && prev.blocksRemaining > settings.nearBlocks && curr.blocksRemaining <= settings.nearBlocks && curr.epochIndex === prev.epochIndex) {
    out.push({ id: 'near', title: 'Se acerca el ajuste de dificultad', body: 'Faltan ' + nf(curr.blocksRemaining) + ' bloques.' });
  }
  return out;
}

module.exports = { decide };

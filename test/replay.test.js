// v0.26.24: Replay conserva el punto exacto al cambiar de temporalidad (funciones puras de lib.js)
const assert = require('assert');
const L = require('../renderer/js/lib.js');
const eq = assert.strictEqual;
const mk = (time, o, h, l, c, v = 1) => ({ time, open: o, high: h, low: l, close: c, volume: v });

// lastBefore
{
  const bars = [0, 100, 200, 300].map((t) => mk(t, 1, 1, 1, 1));
  eq(L.lastBefore(bars, 0), -1);
  eq(L.lastBefore(bars, 1), 0);
  eq(L.lastBefore(bars, 100), 0);
  eq(L.lastBefore(bars, 250), 2);
  eq(L.lastBefore(bars, 9999), 3);
  eq(L.lastBefore([], 5), -1);
}
// vela a medias: un día armado con velas de 15 min, corte a las 06:00 (24 velas de 15 min ya terminadas)
{
  const day0 = Date.UTC(2024, 0, 10) / 1000;
  const fine = [];
  for (let i = 0; i < 96; i++) fine.push(mk(day0 + i * 900, 100 + i, 101 + i, 99 + i, 100.5 + i, 2));
  const dayBar = mk(day0, 100, 196, 99, 195.5, 192); // vela diaria completa
  const cut = day0 + 6 * 3600;
  const p = L.partialBar(dayBar, { candles: fine, sec: 900 }, cut);
  eq(p.time, day0); eq(p.open, 100); eq(p.high, 101 + 23); eq(p.low, 99); eq(p.close, 100.5 + 23); eq(p.volume, 48);
  // corte a mitad de una vela fina: esa vela aún no terminó y no entra
  const p2 = L.partialBar(dayBar, { candles: fine, sec: 900 }, cut + 450);
  eq(p2.volume, 48);
  // corte exacto al inicio del día: no hay nada que mostrar
  eq(L.partialBar(dayBar, { candles: fine, sec: 900 }, day0), null);
  // un día más tarde: solo cuenta lo del día de la vela
  const day1 = day0 + 86400;
  const fine2 = fine.concat([mk(day1, 5, 6, 4, 5.5, 1)]);
  const p3 = L.partialBar(dayBar, { candles: fine2, sec: 900 }, day1 + 900, day1);
  eq(p3.volume, 192); eq(p3.high, 196);
  // sin datos finos
  eq(L.partialBar(dayBar, null, cut), null);
  eq(L.partialBar(dayBar, { candles: fine, sec: null }, cut), null);
}
console.log('Pruebas de replay: todas pasaron');

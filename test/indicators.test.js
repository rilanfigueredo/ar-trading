const assert = require('assert');
const L = require('../renderer/js/lib.js');
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

// ---- RSI(14): datos de referencia de StockCharts (suavizado de Wilder)
const px = [44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826,
  45.8931, 46.0328, 45.6140, 46.2820, 46.2820, 46.0028, 46.0328, 46.4116, 46.2222, 45.6439, 46.2122,
  46.2522, 45.7134, 46.4416, 45.7834, 45.3548, 44.0288, 44.1783, 44.2220, 44.5675, 43.4205, 42.9112, 43.1976];
{
  const r = L.rsi(px, 14);
  for (let i = 0; i < 14; i++) assert.strictEqual(r[i], null);
  close(r[14], 70.53, 0.05); close(r[15], 66.32, 0.05); close(r[16], 66.55, 0.05);
  // implementación ingenua e independiente (promedios de Wilder paso a paso)
  let ag = 0, al = 0;
  for (let i = 1; i <= 14; i++) { const d = px[i] - px[i - 1]; if (d > 0) ag += d; else al -= d; }
  ag /= 14; al /= 14;
  let naive = 100 - 100 / (1 + ag / al);
  close(r[14], naive, 1e-9);
  for (let i = 15; i < px.length; i++) {
    const d = px[i] - px[i - 1];
    ag = (ag * 13 + Math.max(d, 0)) / 14; al = (al * 13 + Math.max(-d, 0)) / 14;
    naive = 100 - 100 / (1 + ag / al);
    close(r[i], naive, 1e-9);
  }
}
// RSI en subida constante = 100
{ const r = L.rsi(Array.from({ length: 30 }, (_, i) => i + 1), 14); close(r[29], 100); }

// ---- MACD(12,26,9)
{
  const c = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 10 + i * 0.3);
  const m = L.macd(c, 12, 26, 9);
  const ef = L.ema(c, 12), es = L.ema(c, 26);
  for (let i = 0; i < 25; i++) assert.strictEqual(m.macd[i], null);
  close(m.macd[25], ef[25] - es[25]);
  for (let i = 0; i < 33; i++) assert.strictEqual(m.signal[i], null);
  // la señal arranca con la media simple de los primeros 9 valores del MACD
  let s = 0; for (let i = 25; i < 34; i++) s += m.macd[i];
  close(m.signal[33], s / 9);
  close(m.hist[40], m.macd[40] - m.signal[40]);
  // recurrencia de la EMA 9 para la señal
  const k = 2 / 10;
  close(m.signal[34], m.macd[34] * k + m.signal[33] * (1 - k));
}

// ---- Estocástico(14,1,3)
{
  const n = 30;
  const hi = Array.from({ length: n }, (_, i) => 10 + (i % 7));
  const lo = hi.map((h) => h - 3);
  const cl = hi.map((h, i) => h - (i % 3));
  const st = L.stoch(hi, lo, cl, 14, 1, 3);
  for (let i = 0; i < 13; i++) assert.strictEqual(st.k[i], null);
  // comprobar %K a mano en la vela 20
  let hh = -Infinity, ll = Infinity;
  for (let j = 7; j <= 20; j++) { hh = Math.max(hh, hi[j]); ll = Math.min(ll, lo[j]); }
  close(st.k[20], (100 * (cl[20] - ll)) / (hh - ll));
  close(st.d[20], (st.k[18] + st.k[19] + st.k[20]) / 3);
  assert.strictEqual(st.d[14], null); // el %D necesita 3 valores de %K
  assert.ok(st.d[15] !== null);
  st.k.forEach((v) => { if (v !== null) assert.ok(v >= 0 && v <= 100); });
}

// ---- ATR(14)
{
  const hi = [], lo = [], cl = [];
  for (let i = 0; i < 40; i++) { cl.push(100 + i); hi.push(100 + i + 2); lo.push(100 + i - 1); }
  const a = L.atr(hi, lo, cl, 14);
  for (let i = 0; i < 13; i++) assert.strictEqual(a[i], null);
  // TR: vela 0 = 3; después max(3, |h - cierre previo| = 3, |l - cierre previo| = 0) = 3
  close(a[13], 3); close(a[39], 3);
  // un salto: TR grande en la vela 20 sube el ATR con la fórmula de Wilder
  hi[20] += 10; const b = L.atr(hi, lo, cl, 14);
  close(b[20], (3 * 13 + 13) / 14);
}

// ---- OBV
{
  const o = L.obv([10, 11, 11, 10, 12], [5, 3, 4, 2, 6]);
  assert.deepStrictEqual(o, [0, 3, 3, 1, 7]);
}

// ---- VWAP anclado al día
{
  const tf = L.makeTf('m', 60);
  const d0 = Math.floor(Date.UTC(2024, 0, 10) / 1000);
  const bars = [
    { time: d0, open: 1, high: 12, low: 8, close: 10, volume: 2 },          // tp 10
    { time: d0 + 3600, open: 1, high: 24, low: 16, close: 20, volume: 3 },  // tp 20
    { time: d0 + 86400, open: 1, high: 33, low: 27, close: 30, volume: 5 }, // día nuevo, tp 30
  ];
  const v = L.vwap(bars, tf, 'day');
  close(v[0], 10); close(v[1], (10 * 2 + 20 * 3) / 5); close(v[2], 30);
  assert.strictEqual(L.vwap(bars, L.makeTf('d', 1), 'day'), null); // en 1D no aplica
  assert.ok(L.vwap(bars, L.makeTf('d', 1), 'week') !== null);
}

// ---- Pivotes
{
  const lv = L.pivotLevels({ high: 110, low: 90, close: 100 }, 'classic');
  close(lv.P, 100); close(lv.R1, 110); close(lv.S1, 90); close(lv.R2, 120); close(lv.S2, 80); close(lv.R3, 130); close(lv.S3, 70);
  const fb = L.pivotLevels({ high: 110, low: 90, close: 100 }, 'fib');
  close(fb.R1, 107.64); close(fb.R2, 112.36); close(fb.R3, 120); close(fb.S1, 92.36); close(fb.S3, 80);
  // segmentos por día con barras de 4h (6 por día)
  const tf = L.makeTf('h', 4);
  const d0 = Math.floor(Date.UTC(2024, 0, 10) / 1000);
  const bars = [];
  for (let i = 0; i < 18; i++) bars.push({ time: d0 + i * 14400, open: 100, high: 100 + (i < 6 ? 10 : 0), low: 100 - (i < 6 ? 10 : 0), close: 100, volume: 1 });
  const p = L.pivots(bars, tf, 'classic', 'day', true);
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.segments.length, 2);                 // días 2 y 3 (usan el día anterior)
  assert.strictEqual(p.segments[0].startIdx, 6); assert.strictEqual(p.segments[0].endIdx, 12);
  close(p.segments[0].levels.R1, 110); close(p.segments[0].levels.S1, 90);
  assert.strictEqual(p.segments[1].extra, 0);               // el día 3 ya tiene sus 6 velas
  // si el historial empieza a mitad del primer día, ese día no se usa
  const cut = bars.slice(3);
  assert.strictEqual(L.pivots(cut, tf, 'classic', 'day', false).segments.length, 1);
  assert.strictEqual(L.pivots(cut, tf, 'classic', 'day', true).segments.length, 2);
  // período menor que la temporalidad: no disponible
  assert.strictEqual(L.pivots(bars, L.makeTf('d', 4), 'classic', 'day', true).ok, false);
  // auto
  assert.strictEqual(L.resolvePeriod('auto', L.makeTf('m', 15)), 'day');
  assert.strictEqual(L.resolvePeriod('auto', L.makeTf('h', 4)), 'week');
  assert.strictEqual(L.resolvePeriod('auto', L.makeTf('d', 1)), 'month');
  // las semanas empiezan el lunes
  const mon = Date.UTC(2024, 0, 8) / 1000; // lunes 8 de enero de 2024
  assert.strictEqual(L.periodKey(mon, 'week'), L.periodKey(mon + 6 * 86400, 'week'));
  assert.notStrictEqual(L.periodKey(mon, 'week'), L.periodKey(mon - 1, 'week'));
  assert.strictEqual(L.periodStart(L.periodKey(mon + 3 * 86400, 'week'), 'week'), mon);
}

// ---- conversión tiempo <-> posición lógica
{
  const bars = [0, 1, 2, 3].map((i) => ({ time: 1000 + i * 100 }));
  close(L.timeToLogical(bars, 100, 1150), 1.5);
  close(L.timeToLogical(bars, 100, 1350), 3.5);
  close(L.timeToLogical(bars, 100, 900), -1);
  close(L.logicalToTime(bars, 100, 2.25), 1225);
  close(L.logicalToTime(bars, 100, 5), 1500);
  for (const l of [-3, 0, 0.7, 2.2, 3, 6.5]) close(L.timeToLogical(bars, 100, L.logicalToTime(bars, 100, l)), l, 1e-9);
  assert.strictEqual(L.barAtTime(bars, 100, 1250).time, 1200);
  assert.strictEqual(L.barAtTime(bars, 100, 1399).time, 1300);
  assert.strictEqual(L.barAtTime(bars, 100, 1400), null);
  assert.strictEqual(L.barAtTime(bars, 100, 999), null);
}
console.log('Pruebas de indicadores: todas pasaron');

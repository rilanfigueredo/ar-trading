// Pruebas del calendario hebreo (v0.23.7): fechas, atardecer, tablas de barras y agregación de velas.
const assert = require('assert');
const HB = require('../renderer/js/hebrew.js');
const L = require('../renderer/js/lib.js');
const eq = assert.strictEqual;
const DAY = 86400;
const utc = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) / 1000;

// 1) Fechas hebreas = las del calendario hebreo del propio sistema (Intl) en 2009–2060 (día civil, sin atardecer)
{
  const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', day: 'numeric', year: 'numeric' });
  let n = 0;
  for (let u = Date.UTC(2009, 0, 1) / 86400000; u <= Date.UTC(2060, 11, 31) / 86400000; u++) {
    const p = fmt.formatToParts(new Date(u * 86400000));
    const day = +p.find((x) => x.type === 'day').value, year = +p.find((x) => x.type === 'relatedYear' || x.type === 'year').value;
    const h = HB.fromUnixDay(u);
    assert.ok(h && h.day === day && h.year === year && h.weekday === new Date(u * 86400000).getUTCDay(), 'fecha distinta en ' + new Date(u * 86400000).toISOString().slice(0, 10));
    n++;
  }
  assert.ok(n > 18000);
}
// 2) Años: 353/354/355 (normales) o 383/384/385 (bisiestos); los meses suman el año; 7 bisiestos cada 19 años
{
  let leaps = 0;
  for (let y = HB.FIRST_YEAR; y <= HB.LAST_YEAR; y++) {
    const ms = HB.monthsOfYear(y), sum = ms.reduce((a, m) => a + m.len, 0);
    eq(sum, HB.daysInYear(y));
    assert.ok(HB.isLeap(y) ? [383, 384, 385].includes(sum) : [353, 354, 355].includes(sum), 'año ' + y + ': ' + sum);
    eq(ms.length, HB.isLeap(y) ? 13 : 12);
    if (y < HB.FIRST_YEAR + 19 && HB.isLeap(y)) leaps++;
  }
  eq(leaps, 7);
  eq(HB.monthsOfYear(5784).map((m) => m.name).join(','), 'Tishrei,Jeshván,Kislev,Tevet,Shevat,Adar I,Adar II,Nisán,Iyar,Siván,Tamuz,Av,Elul');   // 5784 fue bisiesto
}
// 3) Atardecer de Jerusalén: ~15:00–16:00 UTC en invierno, ~17:00–17:40 UTC en verano, siempre en minutos enteros
{
  const inv = HB.sunsetSec(Date.UTC(2026, 0, 15) / 86400000), ver = HB.sunsetSec(Date.UTC(2026, 5, 21) / 86400000);
  eq(inv % 60, 0); eq(ver % 60, 0);
  const hm = (t) => (t % DAY) / 3600;
  assert.ok(hm(inv) > 14.5 && hm(inv) < 15.3, 'invierno ' + hm(inv));   // ~16:50 hora de Israel
  assert.ok(hm(ver) > 16.4 && hm(ver) < 17.2, 'verano ' + hm(ver));     // ~19:50 hora de Israel
  // 1-nov-2026: Hebcal da 14:50 UTC (diferencia máxima de nuestra tabla con Hebcal: 30 s, solo por el redondeo al minuto)
  eq(HB.sunsetSec(Date.UTC(2026, 10, 1) / 86400000), utc(2026, 11, 1, 14, 50));
}
// 4) Los días hebreos cubren el tiempo sin huecos ni solapes; cada uno dura entre 23 h y 25 h
{
  const tb = HB.table();
  for (let i = 0; i < tb.n; i++) {
    const d = tb.S[i + 1] - tb.S[i];
    assert.ok(d > 23 * 3600 && d < 25 * 3600, 'día ' + i + ' dura ' + d);
  }
}
// 5) Día: cambia justo al atardecer
{
  const sun = HB.sunsetSec(Date.UTC(2026, 9, 31) / 86400000);   // sábado 31-oct-2026 -> empieza el domingo 1-nov hebreo
  const before = HB.info(sun - 1), after = HB.info(sun);
  eq(after.start, sun);
  eq(before.end, sun);
  assert.ok(after.day === before.day + 1 || after.day === 1);   // el día siguiente (o el 1 del mes nuevo)
  eq(after.weekday, (before.weekday + 1) % 7);
  eq(after.weekdayName, 'Domingo');                              // 31-oct-2026 UTC era sábado: empieza Yom Rishon
  eq(HB.bucketStart('d', 1, sun + 3600), sun);
  eq(HB.bucketEnd('d', 1, sun + 3600), HB.sunsetSec(Date.UTC(2026, 10, 1) / 86400000));
}
// 6) Semana: empieza el sábado al atardecer (Yom Rishon) y dura 7 días hebreos
{
  const t = utc(2026, 11, 4, 12);                       // miércoles
  const [a, b] = HB.bucketRange('w', 1, t);
  eq(HB.info(a).weekday, 0);
  eq(HB.info(b - 1).weekday, 6);                        // la semana termina el sábado (Shabat) al atardecer
  eq(HB.info(b).weekday, 0);
  eq(b - a > 6 * DAY + 22 * 3600 && b - a < 7 * DAY + 2 * 3600, true);
  const civil = new Date(a * 1000).getUTCDay();         // el atardecer del sábado civil
  eq(civil, 6);
  // 2 semanas: bloque doble que contiene a la semana
  const [a2, b2] = HB.bucketRange('w', 2, t);
  assert.ok(a2 <= a && b2 >= b && b2 - a2 > 13 * DAY);
}
// 7) Mes: cambia con el día 1; el mes hebreo de 29/30 días no coincide con el mes civil
{
  // 1-nov-2026 ya es el día 21 de Jeshván: faltan unos 10 días para que cierre la vela mensual (el mes civil de octubre ya cerró)
  const now = utc(2026, 11, 1, 6);
  const i = HB.info(now);
  eq(i.month, 'Jeshván'); eq(i.year, 5787);
  const [a, b] = HB.bucketRange('M', 1, now);
  eq(HB.info(a).day, 1);
  eq(HB.info(b).day, 1);
  eq(HB.info(a).month, 'Jeshván'); eq(HB.info(b).month, 'Kislev');
  const left = (b - now) / DAY;
  assert.ok(left > 8 && left < 11, 'faltan ' + left + ' días');
  const len = Math.round((b - a) / DAY);
  assert.ok(len === 29 || len === 30);
  // todos los inicios de mes son el día 1 y el día anterior es el 29 o el 30
  const tb = HB.table();
  for (let m = 1; m < tb.mStart.length; m++) {
    const s = tb.S[tb.mStart[m]];
    eq(HB.info(s).day, 1);
    assert.ok([29, 30].includes(HB.info(s - 1).day));
  }
  // bloques de 4 meses se reinician cada Tishrei y no pasan al año siguiente
  const [a4, b4] = HB.bucketRange('M', 4, now);
  assert.ok(a4 <= a && b4 >= b);
  eq(HB.info(a4).year, HB.info(b4 - 1).year);
  let tishreis = 0;
  for (let m = 0; m < tb.mStart.length; m++) {
    if (tb.mOrd[m] !== 0) continue;
    const t0 = tb.S[tb.mStart[m]];
    eq(HB.info(t0).month, 'Tishrei');
    eq(HB.bucketStart('M', 4, t0), t0);                 // el primer bloque empieza en Tishrei
    tishreis++;
  }
  eq(tishreis, HB.LAST_YEAR - HB.FIRST_YEAR + 1);
}
// 8) Fuera de la tabla: sin resultado (la vela cae al día civil)
{
  eq(HB.bucketStart('d', 1, utc(2005, 1, 1)), null);
  eq(L.bucketStart(L.withCalendar(L.tfById('d:1'), 'hebrew'), utc(2005, 1, 1, 13)), utc(2005, 1, 1));
}

// ---------- Integración con lib.js ----------
const mk = (id) => L.withCalendar(L.tfById(id), 'hebrew');
{
  eq(L.withCalendar(L.tfById('m:40'), 'hebrew').kind, 'fixed');          // horas y minutos no cambian
  eq(L.withCalendar(L.tfById('m:60'), 'hebrew').kind, 'native');
  eq(L.withCalendar(L.tfById('d:1'), 'gregorian').kind, 'native');       // gregoriano = igual que antes
  eq(L.withCalendar(L.tfById('v:1'), 'hebrew').kind, 'vol');
  const d = mk('d:1'), w = mk('w:1'), m = mk('M:1'), m4 = mk('M:4'), d4 = mk('d:4');
  [d, w, m, m4, d4].forEach((x) => { eq(x.kind, 'hebrew'); eq(x.base, '1m'); eq(L.needsAnchor(x), false); });
  eq([d.hu, w.hu, m.hu, m4.hu, m4.n, d4.n].join(','), 'd,w,M,M,4,4');
  assert.ok(L.describe(d).includes('hebreo'));
  eq(L.baseSec(d), 60);
  // fin de barra
  const t0 = HB.bucketStart('d', 1, utc(2026, 11, 3, 5));
  eq(L.barEnd(d, t0), HB.bucketEnd('d', 1, t0));
  eq(L.barEnd(L.tfById('d:1'), utc(2026, 11, 3)), utc(2026, 11, 4));
  eq(L.barEnd(L.tfById('M:1'), utc(2026, 10, 1)), utc(2026, 11, 1));
}
// Agregación: velas de 1 minuto de 4 días seguidos -> día hebreo
{
  const d = mk('d:1');
  const start = HB.sunsetSec(Date.UTC(2026, 10, 1) / 86400000) - 90 * 60;        // 90 min antes de un atardecer
  const end = start + 4 * DAY;
  const base = [];
  for (let t = start; t < end; t += 60) base.push({ time: t, open: t, high: t + 5, low: t - 5, close: t + 1, volume: 2 });
  const bars = L.aggregate(base, d);
  eq(bars.length, 5);                                                                // 1 parcial al inicio, 3 completas y 1 parcial al final
  const sun = [1, 2, 3, 4].map((k) => HB.sunsetSec(Date.UTC(2026, 10, k) / 86400000));
  eq(bars[0].time, HB.bucketStart('d', 1, start));
  for (let k = 1; k < 5; k++) eq(bars[k].time, sun[k - 1]);                           // cada barra empieza exactamente al atardecer
  eq(bars[1].open, sun[0]);                                                          // abre con el primer minuto del día hebreo
  eq(bars[1].close, sun[1] - 60 + 1);                                                // cierra con el último minuto antes del siguiente atardecer
  eq(bars[1].volume, 2 * ((sun[1] - sun[0]) / 60));
  eq(bars[1].high, sun[1] - 60 + 5); eq(bars[1].low, sun[0] - 5);
  const total = bars.reduce((a, b) => a + b.volume, 0);
  eq(total, base.length * 2);                                                         // no se pierde ni se duplica volumen
}
// Semana y mes en la misma serie: cierran siempre en una frontera de día
{
  const w = mk('w:1'), m = mk('M:1'), day = mk('d:1');
  const start = utc(2026, 9, 20), end = utc(2026, 12, 20);
  const base = [];
  for (let t = start; t < end; t += 60) base.push({ time: t, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 });
  const days = new Set(L.aggregate(base, day).map((b) => b.time));
  const weeks = L.aggregate(base, w), months = L.aggregate(base, m);
  weeks.forEach((b) => assert.ok(days.has(b.time) || b.time < HB.bucketStart('d', 1, start) + DAY));
  months.forEach((b) => assert.ok(days.has(b.time) || b.time < HB.bucketStart('d', 1, start) + DAY));
  assert.ok(weeks.length >= 12 && weeks.length <= 15, 'semanas ' + weeks.length);
  assert.ok(months.length >= 3 && months.length <= 4, 'meses ' + months.length);
  eq(weeks.reduce((a, b) => a + b.volume, 0), base.length);
  eq(months.reduce((a, b) => a + b.volume, 0), base.length);
}
// Velocidad: 600.000 velas de 1 minuto (más de un año) se agrupan rápido
{
  const d = mk('d:1');
  const base = [];
  const s0 = utc(2025, 1, 1);
  for (let i = 0; i < 600000; i++) base.push({ time: s0 + i * 60, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 });
  const t0 = Date.now();
  const bars = L.aggregate(base, d);
  const ms = Date.now() - t0;
  assert.ok(bars.length > 410 && bars.length < 420, 'barras ' + bars.length);
  assert.ok(ms < 1500, 'tardó ' + ms + ' ms');
}
console.log('Pruebas del calendario hebreo: ok');

// ---------- Precisión «rápida» (atardecer redondeado a la hora, velas de 1 hora) ----------
{
  const day0 = Date.UTC(2026, 9, 31) / 86400000;
  const ex = HB.sunsetSec(day0), fa = HB.sunsetSec(day0, 3600);
  eq(fa % 3600, 0);
  assert.ok(Math.abs(fa - ex) <= 1800, 'diferencia ' + (fa - ex));
  const tb = HB.table(3600);
  let maxd = 0;
  for (let i = 0; i < tb.n; i += 17) { eq(tb.S[i] % 3600, 0); }
  for (let i = 0; i < tb.n; i += 17) maxd = Math.max(maxd, Math.abs(tb.S[i] - HB.table(60).S[i]));
  assert.ok(maxd <= 1800);
  // las fechas son las mismas en las dos precisiones (solo cambia la hora de corte)
  for (let i = 0; i < tb.n; i += 29) { eq(tb.days[i].abs, HB.table(60).days[i].abs); eq(tb.days[i].d, HB.table(60).days[i].d); }
  const t = utc(2026, 11, 4, 12);
  ['d', 'w', 'M'].forEach((u) => { const [a, b] = HB.bucketRange(u, 1, t, 3600); eq(a % 3600, 0); eq(b % 3600, 0); assert.ok(a <= t && t < b); });
  const f = L.withCalendar(L.tfById('d:1'), 'hebrew', 'fast');
  eq(f.base, '1h'); eq(f.gran, 3600); eq(f.fast, true); eq(f.ratio, 24);
  eq(L.withCalendar(L.tfById('w:1'), 'hebrew', 'fast').ratio, 168);
  eq(L.withCalendar(L.tfById('d:1'), 'hebrew', 'exact').ratio, 1440);
  eq(L.withCalendar(L.tfById('d:1'), 'hebrew').base, '1m');
  assert.ok(L.describe(f).includes('1 hora'));
  // agregación de velas de 1 hora: cada barra empieza a una hora en punto y no se pierde volumen
  const base = [];
  const s0 = utc(2026, 10, 1);
  for (let i = 0; i < 24 * 60; i++) base.push({ time: s0 + i * 3600, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 });
  const bars = L.aggregate(base, f);
  bars.forEach((b) => eq(b.time % 3600, 0));
  eq(bars.reduce((a, b) => a + b.volume, 0), base.length);
  assert.ok(bars.length >= 59 && bars.length <= 62, 'barras ' + bars.length);
  // barEnd coincide con el inicio de la barra siguiente
  for (let k = 0; k + 1 < bars.length; k++) eq(L.barEnd(f, bars[k].time), bars[k + 1].time);
  // exactas: lo mismo con velas de 1 minuto
  const ex1 = L.withCalendar(L.tfById('d:1'), 'hebrew', 'exact');
  const base1 = [];
  for (let i = 0; i < 5 * 1440; i++) base1.push({ time: s0 + i * 60, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 });
  const bars1 = L.aggregate(base1, ex1);
  for (let k = 0; k + 1 < bars1.length; k++) eq(L.barEnd(ex1, bars1[k].time), bars1[k + 1].time);
  eq(bars1.reduce((a, b) => a + b.volume, 0), base1.length);
}
// El día cambia en horas distintas a lo largo del año (por eso no vale un horario fijo): invierno ≈ 14:40 UTC, verano ≈ 16:50 UTC
{
  const w = HB.sunsetSec(Date.UTC(2026, 11, 20) / 86400000), v = HB.sunsetSec(Date.UTC(2026, 5, 21) / 86400000);
  assert.ok((v % DAY) - (w % DAY) > 90 * 60, 'la diferencia invierno-verano debe pasar de 1,5 h');
}
console.log('Pruebas del calendario hebreo (rápido): ok');

// ---------- Pivotes y VWAP con calendario hebreo ----------
{
  const HBt = HB;
  // velas de 1 hora de 40 días; con pivotes diarios, cada tramo debe empezar al atardecer (hebreo) y no a las 00:00 UTC
  const s0 = utc(2026, 9, 20);
  const bars = [];
  let px = 100;
  for (let i = 0; i < 40 * 24; i++) { const o = px; px += Math.sin(i / 7) * 2 + Math.cos(i / 31); bars.push({ time: s0 + i * 3600, open: o, high: Math.max(o, px) + 1, low: Math.min(o, px) - 1, close: px, volume: 1 }); }
  const tfH = L.withCalendar(L.tfById('m:60'), 'hebrew', 'fast');
  eq(tfH.cal, 'hebrew'); eq(tfH.gran, 3600);
  const rg = L.pivots(bars, L.tfById('m:60'), 'classic', 'day', true);
  const rh = L.pivots(bars, tfH, 'classic', 'day', true);
  assert.ok(rg.ok && rh.ok);
  // gregoriano: cada tramo empieza a las 00:00 UTC; hebreo: cada tramo empieza a la hora del atardecer (15:00–17:00 UTC)
  rg.segments.forEach((g) => eq(bars[g.startIdx].time % DAY, 0));
  rh.segments.slice(0, -1).forEach((g) => { const h = (bars[g.startIdx].time % DAY) / 3600; assert.ok(h >= 14 && h <= 17, 'hora ' + h); });
  // los niveles salen del máximo/mínimo/cierre del día hebreo anterior (no del civil)
  const seg = rh.segments[3], a = HBt.bucketRange('d', 1, bars[seg.startIdx].time - 3600, 3600);
  const prev = bars.filter((b) => b.time >= a[0] && b.time < a[1]);
  const H = Math.max(...prev.map((b) => b.high)), Lo = Math.min(...prev.map((b) => b.low)), C = prev[prev.length - 1].close;
  assert.ok(Math.abs(seg.levels.P - (H + Lo + C) / 3) < 1e-9);
  // semana y mes hebreos
  const rw = L.pivots(bars, tfH, 'classic', 'week', true), rm = L.pivots(bars, tfH, 'classic', 'month', true);
  rw.segments.forEach((g) => { const t = bars[g.startIdx].time; assert.ok(t === HBt.bucketStart('w', 1, t, 3600) || g === rw.segments[0]); });
  rm.segments.forEach((g) => { const t = bars[g.startIdx].time; assert.ok(t === HBt.bucketStart('M', 1, t, 3600) || g === rm.segments[0]); });
  // el modo gregoriano no cambia
  eq(L.periodKey(utc(2026, 11, 4, 5), 'day'), Math.floor(utc(2026, 11, 4, 5) / DAY));
  // VWAP anclado al día hebreo
  const v = L.vwap(bars, tfH, 'day'), vg = L.vwap(bars, L.tfById('m:60'), 'day');
  assert.ok(v.length === bars.length && vg.length === bars.length);
  let diff = 0; for (let i = 0; i < v.length; i++) if (Math.abs(v[i] - vg[i]) > 1e-9) diff++;
  assert.ok(diff > 100, 'el VWAP hebreo debe diferir del civil');
}
console.log('Pruebas de pivotes y VWAP hebreos: ok');

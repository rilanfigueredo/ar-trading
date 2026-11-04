// Calendario hebreo para las velas (v0.23.7). Funciones puras, sin dependencias.
// Funciona en el navegador (window.TVHebrew) y en Node (para las pruebas).
//
// Precisión (gran): 60 = el atardecer se redondea al minuto (exacta; velas de 1 minuto) o 3600 = a la hora (rápida; velas de 1 hora,
// mucho más ligera para gráficos semanales y mensuales de varios años).
//
// Idea: el día hebreo empieza al ATARDECER (no a las 00:00). Se calcula UNA vez una tabla con el atardecer exacto de
// Jerusalén (redondeado al minuto) de cada día; de ahí salen el día, la semana (domingo = Yom Rishon, empieza el
// sábado al atardecer) y el mes hebreo (cambia con el día 1 del mes, es decir, la tarde anterior). Para saber a qué
// vela pertenece un instante basta una búsqueda binaria en esa tabla. El calendario hebreo moderno es aritmético
// (no depende de mirar la luna), así que no hace falta astronomía lunar; solo solar, para el atardecer.
// Fechas: algoritmo de Reingold–Dershowitz («Calendrical Calculations»). Atardecer: fórmulas NOAA (Meeus).
(function (root) {
  'use strict';

  const EPOCH = -1373427;          // día absoluto (1-ene-1 d. C. = 1) del origen del calendario hebreo (Reingold–Dershowitz)
  const UNIX_ABS = 719163;         // día absoluto del 1-ene-1970
  const MINUTE = 60;
  // Ubicación de referencia (fija, para que todos los gráficos coincidan): Jerusalén.
  const JERUSALEM = { lat: 31.76904, lon: 35.21633 };
  const ZENITH = 90.8333;          // atardecer «geométrico»: el borde del sol toca el horizonte (incluye refracción)
  const FIRST_YEAR = 5769, LAST_YEAR = 5822;   // ~30-sep-2008 … ~2062: cubre todo el historial cripto

  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;

  // ---------- Fechas hebreas ----------
  function elapsedDays(year) {
    const months = Math.floor((235 * year - 234) / 19);
    const parts = 12084 + 13753 * months;
    let days = 29 * months + Math.floor(parts / 25920);
    if ((3 * (days + 1)) % 7 < 3) days++;
    return days;
  }
  function newYearDelay(year) {
    const a = elapsedDays(year - 1), b = elapsedDays(year), c = elapsedDays(year + 1);
    if (c - b === 356) return 2;
    if (b - a === 382) return 1;
    return 0;
  }
  const newYearAbs = (year) => EPOCH + elapsedDays(year) + newYearDelay(year);   // 1 de Tishrei
  const isLeap = (year) => (7 * year + 1) % 19 < 7;
  const daysInYear = (year) => newYearAbs(year + 1) - newYearAbs(year);
  // Meses del año en orden desde Tishrei: [{ name, len }]
  const NAMES = ['Tishrei', 'Jeshván', 'Kislev', 'Tevet', 'Shevat', 'Adar', 'Nisán', 'Iyar', 'Siván', 'Tamuz', 'Av', 'Elul'];
  function monthsOfYear(year) {
    const len = daysInYear(year);
    const out = [
      { name: 'Tishrei', len: 30 }, { name: 'Jeshván', len: len % 10 === 5 ? 30 : 29 }, { name: 'Kislev', len: len % 10 === 3 ? 29 : 30 },
      { name: 'Tevet', len: 29 }, { name: 'Shevat', len: 30 },
    ];
    if (isLeap(year)) { out.push({ name: 'Adar I', len: 30 }, { name: 'Adar II', len: 29 }); } else out.push({ name: 'Adar', len: 29 });
    out.push({ name: 'Nisán', len: 30 }, { name: 'Iyar', len: 29 }, { name: 'Siván', len: 30 }, { name: 'Tamuz', len: 29 }, { name: 'Av', len: 30 }, { name: 'Elul', len: 29 });
    return out;
  }

  // ---------- Atardecer (NOAA) ----------
  function solar(jd) {
    const t = (jd - 2451545.0) / 36525.0;
    const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
    const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    const Mr = rad(M);
    const C = Math.sin(Mr) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * t) + Math.sin(3 * Mr) * 0.000289;
    const omega = 125.04 - 1934.136 * t;
    const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
    const sec = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
    const eps = 23 + (26 + sec / 60) / 60 + 0.00256 * Math.cos(rad(omega));
    const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
    const y = Math.tan(rad(eps) / 2) ** 2;
    const L0r = rad(L0);
    const eqTime = 4 * deg(y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
    return { decl, eqTime };
  }
  // Minutos (desde las 00:00 UTC) del atardecer del día civil con día juliano jd0 (a las 00:00 UTC).
  function sunsetMinutes(jd0, lat, lon) {
    let m = 720;
    for (let k = 0; k < 3; k++) {
      const { decl, eqTime } = solar(jd0 + m / 1440);
      const cosH = Math.cos(rad(ZENITH)) / (Math.cos(rad(lat)) * Math.cos(rad(decl))) - Math.tan(rad(lat)) * Math.tan(rad(decl));
      if (cosH < -1 || cosH > 1) return NaN;            // sin atardecer (latitudes polares; no pasa en Jerusalén)
      const ha = deg(Math.acos(cosH));
      m = 720 - 4 * lon - eqTime + 4 * ha;
    }
    return m;
  }
  // Atardecer de Jerusalén (segundos Unix, redondeado a 'gran' segundos: 60 = minuto) del día civil UTC número unixDay (días desde 1970).
  function sunsetSec(unixDay, gran, loc) {
    const p = loc || JERUSALEM, g = gran || MINUTE;
    const m = sunsetMinutes(unixDay + 2440587.5, p.lat, p.lon);
    return unixDay * 86400 + Math.round((m * MINUTE) / g) * g;
  }

  // ---------- Tabla de días hebreos ----------
  // Día i = un día hebreo; empieza en S[i] (atardecer del día civil anterior) y termina en S[i+1].
  const TS = {};
  const granOf = (g) => (g === 3600 ? 3600 : MINUTE);
  function build(gran) {
    const days = [], months = [], weeks = [];
    let a = newYearAbs(FIRST_YEAR);
    for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
      const ms = monthsOfYear(y);
      ms.forEach((m, o) => {
        months.push({ day: days.length, year: y, ord: o, count: ms.length, name: m.name });
        for (let d = 1; d <= m.len; d++) {
          if (a % 7 === 0 || !days.length) weeks.push(days.length);   // domingo (Yom Rishon); el primer día también abre semana
          days.push({ abs: a, y, o, d, mi: months.length - 1, wi: weeks.length - 1 });
          a++;
        }
      });
    }
    const n = days.length;
    const S = new Float64Array(n + 1);
    const MI = new Int32Array(n), WI = new Int32Array(n);
    for (let i = 0; i <= n; i++) {
      const absDay = newYearAbs(FIRST_YEAR) + i;                      // día hebreo con ese número absoluto
      S[i] = sunsetSec(absDay - 1 - UNIX_ABS, gran);                    // empieza al atardecer del día civil anterior
      if (i < n) { MI[i] = days[i].mi; WI[i] = days[i].wi; }
    }
    return (TS[gran] = {
      n, S, MI, WI, days,
      mStart: Int32Array.from(months.map((m) => m.day)), mYear: months.map((m) => m.year), mOrd: Int8Array.from(months.map((m) => m.ord)),
      mCount: Int8Array.from(months.map((m) => m.count)), mName: months.map((m) => m.name),
      wStart: Int32Array.from(weeks),
    });
  }
  const table = (gran) => { const g = granOf(gran); return TS[g] || build(g); };

  // Índice del día hebreo al que pertenece el instante t (segundos Unix). -1 si cae fuera de la tabla.
  function dayAt(t, gran) {
    const { S, n } = table(gran);
    if (!(t >= S[0]) || t >= S[n]) return -1;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }

  // Inicio y fin [start, end) (segundos) de la barra de N días, semanas o meses hebreos que contiene a t.
  // unit: 'd' | 'w' | 'M'. n = 1 es la unidad natural; con n > 1: bloques de N días/semanas contados desde el inicio de la tabla,
  // y bloques de N meses que se reinician cada Tishrei (año nuevo hebreo, como los meses gregorianos cada enero).
  function bucketRange(unit, n, t, gran) {
    const i = dayAt(t, gran);
    if (i < 0) return null;
    const tb = table(gran), N = Math.max(1, n | 0);
    if (unit === 'd') {
      const b = Math.floor(i / N) * N;
      return [tb.S[b], tb.S[Math.min(b + N, tb.n)]];
    }
    if (unit === 'w') {
      const w = tb.WI[i], b = Math.floor(w / N) * N;
      const e = b + N < tb.wStart.length ? tb.S[tb.wStart[b + N]] : tb.S[tb.n];
      return [tb.S[tb.wStart[b]], e];
    }
    const mi = tb.MI[i], o = tb.mOrd[mi], bo = Math.floor(o / N) * N;
    const first = mi - (o - bo);                                         // primer mes del bloque
    const end = Math.min(first + N, mi + (tb.mCount[mi] - o));           // sin pasar al año siguiente
    return [tb.S[tb.mStart[first]], end < tb.mStart.length ? tb.S[tb.mStart[end]] : tb.S[tb.n]];
  }
  const bucketStart = (unit, n, t, gran) => { const r = bucketRange(unit, n, t, gran); return r ? r[0] : null; };
  const bucketEnd = (unit, n, t, gran) => { const r = bucketRange(unit, n, t, gran); return r ? r[1] : null; };

  // Períodos hebreos para los pivotes y el VWAP: número de día / semana / mes hebreo (consecutivos) al que pertenece t, y su inicio.
  // unit: 'd' | 'w' | 'M'. periodKey devuelve -1 si t cae fuera de la tabla.
  function periodKey(unit, t, gran) {
    const i = dayAt(t, gran);
    if (i < 0) return -1;
    const tb = table(gran);
    return unit === 'd' ? i : unit === 'w' ? tb.WI[i] : tb.MI[i];
  }
  function periodStart(unit, key, gran) {
    const tb = table(gran);
    if (unit === 'd') return tb.S[Math.min(key, tb.n)];
    if (unit === 'w') return key < tb.wStart.length ? tb.S[tb.wStart[key]] : tb.S[tb.n];
    return key < tb.mStart.length ? tb.S[tb.mStart[key]] : tb.S[tb.n];
  }

  // Fecha hebrea del día que contiene a t. { day, month (nombre), year, weekday (0 = Domingo), start, end }
  const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  function info(t, gran) {
    const i = dayAt(t, gran);
    if (i < 0) return null;
    const tb = table(gran), d = tb.days[i];
    return { day: d.d, month: tb.mName[d.mi], year: d.y, weekday: d.abs % 7, weekdayName: WEEKDAYS[d.abs % 7], start: tb.S[i], end: tb.S[i + 1], index: i };
  }
  function label(t, gran) {
    const x = info(t, gran);
    return x ? `${x.weekdayName} ${x.day} ${x.month} ${x.year}` : '';
  }
  // Para las pruebas: fecha hebrea (año, mes, día) de un día civil UTC (00:00–23:59), sin atardecer.
  function fromUnixDay(unixDay) {
    const abs = unixDay + UNIX_ABS;
    const tb = table();
    const i = abs - newYearAbs(FIRST_YEAR);
    if (i < 0 || i >= tb.n) return null;
    const d = tb.days[i];
    return { year: d.y, month: tb.mName[d.mi], ordinal: d.o, day: d.d, weekday: abs % 7 };
  }

  const lib = { JERUSALEM, FIRST_YEAR, LAST_YEAR, newYearAbs, daysInYear, isLeap, monthsOfYear, sunsetSec, sunsetMinutes, table, dayAt, bucketRange, bucketStart, bucketEnd, periodKey, periodStart, info, label, fromUnixDay, WEEKDAYS, NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  else root.TVHebrew = lib;
})(typeof window !== 'undefined' ? window : globalThis);

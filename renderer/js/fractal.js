// Fractal (v0.26.12): motor puro (sin interfaz) para guardar una estructura de precio marcada con un rectángulo
// y buscar estructuras parecidas en otras temporalidades. Funciona en el navegador (window.TVFractal) y en Node (pruebas).
//
// Una estructura se describe con dos cosas:
//  1. FORMA: la silueta de las velas dentro del rectángulo, normalizada (0 = mínimo, 1 = máximo de la estructura) y
//     remuestreada a SHAPE_N puntos para poder compararla aunque tenga distinto número de velas o distinta escala de precio.
//  2. MEDIDAS: números simples (n.º de velas, mechas, barridos...) que el usuario activa, pondera y tolera.
// Parecido total (0-100) = peso_forma × parecido_forma + (1 - peso_forma) × promedio ponderado de los parecidos de las medidas activas.
(function (root) {
  'use strict';

  const SHAPE_N = 24;   // puntos de la forma
  const MIN_BARS = 4;   // una estructura necesita al menos 4 velas

  // Cada medida: val(feat) -> número; diff(a, b) -> diferencia (0 = igual); tol = diferencia que da 0 % de parecido.
  // mirror: cómo cambia la medida si la estructura se invierte (espejo: lo alcista pasa a bajista).
  const MEASURES = [
    { id: 'n', label: 'Número de velas', kind: 'rel', tol: 0.4, on: true, w: 5, mirror: 'same', fmt: (v) => String(Math.round(v)),
      hint: 'Cuántas velas tiene la estructura.' },
    { id: 'hiPos', label: 'Dónde está el máximo (0 = inicio, 100 = final)', kind: 'abs', tol: 0.4, on: true, w: 5, mirror: 'loPos', fmt: (v) => Math.round(v * 100) + ' %',
      hint: 'En qué parte de la estructura (de izquierda a derecha) se forma el máximo.' },
    { id: 'loPos', label: 'Dónde está el mínimo (0 = inicio, 100 = final)', kind: 'abs', tol: 0.4, on: true, w: 5, mirror: 'hiPos', fmt: (v) => Math.round(v * 100) + ' %',
      hint: 'En qué parte de la estructura se forma el mínimo.' },
    { id: 'net', label: 'Movimiento neto (apertura inicial → cierre final)', kind: 'abs', tol: 0.8, on: true, w: 5, mirror: 'neg', fmt: (v) => (v >= 0 ? '+' : '') + Math.round(v * 100) + ' % del rango',
      hint: 'Cuánto avanzó el precio de principio a fin, en proporción al rango de la estructura (+ sube, − baja).' },
    { id: 'wickHi', label: 'Mecha superior sobre el máximo protegido', kind: 'abs', tol: 0.25, on: true, w: 5, mirror: 'wickLo', fmt: (v) => Math.round(v * 100) + ' % del rango',
      hint: 'Cuánto sobresale la mecha más alta por encima del cuerpo (apertura/cierre) más alto: el barrido de liquidez por arriba.' },
    { id: 'wickLo', label: 'Mecha inferior bajo el mínimo protegido', kind: 'abs', tol: 0.25, on: true, w: 5, mirror: 'wickHi', fmt: (v) => Math.round(v * 100) + ' % del rango',
      hint: 'Cuánto sobresale la mecha más baja por debajo del cuerpo más bajo: el barrido de liquidez por abajo.' },
    { id: 'sweepHi', label: 'Barridos de máximo (mecha supera el máximo previo y cierra debajo)', kind: 'abs', tol: 3, on: true, w: 5, mirror: 'sweepLo', fmt: (v) => String(Math.round(v)),
      hint: 'Velas que superan el máximo anterior de la estructura pero cierran por debajo de él.' },
    { id: 'sweepLo', label: 'Barridos de mínimo (mecha pierde el mínimo previo y cierra encima)', kind: 'abs', tol: 3, on: true, w: 5, mirror: 'sweepHi', fmt: (v) => String(Math.round(v)),
      hint: 'Velas que pierden el mínimo anterior de la estructura pero cierran por encima de él.' },
    { id: 'disp', label: 'Desplazamiento (cuerpo más grande / rango)', kind: 'abs', tol: 0.6, on: true, w: 5, mirror: 'same', fmt: (v) => Math.round(v * 100) + ' % del rango',
      hint: 'Tamaño del cuerpo de la vela más impulsiva en proporción al rango.' },
    { id: 'bull', label: 'Porcentaje de velas alcistas', kind: 'abs', tol: 0.5, on: false, w: 3, mirror: 'inv', fmt: (v) => Math.round(v * 100) + ' %',
      hint: 'Qué parte de las velas cierra por encima de su apertura.' },
    { id: 'body', label: 'Cuerpo medio (cuerpo / rango de cada vela)', kind: 'abs', tol: 0.5, on: false, w: 3, mirror: 'same', fmt: (v) => Math.round(v * 100) + ' %',
      hint: 'Qué tan «llenas» son las velas: cerca de 100 % casi no tienen mechas.' },
    { id: 'range', label: 'Rango en % del precio', kind: 'rel', tol: 0.6, on: false, w: 3, mirror: 'same', fmt: (v) => (v * 100).toFixed(2) + ' %',
      hint: 'Altura de la estructura respecto al precio. Apagado por defecto: cambia mucho entre temporalidades.' },
  ];
  const MEASURE_BY_ID = {};
  MEASURES.forEach((m) => { MEASURE_BY_ID[m.id] = m; });

  const DEFAULT_SEARCH = {
    minScore: 80,     // 50-100
    shapeW: 50,       // % del parecido que sale de la forma (el resto, de las medidas)
    lenTol: 0.4,      // la ventana puede tener ±40 % de velas respecto a la original
    mirror: false,    // buscar también la versión invertida (espejo)
    depth: 10000,     // velas que se miran hacia atrás en cada temporalidad
    maxPerTf: 20,     // mejores resultados por temporalidad
    tfs: [],
    meas: {},         // id -> { on, w, tol, req }
  };
  function defaultMeas() {
    const o = {};
    MEASURES.forEach((m) => { o[m.id] = { on: m.on, w: m.w, tol: m.tol, req: false }; });
    return o;
  }
  function defaultSearch() {
    return Object.assign({}, DEFAULT_SEARCH, { tfs: [], meas: defaultMeas() });
  }
  // Completa/sanea la configuración de búsqueda guardada (por si faltan campos de versiones anteriores).
  function fixSearch(s) {
    const d = defaultSearch();
    const out = Object.assign(d, s && typeof s === 'object' ? s : {});
    out.meas = Object.assign(defaultMeas(), (s && s.meas) || {});
    MEASURES.forEach((m) => { out.meas[m.id] = Object.assign({ on: m.on, w: m.w, tol: m.tol, req: false }, out.meas[m.id]); });
    out.minScore = Math.max(50, Math.min(100, Number(out.minScore) || 80));
    out.shapeW = Math.max(0, Math.min(100, Number.isFinite(Number(out.shapeW)) ? Number(out.shapeW) : 50));
    out.lenTol = Math.max(0, Math.min(1, Number.isFinite(Number(out.lenTol)) ? Number(out.lenTol) : 0.4));
    out.depth = Math.max(1000, Math.min(60000, Math.round(Number(out.depth) || 10000)));
    out.maxPerTf = Math.max(1, Math.min(200, Math.round(Number(out.maxPerTf) || 20)));
    out.mirror = !!out.mirror;
    out.tfs = Array.isArray(out.tfs) ? out.tfs.slice() : [];
    return out;
  }

  const r4 = (v) => Math.round(v * 10000) / 10000;

  // ---------- Medidas y forma de un tramo de velas ----------
  // A = { o, h, l, c } (arreglos con el mismo largo); tramo [i0, i1).
  function arraysOf(bars) {
    const n = bars.length;
    const o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n);
    for (let i = 0; i < n; i++) { o[i] = bars[i].open; h[i] = bars[i].high; l[i] = bars[i].low; c[i] = bars[i].close; }
    return { o, h, l, c, n };
  }

  // Devuelve { n, shape: { h, l, c }, m: { id: valor } } o null si el tramo no sirve (muy corto o plano).
  function featOf(A, i0, i1) {
    const n = i1 - i0;
    if (n < MIN_BARS) return null;
    let hi = -Infinity, lo = Infinity, hiI = i0, loI = i0, maxBody = -Infinity, minBody = Infinity;
    let bull = 0, bodySum = 0, bodyN = 0, maxBodySize = 0;
    let runH = -Infinity, runL = Infinity, swH = 0, swL = 0;
    for (let i = i0; i < i1; i++) {
      const o = A.o[i], h = A.h[i], l = A.l[i], c = A.c[i];
      if (i > i0) {
        if (h > runH && c < runH) swH++;
        if (l < runL && c > runL) swL++;
      }
      if (h > runH) runH = h;
      if (l < runL) runL = l;
      if (h > hi) { hi = h; hiI = i; }
      if (l < lo) { lo = l; loI = i; }
      const top = o > c ? o : c, bot = o > c ? c : o;
      if (top > maxBody) maxBody = top;
      if (bot < minBody) minBody = bot;
      if (c > o) bull++;
      const body = top - bot;
      if (body > maxBodySize) maxBodySize = body;
      const rg = h - l;
      if (rg > 0) { bodySum += body / rg; bodyN++; }
    }
    const R = hi - lo;
    if (!(R > 0)) return null;
    // forma: n.º fijo de cubos; en cada uno, máximo de los máximos, mínimo de los mínimos y último cierre
    const sh = new Array(SHAPE_N), sl = new Array(SHAPE_N), sc = new Array(SHAPE_N);
    for (let k = 0; k < SHAPE_N; k++) {
      let a = i0 + Math.floor((k * n) / SHAPE_N);
      let b = i0 + Math.ceil(((k + 1) * n) / SHAPE_N) - 1;
      if (b < a) b = a;
      if (b > i1 - 1) b = i1 - 1;
      let mh = -Infinity, ml = Infinity;
      for (let i = a; i <= b; i++) { if (A.h[i] > mh) mh = A.h[i]; if (A.l[i] < ml) ml = A.l[i]; }
      sh[k] = r4((mh - lo) / R); sl[k] = r4((ml - lo) / R); sc[k] = r4((A.c[b] - lo) / R);
    }
    const mid = (hi + lo) / 2;
    const m = {
      n,
      hiPos: n > 1 ? (hiI - i0) / (n - 1) : 0.5,
      loPos: n > 1 ? (loI - i0) / (n - 1) : 0.5,
      net: (A.c[i1 - 1] - A.o[i0]) / R,
      wickHi: (hi - maxBody) / R,
      wickLo: (minBody - lo) / R,
      sweepHi: swH, sweepLo: swL,
      disp: maxBodySize / R,
      bull: bull / n,
      body: bodyN ? bodySum / bodyN : 0,
      range: mid ? R / mid : 0,
    };
    Object.keys(m).forEach((k) => { m[k] = r4(m[k]); });
    return { n, shape: { h: sh, l: sl, c: sc }, m };
  }

  // Estructura invertida (espejo vertical): lo alcista pasa a bajista.
  function mirrorFeat(f) {
    const inv = (a) => a.map((v) => r4(1 - v));
    const out = { n: f.n, shape: { h: inv(f.shape.l), l: inv(f.shape.h), c: inv(f.shape.c) }, m: {} };
    MEASURES.forEach((ms) => {
      const v = f.m[ms.id];
      if (ms.mirror === 'same') out.m[ms.id] = v;
      else if (ms.mirror === 'neg') out.m[ms.id] = -v;
      else if (ms.mirror === 'inv') out.m[ms.id] = r4(1 - v);
      else out.m[ms.id] = f.m[ms.mirror];
    });
    return out;
  }

  // ---------- Parecido ----------
  function shapeSim(a, b) {
    let s = 0;
    for (let k = 0; k < SHAPE_N; k++) s += Math.abs(a.h[k] - b.h[k]) + Math.abs(a.l[k] - b.l[k]) + Math.abs(a.c[k] - b.c[k]);
    const e = s / (3 * SHAPE_N);          // error medio, 0 = idéntica
    return Math.max(0, Math.min(1, 1 - 4 * e));   // 0,025 → 90 %, 0,125 → 50 %, 0,25 o más → 0 %
  }
  function measureSim(ms, a, b, tol) {
    const diff = ms.kind === 'rel' ? Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9) : Math.abs(a - b);
    return Math.max(0, 1 - diff / (tol || ms.tol));
  }
  // Compara el patrón guardado con otra estructura. Devuelve { score (0-100) o -1 si no cumple algo obligatorio, shape, parts }.
  function compare(pat, cand, s) {
    const sSim = shapeSim(pat.shape, cand.shape);
    let wSum = 0, mSum = 0;
    const parts = {};
    for (let i = 0; i < MEASURES.length; i++) {
      const ms = MEASURES[i], c = s.meas[ms.id];
      if (!c || !c.on) continue;
      const sim = measureSim(ms, pat.m[ms.id], cand.m[ms.id], c.tol);
      parts[ms.id] = sim;
      if (c.req && sim < 0.5) return { score: -1, shape: sSim, parts };
      const w = Math.max(0, c.w);
      wSum += w; mSum += w * sim;
    }
    const sw = s.shapeW / 100;
    let score;
    if (wSum > 0) score = sw * sSim + (1 - sw) * (mSum / wSum);
    else score = sSim;
    return { score: score * 100, shape: sSim, parts };
  }

  // ---------- Patrón desde velas ----------
  // bars: velas de la temporalidad (orden por tiempo). t0..t1: tiempos del rectángulo (s). tfSec: duración de una vela.
  function sliceByTime(bars, t0, t1, tfSec) {
    const a = Math.min(t0, t1) - tfSec / 2, b = Math.max(t0, t1) + tfSec / 2;
    let i0 = -1, i1 = -1;
    for (let i = 0; i < bars.length; i++) {
      const t = bars[i].time;
      if (t >= a && t <= b) { if (i0 < 0) i0 = i; i1 = i + 1; }
    }
    return i0 < 0 ? null : { i0, i1 };
  }
  function buildPattern(bars, t0, t1, tfSec) {
    const sl = sliceByTime(bars, t0, t1, tfSec);
    if (!sl) return { ok: false, reason: 'No hay velas dentro del rectángulo.' };
    if (sl.i1 - sl.i0 < MIN_BARS) return { ok: false, reason: `El rectángulo tiene solo ${sl.i1 - sl.i0} velas; se necesitan al menos ${MIN_BARS}.` };
    const A = arraysOf(bars);
    const f = featOf(A, sl.i0, sl.i1);
    if (!f) return { ok: false, reason: 'La estructura no tiene rango de precio (todas las velas iguales).' };
    return { ok: true, feat: f, i0: sl.i0, i1: sl.i1 };
  }

  // ---------- Búsqueda ----------
  // Recorre las velas con ventanas de distintos largos y devuelve las mejores coincidencias sin solaparse.
  // opts: { exclude: {t0, t1} | null, tfSec, isCancelled }
  function search(feat, bars, s, opts) {
    s = fixSearch(s);
    const o = opts || {};
    const tfSec = o.tfSec || 60;
    const N = bars.length;
    const out = { matches: [], windows: 0 };
    if (N < MIN_BARS) return out;
    const A = arraysOf(bars);
    const pats = [{ f: feat, mirrored: false }];
    if (s.mirror) pats.push({ f: mirrorFeat(feat), mirrored: true });
    // largos de ventana
    const lens = new Set();
    const steps = s.lenTol > 0 ? 7 : 1;
    for (let k = 0; k < steps; k++) {
      const f = steps === 1 ? 1 : 1 - s.lenTol + (2 * s.lenTol * k) / (steps - 1);
      lens.add(Math.max(MIN_BARS, Math.round(feat.n * f)));
    }
    const cands = [];
    const evalAt = (i0, len) => {
      if (i0 < 0 || len < MIN_BARS || i0 + len > N) return null;
      const f = featOf(A, i0, i0 + len);
      if (!f) return null;
      out.windows++;
      let best = null;
      for (const p of pats) {
        const r = compare(p.f, f, s);
        if (r.score >= 0 && (!best || r.score > best.score)) best = { score: r.score, shape: r.shape, mirrored: p.mirrored, i0, len, parts: r.parts };
      }
      return best;
    };
    lens.forEach((len) => {
      const stride = Math.max(1, Math.floor(len / 12));
      for (let i0 = 0; i0 + len <= N; i0 += stride) {
        const r = evalAt(i0, len);
        if (r && r.score >= s.minScore - 8) cands.push(r);
      }
    });
    // afinar cada candidato buscando alrededor (posición y largo) con pasos cada vez más pequeños
    cands.sort((a, b) => b.score - a.score);
    const top = cands.slice(0, 400);
    const refined = top.map((c) => {
      let cur = c;
      let step = Math.max(1, Math.floor(c.len / 12));
      while (step >= 1) {
        let improved = false;
        for (let di = -step; di <= step; di += step) {
          for (let dl = -step; dl <= step; dl += step) {
            if (!di && !dl) continue;
            const r = evalAt(cur.i0 + di, cur.len + dl);
            if (r && r.score > cur.score + 1e-9) { cur = r; improved = true; }
          }
        }
        if (!improved) step = Math.floor(step / 2);
      }
      return cur;
    });
    refined.sort((a, b) => b.score - a.score);
    const kept = [];
    for (const c of refined) {
      if (c.score < s.minScore) break;
      const t0 = bars[c.i0].time, t1 = bars[c.i0 + c.len - 1].time + tfSec;
      if (o.exclude && t0 < o.exclude.t1 && t1 > o.exclude.t0) continue;   // la propia estructura marcada
      let clash = false;
      for (const k of kept) {
        const ov = Math.min(k.i0 + k.len, c.i0 + c.len) - Math.max(k.i0, c.i0);
        if (ov > 0.3 * Math.min(k.len, c.len)) { clash = true; break; }
      }
      if (clash) continue;
      kept.push(c);
      c.t0 = t0; c.t1 = t1;
      let lo = Infinity, hi = -Infinity;
      for (let i = c.i0; i < c.i0 + c.len; i++) { if (A.l[i] < lo) lo = A.l[i]; if (A.h[i] > hi) hi = A.h[i]; }
      c.pLow = lo; c.pHigh = hi;
      c.score = Math.round(c.score * 10) / 10;
      if (kept.length >= s.maxPerTf) break;
    }
    out.matches = kept;
    return out;
  }

  const lib = { SHAPE_N, MIN_BARS, MEASURES, MEASURE_BY_ID, DEFAULT_SEARCH, defaultSearch, defaultMeas, fixSearch, arraysOf, featOf, mirrorFeat, shapeSim, measureSim, compare, sliceByTime, buildPattern, search };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  else root.TVFractal = lib;
})(typeof window !== 'undefined' ? window : globalThis);

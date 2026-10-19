// Funciones puras: temporalidades, agregación de velas e indicadores.
// Funciona en el navegador (window.TVLib) y en Node (para las pruebas).
(function (root) {
  'use strict';

  const DAY = 86400; // segundos
  const WEEK = 7 * DAY;

  // Intervalos que ofrece Binance para armar temporalidades (de mayor a menor).
  const BASES = [
    { id: '12h', sec: 43200 }, { id: '8h', sec: 28800 }, { id: '6h', sec: 21600 },
    { id: '4h', sec: 14400 }, { id: '2h', sec: 7200 }, { id: '1h', sec: 3600 },
    { id: '30m', sec: 1800 }, { id: '15m', sec: 900 }, { id: '5m', sec: 300 },
    { id: '3m', sec: 180 }, { id: '1m', sec: 60 }, { id: '1s', sec: 1 },
  ];

  // Temporalidades por defecto (las que dijiste que usas).
  const DEFAULT_TFS = ['m:1', 'm:5', 'm:15', 'm:40', 'm:60', 'm:240', 'd:1', 'd:4', 'w:1', 'M:1', 'M:4'];

  // Ids antiguos (versión anterior) -> ids nuevos
  const LEGACY = {
    '1m': 'm:1', '5m': 'm:5', '15m': 'm:15', '40m': 'm:40', '1h': 'm:60', '4h': 'm:240',
    '1D': 'd:1', '4D': 'd:4', '1W': 'w:1', '1M': 'M:1', '4M': 'M:4',
  };

  const UNITS = { s: 'segundos', m: 'minutos', h: 'horas', d: 'días', w: 'semanas', M: 'meses', v: 'BTC (volumen)' };

  function fail(msg) { const e = new Error(msg); e.user = true; return e; }

  // Convierte texto como "4,3" o "4.3" en número.
  function parseNumber(text) {
    const t = String(text).trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
    return parseFloat(t);
  }

  // Etiqueta corta de una duración en segundos: 30s, 1m 30s, 2h 5m 10s, 4h 18m
  function labelSeconds(S) {
    if (S >= 86400) {
      const d = Math.floor(S / 86400), h = Math.floor((S % 86400) / 3600), m = Math.floor((S % 3600) / 60), x = S % 60;
      return [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : '', x ? `${x}s` : ''].filter(Boolean).join(' ');
    }
    if (S < 60) return `${S}s`;
    if (S % 60 === 0) return labelMinutes(S / 60);
    const h = Math.floor(S / 3600), m = Math.floor((S % 3600) / 60), x = S % 60;
    return [h ? `${h}h` : '', m ? `${m}m` : '', x ? `${x}s` : ''].filter(Boolean).join(' ');
  }
  function labelMinutes(T) {
    if (T < 60) return `${T}m`;
    if (T % 60 === 0) return `${T / 60}h`;
    return `${Math.floor(T / 60)}h ${T % 60}m`;
  }

  // Duración legible: 30 d 2 h 24 m
  function labelDur(S) {
    const d = Math.floor(S / 86400), h = Math.floor((S % 86400) / 3600), m = Math.floor((S % 3600) / 60), x = S % 60;
    return [d ? `${d} d` : '', h ? `${h} h` : '', m ? `${m} m` : '', x ? `${x} s` : ''].filter(Boolean).join(' ') || '0 s';
  }
  // Máximo de velas base por barra. Si una duración "rara" (por ejemplo 30,1 días) obligaría a armarla con velas de
  // 1 minuto o 1 segundo, el historial tardaría muchísimo y casi no se vería nada: se ajusta a la duración más
  // cercana que se pueda armar con velas más grandes (y se avisa con una nota).
  const MAX_RATIO = 300;
  // Con velas base de 1 minuto o más, hasta este número de velas por barra se respeta la duración EXACTA aunque sea pesada (se carga poco a poco y se guarda en el equipo).
  const MAX_EXACT_RATIO = 20000;

  // Crea una temporalidad a partir de una unidad (m, h, d, w, M) y un valor (acepta decimales).
  // Devuelve { id, label, base, kind, sec, ratio, n?, note? }
  // kind: 'native' = Binance la ofrece tal cual; 'fixed' = bloques fijos de N segundos (desde 00:00 UTC);
  //       'anchor' = bloques de N días/semanas contados desde el primer dato; 'months' = bloques de N meses.
  function makeTf(unit, value) {
    const v = typeof value === 'number' ? value : parseNumber(value);
    if (!(v > 0)) throw fail('Escribe un número mayor que 0 (puedes usar decimales, por ejemplo 4,3).');
    let note = '';
    if (unit === 'v') {
      // Velas por volumen: cada vela se cierra cuando se negocian v unidades (BTC) del activo.
      const vol = Math.round(v * 10000) / 10000;
      if (!(vol > 0)) throw fail('El volumen mínimo es 0,0001.');
      if (vol > 1000000) throw fail('El máximo es 1.000.000.');
      return {
        id: `v:${vol}`, label: `${String(vol).replace('.', ',')} BTC`, base: null, kind: 'vol', vol,
        sec: 60, ratio: 1, note: 'Cada vela se cierra al completarse ese volumen negociado (no depende del reloj).',
      };
    }
    if (unit === 'M') {
      if (!Number.isInteger(v)) throw fail('Los meses deben ser números enteros (1, 2, 3, 4…).');
      if (v > 60) throw fail('El máximo es 60 meses.');
      return {
        id: `M:${v}`, label: v === 1 ? '1 Mes' : `${v} Meses`, base: '1M', kind: v === 1 ? 'native' : 'months',
        n: v, sec: v * 30 * DAY, ratio: v, note,
      };
    }
    if (unit === 'w' && Number.isInteger(v)) {
      if (v > 52) throw fail('El máximo es 52 semanas.');
      return {
        id: `w:${v}`, label: `${v}W`, base: '1w', kind: v === 1 ? 'native' : 'anchor',
        sec: v * WEEK, ratio: v, note: v === 1 ? '' : 'Bloques de semanas contados desde la primera semana con datos.',
      };
    }
    if (unit === 'd' && Number.isInteger(v)) {
      if (v > 365) throw fail('El máximo es 365 días.');
      return {
        id: `d:${v}`, label: `${v}D`, base: '1d', kind: v === 1 ? 'native' : 'anchor',
        sec: v * DAY, ratio: v, note: v === 1 ? '' : 'Bloques de días contados desde el primer día con datos.',
      };
    }
    // Todo lo demás se pasa a segundos (mínimo 1 segundo).
    const factor = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[unit];
    if (!factor) throw fail('Unidad no válida.');
    const exact = v * factor;
    const S = Math.round(exact);
    if (S < 1) throw fail('El mínimo es 1 segundo.');
    if (S > 31536000) throw fail('El máximo es 365 días.');
    if (Math.abs(exact - S) > 1e-9) note = `Se redondeó a ${S} segundos (la resolución mínima es 1 segundo).`;
    if (S % 604800 === 0) { const t = makeTf('w', S / 604800); t.note = note || t.note; return t; }
    if (S % 86400 === 0) { const t = makeTf('d', S / 86400); t.note = note || t.note; return t; }
    const base = BASES.find((b) => b.sec <= S && S % b.sec === 0);
    const ratio = S / base.sec;
    if (ratio > MAX_RATIO && ratio <= MAX_EXACT_RATIO && base.sec >= 60) {
      // Duración exacta: cada barra se arma con muchas velas base. Se avisa de lo que implica.
      note = `Duración exacta: cada barra se arma con ${ratio} velas de ${base.id}. El historial se va cargando poco a poco y se guarda en tu equipo, así la próxima vez abre más rápido.` + (note ? ' ' + note : '');
    } else if (ratio > MAX_RATIO) {
      const grains = [{ sec: 86400 }].concat(BASES); // de la más gruesa a la más fina
      let best = null;
      for (const g of grains) {
        const n = Math.round(S / g.sec);
        if (n < 1 || n > MAX_RATIO) continue;
        const err = Math.abs(n * g.sec - S) / S;
        if (err <= 0.03) { best = { S2: n * g.sec, err }; break; }
        if (!best || err < best.err) best = { S2: n * g.sec, err };
      }
      if (best && best.S2 !== S) {
        const t = makeTf('s', best.S2);
        t.note = `Se ajustó de ${labelDur(S)} a ${labelDur(best.S2)} porque con la duración exacta habría que armar cada barra con ${ratio} velas de ${base.id}. Para mantenerla exacta usa un múltiplo de 5 minutos.` + (note ? ' ' + note : '');
        return t;
      }
    }
    const whole = S % 60 === 0;
    return {
      id: whole ? `m:${S / 60}` : `s:${S}`, label: labelSeconds(S), base: base.id, kind: ratio === 1 ? 'native' : 'fixed',
      sec: S, ratio, note,
    };
  }

  // Id -> temporalidad. Acepta ids antiguos ('1h', '4D'…).
  function tfById(id) {
    const key = LEGACY[id] || id;
    const m = /^([smdwMv]):(\d+(?:\.\d+)?)$/.exec(String(key));
    if (m) {
      try { return makeTf(m[1], Number(m[2])); } catch (e) { /* cae al valor por defecto */ }
    }
    return makeTf('m', 60);
  }
  function normalizeId(id) { return tfById(id).id; }

  const BASE_SEC = {
    '1s': 1, '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400,
    '6h': 21600, '8h': 28800, '12h': 43200, '1d': 86400, '1w': 604800,
  };
  // Segundos de una vela base (null para el mes, que no tiene duración fija).
  function baseSec(tf) { return BASE_SEC[tf.base] || null; }

  function ratioOf(tf) { return tf.kind === 'native' ? 1 : tf.ratio; }
  function needsAnchor(tf) {
    return tf.kind === 'anchor' || (tf.kind === 'months' && 12 % tf.n !== 0);
  }
  function describe(tf) {
    if (tf.kind === 'vol') return `Velas por volumen: cierran cada ${String(tf.vol).replace('.', ',')} (operaciones de futuros en tiempo real).`;
    if (tf.kind === 'native') return `Binance la ofrece directamente (velas de ${tf.base === '1M' ? '1 mes' : tf.base}).`;
    const b = tf.base === '1M' ? 'mes' : tf.base === '1w' ? 'semana' : tf.base;
    return `Se arma con velas de ${b} (${tf.ratio} por barra).`;
  }

  // Inicio (en segundos) del bloque al que pertenece la vela base con tiempo t.
  function bucketStart(tf, t, anchor) {
    if (tf.kind === 'fixed') return Math.floor(t / tf.sec) * tf.sec;
    if (tf.kind === 'anchor') {
      const a = anchor || 0;
      return a + Math.floor((t - a) / tf.sec) * tf.sec;
    }
    if (tf.kind === 'months') {
      const d = new Date(t * 1000);
      const idx = d.getUTCFullYear() * 12 + d.getUTCMonth();
      let b;
      if (12 % tf.n === 0) {
        b = Math.floor(idx / tf.n) * tf.n; // reinicia cada enero
      } else {
        const a = new Date((anchor || t) * 1000);
        const aIdx = a.getUTCFullYear() * 12 + a.getUTCMonth();
        b = aIdx + Math.floor((idx - aIdx) / tf.n) * tf.n;
      }
      return Date.UTC(Math.floor(b / 12), b % 12, 1) / 1000;
    }
    return t;
  }

  // Convierte velas base en velas de la temporalidad pedida.
  // Cada vela: { time (segundos), open, high, low, close, volume }
  function aggregate(base, tf, anchor) {
    if (tf.kind === 'native') return base;
    const out = [];
    let cur = null;
    for (let i = 0; i < base.length; i++) {
      const c = base[i];
      const b = bucketStart(tf, c.time, anchor);
      if (!cur || cur.time !== b) {
        cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
        out.push(cur);
      } else {
        if (c.high > cur.high) cur.high = c.high;
        if (c.low < cur.low) cur.low = c.low;
        cur.close = c.close;
        cur.volume += c.volume;
      }
    }
    return out;
  }

  // Fila de Binance -> vela
  function parseKline(k) {
    return {
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]),
      close: parseFloat(k[4]), volume: parseFloat(k[5]),
    };
  }

  // Une velas nuevas dentro de la lista base (ordenada por tiempo). Devuelve la misma lista.
  function mergeCandles(base, incoming) {
    for (const c of incoming) {
      let i = base.length - 1;
      while (i >= 0 && base[i].time > c.time) i--;
      if (i >= 0 && base[i].time === c.time) base[i] = c;
      else base.splice(i + 1, 0, c);
    }
    return base;
  }

  // Media móvil simple. Devuelve arreglo con null donde no hay valor.
  function sma(closes, n) {
    const out = new Array(closes.length).fill(null);
    if (n < 1) return out;
    let sum = 0;
    for (let i = 0; i < closes.length; i++) {
      sum += closes[i];
      if (i >= n) sum -= closes[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  // Media móvil exponencial, con la primera media simple como semilla (igual que TradingView).
  function ema(closes, n) {
    const out = new Array(closes.length).fill(null);
    if (n < 1 || closes.length < n) return out;
    const k = 2 / (n + 1);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += closes[i];
    let prev = sum / n;
    out[n - 1] = prev;
    for (let i = n; i < closes.length; i++) {
      prev = closes[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  // Decimales a mostrar según los precios cargados.
  function detectPrecision(bars) {
    let max = 2;
    const from = Math.max(0, bars.length - 200);
    for (let i = from; i < bars.length; i++) {
      const s = String(bars[i].close);
      if (s.indexOf('e') >= 0) { max = 8; continue; }
      const dot = s.indexOf('.');
      if (dot >= 0) max = Math.max(max, s.length - dot - 1);
    }
    const last = bars.length ? bars[bars.length - 1].close : 1;
    const cap = last >= 1000 ? 2 : last >= 10 ? 3 : last >= 1 ? 4 : 8;
    return Math.min(max, cap);
  }

  // ---------- Indicadores (valores por defecto de TradingView) ----------
  // Todas las funciones devuelven arreglos del mismo largo que la entrada, con null donde no hay valor.

  // Media móvil de Wilder (RMA), sembrada con la media simple de los primeros n valores.
  function rmaFrom(values, n, startIdx) {
    const out = new Array(values.length).fill(null);
    if (values.length - startIdx < n) return out;
    let sum = 0;
    for (let i = startIdx; i < startIdx + n; i++) sum += values[i];
    let prev = sum / n;
    out[startIdx + n - 1] = prev;
    for (let i = startIdx + n; i < values.length; i++) {
      prev = (prev * (n - 1) + values[i]) / n;
      out[i] = prev;
    }
    return out;
  }

  function rsi(closes, n) {
    const len = closes.length;
    const out = new Array(len).fill(null);
    if (len <= n) return out;
    const gain = new Array(len).fill(0);
    const loss = new Array(len).fill(0);
    for (let i = 1; i < len; i++) {
      const d = closes[i] - closes[i - 1];
      gain[i] = d > 0 ? d : 0;
      loss[i] = d < 0 ? -d : 0;
    }
    const ag = rmaFrom(gain, n, 1);
    const al = rmaFrom(loss, n, 1);
    for (let i = n; i < len; i++) {
      if (ag[i] === null) continue;
      out[i] = al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]);
    }
    return out;
  }

  // EMA de un arreglo que puede empezar con nulls.
  function emaNullable(values, n) {
    const out = new Array(values.length).fill(null);
    let s = 0;
    while (s < values.length && values[s] === null) s++;
    if (s >= values.length) return out;
    const e = ema(values.slice(s), n);
    for (let i = 0; i < e.length; i++) out[s + i] = e[i];
    return out;
  }
  function smaNullable(values, n) {
    const out = new Array(values.length).fill(null);
    let s = 0;
    while (s < values.length && values[s] === null) s++;
    if (s >= values.length) return out;
    const e = sma(values.slice(s), n);
    for (let i = 0; i < e.length; i++) out[s + i] = e[i];
    return out;
  }

  function macd(closes, fast, slow, signal) {
    const ef = ema(closes, fast);
    const es = ema(closes, slow);
    const line = closes.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null));
    const sig = emaNullable(line, signal);
    const hist = line.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i] : null));
    return { macd: line, signal: sig, hist };
  }

  // Estocástico: %K de n velas, suavizado del %K (smoothK) y %D = media simple de %K.
  function stoch(highs, lows, closes, n, smoothK, dLen) {
    const len = closes.length;
    const raw = new Array(len).fill(null);
    for (let i = n - 1; i < len; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - n + 1; j <= i; j++) {
        if (highs[j] > hh) hh = highs[j];
        if (lows[j] < ll) ll = lows[j];
      }
      raw[i] = hh === ll ? 0 : (100 * (closes[i] - ll)) / (hh - ll);
    }
    const k = smoothK > 1 ? smaNullable(raw, smoothK) : raw;
    const d = smaNullable(k, dLen);
    return { k, d };
  }

  function atr(highs, lows, closes, n) {
    const len = closes.length;
    const tr = new Array(len);
    for (let i = 0; i < len; i++) {
      tr[i] = i === 0 ? highs[i] - lows[i]
        : Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    }
    return rmaFrom(tr, n, 0);
  }

  function obv(closes, volumes) {
    const out = new Array(closes.length).fill(null);
    let acc = 0;
    for (let i = 0; i < closes.length; i++) {
      if (i > 0) {
        if (closes[i] > closes[i - 1]) acc += volumes[i];
        else if (closes[i] < closes[i - 1]) acc -= volumes[i];
      }
      out[i] = acc;
    }
    return out;
  }

  // Período (día / semana / mes, en UTC) al que pertenece un instante.
  const PERIOD_SEC = { day: DAY, week: WEEK, month: 28 * DAY };
  function periodKey(time, period) {
    if (period === 'day') return Math.floor(time / DAY);
    if (period === 'week') return Math.floor((time - 4 * DAY) / WEEK); // las semanas empiezan el lunes
    const d = new Date(time * 1000);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  }
  function periodStart(key, period) {
    if (period === 'day') return key * DAY;
    if (period === 'week') return key * WEEK + 4 * DAY;
    return Date.UTC(Math.floor(key / 12), key % 12, 1) / 1000;
  }
  // "auto": día para temporalidades hasta 15m, semana hasta 4h y mes para el resto.
  function resolvePeriod(period, tf) {
    if (period && period !== 'auto') return period;
    return tf.sec <= 900 ? 'day' : tf.sec <= 14400 ? 'week' : 'month';
  }

  // VWAP anclado al día, semana o mes (UTC), con precio típico (H+L+C)/3.
  // Devuelve null si la temporalidad es igual o mayor que el período de anclaje.
  function vwap(bars, tf, anchor) {
    if (tf.sec >= PERIOD_SEC[anchor]) return null;
    const out = new Array(bars.length).fill(null);
    let key = null, pv = 0, vol = 0;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const k = periodKey(b.time, anchor);
      if (k !== key) { key = k; pv = 0; vol = 0; }
      const tp = (b.high + b.low + b.close) / 3;
      pv += tp * b.volume;
      vol += b.volume;
      out[i] = vol > 0 ? pv / vol : tp;
    }
    return out;
  }

  // Pivotes calculados con el máximo, mínimo y cierre del período anterior.
  // Devuelve { ok, reason, period, segments: [{ startIdx, endIdx, extra, levels }] }
  // startIdx/endIdx son posiciones (índices) en `bars`; endIdx es exclusivo; extra = barras que se extienden a la derecha.
  function pivotLevels(prev, type) {
    const H = prev.high, Lo = prev.low, C = prev.close;
    const P = (H + Lo + C) / 3;
    const R = H - Lo;
    if (type === 'fib') {
      return {
        P, R1: P + 0.382 * R, R2: P + 0.618 * R, R3: P + R,
        S1: P - 0.382 * R, S2: P - 0.618 * R, S3: P - R,
      };
    }
    return {
      P, R1: 2 * P - Lo, S1: 2 * P - H, R2: P + R, S2: P - R,
      R3: H + 2 * (P - Lo), S3: Lo - 2 * (H - P),
    };
  }
  function pivots(bars, tf, type, periodSetting, reachedStart) {
    const period = resolvePeriod(periodSetting, tf);
    const res = { ok: true, reason: '', period, segments: [] };
    if (tf.sec > PERIOD_SEC[period]) {
      res.ok = false;
      res.reason = 'La temporalidad es mayor que el período de los pivotes.';
      return res;
    }
    // agrupar velas por período
    const groups = [];
    for (let i = 0; i < bars.length; i++) {
      const k = periodKey(bars[i].time, period);
      const g = groups[groups.length - 1];
      if (g && g.key === k) {
        g.endIdx = i + 1;
        if (bars[i].high > g.high) g.high = bars[i].high;
        if (bars[i].low < g.low) g.low = bars[i].low;
        g.close = bars[i].close;
      } else {
        groups.push({ key: k, startIdx: i, endIdx: i + 1, high: bars[i].high, low: bars[i].low, close: bars[i].close, firstTime: bars[i].time });
      }
    }
    for (let gi = 1; gi < groups.length; gi++) {
      const prev = groups[gi - 1];
      // el primer período cargado puede estar incompleto: no se usa salvo que ya se tenga todo el historial
      if (gi === 1 && !reachedStart && prev.firstTime > periodStart(prev.key, period)) continue;
      const g = groups[gi];
      const isLast = gi === groups.length - 1;
      let extra = 0;
      if (isLast) {
        const perBars = Math.round((periodStart(g.key + 1, period) - periodStart(g.key, period)) / tf.sec);
        extra = Math.max(0, Math.min(400, perBars - (g.endIdx - g.startIdx)));
      }
      res.segments.push({ startIdx: g.startIdx, endIdx: g.endIdx, extra, levels: pivotLevels(prev, type) });
    }
    return res;
  }

  // Conversión entre instantes (segundos) y posiciones lógicas del gráfico (puede ser fraccionaria y salirse de los datos).
  function timeToLogical(bars, tfSec, t) {
    const n = bars.length;
    if (!n) return 0;
    const step0 = n > 1 ? bars[1].time - bars[0].time : tfSec;
    if (t <= bars[0].time) return (t - bars[0].time) / step0;
    if (t >= bars[n - 1].time) return n - 1 + (t - bars[n - 1].time) / tfSec;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time <= t) lo = mid; else hi = mid;
    }
    return lo + (t - bars[lo].time) / (bars[lo + 1].time - bars[lo].time);
  }
  function logicalToTime(bars, tfSec, l) {
    const n = bars.length;
    if (!n) return 0;
    const step0 = n > 1 ? bars[1].time - bars[0].time : tfSec;
    if (l <= 0) return bars[0].time + l * step0;
    if (l >= n - 1) return bars[n - 1].time + (l - (n - 1)) * tfSec;
    const i = Math.floor(l);
    return bars[i].time + (l - i) * (bars[i + 1].time - bars[i].time);
  }
  // Vela que contiene el instante t (o null si queda fuera de los datos).
  function barAtTime(bars, tfSec, t) {
    const n = bars.length;
    if (!n || t < bars[0].time) return null;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bars[mid].time <= t) lo = mid; else hi = mid - 1;
    }
    const lastStep = lo === n - 1 ? tfSec : bars[lo + 1].time - bars[lo].time;
    return t < bars[lo].time + lastStep ? bars[lo] : null;
  }

  // ---------- Velas por volumen ----------
  // trades: [[id, precio, cantidad, tiempoMs], ...] en orden ascendente de id.
  // Cada vela: { time (s, único y creciente), real (ms de su primera operación), open, high, low, close, volume,
  //              a (id de su primera operación), aQ (cantidad total de esa operación), aq (parte que cayó en esta vela) }
  const VEPS = 1e-9;
  function volAppend(bars, trades, N) {
    const touched = bars.length ? bars.length - 1 : 0;
    for (const t of trades) {
      const price = t[1], ms = t[3];
      let q = t[2];
      while (q > VEPS) {
        let cur = bars.length ? bars[bars.length - 1] : null;
        if (!cur || cur.volume >= N - VEPS) {
          const prevTime = cur ? cur.time : 0;
          cur = { time: Math.max(Math.floor(ms / 1000), prevTime + 1), real: ms, open: price, high: price, low: price, close: price, volume: 0, a: t[0], aQ: t[2], aq: 0 };
          bars.push(cur);
        }
        const take = Math.min(q, N - cur.volume);
        if (cur.volume === 0) cur.aq = take;
        if (price > cur.high) cur.high = price;
        if (price < cur.low) cur.low = price;
        cur.close = price;
        cur.volume = N - cur.volume - take < VEPS ? N : cur.volume + take;
        q -= take;
      }
    }
    return touched;
  }

  // Agrega velas ANTERIORES a la primera existente. 'older' = operaciones con id menor que bars[0].a (ascendentes).
  // Devuelve la cantidad de velas agregadas. La vela más antigua queda incompleta y se descarta
  // (sus operaciones se vuelven a leer en la siguiente carga).
  function volPrepend(bars, older, N) {
    if (!bars.length) return 0;
    const head = bars[0];
    const seq = [];
    const rem = head.aQ - head.aq;
    if (rem > VEPS) seq.push([head.a, head.open, rem, head.real]);
    for (let i = older.length - 1; i >= 0; i--) seq.push(older[i]);
    const out = [];
    let cur = null;
    for (const t of seq) {
      const price = t[1];
      let q = t[2];
      while (q > VEPS) {
        if (!cur || cur.volume >= N - VEPS) {
          cur = { time: 0, real: t[3], open: price, high: price, low: price, close: price, volume: 0, a: t[0], aQ: t[2], aq: 0 };
          out.push(cur);
        }
        const take = Math.min(q, N - cur.volume);
        if (price > cur.high) cur.high = price;
        if (price < cur.low) cur.low = price;
        cur.open = price; cur.real = t[3]; cur.a = t[0]; cur.aQ = t[2]; cur.aq = take;
        cur.volume = N - cur.volume - take < VEPS ? N : cur.volume + take;
        q -= take;
      }
    }
    if (out.length && out[out.length - 1].volume < N - VEPS) out.pop();
    if (!out.length) return 0;
    let next = head.time;
    for (const b of out) { b.time = Math.min(Math.floor(b.real / 1000), next - 1); next = b.time; }
    out.reverse();
    bars.unshift(...out);
    return out.length;
  }

  // Minutos promedio por vela (de las últimas 'n' completas).
  function volSpeed(bars, n) {
    const done = bars.slice(0, -1).slice(-(n || 20));
    if (done.length < 2) return null;
    return (done[done.length - 1].real - done[0].real) / (done.length - 1) / 60000;
  }

  // El "negro" no se ve sobre fondo oscuro (y el blanco sobre fondo claro): se invierte.
  function themedColor(color, theme) {
    const c = String(color || '').toLowerCase();
    if (theme === 'dark' && (c === '#000000' || c === '#000')) return '#e0e3eb';
    if (theme === 'light' && (c === '#ffffff' || c === '#fff')) return '#131722';
    return color;
  }

  // ---------- Exchanges (v0.11) ----------
  // Qué velas base ofrece cada uno. Si falta alguna (por ejemplo 1s o 8h en Bybit), la temporalidad se arma con otra más pequeña.
  const ALL_BASES = ['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '1w', '1M'];
  const EXCHANGES = {
    binance: { id: 'binance', name: 'Binance', bases: ALL_BASES },
    bybit: { id: 'bybit', name: 'Bybit', bases: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w', '1M'] },
    kucoin: { id: 'kucoin', name: 'KuCoin', bases: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '1w', '1M'] },
  };
  const exchangeName = (id) => (EXCHANGES[id] || EXCHANGES.binance).name;
  // Inicio de Binance (17-ago-2017, en segundos): en otros exchanges los bloques de N días/semanas/meses se cuentan desde aquí.
  const GENESIS_SEC = Date.UTC(2017, 7, 17) / 1000;
  // Adapta una temporalidad a un exchange. Si no se puede armar con sus velas devuelve una copia con unavailable = true y un motivo.
  function tfFor(tf, exchange) {
    const ex = EXCHANGES[exchange || 'binance'] || EXCHANGES.binance;
    if (tf.kind === 'vol' || ex.bases.includes(tf.base)) return tf;
    const b = BASES.filter((x) => ex.bases.includes(x.id) && x.sec <= tf.sec && tf.sec % x.sec === 0)[0];
    if (!b) return Object.assign({}, tf, { unavailable: true, why: `${ex.name} no ofrece velas de ${tf.base === '1s' ? '1 segundo' : tf.base}, así que no puede armar la temporalidad ${tf.label}. Usa otra temporalidad o cambia de exchange.` });
    const ratio = tf.sec / b.sec;
    return Object.assign({}, tf, { base: b.id, ratio, kind: ratio === 1 ? 'native' : 'fixed', adapted: true });
  }

  const lib = { EXCHANGES, exchangeName, GENESIS_SEC, tfFor, labelDur, MAX_RATIO, MAX_EXACT_RATIO, volAppend, volPrepend, volSpeed, rsi, macd, stoch, atr, obv, vwap, pivots, pivotLevels, periodKey, periodStart, resolvePeriod, timeToLogical, logicalToTime, barAtTime, DEFAULT_TFS, UNITS, makeTf, parseNumber, tfById, normalizeId, needsAnchor, describe, baseSec, ratioOf, bucketStart, aggregate, parseKline, mergeCandles, sma, ema, detectPrecision, themedColor };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  else root.TVLib = lib;
})(typeof window !== 'undefined' ? window : globalThis);

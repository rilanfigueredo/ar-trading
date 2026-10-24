// Motor de scripts propios (v0.20) y estrategias (v0.21): ejecuta un script de JavaScript sobre las velas y devuelve lo que hay que dibujar
// (y, si es una estrategia, las operaciones simuladas por backtest.js).
// Es lógica pura: funciona dentro del Worker (scriptworker.js) y en Node (para las pruebas).
// Reglas: el script solo ve los datos que se le pasan; nunca se inventan valores (un hueco es NaN y no se dibuja).
(function (root) {
  'use strict';

  const BT = (typeof module !== 'undefined' && module.exports) ? require('./backtest.js') : root.TVBacktest;
  const MAX_PLOTS = 16, MAX_LEVELS = 16, MAX_LEN = 100000;
  const DEFAULT_COLORS = ['#2962ff', '#ff9800', '#f23645', '#26a69a', '#7e57c2', '#00bcd4', '#e91e63', '#8bc34a'];
  // Globales que el script no debe poder usar (red, mensajes, etc.). Se tapan como parámetros "undefined".
  const BLOCKED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'postMessage', 'self', 'globalThis',
    'indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel', 'navigator', 'location'];
  // Nombres que el script recibe ya listos.
  const API_NAMES = ['indicator', 'input', 'inputColor', 'plot', 'histogram', 'hline', 'ta', 'open', 'high', 'low', 'close', 'volume',
    'buy', 'sell', 'delta', 'hasBuy', 'time', 'n', 'symbol', 'timeframe', 'tfSec', 'strategy', 'entry', 'exit', 'onBar'];

  // Error "de usuario": se muestra tal cual (con su línea). Los demás errores del script también se traducen.
  function fail(msg) { const e = new Error(msg); e.user = true; return e; }
  const isNaNv = (v) => v !== v;
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  // ---------- Funciones técnicas (todas toleran huecos NaN al inicio y devuelven NaN donde no hay valor) ----------
  function mkNaN(len) { return new Array(len).fill(NaN); }
  function firstValid(a) { let i = 0; while (i < a.length && isNaNv(a[i])) i++; return i; }
  function chkSrc(name, src, n) {
    if (!(Array.isArray(src) || ArrayBuffer.isView(src)) || src.length !== n) {
      throw fail(`ta.${name}: el primer dato debe ser una lista con un número por vela (por ejemplo close). Recibí: ${describeVal(src)}.`);
    }
  }
  function chkLen(name, len, what) {
    if (!Number.isInteger(len) || len < 1 || len > MAX_LEN) throw fail(`ta.${name}: ${what || 'el largo'} debe ser un número entero entre 1 y ${MAX_LEN}. Recibí: ${describeVal(len)}.`);
  }
  function describeVal(v) {
    if (v === undefined) return 'undefined (falta el dato)';
    if (v === null) return 'null';
    if (Array.isArray(v)) return `una lista de ${v.length} valores`;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return `el texto "${v.slice(0, 30)}"`;
    return typeof v;
  }

  function sma(src, len) {
    const n = src.length, out = mkNaN(n);
    let sum = 0, bad = 0;
    for (let i = 0; i < n; i++) {
      const v = src[i];
      if (isNaNv(v)) bad++; else sum += v;
      if (i >= len) { const o = src[i - len]; if (isNaNv(o)) bad--; else sum -= o; }
      if (i >= len - 1 && !bad) out[i] = sum / len;
    }
    return out;
  }
  // EMA con la primera media simple como semilla (igual que TradingView). alpha por defecto 2/(len+1); la RMA de Wilder usa 1/len.
  function emaGen(src, len, alpha) {
    const n = src.length, out = mkNaN(n);
    const s0 = firstValid(src);
    if (s0 + len > n) return out;
    let sum = 0, cnt = 0, i = s0;
    for (; i < n && cnt < len; i++) { if (isNaNv(src[i])) return finishGap(); sum += src[i]; cnt++; }
    let prev = sum / len;
    out[i - 1] = prev;
    for (; i < n; i++) {
      const v = src[i];
      if (isNaNv(v)) continue;            // hueco: no se dibuja y el cálculo sigue desde el último valor
      prev = v * alpha + prev * (1 - alpha);
      out[i] = prev;
    }
    return out;
    function finishGap() {
      // hay un hueco dentro de la ventana de arranque: se reintenta desde después del hueco
      let j = s0;
      while (j < n && !isNaNv(src[j])) j++;
      const rest = emaGen(src.slice(j + 1), len, alpha);
      for (let k = 0; k < rest.length; k++) out[j + 1 + k] = rest[k];
      return out;
    }
  }
  const ema = (src, len) => emaGen(src, len, 2 / (len + 1));
  const rma = (src, len) => emaGen(src, len, 1 / len);
  function wma(src, len) {
    const n = src.length, out = mkNaN(n), den = (len * (len + 1)) / 2;
    for (let i = len - 1; i < n; i++) {
      let s = 0, ok = true;
      for (let j = 0; j < len; j++) { const v = src[i - len + 1 + j]; if (isNaNv(v)) { ok = false; break; } s += v * (j + 1); }
      if (ok) out[i] = s / den;
    }
    return out;
  }
  function windowFn(src, len, fn) {
    const n = src.length, out = mkNaN(n);
    for (let i = len - 1; i < n; i++) {
      let ok = true;
      for (let j = i - len + 1; j <= i; j++) if (isNaNv(src[j])) { ok = false; break; }
      if (ok) out[i] = fn(i - len + 1, i);
    }
    return out;
  }
  const highest = (src, len) => windowFn(src, len, (a, b) => { let m = -Infinity; for (let j = a; j <= b; j++) if (src[j] > m) m = src[j]; return m; });
  const lowest = (src, len) => windowFn(src, len, (a, b) => { let m = Infinity; for (let j = a; j <= b; j++) if (src[j] < m) m = src[j]; return m; });
  const sum = (src, len) => { const m = sma(src, len); return m.map((v) => v * len); };
  // Desviación estándar de la población (igual que ta.stdev de TradingView).
  function stdev(src, len) {
    return windowFn(src, len, (a, b) => {
      let m = 0;
      for (let j = a; j <= b; j++) m += src[j];
      m /= len;
      let q = 0;
      for (let j = a; j <= b; j++) { const d = src[j] - m; q += d * d; }
      return Math.sqrt(q / len);
    });
  }
  function change(src, len) {
    const out = mkNaN(src.length);
    for (let i = len; i < src.length; i++) out[i] = src[i] - src[i - len];
    return out;
  }
  function cum(src) {
    const out = mkNaN(src.length);
    let acc = 0, started = false;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (isNaNv(v)) { if (started) out[i] = NaN; continue; }
      started = true; acc += v; out[i] = acc;
    }
    return out;
  }
  function rsi(src, len) {
    const n = src.length, out = mkNaN(n);
    const up = mkNaN(n), dn = mkNaN(n);
    for (let i = 1; i < n; i++) {
      const d = src[i] - src[i - 1];
      if (isNaNv(d)) continue;
      up[i] = d > 0 ? d : 0; dn[i] = d < 0 ? -d : 0;
    }
    const au = rma(up, len), ad = rma(dn, len);
    for (let i = 0; i < n; i++) {
      if (isNaNv(au[i]) || isNaNv(ad[i])) continue;
      out[i] = ad[i] === 0 ? 100 : 100 - 100 / (1 + au[i] / ad[i]);
    }
    return out;
  }
  function macd(src, fast, slow, sig) {
    const ef = ema(src, fast), es = ema(src, slow);
    const line = src.map((_, i) => (isNaNv(ef[i]) || isNaNv(es[i]) ? NaN : ef[i] - es[i]));
    const signal = ema(line, sig);
    const hist = line.map((v, i) => (isNaNv(v) || isNaNv(signal[i]) ? NaN : v - signal[i]));
    return { macd: line, signal, hist };
  }
  function bb(src, len, mult) {
    const mid = sma(src, len), sd = stdev(src, len);
    return { mid, upper: mid.map((v, i) => v + mult * sd[i]), lower: mid.map((v, i) => v - mult * sd[i]) };
  }
  function cross(a, b, dir, n) {
    const A = typeof a === 'number' ? new Array(n).fill(a) : a, B = typeof b === 'number' ? new Array(n).fill(b) : b;
    const out = new Array(n).fill(false);
    for (let i = 1; i < n; i++) {
      const x0 = A[i - 1], x1 = A[i], y0 = B[i - 1], y1 = B[i];
      if (isNaNv(x0) || isNaNv(x1) || isNaNv(y0) || isNaNv(y1)) continue;
      out[i] = dir > 0 ? (x1 > y1 && x0 <= y0) : (x1 < y1 && x0 >= y0);
    }
    return out;
  }

  // Construye el objeto "ta" que ve el script (valida los datos y da mensajes claros).
  function makeTa(d) {
    const n = d.n;
    return {
      sma(src, len) { chkSrc('sma', src, n); chkLen('sma', len); return sma(src, len); },
      ema(src, len) { chkSrc('ema', src, n); chkLen('ema', len); return ema(src, len); },
      rma(src, len) { chkSrc('rma', src, n); chkLen('rma', len); return rma(src, len); },
      wma(src, len) { chkSrc('wma', src, n); chkLen('wma', len); return wma(src, len); },
      rsi(src, len) { chkSrc('rsi', src, n); chkLen('rsi', len); return rsi(src, len); },
      macd(src, fast, slow, signal) {
        chkSrc('macd', src, n); chkLen('macd', fast, 'el largo rápido'); chkLen('macd', slow, 'el largo lento'); chkLen('macd', signal, 'el largo de la señal');
        return macd(src, fast, slow, signal);
      },
      // Estocástico de las velas del gráfico: ta.stoch(14, 1, 3) devuelve { k, d }
      stoch(len, smoothK, dLen) {
        chkLen('stoch', len); chkLen('stoch', smoothK, 'el suavizado'); chkLen('stoch', dLen, 'el largo de %D');
        const hh = highest(d.high, len), ll = lowest(d.low, len);
        const raw = d.close.map((c, i) => (isNaNv(hh[i]) || isNaNv(ll[i]) ? NaN : (hh[i] === ll[i] ? 0 : (100 * (c - ll[i])) / (hh[i] - ll[i]))));
        const k = smoothK > 1 ? sma(raw, smoothK) : raw;
        return { k, d: sma(k, dLen) };
      },
      // ATR de las velas del gráfico: ta.atr(14)
      atr(len) {
        chkLen('atr', len);
        const tr = d.high.map((h, i) => (i === 0 ? h - d.low[i] : Math.max(h - d.low[i], Math.abs(h - d.close[i - 1]), Math.abs(d.low[i] - d.close[i - 1]))));
        return rma(tr, len);
      },
      obv() {
        const out = mkNaN(n);
        let acc = 0;
        for (let i = 0; i < n; i++) {
          if (i > 0) { if (d.close[i] > d.close[i - 1]) acc += d.volume[i]; else if (d.close[i] < d.close[i - 1]) acc -= d.volume[i]; }
          out[i] = acc;
        }
        return out;
      },
      bb(src, len, mult) {
        chkSrc('bb', src, n); chkLen('bb', len);
        if (typeof mult !== 'number' || !(mult > 0)) throw fail(`ta.bb: el multiplicador debe ser un número mayor que 0. Recibí: ${describeVal(mult)}.`);
        return bb(src, len, mult);
      },
      stdev(src, len) { chkSrc('stdev', src, n); chkLen('stdev', len); return stdev(src, len); },
      highest(src, len) { chkSrc('highest', src, n); chkLen('highest', len); return highest(src, len); },
      lowest(src, len) { chkSrc('lowest', src, n); chkLen('lowest', len); return lowest(src, len); },
      sum(src, len) { chkSrc('sum', src, n); chkLen('sum', len); return sum(src, len); },
      change(src, len) { chkSrc('change', src, n); if (len === undefined) len = 1; chkLen('change', len); return change(src, len); },
      cum(src) { chkSrc('cum', src, n); return cum(src); },
      crossover(a, b) { if (typeof a !== 'number') chkSrc('crossover', a, n); if (typeof b !== 'number') chkSrc('crossover', b, n); return cross(a, b, 1, n); },
      crossunder(a, b) { if (typeof a !== 'number') chkSrc('crossunder', a, n); if (typeof b !== 'number') chkSrc('crossunder', b, n); return cross(a, b, -1, n); },
    };
  }

  // ---------- Colores ----------
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i;
  const validColor = (c) => typeof c === 'string' && (HEX.test(c.trim()) || RGB.test(c.trim()));

  // ---------- Ejecución ----------
  // req: { code, params, data: {time, open, high, low, close, volume, buy|null}, meta: {symbol, timeframe, tfSec, name} }
  // Devuelve { ok: true, ... } o lanza (el llamador usa explainError). Nunca devuelve resultados a medias.
  function run(req) {
    const t0 = Date.now();
    if (typeof req.code !== 'string' || !req.code.trim()) throw fail('El script está vacío.');
    const fn = compile(req.code);
    const out = exec(fn, req, req.data);
    if (out.strategy) {
      out.strategy.lookahead = lookaheadCheck(fn, req, out, Date.now() - t0);
      delete out.strategy.signals;
    }
    out.ms = Date.now() - t0;
    return out;
  }

  // Control de "datos del futuro" (segunda barrera; la primera es que, dentro de onBar, las listas no dejan leer más allá de la vela actual).
  // Se vuelve a correr la estrategia con las primeras velas de la lista, cortando en varios puntos: si las órdenes de esas velas cambian,
  // es que usó datos que aún no existían (por ejemplo una lista armada antes con close[i + 1]). Reduce el riesgo; no es una garantía absoluta.
  function lookaheadCheck(fn, req, main, tMain) {
    const raw = req.data, n = raw.close.length;
    if (n < 60) return { checked: false, why: 'hay pocas velas para comprobarlo' };
    if (tMain > 1200) return { checked: false, why: 'la estrategia es muy pesada para repetirla' };
    const budget = Math.max(150, Math.min(1000, tMain * 6));
    const same = (u, v) => {
      if (u === v) return true;
      if (typeof u === 'number' && typeof v === 'number') return Math.abs(u - v) <= 1e-9 * Math.max(1, Math.abs(u), Math.abs(v));
      return false;
    };
    const keys = ['i', 'k', 'side', 'sl', 'tp', 'slPct', 'tpPct', 'size'];
    const t0 = Date.now();
    let done = 0;
    for (const frac of [0.95, 0.85, 0.75, 0.65, 0.55, 0.45]) {
      const cut = Math.floor(n * frac);
      if (cut < 30) break;
      if (done && Date.now() - t0 + tMain * frac > budget) break;
      const sl = (a) => (a ? Array.prototype.slice.call(a, 0, cut) : a);
      const part = { time: sl(raw.time), open: sl(raw.open), high: sl(raw.high), low: sl(raw.low), close: sl(raw.close), volume: sl(raw.volume), buy: raw.buy ? sl(raw.buy) : null };
      let r2;
      try { r2 = exec(fn, req, part); } catch (e) { return done ? { checked: true, cuts: done } : { checked: false, why: 'la estrategia no se pudo repetir con menos velas' }; }
      const A = main.strategy.signals.filter((x) => x.i < cut), B = r2.strategy.signals.filter((x) => x.i < cut);
      for (let k = 0; k < Math.max(A.length, B.length); k++) {
        const a = A[k], b = B[k];
        if (!a || !b || !keys.every((key) => same(a[key], b[key]))) {
          const bar = Math.min(a ? a.i : Infinity, b ? b.i : Infinity);
          throw fail(`La estrategia usa datos del futuro: sus órdenes cambian al quitarle las últimas velas (primera diferencia en la vela ${bar + 1}). Revisa que no leas velas siguientes (close[i + 1]) ni listas calculadas con todos los datos (por ejemplo el máximo de toda la lista).`);
        }
      }
      done++;
    }
    return done ? { checked: true, cuts: done } : { checked: false, why: 'hay pocas velas para comprobarlo' };
  }

  // Ejecuta el script una vez sobre los datos dados (y, si es estrategia, la simula vela a vela).
  function exec(fn, req, raw) {
    const n = raw.close.length;
    const arr = (a) => Array.from(a, (v) => (v === null || v === undefined ? NaN : v));
    const d = { n, time: arr(raw.time), open: arr(raw.open), high: arr(raw.high), low: arr(raw.low), close: arr(raw.close), volume: arr(raw.volume) };
    const hasBuy = !!raw.buy;
    const noBuy = () => {
      const msg = 'Este gráfico no tiene volumen de compra: el exchange o la fuente de datos elegida no lo entrega. Usa Binance con velas del exchange o con operaciones reales.';
      return new Proxy([], { get() { throw fail(msg); }, has() { throw fail(msg); }, ownKeys() { throw fail(msg); } });
    };
    let buy, sell, delta;
    if (hasBuy) {
      buy = arr(raw.buy);
      sell = d.volume.map((v, i) => v - buy[i]);
      delta = d.volume.map((v, i) => 2 * buy[i] - v);
    } else { buy = noBuy(); sell = noBuy(); delta = noBuy(); }

    // Primera barrera contra datos del futuro: en una estrategia, dentro de onBar las listas no dejan leer más allá de la vela actual.
    const guardOn = /\bstrategy\s*\(/.test(req.code);
    const guard = (arr) => {
      if (!guardOn || !Array.isArray(arr)) return arr;
      return new Proxy(arr, {
        get(t, k) {
          if (inBar && typeof k === 'string') {
            const c = k.charCodeAt(0);
            if (c >= 48 && c <= 57 && Number(k) > curBar) throw fail(`Estás en la vela ${curBar + 1} y pides la vela ${Number(k) + 1}: eso es usar datos del futuro. Dentro de onBar solo se puede leer hasta la vela i (por ejemplo close[i], close[i - 1]).`);
          }
          return t[k];
        },
      });
    };
    const params = req.params || {};
    const meta = req.meta || {};
    const out = { name: meta.name || 'Script', overlay: false, precision: null, inputs: [], plots: [], levels: [] };
    const inputIds = new Set();
    let declared = false;
    // Estrategia (v0.21)
    let strat = null, simRef = null, inBar = false, curBar = -1;
    const sizeOf = (fnName, label, v) => {
      if (!isNum(v) || !(v > 0)) throw fail(`${fnName}(): "${label}" debe ser un número mayor que 0. Recibí: ${describeVal(v)}.`);
      return v;
    };

    function checkSeries(fnName, series, opts) {
      let s = series;
      if (typeof s === 'number') s = new Array(n).fill(s);
      if (!(Array.isArray(s) || ArrayBuffer.isView(s))) throw fail(`${fnName}(): el primer dato debe ser una lista con un número por vela (por ejemplo close o ta.sma(close, 20)). Recibí: ${describeVal(series)}.`);
      if (s.length !== n) throw fail(`${fnName}(): la lista tiene ${s.length} valores y el gráfico tiene ${n} velas. Debe haber un valor por vela.`);
      const vals = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const v = s[i];
        if (v === null || v === undefined) { vals[i] = NaN; continue; }
        if (typeof v !== 'number') throw fail(`${fnName}(): el valor de la vela ${i + 1} no es un número (es ${describeVal(v)}).`);
        vals[i] = isFinite(v) ? v : NaN;
      }
      return vals;
    }
    function colorArg(fnName, c, fallback) {
      if (c === undefined || c === null) return { color: fallback, colors: null };
      if (typeof c === 'string') {
        if (!validColor(c)) throw fail(`${fnName}(): el color "${c}" no es válido. Usa por ejemplo '#2962ff' o 'rgba(41,98,255,0.5)'.`);
        return { color: c.trim(), colors: null };
      }
      if (Array.isArray(c)) {
        if (c.length !== n) throw fail(`${fnName}(): la lista de colores tiene ${c.length} valores y el gráfico tiene ${n} velas.`);
        const seen = new Set();
        const colors = new Array(n);
        for (let i = 0; i < n; i++) {
          const x = c[i];
          if (x === null || x === undefined || x === false) { colors[i] = null; continue; }
          if (!seen.has(x)) { if (!validColor(x)) throw fail(`${fnName}(): el color de la vela ${i + 1} ("${x}") no es válido.`); seen.add(x); }
          colors[i] = String(x).trim();
        }
        return { color: fallback, colors };
      }
      throw fail(`${fnName}(): "color" debe ser un texto como '#2962ff' o una lista con un color por vela.`);
    }
    const styleOf = (fnName, s) => {
      if (s === undefined) return 'solid';
      if (!['solid', 'dashed', 'dotted'].includes(s)) throw fail(`${fnName}(): "style" debe ser 'solid', 'dashed' o 'dotted'.`);
      return s;
    };
    const widthOf = (fnName, w, def) => {
      if (w === undefined) return def;
      if (!Number.isInteger(w) || w < 1 || w > 6) throw fail(`${fnName}(): "width" debe ser un entero entre 1 y 6.`);
      return w;
    };

    const api = {
      indicator(o) {
        if (declared) throw fail(strat ? 'Un script es un indicador o una estrategia, no los dos: quita indicator() o strategy().' : 'indicator() solo se puede usar una vez.');
        declared = true;
        o = o || {};
        if (typeof o !== 'object') throw fail("indicator() recibe un objeto, por ejemplo indicator({ name: 'Mi indicador', overlay: true }).");
        if (o.name !== undefined) out.name = String(o.name).slice(0, 60);
        if (o.overlay !== undefined) out.overlay = !!o.overlay;
        if (o.precision !== undefined) {
          if (!Number.isInteger(o.precision) || o.precision < 0 || o.precision > 8) throw fail('indicator(): "precision" debe ser un entero entre 0 y 8.');
          out.precision = o.precision;
        }
      },
      // strategy({ name, overlay, capital, sizeType, size, commission, makerCommission, slippage }): convierte el script en una estrategia con backtest.
      // Capital, tipo y valor del tamaño, comisiones y deslizamiento quedan como parámetros editables del gráfico.
      // Por defecto: comisión de Binance Futuros USDT (taker 0,05 %, maker 0,02 %; verificar en la cuenta propia) y deslizamiento 0,01 %.
      strategy(o) {
        if (declared) throw fail(strat ? 'strategy() solo se puede usar una vez.' : 'Un script es un indicador o una estrategia, no los dos: quita indicator() o strategy().');
        declared = true;
        o = o || {};
        if (typeof o !== 'object') throw fail("strategy() recibe un objeto, por ejemplo strategy({ name: 'Mi estrategia', capital: 10000, sizeType: 'percent', size: 100 }).");
        if (o.name !== undefined) out.name = String(o.name).slice(0, 60);
        out.overlay = o.overlay === undefined ? true : !!o.overlay;
        out.mode = 'strategy';
        const num = (key, label, def, min, max, step) => {
          const v = o[key] === undefined ? def : o[key];
          if (!isNum(v) || v < min || v > max) throw fail(`strategy(): "${key}" debe ser un número entre ${min} y ${max}. Recibí: ${describeVal(v)}.`);
          const val = api.input(label, v, { min, max, step });
          const it = out.inputs[out.inputs.length - 1]; it.builtin = true;
          return val;
        };
        const SIZE_TYPES = { percent: '% del capital', amount: 'Monto fijo', contracts: 'Contratos' };
        if (o.sizeType !== undefined && !SIZE_TYPES[o.sizeType]) throw fail("strategy(): \"sizeType\" debe ser 'percent' (% del capital), 'amount' (monto fijo) o 'contracts' (contratos).");
        const defType = o.sizeType || 'percent';
        const capital = num('capital', 'Capital inicial', 10000, 1, 1e12, 100);
        const typeLabel = api.input('Tipo de tamaño', SIZE_TYPES[defType], { options: Object.keys(SIZE_TYPES).map((k) => SIZE_TYPES[k]) });
        out.inputs[out.inputs.length - 1].builtin = true;
        const sizeType = Object.keys(SIZE_TYPES).find((k) => SIZE_TYPES[k] === typeLabel);
        const defSize = o.size !== undefined ? o.size : (defType === 'percent' ? 100 : (defType === 'amount' ? 1000 : 0.01));
        if (!isNum(defSize) || !(defSize > 0) || (defType === 'percent' && defSize > 100)) throw fail(`strategy(): "size" debe ser un número mayor que 0${defType === 'percent' ? ' y hasta 100 (es un % del capital)' : ''}. Recibí: ${describeVal(defSize)}.`);
        let size = api.input('Tamaño', defSize, { min: 1e-8, max: 1e12, step: 'any' });
        out.inputs[out.inputs.length - 1].builtin = true;
        let sizeClamped = false;
        if (sizeType === 'percent' && size > 100) { size = 100; sizeClamped = true; }
        const settings = {
          capital, sizeType, size, sizeClamped,
          commission: num('commission', 'Comisión taker (% por lado, órdenes de mercado)', 0.05, 0, 5, 0.01),
          makerCommission: num('makerCommission', 'Comisión maker (% por lado, objetivos)', 0.02, 0, 5, 0.01),
          slippage: num('slippage', 'Deslizamiento (% por orden de mercado)', 0.01, 0, 5, 0.01),
        };
        strat = { settings, onBar: null, signals: [] };
      },
      onBar(f) {
        if (!strat) throw fail('onBar() es para estrategias: declara antes strategy({ ... }).');
        if (strat.onBar) throw fail('onBar() solo se puede usar una vez.');
        if (typeof f !== 'function') throw fail('onBar() recibe una función, por ejemplo onBar(function (i, pos) { ... }).');
        strat.onBar = f;
      },
      // entry('long' | 'short', { sl, tp, slPct, tpPct, size }): orden de mercado que se ejecuta en la apertura de la vela siguiente.
      entry(side, o) {
        if (!inBar) throw fail("entry() solo se puede usar dentro de onBar(function (i, pos) { ... }).");
        if (side !== 'long' && side !== 'short') throw fail(`entry(): el primer dato debe ser 'long' o 'short'. Recibí: ${describeVal(side)}.`);
        o = o || {};
        if (typeof o !== 'object') throw fail('entry(): el segundo dato es un objeto, por ejemplo entry(\'long\', { slPct: 2, tpPct: 4 }).');
        const q = {};
        if (o.sl !== undefined && o.slPct !== undefined) throw fail('entry(): usa "sl" (precio) o "slPct" (porcentaje), no los dos.');
        if (o.tp !== undefined && o.tpPct !== undefined) throw fail('entry(): usa "tp" (precio) o "tpPct" (porcentaje), no los dos.');
        ['sl', 'tp', 'slPct', 'tpPct'].forEach((k) => { if (o[k] !== undefined) q[k] = sizeOf('entry', k, o[k]); });
        if (o.size !== undefined) { q.size = sizeOf('entry', 'size', o.size); if (strat.settings.sizeType === 'percent' && q.size > 100) throw fail('entry(): con el tamaño en % del capital, "size" no puede pasar de 100 (no hay apalancamiento).'); }
        strat.signals.push({ i: curBar, k: 'entry', side, sl: q.sl, tp: q.tp, slPct: q.slPct, tpPct: q.tpPct, size: q.size });
        simRef.queueEntry(side, q);
      },
      // exit(): cierra la posición en la apertura de la vela siguiente. exit({ sl, tp, slPct, tpPct }): mueve el stop/objetivo (null lo quita).
      exit(o) {
        if (!inBar) throw fail("exit() solo se puede usar dentro de onBar(function (i, pos) { ... }).");
        if (o === undefined) { strat.signals.push({ i: curBar, k: 'exit' }); simRef.queueExit(); return; }
        if (typeof o !== 'object' || o === null) throw fail('exit(): sin datos cierra la posición; con un objeto mueve el stop o el objetivo, por ejemplo exit({ sl: 95000 }).');
        const q = {};
        if (o.sl !== undefined && o.slPct !== undefined) throw fail('exit(): usa "sl" (precio) o "slPct" (porcentaje), no los dos.');
        if (o.tp !== undefined && o.tpPct !== undefined) throw fail('exit(): usa "tp" (precio) o "tpPct" (porcentaje), no los dos.');
        ['sl', 'tp', 'slPct', 'tpPct'].forEach((k) => { if (o[k] !== undefined && o[k] !== null) q[k] = sizeOf('exit', k, o[k]); else if (o[k] === null) q[k] = null; });
        if (!Object.keys(q).length) throw fail('exit(): el objeto debe traer sl, tp, slPct o tpPct. Para cerrar la posición usa exit() sin datos.');
        if (q.sl === null) { q.sl = undefined; q.slPct = null; }
        if (q.tp === null) { q.tp = undefined; q.tpPct = null; }
        strat.signals.push({ i: curBar, k: 'stops', sl: q.sl, tp: q.tp, slPct: q.slPct, tpPct: q.tpPct });
        simRef.setStops(curBar, q);
      },
      input(label, def, o) {
        if (typeof label !== 'string' || !label) throw fail('input(): el primer dato es el nombre del parámetro (texto), por ejemplo input("Largo", 14).');
        if (inputIds.has(label)) throw fail(`input(): ya existe un parámetro llamado "${label}".`);
        inputIds.add(label);
        o = o || {};
        const raw0 = params[label];
        let item;
        if (typeof def === 'number') {
          if (!isFinite(def)) throw fail(`input("${label}"): el valor por defecto debe ser un número.`);
          let v = typeof raw0 === 'number' && isFinite(raw0) ? raw0 : def;
          if (o.min !== undefined && v < o.min) v = o.min;
          if (o.max !== undefined && v > o.max) v = o.max;
          if (o.int && !Number.isInteger(v)) v = Math.round(v);
          item = { label, type: 'number', value: v, def, min: o.min, max: o.max, step: o.step !== undefined ? o.step : (Number.isInteger(def) ? 1 : 0.1) };
        } else if (typeof def === 'boolean') {
          item = { label, type: 'boolean', value: typeof raw0 === 'boolean' ? raw0 : def, def };
        } else if (typeof def === 'string') {
          const opts = Array.isArray(o.options) ? o.options.map(String) : null;
          let v = typeof raw0 === 'string' ? raw0 : def;
          if (opts && !opts.includes(v)) v = opts.includes(def) ? def : opts[0];
          item = { label, type: 'string', value: v, def, options: opts };
        } else throw fail(`input("${label}"): el valor por defecto debe ser un número, true/false o un texto.`);
        out.inputs.push(item);
        return item.value;
      },
      inputColor(label, def) {
        if (typeof label !== 'string' || !label) throw fail('inputColor(): el primer dato es el nombre del color (texto), por ejemplo inputColor("Color", "#2962ff").');
        if (inputIds.has(label)) throw fail(`inputColor(): ya existe un parámetro llamado "${label}".`);
        if (typeof def !== 'string' || !/^#[0-9a-f]{6}$/i.test(def)) throw fail(`inputColor("${label}"): el color por defecto debe ser como '#2962ff' (6 dígitos).`);
        inputIds.add(label);
        const raw0 = params[label];
        const v = typeof raw0 === 'string' && /^#[0-9a-f]{6}$/i.test(raw0) ? raw0.toLowerCase() : def.toLowerCase();
        out.inputs.push({ label, type: 'color', value: v, def: def.toLowerCase() });
        return v;
      },
      plot(series, o) {
        if (out.plots.length >= MAX_PLOTS) throw fail(`Máximo ${MAX_PLOTS} líneas o histogramas por script.`);
        o = o || {};
        const values = checkSeries('plot', series);
        const c = colorArg('plot', o.color, DEFAULT_COLORS[out.plots.length % DEFAULT_COLORS.length]);
        out.plots.push({ kind: 'line', title: String(o.title !== undefined ? o.title : `Línea ${out.plots.length + 1}`).slice(0, 40), color: c.color, colors: c.colors, width: widthOf('plot', o.width, 2), style: styleOf('plot', o.style), values });
      },
      histogram(series, o) {
        if (out.plots.length >= MAX_PLOTS) throw fail(`Máximo ${MAX_PLOTS} líneas o histogramas por script.`);
        o = o || {};
        const values = checkSeries('histogram', series);
        const up = colorArg('histogram', o.colorUp, '#26a69a').color, down = colorArg('histogram', o.colorDown, '#ef5350').color;
        let colors = null, color = o.colorUp === undefined && o.colorDown === undefined ? '#2962ff' : null;
        if (o.color !== undefined) { const c = colorArg('histogram', o.color, '#2962ff'); color = c.color; colors = c.colors; }
        else if (color === null) { colors = new Array(n); for (let i = 0; i < n; i++) colors[i] = values[i] >= 0 ? up : down; }
        out.plots.push({ kind: 'hist', title: String(o.title !== undefined ? o.title : `Histograma ${out.plots.length + 1}`).slice(0, 40), color: color || up, colors, width: 1, style: 'solid', values });
      },
      hline(value, o) {
        if (out.levels.length >= MAX_LEVELS) throw fail(`Máximo ${MAX_LEVELS} niveles por script.`);
        if (typeof value !== 'number' || !isFinite(value)) throw fail(`hline(): el primer dato debe ser un número (el precio o valor del nivel). Recibí: ${describeVal(value)}.`);
        o = o || {};
        const c = colorArg('hline', o.color, '#787b86');
        if (c.colors) throw fail('hline(): "color" debe ser un solo color.');
        out.levels.push({ value, title: String(o.title !== undefined ? o.title : '').slice(0, 40), color: c.color, width: widthOf('hline', o.width, 1), style: styleOf('hline', o.style === undefined ? 'dashed' : o.style) });
      },
    };
    const ta = makeTa(d);
    if (guardOn) {
      const wrapRes = (r) => (Array.isArray(r) ? guard(r) : (r && typeof r === 'object' ? Object.keys(r).reduce((o, k) => { o[k] = guard(r[k]); return o; }, {}) : r));
      Object.keys(ta).forEach((k) => { const f = ta[k]; ta[k] = function () { return wrapRes(f.apply(this, arguments)); }; });
    }
    const values = {
      indicator: api.indicator, input: api.input, inputColor: api.inputColor, plot: api.plot, histogram: api.histogram, hline: api.hline, ta,
      open: guard(d.open), high: guard(d.high), low: guard(d.low), close: guard(d.close), volume: guard(d.volume),
      buy: hasBuy ? guard(buy) : buy, sell: hasBuy ? guard(sell) : sell, delta: hasBuy ? guard(delta) : delta, hasBuy, time: guard(d.time), n,
      symbol: String(meta.symbol || ''), timeframe: String(meta.timeframe || ''), tfSec: Number(meta.tfSec) || 0,
      strategy: api.strategy, entry: api.entry, exit: api.exit, onBar: api.onBar,
    };
    fn.apply(undefined, API_NAMES.map((k) => values[k]).concat(BLOCKED.map(() => undefined)));
    if (strat) {
      if (!strat.onBar) throw fail('La estrategia necesita onBar(function (i, pos) { ... }) con las reglas de entrada y salida.');
      const sim = BT.create({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }, strat.settings);
      simRef = sim; inBar = true;
      try {
        for (let i = 0; i < n; i++) {
          sim.step(i); curBar = i;
          try { strat.onBar(i, sim.view(i)); } catch (e) {
            if (e && typeof e === 'object' && e.bar === undefined) { e.bar = i; e.barTime = d.time[i]; }
            throw e;
          }
        }
      } finally { inBar = false; }
      const r = sim.finish();
      out.strategy = { settings: strat.settings, trades: r.trades, equity: r.equity, report: r.report, signals: strat.signals };
    }
    if (!strat && !out.plots.length) {
      throw fail('El script no dibuja nada: usa plot(...) para una línea o histogram(...) para barras.');
    }
    if (out.overlay && out.plots.some((p) => p.kind === 'hist')) {
      throw fail("Los histogramas solo se pueden dibujar en un panel aparte: usa indicator({ overlay: false }) o cambia histogram por plot.");
    }
    return out;
  }

  // Compila con "use strict" en la misma línea que la primera del usuario: así las líneas de los errores coinciden con las del editor.
  function compile(code) {
    try {
      return new Function(...API_NAMES, ...BLOCKED, '"use strict";' + code);
    } catch (e) {
      if (e instanceof SyntaxError) throw syntaxWithLine(code, e);
      throw e;
    }
  }
  // new Function no dice en qué línea está el error de sintaxis: se compilan trozos cada vez más largos hasta que falle.
  function syntaxWithLine(code, orig) {
    const lines = code.split('\n');
    const incomplete = /end of input|Unterminated|Unexpected end|missing \)|Unclosed/i;
    for (let k = 1; k <= lines.length; k++) {
      try { new Function(...API_NAMES, ...BLOCKED, '"use strict";' + lines.slice(0, k).join('\n')); } catch (e) {
        if (e instanceof SyntaxError && !incomplete.test(e.message)) { const r = new SyntaxError(e.message); r.line = k; return r; }
      }
    }
    const r = new SyntaxError(orig.message); r.line = lines.length; return r;
  }

  // Traduce un error cualquiera a { kind, line, message } (en español, sin jerga).
  function explainError(e, code) {
    const nLines = String(code || '').split('\n').length;
    let msg = e && e.message ? String(e.message) : String(e);
    let line = null;
    let kind = 'runtime';
    if (e && e.line) line = e.line;
    else if (e && e.stack) {
      const m = /<anonymous>:(\d+):(\d+)/.exec(String(e.stack));
      if (m) line = Number(m[1]) - 2;
    }
    if (e instanceof SyntaxError) kind = 'syntax';
    else if (e && e.user) kind = 'api';
    if (line !== null && (line < 1 || line > nLines)) line = line < 1 ? 1 : nLines;
    const tr = [
      [/^(\w+) is not defined$/, (m) => `«${m[1]}» no existe. Revisa que esté bien escrito o que lo hayas declarado con const o let.`],
      [/^Assignment to constant variable/, () => 'Intentas cambiar una constante (const). Usa let si el valor debe cambiar.'],
      [/^(.+) is not a function$/, (m) => `«${m[1]}» no es una función (¿falta o sobra algún punto o paréntesis?).`],
      [/^Cannot read propert(?:y|ies) of (undefined|null)(?: \(reading '(.+)'\))?/, (m) => `Lees un dato que no existe (${m[1]})${m[2] ? ` al pedir «${m[2]}»` : ''}.`],
      [/^Identifier '(.+)' has already been declared/, (m) => `«${m[1]}» ya fue declarado antes; usa otro nombre.`],
      [/^Unexpected end of input/, () => 'Error de sintaxis: falta cerrar algo al final (un paréntesis, llave o corchete).'],
      [/^Unexpected token '?(.*?)'?$/, (m) => `Error de sintaxis: «${m[1]}» no va ahí.`],
      [/^Unexpected identifier/, () => 'Error de sintaxis: hay una palabra donde no corresponde (¿falta una coma, un punto y coma o un operador?).'],
      [/^Invalid or unexpected token/, () => 'Error de sintaxis: hay un símbolo no válido (¿comillas sin cerrar?).'],
      [/^Missing initializer in const declaration/, () => 'Error de sintaxis: una constante (const) necesita un valor al declararla.'],
      [/^Invalid array length/, () => 'Largo de lista no válido.'],
    ];
    let shown = msg;
    if (!(e && e.user)) {
      for (const [re, f] of tr) { const m = re.exec(msg); if (m) { shown = f(m); break; } }
      if (shown === msg && kind === 'syntax') shown = 'Error de sintaxis: ' + msg;
    }
    if (e && e.bar !== undefined) {
      const t = e.barTime, dt = isNum(t) ? new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
      shown += ` (ocurrió en la vela ${e.bar + 1}${dt ? ', ' + dt : ''})`;
    }
    return { kind, line, message: shown, original: shown === msg ? null : msg };
  }

  const core = { run, explainError, BLOCKED, API_NAMES, ta: { sma, ema, rma, wma, rsi, macd, bb, stdev, highest, lowest, sum, change, cum } };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  else root.TVScriptCore = core;
})(typeof self !== 'undefined' ? self : globalThis);

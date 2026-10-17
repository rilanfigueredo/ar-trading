// Ar_Trading - herramientas de dibujo (v0.7): modelo de datos, geometría y almacén. Sin DOM: se prueba con npm test.
// El pintado y el ratón viven en drawlayer.js; los botones y paneles en drawui.js.
(function (root) {
  'use strict';

  // pts = cuántos puntos pide la herramienta (0 = abierta: se termina con doble clic o Enter)
  const TYPES = {
    trend: { label: 'Línea de tendencia', pts: 2, cat: 'lines' },
    hline: { label: 'Línea horizontal', pts: 1, cat: 'lines' },
    ray: { label: 'Rayo', pts: 2, cat: 'lines' },
    channel: { label: 'Canal paralelo', pts: 3, cat: 'lines' },
    poly: { label: 'Polilínea', pts: 0, cat: 'lines' },
    fib: { label: 'Retroceso de Fibonacci', pts: 2, cat: 'fib' },
    rect: { label: 'Rectángulo', pts: 2, cat: 'shapes' },
    text: { label: 'Texto', pts: 1, cat: 'text' },
    ruler: { label: 'Regla', pts: 2, cat: 'text' },
  };
  const TOOL_ORDER = ['trend', 'hline', 'ray', 'channel', 'poly', 'fib', 'rect', 'text', 'ruler'];
  const CATS = [
    { id: 'lines', label: 'Líneas', tools: ['trend', 'hline', 'ray', 'channel', 'poly'] },
    { id: 'fib', label: 'Fibonacci', tools: ['fib'] },
    { id: 'shapes', label: 'Formas', tools: ['rect'] },
    { id: 'text', label: 'Texto y medidas', tools: ['text', 'ruler'] },
  ];
  const DASHES = { solid: [], dashed: [8, 6], dotted: [2, 4] };

  const FIB_BASE = [
    [0, '#787b86', true], [0.236, '#f23645', true], [0.382, '#ff9800', true], [0.5, '#4caf50', true],
    [0.618, '#089981', true], [0.786, '#00bcd4', true], [1, '#787b86', true], [1.618, '#2962ff', true],
    [2.618, '#f23645', false], [3.618, '#9c27b0', false], [4.236, '#e91e63', false],
  ];
  const fibLevels = () => FIB_BASE.map(([v, color, on]) => ({ v, color, on }));

  function defaults(type) {
    const base = { color: '#2962ff', width: 2, dash: 'solid' };
    switch (type) {
      case 'trend': return Object.assign(base, { extL: false, extR: false });
      case 'hline': return Object.assign(base, { color: '#ff9800', width: 1 });
      case 'ray': return base;
      case 'channel': return Object.assign(base, { fill: true, fillOpacity: 12, extL: false, extR: false });
      case 'poly': return base;
      case 'fib': return { color: '#787b86', width: 1, dash: 'solid', bg: true, bgOpacity: 10, extL: false, extR: false, showPrice: true, trendLine: true, levels: fibLevels() };
      case 'rect': return Object.assign(base, { width: 1, fill: true, fillOpacity: 15 });
      case 'text': return { color: '#2962ff', size: 14, bold: false, text: '' };
      case 'ruler': return { color: '#2962ff', width: 1, dash: 'dashed' };
      default: return base;
    }
  }
  // Claves de estilo que se recuerdan como "valor por defecto" para los siguientes dibujos del mismo tipo.
  const STYLE_KEYS = ['color', 'width', 'dash', 'fill', 'fillOpacity', 'extL', 'extR', 'bg', 'bgOpacity', 'size', 'bold', 'showPrice', 'trendLine', 'levels'];

  // ---------- Geometría (en píxeles) ----------
  function distPointSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  // Recta por dos puntos; "izquierda/derecha" se refieren a los extremos en pantalla. Devuelve [xa, ya, xb, yb].
  function lineSegment(x1, y1, x2, y2, extL, extR, w) {
    if (x1 === x2) return [x1, y1, x2, y2];
    let xl = x1, yl = y1, xr = x2, yr = y2;
    if (x1 > x2) { xl = x2; yl = y2; xr = x1; yr = y1; }
    const m = (yr - yl) / (xr - xl);
    const lo = -50, hi = w + 50;
    if (extL && xl > lo) { yl += m * (lo - xl); xl = lo; }
    if (extR && xr < hi) { yr += m * (hi - xr); xr = hi; }
    return [xl, yl, xr, yr];
  }
  // Rayo: sale del primer punto, pasa por el segundo y sigue sin fin.
  function raySegment(x1, y1, x2, y2, w) {
    if (x1 === x2) return [x1, y1, x1, y2 >= y1 ? 1e5 : -1e5];
    const m = (y2 - y1) / (x2 - x1);
    const xe = x2 > x1 ? Math.max(w + 50, x1) : Math.min(-50, x1);
    return [x1, y1, xe, y1 + m * (xe - x1)];
  }
  // Canal paralelo: A-B es la recta base y C marca por dónde pasa la paralela. Devuelve el desplazamiento vertical en píxeles.
  function channelOffset(a, b, c) {
    if (a.x === b.x) return 0;
    const m = (b.y - a.y) / (b.x - a.x);
    return c.y - (a.y + m * (c.x - a.x));
  }
  // Precio de un nivel de Fibonacci: 0 está en el segundo punto y 1 en el primero (como en TradingView).
  const fibPrice = (p1, p2, v) => p2 + (p1 - p2) * v;

  function humanDur(sec) {
    sec = Math.abs(Math.round(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const parts = [];
    if (d) parts.push(d + ' d');
    if (h) parts.push(h + ' h');
    if (m && !d) parts.push(m + ' m');
    if (!parts.length) parts.push(s + ' s');
    return parts.join(' ');
  }

  function rectOf(P) {
    const x1 = Math.min(P[0].x, P[1].x), x2 = Math.max(P[0].x, P[1].x);
    const y1 = Math.min(P[0].y, P[1].y), y2 = Math.max(P[0].y, P[1].y);
    return { x1, y1, x2, y2 };
  }
  // Límites horizontales de una caja de niveles (rectángulo, Fibonacci).
  function boxXRange(P, extL, extR, w) {
    let xl = Math.min(P[0].x, P[1].x), xr = Math.max(P[0].x, P[1].x);
    if (extL) xl = -50;
    if (extR) xr = w + 50;
    return [xl, xr];
  }
  function textBox(d, P, measure) {
    const size = d.size || 14;
    const wd = measure(d.text || 'Texto', size, !!d.bold);
    return { x1: P[0].x, y1: P[0].y - size, x2: P[0].x + wd, y2: P[0].y + 4 };
  }

  // Distancia (en píxeles) desde (x, y) al dibujo. P = puntos ya convertidos a píxeles.
  // env: { measure(texto, tamaño, negrita) -> ancho, yOfPrice(precio) -> y }
  function hitDistance(d, P, x, y, w, env) {
    const seg = (s) => distPointSeg(x, y, s[0], s[1], s[2], s[3]);
    switch (d.type) {
      case 'trend': return P.length < 2 ? 1e9 : seg(lineSegment(P[0].x, P[0].y, P[1].x, P[1].y, d.extL, d.extR, w));
      case 'ray': return P.length < 2 ? 1e9 : seg(raySegment(P[0].x, P[0].y, P[1].x, P[1].y, w));
      case 'hline': return Math.abs(y - P[0].y);
      case 'poly': {
        let best = 1e9;
        for (let i = 1; i < P.length; i++) best = Math.min(best, distPointSeg(x, y, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y));
        return best;
      }
      case 'rect': {
        if (P.length < 2) return 1e9;
        const r = rectOf(P);
        return Math.min(distPointSeg(x, y, r.x1, r.y1, r.x2, r.y1), distPointSeg(x, y, r.x2, r.y1, r.x2, r.y2),
          distPointSeg(x, y, r.x2, r.y2, r.x1, r.y2), distPointSeg(x, y, r.x1, r.y2, r.x1, r.y1));
      }
      case 'channel': {
        if (P.length < 3) return P.length < 2 ? 1e9 : seg(lineSegment(P[0].x, P[0].y, P[1].x, P[1].y, d.extL, d.extR, w));
        const dy = channelOffset(P[0], P[1], P[2]);
        const s1 = lineSegment(P[0].x, P[0].y, P[1].x, P[1].y, d.extL, d.extR, w);
        const s2 = lineSegment(P[0].x, P[0].y + dy, P[1].x, P[1].y + dy, d.extL, d.extR, w);
        return Math.min(seg(s1), seg(s2));
      }
      case 'fib': {
        if (P.length < 2) return 1e9;
        const [xl, xr] = boxXRange(P, d.extL, d.extR, w);
        let best = d.trendLine ? distPointSeg(x, y, P[0].x, P[0].y, P[1].x, P[1].y) : 1e9;
        const p1 = d.pts[0].p, p2 = d.pts[1].p;
        for (const lv of d.levels) {
          if (!lv.on) continue;
          const yy = env.yOfPrice(fibPrice(p1, p2, lv.v));
          if (yy === null) continue;
          best = Math.min(best, distPointSeg(x, y, xl, yy, xr, yy));
        }
        return best;
      }
      case 'text': {
        const b = textBox(d, P, env.measure);
        return x >= b.x1 - 4 && x <= b.x2 + 4 && y >= b.y1 - 4 && y <= b.y2 + 4 ? 0 : 1e9;
      }
      default: return 1e9;
    }
  }

  // Dónde se dibujan los tiradores (círculos) de un dibujo seleccionado.
  function handlePoints(d, P, w) {
    if (d.type === 'hline') return P.length ? [{ x: Math.max(14, Math.min(w - 14, P[0].x)), y: P[0].y }] : [];
    return P.slice();
  }

  // ---------- Almacén ----------
  // getRoot(): { [símbolo]: [dibujo...] } (cfg.drawings). getPrefs(): cfg.draw. save(): guarda la configuración.
  function createStore(getRoot, getPrefs, save) {
    const subs = new Set();
    const st = { sel: null, tool: null };
    const undoS = {}, redoS = {};
    let batch = null, seq = 0, lastKey = '', lastAt = 0;
    const EMPTY = [];
    // Leer no ensucia la configuración: solo se crea la lista de un activo cuando se agrega algo.
    const list = (sym) => { const l = getRoot()[sym]; return Array.isArray(l) ? l : EMPTY; };
    const setList = (sym, arr) => { const r = getRoot(); if (arr.length) r[sym] = arr; else delete r[sym]; };
    const emit = (kind, info) => subs.forEach((f) => { try { f(kind, info); } catch (e) { if (typeof console !== 'undefined') console.error(e); } });
    function snap(sym) {
      if (batch === sym) return;
      if (!undoS[sym]) undoS[sym] = [];
      undoS[sym].push(JSON.stringify(list(sym)));
      if (undoS[sym].length > 60) undoS[sym].shift();
      redoS[sym] = [];
    }
    const newId = () => 'd' + Date.now().toString(36) + (++seq).toString(36);
    const find = (sym, id) => list(sym).find((d) => d.id === id) || null;
    const changed = () => { save(); emit('change'); };

    const store = {
      state: st,
      on(f) { subs.add(f); return () => subs.delete(f); },
      emit,
      list, get: find,
      prefs: () => getPrefs(),
      typeDefaults(type) {
        const d = defaults(type);
        const saved = (getPrefs().styles || {})[type] || {};
        STYLE_KEYS.forEach((k) => { if (saved[k] !== undefined && d[k] !== undefined) d[k] = JSON.parse(JSON.stringify(saved[k])); });
        return d;
      },
      label(d) {
        const base = (TYPES[d.type] || { label: d.type }).label;
        return d.type === 'text' && d.text ? `${base}: ${String(d.text).slice(0, 24)}` : base;
      },
      add(sym, d) {
        snap(sym);
        d.id = newId(); d.locked = !!d.locked; d.hidden = !!d.hidden;
        setList(sym, list(sym).concat([d]));
        st.sel = { sym, id: d.id };
        changed(); emit('select');
        return d;
      },
      // Cambia campos de un dibujo. Los cambios seguidos del mismo campo (por ejemplo, al arrastrar un color) cuentan como uno solo al deshacer.
      patch(sym, id, patch) {
        const d = find(sym, id);
        if (!d) return null;
        const key = id + ':' + Object.keys(patch).join(',');
        const now = Date.now();
        if (!(key === lastKey && now - lastAt < 1500)) snap(sym);
        lastKey = key; lastAt = now;
        Object.assign(d, patch);
        const styleBits = {};
        STYLE_KEYS.forEach((k) => { if (patch[k] !== undefined) styleBits[k] = JSON.parse(JSON.stringify(patch[k])); });
        if (Object.keys(styleBits).length) {
          const pr = getPrefs();
          if (!pr.styles) pr.styles = {};
          pr.styles[d.type] = Object.assign({}, pr.styles[d.type] || {}, styleBits);
        }
        changed();
        return d;
      },
      // Gestos largos (arrastrar): un solo paso de "deshacer" y un solo guardado.
      begin(sym) { snap(sym); batch = sym; },
      move(sym, id, pts) { const d = find(sym, id); if (d) { d.pts = pts; emit('change'); } },
      end() { if (batch) { batch = null; changed(); } },
      remove(sym, id) {
        if (!find(sym, id)) return;
        snap(sym);
        setList(sym, list(sym).filter((d) => d.id !== id));
        if (st.sel && st.sel.id === id) st.sel = null;
        changed(); emit('select');
      },
      duplicate(sym, id, shift) {
        const d = find(sym, id);
        if (!d) return null;
        const c = JSON.parse(JSON.stringify(d));
        c.locked = false;
        if (shift) c.pts = c.pts.map(shift);
        return store.add(sym, c);
      },
      clear(sym) {
        if (!list(sym).length) return;
        snap(sym);
        setList(sym, []);
        st.sel = null;
        changed(); emit('select');
      },
      setAll(sym, key, val) {
        if (!list(sym).length) return;
        snap(sym);
        list(sym).forEach((d) => { d[key] = !!val; });
        changed();
      },
      select(sym, id) {
        const now = st.sel;
        const next = id ? { sym, id } : null;
        if ((!now && !next) || (now && next && now.id === next.id && now.sym === next.sym)) return;
        st.sel = next;
        emit('select');
      },
      setTool(t) { st.tool = t || null; if (t) st.sel = null; emit('tool'); emit('select'); },
      undo(sym) {
        const u = undoS[sym];
        if (!u || !u.length) return false;
        if (!redoS[sym]) redoS[sym] = [];
        redoS[sym].push(JSON.stringify(list(sym)));
        setList(sym, JSON.parse(u.pop()));
        if (st.sel && !find(sym, st.sel.id)) st.sel = null;
        changed(); emit('select');
        return true;
      },
      redo(sym) {
        const r = redoS[sym];
        if (!r || !r.length) return false;
        if (!undoS[sym]) undoS[sym] = [];
        undoS[sym].push(JSON.stringify(list(sym)));
        setList(sym, JSON.parse(r.pop()));
        if (st.sel && !find(sym, st.sel.id)) st.sel = null;
        changed(); emit('select');
        return true;
      },
    };
    return store;
  }

  const api = {
    TYPES, TOOL_ORDER, CATS, DASHES, STYLE_KEYS, defaults, fibLevels, createStore,
    geom: { distPointSeg, lineSegment, raySegment, channelOffset, fibPrice, humanDur, rectOf, boxXRange, textBox, hitDistance, handlePoints },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TVDraw = api;
})(typeof window !== 'undefined' ? window : globalThis);

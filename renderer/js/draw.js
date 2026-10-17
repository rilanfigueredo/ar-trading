// Ar_Trading - herramientas de dibujo: modelo de datos, geometría y almacén. Sin DOM: se prueba con npm test.
// El pintado y el ratón viven en drawlayer.js; los botones y paneles en drawui.js.
(function (root) {
  'use strict';

  // pts = cuántos puntos pide la herramienta (0 = abierta: se termina con doble clic o Enter)
  const TYPES = {
    trend: { label: 'Línea de tendencia', pts: 2, cat: 'lines', text: true },
    hline: { label: 'Línea horizontal', pts: 1, cat: 'lines', text: true },
    hray: { label: 'Rayo horizontal', pts: 1, cat: 'lines', text: true },
    channel: { label: 'Canal paralelo', pts: 3, cat: 'lines' },
    poly: { label: 'Polilínea', pts: 0, cat: 'lines' },
    fib: { label: 'Retroceso de Fibonacci', pts: 2, cat: 'fib' },
    rect: { label: 'Rectángulo', pts: 2, cat: 'shapes' },
    text: { label: 'Texto', pts: 1, cat: 'text' },
    ruler: { label: 'Regla', pts: 2, cat: 'text' },
  };
  const TOOL_ORDER = ['trend', 'hline', 'hray', 'channel', 'poly', 'fib', 'rect', 'text', 'ruler'];
  const CATS = [
    { id: 'lines', label: 'Líneas', tools: ['trend', 'hline', 'hray', 'channel', 'poly'] },
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

  // Texto sobre una línea: contenido, color (null = el de la línea), tamaño, negrita, posición vertical
  // (above/center/below) y lugar horizontal (left/center/right).
  const textOpts = (h) => ({ text: '', tColor: null, tSize: 12, tBold: false, tH: h || 'left', tV: 'above' });

  function defaults(type) {
    const base = { color: '#2962ff', width: 2, dash: 'solid' };
    switch (type) {
      case 'trend': return Object.assign(base, { extL: false, extR: false }, textOpts('center'));
      case 'hline': return Object.assign(base, { color: '#ff9800', width: 1 }, textOpts('left'));
      case 'hray': return Object.assign(base, { color: '#ff9800', width: 1 }, textOpts('left'));
      case 'channel': return Object.assign(base, { fill: true, fillOpacity: 12, extL: false, extR: false });
      case 'poly': return base;
      case 'fib': return {
        color: '#787b86', width: 1, dash: 'solid', bg: true, bgOpacity: 10, extL: false, extR: false, showPrice: true, trendLine: true,
        levels: fibLevels(), tColor: null, tSize: 11, tBold: false, tH: 'left', tV: 'above',
      };
      case 'rect': return Object.assign(base, {
        width: 1, fill: true, fillOpacity: 15, extL: false, extR: false, center: false, cColor: null, cWidth: 1, cDash: 'dashed',
      });
      case 'text': return { color: '#2962ff', size: 14, bold: false, text: '' };
      case 'ruler': return { color: '#2962ff', width: 1, dash: 'dashed' };
      default: return base;
    }
  }
  // Claves de estilo que se recuerdan como "valor por defecto" para los siguientes dibujos del mismo tipo.
  const STYLE_KEYS = ['color', 'width', 'dash', 'fill', 'fillOpacity', 'extL', 'extR', 'bg', 'bgOpacity', 'size', 'bold', 'showPrice', 'trendLine', 'levels',
    'tColor', 'tSize', 'tBold', 'tH', 'tV', 'center', 'cColor', 'cWidth', 'cDash'];
  // Una plantilla guarda el estilo y también el texto.
  const TEMPLATE_KEYS = STYLE_KEYS.concat(['text']);
  const clone = (o) => JSON.parse(JSON.stringify(o));

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
  // Límites horizontales de una caja de niveles (rectángulo, Fibonacci), con extensión a izquierda/derecha.
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
  // Los 8 tiradores de un rectángulo: esquinas (0 arriba-izq., 1 arriba-der., 2 abajo-der., 3 abajo-izq.) y lados (4 arriba, 5 derecha, 6 abajo, 7 izquierda).
  function rectHandles(P) {
    const r = rectOf(P), mx = (r.x1 + r.x2) / 2, my = (r.y1 + r.y2) / 2;
    return [{ x: r.x1, y: r.y1 }, { x: r.x2, y: r.y1 }, { x: r.x2, y: r.y2 }, { x: r.x1, y: r.y2 },
      { x: mx, y: r.y1 }, { x: r.x2, y: my }, { x: mx, y: r.y2 }, { x: r.x1, y: my }];
  }
  const RECT_SIDES = [['l', 't'], ['r', 't'], ['r', 'b'], ['l', 'b'], ['t'], ['r'], ['b'], ['l']];
  // Rectángulo en datos tras arrastrar el tirador h hasta el punto np {t, p}. Solo cambian los lados que ese tirador controla;
  // los demás conservan exactamente sus valores. pts = 2 esquinas (datos), P = esas mismas esquinas en píxeles.
  function resizeRectData(pts, P, h, np) {
    const aLeft = P[0].x <= P[1].x, aTop = P[0].y <= P[1].y;
    const side = {
      l: aLeft ? pts[0].t : pts[1].t, r: aLeft ? pts[1].t : pts[0].t,
      t: aTop ? pts[0].p : pts[1].p, b: aTop ? pts[1].p : pts[0].p,
    };
    RECT_SIDES[h].forEach((k) => {
      if (k === 'l') side.l = np.t; else if (k === 'r') side.r = np.t; else if (k === 't') side.t = np.p; else side.b = np.p;
    });
    return [{ t: side.l, p: side.t }, { t: side.r, p: side.b }];
  }

  // Distancia (en píxeles) desde (x, y) al dibujo. P = puntos ya convertidos a píxeles.
  // env: { measure(texto, tamaño, negrita) -> ancho, yOfPrice(precio) -> y }
  function hitDistance(d, P, x, y, w, env) {
    const seg = (s) => distPointSeg(x, y, s[0], s[1], s[2], s[3]);
    switch (d.type) {
      case 'trend': return P.length < 2 ? 1e9 : seg(lineSegment(P[0].x, P[0].y, P[1].x, P[1].y, d.extL, d.extR, w));
      case 'ray': return P.length < 2 ? 1e9 : seg(raySegment(P[0].x, P[0].y, P[1].x, P[1].y, w));
      case 'hline': return Math.abs(y - P[0].y);
      case 'hray': return distPointSeg(x, y, P[0].x, P[0].y, Math.max(w + 50, P[0].x), P[0].y);
      case 'poly': {
        let best = 1e9;
        for (let i = 1; i < P.length; i++) best = Math.min(best, distPointSeg(x, y, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y));
        return best;
      }
      case 'rect': {
        if (P.length < 2) return 1e9;
        const r = rectOf(P);
        const [xl, xr] = boxXRange(P, d.extL, d.extR, w);
        return Math.min(distPointSeg(x, y, xl, r.y1, xr, r.y1), distPointSeg(x, y, xr, r.y1, xr, r.y2),
          distPointSeg(x, y, xr, r.y2, xl, r.y2), distPointSeg(x, y, xl, r.y2, xl, r.y1));
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
    if (d.type === 'rect') return P.length > 1 ? rectHandles(P) : P.slice();
    if (d.type === 'hline' || d.type === 'hray') return P.length ? [{ x: Math.max(14, Math.min(w - 14, P[0].x)), y: P[0].y }] : [];
    return P.slice();
  }

  // ¿Queda el dibujo dentro del recuadro de selección (rect en píxeles)? Las horizontales cuentan si cruzan la altura del recuadro.
  function inRect(d, P, r) {
    if (!P.length) return false;
    const inY = (y) => y >= r.y1 && y <= r.y2;
    if (d.type === 'hline') return inY(P[0].y);
    if (d.type === 'hray') return inY(P[0].y) && P[0].x <= r.x2;
    return P.every((p) => p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2);
  }

  // ---------- Almacén ----------
  // getRoot(): { [símbolo]: [dibujo...] } (cfg.drawings). getPrefs(): cfg.draw. save(): guarda la configuración.
  // getFolders(): { [símbolo]: [carpeta...] } (cfg.folders). Carpeta: { id, name, parent, open }. Un dibujo está en una carpeta con d.folder.
  function createStore(getRoot, getPrefs, save, getFolders) {
    const subs = new Set();
    const st = { sel: null, multi: [], tool: null, template: null };
    const undoS = {}, redoS = {};
    let batch = null, batchSnap = null, seq = 0, lastKey = '', lastAt = 0;
    const EMPTY = [];
    // Leer no ensucia la configuración: solo se crea la lista de un activo cuando se agrega algo.
    const list = (sym) => { const l = getRoot()[sym]; return Array.isArray(l) ? l : EMPTY; };
    const setList = (sym, arr) => { const r = getRoot(); if (arr.length) r[sym] = arr; else delete r[sym]; };
    const folders = (sym) => { const f = getFolders ? getFolders()[sym] : null; return Array.isArray(f) ? f : EMPTY; };
    const setFolders = (sym, arr) => { if (!getFolders) return; const r = getFolders(); if (arr.length) r[sym] = arr; else delete r[sym]; };
    const dump = (sym) => JSON.stringify({ l: list(sym), f: folders(sym) });
    const restore = (sym, str) => { const o = JSON.parse(str); setList(sym, o.l || []); setFolders(sym, o.f || []); };
    const emit = (kind, info) => subs.forEach((f) => { try { f(kind, info); } catch (e) { if (typeof console !== 'undefined') console.error(e); } });
    function snap(sym) {
      if (batch === sym) return;
      if (!undoS[sym]) undoS[sym] = [];
      undoS[sym].push(dump(sym));
      if (undoS[sym].length > 60) undoS[sym].shift();
      redoS[sym] = [];
    }
    const newId = (p) => (p || 'd') + Date.now().toString(36) + (++seq).toString(36);
    const find = (sym, id) => list(sym).find((d) => d.id === id) || null;
    const findF = (sym, id) => folders(sym).find((f) => f.id === id) || null;
    const changed = () => { save(); emit('change'); };
    const fixSel = (sym) => {
      if (!st.sel || st.sel.sym !== sym) return;
      st.multi = st.multi.filter((id) => !!find(sym, id));
      if (!st.multi.length) st.sel = null;
      else if (!st.multi.includes(st.sel.id)) st.sel = { sym, id: st.multi[st.multi.length - 1] };
    };

    function rememberStyle(d, patch) {
      const bits = {};
      STYLE_KEYS.forEach((k) => { if (patch[k] !== undefined) bits[k] = clone(patch[k]); });
      if (!Object.keys(bits).length) return;
      const pr = getPrefs();
      if (!pr.styles) pr.styles = {};
      pr.styles[d.type] = Object.assign({}, pr.styles[d.type] || {}, bits);
    }
    function descendants(sym, id) {
      const out = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        folders(sym).forEach((f) => { if (f.parent && out.has(f.parent) && !out.has(f.id)) { out.add(f.id); grew = true; } });
      }
      return out;
    }

    const store = {
      state: st,
      on(f) { subs.add(f); return () => subs.delete(f); },
      emit,
      list, get: find, folders, folder: findF,
      prefs: () => getPrefs(),
      typeDefaults(type) {
        const d = defaults(type);
        const apply = (src) => TEMPLATE_KEYS.forEach((k) => { if (src[k] !== undefined && d[k] !== undefined) d[k] = clone(src[k]); });
        apply((getPrefs().styles || {})[type] || {});
        if (st.template) { const t = store.templates(type).find((x) => x.id === st.template); if (t) apply(t.style); }
        return d;
      },
      label(d) {
        const base = (TYPES[d.type] || { label: d.type }).label;
        return d.text && (d.type === 'text' || (TYPES[d.type] && TYPES[d.type].text)) ? `${base}: ${String(d.text).slice(0, 24)}` : base;
      },
      // ----- selección (puede ser de varios dibujos a la vez; st.sel es el principal) -----
      isSelected: (sym, id) => !!st.sel && st.sel.sym === sym && st.multi.includes(id),
      selIds(sym) { return st.sel && st.sel.sym === sym ? st.multi.slice() : []; },
      // mode: undefined = solo este; 'toggle' = agregar/quitar (Ctrl); 'add' = agregar
      select(sym, id, mode) {
        if (!id) { if (st.sel || st.multi.length) { st.sel = null; st.multi = []; emit('select'); } return; }
        if (st.sel && st.sel.sym !== sym) st.multi = [];
        if (mode === 'toggle') {
          const i = st.multi.indexOf(id);
          if (i >= 0) st.multi.splice(i, 1); else st.multi.push(id);
          st.sel = st.multi.length ? { sym, id: st.multi[st.multi.length - 1] } : null;
        } else if (mode === 'add') {
          if (!st.multi.includes(id)) st.multi.push(id);
          st.sel = { sym, id };
        } else {
          if (st.sel && st.sel.sym === sym && st.sel.id === id && st.multi.length === 1) return;
          st.multi = [id]; st.sel = { sym, id };
        }
        emit('select');
      },
      selectMany(sym, ids, add) {
        const base = add && st.sel && st.sel.sym === sym ? st.multi.slice() : [];
        ids.forEach((id) => { if (!base.includes(id) && find(sym, id)) base.push(id); });
        st.multi = base;
        st.sel = base.length ? { sym, id: base[base.length - 1] } : null;
        emit('select');
      },
      setTool(t, tplId) { st.tool = t || null; st.template = t ? tplId || null : null; if (t) { st.sel = null; st.multi = []; } emit('tool'); emit('select'); },

      // ----- dibujos -----
      add(sym, d) {
        snap(sym);
        d.id = newId('d'); d.locked = !!d.locked; d.hidden = !!d.hidden;
        setList(sym, list(sym).concat([d]));
        st.sel = { sym, id: d.id }; st.multi = [d.id];
        changed(); emit('select');
        return d;
      },
      // Cambia campos de un dibujo. Los cambios seguidos del mismo campo (por ejemplo, al arrastrar un color) cuentan como uno solo al deshacer.
      patch(sym, id, patch) { return store.patchMany(sym, [id], patch)[0] || null; },
      patchMany(sym, ids, patch) {
        const ds = ids.map((id) => find(sym, id)).filter(Boolean);
        if (!ds.length) return [];
        const key = ids.join('+') + ':' + Object.keys(patch).join(',');
        const now = Date.now();
        if (!(key === lastKey && now - lastAt < 1500)) snap(sym);
        lastKey = key; lastAt = now;
        ds.forEach((d) => { Object.assign(d, clone(patch)); rememberStyle(d, patch); });
        changed();
        return ds;
      },
      // Gestos largos (arrastrar, ventana de propiedades): un solo paso de "deshacer" y un solo guardado. abort() lo revierte todo.
      begin(sym) { snap(sym); batch = sym; batchSnap = dump(sym); },
      move(sym, id, pts) { const d = find(sym, id); if (d) { d.pts = pts; emit('change'); } },
      moveMany(sym, map) { Object.keys(map).forEach((id) => { const d = find(sym, id); if (d) d.pts = map[id]; }); emit('change'); },
      end() { if (batch) { batch = null; batchSnap = null; changed(); } },
      abort() {
        if (!batch) return;
        const sym = batch;
        restore(sym, batchSnap);
        if (undoS[sym]) undoS[sym].pop();
        batch = null; batchSnap = null;
        fixSel(sym);
        changed(); emit('select');
      },
      remove(sym, id) { store.removeMany(sym, [id]); },
      removeMany(sym, ids) {
        const set = new Set(ids);
        if (!list(sym).some((d) => set.has(d.id))) return;
        snap(sym);
        setList(sym, list(sym).filter((d) => !set.has(d.id)));
        fixSel(sym);
        changed(); emit('select');
      },
      duplicate(sym, id, shift) { const r = store.duplicateMany(sym, [id], shift); return r[0] || null; },
      duplicateMany(sym, ids, shift) {
        const src = ids.map((id) => find(sym, id)).filter(Boolean);
        if (!src.length) return [];
        snap(sym);
        const copies = src.map((d) => {
          const c = clone(d);
          c.id = newId('d'); c.locked = false;
          if (shift) c.pts = c.pts.map(shift);
          return c;
        });
        setList(sym, list(sym).concat(copies));
        st.sel = { sym, id: copies[copies.length - 1].id }; st.multi = copies.map((c) => c.id);
        changed(); emit('select');
        return copies;
      },
      clear(sym) {
        if (!list(sym).length && !folders(sym).length) return;
        snap(sym);
        setList(sym, []); setFolders(sym, []);
        st.sel = null; st.multi = [];
        changed(); emit('select');
      },
      setAll(sym, key, val) {
        if (!list(sym).length) return;
        snap(sym);
        list(sym).forEach((d) => { d[key] = !!val; });
        changed();
      },

      // ----- carpetas -----
      // Crea una carpeta (dentro de "parent" si se indica) y mete en ella los dibujos "ids".
      addFolder(sym, o) {
        snap(sym);
        const f = { id: newId('f'), name: (o && o.name) || 'Carpeta', parent: (o && o.parent) || null, open: true };
        setFolders(sym, folders(sym).concat([f]));
        const ids = (o && o.ids) || [];
        list(sym).forEach((d) => { if (ids.includes(d.id)) d.folder = f.id; });
        changed();
        return f;
      },
      renameFolder(sym, id, name) {
        const f = findF(sym, id);
        if (!f || !String(name).trim()) return;
        snap(sym); f.name = String(name).trim(); changed();
      },
      setFolderOpen(sym, id, open) { const f = findF(sym, id); if (f) { f.open = open === undefined ? !f.open : !!open; save(); emit('change'); } },
      // Quita la carpeta; sus dibujos y subcarpetas suben un nivel (no se borra nada).
      removeFolder(sym, id) {
        const f = findF(sym, id);
        if (!f) return;
        snap(sym);
        folders(sym).forEach((x) => { if (x.parent === id) x.parent = f.parent || null; });
        list(sym).forEach((d) => { if (d.folder === id) { if (f.parent) d.folder = f.parent; else delete d.folder; } });
        setFolders(sym, folders(sym).filter((x) => x.id !== id));
        changed();
      },
      moveToFolder(sym, ids, folderId) {
        if (folderId && !findF(sym, folderId)) return;
        snap(sym);
        list(sym).forEach((d) => { if (ids.includes(d.id)) { if (folderId) d.folder = folderId; else delete d.folder; } });
        changed();
      },
      moveFolder(sym, id, parentId) {
        const f = findF(sym, id);
        if (!f || id === parentId || (parentId && descendants(sym, id).has(parentId))) return false;
        snap(sym); f.parent = parentId || null; changed();
        return true;
      },
      // Ids de los dibujos dentro de la carpeta (y de sus subcarpetas).
      folderItems(sym, id) {
        const set = descendants(sym, id);
        return list(sym).filter((d) => d.folder && set.has(d.folder)).map((d) => d.id);
      },
      setFolderFlag(sym, id, key, val) {
        const ids = store.folderItems(sym, id);
        if (!ids.length) return;
        snap(sym);
        list(sym).forEach((d) => { if (ids.includes(d.id)) d[key] = !!val; });
        changed();
      },

      // ----- plantillas por herramienta -----
      templates(type) { const t = getPrefs().templates; return t && Array.isArray(t[type]) ? t[type] : EMPTY; },
      saveTemplate(type, name, d) {
        const pr = getPrefs();
        if (!pr.templates) pr.templates = {};
        const style = {};
        TEMPLATE_KEYS.forEach((k) => { if (d[k] !== undefined) style[k] = clone(d[k]); });
        const tpl = { id: newId('t'), name: String(name).trim() || 'Plantilla', style };
        pr.templates[type] = (pr.templates[type] || []).concat([tpl]);
        save(); emit('templates');
        return tpl;
      },
      deleteTemplate(type, id) {
        const pr = getPrefs();
        if (!pr.templates || !pr.templates[type]) return;
        pr.templates[type] = pr.templates[type].filter((t) => t.id !== id);
        if (Array.isArray(pr.favs)) pr.favs = pr.favs.filter((f) => f !== `${type}:${id}`);
        if (st.template === id) st.template = null;
        save(); emit('templates');
      },
      applyTemplate(sym, id, tplId) {
        const d = find(sym, id);
        const t = d && store.templates(d.type).find((x) => x.id === tplId);
        if (!t) return false;
        const patch = {};
        Object.keys(t.style).forEach((k) => { if (TEMPLATE_KEYS.includes(k) && defaults(d.type)[k] !== undefined) patch[k] = t.style[k]; });
        store.patch(sym, id, patch);
        return true;
      },

      // ----- deshacer / rehacer (incluye carpetas) -----
      undo(sym) {
        const u = undoS[sym];
        if (!u || !u.length) return false;
        if (!redoS[sym]) redoS[sym] = [];
        redoS[sym].push(dump(sym));
        restore(sym, u.pop());
        fixSel(sym);
        changed(); emit('select');
        return true;
      },
      redo(sym) {
        const r = redoS[sym];
        if (!r || !r.length) return false;
        if (!undoS[sym]) undoS[sym] = [];
        undoS[sym].push(dump(sym));
        restore(sym, r.pop());
        fixSel(sym);
        changed(); emit('select');
        return true;
      },
    };
    return store;
  }

  const api = {
    TYPES, TOOL_ORDER, CATS, DASHES, STYLE_KEYS, TEMPLATE_KEYS, defaults, fibLevels, createStore,
    geom: { distPointSeg, lineSegment, raySegment, channelOffset, fibPrice, humanDur, rectOf, boxXRange, textBox, hitDistance, handlePoints, rectHandles, resizeRectData, inRect },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TVDraw = api;
})(typeof window !== 'undefined' ? window : globalThis);

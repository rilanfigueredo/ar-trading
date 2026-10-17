// Ar_Trading - capa de dibujo de un gráfico: pinta los dibujos sobre el panel de precios (primitiva de la serie)
// y maneja el ratón (crear, seleccionar, mover, editar puntos, selección múltiple). Los datos viven en el almacén de draw.js.
(function (root) {
  'use strict';
  const D = root.TVDraw;
  const G = D.geom;
  const HIT = 6;            // distancia (px) para "tocar" un dibujo
  const HANDLE_HIT = 9;     // distancia (px) para agarrar un tirador
  const MAGNET_WEAK_PX = 30; // imán débil: solo actúa si el precio de la vela está a menos de esto
  const ACCENT = '#2962ff';
  // Con Shift, el nuevo punto queda a la misma altura que el anterior (línea horizontal exacta).
  const SHIFT_TYPES = { trend: true, channel: true, poly: true, ruler: true };

  let measCtx = null;
  function measure(text, size, bold) {
    if (!measCtx) measCtx = document.createElement('canvas').getContext('2d');
    measCtx.font = `${bold ? '700 ' : ''}${size}px sans-serif`;
    return measCtx.measureText(text).width;
  }
  function rgba(hex, op) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${op})`;
  }
  const num = (v) => typeof v === 'number' && isFinite(v);
  // Texto con un contorno del color del fondo, para que se lea sobre las velas.
  function haloText(ctx, text, x, y, bg) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = bg; ctx.setLineDash([]);
    ctx.strokeText(text, x, y);
    ctx.restore();
    ctx.fillText(text, x, y);
  }

  // env: enlace con el gráfico (lo arma view.js). store: almacén de draw.js.
  function createLayer(env, store) {
    const L = { draft: null, ruler: null, hoverId: null, drag: null, press: null, editor: null, marquee: null };
    let request = null, attachedTo = null, destroyed = false;
    const host = env.host;
    const repaint = () => { if (request) request(); };
    const themed = (c) => (root.TVLib ? root.TVLib.themedColor(c, env.theme()) : c);
    const magnetMode = () => { const m = store.prefs().magnet; return m === true ? 'weak' : (m === 'weak' || m === 'strong' ? m : 'off'); };

    function toPx(d) {
      const out = [];
      for (const pt of d.pts) {
        const x = env.xOfTime(pt.t), y = env.yOfPrice(pt.p);
        if (!num(x) || !num(y)) return null;
        out.push({ x, y });
      }
      return out;
    }

    // ---------- Pintado ----------
    function setStroke(ctx, d, o) {
      const lw = (d.width || 1) + (o && (o.hover || o.selected) ? 0.5 : 0);
      ctx.strokeStyle = themed(d.color); ctx.fillStyle = themed(d.color); ctx.lineWidth = lw;
      ctx.setLineDash(D.DASHES[d.dash] || []);
    }
    function seg(ctx, s) { ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke(); }

    // Texto sobre un tramo de línea (de (x1,y1) a (x2,y2), de izquierda a derecha): lugar (izquierda/centro/derecha) y posición (encima/centro/debajo).
    function drawLineText(ctx, d, x1, y1, x2, y2, w) {
      if (!d.text) return;
      const size = d.tSize || 12;
      let xa = Math.max(x1, 0), xb = Math.min(x2, w);
      if (xb < xa) return;
      const pad = 6;
      let ax, align;
      if (d.tH === 'right') { ax = xb - pad; align = 'right'; } else if (d.tH === 'center') { ax = (xa + xb) / 2; align = 'center'; } else { ax = xa + pad; align = 'left'; }
      const m = x2 !== x1 ? (y2 - y1) / (x2 - x1) : 0;
      const ay = y1 + m * (ax - x1);
      ctx.save();
      ctx.setLineDash([]);
      ctx.font = `${d.tBold ? '700 ' : ''}${size}px sans-serif`;
      ctx.textAlign = align;
      ctx.fillStyle = themed(d.tColor || d.color);
      const bg = env.bg();
      if (d.tV === 'below') { ctx.textBaseline = 'top'; haloText(ctx, d.text, ax, ay + 4, bg); }
      else if (d.tV === 'center') {
        ctx.textBaseline = 'middle';
        const wd = measure(d.text, size, !!d.tBold);
        const bx = align === 'left' ? ax - 3 : align === 'right' ? ax - wd - 3 : ax - wd / 2 - 3;
        ctx.save(); ctx.fillStyle = bg; ctx.fillRect(bx, ay - size / 2 - 1, wd + 6, size + 2); ctx.restore();
        ctx.fillText(d.text, ax, ay);
      } else { ctx.textBaseline = 'bottom'; haloText(ctx, d.text, ax, ay - 4, bg); }
      ctx.restore();
    }

    function drawOne(ctx, d, w, h, o) {
      const P = toPx(d);
      if (!P || !P.length) return;
      setStroke(ctx, d, o);
      const color = themed(d.color);
      switch (d.type) {
        case 'trend':
          if (P.length > 1) {
            seg(ctx, G.lineSegment(P[0].x, P[0].y, P[1].x, P[1].y, d.extL, d.extR, w));
            const a = P[0].x <= P[1].x ? P[0] : P[1], b = P[0].x <= P[1].x ? P[1] : P[0];
            drawLineText(ctx, d, a.x, a.y, b.x, b.y, w);
          }
          break;
        case 'hline':
          seg(ctx, [0, P[0].y, w, P[0].y]);
          drawLineText(ctx, d, 0, P[0].y, w, P[0].y, w);
          break;
        case 'hray':
          seg(ctx, [P[0].x, P[0].y, Math.max(w + 50, P[0].x), P[0].y]);
          drawLineText(ctx, d, P[0].x, P[0].y, w, P[0].y, w);
          break;
        case 'poly':
          if (P.length > 1) { ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y); ctx.stroke(); }
          break;
        case 'rect': if (P.length > 1) drawRect(ctx, d, P, w, color); break;
        case 'channel': drawChannel(ctx, d, P, w, color); break;
        case 'fib': if (P.length > 1) drawFib(ctx, d, P, w, o); break;
        case 'text': drawText(ctx, d, P); break;
        case 'ruler': if (P.length > 1) drawRuler(ctx, d, P, w, h); break;
        default: break;
      }
      ctx.setLineDash([]);
      if (o && ((o.selected && o.single) || o.draft)) drawHandles(ctx, d, P, w);
    }

    function drawRect(ctx, d, P, w, color) {
      const r = G.rectOf(P);
      const [xl, xr] = G.boxXRange(P, d.extL, d.extR, w);
      if (d.fill) { ctx.fillStyle = rgba(color, (d.fillOpacity == null ? 15 : d.fillOpacity) / 100); ctx.fillRect(xl, r.y1, xr - xl, r.y2 - r.y1); }
      ctx.beginPath();
      // con extensión, los lados verticales solo se ven en el extremo que no se extiende
      ctx.moveTo(xl, r.y1); ctx.lineTo(xr, r.y1);
      ctx.moveTo(xl, r.y2); ctx.lineTo(xr, r.y2);
      if (!d.extL) { ctx.moveTo(xl, r.y1); ctx.lineTo(xl, r.y2); }
      if (!d.extR) { ctx.moveTo(xr, r.y1); ctx.lineTo(xr, r.y2); }
      ctx.stroke();
      if (d.center) {
        ctx.save();
        ctx.strokeStyle = themed(d.cColor || d.color); ctx.lineWidth = d.cWidth || 1; ctx.setLineDash(D.DASHES[d.cDash] || []);
        const my = (r.y1 + r.y2) / 2;
        seg(ctx, [xl, my, xr, my]);
        ctx.restore();
      }
    }

    function drawChannel(ctx, d, P, w, color) {
      if (P.length < 2) return;
      const s1 = G.lineSegment(P[0].x, P[0].y, P[1].x, P[1].y, d.extL, d.extR, w);
      seg(ctx, s1);
      if (P.length < 3) return;
      const dy = G.channelOffset(P[0], P[1], P[2]);
      const s2 = G.lineSegment(P[0].x, P[0].y + dy, P[1].x, P[1].y + dy, d.extL, d.extR, w);
      if (d.fill) {
        ctx.save();
        ctx.fillStyle = rgba(color, (d.fillOpacity == null ? 12 : d.fillOpacity) / 100);
        ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s1[2], s1[3]); ctx.lineTo(s2[2], s2[3]); ctx.lineTo(s2[0], s2[1]); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      seg(ctx, s2);
      ctx.save(); ctx.globalAlpha = 0.55; ctx.setLineDash([4, 4]);
      seg(ctx, [(s1[0] + s2[0]) / 2, (s1[1] + s2[1]) / 2, (s1[2] + s2[2]) / 2, (s1[3] + s2[3]) / 2]);
      ctx.restore();
    }

    function drawFib(ctx, d, P, w, o) {
      const p1 = d.pts[0].p, p2 = d.pts[1].p;
      const [xl, xr] = G.boxXRange(P, d.extL, d.extR, w);
      const lv = (d.levels || []).filter((l) => l.on && num(l.v)).map((l) => {
        const price = G.fibPrice(p1, p2, l.v);
        return { v: l.v, color: themed(l.color), price, y: env.yOfPrice(price) };
      }).filter((l) => num(l.y)).sort((a, b) => a.v - b.v);
      if (d.bg) {
        for (let i = 1; i < lv.length; i++) {
          ctx.fillStyle = rgba(lv[i].color, (d.bgOpacity == null ? 10 : d.bgOpacity) / 100);
          const ya = Math.min(lv[i - 1].y, lv[i].y), yb = Math.max(lv[i - 1].y, lv[i].y);
          ctx.fillRect(xl, ya, xr - xl, yb - ya);
        }
      }
      const size = d.tSize || 11;
      ctx.font = `${d.tBold ? '700 ' : ''}${size}px sans-serif`;
      ctx.lineWidth = (d.width || 1) + (o && (o.hover || o.selected) ? 0.5 : 0);
      const vxl = Math.max(xl, 0), vxr = Math.min(xr, w), bg = env.bg();
      lv.forEach((l) => {
        ctx.strokeStyle = l.color; ctx.setLineDash(D.DASHES[d.dash] || []);
        seg(ctx, [xl, l.y, xr, l.y]);
        ctx.setLineDash([]);
        const label = d.showPrice ? `${l.v} (${env.fmtPrice(l.price)})` : String(l.v);
        let ax, align;
        if (d.tH === 'right') { ax = vxr - 4; align = 'right'; } else if (d.tH === 'center') { ax = (vxl + vxr) / 2; align = 'center'; } else { ax = vxl + 4; align = 'left'; }
        ctx.textAlign = align; ctx.fillStyle = themed(d.tColor || l.color);
        if (d.tV === 'below') { ctx.textBaseline = 'top'; haloText(ctx, label, ax, l.y + 3, bg); }
        else if (d.tV === 'center') {
          ctx.textBaseline = 'middle';
          const wd = measure(label, size, !!d.tBold);
          const bx = align === 'left' ? ax - 3 : align === 'right' ? ax - wd - 3 : ax - wd / 2 - 3;
          ctx.save(); ctx.fillStyle = bg; ctx.fillRect(bx, l.y - size / 2 - 1, wd + 6, size + 2); ctx.restore();
          ctx.fillText(label, ax, l.y);
        } else { ctx.textBaseline = 'alphabetic'; haloText(ctx, label, ax, l.y - 3, bg); }
      });
      if (d.trendLine) {
        ctx.strokeStyle = themed(d.color); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        seg(ctx, [P[0].x, P[0].y, P[1].x, P[1].y]);
      }
    }

    function drawText(ctx, d, P) {
      const size = d.size || 14;
      ctx.font = `${d.bold ? '700 ' : ''}${size}px sans-serif`;
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.fillStyle = themed(d.color);
      haloText(ctx, d.text || 'Texto', P[0].x, P[0].y, env.bg());
    }

    function drawRuler(ctx, d, P, w, h) {
      const a = P[0], b = P[1];
      const p1 = d.pts[0].p, p2 = d.pts[1].p;
      const up = p2 >= p1;
      const col = up ? '#2962ff' : '#f23645';
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
      ctx.save();
      ctx.fillStyle = rgba(col, 0.12); ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      seg(ctx, [a.x, a.y, b.x, b.y]);
      ctx.setLineDash([]);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - 9 * Math.cos(ang - 0.4), b.y - 9 * Math.sin(ang - 0.4));
      ctx.lineTo(b.x - 9 * Math.cos(ang + 0.4), b.y - 9 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      const diff = p2 - p1;
      const pct = p1 ? (diff / p1) * 100 : 0;
      const bars = env.barsBetween(d.pts[0].t, d.pts[1].t);
      const dur = G.humanDur(d.pts[1].t - d.pts[0].t);
      const l1 = `${diff >= 0 ? '+' : '-'}${env.fmtPrice(Math.abs(diff))} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
      const l2 = `${bars} ${bars === 1 ? 'vela' : 'velas'} · ${dur}`;
      ctx.font = '12px sans-serif';
      const bw = Math.max(measure(l1, 12, false), measure(l2, 12, false)) + 16, bh = 38;
      let bx = (x1 + x2) / 2 - bw / 2;
      let by = up ? y1 - bh - 8 : y2 + 8;
      bx = Math.max(4, Math.min(w - bw - 4, bx));
      by = Math.max(4, Math.min(h - bh - 4, by));
      ctx.fillStyle = col; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4); else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(l1, bx + bw / 2, by + 12); ctx.fillText(l2, bx + bw / 2, by + 27);
      ctx.restore();
    }

    function drawHandles(ctx, d, P, w) {
      const hs = G.handlePoints(d, P, w);
      ctx.save();
      ctx.setLineDash([]); ctx.lineWidth = 2; ctx.strokeStyle = ACCENT;
      ctx.fillStyle = env.theme() === 'dark' ? '#1e222d' : '#ffffff';
      hs.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      if (d.locked) { ctx.fillStyle = ACCENT; ctx.font = '12px sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText('🔒', hs[0] ? hs[0].x + 9 : 6, hs[0] ? hs[0].y - 10 : 6); }
      ctx.restore();
    }

    function paint(ctx, w, h) {
      if (!env.active()) return;
      const sym = env.symbol();
      const single = store.state.multi.length === 1;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      store.list(sym).forEach((d) => {
        if (d.hidden || store.prefs().hideAll) return;
        drawOne(ctx, d, w, h, { selected: store.isSelected(sym, d.id), single, hover: L.hoverId === d.id });
      });
      if (L.draft) drawOne(ctx, Object.assign({}, L.draft, { pts: L.draft.pts.concat(L.draft.cur ? [L.draft.cur] : []) }), w, h, { draft: true });
      if (L.ruler) drawOne(ctx, L.ruler, w, h, {});
      if (L.marquee) {
        const m = L.marquee, x = Math.min(m.x1, m.x2), y = Math.min(m.y1, m.y2);
        ctx.fillStyle = 'rgba(41,98,255,0.10)'; ctx.strokeStyle = ACCENT; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        ctx.fillRect(x, y, Math.abs(m.x2 - m.x1), Math.abs(m.y2 - m.y1));
        ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(m.x2 - m.x1), Math.abs(m.y2 - m.y1));
      }
      ctx.restore();
    }

    // ---------- Primitiva de la serie ----------
    const renderer = { draw(target) { target.useMediaCoordinateSpace((s) => paint(s.context, s.mediaSize.width, s.mediaSize.height)); } };
    const paneView = { zOrder: () => 'top', renderer: () => renderer };
    const prim = {
      attached(p) { request = p.requestUpdate; },
      detached() { request = null; },
      updateAllViews() {},
      paneViews: () => [paneView],
      priceAxisViews() {
        const out = [];
        if (!env.active() || store.prefs().hideAll) return out;
        store.list(env.symbol()).forEach((d) => {
          if ((d.type !== 'hline' && d.type !== 'hray') || d.hidden || !d.pts[0]) return;
          out.push({
            coordinate: () => { const y = env.yOfPrice(d.pts[0].p); return num(y) ? y : -100; },
            text: () => env.fmtPrice(d.pts[0].p),
            textColor: () => '#ffffff', backColor: () => themed(d.color),
            visible: () => num(env.yOfPrice(d.pts[0].p)), tickVisible: () => true,
          });
        });
        return out;
      },
    };

    // ---------- Posición del ratón ----------
    function local(e) {
      const cr = env.chartEl.getBoundingClientRect(), pr = env.paneRect();
      const x = e.clientX - cr.left, y = e.clientY - (pr ? pr.top : cr.top);
      const inPane = !!pr && e.clientY >= pr.top && e.clientY <= pr.bottom && x >= 0 && x <= env.plotWidth();
      return { x, y, inPane };
    }
    // Punto (tiempo, precio) bajo el ratón. shiftRef: con Shift el precio es el del punto anterior (horizontal exacta, sin imán).
    // Imán: débil = se pega si el precio de la vela (A/M/m/C) está cerca; fuerte = se pega siempre al más cercano de la vela que está debajo.
    function dataAt(x, y, shiftRef) {
      let t = env.timeOfX(x), p = env.priceOfY(y);
      if (!num(t) || !num(p)) return null;
      if (shiftRef) return { t, p: shiftRef.p };
      const mode = magnetMode();
      if (mode !== 'off') {
        const bars = env.bars(), lg = env.logicalOfX(x);
        if (num(lg)) {
          const i = Math.round(lg);
          if (i >= 0 && i < bars.length) {
            const b = bars[i];
            const vals = env.chartType() === 'candles' ? [b.open, b.high, b.low, b.close] : [b.close];
            let best = null, bd = 1e9;
            vals.forEach((v) => { const yy = env.yOfPrice(v); if (num(yy) && Math.abs(yy - y) < bd) { bd = Math.abs(yy - y); best = v; } });
            if (best !== null && (mode === 'strong' || bd <= MAGNET_WEAK_PX)) { p = best; t = env.centerTime(i); }
          }
        }
      }
      return { t, p };
    }
    function shiftPt(pt, dx, dy) {
      const t = env.timeOfX(env.xOfTime(pt.t) + dx), p = env.priceOfY(env.yOfPrice(pt.p) + dy);
      return num(t) && num(p) ? { t, p } : pt;
    }
    // Punto de referencia para la horizontal con Shift al crear un dibujo (el último punto ya puesto).
    function draftShiftRef(d) {
      if (!SHIFT_TYPES[d.type] || !d.pts.length) return null;
      if (d.type === 'channel' && d.pts.length !== 1) return null;
      return d.pts[d.pts.length - 1];
    }
    // ... y al arrastrar un tirador: el punto vecino.
    function handleShiftRef(type, orig, idx) {
      if (type === 'trend' || (type === 'channel' && idx < 2)) return orig[1 - idx] || null;
      if (type === 'poly') return orig[idx > 0 ? idx - 1 : 1] || null;
      return null;
    }

    function hitAt(x, y) {
      const sym = env.symbol(), w = env.plotWidth();
      const list = store.prefs().hideAll ? [] : store.list(sym).filter((d) => !d.hidden);
      if (store.state.multi.length === 1 && store.state.sel && store.state.sel.sym === sym) {
        const d = list.find((q) => q.id === store.state.sel.id);
        const P = d && toPx(d);
        if (P) {
          const hs = G.handlePoints(d, P, w);
          for (let i = 0; i < hs.length; i++) if (Math.hypot(hs[i].x - x, hs[i].y - y) <= HANDLE_HIT) return { d, handle: i };
        }
      }
      const henv = { measure, yOfPrice: env.yOfPrice };
      for (let i = list.length - 1; i >= 0; i--) {
        const P = toPx(list[i]);
        if (P && G.hitDistance(list[i], P, x, y, w, henv) <= HIT) return { d: list[i], handle: null };
      }
      return null;
    }
    // Dibujos dentro del recuadro de selección.
    function idsInRect(r) {
      const sym = env.symbol();
      if (store.prefs().hideAll) return [];
      const out = [];
      store.list(sym).forEach((d) => {
        if (d.hidden) return;
        const P = toPx(d);
        if (P && G.inRect(d, P, r)) out.push(d.id);
      });
      return out;
    }

    // ---------- Crear ----------
    function winOn(on) {
      const f = on ? window.addEventListener : window.removeEventListener;
      f.call(window, 'mousemove', onWinMove, true);
      f.call(window, 'mouseup', onWinUp, true);
    }
    function cancel() {
      if (L.draft) { L.draft = null; L.press = null; if (!L.drag && !L.marquee) winOn(false); repaint(); }
      closeEditor();
    }
    function startDraft(type, pt, loc) {
      const spec = D.TYPES[type];
      const base = store.typeDefaults(type);
      if (spec.pts === 1) { commit(Object.assign(base, { type, pts: [pt] })); return; }
      L.draft = Object.assign(base, { type, pts: [pt], cur: pt });
      L.press = { x: loc.x, y: loc.y };
      winOn(true);
      repaint();
    }
    function addPoint(pt) {
      const d = L.draft, spec = D.TYPES[d.type];
      if (spec.pts === 0) {
        const a = d.pts[d.pts.length - 1];
        const ax = env.xOfTime(a.t), ay = env.yOfPrice(a.p), bx = env.xOfTime(pt.t), by = env.yOfPrice(pt.p);
        if (Math.hypot(ax - bx, ay - by) < 3) return;
        d.pts.push(pt);
      } else {
        d.pts.push(pt);
        if (d.pts.length >= spec.pts) { finish(); return; }
      }
      d.cur = pt;
      repaint();
    }
    // Termina el dibujo en curso (polilínea: doble clic o Enter).
    function finish() {
      const d = L.draft;
      if (!d) return;
      const spec = D.TYPES[d.type];
      L.draft = null; L.press = null; if (!L.drag && !L.marquee) winOn(false);
      if (spec.pts === 0 && d.pts.length < 2) { repaint(); return; }
      const obj = Object.assign({}, d); delete obj.cur;
      commit(obj);
    }
    function commit(obj) {
      const sym = env.symbol();
      if (obj.type === 'ruler') { L.ruler = obj; store.setTool(null); repaint(); return; }
      if (obj.type === 'text') { openEditor(obj, true); return; }
      store.add(sym, obj);
      if (!store.prefs().keep) store.setTool(null);
      repaint();
    }

    // Editor de texto dentro del gráfico (prompt() no existe en Electron).
    function closeEditor() { if (L.editor) { const e = L.editor; L.editor = null; e.onblur = null; e.remove(); } }
    function openEditor(d, isNew) {
      closeEditor();
      const P = toPx(d), pr = env.paneRect(), cr = env.chartEl.getBoundingClientRect();
      if (!P || !pr) return;
      const size = d.size || 14;
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'draw-text-input'; inp.placeholder = 'Escribe el texto y pulsa Enter';
      inp.value = d.text || '';
      inp.style.left = Math.max(2, P[0].x) + 'px';
      inp.style.top = Math.max(2, pr.top - cr.top + P[0].y - size - 8) + 'px';
      inp.style.fontSize = size + 'px';
      host.appendChild(inp);
      L.editor = inp;
      let done = false;
      const end = (ok) => {
        if (done) return;
        done = true;
        const txt = inp.value.trim();
        if (L.editor === inp) L.editor = null;
        inp.remove();
        const sym = env.symbol();
        if (ok && txt) {
          if (isNew) { d.text = txt; store.add(sym, d); } else store.patch(sym, d.id, { text: txt });
        }
        if (isNew && !store.prefs().keep) store.setTool(null);
        repaint();
      };
      inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); };
      inp.onblur = () => end(true);
      inp.onmousedown = (e) => e.stopPropagation();
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    }

    // ---------- Ratón ----------
    const isUi = (t) => !!(t && t.closest && t.closest('.max-btn, .pl-btns, .pl-btn, .ctimer, .draw-text-input'));
    function stop(e) { e.stopPropagation(); e.preventDefault(); }

    function onDown(e) {
      if (destroyed || e.button !== 0 || !env.active() || isUi(e.target)) return;
      const loc = local(e);
      if (!loc.inPane) return;
      const tool = store.state.tool, sym = env.symbol();
      if (L.ruler) { L.ruler = null; repaint(); }
      if (tool || L.draft) {
        stop(e);
        const ref = L.draft && e.shiftKey ? draftShiftRef(L.draft) : null;
        const pt = dataAt(loc.x, loc.y, ref);
        if (!pt) return;
        if (L.draft) addPoint(pt); else startDraft(tool, pt, loc);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (e.shiftKey) {
        // Shift + arrastrar: recuadro de selección (con Ctrl también se conserva lo ya seleccionado)
        stop(e);
        L.marquee = { x1: loc.x, y1: loc.y, x2: loc.x, y2: loc.y, add: mod };
        winOn(true);
        repaint();
        return;
      }
      const hit = hitAt(loc.x, loc.y);
      if (hit) {
        stop(e);
        if (mod) { store.select(sym, hit.d.id, 'toggle'); return; }       // Ctrl + clic: uno por uno
        const group = store.isSelected(sym, hit.d.id) && store.state.multi.length > 1 && hit.handle === null;
        if (!group) store.select(sym, hit.d.id);
        const ids = (group ? store.state.multi.slice() : [hit.d.id]).filter((id) => { const q = store.get(sym, id); return q && !q.locked; });
        if (ids.length) {
          const origs = {};
          ids.forEach((id) => { origs[id] = JSON.parse(JSON.stringify(store.get(sym, id).pts)); });
          const first = store.get(sym, ids[0]);
          const g = { ids, handle: group ? null : hit.handle, type: first.type, sx: loc.x, sy: loc.y, origs, moved: false };
          if (g.handle !== null && first.type === 'rect') g.px = toPx(first);
          L.drag = g;
          winOn(true);
        }
        return;
      }
      if (store.state.sel) store.select(null);
    }
    function onWinMove(e) {
      const loc = local(e);
      if (L.marquee) { L.marquee.x2 = loc.x; L.marquee.y2 = loc.y; repaint(); return; }
      if (L.drag) {
        const g = L.drag, sym = env.symbol();
        const dx = loc.x - g.sx, dy = loc.y - g.sy;
        if (!g.moved) { if (Math.hypot(dx, dy) < 3) return; g.moved = true; store.begin(sym); }
        if (g.handle !== null && g.handle !== undefined) {
          const id = g.ids[0], orig = g.origs[id];
          let pts;
          if (g.type === 'rect') {
            const np = dataAt(loc.x, loc.y);
            if (!np || !g.px) return;
            pts = G.resizeRectData(orig, g.px, g.handle, np);
          } else {
            const np = dataAt(loc.x, loc.y, e.shiftKey ? handleShiftRef(g.type, orig, g.handle) : null);
            if (!np) return;
            pts = orig.map((p, i) => (i === g.handle ? np : p));
          }
          store.move(sym, id, pts);
        } else {
          const map = {};
          g.ids.forEach((id) => {
            const q = store.get(sym, id);
            map[id] = g.origs[id].map((p) => shiftPt(p, q && q.type === 'hline' ? 0 : dx, dy));
          });
          store.moveMany(sym, map);
        }
        return;
      }
      if (L.draft) {
        const pt = dataAt(loc.x, loc.y, e.shiftKey ? draftShiftRef(L.draft) : null);
        if (pt) { L.draft.cur = pt; repaint(); }
      }
    }
    function onWinUp(e) {
      if (L.marquee) {
        const m = L.marquee; L.marquee = null;
        if (!L.draft && !L.drag) winOn(false);
        const r = { x1: Math.min(m.x1, m.x2), x2: Math.max(m.x1, m.x2), y1: Math.min(m.y1, m.y2), y2: Math.max(m.y1, m.y2) };
        if (r.x2 - r.x1 > 3 || r.y2 - r.y1 > 3) store.selectMany(env.symbol(), idsInRect(r), m.add);
        else if (!m.add) store.select(null);
        repaint();
        return;
      }
      if (L.drag) {
        const g = L.drag; L.drag = null;
        if (!L.draft) winOn(false);
        if (g.moved) store.end();
        return;
      }
      if (L.draft && L.press) {
        const loc = local(e), moved = Math.hypot(loc.x - L.press.x, loc.y - L.press.y);
        L.press = null;
        if (moved > 6) { const pt = dataAt(loc.x, loc.y, e.shiftKey ? draftShiftRef(L.draft) : null); if (pt) addPoint(pt); }
      }
    }
    // Pasar el ratón por encima: resalta el dibujo y cambia el cursor.
    function onHover(e) {
      if (destroyed || L.drag || L.draft || L.marquee || store.state.tool || !env.active()) return;
      const loc = local(e);
      const hit = loc.inPane && !isUi(e.target) ? hitAt(loc.x, loc.y) : null;
      const id = hit ? hit.d.id : null;
      if (id !== L.hoverId) { L.hoverId = id; host.classList.toggle('draw-over', !!id); repaint(); }
    }
    function onDbl(e) {
      if (destroyed || !env.active() || isUi(e.target)) return;
      const loc = local(e);
      if (!loc.inPane) return;
      if (L.draft) { stop(e); finish(); return; }
      if (store.state.tool) { stop(e); return; }
      const hit = hitAt(loc.x, loc.y);
      if (!hit) return;
      stop(e);
      if (hit.d.type === 'text') openEditor(hit.d, false);
      else store.emit('props', { sym: env.symbol(), id: hit.d.id });
    }
    function onCtx(e) {
      if (destroyed || !env.active() || isUi(e.target)) return;
      const loc = local(e);
      if (!loc.inPane) return;
      if (L.draft || store.state.tool) { stop(e); cancel(); store.setTool(null); return; }
      const hit = hitAt(loc.x, loc.y);
      if (!hit) return;
      stop(e);
      const sym = env.symbol();
      if (!store.isSelected(sym, hit.d.id)) store.select(sym, hit.d.id);
      store.emit('ctx', { x: e.clientX, y: e.clientY, sym, id: hit.d.id });
    }
    host.addEventListener('mousedown', onDown, true);
    host.addEventListener('mousemove', onHover);
    host.addEventListener('dblclick', onDbl, true);
    host.addEventListener('contextmenu', onCtx, true);
    host.addEventListener('mouseleave', () => { if (L.hoverId) { L.hoverId = null; host.classList.remove('draw-over'); repaint(); } });

    // Cambios en el almacén (de este u otro gráfico): repintar y ajustar el cursor.
    const off = store.on((kind) => {
      if (kind === 'tool') {
        if (L.draft && store.state.tool !== L.draft.type) cancel();
        host.classList.toggle('draw-tool', !!store.state.tool);
        if (store.state.tool) { host.classList.remove('draw-over'); L.hoverId = null; }
      }
      repaint();
    });
    host.classList.toggle('draw-tool', !!store.state.tool);

    return {
      prim,
      attach(series) {
        if (attachedTo === series) return;
        this.detach();
        if (series) { series.attachPrimitive(prim); attachedTo = series; }
      },
      detach() { if (attachedTo) { try { attachedTo.detachPrimitive(prim); } catch (e) { /* ya quitado */ } attachedTo = null; } },
      repaint, cancel, finish,
      hasDraft: () => !!L.draft,
      editText(id) { const d = store.get(env.symbol(), id); if (d) openEditor(d, false); },
      clearRuler() { if (L.ruler) { L.ruler = null; repaint(); } },
      // Desplazamiento (en píxeles) de un punto, para duplicar un dibujo sin taparlo.
      offsetPoint(pt, dx, dy) { return shiftPt(pt, dx, dy); },
      destroy() {
        destroyed = true;
        off(); cancel(); winOn(false);
        host.removeEventListener('mousedown', onDown, true);
        host.removeEventListener('mousemove', onHover);
        host.removeEventListener('dblclick', onDbl, true);
        host.removeEventListener('contextmenu', onCtx, true);
        this.detach();
      },
    };
  }

  D.createLayer = createLayer;
})(typeof window !== 'undefined' ? window : globalThis);

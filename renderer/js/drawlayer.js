// Ar_Trading - capa de dibujo de un gráfico (v0.7): pinta los dibujos sobre el panel de precios (primitiva de la serie)
// y maneja el ratón (crear, seleccionar, mover, editar puntos). Los datos viven en el almacén de draw.js.
(function (root) {
  'use strict';
  const D = root.TVDraw;
  const G = D.geom;
  const HIT = 6;          // distancia (px) para "tocar" un dibujo
  const HANDLE_HIT = 9;   // distancia (px) para agarrar un tirador
  const MAGNET_PX = 40;   // el imán actúa si el precio de la vela está a menos de esto
  const ACCENT = '#2962ff';

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
    const L = { draft: null, ruler: null, hoverId: null, drag: null, press: null, editor: null };
    let request = null, attachedTo = null, destroyed = false;
    const host = env.host;
    const repaint = () => { if (request) request(); };
    const themed = (c) => (root.TVLib ? root.TVLib.themedColor(c, env.theme()) : c);

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

    function drawOne(ctx, d, w, h, o) {
      const P = toPx(d);
      if (!P || !P.length) return;
      setStroke(ctx, d, o);
      const color = themed(d.color);
      switch (d.type) {
        case 'trend':
          if (P.length > 1) seg(ctx, G.lineSegment(P[0].x, P[0].y, P[1].x, P[1].y, d.extL, d.extR, w));
          break;
        case 'ray':
          if (P.length > 1) seg(ctx, G.raySegment(P[0].x, P[0].y, P[1].x, P[1].y, w));
          break;
        case 'hline':
          seg(ctx, [0, P[0].y, w, P[0].y]);
          break;
        case 'poly':
          if (P.length > 1) { ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y); ctx.stroke(); }
          break;
        case 'rect':
          if (P.length > 1) {
            const r = G.rectOf(P);
            if (d.fill) { ctx.fillStyle = rgba(color, (d.fillOpacity == null ? 15 : d.fillOpacity) / 100); ctx.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1); }
            ctx.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
          }
          break;
        case 'channel': drawChannel(ctx, d, P, w, color); break;
        case 'fib': if (P.length > 1) drawFib(ctx, d, P, w, o); break;
        case 'text': drawText(ctx, d, P); break;
        case 'ruler': if (P.length > 1) drawRuler(ctx, d, P, w, h); break;
        default: break;
      }
      ctx.setLineDash([]);
      if ((o && o.selected) || (o && o.draft)) drawHandles(ctx, d, P, w);
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
      ctx.font = '11px sans-serif'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.lineWidth = (d.width || 1) + (o && (o.hover || o.selected) ? 0.5 : 0);
      lv.forEach((l) => {
        ctx.strokeStyle = l.color; ctx.setLineDash(D.DASHES[d.dash] || []);
        seg(ctx, [xl, l.y, xr, l.y]);
        ctx.fillStyle = l.color;
        haloText(ctx, d.showPrice ? `${l.v} (${env.fmtPrice(l.price)})` : String(l.v), Math.max(xl, 0) + 4, l.y - 3, env.bg());
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
      // punta de flecha
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
      const sel = store.state.sel;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      store.list(sym).forEach((d) => {
        if (d.hidden || store.prefs().hideAll) return;
        drawOne(ctx, d, w, h, { selected: !!sel && sel.sym === sym && sel.id === d.id, hover: L.hoverId === d.id });
      });
      if (L.draft) drawOne(ctx, Object.assign({}, L.draft, { pts: L.draft.pts.concat(L.draft.cur ? [L.draft.cur] : []) }), w, h, { draft: true });
      if (L.ruler) drawOne(ctx, L.ruler, w, h, {});
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
          if (d.type !== 'hline' || d.hidden || !d.pts[0]) return;
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
    // Punto (tiempo, precio) bajo el ratón; con el imán se pega al precio más cercano de la vela.
    function dataAt(x, y) {
      let t = env.timeOfX(x), p = env.priceOfY(y);
      if (!num(t) || !num(p)) return null;
      if (store.prefs().magnet) {
        const bars = env.bars(), lg = env.logicalOfX(x);
        if (num(lg)) {
          const i = Math.round(lg);
          if (i >= 0 && i < bars.length) {
            const b = bars[i];
            const vals = env.chartType() === 'candles' ? [b.open, b.high, b.low, b.close] : [b.close];
            let best = null, bd = 1e9;
            vals.forEach((v) => { const yy = env.yOfPrice(v); if (num(yy) && Math.abs(yy - y) < bd) { bd = Math.abs(yy - y); best = v; } });
            if (best !== null && bd <= MAGNET_PX) { p = best; t = env.centerTime(i); }
          }
        }
      }
      return { t, p };
    }
    function shiftPt(pt, dx, dy) {
      const t = env.timeOfX(env.xOfTime(pt.t) + dx), p = env.priceOfY(env.yOfPrice(pt.p) + dy);
      return num(t) && num(p) ? { t, p } : pt;
    }

    function hitAt(x, y) {
      const sym = env.symbol(), w = env.plotWidth();
      const sel = store.state.sel;
      const list = store.prefs().hideAll ? [] : store.list(sym).filter((d) => !d.hidden);
      if (sel && sel.sym === sym) {
        const d = list.find((q) => q.id === sel.id);
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

    // ---------- Crear ----------
    function winOn(on) {
      const f = on ? window.addEventListener : window.removeEventListener;
      f.call(window, 'mousemove', onWinMove, true);
      f.call(window, 'mouseup', onWinUp, true);
    }
    function cancel() {
      if (L.draft) { L.draft = null; L.press = null; winOn(false); repaint(); }
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
      L.draft = null; L.press = null; winOn(false);
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
      const tool = store.state.tool;
      if (L.ruler) { L.ruler = null; repaint(); }
      if (tool || L.draft) {
        stop(e);
        const pt = dataAt(loc.x, loc.y);
        if (!pt) return;
        if (L.draft) addPoint(pt); else startDraft(tool, pt, loc);
        return;
      }
      const hit = hitAt(loc.x, loc.y);
      if (hit) {
        stop(e);
        store.select(env.symbol(), hit.d.id);
        if (!hit.d.locked) {
          L.drag = { id: hit.d.id, type: hit.d.type, handle: hit.handle, sx: loc.x, sy: loc.y, orig: JSON.parse(JSON.stringify(hit.d.pts)), moved: false };
          winOn(true);
        }
        return;
      }
      if (store.state.sel) store.select(null);
    }
    function onWinMove(e) {
      const loc = local(e);
      if (L.drag) {
        const g = L.drag, sym = env.symbol();
        const dx = loc.x - g.sx, dy = loc.y - g.sy;
        if (!g.moved) { if (Math.hypot(dx, dy) < 3) return; g.moved = true; store.begin(sym); }
        let pts;
        if (g.handle !== null && g.handle !== undefined) {
          const np = dataAt(loc.x, loc.y);
          if (!np) return;
          pts = g.orig.map((p, i) => (i === g.handle ? np : p));
        } else {
          pts = g.orig.map((p) => shiftPt(p, g.type === 'hline' ? 0 : dx, dy));
        }
        store.move(sym, g.id, pts);
        return;
      }
      if (L.draft) {
        const pt = dataAt(loc.x, loc.y);
        if (pt) { L.draft.cur = pt; repaint(); }
      }
    }
    function onWinUp(e) {
      if (L.drag) {
        const g = L.drag; L.drag = null;
        if (!L.draft) winOn(false);
        if (g.moved) store.end();
        return;
      }
      if (L.draft && L.press) {
        const loc = local(e), moved = Math.hypot(loc.x - L.press.x, loc.y - L.press.y);
        L.press = null;
        if (moved > 6) { const pt = dataAt(loc.x, loc.y); if (pt) addPoint(pt); }
      }
    }
    // Pasar el ratón por encima: resalta el dibujo y cambia el cursor.
    function onHover(e) {
      if (destroyed || L.drag || L.draft || store.state.tool || !env.active()) return;
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
      store.select(env.symbol(), hit.d.id);
      store.emit('ctx', { x: e.clientX, y: e.clientY, sym: env.symbol(), id: hit.d.id });
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

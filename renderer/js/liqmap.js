// Mapa de liquidaciones (v0.23): capa sobre el gráfico de velas. Mapa de calor ESTIMADO (precio × tiempo) + perfil lateral por precio.
// Los datos los calcula el servidor (src/liq/): aquí solo se piden y se dibujan con canvas, respetando zoom y desplazamiento.
// Estructura visual inspirada en los mapas de liquidaciones habituales (segmentos horizontales que nacen y terminan al cruzarlos el precio,
// perfil lateral con curva acumulada, niveles clave marcados en el eje de precio). Es un diseño propio.
// Lo estimado NO es el dato real de las posiciones: los exchanges no publican posiciones individuales.
(function (root) {
  'use strict';
  const LEVS = [5, 10, 25, 50, 100];
  const EXS = { binance: 'Binance', bybit: 'Bybit', okx: 'OKX' };
  const COLS = ['#e3c8ff', '#c77dff', '#9b4dff', '#ffb020', '#ff6a00'];     // perfil: 5x, 10x y 25x en lila/violeta; 50x y 100x en naranja (los más importantes)
  const IMPW = [0.15, 0.3, 0.6, 1, 1.2];                                   // importancia por apalancamiento: manda el 50x–100x
  const KEY_COLOR = '#ff9800';

  // ---------- Configuración por gráfico (vcfg.liq) ----------
  function defaults() {
    return { on: false, mode: 'comb', src: { binance: true, bybit: true, okx: true }, levs: { 5: true, 10: true, 25: true, 50: true, 100: true }, w: [10, 25, 30, 20, 15], scale: 1, days: 14, half: 72, bin: 0, profile: true, pw: 26, keys: 4, events: true, detail: 1 };
  }
  const num = (v, a, b, d) => { const x = Number(v); return Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : d; };
  function clean(x) {
    const d = defaults();
    if (!x || typeof x !== 'object') return d;
    const o = {
      on: !!x.on, mode: ['comb', 'binance', 'bybit', 'okx'].includes(x.mode) ? x.mode : 'comb',
      src: { binance: x.src ? x.src.binance !== false : true, bybit: x.src ? x.src.bybit !== false : true, okx: x.src ? x.src.okx !== false : true },
      levs: {}, w: d.w.slice(), scale: num(x.scale, 0.2, 4, 1), days: [3, 7, 14, 30].includes(Number(x.days)) ? Number(x.days) : 14,
      half: [0, 24, 72, 168].includes(Number(x.half)) ? Number(x.half) : 72, bin: [0, 5, 10, 20, 50].includes(Number(x.bin)) ? Number(x.bin) : 0,
      profile: x.profile !== false, pw: num(x.pw, 10, 40, 26), keys: Math.round(num(x.keys, 0, 8, 4)), events: x.events !== false, detail: num(x.detail, 0.3, 3, 1),
    };
    LEVS.forEach((l) => { o.levs[l] = x.levs ? x.levs[l] !== false : true; });
    if (Array.isArray(x.w) && x.w.length === 5) o.w = x.w.map((v, i) => num(v, 0, 100, d.w[i]));
    return o;
  }
  // Parámetros de la consulta al servidor
  // Tamaño de casilla automático (≈ 0,0125 % del precio, redondeado a un valor «bonito»)
  function autoBin(price) {
    const raw = (price > 0 ? price : 80000) * 0.000125;
    const steps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
    return steps.find((v) => v >= raw) || 100;
  }
  function params(c, price) {
    const ex = c.mode === 'comb' ? Object.keys(EXS).filter((k) => c.src[k]) : [c.mode];
    const colSec = Math.min(14400, Math.max(300, Math.ceil((c.days * 86400) / 800 / 300) * 300));
    return { ex: ex.join(','), levs: LEVS.filter((l) => c.levs[l]).join(','), w: c.w.join(','), colSec: String(colSec), halfLife: String(c.half), binSize: String(c.bin > 0 ? c.bin : autoBin(price)), sinceDays: String(c.days) };
  }

  // ---------- Color: teal → verde → amarillo → rojo ----------
  const STOPS = [[0, [38, 166, 166]], [0.28, [46, 204, 40]], [0.55, [255, 232, 0]], [0.78, [255, 140, 0]], [1, [255, 26, 26]]];
  function rampColor(v) {
    v = Math.min(1, Math.max(0, v));
    for (let i = 1; i < STOPS.length; i++) {
      if (v <= STOPS[i][0]) {
        const a = STOPS[i - 1], b = STOPS[i], f = (v - a[0]) / (b[0] - a[0]);
        return [0, 1, 2].map((k) => Math.round(a[1][k] + (b[1][k] - a[1][k]) * f));
      }
    }
    return STOPS[STOPS.length - 1][1];
  }
    // Importancia de un nivel: pesa más el apalancamiento alto (50x–100x). Decide qué se muestra y el color (naranja/rojo = 50x–100x).
  const imp = (lv) => lv[0] * IMPW[0] + lv[1] * IMPW[1] + lv[2] * IMPW[2] + lv[3] * IMPW[3] + lv[4] * IMPW[4];
  // Valor de color: lo bajo (5x–25x) pesa poco; lo alto (50x–100x) pesa entero
  const heatVal = (lv) => 0.35 * (lv[0] + lv[1] + lv[2]) + lv[3] + lv[4];

  // Cubetas de precio: junta varias casillas en filas de al menos ~8 px (como las bandas gruesas de los mapas de referencia).
  // Solo niveles VIVOS (los ya barridos no se dibujan). Cada cubeta guarda sus altas por tiempo para pintar el escalón de color.
  function bucketize(segs, rowBins) {
    const m = new Map();
    segs.forEach((r) => {
      if (r[2] !== 0) return;
      const id = Math.floor(r[0] / rowBins);
      let b = m.get(id);
      if (!b) { b = { id, side: r[3], items: [], lv: [0, 0, 0, 0, 0], v: 0 }; m.set(id, b); }
      b.items.push({ t0: r[1], w: [r[4], r[5], r[6], r[7], r[8]] });
      for (let i = 0; i < 5; i++) b.lv[i] += r[4 + i];
    });
    m.forEach((b) => { b.items.sort((x, y) => x.t0 - y.t0); b.v = heatVal(b.lv); b.imp = imp(b.lv); });
    return Array.from(m.values());
  }
  // Filtro de ruido: de las cubetas visibles se dejan las más importantes. El cupo depende del alto de la pantalla,
  // así que al alejar (muchas cubetas compiten por el mismo espacio) solo quedan las mayores y al acercar salen las de esa zona.
  function pickBuckets(list, budget, minRel) {
    if (!list.length) return [];
    const sorted = list.slice().sort((a, b) => b.imp - a.imp);
    const top = sorted[0].imp;
    return sorted.slice(0, Math.max(1, budget)).filter((b) => b.imp >= top * minRel);
  }

  // ---------- Perfil por precio (solo niveles vivos) ----------
  function profile(segs, binSize) {
    const m = new Map();
    segs.forEach((r) => {
      if (r[2] !== 0) return;
      let b = m.get(r[0]);
      if (!b) { b = { bin: r[0], price: r[0] * binSize + binSize / 2, side: r[3], lv: [0, 0, 0, 0, 0], tot: 0 }; m.set(r[0], b); }
      for (let i = 0; i < 5; i++) b.lv[i] += r[4 + i];
      b.tot = b.lv[0] + b.lv[1] + b.lv[2] + b.lv[3] + b.lv[4]; b.imp = imp(b.lv);
    });
    return Array.from(m.values()).sort((a, b) => a.price - b.price);
  }
  // Niveles clave: las n barras más grandes del perfil, separadas al menos gapPct entre sí
  function peaks(prof, n, gapPct) {
    const out = [];
    prof.slice().sort((a, b) => b.imp - a.imp).forEach((b) => {
      if (out.length >= n) return;
      if (out.every((o) => Math.abs(o.price - b.price) / b.price > gapPct)) out.push(b);
    });
    return out;
  }
  // Curvas acumuladas: cortos hacia arriba y largos hacia abajo desde el precio actual
  function cumulative(prof, price) {
    const up = prof.filter((b) => b.price > price).sort((a, b) => a.price - b.price);
    const dn = prof.filter((b) => b.price <= price).sort((a, b) => b.price - a.price);
    let c = 0; const U = up.map((b) => { c += b.tot; return { price: b.price, c }; });
    c = 0; const D = dn.map((b) => { c += b.tot; return { price: b.price, c }; });
    return { up: U, dn: D, max: Math.max(U.length ? U[U.length - 1].c : 0, D.length ? D[D.length - 1].c : 0) };
  }

  // ---------- Capa sobre el gráfico ----------
  // env: { host, chart(), series(), bars(), tfSec(), cfg() -> vcfg.liq, symbol(), api, dark(), suspended(), openPanel(), lc }
  function create(env) {
    let request = null, model = null, timer = null, fetching = false, lines = [], lastKey = '', destroyed = false, ver = 0, err = '';
    let cache = { key: '', cv: null };
    const cfg = () => env.cfg();
    const active = () => cfg().on && env.symbol() === 'BTCUSDT';

    // --- aviso en pantalla (por exchange) ---
    const badge = document.createElement('div');
    badge.className = 'liq-badge hidden';
    env.host.appendChild(badge);
    function renderBadge() {
      const c = cfg();
      badge.classList.toggle('hidden', !c.on);
      if (!c.on) return;
      badge.innerHTML = '';
      const add = (cls, txt, title) => { const e = document.createElement('span'); e.className = cls; e.textContent = txt; if (title) e.title = title; badge.appendChild(e); return e; };
      if (env.symbol() !== 'BTCUSDT') { add('liq-t', 'Mapa de liquidaciones: solo disponible para BTCUSDT.'); return; }
      add('liq-t', 'Mapa de liquidaciones · ESTIMADO', 'Calculado a partir del interés abierto y el precio. Los exchanges no publican las posiciones reales: es una estimación, no el dato real.');
      if (model) {
        Object.keys(EXS).forEach((k) => {
          const st = model.status[k]; if (!st) return;
          const used = c.mode === 'comb' ? c.src[k] : c.mode === k;
          if (!used) return;
          const bad = st.state === 'error', warn = st.state === 'aviso' || st.state === 'cargando' || st.ws === 'error';
          const parts = [st.msg, st.ws === 'error' ? 'Liquidaciones en vivo: ' + (st.wsMsg || 'sin conexión') : '', st.mmrNote].filter(Boolean);
          add('liq-chip ' + (bad ? 'bad' : warn ? 'warn' : 'ok'), EXS[k] + (bad ? ' ✕' : warn ? ' !' : ' ✓'), parts.join('\n') || 'Funciona');
        });
        if (model.mock) add('liq-note', 'DATOS SIMULADOS');
        else if (model.historyFrom) add('liq-note', 'Memoria desde ' + new Date(model.historyFrom * 1000).toLocaleDateString());
        const bads = Object.keys(EXS).filter((k) => model.status[k] && model.status[k].state === 'error' && (c.mode === 'comb' ? c.src[k] : c.mode === k));
        bads.forEach((k) => add('liq-err', EXS[k] + ': ' + model.status[k].msg));
        const warns = Object.keys(EXS).filter((k) => model.status[k] && c.src[k] && model.status[k].mmrNote && c.mode !== 'x');
        if (warns.length && !bads.length) add('liq-note', 'Margen de mantenimiento por defecto (no verificado) en: ' + warns.map((k) => EXS[k]).join(', '));
        if (model.writeError) add('liq-err', 'No se pudo guardar la memoria en disco: ' + model.writeError);
        if (!model.segs.length && !bads.length) add('liq-note', 'Aún sin datos suficientes: el mapa se irá llenando mientras el programa esté encendido.');
      }
      if (err) add('liq-err', err);
      const b = add('liq-btn', 'Ajustes'); b.onclick = () => env.openPanel();
    }

    // --- datos ---
    async function fetchNow(force) {
      if (!active() || fetching || destroyed) return;
      const bb = env.bars();
      if (!bb.length) return;                                         // aún no hay velas: se pide cuando el gráfico las tenga (onSeries)
      const p = params(cfg(), bb.length ? bb[bb.length - 1].close : 0);
      if (!p.ex) { model = null; err = 'Elige al menos un exchange en Ajustes.'; renderBadge(); if (request) request(); return; }
      const key = JSON.stringify(p);
      if (!force && key === lastKey && model && Date.now() - model.fetchedAt < 25000) return;
      fetching = true;
      try {
        const m = await env.api.liqMap(p);
        if (destroyed) return;
        m.fetchedAt = Date.now();
        model = prepare(m); err = ''; lastKey = key; ver++;
      } catch (e) { err = 'No se pudo leer el mapa del programa: ' + (e && e.message ? e.message : e); }
      finally { fetching = false; }
      syncKeyLines(); renderBadge(); if (request) request();
    }
    function prepare(m) {
      const prof = profile(m.segs, m.binSize);
      const c = cfg();
      return Object.assign(m, { prof, cum: cumulative(prof, m.price || 0), peaks: peaks(prof, c.keys, 0.004) });
    }
    function syncKeyLines() {
      const s = env.series();
      if (!s) return;
      lines.forEach((h) => { try { s.removePriceLine(h); } catch (e) { /* ya quitada */ } });
      lines = [];
      if (!active() || !model || !cfg().keys) return;
      model.peaks = peaks(model.prof, cfg().keys, 0.004);
      model.peaks.forEach((p) => { try { lines.push(s.createPriceLine({ price: p.price, color: KEY_COLOR, lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: '' })); } catch (e) { /* ok */ } });
    }

    // --- dibujo ---
    function xMaker() {
      const bars = env.bars(), sec = env.tfSec(), ts = env.chart().timeScale(), n = bars.length;
      if (!n || !(sec > 0)) return null;
      return (t) => {
        let lo = 0, hi = n - 1, i = -1;
        while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].time <= t) { i = m; lo = m + 1; } else hi = m - 1; }
        const lg = i < 0 ? (t - bars[0].time) / sec : (i === n - 1 ? i + (t - bars[i].time) / sec : i + (t - bars[i].time) / (bars[i + 1].time - bars[i].time));
        return ts.logicalToCoordinate(lg);
      };
    }
    const heatView = {
      zOrder: () => 'bottom',
      renderer: () => ({
        draw(target) {
          if (!active() || !model || !model.segs.length) return;
          const ch = env.chart(), se = env.series(); if (!ch || !se) return;
          target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context, hpr = scope.horizontalPixelRatio, vpr = scope.verticalPixelRatio, W = scope.bitmapSize.width, H = scope.bitmapSize.height;
            const X = xMaker(); if (!X) return;
            const ts = ch.timeScale(), lr = ts.getVisibleLogicalRange(); if (!lr) return;
            const bs = model.binSize, c = cfg();
            const p0 = model.price || bs * 1000, ya = se.priceToCoordinate(p0), yb = se.priceToCoordinate(p0 + bs * 100);
            if (ya === null || yb === null) return;
            const key = [lr.from.toFixed(2), lr.to.toFixed(2), ya, yb, W, H, ver, c.scale, c.detail].join('|');
            if (cache.key !== key || !cache.cv) {
              const cv = cache.cv || document.createElement('canvas');
              cv.width = W; cv.height = H;
              const g = cv.getContext('2d');
              g.clearRect(0, 0, W, H);
              const pxBin = Math.abs(yb - ya) / 100 * vpr;
              const rowBins = Math.max(1, Math.ceil((8 * vpr) / Math.max(pxBin, 0.01)));
              const all = bucketize(model.segs, rowBins), vis = [];
              all.forEach((bk) => {
                const yT = se.priceToCoordinate((bk.id + 1) * rowBins * bs), yB = se.priceToCoordinate(bk.id * rowBins * bs);
                if (yT === null || yB === null) return;
                const top = Math.round(Math.min(yT, yB) * vpr), hgt = Math.round(Math.abs(yB - yT) * vpr);
                if (top > H || top + hgt < 0) return;
                bk.top = top; bk.hgt = Math.max(2, hgt - 1); vis.push(bk);
              });
              const picked = pickBuckets(vis, Math.round((H / vpr / 26) * c.detail), 0.1);
              const refV = Math.max.apply(null, picked.map((bk) => bk.v).concat([1e-9]));
              const lut = []; for (let i = 0; i <= 40; i++) lut.push(rampColor(i / 40));
              picked.forEach((bk) => {
                const cum = [0, 0, 0, 0, 0];
                const runs = [];
                bk.items.forEach((it) => {
                  for (let i = 0; i < 5; i++) cum[i] += it.w[i];
                  const x = X(it.t0); if (x === null) return;
                  const idx = Math.round(Math.min(1, (heatVal(cum) / refV) * c.scale) * 40);
                  const px = Math.max(0, Math.round(x * hpr));
                  if (runs.length && runs[runs.length - 1].idx === idx) return;
                  if (runs.length && runs[runs.length - 1].x === px) { runs[runs.length - 1].idx = idx; return; }
                  runs.push({ x: px, idx });
                });
                runs.forEach((r, k) => {
                  const x2 = k + 1 < runs.length ? runs[k + 1].x : W;
                  if (x2 <= r.x || r.x > W) return;
                  const col = lut[r.idx];
                  g.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
                  g.fillRect(r.x, bk.top, x2 - r.x, bk.hgt);
                });
              });
              // rayas verticales entre velas (como las barras por vela de los mapas de referencia); solo si hay sitio
              const spacing = ts.options().barSpacing * hpr;
              if (spacing >= 4) {
                g.globalCompositeOperation = 'destination-out';
                const gw = Math.max(1, Math.round(hpr));
                for (let i = Math.floor(lr.from); i <= Math.ceil(lr.to) && i - lr.from < 3000; i++) {
                  const x = ts.logicalToCoordinate(i + 0.5);
                  if (x !== null) g.fillRect(Math.round(x * hpr), 0, gw, H);
                }
                g.globalCompositeOperation = 'source-over';
              }
              cache = { key, cv };
            }
            ctx.drawImage(cache.cv, 0, 0);
          });
        },
      }),
    };
    const topView = {
      zOrder: () => 'top',
      renderer: () => ({
        draw(target) {
          if (!active() || !model) return;
          const ch = env.chart(), se = env.series(); if (!ch || !se) return;
          target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context, hpr = scope.horizontalPixelRatio, vpr = scope.verticalPixelRatio, W = scope.bitmapSize.width, H = scope.bitmapSize.height;
            const c = cfg(), bs = model.binSize;
            // liquidaciones reales: círculos (largos liquidados rojos, cortos liquidados verdes)
            if (c.events && model.events.length) {
              const X = xMaker();
              if (X) {
                ctx.save();
                model.events.forEach((e) => {
                  const x = X(e[0]), y = se.priceToCoordinate(e[3]);
                  if (x === null || y === null) return;
                  const r = Math.max(2, Math.min(12, Math.log10(Math.max(10, e[4])) * 1.6 - 3)) * hpr;
                  ctx.beginPath(); ctx.arc(x * hpr, y * vpr, r, 0, 6.2832);
                  ctx.fillStyle = e[2] === 0 ? 'rgba(255,82,82,0.55)' : 'rgba(38,198,128,0.55)'; ctx.fill();
                  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = hpr; ctx.stroke();
                });
                ctx.restore();
              }
            }
            if (!c.profile || !model.prof.length) return;
            const pw = Math.round(W * c.pw / 100), x0 = W - pw;
            ctx.save();
            ctx.fillStyle = env.dark() ? 'rgba(10,16,42,0.72)' : 'rgba(255,255,255,0.72)';
            ctx.fillRect(x0, 0, pw, H);
            const mx = Math.max.apply(null, model.prof.map((b) => b.tot)) || 1;
            const isPeak = new Set(model.peaks.map((p) => p.bin));
            // curvas acumuladas
            const cum = model.cum;
            if (cum.max > 0) {
              [[cum.up, 'rgba(255,60,60,', 'rgba(160,70,50,'], [cum.dn, 'rgba(0,210,120,', 'rgba(20,120,70,']].forEach(([arr, line, fill]) => {
                if (!arr.length) return;
                const pts = arr.map((q) => ({ x: W - (q.c / cum.max) * pw * 0.97, y: se.priceToCoordinate(q.price) })).filter((q) => q.y !== null);
                if (!pts.length) return;
                const yp = se.priceToCoordinate(model.price || 0);
                ctx.beginPath(); ctx.moveTo(W, (yp === null ? pts[0].y / vpr : yp) * vpr);
                pts.forEach((q) => ctx.lineTo(q.x, q.y * vpr));
                ctx.lineTo(W, pts[pts.length - 1].y * vpr); ctx.closePath();
                ctx.fillStyle = fill + '0.28)'; ctx.fill();
                ctx.beginPath(); pts.forEach((q, i) => { if (i) ctx.lineTo(q.x, q.y * vpr); else ctx.moveTo(q.x, q.y * vpr); });
                ctx.strokeStyle = line + '0.95)'; ctx.lineWidth = Math.max(1, hpr * 1.5); ctx.stroke();
              });
            }
            // barras por precio: se apilan los apalancamientos (de 5x a 100x) desde el borde derecho hacia la izquierda
            model.prof.forEach((b) => {
              const y1 = se.priceToCoordinate((b.bin + 1) * bs), y0 = se.priceToCoordinate(b.bin * bs);
              if (y1 === null || y0 === null) return;
              const top = Math.round(Math.min(y0, y1) * vpr), hgt = Math.max(1, Math.round(Math.abs(y0 - y1) * vpr));
              if (top > H || top + hgt < 0) return;
              let x = W;
              for (let i = 0; i < 5; i++) {
                const w = (b.lv[i] / mx) * pw * 0.97;
                if (w <= 0) continue;
                ctx.fillStyle = isPeak.has(b.bin) ? KEY_COLOR : COLS[i];
                ctx.fillRect(Math.round(x - w), top, Math.max(1, Math.round(w)), hgt);
                x -= w;
              }
            });
            ctx.restore();
          });
        },
      }),
    };
    const prim = {
      attached(p) { request = p.requestUpdate; },
      detached() { request = null; },
      updateAllViews() {},
      paneViews() { return active() ? [heatView, topView] : []; },
    };

    // Deja libre a la derecha el ancho del perfil para que la última vela no quede debajo
    function fitOffset() {
      try {
        const ch = env.chart(); if (!ch) return;
        const ts = ch.timeScale(), c = cfg();
        const bsp = ts.options().barSpacing || 6;
        const pw = c.on && c.profile ? ((ts.width() || env.host.clientWidth) * c.pw / 100) : 0;
        const n = Math.max(8, Math.ceil(pw / bsp) + 3);
        const prev = ts.options().rightOffset, atEdge = Math.abs(ts.scrollPosition() - prev) < 1.5;
        if (n === prev) return;
        ts.applyOptions({ rightOffset: n });
        if (atEdge) ts.scrollToPosition(n, false);
      } catch (e) { /* ok */ }
    }
    function refresh(force) {
      renderBadge(); syncKeyLines(); fitOffset();
      if (request) request();
      if (cfg().on) fetchNow(force !== false);
    }
    function start() {
      clearInterval(timer);
      timer = setInterval(() => { if (!env.suspended()) fetchNow(false); }, 30000);
      if (cfg().on) refresh(true);
    }
    start();
    return {
      prim, refresh, renderBadge,
      // velas extra a la derecha para que la última no quede debajo del perfil (vista inicial de ~167 velas)
      extraBars() { const c = cfg(); if (!(c.on && c.profile && env.symbol() === 'BTCUSDT')) return 0; const f = c.pw / 100; return Math.round(167 * f / (1 - f)); },
      onSeries() { syncKeyLines(); fitOffset(); if (request) request(); if (cfg().on) fetchNow(false); },
      destroy() { destroyed = true; clearInterval(timer); try { badge.remove(); } catch (e) { /* ok */ } },
      get model() { return model; },
    };
  }

  // ---------- Controles (se muestran en el panel de indicadores) ----------
  function panel(parent, c, onChange) {
    const box = document.createElement('div'); box.className = 'ind-block';
    const head = document.createElement('label'); head.className = 'ind-head';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = c.on;
    const t = document.createElement('span'); t.textContent = 'Mapa de liquidaciones (estimado, solo BTCUSDT)';
    head.append(cb, t); box.appendChild(head);
    const params = document.createElement('div'); params.className = 'ind-params';
    const mk = (label, el) => { const w = document.createElement('label'); w.className = 'ind-field'; const s = document.createElement('span'); s.textContent = label; w.append(s, el); params.appendChild(w); return w; };
    const sel = (opts, val, set) => { const s = document.createElement('select'); opts.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; if (String(v) === String(val)) o.selected = true; s.appendChild(o); }); s.onchange = () => { set(s.value); onChange(); }; return s; };
    const check = (val, set) => { const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!val; i.onchange = () => { set(i.checked); onChange(); }; return i; };
    const range = (min, max, step, val, set) => { const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = val; i.oninput = () => { set(Number(i.value)); onChange(true); }; return i; };
    mk('Ver', sel([['comb', 'Combinado'], ['binance', 'Solo Binance'], ['bybit', 'Solo Bybit'], ['okx', 'Solo OKX']], c.mode, (v) => { c.mode = v; }));
    Object.keys(EXS).forEach((k) => mk('Suma ' + EXS[k], check(c.src[k], (v) => { c.src[k] = v; })));
    LEVS.forEach((l) => mk('Apalancamiento ' + l + 'x', check(c.levs[l], (v) => { c.levs[l] = v; })));
    mk('Detalle (más = más bandas)', range(0.3, 3, 0.1, c.detail, (v) => { c.detail = v; }));
    mk('Intensidad del color', range(0.2, 4, 0.1, c.scale, (v) => { c.scale = v; }));
    mk('Historial', sel([[3, '3 días'], [7, '7 días'], [14, '14 días'], [30, '30 días']], c.days, (v) => { c.days = Number(v); }));
    mk('Antigüedad (vida media)', sel([[0, 'Sin envejecer'], [24, '24 h'], [72, '72 h'], [168, '7 días']], c.half, (v) => { c.half = Number(v); }));
    mk('Tamaño de casilla', sel([[0, 'Automático'], [5, '5 USD'], [10, '10 USD'], [20, '20 USD'], [50, '50 USD']], c.bin, (v) => { c.bin = Number(v); }));
    mk('Perfil lateral', check(c.profile, (v) => { c.profile = v; }));
    mk('Ancho del perfil', range(10, 40, 1, c.pw, (v) => { c.pw = v; }));
    mk('Niveles clave (líneas naranjas)', sel([0, 1, 2, 3, 4, 5, 6, 8].map((n) => [n, String(n)]), c.keys, (v) => { c.keys = Number(v); }));
    mk('Liquidaciones reales (círculos)', check(c.events, (v) => { c.events = v; }));
    const wl = document.createElement('div'); wl.className = 'ind-sub'; wl.textContent = 'Reparto del interés abierto por apalancamiento (%, suposición editable)'; params.appendChild(wl);
    LEVS.forEach((l, i) => { const n = document.createElement('input'); n.type = 'number'; n.min = 0; n.max = 100; n.value = c.w[i]; n.onchange = () => { c.w[i] = num(n.value, 0, 100, c.w[i]); onChange(); }; mk(l + 'x', n); });
    const hint = document.createElement('div'); hint.className = 'hint small';
    hint.textContent = 'ESTIMADO: se calcula con el interés abierto y el precio. Los exchanges no publican las posiciones reales. Por ahora el margen de mantenimiento de Binance es un valor por defecto no verificado. Los niveles se consumen cuando el precio los cruza.';
    box.appendChild(params); box.appendChild(hint);
    const sync = () => params.classList.toggle('off', !c.on);
    cb.onchange = () => { c.on = cb.checked; sync(); onChange(); };
    sync();
    parent.appendChild(box);
  }

  const api = { create, panel, defaults, clean, params, rampColor, bucketize, pickBuckets, heatVal, imp, profile, peaks, cumulative, LEVS, EXS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TVLiqMap = api;
})(typeof self !== 'undefined' ? self : globalThis);

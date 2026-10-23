// Un gráfico completo e independiente: datos en vivo, medias móviles, indicadores en paneles, VWAP y pivotes.
// La app puede crear de 1 a 4 de estos a la vez (ver app.js).
(function () {
  'use strict';
  const LC = window.LightweightCharts;
  const L = window.TVLib;
  const API = window.TVApi;

  const SUB_ORDER = ['rsi', 'stoch', 'delta', 'cvd'];
  const PIVOT_LEVELS = ['R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3'];
  const PIVOT_COLORS = { P: '#ff9800', R1: '#ef5350', R2: '#ef5350', R3: '#ef5350', S1: '#26a69a', S2: '#26a69a', S3: '#26a69a' };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Dibuja los pivotes como segmentos horizontales (uno por período) sobre el gráfico de precios.
  function makePivotPrimitive() {
    let chart = null, series = null, request = null;
    const prim = { segments: [] };
    const renderer = {
      draw(target) {
        if (!chart || !series || !prim.segments.length) return;
        target.useBitmapCoordinateSpace((scope) => {
          const ctx = scope.context;
          const hpr = scope.horizontalPixelRatio, vpr = scope.verticalPixelRatio;
          const ts = chart.timeScale();
          const width = scope.bitmapSize.width;
          ctx.save();
          ctx.lineWidth = Math.max(1, Math.round(hpr));
          ctx.font = `${Math.round(11 * vpr)}px sans-serif`;
          ctx.textAlign = 'right';
          const lastSeg = prim.segments.length - 1;
          const sp = ts.options().barSpacing;
          const rc = prim.refTime !== undefined ? ts.timeToCoordinate(prim.refTime) : null;
          const xOf = (idx) => (rc === null ? null : rc + (idx - prim.refIdx) * sp);
          prim.segments.forEach((sg, si) => {
            const x1 = xOf(sg.startIdx - 0.5), x2 = xOf(sg.endIdx - 0.5 + sg.extra);
            if (x1 === null || x2 === null) return;
            const a = Math.round(x1 * hpr), b = Math.round(x2 * hpr);
            if (b < 0 || a > width) return;
            PIVOT_LEVELS.forEach((name) => {
              const price = sg.levels[name];
              const y = series.priceToCoordinate(price);
              if (y === null) return;
              const yy = Math.round(y * vpr) + 0.5;
              ctx.strokeStyle = PIVOT_COLORS[name];
              ctx.beginPath(); ctx.moveTo(Math.max(a, 0), yy); ctx.lineTo(Math.min(b, width), yy); ctx.stroke();
              if (si === lastSeg) {
                ctx.fillStyle = PIVOT_COLORS[name];
                ctx.fillText(name, Math.min(b, width) - 4 * hpr, yy - 3 * vpr);
              }
            });
          });
          ctx.restore();
        });
      },
    };
    const paneView = { zOrder: () => 'normal', renderer: () => renderer };
    prim.attached = (p) => { chart = p.chart; series = p.series; request = p.requestUpdate; };
    prim.detached = () => { chart = null; series = null; request = null; };
    prim.updateAllViews = () => {};
    prim.paneViews = () => [paneView];
    prim.setSegments = (segs, refIdx, refTime) => { prim.segments = segs; prim.refIdx = refIdx; prim.refTime = refTime; if (request) request(); };
    return prim;
  }

  // vcfg: { symbol, tf, chartType, scale } (objeto vivo guardado en la configuración)
  // G: enlace con la app { cfg(), save(), onActivate(view), onStatus(view), onRange(view), onCrosshair(view, time), onLoaded(view) }
  function createView(host, vcfg, G, index) {
    host.innerHTML = '';
    const chartEl = el('div', 'chart');
    const legendEl = el('div', 'legend');
    const overlayEl = el('div', 'overlay hidden');
    const maxBtn = el('button', 'max-btn', '⛶');
    maxBtn.title = 'Ampliar este gráfico a pantalla completa';
    maxBtn.onmousedown = (e) => e.stopPropagation();
    maxBtn.ondblclick = (e) => e.stopPropagation();
    maxBtn.onclick = (e) => { e.stopPropagation(); G.onMaximize(view); };
    const camBtn = el('button', 'max-btn cam-btn', '📷');
    camBtn.title = 'Capturar imagen de este gráfico';
    camBtn.onmousedown = (e) => e.stopPropagation();
    camBtn.ondblclick = (e) => e.stopPropagation();
    camBtn.onclick = (e) => { e.stopPropagation(); const r = camBtn.getBoundingClientRect(); showCamMenu(r.left, r.bottom + 4); };
    const rpBar = el('div', 'rp-bar hidden');
    rpBar.onmousedown = (e) => e.stopPropagation();
    rpBar.ondblclick = (e) => e.stopPropagation();
    const wmEl = el('div', 'wm hidden');
    const timerEl = el('div', 'ctimer hidden');
    const xhV = el('div', 'xh-v hidden'), xhH = el('div', 'xh-h hidden');
    const xhT = el('div', 'xh-label hidden'), xhP = el('div', 'xh-label hidden');
    host.append(chartEl, wmEl, legendEl, overlayEl, xhV, xhH, xhT, xhP, timerEl, camBtn, rpBar, maxBtn);

    const s = {
      base: [], bars: [], anchor: 0, chart: null, series: null, pivot: null,
      maSeries: new Map(), maLast: new Map(), sub: {}, overlays: {}, precision: 2,
      token: 0, loadingMore: false, reachedStart: false, polling: false, pollTimer: null,
      hover: false, hoverTime: null, loading: false, status: { text: '', kind: '' }, destroyed: false,
    };
    const view = { index, host, cfg: vcfg, state: s };

    const cfg = () => G.cfg();
    const exId = () => vcfg.exchange || 'binance';
    // Velas desde operaciones reales (v0.18): vcfg.src = 'trades', filtro en vcfg.tr = { min, max, mode: 'only'|'hl', days }
    const trOn = () => vcfg.src === 'trades';
    const dataEx = () => (trOn() ? 'bnftrades' : exId());
    const trTr = () => Object.assign({ min: 0, max: 0, mode: 'only', days: 7 }, vcfg.tr || {});
    const trParams = () => { if (!trOn()) return {}; const t = trTr(); return { minQty: t.min || 0, maxQty: t.max || 0, mode: t.mode, days: t.days }; };
    const trHl = () => trOn() && trTr().mode === 'hl' && !!(trTr().min || trTr().max);   // "resaltar": las velas son completas y delta/CVD usan solo las operaciones del rango
    const hlBar = (b) => (trHl() && b.fv !== undefined ? { volume: b.fv, buy: b.fb } : b);
    const exName = () => L.exchangeName(dataEx());
    // La temporalidad ya adaptada al exchange de este gráfico (Bybit y KuCoin no tienen todas las velas base de Binance).
    const tfNow = () => L.tfFor(L.tfById(vcfg.tf), dataEx());

    function setStatus(text, kind) {
      s.status = { text: text || '', kind: kind || '' };
      G.onStatus(view);
    }
    function showOverlay(text, retry) {
      overlayEl.innerHTML = '';
      overlayEl.appendChild(el('div', '', text));
      if (retry) {
        const b = el('button', 'btn', 'Reintentar');
        b.onclick = () => load();
        overlayEl.appendChild(b);
      }
      overlayEl.classList.remove('hidden');
    }
    const hideOverlay = () => overlayEl.classList.add('hidden');

    // ---------- Fechas ----------
    let fmtCache = {};
    function dateFmt(key, opts, utc) {
      const k = key + (utc ? 'u' : cfg().tz);
      if (!fmtCache[k]) {
        const o = Object.assign({}, opts);
        if (utc || cfg().tz === 'UTC') o.timeZone = 'UTC';
        fmtCache[k] = new Intl.DateTimeFormat('es', o);
      }
      return fmtCache[k];
    }
    const isDaily = () => tfNow().sec >= 86400;
    const isVol = () => tfNow().kind === 'vol';
    const isSub = () => tfNow().sec < 60 && tfNow().kind !== 'vol';
    function timeFormatter(t) {
      if (typeof t !== 'number') return '';
      const d = new Date(t * 1000);
      if (isDaily()) return dateFmt('d', { day: '2-digit', month: 'short', year: 'numeric' }, true).format(d);
      if (isVol()) return dateFmt('dts', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
      if (isSub()) return dateFmt('dts', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
      return dateFmt('dt', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    }
    function tickFormatter(t, type) {
      const d = new Date(t * 1000);
      const utc = isDaily();
      if (type === 0) return dateFmt('y', { year: 'numeric' }, utc).format(d);
      if (type === 1) return dateFmt('m', { month: 'short' }, utc).format(d);
      if (type === 2) return dateFmt('dd', { day: 'numeric' }, utc).format(d);
      if (isSub()) return dateFmt('ts', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
      return dateFmt('t', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    }
    function refreshFormatters() {
      fmtCache = {};
      s.chart.applyOptions({ localization: { timeFormatter }, timeScale: { tickMarkFormatter: tickFormatter, secondsVisible: isSub() } });
    }

    // ---------- Gráfico ----------
    // Colores del gráfico: tema + fondo propio (si lo hay) + rejillas.
    function lookVars() {
      const dark = cfg().theme === 'dark';
      const bg = vcfg.look.bg || (dark ? '#131722' : '#ffffff');
      const m = /^#?([0-9a-f]{6})$/i.exec(bg);
      const n = m ? parseInt(m[1], 16) : 0x131722;
      const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
      const isDark = luma < 140;
      return {
        bg, isDark, text: isDark ? '#d1d4dc' : '#131722', muted: '#787b86',
        border: isDark ? '#2a2e39' : '#e0e3eb', grid: vcfg.look.gridColor || (isDark ? '#2a2e39' : '#e0e3eb'),
      };
    }
    const themeName = () => (lookVars().isDark ? 'dark' : 'light');
    function themeOptions() {
      const lv = lookVars();
      const dark = lv.isDark;
      return {
        layout: {
          background: { type: 'solid', color: lv.bg }, textColor: lv.text,
          panes: { separatorColor: lv.border, separatorHoverColor: dark ? 'rgba(41,98,255,0.35)' : 'rgba(41,98,255,0.25)' },
        },
        grid: { vertLines: { color: lv.grid, visible: !!vcfg.look.gridV }, horzLines: { color: lv.grid, visible: !!vcfg.look.gridH } },
        rightPriceScale: { borderColor: lv.border },
        timeScale: { borderColor: lv.border },
        crosshair: {
          vertLine: { color: dark ? '#758696' : '#9598a1', labelBackgroundColor: dark ? '#2a2e39' : '#4c525e' },
          horzLine: { color: dark ? '#758696' : '#9598a1', labelBackgroundColor: dark ? '#2a2e39' : '#4c525e' },
        },
      };
    }
    // Variables de color de esta celda (para el rótulo, la marca de agua y el temporizador).
    function applyHostVars() {
      const lv = lookVars();
      host.style.setProperty('--bg', lv.bg);
      host.style.setProperty('--text', lv.text);
      host.style.setProperty('--muted', lv.muted);
      host.style.setProperty('--border', lv.border);
      const k = vcfg.candle;
      const pick = (d) => (k.body.on ? k.body[d] : k.border.on ? k.border[d] : k.wick[d]);
      host.style.setProperty('--up', pick('up'));
      host.style.setProperty('--down', pick('down'));
    }
    function applyLook() {
      applyHostVars();
      if (!s.chart) return;
      s.chart.applyOptions(themeOptions());
      renderWatermark();
      if (s.bars.length) { syncMas(); renderLegend(null); }
      if (view.draw) view.draw.repaint();
    }

    // ---------- Marca de agua ----------
    const ICON_SVG = '<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><rect x="6" y="30" width="12" height="22" rx="2"/><rect x="11" y="22" width="2" height="38"/><rect x="26" y="20" width="12" height="26" rx="2"/><rect x="31" y="10" width="2" height="48"/><rect x="46" y="8" width="12" height="24" rx="2"/><rect x="51" y="2" width="2" height="36"/></svg>';
    function renderWatermark() {
      const w = vcfg.wm;
      wmEl.innerHTML = '';
      const tf = tfNow();
      const info = G.symbolInfo ? G.symbolInfo(vcfg.symbol, exId()) : null;
      const items = [
        ['icon', null, 'wm-icon'], ['name', 'Ar_Trading', 'wm-name'], ['ticker', vcfg.symbol, 'wm-ticker'],
        ['interval', tfLabel(tf), 'wm-interval'], ['desc', (info ? `${info.base} / ${info.quote}` : vcfg.symbol) + ' · ' + exName(), 'wm-desc'],
      ];
      let any = false;
      items.forEach(([key, text, cls]) => {
        const c = w[key];
        if (!c || !c.on) return;
        any = true;
        const d = el('div', cls);
        if (key === 'icon') {
          const im = document.createElement('img');
          im.className = 'wm-icon-img'; im.alt = '';
          im.src = 'assets/logo-v-' + (themeName() === 'light' ? 'light' : 'dark') + '.png';
          d.appendChild(im);
        } else d.textContent = text;
        d.style.color = c.color;
        d.style.opacity = String(Math.max(0, Math.min(100, c.opacity)) / 100);
        wmEl.appendChild(d);
      });
      wmEl.className = 'wm pos-' + w.pos + (any ? '' : ' hidden');
    }

    function createChart() {
      const chart = LC.createChart(chartEl, {
        autoSize: true,
        crosshair: { mode: LC.CrosshairMode.Normal },
        timeScale: { timeVisible: true, secondsVisible: isSub(), rightOffset: 8, tickMarkFormatter: tickFormatter },
        localization: { timeFormatter },
      });
      applyHostVars();
      chart.applyOptions(themeOptions());
      chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);
      chart.subscribeCrosshairMove(onCrosshair);
      chart.subscribeClick(onChartClick);
      s.chart = chart;
      applyScaleMode();
    }
    function applyScaleMode() {
      const mode = { normal: LC.PriceScaleMode.Normal, log: LC.PriceScaleMode.Logarithmic, percent: LC.PriceScaleMode.Percentage }[vcfg.scale];
      mainScale().applyOptions({ mode, invertScale: !!vcfg.invert, scaleMargins: { top: 0.1, bottom: 0.1 } });
    }
    function priceFormat() {
      return { type: 'price', precision: s.precision, minMove: Math.pow(10, -s.precision) };
    }
    function toPoint(b) {
      return vcfg.chartType === 'candles'
        ? { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }
        : { time: b.time, value: b.close };
    }
    function mainOptions() {
      if (vcfg.chartType === 'candles') {
        const k = vcfg.candle;
        const none = 'rgba(0,0,0,0)';
        return {
          upColor: k.body.on ? k.body.up : none, downColor: k.body.on ? k.body.down : none,
          borderVisible: k.border.on, borderUpColor: k.border.up, borderDownColor: k.border.down,
          wickVisible: k.wick.on, wickUpColor: k.wick.up, wickDownColor: k.wick.down,
          priceFormat: priceFormat(),
        };
      }
      if (vcfg.chartType === 'line') return { color: '#2962ff', lineWidth: 2, priceFormat: priceFormat() };
      return {
        lineColor: '#2962ff', topColor: 'rgba(41,98,255,0.35)', bottomColor: 'rgba(41,98,255,0.02)',
        lineWidth: 2, priceFormat: priceFormat(),
      };
    }
    function buildMainSeries() {
      const pi = mainPaneIdx();
      const old = s.series;
      if (old && s.pivot) { try { old.detachPrimitive(s.pivot); } catch (e) { /* ya quitado */ } }
      if (view.draw) view.draw.detach();
      const def = { candles: LC.CandlestickSeries, line: LC.LineSeries, area: LC.AreaSeries }[vcfg.chartType];
      s.series = s.chart.addSeries(def, mainOptions(), pi);
      s.series.setData(s.bars.map(toPoint));
      if (old) s.chart.removeSeries(old);
      if (s.pivot) s.series.attachPrimitive(s.pivot);
      if (view.draw) view.draw.attach(s.series);
      applyScaleMode();
    }

    // ---------- Medias móviles ----------
    function maSeriesOptions(ma) {
      return {
        color: L.themedColor(ma.color, themeName()), lineWidth: Math.max(1, Math.min(6, ma.width || 1)), priceFormat: priceFormat(),
        lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      };
    }
    function maValues(ma) {
      const closes = s.bars.map((b) => b.close);
      return (ma.type === 'SMA' ? L.sma : L.ema)(closes, ma.period);
    }
    function pointsFrom(values, start) {
      const pts = [];
      for (let i = start || 0; i < values.length; i++) if (values[i] !== null && values[i] !== undefined) pts.push({ time: s.bars[i].time, value: values[i] });
      return pts;
    }
    const maShown = (ma) => !!(ma.visible && (vcfg.maOn || {})[ma.type]);
    function syncMas() {
      for (const [id, ser] of s.maSeries) {
        const ma = vcfg.mas.find((m) => m.id === id);
        if (!ma || !maShown(ma)) { s.chart.removeSeries(ser); s.maSeries.delete(id); s.maLast.delete(id); }
      }
      for (const ma of vcfg.mas) {
        if (!maShown(ma)) continue;
        let ser = s.maSeries.get(ma.id);
        if (!ser) { ser = s.chart.addSeries(LC.LineSeries, maSeriesOptions(ma), mainPaneIdx()); s.maSeries.set(ma.id, ser); }
        else ser.applyOptions(maSeriesOptions(ma));
        const values = maValues(ma);
        ser.setData(pointsFrom(values));
        s.maLast.set(ma.id, values[values.length - 1]);
      }
    }
    function updateMasTail(startIdx) {
      for (const ma of vcfg.mas) {
        const ser = s.maSeries.get(ma.id);
        if (!ser) continue;
        const values = maValues(ma);
        for (let i = startIdx; i < values.length; i++) if (values[i] !== null) ser.update({ time: s.bars[i].time, value: values[i] });
        s.maLast.set(ma.id, values[values.length - 1]);
      }
    }

    // ---------- Indicadores ----------
    const col = (arrs) => ({
      closes: arrs.map((b) => b.close), highs: arrs.map((b) => b.high), lows: arrs.map((b) => b.low), bars: arrs,
    });
    const LSTYLE = { solid: LC.LineStyle.Solid, dashed: LC.LineStyle.Dashed, dotted: LC.LineStyle.Dotted };
    function lineOpts(color, extra) {
      return Object.assign({ color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, priceFormat: priceFormat() }, extra || {});
    }
    const fixed01 = () => ({ priceRange: { minValue: 0, maxValue: 100 } });
    const LEVEL_KEYS = ['ob', 'mid', 'os'];
    function hexA(hex, pct) {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if (!m) return 'rgba(0,0,0,0)';
      const n = parseInt(m[1], 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(100, pct)) / 100})`;
    }
    // Relleno de fondo entre la banda inferior y la superior (como el "Fondo" de TradingView).
    function makeBandPrimitive(getBand) {
      let series = null, request = null;
      const prim = {};
      const renderer = {
        draw(target) {
          const bd = getBand();
          if (!series || !bd || !bd.on) return;
          target.useBitmapCoordinateSpace((scope) => {
            const y1 = series.priceToCoordinate(bd.hi), y2 = series.priceToCoordinate(bd.lo);
            if (y1 === null || y2 === null) return;
            const top = Math.round(Math.min(y1, y2) * scope.verticalPixelRatio);
            const bot = Math.round(Math.max(y1, y2) * scope.verticalPixelRatio);
            scope.context.fillStyle = hexA(bd.color, bd.opacity);
            scope.context.fillRect(0, top, scope.bitmapSize.width, bot - top);
          });
        },
      };
      const paneView = { zOrder: () => 'bottom', renderer: () => renderer };
      prim.attached = (p) => { series = p.series; request = p.requestUpdate; };
      prim.detached = () => { series = null; request = null; };
      prim.updateAllViews = () => {};
      prim.paneViews = () => [paneView];
      prim.refresh = () => { if (request) request(); };
      return prim;
    }
    function addLevels(sub, ser, c) {
      sub.levels = LEVEL_KEYS.map((k) => ({
        k, line: ser.createPriceLine({ price: c[k], color: c[k + 'Color'], lineStyle: LSTYLE[c[k + 'Style']] || LSTYLE.dashed, lineWidth: 1, axisLabelVisible: false }),
      }));
    }
    function applyLevels(sub, c) {
      sub.levels.forEach(({ k, line }) => line.applyOptions({ price: c[k], color: c[k + 'Color'], lineStyle: LSTYLE[c[k + 'Style']] || LSTYLE.dashed }));
      sub.band.refresh();
    }
    function addBand(sub, ser, name) {
      sub.band = makeBandPrimitive(() => {
        const cc = vcfg.ind[name];
        return { on: cc.bgOn, lo: cc.os, hi: cc.ob, color: cc.bgColor, opacity: cc.bgOpacity };
      });
      ser.attachPrimitive(sub.band);
    }
    const p2 = { type: 'price', precision: 2, minMove: 0.01 };
    const subMargins = { mode: LC.PriceScaleMode.Normal, invertScale: false, scaleMargins: { top: 0.1, bottom: 0.1 } };

    // Definición de cada panel: series que lo forman, cómo se calculan y cómo se rotulan.
    const SUBS = {
      rsi: {
        struct: (c) => ({ len: c.len }),
        title: (c) => `RSI ${c.len}`,
        build(chart, c, pane, name) {
          const ser = chart.addSeries(LC.LineSeries, lineOpts(c.color, { autoscaleInfoProvider: fixed01, priceFormat: p2 }), pane);
          ser.priceScale().applyOptions(subMargins);
          const sub = { main: ser, list: [ser] };
          addLevels(sub, ser, c);
          addBand(sub, ser, name);
          return sub;
        },
        style(sub, c) { sub.main.applyOptions({ color: c.color }); applyLevels(sub, c); },
        compute(c, d) { return { main: L.rsi(d.closes, c.len) }; },
        data(vals) { return { main: pointsFrom(vals.main) }; },
        text(c, get, fmt) { return [{ color: c.color, t: fmt(get('main'), 2) }]; },
      },
      stoch: {
        struct: (c) => ({ k: c.k, sm: c.sm, d: c.d }),
        title: (c) => `Estocástico ${c.k} ${c.sm} ${c.d}`,
        build(chart, c, pane, name) {
          const k = chart.addSeries(LC.LineSeries, lineOpts(c.kColor, { autoscaleInfoProvider: fixed01, priceFormat: p2 }), pane);
          const p = k.getPane().paneIndex();
          const d = chart.addSeries(LC.LineSeries, lineOpts(c.dColor, { autoscaleInfoProvider: fixed01, priceFormat: p2 }), p);
          k.priceScale().applyOptions(subMargins);
          const sub = { main: k, k, d, list: [k, d] };
          addLevels(sub, k, c);
          addBand(sub, k, name);
          return sub;
        },
        style(sub, c) { sub.k.applyOptions({ color: c.kColor }); sub.d.applyOptions({ color: c.dColor }); applyLevels(sub, c); },
        compute(c, dd) { const r = L.stoch(dd.highs, dd.lows, dd.closes, c.k, c.sm, c.d); return { k: r.k, d: r.d }; },
        data(vals) { return { k: pointsFrom(vals.k), d: pointsFrom(vals.d) }; },
        text(c, get, fmt) { return [{ color: c.kColor, t: fmt(get('k'), 2) }, { color: c.dColor, t: fmt(get('d'), 2) }]; },
      },
      // Delta: compra agresiva - venta agresiva de cada vela (volumen de compra de Binance). Solo hay datos en Binance.
      delta: {
        struct: (c) => ({ u: c.upColor, d: c.downColor }),
        title: () => 'Delta (compra − venta)' + (trHl() ? ' · solo operaciones del filtro' : ''),
        build(chart, c, pane) {
          const ser = chart.addSeries(LC.HistogramSeries, { lastValueVisible: false, priceLineVisible: false, priceFormat: { type: 'volume' } }, pane);
          ser.priceScale().applyOptions(subMargins);
          return { main: ser, list: [ser] };
        },
        style() {},
        compute(c, d) { return { main: d.bars.map((b) => L.deltaOf(hlBar(b))) }; },
        pt(sub, k, i, v) { const c = vcfg.ind.delta; return { time: s.bars[i].time, value: v, color: v >= 0 ? c.upColor : c.downColor }; },
        data(vals) { const c = vcfg.ind.delta; const out = []; vals.main.forEach((v, i) => { if (v !== null && v !== undefined) out.push({ time: s.bars[i].time, value: v, color: v >= 0 ? c.upColor : c.downColor }); }); return { main: out }; },
        text(c, get, fmt) {
          if (!s.bars.some((b) => b.buy !== undefined)) return [{ color: '#787b86', t: `no disponible: ${exName()} no entrega el volumen de compra` }];
          return [{ color: get('main') >= 0 ? c.upColor : c.downColor, t: fmt(get('main'), 3) }];
        },
      },
      // Delta acumulado (CVD): suma del delta desde la primera vela cargada (el nivel absoluto cambia al cargar más historial; vale la forma).
      cvd: {
        struct: () => ({}),
        title: () => 'Delta acumulado (CVD)' + (trHl() ? ' · solo operaciones del filtro' : ''),
        build(chart, c, pane) {
          const ser = chart.addSeries(LC.LineSeries, lineOpts(c.color, { priceFormat: { type: 'volume' }, lineWidth: 2 }), pane);
          ser.priceScale().applyOptions(subMargins);
          return { main: ser, list: [ser] };
        },
        style(sub, c) { sub.main.applyOptions({ color: c.color }); },
        compute(c, d) { return { main: L.cumDelta(d.bars.map(hlBar)) }; },
        data(vals) { return { main: pointsFrom(vals.main) }; },
        text(c, get, fmt) {
          if (!s.bars.some((b) => b.buy !== undefined)) return [{ color: '#787b86', t: `no disponible: ${exName()} no entrega el volumen de compra` }];
          return [{ color: c.color, t: fmt(get('main'), 1) }];
        },
      },
    };

    function fmtVal(v, decimals) {
      if (v === null || v === undefined || isNaN(v)) return '—';
      const dec = decimals !== undefined ? decimals : s.precision;
      return Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }

    const mainPaneIdx = () => (s.series ? s.series.getPane().paneIndex() : 0);
    const mainScale = () => (s.series ? s.series.priceScale() : s.chart.priceScale('right'));

    // ---------- Dibujos (v0.7): la capa pinta sobre el panel de precios y usa estas conversiones tiempo/precio <-> píxel ----------
    const num = (v) => typeof v === 'number' && isFinite(v);
    // Historial de zooms hechos con la lupa (para poder alejar paso a paso)
    const zoomStack = [];
    const priceInternal = (v, log) => (log ? Math.log10(Math.pow(10, Math.log10(v)) + 0.0001) + 4 : v);
    const drawEnv = {
      host, chartEl,
      series: () => s.series, bars: () => s.bars, symbol: () => vcfg.symbol, chart: () => vcfg.id,
      active: () => !!(s.chart && s.series && s.bars.length && !s.loading && !isVol()),
      xOfTime(t) { const lg = logicalAtTime(t); return lg === null ? null : xOfLogical(lg); },
      timeOfX(x) { const lg = s.chart.timeScale().coordinateToLogical(x); return num(lg) ? timeAtLogical(lg) : null; },
      logicalOfX(x) { const lg = s.chart.timeScale().coordinateToLogical(x); return num(lg) ? lg : null; },
      centerTime: (i) => s.bars[i].time + spanAt(i) / 2,
      barsBetween(t1, t2) { const a = logicalAtTime(t1), b = logicalAtTime(t2); return a === null || b === null ? 0 : Math.round(Math.abs(b - a)); },
      yOfPrice(p) { const y = s.series.priceToCoordinate(p); return num(y) ? y : null; },
      priceOfY(y) { const p = s.series.coordinateToPrice(y); return num(p) ? p : null; },
      paneRect() { const pe = s.series && s.series.getPane().getHTMLElement(); return pe ? pe.getBoundingClientRect() : null; },
      plotWidth: () => chartEl.clientWidth - priceAxisWidth(),
      fmtPrice: (p) => fmtVal(p),
      chartType: () => vcfg.chartType,
      theme: () => themeName(),
      bg: () => lookVars().bg,
      // Herramienta "Acercar": ajusta el tiempo y el precio visibles al recuadro dibujado (precio: no en escala de porcentaje).
      zoomTo(t1, t2, p1, p2) {
        if (!s.chart || !s.series) return;
        let a = logicalAtTime(Math.min(t1, t2)), b = logicalAtTime(Math.max(t1, t2));
        if (a === null || b === null) return;
        if (b - a < 3) { const m = (a + b) / 2; a = m - 1.5; b = m + 1.5; }
        { // guarda cómo estaba la vista para poder alejar
          const ps0 = mainScale();
          let po = null; try { po = ps0.getVisibleRange(); } catch (e) { /* sin rango */ }
          zoomStack.push({ range: s.chart.timeScale().getVisibleLogicalRange(), auto: ps0.options().autoScale, prange: po, log: vcfg.scale === 'log' });
          if (zoomStack.length > 30) zoomStack.shift();
        }
        s.chart.timeScale().setVisibleLogicalRange({ from: a, to: b });
        const lo = Math.min(p1, p2), hi = Math.max(p1, p2);
        if (!(hi > lo) || lo <= 0 || vcfg.scale === 'percent') return;
        const ps = mainScale(), log = vcfg.scale === 'log';
        const toInternal = (v) => (log ? Math.log10(Math.pow(10, v) + 0.0001) + 4 : v);
        ps.setAutoScale(false);
        ps.setVisibleRange({ from: toInternal(log ? Math.log10(lo) : lo), to: toInternal(log ? Math.log10(hi) : hi) });
        const chk = ps.getVisibleRange();
        if (!chk || !isFinite(chk.from) || !isFinite(chk.to) || !(chk.to > chk.from)) ps.applyOptions({ autoScale: true });
      },
    };
    view.draw = G.drawStore && window.TVDraw && window.TVDraw.createLayer ? window.TVDraw.createLayer(drawEnv, G.drawStore) : null;
    // Alturas de los paneles: las que el usuario deja al arrastrar los separadores se guardan y no se vuelven a tocar.
    function paneKeys() {
      const map = [];
      if (s.series) map.push(['main', s.series]);
      SUB_ORDER.forEach((n) => { if (s.sub[n]) map.push([n, s.sub[n].main]); });
      return map;
    }
    function snapshotHeights() {
      if (!vcfg.paneH) vcfg.paneH = {};
      let changed = false;
      try {
        if (s.chart.panes().length < 2) return;
        paneKeys().forEach(([k, ser]) => {
          const f = ser.getPane().getStretchFactor();
          if (f > 0 && vcfg.paneH[k] !== f) { vcfg.paneH[k] = f; changed = true; }
        });
      } catch (e) { /* sin paneles */ }
      if (changed && G.onPaneSize) G.onPaneSize(view);
    }
    function layoutPanes(apply) {
      const panes = s.chart.panes();
      if (panes.length > 1 && apply) {
        const H = vcfg.paneH || {};
        paneKeys().forEach(([k, ser]) => ser.getPane().setStretchFactor(H[k] || (k === 'main' ? 3 : 1)));
      }
      s.hasPanes = panes.length > 1;
      setTimeout(positionLegend, 60);
    }
    // Al soltar el mouse tras arrastrar un separador, se recuerda la altura elegida.
    chartEl.addEventListener('mouseup', () => setTimeout(snapshotHeights, 30));
    chartEl.addEventListener('touchend', () => setTimeout(snapshotHeights, 30));
    const getOrder = () => {
      const o = (vcfg.order || []).filter((n) => n === 'main' || SUB_ORDER.includes(n));
      ['main'].concat(SUB_ORDER).forEach((n) => { if (!o.includes(n)) o.push(n); });
      vcfg.order = o;
      return o;
    };
    // El rótulo del gráfico (símbolo, precios, medias) va dentro del panel del precio, aunque haya indicadores arriba.
    function positionLegend() {
      if (!s.series || !s.chart) return;
      let pe = null;
      try { pe = s.series.getPane().getHTMLElement(); } catch (e) { return; }
      if (!pe) return;
      const top = pe.getBoundingClientRect().top - chartEl.getBoundingClientRect().top;
      legendEl.style.top = Math.max(0, top) + 8 + 'px';
    }
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => positionLegend()).observe(chartEl);
    function removeEmptyPanes() {
      let panes = s.chart.panes();
      for (let i = panes.length - 1; i >= 0; i--) {
        panes = s.chart.panes();
        if (panes.length > 1 && panes[i] && panes[i].getSeries().length === 0) s.chart.removePane(i);
      }
    }
    // Orden de los paneles: indicadores "arriba", el precio, indicadores "debajo".
    function orderPanes() {
      if (!s.series) return;
      const target = getOrder().filter((n) => n === 'main' || s.sub[n]).map((n) => (n === 'main' ? s.series : s.sub[n].main));
      target.forEach((ser, i) => {
        const cur = ser.getPane().paneIndex();
        if (cur !== i) s.chart.swapPanes(cur, i);
      });
    }

    function dropSub(name) {
      const sub = s.sub[name];
      if (!sub) return;
      sub.list.forEach((ser) => { try { s.chart.removeSeries(ser); } catch (e) { /* ya quitada */ } });
      if (sub.legendEl && sub.legendEl.parentNode) sub.legendEl.parentNode.removeChild(sub.legendEl);
      delete s.sub[name];
    }
    const subOn = (n) => vcfg.ind[n].on && !vcfg.ind[n].hide && !s.subsHidden;

    // Crea/quita paneles y pivotes según la configuración. full = recalcular y volver a cargar todos los datos.
    function syncIndicators(full, tailStart) {
      if (!s.chart || !s.series) return;
      const ind = vcfg.ind;
      const d = col(s.bars);
      // si se activó, quitó, movió o cambió un parámetro de cálculo, se reconstruyen los paneles
      const subSig = getOrder().join(',') + '#' + SUB_ORDER.map((n) => (subOn(n) ? JSON.stringify(SUBS[n].struct(ind[n])) : '-')).join('|');
      let relayout = false;
      if (subSig !== s.subSig) {
        snapshotHeights();
        relayout = true;
        Object.keys(s.sub).forEach(dropSub);
        removeEmptyPanes();
        s.subSig = subSig;
        full = true;
      }
      SUB_ORDER.forEach((name) => {
        if (!subOn(name)) return;
        const c = ind[name];
        const def = SUBS[name];
        let sub = s.sub[name];
        if (!sub) {
          const built = def.build(s.chart, c, s.chart.panes().length, name);
          sub = Object.assign(built, { last: {} });
          s.sub[name] = sub;
          full = true;
        }
        const vals = def.compute(c, d);
        sub.vals = vals;
        if (full || tailStart === undefined) {
          const data = def.data(vals);
          Object.keys(data).forEach((k) => sub[k].setData(data[k]));
        } else {
          for (let i = tailStart; i < s.bars.length; i++) {
            Object.keys(vals).forEach((k) => {
              const v = vals[k][i];
              if (v === null || v === undefined) return;
              sub[k].update(def.pt ? def.pt(sub, k, i, v) : { time: s.bars[i].time, value: v });
            });
          }
        }
        def.style(sub, c);
      });
      removeEmptyPanes();
      orderPanes();
      layoutPanes(relayout);
      ensureSubLegends();
      if (relayout) healSubs();

      // Pivotes
      const tf = tfNow();
      const pc = ind.pivots;
      if (!pc.on || pc.hide) {
        if (s.pivot) { try { s.series.detachPrimitive(s.pivot); } catch (e) { /* ok */ } s.pivot = null; }
        s.pivotNote = '';
      } else {
        if (!s.pivot) { s.pivot = makePivotPrimitive(); s.series.attachPrimitive(s.pivot); }
        const r = L.pivots(s.bars, tf, pc.type, pc.period, s.reachedStart);
        s.pivot.setSegments(r.ok ? r.segments : [], s.bars.length - 1, s.bars.length ? s.bars[s.bars.length - 1].time : undefined);
        s.pivotNote = r.ok ? '' : 'Pivotes no disponibles: ' + r.reason.toLowerCase();
      }
      renderLegend(null);
      if (s.scr) s.scr.update();
    }

    // Autocuración de los paneles de indicadores tras moverlos: escala automática con rango 0–100,
    // rótulos reintentados cuando el panel ya existe en pantalla y un repintado forzado en el siguiente cuadro.
    function healSubs() {
      const fix = () => {
        if (!s.chart) return;
        SUB_ORDER.forEach((name) => {
          const sub = s.sub[name];
          if (!sub) return;
          try {
            const ps = sub.main.priceScale();
            ps.applyOptions({ autoScale: true, mode: LC.PriceScaleMode.Normal, invertScale: false });
            const r = ps.getVisibleRange();
            if (!r || !isFinite(r.from) || !isFinite(r.to) || !(r.to > r.from)) ps.setAutoScale(true);
          } catch (e) { /* panel ya quitado */ }
        });
        ensureSubLegends();
        try { s.chart.applyOptions({}); } catch (e) { /* sin gráfico */ }
        positionLegend();
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => { fix(); requestAnimationFrame(fix); });
      } else setTimeout(fix, 30);
    }
    // Rótulo de cada panel inferior, dentro del propio panel (con botones para moverlo o quitarlo).
    function ensureSubLegends() {
      SUB_ORDER.forEach((name) => {
        const sub = s.sub[name];
        if (!sub) return;
        const pane = sub.main.getPane();
        const host2 = pane.getHTMLElement();
        if (!host2) return;
        if (!sub.legendEl || sub.legendEl.parentNode !== host2) {
          if (sub.legendEl && sub.legendEl.parentNode) sub.legendEl.parentNode.removeChild(sub.legendEl);
          sub.legendEl = el('div', 'pane-legend');
          sub.textEl = el('span', 'pl-text');
          sub.btnEl = el('span', 'pl-btns');
          sub.legendEl.append(sub.textEl, sub.btnEl);
          host2.style.position = 'relative';
          host2.appendChild(sub.legendEl);
        }
        sub.btnEl.innerHTML = '';
        const ord = getOrder().filter((n) => n === 'main' || s.sub[n]);
        const at = ord.indexOf(name);
        const mk = (txt, title, action) => {
          const b = el('button', 'pl-btn', txt);
          b.title = title;
          b.onmousedown = (e) => e.stopPropagation();
          b.ondblclick = (e) => e.stopPropagation();
          b.onclick = (e) => { e.stopPropagation(); s.lastLegendClick = Date.now(); G.indAction(view, name, action); };
          sub.btnEl.appendChild(b);
        };
        if (at > 0) mk('▲', 'Mover el panel hacia arriba', 'up');
        if (at < ord.length - 1) mk('▼', 'Mover el panel hacia abajo', 'down');
        mk('✕', 'Quitar indicador', 'off');
      });
    }
    function renderSubLegends(param) {
      SUB_ORDER.forEach((name) => {
        const sub = s.sub[name];
        if (!sub || !sub.textEl) return;
        const def = SUBS[name];
        const c = vcfg.ind[name];
        const get = (key) => {
          const ser = sub[key];
          if (param && param.time !== undefined && param.seriesData) {
            const dpt = param.seriesData.get(ser);
            return dpt && dpt.value !== undefined ? dpt.value : null;
          }
          const arr = sub.vals && sub.vals[key];
          return arr ? arr[arr.length - 1] : null;
        };
        sub.textEl.innerHTML = '';
        sub.textEl.appendChild(el('span', 'pl-title', def.title(c)));
        def.text(c, get, fmtVal).forEach((p) => {
          const sp = el('span', 'pl-val', p.t);
          sp.style.color = L.themedColor(p.color, themeName());
          sub.textEl.appendChild(sp);
        });
      });
    }

    // ---------- Leyenda ----------
    function barIndex(time) {
      const bars = s.bars;
      let lo = 0, hi = bars.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (bars[mid].time === time) return mid;
        if (bars[mid].time < time) lo = mid + 1; else hi = mid - 1;
      }
      return -1;
    }
    function renderLegend(param) {
      positionLegend();
      const bars = s.bars;
      if (!bars.length) { legendEl.innerHTML = ''; return; }
      let i = bars.length - 1;
      if (param && param.time !== undefined) {
        const j = barIndex(param.time);
        if (j >= 0) i = j;
      }
      const hovering = !!(param && param.time !== undefined);
      const b = bars[i];
      const prev = i > 0 ? bars[i - 1].close : b.open;
      const chg = b.close - prev;
      const pct = prev ? (chg / prev) * 100 : 0;
      const tf = tfNow();

      legendEl.innerHTML = '';
      legendEl.appendChild(el('div', 'lg-title', `${vcfg.symbol} · ${tfLabel(tf)} · ${exName()}${tf.kind === 'vol' ? (s.vol && s.vol.market === 'spot' ? ' Spot' : ' Futuros') : ''}`));
      const o = el('div', 'lg-ohlc ' + (chg >= 0 ? 'up' : 'down'));
      [['A', b.open], ['M', b.high], ['m', b.low], ['C', b.close]].forEach(([k, v]) => o.appendChild(el('b', '', `${k} ${fmtVal(v)}`)));
      o.appendChild(el('b', '', `${chg >= 0 ? '+' : ''}${fmtVal(chg)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`));
      legendEl.appendChild(o);

      const masDiv = el('div', 'lg-mas');
      for (const ma of vcfg.mas) {
        const ser = s.maSeries.get(ma.id);
        if (!ser) continue;
        let v;
        if (hovering && param.seriesData) { const dpt = param.seriesData.get(ser); v = dpt ? dpt.value : null; }
        else v = s.maLast.get(ma.id);
        const sp = el('span', '', `${ma.type} ${ma.period}  ${fmtVal(v)}`);
        sp.style.color = L.themedColor(ma.color, themeName());
        masDiv.appendChild(sp);
      }
      legendEl.appendChild(masDiv);
      const hiddenNote = s.subsHidden && SUB_ORDER.some((n) => vcfg.ind[n].on) ? 'Indicadores ocultos (doble clic para mostrarlos)' : '';
      const notes = [hiddenNote, s.pivotNote, tf.kind === 'vol' ? volNote() : ''].filter(Boolean);
      if (notes.length) legendEl.appendChild(el('div', 'lg-note', notes.join(' · ')));
      renderSubLegends(hovering ? param : null);
      if (s.scr) s.scr.legend(hovering ? param : null, legendEl);
    }
    function onCrosshair(param) {
      s.hoverTime = param && param.time !== undefined ? param.time : null;
      renderLegend(param);
      if (s.hover) G.onCrosshair(view, hoverInfo(param));
    }

    // ---------- Posición exacta (tiempo y precio) para sincronizar la cruz ----------
    // La barra i ocupa la posición lógica [i-0.5, i+0.5] y representa el intervalo [tiempo_i, tiempo_i + duración].
    function lastSpan() {
      const tf = tfNow();
      const last = s.bars[s.bars.length - 1];
      if (tf.kind === 'months' || tf.base === '1M') {
        const d = new Date(last.time * 1000);
        const n = tf.kind === 'months' ? tf.n : 1;
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) / 1000 - last.time;
      }
      return tf.sec;
    }
    const spanAt = (i) => (i < s.bars.length - 1 ? s.bars[i + 1].time - s.bars[i].time : lastSpan());
    function timeAtLogical(lg) {
      const n = s.bars.length;
      if (!n) return null;
      const i = Math.max(0, Math.min(n - 1, Math.round(lg)));
      return s.bars[i].time + (lg - i + 0.5) * spanAt(i);
    }
    function logicalAtTime(t) {
      const n = s.bars.length;
      if (!n) return null;
      let lo = 0, hi = n - 1;
      if (t < s.bars[0].time) return (t - s.bars[0].time) / spanAt(0) - 0.5;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s.bars[mid].time <= t) lo = mid; else hi = mid - 1; }
      return lo - 0.5 + (t - s.bars[lo].time) / spanAt(lo);
    }
    // x en pantalla de una posición lógica cualquiera (lineal a partir de una barra visible).
    function xOfLogical(lg) {
      const ts = s.chart.timeScale();
      const r = ts.getVisibleLogicalRange();
      if (!r) return null;
      const ref = Math.round((r.from + r.to) / 2);
      const rc = ts.logicalToCoordinate(ref);
      if (rc === null || rc === undefined) return null;
      return rc + (lg - ref) * ts.options().barSpacing;
    }
    function hoverInfo(param) {
      if (!param || !param.point || !s.bars.length || isVol()) return null;
      const lg = s.chart.timeScale().coordinateToLogical(param.point.x);
      if (lg === null || lg === undefined) return null;
      const t = timeAtLogical(lg);
      let price = null;
      if (s.series && param.paneIndex === mainPaneIdx()) {
        const p = s.series.coordinateToPrice(param.point.y);
        if (p !== null && p !== undefined && isFinite(p)) price = p;
      }
      return { t, price, symbol: vcfg.symbol };
    }
    function hideXh() { [xhV, xhH, xhT, xhP].forEach((e) => e.classList.add('hidden')); }
    // Dibuja la cruz de otro gráfico: misma fecha/hora exacta y, si es el mismo activo, el mismo precio.
    function showXh(info) {
      if (!info || s.hover || !s.bars.length || s.loading || isVol()) { hideXh(); return; }
      const w = priceAxisWidth();
      const plotW = chartEl.clientWidth - w;
      const plotH = chartEl.clientHeight - (s.chart.timeScale().height() || 0);
      const lg = logicalAtTime(info.t);
      const x = lg === null ? null : xOfLogical(lg);
      if (x === null || x < 0 || x > plotW) { hideXh(); return; }
      xhV.style.left = Math.round(x) + 'px'; xhV.style.height = plotH + 'px'; xhV.classList.remove('hidden');
      xhT.textContent = timeFormatter(Math.round(info.t));
      xhT.style.left = Math.max(60, Math.min(plotW - 60, Math.round(x))) + 'px';
      xhT.style.top = plotH + 'px'; xhT.style.right = 'auto'; xhT.style.transform = 'translateX(-50%)'; xhT.classList.remove('hidden');
      let showH = false;
      if (info.price !== null && info.price !== undefined && info.symbol === vcfg.symbol && s.series) {
        const y = s.series.priceToCoordinate(info.price);
        const pe = s.series.getPane().getHTMLElement();
        if (y !== null && pe) {
          const top = pe.getBoundingClientRect().top - chartEl.getBoundingClientRect().top;
          const ph = pe.getBoundingClientRect().height;
          if (y >= 0 && y <= ph) {
            const yy = Math.round(top + y);
            xhH.style.top = yy + 'px'; xhH.style.width = plotW + 'px'; xhH.classList.remove('hidden');
            xhP.textContent = fmtVal(info.price); xhP.style.top = yy - 10 + 'px'; xhP.style.right = '0px'; xhP.style.left = 'auto'; xhP.style.width = w + 'px';
            xhP.classList.remove('hidden');
            showH = true;
          }
        }
      }
      if (!showH) { xhH.classList.add('hidden'); xhP.classList.add('hidden'); }
    }

    // ---------- Temporizador de la vela en la barra de precios ----------
    function nextClose(tf, bar) {
      if (tf.kind === 'vol') return null;
      if (tf.kind === 'months' || tf.base === '1M') {
        const d = new Date(bar.time * 1000);
        const n = tf.kind === 'months' ? tf.n : 1;
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) / 1000;
      }
      return bar.time + tf.sec;
    }
    function fmtCountdown(sec) {
      sec = Math.max(0, Math.floor(sec));
      const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
      const p = (v) => String(v).padStart(2, '0');
      if (d > 0) return `${d}d ${p(h)}:${p(m)}:${p(x)}`;
      if (h > 0) return `${p(h)}:${p(m)}:${p(x)}`;
      return `${p(m)}:${p(x)}`;
    }
    function updateTimer() {
      if (!s.chart || s.destroyed) return;
      if (cfg().timer === false || !s.bars.length || s.loading || !s.series || isVol() || s.rp) { timerEl.classList.add('hidden'); return; }
      const bar = s.bars[s.bars.length - 1];
      const end = nextClose(tfNow(), bar);
      const y = s.series.priceToCoordinate(bar.close);
      let pe = null;
      try { pe = s.series.getPane().getHTMLElement(); } catch (e) { pe = null; }
      if (end === null || y === null || !pe) { timerEl.classList.add('hidden'); return; }
      const top = pe.getBoundingClientRect().top - chartEl.getBoundingClientRect().top;
      const ph = pe.getBoundingClientRect().height;
      if (y < 0 || y > ph) { timerEl.classList.add('hidden'); return; }
      const w = priceAxisWidth();
      timerEl.textContent = fmtCountdown(end - Date.now() / 1000);
      timerEl.style.background = bar.close >= bar.open ? 'var(--up, #26a69a)' : 'var(--down, #ef5350)';
      timerEl.style.width = w + 'px';
      timerEl.style.top = Math.round(top + y + 11) + 'px';
      timerEl.classList.remove('hidden');
    }
    s.timerTimer = setInterval(updateTimer, 500);

    // ---------- Velas por volumen ----------
    function baseAsset() {
      const m = /^(.+?)(USDT|USDC|FDUSD|BUSD|TUSD|USD|EUR|BTC|ETH|BNB)$/.exec(vcfg.symbol);
      return m ? m[1] : vcfg.symbol;
    }
    function tfLabel(tf) { return tf.kind === 'vol' ? `${String(tf.vol).replace('.', ',')} ${baseAsset()}` : tf.label; }
    function volNote() {
      const bits = [];
      if (s.vol && s.vol.market === 'spot') bits.push('Futuros no disponible: usando Spot');
      const m = L.volSpeed(s.bars, 20);
      if (m !== null) bits.push(`≈ ${m < 1 ? Math.round(m * 60) + ' s' : (Math.round(m * 10) / 10).toString().replace('.', ',') + ' min'} por vela (últimas 20)`);
      return bits.join(' · ');
    }
    // Lee operaciones hacia atrás desde el id 'id0' (sin incluirlo) hasta juntar 'targetVol' o llegar al límite de peticiones.
    async function fetchTradesBack(id0, targetVol, maxReq, token, progress) {
      const chunks = [];
      let vol = 0, reqs = 0;
      while (vol < targetVol && reqs < maxReq && id0 > 0) {
        const jobs = [];
        for (let k = 0; k < 4 && reqs + jobs.length < maxReq; k++) {
          const hi = id0 - 1000 * k;           // el trozo cubre [hi-1000, hi-1]
          const from = Math.max(0, hi - 1000);
          const limit = hi - from;
          if (limit <= 0) break;
          jobs.push(API.aggTrades({ symbol: vcfg.symbol, fromId: from, limit, market: s.vol.market }));
        }
        if (!jobs.length) break;
        let results;
        try { results = await Promise.all(jobs); } catch (e) { if (chunks.length) break; throw e; }
        if (token !== s.token || s.destroyed) return null;
        reqs += jobs.length;
        for (const r of results) { chunks.push(r.rows); for (const t of r.rows) vol += t[2]; }
        id0 = Math.max(0, id0 - 1000 * jobs.length);
        if (progress) progress(Math.min(1, vol / targetVol));
      }
      const trades = [];
      chunks.sort((a, b) => (a[0] ? a[0][0] : 0) - (b[0] ? b[0][0] : 0));
      for (const c of chunks) for (const t of c) trades.push(t);
      return { trades, id0 };
    }
    async function loadVol() {
      const token = ++s.token;
      stopPolling();
      hideOverlay();
      const tf = tfNow(), N = tf.vol;
      s.loadingMore = false; s.reachedStart = false; s.loading = true; s.base = []; s.vol = { market: undefined };
      setStatus('Cargando operaciones…', 'loading');
      try {
        const first = await API.aggTrades({ symbol: vcfg.symbol, limit: 1000 });
        if (token !== s.token || s.destroyed) return;
        if (!first.rows.length) throw new Error(`No hay operaciones para ${vcfg.symbol}.`);
        s.vol.market = first.market;
        const target = N * 200 * 1.05;
        let have = 0;
        for (const t of first.rows) have += t[2];
        const id0 = first.rows[0][0];
        const back = await fetchTradesBack(id0, Math.max(0, target - have), 90, token,
          (f) => setStatus(`Cargando operaciones… ${Math.round(f * 100)}%`, 'loading'));
        if (!back) return;
        const trades = back.trades.concat(first.rows);
        s.bars = [];
        L.volAppend(s.bars, trades, N);
        s.lastId = first.rows[first.rows.length - 1][0];
        s.reachedStart = back.id0 <= 0;
        s.precision = L.detectPrecision(s.bars);
        buildMainSeries();
        mainScale().applyOptions({ autoScale: true });
        syncMas();
        Object.keys(s.sub).forEach(dropSub);
        removeEmptyPanes();
        syncIndicators(true);
        const n = s.bars.length;
        s.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 160), to: n + 7 });
        renderLegend(null);
        s.loading = false;
        setStatus('En vivo', 'live');
        s.pollTimer = setInterval(poll, 1500);
        G.onLoaded(view);
      } catch (e) {
        if (token !== s.token || s.destroyed) return;
        s.loading = false;
        setStatus('Sin datos', 'err');
        showOverlay('No se pudieron cargar las operaciones: ' + e.message, true);
      }
    }
    async function loadMoreVol() {
      if (s.loadingMore || s.reachedStart || !s.bars.length || s.loading) return;
      s.loadingMore = true;
      const token = s.token;
      try {
        const tf = tfNow(), N = tf.vol;
        setStatus('Cargando más historial…', 'loading');
        const head = s.bars[0];
        const back = await fetchTradesBack(head.a, N * 120 * 1.05, 40, token);
        if (!back) return;
        const range = s.chart.timeScale().getVisibleLogicalRange();
        const added = L.volPrepend(s.bars, back.trades, N);
        if (back.id0 <= 0) s.reachedStart = true;
        if (added > 0) {
          s.series.setData(s.bars.map(toPoint));
          syncMas();
          syncIndicators(true);
          if (range) s.chart.timeScale().setVisibleLogicalRange({ from: range.from + added, to: range.to + added });
        }
        setStatus('En vivo', 'live');
      } catch (e) {
        setStatus('Error al cargar historial', 'err');
      } finally {
        s.loadingMore = false;
      }
    }
    async function pollVol() {
      if (s.polling || !s.bars.length || s.loading) return;
      s.polling = true;
      const token = s.token;
      try {
        const N = tfNow().vol;
        const all = [];
        let from = s.lastId + 1;
        for (let loop = 0; loop < 5; loop++) {
          const res = await API.aggTrades({ symbol: vcfg.symbol, fromId: from, limit: 1000, market: s.vol.market });
          if (token !== s.token || s.destroyed) return;
          if (!res.rows.length) break;
          for (const t of res.rows) all.push(t);
          from = res.rows[res.rows.length - 1][0] + 1;
          if (res.rows.length < 1000) break;
        }
        if (all.length) {
          s.lastId = all[all.length - 1][0];
          const start = L.volAppend(s.bars, all, N);
          for (let i = start; i < s.bars.length; i++) s.series.update(toPoint(s.bars[i]));
          updateMasTail(start);
          syncIndicators(false, start);
        }
        if (s.hoverTime === null) renderLegend(null);
        setStatus('En vivo', 'live');
      } catch (e) {
        setStatus('Reconectando…', 'err');
      } finally {
        s.polling = false;
      }
    }

    // ---------- Carga de datos ----------
    async function fetchBack(endMs, pages, token) {
      const tf = tfNow();
      const sec = L.baseSec(tf);
      const byTime = new Map();
      let reached = false;
      if (sec && !trOn() && window.TVHistory && TVHistory.supported(tf.base)) {
        // historial local: lo ya descargado sale del disco
        const nBlocks = pages;
        const r = await TVHistory.fetchBack(vcfg.symbol, tf.base, endMs, nBlocks, () => token !== s.token || s.destroyed, exId());
        if (!r) return null;
        const rows = endMs === undefined ? r.rows : r.rows.filter((x) => x[0] <= endMs);
        return { candles: rows.map(L.parseKline), reached: r.reached };
      }
      if (sec && !trOn()) {
        const span = 1000 * sec * 1000;
        const first = endMs === undefined ? Date.now() : endMs;
        for (let p0 = 0; p0 < pages && !reached; p0 += 5) {
          const jobs = [];
          for (let p = p0; p < Math.min(pages, p0 + 5); p++) {
            jobs.push(API.klines({ exchange: dataEx(), symbol: vcfg.symbol, interval: tf.base, limit: 1000, endTime: first - p * span }));
          }
          const results = await Promise.all(jobs);
          if (token !== s.token || s.destroyed) return null;
          for (const rows of results) {
            if (!rows.length) reached = true;
            for (const r of rows) byTime.set(r[0], r);
          }
        }
      } else {
        let end = endMs;
        for (let p = 0; p < pages; p++) {
          const params = Object.assign({ exchange: dataEx(), symbol: vcfg.symbol, interval: tf.base, limit: 1000 }, trParams());
          if (end !== undefined) params.endTime = end;
          const rows = await API.klines(params);
          if (token !== s.token || s.destroyed) return null;
          if (!rows.length) { reached = true; break; }
          for (const r of rows) byTime.set(r[0], r);
          end = rows[0][0] - 1;
          if (rows.length < 1000) { reached = true; break; }
        }
      }
      const candles = Array.from(byTime.values()).sort((x, y) => x[0] - y[0]).map(L.parseKline);
      return { candles, reached };
    }

    function stopPolling() { clearInterval(s.pollTimer); s.pollTimer = null; }
    // Operaciones reales: el servidor local informa de descargas, hueco por rellenar y estado de la transmisión.
    function trLiveText() {
      const i = s.trInfo;
      let t = 'En vivo · operaciones reales';
      if (!i) return t;
      if (i.archive && i.archive.running) t += ` · descargando ${i.archive.running.day}` + (i.archive.running.total ? ` (${Math.round(100 * i.archive.running.bytes / i.archive.running.total)} %)` : '');
      else if (i.archive && i.archive.done < i.archive.total - i.archive.missing.length) t += ' · descargando historial';
      if (i.fill && i.fill.active && i.fill.total) t += ` · completando hueco (${Math.max(0, Math.round(100 * (1 - i.fill.remaining / i.fill.total)))} %)`;
      if (i.live && i.live.mode === 'rest') t += ' · en vivo por consultas';
      if (i.errors && i.errors.length) t += ` · ${i.errors.length} aviso${i.errors.length > 1 ? 's' : ''}`;
      return t;
    }
    async function pollTradeInfo() {
      if (!trOn() || s.rp || s.destroyed || !API.tradeStatus) return;
      try { s.trInfo = await API.tradeStatus(); } catch (e) { s.trInfo = null; return; }
      if (!s.loading && s.bars.length) {
        const bad = s.trInfo && (s.trInfo.errors.length || (s.trInfo.live && s.trInfo.live.mode === 'rest'));
        setStatus(okText(), bad ? 'err' : 'live');
      }
    }
    const okText = () => (trOn() ? trLiveText() : (s.reachedStart ? 'En vivo · historial completo' : 'En vivo'));

    async function load() {
      zoomStack.length = 0;
      rpReset();
      if (tfNow().kind === 'vol') return loadVol();
      const token = ++s.token;
      stopPolling();
      hideOverlay();
      const tf = tfNow();
      if (tf.unavailable) { // este exchange no puede armar esa temporalidad: se avisa en vez de cambiarla en silencio
        s.loading = false;
        setStatus('Sin datos', 'err');
        showOverlay(tf.why, false);
        return;
      }
      clearInterval(s.trTimer); s.trTimer = null; s.trInfo = null;
      if (trOn()) {
        if (vcfg.symbol !== 'BTCUSDT' || exId() !== 'binance') { // no se cambia en silencio: se avisa
          s.loading = false; setStatus('Sin datos', 'err');
          showOverlay('Las velas de operaciones reales funcionan solo con BTCUSDT de Binance (Futuros) en esta versión. Elige BTCUSDT de Binance o vuelve a «Velas del exchange» en el botón Datos.', false);
          return;
        }
        s.trTimer = setInterval(pollTradeInfo, 2000);
      }
      s.loadingMore = false; s.reachedStart = false; s.loading = true;
      setStatus(trOn() ? 'Cargando operaciones (la primera vez descarga archivos del día)…' : 'Cargando historial…', 'loading');
      try {
        s.anchor = 0;
        if (L.needsAnchor(tf)) {
          if (exId() !== 'binance' || trOn()) s.anchor = L.GENESIS_SEC; // Bybit/KuCoin no dan "la primera vela": se cuenta desde la fecha de inicio de Binance
          else {
            const first = await API.klines({ symbol: vcfg.symbol, interval: tf.base, startTime: 0, limit: 1 });
            if (token !== s.token || s.destroyed) return;
            if (first.length) s.anchor = Math.floor(first[0][0] / 1000);
          }
        }
        // Primera carga corta (se ve enseguida); el resto del historial se completa solo en segundo plano (autoFill).
        const pages = Math.min(L.ratioOf(tf) > L.MAX_RATIO ? 24 : 16, Math.max(2, Math.ceil((600 * L.ratioOf(tf)) / 1000)));
        const res = await fetchBack(undefined, pages, token);
        if (!res) return;
        if (!res.candles.length) throw new Error(`No hay datos para ${vcfg.symbol} en ${exName()}.`);
        s.base = res.candles;
        s.reachedStart = res.reached;
        s.bars = L.aggregate(s.base, tf, s.anchor);
        s.precision = L.detectPrecision(s.bars);
        buildMainSeries();
        mainScale().applyOptions({ autoScale: true });
        syncMas();
        // los indicadores se recrean desde cero (cambió el activo o la temporalidad)
        Object.keys(s.sub).forEach(dropSub);
        removeEmptyPanes();
        syncIndicators(true);
        const n = s.bars.length;
        s.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 160), to: n + 7 });
        renderLegend(null);
        s.loading = false;
        if (view.draw) view.draw.repaint();
        setStatus(okText(), 'live');
        s.pollTimer = setInterval(poll, tf.sec < 60 ? 1000 : 3000);
        warmBack(token);
        G.onLoaded(view);
        autoFill(token);
      } catch (e) {
        if (token !== s.token || s.destroyed) return;
        s.loading = false;
        setStatus('Sin datos', 'err');
        showOverlay('No se pudieron cargar los datos: ' + e.message, true);
      }
    }

    // Mientras el usuario mira el gráfico, se va guardando en el equipo el historial anterior.
    function warmBack(token) {
      const tf = tfNow();
      if (trOn() || !window.TVHistory || !TVHistory.supported(tf.base) || !s.base.length || s.reachedStart) return;
      const blocks = Math.max(4, Math.min(L.ratioOf(tf) > L.MAX_RATIO ? 300 : 40, Math.ceil((1200 * L.ratioOf(tf)) / 1000)));
      TVHistory.warm(vcfg.symbol, tf.base, s.base[0].time * 1000 - 1, blocks, () => token !== s.token || s.destroyed, exId());
    }
    async function loadMore(pagesOverride) {
      if (s.rp) return false;   // en reproducción no se agrega historial
      if (tfNow().kind === 'vol') return loadMoreVol();
      if (s.loadingMore || s.reachedStart || !s.base.length || s.loading) return false;
      s.loadingMore = true;
      const token = s.token;
      try {
        const tf = tfNow();
        const pages = typeof pagesOverride === 'number' ? pagesOverride : Math.max(1, Math.min(30, Math.ceil((500 * L.ratioOf(tf)) / 1000)));
        setStatus('Cargando más historial…', 'loading');
        const res = await fetchBack(s.base[0].time * 1000 - 1, pages, token);
        if (!res) return;
        s.reachedStart = res.reached;
        if (res.candles.length) {
          const oldFirst = s.bars[0].time;
          const range = s.chart.timeScale().getVisibleLogicalRange();
          s.base = res.candles.concat(s.base);
          s.bars = L.aggregate(s.base, tf, s.anchor);
          const added = s.bars.findIndex((b) => b.time >= oldFirst);
          s.series.setData(s.bars.map(toPoint));
          syncMas();
          syncIndicators(true);
          if (range && added > 0) s.chart.timeScale().setVisibleLogicalRange({ from: range.from + added, to: range.to + added });
        }
        setStatus(okText(), 'live');
        warmBack(token);
        return true;
      } catch (e) {
        setStatus('Error al cargar historial', 'err');
        return false;
      } finally {
        s.loadingMore = false;
      }
    }
    // Completa el historial sin que haya que mover el gráfico: sigue pidiendo velas anteriores hasta tener
    // unas 1.500 barras (o todo el historial disponible), con un tope de bloques por seguridad.
    async function autoFill(token) {
      const tf = tfNow();
      const heavy = L.ratioOf(tf) > L.MAX_RATIO; // barras exactas muy pesadas: menos barras objetivo, más bloques de tope
      const TARGET = heavy ? 120 : 1500, MAX_BLOCKS = heavy ? 600 : 150;
      let used = 0;
      const pages = Math.max(4, Math.min(16, Math.ceil((300 * L.ratioOf(tf)) / 1000)));
      while (token === s.token && !s.destroyed && !s.reachedStart && s.bars.length < TARGET && used < MAX_BLOCKS) {
        if (s.loadingMore) { await new Promise((r) => setTimeout(r, 150)); continue; }
        const ok = await loadMore(pages);
        used += pages;
        if (ok === false) break;
      }
    }

    function onRangeChange(r) {
      if (r && r.from < 150) loadMore();
      if (!s.loading) G.onRange(view);
    }

    async function poll() {
      if (s.rp) return;
      if (tfNow().kind === 'vol') return pollVol();
      if (s.polling || !s.bars.length || s.loading) return;
      s.polling = true;
      const token = s.token;
      try {
        const tf = tfNow();
        const limit = Math.min(1000, Math.max(5, L.ratioOf(tf) * 2 + 2));
        const rows = await API.klines(Object.assign({ exchange: dataEx(), symbol: vcfg.symbol, interval: tf.base, limit }, trParams()));
        if (token !== s.token || s.destroyed) return;
        const prevLast = s.bars[s.bars.length - 1].time;
        L.mergeCandles(s.base, rows.map(L.parseKline));
        s.bars = L.aggregate(s.base, tf, s.anchor);
        let start = s.bars.length - 1;
        while (start > 0 && s.bars[start].time > prevLast) start--;
        for (let i = start; i < s.bars.length; i++) s.series.update(toPoint(s.bars[i]));
        updateMasTail(start);
        syncIndicators(false, start);
        if (s.hoverTime === null) renderLegend(null);
        setStatus(okText(), 'live');
      } catch (e) {
        setStatus('Reconectando…', 'err');
      } finally {
        s.polling = false;
      }
    }

    // ---------- Eje de precios: zoom con la rueda, menú con clic derecho ----------
    function zoomAxis(ps, log, h, deltaY, y) {
      const r = ps.getVisibleRange();
      if (!r || !(r.to > r.from)) return;
      const lo = log ? Math.log10(Math.max(r.from, 1e-12)) : r.from;
      const hi = log ? Math.log10(Math.max(r.to, 1e-12)) : r.to;
      const step = Math.max(-3, Math.min(3, deltaY / 100));
      const factor = Math.exp(step * 0.12);
      const frac = Math.max(0, Math.min(1, y / Math.max(1, h)));
      const pivot = hi - frac * (hi - lo);
      const nlo = pivot - (pivot - lo) * factor;
      const nhi = pivot + (hi - pivot) * factor;
      if (!(nhi > nlo) || !isFinite(nlo) || !isFinite(nhi)) return;
      const toInternal = (v) => (log ? Math.log10(Math.pow(10, v) + 0.0001) + 4 : v);
      ps.setAutoScale(false);
      ps.setVisibleRange({ from: toInternal(nlo), to: toInternal(nhi) });
      const chk = ps.getVisibleRange();
      if (!chk || !isFinite(chk.from) || !isFinite(chk.to) || !(chk.to > chk.from)) ps.applyOptions({ autoScale: true });
    }
    function priceAxisWidth() { try { return mainScale().width(); } catch (e) { return 0; } }
    // Panel (y su serie principal) bajo una posición vertical de la pantalla.
    function paneAt(clientY) {
      for (const p of s.chart.panes()) {
        const e = p.getHTMLElement();
        if (!e) continue;
        const r = e.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) {
          const idx = p.paneIndex();
          if (s.series && mainPaneIdx() === idx) return { ser: s.series, main: true, rect: r };
          for (const n of SUB_ORDER) {
            const sub = s.sub[n];
            if (sub && sub.main.getPane().paneIndex() === idx) return { ser: sub.main, main: false, rect: r };
          }
          return null;
        }
      }
      return null;
    }
    function overAxis(e) {
      const w = priceAxisWidth();
      return !!w && e.clientX >= chartEl.getBoundingClientRect().right - w;
    }
    chartEl.addEventListener('wheel', (e) => {
      if (!overAxis(e) || !s.series) return;
      const hit = paneAt(e.clientY);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      zoomAxis(hit.ser.priceScale(), hit.main && vcfg.scale === 'log', hit.rect.height, e.deltaY, e.clientY - hit.rect.top);
    }, { passive: false, capture: true });

    let axisMenu = null;
    function closeAxisMenu() {
      if (axisMenu) { axisMenu.remove(); axisMenu = null; }
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onDocKey, true);
    }
    function onDocDown(e) { if (axisMenu && !axisMenu.contains(e.target)) closeAxisMenu(); }
    function onDocKey(e) { if (e.key === 'Escape') closeAxisMenu(); }
    function showAxisMenu(x, y, hit) {
      closeAxisMenu();
      const m = el('div', 'ctx-menu');
      const item = (text, fn, checked) => {
        const b = el('button', 'ctx-item');
        b.append(el('span', 'ctx-check', checked ? '✓' : ''), el('span', '', text));
        b.onclick = () => { closeAxisMenu(); fn(); };
        m.appendChild(b);
      };
      if (hit.main) item('Invertir escala', () => { vcfg.invert = !vcfg.invert; applyScaleMode(); G.save(); }, !!vcfg.invert);
      item('Escala automática', () => hit.ser.priceScale().applyOptions({ autoScale: true }));
      document.body.appendChild(m);
      m.style.left = Math.min(x, window.innerWidth - m.offsetWidth - 6) + 'px';
      m.style.top = Math.min(y, window.innerHeight - m.offsetHeight - 6) + 'px';
      axisMenu = m;
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onDocKey, true);
    }
    chartEl.addEventListener('contextmenu', (e) => {
      if (!overAxis(e) || !s.series) return;
      const hit = paneAt(e.clientY);
      if (!hit) return;
      e.preventDefault();
      showAxisMenu(e.clientX, e.clientY, hit);
    });
    // Doble clic sobre el gráfico (no sobre los ejes ni los botones de un panel).
    chartEl.addEventListener('dblclick', (e) => {
      if (overAxis(e)) return;
      const rect = chartEl.getBoundingClientRect();
      if (e.clientY > rect.bottom - (s.chart.timeScale().height() || 0)) return;
      if (e.target && e.target.closest && (e.target.closest('.pl-btns') || e.target.closest('.pane-legend'))) return;
      // Al hacer clic dos veces seguidas en una flecha del panel, el botón se vuelve a dibujar y el doble clic llega al gráfico: no debe ocultar los indicadores.
      if (e.target && !chartEl.contains(e.target)) return;
      if (Date.now() - (s.lastLegendClick || 0) < 900) return;
      G.onDoubleClick(view);
    });

    // ---------- Captura de imagen (v0.19) ----------
    // Imagen del gráfico (velas, paneles, ejes, dibujos) + los textos y logos que van encima (leyendas, marca de agua).
    function captureCanvas() {
      const base = s.chart.takeScreenshot(true, false);
      const out = document.createElement('canvas');
      out.width = base.width; out.height = base.height;
      const ctx = out.getContext('2d');
      ctx.drawImage(base, 0, 0);
      const org = chartEl.getBoundingClientRect();
      const k = base.width / Math.max(1, chartEl.clientWidth);
      const opacityOf = (n, root) => { let o = 1; for (let e = n; e && e !== root.parentElement; e = e.parentElement) { const v = parseFloat(getComputedStyle(e).opacity); if (isFinite(v)) o *= v; } return o; };
      const roots = Array.from(host.querySelectorAll('.legend, .wm, .pane-legend')).filter((r) => !r.closest('.hidden') && !r.classList.contains('hidden'));
      roots.forEach((root) => {
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          const t = n.nodeValue;
          const p = n.parentElement;
          if (!t || !t.trim() || !p || p.closest('.pl-btns') || p.closest('.hidden')) continue;
          const cs = getComputedStyle(p);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          const r = rg.getBoundingClientRect();
          if (!r.width) continue;
          ctx.save();
          ctx.globalAlpha = opacityOf(p, root);
          ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize) * k}px ${cs.fontFamily}`;
          ctx.fillStyle = cs.color; ctx.textBaseline = 'middle';
          ctx.fillText(t.replace(/\s+/g, ' '), (r.left - org.left) * k, (r.top + r.height / 2 - org.top) * k);
          ctx.restore();
        }
        root.querySelectorAll('img').forEach((im) => {
          if (!im.complete || !im.naturalWidth || im.closest('.hidden')) return;
          const r = im.getBoundingClientRect();
          ctx.save(); ctx.globalAlpha = opacityOf(im, root);
          try { ctx.drawImage(im, (r.left - org.left) * k, (r.top - org.top) * k, r.width * k, r.height * k); } catch (e) { /* imagen ajena: se omite */ }
          ctx.restore();
        });
      });
      return out;
    }
    function toast(text) {
      const t = el('div', 'toast', text);
      host.appendChild(t);
      setTimeout(() => t.remove(), 3200);
    }
    function captureName() {
      const d = new Date(), z = (n) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}`;
      return `${vcfg.symbol}_${tfLabel(tfNow())}_${stamp}.png`.replace(/[^\w.\-]+/g, '_');
    }
    function capture(mode) {
      if (!s.chart || !s.bars.length) { toast('No hay gráfico para capturar.'); return; }
      let cv;
      try { cv = captureCanvas(); } catch (e) { toast('No se pudo capturar la imagen: ' + e.message); return; }
      cv.toBlob(async (blob) => {
        if (!blob) { toast('No se pudo crear la imagen.'); return; }
        if (mode === 'copy') {
          try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Imagen copiada: pégala con Ctrl+V.'); }
          catch (e) { toast('No se pudo copiar al portapapeles (' + (e.message || e.name) + '). Usa "Guardar imagen".'); }
          return;
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = captureName();
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        toast('Imagen guardada: ' + a.download);
      }, 'image/png');
    }
    function showCamMenu(x, y) {
      closeAxisMenu();
      const m = el('div', 'ctx-menu');
      [['Guardar imagen (PNG)', () => capture('save')], ['Copiar imagen', () => capture('copy')]].forEach(([t, fn]) => {
        const b = el('button', 'ctx-item');
        b.append(el('span', 'ctx-check', ''), el('span', '', t));
        b.onclick = () => { closeAxisMenu(); setTimeout(fn, 30); };
        m.appendChild(b);
      });
      document.body.appendChild(m);
      m.style.left = Math.min(x, window.innerWidth - m.offsetWidth - 6) + 'px';
      m.style.top = Math.min(y, window.innerHeight - m.offsetHeight - 6) + 'px';
      axisMenu = m;
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onDocKey, true);
    }

    // ---------- Reproducción de barras (v0.19) ----------
    // Se elige una vela del pasado; las posteriores se ocultan y se van mostrando de a una (a la temporalidad del gráfico).
    // Indicadores, medias y dibujos se calculan solo con lo ya "ocurrido". Al salir se recargan los datos en vivo.
    const RP_SPEEDS = [0.5, 1, 2, 5, 10, 30];
    function applyBars() {
      s.series.setData(s.bars.map(toPoint));
      syncMas(); syncIndicators(true); renderLegend(null);
      if (view.draw) view.draw.repaint();
    }
    function rpUi() {
      rpBar.innerHTML = '';
      if (s.rpPick) {
        rpBar.classList.remove('hidden');
        rpBar.append(el('span', 'rp-hint', 'Haz clic en la vela donde empieza la reproducción'));
        const c = el('button', 'rp-btn', '✕'); c.title = 'Cancelar (Esc)'; c.onclick = () => rpReset(true);
        rpBar.appendChild(c);
        return;
      }
      if (!s.rp) { rpBar.classList.add('hidden'); return; }
      rpBar.classList.remove('hidden');
      const b = (txt, title, fn) => { const x = el('button', 'rp-btn', txt); x.title = title; x.onclick = fn; rpBar.appendChild(x); return x; };
      b('⏮', 'Volver a la vela de inicio', () => rpGoto(s.rp.start));
      b('◀', 'Una vela atrás (←)', () => { rpPause(); rpStep(-1); });
      b(s.rp.playing ? '⏸' : '▶', 'Reproducir / pausar (barra espaciadora)', () => (s.rp.playing ? rpPause() : rpPlay()));
      b('▶|', 'Una vela adelante (→)', () => { rpPause(); rpStep(1); });
      const sel = el('select', 'rp-speed');
      RP_SPEEDS.forEach((v) => { const o = el('option', '', v + ' vela/s'); o.value = String(v); sel.appendChild(o); });
      sel.value = String(s.rp.speed); sel.title = 'Velocidad';
      sel.onchange = () => { s.rp.speed = Number(sel.value); if (s.rp.playing) { rpPause(); rpPlay(); } };
      rpBar.appendChild(sel);
      const info = el('span', 'rp-info', ''); info.id = 'rpInfo'; rpBar.appendChild(info);
      b('✕', 'Salir de la reproducción y volver al presente (Esc)', () => rpStop());
      rpInfo();
    }
    function rpInfo() {
      if (!s.rp) return;
      const last = s.bars[s.bars.length - 1];
      const t = last ? new Date(last.time * 1000).toLocaleString('es', { timeZone: cfg().tz === 'UTC' ? 'UTC' : undefined, day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      const i = rpBar.querySelector('#rpInfo'); if (i) i.textContent = `${s.rp.k} / ${s.rp.full.length} · ${t}`;
      setStatus(`Reproducción · vela ${s.rp.k} de ${s.rp.full.length}`, 'live');
    }
    function rpReset(notify) {
      if (s.rp && s.rp.timer) clearInterval(s.rp.timer);
      const was = !!(s.rp || s.rpPick);
      s.rp = null; s.rpPick = false;
      rpBar.classList.add('hidden'); rpBar.innerHTML = '';
      if (was && notify && G.onReplay) G.onReplay(view);
    }
    function rpPickStart() {
      if (!s.chart || s.loading || s.bars.length < 3) { toast('Espera a que cargue el gráfico para empezar la reproducción.'); return false; }
      if (isVol()) return false;
      if (s.rp) rpPause();
      s.rpPick = true;
      rpUi();
      if (G.onReplay) G.onReplay(view);
      return true;
    }
    function rpBegin(idx) {
      const full = s.rp ? s.rp.full : s.bars;
      const k = Math.max(1, Math.min(full.length - 1, idx + 1)); // al menos una vela queda oculta
      s.rpPick = false;
      stopPolling();
      s.rp = { full, k, start: k, playing: false, speed: 2, timer: null };
      s.bars = full.slice(0, k);
      applyBars();
      s.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, k - 160), to: k + 7 });
      rpUi();
      if (G.onReplay) G.onReplay(view);
    }
    function rpGoto(k) {
      if (!s.rp) return;
      rpPause();
      s.rp.k = Math.max(1, Math.min(s.rp.full.length, k));
      s.bars = s.rp.full.slice(0, s.rp.k);
      applyBars(); rpInfo();
    }
    function rpStep(d) {
      const r = s.rp; if (!r) return false;
      if (d > 0) {
        if (r.k >= r.full.length) { rpPause(); return false; }
        r.k++;
        s.bars = r.full.slice(0, r.k);
        const i = r.k - 1;
        s.series.update(toPoint(s.bars[i]));
        updateMasTail(i); syncIndicators(false, i);
        renderLegend(null);
        if (view.draw) view.draw.repaint();
      } else {
        if (r.k <= 1) return false;
        r.k--; s.bars = r.full.slice(0, r.k); applyBars();
      }
      rpInfo();
      return true;
    }
    function rpPlay() {
      const r = s.rp; if (!r || r.playing) return;
      if (r.k >= r.full.length) rpGoto(r.start);
      r.playing = true;
      r.timer = setInterval(() => { if (!rpStep(1)) { rpPause(); } }, Math.round(1000 / r.speed));
      rpUi();
    }
    function rpPause() {
      const r = s.rp; if (!r) return;
      if (r.timer) clearInterval(r.timer);
      r.timer = null;
      if (r.playing) { r.playing = false; rpUi(); }
    }
    function rpStop() { rpReset(true); return load(); }
    function onChartClick(param) {
      if (!s.rpPick || !param || param.logical === undefined) return;
      const n = s.bars.length;
      rpBegin(Math.max(0, Math.min(n - 2, Math.round(param.logical))));
    }
    function onRpKey(e) {
      if (!(s.rp || s.rpPick) || (!s.hover && index !== G.activeIndex())) return;
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (e.key === 'Escape') { e.preventDefault(); s.rp ? rpStop() : rpReset(true); }
      else if (!s.rp) return;
      else if (e.key === 'ArrowRight') { e.preventDefault(); rpPause(); rpStep(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); rpPause(); rpStep(-1); }
      else if (e.key === ' ') { e.preventDefault(); s.rp.playing ? rpPause() : rpPlay(); }
    }
    document.addEventListener('keydown', onRpKey);

    // ---------- Interacción con la app ----------
    host.addEventListener('mousedown', () => G.onActivate(view), true);
    host.addEventListener('mouseenter', () => { s.hover = true; });
    host.addEventListener('mouseleave', () => {
      s.hover = false; s.hoverTime = null;
      renderLegend(null);
      G.onCrosshair(view, null);
      hideXh();
    });

    // ---------- API pública de la vista ----------
    Object.assign(view, {
      load,
      snapshotHeights,
      setSymbol(sym, ex) {
        const nx = ex || exId();
        if (sym === vcfg.symbol && nx === exId()) return;
        vcfg.symbol = sym; vcfg.exchange = nx; renderWatermark(); load();
      },
      setTf(id) {
        if (id === vcfg.tf) return;
        vcfg.tf = id;
        refreshFormatters();
        renderWatermark();
        load();
      },
      setChartType(t) {
        if (t === vcfg.chartType) return;
        vcfg.chartType = t;
        if (s.bars.length) {
          const range = s.chart.timeScale().getVisibleLogicalRange();
          buildMainSeries();
          if (range) s.chart.timeScale().setVisibleLogicalRange(range);
        }
      },
      setScale(sc) { vcfg.scale = sc; applyScaleMode(); },
      autoScale() { zoomStack.length = 0; mainScale().applyOptions({ autoScale: true }); },
      // ¿hay un zoom hecho con la lupa o la escala vertical está fija? (muestra el botón "Alejar")
      canZoomOut() { try { return zoomStack.length > 0 || !!(s.series && mainScale().options().autoScale === false); } catch (e) { return false; } },
      // Alejar: vuelve a la vista anterior al último zoom; sin historial, solo devuelve la escala vertical a automática
      zoomOut() {
        if (!s.chart || !s.series) return;
        const z = zoomStack.pop();
        const ps = mainScale();
        if (!z) { ps.applyOptions({ autoScale: true }); return; }
        if (z.range) s.chart.timeScale().setVisibleLogicalRange(z.range);
        if (z.auto || !z.prange) { ps.applyOptions({ autoScale: true }); return; }
        ps.setAutoScale(false);
        ps.setVisibleRange({ from: priceInternal(z.prange.from, z.log), to: priceInternal(z.prange.to, z.log) });
      },
      toggleSubs() { s.subsHidden = !s.subsHidden; if (s.bars.length) syncIndicators(true); return s.subsHidden; },
      setMaximized(on) { maxBtn.textContent = on ? '🗗' : '⛶'; maxBtn.title = on ? 'Volver al diseño (Esc)' : 'Ampliar este gráfico a pantalla completa'; },
      applyTheme() { applyLook(); if (s.scr) s.scr.update(); },
      applyLook,
      applyTimer() { updateTimer(); },
      applyCandleStyle() { applyHostVars(); if (s.series && vcfg.chartType === 'candles') s.series.applyOptions(mainOptions()); renderLegend(null); },
      applyTz() { refreshFormatters(); },
      refreshMas() { if (s.bars.length) { syncMas(); renderLegend(null); } },
      refreshIndicators() { if (s.bars.length) syncIndicators(true); },
      redrawLegend() { renderLegend(null); },
      // sincronización
      rightEdgeTime() {
        const r = s.chart.timeScale().getVisibleLogicalRange();
        if (!r || !s.bars.length || isVol()) return null;
        return L.logicalToTime(s.bars, tfNow().sec, r.to);
      },
      visibleWidth() {
        const r = s.chart.timeScale().getVisibleLogicalRange();
        return r ? r.to - r.from : null;
      },
      setRightEdgeTime(t) {
        if (!s.bars.length || s.loading || isVol()) return;
        const r = s.chart.timeScale().getVisibleLogicalRange();
        if (!r) return;
        const w = r.to - r.from;
        const to = Math.min(L.timeToLogical(s.bars, tfNow().sec, t), s.bars.length + 8);
        s.chart.timeScale().setVisibleLogicalRange({ from: to - w, to });
      },
      showCrosshairAt(info) { showXh(info); },
      capture,
      replayPick() { return rpPickStart(); },
      replayStop() { if (s.rp) return rpStop(); rpReset(true); },
      // Fuente de datos del gráfico: 'candles' (velas del exchange) o 'trades' (velas armadas con operaciones reales)
      setSource(src, tr) {
        vcfg.src = src === 'trades' ? 'trades' : 'candles';
        if (tr) vcfg.tr = Object.assign({}, tr);
        return load();
      },
      destroy() {
        s.destroyed = true;
        if (s.scr) s.scr.destroy();
        clearInterval(s.trTimer);
        document.removeEventListener('keydown', onRpKey);
        if (s.rp && s.rp.timer) clearInterval(s.rp.timer);
        stopPolling();
        clearInterval(s.timerTimer);
        closeAxisMenu();
        if (view.draw) view.draw.destroy();
        try { s.chart.remove(); } catch (e) { /* ya quitado */ }
        host.innerHTML = '';
      },
    });

    Object.defineProperties(view, {
      bars: { get: () => s.bars },
      subsHidden: { get: () => !!s.subsHidden },
      tf: { get: () => tfNow() },
      status: { get: () => s.status },
      replayState: { get: () => (s.rp ? 'on' : (s.rpPick ? 'pick' : 'off')) },
      loading: { get: () => s.loading },
      chart: { get: () => s.chart },
    });
    // Scripts propios (v0.20)
    if (window.TVScriptHost && window.TVScriptRunner) {
      s.scr = window.TVScriptHost.create({ s, vcfg, LC, L, el, fmtVal, themeName, tfNow, G, view, legendEl: () => legendEl });
      view.scriptInfo = (uid) => s.scr.info(uid);
      view.scriptGoTo = (uid, k) => s.scr.goTo(uid, k);
      view.refreshScripts = (force) => (force ? s.scr.refresh() : s.scr.update());
    }
    createChart();
    renderWatermark();
    return view;
  }

  window.TVView = { create: createView };
})();

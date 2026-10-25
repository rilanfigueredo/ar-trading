// Scripts propios aplicados a un gráfico (v0.20): ejecuta (en el Worker), dibuja y rotula.
// Se engancha a view.js con tres llamadas: update() al recalcular indicadores, legend() al rotular y destroy().
// Regla: si el script falla NO se dibuja nada de él; el error se muestra en el rótulo.
(function (root) {
  'use strict';

  function create(env) {
    const { s, vcfg, LC, L, el, fmtVal, themeName, tfNow, G, view } = env;
    const LSTYLE = { solid: LC.LineStyle.Solid, dashed: LC.LineStyle.Dashed, dotted: LC.LineStyle.Dotted };
    const st = new Map();            // uid -> estado de ejecución y dibujo
    let timer = null, busy = false, dirty = false, destroyed = false, chartRef = null;

    const applied = () => (vcfg.scripts || []);
    const lib = () => (G.scriptLib ? G.scriptLib() : []);
    const state = (uid) => {
      if (!st.has(uid)) st.set(uid, { uid, isStrat: false, status: 'idle', error: null, result: null, sig: null, series: [], lines: [], drawSig: null, legendEl: null, textEl: null, ovEl: null });
      return st.get(uid);
    };
    function changed() { if (G.onScriptStatus) G.onScriptStatus(view); }

    // ---------- Dibujo ----------
    function clearSel(x) {
      (x.selLines || []).forEach((l) => { try { s.series.removePriceLine(l); } catch (e) { /* ya quitada */ } });
      x.selLines = [];
    }
    // Lo propio de las estrategias: marcas en el gráfico, serie del capital y su rótulo.
    function clearExtras(x) {
      if (x.mk) { try { x.mk.detach(); } catch (e) { /* ok */ } x.mk = null; x.mkSeries = null; }
      if (x.eqSer) { try { s.chart.removeSeries(x.eqSer); } catch (e) { /* ya quitada */ } x.eqSer = null; }
      clearSel(x);
      if (x.eqLegendEl && x.eqLegendEl.parentNode) x.eqLegendEl.parentNode.removeChild(x.eqLegendEl);
      x.eqLegendEl = null; x.eq = null;
    }
    function clearDrawing(x) {
      clearExtras(x);
      if (x.segPrim) { try { x.segPrimSeries.detachPrimitive(x.segPrim); } catch (e) { /* ok */ } x.segPrim = null; x.segPrimSeries = null; }
      (x.lines || []).forEach((o) => { if (o.owner === s.series) { try { o.owner.removePriceLine(o.line); } catch (e) { /* ok */ } } });
      x.series.forEach((ser) => { try { s.chart.removeSeries(ser); } catch (e) { /* ya quitada */ } });
      x.series = []; x.lines = []; x.drawSig = null; x.vals = null; x.mainSeries = null;
      if (x.legendEl && x.legendEl.parentNode) x.legendEl.parentNode.removeChild(x.legendEl);
      x.legendEl = null; x.textEl = null;
      try { removeEmptyPanes(); } catch (e) { /* sin gráfico */ }
    }
    function removeEmptyPanes() {
      if (!s.chart) return;
      let panes = s.chart.panes();
      for (let i = panes.length - 1; i >= 0; i--) {
        panes = s.chart.panes();
        if (panes.length > 1 && panes[i] && panes[i].getSeries().length === 0) s.chart.removePane(i);
      }
    }
    const pointsOf = (p, times) => {
      const out = new Array(times.length);
      for (let i = 0; i < times.length; i++) {
        const v = p.values[i];
        if (!(v === v) || v === null) { out[i] = { time: times[i] }; continue; }
        const pt = { time: times[i], value: v };
        if (p.colors && p.colors[i]) pt.color = p.colors[i];
        out[i] = pt;
      }
      return out;
    };
    function draw(x, res, times) {
      const prec = res.precision !== null ? res.precision : (res.overlay ? s.precision : 2);
      const strat = res.strategy || null;
      const sig = JSON.stringify([res.overlay, prec, res.plots.map((p) => [p.kind, p.color, p.width, p.style, !!p.colors, p.title]), res.levels, themeName(), strat ? strat.settings.capital : null]);
      if (x.drawSig !== sig || x.chart !== s.chart || x.mainSeries !== s.series || (res.plots.length && !x.series.length)) {
        clearDrawing(x);
        x.chart = s.chart; x.mainSeries = s.series;
        const fmt = { type: 'price', precision: prec, minMove: Math.pow(10, -prec) };
        let pane = res.overlay ? s.series.getPane().paneIndex() : s.chart.panes().length;
        res.plots.forEach((p) => {
          const common = { priceFormat: fmt, lastValueVisible: !res.overlay, priceLineVisible: false, crosshairMarkerVisible: false };
          const color = L.themedColor ? L.themedColor(p.color, themeName()) : p.color;
          const ser = p.kind === 'hist'
            ? s.chart.addSeries(LC.HistogramSeries, Object.assign({ color }, common), pane)
            : s.chart.addSeries(LC.LineSeries, Object.assign({ color, lineWidth: p.width, lineStyle: LSTYLE[p.style] }, common), pane);
          if (!res.overlay && x.series.length === 0) pane = ser.getPane().paneIndex();
          x.series.push(ser);
        });
        x.series.forEach((ser, i) => {
          if (res.overlay) return;
          if (i === 0) ser.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
        });
        res.levels.forEach((lv) => {
          const ser = x.series[0] || (res.overlay ? s.series : null);
          if (!ser) return;
          x.lines.push({ owner: ser, line: ser.createPriceLine({ price: lv.value, color: L.themedColor ? L.themedColor(lv.color, themeName()) : lv.color, lineWidth: lv.width, lineStyle: LSTYLE[lv.style], axisLabelVisible: !!lv.title || !res.overlay, title: lv.title }) });
        });
        x.drawSig = sig;
        try { s.chart.applyOptions({}); } catch (e) { /* ok */ }
      }
      res.plots.forEach((p, i) => x.series[i].setData(pointsOf(p, times)));
      x.vals = res.plots.map((p) => p.values);
      x.times = times;
      const sm = scriptMarkers(res, times);
      if (strat) drawStrategy(x, strat, times, sm); else { clearExtras(x); applyMarkers(x, sm); }
      drawSegments(x, res.segments || [], times);
    }

    // ---------- Marcas y segmentos del script (v0.22.4): marker(...) y segment(...) ----------
    const SHAPES = { circle: 'circle', arrowUp: 'arrowUp', arrowDown: 'arrowDown', square: 'square' };
    function scriptMarkers(res, times) {
      return (res.marks || []).filter((m) => times[m.idx] !== undefined).map((m) => ({ time: times[m.idx], position: m.pos === 'above' ? 'aboveBar' : 'belowBar', color: m.color, shape: SHAPES[m.shape] || 'circle', text: m.text || '', size: 1 }));
    }
    function applyMarkers(x, ms) {
      if (!ms.length) return;
      ms.sort((a, b) => a.time - b.time);
      x.mk = LC.createSeriesMarkers(s.series, ms); x.mkSeries = s.series;
    }
    function makeSegPrim() {
      let chart = null, series = null, request = null;
      const prim = { segs: [] };
      const renderer = {
        draw(target) {
          if (!chart || !series || !prim.segs.length) return;
          target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context, hpr = scope.horizontalPixelRatio, vpr = scope.verticalPixelRatio, W = scope.bitmapSize.width;
            const ts = chart.timeScale();
            ctx.save();
            prim.segs.forEach((sg) => {
              const xa = ts.logicalToCoordinate(sg.i1), xb = ts.logicalToCoordinate(sg.i2), y = series.priceToCoordinate(sg.price);
              if (xa === null || xb === null || y === null) return;
              const a = Math.round(xa * hpr), b = Math.round(xb * hpr);
              if (b < 0 || a > W) return;
              const yy = Math.round(y * vpr) + 0.5;
              ctx.strokeStyle = sg.color; ctx.lineWidth = Math.max(1, Math.round(sg.width * hpr));
              ctx.setLineDash(sg.style === 'dashed' ? [6 * hpr, 4 * hpr] : sg.style === 'dotted' ? [2 * hpr, 3 * hpr] : []);
              ctx.beginPath(); ctx.moveTo(Math.max(a, 0), yy); ctx.lineTo(Math.min(b, W), yy); ctx.stroke();
            });
            ctx.restore();
          });
        },
      };
      const view = { zOrder: () => 'normal', renderer: () => renderer };
      prim.attached = (p) => { chart = p.chart; series = p.series; request = p.requestUpdate; };
      prim.detached = () => { chart = null; series = null; request = null; };
      prim.updateAllViews = () => {};
      prim.paneViews = () => [view];
      prim.set = (segs) => { prim.segs = segs; if (request) request(); };
      return prim;
    }
    function drawSegments(x, segs, times) {
      if (!segs.length) { if (x.segPrim) x.segPrim.set([]); return; }
      if (x.segPrim && x.segPrimSeries !== s.series) { try { x.segPrimSeries.detachPrimitive(x.segPrim); } catch (e) { /* ok */ } x.segPrim = null; }
      if (!x.segPrim) { x.segPrim = makeSegPrim(); x.segPrimSeries = s.series; s.series.attachPrimitive(x.segPrim); }
      x.segPrim.set(segs);
    }

    // ---------- Estrategias (v0.21): marcas de entrada/salida y capital en un panel aparte ----------
    function buildMarkers(strat, times) {
      const ms = [], showTxt = strat.trades.length <= 60;
      const pct = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
      strat.trades.forEach((t) => {
        const long = t.side === 'long';
        ms.push({ time: times[t.entryIdx], position: long ? 'belowBar' : 'aboveBar', color: long ? '#26a69a' : '#ef5350', shape: long ? 'arrowUp' : 'arrowDown', text: showTxt ? (long ? 'L' : 'C') : '', size: 1 });
        if (!t.open) ms.push({ time: times[t.exitIdx], position: long ? 'aboveBar' : 'belowBar', color: t.pnl >= 0 ? '#26a69a' : '#ef5350', shape: 'circle', text: showTxt ? pct(t.pnlPct) : '', size: 1 });
      });
      return ms.sort((a, b) => a.time - b.time);
    }
    function drawStrategy(x, strat, times, extra) {
      if (!x.eqSer) {
        const fmt = { type: 'price', precision: 2, minMove: 0.01 };
        const pane = s.chart.panes().length;
        x.eqSer = s.chart.addSeries(LC.LineSeries, { color: '#26a69a', lineWidth: 2, priceFormat: fmt, lastValueVisible: true, priceLineVisible: false, crosshairMarkerVisible: false }, pane);
        x.eqSer.createPriceLine({ price: strat.settings.capital, color: '#787b86', lineWidth: 1, lineStyle: LSTYLE.dashed, axisLabelVisible: false, title: '' });
        x.eqSer.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
        try { s.chart.applyOptions({}); } catch (e) { /* ok */ }
      }
      x.eqSer.setData(strat.equity.map((v, i) => (v === v && v !== null ? { time: times[i], value: v } : { time: times[i] })));
      x.eq = strat.equity;
      const ms = buildMarkers(strat, times).concat(extra || []).sort((a, b) => a.time - b.time);
      if (x.mk && x.mkSeries === s.series) x.mk.setMarkers(ms);
      else {
        if (x.mk) { try { x.mk.detach(); } catch (e) { /* ok */ } }
        x.mk = LC.createSeriesMarkers(s.series, ms); x.mkSeries = s.series;
      }
      clearSel(x);
      if (x.selTime !== undefined) markTrade(x, strat.trades.find((t) => t.entryTime === x.selTime));   // la operación elegida sigue marcada si el gráfico se redibuja
    }
    function markTrade(x, t) {
      clearSel(x);
      if (!t) return;
      const long = t.side === 'long';
      const line = (price, color, title) => s.series.createPriceLine({ price, color, lineWidth: 1, lineStyle: LSTYLE.dotted, axisLabelVisible: true, title });
      x.selLines.push(line(t.entryPrice, long ? '#26a69a' : '#ef5350', 'Entrada ' + t.n));
      if (!t.open) x.selLines.push(line(t.exitPrice, t.pnl >= 0 ? '#26a69a' : '#ef5350', 'Salida ' + t.n));
    }
    // Lleva el gráfico a una operación y marca su entrada y su salida con dos líneas de precio.
    function goTo(uid, k) {
      const x = st.get(uid);
      if (!x || !x.result || !x.result.strategy || !s.chart || !s.series) return false;
      const t = x.result.strategy.trades[k];
      if (!t) return false;
      const last = x.times.length - 1;
      const lo = t.entryIdx, hi = t.open ? last : t.exitIdx;
      const pad = Math.max(12, Math.round(Math.max(hi - lo, 4) * 0.8));
      s.chart.timeScale().setVisibleLogicalRange({ from: lo - pad, to: hi + pad });
      try { s.series.priceScale().applyOptions({ autoScale: true }); } catch (e) { /* ok */ }
      x.selTime = t.entryTime;
      markTrade(x, t);
      return true;
    }

    // ---------- Ejecución ----------
    function snapshot() {
      const b = s.bars, n = b.length;
      const d = { time: new Array(n), open: new Array(n), high: new Array(n), low: new Array(n), close: new Array(n), volume: new Array(n), buy: null };
      let hasBuy = n > 0;
      for (let i = 0; i < n; i++) {
        const c = b[i];
        d.time[i] = c.time; d.open[i] = c.open; d.high[i] = c.high; d.low[i] = c.low; d.close[i] = c.close; d.volume[i] = c.volume;
        if (c.buy === undefined || !isFinite(c.buy)) hasBuy = false;
      }
      if (hasBuy) d.buy = b.map((c) => c.buy);
      return d;
    }
    async function runOne(a, data, times) {
      const x = state(a.uid);
      const sc = lib().find((q) => q.id === a.scriptId);
      if (!sc) {
        clearDrawing(x);
        x.status = 'error'; x.result = null; x.name = 'Script borrado';
        x.error = { kind: 'missing', line: null, message: 'Este script ya no existe en la biblioteca. Quítalo del gráfico o créalo otra vez.' };
        return;
      }
      x.name = sc.name;
      if (a.hide) { clearDrawing(x); x.status = 'hidden'; x.error = null; return; }
      const n = data.close.length;
      if (!n) return;
      const last = n - 1;
      const sig = [sc.code.length, hash(sc.code), JSON.stringify(a.params || {}), n, data.time[0], data.time[last], data.open[last], data.high[last], data.low[last], data.close[last], data.volume[last], data.buy ? data.buy[last] : '-', vcfg.symbol, vcfg.tf, themeName()].join('|');
      if (sig === x.sig && x.chart === s.chart && (x.status === 'ok' || x.status === 'error')) return;
      x.status = 'running';
      const tf = tfNow();
      const r = await root.TVScriptRunner.run({
        code: sc.code, params: a.params || {}, data,
        meta: { name: sc.name, symbol: vcfg.symbol, timeframe: tf.label || String(tf.base || ''), tfSec: tf.sec || 0 },
      });
      if (destroyed || !s.chart) return;
      x.sig = sig;
      if (!r.ok) {
        clearDrawing(x);                       // nunca queda dibujado un resultado viejo o a medias
        x.status = 'error'; x.error = r.error; x.result = null;
        return;
      }
      x.status = 'ok'; x.error = null; x.result = r.result; x.isStrat = !!r.result.strategy;
      x.name = r.result.name || sc.name;
      draw(x, r.result, times);
    }
    function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return h; }
    async function pump() {
      if (busy) { dirty = true; return; }
      busy = true;
      try {
        do {
          dirty = false;
          if (destroyed || !s.chart || !s.series) break;
          // se limpian los scripts que ya no están aplicados
          const uids = new Set(applied().map((a) => a.uid));
          for (const [uid, x] of st) if (!uids.has(uid)) { clearDrawing(x); st.delete(uid); }
          const data = snapshot();
          for (const a of applied().slice()) {
            if (destroyed) break;
            await runOne(a, data, data.time);
          }
          try { renderOverlayLegend(); } catch (e) { /* ok */ }
          // el panel del capital puede tardar un instante en existir en pantalla: se reintenta el rótulo
          setTimeout(() => { if (!destroyed) { try { renderOverlayLegend(); } catch (e) { /* ok */ } } }, 80);
          changed();
        } while (dirty && !destroyed);
      } catch (e) {
        console.error('scripts:', e);
      } finally { busy = false; }
    }
    function update() {
      if (destroyed) return;
      clearTimeout(timer);
      timer = setTimeout(pump, 40);
    }
    // fuerza recalcular aunque nada haya cambiado (por ejemplo tras guardar el código)
    function refresh() { st.forEach((x) => { x.sig = null; }); update(); }

    // ---------- Rótulos ----------
    function valuesAt(x, param) {
      const res = x.result;
      if (!res || !x.vals || !x.vals.length) return [];
      let idx = x.vals[0].length - 1;
      if (param && param.time !== undefined && x.times) { const j = x.times.indexOf(param.time); if (j >= 0) idx = j; }
      return res.plots.map((p, i) => {
        const v = x.vals[i][idx];
        const col = p.colors && p.colors[idx] ? p.colors[idx] : p.color;
        return { color: col, t: v === v && v !== null ? fmtVal(v, res.precision !== null ? res.precision : (res.overlay ? undefined : 2)) : '—' };
      });
    }
    function title(a, x) {
      const ps = a.params || {};
      const inp = x.result ? x.result.inputs.filter((i) => !i.builtin && (i.type === 'number' || i.type === 'string')).map((i) => i.value) : [];
      return (x.name || 'Script') + (inp.length ? ' (' + inp.join(', ') + ')' : '');
    }
    function btns(a, onGear, onClose) {
      const box = el('span', 'pl-btns');
      const mk = (txt, tt, fn) => { const b = el('button', 'pl-btn', txt); b.title = tt; b.onmousedown = (e) => e.stopPropagation(); b.ondblclick = (e) => e.stopPropagation(); b.onclick = (e) => { e.stopPropagation(); s.lastLegendClick = Date.now(); fn(); }; box.appendChild(b); };
      mk('⚙', 'Parámetros del script', onGear);
      mk('✕', 'Quitar el script de este gráfico', onClose);
      return box;
    }
    const act = (a, action) => () => G.scriptAction && G.scriptAction(view, a.uid, action);
    // Rótulo dentro del panel propio del script (solo los que no van sobre el precio).
    function paneLegend(a, x, param) {
      if (!x.result || x.result.overlay || !x.series.length) return;
      let host2 = null;
      try { host2 = x.series[0].getPane().getHTMLElement(); } catch (e) { return; }
      if (!host2) return;
      if (!x.legendEl || x.legendEl.parentNode !== host2) {
        if (x.legendEl && x.legendEl.parentNode) x.legendEl.parentNode.removeChild(x.legendEl);
        x.legendEl = el('div', 'pane-legend');
        host2.style.position = 'relative';
        host2.appendChild(x.legendEl);
      }
      x.legendEl.innerHTML = '';
      const t = el('span', 'pl-text');
      t.appendChild(el('span', 'pl-title', title(a, x)));
      valuesAt(x, param).forEach((p) => { const sp = el('span', 'pl-val', p.t); sp.style.color = L.themedColor ? L.themedColor(p.color, themeName()) : p.color; t.appendChild(sp); });
      x.legendEl.append(t, btns(a, act(a, 'settings'), act(a, 'remove')));
    }
    // Rótulo del panel del capital (estrategias)
    function eqLegend(a, x, param) {
      if (!x.eqSer || !x.eq) return;
      let h = null;
      try { h = x.eqSer.getPane().getHTMLElement(); } catch (e) { return; }
      if (!h) return;
      if (!x.eqLegendEl || x.eqLegendEl.parentNode !== h) {
        if (x.eqLegendEl && x.eqLegendEl.parentNode) x.eqLegendEl.parentNode.removeChild(x.eqLegendEl);
        x.eqLegendEl = el('div', 'pane-legend');
        h.style.position = 'relative';
        h.appendChild(x.eqLegendEl);
      }
      let idx = x.eq.length - 1;
      if (param && param.time !== undefined && x.times) { const j = x.times.indexOf(param.time); if (j >= 0) idx = j; }
      const v = x.eq[idx];
      x.eqLegendEl.innerHTML = '';
      const t = el('span', 'pl-text');
      t.appendChild(el('span', 'pl-title', 'Capital · ' + (x.name || 'Estrategia')));
      const sp = el('span', 'pl-val', v === v && v !== null ? fmtVal(v, 2) : '—');
      sp.style.color = '#26a69a';
      t.appendChild(sp);
      x.eqLegendEl.append(t, btns(a, act(a, 'settings'), act(a, 'remove')));
    }
    function renderOverlayLegend() { legend(null, env.legendEl()); }
    // Se llama desde renderLegend: añade los scripts sobre el precio y los errores al rótulo principal.
    function legend(param, legendEl) {
      if (!legendEl) return;
      legendEl.querySelectorAll('.lg-scr').forEach((n) => n.parentNode.removeChild(n));
      applied().forEach((a) => {
        const x = st.get(a.uid);
        if (!x) return;
        if (x.status === 'error') {
          const row = el('div', 'lg-scr lg-err');
          row.appendChild(el('span', '', `Script «${x.name || '?'}»: ${x.error.line ? 'línea ' + x.error.line + ': ' : ''}${x.error.message}`));
          row.appendChild(btns(a, act(a, 'edit'), act(a, 'remove')));
          legendEl.appendChild(row);
          return;
        }
        if (x.status === 'hidden') return;
        if (x.status !== 'ok' || !x.result) return;
        const strat = x.result.strategy;
        if (x.result.overlay || strat) {
          const row = el('div', 'lg-scr lg-mas');
          row.appendChild(el('span', 'pl-title', title(a, x)));
          if (x.result.overlay) valuesAt(x, param).forEach((p) => { const sp = el('span', '', p.t); sp.style.color = L.themedColor ? L.themedColor(p.color, themeName()) : p.color; row.appendChild(sp); });
          if (strat) {
            const r = strat.report;
            const sp = el('span', '', `Estrategia: ${r.totalPct >= 0 ? '+' : ''}${r.totalPct.toFixed(2)}% · ${r.trades} operaciones${r.open ? ' + 1 abierta' : ''}`);
            sp.style.color = r.totalPct >= 0 ? '#26a69a' : '#ef5350';
            row.appendChild(sp);
          }
          row.appendChild(btns(a, act(a, 'settings'), act(a, 'remove')));
          legendEl.appendChild(row);
        }
        if (!x.result.overlay && x.series.length) paneLegend(a, x, param);
        if (strat) eqLegend(a, x, param);
      });
    }
    function info(uid) {
      const x = st.get(uid);
      if (!x) return { status: 'idle', error: null, inputs: [] };
      return { status: x.status, error: x.error, inputs: x.result ? x.result.inputs : [], name: x.name, ms: x.result ? x.result.ms : null, overlay: x.result ? x.result.overlay : null, isStrategy: !!x.isStrat, strategy: x.result && x.result.strategy ? x.result.strategy : null };
    }
    function destroy() {
      destroyed = true; clearTimeout(timer);
      st.forEach((x) => { if (x.legendEl && x.legendEl.parentNode) x.legendEl.parentNode.removeChild(x.legendEl); });
      st.clear();
    }
    return { update, refresh, legend, info, destroy, goTo };
  }

  root.TVScriptHost = { create };
})(window);

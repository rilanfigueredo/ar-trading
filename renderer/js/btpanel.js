// Panel fijo de abajo (v0.21): informe del backtest y lista de operaciones de la estrategia del gráfico activo.
// Al hacer clic en una operación, el gráfico va a ella. Solo muestra datos: el cálculo lo hace el Worker (scriptcore + backtest).
(function (root) {
  'use strict';
  let ctx = null;                   // { A, $, activeView, saveCfg }
  let sel = { uid: null, t: null }; // estrategia y operación elegidas (por hora de entrada; solo en memoria)
  let timer = null;
  const MAX_ROWS = 1500;

  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const bt = () => { const c = ctx.A.cfg; if (!c.bt) c.bt = { h: 260, tab: 'report', collapsed: false }; return c.bt; };
  const nf = (v, d) => v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d) => (v === null || v === undefined || !isFinite(v) ? '—' : nf(v, d === undefined ? 2 : d));
  const sgn = (v, d) => (v === null || v === undefined || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + nf(v, d === undefined ? 2 : d));
  const pct = (v) => (v === null || v === undefined || !isFinite(v) ? '—' : sgn(v, 2) + ' %');
  const price = (v) => num(v, v >= 100 ? 2 : v >= 1 ? 4 : 6);
  const when = (t) => new Date(t * 1000).toLocaleString('es', { timeZone: ctx.A.cfg.tz === 'UTC' ? 'UTC' : undefined, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

  function init(c) { ctx = c; }

  // Estrategias del gráfico activo (las que ya dieron resultado o tienen error siendo estrategia)
  function listOf(view) {
    const out = [];
    (view.cfg.scripts || []).forEach((a) => {
      const inf = view.scriptInfo ? view.scriptInfo(a.uid) : null;
      if (inf && inf.isStrategy) out.push({ a, inf });
    });
    return out;
  }
  function onStatus(view) {
    if (!ctx || view !== ctx.activeView()) return;
    schedule();
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(render, 120); }

  function show(uid) {
    const b = bt(); b.collapsed = false; b.tab = b.tab || 'report';
    if (uid) { sel.uid = uid; sel.t = null; }
    ctx.saveCfg(); render();
  }

  function render() {
    if (!ctx) return;
    const box = ctx.$('btPanel');
    if (!box) return;
    const view = ctx.activeView();
    const list = view ? listOf(view) : [];
    const keep = box.querySelector('.bt-scroll');
    const scrollTop = keep ? keep.scrollTop : 0;
    if (!list.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    let cur = list.find((q) => q.a.uid === sel.uid);
    if (!cur) { cur = list[0]; sel = { uid: cur.a.uid, t: null }; }
    const b = bt();
    box.style.height = b.collapsed ? '' : b.h + 'px';
    box.classList.toggle('collapsed', !!b.collapsed);
    box.innerHTML = '';

    // borde para cambiar la altura
    const grip = mk('div', 'bt-grip'); grip.title = 'Arrastra para cambiar la altura';
    grip.onmousedown = (e) => {
      e.preventDefault();
      const y0 = e.clientY, h0 = box.offsetHeight;
      const mv = (ev) => { b.h = Math.max(120, Math.min(Math.round(window.innerHeight * 0.7), h0 + (y0 - ev.clientY))); box.style.height = b.h + 'px'; };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); ctx.saveCfg(); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    };
    box.appendChild(grip);

    // cabecera
    const head = mk('div', 'bt-head');
    if (list.length > 1) {
      const s = mk('select', 'bt-sel');
      list.forEach((q) => { const o = mk('option', '', q.inf.name || 'Estrategia'); o.value = q.a.uid; s.appendChild(o); });
      s.value = cur.a.uid;
      s.onchange = () => { sel = { uid: s.value, t: null }; render(); };
      head.appendChild(s);
    } else head.appendChild(mk('b', 'bt-title', 'Estrategia: ' + (cur.inf.name || '')));
    const st = cur.inf.strategy;
    [['report', 'Informe'], ['trades', 'Operaciones' + (st ? ' (' + st.trades.length + ')' : '')]].forEach(([id, t]) => {
      const tb = mk('button', 'bt-tab' + (b.tab === id ? ' on' : ''), t);
      tb.onclick = () => { b.tab = id; b.collapsed = false; ctx.saveCfg(); render(); };
      head.appendChild(tb);
    });
    head.appendChild(mk('span', 'bt-fill'));
    const edit = mk('button', 'bt-btn', 'Parámetros'); edit.title = 'Abrir el script y sus parámetros (capital, tamaño, comisión, deslizamiento…)';
    edit.onclick = () => { if (ctx.openScript) ctx.openScript(cur.a); };
    const col = mk('button', 'bt-btn', b.collapsed ? '▲' : '▼'); col.title = b.collapsed ? 'Mostrar el panel' : 'Minimizar el panel';
    col.onclick = () => { b.collapsed = !b.collapsed; ctx.saveCfg(); render(); };
    head.append(edit, col);
    box.appendChild(head);
    if (b.collapsed) return;

    const body = mk('div', 'bt-scroll');
    box.appendChild(body);
    if (cur.inf.status === 'error') {
      const e = mk('div', 'bt-err', 'La estrategia tiene un error: ' + (cur.inf.error.line ? 'línea ' + cur.inf.error.line + ': ' : '') + cur.inf.error.message);
      body.appendChild(e);
    } else if (!st) {
      body.appendChild(mk('div', 'bt-note', cur.inf.status === 'hidden' ? 'La estrategia está oculta en este gráfico.' : 'Calculando…'));
    } else if (b.tab === 'trades') renderTrades(body, view, cur, st);
    else renderReport(body, st);
    body.scrollTop = scrollTop;
  }

  function card(label, value, sub, c) {
    const d = mk('div', 'bt-card');
    d.appendChild(mk('div', 'bt-lbl', label));
    d.appendChild(mk('div', 'bt-val ' + (c || ''), value));
    if (sub) d.appendChild(mk('div', 'bt-sub', sub));
    return d;
  }

  function renderReport(body, st) {
    const r = st.report, s = st.settings;
    const sizeText = s.sizeType === 'percent' ? `${nf(s.size, 2)} % del capital por operación` : (s.sizeType === 'amount' ? `monto fijo de ${nf(s.size, 2)} por operación` : `${nf(s.size, 4)} contratos (unidades del activo) por operación`);
    const grid = mk('div', 'bt-grid');
    grid.append(
      card('Capital final', num(r.capitalEnd), `inicial ${num(r.capital)} · ${pct(r.totalPct)}`, cls(r.totalPct)),
      card('Resultado de operaciones cerradas', sgn(r.netClosed), pct(r.netClosedPct), cls(r.netClosed)),
      card('Comprar y mantener', pct(r.buyHold), 'desde el cierre de la primera vela', cls(r.buyHold)),
      card('Operaciones cerradas', String(r.trades), `${r.wins} ganadoras · ${r.losses} perdedoras`),
      card('% de acierto', r.winRate === null ? '—' : nf(r.winRate, 1) + ' %'),
      card('Factor de beneficio', r.profitFactor !== null ? nf(r.profitFactor, 2) : (r.noLosses ? '∞' : '—'), r.noLosses ? 'no hubo pérdidas' : 'ganancia bruta / pérdida bruta'),
      card('Ganancia media', sgn(r.avgWin), '', cls(r.avgWin)),
      card('Pérdida media', sgn(r.avgLoss), '', cls(r.avgLoss)),
      card('Esperanza por operación', sgn(r.expectancy), 'resultado medio', cls(r.expectancy)),
      card('Mejor operación', sgn(r.best), '', cls(r.best)),
      card('Peor operación', sgn(r.worst), '', cls(r.worst)),
      card('Caída máxima del capital', num(r.maxDD), nf(r.maxDDPct, 2) + ' % desde el máximo', r.maxDD > 0 ? 'neg' : ''),
      card('Comisiones pagadas', num(r.fees), `taker ${nf(s.commission, 2)} % · maker ${nf(s.makerCommission, 2)} %`),
      card('Duración media', r.avgBars === null ? '—' : nf(r.avgBars, 1) + ' velas'),
      card('Tiempo en el mercado', nf(r.exposure, 1) + ' %'),
      card('Largas', String(r.long.n), `neto ${sgn(r.long.net)}`, cls(r.long.net)),
      card('Cortas', String(r.short.n), `neto ${sgn(r.short.net)}`, cls(r.short.net)),
    );
    body.appendChild(grid);

    const notes = mk('div', 'bt-notes');
    const note = (t, c) => notes.appendChild(mk('div', 'bt-note ' + (c || ''), t));
    if (r.open) note(`Hay una posición ${r.open.side === 'long' ? 'larga' : 'corta'} abierta: resultado sin cerrar ${sgn(r.open.pnl)} (ya incluido en el capital final, no en las operaciones cerradas).`);
    if (r.pending) note(`Orden pendiente para la próxima vela: ${r.pending}. Si la última vela aún no cerró, puede cambiar.`);
    if (r.busted) note('El capital se agotó: la estrategia dejó de operar.', 'warn');
    if (r.reduced) note(`${r.reduced} orden(es) pedían más que el capital disponible y se redujeron al capital (sin apalancamiento).`, 'warn');
    if (s.sizeClamped) note('El tamaño en % del capital pasaba de 100 y se limitó a 100.', 'warn');
    if (r.rejected) note(`${r.rejected} orden(es) rechazada(s). Primera causa: ${r.rejectedWhy}`, 'warn');
    if (r.ambiguous) note(`${r.ambiguous} vela(s) tocaron el stop y el objetivo a la vez; no se puede saber cuál fue primero y se asumió el stop (lo más desfavorable).`);
    if (!r.trades && !r.open) note('La estrategia no hizo ninguna operación con estas velas y parámetros.');
    const la = st.lookahead;
    note(la && la.checked ? `Control de datos del futuro: pasó (${la.cuts} comprobaciones: las órdenes no cambian al quitar las últimas velas). Reduce el riesgo pero no es una garantía absoluta.` : 'Control de datos del futuro: no se pudo hacer (' + (la ? la.why : '—') + ').', la && la.checked ? 'ok' : 'warn');
    const det = mk('details', 'bt-rules');
    det.appendChild(mk('summary', '', 'Reglas de la simulación'));
    det.appendChild(mk('div', 'bt-note', `Cada orden se da al cerrar una vela y se ejecuta en la apertura de la siguiente. Compra al abrir: precio × (1 + deslizamiento); venta: × (1 − deslizamiento) (${nf(s.slippage, 2)} %). Comisión por lado: las órdenes de mercado (entradas, cierres por señal y stops) pagan la tasa taker (${nf(s.commission, 2)} %) y el objetivo, que es una orden límite, la maker (${nf(s.makerCommission, 2)} %); los valores por defecto son los de Binance Futuros USDT y conviene verificarlos en tu cuenta. Stop loss: orden de mercado con deslizamiento (si la vela abre más allá, se sale a la apertura). Objetivo: orden límite sin deslizamiento. Tamaño: ${sizeText}, sin apalancamiento, una posición a la vez. No incluye financiación, comisiones de retiro ni falta de liquidez: es una simulación, el mercado real puede dar peores resultados.`));
    notes.appendChild(det);
    body.appendChild(notes);
  }

  function renderTrades(body, view, cur, st) {
    if (!st.trades.length) { body.appendChild(mk('div', 'bt-note', 'Todavía no hay operaciones.')); return; }
    const first = Math.max(0, st.trades.length - MAX_ROWS);
    if (first) body.appendChild(mk('div', 'bt-note', `Mostrando las últimas ${MAX_ROWS} de ${st.trades.length} operaciones.`));
    const tbl = mk('table', 'bt-table');
    const hr = mk('tr');
    ['#', 'Lado', 'Entrada', 'Precio entrada', 'Salida', 'Precio salida', 'Motivo', 'Velas', 'Resultado', '%'].forEach((t, j) => hr.appendChild(mk('th', j === 3 || j >= 5 && j !== 6 ? 'r' : '', t)));
    const th = mk('thead'); th.appendChild(hr); tbl.appendChild(th);
    const tb = mk('tbody');
    const rows = [];
    for (let k = first; k < st.trades.length; k++) {
      const t = st.trades[k];
      const tr = mk('tr', 'bt-row ' + cls(t.pnl) + (sel.t === t.entryTime ? ' sel' : '') + (t.open ? ' open' : ''));
      const cells = [String(t.n), t.side === 'long' ? 'Largo' : 'Corto', when(t.entryTime), price(t.entryPrice), t.open ? 'abierta' : when(t.exitTime), t.open ? price(t.exitPrice) + ' (actual)' : price(t.exitPrice), t.reason, String(t.bars), sgn(t.pnl), pct(t.pnlPct)];
      cells.forEach((c, j) => { const td = mk('td', j >= 8 ? 'r ' + cls(t.pnl) : (j === 3 || j === 5 || j === 7 ? 'r' : ''), c); tr.appendChild(td); });
      tr.title = 'Clic: ir a esta operación en el gráfico';
      tr.onclick = () => {
        sel.t = t.entryTime;
        rows.forEach((r2, idx) => r2.classList.toggle('sel', idx + first === k));
        if (view.scriptGoTo) view.scriptGoTo(cur.a.uid, k);
      };
      rows.push(tr); tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    body.appendChild(tbl);
  }

  root.TVBt = { init, onStatus, render, show };
})(window);

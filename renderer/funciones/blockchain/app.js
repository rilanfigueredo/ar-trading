'use strict';
// Interfaz delgada: solo pinta lo que entrega el controlador (src/monitor.js) y envía acciones.
(function () {
  const C = window.BtcChain;
  const G = window.BtcCharts;
  // Puente con el módulo del programa (canales «blockchain:…»). Nunca lanza: si falla, devuelve un resultado de error.
  const llamar = async (canal, ...args) => { const r = await window.Fn.invocar('blockchain:' + canal, ...args); return r.ok ? r.datos : { ok: false, error: r.error }; };
  let escuchas = [], ultimoEnvio = 0;
  const api = {
    refresh: () => llamar('actualizar'),
    getCached: () => llamar('estado'),
    range: (d, h) => llamar('rango', d, h),
    getSettings: () => llamar('ajustes'),
    setSettings: (p) => llamar('ajustar', p),
    testNotify: () => llamar('probar'),
    onUpdate: (cb) => { escuchas.push(cb); },
  };
  // El módulo consulta solo; aquí se pide lo último que sabe cada 5 s (y al volver a mostrar la pestaña) y se pinta si cambió.
  async function traerEstado() {
    const v = await llamar('estado');
    if (!v || v.cargando) return;
    const marca = (v.fetchedAtMs || v.failedAtMs || 0) + ':' + (v.ok ? 1 : 0);
    if (marca === ultimoEnvio) return;
    ultimoEnvio = marca; escuchas.forEach((f) => f(v));
  }
  setInterval(() => { if (window.Fn.visible) traerEstado(); }, 5000);
  window.Fn.alVisible((v) => { if (v) traerEstado(); });
  const $ = (id) => document.getElementById(id);
  let view = null;        // último modelo recibido
  let lastGood = null;    // últimos datos buenos
  let showAllEpochs = false;
  let selectedEra = null; // era abierta en el dashboard
  let showDiffInfo = false;

  const COLOR = { icono: '#f7931a', verde: '#7be495', naranja: '#c2570c', purpura: '#bf29ff', up: '#3ccf91', down: '#ff6b6b' };

  const nf = (n, d) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('es', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }));
  const pct = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + nf(n, 2) + ' %');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = (ms) => (ms == null ? '—' : new Date(ms).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }));
  const dtS = (sec) => dt(sec * 1000);
  const dShort = (sec) => (sec == null ? '—' : new Date(sec * 1000).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }));
  const ago = (ms) => C.formatDuration((Date.now() - ms) / 1000);
  const cls = (n) => (n == null ? '' : n >= 0 ? 'up' : 'down');
  // Menos de 600 s = bloques más rápidos (verde); más lentos = rojo.
  const speedCls = (s) => (s == null ? '' : s <= 600 ? 'up' : 'down');
  // Dificultad: T = tera (10^12), G = giga (10^9), M = mega (10^6). Sin unidad en las eras antiguas.
  function diffFmt(d) {
    if (d == null) return '—';
    if (d >= 1e12) return nf(d / 1e12, 2) + ' T';
    if (d >= 1e9) return nf(d / 1e9, 2) + ' G';
    if (d >= 1e6) return nf(d / 1e6, 2) + ' M';
    return nf(d, d >= 1000 ? 0 : 2);
  }
  function hashrateFmt(h) {
    const u = [[1e21, 'ZH/s'], [1e18, 'EH/s'], [1e15, 'PH/s'], [1e12, 'TH/s'], [1e9, 'GH/s']];
    for (const [v, n] of u) if (h >= v) return nf(h / v, 2) + ' ' + n;
    return nf(h, 0) + ' H/s';
  }
  function sci(n) {
    const e = Math.floor(Math.log10(n));
    return nf(n / Math.pow(10, e), 2) + ' × 10<sup>' + e + '</sup>';
  }
  const usd = (p) => (p && p.price != null ? nf(p.price, 2) + ' USD' : '—');
  const priceSub = (p, down) => (p == null ? (down ? 'Bitstamp no respondió (ver el aviso de arriba)' : 'sin dato') : p.price == null ? p.reason : 'Bitstamp BTC/USD · apertura de ese ' + p.precision);
  const bar = (percent, kind) => '<div class="bar"><div class="' + kind + '" style="width:' + Math.max(0, Math.min(100, percent)).toFixed(1) + '%"></div></div>';

  // ---------- Resumen ----------
  function diffInfoHtml(d) {
    const i = C.difficultyInfo(d);
    return '<div class="info-panel" id="diffInfo"><p><b>¿Qué es la dificultad y qué significa «T»?</b></p>' +
      '<p>La dificultad <b>no tiene unidad física</b>: es un número que dice cuántas veces es más difícil minar un bloque hoy que en el primer bloque de Bitcoin (que tenía dificultad 1).</p>' +
      '<p>«<b>T</b>» significa <b>tera</b>: un billón (1.000.000.000.000 = 10<sup>12</sup>). Así, <b>' + diffFmt(d) + '</b> son ' + nf(d / 1e12, 2) + ' billones. En las eras antiguas verá «G» (giga, mil millones) y «M» (mega, un millón).</p>' +
      (i ? '<p>Para dimensionarlo: en promedio hay que probar unos <b>' + sci(i.hashesPerBlock) + '</b> intentos (hashes) por cada bloque. Si los bloques salieran justo cada 10 min, eso equivale a una potencia de red de unos <b>' + hashrateFmt(i.impliedHashrate) + '</b>.</p>' : '') +
      '<p class="muted">La potencia es una estimación (dificultad × 2<sup>32</sup> ÷ 600 s); la real depende de la velocidad real de los bloques.</p></div>';
  }

  function priceBlock(v) {
    const p = v.prices;
    if (!p || !p.source) return '';
    const a = p.epochStart, n = p.now, prev = p.epochPrevStart;
    const ch = C.priceChangePercent(a && a.price, n && n.price);
    const nowSub = n ? 'Bitstamp BTC/USD · ' + dt((n.ts ? n.ts * 1000 : n.fetchedAtMs)) + (n.stale ? ' · dato guardado' : '') : priceSub(null, p.down);
    const prevCh = C.priceChangePercent(prev && prev.price, a && a.price);
    return '<div class="row" style="margin-top:14px"><div><div class="muted">Precio al empezar este período</div><div class="mid">' + usd(a) + '</div><div class="muted sm">' + priceSub(a, p.down) + '</div></div>' +
      '<div><div class="muted">Precio actual (el período sigue en curso)</div><div class="mid">' + usd(n) + '</div><div class="muted sm">' + nowSub + '</div></div>' +
      '<div><div class="muted">Variación en el período</div><div class="mid ' + cls(ch) + '">' + pct(ch) + '</div></div></div>' +
      (prev && prev.price != null && a && a.price != null ? '<div class="muted">Período anterior (ya cerrado): empezó en <b>' + usd(prev) + '</b> y terminó en <b>' + usd(a) + '</b> (' + pct(prevCh) + ').</div>' : '');
  }

  function renderResumen(v) {
    const e = v.epoch, h = v.halving;
    const etaTxt = (ms) => (ms == null ? '—' : ms < Date.now() ? dt(ms) + ' (estimación vencida: son datos guardados)' : dt(ms) + ' (en ' + C.formatDuration((ms - Date.now()) / 1000) + ')');
    const rows = v.recent.map((b) => '<tr><td>' + nf(b.height) + '</td><td>' + dtS(b.timestamp) + '</td><td class="' + speedCls(b.secondsSincePrev) + '">' +
      (b.secondsSincePrev == null ? '—' : C.formatDuration(b.secondsSincePrev)) + '</td></tr>').join('');
    $('tab-resumen').innerHTML =
      '<div class="grid">' +
      '<div class="card"><h2>Bloque actual</h2><div class="big">' + nf(v.tip.height) + '</div>' +
        '<div class="muted">Minado el ' + dtS(v.tip.timestamp) + ' · hace <span data-live="tip">' + ago(v.tip.timestamp * 1000) + '</span></div></div>' +
      '<div class="card"><h2>Dificultad actual <button class="info-btn" id="btnDiffInfo" title="¿Qué significa «T»?">i</button></h2><div class="big">' + diffFmt(v.difficulty) + '</div>' +
        '<div class="muted">Período que empezó en el bloque ' + nf(e.startHeight) + '</div>' + (showDiffInfo ? diffInfoHtml(v.difficulty) : '') + '</div>' +
      '</div>' +
      '<div class="card"><h2>Próximo ajuste de dificultad</h2>' +
        '<div class="row"><div><div class="muted">Cambio estimado</div><div class="mid ' + cls(e.estimatedChange) + '">' + pct(e.estimatedChange) + '</div></div>' +
        '<div><div class="muted">Promedio por bloque en este período</div><div class="mid ' + speedCls(e.avgSeconds) + '">' + (e.avgSeconds == null ? '—' : nf(e.avgSeconds, 1) + ' s') + '</div><div class="muted">objetivo: 600 s</div></div>' +
        '<div><div class="muted">Bloques restantes</div><div class="mid">' + nf(e.blocksRemaining) + '</div><div class="muted">ajuste en el bloque ' + nf(e.nextRetargetHeight) + '</div></div></div>' +
        '<div class="progress">' + bar(e.percent, 'f-icono') +
        '<div class="bar-labels"><span>' + nf(e.blocksInto) + ' bloques</span><span><b>' + nf(e.percent, 1) + ' %</b> del período</span><span>' + nf(2016) + '</span></div></div>' +
        priceBlock(v) +
        '<div style="margin-top:10px">Fecha estimada con el ritmo de este período: <b>' + etaTxt(e.etaMs) + '</b></div>' +
        '<div class="muted">Si cada bloque tardara justo 10 min: ' + etaTxt(e.etaTargetMs) + '</div>' +
        '<div class="note">La fecha y el cambio son estimaciones: se mueven con cada bloque. El ajuste real lo fija la hora de los bloques.</div></div>' +
      '<div class="card c-purpura"><h2>Próximo halving</h2><div class="row"><div><div class="muted">Bloque</div><div class="mid">' + nf(h.height) + '</div></div>' +
        '<div><div class="muted">Faltan</div><div class="mid">' + nf(h.blocksRemaining) + ' bloques</div></div>' +
        '<div><div class="muted">Recompensa nueva</div><div class="mid">' + nf(h.newSubsidy, 4) + ' BTC</div></div></div>' +
        '<div class="progress">' + bar(h.percent, 'f-purpura') +
        '<div class="bar-labels"><span>' + nf(h.blocksInto) + ' bloques</span><span><b>' + nf(h.percent, 1) + ' %</b> de la era</span><span>' + nf(210000) + '</span></div></div>' +
        '<div style="margin-top:10px">Fecha estimada (ritmo de la era actual): <b>' + (h.etaMs ? dt(h.etaMs) : '—') + '</b></div>' +
        '<div class="muted">Con 10 min por bloque: ' + dt(h.etaTargetMs) + '</div></div>' +
      '<div class="card roomy"><h2>Últimos bloques</h2><div class="tbl roomy"><table><thead><tr><th>Bloque</th><th>Hora (local)</th><th>Tiempo desde el anterior</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    $('btnDiffInfo').onclick = () => { showDiffInfo = !showDiffInfo; renderResumen(v); };
  }

  // ---------- Períodos ----------
  function renderPeriodos(v) {
    if (!v.epochs.length) { $('periodos-box').innerHTML = '<div class="card">Aún no hay historial de períodos (la fuente no lo entregó). Ver el mensaje de arriba.</div>'; return; }
    const list = showAllEpochs ? v.epochs : v.epochs.slice(0, 20);
    const rows = list.map((r) => '<tr class="' + (r.inProgress ? 'live' : '') + '"><td>' + nf(r.startHeight) + ' → ' + nf(r.endHeight) + (r.inProgress ? ' (en curso)' : '') + '</td><td>' + dtS(r.startTimestamp) +
      '</td><td>' + diffFmt(r.difficulty) + '</td><td class="' + cls(r.changeFromPrev) + '">' + pct(r.changeFromPrev) + '</td><td class="' + speedCls(r.avgSeconds) + '">' +
      (r.avgSeconds == null ? '—' : nf(r.avgSeconds, 1) + ' s') + '</td></tr>').join('');
    $('periodos-box').innerHTML = '<div class="card"><h2>Velocidad promedio por período de dificultad</h2><div class="tbl"><table><thead><tr><th>Bloques</th><th>Inicio</th><th>Dificultad</th><th>Cambio aplicado</th><th>Promedio por bloque</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="row center"><span class="muted">Mostrando ' + list.length + ' de ' + v.epochs.length + ' períodos entregados por la fuente.</span>' +
      (v.epochs.length > 20 ? '<button id="btnAll" class="btn">' + (showAllEpochs ? 'Ver solo los 20 más recientes' : 'Ver todos') + '</button>' : '') + '</div>' +
      '<div class="note" style="text-align:center">Verde = bloques más rápidos que 10 min (la dificultad subirá); rojo = más lentos. El promedio va del primer bloque de un período al primer bloque del siguiente.</div></div>';
    const b = $('btnAll'); if (b) b.onclick = () => { showAllEpochs = !showAllEpochs; renderPeriodos(v); };
  }

  // ---------- Eras ----------
  function kpi(color, title, big, sub, bigCls) {
    return '<div class="card ' + color + '"><h2>' + title + '</h2><div class="mid ' + (bigCls || '') + '">' + big + '</div><div class="muted sm">' + (sub || '') + '</div></div>';
  }

  function eraDashboard(v, eraRow) {
    const r = C.eraReport(eraRow, v.epochs);
    const name = 'Era ' + (r.era + 1);
    const yrs = (n) => (n == null ? '—' : nf(n, 2) + ' años');
    const tick = (x) => new Date(x * 1000).toLocaleDateString('es', { month: 'short', year: 'numeric' });
    const speed = G.lineChart({
      series: [{ name: 'Promedio por bloque', color: COLOR.icono, points: r.speedSeries.map((p) => ({ x: p.x, y: p.y, label: 'Período desde el bloque ' + nf(p.startHeight) + ' (' + dShort(p.x) + '): ' + nf(p.y, 1) + ' s por bloque' + (p.inProgress ? ' (en curso)' : '') })) }],
      refLines: [{ y: 600, label: 'Objetivo 600 s', color: COLOR.purpura }], xFormat: tick, yFormat: (y) => nf(y, 0) + ' s', emptyText: 'La fuente no entregó períodos de esta era',
    });
    const change = G.barChart({
      bars: r.changeSeries.map((p) => ({ label: tick(p.x), y: p.y, tip: 'Período desde el bloque ' + nf(p.startHeight) + ' (' + dShort(p.x) + '): ' + pct(p.y) })),
      yFormat: (y) => nf(y, 0) + ' %', emptyText: 'La fuente no entregó períodos de esta era',
    });
    const diff = G.lineChart({
      series: [{ name: 'Dificultad', color: COLOR.verde, points: r.difficultySeries.map((p) => ({ x: p.x, y: p.y, label: 'Desde el bloque ' + nf(p.startHeight) + ' (' + dShort(p.x) + '): ' + diffFmt(p.y) })) }],
      xFormat: tick, yFormat: diffFmt, area: true, emptyText: 'La fuente no entregó períodos de esta era',
    });
    const pr = v.prices && v.prices.eras ? v.prices.eras[r.era] : null;
    const pDown = !!(v.prices && v.prices.down);
    const pStart = pr ? pr.start : null;
    const pNow = v.prices && v.prices.now ? v.prices.now : null;
    const pEnd = r.inProgress ? (pNow ? { price: pNow.price } : null) : (pr ? pr.end : null);
    const pCh = C.priceChangePercent(pStart && pStart.price, pEnd && pEnd.price);
    const endSub = (r.inProgress ? (pNow ? 'Bitstamp BTC/USD · último precio' + (pNow.stale ? ' (dato guardado)' : '') : priceSub(null, pDown)) : priceSub(pEnd, pDown)) +
      (pCh == null ? '' : ' · ' + pct(pCh) + ' frente al inicio');
    const cards =
      kpi('c-icono', 'Promedio por bloque', r.avgSeconds == null ? '—' : nf(r.avgSeconds, 1) + ' s', r.deviationPercent == null ? 'sin datos' : pct(r.deviationPercent) + ' frente a 600 s', speedCls(r.avgSeconds)) +
      kpi('c-verde', 'Duración' + (r.inProgress ? ' hasta hoy' : ''), C.formatDHMS(r.durationSeconds), r.expectedSeconds == null ? '' : 'ritmo ideal de 10 min: ' + C.formatDHMS(r.expectedSeconds) + ' (' + yrs(r.durationYears) + ' reales)', 'fit') +
      kpi('c-purpura', 'Bloques', nf(r.blocks) + ' / ' + nf(210000), r.percentDone == null ? '' : nf(r.percentDone, 1) + ' % de la era' + (r.inProgress ? ' · en curso' : ' · completa')) +
      kpi('c-icono', 'Precio de inicio', usd(pStart), priceSub(pStart, pDown)) +
      kpi('c-purpura', r.inProgress ? 'Precio actual (final provisional)' : 'Precio final', usd(pEnd), endSub) +
      kpi('c-verde', 'Período más rápido', r.fastest ? nf(r.fastest.avgSeconds, 1) + ' s' : '—', r.fastest ? 'desde el bloque ' + nf(r.fastest.startHeight) : '', 'up') +
      kpi('c-naranja', 'Período más lento', r.slowest ? nf(r.slowest.avgSeconds, 1) + ' s' : '—', r.slowest ? 'desde el bloque ' + nf(r.slowest.startHeight) : '', 'down') +
      kpi('c-purpura', 'Dificultad en la era', r.growthFactor == null ? '—' : '× ' + nf(r.growthFactor, 2), r.difficultyStart == null ? 'sin datos' : diffFmt(r.difficultyStart) + ' → ' + diffFmt(r.difficultyEnd)) +
      kpi('c-icono', 'Recompensa por bloque', nf(r.subsidy, 4) + ' BTC', 'períodos de ajuste en la era: ' + nf(r.periods)) +
      '<div class="card c-naranja"><h2>Fechas</h2><div class="datelines"><div><span class="dl">Inicio</span><span class="dv">' + (r.startTimestamp == null ? '—' : dtS(r.startTimestamp)) + '</span></div>' +
        '<div><span class="dl">Fin</span><span class="dv">' + (r.inProgress ? 'En curso · ' + dtS(v.tip.timestamp) : dtS(r.endTimestamp)) + '</span></div></div></div>';
    return '<div class="era-head"><h3>' + name + ' · bloques ' + nf(r.startHeight) + ' → ' + nf(r.endHeight) + '</h3><button class="btn small" id="btnCloseEra">Cerrar informe</button></div>' +
      (r.inProgress ? '<div class="card c-purpura" style="padding:12px 20px"><div class="bar-labels" style="margin:0 0 6px"><span>Avance de la era</span><span><b>' + nf(r.percentDone, 1) + ' %</b></span></div>' + bar(r.percentDone, 'f-purpura') + '</div>' : '') +
      '<div class="grid kpi">' + cards + '</div>' +
      '<div class="card chart-card"><h2>Velocidad promedio por bloque durante la era (un punto por período de dificultad)</h2><div class="chart">' + speed + '</div>' +
        '<div class="note">Por debajo de la línea de 600 s los bloques salen más rápido que lo ideal y la dificultad sube; por encima, sale más lento y baja.</div></div>' +
      '<div class="grid"><div class="card c-naranja chart-card"><h2>Cambio de dificultad en cada ajuste</h2><div class="chart">' + change + '</div></div>' +
      '<div class="card c-verde chart-card"><h2>Evolución de la dificultad</h2><div class="chart">' + diff + '</div></div></div>' +
      '<div class="note">Cada período de ajuste se asigna a la era donde empieza; los bordes de la era no coinciden exactamente con los de un período. Pase el mouse sobre un punto o barra para ver su valor.</div>';
  }

  function renderEras(v) {
    const rows = v.eras.map((r) => '<tr data-era="' + r.era + '" class="' + (r.inProgress ? 'live ' : '') + (selectedEra === r.era ? 'sel' : '') + '"><td>Era ' + (r.era + 1) + (r.inProgress ? ' (en curso)' : '') + '</td><td>' + nf(r.startHeight) + ' → ' + nf(r.endHeight) + '</td><td>' +
      nf(r.subsidy, 4) + ' BTC</td><td>' + (r.startTimestamp == null ? '—' : dtS(r.startTimestamp)) + '</td><td class="' + speedCls(r.avgSeconds) + '">' +
      (r.avgSeconds == null ? '—' : nf(r.avgSeconds, 1) + ' s') + '</td><td>' + (r.avgSeconds == null ? '—' : C.formatDuration(r.avgSeconds)) + '</td></tr>').join('');
    const row = selectedEra == null ? null : v.eras.find((r) => r.era === selectedEra);
    $('tab-eras').innerHTML = '<div class="card"><h2>Velocidad promedio por era · haga clic en una era para ver su informe</h2><div class="tbl"><table class="click"><thead><tr><th>Era</th><th>Bloques</th><th>Recompensa</th><th>Inicio</th><th>Promedio (s)</th><th>Promedio</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="note" style="text-align:center">Cada era dura 210.000 bloques y termina en un halving. El promedio de la era en curso llega hasta el bloque actual. «—» = la fuente no entregó esa marca de tiempo.</div></div>' +
      (row ? '<div id="eraDetail">' + eraDashboard(v, row) + '</div>' : '');
    document.querySelectorAll('#tab-eras tr[data-era]').forEach((tr) => {
      tr.onclick = () => { selectedEra = Number(tr.dataset.era); renderEras(v); const d = $('eraDetail'); if (d && d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    });
    const c = $('btnCloseEra'); if (c) c.onclick = () => { selectedEra = null; renderEras(v); };
  }

  // ---------- Banners y estado ----------
  function renderBanners(v) {
    const out = [];
    if (v && v.warning) out.push('<div class="b-warn">' + esc(v.warning) + '</div>');
    if (v && v.cached) out.push('<div class="b-warn"><b>Mostrando datos guardados</b> de hace <span data-live="stale">' + ago(v.fetchedAtMs) + '</span> mientras se conecta con ' + esc(v.source) + '…' + (v.rebuilt ? ' (reconstruidos con el historial guardado; la dificultad actual aparece al conectar)' : '') + '</div>');
    if (v && !v.ok) {
      out.push('<div class="b-err"><b>No se pudieron actualizar los datos.</b> ' + esc(v.error) + (/sin respuesta/.test(v.error) ? ' Pruebe abrir https://mempool.space en su navegador: si tampoco carga o tarda mucho, el problema es su internet o su proveedor, no el programa.' : '') + (lastGood ? ' Se muestran los datos guardados (de hace <span data-live="stale">' + ago(lastGood.fetchedAtMs) + '</span>). Se reintenta solo cada ' + ((v.settings && v.settings.pollSeconds) || 30) + ' s.' : ' Se reintenta solo cada ' + ((v.settings && v.settings.pollSeconds) || 30) + ' s.') + '</div>');
    } else if (v && v.errors && v.errors.length) {
      out.push('<div class="b-warn"><b>Parte de los datos no llegó:</b><br>' + v.errors.map((x) => esc(x.section) + ': ' + esc(x.message)).join('<br>') + '</div>');
    }
    $('banners').innerHTML = out.join('');
  }

  function renderStatus(v) {
    const ok = v && v.ok;
    $('dot').className = 'dot ' + (v ? (ok ? 'ok' : 'bad') : '');
    $('statusText').textContent = !v ? 'Conectando…' : v.cached ? 'Datos guardados · conectando…' : ok ? 'Fuente: ' + v.source + ' · actualizado hace ' + ago(v.fetchedAtMs) : 'Sin conexión con ' + v.source + (lastGood ? ' · datos guardados' : '');
    $('foot').textContent = (v && v.ok ? 'Datos públicos de ' + v.baseUrl + '. ' : '') + 'Horas en la zona horaria de su equipo. Herramienta de cálculo: no emite señales de compra o venta.';
  }

  function render(v) {
    view = v;
    renderBanners(v);
    renderStatus(v);
    if (v.ok) lastGood = v;
    else if (!lastGood && v.stale) lastGood = v.stale;
    const data = v.ok ? v : lastGood;
    if (data) { renderResumen(data); renderPeriodos(data); renderEras(data); }
    else $('tab-resumen').innerHTML = '<div class="card">Aún no hay datos guardados en este equipo. Con una sola conexión exitosa se guardan, y desde entonces el programa abre al instante, incluso sin internet. Revise el mensaje de arriba.</div>';
    if (v.settings) fillSettings(v.settings);
  }

  // Cada segundo: solo refresca los textos que dependen del reloj.
  setInterval(() => {
    if (!view) return;
    const tipEl = document.querySelector('[data-live="tip"]');
    if (tipEl && lastGood) tipEl.textContent = ago(lastGood.tip.timestamp * 1000);
    const st = document.querySelector('[data-live="stale"]');
    if (st && lastGood) st.textContent = ago(lastGood.fetchedAtMs);
    if (view.ok && !view.cached) $('statusText').textContent = 'Fuente: ' + view.source + ' · actualizado hace ' + ago(view.fetchedAtMs);
  }, 1000);

  // ---------- Rango de fechas ----------
  function rangeCard(color, title, big, sub, bigCls) {
    return '<div class="card ' + color + '"><h2>' + title + '</h2><div class="mid ' + (bigCls || '') + '">' + big + '</div><div class="muted sm">' + (sub || '') + '</div></div>';
  }

  function renderRange(r) {
    const g = r.range;
    const spanDays = (g.toBlock.timestamp - g.fromBlock.timestamp) / 86400;
    const tick = (x) => new Date(x * 1000).toLocaleDateString('es', spanDays > 200 ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
    let chart;
    if (r.series) {
      chart = '<div class="chart">' + G.lineChart({
        series: [{ name: 'Promedio por bloque', color: COLOR.icono, points: r.series.map((s) => ({ x: s.midTs, y: s.avgSeconds, label: 'Bloques ' + nf(s.fromHeight) + ' a ' + nf(s.toHeight) + ' (' + dShort(s.fromTs) + '): ' + nf(s.avgSeconds, 1) + ' s por bloque' })) }],
        refLines: [{ y: 600, label: 'Objetivo 600 s', color: COLOR.purpura }], xFormat: tick, yFormat: (y) => nf(y, 0) + ' s',
      }) + '</div><div class="note">Cada punto es el promedio de un tramo de ' + nf(r.series[0].blocks) + ' bloques aprox. (' + r.series.length + ' tramos). Pase el mouse sobre un punto para ver su valor.</div>';
    } else {
      chart = '<p class="muted">' + (r.seriesError ? 'No se pudo calcular la evolución: ' + esc(r.seriesError) : 'Rango corto (menos de 24 bloques): no hay evolución que graficar.') + '</p>';
    }
    const st = r.stats;
    const stack =
      rangeCard('c-icono', 'Promedio por bloque', nf(g.avgSeconds, 1) + ' s', C.formatBlockTime(g.avgSeconds), speedCls(g.avgSeconds)) +
      rangeCard('c-verde', 'Bloques en el rango', nf(g.blocks), 'bloques ' + nf(g.fromBlock.height) + ' a ' + nf(g.toBlock.height)) +
      rangeCard('c-purpura', 'Frente al objetivo (600 s)', pct(g.vsTargetPercent), g.vsTargetPercent <= 0 ? 'más rápido que lo ideal' : 'más lento que lo ideal', cls(-g.vsTargetPercent)) +
      rangeCard('c-verde', 'Tiempo mínimo', st ? nf(st.min.avgSeconds, 1) + ' s' : '—', st ? 'tramo más rápido (promedio) · bloques ' + nf(st.min.fromHeight) + ' a ' + nf(st.min.toHeight) : 'requiere un rango más largo', st ? 'up' : '') +
      rangeCard('c-naranja', 'Tiempo máximo', st ? nf(st.max.avgSeconds, 1) + ' s' : '—', st ? 'tramo más lento (promedio) · bloques ' + nf(st.max.fromHeight) + ' a ' + nf(st.max.toHeight) : 'requiere un rango más largo', st ? 'down' : '');
    $('rangeOut').innerHTML = '<div class="range-grid"><div>' + chart + '</div><div class="stack">' + stack + '</div></div>' +
      '<div class="note">Desde el bloque ' + nf(g.fromBlock.height) + ' (' + dtS(g.fromBlock.timestamp) + ') hasta el bloque ' + nf(g.toBlock.height) + ' (' + dtS(g.toBlock.timestamp) + '). Los extremos son los bloques más cercanos a cada fecha según ' + esc(r.source) + '; pueden estar a unos pocos bloques de distancia.</div>' +
      (g.shortRange ? '<p class="down">Rango corto (menos de 50 bloques): el promedio es poco confiable.</p>' : '') +
      (st ? '<div class="note">Mínimo y máximo son promedios de tramos, no el intervalo exacto entre dos bloques sueltos (un bloque individual puede salir en segundos o tardar más de una hora).</div>' : '');
  }

  $('btnRange').onclick = async () => {
    const out = $('rangeOut');
    out.innerHTML = '<p class="muted" style="text-align:center">Consultando… (puede tardar unos segundos)</p>';
    const r = await api.range($('dFrom').value, $('dTo').value);
    if (!r.ok) { out.innerHTML = '<p class="down" style="text-align:center">' + esc(r.error) + '</p>'; return; }
    renderRange(r);
  };

  // ---------- Avisos ----------
  function fillSettings(s) {
    $('sNewBlock').checked = s.notifyNewBlock; $('sRetarget').checked = s.notifyRetarget; $('sNear').checked = s.notifyNear;
    if (document.activeElement !== $('sNearBlocks')) $('sNearBlocks').value = s.nearBlocks;
    if (document.activeElement !== $('sPoll')) $('sPoll').value = s.pollSeconds;
  }
  async function saveSettings() {
    const s = await api.setSettings({
      notifyNewBlock: $('sNewBlock').checked, notifyRetarget: $('sRetarget').checked, notifyNear: $('sNear').checked,
      nearBlocks: Number($('sNearBlocks').value), pollSeconds: Number($('sPoll').value),
    });
    fillSettings(s);
    $('settingsMsg').textContent = 'Guardado.';
    setTimeout(() => { $('settingsMsg').textContent = ''; }, 2000);
  }
  ['sNewBlock', 'sRetarget', 'sNear', 'sNearBlocks', 'sPoll'].forEach((id) => { $(id).onchange = saveSettings; });
  $('btnTest').onclick = () => api.testNotify();
  function toggleAvisos(open) {
    const show = open == null ? $('avisosPanel').hidden : open;
    $('avisosPanel').hidden = !show;
    $('btnAvisos').classList.toggle('on', show);
    $('btnAvisos').setAttribute('aria-expanded', String(show));
  }
  $('btnAvisos').onclick = (e) => { e.stopPropagation(); toggleAvisos(); };
  $('avisosPanel').onclick = (e) => e.stopPropagation();
  document.addEventListener('click', () => toggleAvisos(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleAvisos(false); });

  // ---------- Pestañas y arranque ----------
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== 'tab-' + b.dataset.tab; });
    };
  });
  $('btnRefresh').onclick = async () => { $('statusText').textContent = 'Actualizando…'; render(await api.refresh()); };
  api.onUpdate(render);
  api.getCached().then((v) => { if (v && !v.cargando && !view) render(v); });
  setTimeout(traerEstado, 1500);
  const today = new Date();
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  $('dTo').value = ymd(today);
  $('dFrom').value = ymd(new Date(today.getTime() - 30 * 86400000));
  api.getSettings().then(fillSettings);
})();

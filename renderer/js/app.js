// Ar_Trading - aplicación principal: diseños de 1 a 4 gráficos, gráfico activo, sincronización,
// barra superior, ajustes y panel de indicadores. Cada gráfico vive en view.js.
(function () {
  'use strict';
  const L = window.TVLib;
  const API = window.TVApi;

  // ---------- Configuración ----------
  const PERIODS = [14, 21, 29, 43, 50, 57, 71, 85, 200, 357, 387];
  const COLORS = ['#2962ff', '#f23645', '#ff9800', '#000000']; // azul, rojo, naranja, negro
  const DEFAULT_ON = { EMA: [21, 29, 50] };
  const LAYOUTS = {
    '1': { n: 1, label: '1 gráfico' },
    '2h': { n: 2, label: '2 lado a lado' },
    '2v': { n: 2, label: '2 apilados' },
    '3': { n: 3, label: '3 (uno grande + dos)' },
    '4': { n: 4, label: '4 en cuadrícula' },
  };

  // Por defecto, al activar cada grupo aparece una sola media: EMA 59 azul y SMA 249 roja.
  function defaultMas() {
    return [
      { id: 'EMA-59', type: 'EMA', period: 59, color: '#2962ff', visible: true, width: 2 },
      { id: 'SMA-249', type: 'SMA', period: 249, color: '#f23645', visible: true, width: 2 },
    ];
  }
  const defaultMaOn = () => ({ EMA: false, SMA: false });
  function defaultCandle() {
    return {
      body: { on: true, up: '#26a69a', down: '#ef5350' },
      border: { on: true, up: '#26a69a', down: '#ef5350' },
      wick: { on: true, up: '#26a69a', down: '#ef5350' },
    };
  }
  // Valores por defecto de TradingView
  function levelDefaults(bgColor) {
    return {
      ob: 70, mid: 50, os: 30,
      obColor: '#787b86', obStyle: 'dashed', midColor: '#787b86', midStyle: 'dotted', osColor: '#787b86', osStyle: 'dashed',
      bgOn: true, bgColor, bgOpacity: 10,
    };
  }
  function defaultInd() {
    return {
      rsi: Object.assign({ on: false, len: 14, color: '#7e57c2', width: 1 }, levelDefaults('#7e57c2')),
      stoch: Object.assign({ on: false, k: 14, sm: 1, d: 3, kColor: '#2962ff', dColor: '#ff6d00', width: 1 }, levelDefaults('#2962ff'), { ob: 80, os: 20 }),
      delta: { on: false, upColor: '#26a69a', downColor: '#ef5350' },
      cvd: { on: false, color: '#ffb74d', width: 2 },
      pivots: { on: false, type: 'classic', period: 'auto', width: 1 },
    };
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function wmEl(on, color, opacity) { return { on, color, opacity }; }
  function defaultWm() {
    return {
      pos: 'center',
      ticker: wmEl(false, '#787b86', 25), interval: wmEl(false, '#787b86', 25), desc: wmEl(false, '#787b86', 25),
      name: wmEl(false, '#2962ff', 25), icon: wmEl(false, '#2962ff', 25),
    };
  }
  function defaultLook() { return { bg: null, gridV: false, gridH: false, gridColor: null }; }
  // Cada gráfico lleva su propia configuración (indicadores, medias, velas, fondo, rejillas y marca de agua).
  function newChart(symbol, tf) {
    return {
      symbol: symbol || 'BTCUSDT', exchange: 'binance', tf, chartType: 'candles', scale: 'normal', invert: false,
      ind: defaultInd(), mas: defaultMas(), maOn: defaultMaOn(), order: ['main', 'rsi', 'stoch', 'delta', 'cvd'], paneH: {}, scripts: [], candle: defaultCandle(), look: defaultLook(), wm: defaultWm(),
    };
  }
  // Herramientas de dibujo (v0.7): preferencias globales. Los dibujos van en cfg.drawings[símbolo].
  function defaultDraw() {
    return { favs: ['trend', 'hline', 'fib', 'rect'], magnet: 'off', keep: false, favBar: true, favPos: { edge: 'left', off: 0.2 }, selPos: { edge: 'top', off: 0.5 }, hideAll: false, shareNew: false, styles: {}, templates: {} };
  }
  function defaultCharts(symbol) {
    return ['m:60', 'm:240', 'd:1', 'm:15'].map((tf, i) => Object.assign(newChart(symbol, tf), { id: 'c' + (i + 1) }));
  }
  function defaultConfig() {
    return {
      version: 11, layout: '1', scripts: [], bt: { h: 260, tab: 'report', collapsed: false }, active: 0, charts: defaultCharts(), sync: { cross: true, time: true }, drawings: {}, folders: {}, draw: defaultDraw(),
      tfs: L.DEFAULT_TFS.slice(), theme: 'dark', tz: 'local', timer: true,
      palette: ['#2962ff', '#f23645', '#26a69a', '#ef5350', '#ff9800', '#7e57c2', '#787b86', '#ffffff', '#000000'], templates: [],
      lists: defaultLists(), listActive: 'l1',
    };
  }
  // Listas de seguimiento (v0.11): cada lista tiene nombre y activos { s: símbolo, x: exchange }.
  const DEFAULT_FAVS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'TRXUSDT', 'RAYUSDT'];
  function defaultLists(favs) {
    return [{ id: 'l1', name: 'Favoritos', items: (favs || DEFAULT_FAVS).map((s2) => ({ s: s2, x: 'binance' })) }];
  }
  // Limpia las listas guardadas (o, si es una configuración anterior, convierte los favoritos viejos en la primera lista).
  function cleanLists(src, oldFavs) {
    const out = [];
    const used = new Set();
    if (Array.isArray(src)) {
      src.forEach((l) => {
        if (!l || typeof l !== 'object') return;
        let id = typeof l.id === 'string' && l.id ? l.id : 'l' + Date.now() + out.length;
        while (used.has(id)) id += 'x';
        used.add(id);
        const seen = new Set();
        const items = [];
        (Array.isArray(l.items) ? l.items : []).forEach((it) => {
          if (!it || !/^[A-Z0-9]{3,20}$/.test(String(it.s))) return;
          const x = L.EXCHANGES[it.x] ? it.x : 'binance';
          if (seen.has(x + '|' + it.s)) return;
          seen.add(x + '|' + it.s);
          items.push({ s: it.s, x });
        });
        out.push({ id, name: String(l.name || 'Lista').slice(0, 40), items });
      });
    }
    if (!out.length) {
      const favs = Array.isArray(oldFavs) ? oldFavs.filter((f) => /^[A-Z0-9]{3,20}$/.test(String(f))) : null;
      return defaultLists(favs && favs.length ? favs : null);
    }
    return out;
  }

  const A = { cfg: defaultConfig(), views: [], symbolsBy: {}, max: -1, tabId: API.windowId || 'w1', gridEl: null };
  const $ = (id) => document.getElementById(id);
  // v0.22.5: pestañas vivas. Cada pestaña (w1…w10) tiene su configuración, sus gráficos y su grid; solo una se ve a la vez.
  const tabsState = new Map();     // id -> { id, cfg, views, gridEl, theme, tz, scriptsSig }
  const saveTimers = new Map();    // id -> { timer, cfg }  (guardado pendiente de cada pestaña)
  function saveTab(id, cfg) {
    const old = saveTimers.get(id); if (old) clearTimeout(old.timer);
    const e = { cfg, timer: setTimeout(() => { saveTimers.delete(id); API.setConfig(cfg, id).catch(() => {}); }, 400) };
    saveTimers.set(id, e);
  }
  const saveCfg = () => { saveTab(A.tabId, A.cfg); try { const tn = document.querySelector('#tabBar .tab.cur .tab-name'); if (tn) { const l = tabLabelOf(A.cfg); if (tn.textContent !== l) { tn.textContent = l; tn.parentNode.title = l; } } } catch (e) { /* ok */ } };
  function flushTab(id, now) {
    const e = saveTimers.get(id); if (!e) return;
    clearTimeout(e.timer); saveTimers.delete(id);
    try { if (now) API.setConfigNow(e.cfg, id); else API.setConfig(e.cfg, id).catch(() => {}); } catch (err) { /* ok */ }
  }
  // Al cerrar la ventana no se pierde el último cambio de ninguna pestaña
  window.addEventListener('beforeunload', () => { [...saveTimers.keys()].forEach((id) => flushTab(id, true)); });
  const activeView = () => A.views[A.cfg.active] || A.views[0];
  const activeCfg = () => A.cfg.charts[A.cfg.active] || A.cfg.charts[0];

  // ---------- Enlace con los gráficos ----------
  document.addEventListener('fullscreenchange', () => { const on = !!document.fullscreenElement; document.body.classList.toggle('fs', on); (A.views || []).forEach((v) => v.setFullscreen && v.setFullscreen(on)); });
  let syncLockUntil = 0;
  const G = {
    cfg: () => A.cfg,
    save: saveCfg,
    onActivate(view) { setActive(view.index); },
    onMaximize(view) { toggleMax(view.index); },
    // Pantalla completa (como TradingView): todo el programa ocupa la pantalla; Esc o el mismo botón para salir.
    onFullscreen() {
      try {
        if (document.fullscreenElement) { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); }
        else { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); }
      } catch (e) { /* el sistema no lo permite */ }
    },
    // Doble clic: con varios gráficos amplía/restaura el gráfico; con uno solo (o ya ampliado) oculta/muestra los indicadores de panel.
    onDoubleClick(view) {
      if (A.views.length > 1 && A.max < 0) toggleMax(view.index);
      else view.toggleSubs();
    },
    scriptLib: () => A.cfg.scripts || [],
    onScriptStatus(view) { if (window.TVScriptUI) TVScriptUI.onStatus(view); if (window.TVBt) TVBt.onStatus(view); },
    scriptAction(view, uid, action) {
      const list = view.cfg.scripts || [];
      const a = list.find((q) => q.uid === uid);
      if (!a) return;
      if (action === 'remove') { view.cfg.scripts = list.filter((q) => q.uid !== uid); saveCfg(); view.refreshScripts(); TVScriptUI.onStatus(view); return; }
      if (view.index !== A.cfg.active) setActive(view.index);
      TVScriptUI.open(a.scriptId);
    },
    indAction(view, name, action) {
      const c = view.cfg.ind[name];
      if (action === 'up' || action === 'down') {
        view.snapshotHeights();
        const o = view.cfg.order;
        const live = o.filter((n) => n === 'main' || (view.cfg.ind[n] && view.cfg.ind[n].on));
        const i = live.indexOf(name), j = i + (action === 'up' ? -1 : 1);
        if (i >= 0 && j >= 0 && j < live.length) {
          const a1 = o.indexOf(live[i]), b1 = o.indexOf(live[j]);
          [o[a1], o[b1]] = [o[b1], o[a1]];
        }
      } else if (action === 'off') c.on = false;
      saveCfg();
      view.refreshIndicators();
      if (!$('panel').classList.contains('hidden') && view.index === A.cfg.active) renderPanel();
      if (window.TVDrawUI) window.TVDrawUI.refresh();
    },
    symbolInfo(sym, ex) { return ((A.symbolsBy || {})[ex || 'binance'] || []).find((x) => x.symbol === sym) || null; },
    onPaneSize() { saveCfg(); },
    onStatus(view) { if (view.index === A.cfg.active) renderStatus(); },
    onReplay() { markActive(); },
    activeIndex() { return A.cfg.active; },
    // Tiempo sincronizado: los demás gráficos alinean su borde derecho con el del gráfico que se mueve.
    onRange(view) {
      if (!A.cfg.sync.time || A.views.length < 2) return;
      if (performance.now() < syncLockUntil) return;
      if (!view.host.matches(':hover') && activeView() !== view) return;
      const t = view.rightEdgeTime();
      if (t === null) return;
      syncLockUntil = performance.now() + 200;
      A.views.forEach((v) => { if (v !== view) v.setRightEdgeTime(t); });
    },
    // Cruz sincronizada: solo la envía el gráfico bajo el mouse.
    onCrosshair(view, time) {
      if (!A.cfg.sync.cross || A.views.length < 2) return;
      A.views.forEach((v) => { if (v !== view) v.showCrosshairAt(time); });
    },
    // Al terminar de cargar un gráfico, se alinea en el tiempo con otro que ya esté listo.
    onLoaded(view) {
      if (!A.cfg.sync.time || A.views.length < 2) return;
      const ref = A.views.find((v) => v !== view && !v.loading && v.bars.length) ;
      if (!ref) return;
      const t = ref.rightEdgeTime();
      if (t === null) return;
      syncLockUntil = performance.now() + 200;
      view.setRightEdgeTime(t);
    },
  };

  // Los avisos de gráficos que están en una pestaña oculta no deben tocar la pestaña que se ve.
  Object.keys(G).forEach((k) => {
    const f = G[k];
    if (typeof f !== 'function' || k === 'cfg' || k === 'save' || k === 'scriptLib') return;
    G[k] = function (view) { if (view && typeof view === 'object' && view.host && view.tab !== undefined && view.tab !== A.tabId) return undefined; return f.apply(this, arguments); };
  });

  // ---------- Estado visible ----------
  function renderStatus() {
    const v = activeView();
    const el = $('status');
    if (!v) { el.textContent = ''; return; }
    const st = v.status;
    el.textContent = st.text || '';
    el.className = 'status' + (st.kind ? ' ' + st.kind : '');
  }

  // ---------- Diseño ----------
  const LAYOUT_OF = (cfg) => LAYOUTS[cfg.layout] || LAYOUTS['1'];
  function applyLayout() {
    const def = LAYOUT_OF(A.cfg);
    A.max = def.n > 1 && Number.isInteger(A.cfg.max) && A.cfg.max >= 0 && A.cfg.max < def.n ? A.cfg.max : -1;
    const grid = A.gridEl || $('grid');
    grid.className = 'layout-' + A.cfg.layout + (def.n > 1 ? ' multi' : '') + (grid.classList.contains('tab-off') ? ' tab-off' : '');
    while (A.views.length > def.n) {
      const v = A.views.pop();
      v.destroy();
      v.host.remove();
    }
    while (A.views.length < def.n) {
      const i = A.views.length;
      const cell = document.createElement('div');
      cell.className = 'cell';
      grid.appendChild(cell);
      const v = window.TVView.create(cell, A.cfg.charts[i], G, i);
      v.tab = A.tabId;
      A.views.push(v); if (document.fullscreenElement && v.setFullscreen) v.setFullscreen(true);
      v.load();
    }
    if (A.cfg.active >= def.n) A.cfg.active = 0;
    A.views.forEach((v, i) => v.host.classList.toggle('active', i === A.cfg.active));
    applyMax();
    markActive();
    renderStatus();
    if (window.TVBt) TVBt.render();
    saveCfg();
  }
  // Ampliar un gráfico a pantalla completa (y volver al diseño).
  function applyMax() {
    (A.gridEl || $('grid')).classList.toggle('has-max', A.max >= 0);
    A.views.forEach((v, k) => { v.host.classList.toggle('maxed', k === A.max); v.setMaximized(k === A.max); });
  }
  function toggleMax(i) {
    if (A.views.length < 2) return;
    A.max = A.max === i ? -1 : i;
    A.cfg.max = A.max;               // cada pestaña recuerda cuál gráfico tiene ampliado
    if (A.max >= 0) setActive(i);
    applyMax();
    saveCfg();
  }
  function setLayout(id) {
    if (!LAYOUTS[id]) return;
    A.cfg.layout = id;
    A.cfg.max = -1;
    applyLayout();
  }
  function setActive(i) {
    if (i === A.cfg.active || !A.views[i]) return;
    A.cfg.active = i;
    A.views.forEach((v, k) => v.host.classList.toggle('active', k === i));
    markActive();
    renderStatus();
    if (!$('panel').classList.contains('hidden')) renderPanel();
    if (window.TVBt) TVBt.render();
    saveCfg();
  }

  // ---------- Barra superior ----------
  function sortedTfs() {
    const seen = new Set();
    const list = [];
    for (const id of A.cfg.tfs) {
      const tf = L.tfById(id);
      if (!seen.has(tf.id)) { seen.add(tf.id); list.push(tf); }
    }
    const key = (t) => (t.kind === 'vol' ? 1e12 + t.vol : t.sec);
    return list.sort((x, y) => key(x) - key(y));
  }
  function renderTfButtons() {
    const box = $('tfButtons');
    box.innerHTML = '';
    const cur = activeCfg().tf;
    sortedTfs().forEach((tf) => {
      const b = document.createElement('button');
      b.className = 'tb-btn' + (tf.id === cur ? ' active' : '');
      b.textContent = tf.label;
      b.title = L.describe(tf);
      b.onclick = () => setTimeframe(tf.id);
      box.appendChild(b);
    });
    const add = document.createElement('button');
    add.className = 'tb-btn';
    add.textContent = '+';
    add.title = 'Agregar o quitar temporalidades';
    add.onclick = openTfManager;
    box.appendChild(add);
  }
  // ---------- Iconos de la barra (v0.22.6): en vez de texto, para ahorrar espacio ----------
  const svg = (inner, size) => `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICONS = {
    candles: svg('<path d="M7 3v3M7 18v3M17 6v3M17 15v4"/><rect x="5" y="6" width="4" height="12" rx="1"/><rect x="15" y="9" width="4" height="6" rx="1"/>'),
    line: svg('<polyline points="3 17 9 10 13 14 21 5"/>'),
    area: svg('<path d="M3 18 9 10 13 14 21 5V20H3Z" fill="currentColor" fill-opacity=".28" stroke="none"/><polyline points="3 18 9 10 13 14 21 5"/>'),
    normal: svg('<path d="M12 3v18M7 5h10M7 9.5h10M7 14h10M7 18.5h10"/>'),
    log: svg('<path d="M12 3v18M7 4h10M7 9h10M7 13h10M7 16h10M7 18.5h10"/>'),
    percent: svg('<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
    replay: svg('<polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/>'),
    scripts: svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    lay1: svg('<rect x="3" y="4" width="18" height="16" rx="2"/>'),
    lay2h: svg('<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/>'),
    lay2v: svg('<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/>'),
    lay3: svg('<rect x="3" y="4" width="11" height="16" rx="1.5"/><rect x="16" y="4" width="5" height="7" rx="1.5"/><rect x="16" y="13" width="5" height="7" rx="1.5"/>'),
    lay4: svg('<rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/>'),
  };
  const CARET = '<span class="caret">▾</span>';
  const TYPE_NAMES = { candles: 'Velas', line: 'Línea', area: 'Área' };
  const SCALE_NAMES = { normal: 'Normal', log: 'Logarítmica', percent: 'Porcentaje' };
  function markActive() {
    const c = activeCfg();
    document.querySelectorAll('#typeButtons .tb-btn').forEach((b) => { b.classList.toggle('active', b.dataset.type === c.chartType); });
    document.querySelectorAll('#scaleButtons .tb-btn').forEach((b) => { b.classList.toggle('active', b.dataset.scale === c.scale); });
    $('typeCur').innerHTML = (ICONS[c.chartType] || ICONS.candles) + CARET; $('typeCur').title = 'Tipo de gráfico: ' + (TYPE_NAMES[c.chartType] || 'Velas') + ' (clic para elegir)';
    $('scaleCur').innerHTML = (ICONS[c.scale] || ICONS.normal) + CARET; $('scaleCur').title = 'Escala del precio: ' + (SCALE_NAMES[c.scale] || 'Normal') + ' (clic para elegir)';
    syncOutlineButtons();
    $('btnSymbol').textContent = c.symbol + ((c.exchange || 'binance') !== 'binance' ? ' · ' + L.exchangeName(c.exchange) : '');
    { const tn = document.querySelector('#tabBar .tab.cur .tab-name'); if (tn) { tn.textContent = curTabLabel(); tn.parentNode.title = tn.textContent; } }
    document.body.dataset.theme = A.cfg.theme;
    const bl = $('brandLogo'); if (bl) bl.src = 'assets/logo-h-' + (A.cfg.theme === 'light' ? 'light' : 'dark') + '.png';
    const multi = A.views.length > 1;
    { const br = $('btnReplay'); if (br) { const st = activeView().replayState; br.classList.toggle('active', st !== 'off'); br.innerHTML = ICONS.replay + (st === 'pick' ? '<span class="tb-note">elige una vela</span>' : ''); br.title = st === 'off' ? 'Replay: reproducción de barras (elige una vela del pasado y mira cómo se formó el mercado vela a vela)' : (st === 'pick' ? 'Replay: haz clic en la vela donde empezar (clic aquí para cancelar)' : 'Replay activo (clic para salir)'); } }
    { const bd = $('btnData'); if (bd) { const on = c.src === 'trades'; bd.textContent = 'Datos: ' + (on ? 'Operaciones' : 'Velas'); bd.classList.toggle('active', on); } }
    $('btnLayout').innerHTML = ICONS['lay' + (LAYOUTS[A.cfg.layout] ? A.cfg.layout : '1')]; $('btnLayout').title = 'Diseño de gráficos: ' + (LAYOUTS[A.cfg.layout] ? LAYOUTS[A.cfg.layout].n : 1) + (LAYOUTS[A.cfg.layout] && LAYOUTS[A.cfg.layout].n > 1 ? ' gráficos' : ' gráfico') + ' (clic para cambiar)';
    renderTfButtons();
    if (window.TVDrawUI) window.TVDrawUI.refresh();
  }
  function setTimeframe(id) {
    id = L.normalizeId(id);
    if (!A.cfg.tfs.some((x) => L.normalizeId(x) === id)) A.cfg.tfs.push(id);
    saveCfg();
    activeView().setTf(id);
    markActive();
  }
  function setSymbol(sym, ex) {
    closeModal();
    activeView().setSymbol(sym, ex);
    saveCfg();
    markActive();
    if (window.TVWatch) window.TVWatch.refresh();
  }
  // Listas de símbolos por exchange (se piden una vez). Si falla, el error se muestra donde se use, sin esconderlo.
  const symPromises = {};
  function loadSymbols(ex) {
    ex = ex || 'binance';
    if (A.symbolsBy[ex]) return Promise.resolve(A.symbolsBy[ex]);
    if (!symPromises[ex]) {
      symPromises[ex] = API.symbols(ex).then((list) => { A.symbolsBy[ex] = list; return list; }, (e) => { delete symPromises[ex]; throw e; });
    }
    return symPromises[ex];
  }
  function setChartType(t) { activeView().setChartType(t); saveCfg(); markActive(); }
  function setScale(sc) { activeView().setScale(sc); saveCfg(); markActive(); }
  function eachView(fn) { A.views.forEach(fn); }
  function applyTheme() {
    document.body.dataset.theme = A.cfg.theme;
    const bl = $('brandLogo'); if (bl) bl.src = 'assets/logo-h-' + (A.cfg.theme === 'light' ? 'light' : 'dark') + '.png';
    eachView((v) => v.applyTheme());
    // barra de pestañas = barra de título (Windows): los botones del sistema siguen los colores del tema
    if (window.desktopApi && window.desktopApi.setOverlayColors) { const l = A.cfg.theme === 'light'; try { window.desktopApi.setOverlayColors(l ? '#ffffff' : '#0a102a', l ? '#131722' : '#d1d4dc'); } catch (e) { /* ok */ } }
  }
  // ---------- Ventanas emergentes ----------
  let floatPos = null; // dónde dejó el usuario la ventana de ajustes
  let modalClose = null; // función que se avisa cuando la ventana se cierra (por cualquier motivo)
  function openModal(build, opts) {
    if (modalClose) { const f = modalClose; modalClose = null; f(); }
    modalClose = (opts && opts.onClose) || null;
    const box = $('modalBox');
    const floating = !!(opts && opts.floating);
    box.innerHTML = '';
    box.classList.remove('wide');
    $('modal').classList.toggle('floating', floating);
    delete box.dataset.kind;
    box.style.left = box.style.top = '';
    build(box);
    $('modal').classList.remove('hidden');
    syncOutlineButtons();
    if (floating) {
      // Ventana movible: se arrastra desde el título y deja ver el gráfico mientras se cambian los ajustes.
      const w = box.offsetWidth;
      const pos = floatPos || { x: Math.max(8, Math.round((window.innerWidth - w) / 2)), y: 70 };
      const place = () => {
        pos.x = Math.max(0, Math.min(window.innerWidth - 80, pos.x));
        pos.y = Math.max(0, Math.min(window.innerHeight - 40, pos.y));
        box.style.left = pos.x + 'px'; box.style.top = pos.y + 'px';
        box.style.maxHeight = Math.max(200, window.innerHeight - pos.y - 12) + 'px';
        floatPos = pos;
      };
      place();
      const grip = box.querySelector('h3');
      if (grip) {
        grip.classList.add('drag-grip');
        grip.title = 'Arrastra para mover esta ventana';
        grip.onpointerdown = (e) => {
          if (e.button !== 0) return;
          const sx = e.clientX, sy = e.clientY, ox = pos.x, oy = pos.y;
          grip.setPointerCapture(e.pointerId);
          grip.onpointermove = (m) => { pos.x = ox + m.clientX - sx; pos.y = oy + m.clientY - sy; place(); };
          grip.onpointerup = () => { grip.onpointermove = null; grip.onpointerup = null; };
        };
      }
    }
  }
  function closeModal() {
    $('modal').classList.add('hidden'); closePalette();
    if (modalClose) { const f = modalClose; modalClose = null; f(); }
    syncOutlineButtons();
  }
  // v0.22: Ajustes, Scripts y Datos se marcan (contorno turquesa) mientras su ventana está abierta.
  function syncOutlineButtons() {
    const open = !$('modal').classList.contains('hidden');
    const kind = open ? $('modalBox').dataset.kind : '';
    const set = (id, on) => { const b = $(id); if (b) b.classList.toggle('on', !!on); };
    set('btnSettings', kind === 'settings'); set('btnScripts', kind === 'scripts'); set('btnData', kind === 'data');
  }
  // Menús desplegables de la barra (tipo de gráfico y escala)
  function setupDropdown(curId, listId) {
    const cur = $(curId), list = $(listId);
    const close = () => list.classList.add('hidden');
    cur.onclick = (e) => { e.stopPropagation(); const was = list.classList.contains('hidden'); document.querySelectorAll('.dd-list').forEach((l) => l.classList.add('hidden')); if (was) list.classList.remove('hidden'); };
    list.addEventListener('click', close);
    document.addEventListener('mousedown', (e) => { if (!list.classList.contains('hidden') && !e.target.closest('#' + listId) && e.target !== cur) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  // ---------- Paleta de colores propia ----------
  let palEl = null;
  function closePalette() { if (palEl) { palEl.remove(); palEl = null; } }
  function addToPalette(hex) {
    const h = String(hex).toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(h)) return false;
    if (!A.cfg.palette.includes(h)) { A.cfg.palette.push(h); saveCfg(); }
    return true;
  }
  // Junto a cada selector de color aparece un botón con tu paleta: un clic aplica el color; "+" guarda el color actual.
  function openPalette(inp, anchor) {
    closePalette();
    const pop = document.createElement('div');
    pop.className = 'pal-pop';
    const draw = () => {
      pop.innerHTML = '';
      const t = document.createElement('div'); t.className = 'pal-title'; t.textContent = 'Mi paleta';
      pop.appendChild(t);
      const grid = document.createElement('div'); grid.className = 'pal-grid';
      A.cfg.palette.forEach((hex) => {
        const sw = document.createElement('button');
        sw.className = 'pal-sw'; sw.style.background = hex; sw.title = hex + ' (clic derecho: quitar de la paleta)';
        sw.onclick = () => {
          if (inp.disabled) return;
          inp.value = hex;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          closePalette();
        };
        sw.oncontextmenu = (e) => { e.preventDefault(); A.cfg.palette = A.cfg.palette.filter((c) => c !== hex); saveCfg(); draw(); };
        grid.appendChild(sw);
      });
      pop.appendChild(grid);
      const add = document.createElement('button');
      add.className = 'btn secondary pal-add'; add.textContent = `+ Guardar ${inp.value}`;
      add.onclick = () => { addToPalette(inp.value); draw(); };
      pop.appendChild(add);
    };
    draw();
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(4, Math.min(window.innerWidth - pop.offsetWidth - 4, r.left)) + 'px';
    pop.style.top = Math.min(window.innerHeight - pop.offsetHeight - 4, r.bottom + 4) + 'px';
    palEl = pop;
  }
  document.addEventListener('mousedown', (e) => { if (palEl && !palEl.contains(e.target) && !e.target.classList.contains('pal-btn')) closePalette(); }, true);
  // Icono de la paleta: un cuadrado con muchos colores, para que se entienda que ahí se abre la paleta
  const PAL_ICON = (() => {
    const cols = ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#2962ff', '#7e57c2', '#e91e63', '#9e9e9e'];
    return '<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">' + cols.map((c, i) => `<rect x="${1 + (i % 3) * 5.4}" y="${1 + Math.floor(i / 3) * 5.4}" width="4.6" height="4.6" rx="1" fill="${c}"/>`).join('') + '</svg>';
  })();
  function decoratePalette(root) {
    root.querySelectorAll('input[type=color]').forEach((inp) => {
      if (inp.dataset.pal) return;
      inp.dataset.pal = '1';
      const wrap = document.createElement('span');
      wrap.className = 'cwrap';
      inp.before(wrap); wrap.appendChild(inp);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pal-btn'; b.innerHTML = PAL_ICON; b.title = 'Elegir un color de mi paleta';
      b.onclick = (e) => { e.stopPropagation(); if (palEl) closePalette(); else openPalette(inp, b); };
      wrap.appendChild(b);
    });
  }

  // Datos del gráfico (v0.18): velas del exchange o armadas con operaciones reales (Binance Futuros, BTCUSDT) + filtro por tamaño.
  function openDataPicker() {
    let timer = null;
    openModal((box) => {
      box.dataset.kind = 'data';
      const ac = activeCfg();
      const mk = (tag, props) => Object.assign(document.createElement(tag), props || {});
      box.appendChild(mk('h3', { textContent: `Datos del gráfico ${A.cfg.active + 1} · ${ac.symbol}` }));
      const tr = Object.assign({ min: 0, max: 0, mode: 'only', days: 7 }, ac.tr || {});
      const field = (label, el) => { const d = mk('div', { className: 'field' }); d.append(mk('span', { textContent: label }), el); box.appendChild(d); return d; };
      const src = mk('select');
      [['candles', 'Velas del exchange'], ['trades', 'Operaciones reales (Binance Futuros · BTCUSDT)']].forEach(([v, t]) => src.appendChild(mk('option', { value: v, textContent: t })));
      src.value = ac.src === 'trades' ? 'trades' : 'candles';
      field('Fuente de las velas', src);
      const box2 = mk('div'); box.appendChild(box2);
      const f2 = (label, el) => { const d = mk('div', { className: 'field' }); d.append(mk('span', { textContent: label }), el); box2.appendChild(d); };
      const num = (v) => mk('input', { type: 'number', min: '0', step: 'any', value: v ? String(v) : '', placeholder: 'sin límite', style: 'width:110px' });
      const minI = num(tr.min), maxI = num(tr.max);
      f2('Tamaño mínimo de operación (BTC)', minI);
      f2('Tamaño máximo de operación (BTC)', maxI);
      const mode = mk('select');
      [['only', 'Quitar las que no cumplen'], ['hl', 'Resaltar (velas completas)']].forEach(([v, t]) => mode.appendChild(mk('option', { value: v, textContent: t })));
      mode.value = tr.mode; f2('Qué hacer con el filtro', mode);
      const days = mk('select');
      [3, 7, 14, 30].forEach((n) => days.appendChild(mk('option', { value: n, textContent: n + ' días' })));
      days.value = String(tr.days); f2('Historial de operaciones', days);
      box2.appendChild(mk('div', { className: 'hint', textContent: 'Quitar: cada vela se arma solo con las operaciones dentro del rango (máximos, mínimos, volumen y delta cambian). Resaltar: la vela es la completa y los paneles Delta y CVD muestran solo las operaciones del rango. Déjalo vacío para no filtrar. La primera vez se descargan archivos diarios de Binance (≈12 MB por día) y quedan guardados en este equipo.' }));
      const warn = mk('div', { className: 'hint' }); box.appendChild(warn);
      const stBox = mk('div', { className: 'conn-out' }); box.appendChild(stBox);
      const showSt = () => { box2.style.display = src.value === 'trades' ? '' : 'none'; stBox.style.display = src.value === 'trades' ? '' : 'none'; };
      src.onchange = showSt; showSt();
      const wrongSym = ac.symbol !== 'BTCUSDT' || (ac.exchange || 'binance') !== 'binance';
      const renderStatus = async () => {
        if (src.value !== 'trades' || !API.tradeStatus) return;
        let i;
        try { i = await API.tradeStatus(); } catch (e) { stBox.innerHTML = ''; stBox.appendChild(mk('div', { className: 'conn-row bad', textContent: 'No se pudo leer el estado: ' + e.message })); return; }
        stBox.innerHTML = '';
        const row = (cls, t) => stBox.appendChild(mk('div', { className: 'conn-row ' + cls, textContent: t }));
        const fmt = (ms) => new Date(ms).toLocaleString('es', { timeZone: A.cfg.tz === 'UTC' ? 'UTC' : undefined });
        row('', `${i.market} · ${i.symbol}`);
        row('', `Historial: ${i.archive.done} de ${i.archive.total - i.archive.missing.length} días descargados` + (i.archive.running ? ` (descargando ${i.archive.running.day}` + (i.archive.running.total ? `, ${Math.round(100 * i.archive.running.bytes / i.archive.running.total)} %` : '') + ')' : '') + (i.archive.missing.length ? ` · aún sin archivo: ${i.archive.missing.join(', ')} (se completa con consultas)` : ''));
        if (i.first) row('', `Datos desde ${fmt(i.first)} hasta ${fmt(i.last)}`);
        row(i.holes && !i.fill.active ? 'bad' : '', i.fill.active ? `Completando hueco: faltan ${i.fill.remaining.toLocaleString('es')} de ${i.fill.total.toLocaleString('es')} operaciones` : (i.holes ? `Operaciones faltantes: ${i.holes.toLocaleString('es')}` : 'Sin huecos'));
        row(i.live.mode === 'ws' ? 'ok' : (i.live.mode === 'rest' ? 'bad' : ''), i.live.mode === 'ws' ? 'En vivo: transmisión (WebSocket)' : i.live.mode === 'rest' ? 'En vivo: consultas cada segundo. ' + (i.live.note || '') : 'En vivo: conectando…');
        row('', `Guardado en este equipo: ${i.diskMB} MB`);
        i.errors.forEach((e) => row('bad', '✗ ' + e));
      };
      if (wrongSym) {
        warn.textContent = 'Este gráfico no es BTCUSDT de Binance: las operaciones reales solo existen para BTCUSDT en esta versión.';
        const fix = mk('button', { className: 'btn secondary', textContent: 'Cambiar este gráfico a BTCUSDT de Binance' });
        fix.onclick = () => { closeModal(); setSymbol('BTCUSDT', 'binance'); markActive(); openDataPicker(); };
        box.appendChild(fix);
      }
      const apply = mk('button', { className: 'btn', textContent: 'Aplicar' });
      apply.onclick = () => {
        const mn = Math.max(0, parseFloat(String(minI.value).replace(',', '.')) || 0), mx = Math.max(0, parseFloat(String(maxI.value).replace(',', '.')) || 0);
        if (mx && mn > mx) { warn.textContent = 'El mínimo no puede ser mayor que el máximo.'; return; }
        if (src.value === 'trades' && wrongSym) { warn.textContent = 'Primero cambia este gráfico a BTCUSDT de Binance (botón de arriba).'; return; }
        ac.tr = { min: mn, max: mx, mode: mode.value, days: Number(days.value) };
        saveCfg();
        activeView().setSource(src.value, ac.tr);
        markActive();
        warn.textContent = 'Aplicado.';
        renderStatus();
      };
      const close = mk('button', { className: 'btn secondary', textContent: 'Cerrar' }); close.onclick = closeModal;
      const row = mk('div', { className: 'row-actions' }); row.append(apply, close); box.appendChild(row);
      renderStatus(); timer = setInterval(renderStatus, 2000);
    }, { floating: true, onClose: () => clearInterval(timer) });
  }

  function toggleSyncCross() {
    A.cfg.sync.cross = !A.cfg.sync.cross;
    if (!A.cfg.sync.cross) eachView((v) => v.showCrosshairAt(null));
    saveCfg();
  }
  function toggleSyncTime() {
    A.cfg.sync.time = !A.cfg.sync.time;
    saveCfg();
    if (A.cfg.sync.time && A.views.length > 1) {
      const t = activeView().rightEdgeTime();
      if (t !== null) { syncLockUntil = performance.now() + 200; A.views.forEach((v) => { if (v !== activeView()) v.setRightEdgeTime(t); }); }
    }
  }
  function openLayoutPicker() {
    openModal((box) => {
      const h = document.createElement('h3');
      h.textContent = 'Diseño de gráficos';
      box.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'lay-grid';
      Object.keys(LAYOUTS).forEach((id) => {
        const b = document.createElement('button');
        b.className = 'lay-opt' + (A.cfg.layout === id ? ' sel' : '');
        const icon = document.createElement('div');
        icon.className = 'lay-icon lay-' + id;
        for (let i = 0; i < LAYOUTS[id].n; i++) icon.appendChild(document.createElement('i'));
        const t = document.createElement('span');
        t.textContent = LAYOUTS[id].label;
        b.append(icon, t);
        b.onclick = () => { closeModal(); setLayout(id); if (LAYOUTS[id].n > 1) openLayoutPicker(); };   // con 2 o más gráficos se queda para ajustar la sincronización
        grid.appendChild(b);
      });
      box.appendChild(grid);
      if (LAYOUTS[A.cfg.layout] && LAYOUTS[A.cfg.layout].n > 1) {
        const sync = document.createElement('div');
        sync.className = 'lay-sync';
        const mk = (text, hint, get, fn) => {
          const lab = document.createElement('label'); lab.title = hint;
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!get();
          cb.onchange = () => { fn(); cb.checked = !!get(); };
          lab.append(cb, document.createTextNode(' ' + text));
          return lab;
        };
        const h4 = document.createElement('h4'); h4.textContent = 'Sincronización entre gráficos';
        sync.append(h4,
          mk('Cruz: la cruz del ratón se ve en todos los gráficos', 'Sincronizar la cruz entre gráficos', () => A.cfg.sync.cross, toggleSyncCross),
          mk('Tiempo: mover o ampliar uno mueve los demás', 'Sincronizar el tiempo entre gráficos', () => A.cfg.sync.time, toggleSyncTime));
        box.appendChild(sync);
      }
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Haz clic en un gráfico para seleccionarlo: la barra de arriba (activo, temporalidad, tipo y escala) actúa sobre el gráfico seleccionado, marcado con borde azul. Los indicadores y las medias móviles se aplican a todos.';
      box.appendChild(hint);
      const close = document.createElement('button');
      close.className = 'btn secondary'; close.textContent = 'Cerrar'; close.onclick = closeModal;
      const row = document.createElement('div');
      row.className = 'row-actions'; row.appendChild(close);
      box.appendChild(row);
    });
  }

  function openSymbolPicker() {
    openModal((box) => {
      let pickEx = activeCfg().exchange || 'binance';
      let loadErr = null;
      const h = document.createElement('h3');
      h.textContent = 'Buscar activo';
      const tabs = document.createElement('div');
      tabs.className = 'group ex-tabs';
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'sym-search'; input.placeholder = 'Escribe, por ejemplo BTC, ETHUSDT…';
      const list = document.createElement('div');
      list.className = 'sym-list';
      box.append(h, tabs, input, list);

      let current = [];
      const render = () => {
        const exName = L.exchangeName(pickEx);
        const all = A.symbolsBy[pickEx] || null;
        const q = input.value.trim().toUpperCase();
        tabs.innerHTML = '';
        Object.keys(L.EXCHANGES).forEach((id) => {
          const b = document.createElement('button');
          b.className = 'tb-btn' + (id === pickEx ? ' active' : '');
          b.textContent = L.exchangeName(id);
          b.onclick = () => { pickEx = id; loadErr = null; ensure(); render(); input.focus(); };
          tabs.appendChild(b);
        });
        list.innerHTML = '';
        current = [];
        const add = (title, items) => {
          if (!items.length) return;
          const t = document.createElement('div');
          t.className = 'sym-title'; t.textContent = title;
          list.appendChild(t);
          items.forEach((s2) => {
            const d = document.createElement('div');
            d.className = 'sym-item' + (current.length === 0 ? ' sel' : '');
            const a = document.createElement('span'); a.textContent = s2.symbol;
            const m = document.createElement('small'); m.textContent = s2.quote ? `${s2.base} / ${s2.quote}` : exName;
            d.append(a, m);
            d.onclick = () => setSymbol(s2.symbol, pickEx);
            list.appendChild(d);
            current.push(s2.symbol);
          });
        };
        const act = A.cfg.lists.find((l) => l.id === A.cfg.listActive) || A.cfg.lists[0];
        const favs = act.items
          .filter((it) => it.x === pickEx)
          .map((it) => it.s)
          .filter((f) => !q || f.includes(q))
          .filter((f) => !all || all.some((s2) => s2.symbol === f))
          .map((f) => (all && all.find((s2) => s2.symbol === f)) || { symbol: f });
        add(`Lista: ${act.name}`, favs);
        if (all) {
          const favSet = new Set(favs.map((f) => f.symbol));
          const res = all.filter((s2) => (!q || s2.symbol.includes(q)) && !favSet.has(s2.symbol));
          const pref = res.filter((s2) => s2.quote === 'USDT').concat(res.filter((s2) => s2.quote !== 'USDT')).slice(0, 120);
          add(q ? 'Resultados' : 'Todos (USDT primero)', pref);
        } else {
          const t = document.createElement('div');
          t.className = 'hint';
          t.textContent = loadErr ? `No se pudo cargar la lista de ${exName}: ${loadErr}` : `Cargando la lista completa de ${exName}…`;
          list.appendChild(t);
        }
        if (all && q && !current.length) {
          const t = document.createElement('div');
          t.className = 'hint'; t.textContent = `No hay resultados para "${q}" en ${exName} spot.`;
          list.appendChild(t);
        }
      };
      const ensure = () => {
        const ex = pickEx;
        if (A.symbolsBy[ex]) return;
        loadSymbols(ex).then(() => { if (pickEx === ex) render(); }, (e) => { if (pickEx === ex) { loadErr = (e && e.message) || String(e); render(); } });
      };
      input.oninput = render;
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          const q = input.value.trim().toUpperCase();
          if (current.length) setSymbol(current[0], pickEx);
          else if (!A.symbolsBy[pickEx] && /^[A-Z0-9]{3,20}$/.test(q)) setSymbol(q, pickEx);
        }
      };
      ensure();
      render();
      setTimeout(() => input.focus(), 0);
    });
  }

  function openTfManager() {
    openModal((box) => {
      const h = document.createElement('h3');
      h.textContent = 'Temporalidades';
      box.appendChild(h);
      const hint0 = document.createElement('div');
      hint0.className = 'hint';
      hint0.textContent = 'Escribe la que quieras, por ejemplo 30 segundos, 620 minutos o 4,3 horas (mínimo 1 segundo). Aparecerá en la barra de arriba.';
      box.appendChild(hint0);

      const form = document.createElement('div');
      form.className = 'tf-form';
      const num = document.createElement('input');
      num.type = 'text'; num.inputMode = 'decimal'; num.placeholder = 'Ej: 4,3'; num.className = 'tf-num';
      const unit = document.createElement('select');
      [['s', 'segundos'], ['m', 'minutos'], ['h', 'horas'], ['d', 'días'], ['w', 'semanas'], ['M', 'meses']].forEach(([v, t]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = t; unit.appendChild(o);
      });
      unit.value = 'h';
      form.append(num, unit);
      box.appendChild(form);
      const preview = document.createElement('div');
      preview.className = 'tf-preview';
      box.appendChild(preview);

      let current = null;
      const check = () => {
        current = null;
        preview.className = 'tf-preview';
        if (!num.value.trim()) { preview.textContent = ''; return; }
        try {
          const tf = L.makeTf(unit.value, num.value);
          current = tf;
          let msg = `Será "${tf.label}". ${L.describe(tf)}`;
          if (tf.note) msg += ' ' + tf.note;
          if (L.ratioOf(tf) > 150 && L.ratioOf(tf) <= L.MAX_RATIO) {
            msg += ' Aviso: es una temporalidad poco común y al inicio cargará pocas barras; el historial se amplía al desplazarte hacia la izquierda.';
            preview.className = 'tf-preview warn';
          }
          preview.textContent = msg;
        } catch (e) {
          preview.className = 'tf-preview err';
          preview.textContent = e.message;
        }
      };
      num.oninput = check; unit.onchange = check;

      const addTf = (use) => {
        check();
        if (!current) { num.focus(); return; }
        const id = current.id;
        if (!A.cfg.tfs.some((x) => L.normalizeId(x) === id)) A.cfg.tfs.push(id);
        saveCfg();
        if (use) { closeModal(); setTimeframe(id); } else { renderTfButtons(); num.value = ''; check(); renderList(); }
      };
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const b1 = document.createElement('button'); b1.className = 'btn'; b1.textContent = 'Agregar y usar'; b1.onclick = () => addTf(true);
      const b2 = document.createElement('button'); b2.className = 'btn secondary'; b2.textContent = 'Solo agregar'; b2.onclick = () => addTf(false);
      actions.append(b1, b2);
      box.appendChild(actions);
      num.onkeydown = (e) => { if (e.key === 'Enter') addTf(true); };

      const h4 = document.createElement('h4');
      h4.textContent = 'En tu barra (clic en × para quitar)';
      box.appendChild(h4);
      const list = document.createElement('div');
      list.className = 'tf-chips';
      box.appendChild(list);
      const renderList = () => {
        list.innerHTML = '';
        const items = sortedTfs();
        items.forEach((tf) => {
          const chip = document.createElement('span');
          chip.className = 'chip';
          const t = document.createElement('span'); t.textContent = tf.label;
          const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = 'Quitar de la barra';
          x.onclick = () => {
            if (items.length <= 1) return;
            A.cfg.tfs = A.cfg.tfs.filter((id) => L.normalizeId(id) !== tf.id);
            // si algún gráfico usa esa temporalidad se mantiene visible en su botón
            if (A.cfg.charts.slice(0, A.views.length).some((c) => c.tf === tf.id)) A.cfg.tfs.push(tf.id);
            saveCfg(); markActive(); renderList();
          };
          chip.append(t, x);
          list.appendChild(chip);
        });
      };
      renderList();

      const row = document.createElement('div');
      row.className = 'row-actions';
      const reset = document.createElement('button'); reset.className = 'btn secondary'; reset.textContent = 'Restaurar lista inicial';
      reset.onclick = () => {
        A.cfg.tfs = L.DEFAULT_TFS.slice();
        A.cfg.charts.slice(0, A.views.length).forEach((c) => { if (!A.cfg.tfs.includes(c.tf)) A.cfg.tfs.push(c.tf); });
        saveCfg(); markActive(); renderList();
      };
      const close = document.createElement('button'); close.className = 'btn secondary'; close.textContent = 'Cerrar'; close.onclick = closeModal;
      row.append(reset, close);
      box.appendChild(row);
      setTimeout(() => num.focus(), 0);
    });
  }

  function openSettings() {
    openModal((box) => {
      box.dataset.kind = 'settings';
      box.classList.add('wide');
      const ac = activeCfg();
      const av = activeView();
      const h = document.createElement('h3');
      h.textContent = 'Ajustes';
      box.appendChild(h);
      const field = (label, el) => {
        const d = document.createElement('div');
        d.className = 'field';
        const s = document.createElement('span'); s.textContent = label;
        d.append(s, el);
        box.appendChild(d);
      };
      const title = (text) => {
        const t = document.createElement('div');
        t.className = 'sym-title'; t.textContent = text;
        box.appendChild(t);
      };
      const mk = (tag, props) => Object.assign(document.createElement(tag), props || {});

      // ----- Generales (todos los gráficos) -----
      title('Generales (todos los gráficos)');
      const theme = mk('select');
      [['dark', 'Oscuro'], ['light', 'Claro']].forEach(([v, t]) => theme.appendChild(mk('option', { value: v, textContent: t })));
      theme.value = A.cfg.theme;
      theme.onchange = () => { A.cfg.theme = theme.value; saveCfg(); applyTheme(); };
      field('Tema', theme);
      const tz = mk('select');
      [['local', 'Hora de mi PC'], ['UTC', 'UTC']].forEach(([v, t]) => tz.appendChild(mk('option', { value: v, textContent: t })));
      tz.value = A.cfg.tz;
      tz.onchange = () => { A.cfg.tz = tz.value; saveCfg(); eachView((v) => v.applyTz()); };
      field('Zona horaria', tz);
      const timer = mk('input', { type: 'checkbox', checked: A.cfg.timer !== false });
      timer.onchange = () => { A.cfg.timer = timer.checked; saveCfg(); eachView((v) => v.applyTimer()); };
      field('Temporizador de la vela (en la barra de precios)', timer);

      // ----- Solo el gráfico seleccionado -----
      title(`Solo el gráfico seleccionado: ${A.cfg.active + 1} · ${ac.symbol}`);
      const applyLook = () => { saveCfg(); av.applyLook(); };
      const bgOn = mk('input', { type: 'checkbox', checked: ac.look.bg !== null });
      const bgCol = mk('input', { type: 'color', value: ac.look.bg || (A.cfg.theme === 'dark' ? '#0a102a' : '#ffffff') });
      const bgSync = () => { bgCol.disabled = !bgOn.checked; bgCol.style.opacity = bgOn.checked ? 1 : 0.35; };
      bgOn.onchange = () => { ac.look.bg = bgOn.checked ? bgCol.value : null; bgSync(); applyLook(); };
      bgCol.oninput = () => { ac.look.bg = bgCol.value; applyLook(); };
      bgSync();
      const bgWrap = mk('span', { className: 'candle-ctl' });
      bgWrap.append(bgOn, bgCol);
      field('Color de fondo propio (si no, el del tema)', bgWrap);

      const gv = mk('input', { type: 'checkbox', checked: !!ac.look.gridV });
      gv.onchange = () => { ac.look.gridV = gv.checked; applyLook(); };
      field('Rejilla vertical', gv);
      const gh = mk('input', { type: 'checkbox', checked: !!ac.look.gridH });
      gh.onchange = () => { ac.look.gridH = gh.checked; applyLook(); };
      field('Rejilla horizontal', gh);
      const gc = mk('input', { type: 'color', value: ac.look.gridColor || '#363c4e' });
      gc.oninput = () => { ac.look.gridColor = gc.value; applyLook(); };
      field('Color de la rejilla', gc);

      // Estilo de velas
      title('Estilo de velas (solo este gráfico)');
      const applyCandle = () => { saveCfg(); av.applyCandleStyle(); };
      [['body', 'Cuerpo'], ['border', 'Contorno'], ['wick', 'Mechas']].forEach(([key, label]) => {
        const k = ac.candle[key];
        const wrapRow = mk('span', { className: 'candle-ctl' });
        const cb = mk('input', { type: 'checkbox', checked: k.on });
        const up = mk('input', { type: 'color', value: k.up, title: 'Alcista' });
        const down = mk('input', { type: 'color', value: k.down, title: 'Bajista' });
        const sync = () => { up.disabled = !k.on; down.disabled = !k.on; up.style.opacity = down.style.opacity = k.on ? 1 : 0.35; };
        cb.onchange = () => { k.on = cb.checked; sync(); applyCandle(); };
        up.oninput = () => { k.up = up.value; applyCandle(); };
        down.oninput = () => { k.down = down.value; applyCandle(); };
        sync();
        wrapRow.append(cb, up, down);
        field(label, wrapRow);
      });
      const note = mk('div', { className: 'hint', textContent: 'Primer color: vela alcista. Segundo color: vela bajista. Quita la casilla de "Cuerpo" para tener el cuerpo transparente.' });
      box.appendChild(note);

      // Marca de agua
      title('Marca de agua (solo este gráfico)');
      const wm = ac.wm;
      const applyWm = () => { saveCfg(); av.applyLook(); };
      const posSel = mk('select');
      [['center', 'Centro'], ['tl', 'Arriba izquierda'], ['tr', 'Arriba derecha'], ['bl', 'Abajo izquierda'], ['br', 'Abajo derecha']].forEach(([v, t]) => posSel.appendChild(mk('option', { value: v, textContent: t })));
      posSel.value = wm.pos;
      posSel.onchange = () => { wm.pos = posSel.value; applyWm(); };
      field('Posición', posSel);
      [['ticker', 'Ticker (ej. BTCUSDT)'], ['interval', 'Intervalo (ej. 1h)'], ['desc', 'Descripción (ej. BTC / USDT)'], ['name', 'Nombre del programa'], ['icon', 'Logo del programa']].forEach(([key, label]) => {
        const w = wm[key];
        const row = mk('span', { className: 'candle-ctl' });
        const cb = mk('input', { type: 'checkbox', checked: w.on });
        const color = mk('input', { type: 'color', value: w.color, title: 'Color' });
        const op = mk('input', { type: 'range', min: 0, max: 100, value: w.opacity, title: 'Transparencia: 0 = invisible, 100 = sólido', className: 'wm-range' });
        const val = mk('span', { className: 'wm-val', textContent: w.opacity + '%' });
        cb.onchange = () => { w.on = cb.checked; applyWm(); };
        color.oninput = () => { w.color = color.value; applyWm(); };
        op.oninput = () => { w.opacity = Number(op.value); val.textContent = op.value + '%'; applyWm(); };
        if (key === 'icon') color.style.display = 'none'; // el logo conserva sus colores; solo se ajusta la transparencia
        row.append(cb, color, op, val);
        field(label, row);
      });
      const wmHint = mk('div', { className: 'hint', textContent: 'Opacidad: 100% = se ve sólido, 0% = invisible.' });
      box.appendChild(wmHint);

      // ----- Plantillas de gráfico -----
      title('Plantillas (guardan colores, velas, indicadores, medias, fondo, rejilla y marca de agua)');
      const tplName = mk('input', { type: 'text', placeholder: 'Nombre de la plantilla', className: 'tpl-name' });
      const tplSave = mk('button', { className: 'btn secondary', textContent: 'Guardar este gráfico como plantilla' });
      tplSave.onclick = () => {
        const name = tplName.value.trim();
        if (!name) { tplName.focus(); return; }
        const data = snapshotTemplate(ac);
        const ex = A.cfg.templates.find((t) => t.name.toLowerCase() === name.toLowerCase());
        if (ex) {
          // mismo nombre: se pregunta antes de reemplazar
          openModal((mb) => {
            mb.appendChild(mk('h3', { textContent: 'Ya existe una plantilla con ese nombre' }));
            mb.appendChild(mk('p', { className: 'hint', textContent: `Ya tienes una plantilla "${ex.name}". ¿Quieres reemplazarla con el estado actual de este gráfico?` }));
            const rw = mk('div', { className: 'row-actions' });
            const yes = mk('button', { className: 'btn', textContent: 'Reemplazar' });
            yes.onclick = () => { ex.data = snapshotTemplate(ac); saveCfg(); openSettings(); };
            const no = mk('button', { className: 'btn secondary', textContent: 'Cancelar' });
            no.onclick = () => openSettings();
            rw.append(yes, no); mb.appendChild(rw);
          });
          return;
        }
        A.cfg.templates.push({ id: 't' + Date.now(), name, data });
        saveCfg(); openSettings();
      };
      const tplRow = mk('div', { className: 'row-actions' });
      tplRow.append(tplName, tplSave);
      box.appendChild(tplRow);
      if (!A.cfg.templates.length) box.appendChild(mk('div', { className: 'hint', textContent: 'Aún no tienes plantillas. Deja el gráfico como te gusta, escribe un nombre y guárdala.' }));
      A.cfg.templates.forEach((t) => {
        const r = mk('div', { className: 'tpl-row' });
        const nm = mk('span', { className: 'tpl-label', textContent: t.name });
        const b1 = mk('button', { className: 'btn secondary', textContent: 'Aplicar aquí', title: 'Aplicar al gráfico seleccionado' });
        b1.onclick = () => { applyTemplate(av, ac, t.data); openSettings(); };
        const b2 = mk('button', { className: 'btn secondary', textContent: 'A todos', title: 'Aplicar a todos los gráficos del diseño' });
        b2.onclick = () => { A.views.forEach((v) => applyTemplate(v, v.cfg, t.data)); openSettings(); };
        const b3 = mk('button', { className: 'btn secondary', textContent: 'Actualizar', title: 'Reemplazar la plantilla con el estado actual de este gráfico' });
        b3.onclick = () => { t.data = snapshotTemplate(ac); saveCfg(); openSettings(); };
        const b4 = mk('button', { className: 'x', textContent: '×', title: 'Eliminar plantilla' });
        b4.onclick = () => { A.cfg.templates = A.cfg.templates.filter((x) => x !== t); saveCfg(); openSettings(); };
        r.append(nm, b1, b2, b3, b4);
        box.appendChild(r);
      });

      // ----- Paleta personalizada -----
      title('Mi paleta de colores (en todo el programa)');
      const palBox = mk('div', { className: 'pal-grid pal-edit' });
      const drawPal = () => {
        palBox.innerHTML = '';
        A.cfg.palette.forEach((hex) => {
          const sw = mk('button', { className: 'pal-sw', title: hex + ' (clic: quitar)' });
          sw.style.background = hex;
          sw.onclick = () => { A.cfg.palette = A.cfg.palette.filter((c) => c !== hex); saveCfg(); drawPal(); };
          palBox.appendChild(sw);
        });
      };
      drawPal();
      box.appendChild(palBox);
      const palIn = mk('input', { type: 'color', value: '#2962ff' });
      const palHex = mk('input', { type: 'text', value: '#2962ff', className: 'pal-hex', maxLength: 7 });
      palIn.oninput = () => { palHex.value = palIn.value; };
      palHex.oninput = () => { if (/^#[0-9a-f]{6}$/i.test(palHex.value)) palIn.value = palHex.value; };
      const palAdd = mk('button', { className: 'btn secondary', textContent: '+ Agregar a mi paleta' });
      palAdd.onclick = () => { if (addToPalette(palHex.value)) drawPal(); };
      const palRow = mk('div', { className: 'row-actions' });
      palRow.append(palIn, palHex, palAdd);
      box.appendChild(palRow);
      box.appendChild(mk('div', { className: 'hint', textContent: 'Junto a cada selector de color hay un botón ▾ con tu paleta: un clic aplica el color; "+ Guardar" añade el color actual. Clic derecho en un color de la paleta lo quita.' }));

      // ----- Conexión con las fuentes de datos -----
      title('Conexión con las fuentes de datos');
      box.appendChild(mk('div', { className: 'hint', textContent: 'Comprueba en este equipo qué fuentes responden (Binance, Bybit, Coinbase y los archivos históricos) y a qué velocidad. Sirve para saber qué datos se pueden usar.' }));
      const connBtn = mk('button', { className: 'btn secondary', textContent: 'Probar conexión' });
      const connOut = mk('div', { className: 'conn-out' });
      connBtn.onclick = async () => {
        connBtn.disabled = true; connBtn.textContent = 'Probando… (puede tardar hasta 1 minuto)'; connOut.innerHTML = '';
        try {
          const r = await API.testConnection();
          r.results.forEach((x) => {
            const row = mk('div', { className: 'conn-row ' + (x.ok ? 'ok' : 'bad') });
            row.append(mk('b', { textContent: (x.ok ? '✓ ' : '✗ ') + x.name }), mk('span', { textContent: ` · ${x.ms} ms` }), mk('div', { className: 'hint', textContent: x.detail }));
            connOut.appendChild(row);
          });
        } catch (e) { connOut.appendChild(mk('div', { className: 'conn-row bad', textContent: 'No se pudo hacer la prueba: ' + e.message })); }
        connBtn.disabled = false; connBtn.textContent = 'Probar conexión otra vez';
      };
      box.append(connBtn, connOut);

      const reset = mk('button', { className: 'btn secondary', textContent: 'Restaurar estilo de este gráfico' });
      reset.onclick = () => {
        ac.candle = defaultCandle(); ac.look = defaultLook(); ac.wm = defaultWm();
        saveCfg(); av.applyCandleStyle(); av.applyLook(); openSettings();
      };
      const close = mk('button', { className: 'btn', textContent: 'Cerrar' });
      close.onclick = closeModal;
      const row = mk('div', { className: 'row-actions' });
      row.append(reset, close);
      box.appendChild(row);
      box.appendChild(mk('div', { className: 'hint', textContent: 'Datos: Binance, Bybit, KuCoin y Bitstamp (API públicas y gratuitas). Tus cambios se guardan automáticamente.' }));
      decoratePalette(box);
    }, { floating: true });
  }

  // ---------- Ventanas y diseños (v0.22) ----------
  const winNum = (id) => Number(String(id).slice(1));
  const hh = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function setupMenu(btnId, listId, build) {
    const btn = $(btnId), list = $(listId);
    const close = () => list.classList.add('hidden');
    btn.onclick = async (e) => {
      e.stopPropagation();
      const wasHidden = list.classList.contains('hidden');
      document.querySelectorAll('.dd-list').forEach((l) => l.classList.add('hidden'));
      if (!wasHidden) return;
      list.innerHTML = '';
      await build(list, close);
      list.classList.remove('hidden');
    };
    document.addEventListener('mousedown', (e) => { if (!list.classList.contains('hidden') && !e.target.closest('#' + listId) && e.target !== btn) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }
  // Pestañas (como un navegador): cada una es una configuración propia (gráficos, activos, temporalidades, gráfico ampliado…).
  // Todas las pestañas abiertas siguen vivas: cambiar de una a otra solo muestra su grid, sin recargar nada. La que no se ve no pide datos.
  const MAXTABS = 10;
  const SHARED_CLIENT = ['templates', 'palette', 'lists', 'scripts', 'theme', 'tz', 'timer'];   // lo demás es propio de cada pestaña
  const gone = (id) => /^(v:|b:)/.test(String(id)) || id === 'blk';
  const sig = (x) => { try { return JSON.stringify(x); } catch (e) { return ''; } };
  // Nombre de la pestaña: LISTA-PAR-TEMPORALIDAD (por ejemplo MACRO-BTCUSDT-4H)
  function tfShort(tf) {
    const m = /^([smhdwM]):(\d+)$/.exec(String(tf || ''));
    if (!m) return '';
    let n = Number(m[2]);
    const u = m[1];
    if (u === 'm') return n >= 60 && n % 60 === 0 ? (n / 60) + 'H' : n + 'MIN';
    return n + ({ s: 'S', h: 'H', d: 'D', w: 'W', M: 'MES' })[u];
  }
  function tabLabelOf(cfg) {
    const c = cfg && cfg.charts && (cfg.charts[cfg.active] || cfg.charts[0]);
    if (!c) return 'BTCUSDT-1H';
    const lst = (cfg.lists || []).find((l) => l.id === cfg.listActive);
    return [lst && lst.name ? String(lst.name).toUpperCase() : '', c.symbol, tfShort(c.tf)].filter(Boolean).join('-');
  }
  const curTabLabel = () => tabLabelOf(A.cfg);
  let switching = false;
  async function switchTab(id) {
    if (id === A.tabId || switching) return;
    switching = true;
    try {
      closeModal();
      const cur = tabsState.get(A.tabId);
      flushTab(A.tabId, false);                       // la pestaña que se deja queda guardada
      let t = tabsState.get(id);
      if (!t) {                                       // primera vez en esta pestaña: se carga su configuración y se crea su grid
        let saved = null;
        try { saved = await API.getConfig(id); } catch (e) { /* valores por defecto */ }
        const cfg = migrate(saved);
        cfg.tfs = (cfg.tfs || []).filter((x) => !gone(x)); if (!cfg.tfs.length) cfg.tfs = L.DEFAULT_TFS.slice();
        (cfg.charts || []).forEach((c) => { if (gone(c.tf)) c.tf = 'm:60'; });
        const gridEl = document.createElement('div');
        gridEl.id = 'grid'; gridEl.className = 'layout-1 tab-off';
        $('gridStack').appendChild(gridEl);
        t = { id, cfg, views: [], gridEl, theme: null, tz: null, scriptsSig: null };
        tabsState.set(id, t);
      }
      // lo compartido (plantillas, listas, scripts, tema…) pasa de la pestaña que se deja a la que se abre
      if (cur) SHARED_CLIENT.forEach((k) => { if (cur.cfg[k] !== undefined) t.cfg[k] = cur.cfg[k]; });
      if (cur) { cur.views.forEach((v) => v.setSuspended(true)); cur.gridEl.classList.add('tab-off'); }
      A.tabId = id; API.setWindow(id);
      A.cfg = t.cfg; A.views = t.views; A.gridEl = t.gridEl;
      t.gridEl.classList.remove('tab-off');
      if (!t.views.length) {
        applyLayout();
        t.theme = A.cfg.theme; t.tz = A.cfg.tz; t.scriptsSig = sig(A.cfg.scripts);
      } else {
        A.max = Number.isInteger(A.cfg.max) && A.cfg.max >= 0 && A.cfg.max < t.views.length ? A.cfg.max : -1;
        applyMax();
        if (t.theme !== A.cfg.theme) { applyTheme(); t.theme = A.cfg.theme; }
        if (t.tz !== A.cfg.tz) { eachView((v) => v.applyTz()); t.tz = A.cfg.tz; }
        if (t.scriptsSig !== sig(A.cfg.scripts)) { eachView((v) => v.refreshScripts && v.refreshScripts(true)); t.scriptsSig = sig(A.cfg.scripts); }
        eachView((v) => { v.applyTimer(); if (v.draw) v.draw.repaint(); v.setSuspended(false); });
        markActive(); renderStatus();
      }
      renderTfButtons();
      if (!$('panel').classList.contains('hidden')) renderPanel();
      if (window.TVBt) TVBt.render();
      if (window.TVWatch) window.TVWatch.refresh();
      if (window.TVDrawUI) window.TVDrawUI.refresh();
      try { const u = new URL(location.href); u.searchParams.set('w', id); history.replaceState(null, '', u.toString()); } catch (e) { /* ok */ }
      Promise.resolve(API.setActive(id)).catch(() => {});
      renderTabs(true);
    } finally { switching = false; }
  }
  let tabsCache = [];
  async function renderTabs(reload) {
    const bar = $('tabBar'); if (!bar) return;
    if (reload || !tabsCache.length) { try { tabsCache = await API.listTabs(); } catch (e) { /* se usa lo último */ } }
    const tabs = tabsCache.map((x) => ({ id: x.id, label: x.label }));
    if (!tabs.some((t) => t.id === A.tabId)) tabs.push({ id: A.tabId, label: curTabLabel() });
    tabs.sort((x, y) => winNum(x.id) - winNum(y.id));
    bar.innerHTML = '';
    tabs.forEach((t) => {
      const live = tabsState.get(t.id);
      const label = t.id === A.tabId ? curTabLabel() : (live ? tabLabelOf(live.cfg) : t.label);
      const el = hh('div', 'tab' + (t.id === A.tabId ? ' cur' : ''));
      const nm = hh('span', 'tab-name', label); el.title = label;
      el.appendChild(nm);
      el.onclick = () => switchTab(t.id);
      if (tabs.length > 1) {
        const x = hh('button', 'tab-x', '×'); x.title = 'Cerrar esta pestaña (se borra su configuración)';
        x.onclick = async (ev) => {
          ev.stopPropagation();
          if (!window.confirm('¿Cerrar la pestaña «' + label + '»? Se borra su configuración.')) return;
          await closeTab(t.id, tabs);
        };
        el.appendChild(x);
      }
      bar.appendChild(el);
    });
    const nb = hh('button', 'tab-new', '+'); nb.title = tabs.length >= MAXTABS ? `Máximo ${MAXTABS} pestañas` : 'Nueva pestaña (gráfico limpio BTCUSDT, 1h)';
    nb.disabled = tabs.length >= MAXTABS;
    nb.onclick = async () => {
      nb.disabled = true;
      try { const r = await API.openWindow(); if (r && r.ok) await switchTab(r.id); else { nb.title = (r && r.error) || 'No se pudo abrir la pestaña.'; nb.disabled = false; } } catch (e) { nb.disabled = false; }
    };
    bar.appendChild(nb);
  }
  async function closeTab(id, tabs) {
    if (id === A.tabId) {
      const rest = tabs.filter((o) => o.id !== id);
      const nxt = rest.find((o) => winNum(o.id) > winNum(id)) || rest[rest.length - 1];
      if (!nxt) return;
      await switchTab(nxt.id);
    }
    const t = tabsState.get(id);
    const e = saveTimers.get(id); if (e) { clearTimeout(e.timer); saveTimers.delete(id); }
    if (t) { t.views.forEach((v) => { try { v.destroy(); } catch (err) { /* ok */ } }); t.gridEl.remove(); tabsState.delete(id); }
    try { await API.closeWindow(id); } catch (err) { /* ok */ }
    renderTabs(true);
  }
  // Cambios compartidos hechos en otra ventana (plantillas, tema, scripts, listas…)
  function applySharedPatch(p) {
    if (!p || typeof p !== 'object') return;
    ['templates', 'palette', 'lists', 'scripts', 'timer'].forEach((k) => { if (p[k] !== undefined) A.cfg[k] = clone(p[k]); });
    if (p.theme !== undefined && p.theme !== A.cfg.theme) { A.cfg.theme = p.theme; applyTheme(); }
    if (p.tz !== undefined && p.tz !== A.cfg.tz) { A.cfg.tz = p.tz; eachView((v) => v.applyTz()); }
    if (p.scripts !== undefined) eachView((v) => v.refreshScripts && v.refreshScripts(true));
    if (p.timer !== undefined) eachView((v) => v.applyTimer());
    if (p.lists !== undefined && window.TVWatch) window.TVWatch.refresh();
  }
  function setupWindowUi() {
    document.title = 'Ar_Trading';
    try { Promise.resolve(API.setActive(A.tabId)).catch(() => {}); } catch (e) { /* ok */ }   // al abrir el programa vuelve esta pestaña
    if (window.desktopApi && window.desktopApi.overlay) document.body.classList.add('has-overlay');
    renderTabs(true);
    if (API.onShared) API.onShared(applySharedPatch);
  }

  // ---------- Plantillas ----------
  // Todo lo visual del gráfico, sin el símbolo ni la temporalidad.
  function snapshotTemplate(c) {
    return clone({ chartType: c.chartType, scale: c.scale, invert: c.invert, ind: c.ind, mas: c.mas, maOn: c.maOn, candle: c.candle, look: c.look, wm: c.wm, order: c.order, paneH: c.paneH || {} });
  }
  function applyTemplate(view, c, d) {
    const t = clone(d);
    if (t.chartType && t.chartType !== c.chartType) view.setChartType(t.chartType);
    c.scale = t.scale || c.scale; c.invert = !!t.invert;
    ['ind', 'mas', 'maOn', 'candle', 'look', 'wm', 'order', 'paneH'].forEach((k) => { if (t[k] !== undefined) c[k] = t[k]; });
    view.setScale(c.scale);
    view.applyCandleStyle(); view.applyLook(); view.refreshMas(); view.refreshIndicators();
    saveCfg(); markActive();
    if (!$('panel').classList.contains('hidden') && view.index === A.cfg.active) renderPanel();
  }

  // ---------- Panel de indicadores ----------
  const refreshInd = () => { saveCfg(); activeView().refreshIndicators(); if (window.TVDrawUI) window.TVDrawUI.refresh(); };
  const refreshMas = () => { saveCfg(); activeView().refreshMas(); if (window.TVDrawUI) window.TVDrawUI.refresh(); };

  // Fila de un indicador: casilla de mostrar + parámetros.
  function indBlock(parent, title, key, fields, hintText) {
    const c = activeCfg().ind[key];
    const box = document.createElement('div');
    box.className = 'ind-block';
    const head = document.createElement('label');
    head.className = 'ind-head';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = c.on;
    const t = document.createElement('span'); t.textContent = title;
    head.append(cb, t);
    box.appendChild(head);
    const params = document.createElement('div');
    params.className = 'ind-params';
    fields.forEach((f) => {
      if (f.type === 'title') {
        const tt = document.createElement('div'); tt.className = 'ind-sub'; tt.textContent = f.label; params.appendChild(tt);
        return;
      }
      const w = document.createElement('label');
      w.className = 'ind-field';
      const lab = document.createElement('span'); lab.textContent = f.label;
      let inp;
      if (f.type === 'select') {
        inp = document.createElement('select');
        f.options.forEach(([v, name]) => { const o = document.createElement('option'); o.value = v; o.textContent = name; inp.appendChild(o); });
        inp.value = c[f.prop];
        inp.onchange = () => { c[f.prop] = inp.value; refreshInd(); };
      } else if (f.type === 'check') {
        inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!c[f.prop];
        inp.onchange = () => { c[f.prop] = inp.checked; refreshInd(); };
      } else if (f.type === 'color') {
        inp = document.createElement('input'); inp.type = 'color'; inp.value = c[f.prop];
        inp.oninput = () => { c[f.prop] = inp.value; refreshInd(); };
      } else {
        inp = document.createElement('input'); inp.type = 'number'; inp.min = f.min; inp.max = f.max; inp.value = c[f.prop];
        inp.onchange = () => {
          const v = Math.max(f.min, Math.min(f.max, parseInt(inp.value, 10) || c[f.prop]));
          inp.value = v; c[f.prop] = v; refreshInd();
        };
      }
      w.append(lab, inp);
      params.appendChild(w);
    });
    box.appendChild(params);
    if (hintText) {
      const hh = document.createElement('div'); hh.className = 'hint small'; hh.textContent = hintText; box.appendChild(hh);
    }
    const sync = () => { params.classList.toggle('off', !c.on); };
    cb.onchange = () => { c.on = cb.checked; sync(); refreshInd(); };
    sync();
    parent.appendChild(box);
  }

  function renderPanel() {
    const p = $('panel');
    p.innerHTML = '';
    const h = document.createElement('h3'); h.textContent = 'Indicadores';
    p.appendChild(h);
    const note = document.createElement('div');
    note.className = 'hint';
    note.textContent = `Gráfico seleccionado: ${A.cfg.active + 1} · ${activeCfg().symbol}. Cada gráfico tiene sus propios indicadores. Valores por defecto de TradingView.`;
    p.appendChild(note);

    const h4a = document.createElement('h4'); h4a.textContent = 'En paneles aparte';
    p.appendChild(h4a);
    const styleOpts = [['solid', 'Continua'], ['dashed', 'Guiones'], ['dotted', 'Puntos']];
    const levelFields = (labels) => [
      { type: 'title', label: labels[0] },
      { label: 'Valor', prop: 'ob', min: 1, max: 99 }, { label: 'Color', prop: 'obColor', type: 'color' }, { label: 'Estilo', prop: 'obStyle', type: 'select', options: styleOpts },
      { type: 'title', label: labels[1] },
      { label: 'Valor', prop: 'mid', min: 1, max: 99 }, { label: 'Color', prop: 'midColor', type: 'color' }, { label: 'Estilo', prop: 'midStyle', type: 'select', options: styleOpts },
      { type: 'title', label: labels[2] },
      { label: 'Valor', prop: 'os', min: 1, max: 99 }, { label: 'Color', prop: 'osColor', type: 'color' }, { label: 'Estilo', prop: 'osStyle', type: 'select', options: styleOpts },
      { type: 'title', label: 'Fondo entre la banda superior e inferior' },
      { label: 'Mostrar', prop: 'bgOn', type: 'check' }, { label: 'Color', prop: 'bgColor', type: 'color' }, { label: 'Opacidad %', prop: 'bgOpacity', min: 0, max: 100 },
    ];
    indBlock(p, 'RSI', 'rsi', [
      { label: 'Período', prop: 'len', min: 2, max: 500 },
      { label: 'Color de la línea', prop: 'color', type: 'color' },
      { label: 'Grosor de la línea', prop: 'width', min: 1, max: 6 },
    ].concat(levelFields(['Sobrecompra', 'Línea central', 'Sobreventa'])), 'También puedes mover el RSI con las flechas de su panel y ajustar su escala con la rueda sobre su barra de valores.');
    indBlock(p, 'Estocástico', 'stoch', [
      { label: '%K', prop: 'k', min: 2, max: 500 },
      { label: 'Suavizado %K', prop: 'sm', min: 1, max: 100 },
      { label: '%D', prop: 'd', min: 1, max: 100 },
      { label: 'Color %K', prop: 'kColor', type: 'color' },
      { label: 'Color %D', prop: 'dColor', type: 'color' },
      { label: 'Grosor de la línea', prop: 'width', min: 1, max: 6 },
    ].concat(levelFields(['Banda superior', 'Banda central', 'Banda inferior'])));

    indBlock(p, 'Delta (compra − venta)', 'delta', [
      { label: 'Color positivo (compra domina)', prop: 'upColor', type: 'color' },
      { label: 'Color negativo (venta domina)', prop: 'downColor', type: 'color' },
    ], 'Volumen de compra agresiva menos venta agresiva de cada vela. Solo hay datos en Binance (Bybit, KuCoin y Bitstamp no entregan el volumen de compra).');
    indBlock(p, 'Delta acumulado (CVD)', 'cvd', [
      { label: 'Color de la línea', prop: 'color', type: 'color' },
      { label: 'Grosor de la línea', prop: 'width', min: 1, max: 6 },
    ], 'Suma del delta desde la primera vela cargada. Al cargar más historial el nivel cambia; lo que importa es la forma.');

    const h4b = document.createElement('h4'); h4b.textContent = 'Sobre el precio';
    p.appendChild(h4b);
    indBlock(p, 'Pivotes', 'pivots', [
      { label: 'Tipo', prop: 'type', type: 'select', options: [['classic', 'Clásicos'], ['fib', 'Fibonacci']] },
      { label: 'Período', prop: 'period', type: 'select', options: [['auto', 'Automático'], ['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']] },
      { label: 'Grosor de la línea', prop: 'width', min: 1, max: 6 },
    ], 'Calculados con el máximo, mínimo y cierre del período anterior. Automático: día hasta 15m, semana hasta 4h, mes en el resto.');

    // Medias móviles: un grupo para EMA y otro para SMA, cada uno con su interruptor.
    const h4c = document.createElement('h4'); h4c.textContent = 'Medias móviles';
    p.appendChild(h4c);
    ['EMA', 'SMA'].forEach((type) => {
      const cfgc = activeCfg();
      const box = document.createElement('div');
      box.className = 'ind-block';
      const head = document.createElement('label');
      head.className = 'ind-head';
      const gcb = document.createElement('input'); gcb.type = 'checkbox'; gcb.checked = !!cfgc.maOn[type];
      const t = document.createElement('span'); t.textContent = type === 'SMA' ? 'Media simple (SMA)' : 'Media exponencial (EMA)';
      head.append(gcb, t);
      box.appendChild(head);
      const params = document.createElement('div');
      params.className = 'ind-params';
      cfgc.mas.filter((m) => m.type === type).forEach((ma) => {
        const row = document.createElement('div');
        row.className = 'ma-row';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = ma.visible; cb.title = 'Mostrar esta línea';
        const k = document.createElement('span'); k.className = 'kind'; k.textContent = type;
        const per = document.createElement('input'); per.type = 'number'; per.min = 1; per.max = 1000; per.value = ma.period; per.title = 'Período';
        const col = document.createElement('input'); col.type = 'color'; col.value = ma.color; col.title = 'Color';
        const wd = document.createElement('input'); wd.type = 'number'; wd.min = 1; wd.max = 6; wd.value = ma.width || 1; wd.title = 'Grosor de la línea (1-6)'; wd.style.width = '44px';
        const del = document.createElement('button'); del.className = 'x'; del.textContent = '×'; del.title = 'Quitar';
        cb.onchange = () => { ma.visible = cb.checked; refreshMas(); };
        per.onchange = () => {
          const v = Math.max(1, Math.min(1000, parseInt(per.value, 10) || ma.period));
          per.value = v; ma.period = v; refreshMas();
        };
        col.oninput = () => { ma.color = col.value; refreshMas(); };
        wd.onchange = () => {
          const v = Math.max(1, Math.min(6, parseInt(wd.value, 10) || 1));
          wd.value = v; ma.width = v; refreshMas();
        };
        del.onclick = () => { cfgc.mas = cfgc.mas.filter((m) => m !== ma); refreshMas(); renderPanel(); };
        row.append(cb, k, per, col, wd, del);
        params.appendChild(row);
      });
      const add = document.createElement('button');
      add.className = 'btn secondary'; add.textContent = `+ Agregar ${type}`;
      add.onclick = () => {
        const n = cfgc.mas.filter((m) => m.type === type).length;
        cfgc.mas.push({ id: `${type}-${Date.now()}`, type, period: 20, color: COLORS[n % COLORS.length], visible: true, width: 1 });
        cfgc.maOn[type] = true;
        refreshMas(); renderPanel();
      };
      params.appendChild(add);
      box.appendChild(params);
      const sync = () => { params.classList.toggle('off', !cfgc.maOn[type]); };
      gcb.onchange = () => { cfgc.maOn[type] = gcb.checked; sync(); refreshMas(); };
      sync();
      p.appendChild(box);
    });
    const rst = document.createElement('button');
    rst.className = 'btn secondary'; rst.textContent = 'Restaurar medias (EMA 59 azul, SMA 249 roja)';
    rst.onclick = () => { activeCfg().mas = defaultMas(); activeCfg().maOn = defaultMaOn(); refreshMas(); renderPanel(); };
    p.appendChild(rst);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Activa el grupo EMA o SMA con su casilla. Cada línea tiene período, color y grosor. Cada gráfico tiene sus propias medias.';
    p.appendChild(hint);
    decoratePalette(p);
  }
  function togglePanel() {
    const p = $('panel');
    if (p.classList.contains('hidden')) { renderPanel(); $('objPanel').classList.add('hidden'); if (window.TVWatch) window.TVWatch.close(); if (window.TVDrawUI) window.TVDrawUI.refresh(); }
    p.classList.toggle('hidden');
    $('btnIndicators').classList.toggle('active', !p.classList.contains('hidden'));
  }

  // ---------- Inicio ----------
  function bindUi() {
    document.querySelectorAll('#typeButtons .tb-btn').forEach((b) => { b.onclick = () => setChartType(b.dataset.type); });
    document.querySelectorAll('#scaleButtons .tb-btn').forEach((b) => { b.onclick = () => setScale(b.dataset.scale); });
    $('btnSymbol').onclick = openSymbolPicker;
    setupDropdown('typeCur', 'typeButtons'); setupDropdown('scaleCur', 'scaleButtons');
    setupWindowUi();
    $('btnWatch').onclick = () => { if (window.TVWatch) window.TVWatch.toggle(); };
    $('btnAuto').onclick = () => { activeView().autoScale(); if (window.TVDrawUI) window.TVDrawUI.refresh(); };
    $('btnLayout').onclick = openLayoutPicker;
    $('btnReplay').onclick = () => { const v = activeView(); if (v.replayState === 'off') v.replayPick(); else v.replayStop(); markActive(); };
    TVScriptUI.init({ A, $, openModal, closeModal, activeView, saveCfg, decorate: decoratePalette });
    TVBt.init({ A, $, activeView, saveCfg, openScript: (a) => TVScriptUI.open(a.scriptId) });
    $('btnScripts').onclick = () => TVScriptUI.toggle();
    $('btnData').onclick = () => { const m = $('modal'); if (!m.classList.contains('hidden') && $('modalBox').dataset.kind === 'data') closeModal(); else openDataPicker(); };
    // iconos también en las listas de tipo y escala
    document.querySelectorAll('#typeButtons .tb-btn').forEach((b) => { b.innerHTML = ICONS[b.dataset.type] + '<span>' + b.textContent + '</span>'; });
    document.querySelectorAll('#scaleButtons .tb-btn').forEach((b) => { b.innerHTML = ICONS[b.dataset.scale] + '<span>' + b.textContent + '</span>'; });
    $('btnSettings').innerHTML = ICONS.settings; $('btnScripts').innerHTML = ICONS.scripts;
    $('btnSettings').onclick = () => { const m = $('modal'); if (!m.classList.contains('hidden') && $('modalBox').dataset.kind === 'settings') closeModal(); else openSettings(); };
    $('btnIndicators').onclick = togglePanel;
    $('modal').onmousedown = (e) => { if (e.target === $('modal')) closeModal(); };
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (!(window.TVDrawUI && window.TVDrawUI.cancelProps())) closeModal(); if (A.max >= 0) { A.max = -1; A.cfg.max = -1; applyMax(); saveCfg(); } }
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === '[' || e.key === ']') {
        const list = sortedTfs();
        const i = list.findIndex((t) => t.id === activeCfg().tf);
        const j = Math.max(0, Math.min(list.length - 1, i + (e.key === ']' ? 1 : -1)));
        if (list[j]) setTimeframe(list[j].id);
      }
    });
  }

  // Une lo guardado (de cualquier versión anterior) con los valores por defecto.
  // Scripts propios (v0.20): biblioteca global y scripts aplicados por gráfico.
  function cleanScriptLib(src) {
    const out = [], used = new Set();
    (Array.isArray(src) ? src : []).forEach((q) => {
      if (!q || typeof q !== 'object' || typeof q.code !== 'string') return;
      let id = typeof q.id === 'string' && q.id ? q.id : 's' + Date.now().toString(36) + out.length;
      while (used.has(id)) id += 'x';
      used.add(id);
      out.push({ id, name: String(q.name || 'Script sin nombre').slice(0, 60), code: q.code });
    });
    return out;
  }
  function cleanApplied(src) {
    const out = [], used = new Set();
    (Array.isArray(src) ? src : []).forEach((a) => {
      if (!a || typeof a !== 'object' || typeof a.scriptId !== 'string') return;
      let uid = typeof a.uid === 'string' && a.uid ? a.uid : 'a' + Date.now().toString(36) + out.length;
      while (used.has(uid)) uid += 'x';
      used.add(uid);
      const params = {};
      if (a.params && typeof a.params === 'object') Object.keys(a.params).forEach((k) => { const v = a.params[k]; if (['number', 'boolean', 'string'].includes(typeof v) && (typeof v !== 'number' || isFinite(v))) params[k] = v; });
      out.push({ uid, scriptId: a.scriptId, params, hide: !!a.hide });
    });
    return out;
  }
  function migrate(saved) {
    const def = defaultConfig();
    if (!saved || typeof saved !== 'object') return def;
    const cfg = Object.assign(def, saved);
    // lo que antes era global (versión 3 o menor) pasa a cada gráfico
    let legacyCandle = saved.candle && saved.candle.body ? saved.candle : defaultCandle();
    if (!(saved.candle && saved.candle.body) && saved.up && saved.down) {
      legacyCandle = defaultCandle();
      ['body', 'border', 'wick'].forEach((k) => { legacyCandle[k].up = saved.up; legacyCandle[k].down = saved.down; });
    }
    const legacyInd = saved.ind || {};
    if (!Array.isArray(saved.charts) || saved.charts.length < 4) {
      const c0 = { symbol: saved.symbol || 'BTCUSDT', tf: saved.tf || 'm:60', chartType: saved.chartType || 'candles', scale: saved.scale || 'normal' };
      const rest = defaultCharts(c0.symbol).slice(1);
      cfg.charts = [Object.assign(newChart(c0.symbol, c0.tf), c0)].concat(rest);
    }
    ['up', 'down', 'symbol', 'tf', 'chartType', 'scale', 'ind', 'mas', 'candle'].forEach((k) => { delete cfg[k]; });
    cfg.sync = Object.assign({ cross: true, time: true }, saved.sync || {});
    if (typeof cfg.timer !== 'boolean') cfg.timer = true;
    if (!Array.isArray(cfg.palette)) cfg.palette = defaultConfig().palette;
    cfg.palette = cfg.palette.filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    if (!Array.isArray(cfg.templates)) cfg.templates = [];
    if (!LAYOUTS[cfg.layout]) cfg.layout = '1';
    const defInd = defaultInd();
    cfg.charts = cfg.charts.slice(0, 4).map((c, i) => {
      const d = newChart(cfg.charts[0].symbol, defaultCharts()[i].tf);
      const out = Object.assign({}, d, c);
      out.tf = L.normalizeId(out.tf);
      out.id = 'c' + (i + 1);
      if (!L.EXCHANGES[out.exchange]) out.exchange = 'binance';
      out.src = out.src === 'trades' ? 'trades' : 'candles';   // v0.18: fuente de las velas
      { const t = out.tr || {}; out.tr = { min: Math.max(0, Number(t.min) || 0), max: Math.max(0, Number(t.max) || 0), mode: t.mode === 'hl' ? 'hl' : 'only', days: [3, 7, 14, 30].includes(Number(t.days)) ? Number(t.days) : 7 }; }
      if (!['candles', 'line', 'area'].includes(out.chartType)) out.chartType = 'candles';
      if (!['normal', 'log', 'percent'].includes(out.scale)) out.scale = 'normal';
      out.invert = !!out.invert;
      const srcInd = c.ind || legacyInd;
      out.ind = {};
      Object.keys(defInd).forEach((k) => { out.ind[k] = Object.assign({}, defInd[k], srcInd[k] || {}); });
      if (c.maOn && Array.isArray(c.mas)) { out.mas = clone(c.mas); out.maOn = Object.assign(defaultMaOn(), c.maOn); }
      else { out.mas = defaultMas(); out.maOn = defaultMaOn(); } // formato anterior: se parte de los nuevos valores por defecto
      out.mas.forEach((m) => { if (!m.width) m.width = 1; });
      out.paneH = Object.assign({}, c.paneH || {});
      out.scripts = cleanApplied(c.scripts);
      {
        const base = ['main', 'rsi', 'stoch', 'delta', 'cvd'];
        let ord = Array.isArray(c.order) ? c.order.filter((n) => base.includes(n)) : null;
        if (!ord || !ord.length) {
          const tops = ['rsi', 'stoch'].filter((n) => srcInd[n] && srcInd[n].pos === 'top');
          ord = tops.concat(['main'], ['rsi', 'stoch'].filter((n) => !tops.includes(n)));
        }
        base.forEach((n) => { if (!ord.includes(n)) ord.push(n); });
        out.order = ord;
      }
      out.candle = clone(c.candle && c.candle.body ? c.candle : legacyCandle);
      out.look = Object.assign(defaultLook(), c.look || {});
      const dw = defaultWm();
      out.wm = Object.assign(dw, c.wm || {});
      ['ticker', 'interval', 'desc', 'name', 'icon'].forEach((k) => { out.wm[k] = Object.assign({}, defaultWm()[k], (c.wm && c.wm[k]) || {}); });
      return out;
    });
    cfg.tfs = (Array.isArray(cfg.tfs) && cfg.tfs.length ? cfg.tfs : L.DEFAULT_TFS).map(L.normalizeId);
    cfg.charts.forEach((c) => { if (!cfg.tfs.includes(c.tf)) cfg.tfs.push(c.tf); });
    const n = LAYOUTS[cfg.layout].n;
    if (!(cfg.active >= 0 && cfg.active < n)) cfg.active = 0;
    cfg.drawings = cleanDrawings(saved.drawings);
    cfg.draw = cleanDrawPrefs(saved.draw);
    cfg.folders = cleanFolders(saved.folders, cfg.drawings);
    cfg.scripts = cleanScriptLib(saved.scripts);
    cfg.charts.forEach((c) => { c.scripts = c.scripts.filter((a) => cfg.scripts.some((q) => q.id === a.scriptId)); });
    cfg.lists = cleanLists(saved.lists, saved.favorites);
    delete cfg.favorites;
    if (!cfg.lists.some((l) => l.id === cfg.listActive)) cfg.listActive = cfg.lists[0].id;
    { // panel del backtest (v0.21)
      const b = saved.bt && typeof saved.bt === 'object' ? saved.bt : {};
      cfg.bt = { h: Math.max(120, Math.min(900, Number(b.h) || 260)), tab: b.tab === 'trades' ? 'trades' : 'report', collapsed: !!b.collapsed };
    }
    cfg.version = 11;
    return cfg;
  }
  // Dibujos guardados: se descarta lo que no tenga sentido (tipo desconocido, puntos inválidos) en vez de romper el gráfico.
  function cleanDrawings(src) {
    const out = {};
    if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
    const ok = (v) => typeof v === 'number' && isFinite(v);
    Object.keys(src).forEach((sym) => {
      if (!Array.isArray(src[sym])) return;
      const list = src[sym].map((d) => {
        // v0.7 → v0.8: el "rayo" inclinado pasa a ser rayo horizontal (a la altura de su primer punto)
        if (d && d.type === 'ray' && Array.isArray(d.pts) && d.pts[0]) return Object.assign({}, d, { type: 'hray', pts: [d.pts[0]] });
        return d;
      }).filter((d) => {
        const spec = d && window.TVDraw.TYPES[d.type];
        if (!spec || spec.ephemeral || !Array.isArray(d.pts) || !d.pts.length) return false;
        if (!d.pts.every((p) => p && ok(p.t) && ok(p.p))) return false;
        if (spec.pts && d.pts.length < spec.pts) return false;
        return true;
      }).map((d, i) => {
        const o = Object.assign(window.TVDraw.defaults(d.type), d);
        if (!o.id) o.id = 'm' + Date.now().toString(36) + i;
        o.locked = !!o.locked; o.hidden = !!o.hidden;
        // v0.12: los dibujos antiguos (sin gráfico propio) se siguen viendo en todos los gráficos del activo; los nuevos son de su gráfico
        if (typeof o.chart !== 'string' || !/^c[1-4]$/.test(o.chart)) { delete o.chart; o.shared = true; } else o.shared = !!o.shared;
        if (o.type === 'fib' && !Array.isArray(o.levels)) o.levels = window.TVDraw.fibLevels();
        if (o.type === 'table') window.TVDraw.fixTable(o);
        return o;
      });
      if (list.length) out[sym] = list;
    });
    return out;
  }
  function cleanDrawPrefs(src) {
    const d = Object.assign(defaultDraw(), src && typeof src === 'object' ? src : {});
    const types = window.TVDraw.TYPES;
    const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    // Herramientas favoritas: "tipo" o "tipo:idDePlantilla". El rayo antiguo pasa a rayo horizontal.
    const favs = [];
    (Array.isArray(d.favs) ? d.favs : []).forEach((f) => {
      let k = String(f);
      if (k === 'ray') k = 'hray';
      if (k.startsWith('ray:')) k = 'hray' + k.slice(3);
      if (types[k.split(':')[0]] && !favs.includes(k)) favs.push(k);
    });
    d.favs = favs;
    // Imán: antes sí/no; ahora apagado / débil / fuerte
    d.magnet = d.magnet === 'weak' || d.magnet === 'strong' ? d.magnet : d.magnet === true || d.magnet === 1 ? 'weak' : 'off';
    ['keep', 'favBar', 'hideAll', 'shareNew'].forEach((k) => { d[k] = !!d[k]; });
    d.styles = isObj(d.styles) ? d.styles : {};
    if (d.styles.ray) { if (!d.styles.hray) d.styles.hray = d.styles.ray; delete d.styles.ray; }
    d.templates = isObj(d.templates) ? d.templates : {};
    Object.keys(d.templates).forEach((t) => {
      const arr = Array.isArray(d.templates[t]) ? d.templates[t].filter((x) => x && typeof x.id === 'string' && isObj(x.style)) : [];
      if (types[t] && arr.length) d.templates[t] = arr.map((x) => ({ id: x.id, name: String(x.name || 'Plantilla'), style: x.style })); else delete d.templates[t];
    });
    const okPos = (fp, def) => (isObj(fp) && ['left', 'right', 'top', 'bottom'].includes(fp.edge) && typeof fp.off === 'number' && isFinite(fp.off)
      ? { edge: fp.edge, off: Math.max(0, Math.min(1, fp.off)) } : def);
    d.favPos = okPos(d.favPos, { edge: 'left', off: 0.2 });
    d.selPos = okPos(d.selPos, { edge: 'top', off: 0.5 });
    return d;
  }
  // Carpetas de dibujos (por activo). Se descartan las dañadas, los ciclos y las referencias a carpetas que no existen.
  function cleanFolders(src, drawings) {
    const out = {};
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      Object.keys(src).forEach((sym) => {
        if (!Array.isArray(src[sym])) return;
        const seen = new Set();
        let fs = src[sym].filter((f) => f && typeof f.id === 'string' && f.id && !seen.has(f.id) && seen.add(f.id))
          .map((f) => ({ id: f.id, name: String(f.name || 'Carpeta'), parent: typeof f.parent === 'string' ? f.parent : null, open: f.open !== false, hidden: !!f.hidden, locked: !!f.locked }));
        const ids = new Set(fs.map((f) => f.id));
        fs.forEach((f) => { if (f.parent && (!ids.has(f.parent) || f.parent === f.id)) f.parent = null; });
        // ciclos: si siguiendo los padres se vuelve a la misma carpeta, se corta
        fs.forEach((f) => {
          const trail = new Set([f.id]);
          let c = f;
          while (c && c.parent) {
            if (trail.has(c.parent)) { c.parent = null; break; }
            trail.add(c.parent); c = fs.find((x) => x.id === c.parent);
          }
        });
        if (fs.length) out[sym] = fs;
      });
    }
    // dibujos que apuntan a una carpeta inexistente vuelven a la raíz
    Object.keys(drawings || {}).forEach((sym) => {
      const ids = new Set((out[sym] || []).map((f) => f.id));
      drawings[sym].forEach((d) => { if (d.folder && !ids.has(d.folder)) delete d.folder; });
    });
    return out;
  }

  async function init() {
    let saved = null;
    try { saved = await API.getConfig(); } catch (e) { /* valores por defecto */ }
    A.cfg = migrate(saved);
    A.tabId = API.windowId || 'w1'; A.gridEl = $('grid');
    // Velas por volumen: desactivadas por ahora (ver NOTAS_VELAS_VOLUMEN.txt). Se limpian de configuraciones guardadas.
    // Velas por volumen y velas por bloque: no están disponibles; se limpian de configuraciones guardadas (v0.15/v0.16 guardaban 'b:N' y 'blk').
    const gone = (id) => /^(v:|b:)/.test(String(id)) || id === 'blk';
    A.cfg.tfs = (A.cfg.tfs || []).filter((id) => !gone(id));
    if (!A.cfg.tfs.length) A.cfg.tfs = L.DEFAULT_TFS.slice();
    (A.cfg.charts || []).forEach((c) => { if (gone(c.tf)) c.tf = 'm:60'; });
    // Dibujos: el almacén se crea antes que los gráficos (cada gráfico se engancha a él).
    G.drawStore = window.TVDraw.createStore(() => A.cfg.drawings, () => A.cfg.draw, saveCfg, () => A.cfg.folders);
    A.drawStore = G.drawStore; // para depuración (F12)
    bindUi();
    { const bl = $('brandLogo'); if (bl) bl.src = 'assets/logo-h-' + (A.cfg.theme === 'light' ? 'light' : 'dark') + '.png'; }
    applyLayout();
    tabsState.set(A.tabId, { id: A.tabId, cfg: A.cfg, views: A.views, gridEl: A.gridEl, theme: A.cfg.theme, tz: A.cfg.tz, scriptsSig: sig(A.cfg.scripts) });
    window.TVDrawUI.init({ store: G.drawStore, A, $, openModal, closeModal, decoratePalette, activeView, activeCfg, eachView, saveCfg, refreshInd, refreshMas, renderPanel });
    if (window.TVWatch) window.TVWatch.init({ A, $, L, API, activeCfg, activeView, setSymbol, loadSymbols, saveCfg, openModal, closeModal });
    const used = new Set(['binance']);
    (A.cfg.charts || []).forEach((c) => used.add(c.exchange || 'binance'));
    used.forEach((ex) => loadSymbols(ex).then(() => eachView((v) => v.applyLook())).catch(() => {}));
  }

  // Las ventanas flotantes (Ajustes, propiedades de dibujos...) se cierran al hacer clic fuera de ellas
  document.addEventListener('mousedown', (e) => {
    const m = $('modal');
    if (m.classList.contains('hidden') || !m.classList.contains('floating')) return;
    const t = e.target;
    if (t.closest && (t.closest('#modalBox') || t.closest('.pal-pop') || t.closest('.ctx-menu') || t.closest('.tpl-menu') || t.closest('#btnSettings') || t.closest('#btnData') || t.closest('#btnScripts'))) return;
    closeModal();
  }, true);

  window.__tv = A; // para depuración (F12)
  init();
})();

// Listas de seguimiento (v0.11): varias listas con nombre; cada activo guarda su exchange.
// Precio y % 24 h se piden cada 5 s a cada exchange mientras el panel está abierto. Si falla, se muestra el error.
(function () {
  let X = null;
  let timer = null;
  let editing = null; // null | 'new' | 'rename'
  let addErr = '';
  const data = {};   // 'ex|SYM' -> { price, pct }
  const errs = {};   // ex -> texto de error
  let sig = '';

  const $p = () => X.$('watchPanel');
  const isOpen = () => !$p().classList.contains('hidden');
  const lists = () => X.A.cfg.lists;
  const active = () => lists().find((l) => l.id === X.A.cfg.listActive) || lists()[0];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  function fmtPrice(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    const a = Math.abs(v);
    const d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8;
    return v.toFixed(d);
  }
  function fmtPct(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '';
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  // ---------- Iconos de los activos ----------
  // Se piden a dos servicios públicos de iconos; si ninguno tiene el icono (o no hay internet) se dibuja un círculo con la letra.
  const QUOTES = /^(.+?)(USDT|USDC|FDUSD|BUSD|TUSD|USD|EUR|GBP|BTC|ETH|BNB)$/;
  function baseOf(sym, ex) {
    const info = X.A.symbolsBy[ex] && X.A.symbolsBy[ex].find((k) => k.symbol === sym);
    if (info && info.base) return info.base;
    const m = QUOTES.exec(sym);
    return m ? m[1] : sym;
  }
  const ICON_SRC = [
    (b) => `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${b}.png`,
    (b) => `https://assets.coincap.io/assets/icons/${b}@2x.png`,
  ];
  const badIcons = new Set();
  function makeIcon(base) {
    const b = String(base || '?').toLowerCase().replace(/[^a-z0-9]/g, '');
    const wrap = el('span', 'wl-icon');
    let h = 0;
    for (let i = 0; i < b.length; i++) h = (h * 31 + b.charCodeAt(i)) % 360;
    const letter = () => { wrap.innerHTML = ''; wrap.classList.add('letter'); wrap.style.background = `hsl(${h} 45% 38%)`; wrap.textContent = (b[0] || '?').toUpperCase(); };
    if (!b || badIcons.has(b)) { letter(); return wrap; }
    let n = 0;
    const img = document.createElement('img');
    img.alt = ''; img.loading = 'lazy'; img.width = 20; img.height = 20;
    img.onerror = () => { n++; if (n < ICON_SRC.length) img.src = ICON_SRC[n](b); else { badIcons.add(b); letter(); } };
    img.src = ICON_SRC[0](b);
    wrap.appendChild(img);
    return wrap;
  }

  // ---------- Ventana "Añadir símbolo" (buscador con sugerencias y todos los exchanges) ----------
  const QPREF = ['USDT', 'USD', 'USDC', 'EUR', 'BTC'];
  function rank(it, q) {
    const sy = it.symbol, ba = it.base || '';
    if (!q) return 5;
    if (sy === q || ba === q) return 0;
    if (ba.startsWith(q)) return 1;
    if (sy.startsWith(q)) return 2;
    if (ba.includes(q)) return 3;
    if (sy.includes(q)) return 4;
    return -1;
  }
  function openAdd() {
    let pickEx = 'all';
    const errsLoad = {};
    let shown = [];
    let selIdx = 0;
    X.openModal((box) => {
      box.classList.add('wide');
      const h = el('h3', '', 'Añadir símbolo a "' + active().name + '"');
      const input = el('input', 'sym-search'); input.type = 'text'; input.placeholder = 'Escribe un nombre o símbolo: BTC, ETH, SOL…';
      input.autocomplete = 'off'; input.spellcheck = false;
      const tabs = el('div', 'group ex-tabs');
      const list = el('div', 'sym-list wl-results');
      const foot = el('div', 'row-actions');
      const done = el('button', 'btn secondary', 'Cerrar'); done.onclick = () => X.closeModal();
      foot.appendChild(done);
      box.append(h, input, tabs, list, foot);

      const exIds = Object.keys(X.L.EXCHANGES);
      const has = (x, sy) => active().items.some((it) => it.x === x && it.s === sy);
      function toggleItem(x, sy) {
        const l = active();
        const i = l.items.findIndex((it) => it.x === x && it.s === sy);
        if (i >= 0) l.items.splice(i, 1); else l.items.push({ s: sy, x });
        X.saveCfg(); sig = ''; render(); renderRows(); poll();
      }
      function ensure() {
        (pickEx === 'all' ? exIds : [pickEx]).forEach((x) => {
          if (X.A.symbolsBy[x] || errsLoad[x] === 'loading') return;
          errsLoad[x] = 'loading';
          X.loadSymbols(x).then(() => { delete errsLoad[x]; renderRows(); }, (e) => { errsLoad[x] = (e && e.message) || String(e); renderRows(); });
        });
      }
      function renderTabs() {
        tabs.innerHTML = '';
        [['all', 'Todos']].concat(exIds.map((x) => [x, X.L.exchangeName(x)])).forEach(([id, name]) => {
          const b = el('button', 'tb-btn' + (id === pickEx ? ' active' : ''), name);
          b.onclick = () => { pickEx = id; selIdx = 0; ensure(); renderTabs(); renderRows(); input.focus(); };
          tabs.appendChild(b);
        });
      }
      function renderRows() {
        const q = input.value.trim().toUpperCase();
        const exs = pickEx === 'all' ? exIds : [pickEx];
        let all = [];
        exs.forEach((x) => (X.A.symbolsBy[x] || []).forEach((k) => all.push(Object.assign({ x }, k))));
        let res = [];
        all.forEach((k) => { const rk = rank(k, q); if (rk >= 0) res.push([rk, k]); });
        res.sort((a, b) => a[0] - b[0]
          || (QPREF.indexOf(a[1].quote) + 1 || 99) - (QPREF.indexOf(b[1].quote) + 1 || 99)
          || exIds.indexOf(a[1].x) - exIds.indexOf(b[1].x)
          || a[1].symbol.localeCompare(b[1].symbol));
        shown = res.slice(0, 80).map((a) => a[1]);
        if (selIdx >= shown.length) selIdx = Math.max(0, shown.length - 1);
        list.innerHTML = '';
        exs.forEach((x) => {
          if (errsLoad[x] && errsLoad[x] !== 'loading') list.appendChild(el('div', 'wl-err', `No se pudo cargar la lista de ${X.L.exchangeName(x)}: ${errsLoad[x]}`));
          else if (!X.A.symbolsBy[x]) list.appendChild(el('div', 'hint', `Cargando la lista de ${X.L.exchangeName(x)}…`));
        });
        shown.forEach((k, i) => {
          const row = el('div', 'sym-item wl-res' + (i === selIdx ? ' sel' : ''));
          const left = el('span', 'wl-res-l');
          left.append(makeIcon(k.base), el('b', '', k.symbol), el('small', '', k.quote ? `${k.base} / ${k.quote}` : ''));
          const right = el('span', 'wl-res-r');
          right.append(el('small', 'wl-tag', X.L.exchangeName(k.x)), el('span', 'wl-state' + (has(k.x, k.symbol) ? ' on' : ''), has(k.x, k.symbol) ? '✓' : '+'));
          row.append(left, right);
          row.onclick = () => toggleItem(k.x, k.symbol);
          row.onmouseenter = () => { selIdx = i; list.querySelectorAll('.wl-res').forEach((e, j) => e.classList.toggle('sel', j === i)); };
          list.appendChild(row);
        });
        if (!shown.length && exs.every((x) => X.A.symbolsBy[x])) list.appendChild(el('div', 'hint', q ? `No hay resultados para "${q}".` : 'No hay símbolos.'));
        if (res.length > shown.length) list.appendChild(el('div', 'hint', 'Hay más resultados: escribe más letras para afinar la búsqueda.'));
      }
      input.oninput = () => { selIdx = 0; renderRows(); };
      input.onkeydown = (e) => {
        if (e.key === 'ArrowDown') { selIdx = Math.min(shown.length - 1, selIdx + 1); renderRows(); e.preventDefault(); const s2 = list.querySelector('.wl-res.sel'); if (s2) s2.scrollIntoView({ block: 'nearest' }); }
        else if (e.key === 'ArrowUp') { selIdx = Math.max(0, selIdx - 1); renderRows(); e.preventDefault(); const s2 = list.querySelector('.wl-res.sel'); if (s2) s2.scrollIntoView({ block: 'nearest' }); }
        else if (e.key === 'Enter') { const k = shown[selIdx]; if (k) toggleItem(k.x, k.symbol); }
      };
      renderTabs(); ensure(); renderRows();
      setTimeout(() => input.focus(), 0);
    }, { onClose: () => { sig = ''; render(); } });
  }

  function toggle() { isOpen() ? close() : open(); }
  function open() {
    X.$('panel').classList.add('hidden'); X.$('btnIndicators').classList.remove('active');
    X.$('objPanel').classList.add('hidden');
    if (window.TVDrawUI) window.TVDrawUI.refresh();
    $p().classList.remove('hidden');
    X.$('btnWatch').classList.add('active');
    sig = ''; render(); poll();
    // se cargan las listas de símbolos de los exchanges usados (para conocer la moneda base y mostrar su icono)
    [...new Set(active().items.map((it) => it.x))].forEach((x) => X.loadSymbols(x).then(() => { sig = ''; render(); }, () => {}));
    clearInterval(timer); timer = setInterval(poll, 5000);
  }
  function close() {
    $p().classList.add('hidden');
    X.$('btnWatch').classList.remove('active');
    clearInterval(timer); timer = null;
  }

  function poll() {
    if (!isOpen()) return;
    const by = {};
    active().items.forEach((it) => { (by[it.x] = by[it.x] || []).push(it.s); });
    Object.keys(by).forEach((ex) => {
      X.API.tickers(ex, by[ex]).then((res) => {
        errs[ex] = '';
        by[ex].forEach((s) => { data[ex + '|' + s] = res && res[s] ? res[s] : null; });
        render();
      }, (e) => { errs[ex] = (e && e.message) || String(e); render(); });
    });
  }

  function save() { X.saveCfg(); sig = ''; render(); }
  function newId() { let i = Date.now().toString(36); while (lists().some((l) => l.id === i)) i += 'x'; return i; }

  function addItem(s, x) {
    s = String(s || '').trim().toUpperCase();
    addErr = '';
    if (!/^[A-Z0-9]{3,20}$/.test(s)) { addErr = 'Escribe un símbolo válido, por ejemplo BTCUSDT.'; render(); return; }
    const l = active();
    if (l.items.some((it) => it.s === s && it.x === x)) { addErr = `${s} ya está en la lista (${X.L.exchangeName(x)}).`; render(); return; }
    const known = X.A.symbolsBy[x];
    if (known && !known.some((k) => k.symbol === s)) { addErr = `${s} no existe en ${X.L.exchangeName(x)} spot.`; render(); return; }
    l.items.push({ s, x });
    save(); poll();
  }

  function render() {
    const p = $p();
    if (!isOpen()) return;
    const l = active();
    const vc = X.activeCfg();
    const cur = (vc.exchange || 'binance') + '|' + vc.symbol;
    const s2 = JSON.stringify([X.A.cfg.lists, X.A.cfg.listActive, editing, addErr, cur, errs, Object.keys(data).map((k) => data[k]), Object.keys(X.A.symbolsBy)]);
    if (s2 === sig) return;
    sig = s2;
    const focusId = document.activeElement && document.activeElement.id;
    const keep = p.scrollTop;
    p.innerHTML = '';
    p.appendChild(el('h3', '', 'Listas de seguimiento'));

    // selector de lista
    const top = el('div', 'wl-top');
    if (editing) {
      const inp = el('input'); inp.type = 'text'; inp.id = 'wlName'; inp.maxLength = 40;
      inp.value = editing === 'rename' ? l.name : ''; inp.placeholder = 'Nombre de la lista';
      const ok = el('button', 'btn', 'Aceptar');
      const no = el('button', 'btn secondary', 'Cancelar');
      const done = () => {
        const n = inp.value.trim().slice(0, 40);
        if (!n) { editing = null; save(); return; }
        if (editing === 'new') { const nl = { id: newId(), name: n, items: [] }; lists().push(nl); X.A.cfg.listActive = nl.id; }
        else l.name = n;
        editing = null; save(); poll();
      };
      ok.onclick = done; no.onclick = () => { editing = null; save(); };
      inp.onkeydown = (e) => { if (e.key === 'Enter') done(); else if (e.key === 'Escape') { editing = null; save(); } };
      top.append(inp, ok, no);
    } else {
      const sel = el('select', 'wl-sel');
      lists().forEach((x) => { const o = el('option', '', `${x.name} (${x.items.length})`); o.value = x.id; if (x.id === l.id) o.selected = true; sel.appendChild(o); });
      sel.onchange = () => { X.A.cfg.listActive = sel.value; save(); poll(); };
      const bn = el('button', 'tb-btn', '+'); bn.title = 'Nueva lista'; bn.onclick = () => { editing = 'new'; sig = ''; render(); };
      const br = el('button', 'tb-btn', 'Renombrar'); br.onclick = () => { editing = 'rename'; sig = ''; render(); };
      const bd = el('button', 'tb-btn', 'Borrar'); bd.title = 'Borrar esta lista';
      bd.disabled = lists().length < 2;
      bd.onclick = () => {
        if (lists().length < 2) return;
        if (!window.confirm(`¿Borrar la lista "${l.name}"?`)) return;
        X.A.cfg.lists = lists().filter((x) => x.id !== l.id);
        X.A.cfg.listActive = X.A.cfg.lists[0].id;
        save(); poll();
      };
      top.append(sel, bn, br, bd);
    }
    p.appendChild(top);

    // añadir activo: abre el buscador con todos los exchanges
    const addBtn = el('button', 'btn wl-addbtn', '+ Añadir símbolo');
    addBtn.onclick = openAdd;
    p.appendChild(addBtn);
    const bc = el('button', 'btn secondary wl-cur', `+ Añadir ${vc.symbol} (${X.L.exchangeName(vc.exchange || 'binance')}) del gráfico activo`);
    bc.onclick = () => addItem(vc.symbol, vc.exchange || 'binance');
    p.appendChild(bc);
    if (addErr) p.appendChild(el('div', 'wl-err', addErr));

    // errores de datos
    Object.keys(errs).forEach((ex) => {
      if (errs[ex] && l.items.some((it) => it.x === ex)) p.appendChild(el('div', 'wl-err', `No se pudieron leer los precios de ${X.L.exchangeName(ex)}: ${errs[ex]}`));
    });

    // filas
    if (!l.items.length) p.appendChild(el('div', 'hint', 'La lista está vacía. Añade activos arriba.'));
    l.items.forEach((it, i) => {
      const row = el('div', 'wl-row' + (it.x + '|' + it.s === cur ? ' sel' : ''));
      const name = el('span', 'wl-name');
      name.append(makeIcon(baseOf(it.s, it.x)), el('span', 'wl-sym', it.s));
      if (it.x !== 'binance') name.appendChild(el('small', 'wl-tag', X.L.exchangeName(it.x)));
      const d = data[it.x + '|' + it.s];
      const pr = el('span', 'wl-price', d ? fmtPrice(d.price) : (errs[it.x] ? '—' : '…'));
      const pc = el('span', 'wl-pct ' + (d && d.pct > 0 ? 'up' : d && d.pct < 0 ? 'down' : ''), d ? fmtPct(d.pct) : '');
      const acts = el('span', 'wl-acts');
      const mk = (t, title, fn, dis) => { const b = el('button', 'wl-b', t); b.title = title; b.disabled = !!dis; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
      acts.append(
        mk('▲', 'Subir', () => { [l.items[i - 1], l.items[i]] = [l.items[i], l.items[i - 1]]; save(); }, i === 0),
        mk('▼', 'Bajar', () => { [l.items[i + 1], l.items[i]] = [l.items[i], l.items[i + 1]]; save(); }, i === l.items.length - 1),
        mk('×', 'Quitar de la lista', () => { l.items.splice(i, 1); save(); })
      );
      row.append(name, pr, pc, acts);
      row.onclick = () => X.setSymbol(it.s, it.x);
      p.appendChild(row);
    });
    p.scrollTop = keep;
    if (focusId) { const f = document.getElementById(focusId); if (f) f.focus(); }
  }

  window.TVWatch = {
    init(ctx) { X = ctx; X.loadSymbols('binance').catch(() => {}); },
    icon: (sym, ex) => makeIcon(baseOf(sym, ex || 'binance')),
    toggle, close, refresh() { sig = ''; render(); },
  };
})();

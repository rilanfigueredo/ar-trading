// Listas de seguimiento (v0.11): varias listas con nombre; cada activo guarda su exchange.
// Precio y % 24 h se piden cada 5 s a cada exchange mientras el panel está abierto. Si falla, se muestra el error.
(function () {
  let X = null;
  let timer = null;
  let editing = null; // null | 'new' | 'rename'
  let addEx = 'binance';
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

  function toggle() { isOpen() ? close() : open(); }
  function open() {
    X.$('panel').classList.add('hidden'); X.$('btnIndicators').classList.remove('active');
    X.$('objPanel').classList.add('hidden');
    if (window.TVDrawUI) window.TVDrawUI.refresh();
    $p().classList.remove('hidden');
    X.$('btnWatch').classList.add('active');
    sig = ''; render(); poll();
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
    const s2 = JSON.stringify([X.A.cfg.lists, X.A.cfg.listActive, editing, addEx, addErr, cur, errs, Object.keys(data).map((k) => data[k])]);
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

    // añadir activo
    const add = el('div', 'wl-add');
    const exs = el('select', 'wl-ex');
    Object.keys(X.L.EXCHANGES).forEach((id) => { const o = el('option', '', X.L.exchangeName(id)); o.value = id; if (id === addEx) o.selected = true; exs.appendChild(o); });
    exs.onchange = () => { addEx = exs.value; X.loadSymbols(addEx).catch(() => {}); sig = ''; render(); };
    const inp = el('input'); inp.type = 'text'; inp.id = 'wlAdd'; inp.placeholder = 'Símbolo, ej. ETHUSDT';
    const go = el('button', 'btn', 'Añadir');
    go.onclick = () => addItem(inp.value, addEx);
    inp.onkeydown = (e) => { if (e.key === 'Enter') addItem(inp.value, addEx); };
    add.append(exs, inp, go);
    p.appendChild(add);
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
      const name = el('span', 'wl-name', it.s);
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
    toggle, close, refresh() { sig = ''; render(); },
  };
})();

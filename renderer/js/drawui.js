// Ar_Trading - interfaz de las herramientas de dibujo (v0.8): barra lateral con menús (imán débil/fuerte, plantillas),
// barra de favoritos movible, barra de selección (uno o varios dibujos), ventana de propiedades (Plantilla / Aceptar / Cancelar),
// panel "Objetos" con carpetas y subcarpetas (barra derecha), menú de clic derecho y atajos.
(function (root) {
  'use strict';
  const D = root.TVDraw;

  const ICONS = {
    cursor: '<path d="M5 3l13 8-6 1.8L9.5 19z" fill="currentColor"/>',
    trend: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><line x1="6.5" y1="17.5" x2="17.5" y2="6.5"/>',
    hline: '<line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="2"/>',
    hray: '<circle cx="5" cy="12" r="2"/><line x1="7" y1="12" x2="21" y2="12"/><path d="M17 8l4 4-4 4"/>',
    channel: '<line x1="3" y1="14" x2="18" y2="4"/><line x1="6" y1="21" x2="21" y2="11"/>',
    poly: '<polyline points="3,18 9,8 15,15 21,5"/>',
    fib: '<line x1="3" y1="4" x2="21" y2="4"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/>',
    rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
    text: '<path d="M5 6h14M12 6v13"/>',
    ruler: '<rect x="2" y="9" width="20" height="7" rx="1"/><path d="M6 9v3M10 9v4M14 9v3M18 9v4"/>',
    magnet: '<path d="M6 3v8a6 6 0 0012 0V3h-4v8a2 2 0 01-4 0V3z"/>',
    keep: '<path d="M12 17v5M8 3h8l-1 7 3 3v2H6v-2l3-3z"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="21" x2="21" y2="3"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017-2.5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    folder: '<path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1z"/>',
    folderadd: '<path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1z"/><path d="M12 10v6M9 13h6"/>',
    caret: '<path d="M9 6l6 6-6 6"/>',
    grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3"/>',
    out: '<path d="M14 4h6v6M20 4l-9 9M10 6H5a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-5"/>',
  };
  const svg = (name, size) => `<svg viewBox="0 0 24 24" width="${size || 20}" height="${size || 20}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const SHORTCUT = { trend: 'Alt+T', hline: 'Alt+H', fib: 'Alt+F', rect: 'Alt+R' };
  const MAGNET = { off: 'Imán apagado', weak: 'Imán débil', strong: 'Imán fuerte' };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const hexOk = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#2962ff');

  let X = null;      // enlace con app.js
  let store = null;
  const lastTool = { lines: 'trend', fib: 'fib', shapes: 'rect', text: 'text' };
  let flyout = null, ctxMenu = null, tplMenu = null;
  const sel = { key: null, refs: null };
  let treeSig = '';
  let props = null;   // ventana de propiedades abierta: { sym, id, done }
  let dragData = null;

  const prefs = () => store.prefs();
  const symNow = () => X.activeCfg().symbol;
  const layerNow = () => { const v = X.activeView(); return v && v.draw; };
  const catOf = (type) => D.TYPES[type].cat;
  const parseFav = (f) => { const i = String(f).indexOf(':'); return i < 0 ? { type: f, tpl: null } : { type: f.slice(0, i), tpl: f.slice(i + 1) }; };
  const magnetMode = () => { const m = prefs().magnet; return m === 'weak' || m === 'strong' ? m : 'off'; };

  // ---------- Acciones ----------
  function selectTool(type, tplId) {
    if (type && store.state.tool === type && (store.state.template || null) === (tplId || null)) { store.setTool(null); return; }
    if (type) {
      lastTool[catOf(type)] = type;
      if (prefs().hideAll) { prefs().hideAll = false; X.saveCfg(); }
    }
    store.setTool(type, tplId);
  }
  function toggleFav(key) {
    const f = prefs().favs;
    const i = f.indexOf(key);
    if (i >= 0) f.splice(i, 1); else f.push(key);
    X.saveCfg();
    renderAll();
  }
  function setPref(key, val) { prefs()[key] = val; X.saveCfg(); renderAll(); X.eachView((v) => v.draw && v.draw.repaint()); }
  const shiftFn = () => { const layer = layerNow(); return layer ? (pt) => layer.offsetPoint(pt, 26, 26) : null; };
  const selIds = () => store.selIds(symNow());
  const unlocked = (sym, ids) => ids.filter((id) => { const d = store.get(sym, id); return d && !d.locked; });
  function deleteSel() {
    const sym = symNow(), ids = unlocked(sym, selIds());
    if (ids.length) store.removeMany(sym, ids);
  }
  function duplicateSel() {
    const sym = symNow(), ids = selIds();
    if (ids.length) store.duplicateMany(sym, ids, shiftFn());
  }
  function confirmClear() {
    const sym = symNow(), n = store.list(sym).length;
    if (!n) return;
    X.openModal((box) => {
      box.appendChild(el('h3', '', 'Eliminar todos los dibujos'));
      box.appendChild(el('p', 'hint', `Se borrarán los ${n} dibujos de ${sym} (y sus carpetas). Puedes deshacerlo con Ctrl+Z.`));
      const row = el('div', 'row-actions');
      const ok = el('button', 'btn', 'Eliminar todos');
      ok.onclick = () => { store.clear(sym); X.closeModal(); };
      const no = el('button', 'btn secondary', 'Cancelar');
      no.onclick = () => X.closeModal();
      row.append(ok, no);
      box.appendChild(row);
    });
  }

  // Pide un nombre (no existe prompt() en Electron). Si se pasa "parents", también pregunta dentro de qué carpeta va.
  function askName(title, initial, opts, cb) {
    const sym = symNow();
    X.openModal((box) => {
      box.appendChild(el('h3', '', title));
      if (opts && opts.hint) box.appendChild(el('p', 'hint', opts.hint));
      const inp = el('input'); inp.type = 'text'; inp.value = initial || ''; inp.style.width = '100%';
      box.appendChild(inp);
      let parentSel = null;
      if (opts && opts.askParent) {
        const f = el('div', 'field'); f.appendChild(el('span', '', 'Dentro de la carpeta'));
        parentSel = el('select');
        const o0 = el('option', '', '(ninguna: carpeta principal)'); o0.value = ''; parentSel.appendChild(o0);
        const walk = (pid, depth) => store.folders(sym).filter((x) => (x.parent || null) === pid).forEach((x) => {
          const o = el('option', '', '— '.repeat(depth) + x.name); o.value = x.id; parentSel.appendChild(o); walk(x.id, depth + 1);
        });
        walk(null, 0);
        parentSel.value = opts.parent && store.folder(sym, opts.parent) ? opts.parent : '';
        f.appendChild(parentSel); box.appendChild(f);
      }
      const go = () => { const v = inp.value.trim(); if (!v) return; X.closeModal(); cb(v, parentSel && parentSel.value ? parentSel.value : null); };
      const row = el('div', 'row-actions');
      const ok = el('button', 'btn', (opts && opts.ok) || 'Aceptar'); ok.onclick = go;
      const no = el('button', 'btn secondary', 'Cancelar'); no.onclick = () => X.closeModal();
      row.append(ok, no); box.appendChild(row);
      inp.onkeydown = (e) => { if (e.key === 'Enter') go(); else if (e.key === 'Escape') X.closeModal(); };
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    });
  }
  function newFolder(ids, parent) {
    const sym = symNow();
    askName(ids && ids.length ? `Agrupar ${ids.length} dibujos en una carpeta` : 'Nueva carpeta', 'Carpeta nueva',
      { askParent: true, parent, ok: 'Crear', hint: parent ? '' : 'Ejemplo: "ESTRUCTURA 4H". Dentro puedes crear subcarpetas como "LIQUIDEZ 4H" o "RANGOS 4H".' },
      (name, par) => { store.addFolder(sym, { name, parent: par, ids: ids || [] }); });
  }

  // ---------- Menús flotantes ----------
  function closeFly() {
    if (flyout) { flyout.remove(); flyout = null; }
    if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
    closeTpl();
  }
  function closeTpl() { if (tplMenu) { tplMenu.remove(); tplMenu = null; } }
  document.addEventListener('mousedown', (e) => {
    if ((flyout && !flyout.contains(e.target)) || (ctxMenu && !ctxMenu.contains(e.target))) {
      if (flyout) { flyout.remove(); flyout = null; }
      if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
    }
    if (tplMenu && !tplMenu.contains(e.target) && !(e.target.closest && e.target.closest('[data-tplbtn]'))) closeTpl();
    // La ventana de propiedades se cierra (aceptando los cambios) al hacer clic fuera de ella, por ejemplo en el gráfico.
    if (props && !props.done) {
      const t = e.target;
      const inside = t.closest && (t.closest('#modalBox') || t.closest('.pal-pop') || t.closest('.tpl-menu') || t.closest('.ctx-menu'));
      if (!inside) X.closeModal();
    }
  }, true);

  function placeMenu(m, anchor, side) {
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    if (side === 'right') { m.style.left = Math.min(window.innerWidth - m.offsetWidth - 6, r.right + 4) + 'px'; m.style.top = Math.max(6, Math.min(window.innerHeight - m.offsetHeight - 6, r.top)) + 'px'; }
    else if (side === 'left') { m.style.left = Math.max(6, r.left - m.offsetWidth - 4) + 'px'; m.style.top = Math.max(6, Math.min(window.innerHeight - m.offsetHeight - 6, r.top)) + 'px'; }
    else { m.style.left = Math.max(6, Math.min(window.innerWidth - m.offsetWidth - 6, r.left)) + 'px'; m.style.top = Math.max(6, Math.min(window.innerHeight - m.offsetHeight - 6, r.bottom + 4)) + 'px'; }
  }

  function openFlyout(anchor, cat) {
    closeFly();
    const m = el('div', 'ctx-menu db-fly');
    cat.tools.forEach((t) => {
      const row = (label, key, tplId, cls, favKey) => {
        const b = el('div', 'ctx-item db-row' + (cls ? ' ' + cls : ''));
        const ic = el('span', 'db-ic'); ic.innerHTML = svg(t, 18);
        const star = el('button', 'fav-star' + (prefs().favs.includes(favKey) ? ' on' : ''));
        star.innerHTML = svg('star', 15); star.title = 'Añadir o quitar de la barra de favoritos';
        star.onclick = (e) => { e.stopPropagation(); toggleFav(favKey); star.classList.toggle('on', prefs().favs.includes(favKey)); };
        b.append(ic, el('span', 'db-label', label), el('span', 'db-key', key || ''), star);
        b.onclick = () => { closeFly(); selectTool(t, tplId); };
        m.appendChild(b);
      };
      row(D.TYPES[t].label, SHORTCUT[t], null, '', t);
      store.templates(t).forEach((tp) => row('Plantilla: ' + tp.name, '', tp.id, 'db-tpl', `${t}:${tp.id}`));
    });
    placeMenu(m, anchor, 'right');
    flyout = m;
  }
  function openMagnetMenu(anchor) {
    closeFly();
    const m = el('div', 'ctx-menu');
    ['off', 'weak', 'strong'].forEach((k) => {
      const b = el('button', 'ctx-item');
      b.append(el('span', 'ctx-check', magnetMode() === k ? '✓' : ''), el('span', '', MAGNET[k]));
      b.title = k === 'weak' ? 'Se pega a máximo/mínimo/apertura/cierre solo si el cursor está cerca' : k === 'strong' ? 'Se pega siempre al valor más cercano de la vela' : 'Los puntos quedan donde haces clic';
      b.onclick = () => { closeFly(); setPref('magnet', k); };
      m.appendChild(b);
    });
    placeMenu(m, anchor, 'right');
    ctxMenu = m;
  }

  function showCtx(x, y, sym, id) {
    closeFly();
    const d = store.get(sym, id);
    if (!d) return;
    const ids = selIds();
    const many = ids.length > 1;
    const m = el('div', 'ctx-menu');
    const item = (text, fn) => {
      const b = el('button', 'ctx-item');
      b.append(el('span', 'ctx-check', ''), el('span', '', text));
      b.onclick = () => { closeFly(); fn(); };
      m.appendChild(b);
    };
    if (!many) item('Propiedades…', () => openProps(sym, id));
    item(many ? `Duplicar (${ids.length})` : 'Duplicar', duplicateSel);
    item(many ? 'Agrupar en carpeta…' : 'Meter en una carpeta…', () => newFolder(ids, null));
    if (d.folder) item('Sacar de la carpeta', () => store.moveToFolder(sym, ids, null));
    item(d.locked ? 'Desbloquear' : 'Bloquear', () => store.patchMany(sym, ids, { locked: !d.locked }));
    item('Ocultar', () => store.patchMany(sym, ids, { hidden: true }));
    item(many ? `Eliminar (${ids.length})` : 'Eliminar', deleteSel);
    document.body.appendChild(m);
    m.style.left = Math.min(x, window.innerWidth - m.offsetWidth - 6) + 'px';
    m.style.top = Math.min(y, window.innerHeight - m.offsetHeight - 6) + 'px';
    ctxMenu = m;
  }

  // ---------- Barras lateral e izquierda/derecha ----------
  function bigBtn(icon, title, fn, id) {
    const b = el('button', 'db-btn');
    b.innerHTML = svg(icon, 20); b.title = title; b.onclick = fn;
    if (id) b.dataset.k = id;
    return b;
  }
  function buildBar() {
    const bar = X.$('drawBar');
    bar.innerHTML = '';
    bar.appendChild(bigBtn('cursor', 'Cursor (sin herramienta). Esc', () => store.setTool(null), 'cursor'));
    D.CATS.forEach((c) => {
      const b = bigBtn(lastTool[c.id], c.label + ' (clic para elegir la herramienta)', () => openFlyout(b, c), 'cat:' + c.id);
      const tri = el('i', 'db-tri'); b.appendChild(tri);
      bar.appendChild(b);
    });
    bar.appendChild(el('span', 'db-sep'));
    const mg = bigBtn('magnet', 'Imán (clic para elegir: apagado, débil o fuerte)', () => openMagnetMenu(mg), 'magnet');
    mg.appendChild(el('i', 'db-tri'));
    bar.appendChild(mg);
    bar.appendChild(bigBtn('keep', 'Mantener la herramienta activa después de dibujar', () => setPref('keep', !prefs().keep), 'keep'));
    bar.appendChild(bigBtn('eye', 'Ocultar / mostrar todos los dibujos del gráfico', () => setPref('hideAll', !prefs().hideAll), 'hideAll'));
    bar.appendChild(bigBtn('trash', 'Eliminar todos los dibujos de este activo', confirmClear, 'clear'));
    bar.appendChild(el('span', 'db-sep'));
    bar.appendChild(bigBtn('star', 'Mostrar / ocultar la barra de favoritos', () => setPref('favBar', !prefs().favBar), 'favBar'));
    // Barra derecha: panel de objetos
    const rb = X.$('rightBar');
    rb.innerHTML = '';
    rb.appendChild(bigBtn('list', 'Objetos: ver todos los dibujos (clic otra vez para cerrar)', toggleObjects, 'objects'));
  }
  function renderBar() {
    const bar = X.$('drawBar'), rb = X.$('rightBar');
    const t = store.state.tool;
    const on = (root2, k, v) => { const b = root2.querySelector(`[data-k="${k}"]`); if (b) b.classList.toggle('active', !!v); };
    on(bar, 'cursor', !t);
    D.CATS.forEach((c) => {
      const b = bar.querySelector(`[data-k="cat:${c.id}"]`);
      if (!b) return;
      b.classList.toggle('active', !!t && catOf(t) === c.id);
      const tri = b.querySelector('.db-tri');
      b.innerHTML = svg(lastTool[c.id], 20);
      if (tri) b.appendChild(tri);
    });
    on(bar, 'magnet', magnetMode() !== 'off');
    const mb = bar.querySelector('[data-k="magnet"]');
    if (mb) mb.title = `${MAGNET[magnetMode()]} (clic para cambiar)`;
    on(bar, 'keep', prefs().keep); on(bar, 'hideAll', prefs().hideAll); on(bar, 'favBar', prefs().favBar);
    on(rb, 'objects', !X.$('objPanel').classList.contains('hidden'));
    const eyeBtn = bar.querySelector('[data-k="hideAll"]');
    if (eyeBtn) eyeBtn.innerHTML = svg(prefs().hideAll ? 'eyeoff' : 'eye', 20);
  }

  // ---------- Barra de favoritos (movible) ----------
  function placeFav(free) {
    const fb = X.$('favBar'), wrap = X.$('gridWrap');
    if (fb.classList.contains('hidden')) return;
    const pos = prefs().favPos || { edge: 'left', off: 0.2 };
    const W = wrap.clientWidth, H = wrap.clientHeight, M = 8;
    let edge = pos.edge;
    if (free) edge = nearestEdge(free.x, free.y, W, H);
    fb.classList.toggle('horiz', edge === 'top' || edge === 'bottom');
    fb.style.transform = 'none'; fb.style.right = fb.style.bottom = '';
    const w = fb.offsetWidth, h = fb.offsetHeight;
    let x, y;
    if (free) { x = free.x - w / 2; y = free.y - h / 2; }
    else if (edge === 'left') { x = M; y = pos.off * H - h / 2; }
    else if (edge === 'right') { x = W - w - M; y = pos.off * H - h / 2; }
    else if (edge === 'top') { y = M; x = pos.off * W - w / 2; }
    else { y = H - h - M; x = pos.off * W - w / 2; }
    fb.style.left = Math.max(4, Math.min(W - w - 4, x)) + 'px';
    fb.style.top = Math.max(4, Math.min(H - h - 4, y)) + 'px';
  }
  function nearestEdge(x, y, W, H) {
    const d = { left: x, right: W - x, top: y, bottom: H - y };
    return Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
  }
  function bindFavDrag(grip) {
    grip.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const wrap = X.$('gridWrap');
      const move = (m) => { const r = wrap.getBoundingClientRect(); placeFav({ x: m.clientX - r.left, y: m.clientY - r.top }); };
      const up = (m) => {
        window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
        const r = wrap.getBoundingClientRect(), W = wrap.clientWidth, H = wrap.clientHeight;
        const x = m.clientX - r.left, y = m.clientY - r.top;
        const edge = nearestEdge(x, y, W, H);
        const off = edge === 'left' || edge === 'right' ? y / H : x / W;
        prefs().favPos = { edge, off: Math.max(0.03, Math.min(0.97, Math.round(off * 1000) / 1000)) };
        X.saveCfg();
        placeFav();
      };
      window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true);
    };
  }
  function renderFav() {
    const fb = X.$('favBar');
    const favs = prefs().favs.map(parseFav).filter((f) => D.TYPES[f.type]);
    fb.classList.toggle('hidden', !prefs().favBar || !favs.length);
    fb.innerHTML = '';
    const grip = el('span', 'fav-grip'); grip.innerHTML = svg('grip', 16); grip.title = 'Arrastra para mover la barra a cualquier borde del gráfico';
    bindFavDrag(grip);
    fb.appendChild(grip);
    favs.forEach((f) => {
      const tp = f.tpl ? store.templates(f.type).find((x) => x.id === f.tpl) : null;
      if (f.tpl && !tp) return;
      const active = store.state.tool === f.type && (store.state.template || null) === (tp ? tp.id : null);
      const b = el('button', 'db-btn small' + (active ? ' active' : '') + (tp ? ' tpl' : ''));
      b.innerHTML = svg(f.type, 18);
      b.title = D.TYPES[f.type].label + (tp ? ` · plantilla "${tp.name}"` : SHORTCUT[f.type] ? ` (${SHORTCUT[f.type]})` : '');
      b.onclick = () => selectTool(f.type, tp ? tp.id : null);
      fb.appendChild(b);
    });
    placeFav();
  }

  // ---------- Barra del objeto seleccionado ----------
  function iconBtn(icon, title, fn) {
    const b = el('button', 'db-btn small');
    b.innerHTML = svg(icon, 17); b.title = title; b.onclick = fn;
    return b;
  }
  function renderSel() {
    const bar = X.$('selBar');
    const sym = symNow();
    const ids = selIds().filter((id) => store.get(sym, id));
    if (!ids.length) { bar.classList.add('hidden'); sel.key = null; sel.refs = null; return; }
    bar.classList.remove('hidden');
    const many = ids.length > 1;
    const key = many ? 'multi' : ids[0];
    if (sel.key !== key) {
      sel.key = key; bar.innerHTML = '';
      const r = {};
      r.title = el('span', 'sb-title');
      r.color = el('input'); r.color.type = 'color';
      r.color.oninput = () => store.patchMany(sym, selIds(), { color: r.color.value });
      r.width = el('select');
      [1, 2, 3, 4, 5].forEach((n) => { const o = el('option', '', n + ' px'); o.value = String(n); r.width.appendChild(o); });
      r.width.onchange = () => store.patchMany(sym, selIds(), { width: Number(r.width.value) });
      r.dash = el('select');
      [['solid', 'Continua'], ['dashed', 'Guiones'], ['dotted', 'Puntos']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; r.dash.appendChild(o); });
      r.dash.onchange = () => store.patchMany(sym, selIds(), { dash: r.dash.value });
      r.lock = iconBtn('lock', 'Bloquear / desbloquear', () => { const all = selIds().every((id) => (store.get(sym, id) || {}).locked); store.patchMany(sym, selIds(), { locked: !all }); });
      r.eye = iconBtn('eyeoff', 'Ocultar (se vuelve a mostrar desde el panel de objetos)', () => store.patchMany(sym, selIds(), { hidden: true }));
      const dup = iconBtn('copy', 'Duplicar (Ctrl+D)', duplicateSel);
      const grp = iconBtn('folderadd', 'Agrupar en una carpeta', () => newFolder(selIds(), null));
      r.cfg = iconBtn('gear', 'Propiedades (doble clic sobre el dibujo)', () => { const i = selIds(); if (i.length === 1) openProps(sym, i[0]); });
      r.del = iconBtn('trash', 'Eliminar (Supr)', deleteSel);
      bar.append(r.title, r.color, r.width, r.dash, r.lock, r.eye, dup, grp);
      if (!many) bar.appendChild(r.cfg);
      bar.appendChild(r.del);
      sel.refs = r;
      X.decoratePalette(bar);
    }
    const r = sel.refs;
    const ds = ids.map((id) => store.get(sym, id));
    r.title.textContent = many ? `${ids.length} dibujos` : D.TYPES[ds[0].type].label;
    if (document.activeElement !== r.color) r.color.value = hexOk(ds[0].color);
    r.width.value = String(Math.max(1, Math.min(5, Math.round(ds[0].width || 1))));
    r.dash.value = ds[0].dash || 'solid';
    const onlyText = ds.every((d) => d.type === 'text');
    r.width.classList.toggle('hidden', onlyText);
    r.dash.classList.toggle('hidden', onlyText);
    const allLocked = ds.every((d) => d.locked);
    r.lock.classList.toggle('active', allLocked);
    r.lock.innerHTML = svg(allLocked ? 'lock' : 'unlock', 17);
    r.del.disabled = allLocked;
  }

  // ---------- Panel "Objetos" ----------
  function toggleObjects() {
    const p = X.$('objPanel');
    if (p.classList.contains('hidden')) { X.$('panel').classList.add('hidden'); X.$('btnIndicators').classList.remove('active'); }
    p.classList.toggle('hidden');
    treeSig = '';
    renderAll();
  }
  function renderTree(force) {
    const p = X.$('objPanel');
    if (p.classList.contains('hidden')) return;
    const sym = symNow(), list = store.list(sym), folders = store.folders(sym);
    const ids = selIds();
    const sig = sym + '|' + ids.join(',') + '|' + prefs().hideAll + '|' + JSON.stringify(list.map((d) => [d.id, d.type, d.text, d.hidden, d.locked, d.color, d.folder])) + '|' + JSON.stringify(folders);
    if (!force && sig === treeSig) return;
    treeSig = sig;
    const keepScroll = p.scrollTop;
    p.innerHTML = '';
    p.appendChild(el('h3', '', `Objetos · ${sym}`));
    if (prefs().hideAll) p.appendChild(el('div', 'lg-note', 'Todos los dibujos están ocultos en el gráfico (botón del ojo en la barra izquierda).'));
    const top = el('div', 'row-actions');
    const nf = el('button', 'btn secondary', ids.length ? `Agrupar (${ids.length}) en carpeta` : '+ Nueva carpeta');
    nf.onclick = () => newFolder(ids, null);
    top.appendChild(nf);
    p.appendChild(top);
    if (!list.length && !folders.length) p.appendChild(el('p', 'hint', 'Todavía no hay dibujos en este activo. Elige una herramienta en la barra izquierda y dibuja en el gráfico. Para seleccionar varios: Shift + arrastrar (recuadro) o Ctrl + clic (uno por uno).'));
    const wrap = el('div', 'tree-root');
    wrap.ondragover = (e) => { if (dragData) { e.preventDefault(); wrap.classList.add('drop-root'); } };
    wrap.ondragleave = (e) => { if (e.target === wrap) wrap.classList.remove('drop-root'); };
    wrap.ondrop = (e) => { e.preventDefault(); wrap.classList.remove('drop-root'); dropOn(sym, null); };
    p.appendChild(wrap);

    const fexists = (id) => !!id && !!store.folder(sym, id);
    const mkBtn = (row, icon, title, fn) => { const b = el('button', 'obj-btn'); b.innerHTML = svg(icon, 15); b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); }; row.appendChild(b); };
    function itemRow(d, depth) {
      const row = el('div', 'obj-row' + (store.isSelected(sym, d.id) ? ' sel' : '') + (d.hidden ? ' off' : ''));
      row.style.paddingLeft = 6 + depth * 16 + 'px';
      row.draggable = true;
      row.ondragstart = (e) => { dragData = { kind: 'items', ids: store.isSelected(sym, d.id) ? selIds() : [d.id] }; e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; };
      row.ondragend = () => { dragData = null; };
      const ic = el('span', 'obj-ic'); ic.innerHTML = svg(d.type, 16); ic.style.color = hexOk(d.color);
      row.append(ic, el('span', 'obj-name', store.label(d)));
      mkBtn(row, d.hidden ? 'eyeoff' : 'eye', d.hidden ? 'Mostrar' : 'Ocultar', () => store.patch(sym, d.id, { hidden: !d.hidden }));
      mkBtn(row, d.locked ? 'lock' : 'unlock', d.locked ? 'Desbloquear' : 'Bloquear', () => store.patch(sym, d.id, { locked: !d.locked }));
      if (fexists(d.folder)) mkBtn(row, 'out', 'Sacar de la carpeta', () => store.moveToFolder(sym, [d.id], null));
      mkBtn(row, 'copy', 'Duplicar', () => store.duplicate(sym, d.id, shiftFn()));
      mkBtn(row, 'trash', 'Eliminar', () => { if (!d.locked) store.remove(sym, d.id); });
      row.onclick = (e) => store.select(sym, d.id, e.ctrlKey || e.metaKey ? 'toggle' : undefined);
      row.ondblclick = () => openProps(sym, d.id);
      return row;
    }
    function folderRow(f, depth) {
      const items = store.folderItems(sym, f.id);
      const allHidden = items.length && items.every((id) => store.get(sym, id).hidden);
      const allLocked = items.length && items.every((id) => store.get(sym, id).locked);
      const row = el('div', 'obj-row folder' + (allHidden ? ' off' : ''));
      row.style.paddingLeft = 6 + depth * 16 + 'px';
      row.dataset.folder = f.id;
      row.draggable = true;
      row.ondragstart = (e) => { dragData = { kind: 'folder', id: f.id }; e.dataTransfer.setData('text/plain', f.id); e.dataTransfer.effectAllowed = 'move'; };
      row.ondragend = () => { dragData = null; };
      row.ondragover = (e) => { if (dragData) { e.preventDefault(); e.stopPropagation(); row.classList.add('drop'); } };
      row.ondragleave = () => row.classList.remove('drop');
      row.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); row.classList.remove('drop'); dropOn(sym, f.id); };
      const caret = el('span', 'obj-caret' + (f.open ? ' open' : '')); caret.innerHTML = svg('caret', 14);
      caret.onclick = (e) => { e.stopPropagation(); store.setFolderOpen(sym, f.id); };
      const ic = el('span', 'obj-ic'); ic.innerHTML = svg('folder', 16);
      const name = el('span', 'obj-name', `${f.name} (${items.length})`);
      name.title = 'Doble clic para cambiar el nombre';
      name.ondblclick = (e) => {
        e.stopPropagation();
        const inp = el('input'); inp.type = 'text'; inp.value = f.name; inp.className = 'obj-rename';
        let done = false;
        const end = (ok) => { if (done) return; done = true; if (ok && inp.value.trim()) store.renameFolder(sym, f.id, inp.value); else { treeSig = ''; renderTree(); } };
        inp.onkeydown = (k) => { k.stopPropagation(); if (k.key === 'Enter') end(true); else if (k.key === 'Escape') end(false); };
        inp.onblur = () => end(true);
        inp.onclick = (k) => k.stopPropagation();
        name.replaceWith(inp); inp.focus(); inp.select();
      };
      row.append(caret, ic, name);
      mkBtn(row, allHidden ? 'eyeoff' : 'eye', allHidden ? 'Mostrar todo lo de la carpeta' : 'Ocultar todo lo de la carpeta', () => store.setFolderFlag(sym, f.id, 'hidden', !allHidden));
      mkBtn(row, allLocked ? 'lock' : 'unlock', allLocked ? 'Desbloquear todo lo de la carpeta' : 'Bloquear todo lo de la carpeta', () => store.setFolderFlag(sym, f.id, 'locked', !allLocked));
      mkBtn(row, 'folderadd', 'Crear una subcarpeta aquí (con los dibujos seleccionados, si hay)', () => newFolder(selIds(), f.id));
      mkBtn(row, 'trash', 'Quitar la carpeta (los dibujos se conservan)', () => store.removeFolder(sym, f.id));
      row.onclick = (e) => {
        const all = store.folderItems(sym, f.id);
        if (e.ctrlKey || e.metaKey) store.selectMany(sym, all, true); else store.selectMany(sym, all, false);
      };
      return row;
    }
    function build(parentId, depth, host) {
      folders.filter((f) => (parentId ? f.parent === parentId : !fexists(f.parent))).forEach((f) => {
        host.appendChild(folderRow(f, depth));
        if (f.open) {
          const box = el('div', 'tree-children');
          build(f.id, depth + 1, box);
          host.appendChild(box);
        }
      });
      list.filter((d) => (parentId ? d.folder === parentId : !fexists(d.folder))).slice().reverse().forEach((d) => host.appendChild(itemRow(d, depth)));
    }
    build(null, 0, wrap);
    if (folders.length) wrap.appendChild(el('div', 'tree-hint', 'Arrastra dibujos o carpetas sobre una carpeta para guardarlos dentro; suéltalos en el espacio vacío para sacarlos.'));
    if (list.length) {
      const act = el('div', 'row-actions');
      const lockAll = el('button', 'btn secondary', list.every((d) => d.locked) ? 'Desbloquear todos' : 'Bloquear todos');
      lockAll.onclick = () => store.setAll(sym, 'locked', !list.every((d) => d.locked));
      const showAll = el('button', 'btn secondary', 'Mostrar todos');
      showAll.onclick = () => { store.setAll(sym, 'hidden', false); if (prefs().hideAll) setPref('hideAll', false); };
      const delAll = el('button', 'btn secondary', 'Eliminar todos');
      delAll.onclick = confirmClear;
      act.append(lockAll, showAll, delAll);
      p.appendChild(act);
    }
    p.scrollTop = keepScroll;
  }
  function dropOn(sym, folderId) {
    const dd = dragData; dragData = null;
    if (!dd) return;
    if (dd.kind === 'items') store.moveToFolder(sym, dd.ids, folderId);
    else if (dd.kind === 'folder') store.moveFolder(sym, dd.id, folderId);
  }

  // ---------- Ventana de propiedades: Plantilla / Aceptar / Cancelar ----------
  function openTplMenu(anchor, sym, id, refill) {
    closeTpl();
    const d0 = store.get(sym, id);
    if (!d0) return;
    const m = el('div', 'ctx-menu tpl-menu');
    const type = d0.type;
    const saveRow = el('div', 'tpl-save');
    const inp = el('input'); inp.type = 'text'; inp.placeholder = 'Nombre de la plantilla';
    const ok = el('button', 'btn', 'Guardar');
    const save = () => {
      const cur = store.get(sym, id); const nm = inp.value.trim();
      if (!cur || !nm) return;
      store.saveTemplate(type, nm, cur);
      openTplMenu(anchor, sym, id, refill);
    };
    ok.onclick = save;
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') save(); };
    saveRow.append(inp, ok);
    m.appendChild(el('div', 'tpl-title', 'Guardar el estilo actual como plantilla'));
    m.appendChild(saveRow);
    const tpls = store.templates(type);
    m.appendChild(el('div', 'tpl-title', tpls.length ? 'Aplicar una plantilla' : 'Aún no hay plantillas de esta herramienta'));
    tpls.forEach((tp) => {
      const row = el('div', 'ctx-item db-row');
      row.append(el('span', 'db-label', tp.name));
      const del = el('button', 'fav-star'); del.innerHTML = svg('trash', 14); del.title = 'Borrar esta plantilla';
      del.onclick = (e) => { e.stopPropagation(); store.deleteTemplate(type, tp.id); openTplMenu(anchor, sym, id, refill); };
      row.appendChild(del);
      row.onclick = () => { store.applyTemplate(sym, id, tp.id); closeTpl(); refill(); };
      m.appendChild(row);
    });
    placeMenu(m, anchor, 'under');
    tplMenu = m;
    setTimeout(() => inp.focus(), 0);
  }

  function openProps(sym, id) {
    if (!store.get(sym, id)) return;
    store.select(sym, id);
    const state = { sym, id, done: false };
    store.begin(sym);              // todo lo que se cambie aquí cuenta como un solo paso; "Cancelar" lo revierte
    const finish = (ok) => {
      if (state.done) return;
      state.done = true;
      if (props === state) props = null;
      closeTpl();
      if (ok) store.end(); else store.abort();
    };
    props = state;
    X.openModal((box) => {
      const cur = () => store.get(sym, id);
      const patch = (o) => { if (cur()) store.patch(sym, id, o); };
      const d0 = cur();
      const t = d0.type;
      box.appendChild(el('h3', '', D.TYPES[t].label));
      const body = el('div', 'props-body');
      box.appendChild(body);

      const field = (label, ctrl) => { const f = el('div', 'field'); f.append(el('span', '', label), ctrl); body.appendChild(f); return f; };
      const colorIn = (val, fn) => { const i = el('input'); i.type = 'color'; i.value = hexOk(val); i.oninput = () => fn(i.value); return i; };
      const checkIn = (val, fn) => { const i = el('input'); i.type = 'checkbox'; i.checked = !!val; i.onchange = () => fn(i.checked); return i; };
      const numIn = (val, min, max, step, fn) => {
        const i = el('input'); i.type = 'number'; i.min = min; i.max = max; i.step = step; i.value = val; i.style.width = '80px';
        i.oninput = () => { const v = parseFloat(i.value); if (isFinite(v)) fn(Math.max(min, Math.min(max, v))); };
        return i;
      };
      const rangeIn = (val, fn) => {
        const w = el('span', 'cwrap'); const i = el('input'); i.type = 'range'; i.min = 0; i.max = 100; i.value = val; i.className = 'wm-range';
        const tx = el('span', 'wm-val', val + ' %');
        i.oninput = () => { tx.textContent = i.value + ' %'; fn(Number(i.value)); };
        w.append(i, tx); return w;
      };
      const selIn = (opts, val, fn) => {
        const s = el('select'); opts.forEach(([v, tx]) => { const o = el('option', '', tx); o.value = v; s.appendChild(o); });
        s.value = val; s.onchange = () => fn(s.value); return s;
      };
      const DASH_OPTS = [['solid', 'Continua'], ['dashed', 'Guiones'], ['dotted', 'Puntos']];
      // Texto sobre la línea / niveles: mismos controles en tendencia, horizontal, rayo horizontal y Fibonacci.
      const textBlock = (d, withContent) => {
        body.appendChild(el('h4', '', withContent ? 'Texto' : 'Texto de los niveles'));
        if (withContent) {
          const ti = el('input'); ti.type = 'text'; ti.value = d.text || ''; ti.style.width = '230px'; ti.placeholder = 'Escribe un texto (opcional)';
          ti.oninput = () => patch({ text: ti.value });
          field('Texto', ti);
        }
        const cw = el('span', 'cwrap');
        cw.appendChild(colorIn(d.tColor || d.color, (v) => patch({ tColor: v })));
        const same = el('button', 'btn secondary small', 'Como la línea');
        same.title = 'Usar el mismo color de la línea'; same.onclick = () => { patch({ tColor: null }); fill(); };
        cw.appendChild(same);
        field('Color del texto', cw);
        field('Tamaño (px)', numIn(d.tSize || 12, 8, 60, 1, (v) => patch({ tSize: v })));
        field('Negrita', checkIn(d.tBold, (v) => patch({ tBold: v })));
        field('Posición', selIn([['above', 'Por encima de la línea'], ['center', 'En el centro (sobre la línea)'], ['below', 'Por debajo de la línea']], d.tV || 'above', (v) => patch({ tV: v })));
        field('Lugar del texto', selIn([['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']], d.tH || 'left', (v) => patch({ tH: v })));
      };

      function fill() {
        body.innerHTML = '';
        const d = cur();
        if (!d) return;
        if (t === 'text') {
          const ti = el('input'); ti.type = 'text'; ti.value = d.text || ''; ti.style.width = '230px';
          ti.oninput = () => { if (ti.value.trim()) patch({ text: ti.value }); };
          field('Texto', ti);
          field('Color', colorIn(d.color, (v) => patch({ color: v })));
          field('Tamaño (px)', numIn(d.size || 14, 8, 80, 1, (v) => patch({ size: v })));
          field('Negrita', checkIn(d.bold, (v) => patch({ bold: v })));
        } else {
          field('Color de línea', colorIn(d.color, (v) => patch({ color: v })));
          field('Grosor', numIn(d.width || 1, 1, 8, 1, (v) => patch({ width: v })));
          field('Estilo de línea', selIn(DASH_OPTS, d.dash || 'solid', (v) => patch({ dash: v })));
          if (t === 'trend' || t === 'channel' || t === 'fib' || t === 'rect') {
            field('Ampliar a la izquierda', checkIn(d.extL, (v) => patch({ extL: v })));
            field('Ampliar a la derecha', checkIn(d.extR, (v) => patch({ extR: v })));
          }
          if (t === 'rect' || t === 'channel') {
            field('Relleno', checkIn(d.fill, (v) => patch({ fill: v })));
            field('Opacidad del relleno', rangeIn(d.fillOpacity == null ? 15 : d.fillOpacity, (v) => patch({ fillOpacity: v })));
          }
          if (t === 'rect') {
            body.appendChild(el('h4', '', 'Línea central'));
            field('Mostrar línea central', checkIn(d.center, (v) => patch({ center: v })));
            const cw = el('span', 'cwrap');
            cw.appendChild(colorIn(d.cColor || d.color, (v) => patch({ cColor: v })));
            const same = el('button', 'btn secondary small', 'Como el borde'); same.onclick = () => { patch({ cColor: null }); fill(); };
            cw.appendChild(same);
            field('Color de la línea central', cw);
            field('Tipo de línea central', selIn(DASH_OPTS, d.cDash || 'dashed', (v) => patch({ cDash: v })));
            field('Grosor de la línea central', numIn(d.cWidth || 1, 1, 8, 1, (v) => patch({ cWidth: v })));
          }
        }
        if (t === 'trend' || t === 'hline' || t === 'hray') textBlock(d, true);
        if (t === 'fib') {
          field('Línea de tendencia (punteada)', checkIn(d.trendLine, (v) => patch({ trendLine: v })));
          field('Mostrar el precio de cada nivel', checkIn(d.showPrice, (v) => patch({ showPrice: v })));
          field('Fondo entre niveles', checkIn(d.bg, (v) => patch({ bg: v })));
          field('Opacidad del fondo', rangeIn(d.bgOpacity == null ? 10 : d.bgOpacity, (v) => patch({ bgOpacity: v })));
          textBlock(d, false);
          body.appendChild(el('h4', '', 'Niveles (0 = segundo punto, 1 = primer punto)'));
          const lvBox = el('div', 'fib-levels');
          body.appendChild(lvBox);
          const drawLevels = () => {
            lvBox.innerHTML = '';
            const levels = (cur() ? cur().levels : []).map((l) => Object.assign({}, l));
            const save = () => patch({ levels: levels.map((l) => Object.assign({}, l)) });
            levels.forEach((l, i) => {
              const row = el('div', 'fib-row');
              row.appendChild(checkIn(l.on, (v) => { levels[i].on = v; save(); }));
              row.appendChild(numIn(l.v, -100, 100, 0.001, (v) => { levels[i].v = v; save(); }));
              row.appendChild(colorIn(l.color, (v) => { levels[i].color = v; save(); }));
              const x = el('button', 'x', '×'); x.title = 'Quitar este nivel';
              x.onclick = () => { levels.splice(i, 1); save(); drawLevels(); };
              row.appendChild(x);
              lvBox.appendChild(row);
            });
            const act = el('div', 'row-actions');
            const add = el('button', 'btn secondary', '+ Agregar nivel');
            add.onclick = () => {
              const mx = levels.reduce((m, l) => Math.max(m, l.v), 0);
              levels.push({ v: Math.round((mx + 1) * 1000) / 1000, color: '#787b86', on: true }); save(); drawLevels();
            };
            const reset = el('button', 'btn secondary', 'Restablecer niveles');
            reset.onclick = () => { patch({ levels: D.fibLevels() }); drawLevels(); };
            act.append(add, reset);
            lvBox.appendChild(act);
            X.decoratePalette(lvBox);
          };
          drawLevels();
        }
        body.appendChild(el('h4', '', 'Objeto'));
        field('Bloqueado (no se puede mover ni borrar)', checkIn(d.locked, (v) => patch({ locked: v })));
        field('Oculto', checkIn(d.hidden, (v) => patch({ hidden: v })));
        X.decoratePalette(body);
      }
      fill();

      const act = el('div', 'row-actions props-actions');
      const tplB = el('button', 'btn secondary', 'Plantilla ▾'); tplB.dataset.tplbtn = '1';
      tplB.onclick = () => { if (tplMenu) closeTpl(); else openTplMenu(tplB, sym, id, fill); };
      const ok = el('button', 'btn', 'Aceptar'); ok.onclick = () => { finish(true); X.closeModal(); };
      const no = el('button', 'btn secondary', 'Cancelar'); no.onclick = () => { finish(false); X.closeModal(); };
      act.append(tplB, el('span', 'spacer'), ok, no);
      box.appendChild(act);
      box.appendChild(el('p', 'hint small', 'Los cambios se ven al momento. Haz clic fuera de esta ventana para aceptarlos, o pulsa Cancelar (o Esc) para descartarlos.'));
    }, { floating: true, onClose: () => finish(true) });
  }
  // Esc con la ventana de propiedades abierta = Cancelar. Devuelve true si había una abierta.
  function cancelProps() {
    if (!props || props.done) return false;
    const p = props;
    p.done = true; props = null;
    closeTpl();
    store.abort();
    X.closeModal();
    return true;
  }

  // ---------- Atajos de teclado ----------
  function onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const sym = symNow(), layer = layerNow(), ids = selIds();
    const k = e.key;
    if (k === 'Escape') {
      closeFly();
      X.eachView((v) => v.draw && v.draw.clearRuler());
      if (layer && layer.hasDraft()) layer.cancel();
      else if (store.state.tool) store.setTool(null);
      else if (ids.length) store.select(null);
      return;
    }
    if (k === 'Enter' && layer && layer.hasDraft()) { e.preventDefault(); layer.finish(); return; }
    if ((k === 'Delete' || k === 'Backspace') && ids.length) { e.preventDefault(); deleteSel(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const low = k.toLowerCase();
      if (low === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(sym); return; }
      if (low === 'y' || (low === 'z' && e.shiftKey)) { e.preventDefault(); store.redo(sym); return; }
      if (low === 'd' && ids.length) { e.preventDefault(); duplicateSel(); return; }
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const map = { t: 'trend', h: 'hline', f: 'fib', r: 'rect' };
      const type = map[k.toLowerCase()];
      if (type) { e.preventDefault(); selectTool(type); }
    }
  }

  function renderAll() { renderBar(); renderFav(); renderSel(); renderTree(); }

  function init(ctx) {
    X = ctx; store = ctx.store;
    buildBar();
    store.on((kind, info) => {
      if (kind === 'props') { openProps(info.sym, info.id); return; }
      if (kind === 'ctx') { showCtx(info.x, info.y, info.sym, info.id); return; }
      if (kind === 'tool' || kind === 'templates') { renderBar(); renderFav(); return; }
      renderSel(); renderTree();
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => placeFav());
    renderAll();
  }

  root.TVDrawUI = { init, cancelProps, refresh: () => { if (X) { treeSig = ''; sel.key = null; renderAll(); } } };
})(window);

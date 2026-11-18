// Ar_Trading - interfaz de las herramientas de dibujo (v0.10; base v0.8): barra lateral con menús (imán débil/fuerte, plantillas),
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
    circle: '<circle cx="12" cy="12" r="8"/>',
    brush: '<path d="M20 4l-9 9"/><path d="M9.5 12.5c-2 0-3.5 1.5-3.5 3.5 0 1.5-1 2.5-2.5 3 2.5 1.5 7 1 7-3 0-1-.5-2.5-1-3.5z"/>',
    join: '<path d="M3 6c5 0 5 12 10 12"/><path d="M3 18c5 0 5-12 10-12"/><path d="M13 12h8"/>',
    split: '<path d="M21 6c-5 0-5 12-10 12"/><path d="M21 18c-5 0-5-12-10-12"/><path d="M3 12h6"/>',
    anchor: '<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V21M6.5 12h11M5 15c0 3.5 3 6 7 6s7-2.5 7-6"/>',
    text: '<path d="M5 6h14M12 6v13"/>',
    ruler: '<rect x="2" y="9" width="20" height="7" rx="1"/><path d="M6 9v3M10 9v4M14 9v3M18 9v4"/>',
    magnet: '<path d="M6 3v8a6 6 0 0012 0V3h-4v8a2 2 0 01-4 0V3z"/>',
    keep: '<path d="M12 17v5M8 3h8l-1 7 3 3v2H6v-2l3-3z"/>',
    share: '<rect x="3" y="4" width="11" height="9" rx="1.5"/><rect x="10" y="11" width="11" height="9" rx="1.5"/>',
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
    table: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M3 15h18M10 5v14"/>',
    zoom: '<circle cx="10" cy="10" r="6"/><line x1="15" y1="15" x2="21" y2="21"/><path d="M10 7v6M7 10h6"/>',
    zoomout: '<circle cx="10" cy="10" r="6"/><line x1="15" y1="15" x2="21" y2="21"/><path d="M7 10h6"/>',
    ind: '<path d="M3 17l5-6 4 3 5-8 4 5"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    out: '<path d="M14 4h6v6M20 4l-9 9M10 6H5a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    refresh: '<path d="M20 12a8 8 0 11-2.6-5.9"/><path d="M20 4v5h-5"/>',
  };
  const svg = (name, size) => `<svg viewBox="0 0 24 24" width="${size || 20}" height="${size || 20}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const SHORTCUT = { trend: 'Alt+T', hline: 'Alt+H', fib: 'Alt+F', rect: 'Alt+R', circle: 'Alt+C', brush: 'Alt+B' };
  const MAGNET = { off: 'Imán apagado', strong: 'Imán fuerte' };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const hexOk = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#2962ff');

  let X = null;      // enlace con app.js
  let store = null;
  const lastTool = { lines: 'trend', fib: 'fib', shapes: 'rect', brush: 'brush', text: 'text' };
  let flyout = null, ctxMenu = null, tplMenu = null;
  const sel = { key: null, refs: null };
  let treeSig = '';
  let props = null;   // ventana de propiedades abierta: { sym, id, done }
  let dragData = null;

  const prefs = () => store.prefs();
  const symNow = () => X.activeCfg().symbol;
  const chartNow = () => X.activeCfg().id;
  // Solo cuentan los dibujos visibles en el gráfico activo (los de otro gráfico del mismo activo no aparecen ni se seleccionan aquí).
  const visNow = (sym, id) => { const d = store.get(sym, id); return !!d && store.visibleIn(d, chartNow()); };
  const layerNow = () => { const v = X.activeView(); return v && v.draw; };
  const catOf = (type) => D.TYPES[type].cat;
  const parseFav = (f) => { const i = String(f).indexOf(':'); return i < 0 ? { type: f, tpl: null } : { type: f.slice(0, i), tpl: f.slice(i + 1) }; };
  const magnetMode = () => { const m = prefs().magnet; return m === 'weak' || m === 'strong' || m === true ? 'strong' : 'off'; };

  // ---------- Acciones ----------
  function selectTool(type, tplId) {
    if (type && store.state.tool === type && (store.state.template || null) === (tplId || null)) { store.setTool(null); return; }
    if (type) {
      lastTool[catOf(type)] = type;
      if (prefs().hideAll) { prefs().hideAll = false; X.saveCfg(); }
    }
    store.setTool(type, tplId);
  }
  // Ancla del círculo: si está activa, los círculos nuevos se pegan a la punta de una vela (máximo o mínimo) y se separan con una línea.
  const anchorOn = () => !!((prefs().styles || {}).circle || {}).anchor;
  function setAnchorDefault(v) {
    const pr = prefs();
    if (!pr.styles) pr.styles = {};
    pr.styles.circle = Object.assign({}, pr.styles.circle || {}, { anchor: !!v });
    X.saveCfg();
  }
  function toggleFav(key) {
    const f = prefs().favs;
    const i = f.indexOf(key);
    if (i >= 0) f.splice(i, 1); else f.push(key);
    X.saveCfg();
    renderAll();
  }
  function setPref(key, val) { prefs()[key] = val; X.saveCfg(); renderAll(); X.eachView((v) => v.draw && v.draw.repaint()); }
  const shiftFn = () => { const layer = layerNow(); return layer ? (pt, d) => layer.offsetPoint(pt, 26, 26, d && d.pane) : null; };
  const selIds = () => store.selIds(symNow()).filter((id) => visNow(symNow(), id));
  // Compartir / dejar de compartir con los demás gráficos del mismo activo. Al dejar de compartir, el dibujo se queda en el gráfico activo.
  function toggleShare(sym, ids) {
    const ds = ids.map((id) => store.get(sym, id)).filter(Boolean);
    if (!ds.length) return;
    const all = ds.every((d) => d.shared);
    store.patchMany(sym, ids, all ? { shared: false, chart: chartNow() } : { shared: true });
    X.eachView((v) => v.draw && v.draw.repaint());
  }
  const unlocked = (sym, ids) => ids.filter((id) => { const d = store.get(sym, id); return d && !store.isLocked(sym, d); });
  function deleteSel() {
    const sym = symNow(), ids = unlocked(sym, selIds());
    if (ids.length) store.removeMany(sym, ids);
  }
  function duplicateSel() {
    const sym = symNow(), ids = selIds();
    if (ids.length) store.duplicateMany(sym, ids, shiftFn());
  }
  // Copiar (Ctrl+C) y pegar (Ctrl+D o Ctrl+V): vale también para otro gráfico o activo.
  let clip = null;
  function copySel() {
    const sym = symNow(), ids = selIds();
    const items = ids.map((id) => store.get(sym, id)).filter(Boolean);
    if (!items.length) return false;
    clip = { sym, ids: ids.slice(), items: JSON.parse(JSON.stringify(items)) };
    return true;
  }
  function pasteClip() {
    if (!clip) return false;
    const sym = symNow();
    store.pasteMany(sym, clip.items, sym === clip.sym ? shiftFn() : null, chartNow());
    return true;
  }
  // Edita el texto del dibujo seleccionado directamente sobre el gráfico (sin abrir Ajustes).
  function editSelText() {
    const sym = symNow(), ids = selIds(), layer = layerNow();
    if (ids.length !== 1 || !layer) return false;
    const d = store.get(sym, ids[0]);
    if (!d || !(d.type === 'text' || (D.TYPES[d.type] && D.TYPES[d.type].text)) || store.isLocked(sym, d)) return false;
    layer.editText(d.id);
    return true;
  }
  function confirmClear() {
    const sym = symNow(), n = store.listFor(sym, chartNow()).length;
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

  // ---------- Lista de plantillas: favorita (estrella), orden por arrastre (clic sostenido) y borrado ----------
  // o: { onPick(tp), onDelete(tp) (opcional) }
  function fillTplList(box, type, o) {
    box.innerHTML = '';
    box.classList.add('tpl-list');
    const rows = () => Array.from(box.children).filter((n) => n.dataset && n.dataset.id);
    store.templates(type).forEach((tp) => {
      const row = el('div', 'ctx-item db-row tpl-row');
      row.dataset.id = tp.id;
      const user = !tp.builtin;
      if (user) { const g = el('span', 'tpl-grip'); g.innerHTML = svg('grip', 14); g.title = 'Mantén pulsado y arrastra para cambiar de lugar'; row.appendChild(g); }
      row.appendChild(el('span', 'db-label', tp.name));
      if (user) {
        const star = el('button', 'fav-star' + (tp.fav ? ' on' : ''));
        star.innerHTML = svg('star', 15);
        star.title = 'Favorita: aparece al terminar de dibujar';
        star.onclick = (e) => {
          e.stopPropagation();
          const cur = store.userTemplates(type).find((x) => x.id === tp.id);
          if (!(cur && cur.fav) && !favFit(type, tp.id).fits) {
            toast('No puedes marcar más favoritas: ya ocupan las dos filas del ancho de la barra de ajustes. Desmarca alguna para agregar otra.', 5000);
            return;
          }
          star.classList.toggle('on', store.toggleTemplateFav(type, tp.id));
        };
        row.appendChild(star);
        const ren = el('button', 'fav-star'); ren.innerHTML = svg('edit', 14); ren.title = 'Cambiar el nombre';
        ren.onclick = (e) => {
          e.stopPropagation();
          const lab = row.querySelector('.db-label');
          const inp = el('input', 'tpl-rename'); inp.type = 'text'; inp.value = tp.name; inp.maxLength = 40;
          lab.replaceWith(inp); inp.focus(); inp.select();
          let fin = false;
          const done = (commit) => {
            if (fin) return; fin = true;
            if (commit) {
              const r = store.renameTemplate(type, tp.id, inp.value);
              if (r === 'dup') toast('Ya existe una plantilla con ese nombre');
            }
            fillTplList(box, type, o);
          };
          inp.onkeydown = (k) => { k.stopPropagation(); if (k.key === 'Enter') done(true); else if (k.key === 'Escape') done(false); };
          inp.onblur = () => done(true);
          inp.onclick = (k) => k.stopPropagation();
        };
        row.appendChild(ren);
        if (o.onUpdate) {
          const up = el('button', 'fav-star'); up.innerHTML = svg('refresh', 14); up.title = 'Actualizar la plantilla con el estilo de la línea actual';
          up.onclick = (e) => { e.stopPropagation(); o.onUpdate(tp); };
          row.appendChild(up);
        }
        if (o.onDelete) {
          const del = el('button', 'fav-star'); del.innerHTML = svg('trash', 14); del.title = 'Borrar esta plantilla';
          del.onclick = (e) => { e.stopPropagation(); o.onDelete(tp); };
          row.appendChild(del);
        }
        enableTplDrag(row, box, rows, type, () => fillTplList(box, type, o));
      }
      row.onclick = () => { if (box._noClick) return; o.onPick(tp); };
      box.appendChild(row);
    });
  }
  function enableTplDrag(row, box, rows, type, refill) {
    row.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target.closest && e.target.closest('button, input'))) return;
      const sx = e.clientX, sy = e.clientY;
      let dragging = false, lastY = sy, timer = null, scroller = null;
      const sc = box.closest('.tpl-menu, .ctx-sub');
      const start = () => {
        if (dragging) return;
        dragging = true; clearTimeout(timer);
        row.classList.add('tpl-dragging'); box.classList.add('tpl-sorting');
        scroller = setInterval(() => {
          if (!sc) return;
          const r = sc.getBoundingClientRect();
          if (lastY < r.top + 26) sc.scrollTop -= 14; else if (lastY > r.bottom - 26) sc.scrollTop += 14;
          place();
        }, 30);
      };
      const place = () => {
        const others = rows().filter((n) => n !== row);
        const next = others.find((n) => { const r = n.getBoundingClientRect(); return lastY < r.top + r.height / 2; });
        if (next) { if (row.nextSibling !== next) box.insertBefore(row, next); } else if (box.lastChild !== row) box.appendChild(row);
      };
      const move = (m) => {
        lastY = m.clientY;
        if (!dragging) { if (Math.abs(m.clientY - sy) > 8 || Math.abs(m.clientX - sx) > 8) start(); else return; }
        m.preventDefault();
        place();
      };
      const end = (up) => {
        clearTimeout(timer); clearInterval(scroller);
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onCancel, true);
        row.classList.remove('tpl-dragging'); box.classList.remove('tpl-sorting');
        if (dragging) {
          box._noClick = true; setTimeout(() => { box._noClick = false; }, 80);
          if (up) store.reorderTemplates(type, rows().map((n) => n.dataset.id));
          refill();
        }
      };
      const onUp = () => end(true);
      const onCancel = () => end(false);
      timer = setTimeout(start, 280);
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
    });
  }

  // ---------- Botones de plantillas favoritas al terminar una línea de tendencia ----------
  // Los botones se ajustan al ancho de la barra de ajustes del dibujo; si no caben en una fila se reparten en dos filas
  // equilibradas, y no se pueden marcar más favoritas de las que caben en dos filas (ver favFit).
  let quick = null;
  const QSEP = 6;
  let lastSelW = 0;   // último ancho conocido de la barra de ajustes
  function quickWidth() {
    const b = X.$('selBar');
    const w = b && !b.classList.contains('hidden') ? b.offsetWidth : 0;
    if (w) lastSelW = w;
    return Math.max(260, Math.min(lastSelW || 380, window.innerWidth - 16));
  }
  function makePill(tp) {
    const b = el('button', 'tpl-pill');
    const c = tp.style && /^#[0-9a-f]{6}$/i.test(tp.style.color || '') ? tp.style.color : null;
    if (c) { const dot = el('span', 'tpl-dot'); dot.style.background = c; b.appendChild(dot); }
    b.appendChild(el('span', 'tpl-pill-t', tp.name));
    b.title = `Aplicar la plantilla "${tp.name}" a esta línea`;
    return b;
  }
  // Mide el ancho de cada botón (fuera de pantalla).
  function measurePills(pills) {
    const m = el('div', 'tpl-quick');
    m.style.cssText = 'visibility:hidden;left:-9999px;top:0;flex-wrap:nowrap;max-width:none';
    pills.forEach((p) => m.appendChild(p));
    document.body.appendChild(m);
    const ws = pills.map((p) => p.offsetWidth);
    m.remove();
    return ws;
  }
  // Reparte los botones: una fila si caben en el ancho W; si no, dos filas lo más parejas posible. fits=false si ni así caben.
  function quickLayout(widths, W) {
    const n = widths.length;
    const rowW = (a, b) => widths.slice(a, b).reduce((t, w) => t + w, 0) + QSEP * Math.max(0, b - a - 1);
    if (rowW(0, n) <= W) return { rows: [[0, n]], width: rowW(0, n), fits: true };
    let best = null;
    for (let k = 1; k < n; k++) {
      const w = Math.max(rowW(0, k), rowW(k, n));
      if (!best || w < best.width) best = { rows: [[0, k], [k, n]], width: w };
    }
    if (!best) return { rows: [[0, n]], width: rowW(0, n), fits: false };
    best.fits = best.width <= W;
    return best;
  }
  // ¿Caben en dos filas las favoritas de este tipo si se agrega la plantilla addId?
  function favFit(type, addId) {
    const list = store.templates(type).filter((t) => t.fav || t.id === addId);
    if (!list.length) return { fits: true };
    return quickLayout(measurePills(list.map(makePill)), quickWidth());
  }
  function closeQuick() {
    if (!quick) return;
    quick.el.remove();
    document.removeEventListener('mousedown', quick.down, true);
    document.removeEventListener('keydown', quick.key, true);
    quick = null;
  }
  function showQuick(info) {
    closeQuick();
    const favs = store.favTemplates(info.type);
    if (!favs.length) return;
    const m = el('div', 'tpl-quick');
    const pills = favs.map((tp, i) => {
      const b = makePill(tp);
      b.style.animationDelay = (i * 15) + 'ms';
      b.onclick = () => { store.applyTemplate(info.sym, info.id, tp.id); closeQuick(); };
      return b;
    });
    const lay = quickLayout(measurePills(pills), quickWidth());
    m.style.visibility = 'hidden'; m.style.left = '-9999px'; m.style.top = '0';
    m.style.flexDirection = 'column'; m.style.flexWrap = 'nowrap'; m.style.alignItems = 'center'; m.style.gap = QSEP + 'px';
    lay.rows.forEach(([a, b]) => {
      const row = el('div', 'tpl-quick-row');
      pills.slice(a, b).forEach((p) => row.appendChild(p));
      m.appendChild(row);
    });
    m.style.width = Math.round(lay.width) + 'px';
    document.body.appendChild(m);
    // El bloque va encima de la línea, empezando en el punto A, a 12 px de ella (debajo si arriba no hay sitio).
    const GAP = 12;
    const ax = info.ax !== undefined ? info.ax : info.x, ay = info.ay !== undefined ? info.ay : info.y;
    const slope = info.x !== ax ? (info.y - ay) / (info.x - ax) : 0;
    const lineY = (x) => ay + slope * (x - ax);
    const w = m.offsetWidth, h = m.offsetHeight;
    const x = Math.max(8, Math.min(ax, window.innerWidth - w - 8));
    const top = Math.min(lineY(x), lineY(x + w)) - GAP - h;
    m.style.left = x + 'px';
    m.style.top = (top < 8 ? Math.min(window.innerHeight - h - 8, Math.max(lineY(x), lineY(x + w)) + GAP) : top) + 'px';
    m.style.visibility = '';
    const down = (e) => { if (!m.contains(e.target)) closeQuick(); };
    const key = (e) => { if (e.key === 'Escape') closeQuick(); };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    quick = { el: m, sym: info.sym, id: info.id, down, key };
  }

  // ---------- Aviso breve y pregunta "¿Actualizar plantilla?" ----------
  let toastEl = null, toastT = null, ask = null, watchSel = null;
  const mouse = { x: 300, y: 200 };
  document.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, true);
  function toast(msg, ms) {
    if (toastEl) toastEl.remove();
    clearTimeout(toastT);
    toastEl = el('div', 'tpl-toast', msg);
    document.body.appendChild(toastEl);
    toastT = setTimeout(() => { if (toastEl) { toastEl.remove(); toastEl = null; } }, ms || 2200);
  }
  function closeAsk() {
    if (!ask) return;
    document.removeEventListener('mousedown', ask.down, true);
    document.removeEventListener('keydown', ask.key, true);
    ask.el.remove(); ask = null;
  }
  // Si el dibujo viene de una plantilla y su estilo cambió, pregunta qué hacer.
  function askTplUpdate(sym, id) {
    if (ask) return;
    const tp = store.tplChanged(sym, id);
    if (!tp) return;
    const m = el('div', 'tpl-ask');
    m.appendChild(el('div', 'tpl-ask-t', '¿Actualizar plantilla?'));
    m.appendChild(el('div', 'tpl-ask-s', `Cambiaste el estilo de esta línea respecto a "${tp.name}".`));
    const row = el('div', 'tpl-ask-r');
    const yes = el('button', 'btn', 'Aceptar');
    yes.onclick = () => { const d = store.get(sym, id); if (d) { store.updateTemplate(d.type, tp.id, d); toast(`Plantilla "${tp.name}" actualizada`); } closeAsk(); };
    const no = el('button', 'btn secondary', 'No actualizar');
    no.onclick = () => { store.linkTemplate(sym, id, null); closeAsk(); };
    const cancel = el('button', 'btn secondary', 'Cancelar');
    cancel.onclick = () => { store.applyTemplate(sym, id, tp.id); closeAsk(); }; // vuelve al estilo de la plantilla
    row.append(yes, no, cancel); m.appendChild(row);
    document.body.appendChild(m);
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(mouse.x + 12, window.innerWidth - w - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(mouse.y + 12, window.innerHeight - h - 8)) + 'px';
    const down = (e) => { if (!m.contains(e.target)) closeAsk(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeAsk(); } };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    ask = { el: m, down, key };
  }
  // Al dejar de estar seleccionado un dibujo (clic en otro sitio), se pregunta si cambió respecto a su plantilla.
  function trackSelection() {
    const st = store.state;
    const cur = st.sel && st.multi.length === 1 ? { sym: st.sel.sym, id: st.multi[0] } : null;
    if (watchSel && !props && !(cur && cur.sym === watchSel.sym && cur.id === watchSel.id)) askTplUpdate(watchSel.sym, watchSel.id);
    watchSel = cur;
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
    });
    if (cat.id === 'shapes') {
      // Interruptor del ancla (para los círculos nuevos)
      const b = el('div', 'ctx-item db-row db-anchor');
      const ic = el('span', 'db-ic'); ic.innerHTML = svg('anchor', 18);
      const lab = el('span', 'db-label', '');
      const paint = () => { lab.textContent = (anchorOn() ? '✓ ' : '') + 'Círculo con ancla'; b.classList.toggle('on', anchorOn()); };
      paint();
      b.title = 'Al dibujar un círculo: primero un clic en la punta de una vela (máximo o mínimo) y luego otro clic donde quieres el círculo; los une una línea.';
      b.append(ic, lab);
      b.onclick = () => { setAnchorDefault(!anchorOn()); paint(); toast(anchorOn() ? 'Ancla activada: clic en la punta de una vela y luego clic donde quieres el círculo' : 'Ancla desactivada: el círculo se dibuja normal'); };
      m.appendChild(el('div', 'ctx-sep'));
      m.appendChild(b);
    }
    placeMenu(m, anchor, 'right');
    flyout = m;
  }
  // Imán: un clic lo activa (fuerte) y otro clic lo apaga; sin menú.
  function toggleMagnet() { closeFly(); setPref('magnet', magnetMode() === 'off' ? 'strong' : 'off'); }

  // v0.25.1: orden visual de los dibujos (por delante / por detrás de los demás)
  function orderMenuItems(m, sym, ids) {
    const add = (text, mode) => {
      const b = el('button', 'ctx-item');
      b.append(el('span', 'ctx-check', ''), el('span', '', text));
      b.onclick = () => { closeFly(); store.reorder(sym, ids, mode, chartNow()); };
      m.appendChild(b);
    };
    add('Traer al frente (todo delante)', 'front');
    add('Subir un paso (más adelante)', 'up');
    add('Bajar un paso (más atrás)', 'down');
    add('Enviar al fondo (todo detrás)', 'back');
  }
  function openOrderMenu(anchor, sym, ids) {
    closeFly();
    const m = el('div', 'ctx-menu');
    orderMenuItems(m, sym, ids);
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(6, Math.min(r.left, window.innerWidth - m.offsetWidth - 6)) + 'px';
    m.style.top = Math.min(r.bottom + 2, window.innerHeight - m.offsetHeight - 6) + 'px';
    ctxMenu = m;
  }

  function showCtx(x, y, sym, id, seg) {
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
    // Polilínea: editar un tramo (el más cercano al clic) o los textos de sus puntos
    if (!many && d.type === 'poly' && seg >= 0 && seg < d.pts.length - 1) {
      const segs = d.segs || {};
      const setSeg = (i, v) => { const cur = store.get(sym, id); if (!cur) return; const s2 = Object.assign({}, cur.segs || {}); if (v === null) delete s2[i]; else s2[i] = Object.assign({}, s2[i] || {}, v); store.patch(sym, id, { segs: s2 }); };
      item(`Cambiar el color del tramo ${seg + 1}…`, () => {
        const inp = el('input'); inp.type = 'color'; inp.value = hexOk((segs[seg] && segs[seg].color) || d.color);
        inp.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;opacity:0;width:1px;height:1px';
        document.body.appendChild(inp);
        inp.oninput = () => setSeg(seg, { color: inp.value });
        inp.onchange = () => { setSeg(seg, { color: inp.value }); inp.remove(); };
        inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 300));
        inp.click();
      });
      if (!(segs[seg] && segs[seg].hidden)) item(`Eliminar el tramo ${seg + 1}`, () => setSeg(seg, { hidden: true }));
      if (Object.keys(segs).some((k) => segs[k] && segs[k].hidden)) item('Restaurar los tramos eliminados', () => { const cur = store.get(sym, id); if (!cur) return; const s2 = {}; Object.keys(cur.segs || {}).forEach((k) => { const o = Object.assign({}, cur.segs[k]); delete o.hidden; if (Object.keys(o).length) s2[k] = o; }); store.patch(sym, id, { segs: s2 }); });
      if (Object.keys(segs).some((k) => segs[k] && segs[k].color)) item('Quitar los colores de los tramos', () => { const cur = store.get(sym, id); if (!cur) return; const s2 = {}; Object.keys(cur.segs || {}).forEach((k) => { const o = Object.assign({}, cur.segs[k]); delete o.color; if (Object.keys(o).length) s2[k] = o; }); store.patch(sym, id, { segs: s2 }); });
    }
    // Pincel: unir varios trazos en uno solo y separarlos
    if (many && ids.length > 1 && ids.every((i) => (store.get(sym, i) || {}).type === 'brush')) {
      item(`Unir los ${ids.length} trazos en uno solo`, () => store.mergeBrushes(sym, ids));
    }
    if (!many && d.type === 'brush' && d.breaks && d.breaks.length) item(`Separar en los ${d.breaks.length + 1} trazos originales`, () => store.splitBrush(sym, id));
    // Polilíneas: fusionar varias seleccionadas y dividir
    if (many && ids.length > 1 && ids.every((i) => (store.get(sym, i) || {}).type === 'poly')) {
      item(`Fusionar las ${ids.length} polilíneas en una sola`, () => store.mergePolys(sym, ids));
    }
    if (!many && d.type === 'poly') {
      if (d.parts && d.parts.length > 1) item(`Dividir en las ${d.parts.length} polilíneas originales`, () => store.splitPoly(sym, id));
      if (seg >= 1 && seg <= d.pts.length - 3) item(`Dividir aquí (en el tramo ${seg + 1})`, () => store.splitPoly(sym, id, seg));
    }
    // Plantillas: al pasar el mouse se despliegan las guardadas para esta herramienta
    {
      const wrap = el('div', 'ctx-wrap');
      const head = el('button', 'ctx-item');
      head.append(el('span', 'ctx-check', ''), el('span', '', 'Plantillas'), el('span', 'ctx-arrow', '▸'));
      wrap.appendChild(head);
      const sub = el('div', 'ctx-menu ctx-sub');
      if (!store.templates(d.type).length) { const e0 = el('div', 'ctx-item ctx-empty', 'Aún no hay plantillas de esta herramienta'); sub.appendChild(e0); }
      const listBox = el('div');
      fillTplList(listBox, d.type, { onPick: (tp) => {
        closeFly();
        store.begin(sym);
        ids.filter((i) => { const q = store.get(sym, i); return q && q.type === d.type; }).forEach((i) => store.applyTemplate(sym, i, tp.id));
        store.end();
      }, onUpdate: (tp) => {
        const cur = store.get(sym, id);
        if (cur && store.updateTemplate(d.type, tp.id, cur)) { store.linkTemplate(sym, id, tp.id); toast(`Plantilla "${tp.name}" actualizada`); }
      } });
      sub.appendChild(listBox);
      const sv = el('button', 'ctx-item ctx-save');
      sv.append(el('span', 'ctx-check', ''), el('span', '', 'Guardar el estilo de este dibujo como plantilla…'));
      sv.onclick = () => { closeFly(); askName('Guardar como plantilla', 'Mi plantilla', { ok: 'Guardar' }, (name) => { const cur = store.get(sym, id); if (cur) store.saveTemplate(cur.type, name, cur); }); };
      sub.appendChild(sv);
      wrap.appendChild(sub);
      wrap.onmouseenter = () => {
        const r = m.getBoundingClientRect();
        sub.classList.toggle('left', r.right + 260 > window.innerWidth);
        // La lista de plantillas siempre queda completa en pantalla: se sube si se sale por abajo y, si es más alta que la ventana, se desplaza
        requestAnimationFrame(() => {
          sub.style.top = '-5px';
          const b = sub.getBoundingClientRect();
          const over = b.bottom - (window.innerHeight - 8);
          if (over > 0) sub.style.top = Math.max(-5 - over, 8 - wrap.getBoundingClientRect().top) + 'px';
        });
      };
      m.appendChild(wrap);
    }
    {
      const wrapO = el('div', 'ctx-wrap');
      const headO = el('button', 'ctx-item');
      headO.append(el('span', 'ctx-check', ''), el('span', '', 'Orden visual'), el('span', 'ctx-arrow', '▸'));
      wrapO.appendChild(headO);
      const subO = el('div', 'ctx-menu ctx-sub');
      orderMenuItems(subO, sym, ids);
      wrapO.appendChild(subO);
      wrapO.onmouseenter = () => { const r = m.getBoundingClientRect(); subO.classList.toggle('left', r.right + 260 > window.innerWidth); };
      m.appendChild(wrapO);
    }
    item(many ? `Duplicar (${ids.length})` : 'Duplicar', duplicateSel);
    item(many ? 'Agrupar en carpeta…' : 'Meter en una carpeta…', () => newFolder(ids, null));
    if (d.folder) item('Sacar de la carpeta', () => store.moveToFolder(sym, ids, null));
    item(d.locked ? 'Desbloquear' : 'Bloquear', () => store.patchMany(sym, ids, { locked: !d.locked }));
    item(ids.every((i) => (store.get(sym, i) || {}).shared) ? 'Dejar de mostrar en los demás gráficos' : 'Mostrar también en los demás gráficos del activo', () => toggleShare(sym, ids));
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
    bar.appendChild(bigBtn('ruler', 'Regla: mide precio, porcentaje, velas y tiempo (y ancho en días × alto en décadas para escala logarítmica)', () => selectTool('ruler'), 'tool:ruler'));
    bar.appendChild(bigBtn('zoom', 'Acercar: arrastra un recuadro sobre el gráfico para ampliar esa zona (el botón Auto vuelve a la vista normal)', () => selectTool('zoom'), 'tool:zoom'));
    const zo = bigBtn('zoomout', 'Alejar: vuelve a la vista de antes del último zoom (solo aparece cuando el gráfico tiene zoom)', () => { const v = X.activeView(); if (v) v.zoomOut(); renderBar(); }, 'tool:zoomout');
    zo.classList.add('hidden');
    bar.appendChild(zo);
    bar.appendChild(el('span', 'db-sep'));
    bar.appendChild(bigBtn('magnet', 'Imán fuerte (clic para activar o apagar)', toggleMagnet, 'magnet'));
    bar.appendChild(bigBtn('keep', 'Mantener la herramienta activa después de dibujar', () => setPref('keep', !prefs().keep), 'keep'));
    bar.appendChild(bigBtn('share', 'Los dibujos NUEVOS también se ven en los demás gráficos del mismo activo (apagado: cada dibujo queda solo en su gráfico)', () => setPref('shareNew', !prefs().shareNew), 'shareNew'));
    bar.appendChild(bigBtn('eye', 'Ocultar / mostrar todos los dibujos del gráfico', () => setPref('hideAll', !prefs().hideAll), 'hideAll'));
    bar.appendChild(bigBtn('trash', 'Eliminar todos los dibujos de este activo', confirmClear, 'clear'));
    bar.appendChild(el('span', 'db-sep'));
    bar.appendChild(bigBtn('star', 'Mostrar / ocultar la barra de favoritos', () => setPref('favBar', !prefs().favBar), 'favBar'));
    // Barra derecha: panel de objetos
    const rb = X.$('rightBar');
    const slot = X.$('rbObjects') || rb;
    slot.innerHTML = '';
    slot.appendChild(bigBtn('list', 'Objetos: ver todos los dibujos (clic otra vez para cerrar)', toggleObjects, 'objects'));
  }
  // El botón de alejar solo se ve cuando el gráfico activo tiene zoom
  function updateZoomOut() {
    const b = X.$('drawBar').querySelector('[data-k="tool:zoomout"]');
    const v = X.activeView();
    if (b) b.classList.toggle('hidden', !(v && v.canZoomOut && v.canZoomOut()));
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
    updateZoomOut();
    on(bar, 'tool:ruler', t === 'ruler'); on(bar, 'tool:zoom', t === 'zoom');
    on(bar, 'magnet', magnetMode() !== 'off');
    const mb = bar.querySelector('[data-k="magnet"]');
    if (mb) mb.title = `${MAGNET[magnetMode()]} (clic para ${magnetMode() === 'off' ? 'activar' : 'apagar'})`;
    on(bar, 'keep', prefs().keep); on(bar, 'shareNew', prefs().shareNew); on(bar, 'hideAll', prefs().hideAll); on(bar, 'favBar', prefs().favBar);
    on(rb, 'objects', !X.$('objPanel').classList.contains('hidden'));
    const eyeBtn = bar.querySelector('[data-k="hideAll"]');
    if (eyeBtn) eyeBtn.innerHTML = svg(prefs().hideAll ? 'eyeoff' : 'eye', 20);
  }

  // ---------- Barras movibles (favoritos y propiedades del dibujo) ----------
  // Se arrastran desde el punto de agarre y quedan EXACTAMENTE donde se sueltan (sin imán a los bordes).
  // Doble clic en el punto de agarre: cambia entre barra vertical y horizontal.
  // Se guarda { cx, cy, horiz } = centro de la barra como fracción del gráfico. Las posiciones antiguas { edge, off } se siguen entendiendo.
  const BARS = { favBar: { key: 'favPos', def: { edge: 'left', off: 0.2 } }, selBar: { key: 'selPos', def: { edge: 'top', off: 0.5 } } };
  function placeBar(id, free) {
    const fb = X.$(id), wrap = X.$('gridWrap'), cfg = BARS[id];
    if (fb.classList.contains('hidden')) return;
    const pos = prefs()[cfg.key] || cfg.def;
    const W = wrap.clientWidth, H = wrap.clientHeight, M = 8;
    const horiz = free ? fb.classList.contains('horiz') : (pos.horiz !== undefined ? !!pos.horiz : (pos.edge === 'top' || pos.edge === 'bottom'));
    fb.classList.toggle('horiz', horiz);
    fb.style.transform = 'none'; fb.style.right = fb.style.bottom = '';
    const w = fb.offsetWidth, h = fb.offsetHeight;
    let x, y;
    if (free) { x = free.x - w / 2; y = free.y - h / 2; }
    else if (typeof pos.cx === 'number' && typeof pos.cy === 'number') { x = pos.cx * W - w / 2; y = pos.cy * H - h / 2; }
    else if (pos.edge === 'left') { x = M; y = pos.off * H - h / 2; }
    else if (pos.edge === 'right') { x = W - w - M; y = pos.off * H - h / 2; }
    else if (pos.edge === 'top') { y = M; x = pos.off * W - w / 2; }
    else { y = H - h - M; x = pos.off * W - w / 2; }
    // solo se evita que la barra salga del gráfico y se pierda
    fb.style.left = Math.max(2, Math.min(W - w - 2, x)) + 'px';
    fb.style.top = Math.max(2, Math.min(H - h - 2, y)) + 'px';
  }
  function saveBarPos(id, cx, cy, horiz) {
    const f = (v) => Math.max(0, Math.min(1, Math.round(v * 10000) / 10000));
    prefs()[BARS[id].key] = { cx: f(cx), cy: f(cy), horiz: !!horiz };
    X.saveCfg();
  }
  function makeGrip(id) {
    const grip = el('span', 'fav-grip'); grip.innerHTML = svg('grip', 16);
    grip.title = 'Arrastra para mover la barra donde quieras · Doble clic: cambiar entre vertical y horizontal';
    grip.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const wrap = X.$('gridWrap'), fb = X.$(id);
      // el punto de agarre queda bajo el cursor, tal como se tomó (la barra no salta al centro del cursor)
      const r0 = fb.getBoundingClientRect();
      const offX = e.clientX - (r0.left + r0.width / 2), offY = e.clientY - (r0.top + r0.height / 2);
      let last = null;
      const move = (m) => {
        const r = wrap.getBoundingClientRect();
        last = { x: m.clientX - offX - r.left, y: m.clientY - offY - r.top };
        placeBar(id, last);
      };
      const up = () => {
        window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
        if (!last) return;   // solo fue un clic
        placeBar(id, last);
        const W = wrap.clientWidth, H = wrap.clientHeight;
        const b = fb.getBoundingClientRect(), r = wrap.getBoundingClientRect();
        saveBarPos(id, (b.left + b.width / 2 - r.left) / W, (b.top + b.height / 2 - r.top) / H, fb.classList.contains('horiz'));
        placeBar(id);
      };
      window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true);
    };
    grip.ondblclick = (e) => {
      e.preventDefault();
      const wrap = X.$('gridWrap'), fb = X.$(id);
      const W = wrap.clientWidth, H = wrap.clientHeight;
      const b = fb.getBoundingClientRect(), r = wrap.getBoundingClientRect();
      saveBarPos(id, (b.left + b.width / 2 - r.left) / W, (b.top + b.height / 2 - r.top) / H, !fb.classList.contains('horiz'));
      placeBar(id);
    };
    return grip;
  }
  // Barra de ajustes del dibujo: siempre horizontal, centrada en el ancho del gráfico y SEL_GAP px por encima
  // del borde superior del dibujo seleccionado. Acompaña al dibujo al mover o ampliar el gráfico; si el dibujo sube
  // más allá del borde superior, la barra se queda en ese límite (y vuelve a seguirlo al bajar).
  const SEL_GAP = 90;
  const selTops = new WeakMap();   // gráfico (celda) -> { panel: borde superior del dibujo en pantalla }
  let selLast = '';
  function autoPlaceSel() {
    const bar = X.$('selBar');
    if (bar.classList.contains('hidden')) { selLast = ''; return; }
    const v = X.activeView(), wrap = X.$('gridWrap');
    if (!v || !v.host || !wrap) return;
    const m = selTops.get(v.host) || {};
    let top = null;
    Object.keys(m).forEach((k) => { if (m[k] !== null && (top === null || m[k] < top)) top = m[k]; });
    const hr = v.host.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    const sig = [top === null ? 'n' : Math.round(top), Math.round(hr.left), Math.round(hr.top), Math.round(hr.width), Math.round(hr.height), Math.round(wr.left), Math.round(wr.top), bar.offsetWidth, bar.offsetHeight].join('|');
    if (sig === selLast) return;
    selLast = sig;
    bar.classList.add('horiz');
    bar.style.transform = 'none'; bar.style.right = bar.style.bottom = '';
    const w = bar.offsetWidth, h = bar.offsetHeight;
    const minY = hr.top - wr.top + 2, maxY = hr.bottom - wr.top - h - 2;
    let y = top === null ? minY + 6 : top - wr.top - SEL_GAP - h;
    y = Math.max(minY, Math.min(Math.max(minY, maxY), y));
    const x = hr.left - wr.left + hr.width / 2 - w / 2;
    bar.style.left = Math.max(2, Math.round(x)) + 'px';
    bar.style.top = Math.round(y) + 'px';
  }
  if (window.TVDraw) {
    window.TVDraw.paintHook = (host, pane, top) => {
      let m = selTops.get(host);
      if (!m) { m = {}; selTops.set(host, m); }
      m[pane] = top;
      if (X && X.activeView() && X.activeView().host === host) autoPlaceSel();
    };
  }
  function renderFav() {
    const fb = X.$('favBar');
    const favs = prefs().favs.map(parseFav).filter((f) => D.TYPES[f.type]);
    fb.classList.toggle('hidden', !prefs().favBar || !favs.length);
    fb.innerHTML = '';
    fb.appendChild(makeGrip('favBar'));
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
    placeBar('favBar');
  }

  // ---------- Barra del objeto seleccionado ----------
  function iconBtn(icon, title, fn) {
    const b = el('button', 'db-btn small');
    b.innerHTML = svg(icon, 20); b.title = title; b.onclick = fn;
    return b;
  }
  // Propiedad de texto de un dibujo: 'text' y 'table' usan size/bold/italic; líneas y figuras usan tSize/tBold/tItalic.
  function textKey(d, k) {
    if (!d) return null;
    if (d.type === 'text' || d.type === 'table') return k;
    const t = 't' + k[0].toUpperCase() + k.slice(1);
    return d[t] !== undefined ? t : null;
  }
  function textVal(d, k) {
    const key = textKey(d, k);
    if (key === null) return k === 'size' ? 14 : false;
    return k === 'size' ? (d[key] || (d.type === 'table' ? 13 : d.type === 'text' ? 14 : 12)) : d[key];
  }
  function patchText(k, v) {
    const sym = symNow();
    selIds().forEach((id) => {
      const d = store.get(sym, id);
      const key = textKey(d, k);
      if (key) store.patchMany(sym, [id], { [key]: v });
    });
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
      r.color = el('input'); r.color.type = 'color';
      r.color.oninput = () => store.patchMany(sym, selIds(), { color: r.color.value });
      r.width = el('select');
      [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].forEach((n) => { const o = el('option', '', n + ' px'); o.value = String(n); r.width.appendChild(o); });
      r.width.onchange = () => store.patchMany(sym, selIds(), { width: Number(r.width.value) });
      r.lock = iconBtn('lock', 'Bloquear / desbloquear', () => { const all = selIds().every((id) => (store.get(sym, id) || {}).locked); store.patchMany(sym, selIds(), { locked: !all }); });
      r.share = iconBtn('share', 'Mostrar este dibujo también en los demás gráficos del mismo activo', () => toggleShare(sym, selIds()));
      r.eye = iconBtn('eyeoff', 'Ocultar (se vuelve a mostrar desde el panel de objetos)', () => store.patchMany(sym, selIds(), { hidden: true }));
      const dup = iconBtn('copy', 'Duplicar (Ctrl+D)', duplicateSel);
      const grp = iconBtn('folderadd', 'Agrupar en una carpeta', () => newFolder(selIds(), null));
      r.cfg = iconBtn('gear', 'Propiedades (doble clic sobre el dibujo)', () => { const i = selIds(); if (i.length === 1) openProps(sym, i[0]); });
      r.del = iconBtn('trash', 'Eliminar (Supr)', deleteSel);
      // texto: tamaño, negrita y cursiva (para el texto suelto, las tablas y el texto de las líneas y figuras)
      r.tsize = el('input', 'sb-size'); r.tsize.type = 'number'; r.tsize.min = 8; r.tsize.max = 80; r.tsize.title = 'Tamaño del texto (px)';
      r.tsize.onchange = () => {
        const v = Math.max(8, Math.min(80, parseInt(r.tsize.value, 10) || 0));
        if (!v) return;
        r.tsize.value = v; patchText('size', v);
      };
      r.tsize.onkeydown = (k) => k.stopPropagation();
      r.tbold = el('button', 'db-btn small sb-fmt sb-bold', 'N'); r.tbold.title = 'Negrita';
      r.tbold.onclick = () => patchText('bold', !textVal(store.get(sym, selIds()[0]), 'bold'));
      r.titalic = el('button', 'db-btn small sb-fmt sb-italic', 'K'); r.titalic.title = 'Cursiva';
      r.titalic.onclick = () => patchText('italic', !textVal(store.get(sym, selIds()[0]), 'italic'));
      r.tgroup = el('span', 'sb-text'); r.tgroup.append(r.tsize, r.tbold, r.titalic);
      // círculo: color y transparencia del relleno (independientes del contorno) y ancla
      r.fillc = el('input'); r.fillc.type = 'color'; r.fillc.title = 'Color del relleno';
      r.fillc.oninput = () => store.patchMany(sym, selIds(), { fColor: r.fillc.value, fill: true });
      r.fillop = el('input', 'sb-op'); r.fillop.type = 'range'; r.fillop.min = 0; r.fillop.max = 100; r.fillop.title = 'Transparencia del relleno (izquierda: más transparente · derecha: más denso)';
      r.fillop.oninput = () => store.patchMany(sym, selIds(), { fillOpacity: Number(r.fillop.value), fill: true });
      r.fillop.onkeydown = (k) => k.stopPropagation();
      r.fgroup = el('span', 'sb-fill'); r.fgroup.append(r.fillc, r.fillop);
      r.anchor = iconBtn('anchor', 'Ancla: pegar el círculo a la punta de una vela (máximo o mínimo) y unirlos con una línea', () => {
        const layer = layerNow(); if (!layer) return;
        const all = selIds().every((id) => (store.get(sym, id) || {}).anchor);
        selIds().forEach((id) => layer.setAnchor(id, !all));
      });
      // pincel: unir varios trazos en uno solo / separarlos
      r.join = iconBtn('join', 'Unir los trazos seleccionados en un solo trazo', () => store.mergeBrushes(sym, selIds()));
      r.split = iconBtn('split', 'Separar este trazo en los trazos originales', () => { const ids = selIds(); if (ids.length === 1) store.splitBrush(sym, ids[0]); });
      bar.append(r.color, r.fgroup, r.anchor, r.join, r.split, r.width, r.lock, r.share, r.eye, dup, grp, r.tgroup);
      if (!many) bar.appendChild(r.cfg);
      bar.appendChild(r.del);
      sel.refs = r;
      X.decoratePalette(bar);
    }
    const r = sel.refs;
    const ds = ids.map((id) => store.get(sym, id));
    if (document.activeElement !== r.color) r.color.value = hexOk(ds[0].color);
    r.width.value = String(Math.max(1, Math.min(20, Math.round(ds[0].width || 1))));
    if (r.width.value === '') r.width.value = String([1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].reduce((b, n) => (Math.abs(n - (ds[0].width || 1)) < Math.abs(b - (ds[0].width || 1)) ? n : b), 1));
    const onlyText = ds.every((d) => d.type === 'text' || d.type === 'table');
    r.width.classList.toggle('hidden', onlyText);
    const allCircle = ds.every((d) => d.type === 'circle');
    r.fgroup.classList.toggle('hidden', !allCircle);
    r.anchor.classList.toggle('hidden', !allCircle);
    const allBrush = ds.every((d) => d.type === 'brush');
    r.join.classList.toggle('hidden', !(allBrush && ds.length > 1 && ds.every((d) => !d.locked)));
    r.split.classList.toggle('hidden', !(allBrush && ds.length === 1 && ds[0].breaks && ds[0].breaks.length && !ds[0].locked));
    if (allCircle) {
      if (document.activeElement !== r.fillc) r.fillc.value = hexOk(ds[0].fColor || ds[0].color);
      if (document.activeElement !== r.fillop) r.fillop.value = String(ds[0].fill ? (ds[0].fillOpacity == null ? 20 : ds[0].fillOpacity) : 0);
      r.anchor.classList.toggle('active', ds.every((d) => d.anchor));
    }
    const canText = ds.every((d) => textKey(d, 'size') !== null);
    r.tgroup.classList.toggle('hidden', !canText);
    if (canText) {
      if (document.activeElement !== r.tsize) r.tsize.value = String(textVal(ds[0], 'size'));
      r.tbold.classList.toggle('active', !!textVal(ds[0], 'bold'));
      r.titalic.classList.toggle('active', !!textVal(ds[0], 'italic'));
    }
    const allLocked = ds.every((d) => store.isLocked(sym, d));
    r.lock.classList.toggle('active', allLocked);
    r.lock.innerHTML = svg(allLocked ? 'lock' : 'unlock', 20);
    r.share.classList.toggle('active', ds.every((d) => d.shared));
    r.del.disabled = allLocked;
    selLast = '';
    autoPlaceSel();
  }

  // ---------- Panel "Objetos" ----------
  function toggleObjects() {
    const p = X.$('objPanel');
    if (p.classList.contains('hidden')) { X.$('panel').classList.add('hidden'); X.$('btnIndicators').classList.remove('active'); if (window.TVWatch) window.TVWatch.close(); if (window.TVFractalUI) window.TVFractalUI.close(); }
    p.classList.toggle('hidden');
    treeSig = '';
    renderAll();
  }
  let lastRowClick = { sym: null, id: null };
  function renderTree(force) {
    const p = X.$('objPanel');
    if (p.classList.contains('hidden')) return;
    const sym = symNow(), list = store.listFor(sym, chartNow()), folders = store.folders(sym);
    const ids = selIds();
    const vc = X.activeCfg();
    const indSig = JSON.stringify([vc.ind, vc.maOn, vc.mas.map((m) => [m.id, m.period, m.visible, m.color])]);
    const sig = sym + '|' + ids.join(',') + '|' + prefs().hideAll + '|' + JSON.stringify(list.map((d) => [d.id, d.type, d.text, d.hidden, d.locked, d.color, d.folder, d.shared])) + '|' + chartNow() + '|' + JSON.stringify(folders) + '|' + indSig;
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
    renderIndicatorRows(p, vc);
    p.appendChild(el('h4', 'obj-head', `Dibujos de ${sym}`));
    p.appendChild(top);
    if (!list.length && !folders.length) p.appendChild(el('p', 'hint', 'Todavía no hay dibujos en este activo. Elige una herramienta en la barra izquierda y dibuja en el gráfico. Para seleccionar varios: Shift + arrastrar (recuadro), Ctrl + clic (uno por uno) o Shift + clic en la lista (todo un rango).'));
    const wrap = el('div', 'tree-root');
    wrap.ondragover = (e) => { if (dragData) { e.preventDefault(); wrap.classList.add('drop-root'); } };
    wrap.ondragleave = (e) => { if (e.target === wrap) wrap.classList.remove('drop-root'); };
    wrap.ondrop = (e) => { e.preventDefault(); wrap.classList.remove('drop-root'); dropOn(sym, null); };
    p.appendChild(wrap);

    const fexists = (id) => !!id && !!store.folder(sym, id);
    const mkBtn = (row, icon, title, fn) => { const b = el('button', 'obj-btn'); b.innerHTML = svg(icon, 15); b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); }; row.appendChild(b); };
    const visOrder = [];
    let anchorId = null;
    function itemRow(d, depth) {
      visOrder.push(d.id);
      const row = el('div', 'obj-row' + (store.isSelected(sym, d.id) ? ' sel' : '') + (store.isHidden(sym, d) ? ' off' : ''));
      row.style.paddingLeft = 6 + depth * 16 + 'px';
      row.draggable = true;
      row.ondragstart = (e) => { dragData = { kind: 'items', ids: store.isSelected(sym, d.id) ? selIds() : [d.id] }; e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; };
      row.ondragend = () => { dragData = null; };
      const ic = el('span', 'obj-ic'); ic.innerHTML = svg(d.type, 16); ic.style.color = hexOk(d.color);
      row.append(ic, el('span', 'obj-name', store.label(d)));
      // si el dibujo forma parte de una selección de varios, el ojo y el candado actúan sobre todos los seleccionados
      const grp = () => (store.isSelected(sym, d.id) && selIds().length > 1 ? selIds() : [d.id]);
      const gAny = (f) => grp().some((id) => { const x = store.get(sym, id); return x && f(x); });
      const gHide = !gAny((x) => !x.hidden), gLock = !gAny((x) => !x.locked);   // true = todos ya ocultos / bloqueados
      mkBtn(row, gHide ? 'eyeoff' : 'eye', gHide ? 'Mostrar' : 'Ocultar', () => store.patchMany(sym, grp(), { hidden: !gHide }));
      mkBtn(row, gLock ? 'lock' : 'unlock', gLock ? 'Desbloquear' : 'Bloquear', () => store.patchMany(sym, grp(), { locked: !gLock }));
      if (fexists(d.folder)) mkBtn(row, 'out', 'Sacar de la carpeta', () => store.moveToFolder(sym, grp(), null));
      mkBtn(row, 'copy', 'Duplicar', () => store.duplicateMany(sym, grp(), shiftFn()));
      { const bo = el('button', 'obj-btn'); bo.innerHTML = svg('layers', 15); bo.title = 'Orden visual: al frente, un paso adelante, un paso atrás o al fondo'; bo.onclick = (e) => { e.stopPropagation(); openOrderMenu(bo, sym, grp()); }; row.appendChild(bo); }
      mkBtn(row, 'trash', 'Eliminar', () => { const ok = unlocked(sym, grp()); if (ok.length) store.removeMany(sym, ok); });
      row.onmousedown = (e) => { if (e.shiftKey) e.preventDefault(); };   // evita que Shift+clic seleccione texto
      row.onclick = (e) => {
        if (e.shiftKey) {
          // Shift + clic: selecciona todos los dibujos entre el último clic y este (en el orden de la lista)
          const from = visOrder.indexOf(lastRowClick.sym === sym && visOrder.includes(lastRowClick.id) ? lastRowClick.id : (selIds().slice(-1)[0] || d.id));
          const to = visOrder.indexOf(d.id);
          if (from >= 0 && to >= 0) {
            const range = visOrder.slice(Math.min(from, to), Math.max(from, to) + 1);
            store.selectMany(sym, range, e.ctrlKey || e.metaKey);
            return;
          }
        }
        lastRowClick = { sym, id: d.id };
        store.select(sym, d.id, e.ctrlKey || e.metaKey ? 'toggle' : undefined);
      };
      row.ondblclick = () => openProps(sym, d.id);
      return row;
    }
    function folderRow(f, depth) {
      const items = store.folderItems(sym, f.id);
      const allHidden = !!f.hidden, allLocked = !!f.locked;
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
      mkBtn(row, allHidden ? 'eyeoff' : 'eye', allHidden ? 'Mostrar la carpeta (las subcarpetas ocultas a mano siguen ocultas)' : 'Ocultar la carpeta y todo lo que contiene', () => store.setFolderFlag(sym, f.id, 'hidden', !allHidden));
      mkBtn(row, allLocked ? 'lock' : 'unlock', allLocked ? 'Desbloquear la carpeta' : 'Bloquear la carpeta y todo lo que contiene', () => store.setFolderFlag(sym, f.id, 'locked', !allLocked));
      mkBtn(row, 'folderadd', 'Crear una subcarpeta aquí (con los dibujos seleccionados, si hay)', () => newFolder(selIds(), f.id));
      mkBtn(row, 'trash', 'Eliminar la carpeta y todo lo que contiene', () => confirmDeleteFolder(sym, f));
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
      showAll.onclick = () => { store.showAll(sym); if (prefs().hideAll) setPref('hideAll', false); };
      const delAll = el('button', 'btn secondary', 'Eliminar todos');
      delAll.onclick = confirmClear;
      act.append(lockAll, showAll, delAll);
      p.appendChild(act);
    }
    p.scrollTop = keepScroll;
  }
  // Indicadores activos del gráfico seleccionado, con ocultar (ojo) y eliminar (papelera).
  function renderIndicatorRows(p, vc) {
    const rows = [];
    const ind = vc.ind;
    if (ind.rsi && ind.rsi.on) rows.push({ name: `RSI (${ind.rsi.len})`, color: ind.rsi.color, hidden: !!ind.rsi.hide, toggle: () => { ind.rsi.hide = !ind.rsi.hide; }, remove: () => { ind.rsi.on = false; ind.rsi.hide = false; }, kind: 'ind' });
    if (ind.stoch && ind.stoch.on) rows.push({ name: `Estocástico (${ind.stoch.k}, ${ind.stoch.sm}, ${ind.stoch.d})`, color: ind.stoch.kColor, hidden: !!ind.stoch.hide, toggle: () => { ind.stoch.hide = !ind.stoch.hide; }, remove: () => { ind.stoch.on = false; ind.stoch.hide = false; }, kind: 'ind' });
    if (ind.delta && ind.delta.on) rows.push({ name: 'Delta (compra − venta)', color: ind.delta.upColor, hidden: !!ind.delta.hide, toggle: () => { ind.delta.hide = !ind.delta.hide; }, remove: () => { ind.delta.on = false; ind.delta.hide = false; }, kind: 'ind' });
    if (ind.cvd && ind.cvd.on) rows.push({ name: 'Delta acumulado (CVD)', color: ind.cvd.color, hidden: !!ind.cvd.hide, toggle: () => { ind.cvd.hide = !ind.cvd.hide; }, remove: () => { ind.cvd.on = false; ind.cvd.hide = false; }, kind: 'ind' });
    if (ind.pivots && ind.pivots.on) rows.push({ name: `Pivotes (${ind.pivots.type})`, color: '#ff9800', hidden: !!ind.pivots.hide, toggle: () => { ind.pivots.hide = !ind.pivots.hide; }, remove: () => { ind.pivots.on = false; ind.pivots.hide = false; }, kind: 'ind' });
    vc.mas.forEach((ma) => {
      if (!(vc.maOn || {})[ma.type]) return;
      rows.push({ name: `${ma.type} ${ma.period}`, color: ma.color, hidden: !ma.visible, toggle: () => { ma.visible = !ma.visible; }, remove: () => { vc.mas = vc.mas.filter((m) => m !== ma); }, kind: 'ma' });
    });
    p.appendChild(el('h4', 'obj-head', 'Indicadores de este gráfico'));
    if (!rows.length) { p.appendChild(el('p', 'hint small', 'No hay indicadores activos (se activan desde el botón Indicadores).')); return; }
    rows.forEach((r) => {
      const row = el('div', 'obj-row' + (r.hidden ? ' off' : ''));
      const ic = el('span', 'obj-ic'); ic.innerHTML = svg('ind', 16); ic.style.color = hexOk(r.color);
      row.append(ic, el('span', 'obj-name', r.name));
      const apply = () => (r.kind === 'ma' ? X.refreshMas() : X.refreshInd());
      const mk = (icon, title, fn) => { const b = el('button', 'obj-btn'); b.innerHTML = svg(icon, 15); b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); apply(); X.renderPanel(); }; row.appendChild(b); };
      mk(r.hidden ? 'eyeoff' : 'eye', r.hidden ? 'Mostrar' : 'Ocultar', r.toggle);
      mk('trash', 'Eliminar (se puede volver a activar desde Indicadores)', () => { r.remove(); X.refreshInd(); });
      p.appendChild(row);
    });
  }
  function confirmDeleteFolder(sym, f) {
    const items = store.folderItems(sym, f.id).length;
    const subs = store.folders(sym).filter((x) => x.parent === f.id).length;
    X.openModal((box) => {
      box.appendChild(el('h3', '', `Eliminar la carpeta "${f.name}"`));
      if (store.folderHasLocked(sym, f.id)) {
        box.appendChild(el('p', 'hint', 'Hay elementos o carpetas bloqueados dentro. Desbloquéalos antes de eliminarla.'));
        const row = el('div', 'row-actions'); const no = el('button', 'btn', 'Cerrar'); no.onclick = () => X.closeModal(); row.appendChild(no); box.appendChild(row);
        return;
      }
      box.appendChild(el('p', 'hint', `Se eliminará la carpeta con sus ${items} dibujos${subs ? ` y ${subs} subcarpeta${subs > 1 ? 's' : ''}` : ''}. Puedes deshacerlo con Ctrl+Z.`));
      const row = el('div', 'row-actions');
      const all = el('button', 'btn', 'Eliminar todo');
      all.onclick = () => { store.deleteFolder(sym, f.id); X.closeModal(); };
      const only = el('button', 'btn secondary', 'Solo quitar la carpeta');
      only.title = 'Los dibujos se conservan'; only.onclick = () => { store.removeFolder(sym, f.id); X.closeModal(); };
      const no = el('button', 'btn secondary', 'Cancelar'); no.onclick = () => X.closeModal();
      row.append(all, only, no); box.appendChild(row);
    });
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
      if (store.hasTemplate(type, nm)) {
        closeTpl();
        X.openModal((box) => {
          box.appendChild(el('h3', '', 'Ya existe una plantilla con ese nombre'));
          box.appendChild(el('p', 'hint', `Ya tienes una plantilla "${nm}" para esta herramienta. ¿Quieres reemplazarla con el estilo actual?`));
          const row = el('div', 'row-actions');
          const yes = el('button', 'btn', 'Reemplazar');
          yes.onclick = () => { store.saveTemplate(type, nm, store.get(sym, id) || cur); X.closeModal(); };
          const no = el('button', 'btn secondary', 'Cancelar'); no.onclick = () => X.closeModal();
          row.append(yes, no); box.appendChild(row);
        });
        return;
      }
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
    if (tpls.length) m.appendChild(el('div', 'tpl-hint', '★ = favorita (sale al terminar de dibujar) · mantén pulsado y arrastra para ordenar'));
    const listBox = el('div');
    fillTplList(listBox, type, {
      onPick: (tp) => { store.applyTemplate(sym, id, tp.id); closeTpl(); refill(); },
      onDelete: (tp) => { store.deleteTemplate(type, tp.id); openTplMenu(anchor, sym, id, refill); },
      onUpdate: (tp) => {
        const cur = store.get(sym, id);
        if (cur && store.updateTemplate(type, tp.id, cur)) { store.linkTemplate(sym, id, tp.id); toast(`Plantilla "${tp.name}" actualizada`); }
      },
    });
    m.appendChild(listBox);
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
      if (ok) { store.end(); setTimeout(() => askTplUpdate(sym, id), 0); } else store.abort();
    };
    props = state;
    X.openModal((box) => {
      const cur = () => store.get(sym, id);
      const cur0 = cur;
      const patch = (o) => { if (cur()) store.patch(sym, id, o); };
      const d0 = cur();
      const t = d0.type;
      // Pestañas (Estilo, Texto, Contenido, Niveles, Tramos, Coordenadas, Objeto): solo aparecen las que tienen algo que mostrar.
      const hasCoords = t === 'rect' || t === 'fib' || t === 'hline' || t === 'hray';
      const TABS = [['style', 'Estilo'], ['text', 'Texto'], ['content', 'Contenido'], ['levels', 'Niveles'], ['segs', 'Tramos'], ['coords', 'Coordenadas'], ['obj', 'Objeto']];
      let tab = t === 'text' ? 'text' : 'style';
      box.classList.add('props');
      const head = el('div', 'props-head');
      head.appendChild(el('h3', '', D.TYPES[t].label));
      const tabBtns = {};
      TABS.forEach(([k, label]) => {
        const b = el('button', 'props-tab', label);
        b.onclick = () => { tab = k; showTab(); };
        tabBtns[k] = b; head.appendChild(b);
      });
      box.appendChild(head);
      const bodyWrap = el('div', 'props-body');
      box.appendChild(bodyWrap);
      const secs = {};
      let body = bodyWrap;
      const sec = (k) => { body = secs[k]; };
      const showTab = () => {
        let any = false;
        TABS.forEach(([k]) => {
          const has = secs[k] && secs[k].childNodes.length > 0;
          tabBtns[k].style.display = has ? '' : 'none';
          if (k === tab && !has) tab = 'style';
        });
        TABS.forEach(([k]) => { const on = k === tab; tabBtns[k].classList.toggle('active', on); if (secs[k]) secs[k].style.display = on ? '' : 'none'; if (on) any = true; });
        if (!any && secs.style) { tab = 'style'; secs.style.style.display = ''; }
      };

      const field = (label, ctrl) => { const f = el('div', 'field'); f.append(el('span', '', label), ctrl); body.appendChild(f); return f; };
      const sub = (txt) => body.appendChild(el('h4', '', txt));
      // Una casilla que habilita o deshabilita otras opciones: apagada, las demás se ven atenuadas y no se pueden tocar.
      const gate = (fld, others) => {
        const chk = fld.querySelector('input[type=checkbox]');
        const upd = () => others.forEach((f) => { f.classList.toggle('off', !chk.checked); f.querySelectorAll('input,select,button').forEach((x) => { x.disabled = !chk.checked; }); });
        const old = chk.onchange; chk.onchange = () => { if (old) old(); upd(); }; upd();
      };
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
  const CAP_OPTS = [['none', 'Ninguna'], ['arrow', 'Flecha'], ['circle', 'Círculo'], ['bar', 'Barra vertical']];
  const DASH_OPTS = [['solid', 'Continua'], ['dashed', 'Guiones'], ['dotted', 'Puntos']];
      // Texto sobre la línea / niveles: mismos controles en tendencia, horizontal, rayo horizontal y Fibonacci.
      const textBlock = (d, withContent, noPos) => {
        if (!withContent) sub('Texto de los niveles');
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
        field('Cursiva', checkIn(d.tItalic, (v) => patch({ tItalic: v })));
        const posOpts = t === 'rect'
          ? [['center', 'Interior'], ['above', 'Superior (por encima de la línea de arriba)'], ['below', 'Inferior (por debajo de la línea de abajo)']]
          : [['above', 'Por encima de la línea'], ['center', 'En el centro (sobre la línea)'], ['below', 'Por debajo de la línea']];
        if (noPos) return;
        field('Posición', selIn(posOpts, d.tV || 'above', (v) => patch({ tV: v })));
        field('Lugar del texto', selIn([['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']], d.tH || 'left', (v) => patch({ tH: v })));
      };

      // ---- Editor de tabla: celdas, estilo de toda la tabla, contorno por celda (Shift + clic suma celdas) y estilo por columna ----
      let tSel = new Set();
      const keyOf = (r, c) => r + ',' + c;
      function tableBlock(d) {
        box.classList.add('wide');
        const clone = (o) => JSON.parse(JSON.stringify(o));
        const patchCells = (fn) => { const cells = clone(cur().cells); fn(cells); patch({ cells }); };
        const patchCols = (fn) => { const cs = clone(cur().colStyles); fn(cs); patch({ colStyles: cs }); };
        const resize = (rows, cols) => { const nd = { rows: rows || cur().rows, cols: cols || cur().cols, cells: clone(cur().cells), colStyles: clone(cur().colStyles) }; D.fixTable(nd); tSel = new Set(); patch({ rows: nd.rows, cols: nd.cols, cells: nd.cells, colStyles: nd.colStyles }); fill(); };
        const numChange = (val, min, max, fn) => { const i = el('input'); i.type = 'number'; i.min = min; i.max = max; i.value = val; i.style.width = '80px'; i.onchange = () => { const v = parseInt(i.value, 10); if (isFinite(v)) fn(Math.max(min, Math.min(max, v))); }; return i; };
        const alignSel = (val, fn) => selIn([['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']], val || 'left', fn);
        sec('style'); sub('Forma de la tabla');
        field('Filas', numChange(d.rows, 1, 30, (v) => resize(v, null)));
        field('Columnas', numChange(d.cols, 1, 30, (v) => resize(null, v)));
        field('Fijar la tabla al borde del gráfico', selIn([['none', 'No (se mueve con el gráfico)'], ['left', 'A la izquierda'], ['right', 'A la derecha']], d.pin || 'none', (v) => patch({ pin: v })));
        body.appendChild(el('p', 'hint small', 'Fijada, la tabla no se mueve al ampliar o desplazar el gráfico (como el texto de una línea horizontal): solo sigue la altura (precio) donde la pusiste. Arrástrala para cambiar su altura y su distancia al borde.'));
        body.appendChild(el('h4', '', 'Estilo general (para toda la tabla)'));
        field('Color del texto', colorIn(d.color, (v) => patch({ color: v })));
        field('Tamaño (px)', numIn(d.size || 13, 8, 60, 1, (v) => patch({ size: v })));
        field('Negrita', checkIn(d.bold, (v) => patch({ bold: v })));
        field('Cursiva', checkIn(d.italic, (v) => patch({ italic: v })));
        field('Alineación del texto', alignSel(d.align, (v) => patch({ align: v })));
        field('Color del contorno de las celdas', colorIn(d.bColor, (v) => patch({ bColor: v })));
        field('Grosor del contorno (0 = sin contorno)', numIn(d.bWidth == null ? 1 : d.bWidth, 0, 8, 1, (v) => patch({ bWidth: v })));
        field('Fondo', checkIn(d.fill, (v) => patch({ fill: v })));
        field('Color del fondo', colorIn(d.fillColor, (v) => patch({ fillColor: v })));
        field('Opacidad del fondo', rangeIn(d.fillOpacity == null ? 10 : d.fillOpacity, (v) => patch({ fillOpacity: v })));

        sec('content'); sub('Contenido y celdas');
        body.appendChild(el('p', 'hint small', 'Escribe en las celdas o pega desde Excel (copia las celdas en Excel y pega en la celda donde empieza). Clic en una celda la selecciona; Shift + clic suma o quita celdas. Abajo cambias el contorno y el texto de las celdas elegidas.'));
        const gridWrap = el('div', 'tbl-wrap');
        const grid = el('div', 'tbl-grid');
        grid.style.gridTemplateColumns = `repeat(${d.cols}, minmax(86px, 1fr))`;
        const cellBox = el('div', 'tbl-cellbox');
        const inputs = {};
        const markSel = () => { Object.keys(inputs).forEach((k) => inputs[k].classList.toggle('sel', tSel.has(k))); drawCellBox(); };
        for (let r = 0; r < d.rows; r++) {
          for (let c = 0; c < d.cols; c++) {
            const inp = el('input', 'tbl-cell'); inp.type = 'text'; inp.value = d.cells[r][c].text || '';
            inp.oninput = () => patchCells((cells) => { cells[r][c].text = inp.value; });
            inp.onmousedown = (e) => {
              const k = keyOf(r, c);
              if (e.shiftKey) { e.preventDefault(); if (tSel.has(k)) tSel.delete(k); else tSel.add(k); markSel(); }
            };
            // Pegar desde Excel: varias celdas separadas por tabuladores / saltos de línea llenan la tabla desde esta celda
            inp.onpaste = (e) => {
              const txt = ((e.clipboardData || window.clipboardData).getData('text') || '');
              if (!/[\t\n]/.test(txt.replace(/\n$/, ''))) return;
              e.preventDefault();
              const grid2 = txt.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((l) => l.split('\t'));
              const nd = { rows: Math.max(cur().rows, Math.min(30, r + grid2.length)), cols: Math.max(cur().cols, Math.min(30, c + Math.max(...grid2.map((x) => x.length)))), cells: clone(cur().cells), colStyles: clone(cur().colStyles) };
              D.fixTable(nd);
              grid2.forEach((cs, i) => cs.forEach((v, j) => { if (r + i < nd.rows && c + j < nd.cols) nd.cells[r + i][c + j].text = v.replace(/^"(.*)"$/, '$1').trim(); }));
              patch({ rows: nd.rows, cols: nd.cols, cells: nd.cells, colStyles: nd.colStyles });
              fill();
            };
            inp.onfocus = () => { if (!(tSel.size > 1 && tSel.has(keyOf(r, c)))) { tSel = new Set([keyOf(r, c)]); markSel(); } };
            inputs[keyOf(r, c)] = inp; grid.appendChild(inp);
          }
        }
        gridWrap.appendChild(grid); body.appendChild(gridWrap); body.appendChild(cellBox);
        function drawCellBox() {
          cellBox.innerHTML = '';
          const cells = [...tSel].map((k) => k.split(',').map(Number));
          if (!cells.length) { cellBox.appendChild(el('p', 'hint small', 'Ninguna celda seleccionada.')); return; }
          const cd = cur();
          const [r0, c0] = cells[0];
          const st = D.cellStyle(cd, r0, c0);
          cellBox.appendChild(el('h4', '', `Celdas seleccionadas: ${cells.length}`));
          const f2 = (label, ctrl) => { const f = el('div', 'field'); f.append(el('span', '', label), ctrl); cellBox.appendChild(f); };
          const each = (fn) => patchCells((cs) => cells.forEach(([r, c]) => fn(cs[r][c])));
          f2('Color del contorno', colorIn(st.bColor, (v) => each((x) => { x.bColor = v; })));
          f2('Grosor del contorno', numIn(st.bWidth == null ? 1 : st.bWidth, 0, 8, 1, (v) => each((x) => { x.bWidth = v; })));
          f2('Color del texto', colorIn(st.color, (v) => each((x) => { x.color = v; })));
          f2('Negrita', checkIn(st.bold, (v) => each((x) => { x.bold = v; })));
          f2('Cursiva', checkIn(st.italic, (v) => each((x) => { x.italic = v; })));
          f2('Alineación', alignSel(st.align, (v) => each((x) => { x.align = v; })));
          const reset = el('button', 'btn secondary', 'Quitar los ajustes propios de estas celdas');
          reset.onclick = () => { each((x) => { ['bColor', 'bWidth', 'color', 'bold', 'italic', 'align', 'size'].forEach((k) => { delete x[k]; }); }); drawCellBox(); };
          cellBox.appendChild(reset);
          X.decoratePalette(cellBox);
        }
        drawCellBox();

        sub('Estilo por columna');
        body.appendChild(el('p', 'hint small', 'Cada columna puede tener su propio texto: por ejemplo la 1 solo en negrita y la 2 solo en cursiva y de otro color. Una celda con ajustes propios manda sobre su columna.'));
        for (let c = 0; c < d.cols; c++) {
          const cs = d.colStyles[c] || {};
          const row = el('div', 'tbl-colrow');
          row.appendChild(el('span', 'tbl-colname', `Columna ${c + 1}`));
          row.appendChild(colorIn(cs.color || d.color, (v) => patchCols((a) => { a[c].color = v; })));
          const lb = (txt, key) => { const l = el('label', 'tbl-chk'); const i = checkIn(cs[key] !== undefined && cs[key] !== null ? cs[key] : d[key], (v) => patchCols((a) => { a[c][key] = v; })); l.append(i, document.createTextNode(txt)); return l; };
          row.append(lb('Negrita', 'bold'), lb('Cursiva', 'italic'));
          row.appendChild(alignSel(cs.align || d.align, (v) => patchCols((a) => { a[c].align = v; })));
          const x = el('button', 'btn secondary small', 'Quitar'); x.title = 'Quitar los ajustes propios de esta columna';
          x.onclick = () => { patchCols((a) => { a[c] = {}; }); fill(); };
          row.appendChild(x);
          body.appendChild(row);
        }
      }

      // ---- Pestaña "Coordenadas": escribir a mano los precios (y el ancho de tiempo del rectángulo) ----
      function coordsBlock(d) {
        const setPts = (fn) => { const pts = cur().pts.map((x) => Object.assign({}, x)); fn(pts); patch({ pts }); fill(); };
        const priceIn = (val, fn) => {
          const i = el('input'); i.type = 'number'; i.step = 'any'; i.min = '0'; i.value = String(val); i.style.width = '150px';
          i.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); };
          i.onchange = () => { const v = parseFloat(String(i.value).replace(',', '.')); if (isFinite(v) && v > 0) fn(v); else i.value = String(val); };
          return i;
        };
        body.appendChild(el('p', 'hint', 'Escribe el valor y pulsa Enter (o sal de la casilla): el dibujo se mueve al momento.'));
        if (t === 'hline' || t === 'hray') {
          field('Precio', priceIn(d.pts[0].p, (v) => setPts((pts) => { pts[0].p = v; })));
        } else {
          const hi = d.pts[0].p >= d.pts[1].p ? 0 : 1, lo = 1 - hi;
          field('Precio máximo', priceIn(d.pts[hi].p, (v) => setPts((pts) => { pts[hi].p = v; })));
          field('Precio mínimo', priceIn(d.pts[lo].p, (v) => setPts((pts) => { pts[lo].p = v; })));
          if (t === 'fib') body.appendChild(el('p', 'hint small', 'La dirección del retroceso se mantiene: el punto de arriba toma el máximo y el de abajo el mínimo.'));
        }
        if (t === 'rect') {
          body.appendChild(el('h4', '', 'Ancho (tiempo)'));
          const total = Math.round(Math.abs(d.pts[1].t - d.pts[0].t));
          const parts = { d: Math.floor(total / 86400), h: Math.floor((total % 86400) / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
          const ins = {};
          const apply = () => {
            const get = (k) => Math.max(0, Math.floor(Number(ins[k].value) || 0));
            const secs = get('d') * 86400 + get('h') * 3600 + get('m') * 60 + get('s');
            if (secs < 1) { Object.keys(ins).forEach((k) => { ins[k].value = String(parts[k]); }); return; }
            setPts((pts) => { const e = pts[0].t <= pts[1].t ? 0 : 1; pts[1 - e].t = pts[e].t + secs; });
          };
          const row = el('div', 'time-row');
          [['d', 'días'], ['h', 'horas'], ['m', 'minutos'], ['s', 'segundos']].forEach(([k, label]) => {
            const w = el('label', 'time-cell'); const i = el('input'); i.type = 'number'; i.min = '0'; i.step = '1'; i.value = String(parts[k]);
            i.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); };
            i.onchange = apply; ins[k] = i; w.append(i, el('span', '', label)); row.appendChild(w);
          });
          body.appendChild(row);
          body.appendChild(el('p', 'hint small', 'Se mantiene el borde izquierdo del rectángulo y se mueve el derecho. Acepta números grandes, por ejemplo 1258 días.'));
        }
      }

      function fill() {
        bodyWrap.innerHTML = '';
        TABS.forEach(([k]) => { secs[k] = el('div', 'props-sec'); bodyWrap.appendChild(secs[k]); });
        body = secs.style;
        const d = cur();
        if (!d) return;
        if (hasCoords) { sec('coords'); coordsBlock(d); sec('style'); }
        if (t === 'text') {
          sec('text');
          const ti = el('input'); ti.type = 'text'; ti.value = d.text || ''; ti.style.width = '230px';
          ti.oninput = () => { if (ti.value.trim()) patch({ text: ti.value }); };
          field('Texto', ti);
          field('Color', colorIn(d.color, (v) => patch({ color: v })));
          field('Tamaño (px)', numIn(d.size || 14, 8, 80, 1, (v) => patch({ size: v })));
          field('Negrita', checkIn(d.bold, (v) => patch({ bold: v })));
          field('Cursiva', checkIn(d.italic, (v) => patch({ italic: v })));
        } else if (t === 'table') {
          tableBlock(d);
        } else if (t === 'circle') {
          sec('style');
          sub('Contorno');
          const fB = field('Mostrar contorno', checkIn(d.border !== false, (v) => patch({ border: v })));
          gate(fB, [field('Color del contorno', colorIn(d.color, (v) => patch({ color: v }))), field('Grosor', numIn(d.width || 1, 1, 12, 1, (v) => patch({ width: v }))), field('Estilo de línea', selIn(DASH_OPTS, d.dash || 'solid', (v) => patch({ dash: v })))]);
          sub('Relleno (independiente del contorno)');
          const fF = field('Relleno', checkIn(d.fill, (v) => patch({ fill: v })));
          const fw = el('span', 'cwrap');
          fw.appendChild(colorIn(d.fColor || d.color, (v) => patch({ fColor: v })));
          const fs = el('button', 'btn secondary small', 'Como el contorno'); fs.onclick = () => { patch({ fColor: null }); fill(); };
          fw.appendChild(fs);
          gate(fF, [field('Color del relleno', fw), field('Transparencia (0 = invisible · 100 = sólido)', rangeIn(d.fillOpacity == null ? 20 : d.fillOpacity, (v) => patch({ fillOpacity: v })))]);
          sub('Ancla');
          const layer = layerNow();
          const fA = field('Anclar a la punta de una vela (máximo o mínimo)', checkIn(d.anchor, (v) => { if (layer) layer.setAnchor(d.id, v); else patch({ anchor: v }); fill(); }));
          void fA;
          if (d.anchor) {
            field('Mostrar la línea entre la vela y el círculo', checkIn(d.anchorLine !== false, (v) => patch({ anchorLine: v })));
            body.appendChild(el('p', 'hint small', 'Con el círculo seleccionado, arrastra el punto de la vela para cambiar el ancla, o arrastra el círculo para alejarlo o acercarlo: la línea lo sigue.'));
          }
          const r0 = layer && layer.radiusOf ? layer.radiusOf(d.id) : null;
          if (r0) field('Radio (px)', numIn(Math.round(r0), 3, 400, 1, (v) => { if (layer) layer.setRadius(d.id, v); }));
        } else if (t === 'brush') {
          sec('style');
          field('Color', colorIn(d.color, (v) => patch({ color: v })));
          field('Grosor', numIn(d.width || 3, 1, 40, 1, (v) => patch({ width: v })));
          field('Opacidad del trazo', rangeIn(d.opacity == null ? 100 : d.opacity, (v) => patch({ opacity: v })));
        } else {
          sec('style');
          if (t === 'channel') sub('Línea 1 (la base)');
          field('Color de línea', colorIn(d.color, (v) => patch({ color: v })));
          field('Grosor', numIn(d.width || 1, 1, 8, 1, (v) => patch({ width: v })));
          field('Estilo de línea', selIn(DASH_OPTS, d.dash || 'solid', (v) => patch({ dash: v })));
          if (t === 'trend' || t === 'poly') {
            field('Punta del inicio', selIn(CAP_OPTS, d.capA || 'none', (v) => patch({ capA: v })));
            field('Punta del final', selIn(CAP_OPTS, d.capB || 'none', (v) => patch({ capB: v })));
          }
          if (t === 'channel') {
            sub('Línea 2 (la paralela)');
            const l2 = el('span', 'cwrap');
            l2.appendChild(colorIn(d.c2Color || d.color, (v) => patch({ c2Color: v })));
            const s2 = el('button', 'btn secondary small', 'Como la línea 1'); s2.onclick = () => { patch({ c2Color: null, c2Width: null, c2Dash: null }); fill(); };
            l2.appendChild(s2);
            field('Color', l2);
            field('Grosor', numIn(d.c2Width || d.width || 1, 1, 8, 1, (v) => patch({ c2Width: v })));
            field('Estilo de línea', selIn(DASH_OPTS, d.c2Dash || d.dash || 'solid', (v) => patch({ c2Dash: v })));
            sub('Línea central');
            const fC = field('Mostrar línea central', checkIn(d.center !== false, (v) => patch({ center: v })));
            const cw = el('span', 'cwrap');
            cw.appendChild(colorIn(d.cColor || d.color, (v) => patch({ cColor: v })));
            const same = el('button', 'btn secondary small', 'Como la línea 1'); same.onclick = () => { patch({ cColor: null }); fill(); };
            cw.appendChild(same);
            gate(fC, [field('Color', cw), field('Tipo de línea', selIn(DASH_OPTS, d.cDash || 'dashed', (v) => patch({ cDash: v }))), field('Grosor', numIn(d.cWidth || 1, 1, 8, 1, (v) => patch({ cWidth: v })))]);
            sub('Relleno');
          }
          if (t === 'rect' || t === 'channel') {
            const fF = field('Relleno', checkIn(d.fill, (v) => patch({ fill: v })));
            const fO = field('Opacidad del relleno', rangeIn(d.fillOpacity == null ? 15 : d.fillOpacity, (v) => patch({ fillOpacity: v })));
            const fKids = [fO];
            if (t === 'channel') {
              const fw = el('span', 'cwrap');
              fw.appendChild(colorIn(d.fColor || d.color, (v) => patch({ fColor: v })));
              const fs = el('button', 'btn secondary small', 'Como la línea 1'); fs.onclick = () => { patch({ fColor: null }); fill(); };
              fw.appendChild(fs);
              fKids.push(field('Color del relleno', fw));
            }
            gate(fF, fKids);
          }
          if (t === 'rect') {
            sub('Línea central');
            const fC = field('Mostrar línea central', checkIn(d.center, (v) => patch({ center: v })));
            const cw = el('span', 'cwrap');
            cw.appendChild(colorIn(d.cColor || d.color, (v) => patch({ cColor: v })));
            const same = el('button', 'btn secondary small', 'Como el borde'); same.onclick = () => { patch({ cColor: null }); fill(); };
            cw.appendChild(same);
            gate(fC, [field('Color', cw), field('Tipo de línea', selIn(DASH_OPTS, d.cDash || 'dashed', (v) => patch({ cDash: v }))), field('Grosor', numIn(d.cWidth || 1, 1, 8, 1, (v) => patch({ cWidth: v })))]);
          }
          if (t === 'fib') {
            const fT = field('Línea de tendencia (punteada)', checkIn(d.trendLine, (v) => patch({ trendLine: v })));
            void fT;
            const fB = field('Fondo entre niveles', checkIn(d.bg, (v) => patch({ bg: v })));
            const fBo = field('Opacidad del fondo', rangeIn(d.bgOpacity == null ? 10 : d.bgOpacity, (v) => patch({ bgOpacity: v })));
            gate(fB, [fBo]);
          }
          if (t === 'poly') {
            sec('text');
            sub('Textos de los puntos (también: pasa el mouse por un punto con la polilínea seleccionada)');
            const cwp = el('span', 'cwrap');
            cwp.appendChild(colorIn(d.tColor || d.color, (v) => patch({ tColor: v })));
            const sameP = el('button', 'btn secondary small', 'Como la línea');
            sameP.onclick = () => { patch({ tColor: null }); fill(); };
            cwp.appendChild(sameP);
            field('Color del texto', cwp);
            field('Tamaño (px)', numIn(d.tSize || 12, 8, 60, 1, (v) => patch({ tSize: v })));
            field('Negrita', checkIn(d.tBold, (v) => patch({ tBold: v })));
            field('Cursiva', checkIn(d.tItalic, (v) => patch({ tItalic: v })));
            d.pts.forEach((_, i) => {
              const inp = el('input'); inp.type = 'text'; inp.placeholder = 'Texto o número'; inp.value = (d.labels && d.labels[i]) || '';
              inp.onkeydown = (e) => e.stopPropagation();
              inp.oninput = () => { const cur = cur0(); if (!cur) return; const labels = Object.assign({}, cur.labels || {}); if (inp.value.trim()) labels[i] = inp.value; else delete labels[i]; patch({ labels }); };
              field(`Punto ${i + 1}`, inp);
            });
            if (d.pts.length > 1) {
              sec('segs');
              sub('Tramos (color propio o eliminar)');
              for (let i = 0; i < d.pts.length - 1; i++) {
                const sg = (d.segs && d.segs[i]) || {};
                const wrapS = el('div', 'seg-row');
                const setS = (v) => { const cur = cur0(); if (!cur) return; const s2 = Object.assign({}, cur.segs || {}); const o = Object.assign({}, s2[i] || {}, v); Object.keys(o).forEach((k) => { if (o[k] === false || o[k] === null) delete o[k]; }); if (Object.keys(o).length) s2[i] = o; else delete s2[i]; patch({ segs: s2 }); };
                const cIn = colorIn(sg.color || d.color, (v) => setS({ color: v }));
                const rst = el('button', 'btn secondary', 'Color original'); rst.onclick = () => { setS({ color: null }); cIn.value = hexOk(cur0().color); };
                const hid = checkIn(sg.hidden, (v) => setS({ hidden: v }));
                wrapS.append(cIn, rst, el('span', '', 'Eliminar'), hid);
                field(`Tramo ${i + 1} (puntos ${i + 1}–${i + 2})`, wrapS);
              }
            }
          }
        }
        if (t === 'trend' || t === 'hline' || t === 'hray' || t === 'rect') { sec('text'); textBlock(d, true); }
        if (t === 'circle') { sec('text'); textBlock(d, true, true); }
        if (t === 'rect') {
          sec('text');
          sub('Medidas (escala logarítmica)');
          const fM = field('Mostrar ancho y alto', checkIn(d.measure, (v) => patch({ measure: v })));
          const mw = el('span', 'cwrap');
          mw.appendChild(colorIn(d.mColor || d.color, (v) => patch({ mColor: v })));
          const msame = el('button', 'btn secondary small', 'Como el borde'); msame.onclick = () => { patch({ mColor: null }); fill(); };
          mw.appendChild(msame);
          gate(fM, [
            field('Color del texto de las medidas', mw),
            field('Tamaño del texto (px)', numIn(d.mSize || 12, 8, 60, 1, (v) => patch({ mSize: v }))),
            field('Negrita', checkIn(d.mBold !== false, (v) => patch({ mBold: v }))),
            field('Cursiva', checkIn(d.mItalic, (v) => patch({ mItalic: v }))),
          ]);
          body.appendChild(el('p', 'hint', 'Ancho: tiempo exacto hasta el minuto (por ejemplo 1345 días, 2 días 12 h 35 min o 14 h 15 min). Alto: décadas = log10(precio mayor ÷ precio menor); 1,000 = el precio se multiplica por 10, 0,301 = se duplica. Es exacto en cualquier parte del gráfico y no cambia con el zoom ni el tamaño.'));
        }
        if (t === 'fib') {
          sec('text'); textBlock(d, false);
          sec('levels');
          field('Niveles basados en escala logarítmica', checkIn(!!d.logScale, (v) => patch({ logScale: v })));
          field('Mostrar el precio de cada nivel', checkIn(d.showPrice, (v) => patch({ showPrice: v })));
          sub('Niveles (0 = segundo punto, 1 = primer punto)');
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
        sec('obj');
        if (t === 'trend' || t === 'channel' || t === 'fib' || t === 'rect') {
          field('Ampliar a la izquierda', checkIn(d.extL, (v) => patch({ extL: v })));
          field('Ampliar a la derecha', checkIn(d.extR, (v) => patch({ extR: v })));
        }
        field('Bloqueado (no se puede mover ni borrar)', checkIn(d.locked, (v) => patch({ locked: v })));
        field('Oculto', checkIn(d.hidden, (v) => patch({ hidden: v })));
        body = secs.style;
        showTab();
        X.decoratePalette(bodyWrap);
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
  function nudgeSel(sym, layer, ids, dx, dy) {
    const list = unlocked(sym, ids).map((id) => store.get(sym, id)).filter((d) => d && d.pts && d.pts.length && d.pts.every((p) => p && typeof p.t === 'number'));
    if (!list.length) return false;
    store.begin(sym);
    list.forEach((d) => {
      const pts = d.pts.map((p) => Object.assign({}, p, layer.offsetPoint(p, dx, dy, d.pane, true)));
      store.patch(sym, d.id, { pts });
    });
    store.end();
    return true;
  }
  function onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    const itype = (e.target && e.target.type) || '';
    const isText = tag === 'TEXTAREA' || (tag === 'INPUT' && !['color', 'checkbox', 'range', 'button', 'radio'].includes(itype));
    if (isText) return;                                     // ahí manda el deshacer del propio campo
    const inCtl = tag === 'SELECT' || tag === 'INPUT';      // listas, colores...: solo se atienden deshacer/rehacer
    const key = (e.key || '').toLowerCase();
    const isZ = key === 'z' || e.code === 'KeyZ', isY = key === 'y' || e.code === 'KeyY';
    if (inCtl && !((e.ctrlKey || e.metaKey) && !e.altKey && (isZ || isY))) return;
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
    if (k === 'Enter' && !layer?.hasDraft() && ids.length === 1 && !e.ctrlKey && !e.altKey && editSelText()) { e.preventDefault(); return; }
    if ((k === 'Delete' || k === 'Backspace') && ids.length) { e.preventDefault(); deleteSel(); return; }
    // Flechas: mueven lo seleccionado (1 px; con Mayús 10 px). Vale para cualquier dibujo.
    if (ids.length && layer && !store.state.tool && !layer.hasDraft() && !e.ctrlKey && !e.metaKey && !e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) {
      const st = e.shiftKey ? 10 : 1;
      const dx = k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, dy = k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0;
      if (nudgeSel(sym, layer, ids, dx, dy)) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const low = k.toLowerCase();
      if (isZ || isY) {
        if (props && !props.done) return;                   // con la ventana de propiedades abierta se usa Cancelar
        e.preventDefault();
        if (isZ && !e.shiftKey) { if (!(layer && layer.undoPoint())) store.undo(sym); } else store.redo(sym);
        return;
      }
      if (low === 'c' && ids.length) { if (copySel()) e.preventDefault(); return; }
      if (low === 'v' && clip) { e.preventDefault(); pasteClip(); return; }
      if (low === 'd') {
        // con lo copiado y sin selección (o con la misma selección) se pega; si no, se duplica lo seleccionado
        const same = clip && ids.length === clip.ids.length && ids.every((i) => clip.ids.includes(i));
        if (clip && (!ids.length || same)) { e.preventDefault(); pasteClip(); return; }
        if (ids.length) { e.preventDefault(); duplicateSel(); return; }
        return;
      }
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const map = { t: 'trend', h: 'hline', f: 'fib', r: 'rect', c: 'circle', b: 'brush' };
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
      if (kind === 'ctx') { showCtx(info.x, info.y, info.sym, info.id, info.seg); return; }
      if (kind === 'zoom') { updateZoomOut(); return; }
      if (kind === 'drawn') { showQuick(info); return; }
      if (kind === 'select') { if (quick && !store.isSelected(quick.sym, quick.id)) closeQuick(); trackSelection(); }
      if (kind === 'tool' || kind === 'templates') { renderBar(); renderFav(); return; }
      renderSel(); renderTree();
    });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', () => { placeBar('favBar'); selLast = ''; autoPlaceSel(); });
    setInterval(updateZoomOut, 500);
    renderAll();
  }

  root.TVDrawUI = { init, cancelProps, refresh: () => { if (X) { treeSig = ''; sel.key = null; renderAll(); } } };
})(window);

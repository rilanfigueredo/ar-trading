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
  const chartNow = () => X.activeCfg().id;
  // Solo cuentan los dibujos visibles en el gráfico activo (los de otro gráfico del mismo activo no aparecen ni se seleccionan aquí).
  const visNow = (sym, id) => { const d = store.get(sym, id); return !!d && store.visibleIn(d, chartNow()); };
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
      const tpls = store.templates(d.type);
      if (!tpls.length) { const e0 = el('div', 'ctx-item ctx-empty', 'Aún no hay plantillas de esta herramienta'); sub.appendChild(e0); }
      tpls.forEach((tp) => {
        const b = el('button', 'ctx-item');
        b.append(el('span', 'ctx-check', ''), el('span', '', tp.name));
        b.onclick = () => {
          closeFly();
          store.begin(sym);
          ids.filter((i) => { const q = store.get(sym, i); return q && q.type === d.type; }).forEach((i) => store.applyTemplate(sym, i, tp.id));
          store.end();
        };
        sub.appendChild(b);
      });
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
    const mg = bigBtn('magnet', 'Imán (clic para elegir: apagado, débil o fuerte)', () => openMagnetMenu(mg), 'magnet');
    mg.appendChild(el('i', 'db-tri'));
    bar.appendChild(mg);
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
    if (mb) mb.title = `${MAGNET[magnetMode()]} (clic para cambiar)`;
    on(bar, 'keep', prefs().keep); on(bar, 'shareNew', prefs().shareNew); on(bar, 'hideAll', prefs().hideAll); on(bar, 'favBar', prefs().favBar);
    on(rb, 'objects', !X.$('objPanel').classList.contains('hidden'));
    const eyeBtn = bar.querySelector('[data-k="hideAll"]');
    if (eyeBtn) eyeBtn.innerHTML = svg(prefs().hideAll ? 'eyeoff' : 'eye', 20);
  }

  // ---------- Barras movibles (favoritos y propiedades del dibujo) ----------
  // Se arrastran desde el punto de agarre a cualquier borde: arriba/abajo = horizontal, izquierda/derecha = vertical.
  const BARS = { favBar: { key: 'favPos', def: { edge: 'left', off: 0.2 } }, selBar: { key: 'selPos', def: { edge: 'top', off: 0.5 } } };
  function nearestEdge(x, y, W, H) {
    const d = { left: x, right: W - x, top: y, bottom: H - y };
    return Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
  }
  function placeBar(id, free) {
    const fb = X.$(id), wrap = X.$('gridWrap'), cfg = BARS[id];
    if (fb.classList.contains('hidden')) return;
    const pos = prefs()[cfg.key] || cfg.def;
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
  function makeGrip(id) {
    const grip = el('span', 'fav-grip'); grip.innerHTML = svg('grip', 16); grip.title = 'Arrastra para mover la barra a cualquier borde del gráfico';
    grip.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const wrap = X.$('gridWrap');
      const move = (m) => { const r = wrap.getBoundingClientRect(); placeBar(id, { x: m.clientX - r.left, y: m.clientY - r.top }); };
      const up = (m) => {
        window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
        const r = wrap.getBoundingClientRect(), W = wrap.clientWidth, H = wrap.clientHeight;
        const x = m.clientX - r.left, y = m.clientY - r.top;
        const edge = nearestEdge(x, y, W, H);
        const off = edge === 'left' || edge === 'right' ? y / H : x / W;
        prefs()[BARS[id].key] = { edge, off: Math.max(0.03, Math.min(0.97, Math.round(off * 1000) / 1000)) };
        X.saveCfg();
        placeBar(id);
      };
      window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true);
    };
    return grip;
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
      bar.appendChild(makeGrip('selBar'));
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
      r.share = iconBtn('share', 'Mostrar este dibujo también en los demás gráficos del mismo activo', () => toggleShare(sym, selIds()));
      r.eye = iconBtn('eyeoff', 'Ocultar (se vuelve a mostrar desde el panel de objetos)', () => store.patchMany(sym, selIds(), { hidden: true }));
      const dup = iconBtn('copy', 'Duplicar (Ctrl+D)', duplicateSel);
      const grp = iconBtn('folderadd', 'Agrupar en una carpeta', () => newFolder(selIds(), null));
      r.cfg = iconBtn('gear', 'Propiedades (doble clic sobre el dibujo)', () => { const i = selIds(); if (i.length === 1) openProps(sym, i[0]); });
      r.del = iconBtn('trash', 'Eliminar (Supr)', deleteSel);
      r.txt = iconBtn('text', 'Editar el texto aquí mismo (Enter)', editSelText);
      bar.append(r.title, r.color, r.width, r.dash, r.lock, r.share, r.eye, dup, grp);
      if (!many) bar.appendChild(r.txt);
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
    const onlyText = ds.every((d) => d.type === 'text' || d.type === 'table');
    r.width.classList.toggle('hidden', onlyText);
    r.dash.classList.toggle('hidden', onlyText);
    const allLocked = ds.every((d) => store.isLocked(sym, d));
    r.lock.classList.toggle('active', allLocked);
    r.lock.innerHTML = svg(allLocked ? 'lock' : 'unlock', 20);
    r.share.classList.toggle('active', ds.every((d) => d.shared));
    r.del.disabled = allLocked;
    r.txt.classList.toggle('hidden', many || !(ds[0].type === 'text' || (D.TYPES[ds[0].type] && D.TYPES[ds[0].type].text)));
    placeBar('selBar');
  }

  // ---------- Panel "Objetos" ----------
  function toggleObjects() {
    const p = X.$('objPanel');
    if (p.classList.contains('hidden')) { X.$('panel').classList.add('hidden'); X.$('btnIndicators').classList.remove('active'); if (window.TVWatch) window.TVWatch.close(); }
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
    tpls.forEach((tp) => {
      const row = el('div', 'ctx-item db-row');
      row.append(el('span', 'db-label', tp.name));
      if (!tp.builtin) {
        const del = el('button', 'fav-star'); del.innerHTML = svg('trash', 14); del.title = 'Borrar esta plantilla';
        del.onclick = (e) => { e.stopPropagation(); store.deleteTemplate(type, tp.id); openTplMenu(anchor, sym, id, refill); };
        row.appendChild(del);
      }
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
      const cur0 = cur;
      const patch = (o) => { if (cur()) store.patch(sym, id, o); };
      const d0 = cur();
      const t = d0.type;
      // Pestañas "Estilo" / "Coordenadas" (rectángulo, Fibonacci, línea y rayo horizontales), al lado del título
      const hasCoords = t === 'rect' || t === 'fib' || t === 'hline' || t === 'hray';
      let tab = 'style';
      const head = el('div', 'props-head');
      head.appendChild(el('h3', '', D.TYPES[t].label));
      const tabBtns = {};
      if (hasCoords) {
        [['style', 'Estilo'], ['coords', 'Coordenadas']].forEach(([k, label]) => {
          const b = el('button', 'props-tab', label);
          b.onclick = () => { tab = k; Object.keys(tabBtns).forEach((x) => tabBtns[x].classList.toggle('active', x === tab)); fill(); };
          tabBtns[k] = b; head.appendChild(b);
        });
        tabBtns.style.classList.add('active');
      }
      box.appendChild(head);
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
  const CAP_OPTS = [['none', 'Ninguna'], ['arrow', 'Flecha'], ['circle', 'Círculo'], ['bar', 'Barra vertical']];
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
        field('Cursiva', checkIn(d.tItalic, (v) => patch({ tItalic: v })));
        const posOpts = t === 'rect'
          ? [['center', 'Interior'], ['above', 'Superior (por encima de la línea de arriba)'], ['below', 'Inferior (por debajo de la línea de abajo)']]
          : [['above', 'Por encima de la línea'], ['center', 'En el centro (sobre la línea)'], ['below', 'Por debajo de la línea']];
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
        body.appendChild(el('h4', '', 'Forma de la tabla'));
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

        body.appendChild(el('h4', '', 'Contenido y celdas'));
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

        body.appendChild(el('h4', '', 'Estilo por columna'));
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
        const hh = el('h4', '', 'Objeto'); body.appendChild(hh);
        field('Bloqueado (no se puede mover ni borrar)', checkIn(d.locked, (v) => patch({ locked: v })));
      }

      function fill() {
        body.innerHTML = '';
        const d = cur();
        if (!d) return;
        if (hasCoords && tab === 'coords') { coordsBlock(d); return; }
        if (t === 'text') {
          const ti = el('input'); ti.type = 'text'; ti.value = d.text || ''; ti.style.width = '230px';
          ti.oninput = () => { if (ti.value.trim()) patch({ text: ti.value }); };
          field('Texto', ti);
          field('Color', colorIn(d.color, (v) => patch({ color: v })));
          field('Tamaño (px)', numIn(d.size || 14, 8, 80, 1, (v) => patch({ size: v })));
          field('Negrita', checkIn(d.bold, (v) => patch({ bold: v })));
          field('Cursiva', checkIn(d.italic, (v) => patch({ italic: v })));
        } else if (t === 'table') {
          tableBlock(d);
        } else {
          field('Color de línea', colorIn(d.color, (v) => patch({ color: v })));
          field('Grosor', numIn(d.width || 1, 1, 8, 1, (v) => patch({ width: v })));
          field('Estilo de línea', selIn(DASH_OPTS, d.dash || 'solid', (v) => patch({ dash: v })));
          if (t === 'trend' || t === 'poly') {
            field('Punta del inicio', selIn(CAP_OPTS, d.capA || 'none', (v) => patch({ capA: v })));
            field('Punta del final', selIn(CAP_OPTS, d.capB || 'none', (v) => patch({ capB: v })));
          }
          if (t === 'poly') {
            body.appendChild(el('h4', '', 'Textos de los puntos (también: pasa el mouse por un punto con la polilínea seleccionada)'));
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
              body.appendChild(el('h4', '', 'Tramos (color propio o eliminar)'));
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
          if (t === 'trend' || t === 'channel' || t === 'fib' || t === 'rect') {
            field('Ampliar a la izquierda', checkIn(d.extL, (v) => patch({ extL: v })));
            field('Ampliar a la derecha', checkIn(d.extR, (v) => patch({ extR: v })));
          }
          if (t === 'rect' || t === 'channel') {
            field('Relleno', checkIn(d.fill, (v) => patch({ fill: v })));
            field('Opacidad del relleno', rangeIn(d.fillOpacity == null ? 15 : d.fillOpacity, (v) => patch({ fillOpacity: v })));
          }
          if (t === 'rect') {
            body.appendChild(el('h4', '', 'Medidas (escala logarítmica)'));
            field('Mostrar ancho y alto', checkIn(d.measure, (v) => patch({ measure: v })));
            const mw = el('span', 'cwrap');
            mw.appendChild(colorIn(d.mColor || d.color, (v) => patch({ mColor: v })));
            const msame = el('button', 'btn secondary small', 'Como el borde'); msame.onclick = () => { patch({ mColor: null }); fill(); };
            mw.appendChild(msame);
            field('Color del texto de las medidas', mw);
            field('Tamaño del texto (px)', numIn(d.mSize || 12, 8, 60, 1, (v) => patch({ mSize: v })));
            field('Negrita', checkIn(d.mBold !== false, (v) => patch({ mBold: v })));
            field('Cursiva', checkIn(d.mItalic, (v) => patch({ mItalic: v })));

            body.appendChild(el('p', 'hint', 'Ancho: tiempo exacto hasta el minuto (por ejemplo 1345 días, 2 días 12 h 35 min o 14 h 15 min). Alto: décadas = log10(precio mayor ÷ precio menor); 1,000 = el precio se multiplica por 10, 0,301 = se duplica. Es exacto en cualquier parte del gráfico y no cambia con el zoom ni el tamaño.'));
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
        if (t === 'trend' || t === 'hline' || t === 'hray' || t === 'rect') textBlock(d, true);
        if (t === 'fib') {
          field('Línea de tendencia (punteada)', checkIn(d.trendLine, (v) => patch({ trendLine: v })));
          field('Niveles de Fibonacci basados en escala logarítmica', checkIn(!!d.logScale, (v) => patch({ logScale: v })));
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
  function nudgeSel(sym, layer, ids, dx, dy) {
    const list = unlocked(sym, ids).map((id) => store.get(sym, id)).filter((d) => d && d.pts && d.pts.length && d.pts.every((p) => p && typeof p.t === 'number'));
    if (!list.length) return false;
    store.begin(sym);
    list.forEach((d) => {
      const pts = d.pts.map((p) => Object.assign({}, p, layer.offsetPoint(p, dx, dy, d.pane)));
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
      if (kind === 'ctx') { showCtx(info.x, info.y, info.sym, info.id, info.seg); return; }
      if (kind === 'zoom') { updateZoomOut(); return; }
      if (kind === 'tool' || kind === 'templates') { renderBar(); renderFav(); return; }
      renderSel(); renderTree();
    });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', () => { placeBar('favBar'); placeBar('selBar'); });
    setInterval(updateZoomOut, 500);
    renderAll();
  }

  root.TVDrawUI = { init, cancelProps, refresh: () => { if (X) { treeSig = ''; sel.key = null; renderAll(); } } };
})(window);

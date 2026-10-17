// Ar_Trading - interfaz de las herramientas de dibujo (v0.7): barra lateral con menús, barra de favoritos,
// barra del objeto seleccionado, ventana de propiedades, panel "Objetos" (árbol), menú de clic derecho y atajos.
(function (root) {
  'use strict';
  const D = root.TVDraw;

  const ICONS = {
    cursor: '<path d="M5 3l13 8-6 1.8L9.5 19z" fill="currentColor"/>',
    trend: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><line x1="6.5" y1="17.5" x2="17.5" y2="6.5"/>',
    hline: '<line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="2"/>',
    ray: '<circle cx="5" cy="18" r="2"/><line x1="6.6" y1="16.6" x2="21" y2="5"/><path d="M16.5 4.5H21V9"/>',
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
  };
  const svg = (name, size) => `<svg viewBox="0 0 24 24" width="${size || 20}" height="${size || 20}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const SHORTCUT = { trend: 'Alt+T', hline: 'Alt+H', fib: 'Alt+F', rect: 'Alt+R' };

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
  let flyout = null, ctxMenu = null;
  const sel = { id: null, refs: null };
  let treeSig = '';

  const prefs = () => store.prefs();
  const symNow = () => X.activeCfg().symbol;
  const layerNow = () => { const v = X.activeView(); return v && v.draw; };
  const catOf = (type) => D.TYPES[type].cat;

  // ---------- Acciones ----------
  function selectTool(type) {
    if (type && store.state.tool === type) { store.setTool(null); return; }
    if (type) {
      lastTool[catOf(type)] = type;
      if (prefs().hideAll) { prefs().hideAll = false; X.saveCfg(); }
    }
    store.setTool(type);
  }
  function toggleFav(type) {
    const f = prefs().favs;
    const i = f.indexOf(type);
    if (i >= 0) f.splice(i, 1); else f.push(type);
    prefs().favs = D.TOOL_ORDER.filter((t) => f.includes(t));
    X.saveCfg();
    renderAll();
  }
  function setPref(key, val) { prefs()[key] = val; X.saveCfg(); renderAll(); X.eachView((v) => v.draw && v.draw.repaint()); }
  function duplicateSel(sym, id) {
    const layer = layerNow();
    store.duplicate(sym, id, layer ? (pt) => layer.offsetPoint(pt, 26, 26) : null);
  }
  function deleteSel(sym, id) {
    const d = store.get(sym, id);
    if (d && !d.locked) store.remove(sym, id);
  }
  function confirmClear() {
    const sym = symNow(), n = store.list(sym).length;
    if (!n) return;
    X.openModal((box) => {
      box.appendChild(el('h3', '', 'Eliminar todos los dibujos'));
      box.appendChild(el('p', 'hint', `Se borrarán los ${n} dibujos de ${sym}. Puedes deshacerlo con Ctrl+Z.`));
      const row = el('div', 'row-actions');
      const ok = el('button', 'btn', 'Eliminar todos');
      ok.onclick = () => { store.clear(sym); X.closeModal(); };
      const no = el('button', 'btn secondary', 'Cancelar');
      no.onclick = () => X.closeModal();
      row.append(ok, no);
      box.appendChild(row);
    });
  }

  // ---------- Menús flotantes ----------
  function closeFly() {
    if (flyout) { flyout.remove(); flyout = null; }
    if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
  }
  document.addEventListener('mousedown', (e) => {
    if ((flyout && !flyout.contains(e.target)) || (ctxMenu && !ctxMenu.contains(e.target))) closeFly();
  }, true);

  function openFlyout(anchor, cat) {
    closeFly();
    const m = el('div', 'ctx-menu db-fly');
    cat.tools.forEach((t) => {
      const b = el('div', 'ctx-item db-row');
      const ic = el('span', 'db-ic'); ic.innerHTML = svg(t, 18);
      const star = el('button', 'fav-star' + (prefs().favs.includes(t) ? ' on' : ''));
      star.innerHTML = svg('star', 15); star.title = 'Añadir o quitar de la barra de favoritos';
      star.onclick = (e) => { e.stopPropagation(); toggleFav(t); star.classList.toggle('on', prefs().favs.includes(t)); };
      b.append(ic, el('span', 'db-label', D.TYPES[t].label), el('span', 'db-key', SHORTCUT[t] || ''), star);
      b.onclick = () => { closeFly(); selectTool(t); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = r.right + 4 + 'px';
    m.style.top = Math.min(window.innerHeight - m.offsetHeight - 6, r.top) + 'px';
    flyout = m;
  }

  function showCtx(x, y, sym, id) {
    closeFly();
    const d = store.get(sym, id);
    if (!d) return;
    const m = el('div', 'ctx-menu');
    const item = (text, fn) => {
      const b = el('button', 'ctx-item');
      b.append(el('span', 'ctx-check', ''), el('span', '', text));
      b.onclick = () => { closeFly(); fn(); };
      m.appendChild(b);
    };
    item('Propiedades…', () => openProps(sym, id));
    item('Duplicar', () => duplicateSel(sym, id));
    item(d.locked ? 'Desbloquear' : 'Bloquear', () => store.patch(sym, id, { locked: !d.locked }));
    item('Ocultar', () => store.patch(sym, id, { hidden: true }));
    item('Eliminar', () => { if (d.locked) return; store.remove(sym, id); });
    document.body.appendChild(m);
    m.style.left = Math.min(x, window.innerWidth - m.offsetWidth - 6) + 'px';
    m.style.top = Math.min(y, window.innerHeight - m.offsetHeight - 6) + 'px';
    ctxMenu = m;
  }

  // ---------- Barra lateral ----------
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
    bar.appendChild(bigBtn('magnet', 'Imán: pega los puntos al máximo, mínimo, apertura o cierre de la vela más cercana', () => setPref('magnet', !prefs().magnet), 'magnet'));
    bar.appendChild(bigBtn('keep', 'Mantener la herramienta activa después de dibujar', () => setPref('keep', !prefs().keep), 'keep'));
    bar.appendChild(bigBtn('eye', 'Ocultar / mostrar todos los dibujos', () => setPref('hideAll', !prefs().hideAll), 'hideAll'));
    bar.appendChild(bigBtn('trash', 'Eliminar todos los dibujos de este activo', confirmClear, 'clear'));
    bar.appendChild(el('span', 'db-sep'));
    bar.appendChild(bigBtn('star', 'Mostrar / ocultar la barra de favoritos', () => setPref('favBar', !prefs().favBar), 'favBar'));
    bar.appendChild(bigBtn('list', 'Panel de objetos (lista de dibujos)', toggleObjects, 'objects'));
  }
  function renderBar() {
    const bar = X.$('drawBar');
    const t = store.state.tool;
    const on = (k, v) => { const b = bar.querySelector(`[data-k="${k}"]`); if (b) b.classList.toggle('active', !!v); };
    on('cursor', !t);
    D.CATS.forEach((c) => {
      const b = bar.querySelector(`[data-k="cat:${c.id}"]`);
      if (!b) return;
      b.classList.toggle('active', !!t && catOf(t) === c.id);
      const tri = b.querySelector('.db-tri');
      b.innerHTML = svg(lastTool[c.id], 20);
      if (tri) b.appendChild(tri);
    });
    on('magnet', prefs().magnet); on('keep', prefs().keep); on('hideAll', prefs().hideAll); on('favBar', prefs().favBar);
    on('objects', !X.$('objPanel').classList.contains('hidden'));
    const eyeBtn = bar.querySelector('[data-k="hideAll"]');
    if (eyeBtn) eyeBtn.innerHTML = svg(prefs().hideAll ? 'eyeoff' : 'eye', 20);
  }

  // ---------- Barra de favoritos ----------
  function renderFav() {
    const fb = X.$('favBar');
    const favs = prefs().favs.filter((t) => D.TYPES[t]);
    fb.classList.toggle('hidden', !prefs().favBar || !favs.length);
    fb.innerHTML = '';
    favs.forEach((t) => {
      const b = el('button', 'db-btn small' + (store.state.tool === t ? ' active' : ''));
      b.innerHTML = svg(t, 18);
      b.title = D.TYPES[t].label + (SHORTCUT[t] ? ` (${SHORTCUT[t]})` : '');
      b.onclick = () => selectTool(t);
      fb.appendChild(b);
    });
  }

  // ---------- Barra del objeto seleccionado ----------
  function iconBtn(icon, title, fn) {
    const b = el('button', 'db-btn small');
    b.innerHTML = svg(icon, 17); b.title = title; b.onclick = fn;
    return b;
  }
  function renderSel() {
    const bar = X.$('selBar');
    const s = store.state.sel, sym = symNow();
    const d = s && s.sym === sym ? store.get(sym, s.id) : null;
    if (!d) { bar.classList.add('hidden'); sel.id = null; sel.refs = null; return; }
    bar.classList.remove('hidden');
    if (sel.id !== d.id) {
      sel.id = d.id; bar.innerHTML = '';
      const r = {};
      const title = el('span', 'sb-title'); r.title = title;
      const color = el('input'); color.type = 'color'; r.color = color;
      color.oninput = () => store.patch(sym, d.id, { color: color.value });
      const width = el('select'); r.width = width;
      [1, 2, 3, 4, 5].forEach((n) => { const o = el('option', '', n + ' px'); o.value = String(n); width.appendChild(o); });
      width.onchange = () => store.patch(sym, d.id, { width: Number(width.value) });
      const dash = el('select'); r.dash = dash;
      [['solid', 'Continua'], ['dashed', 'Guiones'], ['dotted', 'Puntos']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; dash.appendChild(o); });
      dash.onchange = () => store.patch(sym, d.id, { dash: dash.value });
      r.lock = iconBtn('lock', 'Bloquear / desbloquear', () => { const c = store.get(sym, d.id); if (c) store.patch(sym, d.id, { locked: !c.locked }); });
      r.eye = iconBtn('eyeoff', 'Ocultar este dibujo (se vuelve a mostrar desde el panel de objetos)', () => store.patch(sym, d.id, { hidden: true }));
      const dup = iconBtn('copy', 'Duplicar (Ctrl+D)', () => duplicateSel(sym, d.id));
      const cfgB = iconBtn('gear', 'Propiedades (doble clic sobre el dibujo)', () => openProps(sym, d.id));
      r.del = iconBtn('trash', 'Eliminar (Supr)', () => deleteSel(sym, d.id));
      bar.append(title, color, width, dash, r.lock, r.eye, dup, cfgB, r.del);
      sel.refs = r;
      X.decoratePalette(bar);
    }
    const r = sel.refs;
    r.title.textContent = D.TYPES[d.type].label;
    if (document.activeElement !== r.color) r.color.value = hexOk(d.color);
    r.width.value = String(Math.max(1, Math.min(5, Math.round(d.width || 1))));
    r.dash.value = d.dash || 'solid';
    r.width.classList.toggle('hidden', d.type === 'text');
    r.dash.classList.toggle('hidden', d.type === 'text');
    r.lock.classList.toggle('active', !!d.locked);
    r.lock.innerHTML = svg(d.locked ? 'lock' : 'unlock', 17);
    r.del.disabled = !!d.locked;
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
    const sym = symNow(), list = store.list(sym), s = store.state.sel;
    const sig = sym + '|' + (s && s.sym === sym ? s.id : '') + '|' + prefs().hideAll + '|' + JSON.stringify(list.map((d) => [d.id, d.type, d.text, d.hidden, d.locked, d.color]));
    if (!force && sig === treeSig) return;
    treeSig = sig;
    p.innerHTML = '';
    p.appendChild(el('h3', '', `Objetos · ${sym}`));
    if (prefs().hideAll) p.appendChild(el('div', 'lg-note', 'Todos los dibujos están ocultos (botón del ojo en la barra lateral).'));
    if (!list.length) p.appendChild(el('p', 'hint', 'Todavía no hay dibujos en este activo. Elige una herramienta en la barra lateral izquierda y dibuja en el gráfico. Los dibujos se guardan por activo y se ven en todas las temporalidades.'));
    list.slice().reverse().forEach((d) => {
      const row = el('div', 'obj-row' + (s && s.sym === sym && s.id === d.id ? ' sel' : '') + (d.hidden ? ' off' : ''));
      const ic = el('span', 'obj-ic'); ic.innerHTML = svg(d.type, 16); ic.style.color = hexOk(d.color);
      const name = el('span', 'obj-name', store.label(d));
      row.append(ic, name);
      const mk = (icon, title, fn) => { const b = el('button', 'obj-btn'); b.innerHTML = svg(icon, 15); b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); }; row.appendChild(b); };
      mk(d.hidden ? 'eyeoff' : 'eye', d.hidden ? 'Mostrar' : 'Ocultar', () => store.patch(sym, d.id, { hidden: !d.hidden }));
      mk(d.locked ? 'lock' : 'unlock', d.locked ? 'Desbloquear' : 'Bloquear', () => store.patch(sym, d.id, { locked: !d.locked }));
      mk('copy', 'Duplicar', () => duplicateSel(sym, d.id));
      mk('trash', 'Eliminar', () => deleteSel(sym, d.id));
      row.onclick = () => store.select(sym, d.id);
      row.ondblclick = () => openProps(sym, d.id);
      p.appendChild(row);
    });
    if (list.length) {
      const act = el('div', 'row-actions');
      const lockAll = el('button', 'btn secondary', list.every((d) => d.locked) ? 'Desbloquear todos' : 'Bloquear todos');
      lockAll.onclick = () => store.setAll(sym, 'locked', !list.every((d) => d.locked));
      const delAll = el('button', 'btn secondary', 'Eliminar todos');
      delAll.onclick = confirmClear;
      act.append(lockAll, delAll);
      p.appendChild(act);
    }
  }

  // ---------- Ventana de propiedades ----------
  function openProps(sym, id) {
    if (!store.get(sym, id)) return;
    store.select(sym, id);
    X.openModal((box) => {
      const cur = () => store.get(sym, id);
      const patch = (o) => { if (cur()) store.patch(sym, id, o); };
      const d0 = cur();
      box.appendChild(el('h3', '', D.TYPES[d0.type].label));
      const field = (label, ctrl) => { const f = el('div', 'field'); f.append(el('span', '', label), ctrl); box.appendChild(f); return f; };
      const colorIn = (val, fn) => { const i = el('input'); i.type = 'color'; i.value = hexOk(val); i.oninput = () => fn(i.value); return i; };
      const checkIn = (val, fn) => { const i = el('input'); i.type = 'checkbox'; i.checked = !!val; i.onchange = () => fn(i.checked); return i; };
      const numIn = (val, min, max, step, fn) => {
        const i = el('input'); i.type = 'number'; i.min = min; i.max = max; i.step = step; i.value = val; i.style.width = '80px';
        i.oninput = () => { const v = parseFloat(i.value); if (isFinite(v)) fn(Math.max(min, Math.min(max, v))); };
        return i;
      };
      const rangeIn = (val, fn) => {
        const w = el('span', 'cwrap'); const i = el('input'); i.type = 'range'; i.min = 0; i.max = 100; i.value = val; i.className = 'wm-range';
        const t = el('span', 'wm-val', val + ' %');
        i.oninput = () => { t.textContent = i.value + ' %'; fn(Number(i.value)); };
        w.append(i, t); return w;
      };
      const selIn = (opts, val, fn) => {
        const s = el('select'); opts.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; s.appendChild(o); });
        s.value = val; s.onchange = () => fn(s.value); return s;
      };
      const t = d0.type;
      if (t === 'text') {
        const ti = el('input'); ti.type = 'text'; ti.value = d0.text || ''; ti.style.width = '230px';
        ti.oninput = () => { if (ti.value.trim()) patch({ text: ti.value }); };
        field('Texto', ti);
        field('Color', colorIn(d0.color, (v) => patch({ color: v })));
        field('Tamaño (px)', numIn(d0.size || 14, 8, 80, 1, (v) => patch({ size: v })));
        field('Negrita', checkIn(d0.bold, (v) => patch({ bold: v })));
      } else if (t !== 'ruler') {
        field('Color de línea', colorIn(d0.color, (v) => patch({ color: v })));
        field('Grosor', numIn(d0.width || 1, 1, 8, 1, (v) => patch({ width: v })));
        field('Estilo de línea', selIn([['solid', 'Continua'], ['dashed', 'Guiones'], ['dotted', 'Puntos']], d0.dash || 'solid', (v) => patch({ dash: v })));
        if (t === 'trend' || t === 'channel' || t === 'fib') {
          field('Extender a la izquierda', checkIn(d0.extL, (v) => patch({ extL: v })));
          field('Extender a la derecha', checkIn(d0.extR, (v) => patch({ extR: v })));
        }
        if (t === 'rect' || t === 'channel') {
          field('Relleno', checkIn(d0.fill, (v) => patch({ fill: v })));
          field('Opacidad del relleno', rangeIn(d0.fillOpacity == null ? 15 : d0.fillOpacity, (v) => patch({ fillOpacity: v })));
        }
      }
      if (t === 'fib') {
        field('Línea de tendencia (punteada)', checkIn(d0.trendLine, (v) => patch({ trendLine: v })));
        field('Mostrar el precio de cada nivel', checkIn(d0.showPrice, (v) => patch({ showPrice: v })));
        field('Fondo entre niveles', checkIn(d0.bg, (v) => patch({ bg: v })));
        field('Opacidad del fondo', rangeIn(d0.bgOpacity == null ? 10 : d0.bgOpacity, (v) => patch({ bgOpacity: v })));
        box.appendChild(el('h4', '', 'Niveles (0 = segundo punto, 1 = primer punto)'));
        const lvBox = el('div', 'fib-levels');
        box.appendChild(lvBox);
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
      box.appendChild(el('h4', '', 'Objeto'));
      field('Bloqueado (no se puede mover ni borrar)', checkIn(d0.locked, (v) => patch({ locked: v })));
      field('Oculto', checkIn(d0.hidden, (v) => patch({ hidden: v })));
      const act = el('div', 'row-actions');
      const dup = el('button', 'btn secondary', 'Duplicar'); dup.onclick = () => { duplicateSel(sym, id); X.closeModal(); };
      const del = el('button', 'btn secondary', 'Eliminar'); del.onclick = () => { if (cur() && !cur().locked) { store.remove(sym, id); X.closeModal(); } };
      const ok = el('button', 'btn', 'Cerrar'); ok.onclick = () => X.closeModal();
      act.append(dup, del, ok);
      box.appendChild(act);
      box.appendChild(el('p', 'hint small', 'Los cambios se aplican al momento. El estilo que elijas se recuerda para los próximos dibujos del mismo tipo.'));
      X.decoratePalette(box);
    }, { floating: true });
  }

  // ---------- Atajos de teclado ----------
  function onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const sym = symNow(), layer = layerNow(), s = store.state.sel;
    const k = e.key;
    if (k === 'Escape') {
      closeFly();
      X.eachView((v) => v.draw && v.draw.clearRuler());
      if (layer && layer.hasDraft()) layer.cancel();
      else if (store.state.tool) store.setTool(null);
      else if (s) store.select(null);
      return;
    }
    if (k === 'Enter' && layer && layer.hasDraft()) { e.preventDefault(); layer.finish(); return; }
    if ((k === 'Delete' || k === 'Backspace') && s && s.sym === sym) { e.preventDefault(); deleteSel(sym, s.id); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const low = k.toLowerCase();
      if (low === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(sym); return; }
      if (low === 'y' || (low === 'z' && e.shiftKey)) { e.preventDefault(); store.redo(sym); return; }
      if (low === 'd' && s && s.sym === sym) { e.preventDefault(); duplicateSel(sym, s.id); return; }
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
      if (kind === 'tool') { renderBar(); renderFav(); return; }
      renderSel(); renderTree();
    });
    document.addEventListener('keydown', onKey);
    renderAll();
  }

  root.TVDrawUI = { init, refresh: () => { if (X) { treeSig = ''; renderAll(); } } };
})(window);

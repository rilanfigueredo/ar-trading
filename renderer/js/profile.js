// Perfil del usuario (v0.26.5): icono redondo abajo a la izquierda, menú (perfil, panel de dibujos, zoom, versión, cerrar sesión)
// y editor de la imagen (centrar y agrandar). La parte de arriba es lógica pura (limpieza de datos y recorte) y tiene pruebas.
// Funciona en el navegador (window.TVProfile) y en Node (para las pruebas).
(function (root) {
  'use strict';

  const ZOOM_MIN = 70, ZOOM_MAX = 200, ZOOM_STEP = 10;   // zoom de la interfaz, en %
  const NAME_MAX = 30;
  const CROP_ZMAX = 4;                                    // la imagen se puede agrandar hasta 4 veces
  const SRC_SIZES = [512, 384, 256];                      // tamaños (px) con los que se guarda la imagen original
  const AV_PX = 128;                                      // tamaño de la imagen ya recortada que se muestra en el icono

  // ---------- Lógica pura ----------
  const isImg = (s, max) => typeof s === 'string' && s.length <= max && /^data:image\/(png|jpeg|webp|gif);base64,/.test(s.slice(0, 40));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  function clampZoom(v) {
    const n = Number(v);
    if (!isFinite(n)) return 100;
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(n / ZOOM_STEP) * ZOOM_STEP));
  }
  function cleanUi(u) {
    const o = u && typeof u === 'object' ? u : {};
    return { zoom: o.zoom !== undefined && o.zoom !== null ? clampZoom(o.zoom) : 100, drawPanel: o.drawPanel !== false };
  }
  function cleanCrop(c) {
    const o = c && typeof c === 'object' ? c : {};
    return { x: Math.max(-4, Math.min(4, num(o.x, 0))), y: Math.max(-4, Math.min(4, num(o.y, 0))), z: Math.max(1, Math.min(CROP_ZMAX, num(o.z, 1))) };
  }
  // name: nombre o alias; img: imagen original (reducida); avatar: ya recortada; crop: cómo se centró y agrandó.
  function cleanProfile(p) {
    const o = p && typeof p === 'object' ? p : {};
    const name = typeof o.name === 'string' ? o.name.replace(/[\r\n\t]+/g, ' ').trim().slice(0, NAME_MAX) : '';
    const img = isImg(o.img, 450000) ? o.img : '';
    const avatar = img && isImg(o.avatar, 120000) ? o.avatar : '';
    return { name, img, avatar, crop: cleanCrop(o.crop) };
  }

  // Recorte: el visor es un cuadrado de lado 1. Con z = 1 la imagen lo cubre justo; x e y mueven la imagen (en lados del visor).
  // Se limita para que la imagen siempre cubra todo el visor (nunca quedan huecos).
  function clampCrop(iw, ih, crop) {
    const c = cleanCrop(crop);
    const s = Math.max(1 / iw, 1 / ih) * c.z;
    const mx = Math.max(0, (iw * s - 1) / 2), my = Math.max(0, (ih * s - 1) / 2);
    return { x: Math.max(-mx, Math.min(mx, c.x)), y: Math.max(-my, Math.min(my, c.y)), z: c.z };
  }
  // Dónde y de qué tamaño se dibuja la imagen dentro de un cuadrado de `size` píxeles.
  function cropGeometry(iw, ih, crop, size) {
    const c = clampCrop(iw, ih, crop);
    const s = Math.max(1 / iw, 1 / ih) * c.z;
    const dw = iw * s, dh = ih * s;
    return { dw: dw * size, dh: dh * size, dx: ((1 - dw) / 2 + c.x) * size, dy: ((1 - dh) / 2 + c.y) * size, crop: c };
  }

  const lib = { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, NAME_MAX, CROP_ZMAX, clampZoom, cleanUi, cleanCrop, cleanProfile, clampCrop, cropGeometry };
  if (typeof document === 'undefined') { if (typeof module !== 'undefined' && module.exports) module.exports = lib; return; }

  // ---------- Interfaz (solo en el navegador / Electron) ----------
  const S = { ctx: null, btn: null, menu: null, ver: '' };
  const DEFAULT_IMG = 'assets/icono.svg';
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const cfg = () => S.ctx.A.cfg;
  const profile = () => (cfg().profile = cleanProfile(cfg().profile));
  const ui = () => (cfg().ui = cleanUi(cfg().ui));
  const shown = (p) => p.avatar || p.img || '';
  const who = (p) => p.name || 'Mi perfil';
  function setAvatar(img, p) {
    const src = shown(p);
    img.src = src || DEFAULT_IMG;
    img.classList.toggle('pf-default', !src);
  }

  function applyUi() {
    const u = ui();
    document.body.classList.toggle('no-draw', u.drawPanel === false);
    if (u.drawPanel === false) {
      const st = S.ctx.drawStore && S.ctx.drawStore();
      if (st && st.state && st.state.tool) st.setTool(null);   // sin panel no puede quedar una herramienta de dibujo activa
    }
    if (S.ctx.API.setZoom) S.ctx.API.setZoom(u.zoom / 100);
    // al mostrar/ocultar la barra, los gráficos recalculan su tamaño enseguida
    window.dispatchEvent(new Event('resize'));
  }
  function commitUi(patch) {
    cfg().ui = Object.assign({}, ui(), patch);
    applyUi();
    S.ctx.save();
    if (S.menu) fillMenu();
  }
  function renderBtn() {
    if (!S.btn) return;
    const p = profile();
    setAvatar(S.btn.querySelector('img'), p);
    S.btn.title = who(p) + ' · perfil y ajustes de la interfaz';
  }

  // ----- Menú -----
  function closeMenu() {
    if (!S.menu) return;
    S.menu.remove(); S.menu = null;
    S.btn.classList.remove('open'); S.btn.setAttribute('aria-expanded', 'false');
  }
  function openMenu() {
    closeMenu();
    S.menu = el('div', 'pf-menu');
    S.menu.setAttribute('role', 'menu');
    document.body.appendChild(S.menu);
    // efecto linterna: la luz sigue al mouse dentro de cada opción
    S.menu.addEventListener('mousemove', (e) => {
      const it = e.target.closest && e.target.closest('.pf-item');
      if (!it) return;
      const r = it.getBoundingClientRect();
      it.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      it.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
    S.btn.classList.add('open'); S.btn.setAttribute('aria-expanded', 'true');
    fillMenu();
  }
  function fillMenu() {
    const m = S.menu;
    if (!m) return;
    const p = profile(), u = ui();
    m.innerHTML = '';
    const head = el('div', 'pf-head');
    const im = document.createElement('img'); im.alt = ''; setAvatar(im, p);
    const tx = el('div', '');
    tx.append(el('b', '', who(p)), el('small', '', 'Perfil de este programa'));
    head.append(im, tx);
    m.appendChild(head);

    const item = (label, right, fn, cls) => {
      const b = el('button', 'pf-item' + (cls ? ' ' + cls : ''));
      b.type = 'button'; b.setAttribute('role', 'menuitem');
      b.appendChild(el('span', '', label));
      if (right) b.appendChild(right);
      b.onclick = fn;
      return b;
    };
    m.appendChild(item('Ajustar perfil', el('span', 'pf-go', '›'), () => { closeMenu(); openEditor(); }));

    const on = u.drawPanel !== false;
    const sw = el('span', 'pf-sw' + (on ? ' on' : '')); sw.appendChild(document.createElement('i'));
    const dp = item('Panel de dibujos', sw, () => commitUi({ drawPanel: !on }));
    dp.title = on ? 'Ocultar las herramientas de dibujo' : 'Mostrar las herramientas de dibujo';
    dp.setAttribute('aria-checked', String(on));
    m.appendChild(dp);

    const row = el('div', 'pf-row');
    row.appendChild(el('span', '', 'Zoom de la interfaz'));
    const zc = el('span', 'pf-zoom');
    const can = !!S.ctx.API.setZoom;
    const mkz = (txt, title, v) => {
      const b = el('button', '', txt); b.type = 'button'; b.title = title;
      b.disabled = !can || v === u.zoom;
      b.onclick = () => commitUi({ zoom: v });
      return b;
    };
    const out = el('output', '', u.zoom + ' %');
    zc.append(mkz('−', 'Achicar todo el programa', clampZoom(u.zoom - ZOOM_STEP)), out, mkz('+', 'Agrandar todo el programa', clampZoom(u.zoom + ZOOM_STEP)));
    if (u.zoom !== 100) { const r = mkz('↺', 'Volver al 100 %', 100); r.disabled = false; zc.appendChild(r); }
    row.appendChild(zc);
    if (!can) row.title = 'El zoom solo está disponible en el programa de escritorio (en el navegador usa Ctrl + y Ctrl −).';
    m.appendChild(row);

    m.appendChild(el('div', 'pf-sep'));
    const ver = el('div', 'pf-row pf-ver');
    ver.appendChild(el('span', '', 'Versión'));
    const vb = el('b', '', S.ver ? 'Ar_Trading ' + S.ver : '—');
    ver.appendChild(vb);
    m.appendChild(ver);
    m.appendChild(el('div', 'pf-sep'));
    m.appendChild(item('Cerrar sesión', null, () => { closeMenu(); openLogout(); }, 'pf-out'));
  }

  // ----- Cerrar sesión -----
  function openLogout() {
    S.ctx.openModal((box) => {
      box.appendChild(el('h3', '', 'Cerrar sesión'));
      box.appendChild(el('div', 'hint', 'Se cerrará el programa. Tus gráficos, dibujos y ajustes quedan guardados y estarán cuando lo vuelvas a abrir.'));
      const msg = el('div', 'pf-msg');
      box.appendChild(msg);
      const row = el('div', 'row-actions');
      const go = el('button', 'btn pf-danger', 'Cerrar sesión');
      go.onclick = async () => {
        go.disabled = true;
        try { S.ctx.flush(); } catch (e) { /* ok */ }
        let r = null;
        try { r = await S.ctx.API.quit(); } catch (e) { r = { ok: false, error: e.message }; }
        if (r && r.ok === false) { msg.textContent = r.error || 'No se pudo cerrar.'; go.disabled = false; }
      };
      const no = el('button', 'btn secondary', 'Cancelar'); no.onclick = S.ctx.closeModal;
      row.append(go, no);
      box.appendChild(row);
    });
  }

  // ----- Editor del perfil -----
  function loadImg(src) {
    return new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => fail(new Error('imagen')); im.src = src; });
  }
  // Reduce la imagen elegida y la guarda como texto (WEBP; si pesa demasiado se baja el tamaño).
  async function shrink(im) {
    for (const px of SRC_SIZES) {
      const k = Math.min(1, px / Math.max(im.naturalWidth, im.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k));
      const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, cv.width, cv.height);
      let url = cv.toDataURL('image/webp', 0.88);
      if (url.length > 400000) url = cv.toDataURL('image/jpeg', 0.8);
      if (url.length <= 400000) return { url, img: await loadImg(url) };
    }
    throw new Error('pesada');
  }
  function openEditor() {
    const p0 = profile();
    const draft = { name: p0.name, img: p0.img, crop: Object.assign({}, p0.crop) };
    let src = null, defImg = null;
    S.ctx.openModal((box) => {
      box.appendChild(el('h3', '', 'Ajustar perfil'));
      const stage = el('div', 'pf-stage');
      const PX = 440;
      const cv = el('canvas', 'pf-cv'); cv.width = cv.height = PX;
      stage.appendChild(cv);
      box.appendChild(stage);
      const msg = el('div', 'pf-msg');

      const file = document.createElement('input');
      file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp,image/gif'; file.className = 'hidden';
      const pick = el('button', 'btn secondary', 'Elegir imagen…'); pick.onclick = () => file.click();
      const del = el('button', 'btn secondary', 'Quitar imagen');
      const ctl1 = el('div', 'pf-ctl'); ctl1.append(pick, del, file);
      box.appendChild(ctl1);

      const zr = document.createElement('input');
      zr.type = 'range'; zr.min = 100; zr.max = CROP_ZMAX * 100; zr.step = 5; zr.title = 'Agrandar la imagen';
      const ctr = el('button', 'btn secondary', 'Centrar'); ctr.title = 'Poner la imagen en el centro';
      const ctl2 = el('div', 'pf-ctl'); ctl2.append(el('span', '', 'Tamaño'), zr, ctr);
      box.appendChild(ctl2);
      box.appendChild(el('div', 'hint', 'Arrastra la imagen para moverla. Usa el control de tamaño (o la rueda del mouse) para agrandarla.'));

      const name = document.createElement('input');
      name.type = 'text'; name.className = 'pf-name'; name.maxLength = NAME_MAX; name.placeholder = 'Ej: Rilan'; name.value = draft.name;
      const fld = el('div', 'field'); fld.append(el('span', '', 'Nombre o alias'));
      box.appendChild(fld);
      box.appendChild(name);
      box.appendChild(msg);

      const row = el('div', 'row-actions');
      const ok = el('button', 'btn', 'Guardar'), no = el('button', 'btn secondary', 'Cancelar');
      row.append(ok, no);
      box.appendChild(row);

      const sync = () => {
        const has = !!src;
        zr.disabled = !has; ctr.disabled = !has; del.disabled = !has;
        cv.classList.toggle('noimg', !has);
        zr.value = Math.round(draft.crop.z * 100);
      };
      const paint = () => {
        const g = cv.getContext('2d');
        g.clearRect(0, 0, PX, PX); g.imageSmoothingQuality = 'high';
        if (src) {
          const q = cropGeometry(src.naturalWidth, src.naturalHeight, draft.crop, PX);
          draft.crop = q.crop;
          g.drawImage(src, q.dx, q.dy, q.dw, q.dh);
        } else if (defImg) {
          const s = PX * 0.62;
          g.drawImage(defImg, (PX - s) / 2, (PX - s) / 2, s, s);
        }
      };
      loadImg(DEFAULT_IMG).then((im) => { defImg = im; paint(); }).catch(() => {});
      if (draft.img) loadImg(draft.img).then((im) => { src = im; sync(); paint(); }).catch(() => { draft.img = ''; });
      sync(); paint();

      // mover con el mouse
      let last = null;
      cv.onpointerdown = (e) => { if (!src || e.button !== 0) return; last = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); };
      cv.onpointermove = (e) => {
        if (!last) return;
        const w = cv.getBoundingClientRect().width || 1;
        draft.crop = Object.assign({}, draft.crop, { x: draft.crop.x + (e.clientX - last.x) / w, y: draft.crop.y + (e.clientY - last.y) / w });
        last = { x: e.clientX, y: e.clientY };
        paint();
      };
      cv.onpointerup = cv.onpointercancel = () => { last = null; cv.classList.remove('drag'); };
      cv.onwheel = (e) => {
        if (!src) return;
        e.preventDefault();
        draft.crop = Object.assign({}, draft.crop, { z: Math.max(1, Math.min(CROP_ZMAX, draft.crop.z + (e.deltaY < 0 ? 0.1 : -0.1))) });
        paint(); sync();
      };
      zr.oninput = () => { draft.crop = Object.assign({}, draft.crop, { z: Number(zr.value) / 100 }); paint(); };
      ctr.onclick = () => { draft.crop = Object.assign({}, draft.crop, { x: 0, y: 0 }); paint(); };
      del.onclick = () => { src = null; draft.img = ''; draft.crop = { x: 0, y: 0, z: 1 }; msg.textContent = ''; sync(); paint(); };

      file.onchange = () => {
        const f = file.files && file.files[0];
        file.value = '';
        if (!f) return;
        if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) { msg.textContent = 'Elige una imagen PNG, JPG, WEBP o GIF.'; return; }
        if (f.size > 20 * 1024 * 1024) { msg.textContent = 'La imagen pesa demasiado (máximo 20 MB).'; return; }
        const fr = new FileReader();
        fr.onload = async () => {
          try {
            const im = await loadImg(fr.result);
            const r = await shrink(im);
            src = r.img; draft.img = r.url; draft.crop = { x: 0, y: 0, z: 1 };
            msg.textContent = ''; sync(); paint();
          } catch (e) { msg.textContent = 'No se pudo leer esa imagen. Prueba con otra.'; }
        };
        fr.onerror = () => { msg.textContent = 'No se pudo leer esa imagen. Prueba con otra.'; };
        fr.readAsDataURL(f);
      };

      const save = () => {
        let avatar = '';
        if (draft.img && src) {
          const c2 = document.createElement('canvas'); c2.width = c2.height = AV_PX;
          const g = c2.getContext('2d'); g.imageSmoothingQuality = 'high';
          const q = cropGeometry(src.naturalWidth, src.naturalHeight, draft.crop, AV_PX);
          g.drawImage(src, q.dx, q.dy, q.dw, q.dh);
          avatar = c2.toDataURL('image/webp', 0.9);
        }
        cfg().profile = cleanProfile({ name: name.value, img: draft.img, avatar, crop: draft.crop });
        S.ctx.save();
        renderBtn();
        S.ctx.closeModal();
      };
      ok.onclick = save; no.onclick = S.ctx.closeModal;
      name.onkeydown = (e) => { if (e.key === 'Enter') save(); };
      setTimeout(() => name.focus(), 0);
    });
  }

  // ----- Inicio -----
  // ctx: { A, API, openModal, closeModal, save, flush, drawStore }
  function init(ctx) {
    S.ctx = ctx;
    S.btn = document.getElementById('profileBtn');
    if (!S.btn) return;
    S.btn.setAttribute('aria-haspopup', 'menu'); S.btn.setAttribute('aria-expanded', 'false');
    S.btn.onclick = () => { if (S.menu) closeMenu(); else openMenu(); };
    document.addEventListener('mousedown', (e) => { if (S.menu && !S.menu.contains(e.target) && !S.btn.contains(e.target)) closeMenu(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.menu) closeMenu(); }, true);
    try {
      Promise.resolve(ctx.API.service.get()).then((r) => { S.ver = r && r.version ? String(r.version) : ''; if (S.menu) fillMenu(); }).catch(() => {});
    } catch (e) { /* sin versión */ }
    renderBtn();
    applyUi();
  }
  // Otra pestaña cambió el perfil o la interfaz: se vuelve a dibujar.
  function refresh() {
    if (!S.ctx) return;
    renderBtn(); applyUi();
    if (S.menu) fillMenu();
  }

  lib.init = init; lib.refresh = refresh;
  root.TVProfile = lib;
})(typeof window !== 'undefined' ? window : globalThis);

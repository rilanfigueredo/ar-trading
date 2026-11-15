// Efecto linterna (v0.26.9): donde el mouse se vuelve una mano con el dedo índice (cursor «pointer»),
// aparece una luz morada eléctrica fluorescente que sigue al mouse. Se usa en la ventana principal y en las pantallas de funciones.
// No toca los estilos de cada elemento: dibuja UNA sola capa transparente encima (pointer-events: none).
(function () {
  'use strict';
  if (window.__linterna) return;
  window.__linterna = true;

  var doc = document;
  var css = [
    '#ar-linterna{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none;opacity:0;',
    'transition:opacity .12s ease;will-change:transform,opacity;overflow:hidden;box-sizing:border-box}',
    '#ar-linterna.on{opacity:1}',
    /* elemento normal: luz que sigue al mouse + aro neón */
    '#ar-linterna.rect{mix-blend-mode:screen;background:radial-gradient(circle 90px at var(--lx,50%) var(--ly,50%),',
    'rgba(224,150,255,.20) 0%,rgba(190,90,255,.10) 40%,rgba(176,60,255,.03) 72%,rgba(176,60,255,0) 100%);',
    'box-shadow:0 0 0 1px rgba(214,128,255,.60),0 0 8px 1px rgba(196,92,255,.40),0 0 16px 2px rgba(176,50,255,.18),',
    'inset 0 0 8px rgba(214,128,255,.12)}',
    /* iconos cuadrados / botones pequeños: solo el contorno, sin relleno */
    '#ar-linterna.ring{background:none;box-shadow:0 0 0 1px rgba(214,128,255,.95),0 0 10px 1px rgba(196,92,255,.75),0 0 22px 3px rgba(176,50,255,.38)}',
    /* zona grande (paneles): solo un círculo de luz junto al mouse */
    '#ar-linterna.spot{mix-blend-mode:screen;overflow:visible;background:radial-gradient(circle 46px at var(--lx,50%) var(--ly,50%),',
    'rgba(232,170,255,.55) 0%,rgba(196,96,255,.30) 45%,rgba(176,60,255,0) 100%);border-radius:0;box-shadow:none}',
    '@media (prefers-reduced-motion:reduce){#ar-linterna{transition:none}}'
  ].join('');
  var st = doc.createElement('style'); st.textContent = css;
  (doc.head || doc.documentElement).appendChild(st);

  var lamp = doc.createElement('div'); lamp.id = 'ar-linterna'; lamp.setAttribute('aria-hidden', 'true');
  var mx = 0, my = 0, target = null, raf = 0;

  function isPointer(el) {
    try { return getComputedStyle(el).cursor === 'pointer'; } catch (e) { return false; }
  }
  // Sube hasta el elemento clicable completo (el padre más alto que también tenga mano).
  // Dentro del gráfico (velas, indicadores, dibujos) no hay linterna.
  function inChart(el) { return !!(el && el.closest && el.closest('#grid')); }
  function clickable(el) {
    if (!el || el === doc.body || el === doc.documentElement || el === lamp) return null;
    if (inChart(el)) return null;
    if (!isPointer(el)) return null;
    var p = el.parentElement;
    while (p && p !== doc.body && isPointer(p) && !inChart(p)) { el = p; p = p.parentElement; }
    return el;
  }
  function hide() { target = null; lamp.classList.remove('on'); }
  function paint() {
    raf = 0;
    if (!target || !target.isConnected) { hide(); return; }
    var r = target.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) { hide(); return; }
    var big = r.width > 420 || r.height > 150;
    if (!lamp.parentNode) (doc.body || doc.documentElement).appendChild(lamp);
    var compact = !big && r.width <= 72 && r.height <= 48;   // icono cuadrado o botón pequeño: solo contorno
    lamp.className = (big ? 'spot' : compact ? 'ring' : 'rect') + ' on';
    if (big) {
      // un círculo grande siguiendo al mouse, sin cubrir todo el elemento
      lamp.style.transform = 'translate(' + Math.round(mx - 46) + 'px,' + Math.round(my - 46) + 'px)';
      lamp.style.width = '92px'; lamp.style.height = '92px';
      lamp.style.setProperty('--lx', '46px'); lamp.style.setProperty('--ly', '46px');
      lamp.style.borderRadius = '50%';
    } else {
      lamp.style.transform = 'translate(' + Math.round(r.left) + 'px,' + Math.round(r.top) + 'px)';
      lamp.style.width = r.width + 'px'; lamp.style.height = r.height + 'px';
      lamp.style.setProperty('--lx', Math.max(0, Math.min(r.width, mx - r.left)) + 'px');
      lamp.style.setProperty('--ly', Math.max(0, Math.min(r.height, my - r.top)) + 'px');
      var br = '';
      try { br = getComputedStyle(target).borderRadius; } catch (e) { br = ''; }
      lamp.style.borderRadius = br && br !== '0px' ? br : '4px';
    }
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(paint); }

  doc.addEventListener('mousemove', function (e) {
    mx = e.clientX; my = e.clientY;
    var t = clickable(e.target);
    if (t !== target) target = t;
    if (target) schedule(); else if (lamp.classList.contains('on')) hide();
  }, true);
  doc.addEventListener('mouseleave', hide, true);
  doc.addEventListener('mouseout', function (e) { if (!e.relatedTarget) hide(); }, true);
  doc.addEventListener('scroll', hide, true);
  doc.addEventListener('wheel', hide, { passive: true, capture: true });
  // Si el elemento desaparece o se mueve debajo del mouse sin que este se mueva (clic que cierra un menú, por ejemplo).
  setInterval(function () {
    if (!target) return;
    if (!target.isConnected) { hide(); return; }
    var under = doc.elementFromPoint(mx, my);
    if (!under || (under !== target && !target.contains(under))) hide(); else schedule();
  }, 300);
})();

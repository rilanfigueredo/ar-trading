// Aviso de actualización dentro del programa (v0.25.7). Solo existe en la versión instalada (Electron).
(function () {
  'use strict';
  const api = window.desktopApi;
  if (!api || !api.onUpdate) return;
  let oculto = '';   // versión que el usuario pospuso («Más tarde»): no vuelve a molestar hasta reiniciar o hasta otra versión
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function quitar() { const e = document.getElementById('updNotice'); if (e) e.remove(); }
  // Notas: primera línea = título; líneas que empiezan con «-» = viñetas.
  function notasHtml(txt) {
    const ls = String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (!ls.length) return '';
    let h = '', items = '';
    ls.forEach((l, i) => {
      if (/^[-•*]\s*/.test(l)) items += `<li>${esc(l.replace(/^[-•*]\s*/, ''))}</li>`;
      else if (i === 0) h = `<b>${esc(l)}</b>`;
      else items += `<li>${esc(l)}</li>`;
    });
    return `<div class="u-notas">${h}<ul>${items}</ul></div>`;
  }
  const cabecera = (tag, titulo, cerrar) => `<div class="u-head"><div class="u-logo"><img src="assets/icono.svg" alt=""></div><div><div class="u-tag">${esc(tag)}</div><h4>${esc(titulo)}</h4></div>${cerrar ? '<button class="u-x" id="updX" title="Cerrar" aria-label="Cerrar">×</button>' : ''}</div>`;
  const versiones = (s) => `<div class="u-vers"><span class="u-pill">Tienes ${esc(s.actual)}</span><span class="u-arrow">→</span><span class="u-pill new">Nueva ${esc(s.version)}</span></div>`;
  function pintar(s) {
    if (!s || s.fase === 'nada') return quitar();
    if (oculto === 'v' + s.version && s.fase === 'disponible') return quitar();
    let el = document.getElementById('updNotice');
    const nuevo = !el;
    if (!el) { el = document.createElement('div'); el.id = 'updNotice'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.classList.toggle('err', s.fase === 'error');
    if (s.fase === 'disponible') {
      el.innerHTML = cabecera('Nueva versión disponible', 'Ar_Trading se puede actualizar', true) +
        `<div class="u-body">${versiones(s)}${notasHtml(s.notas)}<div class="u-btns"><button class="btn secondary" id="updLater">Más tarde</button><button class="btn primary" id="updGo">Descargar actualización</button></div></div>`;
      el.querySelector('#updGo').onclick = () => api.updateDownload();
      el.querySelector('#updLater').onclick = el.querySelector('#updX').onclick = () => { oculto = 'v' + s.version; quitar(); };
    } else if (s.fase === 'descargando') {
      const pct = Math.max(0, Math.min(100, +s.pct || 0));
      if (!nuevo && el.querySelector('.u-bar')) { el.querySelector('.u-bar > i').style.width = pct + '%'; el.querySelector('.u-pct b').textContent = pct + ' %'; return; }
      el.innerHTML = cabecera('Descargando', 'Descargando la versión ' + s.version, false) +
        `<div class="u-body"><div class="u-bar"><i style="width:${pct}%"></i></div><div class="u-pct"><span>Puedes seguir trabajando</span><b>${pct} %</b></div></div>`;
    } else if (s.fase === 'lista') {
      el.innerHTML = cabecera('Lista para instalar', 'Versión ' + s.version + ' descargada', true) +
        `<div class="u-body">${versiones(s)}<div class="u-txt">Se guarda una copia de tu configuración y el programa se reinicia. Tus gráficos y datos se conservan.</div><div class="u-btns"><button class="btn secondary" id="updLater">Instalar después</button><button class="btn primary" id="updGo">Reiniciar e instalar</button></div></div>`;
      el.querySelector('#updGo').onclick = () => api.updateInstall();
      el.querySelector('#updLater').onclick = el.querySelector('#updX').onclick = quitar;
    } else if (s.fase === 'error') {
      el.innerHTML = cabecera('Algo falló', 'No se pudo actualizar', true) +
        `<div class="u-body"><div class="u-txt">${esc(s.error || '')}</div><div class="u-btns"><button class="btn secondary" id="updLater">Cerrar</button><button class="btn primary" id="updGo">Reintentar</button></div></div>`;
      el.querySelector('#updGo').onclick = () => api.updateDownload();
      el.querySelector('#updLater').onclick = el.querySelector('#updX').onclick = quitar;
    }
  }
  api.onUpdate(pintar);
  api.updateGet().then(pintar).catch(() => {});
})();

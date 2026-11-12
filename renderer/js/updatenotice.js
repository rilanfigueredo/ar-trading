// Aviso de actualización dentro del programa (v0.25.6). Solo existe en la versión instalada (Electron).
(function () {
  'use strict';
  const api = window.desktopApi;
  if (!api || !api.onUpdate) return;
  let oculto = '';   // fase+versión que el usuario pospuso («Más tarde»): no vuelve a molestar hasta reiniciar o hasta otra versión
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function quitar() { const e = document.getElementById('updNotice'); if (e) e.remove(); }
  function pintar(s) {
    if (!s || s.fase === 'nada') return quitar();
    if (oculto === 'v' + s.version && s.fase === 'disponible') return quitar();
    let el = document.getElementById('updNotice');
    if (!el) { el = document.createElement('div'); el.id = 'updNotice'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    const ver = `Tienes la ${esc(s.actual)} · Nueva: <b>${esc(s.version)}</b>`;
    if (s.fase === 'disponible') {
      el.innerHTML = `<h4>Hay una actualización</h4><div class="u-ver">${ver}</div>` +
        (s.notas ? `<div class="u-notas">${esc(s.notas)}</div>` : '') +
        `<div class="u-btns"><button class="btn secondary" id="updLater">Recordármelo más tarde</button><button class="btn" id="updGo">Descargar actualización</button></div>`;
      el.querySelector('#updGo').onclick = () => api.updateDownload();
      el.querySelector('#updLater').onclick = () => { oculto = 'v' + s.version; quitar(); };
    } else if (s.fase === 'descargando') {
      el.innerHTML = `<h4>Descargando actualización…</h4><div class="u-ver">${ver}</div><div class="u-bar"><i style="width:${+s.pct || 0}%"></i></div><div class="u-ver">${+s.pct || 0} %. Puedes seguir trabajando.</div>`;
    } else if (s.fase === 'lista') {
      el.innerHTML = `<h4>Actualización lista para instalar</h4><div class="u-ver">${ver}</div><div class="u-ver">Se guarda una copia de tu configuración y el programa se reinicia. Tus gráficos y datos se conservan.</div>` +
        `<div class="u-btns"><button class="btn secondary" id="updLater">Instalar después</button><button class="btn" id="updGo">Reiniciar e instalar</button></div>`;
      el.querySelector('#updGo').onclick = () => api.updateInstall();
      el.querySelector('#updLater').onclick = quitar;
    } else if (s.fase === 'error') {
      el.innerHTML = `<h4>No se pudo actualizar</h4><div class="u-ver">${esc(s.error || '')}</div><div class="u-btns"><button class="btn secondary" id="updLater">Cerrar</button><button class="btn" id="updGo">Reintentar</button></div>`;
      el.querySelector('#updGo').onclick = () => api.updateDownload();
      el.querySelector('#updLater').onclick = quitar;
    }
  }
  api.onUpdate(pintar);
  api.updateGet().then(pintar).catch(() => {});
})();

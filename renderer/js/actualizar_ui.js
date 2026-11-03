// Cartel de «hay una versión nueva» (v0.26). Aparece abajo a la derecha cuando el programa encuentra una versión más nueva;
// en la app instalada descarga e instala con un clic (conserva configuración y datos). En el navegador/móvil solo avisa.
(function () {
  'use strict';
  const API = window.TVApi;
  if (!API || !API.update) return;
  let oculto = '';            // versión cuyo aviso se cerró con «Ahora no» (vuelve a avisar con otra versión o al reabrir)
  let caja = null;
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  function pintar(u) {
    if (!u || !['disponible', 'descargando', 'listo'].includes(u.fase) || (u.fase === 'disponible' && oculto === u.version)) { if (caja) { caja.remove(); caja = null; } return; }
    if (!caja) { caja = mk('div', 'upd-banner'); caja.setAttribute('role', 'status'); document.body.appendChild(caja); }
    caja.innerHTML = '';
    const t = mk('div', 'upd-t');
    t.append(mk('b', '', u.fase === 'listo' ? 'Actualización lista' : 'Hay una versión nueva de Ar_Trading'), mk('span', 'upd-v', u.fase === 'descargando' ? 'Descargando… ' + (u.pct || 0) + ' %' : 'Versión ' + u.version + ' (tienes la ' + u.actual + ').'));
    caja.appendChild(t);
    if (u.fase === 'descargando') { const b = mk('div', 'upd-bar'); const i = mk('i'); i.style.width = (u.pct || 0) + '%'; b.appendChild(i); caja.appendChild(b); return; }
    const fila = mk('div', 'upd-f');
    if (u.soloAviso) {
      fila.appendChild(mk('span', 'upd-v', 'Actualiza el programa en tu PC.'));
    } else {
      const ok = mk('button', 'btn primary', u.fase === 'listo' ? 'Reiniciar y actualizar' : u.instalable === false ? 'Ver la descarga' : 'Actualizar ahora');
      ok.onclick = async () => { ok.disabled = true; const r = await API.update.install(); if (r && r.ok === false) { ok.disabled = false; ok.textContent = r.error || 'No se pudo'; } };
      fila.appendChild(ok);
    }
    const no = mk('button', 'btn', 'Ahora no'); no.onclick = () => { oculto = u.version; pintar(null); };
    fila.appendChild(no); caja.appendChild(fila);
  }
  API.update.get().then(pintar).catch(() => {});
  API.update.onChange(pintar);
  if (!window.desktopApi) setInterval(() => API.update.get().then(pintar).catch(() => {}), 6 * 3600 * 1000);   // navegador/móvil: vuelve a mirar cada 6 horas
})();

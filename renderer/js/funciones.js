// Pantalla de tarjetas y marcos de las funciones (v0.24).
// Cada pestaña puede estar en: gráfico (lo de siempre), pantalla de tarjetas ("inicio") o una función con interfaz propia.
// La interfaz de cada función vive en su propio marco (iframe): sus estilos y su código no se mezclan con los del programa.
// El marco no tiene red ni acceso directo al programa: habla por mensajes y aquí se comprueba que solo use los canales de SU función.
(function () {
  'use strict';
  const R = window.TVFunciones_registro;
  const panes = new Map();                 // idPestaña -> { el, bar, body, titulo, home, tabId, fnId, iframe, listo, visible, timer }
  let X = null;                            // { host, API, tema(), cambiarTema(), abrir(id), inicio() }

  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const enviar = (p, m) => { try { if (p.iframe && p.iframe.contentWindow) p.iframe.contentWindow.postMessage(Object.assign({ fn: 1 }, m), '*'); } catch (e) { /* marco cerrado */ } };

  function tarjetas() {
    const pant = h('div', 'fn-home');
    // v0.26.1: si hay diseños guardados, van en la primera fila (antes de las funciones)
    const ds = X.disenos ? X.disenos() : [];
    if (ds.length) {
      pant.appendChild(h('h2', 'fn-home-t', 'Mis diseños'));
      pant.appendChild(h('p', 'fn-home-s', 'Tus pestañas guardadas, con sus dibujos, plantillas e indicadores. Elige una para abrirla aquí.'));
      const g = h('div', 'fn-cards dz-cards'); g.dataset.disenos = '1';
      ds.forEach((d) => {
        const c = h('div', 'fn-card dz-card'); c.dataset.diseno = d.id;
        const th = h('div', 'dz-thumb');
        if (d.thumb) { const im = h('img'); im.src = d.thumb; im.alt = ''; im.draggable = false; th.appendChild(im); } else th.classList.add('empty');
        c.appendChild(th);
        c.appendChild(h('h3', 'fn-card-n dz-card-n', d.name));
        const ch = d.data && Array.isArray(d.data.charts) ? (d.data.charts[d.data.active] || d.data.charts[0]) : null;
        const nDr = Object.values((d.data && d.data.drawings) || {}).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
        c.appendChild(h('p', 'fn-card-d dz-card-d', [ch && ch.symbol, nDr + (nDr === 1 ? ' dibujo' : ' dibujos')].filter(Boolean).join(' · ')));
        const b = h('button', 'btn fn-card-b', 'Abrir'); b.dataset.abrirDiseno = d.id; b.onclick = () => X.abrirDiseno(d.id);
        c.appendChild(b);
        const x = h('button', 'dz-x', '×'); x.title = 'Borrar este diseño';
        x.onclick = (e) => { e.stopPropagation(); if (window.confirm('¿Borrar el diseño «' + d.name + '»? No se puede deshacer.')) X.borrarDiseno(d.id); };
        c.appendChild(x);
        g.appendChild(c);
      });
      pant.appendChild(g);
    }
    pant.appendChild(h('h2', ds.length ? 'fn-home-t fn-home-t2' : 'fn-home-t', 'Elige una función'));
    pant.appendChild(h('p', 'fn-home-s', 'Se abre en esta misma pestaña. Para volver a esta pantalla usa «Inicio» en la barra de la función.'));
    const grid = h('div', 'fn-cards'); grid.dataset.cards = '1';
    R.LISTA.forEach((f) => {
      const c = h('div', 'fn-card' + (f.listo ? '' : ' off')); c.dataset.fn = f.id;
      const ic = h('div', 'fn-card-ic'); ic.innerHTML = f.icono; c.appendChild(ic);
      c.appendChild(h('h3', 'fn-card-n', f.titulo));
      c.appendChild(h('p', 'fn-card-d', f.desc));
      const b = h('button', 'btn fn-card-b', 'Abrir'); b.dataset.abrir = f.id; b.disabled = !f.listo;
      if (f.listo) b.onclick = () => X.abrir(f.id); else b.title = f.nota || 'Todavía no disponible';
      c.appendChild(b);
      if (!f.listo && f.nota) c.appendChild(h('div', 'fn-card-note', f.nota));
      grid.appendChild(c);
    });
    pant.appendChild(grid);
    return pant;
  }

  function crearPane(tabId) {
    const el = h('div', 'fn-pane off'); el.dataset.tab = tabId;
    const bar = h('div', 'fn-bar');
    const home = h('button', 'fn-home-btn', '⌂ Inicio'); home.title = 'Volver a la pantalla de tarjetas (cierra esta función en esta pestaña)'; home.onclick = () => X.inicio();
    const titulo = h('span', 'fn-title');
    const tema = h('button', 'fn-theme', ''); tema.title = 'Cambiar entre modo claro y oscuro'; tema.onclick = () => X.cambiarTema();
    bar.append(home, titulo, h('span', 'fn-spacer'), tema);
    const body = h('div', 'fn-body');
    el.append(bar, body);
    X.host.appendChild(el);
    const p = { el, bar, body, titulo, home, tema, tabId, fnId: null, iframe: null, listo: false, visible: false, timer: 0 };
    panes.set(tabId, p);
    return p;
  }
  function pintarTema(p) { p.tema.textContent = X.tema() === 'light' ? '☾ Modo oscuro' : '☀ Modo claro'; }

  function limpiarBody(p) { clearTimeout(p.timer); p.body.replaceChildren(); p.iframe = null; p.listo = false; }

  // Muestra la pestaña en modo función: la pantalla de tarjetas ('inicio') o la interfaz de un módulo.
  function mostrar(tabId, fnId) {
    panes.forEach((q) => { q.el.classList.add('off'); if (q.fnId && q.fnId !== 'inicio') { q.visible = false; enviar(q, { tipo: 'visible', v: false }); } });
    let p = panes.get(tabId) || crearPane(tabId);
    if (p.fnId === fnId && fnId === 'inicio') p.body.replaceChildren(tarjetas());   // al volver a la pantalla se ponen al día los diseños
    if (p.fnId !== fnId) {
      limpiarBody(p); p.fnId = fnId;
      if (fnId === 'inicio') p.body.appendChild(tarjetas());
      else {
        const f = R.porId(fnId);
        const fr = h('iframe', 'fn-frame'); fr.title = f.titulo; fr.dataset.fn = fnId;
        fr.src = 'funciones/' + fnId + '/index.html?tema=' + X.tema();
        p.iframe = fr; p.body.appendChild(fr);
        // si el marco no avisa que cargó, se muestra un mensaje en vez de quedar en blanco
        p.timer = setTimeout(() => { if (!p.listo && p.iframe === fr) falla(p, 'La función no terminó de cargar.'); }, 8000);
      }
    }
    p.home.classList.toggle('hid', fnId === 'inicio');
    p.titulo.textContent = fnId === 'inicio' ? 'Nueva pestaña' : R.titulo(fnId);
    pintarTema(p);
    p.el.classList.remove('off');
    p.visible = true; enviar(p, { tipo: 'visible', v: true });
  }
  // Vuelve a dibujar la pantalla de tarjetas (por ejemplo cuando cambia la lista de diseños)
  function refrescar() {
    if (!X) return;
    panes.forEach((p) => { if (p.fnId === 'inicio') { const top = p.body.firstChild ? p.body.firstChild.scrollTop : 0; p.body.replaceChildren(tarjetas()); if (p.body.firstChild) p.body.firstChild.scrollTop = top; } });
  }
  function falla(p, texto) {
    const o = h('div', 'fn-error'); o.appendChild(h('p', null, texto + ' El resto del programa sigue funcionando.'));
    const b = h('button', 'btn', 'Volver a intentar'); b.onclick = () => { const f = p.fnId; p.fnId = null; mostrar(p.tabId, f); };
    o.appendChild(b); p.body.appendChild(o);
  }
  function ocultar() { panes.forEach((q) => { q.el.classList.add('off'); q.visible = false; if (q.iframe) enviar(q, { tipo: 'visible', v: false }); }); }
  function quitar(tabId) { const p = panes.get(tabId); if (!p) return; limpiarBody(p); p.el.remove(); panes.delete(tabId); }
  function setTema(t) { panes.forEach((p) => { enviar(p, { tipo: 'tema', tema: t }); pintarTema(p); }); }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch (e) { /* se prueba el método antiguo */ }
    try { const t = document.createElement('textarea'); t.value = texto; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return !!ok; } catch (e) { return false; }
  }

  window.addEventListener('message', async (ev) => {
    const m = ev.data;
    if (!m || m.fn !== 1) return;
    let p = null; panes.forEach((q) => { if (q.iframe && q.iframe.contentWindow === ev.source) p = q; });
    if (!p) return;                                              // solo se atiende a los marcos que abrió el programa
    if (m.tipo === 'listo') { p.listo = true; clearTimeout(p.timer); enviar(p, { tipo: 'tema', tema: X.tema() }); enviar(p, { tipo: 'visible', v: p.visible }); }
    else if (m.tipo === 'llamar') {
      const f = R.porId(p.fnId), canal = String(m.canal || '');
      let resultado;
      if (!f || !f.prefijo || !canal.startsWith(f.prefijo + ':')) resultado = { ok: false, error: 'Esta función solo puede usar sus propios canales («' + (f && f.prefijo) + ':…»).' };
      else { try { resultado = await X.API.fnInvocar(canal, Array.isArray(m.args) ? m.args : [], p.tabId); } catch (e) { resultado = { ok: false, error: String(e && e.message || e) }; } }
      if (p.iframe && p.iframe.contentWindow === ev.source) enviar(p, { tipo: 'respuesta', id: m.id, resultado });
    } else if (m.tipo === 'copiar') { const ok = await copiar(String(m.texto || '')); enviar(p, { tipo: 'respuesta', id: m.id, resultado: ok }); }
    else if (m.tipo === 'error') { console.warn('[función ' + p.fnId + ']', m.mensaje); }
  });

  window.TVFunciones = {
    init(o) { X = o; },
    porId: R.porId, titulo: R.titulo, limpiar: R.limpiar, lista: () => R.LISTA,
    mostrar, ocultar, quitar, setTema, refrescar,
    abierta: (tabId) => { const p = panes.get(tabId); return p ? p.fnId : null; },
  };
})();

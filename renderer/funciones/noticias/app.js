'use strict';
// Interfaz delgada: solo muestra lo que entrega el núcleo (src/) a través de window.api.
(function () {
  const $ = (id) => document.getElementById(id);
  // Canales propios de esta función (prefijo «noticias:»). Todo pasa por el programa principal; aquí no hay red.
  const llamarCanal = (c) => (...a) => window.Fn.invocar('noticias:' + c, ...a);
  const api = {
    estado: llamarCanal('estado'), vista: llamarCanal('vista'), actualizar: llamarCanal('actualizar'), traerPublicados: llamarCanal('publicados'),
    orden: llamarCanal('orden'), valorManual: llamarCanal('manual'), mercado: llamarCanal('mercado'), guardarLista: llamarCanal('lista'),
    guardarClave: llamarCanal('clave'), copiar: (t) => window.Fn.copiar(t).then((ok) => (ok ? { ok: true, datos: true } : { ok: false, error: 'No se pudo copiar al portapapeles.' })),
    abrirCarpeta: llamarCanal('carpeta'),
  };
  const ORDENES = ['Reporte de la lista de seguimiento', 'Reporte solo EE. UU.', 'Reporte de Japón y Eurozona', 'Calendario de hoy', 'Calendario de la semana, alta importancia'];
  let ultimoMercado = 0, estado = null, textoReporte = '', monedasSel = new Set(), periodo = 'semana', rango = 'semana', clavePaises = '';
  const nombres = {};

  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  async function llamar(p) { const r = await p; if (!r.ok) { mostrarAviso(r.error); return null; } return r.datos; }
  function mostrarAviso(t) { $('avisos').appendChild(el('div', 'aviso', t)); }
  function marcar(contenedor, attr, valor) { contenedor.querySelectorAll('button').forEach((b) => b.classList.toggle('activa', b.dataset[attr] === valor)); }
  function etiqueta(f) {
    if (f.mejor === 'mejor') return el('span', 'etq mejor', 'mejor que lo esperado');
    if (f.mejor === 'peor') return el('span', 'etq peor', 'peor que lo esperado');
    if (f.mejor === 'igual') return el('span', 'etq', 'en línea con lo esperado');
    if (f.estado === 'pendiente') return el('span', 'etq', 'pendiente');
    return null;
  }
  function pintarEstado(s) {
    estado = s; s.paises.forEach((p) => { nombres[p.cod] = p.nombre; });
    $('banners').replaceChildren(...s.banners.map((b) => el('div', 'banner', `Fuente con problemas — ${b.fuente}: ${b.mensaje}`)));
    $('avisos').replaceChildren(...s.avisos.map((a) => el('div', 'aviso', a)));
    $('actualizado').textContent = s.descargado ? 'Calendario descargado: ' + new Date(s.descargado).toLocaleString('es') : 'Calendario sin descargar';
    $('estadoClave').textContent = s.hayClave ? 'Clave guardada: sí.' : 'Clave guardada: no.';
  }
  function tabla(cols, filas) {
    const t = el('table'); const h = el('tr'); cols.forEach((c) => h.appendChild(el('th', null, c))); t.appendChild(el('thead')).appendChild(h);
    const b = el('tbody');
    filas.forEach((f) => { const tr = el('tr'); f.forEach((c) => { const td = el('td'); if (c instanceof Node) td.appendChild(c); else td.textContent = c; tr.appendChild(td); }); b.appendChild(tr); });
    t.appendChild(b); const caja = el('div', 'tabla-caja'); caja.appendChild(t); return caja;
  }
  function celdaPais(cod) { const w = el('span', 'imp-txt'); w.appendChild(window.bandera(cod, nombres[cod])); return w; }
  function celdaImp(i) { const w = el('span', 'imp-txt ' + i); w.appendChild(el('i', 'punto')); w.appendChild(document.createTextNode(i)); return w; }

  function pintarPanelPaises(d) {
    const clave = d.monedasDisponibles.map((m) => m.cod).join();
    if (clave === clavePaises) return; clavePaises = clave;
    const p = $('panelPaises'); p.replaceChildren();
    d.monedasDisponibles.forEach((m) => {
      const l = el('label', 'sw'); const i = el('input'); i.type = 'checkbox'; i.checked = monedasSel.has(m.cod);
      i.addEventListener('change', () => { i.checked ? monedasSel.add(m.cod) : monedasSel.delete(m.cod); etiquetaPaises(); pintarCalendario(); });
      l.appendChild(i); l.appendChild(el('span', 'pista')); l.appendChild(window.bandera(m.cod, m.nombre)); l.appendChild(el('span', 'nombre', m.nombre)); p.appendChild(l);
    });
  }
  function etiquetaPaises() { $('btnPaises').textContent = `Países · ${monedasSel.size} ▾`; }
  function sincronizarPanel() { $('panelPaises').querySelectorAll('input').forEach((i, k) => { const cod = clavePaises.split(',')[k]; i.checked = monedasSel.has(cod); }); }
  async function pintarCalendario() {
    const importancias = [...document.querySelectorAll('.imp:checked')].map((x) => x.value);
    const d = await llamar(api.vista({ rango, importancias, monedas: [...monedasSel] }));
    if (!d) return;
    pintarPanelPaises(d); sincronizarPanel(); etiquetaPaises(); marcar($('segRango'), 'rango', rango);
    const tb = document.querySelector('#tablaCal tbody'); tb.replaceChildren();
    d.filas.forEach((f) => {
      const tr = el('tr');
      tr.appendChild(el('td', null, f.fechaLarga)); tr.appendChild(el('td', null, f.hora));
      const tp = el('td'); tp.appendChild(celdaPais(f.moneda)); tr.appendChild(tp);
      const ti = el('td'); ti.appendChild(celdaImp(f.impacto)); tr.appendChild(ti);
      tr.appendChild(el('td', 'ev', f.titulo)); tr.appendChild(el('td', null, f.previo)); tr.appendChild(el('td', null, f.esperado));
      tr.appendChild(el('td', f.mejor === 'mejor' || f.mejor === 'peor' ? f.mejor : '', f.publicado));
      tb.appendChild(tr);
    });
    $('cuentaCal').textContent = d.total + ' eventos. Horas en tu zona horaria.';
  }
  function seccion(color, titulo) { const s = el('div', 'card ' + color); s.appendChild(el('h2', null, titulo)); return s; }
  function tarjetaMercado(t) {
    const c = el('div', 'mcard'); c.appendChild(el('div', 'nom', t.nombre)); c.appendChild(el('div', 'val', t.valor));
    if (t.cambio) c.appendChild(el('span', 'delta', `${t.sube ? '▲' : '▼'} ${t.cambio}${t.pct ? ' (' + t.pct + ')' : ''}`));
    const g = el('div'); g.innerHTML = t.svg; c.appendChild(g);
    const pie = el('div', 'pie'); pie.appendChild(el('span', null, t.rango ? '40 d: ' + t.rango : '')); pie.appendChild(el('span', null, t.fecha)); c.appendChild(pie);
    return c;
  }
  function pintarMercado(tarjetas, ts) {
    const g = $('mgrid'); if (!g) return; g.replaceChildren(...tarjetas.map(tarjetaMercado));
    $('mercadoTs').textContent = 'Actualizado ' + new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) + ' · se renueva cada hora mientras esta pestaña esté abierta y a la vista · fuente: FRED (valores diarios)';
  }
  async function refrescarMercado() {
    if (!$('mgrid')) return;
    const m = await llamar(api.mercado()); if (!m) return;
    ultimoMercado = Date.now();
    pintarMercado(m.tarjetas, m.ts);
    $('banners').replaceChildren(...m.banners.map((b) => el('div', 'banner', `Fuente con problemas — ${b.fuente}: ${b.mensaje}`)));
  }
  function filaTema(f) {
    const fila = el('div', 'trow'); const cab = el('div', 'cab');
    cab.appendChild(window.bandera(f.moneda, nombres[f.moneda])); cab.appendChild(el('span', 'tit', f.titulo));
    const e = etiqueta(f); if (e) cab.appendChild(e); fila.appendChild(cab);
    const st = el('div', 'stats');
    [['Previo', f.previo, ''], ['Esperado', f.esperado, ''], ['Publicado', f.publicado, f.mejor === 'mejor' || f.mejor === 'peor' ? f.mejor : '']].forEach(([k, v, cl]) => {
      const b = el('div', 'stat ' + cl); b.appendChild(el('div', 'k', k));
      b.appendChild(el('div', 'v' + (v.length > 9 ? ' peque' : ''), v)); st.appendChild(b);
    });
    fila.appendChild(st);
    fila.appendChild(el('div', 'dir', `${f.dia.slice(5)} ${f.hora}` + (f.direccion ? ` · ${f.direccion}` : '')));
    return fila;
  }
  const LECT = { restrictivo: 'más restrictivo', laxo: 'más laxo', mixto: 'mixto', 'sin datos': 'sin datos' };
  function filaModelo(f) {
    const fila = el('div', 'trow'); const cab = el('div', 'cab');
    cab.appendChild(window.bandera(f.moneda, nombres[f.moneda])); cab.appendChild(el('span', 'tit', f.titulo));
    if (f.lectura === 'restrictivo' || f.lectura === 'laxo') cab.appendChild(el('span', 'etq ' + f.lectura, LECT[f.lectura] + ' que lo esperado'));
    else if (f.lectura === 'neutro') cab.appendChild(el('span', 'etq', 'en línea con lo esperado'));
    fila.appendChild(cab); const st = el('div', 'stats');
    [['Previo', f.previo], ['Esperado', f.esperado]].forEach(([k, v]) => { const b = el('div', 'stat'); b.appendChild(el('div', 'k', k)); b.appendChild(el('div', 'v', v)); st.appendChild(b); });
    const pb = el('div', 'stat ' + (f.lectura === 'restrictivo' || f.lectura === 'laxo' ? f.lectura : '')); pb.appendChild(el('div', 'k', 'Publicado'));
    if (f.estado === 'manual-pendiente') {
      const w = el('div', 'manual'); const i = el('input'); i.type = 'text'; i.placeholder = 'ej. 52.4'; i.setAttribute('aria-label', 'Valor publicado de ' + f.titulo);
      const g = el('button', 'btn peque', 'Guardar');
      g.addEventListener('click', async () => { if (await llamar(api.valorManual(f.id, i.value))) enviarOrden('Reporte de la lista de seguimiento ' + (periodo === 'mes' ? 'este mes' : 'esta semana')); });
      w.appendChild(i); w.appendChild(g); pb.appendChild(w); pb.appendChild(el('div', 'av', 'ISM no permite copiar su dato: escríbelo tú'));
    } else pb.appendChild(el('div', 'v' + (f.publicado.length > 9 ? ' peque' : ''), f.publicado));
    st.appendChild(pb); fila.appendChild(st);
    fila.appendChild(el('div', 'dir', f.fechaLarga + ' · ' + f.hora + (f.direccion ? ' · ' + f.direccion : ''))); return fila;
  }
  function filaItem(i) {
    const fila = el('div', 'trow'); const cab = el('div', 'cab'); cab.appendChild(el('span', 'tit', i.nombre));
    if (i.lectura) cab.appendChild(el('span', 'etq ' + (i.lectura === 'neutro' ? '' : i.lectura), i.lectura === 'neutro' ? 'estable' : LECT[i.lectura]));
    fila.appendChild(cab); const st = el('div', 'stats2');
    const a = el('div', 'stat ' + (i.lectura === 'restrictivo' || i.lectura === 'laxo' ? i.lectura : '')); a.appendChild(el('div', 'k', 'Último dato')); a.appendChild(el('div', 'v', i.valor)); st.appendChild(a);
    const b = el('div', 'stat'); b.appendChild(el('div', 'k', 'Cambio')); b.appendChild(el('div', 'v peque', i.cambio || 's/d')); st.appendChild(b);
    fila.appendChild(st); fila.appendChild(el('div', 'dir', i.fecha)); return fila;
  }
  function tarjetaBloque(b) {
    const c = el('div', 'tcard bloque ' + b.estado.replace(' ', '-')); const h = el('div', 'cab-b');
    h.appendChild(el('h3', null, b.nombre)); h.appendChild(el('span', 'peso', b.peso + ' %')); c.appendChild(h);
    c.appendChild(el('div', 'av', b.detalle));
    const e = el('div', 'etq ' + (b.estado === 'restrictivo' || b.estado === 'laxo' ? b.estado : ''), 'Lectura: ' + (LECT[b.estado] || b.estado)); e.style.marginTop = '8px'; c.appendChild(e);
    b.filas.forEach((f) => c.appendChild(filaModelo(f))); b.items.forEach((i) => c.appendChild(filaItem(i)));
    if (!b.filas.length && !b.items.length) c.appendChild(el('p', 'av', 'Sin datos de este bloque en el período.'));
    return c;
  }
  function pintarModelo(m) {
    const s = seccion('b-pu', 'Modelo de 5 datos de EE. UU.: esperado contra lo que salió');
    const t = m.total, pos = t.puntaje == null ? 50 : Math.round((t.puntaje + 1) * 50);
    const med = el('div', 'medidor-caja');
    med.appendChild(el('div', 'medidor-tit', `Inclinación del conjunto: ${LECT[t.estado] || t.estado}${t.puntaje == null ? '' : ' (' + (t.puntaje > 0 ? '+' : '') + t.puntaje.toFixed(2) + ')'} · cobertura ${t.cobertura} % del peso`));
    const bar = el('div', 'medidor'); const mk = el('i', 'marca'); mk.style.left = pos + '%'; bar.appendChild(mk); med.appendChild(bar);
    const ej = el('div', 'medidor-ej'); ['Más laxo', 'Mixto', 'Más restrictivo'].forEach((x) => ej.appendChild(el('span', null, x))); med.appendChild(ej);
    s.appendChild(med);
    if (m.svg) { const g = el('div'); g.innerHTML = m.svg; s.appendChild(g); }
    s.appendChild(el('p', 'av', 'Lectura según tu modelo: publicado contra esperado (energía y mercado: cambio en 4 semanas). Rojo = más restrictivo; verde = más laxo. Describe los datos; no es una señal de compra ni de venta. Pesos y umbrales editables en modelo.json (a verificar).'));
    const g = el('div', 'tgrid'); m.bloques.forEach((b) => g.appendChild(tarjetaBloque(b))); g.appendChild(tarjetaBloque(m.confirmacion)); s.appendChild(g);
    return s;
  }
  function pintarReporte(r) {
    textoReporte = r.texto; $('btnCopiar').disabled = !r.texto; $('copiado').textContent = '';
    const cont = $('resultado'); cont.replaceChildren();
    if (r.tipo !== 'reporte') { const s = seccion('b-cy', 'Respuesta'); s.appendChild(el('pre', 'ayuda', r.texto)); cont.appendChild(s); return; }
    periodo = r.periodo; marcar($('segPeriodo'), 'periodo', periodo);
    // 1) mercado y macro global: 3 arriba y 3 abajo, se renueva cada hora
    const sm = el('div', 'card b-cy'); const cs = el('div', 'cab-sec'); cs.appendChild(el('h2', null, 'Mercado y macro global')); const ts = el('span', 'av'); ts.id = 'mercadoTs'; cs.appendChild(ts); sm.appendChild(cs);
    const gm = el('div', 'mgrid'); gm.id = 'mgrid'; sm.appendChild(gm); cont.appendChild(sm);
    ultimoMercado = r.mercadoTs || Date.now(); pintarMercado(r.mercado, ultimoMercado);
    // 2) modelo de 5 datos de EE. UU.
    cont.appendChild(pintarModelo(r.modelo));
    // 3) tarjetas por tema
    const st = seccion('b-gr', 'Datos que pueden influir en la dirección de la macroeconomía'); const gt = el('div', 'tgrid');
    r.temas.forEach((t) => { const c = el('div', 'tcard ' + t.id); c.appendChild(el('h3', null, t.nombre)); t.filas.forEach((f) => c.appendChild(filaTema(f))); gt.appendChild(c); });
    if (!r.temas.length) st.appendChild(el('p', 'av', 'No hay datos de estos temas en los países elegidos.')); else st.appendChild(gt);
    cont.appendChild(st);
    // 4) detalle por país
    const sd = seccion('b-cy', 'Detalle por país');
    r.secciones.forEach((s) => {
      const d = el('details'); d.open = s.moneda === 'USD'; const sum = el('summary'); sum.appendChild(window.bandera(s.moneda, s.nombre)); sum.appendChild(document.createTextNode(` ${s.nombre} (${s.moneda})`)); d.appendChild(sum);
      if (!s.tieneFuente) d.appendChild(el('p', 'av', 'Sin fuente gratuita verificada de valores publicados: solo calendario.'));
      if (s.pasados.length) d.appendChild(tabla(['Hora', 'Evento', 'Imp.', 'Previo', 'Esperado', 'Publicado', 'Sorpresa', 'Dirección'], s.pasados.map((f) => [f.dia.slice(5) + ' ' + f.hora, f.titulo, celdaImp(f.impacto), f.previo, f.esperado, f.publicado, f.sorpresa || '—', f.direccion || '—'])));
      else d.appendChild(el('p', 'av', 'Sin eventos de importancia alta/media ya ocurridos.'));
      s.reacciones.forEach((x) => { d.appendChild(el('h4', null, `Reacción histórica de BTC — ${x.titulo} (${x.resumen.todos.n} publicaciones; mediana)`)); const g = el('div'); g.innerHTML = x.svg; d.appendChild(g); });
      if (s.pendientes.length) { d.appendChild(el('h4', null, 'Pendientes (alta/media)')); d.appendChild(tabla(['Hora', 'Evento', 'Imp.', 'Previo', 'Esperado'], s.pendientes.map((f) => [f.dia.slice(5) + ' ' + f.hora, f.titulo, celdaImp(f.impacto), f.previo, f.esperado]))); }
      sd.appendChild(d);
    });
    sd.appendChild(el('p', 'av', 'La reacción histórica usa pocas publicaciones y no predice la siguiente. Describe datos; no es una señal de compra ni de venta.'));
    cont.appendChild(sd);
  }
  function irA(tab) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('activa', b.dataset.tab === tab));
    ['cal', 'rep', 'lista'].forEach((t) => { $('tab-' + t).hidden = t !== tab; });
  }
  async function enviarOrden(texto, chip) {
    const t = (texto || $('orden').value).trim(); if (!t) return;
    $('orden').value = t; $('btnOrden').disabled = true; $('btnOrden').textContent = 'Trabajando…';
    document.querySelectorAll('#chips .btn').forEach((b) => b.classList.toggle('activa', b === chip));
    const r = await llamar(api.orden(t));
    $('btnOrden').disabled = false; $('btnOrden').textContent = 'Enviar';
    const s = await llamar(api.estado()); if (s) pintarEstado(s);
    if (!r) return;
    if (r.tipo === 'calendario') {
      rango = r.filtros.rango; document.querySelectorAll('.imp').forEach((c) => { c.checked = r.filtros.importancias.includes(c.value); });
      monedasSel = new Set(r.filtros.monedas); irA('cal'); await pintarCalendario();
    } else { pintarReporte(r); irA('rep'); if (r.tipo === 'reporte') pintarCalendario(); }
  }
  function pintarLista() {
    const c = $('checksLista'); c.replaceChildren();
    estado.paises.forEach((p) => {
      const l = el('label', 'sw'); const i = el('input'); i.type = 'checkbox'; i.value = p.cod; i.checked = estado.lista.includes(p.cod);
      l.appendChild(i); l.appendChild(el('span', 'pista')); l.appendChild(window.bandera(p.cod, p.nombre)); l.appendChild(el('span', 'nombre', `${p.nombre}${p.opcional ? ' (opcional)' : ''}`)); c.appendChild(l);
    });
  }
  async function iniciar() {
    ORDENES.forEach((o) => { const b = el('button', 'btn', o); b.addEventListener('click', () => enviarOrden(o, b)); $('chips').appendChild(b); });
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => irA(b.dataset.tab)));
    document.querySelectorAll('.imp').forEach((x) => x.addEventListener('change', pintarCalendario));
    $('segRango').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { rango = b.dataset.rango; pintarCalendario(); } });
    $('segPeriodo').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) enviarOrden('Reporte de la lista de seguimiento ' + (b.dataset.periodo === 'mes' ? 'este mes' : 'esta semana')); });
    $('btnPaises').addEventListener('click', (e) => { e.stopPropagation(); $('panelPaises').hidden = !$('panelPaises').hidden; });
    document.addEventListener('click', (e) => { if (!e.target.closest('.drop')) $('panelPaises').hidden = true; });
    $('btnOrden').addEventListener('click', () => enviarOrden());
    $('orden').addEventListener('keydown', (e) => { if (e.key === 'Enter') enviarOrden(); });
    $('btnActualizar').addEventListener('click', async () => { $('btnActualizar').disabled = true; const s = await llamar(api.actualizar(true)); $('btnActualizar').disabled = false; if (s) pintarEstado(s); pintarCalendario(); });
    $('btnPublicados').addEventListener('click', async () => { $('btnPublicados').disabled = true; const s = await llamar(api.traerPublicados([...monedasSel])); $('btnPublicados').disabled = false; if (s) pintarEstado(s); pintarCalendario(); });
    $('btnCopiar').addEventListener('click', async () => { if (await llamar(api.copiar(textoReporte))) $('copiado').textContent = 'Copiado. Pégalo en el chat.'; });
    $('btnGuardarLista').addEventListener('click', async () => {
      const m = [...document.querySelectorAll('#checksLista input:checked')].map((x) => x.value);
      const ok = await llamar(api.guardarLista(m)); if (ok) { estado.lista = ok; monedasSel = new Set(ok); pintarCalendario(); }
    });
    $('btnClave').addEventListener('click', async () => {
      const ok = await llamar(api.guardarClave($('clave').value)); $('clave').value = '';
      if (ok) { const s = await llamar(api.estado()); if (s) pintarEstado(s); }
    });
    $('btnCarpeta').addEventListener('click', () => llamar(api.abrirCarpeta()));
    const s = await llamar(api.estado()); if (!s) return;
    pintarEstado(s); pintarLista(); monedasSel = new Set(s.lista);
    const x = await llamar(api.actualizar(false)); if (x) pintarEstado(x);
    pintarCalendario();
  }
  // Reloj de la hora: solo corre mientras la pestaña está a la vista (al volver, si pasó más de una hora, se renueva al instante).
  const HORA = 3600e3;
  const tocaRenovar = () => window.Fn.visible && ultimoMercado && Date.now() - ultimoMercado >= HORA;
  setInterval(() => { if (tocaRenovar()) refrescarMercado(); }, 30e3);
  window.Fn.alVisible(() => { if (tocaRenovar()) refrescarMercado(); });
  window.__noticias = { refrescarMercado, forzarVencida: () => { ultimoMercado = 1; } };   // para las pruebas automáticas
  iniciar();
})();

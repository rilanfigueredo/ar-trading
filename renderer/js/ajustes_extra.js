// Pestañas de Ajustes añadidas en la v0.26: Respaldo, Móvil y Programa (versión y actualizaciones).
// app.js solo las lista y delega aquí (TVAjustesExtra.tabs / render) para no engordar ese archivo.
(function () {
  'use strict';
  const API = window.TVApi;
  const tabs = [['respaldo', 'Respaldo'], ['movil', 'Móvil'], ['programa', 'Programa']];
  const fmtBytes = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const fmtFecha = (iso) => { try { return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } };
  const ORIGEN = { auto: 'Automático', manual: 'Manual', previo: 'Antes de un cambio grande' };
  const soloEscritorio = (body, mk, hint) => hint('Esta opción se maneja desde la app de escritorio instalada en tu PC.');
  const interruptor = (mk, texto, marcado, onchange) => {
    const f = mk('div', { className: 'field' }); const i = mk('input', { type: 'checkbox', checked: !!marcado }); i.onchange = () => onchange(i.checked);
    f.append(mk('span', { textContent: texto }), i); return f;
  };

  // ---------- Respaldo ----------
  function respaldo(body, mk, title, hint) {
    title('Respaldo de mi configuración');
    hint('Guarda copias de TODO lo que define tu programa: pestañas, gráficos, dibujos, plantillas, paleta, scripts, tema, y los datos de Simulador, Noticias y Blockchain. Las velas y liquidaciones guardadas tienen su propia copia en Ajustes > Datos.');
    if (!API.respaldo) return soloEscritorio(body, mk, hint);
    const caja = mk('div', {}); body.appendChild(caja);
    const say = mk('div', { className: 'svc-msg' }); body.appendChild(say);
    const decir = (t, mal) => { say.textContent = t; say.className = 'svc-msg' + (mal ? ' bad' : ''); };
    const pintar = async () => {
      const r = await API.respaldo.get(); caja.innerHTML = '';
      caja.appendChild(mk('div', { className: 'field' })).append(mk('span', { textContent: 'Carpeta de respaldos' }), mk('span', { className: 'hint', textContent: r.destino + (r.porDefecto ? '  (la de siempre: Documentos)' : '') }));
      const fila = mk('div', { className: 'row-actions' });
      const btn = (t, f) => { const b = mk('button', { className: 'btn', textContent: t }); b.onclick = async () => { b.disabled = true; try { await f(); } finally { b.disabled = false; } }; return b; };
      fila.append(
        btn('Respaldar ahora', async () => { const x = await API.respaldo.hacer(); decir(x.ok ? `Listo: ${x.archivos} archivos (${fmtBytes(x.bytes)}).` : 'No se pudo: ' + x.error, !x.ok); pintar(); }),
        btn('Cambiar carpeta…', async () => { const x = await API.respaldo.elegir(); if (x.canceled) return; decir(x.ok ? 'Carpeta cambiada: ' + x.destino : 'No se pudo: ' + x.error, !x.ok); pintar(); }),
        btn('Abrir carpeta', async () => { const x = await API.respaldo.abrir(); if (!x.ok) decir('No se pudo abrir: ' + x.error, true); }));
      if (!r.porDefecto) fila.appendChild(btn('Volver a Documentos', async () => { await API.respaldo.usarDefecto(); pintar(); }));
      caja.appendChild(fila);
      caja.appendChild(interruptor(mk, 'Respaldo automático (al abrir, cada 3 horas y al cerrar; solo si hubo cambios)', r.auto, async (on) => { await API.respaldo.setAuto(on); }));
      if (r.error) caja.appendChild(mk('div', { className: 'svc-msg bad', textContent: 'El último respaldo automático falló: ' + r.error }));
      caja.appendChild(mk('div', { className: 'hint', textContent: 'Consejo: elige una carpeta de OneDrive o Google Drive y tendrás también una copia en la nube. Se guardan hasta 20 automáticos; los manuales y los «antes de un cambio grande» nunca se borran solos.' }));
      tituloEn(caja, mk, 'Respaldos guardados (' + r.lista.length + ')');
      if (!r.lista.length) caja.appendChild(mk('div', { className: 'hint', textContent: 'Todavía no hay respaldos. Pulsa «Respaldar ahora».' }));
      r.lista.forEach((x) => {
        const f = mk('div', { className: 'bk-row' });
        f.append(mk('span', { className: 'bk-f', textContent: fmtFecha(x.fecha) }), mk('span', { className: 'bk-t', textContent: (ORIGEN[x.origen] || x.origen) + ' · v' + (x.appVersion || '?') + ' · ' + fmtBytes(x.bytes) }));
        const b = mk('button', { className: 'btn', textContent: 'Restaurar' });
        b.onclick = async () => {
          if (!window.confirm('¿Restaurar el respaldo del ' + fmtFecha(x.fecha) + '?\n\nSe guardará antes una copia de lo que tienes ahora, y el programa se reiniciará.')) return;
          b.disabled = true; const y = await API.respaldo.restaurar(x.ruta);
          if (!y.ok) { b.disabled = false; decir('No se pudo restaurar: ' + y.error, true); } else decir('Restaurado (' + y.restaurados + ' archivos). Reiniciando…');
        };
        f.appendChild(b); caja.appendChild(f);
      });
    };
    pintar();
  }
  // el título de la lista debe ir dentro de la caja, no al final del cuerpo
  const tituloEn = (caja, mk, t) => caja.appendChild(mk('h4', { textContent: t }));

  // ---------- Móvil ----------
  function movil(body, mk, title, hint) {
    title('Usar Ar_Trading en el móvil');
    hint('Tu PC ofrece el programa por la red y el móvil lo abre en su navegador (o instalado como app). Debe estar encendido y con Ar_Trading abierto.');
    if (!API.movil) return soloEscritorio(body, mk, hint);
    const caja = mk('div', {}); body.appendChild(caja);
    const pintar = async (r) => {
      r = r || await API.movil.get(); caja.innerHTML = '';
      caja.appendChild(interruptor(mk, 'Permitir el acceso desde el móvil', r.activo, async (on) => { const x = await API.movil.set(on); pintar(x.ok ? x : null); }));
      if (r.error) caja.appendChild(mk('div', { className: 'svc-msg bad', textContent: r.error }));
      if (!r.activo) { caja.appendChild(mk('div', { className: 'hint', textContent: 'Apagado: nadie puede entrar desde fuera de este PC.' })); return; }
      const bloque = mk('div', { className: 'mv-box' });
      const izq = mk('div', {});
      izq.append(mk('div', { className: 'hint', textContent: 'Código de acceso (se pide una vez en cada móvil)' }), mk('div', { className: 'mv-code', textContent: r.codigo }));
      const nuevo = mk('button', { className: 'btn', textContent: 'Código nuevo' });
      nuevo.onclick = async () => { if (!window.confirm('Con un código nuevo, los móviles ya conectados tendrán que volver a entrar. ¿Seguir?')) return; pintar(await API.movil.codigoNuevo()); };
      izq.appendChild(nuevo);
      izq.appendChild(mk('div', { className: 'hint', textContent: r.urls.length ? 'Dirección (misma red Wi-Fi):' : 'No encuentro una red. Conéctate a Wi-Fi.' }));
      r.urls.forEach((u) => izq.appendChild(mk('div', { className: 'mv-url', textContent: u })));
      bloque.appendChild(izq);
      if (r.qr) { const im = mk('img', { src: r.qr, alt: 'Código QR con la dirección', width: 200, height: 200 }); bloque.appendChild(im); }
      caja.appendChild(bloque);
      const fp = mk('div', { className: 'field' }); const num = mk('input', { type: 'number', value: r.puerto, min: 1024, max: 65535 }); const gp = mk('button', { className: 'btn', textContent: 'Guardar puerto' });
      gp.onclick = async () => { const x = await API.movil.puerto(num.value); pintar(x.ok ? x : Object.assign(await API.movil.get(), { error: x.error })); };
      fp.append(mk('span', { textContent: 'Puerto' }), num, gp); caja.appendChild(fp);
      const pasos = [
        'Conecta el móvil a la MISMA red Wi-Fi que este PC.',
        'Abre la cámara y escanea el cuadro QR (o escribe la dirección en el navegador del móvil).',
        'Escribe el código de acceso. Listo: ya ves tus gráficos.',
        'iPhone: en Safari, botón Compartir > «Añadir a pantalla de inicio». Android: ver el aviso de abajo.',
      ];
      const ol = mk('ol', { className: 'hint' }); pasos.forEach((t) => ol.appendChild(mk('li', { textContent: t }))); caja.appendChild(ol);
      caja.appendChild(mk('div', { className: 'hint', textContent: 'La primera vez Windows pregunta si permites el acceso por la red: elige «Redes privadas» y Permitir.' }));
      caja.appendChild(mk('div', { className: 'hint', textContent: 'Android solo instala Ar_Trading como app (con su icono y sin barra del navegador) si la dirección empieza con https://. Para eso, y para usarla también fuera de casa, instala Tailscale (gratis) en el PC y en el móvil y sigue «Tailscale Serve». Sin eso, en Android funciona como página web.' }));
      caja.appendChild(mk('div', { className: 'hint', textContent: 'Seguridad: cualquiera con el código y acceso a tu red verá tus gráficos y listas. Desde el móvil no se pueden borrar datos ni cambiar el servicio. Si compartes la red, apaga esta opción cuando no la uses.' }));
    };
    pintar();
  }

  // ---------- Programa ----------
  function programa(body, mk, title, hint) {
    title('Versión y actualizaciones');
    const caja = mk('div', {}); body.appendChild(caja);
    const pintar = (u) => {
      caja.innerHTML = '';
      const txt = { ninguna: 'Aún no se ha buscado.', buscando: 'Buscando…', alDia: 'Estás al día.', disponible: 'Hay una versión nueva: ' + (u.version || ''), descargando: 'Descargando… ' + (u.pct || 0) + ' %', listo: 'Descargada. Lista para instalar.', error: u.error || 'Error.' }[u.fase] || '';
      caja.appendChild(mk('div', { className: 'field' })).append(mk('span', { textContent: 'Versión instalada' }), mk('b', { textContent: u.actual || '' }));
      caja.appendChild(mk('div', { className: 'svc-msg' + (u.fase === 'error' ? ' bad' : ''), textContent: txt }));
      const fila = mk('div', { className: 'row-actions' });
      const b1 = mk('button', { className: 'btn', textContent: 'Buscar actualizaciones' }); b1.disabled = u.fase === 'buscando' || u.fase === 'descargando';
      b1.onclick = async () => { pintar({ fase: 'buscando', actual: u.actual }); pintar(await API.update.check()); };
      fila.appendChild(b1);
      if (u.fase === 'disponible' || u.fase === 'listo') {
        const b2 = mk('button', { className: 'btn primary', textContent: u.fase === 'listo' ? 'Reiniciar y actualizar' : u.instalable === false ? 'Ver la descarga' : 'Descargar e instalar' });
        b2.onclick = async () => { b2.disabled = true; await API.update.install(); };
        fila.appendChild(b2);
      }
      caja.appendChild(fila);
      if (u.notas && u.fase === 'disponible') caja.appendChild(mk('pre', { className: 'upd-notas', textContent: u.notas }));
      caja.appendChild(mk('div', { className: 'hint', textContent: 'El programa busca solo al abrir y cada 6 horas. Al instalar una versión nueva se conservan tu configuración y tus datos (y se hace un respaldo antes).' }));
    };
    API.update.get().then(pintar);
    if (API.update.onChange) API.update.onChange((st) => { if (caja.isConnected) pintar(st); });
  }

  window.TVAjustesExtra = { tabs, render: (tab, body, mk, title, hint) => ({ respaldo, movil, programa }[tab] || (() => {}))(body, mk, title, hint) };
})();

// Función «Noticias macro» (v0.24): une el núcleo del monitor (AppMacro) con el puente de funciones.
// Datos en <datos del programa>/funciones/noticias (antes: %APPDATA%\Ar_Monitor\noticias; se copian una sola vez, sin borrar lo viejo).
'use strict';
const fs = require('fs');
const path = require('path');
const { crearAlmacen } = require('./almacen');
const { AppMacro } = require('./app');

const CANALES = ['estado', 'vista', 'actualizar', 'publicados', 'mercado', 'manual', 'orden', 'lista', 'clave', 'carpeta'];

// Copia los datos del monitor suelto a la carpeta del programa, solo si la nueva está vacía. La clave de FRED va cifrada con la llave
// de ESA app: en Windows no se puede abrir desde otra, así que si no se lee se descarta y se avisa (nunca se guarda sin cifrar).
function migrar(carpeta, antigua, cifrador) {
  const nota = [];
  try {
    if (!antigua || !fs.existsSync(antigua) || fs.readdirSync(carpeta).length) return nota;
    let n = 0;
    for (const f of fs.readdirSync(antigua)) {
      const o = path.join(antigua, f);
      if (!fs.statSync(o).isFile() || f.endsWith('.tmp')) continue;
      fs.copyFileSync(o, path.join(carpeta, f)); n++;
    }
    if (n) nota.push('Se copiaron tus datos del monitor de noticias anterior (' + n + ' archivos). Los originales no se tocaron.');
    const clave = path.join(carpeta, 'fred.bin');
    if (fs.existsSync(clave)) {
      let ok = false;
      try { ok = !!(cifrador && cifrador.disponible() && cifrador.descifrar(Buffer.from(fs.readFileSync(clave, 'utf8'), 'base64'))); } catch (e) { ok = false; }
      if (!ok) { fs.unlinkSync(clave); nota.push('La clave de FRED no se pudo traspasar (va cifrada con la llave del otro programa): vuelve a pegarla en «Lista y clave».'); }
    }
  } catch (e) { nota.push('No se pudieron copiar los datos anteriores: ' + e.message); }
  return nota;
}

function crear(entorno) {
  const almacen = crearAlmacen(entorno.carpeta, entorno.cifrador);
  const notas = migrar(entorno.carpeta, entorno.appData ? path.join(entorno.appData, 'Ar_Monitor', 'noticias') : null, entorno.cifrador);
  const app = new AppMacro({ fetchFn: entorno.fetch, almacen, ahora: entorno.ahora });
  app.iniciar();
  notas.forEach((n) => app.avisosConfig.push(n));
  const acciones = {
    estado: () => app.estado(),
    vista: (f) => app.vistaCalendario(f),
    actualizar: async (forzar) => { await app.actualizarCalendario({ forzar: !!forzar }); return app.estado(); },
    publicados: async (monedas) => { await app.actualizarCalendario({}); await app.traerPublicados(monedas); return app.estado(); },
    mercado: () => app.mercadoAhora(),
    manual: (id, v) => app.guardarValorManual(id, v),
    orden: (t) => app.ejecutarOrden(t),
    lista: (m) => app.guardarLista(Array.isArray(m) ? m : []),
    clave: (c) => { app.guardarClave(c); return true; },
    carpeta: async () => {
      if (!entorno.abrirCarpeta) throw new Error('Abrir la carpeta solo funciona en la app de escritorio. Está en: ' + almacen.carpeta);
      const e = await entorno.abrirCarpeta(almacen.carpeta); if (e) throw new Error(String(e)); return true;
    },
  };
  return {
    app,
    async llamar(nombre, args) { const f = acciones[nombre]; if (!f) throw new Error('Canal desconocido.'); return f(...args); },
    cerrar() {},
  };
}
module.exports = { id: 'noticias', prefijo: 'noticias', canales: CANALES, crear, migrar };

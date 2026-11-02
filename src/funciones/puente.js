// Puente de funciones (v0.24): conecta la interfaz de cada función (marco aislado) con su módulo en el proceso principal.
// Lo usan main.js (Electron: un canal por mensaje) y server.js (modo navegador: POST /api/fn).
//
// Reglas de aislamiento:
//  - Cada módulo vive en src/funciones/<id>/modulo.js y declara su prefijo y la lista de canales. Un canal se llama "<prefijo>:<nombre>".
//  - Un módulo solo recibe llamadas de sus propios canales; si falla al cargarse o al ejecutar, devuelve {ok:false,error} y nada más se entera.
//  - TODA la red sale de aquí (el entorno trae el fetch); la interfaz no tiene red.
//  - "inst" identifica la pestaña que llama (w1…w10): varias pestañas del mismo módulo comparten sus datos (un solo módulo, escrituras en orden).
'use strict';
const fs = require('fs');
const path = require('path');
const registro = require('../../renderer/funciones/registro');

const CANAL_RE = /^[a-z][a-z0-9]*:[a-z][a-z0-9-]*$/;

// Descubre los módulos: cada carpeta de src/funciones con un modulo.js que exporte { id, prefijo, canales:[…], crear(entorno) }.
function descubrir(base) {
  const dir = base || __dirname;
  const out = [];
  for (const nombre of fs.readdirSync(dir)) {
    const arch = path.join(dir, nombre, 'modulo.js');
    if (!fs.existsSync(arch)) continue;
    try {
      const m = require(arch);
      if (!m || !/^[a-z][a-z0-9]*$/.test(m.prefijo || '') || registro.PRESERVADOS.includes(m.prefijo)) throw new Error('prefijo no válido');
      if (!Array.isArray(m.canales) || typeof m.crear !== 'function') throw new Error('falta canales o crear');
      out.push({ id: m.id || nombre, prefijo: m.prefijo, canales: m.canales.slice(), mod: m });
    } catch (e) { out.push({ id: nombre, prefijo: null, canales: [], error: 'No se pudo leer el módulo: ' + e.message }); }
  }
  return out;
}

// entornoBase: { datosBase (carpeta de datos del programa), appData, fetch, cifrador, abrirCarpeta(ruta), ahora }
function crearPuente(entornoBase, opciones) {
  const modulos = descubrir(opciones && opciones.base).filter((m) => m.prefijo);
  const vivos = new Map();                        // prefijo -> { inst } | { error }
  const dePrefijo = (p) => modulos.find((m) => m.prefijo === p);

  function carpetaDe(m) { return path.join(entornoBase.datosBase, 'funciones', m.id); }
  function instanciar(m) {
    let v = vivos.get(m.prefijo);
    if (v) return v;
    try {
      const carpeta = carpetaDe(m);
      fs.mkdirSync(carpeta, { recursive: true });
      const inst = m.mod.crear(Object.assign({}, entornoBase, { carpeta }));
      v = { inst };
    } catch (e) { v = { error: `La función «${m.id}» no pudo iniciar: ${e.message}` }; }
    vivos.set(m.prefijo, v);
    return v;
  }

  // Todos los nombres de canal registrados (para que main.js los cree sin cargar los módulos).
  const canales = () => modulos.flatMap((m) => m.canales.map((c) => m.prefijo + ':' + c));

  async function invocar(canal, args, inst) {
    try {
      if (typeof canal !== 'string' || !CANAL_RE.test(canal)) return { ok: false, error: 'Canal no válido.' };
      const [pref, nombre] = canal.split(':');
      const m = dePrefijo(pref);
      if (!m || !m.canales.includes(nombre)) return { ok: false, error: 'Canal desconocido.' };
      const v = instanciar(m);
      if (v.error) return { ok: false, error: v.error };
      const ctx = { inst: /^w([1-9]|10)$/.test(inst || '') ? inst : 'w1' };
      const datos = await v.inst.llamar(nombre, Array.isArray(args) ? args : [], ctx);
      return { ok: true, datos };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }
  function cerrarTodo() { for (const v of vivos.values()) { try { if (v.inst && v.inst.cerrar) v.inst.cerrar(); } catch (e) { /* ok */ } } vivos.clear(); }
  return { invocar, canales, cerrarTodo, modulos: () => modulos.map((m) => ({ id: m.id, prefijo: m.prefijo, canales: m.canales.slice() })) };
}

module.exports = { crearPuente, descubrir, CANAL_RE };

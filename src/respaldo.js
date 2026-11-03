// Respaldo de la configuración (v0.26). Copia a una carpeta de tu PC TODO lo que define tu programa: pestañas y sus gráficos, dibujos,
// plantillas, paleta, scripts, tema (config.json y win-*.json), ajustes del servicio (service.json) y los datos de las funciones
// (escenarios del simulador, lista de noticias, historial del monitor…, carpeta «funciones»).
// NO copia las velas ni las liquidaciones guardadas (eso lo cubre «Copia de seguridad de datos» en Ajustes > Datos).
// Cada respaldo es una carpeta con fecha; se pueden abrir con el explorador. Las automáticas se rotan; las manuales nunca se borran solas.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MARCA = 'respaldo.json';
const PREFIJO = 'Ar_Trading_respaldo_';
const esConfig = (f) => f === 'config.json' || f === 'service.json' || /^win-w(10|[1-9])\.json$/.test(f);
const omitir = (f) => /\.tmp$/.test(f) || f.includes('.danado-');

const pad = (n) => String(n).padStart(2, '0');
const sello = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const dentro = (padre, hijo) => { const r = path.relative(path.resolve(padre), path.resolve(hijo)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };

// Archivos de configuración de una carpeta de datos: [{ rel, abs }] (rutas con «/»)
function recoger(userData) {
  const out = [];
  let top = [];
  try { top = fs.readdirSync(userData, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of top) if (e.isFile() && esConfig(e.name) && !omitir(e.name)) out.push({ rel: e.name, abs: path.join(userData, e.name) });
  const rec = (dir, rel) => {
    let items = []; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of items) {
      if (omitir(e.name)) continue;
      const a = path.join(dir, e.name), r = rel + '/' + e.name;
      if (e.isDirectory()) rec(a, r); else if (e.isFile()) out.push({ rel: r, abs: a });
    }
  };
  rec(path.join(userData, 'funciones'), 'funciones');
  return out.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

// Huella del contenido actual: sirve para no repetir un respaldo automático si nada cambió.
function huella(userData) {
  const h = crypto.createHash('sha1');
  for (const f of recoger(userData)) { h.update(f.rel + '\0'); try { h.update(fs.readFileSync(f.abs)); } catch (e) { h.update('?'); } h.update('\0'); }
  return h.digest('hex');
}

function leerMarca(ruta) { try { const m = JSON.parse(fs.readFileSync(path.join(ruta, MARCA), 'utf8')); return m && typeof m === 'object' ? m : null; } catch (e) { return null; } }

// Hace un respaldo. origen: 'auto' | 'manual' | 'previo' (el que se guarda justo antes de restaurar).
function hacer({ userData, destino, origen = 'manual', appVersion = '', ahora = () => new Date() }) {
  if (!destino || typeof destino !== 'string') throw new Error('Elige una carpeta para los respaldos.');
  if (dentro(userData, destino) || path.resolve(userData) === path.resolve(destino)) throw new Error('La carpeta de respaldo no puede estar dentro de la carpeta de datos del programa.');
  fs.mkdirSync(destino, { recursive: true });
  const d = ahora();
  let nombre = PREFIJO + sello(d), ruta = path.join(destino, nombre), n = 1;
  while (fs.existsSync(ruta)) ruta = path.join(destino, nombre + '_' + (++n));
  const archivos = recoger(userData);
  fs.mkdirSync(path.join(ruta, 'archivos'), { recursive: true });
  let bytes = 0;
  for (const f of archivos) {
    const dest = path.join(ruta, 'archivos', ...f.rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f.abs, dest); bytes += fs.statSync(dest).size;
  }
  const marca = { formato: 1, fecha: d.toISOString(), origen, appVersion, archivos: archivos.length, bytes, huella: huella(userData) };
  fs.writeFileSync(path.join(ruta, MARCA), JSON.stringify(marca, null, 1), 'utf8');
  return Object.assign({ ruta }, marca);
}

// Lista los respaldos de una carpeta (el más nuevo primero). Carpetas que no son respaldos se ignoran.
function listar(destino) {
  let items = []; try { items = fs.readdirSync(destino, { withFileTypes: true }); } catch (e) { return []; }
  const out = [];
  for (const e of items) {
    if (!e.isDirectory() || !e.name.startsWith(PREFIJO)) continue;
    const ruta = path.join(destino, e.name), m = leerMarca(ruta);
    if (m && m.formato === 1) out.push({ nombre: e.name, ruta, fecha: m.fecha, origen: m.origen, appVersion: m.appVersion, archivos: m.archivos, bytes: m.bytes, huella: m.huella });
  }
  return out.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.nombre < b.nombre ? 1 : -1));
}

// Respaldo automático: solo si algo cambió desde el último; deja como máximo `max` automáticos (los manuales y «previo» no se tocan).
function auto({ userData, destino, max = 20, appVersion = '', ahora }) {
  const ult = listar(destino)[0];
  if (ult && ult.huella === huella(userData)) return { omitido: true, motivo: 'sin cambios desde el último respaldo' };
  if (!recoger(userData).length) return { omitido: true, motivo: 'todavía no hay configuración que respaldar' };
  const r = hacer({ userData, destino, origen: 'auto', appVersion, ahora });
  const autos = listar(destino).filter((x) => x.origen === 'auto');
  for (const x of autos.slice(Math.max(1, max))) { try { fs.rmSync(x.ruta, { recursive: true, force: true }); } catch (e) { /* ok */ } }
  return r;
}

// Restaura un respaldo: antes guarda uno de seguridad («previo») de lo actual; luego reemplaza la configuración.
// El programa debe reiniciarse después para leerla.
function restaurar({ userData, ruta, destino, appVersion = '', ahora }) {
  const m = leerMarca(ruta);
  if (!m || m.formato !== 1 || !fs.existsSync(path.join(ruta, 'archivos'))) throw new Error('Esa carpeta no es un respaldo de Ar_Trading.');
  const base = path.join(ruta, 'archivos');
  const lista = []; const rec = (dir, rel) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const a = path.join(dir, e.name), r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) rec(a, r); else lista.push({ rel: r, abs: a }); } };
  rec(base, '');
  // seguridad: nada fuera de las rutas permitidas (config/win/service o dentro de funciones/)
  for (const f of lista) if (!(esConfig(f.rel) || (f.rel.startsWith('funciones/') && !f.rel.includes('..')))) throw new Error('El respaldo trae un archivo no permitido: ' + f.rel);
  const previo = hacer({ userData, destino, origen: 'previo', appVersion, ahora });
  for (const f of recoger(userData)) { try { fs.unlinkSync(f.abs); } catch (e) { /* ok */ } }
  for (const f of lista) { const d = path.join(userData, ...f.rel.split('/')); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(f.abs, d); }
  return { restaurados: lista.length, previo: previo.ruta };
}

module.exports = { hacer, listar, auto, restaurar, huella, recoger, MARCA, PREFIJO };

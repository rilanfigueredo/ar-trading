// Ajustes de servicio de la app de escritorio (v0.23.3): aceleración por hardware (se lee ANTES de que arranque Electron)
// y reseteo de fábrica. Se guarda en service.json dentro de la carpeta de datos del usuario.
'use strict';
const fs = require('fs');
const path = require('path');

const file = (dir) => path.join(dir, 'service.json');
// hwAccel: aceleración por hardware · dataDir: carpeta de los datos históricos propios ('' = la de siempre)
function read(dir) {
  const def = { hwAccel: true, dataDir: '' };
  try {
    const o = JSON.parse(fs.readFileSync(file(dir), 'utf8'));
    return { hwAccel: o.hwAccel !== false, dataDir: typeof o.dataDir === 'string' ? o.dataDir : '' };
  } catch (e) { return def; }
}
function write(dir, patch) {                // une con lo ya guardado: cambiar una opción no borra las demás
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(dir), JSON.stringify(Object.assign(read(dir), patch), null, 2));
}
// Carpetas de datos históricos propios (no se borran en el reseteo de fábrica)
const DATA_DIRS = ['trades', 'trades-simulado', 'liq', 'liq-simulado', 'hist', 'hist-simulado'];
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, (c) => (c === 'T' ? '_' : c === ':' ? '' : '-'));
const inside = (a, b) => { const r = path.relative(path.resolve(a), path.resolve(b)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
async function copyData(srcBase, destBase) {
  let bytes = 0;
  for (const d of DATA_DIRS) {
    const from = path.join(srcBase, d);
    if (!fs.existsSync(from)) continue;
    await fs.promises.cp(from, path.join(destBase, d), { recursive: true, force: false, errorOnExist: false });
  }
  const sz = (p) => { let n = 0; try { fs.readdirSync(p, { withFileTypes: true }).forEach((e) => { const q = path.join(p, e.name); n += e.isDirectory() ? sz(q) : fs.statSync(q).size; }); } catch (e) { /* nada */ } return n; };
  DATA_DIRS.forEach((d) => { bytes += sz(path.join(destBase, d)); });
  return bytes;
}
// Copia de seguridad: crea una carpeta nueva con fecha dentro de `dest` (nunca dentro de los datos mismos)
async function backup(srcBase, dest) {
  if (!dest || typeof dest !== 'string') throw new Error('Elige una carpeta de destino.');
  if (inside(srcBase, dest)) throw new Error('El destino no puede estar dentro de la carpeta de datos.');
  fs.mkdirSync(dest, { recursive: true });
  const target = path.join(dest, 'Ar_Trading_datos_' + stamp());
  fs.mkdirSync(target, { recursive: true });
  const bytes = await copyData(srcBase, target);
  return { path: target, bytes };
}
// Carpeta de datos usable: si la elegida no está (ej. disco externo desconectado) se avisa y se usa la de siempre
function resolveDataDir(userData) {
  const want = read(userData).dataDir;
  if (!want) return { dir: userData, wanted: '', error: '' };
  try { fs.mkdirSync(want, { recursive: true }); const t = path.join(want, '.escritura'); fs.writeFileSync(t, 'ok'); fs.unlinkSync(t); return { dir: want, wanted: want, error: '' }; }
  catch (e) { return { dir: userData, wanted: want, error: `No puedo usar la carpeta de datos elegida (${want}): ${e.code || e.message}. ¿Está conectado el disco? Mientras tanto se usa la carpeta de siempre.` }; }
}
// Borra la configuración (tema, plantillas, scripts, dibujos, ventanas…), lo descargado y los ajustes de servicio.
function factoryReset({ dir, store, core, restart }) {
  store.reset();
  core.resetData({ restart: !!restart });
  // vuelve la aceleración al valor inicial, pero se CONSERVA la carpeta de datos elegida (los datos están ahí)
  const keep = read(dir);
  try { fs.unlinkSync(file(dir)); } catch (e) { /* ok */ }
  if (keep.dataDir) write(dir, { dataDir: keep.dataDir });
}
module.exports = { read, write, factoryReset, backup, copyData, resolveDataDir, DATA_DIRS };

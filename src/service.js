// Ajustes de servicio de la app de escritorio (v0.23.3): aceleración por hardware (se lee ANTES de que arranque Electron)
// y reseteo de fábrica. Se guarda en service.json dentro de la carpeta de datos del usuario.
'use strict';
const fs = require('fs');
const path = require('path');

const file = (dir) => path.join(dir, 'service.json');
function read(dir) {
  try { const o = JSON.parse(fs.readFileSync(file(dir), 'utf8')); return { hwAccel: o.hwAccel !== false }; } catch (e) { return { hwAccel: true }; }
}
function write(dir, obj) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(dir), JSON.stringify({ hwAccel: obj.hwAccel !== false }, null, 2));
}
// Borra la configuración (tema, plantillas, scripts, dibujos, ventanas…), lo descargado y los ajustes de servicio.
function factoryReset({ dir, store, core, restart }) {
  store.reset();
  core.resetData({ restart: !!restart });
  try { fs.unlinkSync(file(dir)); } catch (e) { /* ok */ }
}
module.exports = { read, write, factoryReset };

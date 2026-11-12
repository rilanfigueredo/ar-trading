// Aviso de actualizaciones (v0.25.6). Revisa GitHub al abrir y cada 6 horas; el aviso se dibuja dentro del programa.
// Nunca descarga ni reinstala solo: el usuario decide cada paso. Sin internet no hace nada ni molesta.
'use strict';
const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

let estado = { fase: 'nada' };   // nada | disponible | descargando | lista | error
let autoUpdater = null;
let getWinFn = () => null;

function limpiarNotas(n) {
  if (Array.isArray(n)) n = n.map((x) => (x && x.note) || '').join('\n');
  return String(n || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1500);
}
function emitir(patch) {
  estado = Object.assign({}, estado, patch, { actual: app.getVersion() });
  const w = getWinFn();
  if (w && !w.isDestroyed()) { try { w.webContents.send('window:updateState', estado); } catch (e) { /* ok */ } }
}
// Copia pequeña de tu configuración antes de instalar (no copia los datos históricos, que no se tocan).
function copiaConfig() {
  try {
    const ud = app.getPath('userData'); const dst = path.join(ud, 'copia-antes-de-actualizar');
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(ud)) {
      const p = path.join(ud, f);
      if (/\.json$/i.test(f) && fs.statSync(p).isFile() && fs.statSync(p).size < 5e6) fs.copyFileSync(p, path.join(dst, f));
    }
    const dd = path.join(ud, 'data');
    if (fs.existsSync(dd)) for (const f of fs.readdirSync(dd)) { const p = path.join(dd, f); if (/^(config|win-.*)\.json$/i.test(f) && fs.statSync(p).isFile()) fs.copyFileSync(p, path.join(dst, f)); }
  } catch (e) { /* si falla la copia no impide actualizar */ }
}

function start(getWin) {
  getWinFn = getWin;
  ipcMain.handle('window:updateGet', () => Object.assign({}, estado, { actual: app.getVersion() }));
  if (!app.isPackaged) return;                       // solo en el programa instalado
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return; }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;          // solo se instala si el usuario pulsa «Reiniciar e instalar»
  let busy = false;

  autoUpdater.on('update-available', (info) => { busy = false; if (estado.fase !== 'descargando' && estado.fase !== 'lista') emitir({ fase: 'disponible', version: info.version, notas: limpiarNotas(info.releaseNotes), pct: 0 }); });
  autoUpdater.on('update-not-available', () => { busy = false; });
  autoUpdater.on('download-progress', (p) => emitir({ fase: 'descargando', pct: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => emitir({ fase: 'lista', version: info.version, pct: 100 }));
  autoUpdater.on('error', (e) => { busy = false; if (estado.fase === 'descargando') emitir({ fase: 'error', error: 'No se pudo descargar. Revisa tu conexión e inténtalo de nuevo.' }); });

  ipcMain.handle('window:updateDownload', () => { if (!autoUpdater || estado.fase === 'descargando') return; emitir({ fase: 'descargando', pct: 0 }); autoUpdater.downloadUpdate().catch(() => { /* lo avisa el evento error */ }); });
  ipcMain.handle('window:updateInstall', () => { if (estado.fase !== 'lista') return; copiaConfig(); autoUpdater.quitAndInstall(false, true); });

  const check = () => { if (busy || estado.fase === 'descargando' || estado.fase === 'lista') return; busy = true; autoUpdater.checkForUpdates().catch(() => { busy = false; }); };
  ipcMain.handle('window:updateCheck', () => { check(); });
  setTimeout(check, 4000);                           // al abrir (sin frenar el arranque)
  setInterval(check, 6 * 3600 * 1000);
}
module.exports = { start, limpiarNotas };

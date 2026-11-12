// Avisa al abrir el programa si hay una versión nueva (se publica en GitHub) y la instala si el usuario acepta.
'use strict';
const { app, dialog } = require('electron');

function start(getWin) {
  if (!app.isPackaged) return;                       // solo en el programa instalado
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return; }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  let busy = false;
  const box = (opts) => dialog.showMessageBox(getWin() || undefined, Object.assign({ type: 'info', title: 'Ar_Trading', noLink: true }, opts));

  autoUpdater.on('update-available', async (info) => {
    const r = await box({
      message: `Hay una actualización: versión ${info.version}`,
      detail: `Tienes la ${app.getVersion()}. ¿Quieres descargarla ahora? Se instala al reiniciar el programa.`,
      buttons: ['Descargar ahora', 'Más tarde'], defaultId: 0, cancelId: 1,
    });
    if (r.response === 0) autoUpdater.downloadUpdate().catch((e) => box({ type: 'error', message: 'No se pudo descargar la actualización.', detail: String(e && e.message || e) }));
    else busy = false;
  });
  autoUpdater.on('update-not-available', () => { busy = false; });
  autoUpdater.on('update-downloaded', async (info) => {
    const r = await box({
      message: `La versión ${info.version} está lista`,
      detail: 'Reinicia el programa para terminar la actualización.',
      buttons: ['Reiniciar ahora', 'Más tarde'], defaultId: 0, cancelId: 1,
    });
    if (r.response === 0) autoUpdater.quitAndInstall(); else busy = false;
  });
  autoUpdater.on('error', () => { busy = false; });   // sin internet u otro fallo: no molesta

  const check = () => { if (busy) return; busy = true; autoUpdater.checkForUpdates().catch(() => { busy = false; }); };
  setTimeout(check, 4000);                            // al abrir
  setInterval(check, 6 * 3600 * 1000);                // y cada 6 horas mientras esté abierto
}
module.exports = { start };

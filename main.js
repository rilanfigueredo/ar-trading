'use strict';
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const core = require('./src/core');
const Store = require('./src/store');

// v0.22: UNA sola ventana con pestañas (como un navegador). Cada pestaña (w1…w10) guarda su propia configuración;
// lo compartido (tema, plantillas, scripts…) vive aparte. Cambiar de pestaña recarga la página con la otra configuración.
let store = null;
let win = null;

ipcMain.handle('klines', async (_e, p) => core.klines(p));
ipcMain.handle('aggTrades', async (_e, p) => core.aggTrades(p));
ipcMain.handle('liqMap', async (_e, p) => core.liqMap(p));
ipcMain.handle('tradeStatus', async () => core.tradeStatus());
ipcMain.handle('testConnection', async () => core.testConnection());
ipcMain.handle('symbols', async (_e, p) => core.symbols(p));
ipcMain.handle('tickers', async (_e, p) => core.tickers(p));

ipcMain.handle('config:get', async (_e, id) => store.getConfig(id || 'w1'));
ipcMain.handle('config:set', async (_e, id, cfg) => ({ changed: store.setConfig(id || 'w1', cfg).changed }));
ipcMain.on('config:setSync', (e, id, cfg) => { try { store.setConfig(id || 'w1', cfg); } catch (err) { /* ok */ } e.returnValue = true; });
ipcMain.on('window:activeSync', (e) => { try { e.returnValue = store.getActive(); } catch (err) { e.returnValue = 'w1'; } });

ipcMain.handle('window:overlay', async (_e, color, symbolColor) => {
  try { if (win && !win.isDestroyed() && win.setTitleBarOverlay && process.platform === 'win32') win.setTitleBarOverlay({ color, symbolColor, height: 34 }); } catch (err) { /* ok */ }
  return true;
});
ipcMain.handle('window:tabs', async () => store.tabs());
ipcMain.handle('window:setActive', async (_e, id) => { try { return store.setActive(id); } catch (err) { return false; } });
ipcMain.handle('window:open', async () => {
  const id = store.newWindowId();
  if (!id) return { ok: false, error: `Máximo ${Store.MAX_WINDOWS} pestañas. Cierra alguna.` };
  store.addWindow(id);
  return { ok: true, id };
});
ipcMain.handle('window:close', async (_e, id) => {
  if (store.listWindows().length <= 1) return { ok: false, error: 'No se puede cerrar la última pestaña.' };
  store.removeWindow(id);
  return { ok: true };
});

function createWindow() {
  const b = store.getMainBounds();
  const opts = {
    width: 1440, height: 860, minWidth: 900, minHeight: 560,
    backgroundColor: '#0a102a',
    title: 'Ar_Trading',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  // Windows: sin barra de título del sistema (ni icono ni nombre); los botones minimizar/maximizar/cerrar se dibujan sobre la barra de pestañas.
  if (process.platform === 'win32') Object.assign(opts, { titleBarStyle: 'hidden', titleBarOverlay: { color: '#0a102a', symbolColor: '#d1d4dc', height: 34 } });
  if (b && Number.isFinite(b.width) && Number.isFinite(b.height)) {
    Object.assign(opts, { width: b.width, height: b.height });
    if (Number.isFinite(b.x) && Number.isFinite(b.y)) Object.assign(opts, { x: b.x, y: b.y });
  }
  win = new BrowserWindow(opts);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { w: store.getActive() } });
  // F12 abre las herramientas de desarrollo, F5 recarga.
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') win.webContents.toggleDevTools();
    if (input.key === 'F5') win.webContents.reload();
  });
  let t = null;
  const keepBounds = () => {
    clearTimeout(t);
    t = setTimeout(() => { try { if (win && !win.isDestroyed() && !win.isMaximized() && !win.isMinimized()) store.setMainBounds(win.getBounds()); } catch (e) { /* ok */ } }, 500);
  };
  win.on('resize', keepBounds); win.on('move', keepBounds);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  core.setDataDir(app.getPath('userData'));
  store = Store.create(app.getPath('userData'));
  Menu.setApplicationMenu(null);
  core.liqStart();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { core.shutdown(); });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

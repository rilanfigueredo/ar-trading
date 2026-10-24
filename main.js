'use strict';
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const core = require('./src/core');
const Store = require('./src/store');

// v0.22: varias ventanas. Cada una (w1…w10) guarda su propia configuración; lo compartido (tema, plantillas, scripts…) se avisa a las demás.
let store = null;
const wins = new Map();        // id -> BrowserWindow
const removed = new Set();     // ventanas cerradas a propósito (no se vuelven a guardar al descargar su página)
let quitting = false;

ipcMain.handle('klines', async (_e, p) => core.klines(p));
ipcMain.handle('aggTrades', async (_e, p) => core.aggTrades(p));
ipcMain.handle('tradeStatus', async () => core.tradeStatus());
ipcMain.handle('testConnection', async () => core.testConnection());
ipcMain.handle('symbols', async (_e, p) => core.symbols(p));
ipcMain.handle('tickers', async (_e, p) => core.tickers(p));

function saveFrom(id, cfg) {
  if (removed.has(id)) return { changed: {} };
  const r = store.setConfig(id, cfg);
  if (Object.keys(r.changed).length) {
    wins.forEach((w, other) => {
      if (other === id || w.isDestroyed()) return;
      store.markShared(other, r.changed);
      w.webContents.send('shared:update', r.changed);
    });
  }
  return { changed: r.changed };
}
ipcMain.handle('config:get', async (_e, id) => store.getConfig(id || 'w1'));
ipcMain.handle('config:set', async (_e, id, cfg) => saveFrom(id || 'w1', cfg));
ipcMain.on('config:setSync', (e, id, cfg) => { try { saveFrom(id || 'w1', cfg); } catch (err) { /* ok */ } e.returnValue = true; });

const byNumber = (a, b) => Number(a.slice(1)) - Number(b.slice(1));
ipcMain.handle('window:open', async () => {
  const id = wins.size >= Store.MAX_WINDOWS ? null : store.newWindowId();
  if (!id) return { ok: false, error: `Máximo ${Store.MAX_WINDOWS} ventanas abiertas a la vez.` };
  store.addWindow(id);
  createWindow(id, null);
  return { ok: true, id };
});
ipcMain.handle('window:list', async () => [...wins.keys()].sort(byNumber));
ipcMain.handle('window:focus', async (_e, id) => {
  const w = wins.get(id);
  if (!w || w.isDestroyed()) return false;
  if (w.isMinimized()) w.restore();
  w.focus();
  return true;
});
ipcMain.handle('window:close', async (_e, id) => { const w = wins.get(id); if (w && !w.isDestroyed()) w.close(); return true; });

function createWindow(id, bounds) {
  removed.delete(id);
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
  if (bounds && Number.isFinite(bounds.width) && Number.isFinite(bounds.height)) {
    Object.assign(opts, { width: bounds.width, height: bounds.height });
    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) Object.assign(opts, { x: bounds.x, y: bounds.y });
  } else if (wins.size) {
    // ventana nueva: misma medida que la última y un poco corrida para que se vea que hay otra
    const last = [...wins.values()].filter((w) => !w.isDestroyed()).pop();
    if (last) { const b = last.getBounds(); Object.assign(opts, { x: b.x + 32, y: b.y + 32, width: b.width, height: b.height }); }
  }
  const win = new BrowserWindow(opts);
  wins.set(id, win);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { w: id } });
  // F12 abre las herramientas de desarrollo, F5 recarga.
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') win.webContents.toggleDevTools();
    if (input.key === 'F5') win.webContents.reload();
  });
  let t = null;
  const keepBounds = () => {
    clearTimeout(t);
    t = setTimeout(() => { try { if (!win.isDestroyed() && !win.isMaximized() && !win.isMinimized() && !removed.has(id)) store.setBounds(id, win.getBounds()); } catch (e) { /* ok */ } }, 500);
  };
  win.on('resize', keepBounds); win.on('move', keepBounds);
  // Cerrar una ventana habiendo otras = se olvida. Al cerrar el programa (o la última ventana) quedan guardadas y vuelven al abrirlo.
  win.on('close', () => {
    if (!quitting && wins.size > 1) { removed.add(id); try { store.removeWindow(id); } catch (e) { /* ok */ } }
  });
  win.on('closed', () => { wins.delete(id); });
  return win;
}

app.whenReady().then(() => {
  core.setDataDir(app.getPath('userData'));
  store = Store.create(app.getPath('userData'));
  Menu.setApplicationMenu(null);
  store.listWindows().forEach((w) => createWindow(w.id, w.bounds));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow('w1', null);
  });
});

app.on('before-quit', () => { quitting = true; core.shutdown(); });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

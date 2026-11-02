'use strict';
const { app, BrowserWindow, ipcMain, Menu, session, dialog, shell, safeStorage, net } = require('electron');
const path = require('path');
const core = require('./src/core');
const Store = require('./src/store');
const Service = require('./src/service');
const Autostart = require('./src/autostart');
const Puente = require('./src/funciones/puente');

// v0.23.3: la aceleración por hardware se decide ANTES de arrancar (Electron no deja cambiarla después).
const hwAtStart = Service.read(app.getPath('userData')).hwAccel;
if (!hwAtStart) app.disableHardwareAcceleration();

// v0.22: UNA sola ventana con pestañas (como un navegador). Cada pestaña (w1…w10) guarda su propia configuración;
// lo compartido (tema, plantillas, scripts…) vive aparte. Cambiar de pestaña recarga la página con la otra configuración.
let store = null;
let win = null;
let puente = null;

// v0.24: funciones de la pantalla de tarjetas. Un canal por mensaje, con el prefijo de cada función (noticias:…); toda la red sale de aquí.
function registrarFunciones() {
  const netFetch = (u, o) => (net && typeof net.fetch === 'function' ? net.fetch(u, o) : fetch(u, o));
  puente = Puente.crearPuente({
    datosBase: app.getPath('userData'), appData: app.getPath('appData'), fetch: netFetch, ahora: () => Date.now(),
    cifrador: { disponible: () => safeStorage.isEncryptionAvailable(), cifrar: (s) => safeStorage.encryptString(s), descifrar: (b) => safeStorage.decryptString(b) },
    abrirCarpeta: (ruta) => shell.openPath(ruta),
  });
  puente.canales().forEach((canal) => ipcMain.handle(canal, (_e, p) => puente.invocar(canal, p && p.args, p && p.inst)));
}

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

// ----- Servicio (v0.23.3): aceleración, caché y reseteo de fábrica -----
const relaunch = () => setTimeout(() => { app.relaunch(); app.exit(0); }, 300);
ipcMain.handle('service:get', async () => {
  const hw = Service.read(app.getPath('userData')).hwAccel;
  return { desktop: true, hwAccel: hw, needsRestart: hw !== hwAtStart, version: app.getVersion() };
});
ipcMain.handle('service:setHw', async (_e, on) => {
  try { Service.write(app.getPath('userData'), { hwAccel: !!on }); return { ok: true, needsRestart: !!on !== hwAtStart }; } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('service:relaunch', async () => { relaunch(); return { ok: true }; });
ipcMain.handle('service:clearCache', async () => {
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({ storages: ['indexdb', 'cachestorage', 'shadercache', 'serviceworkers'] });
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('service:factoryReset', async () => {
  try {
    Service.factoryReset({ dir: app.getPath('userData'), store, core, restart: false });
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    relaunch();
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ----- Datos propios (v0.23.5) -----
const dataBase = () => Service.resolveDataDir(app.getPath('userData')).dir;
ipcMain.handle('data:status', async () => {
  const st = await core.dataStatus();
  const sv = Service.read(app.getPath('userData'));
  return Object.assign(st, { desktop: true, dataDir: sv.dataDir, defaultDir: app.getPath('userData'), auto: { can: process.platform === 'win32', enabled: Autostart.isEnabled() } });
});
// v0.23.6: otros activos y servicio 24/7. El servicio es servicio.js ejecutado con el propio motor de la app (ELECTRON_RUN_AS_NODE).
ipcMain.handle('data:setAssets', async (_e, list) => {
  try { Service.write(app.getPath('userData'), { assets: Array.isArray(list) ? list : [] }); core.setAssets(Service.read(app.getPath('userData')).assets); core.restartLiq(); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
});
const svcOpt = () => ({ exe: process.execPath, servicio: path.join(__dirname, 'servicio.js'), userData: app.getPath('userData'), electronAsNode: true });
ipcMain.handle('data:svcEnable', async () => {
  try { Autostart.enable(svcOpt()); Autostart.launchNow(svcOpt()); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('data:svcDisable', async () => {
  try { const stopped = await core.stopService(); Autostart.disable(); return { ok: true, stopped }; } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('data:openFolder', async () => { const e = await shell.openPath(dataBase()); return { ok: !e, error: e }; });
ipcMain.handle('data:backup', async () => {
  try {
    const r = await dialog.showOpenDialog(win, { title: 'Elige dónde guardar la copia de seguridad', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    core.flushData();                                        // se guarda lo pendiente antes de copiar
    const out = await Service.backup(dataBase(), r.filePaths[0]);
    return { ok: true, path: out.path, bytes: out.bytes };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('data:setDir', async () => {
  try {
    const r = await dialog.showOpenDialog(win, { title: 'Elige la carpeta para tus datos históricos (ej. un disco externo)', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const dest = r.filePaths[0];
    if (dest === dataBase()) return { ok: false, error: 'Esa ya es la carpeta de datos actual.' };
    core.shutdown();                                         // se guarda lo pendiente y se paran las descargas mientras se copia
    const bytes = await Service.copyData(dataBase(), dest);
    Service.write(app.getPath('userData'), { dataDir: dest });
    return { ok: true, path: dest, bytes, needsRestart: true };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('data:resetDir', async () => { try { Service.write(app.getPath('userData'), { dataDir: '' }); return { ok: true, needsRestart: true }; } catch (err) { return { ok: false, error: err.message }; } });

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
  // Datos históricos propios: carpeta elegida por el usuario (ej. disco externo) o la de siempre
  const dd = Service.resolveDataDir(app.getPath('userData'));
  core.setDataDir(dd.dir); core.setDataNote({ dir: dd.dir, wanted: dd.wanted, error: dd.error });
  core.setRole('app'); core.setAssets(Service.read(app.getPath('userData')).assets);
  store = Store.create(app.getPath('userData'));
  Menu.setApplicationMenu(null);
  try { registrarFunciones(); } catch (e) { console.error('Funciones:', e.message); }   // un fallo aquí no impide abrir los gráficos
  core.liqStart();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { core.shutdown(); try { if (puente) puente.cerrarTodo(); } catch (e) { /* ok */ } });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

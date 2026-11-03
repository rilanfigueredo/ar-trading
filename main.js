'use strict';
const { app, BrowserWindow, ipcMain, Menu, session, dialog, shell, safeStorage, net, Notification } = require('electron');
const path = require('path');
const core = require('./src/core');
const Store = require('./src/store');
const Service = require('./src/service');
const Autostart = require('./src/autostart');
const Puente = require('./src/funciones/puente');
const Escritorio = require('./src/escritorio');          // v0.26: respaldo, actualizaciones y acceso desde el móvil

// v0.23.3: la aceleración por hardware se decide ANTES de arrancar (Electron no deja cambiarla después).
// v0.26.1: registro de problemas y modo seguro. Si la vez anterior el programa no llegó a abrir bien, arranca sin aceleración de gráficos
// y sin el guardado de liquidaciones en segundo plano (ver src/diagnostico.js). Todo esto es a prueba de fallos: nunca impide abrir.
const Diag = require('./src/diagnostico').crear({ dir: app.getPath('userData') });
let modoSeguro = { seguro: false, nuevo: false, motivo: '' };
try {
  modoSeguro = Diag.arrancar({ version: app.getVersion(), hwAccelActual: Service.read(app.getPath('userData')).hwAccel });
  if (modoSeguro.seguro && Service.read(app.getPath('userData')).hwAccel) Service.write(app.getPath('userData'), { hwAccel: false });
} catch (e) { /* ok */ }
const hwAtStart = Service.read(app.getPath('userData')).hwAccel;
if (!hwAtStart) app.disableHardwareAcceleration();

// v0.22: UNA sola ventana con pestañas (como un navegador). Cada pestaña (w1…w10) guarda su propia configuración;
// lo compartido (tema, plantillas, scripts…) vive aparte. Cambiar de pestaña recarga la página con la otra configuración.
let store = null;
let win = null;
let puente = null;
let extra = null;

// v0.24: funciones de la pantalla de tarjetas. Un canal por mensaje, con el prefijo de cada función (noticias:…); toda la red sale de aquí.
function registrarFunciones() {
  const netFetch = (u, o) => (net && typeof net.fetch === 'function' ? net.fetch(u, o) : fetch(u, o));
  puente = Puente.crearPuente({
    datosBase: app.getPath('userData'), appData: app.getPath('appData'), fetch: netFetch, ahora: () => Date.now(),
    cifrador: { disponible: () => safeStorage.isEncryptionAvailable(), cifrar: (s) => safeStorage.encryptString(s), descifrar: (b) => safeStorage.decryptString(b) },
    abrirCarpeta: (ruta) => shell.openPath(ruta),
    // v0.25: avisos de Windows (los usa el monitor de blockchain). Un aviso que falle no debe tumbar nada.
    notificar: (lista) => { for (const a of lista || []) { try { if (Notification.isSupported()) new Notification({ title: String(a.title), body: String(a.body) }).show(); } catch (e) { /* sin aviso */ } } },
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
ipcMain.handle('config:set', async (_e, id, cfg) => (extra && extra.estado.restaurando ? { changed: {} } : { changed: store.setConfig(id || 'w1', cfg).changed }));
ipcMain.on('config:setSync', (e, id, cfg) => { try { if (!(extra && extra.estado.restaurando)) store.setConfig(id || 'w1', cfg); } catch (err) { /* ok */ } e.returnValue = true; });
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
    try { const sv = Service.read(app.getPath('userData')); require('./src/respaldo').hacer({ userData: app.getPath('userData'), destino: sv.respaldoDir || path.join(app.getPath('documents'), 'Ar_Trading_Respaldo'), origen: 'previo', appVersion: app.getVersion() }); } catch (e) { /* sin respaldo previo: se sigue */ }
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
  if (process.platform === 'win32') app.setAppUserModelId('com.artrading.app');   // v0.26: los avisos de Windows salen a nombre de Ar_Trading
  let vig = null;
  try { Diag.cabecera({ app, version: app.getVersion() }); vig = Diag.vigilar({ app, getWin: () => win }); } catch (e) { /* ok */ }
  // Datos históricos propios: carpeta elegida por el usuario (ej. disco externo) o la de siempre
  const dd = Service.resolveDataDir(app.getPath('userData'));
  core.setDataDir(dd.dir); core.setDataNote({ dir: dd.dir, wanted: dd.wanted, error: dd.error });
  core.setRole('app'); core.setAssets(Service.read(app.getPath('userData')).assets);
  store = Store.create(app.getPath('userData'));
  Menu.setApplicationMenu(null);
  try { registrarFunciones(); } catch (e) { Diag.log('Funciones: ' + e.message); }   // un fallo aquí no impide abrir los gráficos
  try {
    extra = Escritorio.registrar({ app, ipcMain, shell, dialog, Notification, net, getWin: () => win, store, core, puente, relanzar: () => { try { core.shutdown(); } catch (e) { /* ok */ } relaunch(); } });
  } catch (e) { Diag.log('Escritorio: ' + e.message); }   // respaldo/actualizaciones/móvil: si fallan, el resto sigue
  createWindow();
  try { if (vig) vig.ventana(win); } catch (e) { /* ok */ }
  // v0.26.1: el guardado de liquidaciones en segundo plano (WebSockets a 3 casas) arranca DESPUÉS de que la pantalla ya está abierta,
  // para no competir con la carga inicial. En modo seguro no arranca.
  win.webContents.once('did-finish-load', () => { setTimeout(() => { try { if (!modoSeguro.seguro) core.liqStart(); else Diag.log('Modo seguro: no se inicia el guardado de liquidaciones'); } catch (e) { Diag.log('liqStart: ' + e.message); } }, 4000); });
  if (modoSeguro.seguro) win.webContents.once('did-finish-load', () => setTimeout(() => { try {
    dialog.showMessageBox(win, { type: 'warning', title: 'Ar_Trading en modo seguro', buttons: ['Entendido'], message: 'Ar_Trading arrancó en MODO SEGURO',
      detail: (modoSeguro.nuevo ? modoSeguro.motivo + '\n\n' : '') + 'Se desactivó la aceleración de gráficos y el guardado de liquidaciones en segundo plano, para que abra sin problemas.\n\nSi así funciona bien, déjalo. Para volver al modo normal: Ajustes > Programa > «Volver al modo normal».\n\nSe guardó un registro de lo ocurrido en: ' + Diag.logF });
  } catch (e) { /* ok */ } }, 1500));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// v0.26.1: registro de problemas, modo seguro y consumo (Ajustes > Programa)
ipcMain.handle('diag:get', async () => Object.assign(Diag.estado(), Diag.rendimiento(app), { desktop: true }));
ipcMain.handle('diag:abrir', async () => { try { shell.showItemInFolder(Diag.logF); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('diag:normal', async () => {
  try { const r = Diag.salirDeSeguro(); Service.write(app.getPath('userData'), { hwAccel: r.hwAccel }); relaunch(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
});

app.on('before-quit', () => { try { Diag.estable(); Diag.log('Cierre normal'); } catch (e) { /* ok */ } try { if (extra) extra.alCerrar(); } catch (e) { /* ok */ } core.shutdown(); try { if (puente) puente.cerrarTodo(); } catch (e) { /* ok */ } });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

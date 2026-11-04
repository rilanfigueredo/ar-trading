// Funciones de la app de escritorio añadidas en la v0.26: respaldo de la configuración, aviso/instalación de versiones nuevas y acceso desde el móvil.
// main.js solo llama a registrar(); aquí vive todo lo demás para no engordar main.js. Cada parte es independiente: si una falla, las otras siguen.
'use strict';
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Service = require('./service');
const Respaldo = require('./respaldo');
const Actualizar = require('./actualizar');
const Web = require('./web');

// ctx: { app, ipcMain, shell, dialog, Notification, net, getWin(), store, core, puente, relanzar() }
function registrar(ctx) {
  const { app, ipcMain, shell, dialog, Notification, net, store, core, puente } = ctx;
  const seguro = !!ctx.seguro, dlog = typeof ctx.log === 'function' ? ctx.log : () => {};   // v0.26.3: en modo seguro no corren solos ni las actualizaciones ni el respaldo, y cada paso queda en el registro
  const userData = () => app.getPath('userData');
  const cfg = () => Service.read(userData());
  const fetchFn = (u, o) => (net && typeof net.fetch === 'function' ? net.fetch(u, o) : fetch(u, o));
  const estado = { restaurando: false };

  // ================= RESPALDO =================
  const porDefecto = () => path.join(app.getPath('documents'), 'Ar_Trading_Respaldo');
  const destino = () => cfg().respaldoDir || porDefecto();
  let ultimoError = '', ultimoAuto = '';
  const resumen = (x) => ({ nombre: x.nombre, ruta: x.ruta, fecha: x.fecha, origen: x.origen, appVersion: x.appVersion, archivos: x.archivos, bytes: x.bytes });
  function respaldoAuto() {
    if (!cfg().respaldoAuto || estado.restaurando) return;
    try {
      dlog('Respaldo automático: empieza');
      const r = Respaldo.auto({ userData: userData(), destino: destino(), appVersion: app.getVersion() });
      if (!r.omitido) ultimoAuto = r.fecha;
      ultimoError = '';
      dlog('Respaldo automático: terminó');
    } catch (e) { ultimoError = e.message; dlog('Respaldo automático falló: ' + e.message); }
  }
  const t1 = setTimeout(() => { if (seguro) dlog('Modo seguro: sin respaldo automático al abrir'); else respaldoAuto(); }, 20000);                      // al abrir (ya con todo cargado)
  const t2 = setInterval(respaldoAuto, 3 * 60 * 60 * 1000);       // y cada 3 horas, solo si algo cambió
  [t1, t2].forEach((t) => t.unref && t.unref());

  ipcMain.handle('respaldo:get', async () => {
    const c = cfg(), d = destino();
    return { destino: d, porDefecto: !c.respaldoDir, auto: c.respaldoAuto, lista: Respaldo.listar(d).slice(0, 40).map(resumen), error: ultimoError, ultimoAuto };
  });
  ipcMain.handle('respaldo:hacer', async () => {
    try { const r = Respaldo.hacer({ userData: userData(), destino: destino(), origen: 'manual', appVersion: app.getVersion() }); ultimoError = ''; return { ok: true, ruta: r.ruta, archivos: r.archivos, bytes: r.bytes }; }
    catch (e) { ultimoError = e.message; return { ok: false, error: e.message }; }
  });
  ipcMain.handle('respaldo:elegir', async () => {
    try {
      const r = await dialog.showOpenDialog(ctx.getWin(), { title: 'Elige la carpeta de los respaldos (puede ser OneDrive, Google Drive o un disco externo)', properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
      Respaldo.hacer({ userData: userData(), destino: r.filePaths[0], origen: 'manual', appVersion: app.getVersion() });   // prueba real de escritura y deja un respaldo ahí
      Service.write(userData(), { respaldoDir: r.filePaths[0] });
      return { ok: true, destino: r.filePaths[0] };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('respaldo:usarDefecto', async () => { Service.write(userData(), { respaldoDir: '' }); return { ok: true, destino: porDefecto() }; });
  ipcMain.handle('respaldo:setAuto', async (_e, on) => { Service.write(userData(), { respaldoAuto: !!on }); return { ok: true }; });
  ipcMain.handle('respaldo:abrir', async () => { try { require('fs').mkdirSync(destino(), { recursive: true }); } catch (e) { /* ok */ } const e = await shell.openPath(destino()); return { ok: !e, error: e }; });
  ipcMain.handle('respaldo:restaurar', async (_e, ruta) => {
    try {
      const x = Respaldo.listar(destino()).find((i) => i.ruta === ruta);
      if (!x) return { ok: false, error: 'Ese respaldo ya no está en la carpeta de respaldos.' };
      estado.restaurando = true;                                    // main.js ignora las escrituras de configuración mientras tanto
      const r = Respaldo.restaurar({ userData: userData(), ruta: x.ruta, destino: destino(), appVersion: app.getVersion() });
      ctx.relanzar();
      return { ok: true, restaurados: r.restaurados, previo: r.previo };
    } catch (e) { estado.restaurando = false; return { ok: false, error: e.message }; }
  });

  // ================= ACTUALIZACIONES =================
  // v0.26.1: electron-updater se carga SOLO cuando hace falta (a los 10 s de abrir o al buscar a mano), no en el arranque.
  let updater = null, updaterListo = false;
  const up = { fase: 'ninguna', actual: app.getVersion(), version: '', notas: '', pct: 0, error: '', url: '', instalable: app.isPackaged, manual: false };
  let avisada = '';
  const enviar = () => { try { const w = ctx.getWin(); if (w && !w.isDestroyed()) w.webContents.send('update:state', up); } catch (e) { /* ok */ } };
  function hayNueva(version, notas, url) {
    Object.assign(up, { fase: 'disponible', version, notas: String(notas || '').slice(0, 4000), url: url || up.url, error: '', pct: 0 });
    if (avisada !== version) {
      avisada = version;
      try {
        if (Notification.isSupported()) { const n = new Notification({ title: 'Ar_Trading: hay una versión nueva', body: `La ${version} está lista. Abre Ar_Trading y pulsa «Actualizar».` }); n.on('click', () => { const w = ctx.getWin(); if (w) { if (w.isMinimized()) w.restore(); w.focus(); } }); n.show(); }
      } catch (e) { /* sin aviso del sistema: queda el cartel dentro del programa */ }
    }
    enviar();
  }
  function getUpdater() {
    if (updaterListo) return updater;
    updaterListo = true;
    if (!app.isPackaged) return null;
    try { updater = require('electron-updater').autoUpdater; updater.autoDownload = false; updater.autoInstallOnAppQuit = false; updater.logger = null; } catch (e) { updater = null; up.instalable = false; return null; }
    updater.on('update-available', (i) => hayNueva(i.version, typeof i.releaseNotes === 'string' ? i.releaseNotes : '', ''));
    updater.on('update-not-available', () => { Object.assign(up, { fase: 'alDia', error: '' }); enviar(); });
    updater.on('download-progress', (p) => { Object.assign(up, { fase: 'descargando', pct: Math.round(p.percent || 0) }); enviar(); });
    updater.on('update-downloaded', () => { Object.assign(up, { fase: 'listo', pct: 100 }); enviar(); });
    updater.on('error', (e) => { Object.assign(up, { fase: 'error', error: 'No se pudo actualizar: ' + ((e && e.message) || e).toString().split('\n')[0] }); enviar(); });
    return updater;
  }
  async function buscar(manual) {
    if (up.fase === 'descargando' || up.fase === 'listo') return up;
    up.manual = !!manual; up.fase = 'buscando'; up.error = ''; enviar();
    if (getUpdater()) { try { await updater.checkForUpdates(); } catch (e) { Object.assign(up, { fase: 'error', error: 'No se pudo consultar: ' + e.message }); enviar(); } return up; }
    const r = await Actualizar.estado({ actual: app.getVersion(), fetchFn });         // sin instalador automático (programa sin instalar): solo avisa y abre la descarga
    if (r.error && !r.ultima) Object.assign(up, { fase: 'error', error: r.error }); else if (r.hayNueva) hayNueva(r.ultima, r.notas, r.url); else Object.assign(up, { fase: 'alDia', error: '' });
    enviar(); return up;
  }
  ipcMain.handle('update:get', async () => up);
  ipcMain.handle('update:check', async () => buscar(true));
  ipcMain.handle('update:install', async () => {
    try {
      if (!getUpdater()) { if (up.url) await shell.openExternal(up.url); return { ok: true, abierto: true }; }
      if (up.fase === 'disponible') { up.fase = 'descargando'; up.pct = 0; enviar(); await updater.downloadUpdate(); return { ok: true }; }
      if (up.fase === 'listo') {
        try { Respaldo.hacer({ userData: userData(), destino: destino(), origen: 'previo', appVersion: app.getVersion() }); } catch (e) { /* un respaldo fallido no impide actualizar */ }
        setImmediate(() => updater.quitAndInstall(false, true)); return { ok: true };
      }
      return { ok: false, error: 'No hay nada que instalar.' };
    } catch (e) { Object.assign(up, { fase: 'error', error: e.message }); enviar(); return { ok: false, error: e.message }; }
  });
  const t3 = setTimeout(() => { if (seguro) { dlog('Modo seguro: sin búsqueda automática de actualizaciones'); return; } dlog('Actualizaciones: empieza la búsqueda'); buscar(false).then(() => dlog('Actualizaciones: terminó la búsqueda'), (e) => dlog('Actualizaciones falló: ' + e.message)); }, 10000), t4 = setInterval(() => { if (!seguro) buscar(false); }, 6 * 60 * 60 * 1000);
  [t3, t4].forEach((t) => t.unref && t.unref());
  let cacheVer = null;
  const versionWeb = async () => { if (!cacheVer || Date.now() - cacheVer.t > 3600000) cacheVer = { t: Date.now(), v: await Actualizar.estado({ actual: app.getVersion(), fetchFn }) }; return cacheVer.v; };

  // ================= ACCESO DESDE EL MÓVIL =================
  let servidor = null, errorMovil = '';
  const nuevoCodigo = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  function asegurarClaves(renovar) {
    const c = cfg();
    if (renovar || !c.movilCodigo || !c.movilSecreto) Service.write(userData(), { movilCodigo: nuevoCodigo(), movilSecreto: crypto.randomBytes(32).toString('hex') });   // cambiar el código cierra la sesión de los móviles
  }
  function direcciones(puerto) {
    const out = [];
    const ifs = os.networkInterfaces();
    for (const k of Object.keys(ifs)) for (const a of ifs[k] || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(`http://${a.address}:${puerto}`);
    return out;
  }
  function detener() { return new Promise((res) => { if (!servidor) return res(); const s = servidor; servidor = null; try { s.closeAllConnections && s.closeAllConnections(); s.close(() => res()); } catch (e) { res(); } }); }
  async function iniciar() {
    await detener(); errorMovil = '';
    asegurarClaves(false);
    const c = cfg();
    const s = Web.crear({
      core, store, puente, root: path.join(__dirname, '..', 'renderer'), data: userData(),
      auth: () => { const x = cfg(); return { codigo: x.movilCodigo, secreto: x.movilSecreto }; },
      version: versionWeb,
    });
    await new Promise((res) => {
      s.once('error', (e) => { errorMovil = e.code === 'EADDRINUSE' ? `El puerto ${c.movilPuerto} ya está en uso (¿el modo navegador está abierto?). Cambia el puerto abajo.` : 'No se pudo abrir el acceso: ' + e.message; res(); });
      s.listen(c.movilPuerto, '0.0.0.0', () => { servidor = s; res(); });
    });
    return !!servidor;
  }
  async function datosMovil() {
    const c = cfg(); const urls = c.movilActivo && servidor ? direcciones(c.movilPuerto) : [];
    let qr = '';
    if (urls[0]) { try { qr = await require('qrcode').toDataURL(urls[0], { margin: 1, width: 220 }); } catch (e) { qr = ''; } }
    return { activo: c.movilActivo, funcionando: !!servidor, puerto: c.movilPuerto, codigo: c.movilActivo ? c.movilCodigo : '', urls, qr, error: errorMovil };
  }
  ipcMain.handle('movil:get', async () => datosMovil());
  ipcMain.handle('movil:set', async (_e, on) => {
    try {
      Service.write(userData(), { movilActivo: !!on });
      if (on) { const ok = await iniciar(); if (!ok) Service.write(userData(), { movilActivo: false }); } else { await detener(); errorMovil = ''; }
      return Object.assign({ ok: true }, await datosMovil());
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('movil:codigoNuevo', async () => { try { asegurarClaves(true); return Object.assign({ ok: true }, await datosMovil()); } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('movil:puerto', async (_e, p) => {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) return { ok: false, error: 'El puerto debe ser un número entre 1024 y 65535.' };
    Service.write(userData(), { movilPuerto: n });
    if (cfg().movilActivo) { const ok = await iniciar(); if (!ok) Service.write(userData(), { movilActivo: false }); }
    return Object.assign({ ok: true }, await datosMovil());
  });
  if (cfg().movilActivo) iniciar().catch((e) => { errorMovil = e.message; });

  return {
    estado,
    // Al cerrar: un último respaldo automático (si cambió algo) y se apaga el acceso del móvil.
    alCerrar() { try { respaldoAuto(); } catch (e) { /* ok */ } try { if (servidor) servidor.close(); } catch (e) { /* ok */ } },
    respaldoAuto,
  };
}

module.exports = { registrar };

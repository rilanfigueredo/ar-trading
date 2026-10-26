// Almacén de configuración con varias ventanas (v0.22). Lo usan main.js (Electron) y server.js (modo navegador).
//
// Qué se guarda y dónde (carpeta `dir`):
//  - config.json     → lo COMPARTIDO por todas las ventanas (tema, zona horaria, plantillas, paleta, biblioteca de scripts,
//                      listas de seguimiento, temporalidades, preferencias de dibujo) y el registro de ventanas abiertas.
//  - win-<id>.json   → lo PROPIO de cada ventana (diseño de gráficos, símbolos, temporalidades, indicadores, dibujos...).
//  Una configuración anterior (v0.21 o menor, todo junto en config.json) se lee como la de la ventana "w1" sin perder nada.
// Varias ventanas pueden guardar a la vez: de lo compartido solo se escribe lo que ESA ventana cambió desde que lo leyó.
'use strict';
const fs = require('fs');
const path = require('path');

const MAX_WINDOWS = 10;
const SHARED_KEYS = ['version', 'scripts', 'theme', 'tz', 'timer', 'palette', 'templates', 'lists'];
const WINDOW_KEYS = ['layout', 'active', 'charts', 'sync', 'drawings', 'folders', 'bt', 'tfs', 'draw', 'listActive', 'max'];
// v0.22.2: temporalidades y preferencias de dibujo pasaron de compartidas a propias de cada pestaña; la pestaña 1 hereda lo que ya tenía guardado.
const MOVED_KEYS = ['tfs', 'draw', 'listActive'];
const ID_RE = /^w([1-9]|10)$/;

function create(dir) {
  const snaps = new Map();     // idVentana -> { clave compartida: JSON que esa ventana leyó o guardó por última vez }
  const sharedFile = () => path.join(dir, 'config.json');
  const winFile = (id) => path.join(dir, `win-${id}.json`);

  function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
  function writeJson(file, obj) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file);
  }
  const pick = (src, keys) => { const o = {}; keys.forEach((k) => { if (src && src[k] !== undefined) o[k] = src[k]; }); return o; };
  const checkId = (id) => { if (!ID_RE.test(String(id))) throw new Error('Ventana no válida: ' + id); return String(id); };
  const readShared = () => { const s = readJson(sharedFile()); return s && typeof s === 'object' ? s : {}; };

  // Registro de ventanas: [{ id, bounds? }]
  function listWindows() {
    const s = readShared();
    const out = [];
    (Array.isArray(s.windows) ? s.windows : []).forEach((w) => { if (w && ID_RE.test(String(w.id)) && !out.some((x) => x.id === w.id)) out.push({ id: w.id, bounds: w.bounds || null }); });
    if (!out.length) out.push({ id: 'w1', bounds: null });
    return out.slice(0, MAX_WINDOWS);
  }
  function saveWindows(list) { const s = readShared(); s.windows = list; writeJson(sharedFile(), s); }
  function addWindow(id, bounds) {
    id = checkId(id);
    const list = listWindows();
    const ex = list.find((w) => w.id === id);
    if (ex) { if (bounds) ex.bounds = bounds; } else {
      if (list.length >= MAX_WINDOWS) throw new Error(`Máximo ${MAX_WINDOWS} ventanas abiertas a la vez.`);
      list.push({ id, bounds: bounds || null });
    }
    saveWindows(list);
    return list;
  }
  function newWindowId() {
    const used = new Set(listWindows().map((w) => w.id));
    for (let k = 1; k <= MAX_WINDOWS; k++) if (!used.has('w' + k)) return 'w' + k;
    return null;
  }
  // Cierra una ventana para siempre: se borra de la lista y se olvida su configuración.
  function removeWindow(id) {
    id = checkId(id);
    saveWindows(listWindows().filter((w) => w.id !== id));
    try { fs.unlinkSync(winFile(id)); } catch (e) { /* no existía */ }
    snaps.delete(id);
  }
  function setBounds(id, bounds) {
    id = checkId(id);
    const list = listWindows();
    const w = list.find((x) => x.id === id);
    if (w) { w.bounds = bounds; saveWindows(list); }
  }

  // Configuración de una ventana = lo compartido + lo propio. Una ventana nueva no hereda los gráficos de otra.
  function getConfig(id) {
    id = checkId(id || 'w1');
    const s = readShared();
    let w = readJson(winFile(id));
    if (!w && id === 'w1') {
      const legacy = pick(s, WINDOW_KEYS);                       // configuración de la v0.21 o menor
      w = Object.keys(legacy).length ? legacy : null;
    }
    if (w && id === 'w1') MOVED_KEYS.forEach((k) => { if (w[k] === undefined && s[k] !== undefined) w[k] = s[k]; });
    const shared = pick(s, SHARED_KEYS);
    const snap = {};
    SHARED_KEYS.forEach((k) => { if (shared[k] !== undefined) snap[k] = JSON.stringify(shared[k]); });
    snaps.set(id, snap);
    if (!w && !Object.keys(shared).length) return null;
    return Object.assign({}, shared, w || {});
  }

  // Guarda la configuración de una ventana. Devuelve { changed } con lo compartido que esta ventana cambió (para avisar a las demás).
  function setConfig(id, cfg) {
    id = checkId(id || 'w1');
    if (!cfg || typeof cfg !== 'object') throw new Error('Configuración no válida');
    writeJson(winFile(id), pick(cfg, WINDOW_KEYS));
    const snap = snaps.get(id) || {};
    const changed = {};
    SHARED_KEYS.forEach((k) => {
      if (cfg[k] === undefined) return;
      const j = JSON.stringify(cfg[k]);
      if (snap[k] !== j) changed[k] = cfg[k];
    });
    const s = readShared();
    let dirty = false;
    Object.keys(changed).forEach((k) => { s[k] = changed[k]; dirty = true; });
    // los datos de gráficos de la versión anterior ya viven en win-w1.json: se quitan de config.json
    if (fs.existsSync(winFile('w1'))) WINDOW_KEYS.forEach((k) => { if (s[k] !== undefined) { delete s[k]; dirty = true; } });
    const wl = listWindows();
    if (!wl.some((w) => w.id === id) && wl.length < MAX_WINDOWS) { wl.push({ id, bounds: null }); s.windows = wl; dirty = true; }
    if (dirty) writeJson(sharedFile(), s);
    const ns = {};
    Object.keys(changed).forEach((k) => { ns[k] = JSON.stringify(changed[k]); });
    snaps.set(id, Object.assign(snap, ns));
    return { changed };
  }
  // Cuando otra ventana avisa de un cambio compartido, esta lo da por leído (así no lo vuelve a escribir encima).
  function markShared(id, patch) {
    const snap = snaps.get(id) || {};
    Object.keys(patch || {}).forEach((k) => { snap[k] = JSON.stringify(patch[k]); });
    snaps.set(id, snap);
  }

  // v0.22: pestañas. Texto corto de cada una ("BTCUSDT · 1h") y cuál estaba abierta al cerrar el programa.
  const TF_UNIT = { s: 's', m: 'm', h: 'h', d: 'D', w: 'W', M: 'M' };
  function tfLabel(tf) {
    const m = /^([smhdwM]):(\d+)$/.exec(String(tf || ''));
    if (!m) return '';
    let n = Number(m[2]), u = m[1];
    if (u === 'm' && n >= 60 && n % 60 === 0) { n /= 60; u = 'h'; }
    return n + TF_UNIT[u];
  }
  function tabs() {
    const s = readShared();
    return listWindows().map((w) => {
      let c = readJson(winFile(w.id));
      if (!c && w.id === 'w1') c = pick(s, WINDOW_KEYS);
      const ch = c && Array.isArray(c.charts) ? c.charts[Number(c.active) || 0] || c.charts[0] : null;
      return { id: w.id, label: ch ? `${ch.symbol || 'BTCUSDT'} · ${tfLabel(ch.tf)}` : 'BTCUSDT · 1h' };
    });
  }
  function getActive() {
    const ids = listWindows().map((w) => w.id), s = readShared();
    return ids.includes(s.activeWindow) ? s.activeWindow : ids[0];
  }
  function setActive(id) {
    id = checkId(id);
    if (!listWindows().some((w) => w.id === id)) return false;
    const s = readShared(); if (s.activeWindow === id) return true;
    s.activeWindow = id; writeJson(sharedFile(), s); return true;
  }
  const getMainBounds = () => readShared().mainBounds || null;
  function setMainBounds(b) { const s = readShared(); s.mainBounds = b; writeJson(sharedFile(), s); }

  return { tabs, getActive, setActive, getMainBounds, setMainBounds, tfLabel, getConfig, setConfig, markShared, listWindows, addWindow, removeWindow, newWindowId, setBounds, MAX_WINDOWS, SHARED_KEYS, WINDOW_KEYS };
}

module.exports = { create, MAX_WINDOWS, SHARED_KEYS, WINDOW_KEYS };

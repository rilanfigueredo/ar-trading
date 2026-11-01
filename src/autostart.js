// Arranque automático del servicio 24/7 en Windows (v0.23.6), SIN permisos de administrador:
// un archivo .vbs en la carpeta «Inicio» de Windows (se ejecuta al iniciar sesión, sin ventana). Activar = crearlo, desactivar = borrarlo.
// NO se pudo probar en Windows desde el entorno de desarrollo (ver CONOCIMIENTO).
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const NAME = 'Ar_Trading_servicio.vbs';
const startupDir = () => path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const vbs = (str) => '"' + String(str).replace(/"/g, '""') + '"';

// Contenido del .vbs. exe = programa que ejecuta servicio.js; electronAsNode = true si exe es Electron (la app instalada o npm start).
function script({ exe, servicio, userData, electronAsNode }) {
  const cmd = 'cmd /c ' + (electronAsNode ? 'set ELECTRON_RUN_AS_NODE=1&& ' : '') + '"' + exe + '" "' + servicio + '" --userdata "' + userData + '"';
  return ['\' Ar_Trading: servicio 24/7 (guarda liquidaciones reales aunque la app esté cerrada). Borra este archivo o usa «Desactivar» en Ajustes > Datos.',
    'Set sh = CreateObject("WScript.Shell")', 'sh.Run ' + vbs(cmd) + ', 0, False', ''].join('\r\n');
}
const filePath = (dir) => path.join(dir || startupDir(), NAME);
function isEnabled(dir) { try { return fs.existsSync(filePath(dir)); } catch (e) { return false; } }
function enable(opt) {
  if (process.platform !== 'win32' && !opt.dir) throw new Error('El arranque automático solo existe en Windows.');
  const f = filePath(opt.dir);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, script(opt));
  return f;
}
function launchNow(opt) {                                           // arranca ya, sin esperar al próximo inicio de sesión
  const f = filePath(opt.dir);
  const p = spawn('wscript.exe', ['//B', '//Nologo', f], { detached: true, stdio: 'ignore', windowsHide: true });
  p.on('error', () => {}); p.unref();
}
function disable(dir) { try { fs.unlinkSync(filePath(dir)); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
module.exports = { script, enable, disable, isEnabled, launchNow, filePath, NAME };

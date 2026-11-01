// Activar / desactivar el servicio 24/7 desde la línea de comandos (modo navegador): node tools/servicio.js on|off|estado
// Los .bat de la carpeta del programa (activar_servicio.bat, desactivar_servicio.bat) lo llaman. La app de escritorio lo hace desde Ajustes > Datos.
'use strict';
const path = require('path');
const A = require('../src/autostart');
const root = path.join(__dirname, '..');
const i = process.argv.indexOf('--userdata');
const userData = path.resolve(i > 0 ? process.argv[i + 1] : path.join(root, 'data'));
const opt = { exe: process.execPath, servicio: path.join(root, 'servicio.js'), userData, electronAsNode: false };
const cmd = process.argv[2];
try {
  if (cmd === 'on') { const f = A.enable(opt); A.launchNow(opt); console.log('Servicio ACTIVADO. Arrancará solo al iniciar sesión en Windows (y ya está arrancando).\nArchivo: ' + f + '\nDatos en: ' + userData); }
  else if (cmd === 'off') {
    const core = require('../src/core'); core.setDataDir(userData);
    core.stopService().then((stopped) => { A.disable(); console.log('Servicio DESACTIVADO' + (stopped ? ' y detenido.' : '. (No estaba en marcha.)')); });
  } else console.log('Servicio ' + (A.isEnabled() ? 'ACTIVADO (arranca con Windows)' : 'desactivado') + '. Uso: node tools/servicio.js on | off | estado');
} catch (e) { console.error('Error: ' + e.message); process.exit(1); }

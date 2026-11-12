// Pone el icono de Ar_Trading dentro del .exe (sin usar la firma de electron-builder, que pide permisos de administrador).
'use strict';
const path = require('path');
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const rcedit = require('rcedit');
  const exe = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');
  await rcedit(exe, { icon: path.join(context.packager.projectDir, 'build', 'icon.ico') });
  console.log('  • icono aplicado al .exe');
};

'use strict';
const fs = require('fs');
const path = require('path');
// Guarda archivos en una carpeta. Los secretos solo se guardan cifrados (cifrador = cifrado de Windows).
function crearAlmacen(carpeta, cifrador) {
  fs.mkdirSync(carpeta, { recursive: true });
  const ruta = (n) => path.join(carpeta, n);
  return {
    carpeta,
    existe: (n) => fs.existsSync(ruta(n)),
    leerJSON(n, defecto) {
      try { return JSON.parse(fs.readFileSync(ruta(n), 'utf8')); } catch (e) { return defecto; }
    },
    escribirJSON(n, obj) {
      const tmp = ruta(n + '.tmp');
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
      fs.renameSync(tmp, ruta(n));
    },
    guardarSecreto(n, texto) {
      if (!cifrador || !cifrador.disponible()) throw new Error('El cifrado de Windows no está disponible; la clave no se guardó.');
      fs.writeFileSync(ruta(n), cifrador.cifrar(texto).toString('base64'), 'utf8');
    },
    leerSecreto(n) {
      if (!fs.existsSync(ruta(n)) || !cifrador || !cifrador.disponible()) return null;
      try { return cifrador.descifrar(Buffer.from(fs.readFileSync(ruta(n), 'utf8'), 'base64')); } catch (e) { return null; }
    },
    hayArchivo: (n) => fs.existsSync(ruta(n)),
  };
}
module.exports = { crearAlmacen };

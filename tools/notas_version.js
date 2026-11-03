// Imprime las novedades de la versión actual (el primer bloque «NOVEDADES DE LA vX…» de LEEME.txt) para ponerlas en la publicación de GitHub.
'use strict';
const fs = require('fs'), path = require('path');
const v = require('../package.json').version;
const txt = fs.readFileSync(path.join(__dirname, '..', 'LEEME.txt'), 'utf8').replace(/\r\n/g, '\n');
const i = txt.indexOf('NOVEDADES DE LA v' + v);
if (i < 0) { console.log('Ar_Trading ' + v); process.exit(0); }
const resto = txt.slice(i), j = resto.indexOf('\nNOVEDADES DE LA v', 10);
console.log((j < 0 ? resto : resto.slice(0, j)).trim());

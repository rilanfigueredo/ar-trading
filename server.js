// Modo navegador: sirve la interfaz en http://localhost:3000 (respaldo si Electron no funciona).
'use strict';
const path = require('path');
const core = require('./src/core');
const Puente = require('./src/funciones/puente');
const DATA = process.env.AR_DATA_DIR || path.join(__dirname, 'data');   // AR_DATA_DIR: solo para pruebas
core.setDataDir(DATA);
const store = require('./src/store').create(DATA);   // v0.22: configuración por ventana + parte compartida

// v0.24: funciones. En el modo navegador no hay cifrado del sistema (las claves no se guardan) ni carpeta que abrir.
// Con TV_MOCK=1 (pruebas) la red de las funciones es simulada (test/noticias.datos.js) y el cifrado es de juguete.
const MOCK = process.env.TV_MOCK === '1';
const SIM = MOCK ? require('./test/noticias.datos') : null;
const puente = Puente.crearPuente({
  datosBase: DATA, appData: null, fetch: MOCK ? SIM.crearFetch() : (u, o) => fetch(u, o), ahora: MOCK ? () => SIM.AHORA : () => Date.now(),
  cifrador: MOCK ? { disponible: () => true, cifrar: (t) => Buffer.from(Buffer.from(t).map((b) => b ^ 0x5a)), descifrar: (b) => Buffer.from(b.map((x) => x ^ 0x5a)).toString() } : { disponible: () => false },
  abrirCarpeta: null,
});
const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, 'renderer');
// v0.26: las rutas viven en src/web.js (así la app de escritorio puede ofrecer el mismo servidor al móvil, con código de acceso).
const Actualizar = require('./src/actualizar');
const server = require('./src/web').crear({
  core, store, puente, root: ROOT, data: DATA,
  version: () => (MOCK ? Promise.resolve({ actual: require('./package.json').version, hayNueva: false, error: '' }) : Actualizar.estado({ actual: require('./package.json').version, fetchFn: (u, o) => fetch(u, o) })),
});

process.on('SIGINT', () => { core.shutdown(); process.exit(0); });
process.on('SIGTERM', () => { core.shutdown(); process.exit(0); });
core.setRole('app'); core.setAssets(require('./src/service').read(DATA).assets); core.liqStart();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Ar_Trading en modo navegador: http://localhost:${PORT}`);
});

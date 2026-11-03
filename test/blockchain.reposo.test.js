'use strict';
// v0.26.2: el monitor de blockchain solo consulta mientras su pestaña está a la vista; sin pestaña no hace NADA.
const fs = require('fs'), os = require('os'), path = require('path');
const mod = require('../src/funciones/blockchain/modulo');
const datos = require('./blockchain.datos');
let fallos = 0; const ok = (c, m) => { if (!c) { fallos++; console.log('FALLA  ' + m); } else console.log('OK  ' + m); };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcr-'));
  let reloj = Date.parse('2026-11-03T12:00:00Z'), llamadas = 0;
  const resp = datos.crear(reloj);
  const inst = mod.crear({ carpeta: dir, fetch: async (u) => { llamadas++; return resp(u); }, ahora: () => reloj });
  await new Promise((r) => setTimeout(r, 300));
  ok(llamadas === 0, 'al crear el módulo NO consulta nada (' + llamadas + ')');
  await inst.llamar('actualizar', []);
  const tras = llamadas; ok(tras > 0, 'con la pestaña a la vista sí consulta');
  reloj += 60000;                                               // pasa un minuto sin que nadie mire
  await new Promise((r) => setTimeout(r, 300));
  const antes = llamadas;
  await new Promise((r) => setTimeout(r, 1200));
  ok(llamadas === antes, 'sin pestaña a la vista no hace consultas nuevas');
  inst.cerrar(); fs.rmSync(dir, { recursive: true, force: true });
  process.exit(fallos ? 1 : 0);
})();

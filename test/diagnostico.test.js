// Pruebas del registro de problemas y del modo seguro (v0.26.1): sin Electron, con carpeta temporal.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const Diag = require('../src/diagnostico');
let pasan = 0, fallan = 0;
const ok = (c, m) => { if (c) pasan++; else { fallan++; console.log('  FALLA: ' + m); } };
const nueva = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ar-diag-'));

// 1) primer arranque: normal. Cierre bien (estable) → siguiente arranque normal.
let d = nueva(); let x = Diag.crear({ dir: d });
let r = x.arrancar({ version: '1.0.0', hwAccelActual: true }); ok(!r.seguro && !r.nuevo, 'primer arranque: modo normal');
x.estable(); r = Diag.crear({ dir: d }).arrancar({ version: '1.0.0', hwAccelActual: true }); ok(!r.seguro, 'tras un cierre bueno: modo normal');

// 2) arranque que nunca llegó a estable (se colgó y lo mataron) → el siguiente es modo seguro y recuerda la aceleración que había
d = nueva(); x = Diag.crear({ dir: d }); x.arrancar({ version: '1.0.0', hwAccelActual: true });          // sin estable()
r = Diag.crear({ dir: d }).arrancar({ version: '1.0.0', hwAccelActual: true });
ok(r.seguro && r.nuevo && /no llegó a abrir bien/.test(r.motivo) && r.hwAntes === true, 'tras un arranque sin estabilizar: modo seguro nuevo');
ok(Diag.crear({ dir: d }).estado().seguro === true, 'el estado dice modo seguro');

// 3) el modo seguro se QUEDA aunque el siguiente arranque sea bueno, hasta que el usuario lo quite
Diag.crear({ dir: d }).estable();
r = Diag.crear({ dir: d }).arrancar({ version: '1.0.0', hwAccelActual: false });
ok(r.seguro && !r.nuevo && r.hwAntes === true, 'el modo seguro persiste (y conserva la aceleración original)');
const sal = Diag.crear({ dir: d }).salirDeSeguro(); ok(sal.hwAccel === true, 'salir del modo seguro devuelve la aceleración de antes');
Diag.crear({ dir: d }).estable(); r = Diag.crear({ dir: d }).arrancar({ version: '1.0.0', hwAccelActual: true }); ok(!r.seguro, 'después de quitarlo: modo normal');

// 4) archivo de marca dañado: no rompe nada
fs.writeFileSync(path.join(d, 'arranque.json'), '{roto'); r = Diag.crear({ dir: d }).arrancar({ version: '1.0.0', hwAccelActual: true }); ok(!r.seguro, 'marca dañada: arranca normal');

// 5) registro: escribe, rota al pasar de 512 KB y tiene tope por arranque
d = nueva(); x = Diag.crear({ dir: d }); x.log('hola'); ok(/hola/.test(fs.readFileSync(path.join(d, 'registro.log'), 'utf8')), 'el registro escribe');
fs.writeFileSync(path.join(d, 'registro.log'), 'x'.repeat(600 * 1024)); x.log('después'); ok(fs.existsSync(path.join(d, 'registro.log.old')) && fs.statSync(path.join(d, 'registro.log')).size < 1000, 'el registro grande se rota');
let y = Diag.crear({ dir: nueva() }); for (let i = 0; i < 6000; i++) y.log('repetido'); ok(fs.readFileSync(y.logF, 'utf8').split('\n').length <= 4002, 'tope de líneas por arranque');

// 6) carpeta imposible: nunca lanza
const malo = Diag.crear({ dir: path.join(os.tmpdir(), 'no\0valido') }); let lanzo = false; try { malo.log('x'); malo.arrancar({ version: '1' }); malo.estable(); } catch (e) { lanzo = true; } ok(!lanzo, 'un registro que no puede escribir no lanza errores');

// 7) rendimiento con métricas simuladas
const app = { getAppMetrics: () => [{ type: 'Browser', cpu: { percentCPUUsage: 1.234 }, memory: { workingSetSize: 102400 } }, { type: 'Tab', cpu: { percentCPUUsage: 2 }, memory: { workingSetSize: 204800 } }] };
const m = x.rendimiento(app); ok(m.mb === 300 && m.cpu === 3.2 && m.procesos.length === 2, 'rendimiento suma memoria y procesador: ' + JSON.stringify(m));

console.log(fallan ? `diagnostico.test.js: ${fallan} FALLAN` : `diagnostico.test.js OK (${pasan} comprobaciones)`);
process.exit(fallan ? 1 : 0);

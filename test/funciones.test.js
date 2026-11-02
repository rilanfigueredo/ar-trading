// Pruebas de la base de funciones (v0.24): registro, puente, aislamiento, migración de datos y etiquetas de pestaña.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const Registro = require('../renderer/funciones/registro');
const Puente = require('../src/funciones/puente');
const Noticias = require('../src/funciones/noticias/modulo');
const Store = require('../src/store');
const { AHORA, crearFetch } = require('./noticias.datos');
let pasan = 0, fallan = 0;
const ok = (c, m) => { if (c) pasan++; else { fallan++; console.log('  FALLA: ' + m); } };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const cif = { disponible: () => true, cifrar: (s) => Buffer.from(Buffer.from(s).map((b) => b ^ 0x5a)), descifrar: (b) => Buffer.from(b.map((x) => x ^ 0x5a)).toString() };

(async () => {
  // registro: 5 tarjetas en el orden pedido, ids únicos, prefijos propios
  ok(Registro.LISTA.map((f) => f.id).join() === 'grafico,liq,simulador,blockchain,noticias', 'orden de las tarjetas');
  ok(new Set(Registro.LISTA.map((f) => f.id)).size === 5, 'ids únicos');
  ok(Registro.LISTA.every((f) => f.titulo && f.desc && f.icono && f.desc.length < 70), 'cada tarjeta con nombre, descripción corta e icono');
  ok(Registro.LISTA.filter((f) => f.tipo === 'modulo').every((f) => /^[a-z]+$/.test(f.prefijo) && !Registro.PRESERVADOS.includes(f.prefijo)), 'prefijos propios y no reservados');
  ok(Registro.limpiar('inicio') === 'inicio' && Registro.limpiar('noticias') === 'noticias', 'limpiar acepta inicio y funciones listas');
  ok(Registro.limpiar('simulador') === 'simulador' && Registro.limpiar('blockchain') === 'blockchain', 'v0.25: Simulador y Monitor de blockchain ya están disponibles');
  ok(Registro.limpiar('xyz') === '' && Registro.limpiar(undefined) === '' && Registro.limpiar('grafico') === '', 'limpiar descarta lo desconocido y lo que no es módulo');
  ok(Registro.titulo('inicio') === 'Nueva pestaña' && Registro.titulo('noticias') === 'Noticias macro' && Registro.titulo('') === '', 'títulos');

  // puente: canales con prefijo, solo los del módulo
  const datos = tmp('ar-fn-'), puente = Puente.crearPuente({ datosBase: datos, appData: null, fetch: crearFetch(), ahora: () => AHORA, cifrador: cif, abrirCarpeta: null });
  ok(puente.canales().includes('noticias:estado') && puente.canales().every((c) => /^[a-z]+:[a-z-]+$/.test(c)), 'canales con prefijo: ' + puente.canales().length);
  ok(puente.canales().filter((c) => c.startsWith('noticias:')).length === Noticias.canales.length, 'todos los canales de Noticias registrados');
  const e1 = await puente.invocar('noticias:estado', [], 'w1');
  ok(e1.ok && Array.isArray(e1.datos.lista) && e1.datos.carpeta === path.join(datos, 'funciones', 'noticias'), 'datos de Noticias en <programa>/funciones/noticias (sin espacios ni tildes)');
  for (const malo of ['config:get', 'window:open', 'noticias:../x', 'noticias:inexistente', 'otra:estado', 'noticias', '', null, 5, 'noticias:estado:x']) {
    const r = await puente.invocar(malo, [], 'w1'); ok(r.ok === false && typeof r.error === 'string', 'canal rechazado: ' + malo);
  }
  const r1 = await puente.invocar('noticias:vista', [null], 'w1'); ok(typeof r1.ok === 'boolean', 'argumento raro no lanza');
  const r2 = await puente.invocar('noticias:manual', ['x', 'abc'], 'w1'); ok(r2.ok === false && /número/.test(r2.error), 'un error del módulo vuelve como {ok:false,error}');
  const r3 = await puente.invocar('noticias:clave', ['corta'], 'w1'); ok(r3.ok === false && !/corta/.test(r3.error), 'una clave mala no aparece en el error');

  // aislamiento: un módulo que falla al iniciar o al ejecutar no afecta a los demás
  const base = tmp('ar-mods-');
  fs.mkdirSync(path.join(base, 'bueno')); fs.mkdirSync(path.join(base, 'roto')); fs.mkdirSync(path.join(base, 'malo'));
  fs.writeFileSync(path.join(base, 'bueno', 'modulo.js'), "module.exports={id:'bueno',prefijo:'bueno',canales:['hola','falla'],crear:()=>({llamar:async(n,a,ctx)=>{if(n==='falla')throw new Error('boom');return 'hola '+ctx.inst}})};");
  fs.writeFileSync(path.join(base, 'roto', 'modulo.js'), "module.exports={id:'roto',prefijo:'roto',canales:['x'],crear:()=>{throw new Error('no arranca')}};");
  fs.writeFileSync(path.join(base, 'malo', 'modulo.js'), "module.exports={id:'malo',prefijo:'config',canales:['x'],crear:()=>({})};");
  const p2 = Puente.crearPuente({ datosBase: tmp('ar-d-'), fetch: null, cifrador: cif }, { base });
  ok(p2.modulos().map((m) => m.prefijo).sort().join() === 'bueno,roto', 'un prefijo reservado (config) no se registra');
  ok((await p2.invocar('bueno:hola', [], 'w3')).datos === 'hola w3', 'módulo nuevo funciona con solo agregar su carpeta (el puente recibe la pestaña)');
  ok((await p2.invocar('bueno:falla', [], 'w1')).ok === false, 'error al ejecutar aislado');
  const rr = await p2.invocar('roto:x', [], 'w1'); ok(rr.ok === false && /no pudo iniciar/.test(rr.error), 'error al iniciar aislado: ' + rr.error);
  ok((await p2.invocar('bueno:hola', [], 'zz')).datos === 'hola w1', 'identificador de pestaña inválido → w1');

  // migración desde %APPDATA%\Ar_Monitor\noticias: copia una vez, sin borrar lo viejo; la clave que no se puede abrir se descarta
  const antigua = tmp('ar-old-'), nueva = tmp('ar-new-');
  fs.writeFileSync(path.join(antigua, 'lista.json'), '["USD"]'); fs.writeFileSync(path.join(antigua, 'manual.json'), '{"a":1}'); fs.writeFileSync(path.join(antigua, 'fred.bin'), 'AAAA');
  const noCif = { disponible: () => true, descifrar: () => { throw new Error('llave distinta'); } };
  const notas = Noticias.migrar(nueva, antigua, noCif);
  ok(fs.existsSync(path.join(nueva, 'lista.json')) && fs.existsSync(path.join(nueva, 'manual.json')), 'migración: copia los datos');
  ok(!fs.existsSync(path.join(nueva, 'fred.bin')) && fs.existsSync(path.join(antigua, 'fred.bin')), 'migración: clave ilegible descartada en la nueva, intacta en la vieja');
  ok(notas.some((n) => /clave de FRED/.test(n)) && notas.some((n) => /copiaron/.test(n)), 'migración: avisos claros');
  ok(Noticias.migrar(nueva, antigua, noCif).length === 0, 'migración: no se repite si ya hay datos');
  fs.writeFileSync(path.join(nueva, 'lista.json'), '["EUR"]'); Noticias.migrar(nueva, antigua, noCif); ok(fs.readFileSync(path.join(nueva, 'lista.json'), 'utf8') === '["EUR"]', 'migración: nunca pisa datos nuevos');

  // la clave se guarda solo cifrada; sin cifrado disponible no se guarda
  const mod = Noticias.crear({ carpeta: tmp('ar-k-'), cifrador: cif, fetch: crearFetch(), ahora: () => AHORA });
  await mod.llamar('clave', ['abcdefghijklmnopqrstuvwxyz123456']);
  const guardado = fs.readFileSync(path.join(mod.app.almacen.carpeta, 'fred.bin'), 'utf8');
  ok(!guardado.includes('abcdefghijklmnop') && (await mod.llamar('estado', [])).hayClave, 'la clave se guarda cifrada');
  const sinCif = Noticias.crear({ carpeta: tmp('ar-k2-'), cifrador: { disponible: () => false }, fetch: crearFetch(), ahora: () => AHORA });
  let msg = ''; try { await sinCif.llamar('clave', ['abcdefghijklmnopqrstuvwxyz123456']); } catch (e) { msg = e.message; }
  ok(/no se guardó/.test(msg) && !fs.existsSync(path.join(sinCif.app.almacen.carpeta, 'fred.bin')), 'sin cifrado disponible la clave NO se guarda');

  // pestañas: etiqueta y persistencia del modo
  const dir = tmp('ar-st-'), st = Store.create(dir);
  const id = st.newWindowId(); st.addWindow(id);
  st.setConfig(id, { fn: 'inicio', charts: [] });
  ok(st.getConfig(id).fn === 'inicio', 'el modo de la pestaña se guarda');
  ok(st.tabs().find((t) => t.id === id).label === 'Nueva pestaña', 'etiqueta de pestaña en inicio');
  st.setConfig(id, { fn: 'noticias', charts: [] });
  ok(st.tabs().find((t) => t.id === id).label === 'Noticias macro', 'etiqueta de pestaña en Noticias');
  st.setConfig(id, { fn: 'basura', charts: [] });
  ok(st.tabs().find((t) => t.id === id).label !== 'basura', 'modo desconocido no se usa de etiqueta');
  ok(Store.WINDOW_KEYS.includes('fn'), 'fn es clave propia de cada pestaña');

  // v0.25: Simulador de posiciones (guarda lo del usuario en su carpeta) y Monitor de blockchain (red simulada de mempool.space y Bitstamp)
  ok(Registro.LISTA.filter((f) => f.tipo === 'modulo').every((f) => f.listo), 'las 3 funciones con módulo están listas');
  ok(['simulador:cargar', 'simulador:guardar', 'blockchain:estado', 'blockchain:actualizar'].every((c) => puente.canales().includes(c)), 'canales de las funciones nuevas registrados');
  const c0 = await puente.invocar('simulador:cargar', [], 'w1'); ok(c0.ok && JSON.stringify(c0.datos) === '{}', 'simulador: sin nada guardado devuelve vacío');
  const g1 = await puente.invocar('simulador:guardar', [{ ar_scen: [{ nombre: 'E1' }], ar_pairs: { BTCUSDT: [1, 2] } }], 'w2'); ok(g1.ok, 'simulador: guarda');
  const c1 = await puente.invocar('simulador:cargar', [], 'w1'); ok(c1.ok && c1.datos.ar_scen[0].nombre === 'E1' && c1.datos.ar_pairs.BTCUSDT.length === 2, 'simulador: lo guardado vuelve igual y se comparte entre pestañas');
  ok(fs.existsSync(path.join(datos, 'funciones', 'simulador', 'estado.json')), 'simulador: archivo en <programa>/funciones/simulador');
  for (const malo of [null, 5, 'texto', [1, 2]]) { const r = await puente.invocar('simulador:guardar', [malo], 'w1'); ok(r.ok === false, 'simulador: rechaza datos no válidos ' + JSON.stringify(malo)); }
  fs.writeFileSync(path.join(datos, 'funciones', 'simulador', 'estado.json'), '{roto');
  const c2 = await puente.invocar('simulador:cargar', [], 'w1'); ok(c2.ok === false && /dañado/.test(c2.error), 'simulador: archivo dañado se avisa');
  ok(fs.readdirSync(path.join(datos, 'funciones', 'simulador')).some((f) => f.includes('.danado-')), 'simulador: el dañado se aparta, no se borra');
  const c3 = await puente.invocar('simulador:cargar', [], 'w1'); ok(c3.ok && JSON.stringify(c3.datos) === '{}', 'simulador: después de apartarlo empieza limpio');

  const b1 = await puente.invocar('blockchain:actualizar', [], 'w1');
  ok(b1.ok && b1.datos.ok === true && b1.datos.tip.height === 985000, 'blockchain: último bloque desde la fuente simulada');
  ok(b1.datos.epoch && b1.datos.epoch.blocksRemaining === 2016 - (985000 % 2016) && b1.datos.halving && b1.datos.eras.length >= 5, 'blockchain: período, halving y eras calculados');
  ok(b1.datos.prices && b1.datos.prices.now && b1.datos.prices.now.price === 95000.5, 'blockchain: precio actual de Bitstamp');
  const b2 = await puente.invocar('blockchain:estado', [], 'w1'); ok(b2.ok && b2.datos.tip.height === 985000, 'blockchain: estado devuelve lo último sin volver a consultar');
  const rg = await puente.invocar('blockchain:rango', ['2026-10-01', '2026-10-20'], 'w1'); ok(rg.ok && rg.datos.ok && rg.datos.range.avgSeconds > 570 && rg.datos.range.avgSeconds < 590, 'blockchain: promedio de un rango ≈ 580 s (' + (rg.datos.range && rg.datos.range.avgSeconds) + ')');
  const rg2 = await puente.invocar('blockchain:rango', ['', ''], 'w1'); ok(rg2.ok && rg2.datos.ok === false && /fechas/.test(rg2.datos.error), 'blockchain: rango sin fechas se explica');
  const aj = await puente.invocar('blockchain:ajustar', [{ pollSeconds: 5, nearBlocks: 99999 }], 'w1'); ok(aj.ok && aj.datos.pollSeconds === 15 && aj.datos.nearBlocks === 2016, 'blockchain: ajustes con límites (mínimo 15 s, máximo 2016 bloques)');
  const av = []; const modB = require('../src/funciones/blockchain/modulo').crear({ carpeta: tmp('ar-bc-'), fetch: crearFetch(), ahora: () => AHORA, notificar: (l) => av.push(...l) });
  await modB.llamar('probar', []); ok(av.length === 1 && /prueba/.test(av[0].body), 'blockchain: aviso de prueba llega al notificador');
  modB.cerrar();
  // una fuente caída se avisa (no se inventan datos ni se cambia de fuente)
  const fuenteCaida = require('./blockchain.datos').crear(AHORA, { falla: true });
  const caida = Puente.crearPuente({ datosBase: tmp('ar-bc2-'), fetch: async (u) => fuenteCaida(u), ahora: () => AHORA, cifrador: cif });
  const bf = await caida.invocar('blockchain:actualizar', [], 'w1');
  ok(bf.ok && bf.datos.ok === false && /mempool\.space/.test(bf.datos.error) && /No se cambió a otra fuente/.test(bf.datos.error), 'blockchain: fuente caída → error claro con el nombre de la fuente');
  caida.cerrarTodo();

  puente.cerrarTodo();
  console.log(`\nPruebas de funciones: ${pasan} pasan, ${fallan} fallan`);
  process.exit(fallan ? 1 : 0);
})();

'use strict';
// Orquestación del módulo. Sin interfaz: recibe fetch y almacén desde afuera (así se prueba con node).
const cfg = require('./config');
const { pedir } = require('./http');
const { normalizarFeed, filtrar } = require('./calendario');
const fred = require('./fred');
const binance = require('./binance');
const historial = require('./historial');
const { leerMercado, leerCambios } = require('./mercado');
const { armarReporte, filaDe } = require('./reporte');
const { interpretar } = require('./comandos');
const { zonaLocal, fechaHoraLocal, claveDia } = require('./tiempo');

const TTL_CACHE = 10 * 60e3;   // el calendario y el mercado se reutilizan 10 min
const MIN_ENTRE_DESCARGAS = 60e3;
const NOMBRE = { calendario: 'Calendario (Forex Factory)', fred: 'FRED (CSV público)', binance: 'Binance' };
const SIN_CLAVE = 'Reacción histórica de BTC: necesita la clave gratuita de FRED (solo para saber las fechas de publicación). Sin clave, todo lo demás funciona.';

class AppMacro {
  constructor({ fetchFn, almacen, ahora = () => Date.now(), zona = zonaLocal() }) {
    this.fetchFn = fetchFn; this.almacen = almacen; this.ahora = ahora; this.zona = zona;
    this.eventos = []; this.historial = []; this.lista = cfg.LISTA_POR_DEFECTO.slice();
    this.series = []; this.avisosConfig = [];
    this.fuentes = { calendario: { estado: 'sin-datos' }, fred: { estado: 'sin-datos' }, binance: { estado: 'sin-datos' } };
    this.publicados = new Map(); this.reacciones = new Map(); this.datosSerie = new Map(); this.avisosCorrida = [];
    this.descargado = null; this.mercado = null; this.cambios = null; this.modelo = null;
  }
  iniciar() {
    this.lista = this.almacen.leerJSON('lista.json', cfg.LISTA_POR_DEFECTO.slice());
    if (!this.almacen.hayArchivo('series_fred.json')) this.almacen.escribirJSON('series_fred.json', cfg.SERIES_POR_DEFECTO);
    const v = cfg.validarSeries(this.almacen.leerJSON('series_fred.json', cfg.SERIES_POR_DEFECTO));
    this.series = v.series; this.avisosConfig = v.avisos;
    if (!this.almacen.hayArchivo('modelo.json')) this.almacen.escribirJSON('modelo.json', cfg.MODELO_POR_DEFECTO);
    this.modelo = cfg.validarModelo(this.almacen.leerJSON('modelo.json', null));
    if (!this.modelo) { this.modelo = cfg.MODELO_POR_DEFECTO; this.avisosConfig.push('modelo.json está incompleto; se usó el modelo por defecto.'); }
    this.historial = this.almacen.leerJSON('historial.json', []);
    const c = this.almacen.leerJSON('calendario.json', null);
    if (c) { try { this.eventos = normalizarFeed(c.json); this.descargado = c.descargado; this.fuentes.calendario = { estado: 'cache' }; } catch (e) { /* caché dañada */ } }
  }
  guardarLista(monedas) {
    const ok = monedas.filter((m) => cfg.PAISES[m]);
    this.lista = ok; this.almacen.escribirJSON('lista.json', ok); return ok;
  }
  hayClave() { return !!this.almacen.leerSecreto('fred.bin'); }
  guardarClave(clave) {
    const c = String(clave || '').trim();
    if (!/^[a-z0-9]{20,40}$/i.test(c)) throw new Error('La clave de FRED tiene un formato raro (se esperan 32 letras y números).');
    this.almacen.guardarSecreto('fred.bin', c);
  }
  agregarHistorial(evs) {
    this.historial = historial.mezclar(this.historial, evs, this.ahora());
    this.almacen.escribirJSON('historial.json', this.historial);
  }
  async actualizarCalendario({ forzar = false } = {}) {
    const ahora = this.ahora();
    const fresco = this.descargado && ahora - this.descargado < TTL_CACHE && this.eventos.length;
    if (!forzar && fresco) return;
    if (forzar && this.descargado && ahora - this.descargado < MIN_ENTRE_DESCARGAS && this.eventos.length) {
      this.fuentes.calendario = { estado: 'ok', nota: 'Se descargó hace menos de 1 minuto; se usan esos datos para no saturar la fuente.' };
      return;
    }
    try {
      const json = await pedir(this.fetchFn, cfg.URL_CALENDARIO, NOMBRE.calendario);
      const ev = normalizarFeed(json);
      this.eventos = ev; this.descargado = ahora;
      this.almacen.escribirJSON('calendario.json', { descargado: ahora, json });
      this.agregarHistorial(ev);
      this.fuentes.calendario = { estado: 'ok' };
    } catch (e) {
      this.fuentes.calendario = { estado: 'error', mensaje: e.message, datosViejos: this.eventos.length > 0 };
    }
  }
  eventosPeriodo(periodo) {
    if (periodo !== 'mes') return this.eventos;
    const todos = historial.mezclar(this.historial, this.eventos, this.ahora());
    return historial.delMes(todos, this.ahora(), this.zona);
  }
  banners() {
    const out = [];
    for (const k of Object.keys(this.fuentes)) {
      const f = this.fuentes[k];
      if (f.estado === 'error') {
        const msg = String(f.mensaje).replace(/^[^:]+:\s*/, '');
        out.push({ fuente: NOMBRE[k], mensaje: msg + (f.datosViejos ? `. Se muestran datos viejos (de ${fechaHoraLocal(f.desde || this.descargado, this.zona)}).` : '.') });
      }
    }
    return out;
  }
  avisos() {
    const a = [...this.avisosConfig, ...this.avisosCorrida];
    if (this.fuentes.calendario.nota) a.push(this.fuentes.calendario.nota);
    return a;
  }
  estado() {
    return {
      lista: this.lista, hayClave: this.hayClave(), banners: this.banners(), avisos: this.avisos(),
      descargado: this.descargado, carpeta: this.almacen.carpeta,
      paises: Object.entries(cfg.PAISES).map(([cod, p]) => ({ cod, nombre: p.nombre, opcional: cfg.OPCIONALES.includes(cod) })),
    };
  }
  vistaCalendario({ rango = 'semana', monedas = null, importancias = null } = {}) {
    const ahora = this.ahora();
    const evs = filtrar(this.eventos, { rango, monedas, importancias, ahora, zona: this.zona });
    const filas = evs.map((e) => {
      const c = cfg.buscarSerie(this.series, e);
      const f = filaDe(e, c, this.publicados.get(e.id), ahora, this.zona);
      if (c && e.ms <= ahora && !this.publicados.has(e.id)) { f.publicado = '—'; f.estado = 'sin-traer'; }
      return f;
    });
    const mon = [...new Set(this.eventos.map((e) => e.moneda))].sort();
    return { filas, total: filas.length, monedasDisponibles: mon.map((m) => ({ cod: m, nombre: (cfg.PAISES[m] || {}).nombre || m })), banners: this.banners(), avisos: this.avisos() };
  }
  // Trae valores publicados (FRED, sin clave) y, si hay clave, la reacción de BTC (Binance).
  async traerPublicados(monedas, periodo = 'semana') {
    const ahora = this.ahora();
    this.avisosCorrida = [];
    if (periodo === 'mes') {
      this.avisosCorrida.push('Este mes: el calendario público trae solo la semana actual; la app completa el mes con las semanas que ya guardó al abrirse. Los valores publicados son los actuales de FRED (pueden haberse revisado).');
    }
    const evs = filtrar(this.eventosPeriodo(periodo), { rango: 'semana', monedas, ahora, zona: this.zona })
      .filter((e) => e.ms <= ahora && e.impacto !== 'feriado' && cfg.buscarSerie(this.series, e));
    if (!evs.length) return;
    const manual = this.almacen.leerJSON('manual.json', {});
    for (const e of evs) {
      if (!cfg.buscarSerie(this.series, e).manual) continue;
      this.publicados.set(e.id, manual[e.id] != null ? { estado: 'publicado', valor: Number(manual[e.id]), manual: true } : { estado: 'manual-pendiente' });
    }
    const grupos = new Map();
    for (const e of evs) {
      if (cfg.buscarSerie(this.series, e).manual) continue; const c = cfg.buscarSerie(this.series, e); const k = cfg.claveSerie(c); if (!grupos.has(k)) grupos.set(k, { c, evs: [] }); grupos.get(k).evs.push(e); }
    let fallo = null;
    for (const [k, g] of grupos) {
      try {
        const serieT = await fred.leerSerie(g.c, ahora, this.fetchFn);
        this.datosSerie.set(k, { serieT, c: g.c });
        for (const e of g.evs) this.publicados.set(e.id, fred.evaluar(g.c, e, serieT));
      } catch (e) {
        fallo = e.message;
        this.fuentes.fred = { estado: 'error', mensaje: fallo };
        break; // si FRED falla (caída o cambio de formato) no se insiste con las demás series
      }
    }
    for (const g of grupos.values()) for (const ev of g.evs) if (!this.publicados.has(ev.id)) this.publicados.set(ev.id, { estado: 'error' });
    if (!fallo) this.fuentes.fred = { estado: 'ok' };
    await this.traerReacciones(grupos);
  }
  guardarValorManual(id, texto) {
    const v = parseFloat(String(texto).replace(',', '.'));
    if (!Number.isFinite(v)) throw new Error('Escribe un número, por ejemplo 52.4');
    const m = this.almacen.leerJSON('manual.json', {}); m[id] = v; this.almacen.escribirJSON('manual.json', m);
    this.publicados.set(id, { estado: 'publicado', valor: v, manual: true });
    return true;
  }
  // Energía y confirmación de mercado del modelo (cambio a 4 semanas).
  async traerCambios() {
    const ahora = this.ahora();
    if (this.cambios && ahora - this.cambios.ts < TTL_CACHE && !this.cambios.error) return this.cambios.items;
    const items = [...this.modelo.bloques.flatMap((b) => b.series || []), ...this.modelo.confirmacion.series];
    const r = await leerCambios(items, this.fetchFn, ahora);
    this.cambios = { ts: ahora, items: r.items, error: r.error };
    if (r.error && this.fuentes.fred.estado !== 'error') this.fuentes.fred = { estado: 'error', mensaje: r.error };
    return r.items;
  }
  async traerReacciones(grupos) {
    const ahora = this.ahora();
    const clave = this.almacen.leerSecreto('fred.bin');
    let binanceFallo = false, avisoClave = false;
    for (const [k, g] of grupos) {
      const d = this.datosSerie.get(k);
      if (!d || g.c.reaccion === false) continue;
      if (!g.evs.some((e) => (this.publicados.get(e.id) || {}).estado === 'publicado')) continue;
      if (!clave) { avisoClave = true; continue; }
      if (binanceFallo) continue;
      if (!d.fechas) {
        try { d.fechas = await fred.fechasPublicacion(g.c, clave, this.fetchFn); } catch (e) { this.avisosCorrida.push(`${g.c.titulo}: ${e.message.replace(/^[^:]+:\s*/, '')}; sin reacción histórica de este dato.`); continue; }
      }
      const m = fred.muestras(g.c, d.serieT, d.fechas, cfg.MUESTRAS_REACCION);
      const claveCache = k + '|' + (m[0] ? m[0].fechaPub : '');
      let r = this.reacciones.get(k);
      if (!r || r.claveCache !== claveCache) {
        try {
          const lista = await binance.reaccionesDe(m, this.fetchFn, ahora);
          r = { claveCache, titulo: g.c.titulo, moneda: g.c.pais, resumen: binance.resumenReaccion(lista) };
          this.reacciones.set(k, r);
          this.fuentes.binance = { estado: 'ok' };
        } catch (e) { binanceFallo = true; this.fuentes.binance = { estado: 'error', mensaje: e.message }; }
      }
    }
    if (avisoClave) this.avisosCorrida.push(SIN_CLAVE);
  }
  // forzar = true lo usa el reloj de cada hora de la ventana; si falla, se conservan los datos anteriores.
  async traerMercado({ forzar = false } = {}) {
    const ahora = this.ahora();
    if (!forzar && this.mercado && ahora - this.mercado.ts < TTL_CACHE && !this.mercado.error) return this.mercado.tarjetas;
    const r = await leerMercado(this.fetchFn, ahora);
    const viejas = this.mercado ? this.mercado.tarjetas : [];
    const tarjetas = r.tarjetas.map((t) => (t.valor === 'sin dato' ? (viejas.find((v) => v.id === t.id && v.valor !== 'sin dato') || t) : t));
    const huboViejas = tarjetas.some((t, i) => t !== r.tarjetas[i]);
    const ts = r.error && huboViejas ? this.mercado.ts : ahora;
    this.mercado = { ts, tarjetas, error: r.error };
    if (r.error) this.fuentes.fred = { estado: 'error', mensaje: r.error, datosViejos: huboViejas, desde: huboViejas ? ts : null };
    return tarjetas;
  }
  async mercadoAhora() {
    const tarjetas = await this.traerMercado({ forzar: true });
    return { tarjetas, ts: this.mercado.ts, banners: this.banners() };
  }
  async ejecutarOrden(texto) {
    const o = interpretar(texto, { lista: this.lista });
    if (o.accion === 'ayuda') return { tipo: 'ayuda', texto: o.mensaje };
    await this.actualizarCalendario({ forzar: false });
    if (!this.eventos.length) return { tipo: 'error', texto: 'No hay calendario disponible todavía.', banners: this.banners() };
    if (o.accion === 'calendario') return { tipo: 'calendario', filtros: { rango: o.rango, monedas: o.monedas, importancias: o.importancias }, banners: this.banners() };
    await this.traerPublicados([...new Set([...o.monedas, 'USD'])], o.periodo); // EE. UU. siempre: alimenta el gráfico de alta importancia
    const mercado = await this.traerMercado();
    const cambios = await this.traerCambios();
    const ahora = this.ahora();
    const rep = armarReporte({
      monedas: o.monedas, eventos: filtrar(this.eventosPeriodo(o.periodo), { rango: 'semana', monedas: o.monedas, ahora, zona: this.zona }),
      series: this.series, publicados: this.publicados, reacciones: this.reacciones, ahora, zona: this.zona, avisos: this.avisos(), periodo: o.periodo, mercado, mercadoTs: this.mercado ? this.mercado.ts : null, modelo: this.modelo, cambios,
      eventosUS: filtrar(this.eventosPeriodo(o.periodo), { rango: 'semana', monedas: ['USD'], ahora, zona: this.zona }),
    });
    const textoBanners = this.banners().map((b) => `[ERROR DE FUENTE] ${b.fuente}: ${b.mensaje}`);
    if (textoBanners.length) rep.texto = textoBanners.join('\n') + '\n\n' + rep.texto;
    return Object.assign({ tipo: 'reporte', banners: this.banners() }, rep);
  }
}
module.exports = { AppMacro };

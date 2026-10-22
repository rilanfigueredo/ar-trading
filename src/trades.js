// Velas desde operaciones reales (v0.18): Binance Futuros USDT-M, BTCUSDT.
// - Historial: archivos diarios de data.binance.vision (se descargan una vez y quedan en disco ya convertidos).
// - Hueco entre el último archivo y "ahora": se completa con consultas REST (por número de operación, sin saltos).
// - Vela en formación: transmisión en vivo (WebSocket); si no se puede abrir, consultas cada segundo (se avisa).
// Todo se calcula aquí (Node): al gráfico solo llegan velas en el mismo formato que las de Binance.
// Cada operación guarda: tiempo, precio, cantidad y lado agresor (compra/venta). Una operación = una fila de aggTrades.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const SYMBOL = 'BTCUSDT';
const DAY = 86400000;
const MAGIC = 0x31545241; // "ART1"
const BASE_SEC = { '1s': 1, '1m': 60, '1h': 3600, '1d': 86400 };
const MAX_HOLE = 3000000;      // huecos mayores no se rellenan con consultas (tardaría demasiado): se avisa
const NO_ARCHIVE_FILL = 200000; // sin archivo histórico: se rellenan hacia atrás solo estas operaciones (aprox. horas)
const FLUSH_MS = 30000;
const OPEN_MAX = 300000;

const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (ms) => Math.floor(ms / DAY) * DAY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Constructor de lotes de operaciones ----------
class Builder {
  constructor(cap) {
    this.cap = cap || 4096; this.n = 0; this.id0 = null; this.lastId = null; this.holes = 0;
    this.t = new Float64Array(this.cap); this.pt = new Int32Array(this.cap); this.q = new Float32Array(this.cap); this.s = new Uint8Array(this.cap);
  }
  grow() {
    const cap = this.cap * 2;
    const t = new Float64Array(cap); t.set(this.t); this.t = t;
    const pt = new Int32Array(cap); pt.set(this.pt); this.pt = pt;
    const q = new Float32Array(cap); q.set(this.q); this.q = q;
    const s = new Uint8Array(cap); s.set(this.s); this.s = s;
    this.cap = cap;
  }
  // buy = true si el que agrede es el comprador (is_buyer_maker = false)
  push(id, tMs, price, qty, buy) {
    if (this.n === this.cap) this.grow();
    const pt = Math.round(price * 100);
    if (Math.abs(price * 100 - pt) > 1e-4) throw new Error(`Precio ${price} con más de 2 decimales: el formato de guardado no lo admite (v0.18 es solo para BTCUSDT).`);
    if (this.n === 0) this.id0 = id; else if (id !== this.lastId + 1) this.holes++;
    this.lastId = id;
    const i = this.n++;
    this.t[i] = tMs; this.pt[i] = pt; this.q[i] = qty; this.s[i] = buy ? 1 : 0;
  }
  // Copia ajustada (sin capacidad sobrante)
  seg() {
    const n = this.n;
    return { n, id0: this.id0, idN: this.lastId, irregular: this.holes > 0 || (n > 0 && this.lastId - this.id0 + 1 !== n), t: this.t.slice(0, n), pt: this.pt.slice(0, n), q: this.q.slice(0, n), s: this.s.slice(0, n) };
  }
}

// ---------- Archivo propio (.trd = gzip de: cabecera + tiempos relativos + precios×100 + cantidades + lados) ----------
function encode(a) {
  const n = a.n, t0 = a.t[0];
  const off = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const d = a.t[i] - t0;
    if (d < 0 || d > 4294967295) throw new Error('Lote de operaciones con un rango de tiempo no válido');
    off[i] = d;
  }
  const hdr = Buffer.alloc(32);
  hdr.writeUInt32LE(MAGIC, 0); hdr.writeUInt32LE(n, 4); hdr.writeDoubleLE(t0, 8); hdr.writeDoubleLE(a.id0, 16); hdr.writeDoubleLE(0, 24);
  const view = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength);
  return zlib.gzipSync(Buffer.concat([hdr, view(off), view(a.pt.subarray(0, n)), view(a.q.subarray(0, n)), view(a.s.subarray(0, n))]), { level: 1 });
}
function decode(gz) {
  const buf = zlib.gunzipSync(gz);
  if (buf.length < 32 || buf.readUInt32LE(0) !== MAGIC) throw new Error('Archivo de operaciones guardado no válido');
  const n = buf.readUInt32LE(4), t0 = buf.readDoubleLE(8), id0 = buf.readDoubleLE(16);
  let o = 32;
  const take = (Ctor, bytes) => { const ab = buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + n * bytes); o += n * bytes; return new Ctor(ab); };
  const off = take(Uint32Array, 4), pt = take(Int32Array, 4), q = take(Float32Array, 4), s = take(Uint8Array, 1);
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = t0 + off[i];
  return { n, id0, idN: id0 + n - 1, t, pt, q, s };
}

// ---------- Lector de .zip (solo la primera entrada; sin ZIP64) y de CSV de aggTrades ----------
function zipFirstEntry(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 66000), tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    const e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (e < 0) throw new Error('El archivo descargado no es un .zip válido (¿descarga incompleta?)');
    const cdOff = tail.readUInt32LE(e + 16);
    const cd = Buffer.alloc(46);
    fs.readSync(fd, cd, 0, 46, cdOff);
    if (cd.readUInt32LE(0) !== 0x02014b50) throw new Error('.zip dañado (directorio central)');
    const method = cd.readUInt16LE(10), csize = cd.readUInt32LE(20), lho = cd.readUInt32LE(42);
    if (csize === 0xffffffff || lho === 0xffffffff) throw new Error('.zip con formato ZIP64 (no admitido)');
    const lh = Buffer.alloc(30);
    fs.readSync(fd, lh, 0, 30, lho);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('.zip dañado (cabecera local)');
    return { method, csize, start: lho + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28) };
  } finally { fs.closeSync(fd); }
}

// Lee el .zip de un día y devuelve las operaciones (Builder). Columnas: id, precio, cantidad, primera, última, tiempo, es_comprador_maker.
async function parseArchiveZip(file) {
  const ent = zipFirstEntry(file);
  let src = fs.createReadStream(file, { start: ent.start, end: ent.start + ent.csize - 1 });
  if (ent.method === 8) src = src.pipe(zlib.createInflateRaw());
  else if (ent.method !== 0) throw new Error('Método de compresión del .zip no admitido: ' + ent.method);
  const b = new Builder(1 << 20);
  let rest = null;
  const line = (buf, a, z) => {
    if (z <= a) return;
    const c0 = buf[a];
    if (c0 < 48 || c0 > 57) return; // cabecera (agg_trade_id,...)
    const f = [];
    let p = a;
    for (let k = 0; k < 7; k++) {
      let q = buf.indexOf(44, p);
      if (q < 0 || q > z) q = z;
      f.push(buf.latin1Slice(p, q));
      p = q + 1;
    }
    const id = Number(f[0]), price = parseFloat(f[1]), qty = parseFloat(f[2]), t = Number(f[5]);
    if (!isFinite(id) || !isFinite(price) || !isFinite(qty) || !isFinite(t)) throw new Error('Línea no válida en el archivo: ' + buf.latin1Slice(a, z).slice(0, 80));
    b.push(id, t, price, qty, f[6].trim().toLowerCase() !== 'true');
  };
  for await (let chunk of src) {
    if (rest) { chunk = Buffer.concat([rest, chunk]); rest = null; }
    let pos = 0;
    for (;;) {
      const nl = chunk.indexOf(10, pos);
      if (nl < 0) break;
      let z = nl; if (z > pos && chunk[z - 1] === 13) z--;
      line(chunk, pos, z);
      pos = nl + 1;
    }
    rest = pos < chunk.length ? Buffer.from(chunk.subarray(pos)) : null;
  }
  if (rest && rest.length) line(rest, 0, rest.length);
  if (!b.n) throw new Error('El archivo del día no trae operaciones');
  return b;
}

// ---------- Velas de 1 segundo (con filtro de tamaño) ----------
// f = { active, min, max, mode: 'only' | 'hl' }. 'only': la vela se arma solo con operaciones dentro del rango.
// 'hl' (resaltar): la vela es completa y se calcula aparte el volumen (fv) y la compra (fb) de las operaciones del rango.
function secBars(a, from, f) {
  const n = a.n;
  if (from >= n) return null;
  const s0 = Math.floor(a.t[from] / 1000), s1 = Math.floor(a.t[n - 1] / 1000), len = s1 - s0 + 1;
  const O = new Float64Array(len), H = new Float64Array(len), Lw = new Float64Array(len), C = new Float64Array(len);
  const V = new Float64Array(len), B = new Float64Array(len), FV = new Float64Array(len), FB = new Float64Array(len);
  const N = new Uint32Array(len);
  const only = f.active && f.mode === 'only', hl = f.active && f.mode === 'hl';
  const min = f.min ? f.min - 1e-6 : 0, max = f.max ? f.max + 1e-6 : Infinity;
  for (let i = from; i < n; i++) {
    const k = Math.floor(a.t[i] / 1000) - s0, q = a.q[i], p = a.pt[i] / 100, buy = a.s[i] === 1;
    const inR = q >= min && q <= max;
    if (!only || inR) {
      if (N[k] === 0) { O[k] = p; H[k] = p; Lw[k] = p; } else { if (p > H[k]) H[k] = p; if (p < Lw[k]) Lw[k] = p; }
      C[k] = p; V[k] += q; if (buy) B[k] += q; N[k]++;
    }
    if (hl && inR) { FV[k] += q; if (buy) FB[k] += q; }
  }
  return { s0, len, O, H, Lw, C, V, B, FV, FB, N };
}

// Agrupa velas de 1 s en velas de bs segundos (entre sLo y sHi, en segundos). Devuelve filas ordenadas [bucket, o,h,l,c,v,n,buy,fv,fb].
function groupBars(sb, bs, sLo, sHi) {
  const rows = [];
  let cur = null;
  const a = Math.max(0, sLo - sb.s0), z = Math.min(sb.len - 1, sHi - sb.s0);
  for (let k = a; k <= z; k++) {
    if (!sb.N[k]) continue;
    const bk = Math.floor((sb.s0 + k) / bs) * bs;
    if (!cur || cur[0] !== bk) { cur = [bk, sb.O[k], sb.H[k], sb.Lw[k], sb.C[k], sb.V[k], sb.N[k], sb.B[k], sb.FV[k], sb.FB[k]]; rows.push(cur); }
    else { if (sb.H[k] > cur[2]) cur[2] = sb.H[k]; if (sb.Lw[k] < cur[3]) cur[3] = sb.Lw[k]; cur[4] = sb.C[k]; cur[5] += sb.V[k]; cur[6] += sb.N[k]; cur[7] += sb.B[k]; cur[8] += sb.FV[k]; cur[9] += sb.FB[k]; }
  }
  return rows;
}
function mergeRows(lists) {
  const out = [];
  for (const rows of lists) {
    for (const r of rows) {
      const last = out[out.length - 1];
      if (last && last[0] === r[0]) {
        if (r[2] > last[2]) last[2] = r[2]; if (r[3] < last[3]) last[3] = r[3]; last[4] = r[4];
        last[5] += r[5]; last[6] += r[6]; last[7] += r[7]; last[8] += r[8]; last[9] += r[9];
      } else out.push(r.slice());
    }
  }
  return out;
}
const r8 = (x) => Math.round(x * 1e8) / 1e8;
// Fila con el formato de las velas de Binance (columna 9 = compra agresiva; 12 y 13 = volumen y compra de las operaciones filtradas)
const toKline = (r, bs) => [r[0] * 1000, String(r[1]), String(r[2]), String(r[3]), String(r[4]), String(r8(r[5])), r[0] * 1000 + bs * 1000 - 1, '0', r[6], String(r8(r[7])), '0', '0', String(r8(r[8])), String(r8(r[9]))];

// ---------- Nombres de archivo: tipo__etiqueta__id0__idN__n__tMin__tMax.trd ----------
const fileName = (e) => [e.kind, e.label || '', e.id0, e.idN, e.n, e.tMin, e.tMax].join('__') + '.trd';
function parseFileName(name) {
  const m = /^(day|seg)__([^_]*)__(\d+)__(\d+)__(\d+)__(\d+)__(\d+)\.trd$/.exec(name);
  if (!m) return null;
  return { kind: m[1], label: m[2], id0: Number(m[3]), idN: Number(m[4]), n: Number(m[5]), tMin: Number(m[6]), tMax: Number(m[7]) };
}

// ---------- Almacén ----------
function createStore(opts) {
  const dir = opts.dir;
  const deps = opts.deps;
  const now = deps.now || (() => Date.now());
  fs.mkdirSync(dir, { recursive: true });

  const entries = new Map();   // key -> { key, kind, label, id0, idN, n, tMin, tMax, file, arr, irregular }
  let uid = 0;
  const lru = new Map();       // key -> arrays (máx. 3 días en memoria)
  const sbCache = new Map();   // velas de 1 s (máx. 14)
  const st = {
    symbol: SYMBOL, days: 7, started: false,
    jobs: [],                                  // [{ day, state: 'pending'|'running'|'done'|'missing'|'error', err, bytes, total }]
    live: { mode: 'off', note: '', lastId: null, lastT: null },
    fill: { active: false, holes: 0, remaining: 0, total: 0, err: '' },
    errors: [],
  };
  const addError = (m) => { if (!st.errors.includes(m)) st.errors.push(m); if (st.errors.length > 8) st.errors.shift(); };
  const open = { b: null, ver: 0, dirty: false, file: null };
  let fillMem = [];            // páginas en memoria del relleno (entradas con arr)
  let fillRunning = false, fillWake = false;
  let stopped = false;
  let wsHandle = null, restTimer = null, flushTimer = null;

  // ----- catálogo de archivos -----
  function scan() {
    for (const f of fs.readdirSync(dir)) {
      const p = parseFileName(f);
      if (!p) { if (/\.(part|tmp)$/.test(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* nada */ } } continue; }
      const key = f;
      entries.set(key, Object.assign({ key, file: path.join(dir, f), arr: null, irregular: p.idN - p.id0 + 1 !== p.n }, p));
    }
  }
  function addEntry(arr, kind, label) {
    const e = { kind, label: label || '', id0: arr.id0, idN: arr.idN, n: arr.n, tMin: arr.t[0], tMax: arr.t[arr.n - 1], irregular: !!arr.irregular || arr.idN - arr.id0 + 1 !== arr.n, arr: null };
    e.key = fileName(e);
    e.file = path.join(dir, e.key);
    fs.writeFileSync(e.file + '.tmp', encode(arr));
    fs.renameSync(e.file + '.tmp', e.file);
    entries.set(e.key, e);
    lruPut(e.key, arr);
    return e;
  }
  function removeEntry(e) {
    entries.delete(e.key);
    lru.delete(e.key);
    if (e.file) { try { fs.unlinkSync(e.file); } catch (x) { /* ya no está */ } }
  }
  function lruPut(key, arr) {
    lru.delete(key); lru.set(key, arr);
    while (lru.size > 3) lru.delete(lru.keys().next().value);
  }
  function arrOf(e) {
    if (e.arr) return e.arr;
    let a = lru.get(e.key);
    if (a) { lruPut(e.key, a); return a; }
    a = decode(fs.readFileSync(e.file));
    lruPut(e.key, a);
    return a;
  }

  // ----- lista ordenada, sin repetidos (por número de operación; si no es consecutivo, por tiempo) -----
  function openEntry() {
    const b = open.b;
    if (!b || !b.n) return null;
    return { key: 'open', kind: 'open', id0: b.id0, idN: b.lastId, n: b.n, tMin: b.t[0], tMax: b.t[b.n - 1], ver: open.ver, arr: { n: b.n, t: b.t, pt: b.pt, q: b.q, s: b.s }, irregular: b.holes > 0 };
  }
  function ordered(minT) {
    const all = Array.from(entries.values()).concat(fillMem);
    const oe = openEntry(); if (oe) all.push(oe);
    all.sort((x, y) => x.id0 - y.id0 || y.idN - x.idN);
    const out = [];
    let prev = null;
    for (const e of all) {
      let from = 0;
      if (prev) {
        if (e.idN <= prev.idN) continue;
        if (e.id0 <= prev.idN) {
          if (!e.irregular && !prev.irregular) from = prev.idN - e.id0 + 1;
          else { const a = arrOf(e); let lo = 0, hi = a.n; while (lo < hi) { const m = (lo + hi) >> 1; if (a.t[m] <= prev.tMax) lo = m + 1; else hi = m; } from = lo; }
        }
      }
      prev = { idN: e.idN, tMax: e.tMax, irregular: e.irregular };
      if (e.tMax < minT) continue;
      out.push({ e, from });
    }
    return out;
  }
  function getSb(x, f) {
    const e = x.e;
    const key = `${e.key}|${x.from}|${e.ver || e.n}|${f.active ? f.mode + f.min + '-' + f.max : '-'}`;
    let sb = sbCache.get(key);
    if (sb === undefined) {
      sb = secBars(arrOf(e), x.from, f);
      if (e.kind === 'open') { if (open.lastKey) sbCache.delete(open.lastKey); open.lastKey = key; } // lo vivo cambia cada segundo: no llena la memoria ni desaloja los días
      sbCache.set(key, sb);
      while (sbCache.size > 14) sbCache.delete(sbCache.keys().next().value);
    }
    return sb;
  }

  // ----- historial: archivos diarios -----
  const haveDay = (label) => Array.from(entries.values()).some((e) => e.kind === 'day' && e.label === label);
  function planJobs() {
    const today = dayStart(now());
    const old = new Map(st.jobs.map((j) => [j.day, j]));
    st.jobs = [];
    for (let k = 1; k <= st.days; k++) {
      const d = dayStr(today - k * DAY);
      st.jobs.push(old.get(d) || { day: d, state: haveDay(d) ? 'done' : 'pending' });
    }
  }
  let archiveRunning = false;
  async function runArchive() {
    if (archiveRunning) return;
    archiveRunning = true;
    try {
      for (;;) {
        const job = st.jobs.find((j) => j.state === 'pending');
        if (!job || stopped) break;
        job.state = 'running';
        const tmp = path.join(dir, `dl-${job.day}.zip.part`);
        try {
          const res = await deps.download(job.day, tmp, (bytes, total) => { job.bytes = bytes; job.total = total; });
          if (res === 'missing') {
            job.state = 'missing';
            if (Date.parse(job.day) < dayStart(now()) - 2 * DAY) { job.err = `El archivo del ${job.day} no existe en data.binance.vision`; addError(job.err); }
          } else {
            const b = await parseArchiveZip(tmp);
            const arr = b.seg();
            const lbl = job.day;
            if (dayStr(arr.t[0]) !== lbl || dayStr(arr.t[arr.n - 1]) !== lbl) throw new Error(`El archivo del ${lbl} trae operaciones de otro día`);
            const e = addEntry(arr, 'day', lbl);
            // ya no hacen falta los lotes grabados/rellenados que quedan dentro de este día
            for (const x of Array.from(entries.values())) if (x.kind === 'seg' && x.id0 >= e.id0 && x.idN <= e.idN) removeEntry(x);
            fillMem = fillMem.filter((x) => !(x.id0 >= e.id0 && x.idN <= e.idN));
            if (arr.irregular) addError(`El archivo del ${lbl} no es consecutivo (faltan ${(arr.idN - arr.id0 + 1) - arr.n} operaciones): los datos de ese día pueden estar incompletos.`);
            job.state = 'done'; job.err = '';
            wakeFill();
          }
        } catch (e) {
          job.state = 'error'; job.err = `Día ${job.day}: ${e.message}`; addError(job.err);
        } finally { try { fs.unlinkSync(tmp); } catch (x) { /* no existe */ } }
      }
    } finally { archiveRunning = false; }
  }

  // ----- en vivo -----
  function openPush(id, t, p, q, buy) {
    if (open.b && open.b.n && id <= open.b.lastId) return false; // repetida
    if (open.b && open.b.n && (id !== open.b.lastId + 1 || open.b.n >= OPEN_MAX)) flushOpen(true);
    if (!open.b) open.b = new Builder(1 << 14);
    open.b.push(id, t, p, q, buy);
    open.ver++; open.dirty = true;
    st.live.lastId = id; st.live.lastT = t;
    return true;
  }
  function flushOpen(close) {
    const b = open.b;
    if (!b || !b.n) return;
    if (open.dirty || close) {
      try {
        const arr = b.seg();
        const prev = open.file;
        const e = addEntry(arr, 'seg', '');
        if (prev && prev !== e.key && entries.has(prev)) removeEntry(entries.get(prev));
        open.file = e.key; open.dirty = false;
      } catch (e) { addError('No se pudo guardar lo grabado en vivo: ' + e.message); }
    }
    if (close) { open.b = null; open.file = null; open.dirty = false; wakeFill(); }
  }
  function onWsTrade(m) {
    const id = Number(m.a);
    if (!isFinite(id)) return;
    const first = !open.b || !open.b.n;
    openPush(id, Number(m.T), parseFloat(m.p), parseFloat(m.q), !m.m);
    if (first || (open.b && open.b.n === 1)) wakeFill();
  }
  async function restLiveTick() {
    if (stopped || st.live.mode !== 'rest') return;
    try {
      const from = open.b && open.b.n ? open.b.lastId + 1 : (st.live.lastId !== null ? st.live.lastId + 1 : null);
      const rows = from === null ? await deps.rest({ limit: 1 }) : await deps.rest({ fromId: from, limit: 1000 });
      for (const r of rows) openPush(Number(r.a), Number(r.T), parseFloat(r.p), parseFloat(r.q), !r.m);
      if (rows.length) wakeFill();
      st.live.err = '';
    } catch (e) { st.live.err = 'Consulta en vivo: ' + e.message; }
    restTimer = setTimeout(restLiveTick, from1000());
  }
  const from1000 = () => (deps.liveDelay !== undefined ? deps.liveDelay : 1000);
  function startRestLive(note) {
    if (stopped) return;
    st.live.mode = 'rest'; st.live.note = note;
    clearTimeout(restTimer);
    restTimer = setTimeout(restLiveTick, 0);
  }
  function startLive() {
    if (stopped) return;
    let got = false;
    try {
      wsHandle = deps.openWs(
        (m) => { got = true; if (st.live.mode !== 'ws') { clearTimeout(restTimer); st.live.mode = 'ws'; st.live.note = ''; } onWsTrade(m); },
        (state, why) => {
          if (stopped) return;
          if (state === 'close') {
            wsHandle = null;
            const note = `La transmisión en vivo se cortó${why ? ' (' + why + ')' : ''}: se usan consultas cada segundo y se vuelve a intentar.`;
            if (st.live.mode !== 'rest') startRestLive(note);
            setTimeout(startLive, got ? 3000 : 30000);
          }
        });
      // Si en 10 s no llega ninguna operación por la transmisión, se pasa a consultas (y se avisa).
      setTimeout(() => { if (!got && st.live.mode === 'off' && !stopped) startRestLive('La transmisión en vivo (WebSocket) no entregó operaciones en 10 s: se usan consultas cada segundo.'); }, deps.wsWait || 10000);
    } catch (e) {
      startRestLive('No se pudo abrir la transmisión en vivo (' + e.message + '): se usan consultas cada segundo.');
    }
  }

  // ----- huecos (entre archivos, lotes grabados y lo vivo) -----
  function holes() {
    const list = ordered(0).map((x) => ({ id0: x.e.id0 + x.from, idN: x.e.idN })).filter((x) => x.idN >= x.id0);
    const out = [];
    for (let i = 1; i < list.length; i++) if (list[i].id0 > list[i - 1].idN + 1) out.push({ a: list[i - 1].idN + 1, b: list[i].id0 - 1 });
    return out.reverse(); // el más reciente primero
  }
  const wakeFill = () => { fillWake = true; if (!fillRunning) runFill(); };
  function flushFill() {
    if (!fillMem.length) return;
    const pages = fillMem.slice().sort((x, y) => x.id0 - y.id0);
    const n = pages.reduce((s, p) => s + p.n, 0);
    const m = { n, id0: pages[0].id0, idN: pages[pages.length - 1].idN, irregular: pages.some((p) => p.irregular) || pages[pages.length - 1].idN - pages[0].id0 + 1 !== n, t: new Float64Array(n), pt: new Int32Array(n), q: new Float32Array(n), s: new Uint8Array(n) };
    let o = 0;
    for (const p of pages) { m.t.set(p.arr.t, o); m.pt.set(p.arr.pt, o); m.q.set(p.arr.q, o); m.s.set(p.arr.s, o); o += p.n; }
    try { addEntry(m, 'seg', ''); fillMem = []; } catch (e) { addError('No se pudo guardar el relleno: ' + e.message); }
  }
  async function runFill() {
    if (fillRunning) return;
    fillRunning = true;
    try {
      while (fillWake && !stopped) {
        fillWake = false;
        // sin archivo ni nada grabado: se rellena hacia atrás solo un tramo corto desde lo vivo
        let hs = holes();
        const oe = openEntry();
        if (!hs.length && oe && !Array.from(entries.values()).length && !st.jobs.some((j) => j.state === 'pending' || j.state === 'running') && !fillMem.length && !st.noArchiveDone) {
          st.noArchiveDone = true;
          addError('No hay archivo histórico disponible: solo se rellenan las últimas operaciones con consultas.');
          hs = [{ a: Math.max(0, oe.id0 - NO_ARCHIVE_FILL), b: oe.id0 - 1 }];
        }
        st.fill.holes = hs.length;
        st.fill.total = hs.reduce((s, h) => s + (h.b - h.a + 1), 0);
        st.fill.remaining = st.fill.total;
        if (!hs.length) { st.fill.active = false; continue; }
        st.fill.active = true; st.fill.err = '';
        for (const h of hs) {
          if (h.b - h.a + 1 > MAX_HOLE) { st.fill.err = `Hueco de ${(h.b - h.a + 1).toLocaleString('es')} operaciones: demasiado grande para rellenarlo con consultas (se salta).`; addError(st.fill.err); continue; }
          let cursor = h.b, pages = 0, fails = 0;
          while (cursor >= h.a && !stopped) {
            const from = Math.max(h.a, cursor - 999);
            let rows;
            try { rows = await deps.rest({ fromId: from, limit: cursor - from + 1 }); fails = 0; }
            catch (e) {
              st.fill.err = 'Relleno de operaciones: ' + e.message;
              if (++fails >= 5) { addError(st.fill.err + ' (se detiene; se reintentará al reabrir el gráfico)'); st.fill.active = false; flushFill(); return; }
              await sleep(e.retryMs || (deps.restDelay !== undefined ? deps.restDelay : 1100) * 5 + 2000);
              continue;
            }
            const b = new Builder(rows.length + 1);
            for (const r of rows) if (Number(r.a) <= cursor) b.push(Number(r.a), Number(r.T), parseFloat(r.p), parseFloat(r.q), !r.m);
            if (b.n) { const arr = b.seg(); fillMem.push({ key: 'fill' + (++uid), kind: 'mem', id0: arr.id0, idN: arr.idN, n: arr.n, tMin: arr.t[0], tMax: arr.t[arr.n - 1], irregular: arr.irregular, arr }); }
            cursor = from - 1;
            st.fill.remaining = Math.max(0, st.fill.remaining - (rows.length || (cursor - from + 1)));
            if (++pages % 100 === 0) flushFill();
            await sleep(deps.restDelay !== undefined ? deps.restDelay : 1100);
          }
          flushFill();
        }
        st.fill.active = false; st.fill.remaining = 0;
      }
    } finally { fillRunning = false; if (fillWake && !stopped) runFill(); }
  }

  // ----- arranque -----
  function start(days) {
    st.days = Math.max(1, Math.min(60, Number(days) || st.days));
    if (!st.started) {
      st.started = true; stopped = false;
      scan();
      flushTimer = setInterval(() => flushOpen(false), deps.flushMs || FLUSH_MS);
      if (flushTimer.unref) flushTimer.unref();
      planJobs();
      startLive();
    } else planJobs();
    runArchive().then(() => wakeFill());
    wakeFill();
  }

  // ----- consulta de velas -----
  async function bars(p) {
    const interval = String(p.interval || '1m');
    const bs = BASE_SEC[interval];
    if (!bs) throw new Error(`Las velas de operaciones solo se arman desde 1s, 1m, 1h o 1d (pedido: ${interval}).`);
    if (p.symbol && p.symbol !== SYMBOL) throw new Error(`Las velas de operaciones reales son solo de ${SYMBOL} en esta versión.`);
    const days = Math.max(1, Math.min(60, Number(p.days) || 7));
    if (!st.started || days > st.days) start(days);
    const lim = Math.min(Number(p.limit) || 500, 1000);
    const min = Number(p.minQty) || 0, max = Number(p.maxQty) || 0;
    const f = { active: !!(min || max), min, max, mode: p.mode === 'hl' ? 'hl' : 'only' };
    const minT = dayStart(now()) - days * DAY;
    const hasStart = p.startTime !== undefined && p.startTime !== null && p.startTime !== '';
    const endMs = p.endTime !== undefined && p.endTime !== null && p.endTime !== '' ? Number(p.endTime) : now();
    const startMs = hasStart ? Math.max(Number(p.startTime), minT) : minT;
    // Si faltan días por descargar que podrían tener lo pedido, se espera al más reciente de ellos.
    for (let guard = 0; guard < 100; guard++) {
      const list = ordered(minT);
      const oldest = list.length ? list[0].e.tMin : Infinity;
      const pend = st.jobs.filter((j) => (j.state === 'pending' || j.state === 'running') && Date.parse(j.day) + DAY > startMs && Date.parse(j.day) < oldest);
      const rowsAll = [];
      let total = 0;
      if (hasStart) {
        const sLo = Math.ceil(startMs / 1000), sHi = Math.floor(endMs / 1000);
        for (const x of list) { if (x.e.tMax < startMs) continue; if (x.e.tMin > endMs) break; const sb = getSb(x, f); if (!sb) continue; const rs = groupBars(sb, bs, sLo, sHi); rowsAll.push(rs); total += rs.length; if (total > lim + 1) break; }
        const merged = mergeRows(rowsAll).filter((r) => r[0] * 1000 >= startMs && r[0] * 1000 <= endMs).slice(0, lim);
        if (merged.length >= lim || !pend.length) return merged.map((r) => toKline(r, bs));
      } else {
        const sLo = Math.ceil(minT / 1000), sHi = Math.floor(endMs / 1000);
        for (let i = list.length - 1; i >= 0 && total <= lim + 1; i--) { const x = list[i]; if (x.e.tMin > endMs) continue; const sb = getSb(x, f); if (!sb) continue; const rs = groupBars(sb, bs, sLo, sHi); rowsAll.unshift(rs); total += rs.length; }
        const merged = mergeRows(rowsAll).filter((r) => r[0] * 1000 <= endMs);
        // la fila más antigua puede estar incompleta si faltaban días: se descarta cuando hay más archivos pendientes
        if (merged.length > lim || !pend.length) return merged.slice(-lim).map((r) => toKline(r, bs));
      }
      // faltan datos: esperar a que termine el día pendiente más reciente
      await waitJob(pend[0]);
    }
    return [];
  }
  async function waitJob(job) {
    runArchive();
    for (let i = 0; i < 6000 && (job.state === 'pending' || job.state === 'running'); i++) await sleep(100);
  }

  function status() {
    const list = ordered(0);
    const jobsDone = st.jobs.filter((j) => j.state === 'done').length;
    const running = st.jobs.find((j) => j.state === 'running');
    let bytes = 0;
    for (const e of entries.values()) { try { if (e.file) bytes += fs.statSync(e.file).size; } catch (x) { /* nada */ } }
    return {
      market: 'Binance Futuros USDT-M', symbol: SYMBOL, days: st.days,
      archive: { total: st.jobs.length, done: jobsDone, missing: st.jobs.filter((j) => j.state === 'missing').map((j) => j.day), running: running ? { day: running.day, bytes: running.bytes || 0, total: running.total || 0 } : null },
      live: Object.assign({}, st.live), fill: Object.assign({}, st.fill),
      first: list.length ? list[0].e.tMin : null, last: list.length ? list[list.length - 1].e.tMax : null,
      holes: holes().map((h) => h.b - h.a + 1).reduce((a, b) => a + b, 0),
      errors: st.errors.slice(), diskMB: Math.round(bytes / 1048576),
    };
  }
  function shutdown() {
    stopped = true;
    clearInterval(flushTimer); clearTimeout(restTimer);
    try { if (wsHandle && wsHandle.close) wsHandle.close(); } catch (e) { /* nada */ }
    flushOpen(false); flushFill();
  }
  return { start, bars, status, shutdown, _entries: entries, _holes: holes, _ordered: ordered, _open: open };
}

// ---------- Fuente real (Binance) ----------
const ARCHIVE_URL = (day) => `https://data.binance.vision/data/futures/um/daily/aggTrades/${SYMBOL}/${SYMBOL}-aggTrades-${day}.zip`;
function realDeps(o) {
  const wsUrl = (o && o.wsUrl) || 'wss://fstream.binance.com/market/ws/btcusdt@aggTrade';
  return {
    async download(day, dest, progress) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15 * 60000);
      try {
        const res = await fetch(ARCHIVE_URL(day), { signal: ctrl.signal });
        if (res.status === 404) return 'missing';
        if (!res.ok) throw new Error(`data.binance.vision respondió ${res.status}`);
        const total = Number(res.headers.get('content-length')) || 0;
        let got = 0;
        const src = Readable.fromWeb(res.body);
        src.on('data', (c) => { got += c.length; progress(got, total); });
        await pipeline(src, fs.createWriteStream(dest));
        if (total && got !== total) throw new Error(`descarga incompleta (${got} de ${total} bytes)`);
        return 'ok';
      } catch (e) {
        throw new Error('No se pudo descargar de data.binance.vision: ' + (e.name === 'AbortError' ? 'tiempo agotado' : e.message));
      } finally { clearTimeout(timer); }
    },
    async rest({ fromId, limit }) {
      const qs = new URLSearchParams({ symbol: SYMBOL, limit: String(limit || 1000) });
      if (fromId !== undefined) qs.set('fromId', String(fromId));
      const res = await fetch('https://fapi.binance.com/fapi/v1/aggTrades?' + qs, { signal: AbortSignal.timeout(15000) });
      if (res.status === 429 || res.status === 418) {
        const e = new Error(`Binance pidió ir más despacio (${res.status})`);
        e.retryMs = (Number(res.headers.get('retry-after')) || (res.status === 418 ? 300 : 60)) * 1000;
        throw e;
      }
      if (!res.ok) throw new Error(`Binance Futuros respondió ${res.status}`);
      return res.json();
    },
    openWs(onTrade, onState) {
      if (typeof WebSocket === 'undefined') throw new Error('este Node no trae WebSocket');
      const ws = new WebSocket(wsUrl);
      ws.addEventListener('message', (ev) => { try { const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString()); if (m && m.e === 'aggTrade') onTrade(m); } catch (e) { /* mensaje ajeno */ } });
      ws.addEventListener('close', (ev) => onState('close', ev && ev.code ? 'código ' + ev.code : ''));
      ws.addEventListener('error', () => { /* el cierre posterior avisa */ });
      return { close: () => { try { ws.close(); } catch (e) { /* nada */ } } };
    },
  };
}

// ---------- Fuente simulada (TV_MOCK=1): un .zip real por día, REST y transmisión generados, 1 operación cada 400 ms ----------
const MOCK_STEP = 400, MOCK_E0 = Date.UTC(2024, 0, 1);
const mh = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
function mockTrade(i) {
  const t = MOCK_E0 + i * MOCK_STEP;
  const price = Math.round((60000 + 900 * Math.sin(t / 3.6e6) + 60 * Math.sin(t / 90000) + 25 * (mh(i) - 0.5)) * 10) / 10;
  const qty = Math.max(0.001, Math.round(Math.exp(-6 + 7.5 * mh(i + 0.5)) * 1000) / 1000);
  return { a: i, p: price.toFixed(1), q: qty.toFixed(3), T: t, m: mh(i + 0.77) < 0.5 };
}
const mockIdAt = (t) => Math.floor((t - MOCK_E0) / MOCK_STEP);
function crc32(buf) {
  let c, crc = 0xffffffff;
  if (!crc32.t) { crc32.t = new Int32Array(256); for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc32.t[n] = c; } }
  for (let i = 0; i < buf.length; i++) crc = crc32.t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
// .zip de una sola entrada (para pruebas y para el modo simulado)
function makeZip(name, data) {
  const comp = zlib.deflateRawSync(data), nm = Buffer.from(name), crc = crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nm.length, 28);
  const cdOff = 30 + nm.length + comp.length, cdSize = 46 + nm.length;
  const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(1, 8); eo.writeUInt16LE(1, 10); eo.writeUInt32LE(cdSize, 12); eo.writeUInt32LE(cdOff, 16);
  return Buffer.concat([lh, nm, comp, cd, nm, eo]);
}
function mockDeps() {
  const nowMs = () => Date.now();
  return {
    restDelay: 0, liveDelay: 1000, wsWait: 3000,
    async download(day, dest) {
      const d0 = Date.parse(day);
      if (d0 >= dayStart(nowMs()) - DAY) return 'missing'; // ayer y hoy aún no están en el archivo: se rellenan con consultas
      const a = Math.ceil((d0 - MOCK_E0) / MOCK_STEP), z = Math.ceil((d0 + DAY - MOCK_E0) / MOCK_STEP) - 1;
      const lines = ['agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker'];
      for (let i = a; i <= z; i++) { const r = mockTrade(i); lines.push(`${r.a},${r.p},${r.q},${r.a},${r.a},${r.T},${r.m}`); }
      fs.writeFileSync(dest, makeZip(`${SYMBOL}-aggTrades-${day}.csv`, Buffer.from(lines.join('\n') + '\n')));
      return 'ok';
    },
    async rest({ fromId, limit }) {
      const last = mockIdAt(nowMs());
      const lim = Math.min(limit || 1000, 1000), out = [];
      let from = fromId === undefined ? last - lim + 1 : fromId;
      for (let i = Math.max(0, from); i < from + lim && i <= last; i++) out.push(mockTrade(i));
      return out;
    },
    openWs(onTrade) {
      let next = mockIdAt(nowMs()) + 1;
      const timer = setInterval(() => { const last = mockIdAt(nowMs()); while (next <= last) onTrade(Object.assign({ e: 'aggTrade' }, mockTrade(next++))); }, 200);
      return { close: () => clearInterval(timer) };
    },
  };
}

module.exports = { createStore, realDeps, mockDeps, mockTrade, MOCK_STEP, makeZip, parseArchiveZip, Builder, encode, decode, secBars, groupBars, SYMBOL, DAY, dayStr, dayStart };

// Historial local: guarda en el equipo (IndexedDB) los bloques de 1000 velas ya cerradas de Binance.
// Lo ya descargado no se vuelve a pedir, así que al ir hacia atrás en el gráfico las velas aparecen al instante.
(function () {
  'use strict';
  const API = window.TVApi;
  const IV_MS = {
    '1s': 1000, '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000,
    '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '8h': 28800000, '12h': 43200000, '1d': 86400000,
  };
  const BLOCK = 1000;
  const MAX_BLOCKS = 6000; // tope aproximado de bloques guardados (unos 300 MB como máximo)
  const supported = (iv) => !!IV_MS[iv];

  // ----- IndexedDB (si no está disponible, todo sigue funcionando sin guardar nada) -----
  let dbp = null;
  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open('ar_trading_history', 1);
        req.onupgradeneeded = () => { req.result.createObjectStore('blocks'); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return openDb().then((db) => new Promise((resolve) => {
      if (!db) return resolve(null);
      try {
        const t = db.transaction('blocks', mode);
        const st = t.objectStore('blocks');
        const out = fn(st);
        if (out && 'onsuccess' in out) { out.onsuccess = () => resolve(out.result); out.onerror = () => resolve(null); }
        else t.oncomplete = () => resolve(true);
        t.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    }));
  }
  const keyOf = (sym, iv, idx) => `${sym}|${iv}|${idx}`;
  // rows <-> Float64Array [t,o,h,l,c,v, ...]
  const pack = (rows) => {
    const a = new Float64Array(rows.length * 6);
    rows.forEach((r, i) => { for (let j = 0; j < 6; j++) a[i * 6 + j] = Number(r[j]); });
    return a;
  };
  const unpack = (a) => {
    const rows = [];
    for (let i = 0; i < a.length; i += 6) rows.push([a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5]]);
    return rows;
  };
  let writes = 0;
  async function trim() {
    const n = await tx('readonly', (st) => st.count());
    if (!n || n <= MAX_BLOCKS) return;
    const drop = Math.ceil(n * 0.15);
    await tx('readwrite', (st) => {
      let k = 0;
      const cur = st.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c || k >= drop) return;
        // se quitan los más antiguos en uso (no hay marca de uso: se quita por orden de clave)
        c.delete(); k++; c.continue();
      };
      return null;
    });
  }
  const cacheGet = (k) => tx('readonly', (st) => st.get(k));
  function cachePut(k, rows) {
    tx('readwrite', (st) => { st.put({ rows: pack(rows), at: Date.now() }, k); return null; });
    if (++writes % 100 === 0) trim();
  }

  // ----- Descarga de un bloque (con la misma petición en curso compartida entre gráficos) -----
  const inflight = new Map();
  async function getBlock(symbol, iv, idx) {
    const ms = IV_MS[iv];
    const key = keyOf(symbol, iv, idx);
    const start = idx * BLOCK * ms, end = start + BLOCK * ms;
    const closed = end <= Date.now() - ms; // bloque pasado: ya no cambia
    if (closed) {
      const hit = await cacheGet(key);
      if (hit && hit.rows) return { rows: unpack(hit.rows), empty: hit.rows.length === 0 };
    }
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      const rows = await API.klines({ symbol, interval: iv, startTime: start, limit: BLOCK });
      const inBlock = rows.filter((r) => r[0] >= start && r[0] < end);
      if (closed) cachePut(key, inBlock);
      return { rows: inBlock, empty: inBlock.length === 0 };
    })();
    inflight.set(key, p);
    p.then(() => inflight.delete(key), () => inflight.delete(key));
    return p;
  }

  // ¿Hay velas más antiguas que este bloque vacío? (huecos de 1s sin operaciones vs. inicio real del historial)
  async function hasDataBefore(symbol, iv, idx) {
    const end = (idx + 1) * BLOCK * IV_MS[iv];
    const rows = await API.klines({ symbol, interval: iv, endTime: end - 1, limit: 1 });
    return rows.length > 0;
  }

  // Devuelve hasta nBlocks bloques hacia atrás desde el que contiene a endMs. { rows (orden ascendente), reached }
  async function fetchBack(symbol, iv, endMs, nBlocks, isCancelled) {
    const ms = IV_MS[iv];
    let idx = Math.floor((endMs === undefined ? Date.now() : endMs) / (BLOCK * ms));
    const byTime = new Map();
    let reached = false;
    let left = nBlocks;
    while (left > 0 && !reached) {
      const group = Math.min(8, left);
      const idxs = [];
      for (let i = 0; i < group; i++) idxs.push(idx - i);
      const res = await Promise.all(idxs.map((i) => getBlock(symbol, iv, i)));
      if (isCancelled()) return null;
      for (let k = 0; k < res.length && !reached; k++) {
        if (res[k].empty) {
          if (!(await hasDataBefore(symbol, iv, idxs[k]))) { reached = true; break; }
        }
        for (const r of res[k].rows) byTime.set(r[0], r);
      }
      idx -= group; left -= group;
    }
    const rows = Array.from(byTime.values()).sort((a, b) => a[0] - b[0]);
    return { rows, reached };
  }

  // Descarga en segundo plano (sin molestar) los bloques anteriores, para que luego estén ya guardados.
  const warming = new Map();
  async function warm(symbol, iv, beforeMs, nBlocks, isCancelled) {
    const key = symbol + '|' + iv;
    if (warming.get(key)) return;
    warming.set(key, true);
    try {
      const ms = IV_MS[iv];
      let idx = Math.floor(beforeMs / (BLOCK * ms));
      for (let i = 0; i < nBlocks; i++, idx--) {
        if (isCancelled()) break;
        const b = await getBlock(symbol, iv, idx);
        if (b.empty && !(await hasDataBefore(symbol, iv, idx))) break;
        await new Promise((r) => setTimeout(r, 120));
      }
    } catch (e) { /* sin conexión: no pasa nada */ } finally { warming.delete(key); }
  }

  async function clear() { await tx('readwrite', (st) => { st.clear(); return null; }); }
  async function stats() { return (await tx('readonly', (st) => st.count())) || 0; }

  window.TVHistory = { supported, fetchBack, warm, clear, stats, BLOCK };
})();

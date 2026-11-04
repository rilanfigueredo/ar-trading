// Liquidaciones reales guardadas por mes (v0.23.6): events-AAAA-MM.jsonl, y events-AAAA-MM.jsonl.gz cuando el mes ya cerró.
// Comprimir NUNCA pierde datos: se crea el .gz, se descomprime y se compara con el original; solo si es idéntico se quita el original.
// Leer funciona igual con .jsonl y con .jsonl.gz (si existen los dos, se leen los dos y se quitan los duplicados).
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RE = /^events-(\d{4}-\d{2})\.jsonl(\.gz)?$/;
const monthOf = (t) => new Date(t * 1000).toISOString().slice(0, 7);

function create(dir) {
  const full = (f) => path.join(dir, f);
  const size = (f) => { try { return fs.statSync(full(f)).size; } catch (e) { return 0; } };
  const files = () => { try { return fs.readdirSync(dir).filter((f) => RE.test(f)); } catch (e) { return []; } };
  const months = () => Array.from(new Set(files().map((f) => RE.exec(f)[1]))).sort();
  const textOf = (m) => {                                          // contenido del mes: .gz + .jsonl, sin líneas repetidas
    const seen = new Set(), out = [];
    ['.jsonl.gz', '.jsonl'].forEach((ext) => {
      const f = 'events-' + m + ext;
      if (!fs.existsSync(full(f))) return;
      const raw = fs.readFileSync(full(f));
      (ext === '.jsonl.gz' ? zlib.gunzipSync(raw) : raw).toString('utf8').split('\n').forEach((ln) => { if (ln && !seen.has(ln)) { seen.add(ln); out.push(ln); } });
    });
    return out;
  };
  const rowsOf = (m) => { const rows = []; textOf(m).forEach((ln) => { try { const e = JSON.parse(ln); if (e && e.t) rows.push(e); } catch (er) { /* línea dañada: se salta */ } }); return rows; };

  let pending = [], timer = null, lastT = null, writeError = '', fromCache = null;
  const flush = () => {
    clearTimeout(timer); timer = null;
    if (!pending.length) return;
    const by = {}; pending.forEach((e) => { (by[monthOf(e.t)] = by[monthOf(e.t)] || []).push(JSON.stringify(e)); });
    const keep = pending; pending = [];
    try { fs.mkdirSync(dir, { recursive: true }); Object.keys(by).forEach((m) => fs.appendFileSync(full('events-' + m + '.jsonl'), by[m].join('\n') + '\n')); writeError = ''; }
    catch (e) { pending = keep.concat(pending); writeError = e.message; }      // no se pierde: se reintenta en el siguiente guardado
  };
  const add = (e) => { pending.push(e); if (!lastT || e.t > lastT) lastT = e.t; if (!timer) { timer = setTimeout(flush, 5000); if (timer.unref) timer.unref(); } };

  // Eventos desde el mes de `sinceSec` en adelante (los meses anteriores se quedan en disco sin cargarse)
  const load = (sinceSec) => { const lim = monthOf(sinceSec); const out = []; months().filter((m) => m >= lim).forEach((m) => rowsOf(m).forEach((e) => out.push(e))); return out; };

  // Comprime los meses ya cerrados. Devuelve { files, saved, errors[] }.
  const compress = (nowSec) => {
    flush();
    const cur = monthOf(nowSec || Date.now() / 1000), res = { files: 0, saved: 0, errors: [] };
    months().filter((m) => m < cur).forEach((m) => {
      const jf = 'events-' + m + '.jsonl', gf = jf + '.gz';
      if (!fs.existsSync(full(jf))) return;                        // ya está comprimido
      try {
        const lines = textOf(m);
        const want = Buffer.from(lines.join('\n') + '\n', 'utf8');
        const gz = zlib.gzipSync(want, { level: 9 });
        fs.writeFileSync(full(gf + '.tmp'), gz);
        const back = zlib.gunzipSync(fs.readFileSync(full(gf + '.tmp')));
        if (!back.equals(want)) throw new Error('la copia comprimida no coincide con el original');
        const before = size(jf) + size(gf);
        fs.renameSync(full(gf + '.tmp'), full(gf));
        fs.unlinkSync(full(jf));                                    // solo después de comprobar que el .gz es idéntico
        res.files++; res.saved += Math.max(0, before - size(gf));
      } catch (e) { try { fs.unlinkSync(full(gf + '.tmp')); } catch (er) { /* nada */ } res.errors.push(m + ': ' + e.message); }   // el original queda intacto
    });
    return res;
  };

  const info = () => {
    const ms = months(); let bytes = 0; files().forEach((f) => { bytes += size(f); });
    let from = null, to = lastT;
    if (ms.length) {                                                // el primer mes casi no cambia: se recuerda mientras no cambie de tamaño
      const key = ms[0] + '|' + size('events-' + ms[0] + '.jsonl') + '|' + size('events-' + ms[0] + '.jsonl.gz');
      if (!fromCache || fromCache.key !== key) { const f = rowsOf(ms[0]); fromCache = { key, v: f.length ? Math.min.apply(null, f.map((e) => e.t)) : null }; }
      from = fromCache.v;
    }
    if (!to && ms.length) { const l = rowsOf(ms[ms.length - 1]); to = l.length ? Math.max.apply(null, l.map((e) => e.t)) : null; lastT = to; }
    return { from, to, bytes, months: ms.length, error: writeError };
  };
  return { add, flush, load, compress, info, months };
}
module.exports = { create, monthOf, RE };

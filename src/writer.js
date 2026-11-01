// Un solo programa guarda a la vez (v0.23.6): la app o el servicio 24/7, nunca los dos sobre la misma carpeta.
// - Candado `writer.lock` (se crea con "wx": si ya existe, solo uno gana). Guarda quién es, su puerto y un latido cada 15 s.
//   Se considera MUERTO si el latido tiene más de 45 s o el proceso ya no existe; entonces otro puede tomar el candado.
// - Sesiones: `cobertura.jsonl` anota cada periodo en que alguien estuvo guardando; lo que queda entre periodos es un HUECO.
//   Las liquidaciones reales llegan en vivo: un hueco ahí NO se puede recuperar (a diferencia de velas/interés abierto, que se rellenan).
'use strict';
const fs = require('fs');
const path = require('path');

const BEAT_MS = 15000, DEAD_SEC = 45, GAP_MIN_SEC = 120;
const nowSec = () => Math.floor(Date.now() / 1000);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

// Quién tiene el candado ahora (null si nadie vivo)
function owner(dir) {
  const o = readJson(path.join(dir, 'writer.lock'));
  if (!o || !o.pid) return null;
  if (nowSec() - (o.beat || 0) > DEAD_SEC || !alive(o.pid)) return null;
  return o;
}

// Huecos entre sesiones (> 2 min). `active`: si alguien guarda ahora, el último tramo no es hueco.
function gaps(dir, opt) {
  opt = opt || {};
  const rows = [];
  try { fs.readFileSync(path.join(dir, 'cobertura.jsonl'), 'utf8').split('\n').forEach((ln) => { if (ln) { try { const j = JSON.parse(ln); if (j && j.s && j.e) rows.push(j); } catch (e) { /* línea dañada */ } } }); } catch (e) { /* aún no hay */ }
  const cur = readJson(path.join(dir, 'session.json'));
  if (cur && cur.s && owner(dir)) rows.push({ s: cur.s, e: nowSec(), who: cur.who });
  rows.sort((a, b) => a.s - b.s);
  const out = [];
  for (let i = 1; i < rows.length; i++) { const from = Math.max(...rows.slice(0, i).map((r) => r.e)); if (rows[i].s - from > GAP_MIN_SEC) out.push({ from, to: rows[i].s }); }
  if (rows.length && !owner(dir) && !opt.ignoreOpen) { const last = Math.max(...rows.map((r) => r.e)); if (nowSec() - last > GAP_MIN_SEC) out.push({ from: last, to: null }); }   // sigue sin guardar nadie
  return { first: rows.length ? rows[0].s : null, list: out.slice(-30), count: out.length, seconds: out.reduce((a, g) => a + ((g.to || nowSec()) - g.from), 0) };
}

function create(opt) {
  const dir = opt.dir, kind = opt.kind || 'app', lockF = path.join(dir, 'writer.lock'), sessF = path.join(dir, 'session.json'), covF = path.join(dir, 'cobertura.jsonl');
  let beatT = null, started = 0, held = false;
  const lockBody = () => JSON.stringify({ kind, pid: process.pid, port: opt.port || 0, started, beat: nowSec() });
  const closeOldSession = () => {                                   // sesión anterior que no cerró bien (apagón, proceso muerto): se anota hasta su último latido
    const prev = readJson(sessF);
    if (prev && prev.s) { try { fs.appendFileSync(covF, JSON.stringify({ s: prev.s, e: prev.beat || prev.s, who: prev.who, crash: 1 }) + '\n'); } catch (e) { /* ok */ } }
  };
  function acquire() {
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 2; i++) {
      started = nowSec();
      try { fs.writeFileSync(lockF, lockBody(), { flag: 'wx' }); held = true; break; }
      catch (e) {
        if (e.code !== 'EEXIST') return { ok: false, error: 'No puedo crear el candado de la carpeta de datos: ' + e.message };
        const o = owner(dir);
        if (o && o.pid !== process.pid) return { ok: false, owner: o };
        try { fs.unlinkSync(lockF); } catch (er) { /* otro lo quitó */ }   // candado muerto: se retira y se reintenta con "wx"
      }
    }
    if (!held) return { ok: false, error: 'No se pudo tomar el candado de la carpeta de datos.' };
    closeOldSession();
    try { fs.writeFileSync(sessF, JSON.stringify({ s: started, beat: started, who: kind })); } catch (e) { /* ok */ }
    beatT = setInterval(beat, BEAT_MS); if (beatT.unref) beatT.unref();
    return { ok: true };
  }
  function beat() {
    if (!held) return;
    const o = readJson(lockF);
    if (o && o.pid !== process.pid) { held = false; clearInterval(beatT); if (opt.onLost) opt.onLost(); return; }   // alguien nos lo quitó: se avisa para dejar de guardar
    try { fs.writeFileSync(lockF, lockBody()); fs.writeFileSync(sessF, JSON.stringify({ s: started, beat: nowSec(), who: kind })); } catch (e) { /* ok */ }
  }
  function release() {
    clearInterval(beatT);
    if (!held) return;
    held = false;
    try { fs.appendFileSync(covF, JSON.stringify({ s: started, e: nowSec(), who: kind }) + '\n'); fs.unlinkSync(sessF); } catch (e) { /* ok */ }
    try { const o = readJson(lockF); if (o && o.pid === process.pid) fs.unlinkSync(lockF); } catch (e) { /* ok */ }
  }
  return { acquire, release, beat, isHeld: () => held, info: () => ({ kind, started }) };
}
module.exports = { create, owner, gaps, DEAD_SEC, GAP_MIN_SEC };

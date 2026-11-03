// Aviso de versión nueva (v0.26). Compara la versión instalada con la última publicada en GitHub (Releases de rilanfigueredo/ar-trading).
// La app instalada además descarga e instala con electron-updater (main.js); esto sirve para el aviso y para el modo navegador.
// Si no se puede consultar, se dice el motivo (nunca se inventa «estás al día»).
'use strict';

const REPO = 'rilanfigueredo/ar-trading';
const URL_ULTIMA = `https://api.github.com/repos/${REPO}/releases/latest`;

// "v0.26.1" → [0,26,1]; null si no es una versión válida
function partes(v) { const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(v || '').trim()); return m ? [+m[1], +m[2], +m[3]] : null; }
// 1 si a > b, -1 si a < b, 0 si iguales; null si alguna no es válida
function comparar(a, b) {
  const x = partes(a), y = partes(b); if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

// Consulta la última publicación. Devuelve { ok:true, version, url, notas, instalador } o { ok:false, error }
async function ultima(fetchFn) {
  try {
    const res = await fetchFn(URL_ULTIMA, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Ar_Trading' } });
    if (res.status === 404) return { ok: false, error: 'Todavía no hay versiones publicadas en GitHub.' };
    if (!res.ok) return { ok: false, error: `GitHub respondió ${res.status}${res.status === 403 ? ' (demasiadas consultas; se reintenta más tarde)' : ''}.` };
    const j = await res.json();
    const version = String(j.tag_name || '').replace(/^v/, '');
    if (!partes(version)) return { ok: false, error: 'La última publicación no tiene un número de versión válido.' };
    const exe = (j.assets || []).find((a) => /\.exe$/i.test(a.name || ''));
    return { ok: true, version, url: j.html_url || `https://github.com/${REPO}/releases/latest`, notas: String(j.body || '').slice(0, 4000), instalador: exe ? exe.browser_download_url : null };
  } catch (e) { return { ok: false, error: 'No se pudo consultar GitHub: ' + ((e && e.message) || e) }; }
}

// Estado completo: { actual, ultima, hayNueva, url, notas, instalador, error }
async function estado({ actual, fetchFn }) {
  const u = await ultima(fetchFn);
  if (!u.ok) return { actual, ultima: null, hayNueva: false, error: u.error };
  const c = comparar(u.version, actual);
  return { actual, ultima: u.version, hayNueva: c === 1, url: u.url, notas: u.notas, instalador: u.instalador, error: c === null ? 'No se pudo comparar las versiones.' : '' };
}

module.exports = { comparar, partes, ultima, estado, REPO, URL_ULTIMA };

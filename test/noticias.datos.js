'use strict';
// DATOS SIMULADOS (no son reales salvo la forma del calendario, copiada de una descarga real del feed).
const AHORA = Date.parse('2026-10-29T18:00:00Z');
const ZONA = 'America/La_Paz';
const FEED = [
  { title: 'CPI m/m', country: 'AUD', date: '2026-10-27T20:30:00-04:00', impact: 'High', forecast: '0.7%', previous: '0.4%' },
  { title: 'Federal Funds Rate', country: 'USD', date: '2026-10-28T14:00:00-04:00', impact: 'High', forecast: '4.00%', previous: '4.00%' },
  { title: 'FOMC Statement', country: 'USD', date: '2026-10-28T14:00:00-04:00', impact: 'High', forecast: '', previous: '' },
  { title: 'Advance GDP q/q', country: 'USD', date: '2026-10-29T08:30:00-04:00', impact: 'High', forecast: '3.2%', previous: '1.5%' },
  { title: 'Core PCE Price Index m/m', country: 'USD', date: '2026-10-29T08:30:00-04:00', impact: 'High', forecast: '0.3%', previous: '0.2%' },
  { title: 'Unemployment Claims', country: 'USD', date: '2026-10-29T08:30:00-04:00', impact: 'Medium', forecast: '198K', previous: '194K' },
  { title: 'Personal Income m/m', country: 'USD', date: '2026-10-29T08:30:00-04:00', impact: 'Low', forecast: '0.3%', previous: '0.2%' },
  { title: 'Main Refinancing Rate', country: 'EUR', date: '2026-10-29T09:15:00-04:00', impact: 'High', forecast: '2.65%', previous: '2.65%' },
  { title: 'Tokyo Core CPI y/y', country: 'JPY', date: '2026-10-29T19:30:00-04:00', impact: 'Medium', forecast: '2.6%', previous: '2.7%' },
  { title: 'BOJ Policy Rate', country: 'JPY', date: '2026-10-29T22:30:00-04:00', impact: 'High', forecast: '<1.25%', previous: '<1.25%' },
  { title: 'German Prelim CPI m/m', country: 'EUR', date: '2026-10-30T03:29:00-04:00', impact: 'Medium', forecast: '0.1%', previous: '0.6%' },
  { title: 'Employment Cost Index q/q', country: 'USD', date: '2026-10-30T08:30:00-04:00', impact: 'Medium', forecast: '0.8%', previous: '0.9%' },
  { title: 'Manufacturing PMI', country: 'CNY', date: '2026-10-30T21:30:00-04:00', impact: 'Low', forecast: '49.9', previous: '50.1' },
  { title: 'ISM Services PMI', country: 'USD', date: '2026-10-28T10:00:00-04:00', impact: 'High', forecast: '52.0', previous: '51.5' },
  { title: 'Bank Holiday', country: 'NZD', date: '2026-10-25T15:00:00-04:00', impact: 'Holiday', forecast: '', previous: '' },
];
function nivelesMensuales(n, crec) { // n niveles terminando con el crecimiento dado (en %)
  const out = []; let v = 100;
  for (let i = 0; i < n; i++) { v *= 1 + crec[i % crec.length] / 100; out.push(v); }
  return out;
}
function mes(i) { const y = 2025 + Math.floor((8 + i) / 12), m = ((8 + i) % 12) + 1; return `${y}-${String(m).padStart(2, '0')}-01`; }
function serieFred(id) {
  if (id === 'PCEPILFE') {
    const g = [0.2, 0.25, 0.2, 0.3, 0.2, 0.2, 0.25, 0.3, 0.2, 0.2, 0.3, 0.2, 0.2, 0.2, 0.3]; // 15; ult = 0.3, ante = 0.2
    const niv = nivelesMensuales(15, g);
    return niv.map((v, i) => ({ date: mes(i - 2), value: String(v), pub: i === 14 ? '2026-10-29' : mes(i - 1).slice(0, 8) + '27' }));
  }
  if (id === 'CES0500000003') {
    const g = [0.3, 0.4, 0.3, 0.3, 0.4, 0.3, 0.3, 0.4, 0.3, 0.3, 0.4, 0.3, 0.3, 0.3, 0.4]; // ult = 0.4, ante = 0.3
    return nivelesMensuales(15, g).map((v, i) => ({ date: mes(i - 2), value: String(v), pub: '' }));
  }
  if (id === 'CPIAUCSL') {
    const g = [0.3, 0.2, 0.3, 0.2, 0.3, 0.3, 0.2, 0.3, 0.2, 0.3, 0.3, 0.2, 0.3, 0.4, 0.2]; // ult = 0.2, ante = 0.4
    return nivelesMensuales(15, g).map((v, i) => ({ date: mes(i - 2), value: String(v), pub: mes(i - 1).slice(0, 8) + '14' }));
  }
  if (['DGS10', 'DGS2', 'T10Y2Y', 'DFF', 'DTWEXBGS', 'DCOILWTICO', 'VIXCLS', 'DCOILBRENTEU', 'GASDESW'].includes(id)) {
    const out = [];
    for (let i = 0; i < 60; i++) out.push({ date: new Date(Date.parse('2026-10-28') - (59 - i) * 864e5).toISOString().slice(0, 10), value: String(4 + 0.01 * i + (i % 5) * 0.02), pub: '' });
    return out;
  }
  if (id === 'A191RL1Q225SBEA') {
    const v = [2.0, 2.4, 1.8, 1.9, 1.5, 3.0];
    const pub = ['2025-07-30', '2025-10-30', '2026-01-29', '2026-04-29', '2026-07-30', '2026-10-29'];
    const f = ['2025-04-01', '2025-07-01', '2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01'];
    return v.map((x, i) => ({ date: f[i], value: String(x), pub: pub[i] }));
  }
  if (id === 'ICSA') {
    const out = [];
    for (let i = 0; i < 20; i++) {
      const d = new Date(Date.parse('2026-10-24') - (19 - i) * 7 * 864e5);
      const f = d.toISOString().slice(0, 10);
      const p = new Date(d.getTime() + 5 * 864e5).toISOString().slice(0, 10);
      out.push({ date: f, value: String(i === 19 ? 200000 : (i === 18 ? 194000 : 190000 + (i % 3) * 3000)), pub: p });
    }
    return out;
  }
  if (id === 'DFEDTARU') return [{ date: '2026-10-27', value: '4.00', pub: '2026-10-28' }, { date: '2026-10-28', value: '4.00', pub: '2026-10-29' }, { date: '2026-10-29', value: '4.00', pub: '2026-10-30' }];
  return null;
}
function resp(obj, status = 200) { return { ok: status < 400, status, json: async () => obj }; }
// opciones: {feed:'ok'|'429'|'html', fred:'ok'|'403', binance:'ok'|'500', sinFechas:bool}
const chainResp = require('./blockchain.datos').crear(AHORA);
function crearFetch(op = {}) {
  const o = Object.assign({ feed: 'ok', fred: 'ok', fredCsv: 'ok', binance: 'ok', sinFechas: false }, op);
  const llamadas = [];
  const f = async (url) => {
    llamadas.push(String(url));
    if (url.includes('mempool.space') || url.includes('bitstamp')) { const r = chainResp(url); if (r) return r; }
    if (url.includes('faireconomy')) {
      if (o.feed === '429') return resp({}, 429);
      if (o.feed === 'html') return { ok: true, status: 200, json: async () => { throw new Error('no json'); } };
      return resp(FEED);
    }
    if (url.includes('fredgraph.csv')) {
      if (o.fredCsv === '500') return resp({}, 500);
      const id = new URL(url).searchParams.get('id'); const s = serieFred(id);
      if (!s) return { ok: false, status: 404, text: async () => '' };
      const txt = `observation_date,${id}\n` + s.map((x) => `${x.date},${x.value}`).join('\n');
      return { ok: true, status: 200, text: async () => txt };
    }
    if (url.includes('api.stlouisfed')) {
      if (o.fred === '403') return resp({}, 403);
      const u = new URL(url); const id = u.searchParams.get('series_id');
      const s = serieFred(id);
      if (!s) return resp({ error_message: 'Bad Request' }, 400);
      if (u.searchParams.get('output_type') === '4') {
        if (o.sinFechas) return resp({}, 500);
        return resp({ observations: [...s].reverse().map((x) => ({ date: x.date, value: x.value, realtime_start: x.pub, realtime_end: '9999-12-31' })) });
      }
      return resp({ observations: [...s].reverse().map((x) => ({ date: x.date, value: x.value })) });
    }
    if (url.includes('binance')) {
      if (o.binance === '500') return resp({}, 500);
      const u = new URL(url);
      const ini = +u.searchParams.get('startTime'), fin = +u.searchParams.get('endTime');
      const out = [];
      for (let t = ini, k = 0; t <= fin && t <= AHORA; t += 300000, k++) {
        const p = 100000 + 10 * k;
        out.push([t, String(p), String(p + 5), String(p - 5), String(p + 2)]);
      }
      return resp(out);
    }
    return resp({}, 404);
  };
  f.llamadas = llamadas;
  return f;
}
module.exports = { AHORA, ZONA, FEED, crearFetch };

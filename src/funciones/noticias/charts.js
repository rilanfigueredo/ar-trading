'use strict';
// Gráficos SVG sin dependencias. Todo texto externo se escapa.
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Colores = los del tema de Ar_Trading (variables CSS; el valor tras la coma es solo de respaldo)
const COL = { previo: 'var(--muted,#8a8f98)', esperado: 'var(--active,#2962ff)', publicado: 'var(--warn,#f5a623)', texto: 'currentColor' };

// Una fila por dato, con su propia escala: previo, esperado y publicado.
function graficoSorpresas(filas) {
  const f = filas.filter((x) => x.nums && x.nums.publicado != null);
  if (!f.length) return '';
  const W = 680, x0 = 250, x1 = 640, alto = 40, top = 34;
  const H = top + f.length * alto + 8;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Previo, esperado y publicado por dato">`;
  const leg = [['previo', 'Previo'], ['esperado', 'Esperado'], ['publicado', 'Publicado']];
  leg.forEach(([k, t], i) => {
    s += `<circle cx="${x0 + i * 110}" cy="14" r="5" style="fill:${k === 'previo' ? 'none' : COL[k]};stroke:${COL[k]};stroke-width:2"/>`;
    s += `<text x="${x0 + i * 110 + 10}" y="18" font-size="12" fill="currentColor">${t}</text>`;
  });
  f.forEach((r, i) => {
    const y = top + i * alto + 14;
    const vals = ['previo', 'esperado', 'publicado'].map((k) => r.nums[k]).filter((v) => v != null);
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mn === mx) { mn -= 1; mx += 1; }
    const px = (v) => x0 + ((v - mn) / (mx - mn)) * (x1 - x0);
    const tit = r.titulo.length > 34 ? r.titulo.slice(0, 33) + '…' : r.titulo;
    s += `<text x="8" y="${y + 4}" font-size="12" fill="currentColor">${esc(tit)}</text>`;
    s += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="var(--muted,#999)" stroke-opacity=".35"/>`;
    for (const k of ['previo', 'esperado', 'publicado']) {
      const v = r.nums[k];
      if (v == null) continue;
      s += `<circle cx="${px(v).toFixed(1)}" cy="${y}" r="6" style="fill:${k === 'previo' ? 'none' : COL[k]};stroke:${COL[k]};stroke-width:2"><title>${k}: ${esc(r.textos[k])}</title></circle>`;
    }
    s += `<text x="${x0}" y="${y + 20}" font-size="10" fill="currentColor" opacity=".7">${esc(String(r.textos.min))}</text>`;
    s += `<text x="${x1}" y="${y + 20}" font-size="10" fill="currentColor" opacity=".7" text-anchor="end">${esc(String(r.textos.max))}</text>`;
  });
  return s + '</svg>';
}
// Mediana del rendimiento de BTC a +1 h, +4 h y +24 h: todos / dato subió / dato bajó.
function graficoReaccion(resumen) {
  const grupos = [['todos', 'Todos', COL.previo], ['subio', 'Dato subió', COL.esperado], ['bajo', 'Dato bajó', COL.publicado]];
  const hs = [['r1h', '+1 h'], ['r4h', '+4 h'], ['r24h', '+24 h']];
  let max = 0.001;
  for (const [g] of grupos) for (const [h] of hs) { const m = resumen[g][h].mediana; if (m != null) max = Math.max(max, Math.abs(m)); }
  const W = 560, Ht = 240, y0 = 120, esc_ = 90 / max, bw = 34;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Ht}" width="100%" role="img" aria-label="Mediana del rendimiento de BTC tras la publicación">`;
  s += `<line x1="30" x2="${W - 10}" y1="${y0}" y2="${y0}" stroke="var(--muted,#999)"/>`;
  hs.forEach(([h, et], hi) => {
    const bx = 50 + hi * 170;
    grupos.forEach(([g, , col], gi) => {
      const m = resumen[g][h].mediana, n = resumen[g][h].n;
      const x = bx + gi * (bw + 6);
      if (m != null) {
        const alto = Math.abs(m) * esc_;
        const y = m >= 0 ? y0 - alto : y0;
        s += `<rect x="${x}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(alto, 1).toFixed(1)}" style="fill:${col}"><title>${g} ${et}: ${(m * 100).toFixed(2)} % (n=${n})</title></rect>`;
        s += `<text x="${x + bw / 2}" y="${(m >= 0 ? y - 4 : y + alto + 12).toFixed(1)}" font-size="10" text-anchor="middle" fill="currentColor">${(m * 100).toFixed(2)}</text>`;
      }
      s += `<text x="${x + bw / 2}" y="${Ht - 22}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".7">n=${n}</text>`;
    });
    s += `<text x="${bx + 60}" y="${Ht - 6}" font-size="12" text-anchor="middle" fill="currentColor">${et}</text>`;
  });
  grupos.forEach(([, t, col], i) => {
    s += `<rect x="${40 + i * 120}" y="4" width="10" height="10" style="fill:${col}"/><text x="${55 + i * 120}" y="13" font-size="11" fill="currentColor">${t}</text>`;
  });
  return s + '</svg>';
}
const VERDE = 'var(--ok,#26a69a)', ROJO = 'var(--bad,#ef5350)', NEUTRO = 'var(--muted,#8a8f98)', ESPERADO = 'var(--active,#2962ff)';
// Esperado contra lo que salió: verde si salió mejor, rojo si salió peor (cada fila con su propia escala).
function graficoTop5(filas, modo = 'mejor') {
  const f = filas.filter((x) => x.nums && x.nums.esperado != null && x.nums.publicado != null);
  if (!f.length) return '';
  const W = 700, x0 = 250, x1 = 640, alto = 54, top = 30;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${top + f.length * alto + 6}" width="100%" role="img" aria-label="Esperado contra publicado">`;
  (modo === 'lectura' ? [['Esperado', ESPERADO], ['Más laxo que lo esperado', VERDE], ['Más restrictivo', ROJO], ['En línea', NEUTRO]] : [['Esperado', ESPERADO], ['Salió mejor', VERDE], ['Salió peor', ROJO], ['Sin juicio', NEUTRO]]).forEach(([t, c], i) => {
    s += `<rect x="${x0 + i * 130 - 130}" y="6" width="11" height="11" rx="2" style="fill:${c}"/><text x="${x0 + i * 130 - 114}" y="16" font-size="12" fill="currentColor">${t}</text>`;
  });
  f.forEach((r, i) => {
    const y = top + i * alto;
    const e = r.nums.esperado, p = r.nums.publicado;
    const lo = Math.min(0, e, p); let hi = Math.max(0, e, p); if (hi === lo) hi = lo + 1;
    const px = (v) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0), cero = px(0);
    const col = modo === 'lectura' ? (r.lectura === 'laxo' ? VERDE : (r.lectura === 'restrictivo' ? ROJO : NEUTRO)) : (r.mejor === 'mejor' ? VERDE : (r.mejor === 'peor' ? ROJO : NEUTRO));
    const tit = r.titulo.length > 30 ? r.titulo.slice(0, 29) + '…' : r.titulo;
    s += `<text x="8" y="${y + 20}" font-size="12.5" font-weight="600" fill="currentColor">${esc(r.moneda)} · ${esc(tit)}</text>`;
    s += `<text x="8" y="${y + 36}" font-size="11" fill="currentColor" opacity=".65">${esc(r.dia.slice(5))} ${esc(r.hora)}</text>`;
    const barra = (v, yy, c, txt) => {
      const a = Math.min(cero, px(v)), w = Math.max(Math.abs(px(v) - cero), 2);
      return `<rect x="${a.toFixed(1)}" y="${yy}" width="${w.toFixed(1)}" height="14" rx="3" style="fill:${c}"/><text x="${(Math.max(cero, px(v)) + 6).toFixed(1)}" y="${yy + 11}" font-size="11.5" fill="currentColor">${esc(txt)}</text>`;
    };
    s += barra(e, y + 6, ESPERADO, 'esp. ' + r.textos.esperado) + barra(p, y + 24, col, 'salió ' + r.textos.publicado);
    s += `<line x1="${cero.toFixed(1)}" x2="${cero.toFixed(1)}" y1="${y + 3}" y2="${y + 42}" stroke="var(--muted,#999)" stroke-opacity=".5"/>`;
  });
  return s + '</svg>';
}
function graficoLinea(vals) {
  if (!vals || vals.length < 2) return '';
  const W = 240, H = 70, mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const xy = vals.map((v, i) => [i / (vals.length - 1) * (W - 8) + 4, H - 6 - ((v - mn) / r) * (H - 14)]);
  const pts = xy.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const u = xy[xy.length - 1];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Últimos 40 datos"><polygon points="4,${H} ${pts} ${W - 4},${H}" fill="currentColor" opacity=".12"/><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="${u[0].toFixed(1)}" cy="${u[1].toFixed(1)}" r="3.6" fill="currentColor"/></svg>`;
}
module.exports = { esc, graficoSorpresas, graficoReaccion, graficoTop5, graficoLinea };

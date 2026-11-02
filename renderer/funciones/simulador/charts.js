'use strict';
(function () {
// Gráficos SVG como texto (sin librerías). Colores con variables CSS. Tamaños pensados para verse a ~1:1 en pantalla.
const fmt = (n, d = 2) => n.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
const KIND = { entry: '#13dbf3', avg: 'var(--ink)', liq: 'var(--acc)', sl: '#ff9f1a', close: '#e1ad01', tp: 'var(--ok)', be: '#bf29ff' };
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Mapa de precios minimalista: eje, zona de ganancia (verde) y de pérdida (roja) a cada lado del precio promedio.
function priceMap(markers, o = {}) {
  const pts = markers.filter((m) => m.price > 0); if (pts.length < 2) return '';
  let lo = Math.min(...pts.map((p) => p.price)), hi = Math.max(...pts.map((p) => p.price)); const span = (hi - lo) || hi * 0.02; lo -= span * 0.08; hi += span * 0.08;
  const W = 1000, H = 330, pad = 50, y0 = 165, x = (p) => pad + (p - lo) / (hi - lo) * (W - 2 * pad);
  let g = '';
  if (o.avg > 0 && o.side) {
    const adv = o.side === 'short' ? 1 : -1, liq = pts.find((m) => m.kind === 'liq'), good = pts.filter((m) => m.kind === 'tp' || m.kind === 'close');
    const lossEnd = liq ? liq.price : (adv > 0 ? hi : lo), goodEnd = good.length ? (adv > 0 ? Math.min(...good.map((m) => m.price)) : Math.max(...good.map((m) => m.price))) : (adv > 0 ? lo : hi);
    const zone = (a, b, c) => { const x1 = Math.min(x(a), x(b)), w = Math.abs(x(a) - x(b));
      g += '<rect x="' + x1 + '" y="' + (y0 - 17) + '" width="' + w + '" height="34" rx="8" fill="' + c + '" opacity="0.16"/>'; };
    zone(o.avg, lossEnd, 'var(--acc)'); zone(o.avg, goodEnd, 'var(--ok)');
    g += '<rect x="' + (W - 250) + '" y="8" width="12" height="12" rx="3" fill="var(--ok)" opacity="0.6"/><text x="' + (W - 232) + '" y="19" fill="var(--mut)" font-size="13">zona de ganancia</text><rect x="' + (W - 108) + '" y="8" width="12" height="12" rx="3" fill="var(--acc)" opacity="0.6"/><text x="' + (W - 90) + '" y="19" fill="var(--mut)" font-size="13">pérdida</text>';
  }
  g += '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y0 + '" y2="' + y0 + '" stroke="var(--line)" stroke-width="2"/>';
  [...pts].sort((a, b) => a.price - b.price).forEach((m, i) => {
    const up = i % 2 === 0, lvl = Math.floor(i / 2) % 3, xx = x(m.price), c = KIND[m.kind] || 'var(--ink)';
    const ty = up ? y0 - 34 - lvl * 36 : y0 + 52 + lvl * 36, anchor = xx < 100 ? 'start' : xx > W - 100 ? 'end' : 'middle';
    g += '<line x1="' + xx + '" x2="' + xx + '" y1="' + (up ? y0 - 8 : y0 + 8) + '" y2="' + (up ? ty + 6 : ty - 16) + '" stroke="' + c + '" stroke-width="1" opacity="0.55"/><circle cx="' + xx + '" cy="' + y0 + '" r="6.5" fill="' + c + '" stroke="var(--card2)" stroke-width="2"/>' +
      '<text x="' + xx + '" y="' + ty + '" fill="' + c + '" font-size="15" font-weight="700" text-anchor="' + anchor + '">' + esc(m.label) + '</text><text x="' + xx + '" y="' + (ty + 17) + '" fill="var(--ink)" font-size="14" text-anchor="' + anchor + '">' + fmt(m.price) + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Mapa de precios">' + g + '</svg>';
}
// Resultados con signo: ganancias a la derecha (verde), pérdidas a la izquierda (rojo). items: [{label, value, text}]
function barsPnL(items) {
  if (!items.length) return '';
  const W = 560, rowH = 50, lw = 190, H = items.length * rowH + 8, max = Math.max(...items.map((i) => Math.abs(i.value)), 1e-9), half = (W - lw) / 2 - 78, zero = lw + (W - lw) / 2;
  let g = '';
  items.forEach((it, i) => { const y = 4 + i * rowH, w = Math.abs(it.value) / max * half, pos = it.value >= 0, c = pos ? 'var(--ok)' : 'var(--acc)';
    g += '<rect x="0" y="' + y + '" width="' + W + '" height="' + (rowH - 6) + '" rx="8" fill="var(--line)" opacity="0.18"/><text x="10" y="' + (y + 28) + '" fill="var(--ink)" font-size="15">' + esc(it.label) + '</text>' +
      '<rect x="' + (pos ? zero : zero - w) + '" y="' + (y + 7) + '" width="' + Math.max(w, 2) + '" height="' + (rowH - 20) + '" rx="5" fill="' + c + '"/>' +
      '<text x="' + (pos ? zero + w + 8 : zero - w - 8) + '" y="' + (y + 28) + '" fill="' + c + '" font-size="16" font-weight="800" text-anchor="' + (pos ? 'start' : 'end') + '">' + esc(it.text) + '</text>'; });
  g += '<line x1="' + zero + '" x2="' + zero + '" y1="0" y2="' + H + '" stroke="var(--mut)" stroke-width="1.5"/>';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Resultados por escenario">' + g + '</svg>';
}
// Barras verticales. items: [{label, value, text, sub, color}]
function bars(items, color) {
  if (!items.length) return '';
  const W = 560, H = 290, base = 215, max = Math.max(...items.map((i) => i.value), 1e-9), slot = (W - 20) / items.length, bw = Math.min(84, slot - 18);
  let g = '<line x1="10" x2="' + (W - 10) + '" y1="' + base + '" y2="' + base + '" stroke="var(--line)" stroke-width="2"/>';
  items.forEach((it, i) => { const cx = 10 + (i + 0.5) * slot, h = Math.max(3, it.value / max * 150);
    g += '<rect x="' + (cx - bw / 2) + '" y="' + (base - h) + '" width="' + bw + '" height="' + h + '" rx="6" fill="' + (it.color || color || 'var(--cy)') + '"/><text x="' + cx + '" y="' + (base - h - 9) + '" fill="var(--ink)" font-size="17" font-weight="800" text-anchor="middle">' + esc(it.text) + '</text>' +
      '<text x="' + cx + '" y="' + (base + 24) + '" fill="var(--ink)" font-size="14" font-weight="600" text-anchor="middle">' + esc(it.label) + '</text>' + (it.sub ? '<text x="' + cx + '" y="' + (base + 43) + '" fill="var(--mut)" font-size="13" text-anchor="middle">' + esc(it.sub) + '</text>' : ''); });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Gráfico de barras">' + g + '</svg>';
}
function donut(pct, label, color) {
  const r = 62, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct)), d = c * p / 100;
  return '<svg viewBox="0 0 170 170" width="100%" style="max-width:200px" role="img" aria-label="' + esc(label) + '"><circle cx="85" cy="85" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="18"/><circle cx="85" cy="85" r="' + r + '" fill="none" stroke="' + (color || 'var(--cy)') + '" stroke-width="18" stroke-dasharray="' + d + ' ' + (c - d) + '" stroke-linecap="round" transform="rotate(-90 85 85)"/>' +
    '<text x="85" y="88" text-anchor="middle" fill="var(--ink)" font-size="30" font-weight="800">' + fmt(pct, 1) + '%</text><text x="85" y="110" text-anchor="middle" fill="var(--mut)" font-size="14">' + esc(label) + '</text></svg>';
}
const API = { priceMap, barsPnL, bars, donut };
if (typeof module === 'object' && module.exports) module.exports = API; else window.SimCharts = API;
})();

'use strict';
// Gráficos SVG como texto. Lógica pura: reciben datos y devuelven un <svg>. Sin DOM, sin red.
// Cada punto lleva un <title> (se ve al pasar el mouse).

const MUTED = '#8b95a7';
const GRID = '#2a313d';
const FONT = 'Segoe UI, system-ui, sans-serif';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const num = (n) => (Math.round(n * 100) / 100).toString();

function niceTicks(min, max, count) {
  if (!(max > min)) max = min + 1;
  const raw = (max - min) / Math.max(1, count);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out = [];
  for (let v = start; v <= end + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

function empty(width, height, text) {
  return '<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg" role="img">' +
    '<text x="' + width / 2 + '" y="' + height / 2 + '" fill="' + MUTED + '" font-family="' + FONT + '" font-size="13" text-anchor="middle">' + esc(text || 'Sin datos para graficar') + '</text></svg>';
}

function frame(o, xTicks, yTicks, sx, sy, m, W, H) {
  let g = '';
  for (const v of yTicks) {
    const y = sy(v);
    g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + num(y) + '" y2="' + num(y) + '" stroke="' + GRID + '" stroke-width="1"/>';
    g += '<text x="' + (m.l - 8) + '" y="' + num(y + 4) + '" fill="' + MUTED + '" font-family="' + FONT + '" font-size="11" text-anchor="end">' + esc(o.yFormat ? o.yFormat(v) : v) + '</text>';
  }
  for (const t of xTicks) {
    g += '<text x="' + num(t.px) + '" y="' + (H - m.b + 18) + '" fill="' + MUTED + '" font-family="' + FONT + '" font-size="11" text-anchor="middle">' + esc(t.label) + '</text>';
  }
  return g;
}

// opts: { width, height, series:[{name,color,points:[{x,y,label}]}], refLines:[{y,label,color}], xFormat, yFormat, yMin, yMax, area }
function lineChart(opts) {
  const o = opts || {};
  const W = o.width || 760, H = o.height || 300;
  const m = { l: 60, r: 18, t: 16, b: 32 };
  const series = (o.series || []).map((s) => ({ name: s.name, color: s.color || '#f7931a', points: (s.points || []).filter((p) => isFinite(p.x) && isFinite(p.y)) }));
  const all = [].concat(...series.map((s) => s.points));
  if (!all.length) return empty(W, H, o.emptyText);
  let xMin = Math.min(...all.map((p) => p.x)), xMax = Math.max(...all.map((p) => p.x));
  if (xMax === xMin) { xMin -= 1; xMax += 1; }
  const refs = (o.refLines || []).filter((r) => isFinite(r.y));
  const ys = all.map((p) => p.y).concat(refs.map((r) => r.y));
  let yMin = o.yMin != null ? o.yMin : Math.min(...ys), yMax = o.yMax != null ? o.yMax : Math.max(...ys);
  const pad = (yMax - yMin || Math.abs(yMax) || 1) * 0.08;
  if (o.yMin == null) yMin -= pad;
  if (o.yMax == null) yMax += pad;
  const yTicks = niceTicks(yMin, yMax, 5);
  yMin = Math.min(yMin, yTicks[0]); yMax = Math.max(yMax, yTicks[yTicks.length - 1]);
  const sx = (x) => m.l + ((x - xMin) / (xMax - xMin)) * (W - m.l - m.r);
  const sy = (y) => H - m.b - ((y - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  const xTicks = [];
  for (let i = 0; i < 5; i++) { const x = xMin + ((xMax - xMin) * i) / 4; xTicks.push({ px: sx(x), label: o.xFormat ? o.xFormat(x) : String(Math.round(x)) }); }

  let g = frame(o, xTicks, yTicks, sx, sy, m, W, H);
  for (const r of refs) {
    const y = sy(r.y), c = r.color || '#bf29ff';
    g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + num(y) + '" y2="' + num(y) + '" stroke="' + c + '" stroke-width="1.5" stroke-dasharray="6 4"/>';
    if (r.label) g += '<text x="' + (W - m.r - 4) + '" y="' + num(y - 5) + '" fill="' + c + '" font-family="' + FONT + '" font-size="11" text-anchor="end">' + esc(r.label) + '</text>';
  }
  for (const s of series) {
    if (!s.points.length) continue;
    const pts = s.points.slice().sort((a, b) => a.x - b.x);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + num(sx(p.x)) + ' ' + num(sy(p.y))).join(' ');
    if (o.area && pts.length > 1) {
      g += '<path d="' + d + ' L' + num(sx(pts[pts.length - 1].x)) + ' ' + (H - m.b) + ' L' + num(sx(pts[0].x)) + ' ' + (H - m.b) + ' Z" fill="' + s.color + '" fill-opacity="0.12"/>';
    }
    g += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round"/>';
    const r = pts.length > 150 ? 0 : pts.length > 60 ? 2 : 3.5;
    if (r > 0 || pts.length === 1) {
      for (const p of pts) {
        g += '<circle cx="' + num(sx(p.x)) + '" cy="' + num(sy(p.y)) + '" r="' + (r || 3.5) + '" fill="' + s.color + '"><title>' + esc(p.label || ((s.name ? s.name + ': ' : '') + p.y)) + '</title></circle>';
      }
    }
  }
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">' + g + '</svg>';
}

// opts: { width, height, bars:[{label,y,color,tip}], yFormat }
function barChart(opts) {
  const o = opts || {};
  const W = o.width || 760, H = o.height || 260;
  const m = { l: 60, r: 18, t: 16, b: 32 };
  const bars = (o.bars || []).filter((b) => isFinite(b.y));
  if (!bars.length) return empty(W, H, o.emptyText);
  let yMin = Math.min(0, ...bars.map((b) => b.y)), yMax = Math.max(0, ...bars.map((b) => b.y));
  const yTicks = niceTicks(yMin, yMax, 4);
  yMin = Math.min(yMin, yTicks[0]); yMax = Math.max(yMax, yTicks[yTicks.length - 1]);
  const sy = (y) => H - m.b - ((y - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  const slot = (W - m.l - m.r) / bars.length;
  const bw = Math.max(1.5, slot * 0.78);
  const xTicks = [];
  const labelCount = Math.min(5, bars.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = labelCount === 1 ? 0 : Math.round((i * (bars.length - 1)) / (labelCount - 1));
    xTicks.push({ px: m.l + slot * idx + slot / 2, label: bars[idx].label || '' });
  }
  let g = frame(o, xTicks, yTicks, null, sy, m, W, H);
  const zero = sy(0);
  bars.forEach((b, i) => {
    const y = sy(b.y);
    const top = Math.min(y, zero), h = Math.max(1, Math.abs(zero - y));
    g += '<rect x="' + num(m.l + slot * i + (slot - bw) / 2) + '" y="' + num(top) + '" width="' + num(bw) + '" height="' + num(h) + '" fill="' + (b.color || (b.y >= 0 ? '#3ccf91' : '#ff6b6b')) + '" rx="1"><title>' + esc(b.tip || (b.label + ': ' + b.y)) + '</title></rect>';
  });
  g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + num(zero) + '" y2="' + num(zero) + '" stroke="' + MUTED + '" stroke-width="1"/>';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">' + g + '</svg>';
}

const chartsApi = { lineChart, barChart, niceTicks };
if (typeof module !== 'undefined' && module.exports) module.exports = chartsApi;
else if (typeof window !== 'undefined') window.BtcCharts = chartsApi;

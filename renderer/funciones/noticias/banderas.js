'use strict';
// Banderas dibujadas en SVG (Windows no muestra los emojis de banderas). Versiones simplificadas.
(function () {
  const estrella = (cx, cy, R, rot) => {
    const p = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? R * 0.382 : R, a = (rot + i * 36) * Math.PI / 180; p.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2)); }
    return `<polygon points="${p.join(' ')}"/>`;
  };
  const jack = (w, h) => `<rect width="${w}" height="${h}" fill="#012169"/>`
    + `<path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="#fff" stroke-width="${h * 0.19}"/>`
    + `<path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="#c8102e" stroke-width="${h * 0.07}"/>`
    + `<path d="M${w / 2} 0V${h}M0 ${h / 2}H${w}" stroke="#fff" stroke-width="${h * 0.33}"/>`
    + `<path d="M${w / 2} 0V${h}M0 ${h / 2}H${w}" stroke="#c8102e" stroke-width="${h * 0.2}"/>`;
  const canton = `<svg x="0" y="0" width="12" height="8" viewBox="0 0 24 16">${jack(24, 16)}</svg>`;
  const env = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16" width="24" height="16" aria-hidden="true">${inner}</svg>`;
  let us = '<rect width="24" height="16" fill="#fff"/>';
  for (let i = 0; i < 13; i += 2) us += `<rect y="${(i * 16 / 13).toFixed(2)}" width="24" height="${(16 / 13).toFixed(2)}" fill="#b22234"/>`;
  us += '<rect width="10.4" height="8.62" fill="#3c3b6e"/>';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) us += `<circle cx="${1.6 + c * 2.4}" cy="${1.6 + r * 2.5}" r=".55" fill="#fff"/>`;
  let ue = '<rect width="24" height="16" fill="#003399"/><g fill="#ffcc00">';
  for (let i = 0; i < 12; i++) { const a = i * 30 * Math.PI / 180; ue += `<circle cx="${(12 + 5 * Math.sin(a)).toFixed(2)}" cy="${(8 - 5 * Math.cos(a)).toFixed(2)}" r=".8"/>`; }
  ue += '</g>';
  const cn = `<rect width="24" height="16" fill="#de2910"/><g fill="#ffde00">${estrella(5, 5, 2.6, -90)}${estrella(9.5, 2, .9, -60)}${estrella(11, 4.2, .9, -30)}${estrella(11, 7, .9, 0)}${estrella(9.5, 9.2, .9, 30)}</g>`;
  const stars = (c) => `<g fill="${c}">${estrella(6, 12.2, 2.3, -90)}${estrella(18, 3.4, 1.1, -90)}${estrella(14.8, 7.5, 1.1, -90)}${estrella(21, 7.2, 1.1, -90)}${estrella(18, 12.8, 1.1, -90)}</g>`;
  const F = {
    USD: env(us),
    EUR: env(ue),
    JPY: env('<rect width="24" height="16" fill="#fff"/><circle cx="12" cy="8" r="4.8" fill="#bc002d"/>'),
    CNY: env(cn),
    GBP: env(jack(24, 16)),
    AUD: env(`<rect width="24" height="16" fill="#00247d"/>${canton}${stars('#fff')}`),
    NZD: env(`<rect width="24" height="16" fill="#00247d"/>${canton}<g fill="#cc142b">${estrella(18, 3.6, 1.2, -90)}${estrella(15, 7.6, 1.2, -90)}${estrella(21, 7.4, 1.2, -90)}${estrella(18, 12.6, 1.2, -90)}</g>`),
    CAD: env('<rect width="24" height="16" fill="#fff"/><rect width="6" height="16" fill="#d52b1e"/><rect x="18" width="6" height="16" fill="#d52b1e"/><polygon fill="#d52b1e" points="12,2.5 13.3,5.2 15.6,4.4 14.8,7.4 17,8.2 14.2,9.6 14.6,11.2 12.6,10.6 12.6,13.5 11.4,13.5 11.4,10.6 9.4,11.2 9.8,9.6 7,8.2 9.2,7.4 8.4,4.4 10.7,5.2"/>'),
    CHF: env('<rect width="24" height="16" fill="#d52b1e"/><rect x="10" y="3" width="4" height="10" fill="#fff"/><rect x="7" y="6" width="10" height="4" fill="#fff"/>'),
  };
  window.bandera = function (cod, nombre) {
    const s = document.createElement('span');
    s.className = 'bandera'; s.title = nombre || cod;
    if (F[cod]) s.innerHTML = F[cod]; else s.textContent = cod;
    return s;
  };
})();

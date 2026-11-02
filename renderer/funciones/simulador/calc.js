'use strict';
(function () {
// Núcleo puro (sin interfaz). USDT-M lineal. TRAMOS y TASAS: A VERIFICAR (editables).
// Tramos BTCUSDT: fuente secundaria (tramo 1: 0-300.000, 150x, 0.4%). cum se calcula con la fórmula de Binance.
const DEFAULT_TIERS = [
  { floor: 0, rate: 0.004, maxLev: 150 }, { floor: 300000, rate: 0.005, maxLev: 100 },
  { floor: 800000, rate: 0.0065, maxLev: 75 }, { floor: 3000000, rate: 0.01, maxLev: 50 },
  { floor: 12000000, rate: 0.02, maxLev: 25 }, { floor: 70000000, rate: 0.025, maxLev: 20 },
  { floor: 100000000, rate: 0.05, maxLev: 10 }, { floor: 230000000, rate: 0.10, maxLev: 5 },
  { floor: 480000000, rate: 0.125, maxLev: 4 }, { floor: 600000000, rate: 0.15, maxLev: 3 },
];
const sgn = (side) => (side === 'long' ? 1 : -1);

function withCum(tiers) { // cum(n) = piso(n)*(tasa(n)-tasa(n-1)) + cum(n-1)
  let cum = 0;
  return tiers.map((t, i) => { if (i > 0) cum += t.floor * (t.rate - tiers[i - 1].rate); return { ...t, cum }; });
}
function tierFor(tiers, notional) { const t = withCum(tiers); let r = t[0]; for (const x of t) if (notional >= x.floor) r = x; return r; }
const maintenanceMargin = (tiers, n) => { const t = tierFor(tiers, n); return n * t.rate - t.cum; };

// Acepta líneas "piso,tasa[,apalancamiento]" o filas pegadas de la tabla de Binance ("0 - 300,000 ... 150x ... 0.40% ...").
function parseTiers(text) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const l = raw.trim(); if (!l) continue;
    let m = l.match(/^([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)x?)?$/i);
    if (m) { out.push({ floor: +m[1], rate: +m[2], maxLev: m[3] ? +m[3] : Infinity }); continue; }
    const s = l.replace(/(\d),(?=\d{3})/g, '$1');
    const r = s.match(/(\d+(?:\.\d+)?)\s*(?:[-–<]|to)\s*(?:Position\s*)?(?:[≤<]\s*)?(\d+(?:\.\d+)?)/i);
    const p = s.match(/(\d+(?:\.\d+)?)\s*%/), v = s.match(/(\d+)\s*x/i);
    if (r && p) out.push({ floor: +r[1], rate: +p[1] / 100, maxLev: v ? +v[1] : Infinity });
  }
  return out.sort((a, b) => a.floor - b.floor);
}

// Fórmula de liquidación de Binance. Aislado: tmm=0, upnl=0, wb = margen aislado.
function liqFormula({ side, qty, entry, wb, cum, mmr, tmm = 0, upnl = 0 }) {
  const s = sgn(side);
  return (wb - tmm + upnl + cum - s * qty * entry) / (qty * mmr - s * qty);
}
function liqPrice({ side, qty, entry, wb, tiers = DEFAULT_TIERS, tmm = 0, upnl = 0 }) {
  if (!(qty > 0)) return { price: null, rate: null, cum: 0 };
  let tier = tierFor(tiers, qty * entry), lp = null;
  for (let i = 0; i < 10; i++) { // repite hasta que el tramo coincida con el nocional en la liquidación
    lp = liqFormula({ side, qty, entry, wb, cum: tier.cum, mmr: tier.rate, tmm, upnl });
    const next = tierFor(tiers, qty * Math.max(lp, 0));
    if (next.floor === tier.floor) break;
    tier = next;
  }
  return { price: lp > 0 ? lp : null, rate: tier.rate, cum: tier.cum };
}
// Precio donde el resultado neto es 0 (comisiones de entrada, funding y comisión de salida).
function breakEven({ side, qty, avg, fees, funding = 0, exitFee }) {
  const s = sgn(side);
  return (fees + funding + qty * s * avg) / (qty * (s - exitFee));
}

function simulateLadder(o) {
  const { side, capital, leverage, entries, takerFee = 0.0005, makerFee = 0.0002, slippagePct = 0, tiers = DEFAULT_TIERS,
    tmm = 0, upnl = 0, mode = 'cross', lotStep = 0, minNotional = 0, fundingRatePct = 0, holdHours = 0,
    clearanceFeePct = 1.25, sl = null, extraBalance = 0, pctBase = 'initial' } = o;
  const s = sgn(side), cross = mode !== 'isolated';
  let Q = 0, cost = 0, fees = 0, marginTot = 0; const steps = [];
  entries.forEach((e, i) => {
    const warn = [], isMaker = e.type === 'maker';
    const price = isMaker ? e.price : e.price * (1 + s * slippagePct / 100); // deslizamiento solo a mercado
    // pctBase 'available': el % se calcula sobre el saldo disponible (capital - margen ya usado - comisiones pagadas)
    const availBefore = Math.max(0, capital + extraBalance - marginTot - fees), base = pctBase === 'available' ? availBefore : capital;
    let qty = (base * e.marginPct / 100 * leverage) / price;
    if (pctBase === 'available' && availBefore <= 0) warn.push('No queda saldo disponible para esta entrada');
    if (lotStep > 0) qty = Math.round(Math.floor(qty / lotStep + 1e-9) * lotStep * 1e8) / 1e8;
    const notional = qty * price;
    if (qty <= 0) warn.push('La orden no alcanza el tamaño mínimo (lote ' + lotStep + ')');
    else if (notional < minNotional) warn.push('Nocional por debajo del mínimo de la orden (' + minNotional + ' USDT)');
    Q += qty; cost += notional; fees += notional * (isMaker ? makerFee : takerFee); marginTot += notional / leverage;
    if (Q <= 0) { steps.push({ n: i + 1, price: e.price, type: e.type, margin: 0, notional: 0, totalQty: 0, avgEntry: null, totalNotional: 0, totalMarginPct: 0, fees: 0, fundingCost: 0, wb: capital, liq: null, liqDistancePct: null, warn }); return; }
    const avg = cost / Q;
    const fundingCost = s * cost * (fundingRatePct / 100) * (holdHours / 8); // + = pagas, - = recibes
    const wb = (cross ? capital - fees : marginTot) + extraBalance - fundingCost;
    const T = cross ? tmm : 0, U = cross ? upnl : 0;
    const liq = liqPrice({ side, qty: Q, entry: avg, wb, tiers, tmm: T, upnl: U });
    // estado de la cuenta con el precio de esta entrada como precio de marca
    const mark = e.price, pnl = s * Q * (mark - avg), equity = wb + pnl + U;
    const mm = maintenanceMargin(tiers, Q * mark) + T, im = Q * mark / leverage;
    const tier = tierFor(tiers, Q * mark);
    if (leverage > tier.maxLev) warn.push('El apalancamiento ' + leverage + 'x supera el máximo del tramo (' + tier.maxLev + 'x)');
    if (marginTot + (cross ? fees : 0) > capital + extraBalance) warn.push('Margen + comisiones superan el capital');
    if (liq.price !== null && (s === 1 ? liq.price >= mark : liq.price <= mark)) warn.push('El precio actual ya está más allá de la liquidación');
    let liqInfo = null;
    if (liq.price !== null) {
      const nl = Q * liq.price, mml = maintenanceMargin(tiers, nl) + T, clr = nl * clearanceFeePct / 100;
      liqInfo = { clearanceFee: clr, remaining: Math.max(0, mml - clr) };
    }
    const exitFee = takerFee, slEff = sl > 0 ? sl * (1 - s * slippagePct / 100) : null;
    const slNet = slEff === null ? null : s * Q * (slEff - avg) - Q * slEff * exitFee - fees - fundingCost;
    steps.push({ n: i + 1, price: e.price, type: e.type || 'taker', availBefore, margin: notional / leverage, notional, totalQty: Q, avgEntry: avg,
      totalNotional: cost, totalMarginPct: marginTot / capital * 100, fees, fundingCost, wb, liq: liq.price, mmr: liq.rate,
      liqDistancePct: liq.price === null ? null : (liq.price - mark) / mark * 100, upnl: pnl, equity, mm,
      marginRatioPct: equity > 0 ? mm / equity * 100 : 999, freeMargin: cross ? equity - im : null, liqInfo,
      breakEvenTaker: breakEven({ side, qty: Q, avg, fees, funding: fundingCost, exitFee: takerFee }),
      breakEvenMaker: breakEven({ side, qty: Q, avg, fees, funding: fundingCost, exitFee: makerFee }),
      slNet, slNetPctCapital: slNet === null ? null : slNet / capital * 100, warn });
  });
  return steps;
}

// Salvavidas: cuánto se aleja la liquidación al agregar saldo (depósitos acumulados) y cuánto agregar para una distancia objetivo.
function lifeguard({ side, qty, avgEntry, wb, price, tiers = DEFAULT_TIERS, tmm = 0, upnl = 0, deposits = [], targetDistancePct = null }) {
  const s = sgn(side), at = (w) => liqPrice({ side, qty, entry: avgEntry, wb: w, tiers, tmm, upnl }).price;
  const base = at(wb), rows = []; let cum = 0;
  const mk = (added, total) => { const lp = at(wb + total); return { added, total, wb: wb + total, liq: lp,
    distancePct: lp === null ? null : (lp - price) / price * 100, gain: lp !== null && base !== null ? Math.abs(lp - base) : null }; };
  rows.push(mk(0, 0));
  deposits.forEach((d) => { cum += d; rows.push(mk(d, cum)); });
  let needed = null;
  if (targetDistancePct > 0) {
    const lpT = side === 'short' ? price * (1 + targetDistancePct / 100) : price * (1 - targetDistancePct / 100);
    if (lpT > 0) { const t = tierFor(tiers, qty * lpT);
      const w = lpT * (qty * t.rate - s * qty) + tmm - upnl - t.cum + s * qty * avgEntry;
      needed = { liq: lpT, amount: Math.max(0, w - wb) }; }
  }
  return { rows, needed };
}

// Exposición máxima: mayor % de margen por entrada (igual en todas) que deja la liquidación final a >= X% del precio.
function maxExposure(o) {
  const n = o.prices.length, run = (p) => { const st = simulateLadder({ ...o, entries: o.prices.map((x) => ({ price: x, marginPct: p, type: o.type || 'taker' })) });
    const l = st[st.length - 1]; return { l, first: st[0], dist: l.liq === null ? Infinity : Math.abs(l.liqDistancePct) }; };
  let lo = 0, hi = o.pctBase === 'available' ? 100 : 100 / n; if (run(hi).dist >= o.targetDistancePct) return { limitedByCapital: true, ...pack(hi) };
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (run(mid).dist >= o.targetDistancePct) lo = mid; else hi = mid; }
  return { limitedByCapital: false, ...pack(lo) };
  function pack(p) { const r = run(p); return { marginPctPerEntry: p, marginPerEntry: r.first.margin, totalMarginPct: r.l.totalMarginPct, finalLiq: r.l.liq, finalDistancePct: r.dist }; }
}
// Exposición coherente con TU posición: escala tus % de margen (mismo factor para todas las entradas) hasta que la
// liquidación final quede a >= targetDistancePct del precio de la última entrada. k<1: debes reducir; k>1: puedes aumentar.
function exposureForTarget(o) {
  const w = o.entries.map((e) => e.marginPct), kmax = 100 / Math.max(...w);
  const run = (k) => { const st = simulateLadder({ ...o, entries: o.entries.map((e, i) => ({ ...e, marginPct: w[i] * k })) });
    const l = st[st.length - 1]; return { st, l, dist: l.liq === null ? Infinity : Math.abs(l.liqDistancePct) }; };
  let lo = 0, hi = kmax, limited = false;
  if (run(hi).dist >= o.targetDistancePct) { lo = hi; limited = true; }
  else for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (run(mid).dist >= o.targetDistancePct) lo = mid; else hi = mid; }
  const r = run(lo);
  return { k: lo, limitedByCapital: limited, pcts: w.map((x) => x * lo), margins: r.st.map((x) => x.margin), totalMarginPct: r.l.totalMarginPct,
    finalLiq: r.l.liq, finalDistancePct: r.dist, currentDistancePct: run(1).dist };
}
const API = { exposureForTarget, DEFAULT_TIERS, withCum, tierFor, maintenanceMargin, parseTiers, liqFormula, liqPrice, breakEven, simulateLadder, lifeguard, maxExposure };
if (typeof module === 'object' && module.exports) module.exports = API; else window.SimCalc = API;
})();

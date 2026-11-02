'use strict';
(function () {
// Salidas. Comisión = cantidad * precio de ESA salida * tasa. TP = límite (maker, sin deslizamiento);
// SL y "cerrar ahora" = a mercado (taker, con deslizamiento). funding = costo total estimado (+ pagas, - recibes).
const SC = (typeof require === 'function') ? require('./calc') : window.SimCalc;
const { liqPrice, DEFAULT_TIERS } = SC;
const leg = (s, qty, avg, price, feeRate) => { const gross = s * qty * (price - avg), fee = qty * price * feeRate; return { qty, price, gross, fee, net: gross - fee }; };
function analyzeExits({ side, capital, avgEntry, qty, entryFees = 0, funding = 0, tps = [], sl = null, makerFee = 0.0002,
  takerFee = 0.0005, slippagePct = 0, partial = null, liq = null, wb = null, tiers = DEFAULT_TIERS, tmm = 0, upnl = 0, mode = 'cross' }) {
  const s = side === 'long' ? 1 : -1, warn = [], fixed = entryFees + funding;
  const sumPct = tps.reduce((a, t) => a + t.pct, 0);
  if (sumPct > 100) warn.push('Los % de los take profit suman más de 100%');
  else if (tps.length && sumPct < 100) warn.push('Queda ' + (100 - sumPct).toFixed(1) + '% de la posición sin cerrar en ningún TP (no se cuenta)');
  tps.forEach((t, i) => { if (s * (t.price - avgEntry) <= 0) warn.push('El TP ' + (i + 1) + ' está del lado de la pérdida'); });
  let closed = 0, realized = 0;
  const tpRows = tps.map((t, i) => {
    const l = leg(s, qty * t.pct / 100, avgEntry, t.price, makerFee);
    closed += t.pct; realized += l.net;
    let liqAfter = null; // liquidación de lo que queda, con la ganancia ya en el saldo (solo cruzado)
    if (wb !== null && mode !== 'isolated' && closed < 100)
      liqAfter = liqPrice({ side, qty: qty * (1 - closed / 100), entry: avgEntry, wb: wb + realized, tiers, tmm, upnl }).price;
    return { n: i + 1, pct: t.pct, ...l, netPctCapital: l.net / capital * 100, liqAfter };
  });
  const tpNet = tpRows.reduce((a, r) => a + r.net, 0);
  const totalNet = tpRows.length ? tpNet - fixed : null;
  let slRow = null, riskUSDT = null, riskPct = null, rr = null;
  if (sl > 0) {
    const eff = sl * (1 - s * slippagePct / 100), l = leg(s, qty, avgEntry, eff, takerFee), total = l.net - fixed;
    slRow = { price: sl, effPrice: eff, ...l, totalNet: total };
    if (total < 0) { riskUSDT = -total; riskPct = riskUSDT / capital * 100; if (totalNet !== null && totalNet > 0) rr = totalNet / riskUSDT; }
    else warn.push('El stop loss está del lado de la ganancia: no limita la pérdida');
    if (liq !== null && (s === 1 ? sl <= liq : sl >= liq)) warn.push('El stop loss está más allá de la liquidación: te liquidarían antes');
  }
  let scenario = null;
  if (partial && tps[partial.tpIndex]) {
    const p = partial, tp = tps[p.tpIndex].price, nowEff = p.price * (1 - s * slippagePct / 100), q1 = qty * p.pct / 100;
    const a = leg(s, q1, avgEntry, nowEff, takerFee), b = leg(s, qty - q1, avgEntry, tp, makerFee);
    const allNow = leg(s, qty, avgEntry, nowEff, takerFee), allTp = leg(s, qty, avgEntry, tp, makerFee), t = (x) => x - fixed;
    scenario = { partialTotal: t(a.net + b.net), partialPctCapital: t(a.net + b.net) / capital * 100, allNowTotal: t(allNow.net),
      allTpTotal: t(allTp.net), waitVsNow: allTp.net - allNow.net, waitVsNowPctCapital: (allTp.net - allNow.net) / capital * 100 };
  }
  return { tpRows, totalNet, slRow, riskUSDT, riskPct, rr, scenario, warn };
}

// Cierre de una parte de la posición (cierres parciales): taker = a mercado con deslizamiento; maker = límite sin deslizamiento.
function closeNet({ side, qty, avg, pct, price, type = 'taker', makerFee = 0.0002, takerFee = 0.0005, slippagePct = 0 }) {
  const s = side === 'long' ? 1 : -1, eff = price * (1 - s * (type === 'maker' ? 0 : slippagePct) / 100);
  return { effPrice: eff, ...leg(s, qty * pct / 100, avg, eff, type === 'maker' ? makerFee : takerFee) };
}
// Reporte completo de salidas. closes: % de la posición ORIGINAL. tps: % de lo que QUEDA tras los cierres parciales.
function analyzeTrade({ side, capital, avgEntry, qty, entryFees = 0, funding = 0, closes = [], closeType = 'taker', tps = [], sl = null,
  makerFee = 0.0002, takerFee = 0.0005, slippagePct = 0, liq = null, wb = null, tiers = DEFAULT_TIERS, mode = 'cross', leverage = 1 }) {
  const s = side === 'long' ? 1 : -1, warn = [], fixed = entryFees + funding;
  const released = (q) => q * avgEntry / leverage; // margen que se libera al cerrar esa cantidad (a precio de costo)
  let closedPct = 0, realized = 0;
  const after = (remQty) => (wb !== null && mode !== 'isolated' && remQty > 1e-12) ? liqPrice({ side, qty: remQty, entry: avgEntry, wb: wb + realized, tiers }).price : null;
  const closeRows = closes.map((c, i) => {
    const l = closeNet({ side, qty, avg: avgEntry, pct: c.pct, price: c.price, type: closeType, makerFee, takerFee, slippagePct });
    closedPct += c.pct; realized += l.net;
    const mr = released(l.qty);
    return { n: i + 1, pct: c.pct, price: c.price, ...l, netPctCapital: l.net / capital * 100, cumNet: realized, marginReleased: mr, returns: mr + l.net, closedPctTotal: closedPct, liqAfter: after(qty * (1 - closedPct / 100)) };
  });
  if (closedPct > 100) warn.push('Los cierres parciales suman más de 100% de la posición');
  const remQty = qty * Math.max(0, 1 - closedPct / 100), closesNet = realized;
  let tpPct = 0;
  const tpRows = tps.map((t, i) => {
    const l = leg(s, remQty * t.pct / 100, avgEntry, t.price, makerFee);
    tpPct += t.pct; realized += l.net;
    if (s * (t.price - avgEntry) <= 0) warn.push('El TP ' + (i + 1) + ' está del lado de la pérdida');
    const mr = released(l.qty);
    return { n: i + 1, pct: t.pct, ...l, netPctCapital: l.net / capital * 100, cumNet: realized, marginReleased: mr, returns: mr + l.net, liqAfter: after(remQty * (1 - tpPct / 100)) };
  });
  if (tpPct > 100) warn.push('Los TP suman más de 100% de lo que queda de la posición');
  else if (tps.length && tpPct < 100) warn.push('Queda ' + (100 - tpPct).toFixed(1) + '% de lo que sobra sin cerrar en ningún TP (no se cuenta)');
  const tpNet = tpRows.reduce((a, r) => a + r.net, 0);
  const bestCase = tps.length ? closesNet + tpNet - fixed : closes.length ? closesNet - fixed : null;
  if (!tps.length && closes.length && closedPct < 100) warn.push('Quedaría ' + (100 - closedPct).toFixed(1) + '% de la posición abierta: el resultado cuenta solo lo cerrado');
  let slWhole = null, slAfterCloses = null, riskUSDT = null, riskPct = null, rr = null;
  if (sl > 0) {
    const eff = sl * (1 - s * slippagePct / 100), w = leg(s, qty, avgEntry, eff, takerFee);
    slWhole = { price: sl, effPrice: eff, net: w.net, total: w.net - fixed };
    if (closes.length) { const r = leg(s, remQty, avgEntry, eff, takerFee); slAfterCloses = { total: closesNet + r.net - fixed }; }
    if (slWhole.total < 0) { riskUSDT = -slWhole.total; riskPct = riskUSDT / capital * 100; if (bestCase !== null && bestCase > 0) rr = bestCase / riskUSDT; }
    else warn.push('El stop loss está del lado de la ganancia: no limita la pérdida');
    if (liq !== null && (s === 1 ? sl <= liq : sl >= liq)) warn.push('El stop loss está más allá de la liquidación: te liquidarían antes');
  }
  return { closeRows, tpRows, closesNet, tpNet, bestCase, slWhole, slAfterCloses, riskUSDT, riskPct, rr, remainingPct: Math.max(0, 100 - closedPct), warn };
}
const API = { analyzeExits, analyzeTrade, closeNet };
if (typeof module === 'object' && module.exports) module.exports = API; else window.SimExits = API;
})();

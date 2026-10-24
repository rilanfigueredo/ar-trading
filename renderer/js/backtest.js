// Simulador de estrategias (v0.21): recorre las velas una por una y lleva la cuenta de operaciones y capital.
// Lógica pura: funciona dentro del Worker y en Node (test/backtest.test.js).
//
// Reglas del simulador (todas se muestran también en la ayuda del editor):
//  - Una orden dada al cerrar la vela i se ejecuta en la APERTURA de la vela i+1 (nunca con datos del futuro).
//  - Compra al abrir: precio * (1 + deslizamiento). Venta al abrir: precio * (1 - deslizamiento).
//  - Comisión por lado: las órdenes de mercado (entradas, cierres por señal, stops) pagan la tasa "taker"; el objetivo (orden límite) paga la "maker".
//  - Stop loss: si la vela abre más allá del stop, se sale a la apertura; si no, al precio del stop (con deslizamiento).
//  - Objetivo (take profit): orden límite, sin deslizamiento; si la vela abre más allá, se sale a la apertura.
//  - Si en una misma vela se tocan el stop y el objetivo no se puede saber cuál fue primero: se asume el STOP (lo más desfavorable).
//  - Tamaño: % del capital, monto fijo (en la moneda de cotización) o contratos (unidades del activo). Sin apalancamiento: si pide más que el
//    capital disponible se reduce al capital (y se cuenta). Una sola posición a la vez; entrar en sentido contrario la invierte.
(function (root) {
  'use strict';

  function fail(msg) { const e = new Error(msg); e.user = true; return e; }
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  // d: { time, open, high, low, close } (listas del mismo largo)
// cfg: { capital, sizeType: 'percent'|'amount'|'contracts', size, commission (taker %), makerCommission (%), slippage (%) }
  function create(d, cfg) {
    const n = d.close.length;
    const takerFee = cfg.commission / 100, makerFee = (cfg.makerCommission !== undefined ? cfg.makerCommission : cfg.commission) / 100, slip = cfg.slippage / 100;
    const sizeType = cfg.sizeType || 'percent';
    let cash = cfg.capital;
    let pos = null, pending = null;
    const trades = [];
    const equity = new Array(n).fill(NaN);
    const st = { rejected: 0, rejectedWhy: null, ambiguous: 0, busted: false, barsIn: 0, fees: 0, reduced: 0 };

    function reject(why) { st.rejected++; if (!st.rejectedWhy) st.rejectedWhy = why; }

    function closePos(i, ref, reason, market) {
      const p = pos;
      const fill = market ? (p.side > 0 ? ref * (1 - slip) : ref * (1 + slip)) : ref;
      const gross = (fill - p.entryPrice) * p.qty * p.side;
      const exitFee = p.qty * fill * (market ? takerFee : makerFee);
      cash += gross - exitFee;
      st.fees += exitFee;
      const net = gross - p.entryFee - exitFee;
      trades.push({
        side: p.side > 0 ? 'long' : 'short', entryIdx: p.entryIdx, entryTime: d.time[p.entryIdx], entryPrice: p.entryPrice,
        exitIdx: i, exitTime: d.time[i], exitPrice: fill, qty: p.qty, pnl: net, pnlPct: (net / (p.qty * p.entryPrice)) * 100,
        fees: p.entryFee + exitFee, bars: i - p.entryIdx, reason, open: false, sl: p.sl, tp: p.tp,
      });
      pos = null;
    }

    function openPos(i, o, side, p) {
      if (st.busted) return;
      const fill = side > 0 ? o * (1 + slip) : o * (1 - slip);
      const sz = p.size !== undefined ? p.size : cfg.size;
      let notional = sizeType === 'percent' ? cash * Math.min(sz, 100) / 100 : (sizeType === 'amount' ? sz : sz * fill);
      if (notional > cash) { notional = cash; st.reduced++; }    // sin apalancamiento: nunca más que el capital disponible
      const qty = notional / fill;
      if (!(qty > 0) || !isFinite(qty)) { reject('No había capital para abrir la operación.'); return; }
      let sl = null, tp = null;
      if (p.sl !== undefined) sl = p.sl; else if (p.slPct !== undefined) sl = fill * (1 - side * p.slPct / 100);
      if (p.tp !== undefined) tp = p.tp; else if (p.tpPct !== undefined) tp = fill * (1 + side * p.tpPct / 100);
      if (sl !== null && !(side > 0 ? sl < fill : sl > fill)) { reject(`El stop loss (${sl}) quedó del lado equivocado del precio de entrada (${fill}): en una compra debe estar debajo y en una venta arriba.`); return; }
      if (tp !== null && !(side > 0 ? tp > fill : tp < fill)) { reject(`El take profit (${tp}) quedó del lado equivocado del precio de entrada (${fill}): en una compra debe estar arriba y en una venta debajo.`); return; }
      if ((sl !== null && !(sl > 0)) || (tp !== null && !(tp > 0))) { reject('El stop loss o el take profit no es un precio válido (mayor que 0).'); return; }
      const entryFee = qty * fill * takerFee;
      cash -= entryFee; st.fees += entryFee;
      pos = { side, qty, entryPrice: fill, entryIdx: i, sl, tp, entryFee };
    }

    function checkStops(i) {
      const p = pos, o = d.open[i], h = d.high[i], l = d.low[i];
      let slHit = false, tpHit = false, slRef = 0, tpRef = 0, slGap = false, tpGap = false;
      if (p.side > 0) {
        if (p.sl !== null && l <= p.sl) { slHit = true; slGap = o <= p.sl; slRef = slGap ? o : p.sl; }
        if (p.tp !== null && h >= p.tp) { tpHit = true; tpGap = o >= p.tp; tpRef = tpGap ? o : p.tp; }
      } else {
        if (p.sl !== null && h >= p.sl) { slHit = true; slGap = o >= p.sl; slRef = slGap ? o : p.sl; }
        if (p.tp !== null && l <= p.tp) { tpHit = true; tpGap = o <= p.tp; tpRef = tpGap ? o : p.tp; }
      }
      if (slHit && tpHit) {
        if (tpGap && !slGap) slHit = false;
        else if (slGap && !tpGap) tpHit = false;
        else { st.ambiguous++; tpHit = false; }
      }
      if (slHit) closePos(i, slRef, 'stop', true);
      else if (tpHit) closePos(i, tpRef, 'objetivo', false);
    }

    // Procesa la vela i: ejecuta la orden pendiente (a la apertura), revisa stops y marca el capital al cierre.
    function step(i) {
      const o = d.open[i];
      if (pending) {
        const q = pending; pending = null;
        if (!isFinite(o)) reject('La vela no tiene precio de apertura.');
        else if (q.kind === 'exit') { if (pos) closePos(i, o, 'señal', true); }
        else {
          const side = q.side === 'long' ? 1 : -1;
          if (!(pos && pos.side === side)) {
            if (pos) closePos(i, o, 'inversión', true);
            openPos(i, o, side, q);
          }
        }
      }
      if (pos) checkStops(i);
      const c = d.close[i];
      let eq = cash + (pos ? (c - pos.entryPrice) * pos.qty * pos.side : 0);
      if (eq <= 0) {
        if (pos) closePos(i, c, 'capital agotado', false);
        cash = Math.max(0, cash); eq = cash; st.busted = true;
      }
      if (pos) st.barsIn++;
      equity[i] = eq;
    }

    // Vista de la posición que recibe el script en cada vela.
    function view(i) {
      if (!pos) return { side: null, entryPrice: null, qty: 0, sl: null, tp: null, entryIndex: null, bars: 0, pnl: 0, equity: equity[i] };
      return {
        side: pos.side > 0 ? 'long' : 'short', entryPrice: pos.entryPrice, qty: pos.qty, sl: pos.sl, tp: pos.tp, entryIndex: pos.entryIdx,
        bars: i - pos.entryIdx, pnl: (d.close[i] - pos.entryPrice) * pos.qty * pos.side, equity: equity[i],
      };
    }

    // Órdenes del script (se aplican en la vela siguiente). La última orden de la vela manda.
    function queueEntry(side, o) { pending = Object.assign({ kind: 'entry', side }, o); }
    function queueExit() { pending = { kind: 'exit' }; }
    // exit({sl, tp, slPct, tpPct}): mueve el stop y/o el objetivo de la posición abierta (rige desde la vela siguiente). null lo quita.
    function setStops(i, o) {
      if (!pos) throw fail('exit({ sl, tp }) solo se puede usar con una posición abierta (revisa pos.side). Para fijar stop y objetivo al entrar usa entry(\'long\', { sl, tp }).');
      const c = d.close[i];
      const val = (abs, pct, sign) => {
        if (abs !== undefined) return abs;
        if (pct !== undefined) return pct === null ? null : pos.entryPrice * (1 + sign * pct / 100);
        return undefined;
      };
      const sl = val(o.sl, o.slPct, -pos.side), tp = val(o.tp, o.tpPct, pos.side);
      if (sl !== undefined && sl !== null && !(pos.side > 0 ? sl < c : sl > c)) throw fail(`exit(): el stop loss (${sl}) debe estar ${pos.side > 0 ? 'debajo' : 'arriba'} del precio actual (${c}).`);
      if (tp !== undefined && tp !== null && !(pos.side > 0 ? tp > c : tp < c)) throw fail(`exit(): el take profit (${tp}) debe estar ${pos.side > 0 ? 'arriba' : 'debajo'} del precio actual (${c}).`);
      if (sl !== undefined) pos.sl = sl;
      if (tp !== undefined) pos.tp = tp;
    }

    function finish() {
      const all = trades.slice();
      const last = n - 1;
      let openPnl = 0;
      if (pos) {
        const c = d.close[last];
        openPnl = (c - pos.entryPrice) * pos.qty * pos.side - pos.entryFee;
        all.push({
          side: pos.side > 0 ? 'long' : 'short', entryIdx: pos.entryIdx, entryTime: d.time[pos.entryIdx], entryPrice: pos.entryPrice,
          exitIdx: last, exitTime: d.time[last], exitPrice: c, qty: pos.qty, pnl: openPnl, pnlPct: (openPnl / (pos.qty * pos.entryPrice)) * 100,
          fees: pos.entryFee, bars: last - pos.entryIdx, reason: 'abierta', open: true, sl: pos.sl, tp: pos.tp,
        });
      }
      all.forEach((t, k) => { t.n = k + 1; });
      const pend = pending ? (pending.kind === 'exit' ? 'cerrar la posición' : (pending.side === 'long' ? 'entrar largo' : 'entrar corto')) : null;
      return { trades: all, equity, report: buildReport(all, equity, d, cfg, st, pend) };
    }

    return { step, view, queueEntry, queueExit, setStops, finish };
  }

  function buildReport(all, equity, d, cfg, st, pend) {
    const n = d.close.length;
    const closed = all.filter((t) => !t.open);
    const wins = closed.filter((t) => t.pnl > 0), losses = closed.filter((t) => t.pnl < 0);
    const sum = (a, f) => a.reduce((s, t) => s + f(t), 0);
    const grossProfit = sum(wins, (t) => t.pnl), grossLoss = -sum(losses, (t) => t.pnl);
    const net = sum(closed, (t) => t.pnl);
    const endEq = n ? equity[n - 1] : cfg.capital;
    let peak = cfg.capital, maxDD = 0, maxDDPct = 0;
    for (let i = 0; i < n; i++) {
      const e = equity[i];
      if (!isFinite(e)) continue;
      if (e > peak) peak = e;
      const dd = peak - e;
      if (dd > maxDD) maxDD = dd;
      if (peak > 0 && (dd / peak) * 100 > maxDDPct) maxDDPct = (dd / peak) * 100;
    }
    const by = (side) => { const a = closed.filter((t) => t.side === side); return { n: a.length, net: sum(a, (t) => t.pnl), wins: a.filter((t) => t.pnl > 0).length }; };
    const openT = all.find((t) => t.open) || null;
    return {
      capital: cfg.capital, capitalEnd: endEq, netClosed: net, netClosedPct: (net / cfg.capital) * 100,
      totalPct: ((endEq - cfg.capital) / cfg.capital) * 100, openPnl: openT ? openT.pnl : 0,
      trades: closed.length, wins: wins.length, losses: losses.length, winRate: closed.length ? (wins.length / closed.length) * 100 : null,
      grossProfit, grossLoss, profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null, noLosses: grossLoss === 0 && grossProfit > 0,
      avgWin: wins.length ? grossProfit / wins.length : null, avgLoss: losses.length ? -grossLoss / losses.length : null,
      expectancy: closed.length ? net / closed.length : null,
      best: closed.length ? Math.max.apply(null, closed.map((t) => t.pnl)) : null, worst: closed.length ? Math.min.apply(null, closed.map((t) => t.pnl)) : null,
      maxDD, maxDDPct, fees: st.fees, avgBars: closed.length ? sum(closed, (t) => t.bars) / closed.length : null,
      long: by('long'), short: by('short'), exposure: n ? (st.barsIn / n) * 100 : 0,
      buyHold: n > 1 && d.close[0] > 0 ? ((d.close[n - 1] - d.close[0]) / d.close[0]) * 100 : null,
      open: openT ? { side: openT.side, pnl: openT.pnl } : null,
      rejected: st.rejected, rejectedWhy: st.rejectedWhy, reduced: st.reduced, ambiguous: st.ambiguous, busted: st.busted, pending: pend,
    };
  }

  const api = { create, fail };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TVBacktest = api;
})(typeof self !== 'undefined' ? self : globalThis);

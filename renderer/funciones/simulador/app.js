'use strict';
// Interfaz del simulador (v0.25). Cálculo puro en calc.js / exits.js / charts.js (mismos archivos probados con npm test).
window.calc = Object.assign({}, window.SimCalc, { analyzeExits: window.SimExits.analyzeExits, analyzeTrade: window.SimExits.analyzeTrade, closeNet: window.SimExits.closeNet, charts: window.SimCharts });
const $ = (id) => document.getElementById(id), C = window.calc, CH = C.charts, N = (id) => +$(id).value;
const f = (n, d = 2) => (n === null || n === undefined || !isFinite(n)) ? '-' : n.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
const sg = (n) => { if (n === null || n === undefined || !isFinite(n)) return '-'; const v = Math.abs(n) < 0.005 ? 0 : n; return (v >= 0 ? '+' : '') + f(v); };
const store = window.SimStore;   // guardado en la carpeta de datos del programa (ver arranque.js)
const PAIRS = { BTCUSDT: '#F7931A', ETHUSDT: '#627EEA', SOLUSDT: '#14F195', BNBUSDT: '#F3BA2F', XRPUSDT: '#00AAE4' };
const el = (cls, html) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
const fld = (id, lab, val, o = {}) => '<div class="' + (o.big ? 'big' : '') + '" id="w_' + id + '"><label for="' + id + '">' + lab + '</label>' + (o.opts ? '<select id="' + id + '">' + o.opts.map((x) => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select>'
  : '<input id="' + id + '" type="number" step="any" value="' + val + '">') + '</div>';
const av = '<i>a verificar</i>';
$('r1').innerHTML = fld('cap', 'Capital total (USDT)', 500) + fld('fee', 'Comisión taker %' + av, 0.05) + fld('mk', 'Comisión maker %' + av, 0.02) + fld('fund', 'Funding % por 8 h' + av, 0.01) + fld('hold', 'Horas con la posición abierta', 0) +
  '<input type="hidden" id="slip" value="0"><input type="hidden" id="clr" value="1.25"><input type="hidden" id="lot" value="0.001"><input type="hidden" id="minn" value="100">';
$('r2').innerHTML = fld('pair', 'Par', 0, { big: 1, opts: Object.keys(PAIRS).map((p) => [p, p]) }) + fld('side', 'Dirección', 0, { big: 1, opts: [['short', 'Short'], ['long', 'Long']] }) +
  fld('mode', 'Modo de margen', 0, { big: 1, opts: [['cross', 'Cruzado'], ['isolated', 'Aislado']] }) + fld('lev', 'Apalancamiento (x)', 50, { big: 1 });
$('scf').innerHTML = '<div><label>Nombre del escenario</label><input id="scn" value="Escenario 1"></div><div style="align-self:end"><button id="scs">Guardar escenario actual</button></div>';
const tierText = (a) => a.map((t) => t.floor + ',' + t.rate + (isFinite(t.maxLev) ? ',' + t.maxLev : '')).join('\n');
$('tiers').value = tierText(C.DEFAULT_TIERS);
const heat = (x) => x <= 20 ? '#6ec6ff' : x <= 35 ? '#e1ad01' : x <= 50 ? '#ff6a00' : '#ff2d2d';
const SIDEC = { short: '#ff4d4f', long: '#2ecc71' }, MODEC = { cross: '#13dbf3', isolated: '#9fb4cc' };
function paint() { const set = (id, c) => $('w_' + id).style.setProperty('--c', c);
  set('pair', PAIRS[$('pair').value]); set('side', SIDEC[$('side').value]); set('mode', MODEC[$('mode').value]); set('lev', heat(N('lev'))); set('sl', '#ff9f1a'); set('lgt', '#ffb020'); }

// ---- modo de salida: cierres parciales O take profit (nunca los dos) ----
let xmode = null;
function applyMode() {
  $('ppanel').hidden = xmode !== 'closes'; $('tpanel').hidden = xmode !== 'tp';
  $('bpc').classList.toggle('on', xmode === 'closes'); $('btp').classList.toggle('on', xmode === 'tp');
  $('bpc').disabled = xmode === 'tp'; $('btp').disabled = xmode === 'closes';
  $('bpc').title = xmode === 'tp' ? 'Bloqueado: estás usando take profit' : ''; $('btp').title = xmode === 'closes' ? 'Bloqueado: estás usando cierres parciales' : '';
}
// ---- entradas (vacías por defecto) ----
function titles() { [...$('ent').children].forEach((d, i) => { d.querySelector('h3').textContent = i === 0 ? 'Entrada inicial' : 'Promediación ' + i; }); }
function addSlot(price, pct, type) {
  const d = el('slot', '<h3></h3><div class="sf"><div><label>Precio de entrada</label><input class="p" type="number" step="any" value="' + price + '"></div><div><label>% del saldo disponible</label><input class="m" type="number" step="any" value="' + pct + '"></div>' +
    '<div><label>Tipo</label><select class="t"><option value="taker">A mercado (taker)</option><option value="maker">Límite (maker)</option></select></div><div><button class="x">Quitar</button></div></div><div class="info av" style="margin-top:6px"></div>');
  d.querySelector('.t').value = type || 'taker';
  d.querySelector('.x').onclick = () => { if ([...$('ent').children].indexOf(d) >= 4) d.remove(); else { d.querySelector('.p').value = ''; d.querySelector('.m').value = ''; } titles(); run(); };
  $('ent').appendChild(d); titles();
}
function pcRows(vals) {
  const old = vals || [...$('pcrows').children].map((r) => [r.querySelector('.cp').value, r.querySelector('.cq').value, r.dataset.ok || '']); $('pcrows').innerHTML = '';
  for (let i = 0; i < N('pcn'); i++) { const o = old[i] || ['', '', ''];
    const d = el('orow', '<h3>Cierre ' + (i + 1) + '</h3><div class="sf3"><div><label>Precio de cierre</label><input class="cp" type="number" step="any" value="' + o[0] + '"></div><div><label>% de la posición</label><input class="cq" type="number" step="any" value="' + o[1] + '"></div></div><div class="res"></div>');
    d.dataset.ok = o[2] || ''; $('pcrows').appendChild(d); }
  $('pcrows').style.gridTemplateColumns = 'repeat(' + Math.min(N('pcn'), 3) + ',minmax(0,1fr))';
}
function tpRows(vals) {
  const total = $('tpm').value === 'total', n = total ? 1 : N('tpn');
  const old = vals || [...$('tprows').children].map((r) => [r.querySelector('.tp').value, r.querySelector('.tq').value]); $('tprows').innerHTML = '';
  for (let i = 0; i < n; i++) { const o = old[i] || ['', ''];
    $('tprows').appendChild(el('orow', '<h3>' + (total ? 'Take profit total' : 'TP ' + (i + 1)) + '</h3><div class="sf3"><div><label>Precio del TP</label><input class="tp" type="number" step="any" value="' + o[0] + '"></div><div><label>' + (total ? '% de la posición' : '% de lo que queda') + '</label><input class="tq" type="number" step="any" value="' + (total ? 100 : o[1]) + '"' + (total ? ' disabled' : '') + '></div></div><div class="res"></div>')); }
  $('tprows').style.gridTemplateColumns = 'repeat(' + Math.min(n, 3) + ',minmax(0,1fr))';
  $('tpnw').hidden = total; $('tpnote').textContent = total ? 'El TP total cierra todo lo que quede de la posición.' : 'Cada TP es un % de lo que queda de la posición.';
}
function addDep(v) { $('deps').appendChild(el('', '<label>Depósito ' + ($('deps').children.length + 1) + ' (USDT)</label><input class="dep" type="number" step="any" value="' + (v || '') + '">')); }
function read() {
  const entries = []; [...$('ent').children].forEach((r, i) => { const p = +r.querySelector('.p').value, m = +r.querySelector('.m').value, on = p > 0 && m > 0; r.classList.toggle('on', on); r.querySelector('.info').textContent = '';
    if (on) entries.push({ price: p, marginPct: m, type: r.querySelector('.t').value, name: i === 0 ? 'Inicial' : 'Prom. ' + i, slot: r }); });
  return { entries, tiers: C.parseTiers($('tiers').value), common: { side: $('side').value, capital: N('cap'), leverage: N('lev'), mode: $('mode').value, takerFee: N('fee') / 100, makerFee: N('mk') / 100,
    slippagePct: N('slip'), fundingRatePct: N('fund'), holdHours: N('hold'), clearanceFeePct: N('clr'), lotStep: N('lot'), minNotional: N('minn'), tmm: 0, upnl: 0, pctBase: 'available' } };
}
const card = (k, v, cls, sub) => '<div class="kc ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
const posneg = (n, txt) => '<span class="' + (n >= 0 ? 'pos' : 'neg') + '">' + txt + '</span>';
const cell = (n, extra) => '<td class="' + (n >= 0 ? 'pos' : 'neg') + '">' + sg(n) + (extra ? ' <small>' + extra + '</small>' : '') + '</td>';
const hint = '<p class="av">Completa las entradas para calcular.</p>';
let last = null;
function run() {
  paint(); applyMode();
  const { entries, tiers, common } = read(), coin = $('pair').value.replace('USDT', '');
  const ready = entries.length && tiers.length && common.capital > 0 && common.leverage > 0, sl = N('sl') || null;
  const pend = [], closes = [], tps = [], cRows = [...$('pcrows').children], tRows = [...$('tprows').children];
  cRows.concat(tRows).forEach((r) => { r.querySelector('.res').innerHTML = ''; });
  const bpcn = cRows.filter((r) => +r.querySelector('.cp').value > 0 && +r.querySelector('.cq').value > 0).length, btpn = tRows.filter((r) => +r.querySelector('.tp').value > 0).length;
  $('bpcn').textContent = bpcn ? '(' + bpcn + ')' : ''; $('btpn').textContent = btpn ? '(' + btpn + ')' : '';
  if (!ready) { $('dash').innerHTML = '<div class="empty">Completa la entrada inicial (precio y % del saldo disponible) para ver el reporte del trade.</div>'; $('outA').innerHTML = hint; $('outB').innerHTML = hint; $('outC').innerHTML = hint; last = null; return; }
  const st = C.simulateLadder({ ...common, entries, tiers, sl }), L = st[st.length - 1], nm = (s) => entries[s.n - 1].name, mTot = st.reduce((a, s) => a + s.margin, 0);
  if (L.totalQty <= 0) { $('dash').innerHTML = '<div class="empty">La orden no alcanza el tamaño mínimo. Sube el %.</div>'; last = null; return; }
  st.forEach((s, i) => { entries[i].slot.querySelector('.info').textContent = 'Saldo disponible antes: ' + f(s.availBefore) + ' USDT → margen ' + f(s.margin) + ' USDT (' + f(entries[i].marginPct, 1) + '% del saldo disponible)'; });
  const price = entries[entries.length - 1].price, fee = { makerFee: common.makerFee, takerFee: common.takerFee, slippagePct: common.slippagePct };
  if (xmode === 'closes') {
    cRows.forEach((r) => { const p = +r.querySelector('.cp').value, q = +r.querySelector('.cq').value; if (!(p > 0 && q > 0)) return;
      const cn = C.closeNet({ side: common.side, qty: L.totalQty, avg: L.avgEntry, pct: q, price: p, type: $('pct').value, ...fee }), key = p + '|' + q;
      if (cn.net < 0 && r.dataset.ok !== key) { r.querySelector('.res').innerHTML = '<span class="neg">Va a cerrar ' + f(q, 1) + '% de su posición con una pérdida de ' + f(-cn.net) + ' USDT. ¿Desea continuar con el cierre?</span> <button data-a="yes">Sí</button> <button data-a="no">No</button>'; pend.push('Cierre pendiente de confirmar (pérdida de ' + f(-cn.net) + ' USDT)'); return; }
      closes.push({ price: p, pct: q, row: r }); });
  } else if (xmode === 'tp') tRows.forEach((r) => { const p = +r.querySelector('.tp').value, q = +r.querySelector('.tq').value; if (p > 0 && q > 0) tps.push({ price: p, pct: q, row: r }); });
  const tr = C.analyzeTrade({ ...common, avgEntry: L.avgEntry, qty: L.totalQty, entryFees: L.fees, funding: L.fundingCost, leverage: common.leverage, closes: closes.map((c) => ({ price: c.price, pct: c.pct })), closeType: $('pct').value,
    tps: tps.map((t) => ({ price: t.price, pct: t.pct })), sl, liq: L.liq, wb: L.wb, tiers });
  const rowTxt = (r, head) => head + ' ' + posneg(r.net, sg(r.net) + ' USDT (' + sg(r.netPctCapital) + '% del capital)') + '<br><span class="av">Sobre entrada promedio ' + f(L.avgEntry) + ' · margen liberado ' + f(r.marginReleased) + ' · vuelve a la cuenta ' + f(r.returns) + ' USDT · liquidación del resto: ' + (r.liqAfter === null ? '-' : f(r.liqAfter)) + '</span>';
  tr.closeRows.forEach((r, i) => { closes[i].row.querySelector('.res').innerHTML = rowTxt(r, 'Cierra ' + f(r.pct, 1) + '% (' + f(r.qty, 4) + ' ' + coin + ') a ' + f(r.price) + ' →') + (r.net < 0 ? ' <span class="av">(confirmado)</span>' : ''); });
  tr.tpRows.forEach((r, i) => { tps[i].row.querySelector('.res').innerHTML = rowTxt(r, 'Ganancia neta de este TP:'); });
  // coherencia: una sola distancia objetivo para exposición máxima y salvavidas
  const lgt = N('lgt'), cur = L.liq === null ? Infinity : Math.abs(L.liqDistancePct), mini = (h) => '<div class="mini">' + h + '</div>', one = (h) => '<div class="mini" style="grid-template-columns:1fr">' + h + '</div>';
  $('outB').innerHTML = mini(card('Hoy', cur === Infinity ? 'sin liquidación' : f(cur, 1) + '%', '', 'liquidación a esa distancia de ' + f(price)) + card('Objetivo', lgt > 0 ? f(lgt, 1) + '%' : '-', '', lgt > 0 ? '' : 'ingresa un valor')) +
    (lgt > 0 ? one(cur >= lgt ? card('Estado', 'Cumples', 'good', 'sobran ' + f(cur - lgt, 1) + ' puntos de distancia') : card('Estado', 'No cumples', 'hi', 'faltan ' + f(lgt - cur, 1) + ' puntos de distancia')) : '') + '<p class="av">Este objetivo alimenta la exposición máxima y el salvavidas.</p>';
  const ex = lgt > 0 ? C.exposureForTarget({ ...common, tiers, entries, targetDistancePct: lgt }) : null;
  $('outA').innerHTML = ex ? '<p>' + (ex.limitedByCapital ? 'Aun usando todo tu saldo disponible cumples el objetivo.' : ex.k < 0.9999 ? 'Para llegar a ' + f(lgt, 1) + ' % reduce todos tus % a <b class="ok">×' + f(ex.k, 2) + '</b>.' : 'Con tus precios puedes subir tus % hasta <b class="ok">×' + f(ex.k, 2) + '</b>.') + '</p>' +
    '<table class="t"><tr><th>Entrada</th><th>Tu %</th><th>Máximo %</th><th>Margen máx.</th></tr>' + entries.map((e, i) => '<tr><td class="key">' + e.name + '</td><td>' + f(e.marginPct, 1) + '%</td><td class="' + (ex.pcts[i] >= e.marginPct ? 'ck' : 'xk') + '">' + f(ex.pcts[i], 2) + '%</td><td>' + f(ex.margins[i]) + ' USDT</td></tr>').join('') + '</table>' +
    mini(card('Margen total máximo', f(ex.totalMarginPct, 1) + '%', 'good', 'de la cuenta (hoy usas ' + f(L.totalMarginPct, 1) + '%)') + card('Liquidación con el máximo', f(ex.finalLiq), 'hi', 'a ' + f(ex.finalDistancePct, 1) + '% del precio')) + '<p class="av">% sobre el saldo disponible. El lote de 0,001 hace que el resultado avance por escalones.</p>' : '<p class="av">Ingresa la distancia objetivo para ver cuánto puedes arriesgar por entrada.</p>';
  const deps = [...$('deps').querySelectorAll('.dep')].map((i) => +i.value).filter((n) => n > 0);
  const g = (deps.length || lgt > 0) ? C.lifeguard({ side: common.side, qty: L.totalQty, avgEntry: L.avgEntry, wb: L.wb, price, tiers, deposits: deps, targetDistancePct: lgt }) : null;
  $('outC').innerHTML = g ? (g.needed ? one(card('Para llegar al objetivo agrega', '+' + f(g.needed.amount) + ' USDT', g.needed.amount === 0 ? 'good' : 'hi', 'liquidación en ' + f(g.needed.liq))) : '') +
    (deps.length ? '<table class="t"><tr><th>Depósito</th><th>Liquidación</th><th>Distancia</th>' + (lgt > 0 ? '<th>Objetivo</th>' : '') + '</tr>' + g.rows.map((r, i) => '<tr><td class="key">' + (i ? '+' + f(r.total) : 'sin depósito') + '</td><td class="' + (i ? 'ck' : '') + '">' + (r.liq === null ? 'sin liquidación' : f(r.liq)) + '</td><td>' + (r.distancePct === null ? '-' : f(Math.abs(r.distancePct), 1) + '%') + '</td>' + (lgt > 0 ? '<td class="' + (r.distancePct === null || Math.abs(r.distancePct) >= lgt ? 'ck' : 'xk') + '">' + (r.distancePct === null || Math.abs(r.distancePct) >= lgt ? '✓' : '✗') + '</td>' : '') + '</tr>').join('') + '</table>' : '<p class="av">Ingresa depósitos para ver cuánto se aleja la liquidación.</p>') : '<p class="av">Ingresa depósitos o una distancia objetivo.</p>';
  last = { L, tr };
  $('dash').innerHTML = dash({ coin, common, entries, st, L, tr, nm, mTot, price, sl, g, ex, lgt, cur, pend });
}
function dash(x) {
  const { coin, common, entries, st, L, tr, nm, mTot, price, sl, g, ex, lgt, cur, pend } = x, cap = common.capital, ss = st.filter((s) => s.equity !== undefined), side = common.side;
  const rows = xmode === 'closes' ? tr.closeRows : xmode === 'tp' ? tr.tpRows : [], rn = (r) => xmode === 'closes' ? 'Cierre ' + r.n : (tr.tpRows.length > 1 ? 'TP ' + r.n : 'TP total');
  let h = '<div class="strip"><span class="pill" style="--c:' + PAIRS[$('pair').value] + '">' + $('pair').value + '</span><span class="pill" style="--c:' + SIDEC[side] + '">' + (side === 'short' ? 'SHORT' : 'LONG') + '</span><span class="pill" style="--c:' + MODEC[common.mode] + '">' + (common.mode === 'cross' ? 'Cruzado' : 'Aislado') + '</span><span class="pill" style="--c:' + heat(common.leverage) + '">' + common.leverage + 'x</span><span class="pill">Capital ' + f(cap) + ' USDT</span></div>';
  // 1) ganar vs perder primero
  const win = tr.bestCase, loss = tr.slWhole ? tr.slWhole.total : null, gl = xmode === 'closes' ? 'Si se cumplen tus cierres parciales' : xmode === 'tp' ? 'Si se cumplen tus TP' : 'Tu escenario de ganancia';
  h += '<div class="vs"><div class="box" style="--c:var(--ok)"><div class="k">' + gl + '</div><div class="v">' + (win === null ? '-' : sg(win) + ' USDT') + '</div><div class="sub">' + (win === null ? 'elige cierres parciales o TP en Salidas' : sg(win / cap * 100) + '% del capital · neto de comisiones y funding') + '</div></div>' +
    '<div class="mid">VS' + (tr.rr !== null ? '<br>1 : ' + f(tr.rr) : '') + '</div><div class="box" style="--c:var(--acc)"><div class="k">Si toca el stop loss</div><div class="v">' + (loss === null ? '-' : sg(loss) + ' USDT') + '</div><div class="sub">' + (loss === null ? 'agrega un stop loss en Salidas' : sg(loss / cap * 100) + '% del capital' + (tr.slAfterCloses ? ' · con tus cierres parciales antes: ' + sg(tr.slAfterCloses.total) + ' USDT' : '')) + '</div></div></div>';
  if (win > 0 && loss < 0) { const tot = win + Math.abs(loss); h += '<div class="meter"><i style="width:' + win / tot * 100 + '%;background:var(--ok)"></i><i style="width:' + Math.abs(loss) / tot * 100 + '%;background:var(--acc)"></i></div>'; }
  h += '<div class="bigcards">' + card('Liquidación final', L.liq === null ? 'sin liquidación' : f(L.liq), 'hi', L.liqDistancePct === null ? '' : 'a ' + f(Math.abs(L.liqDistancePct), 1) + '% del precio ' + f(price)) + card('Entrada promedio', f(L.avgEntry), '', f(L.totalQty, 4) + ' ' + coin) +
    card('Tamaño de la posición', f(L.totalNotional) + ' USDT', '', 'margen ' + f(mTot) + ' USDT (' + f(L.totalMarginPct, 1) + '% de la cuenta)') + card('Ratio de margen', f(L.marginRatioPct, 1) + '%', L.marginRatioPct >= 80 ? 'hi' : '', 'Binance avisa desde 80%') +
    card('Punto de equilibrio', f(L.breakEvenTaker), '', 'con orden límite: ' + f(L.breakEvenMaker)) + card('Riesgo hasta el stop', tr.riskPct === null ? '-' : f(tr.riskPct) + '%', tr.riskPct === null ? '' : 'hi', tr.riskUSDT === null ? 'agrega un stop loss' : f(tr.riskUSDT) + ' USDT del capital') +
    card('Mejor escenario', win === null ? '-' : sg(win) + ' USDT', win === null ? '' : 'good', win === null ? 'elige cierres parciales o TP' : sg(win / cap * 100) + '% del capital') + card('Riesgo / beneficio', tr.rr === null ? '-' : '1 : ' + f(tr.rr), '', 'beneficio del escenario / pérdida en el stop') + '</div>';
  // 2) liquidación después de cada cierre o TP
  if (rows.length) {
    let prev = L.liq, cs = card('Después de la última promediación', L.liq === null ? 'sin liquidación' : f(L.liq), 'hi', cur === Infinity ? '' : 'a ' + f(cur, 1) + '% del precio ' + f(price)), back = 0;
    rows.forEach((r) => { back += r.returns; const label = 'Después del ' + rn(r).toLowerCase() + (xmode === 'closes' ? ' (' + (r.n > 1 ? '+' + f(r.pct, 0) + '%: ' + f(r.closedPctTotal, 0) + '% en total' : f(r.pct, 0) + '% de la posición') + ')' : ' (' + f(r.pct, 0) + '%)');
      if (r.liqAfter === null) { cs += card(label, '-', '', 'posición cerrada o modo aislado · vuelve a la cuenta ' + f(back) + ' USDT'); return; }
      const moved = r.liqAfter - prev, far = side === 'short' ? moved > 0 : moved < 0, d = Math.abs(r.liqAfter - r.price) / r.price * 100;
      cs += card(label, f(r.liqAfter), far ? 'far' : 'near', (far ? 'se alejó ' : 'se acercó ') + f(Math.abs(moved)) + ' USDT (' + f(Math.abs(moved) / prev * 100, 1) + '%)<br>queda a ' + f(d, 1) + '% de ' + f(r.price) + '<br>vuelve a la cuenta: ' + f(back) + ' USDT'); prev = r.liqAfter; });
    h += '<div class="sec">Liquidación después de cada ' + (xmode === 'closes' ? 'cierre' : 'TP') + '</div><div class="stages">' + cs + '</div>';
  }
  // 3) mapa de precios
  const markers = [...entries.map((e) => ({ label: e.name, price: e.price, kind: 'entry' })), { label: 'Promedio', price: L.avgEntry, kind: 'avg' }, { label: 'Equilibrio', price: L.breakEvenTaker, kind: 'be' }, { label: 'Liquidación', price: L.liq, kind: 'liq' }, { label: 'Stop', price: sl, kind: 'sl' },
    ...rows.map((r) => ({ label: rn(r), price: r.price, kind: xmode === 'closes' ? 'close' : 'tp' }))];
  h += '<div class="chartbox"><h3>Mapa de precios</h3>' + CH.priceMap(markers, { side, avg: L.avgEntry }) + '</div>';
  const items = []; if (tr.slWhole) items.push({ label: 'Pérdida si toca el stop', value: tr.slWhole.total, text: sg(tr.slWhole.total) });
  if (tr.slAfterCloses) items.push({ label: 'Stop tras tus cierres', value: tr.slAfterCloses.total, text: sg(tr.slAfterCloses.total) });
  rows.forEach((r) => items.push({ label: rn(r) + ' (' + f(r.pct, 0) + '%)', value: r.net, text: sg(r.net) })); if (win !== null) items.push({ label: 'Total del escenario (neto)', value: win, text: sg(win) });
  const dist = ss.filter((s) => s.liqDistancePct !== null).map((s) => ({ label: nm(s), value: Math.abs(s.liqDistancePct), text: f(Math.abs(s.liqDistancePct), 1) + '%', sub: 'Liq. ' + f(s.liq, 0), color: 'var(--acc)' }));
  rows.forEach((r) => { if (r.liqAfter !== null) dist.push({ label: 'Tras ' + rn(r).toLowerCase(), value: Math.abs(r.liqAfter - r.price) / r.price * 100, text: f(Math.abs(r.liqAfter - r.price) / r.price * 100, 1) + '%', sub: 'Liq. ' + f(r.liqAfter, 0), color: 'var(--ok)' }); });
  h += '<div class="cg"><div class="chartbox"><h3>Resultado por escenario (USDT)</h3>' + (items.length ? CH.barsPnL(items) : '<div class="empty">Agrega un stop loss y elige cierres parciales o TP.</div>') + '</div>' +
    '<div class="chartbox"><h3>Distancia a la liquidación</h3><p class="av">Rojo: tras cada entrada. Verde: tras cada ' + (xmode === 'closes' ? 'cierre' : 'TP') + '. Más alto = más lejos.</p>' + CH.bars(dist) + '</div>' +
    '<div class="chartbox"><h3>Uso de la cuenta</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center"><div>' + CH.donut(L.totalMarginPct, 'margen usado', 'var(--cy)') + '<div class="av">' + f(mTot) + ' de ' + f(cap) + ' USDT</div></div><div>' + CH.donut(Math.min(L.marginRatioPct, 100), 'ratio de margen', L.marginRatioPct >= 80 ? 'var(--acc)' : 'var(--ok)') + '<div class="av">mant. ' + f(L.mm) + ' / saldo ' + f(L.equity) + '</div></div></div></div></div>';
  // 4) tablas
  if (rows.length) h += '<div class="sec">Ganancia de cada ' + (xmode === 'closes' ? 'cierre' : 'TP') + '</div><div style="overflow-x:auto"><table class="t"><tr><th>Salida</th><th>Precio</th><th>% que cierra</th><th>Resultado neto</th><th>Margen liberado</th><th>Vuelve a la cuenta</th><th>Liquidación del resto</th></tr>' +
    rows.map((r) => '<tr><td class="key">' + rn(r) + '</td><td>' + f(r.price) + '</td><td>' + f(r.pct, 1) + '%</td>' + cell(r.net, '(' + sg(r.netPctCapital) + '%)') + '<td>' + f(r.marginReleased) + '</td><td>' + f(r.returns) + '</td><td>' + (r.liqAfter === null ? '-' : f(r.liqAfter)) + '</td></tr>').join('') + '</table></div><p class="av">Resultado neto = ganancia o pérdida menos la comisión de la salida. El total del escenario descuenta además comisiones de entrada (' + f(L.fees) + ') y funding (' + sg(L.fundingCost) + ').</p>';
  h += '<div class="sec">Entradas y liquidación</div><div style="overflow-x:auto"><table class="t"><tr><th>Entrada</th><th>Precio</th><th>Margen</th><th>Posición</th><th>Entrada prom.</th><th>Liquidación</th><th>Distancia</th><th>Si toca el stop</th></tr>' +
    st.map((s) => '<tr><td class="key">' + nm(s) + ' <small class="av">(' + (s.type === 'maker' ? 'límite' : 'mercado') + ')</small></td><td>' + f(s.price) + '</td><td>' + f(s.margin) + '</td><td>' + f(s.totalNotional) + '</td><td>' + f(s.avgEntry) + '</td><td class="xk">' + (s.liq === null ? 'sin liquidación' : f(s.liq)) + '</td><td>' + (s.liqDistancePct === null ? '-' : f(Math.abs(s.liqDistancePct), 1) + '%') + '</td>' + (s.slNet === null ? '<td>-</td>' : cell(s.slNet, '(' + sg(s.slNetPctCapital) + '%)')) + '</tr>').join('') + '</table></div>';
  h += '<div class="sec">Estado de la cuenta</div><div class="bigcards" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">' + card('PnL no realizado', sg(L.upnl) + ' USDT', L.upnl < 0 ? 'hi' : 'good') + card('Saldo (equity)', f(L.equity) + ' USDT') + card('Margen de mantenimiento', f(L.mm) + ' USDT') + card('Margen libre', L.freeMargin === null ? '-' : f(L.freeMargin) + ' USDT') +
    card('Comisión si te liquidan', L.liqInfo ? f(L.liqInfo.clearanceFee) + ' USDT' : '-') + card('Saldo que quedaría', L.liqInfo ? f(L.liqInfo.remaining) + ' USDT' : '-') + '</div>' +
    '<div style="overflow-x:auto"><table class="t"><tr><th>Entrada</th><th>PnL no realizado</th><th>Saldo</th><th>Mantenimiento</th><th>Ratio de margen</th><th>Margen libre</th></tr>' + ss.map((s) => '<tr><td class="key">' + nm(s) + '</td>' + cell(s.upnl) + '<td>' + f(s.equity) + '</td><td>' + f(s.mm) + '</td><td class="' + (s.marginRatioPct >= 80 ? 'xk' : '') + '">' + f(s.marginRatioPct, 1) + '%</td><td>' + (s.freeMargin === null ? '-' : f(s.freeMargin)) + '</td></tr>').join('') + '</table></div>';
  if (lgt > 0) h += '<div class="sec">Objetivo de liquidación a ' + f(lgt, 1) + '%</div><p>Hoy estás a <b>' + (cur === Infinity ? 'sin liquidación' : f(cur, 1) + '%') + '</b>. ' + (cur >= lgt ? '<span class="ck">Cumples el objetivo.</span> ' : '<span class="xk">No lo cumples.</span> ') +
    (ex ? 'Reduciendo todos tus % a ×' + f(ex.k, 2) + ' (margen total máx. ' + f(ex.totalMarginPct, 1) + '% de la cuenta) o ' : '') + (g && g.needed ? 'agregando <b class="ok">' + f(g.needed.amount) + ' USDT</b> de saldo se logra.' : '') + '</p>';
  const warns = [...st.flatMap((s) => s.warn.map((w) => nm(s) + ': ' + w)), ...tr.warn, ...pend];
  if ($('pair').value !== 'BTCUSDT' && !store.get('ar_pairs', {})[$('pair').value]) warns.push('Los tramos de ' + $('pair').value + ' son los de BTCUSDT por defecto: pega los reales abajo y pulsa Guardar.');
  h += warns.map((w) => '<div class="w">' + w + '</div>').join('') + '<p class="av">Estimación con precio de marca, sin señales. Cierres parciales: a mercado o límite según tu elección; TP = límite (maker); stop = a mercado (taker). A verificar: comisiones, funding, tramos de margen.</p>';
  return h;
}
// ---- escenarios, pares, eventos ----
function renderScen() {
  const a = store.get('ar_scen', []);
  $('out6').innerHTML = a.length ? '<table class="t"><tr><th>Escenario</th><th>Par</th><th>Dirección</th><th>Cap.</th><th>Apal.</th><th>Entrada prom.</th><th>Liquidación</th><th>Distancia</th><th>Riesgo %</th><th>Mejor escenario</th><th></th></tr>' +
    a.map((s, i) => '<tr><td class="key">' + s.name + '</td><td>' + (s.pair || '-') + '</td><td>' + s.side + '</td><td>' + f(s.cap) + '</td><td>' + s.lev + 'x</td><td>' + f(s.avg) + '</td><td class="xk">' + (s.liq === null ? '-' : f(s.liq)) + '</td><td>' + (s.dist === null ? '-' : f(Math.abs(s.dist), 1) + '%') + '</td><td>' + f(s.risk) + '</td>' + (s.tot === null || s.tot === undefined ? '<td>-</td>' : cell(s.tot)) + '<td><button data-l="' + i + '">Cargar</button> <button data-d="' + i + '">Quitar</button></td></tr>').join('') + '</table>' : '<p class="av">Aún no hay escenarios guardados.</p>';
}
const SNAP = '#r1 input,#r1 select,#r2 input,#r2 select,#sl,#pcn,#pct,#tpm,#tpn,#lgt';
function snapshot() { const v = {}; document.querySelectorAll(SNAP).forEach((e) => { v[e.id] = e.value; });
  return { v, xm: xmode, ent: [...$('ent').children].map((r) => [r.querySelector('.p').value, r.querySelector('.m').value, r.querySelector('.t').value]), pc: [...$('pcrows').children].map((r) => [r.querySelector('.cp').value, r.querySelector('.cq').value, r.dataset.ok || '']),
    tp: [...$('tprows').children].map((r) => [r.querySelector('.tp').value, r.querySelector('.tq').value]), deps: [...$('deps').querySelectorAll('.dep')].map((i) => i.value), tiers: $('tiers').value }; }
function restore(s) { Object.keys(s.v).forEach((k) => { if ($(k)) $(k).value = s.v[k]; }); xmode = s.xm || null; $('ent').innerHTML = ''; s.ent.forEach((r) => addSlot(r[0], r[1], r[2])); while ($('ent').children.length < 4) addSlot('', '', 'taker');
  pcRows(s.pc); tpRows(s.tp); $('deps').innerHTML = ''; (s.deps.length ? s.deps : ['', '']).forEach((v) => addDep(v)); $('tiers').value = s.tiers; run(); }
$('scs').onclick = () => { if (!last) return; const a = store.get('ar_scen', []); a.push({ name: $('scn').value || 'Escenario', pair: $('pair').value, side: $('side').value, cap: N('cap'), lev: N('lev'), avg: last.L.avgEntry, liq: last.L.liq, dist: last.L.liqDistancePct, risk: last.tr.riskPct, tot: last.tr.bestCase, snap: snapshot() }); store.set('ar_scen', a); renderScen(); };
$('out6').onclick = (e) => { const a = store.get('ar_scen', []), l = e.target.dataset.l, d = e.target.dataset.d; if (l !== undefined) restore(a[+l].snap); if (d !== undefined) { a.splice(+d, 1); store.set('ar_scen', a); renderScen(); } };
$('pair').onchange = () => { const p = store.get('ar_pairs', {})[$('pair').value]; $('tiers').value = p ? p.tiers : tierText(C.DEFAULT_TIERS); if (p) { $('lot').value = p.lot; $('minn').value = p.minn; }
  $('pnote').textContent = p || $('pair').value === 'BTCUSDT' ? '' : 'Estos son los tramos de BTCUSDT por defecto. Pega los reales de ' + $('pair').value + ' y pulsa Guardar.'; run(); };
$('psave').onclick = () => { const p = store.get('ar_pairs', {}); p[$('pair').value] = { tiers: $('tiers').value, lot: $('lot').value, minn: $('minn').value }; store.set('ar_pairs', p); $('pnote').textContent = ''; run(); };
$('bpc').onclick = () => { xmode = xmode === 'closes' ? null : 'closes'; run(); }; $('btp').onclick = () => { xmode = xmode === 'tp' ? null : 'tp'; run(); };
$('pcn').onchange = () => { pcRows(); run(); }; $('tpm').onchange = () => { tpRows(); run(); }; $('tpn').onchange = () => { tpRows(); run(); };
$('pcrows').onclick = (e) => { const a = e.target.dataset.a; if (!a) return; const r = e.target.closest('.orow'); if (a === 'yes') r.dataset.ok = r.querySelector('.cp').value + '|' + r.querySelector('.cq').value; else r.querySelector('.cp').value = ''; run(); };
$('add').onclick = () => { addSlot('', '', 'taker'); run(); }; $('adddep').onclick = () => { if ($('deps').children.length < 8) addDep(''); }; document.addEventListener('input', run);
renderScen(); for (let i = 0; i < 4; i++) addSlot('', '', 'taker'); pcRows(); tpRows(); addDep(''); addDep(''); run();

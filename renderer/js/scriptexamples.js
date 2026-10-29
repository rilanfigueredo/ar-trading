// Ejemplos de scripts (v0.20) y de estrategias (v0.21) para copiar y cambiar.
(function (root) {
  'use strict';
  root.TVScriptExamples = [
    {
      name: 'Media móvil (ejemplo)',
      code: `// Media móvil sobre el precio.
// Los números y el color se cambian en el panel «Aplicados en este gráfico», sin tocar el código.
indicator({ name: 'Mi media', overlay: true });

const largo = input('Largo', 50, { min: 2, max: 500 });
const tipo = input('Tipo', 'EMA', { options: ['SMA', 'EMA'] });
const color = inputColor('Color', '#ff9800');

const media = tipo === 'SMA' ? ta.sma(close, largo) : ta.ema(close, largo);
plot(media, { color: color, width: 2, title: tipo + ' ' + largo });
`,
    },
    {
      name: 'RSI propio (ejemplo)',
      code: `// RSI en un panel aparte, con suavizado opcional y niveles.
indicator({ name: 'Mi RSI', overlay: false, precision: 2 });

const largo = input('Largo', 14, { min: 2, max: 200 });
const suavizado = input('Suavizado de la línea', 1, { min: 1, max: 50 });
const alto = input('Nivel alto', 70);
const bajo = input('Nivel bajo', 30);
const color = inputColor('Color', '#7e57c2');

const rsi = ta.rsi(close, largo);
const linea = suavizado > 1 ? ta.sma(rsi, suavizado) : rsi;

plot(linea, { color: color, width: 2, title: 'RSI' });
hline(alto, { color: '#f23645', title: 'Alto' });
hline(bajo, { color: '#26a69a', title: 'Bajo' });
hline(50, { color: '#787b86', style: 'dotted' });
`,
    },
    {
      name: 'Presión de compra (ejemplo, usa volumen de compra)',
      code: `// Porcentaje del volumen de cada vela que fue compra (50 = equilibrio).
// Necesita volumen de compra: Binance con velas del exchange o con operaciones reales.
indicator({ name: 'Presión de compra', overlay: false, precision: 1 });

if (!hasBuy) {
  throw new Error('Este gráfico no tiene volumen de compra. Usa Binance (velas del exchange o operaciones reales).');
}

const suavizado = input('Suavizado', 10, { min: 1, max: 200 });
const colorLinea = inputColor('Color suavizado', '#2962ff');
const colorFino = inputColor('Color por vela', '#787b86');

// % de compra de cada vela; si no hubo volumen, queda en blanco (no se inventa un valor)
const pct = buy.map(function (b, i) { return volume[i] > 0 ? (100 * b) / volume[i] : NaN; });

plot(pct, { color: colorFino, width: 1, title: '% por vela' });
plot(ta.sma(pct, suavizado), { color: colorLinea, width: 2, title: '% suavizado' });
hline(50, { color: '#787b86', style: 'dashed' });
`,
    },
    {
      name: 'Swings (3 velas + barrido + ruptura)',
      code: `// SWINGS con 3 reglas (alto y bajo). Los pasos son estos:
//  1) PIVOTE DE 3 VELAS. Swing ALTO: la vela del centro tiene el máximo mayor que la vela de la izquierda y que la de la derecha.
//     Swing BAJO: lo mismo con el mínimo (menor que los dos vecinos).
//  2) BARRIDO DE LIQUIDEZ. Después del pivote, alguna vela de la derecha (la 3.ª, la 4.ª, la 5.ª... no importa cuántas) tiene que
//     tomar el MÍNIMO de la vela del máximo (swing alto) o el MÁXIMO de la vela del mínimo (swing bajo). Si antes de eso el precio
//     hace un máximo mayor (swing alto) o un mínimo menor (swing bajo), la vela de referencia pasa a ser esa vela de mecha más
//     extrema. Si nunca hay barrido, el swing NO es válido y no se dibuja.
//  3) RUPTURA CON CUERPO. Tras el barrido, una vela debe CERRAR por encima del máximo (swing alto) o por debajo del mínimo
//     (swing bajo). Solo la mecha no cuenta: tiene que cerrar con el cuerpo.
// Dibujo: círculo en la vela del swing, línea horizontal a su nivel hasta la vela de la ruptura (flecha). Los swings con barrido
// pero sin ruptura aún salen con línea punteada hasta la última vela (se pueden ocultar).
// Ojo: el swing se confirma varias velas DESPUÉS de la vela donde se dibuja (igual que cualquier pivote); no sirve tal cual para operar en vivo.
indicator({ name: 'Swings', overlay: true });

const verPendientes = input('Mostrar swings con barrido pero sin ruptura aún', true);
const verBarrido = input('Marcar la vela que toma la liquidez', false);
const maxSwings = input('Máximo de swings dibujados (los más recientes)', 400, { min: 10, max: 3000 });
const colorAlto = inputColor('Color swing alto', '#26a69a');
const colorBajo = inputColor('Color swing bajo', '#ef5350');

const cand = [];     // pivotes de 3 velas que esperan el barrido
const esperan = [];  // con barrido hecho, esperan la ruptura con cuerpo
const swings = [];   // resultado
const hay = function (tipo, ref) { return cand.some(function (k) { return k.tipo === tipo && k.ref === ref; }); };

for (let j = 1; j < n; j++) {
  // regla 1: la vela j-1 es pivote de 3 velas (con la vela j como vecina de la derecha)
  if (j >= 2) {
    const c = j - 1;
    if (high[c] > high[c - 1] && high[c] > high[j] && !hay('alto', c)) cand.push({ tipo: 'alto', ref: c });
    if (low[c] < low[c - 1] && low[c] < low[j] && !hay('bajo', c)) cand.push({ tipo: 'bajo', ref: c });
  }
  // regla 3: rupturas con cuerpo de los swings que ya tuvieron barrido (antes de esta vela)
  for (let k = esperan.length - 1; k >= 0; k--) {
    const s = esperan[k];
    const roto = s.tipo === 'alto' ? close[j] > high[s.ref] : close[j] < low[s.ref];
    if (roto) { s.ruptura = j; esperan.splice(k, 1); }
  }
  // regla 2: barrido o extensión de cada pivote pendiente
  for (let k = cand.length - 1; k >= 0; k--) {
    const c = cand[k];
    if (c.tipo === 'alto') {
      if (high[j] > high[c.ref]) c.ref = j;                       // máximo más extremo: pasa a ser la vela de referencia
      else if (low[j] < low[c.ref]) { const s = { tipo: 'alto', ref: c.ref, barrido: j, ruptura: -1 }; swings.push(s); esperan.push(s); cand.splice(k, 1); }
    } else {
      if (low[j] < low[c.ref]) c.ref = j;
      else if (high[j] > high[c.ref]) { const s = { tipo: 'bajo', ref: c.ref, barrido: j, ruptura: -1 }; swings.push(s); esperan.push(s); cand.splice(k, 1); }
    }
  }
  // dos pendientes que terminan en la misma vela de referencia son el mismo swing
  for (let a = cand.length - 1; a >= 1; a--) {
    for (let b = 0; b < a; b++) if (cand[a].tipo === cand[b].tipo && cand[a].ref === cand[b].ref) { cand.splice(a, 1); break; }
  }
}

swings.sort(function (a, b) { return a.ref - b.ref; });
swings.slice(-maxSwings).forEach(function (s) {
  const alto = s.tipo === 'alto';
  const color = alto ? colorAlto : colorBajo;
  const nivel = alto ? high[s.ref] : low[s.ref];
  if (s.ruptura < 0 && !verPendientes) return;
  marker(s.ref, alto ? 'above' : 'below', { color: color, shape: 'circle' });
  if (verBarrido) marker(s.barrido, alto ? 'below' : 'above', { color: color, shape: 'square' });
  if (s.ruptura >= 0) {
    segment(s.ref, nivel, s.ruptura, { color: color, width: 2 });
    marker(s.ruptura, alto ? 'below' : 'above', { color: color, shape: alto ? 'arrowUp' : 'arrowDown' });
  } else {
    segment(s.ref, nivel, n - 1, { color: color, width: 1, style: 'dotted' });
  }
});
`,
    },
    {
      name: 'Divergencias RSI vs swings',
      code: `// DIVERGENCIAS RSI vs SWINGS. Tú pones la estructura; el script solo compara los swings con el RSI.
// Compara dos swings seguidos del mismo tipo (con las reglas del ejemplo "Swings": 3 velas + barrido).
//  - Divergencia BAJISTA: el 2.º swing ALTO es más alto que el 1.º, pero el RSI en ese 2.º swing es más BAJO.
//  - Divergencia ALCISTA: el 2.º swing BAJO es más bajo que el 1.º, pero el RSI en ese 2.º swing es más ALTO.
// FUERZA = cuánto se movió el precio (%) en relación con lo que se movió el RSI (puntos). Ej.: sube 37,5 % y el RSI baja 22 puntos
//   -> cociente 1,7 (por cada punto de RSI, el precio se movió 1,7 %). También hay la fórmula "producto" (precio % x puntos RSI / 100).
// ESTADO:  NC = no confirmada. C = CONFIRMADA: el precio rompe el MÍNIMO que produjo el 2.º máximo (bajista), o el MÁXIMO que produjo
//   el 2.º mínimo (alcista). S = superada: antes de romper, el precio hizo un nuevo extremo más allá del 2.º swing.
// CADENA: D1 = primera divergencia, D2 = la siguiente seguida en el mismo sentido (doble), D3 = triple... Se corta si un par no diverge.
// RSI ADAPTADO: además del largo base, prueba varios largos de RSI; "acuerdo" = % de largos que también muestran la divergencia.
// Texto de cada marca (en la vela del 2.º swing):  D2 +37.5%/-22.0 F1.7 75% NC   (cadena, precio %, RSI puntos, fuerza, acuerdo, estado).
// Ojo: el swing se confirma varias velas DESPUÉS de la vela donde se marca (igual que cualquier pivote); no sirve tal cual para operar en vivo.
indicator({ name: 'Divergencias RSI', overlay: false, precision: 2 });

const largo = input('Largo del RSI (base)', 14, { min: 2, max: 200 });
const probar = input('Probar también otros largos de RSI', true);
const largoMin = input('Probar desde el largo', 7, { min: 2, max: 200 });
const largoMax = input('Probar hasta el largo', 28, { min: 2, max: 200 });
const acuerdoMin = input('Acuerdo mínimo entre largos (%)', 50, { min: 0, max: 100 });
const distMin = input('Distancia mínima entre los dos swings (velas)', 3, { min: 1, max: 5000 });
const distMax = input('Distancia máxima entre los dos swings (velas)', 500, { min: 2, max: 20000 });
const formula = input('Fórmula de la fuerza', 'cociente', { options: ['cociente', 'producto'] });
const fuerzaMin = input('Fuerza mínima para mostrar', 0, { min: 0, max: 100000 });
const confirmar = input('Confirmar rompiendo con', 'cuerpo', { options: ['cuerpo', 'mecha'] });
const verBajistas = input('Mostrar divergencias bajistas', true);
const verAlcistas = input('Mostrar divergencias alcistas', true);
const verNivel = input('Dibujar el nivel protegido', true);
const verTexto = input('Mostrar el detalle en la marca', true);
const maxSenales = input('Máximo de señales dibujadas (las más recientes)', 200, { min: 5, max: 3000 });
const colorBaja = inputColor('Color bajista', '#ef5350');
const colorAlza = inputColor('Color alcista', '#26a69a');
const colorSup = inputColor('Color de las superadas', '#787b86');

// ---------- 1) Swings (las 3 reglas del ejemplo Swings; el swing existe desde la vela "barrido") ----------
const cand = [], esperan = [], swings = [];
const hay = function (tipo, ref) { return cand.some(function (k) { return k.tipo === tipo && k.ref === ref; }); };
for (let j = 1; j < n; j++) {
  if (j >= 2) {
    const c = j - 1;
    if (high[c] > high[c - 1] && high[c] > high[j] && !hay('alto', c)) cand.push({ tipo: 'alto', ref: c });
    if (low[c] < low[c - 1] && low[c] < low[j] && !hay('bajo', c)) cand.push({ tipo: 'bajo', ref: c });
  }
  for (let k = cand.length - 1; k >= 0; k--) {
    const c = cand[k];
    if (c.tipo === 'alto') {
      if (high[j] > high[c.ref]) c.ref = j;
      else if (low[j] < low[c.ref]) { swings.push({ tipo: 'alto', ref: c.ref, barrido: j }); cand.splice(k, 1); }
    } else {
      if (low[j] < low[c.ref]) c.ref = j;
      else if (high[j] > high[c.ref]) { swings.push({ tipo: 'bajo', ref: c.ref, barrido: j }); cand.splice(k, 1); }
    }
  }
  for (let a = cand.length - 1; a >= 1; a--) {
    for (let b = 0; b < a; b++) if (cand[a].tipo === cand[b].tipo && cand[a].ref === cand[b].ref) { cand.splice(a, 1); break; }
  }
}
swings.sort(function (a, b) { return a.ref - b.ref; });
const altos = swings.filter(function (s) { return s.tipo === 'alto'; });
const bajos = swings.filter(function (s) { return s.tipo === 'bajo'; });

// ---------- 2) RSI base y RSI de los otros largos ----------
const rsiBase = ta.rsi(close, largo);
const otros = [];
if (probar) { for (let L = Math.min(largoMin, largoMax); L <= Math.max(largoMin, largoMax); L++) otros.push(ta.rsi(close, L)); }

// ---------- 3) Divergencias ----------
const senales = [];
const analizar = function (lista, contrarios, esAlto) {
  let cadena = 0;
  for (let k = 1; k < lista.length; k++) {
    const A = lista[k - 1], B = lista[k];
    const dist = B.ref - A.ref;
    if (dist < distMin || dist > distMax) { cadena = 0; continue; }
    const pa = esAlto ? high[A.ref] : low[A.ref];
    const pb = esAlto ? high[B.ref] : low[B.ref];
    const ra = rsiBase[A.ref], rb = rsiBase[B.ref];
    if (isNaN(ra) || isNaN(rb)) { cadena = 0; continue; }
    const precioOk = esAlto ? pb > pa : pb < pa;
    const rsiOk = esAlto ? rb < ra : rb > ra;
    if (!precioOk || !rsiOk) { cadena = 0; continue; }
    let votos = 0, total = 0;
    for (let q = 0; q < otros.length; q++) {
      const va = otros[q][A.ref], vb = otros[q][B.ref];
      if (isNaN(va) || isNaN(vb)) continue;
      total++;
      if (esAlto ? vb < va : vb > va) votos++;
    }
    const acuerdo = total ? (votos / total) * 100 : 100;
    if (acuerdo < acuerdoMin) { cadena = 0; continue; }
    cadena++;
    const dp = (pb / pa - 1) * 100, dr = rb - ra;
    const fuerza = formula === 'producto' ? (Math.abs(dp) * Math.abs(dr)) / 100 : Math.abs(dp) / Math.max(Math.abs(dr), 0.5);
    // nivel protegido: el último swing contrario entre A y B (el que "produjo" el 2.º swing); si no hay, el extremo contrario entre A y B
    let prot = -1;
    for (let q = 0; q < contrarios.length; q++) if (contrarios[q].ref > A.ref && contrarios[q].ref < B.ref) prot = contrarios[q].ref;
    if (prot < 0) {
      prot = A.ref;
      for (let j = A.ref; j <= B.ref; j++) if (esAlto ? low[j] < low[prot] : high[j] > high[prot]) prot = j;
    }
    const nivel = esAlto ? low[prot] : high[prot];
    // estado: confirmada (rompe el nivel), superada (nuevo extremo antes de romper) o no confirmada
    let estado = 'NC', conf = -1;
    for (let j = B.ref + 1; j < n; j++) {
      const rompe = esAlto ? (confirmar === 'cuerpo' ? close[j] < nivel : low[j] < nivel) : (confirmar === 'cuerpo' ? close[j] > nivel : high[j] > nivel);
      if (rompe) { estado = 'C'; conf = Math.max(j, B.barrido); break; }
      if (esAlto ? high[j] > pb : low[j] < pb) { estado = 'S'; break; }
    }
    if (fuerza < fuerzaMin) continue;
    senales.push({ esAlto: esAlto, A: A.ref, B: B.ref, cadena: cadena, dp: dp, dr: dr, fuerza: fuerza, acuerdo: acuerdo, prot: prot, nivel: nivel, estado: estado, conf: conf, ra: ra, rb: rb });
  }
};
if (verBajistas) analizar(altos, bajos, true);
if (verAlcistas) analizar(bajos, altos, false);
senales.sort(function (a, b) { return a.B - b.B; });

// ---------- 4) Dibujo: RSI + líneas de divergencia en el RSI; marcas y nivel protegido en las velas ----------
const lineaBaja = new Array(n).fill(NaN), lineaAlza = new Array(n).fill(NaN);
const fmt = function (v, d) { return (v >= 0 ? '+' : '') + v.toFixed(d); };
const dibujar = senales.slice(-maxSenales);
dibujar.forEach(function (s) {
  const arr = s.esAlto ? lineaBaja : lineaAlza;
  for (let j = s.A; j <= s.B; j++) arr[j] = s.ra + ((s.rb - s.ra) * (j - s.A)) / (s.B - s.A);
  const color = s.estado === 'S' ? colorSup : (s.esAlto ? colorBaja : colorAlza);
  const texto = verTexto ? 'D' + s.cadena + ' ' + fmt(s.dp, 1) + '%/' + fmt(s.dr, 1) + ' F' + s.fuerza.toFixed(1) + ' ' + Math.round(s.acuerdo) + '% ' + s.estado : 'D' + s.cadena;
  marker(s.B, s.esAlto ? 'above' : 'below', { color: color, shape: s.estado === 'S' ? 'square' : 'circle', text: texto });
  if (s.estado === 'C') marker(s.conf, s.esAlto ? 'above' : 'below', { color: color, shape: s.esAlto ? 'arrowDown' : 'arrowUp', text: 'C' });
  if (verNivel) {
    if (s.estado === 'C') segment(s.prot, s.nivel, s.conf, { color: color, width: 2 });
    else if (s.estado === 'NC') segment(s.prot, s.nivel, n - 1, { color: color, width: 1, style: 'dotted' });
  }
});

plot(rsiBase, { color: '#7e57c2', width: 2, title: 'RSI' });
plot(lineaBaja, { color: colorBaja, width: 2, title: 'Divergencia bajista' });
plot(lineaAlza, { color: colorAlza, width: 2, title: 'Divergencia alcista' });
hline(70, { color: '#787b86', style: 'dashed' });
hline(50, { color: '#787b86', style: 'dotted' });
hline(30, { color: '#787b86', style: 'dashed' });
`,
    },
    {
      name: 'Cruce de medias (estrategia)',
      code: `// Estrategia: compra cuando la media rápida cruza hacia arriba la lenta y vende (corto) cuando cruza hacia abajo.
// Capital, tipo y valor del tamaño (% del capital, monto fijo o contratos), comisión y deslizamiento se cambian en «Aplicados en este gráfico».
// Las órdenes se ejecutan en la apertura de la vela siguiente.
strategy({ name: 'Cruce de medias', overlay: true });

const rapida = input('Media rápida', 20, { min: 2, max: 200 });
const lenta = input('Media lenta', 50, { min: 3, max: 400 });
const soloLargos = input('Solo largos (sin cortos)', false);
const stopPct = input('Stop loss % (0 = sin stop)', 3, { min: 0, max: 50, step: 0.5 });
const objetivoPct = input('Objetivo % (0 = sin objetivo)', 6, { min: 0, max: 200, step: 0.5 });

const mRapida = ta.ema(close, rapida);
const mLenta = ta.ema(close, lenta);
const sube = ta.crossover(mRapida, mLenta);
const baja = ta.crossunder(mRapida, mLenta);

plot(mRapida, { color: '#ff9800', title: 'Rápida' });
plot(mLenta, { color: '#2962ff', title: 'Lenta' });

function opciones() {
  const o = {};
  if (stopPct > 0) o.slPct = stopPct;
  if (objetivoPct > 0) o.tpPct = objetivoPct;
  return o;
}

onBar(function (i, pos) {
  if (sube[i]) {
    entry('long', opciones());            // si había un corto abierto, lo invierte
  } else if (baja[i]) {
    if (soloLargos) { if (pos.side === 'long') exit(); }
    else entry('short', opciones());
  }
});
`,
    },
    {
      name: 'RSI con stop y objetivo (estrategia)',
      code: `// Estrategia: compra cuando el RSI sale de la sobreventa (cruza hacia arriba el nivel bajo) y cierra cuando llega a la sobrecompra
// (cruza hacia arriba el nivel alto). El stop se pone a "Distancia del stop" veces el ATR bajo el precio de entrada.
strategy({ name: 'RSI con stop', overlay: true });

const largo = input('Largo del RSI', 14, { min: 2, max: 100 });
const bajo = input('Nivel de compra', 30, { min: 1, max: 49 });
const alto = input('Nivel de cierre', 70, { min: 51, max: 99 });
const atrLargo = input('Largo del ATR', 14, { min: 2, max: 100 });
const veces = input('Distancia del stop (veces el ATR)', 2, { min: 0.5, max: 10, step: 0.5 });
const objetivoPct = input('Objetivo % (0 = sin objetivo)', 0, { min: 0, max: 200, step: 0.5 });

const rsi = ta.rsi(close, largo);
const atr = ta.atr(atrLargo);
const compra = ta.crossover(rsi, bajo);
const cierre = ta.crossover(rsi, alto);

onBar(function (i, pos) {
  if (pos.side === null) {
    if (compra[i] && !isNaN(atr[i])) {
      const o = { sl: close[i] - veces * atr[i] };
      if (objetivoPct > 0) o.tpPct = objetivoPct;
      entry('long', o);
    }
  } else if (cierre[i]) {
    exit();
  } else if (pos.side === 'long' && !isNaN(atr[i])) {
    // el stop sube con el precio (nunca baja)
    const nuevo = close[i] - veces * atr[i];
    if (nuevo > pos.sl && nuevo < close[i]) exit({ sl: nuevo });
  }
});
`,
    },
  ];
})(window);

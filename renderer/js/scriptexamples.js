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

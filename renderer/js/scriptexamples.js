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
      name: 'Cruce de medias (estrategia)',
      code: `// Estrategia: compra cuando la media rápida cruza hacia arriba la lenta y vende (corto) cuando cruza hacia abajo.
// Capital, tamaño, comisión y deslizamiento se cambian en «Aplicados en este gráfico». Las órdenes se ejecutan en la vela siguiente.
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

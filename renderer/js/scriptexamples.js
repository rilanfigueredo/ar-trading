// Ejemplos de scripts (v0.20) para copiar y cambiar.
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
  ];
})(window);

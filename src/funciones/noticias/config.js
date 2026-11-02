'use strict';
// Todo lo de aquí es editable. Lo marcado "a verificar" no está confirmado con la fuente real.
const PAISES = {
  USD: { nombre: 'EE. UU.', alias: ['ee uu', 'eeuu', 'estados unidos', 'usa', 'usd', 'dolar', 'fed'] },
  JPY: { nombre: 'Japón', alias: ['japon', 'jpy', 'yen', 'boj'] },
  EUR: { nombre: 'Eurozona', alias: ['eurozona', 'europa', 'euro', 'eur', 'bce', 'ecb'] },
  CNY: { nombre: 'China', alias: ['china', 'cny', 'yuan'] },
  GBP: { nombre: 'Reino Unido', alias: ['reino unido', 'uk', 'gbp', 'libra', 'inglaterra'] },
  AUD: { nombre: 'Australia', alias: ['australia', 'aud'] },
  CAD: { nombre: 'Canadá', alias: ['canada', 'cad'] },
  CHF: { nombre: 'Suiza', alias: ['suiza', 'chf'] },
  NZD: { nombre: 'Nueva Zelanda', alias: ['nueva zelanda', 'nzd'] },
};
const LISTA_POR_DEFECTO = ['USD', 'JPY', 'EUR'];
const OPCIONALES = ['CNY', 'GBP'];
const URL_CALENDARIO = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'; // a verificar: licencia, límites, semana siguiente

// Series de FRED para valores publicados de EE. UU. (a verificar: códigos y regla de interpretación).
// tipo: nivel | dif | mom | yoy. restrictivoSiSube: un dato más alto = más restrictivo para la política monetaria.
// periodo: cómo se busca el dato publicado: mensual (mes anterior) | trimestral | semanal | decision (día siguiente).
// mejorSiSube: dato más alto = mejor para la economía (true/false) o sin juicio (null). Regla editable, a verificar.
const SERIES_POR_DEFECTO = [
  { pais: 'USD', titulo: 'CPI m/m', fred: 'CPIAUCSL', tipo: 'mom', unidad: '%', restrictivoSiSube: true, mejorSiSube: false, horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'CPI y/y', fred: 'CPIAUCNS', tipo: 'yoy', unidad: '%', restrictivoSiSube: true, mejorSiSube: false, horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'Core CPI m/m', fred: 'CPILFESL', tipo: 'mom', unidad: '%', restrictivoSiSube: true, mejorSiSube: false, horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'Core CPI y/y', fred: 'CPILFENS', tipo: 'yoy', unidad: '%', restrictivoSiSube: true, mejorSiSube: false, horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'Core PCE Price Index m/m', fred: 'PCEPILFE', tipo: 'mom', unidad: '%', restrictivoSiSube: true, mejorSiSube: false, horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'PCE Price Index m/m', fred: 'PCEPI', tipo: 'mom', unidad: '%', restrictivoSiSube: true, mejorSiSube: false, horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'PPI m/m', fred: 'PPIFIS', tipo: 'mom', unidad: '%', restrictivoSiSube: true, mejorSiSube: false, horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'Retail Sales m/m', fred: 'RSAFS', tipo: 'mom', unidad: '%', restrictivoSiSube: true, mejorSiSube: true, horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'Non-Farm Employment Change', fred: 'PAYEMS', tipo: 'dif', unidad: 'K', restrictivoSiSube: true, mejorSiSube: true, horaET: '08:30', tol: 1.5 },
  { pais: 'USD', titulo: 'Unemployment Rate', fred: 'UNRATE', tipo: 'nivel', unidad: '%', restrictivoSiSube: false, mejorSiSube: false, horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'Unemployment Claims', fred: 'ICSA', tipo: 'nivel', divisor: 1000, unidad: 'K', restrictivoSiSube: false, mejorSiSube: false, periodo: 'semanal', horaET: '08:30', tol: 1.5 },
  { pais: 'USD', titulo: 'Advance GDP q/q', fred: 'A191RL1Q225SBEA', tipo: 'nivel', unidad: '%', restrictivoSiSube: true, mejorSiSube: true, periodo: 'trimestral', horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'Federal Funds Rate', fred: 'DFEDTARU', tipo: 'nivel', unidad: '%', restrictivoSiSube: true, mejorSiSube: null, periodo: 'decision', horaET: '14:00', tol: 0.01, reaccion: false },
  { pais: 'USD', titulo: 'Average Hourly Earnings m/m', fred: 'CES0500000003', tipo: 'mom', unidad: '%', restrictivoSiSube: true, mejorSiSube: null, horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'Core PCE Price Index y/y', fred: 'PCEPILFE', tipo: 'yoy', unidad: '%', restrictivoSiSube: true, mejorSiSube: false, horaET: '08:30', tol: 0.06 },
  { pais: 'USD', titulo: 'PCE Price Index y/y', fred: 'PCEPI', tipo: 'yoy', unidad: '%', restrictivoSiSube: true, mejorSiSube: false, horaET: '08:30', tol: 0.06 },
  // ISM: el valor publicado lo escribe el usuario (ISM no permite incorporar sus datos y no hay copia gratuita fiable).
  { pais: 'USD', titulo: 'ISM Services PMI', manual: true, tipo: 'nivel', unidad: '', restrictivoSiSube: true, mejorSiSube: true, horaET: '10:00', tol: 0.1 },
  { pais: 'USD', titulo: 'ISM Manufacturing PMI', manual: true, tipo: 'nivel', unidad: '', restrictivoSiSube: true, mejorSiSube: true, horaET: '10:00', tol: 0.1 },
];
// Mercado y macro global: series diarias públicas de FRED (descarga CSV sin clave; a verificar).
const MERCADO = [
  { id: 'DGS10', nombre: 'Bono EE. UU. 10 años', unidad: '%', dec: 2 },
  { id: 'T10Y2Y', nombre: 'Curva 10 años – 2 años', unidad: ' pp', dec: 2 },
  { id: 'DFF', nombre: 'Tasa efectiva de la Fed', unidad: '%', dec: 2 },
  { id: 'DTWEXBGS', nombre: 'Dólar (índice amplio)', unidad: '', dec: 1 },
  { id: 'DCOILWTICO', nombre: 'Petróleo WTI (USD/barril)', unidad: '', dec: 2 },
  { id: 'VIXCLS', nombre: 'VIX (volatilidad)', unidad: '', dec: 1 },
];
// Temas para las tarjetas del reporte (según el nombre del evento en el calendario). El orden importa.
const TEMAS = [
  { id: 'inflacion', nombre: 'Inflación', re: /CPI|PCE|PPI|inflation/i },
  { id: 'empleo', nombre: 'Empleo', re: /employment|unemployment|payroll|non-farm|claims|jobless/i },
  { id: 'tasas', nombre: 'Tasas de bancos centrales', re: /(federal funds|refinancing|policy|bank|cash|interest|overnight) rate|rate decision/i },
  { id: 'actividad', nombre: 'Crecimiento y actividad', re: /GDP|PMI|retail sales|industrial production|ISM/i },
];
// Modelo de 5 datos de EE. UU. con pesos (editable en modelo.json de la carpeta de datos; a verificar).
// tipo 'pct': cambio porcentual en 4 semanas; 'pp': cambio en puntos porcentuales. umbral: desde ahí se lee restrictivo (sube) o laxo (baja).
const MODELO_POR_DEFECTO = {
  bloques: [
    { id: 'cpi', nombre: 'CPI / Core CPI', detalle: 'Inflación mensual y subyacente', peso: 25, titulos: ['CPI m/m', 'Core CPI m/m', 'CPI y/y', 'Core CPI y/y'] },
    { id: 'empleo', nombre: 'Empleo', detalle: 'Nóminas no agrícolas + desempleo + salarios', peso: 20, titulos: ['Non-Farm Employment Change', 'Unemployment Rate', 'Average Hourly Earnings m/m'] },
    { id: 'pce', nombre: 'PCE / Core PCE', detalle: 'Inflación preferida por la Fed', peso: 20, titulos: ['Core PCE Price Index m/m', 'PCE Price Index m/m', 'Core PCE Price Index y/y', 'PCE Price Index y/y'] },
    { id: 'pmi', nombre: 'PMI / ISM', detalle: 'Servicios primero; el valor publicado lo escribes tú', peso: 15, titulos: ['ISM Services PMI', 'ISM Manufacturing PMI'] },
    { id: 'energia', nombre: 'Brent + diésel', detalle: 'Riesgo de shock inflacionario energético', peso: 10, series: [
      { id: 'DCOILBRENTEU', nombre: 'Brent (USD/barril)', unidad: '', dec: 2, tipo: 'pct', umbral: 3 },
      { id: 'GASDESW', nombre: 'Diésel EE. UU. (USD/galón, semanal)', unidad: '', dec: 3, tipo: 'pct', umbral: 3 },
    ] },
  ],
  confirmacion: { id: 'conf', nombre: 'Confirmación de mercado', detalle: 'Bono 2 años + bono 10 años + dólar (índice amplio, no es el DXY)', peso: 10, series: [
    { id: 'DGS2', nombre: 'Bono EE. UU. 2 años', unidad: '%', dec: 2, tipo: 'pp', umbral: 0.15 },
    { id: 'DGS10', nombre: 'Bono EE. UU. 10 años', unidad: '%', dec: 2, tipo: 'pp', umbral: 0.15 },
    { id: 'DTWEXBGS', nombre: 'Dólar (índice amplio)', unidad: '', dec: 1, tipo: 'pct', umbral: 1 },
  ] },
};
function validarModelo(m) {
  const ok = m && Array.isArray(m.bloques) && m.bloques.every((b) => b && typeof b.nombre === 'string' && Number.isFinite(b.peso) && (Array.isArray(b.titulos) || Array.isArray(b.series)))
    && m.confirmacion && Number.isFinite(m.confirmacion.peso) && Array.isArray(m.confirmacion.series);
  return ok ? m : null;
}
const MUESTRAS_REACCION = 12; // cuántas publicaciones pasadas se usan por dato

function claveSerie(s) { return `${s.pais}|${s.titulo}`; }
function buscarSerie(series, ev) {
  return series.find((s) => s.pais === ev.moneda && s.titulo === ev.titulo) || null;
}
function validarSeries(lista) {
  const ok = [];
  const avisos = [];
  if (!Array.isArray(lista)) return { series: [], avisos: ['series_fred.json no es una lista; se ignoró.'] };
  lista.forEach((s, i) => {
    const bien = s && typeof s.pais === 'string' && typeof s.titulo === 'string' && (typeof s.fred === 'string' || s.manual === true)
      && ['nivel', 'dif', 'mom', 'yoy'].includes(s.tipo) && typeof s.horaET === 'string' && /^\d{2}:\d{2}$/.test(s.horaET);
    if (bien) ok.push(Object.assign({ unidad: '', restrictivoSiSube: true, tol: 0.06, divisor: 1 }, s));
    else avisos.push(`series_fred.json: la fila ${i + 1} está incompleta y se ignoró.`);
  });
  return { series: ok, avisos };
}
module.exports = { PAISES, LISTA_POR_DEFECTO, OPCIONALES, URL_CALENDARIO, SERIES_POR_DEFECTO, MERCADO, TEMAS, MODELO_POR_DEFECTO, validarModelo, MUESTRAS_REACCION, claveSerie, buscarSerie, validarSeries };

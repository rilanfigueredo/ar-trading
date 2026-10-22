// Puente de datos: usa la app de escritorio (Electron) si existe, o el servidor local (modo navegador).
(function () {
  'use strict';
  const desktop = window.desktopApi;

  async function http(path, opts) {
    const res = await fetch(path, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
    return body;
  }

  window.TVApi = desktop
    ? {
        klines: (p) => desktop.klines(p),
        aggTrades: (p) => desktop.aggTrades(p),
        tradeStatus: () => desktop.tradeStatus(),
        testConnection: () => desktop.testConnection(),
        symbols: (ex) => desktop.symbols({ exchange: ex || 'binance' }),
        tickers: (ex, list) => desktop.tickers({ exchange: ex || 'binance', symbols: list }),
        getConfig: () => desktop.getConfig(),
        setConfig: (c) => desktop.setConfig(c),
      }
    : {
        klines: (p) => http('/api/klines?' + new URLSearchParams(p).toString()),
        aggTrades: (p) => http('/api/aggtrades?' + new URLSearchParams(p).toString()),
        tradeStatus: () => http('/api/tradestatus'),
        testConnection: () => http('/api/testconnection'),
        symbols: (ex) => http('/api/symbols?exchange=' + (ex || 'binance')),
        tickers: (ex, list) => http('/api/tickers?exchange=' + (ex || 'binance') + '&symbols=' + encodeURIComponent(list.join(','))),
        getConfig: () => http('/api/config'),
        setConfig: (c) => http('/api/config', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
        }),
      };
})();

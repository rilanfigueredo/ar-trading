// Puente de datos: usa la app de escritorio (Electron) si existe, o el servidor local (modo navegador).
(function () {
  'use strict';
  const desktop = window.desktopApi;
  // v0.22: identificador de esta ventana (w1…w10), viene en la dirección (?w=w2)
  const q = new URLSearchParams(location.search).get('w');
  const WIN = /^w([1-9]|10)$/.test(q || '') ? q : 'w1';
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('artrading-shared') : null;   // modo navegador: avisos entre pestañas

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
        windowId: WIN,
        getConfig: () => desktop.getConfig(WIN),
        setConfig: (c) => desktop.setConfig(WIN, c),
        setConfigNow: (c) => { try { desktop.setConfigSync(WIN, c); } catch (e) { /* ya cerrada */ } },
        openWindow: () => desktop.openWindow(),
        listWindows: () => desktop.listWindows(),
        focusWindow: (id) => desktop.focusWindow(id),
        closeWindow: (id) => desktop.closeWindow(id),
        onShared: (cb) => desktop.onShared(cb),
      }
    : {
        klines: (p) => http('/api/klines?' + new URLSearchParams(p).toString()),
        aggTrades: (p) => http('/api/aggtrades?' + new URLSearchParams(p).toString()),
        tradeStatus: () => http('/api/tradestatus'),
        testConnection: () => http('/api/testconnection'),
        symbols: (ex) => http('/api/symbols?exchange=' + (ex || 'binance')),
        tickers: (ex, list) => http('/api/tickers?exchange=' + (ex || 'binance') + '&symbols=' + encodeURIComponent(list.join(','))),
        windowId: WIN,
        getConfig: () => http('/api/config?w=' + WIN),
        setConfig: (c) => http('/api/config?w=' + WIN, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
        }).then((r) => { if (bc && r && r.changed && Object.keys(r.changed).length) bc.postMessage({ from: WIN, patch: r.changed }); return r; }),
        setConfigNow: (c) => { try { navigator.sendBeacon('/api/config?w=' + WIN, new Blob([JSON.stringify(c)], { type: 'text/plain' })); } catch (e) { /* ya cerrada */ } },
        openWindow: async () => {
          const r = await http('/api/window/new', { method: 'POST' });
          if (r.ok) window.open(location.pathname + '?w=' + r.id, 'artr-' + r.id);
          return r;
        },
        listWindows: () => http('/api/windows').then((ids) => ids.slice().sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))),
        focusWindow: async (id) => { window.open(location.pathname + '?w=' + id, 'artr-' + id); return true; },
        closeWindow: (id) => http('/api/window/remove?w=' + id, { method: 'POST' }),
        onShared: (cb) => { if (bc) bc.onmessage = (ev) => { if (ev.data && ev.data.from !== WIN) cb(ev.data.patch); }; },
      };
})();

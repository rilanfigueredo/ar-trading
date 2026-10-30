// Puente de datos: usa la app de escritorio (Electron) si existe, o el servidor local (modo navegador).
(function () {
  'use strict';
  const desktop = window.desktopApi;
  // v0.22: identificador de esta ventana (w1…w10), viene en la dirección (?w=w2)
  // v0.22: pestañas. Sin ?w= se abre la pestaña que estaba activa al cerrar.
  let q = new URLSearchParams(location.search).get('w');
  if (!/^w([1-9]|10)$/.test(q || '')) {
    q = 'w1';
    try {
      if (desktop && desktop.activeWindowSync) q = desktop.activeWindowSync() || 'w1';
      else if (!desktop) { const x = new XMLHttpRequest(); x.open('GET', '/api/window/active', false); x.send(); q = (JSON.parse(x.responseText) || {}).id || 'w1'; }
    } catch (e) { q = 'w1'; }
  }
  let WIN = /^w([1-9]|10)$/.test(q || '') ? q : 'w1';        // v0.22.5: cambia al pasar de una pestaña a otra (sin recargar la página)
  const okId = (id) => (/^w([1-9]|10)$/.test(id || '') ? id : WIN);
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
        liqMap: (p) => desktop.liqMap(p),
        tradeStatus: () => desktop.tradeStatus(),
        testConnection: () => desktop.testConnection(),
        symbols: (ex) => desktop.symbols({ exchange: ex || 'binance' }),
        tickers: (ex, list) => desktop.tickers({ exchange: ex || 'binance', symbols: list }),
        get windowId() { return WIN; },
        setWindow: (id) => { WIN = okId(id); },
        getConfig: (id) => desktop.getConfig(okId(id)),
        setConfig: (c, id) => desktop.setConfig(okId(id), c),
        setConfigNow: (c, id) => { try { desktop.setConfigSync(okId(id), c); } catch (e) { /* ya cerrada */ } },
        listTabs: () => desktop.listTabs(),
        setActive: (id) => desktop.setActive(id),
        openWindow: () => desktop.openWindow(),
        closeWindow: (id) => desktop.closeWindow(id),
        onShared: (cb) => desktop.onShared(cb),
      }
    : {
        klines: (p) => http('/api/klines?' + new URLSearchParams(p).toString()),
        aggTrades: (p) => http('/api/aggtrades?' + new URLSearchParams(p).toString()),
        liqMap: (p) => http('/api/liqmap?' + new URLSearchParams(p).toString()),
        tradeStatus: () => http('/api/tradestatus'),
        testConnection: () => http('/api/testconnection'),
        symbols: (ex) => http('/api/symbols?exchange=' + (ex || 'binance')),
        tickers: (ex, list) => http('/api/tickers?exchange=' + (ex || 'binance') + '&symbols=' + encodeURIComponent(list.join(','))),
        get windowId() { return WIN; },
        setWindow: (id) => { WIN = okId(id); },
        getConfig: (id) => http('/api/config?w=' + okId(id)),
        setConfig: (c, id) => { const w = okId(id); return http('/api/config?w=' + w, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
        }).then((r) => { if (bc && r && r.changed && Object.keys(r.changed).length) bc.postMessage({ from: w, patch: r.changed }); return r; }); },
        setConfigNow: (c, id) => { try { navigator.sendBeacon('/api/config?w=' + okId(id), new Blob([JSON.stringify(c)], { type: 'text/plain' })); } catch (e) { /* ya cerrada */ } },
        listTabs: () => http('/api/tabs'),
        setActive: (id) => http('/api/window/active?w=' + id, { method: 'POST' }),
        openWindow: () => http('/api/window/new', { method: 'POST' }),
        closeWindow: (id) => http('/api/window/remove?w=' + id, { method: 'POST' }),
        onShared: (cb) => { if (bc) bc.onmessage = (ev) => { if (ev.data && ev.data.from !== WIN) cb(ev.data.patch); }; },
      };
})();

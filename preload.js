'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  klines: (p) => ipcRenderer.invoke('klines', p),
  aggTrades: (p) => ipcRenderer.invoke('aggTrades', p),
  tradeStatus: () => ipcRenderer.invoke('tradeStatus'),
  testConnection: () => ipcRenderer.invoke('testConnection'),
  symbols: (p) => ipcRenderer.invoke('symbols', p),
  tickers: (p) => ipcRenderer.invoke('tickers', p),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (c) => ipcRenderer.invoke('config:set', c),
});

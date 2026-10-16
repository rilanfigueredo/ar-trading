'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  klines: (p) => ipcRenderer.invoke('klines', p),
  aggTrades: (p) => ipcRenderer.invoke('aggTrades', p),
  symbols: () => ipcRenderer.invoke('symbols'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (c) => ipcRenderer.invoke('config:set', c),
});

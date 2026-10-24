'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  klines: (p) => ipcRenderer.invoke('klines', p),
  aggTrades: (p) => ipcRenderer.invoke('aggTrades', p),
  tradeStatus: () => ipcRenderer.invoke('tradeStatus'),
  testConnection: () => ipcRenderer.invoke('testConnection'),
  symbols: (p) => ipcRenderer.invoke('symbols', p),
  tickers: (p) => ipcRenderer.invoke('tickers', p),
  // v0.22: varias ventanas; cada una guarda su configuración con su identificador (w1…w10)
  getConfig: (win) => ipcRenderer.invoke('config:get', win),
  setConfig: (win, c) => ipcRenderer.invoke('config:set', win, c),
  setConfigSync: (win, c) => ipcRenderer.sendSync('config:setSync', win, c),
  activeWindowSync: () => ipcRenderer.sendSync('window:activeSync'),
  overlay: process.platform === 'win32',
  setOverlayColors: (color, symbolColor) => ipcRenderer.invoke('window:overlay', color, symbolColor),
  listTabs: () => ipcRenderer.invoke('window:tabs'),
  setActive: (id) => ipcRenderer.invoke('window:setActive', id),
  openWindow: () => ipcRenderer.invoke('window:open'),
  closeWindow: (id) => ipcRenderer.invoke('window:close', id),
  onShared: (cb) => ipcRenderer.on('shared:update', (_e, patch) => cb(patch)),
});

'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  klines: (p) => ipcRenderer.invoke('klines', p),
  aggTrades: (p) => ipcRenderer.invoke('aggTrades', p),
  liqMap: (p) => ipcRenderer.invoke('liqMap', p),
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
  serviceGet: () => ipcRenderer.invoke('service:get'),
  serviceSetHw: (on) => ipcRenderer.invoke('service:setHw', on),
  serviceRelaunch: () => ipcRenderer.invoke('service:relaunch'),
  serviceClearCache: () => ipcRenderer.invoke('service:clearCache'),
  serviceFactoryReset: () => ipcRenderer.invoke('service:factoryReset'),
  dataStatus: () => ipcRenderer.invoke('data:status'),
  dataOpenFolder: () => ipcRenderer.invoke('data:openFolder'),
  dataSetAssets: (l) => ipcRenderer.invoke('data:setAssets', l),
  dataSvcEnable: () => ipcRenderer.invoke('data:svcEnable'),
  dataSvcDisable: () => ipcRenderer.invoke('data:svcDisable'),
  dataBackup: () => ipcRenderer.invoke('data:backup'),
  dataSetDir: () => ipcRenderer.invoke('data:setDir'),
  dataResetDir: () => ipcRenderer.invoke('data:resetDir'),
  // v0.24: funciones. Solo canales con prefijo propio (noticias:…); nunca los internos del programa.
  fnInvocar: (canal, args, inst) => (/^(?!config:|window:|service:|data:|shared:)[a-z][a-z0-9]*:[a-z][a-z0-9-]*$/.test(String(canal)) ? ipcRenderer.invoke(canal, { args, inst }).catch(() => ({ ok: false, error: 'Esa función no está disponible.' })) : Promise.resolve({ ok: false, error: 'Canal no permitido.' })),
  onShared: (cb) => ipcRenderer.on('shared:update', (_e, patch) => cb(patch)),
});

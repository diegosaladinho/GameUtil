'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const inv = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

// Eventos que el proceso principal puede enviar a la interfaz.
const EVENTS = ['online:progress', 'library:changed', 'library:update', 'win:maximized', 'auto:status', 'auto:done', 'win:askClose'];

let boot = { splash: true, transitions: true };
try { boot = ipcRenderer.sendSync('boot:get') || boot; } catch { /* sin datos: se muestra la pantalla de carga */ }

contextBridge.exposeInMainWorld('api', {
  boot,
  state: () => inv('app:state'),
  scan: () => inv('app:scan'),
  onlineRun: () => inv('online:run'),
  onlineCancel: () => inv('online:cancel'),

  launch: key => inv('item:launch', key),
  accent: key => inv('item:accent', key),
  openFolder: key => inv('item:openFolder', key),
  uninstall: key => inv('item:uninstall', key),
  update: (key, patch) => inv('item:update', key, patch),
  pickImage: (key, kind) => inv('item:pickImage', key, kind),
  clearImage: (key, kind) => inv('item:clearImage', key, kind),
  resetAppearance: key => inv('item:resetAppearance', key),

  setSettings: patch => inv('settings:set', patch),
  setSgdbKey: key => inv('settings:sgdbKey', key),
  setRawgKey: key => inv('settings:rawgKey', key),
  refind: key => inv('item:refind', key),
  files: () => inv('files:list'),
  revealFile: id => inv('files:reveal', id),
  exportList: opts => inv('list:export', opts),
  dataExport: () => inv('data:export'),
  dataImportPick: () => inv('data:importPick'),
  dataImportApply: opts => inv('data:importApply', opts),

  artUrl: (key, kind, rev) => `lib://art/${encodeURIComponent(key)}/${kind}?v=${rev}`,

  win: {
    minimize: () => inv('win:minimize'),
    toggleMaximize: () => inv('win:toggleMaximize'),
    close: () => inv('win:close'),
    closeChoice: (choice, remember) => inv('win:closeChoice', choice, remember)
  },

  on: (channel, cb) => {
    if (!EVENTS.includes(channel)) throw new Error('Evento no permitido');
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
});

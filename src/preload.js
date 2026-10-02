const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wc', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onSettings: (cb) => {
    const listener = (_e, s) => cb(s);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
  },
  // Plain text, or { text, rows: [[city, time, date], ...] } (main adds the rich table version for mail and chat apps).
  copyText: (data) => ipcRenderer.invoke('clipboard:write', data && typeof data === 'object'
    ? { text: String(data.text || ''), rows: Array.isArray(data.rows) ? data.rows.map((r) => (Array.isArray(r) ? r.map(String) : r)) : null }
    : String(data)),
  // Calendar invite { startMs, endMs, title, description }: main checks it, asks where to save and writes the .ics.
  saveIcs: (req) => ipcRenderer.invoke('ics:save', req && typeof req === 'object'
    ? { startMs: Number(req.startMs), endMs: Number(req.endMs), title: String(req.title || ''), description: String(req.description || '') } : null),
  dragStart: () => ipcRenderer.send('window:dragStart'),
  dragMove: (dx, dy) => ipcRenderer.send('window:dragMove', dx, dy),
  panel: (open) => ipcRenderer.send('window:panel', !!open),
  // Overlay view on screen: 'map' | 'planner' | null (main gives each view its own remembered window size).
  setView: (view) => ipcRenderer.send('window:view', view === 'map' || view === 'planner' ? view : null),
  // Natural size of the open planner in CSS px { width, height, keepWidth }: main sizes the window to it (zoom applied there).
  fitView: (size) => {
    if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) ipcRenderer.send('window:fitView', { width: size.width, height: size.height, keepWidth: size.keepWidth === true });
  },
  // Close keeps the app running in the tray; quitting is done from the tray menu.
  hide: () => ipcRenderer.send('window:hide'),
  minimize: () => ipcRenderer.send('window:minimize'),
  // Card names for the tray tooltip, { zone: name } (main checks them and formats the times on hover). Fire-and-forget.
  setTrayNames: (names) => ipcRenderer.send('tray:names', names),
  // Store build: opens Windows Settings > Apps > Startup (main ignores it in other builds).
  openStartupSettings: () => ipcRenderer.send('window:startupSettings'),
});

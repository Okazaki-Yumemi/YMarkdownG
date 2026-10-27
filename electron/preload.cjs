const { contextBridge, ipcRenderer } = require("electron");
const listen = (channel, callback) => {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld("desktop", {
  current: () => ipcRenderer.invoke("document:current"),
  create: () => ipcRenderer.invoke("document:new"),
  open: () => ipcRenderer.invoke("document:open"),
  save: (id, content, saveAs = false, expectedContent) =>
    ipcRenderer.invoke("document:save", id, content, saveAs, expectedContent),
  confirmSave: () => ipcRenderer.invoke("document:confirm"),
  refresh: (id) => ipcRenderer.invoke("document:refresh", id),
  reload: (id) => ipcRenderer.invoke("document:reload", id),
  saveImage: (id, bytes) => ipcRenderer.invoke("image:save", id, bytes),
  chooseImage: () => ipcRenderer.invoke("image:choose"),
  chooseBackground: () => ipcRenderer.invoke("background:choose"),
  exportPDF: (title, html) => ipcRenderer.invoke("document:pdf", title, html),
  setDirty: (dirty) => ipcRenderer.send("document:dirty", !!dirty),
  onFlush: (callback) => listen("document:flush", callback),
  flushed: (ok) => ipcRenderer.send("document:closed", !!ok),
  onCommand: (callback) => listen("document:command", callback),
});

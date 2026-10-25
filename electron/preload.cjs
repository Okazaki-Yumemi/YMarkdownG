const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  restore: () => ipcRenderer.invoke("workspace:restore"),
  open: () => ipcRenderer.invoke("workspace:open"),
  save: (id, notes) => ipcRenderer.invoke("workspace:save", id, notes),
  createFolder: (id, folder) =>
    ipcRenderer.invoke("workspace:mkdir", id, folder),
  exportNote: (title, content) =>
    ipcRenderer.invoke("note:export", title, content),
  reveal: (id) => ipcRenderer.invoke("workspace:reveal", id),
  setDirty: (dirty) => ipcRenderer.send("document:dirty", !!dirty),
  onFlush: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("document:flush", handler);
    return () => ipcRenderer.removeListener("document:flush", handler);
  },
  flushed: (ok, error) => ipcRenderer.send("document:flushed", !!ok, error),
});

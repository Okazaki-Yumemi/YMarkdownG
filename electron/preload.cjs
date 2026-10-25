const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  chooseBackground: () => ipcRenderer.invoke("background:choose"),
  updateState: () => ipcRenderer.invoke("updates:state"),
  checkUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  automaticUpdates: (value) => ipcRenderer.invoke("updates:automatic", value),
  onUpdate: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("updates:state", listener);
    return () => ipcRenderer.removeListener("updates:state", listener);
  },
  restore: () => ipcRenderer.invoke("workspace:restore"),
  open: () => ipcRenderer.invoke("workspace:open"),
  save: (id, notes) => ipcRenderer.invoke("workspace:save", id, notes),
  createFolder: (id, folder) =>
    ipcRenderer.invoke("workspace:mkdir", id, folder),
  moveFolder: (id, from, to) =>
    ipcRenderer.invoke("workspace:move-folder", id, from, to),
  deleteFolder: (id, folder) =>
    ipcRenderer.invoke("workspace:delete-folder", id, folder),
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

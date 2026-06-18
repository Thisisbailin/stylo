const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("qalamDesktop", {
  isDesktop: true,
  platform: process.platform,
  windowControl: (action) => ipcRenderer.invoke("qalam-window-control", action),
  onWindowStateChange: (callback) => {
    if (typeof callback !== "function") return undefined;
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("qalam-window-state", handler);
    return () => ipcRenderer.removeListener("qalam-window-state", handler);
  }
});

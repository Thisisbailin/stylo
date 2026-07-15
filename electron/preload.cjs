const { contextBridge, ipcRenderer } = require("electron");

const desktopApi = {
  isDesktop: true,
  platform: process.platform,
  windowControl: (action) => ipcRenderer.invoke("stylo-window-control", action),
  startLeporelloSketch: (payload) => ipcRenderer.invoke("stylo-leporello-sketch-start", payload),
  completeLeporelloSketch: (sessionId) => ipcRenderer.invoke("stylo-leporello-sketch-complete", sessionId),
  cancelLeporelloSketch: (sessionId) => ipcRenderer.invoke("stylo-leporello-sketch-cancel", sessionId),
  onWindowStateChange: (callback) => {
    if (typeof callback !== "function") return undefined;
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("stylo-window-state", handler);
    return () => ipcRenderer.removeListener("stylo-window-state", handler);
  }
};

contextBridge.exposeInMainWorld("styloDesktop", desktopApi);
// Temporary renderer compatibility for the currently deployed Pages build.
contextBridge.exposeInMainWorld("qalamDesktop", desktopApi);

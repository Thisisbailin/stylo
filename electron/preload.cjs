const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("qalamDesktop", {
  isDesktop: true,
  platform: process.platform
});

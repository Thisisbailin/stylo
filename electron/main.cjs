const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const desktopConfig = require("./desktop.config.cjs");

const DEFAULT_DEV_URL = "http://127.0.0.1:5173";

const normalizeStartUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (["http:", "https:", "file:"].includes(parsed.protocol)) {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
};

const getBundledIndexUrl = () =>
  pathToFileURL(path.join(__dirname, "..", "dist", "index.html")).toString();

const getStartUrl = () => {
  const configuredUrl = normalizeStartUrl(process.env.QALAM_DESKTOP_URL);
  if (configuredUrl) return configuredUrl;
  const defaultRemoteUrl = normalizeStartUrl(desktopConfig.defaultRemoteUrl);
  if (app.isPackaged && defaultRemoteUrl) return defaultRemoteUrl;
  if (!app.isPackaged) return DEFAULT_DEV_URL;
  return getBundledIndexUrl();
};

const shouldOpenExternally = (targetUrl, appUrl) => {
  try {
    const target = new URL(targetUrl);
    const start = new URL(appUrl);
    if (!["http:", "https:"].includes(target.protocol)) return true;
    if (start.protocol === "file:") return true;
    return target.origin !== start.origin;
  } catch {
    return true;
  }
};

const createMainWindow = () => {
  const startUrl = getStartUrl();
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "Qalam",
    backgroundColor: "#0f1115",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternally(url, startUrl)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.loadURL(startUrl);
};

app.whenReady().then(() => {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

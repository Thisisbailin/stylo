const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const desktopConfig = require("./desktop.config.cjs");

const DEFAULT_DEV_URL = "http://127.0.0.1:5173";
const DESKTOP_CHROME_CSS = `
  html.qalam-desktop {
    --qalam-window-control-mac-left: 84px;
    --qalam-window-control-win-right: 150px;
  }

  html.qalam-desktop body {
    -webkit-app-region: no-drag;
  }

  html.qalam-desktop header.fixed.top-0,
  html.qalam-desktop .qalam-header-shell,
  html.qalam-desktop .writing-floating-header,
  html.qalam-desktop .writing-info-header {
    -webkit-app-region: drag;
  }

  html.qalam-desktop header.fixed.top-0 *,
  html.qalam-desktop .qalam-header-shell *,
  html.qalam-desktop .writing-floating-header *,
  html.qalam-desktop .writing-info-header *,
  html.qalam-desktop button,
  html.qalam-desktop input,
  html.qalam-desktop textarea,
  html.qalam-desktop select,
  html.qalam-desktop a,
  html.qalam-desktop [role="button"],
  html.qalam-desktop [contenteditable="true"],
  html.qalam-desktop .react-flow,
  html.qalam-desktop canvas {
    -webkit-app-region: no-drag;
  }

  html.qalam-desktop-darwin .qalam-header-shell {
    box-sizing: border-box;
    padding-left: var(--qalam-window-control-mac-left);
  }

  html.qalam-desktop-win32 header.fixed.top-0 {
    box-sizing: border-box;
    padding-right: calc(var(--qalam-window-control-win-right) + 1rem) !important;
  }

  html.qalam-desktop-win32 .qalam-header-shell {
    box-sizing: border-box;
    padding-right: var(--qalam-window-control-win-right);
  }
`;

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
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 14, y: 14 }
        }
      : {}),
    ...(process.platform === "win32"
      ? {
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#0f1115",
            symbolColor: "#f8fafc",
            height: 42
          }
        }
      : {}),
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

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents
      .executeJavaScript(
        `document.documentElement.classList.add("qalam-desktop", "qalam-desktop-${process.platform}");`,
        true
      )
      .catch(() => {});
    mainWindow.webContents.insertCSS(DESKTOP_CHROME_CSS).catch(() => {});
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

const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const desktopConfig = require("./desktop.config.cjs");

const DEFAULT_DEV_URL = "http://127.0.0.1:3000";
const DESKTOP_CHROME_CSS = `
  html.qalam-desktop {
    --qalam-window-control-width: 138px;
    --qalam-window-drag-height: 36px;
    --qalam-window-drag-left: 0px;
  }

  html.qalam-desktop-darwin {
    --qalam-window-control-width: 0px;
    --qalam-window-drag-left: 88px;
  }

  html.qalam-desktop body {
    -webkit-app-region: no-drag;
  }

  html.qalam-desktop #qalam-desktop-window-drag-region {
    position: fixed;
    top: 0;
    left: var(--qalam-window-drag-left);
    right: var(--qalam-window-control-width);
    height: var(--qalam-window-drag-height);
    z-index: 2147483000;
    -webkit-app-region: drag;
  }

  html.qalam-desktop header.fixed.top-0,
  html.qalam-desktop .qalam-header-shell,
  html.qalam-desktop .writing-floating-header,
  html.qalam-desktop .writing-info-header {
    -webkit-app-region: drag;
  }

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

  html.qalam-desktop #qalam-desktop-window-controls,
  html.qalam-desktop #qalam-desktop-window-controls * {
    -webkit-app-region: no-drag;
  }

  html.qalam-desktop #qalam-desktop-window-controls {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 2147483647;
    display: flex;
    width: var(--qalam-window-control-width);
    height: var(--qalam-window-drag-height);
    pointer-events: auto;
    color: rgba(244, 247, 242, 0.72);
  }

  html.qalam-desktop .qalam-window-control {
    position: relative;
    display: grid;
    width: 46px;
    height: var(--qalam-window-drag-height);
    place-items: center;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    cursor: default;
    transition: background-color 140ms ease, color 140ms ease;
  }

  html.qalam-desktop .qalam-window-control:hover {
    background: rgba(255, 255, 255, 0.09);
    color: rgba(255, 255, 255, 0.94);
  }

  html.qalam-desktop .qalam-window-control[data-window-action="close"]:hover {
    background: #c42b1c;
    color: #fff;
  }

  html.qalam-desktop .qalam-window-control__mark {
    position: relative;
    display: block;
    width: 13px;
    height: 13px;
  }

  html.qalam-desktop .qalam-window-control__mark--minimize::before {
    content: "";
    position: absolute;
    left: 1px;
    right: 1px;
    bottom: 3px;
    height: 1px;
    background: currentColor;
  }

  html.qalam-desktop .qalam-window-control__mark--maximize::before,
  html.qalam-desktop .qalam-window-control__mark--restore::before,
  html.qalam-desktop .qalam-window-control__mark--restore::after {
    content: "";
    position: absolute;
    border: 1px solid currentColor;
  }

  html.qalam-desktop .qalam-window-control__mark--maximize::before {
    inset: 1px;
  }

  html.qalam-desktop .qalam-window-control__mark--restore::before {
    inset: 3px 1px 1px 3px;
  }

  html.qalam-desktop .qalam-window-control__mark--restore::after {
    inset: 1px 3px 3px 1px;
    background: transparent;
  }

  html.qalam-desktop .qalam-window-control__mark--close::before,
  html.qalam-desktop .qalam-window-control__mark--close::after {
    content: "";
    position: absolute;
    top: 6px;
    left: 1px;
    width: 12px;
    height: 1px;
    background: currentColor;
  }

  html.qalam-desktop .qalam-window-control__mark--close::before {
    transform: rotate(45deg);
  }

  html.qalam-desktop .qalam-window-control__mark--close::after {
    transform: rotate(-45deg);
  }
`;

const DESKTOP_WINDOW_CONTROLS_JS = `
  (() => {
    if (document.getElementById("qalam-desktop-window-drag-region")) return;

    const api = window.qalamDesktop;
    const isMac = document.documentElement.classList.contains("qalam-desktop-darwin");

    const dragRegion = document.createElement("div");
    dragRegion.id = "qalam-desktop-window-drag-region";
    dragRegion.setAttribute("aria-hidden", "true");

    document.body.appendChild(dragRegion);
    if (isMac) return;

    if (!api || typeof api.windowControl !== "function") return;

    const controls = document.createElement("div");
    controls.id = "qalam-desktop-window-controls";
    controls.setAttribute("aria-label", "Window controls");
    controls.innerHTML = [
      '<button class="qalam-window-control" type="button" data-window-action="minimize" aria-label="Minimize" title="Minimize"><span class="qalam-window-control__mark qalam-window-control__mark--minimize" aria-hidden="true"></span></button>',
      '<button class="qalam-window-control" type="button" data-window-action="toggle-maximize" aria-label="Maximize" title="Maximize"><span class="qalam-window-control__mark qalam-window-control__mark--maximize" aria-hidden="true"></span></button>',
      '<button class="qalam-window-control" type="button" data-window-action="close" aria-label="Close" title="Close"><span class="qalam-window-control__mark qalam-window-control__mark--close" aria-hidden="true"></span></button>'
    ].join("");

    const syncWindowState = (state) => {
      const isMaximized = Boolean(state && state.isMaximized);
      const maximizeButton = controls.querySelector('[data-window-action="toggle-maximize"]');
      const maximizeMark = maximizeButton && maximizeButton.querySelector(".qalam-window-control__mark");
      document.documentElement.dataset.qalamWindowMaximized = isMaximized ? "true" : "false";
      if (!maximizeButton || !maximizeMark) return;
      maximizeButton.setAttribute("aria-label", isMaximized ? "Restore" : "Maximize");
      maximizeButton.setAttribute("title", isMaximized ? "Restore" : "Maximize");
      maximizeMark.classList.toggle("qalam-window-control__mark--maximize", !isMaximized);
      maximizeMark.classList.toggle("qalam-window-control__mark--restore", isMaximized);
    };

    controls.addEventListener("click", (event) => {
      const button = event.target.closest("[data-window-action]");
      if (!button) return;
      api.windowControl(button.dataset.windowAction).then(syncWindowState).catch(() => {});
    });

    document.body.appendChild(controls);
    api.windowControl("get-state").then(syncWindowState).catch(() => {});
    if (typeof api.onWindowStateChange === "function") {
      api.onWindowStateChange(syncWindowState);
    }
  })();
`;

const normalizeStartUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (["http:", "https:"].includes(parsed.protocol)) {
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

const isAllowedExternalUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

ipcMain.handle("qalam-window-control", (event, action) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (!targetWindow) return { isMaximized: false };

  switch (action) {
    case "minimize":
      targetWindow.minimize();
      break;
    case "toggle-maximize":
      if (targetWindow.isMaximized()) {
        targetWindow.unmaximize();
      } else {
        targetWindow.maximize();
      }
      break;
    case "close":
      targetWindow.close();
      break;
    case "get-state":
      break;
    default:
      break;
  }

  return { isMaximized: targetWindow.isMaximized() };
});

const createMainWindow = () => {
  const startUrl = getStartUrl();
  const isMac = process.platform === "darwin";
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "Stylo · Flow Workspace",
    backgroundColor: "#f6f6f4",
    show: false,
    frame: isMac,
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 16, y: 16 }
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const sendWindowState = () => {
    if (mainWindow.webContents.isDestroyed()) return;
    mainWindow.webContents.send("qalam-window-state", {
      isMaximized: mainWindow.isMaximized()
    });
  };

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    sendWindowState();
  });

  mainWindow.on("maximize", sendWindowState);
  mainWindow.on("unmaximize", sendWindowState);
  mainWindow.on("restore", sendWindowState);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternally(url, startUrl)) {
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!shouldOpenExternally(url, startUrl)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents
      .executeJavaScript(
        `document.documentElement.classList.add("qalam-desktop", "qalam-desktop-${process.platform}");`,
        true
      )
      .catch(() => {});
    mainWindow.webContents.insertCSS(DESKTOP_CHROME_CSS).catch(() => {});
    mainWindow.webContents.executeJavaScript(DESKTOP_WINDOW_CONTROLS_JS, true).catch(() => {});
    sendWindowState();
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

const { app, BrowserWindow, Menu, shell, ipcMain, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { pathToFileURL } = require("url");
const desktopConfig = require("./desktop.config.cjs");

app.setName("Stylo");

const DEFAULT_DEV_URL = "http://127.0.0.1:3000";
const DEFAULT_WINDOW_BOUNDS = { width: 1440, height: 920 };
const MIN_WINDOW_BOUNDS = { width: 1100, height: 720 };
const WINDOW_STATE_FILE = "stylo-window-state.json";
const WINDOW_STATE_WRITE_DELAY_MS = 240;
const MIN_VISIBLE_WINDOW_EDGE = 96;
let mainWindow = null;
const leporelloSketchSessions = new Map();
const LEPORELLO_SKETCH_WIDTH = 2100;
const LEPORELLO_SKETCH_HEIGHT = 900;
const LEPORELLO_SKETCH_MAX_BYTES = 30 * 1024 * 1024;

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const createPngChunk = (type, data) => {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
};

const createBlankLeporelloPng = () => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(LEPORELLO_SKETCH_WIDTH, 0);
  ihdr.writeUInt32BE(LEPORELLO_SKETCH_HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = LEPORELLO_SKETCH_WIDTH * 3 + 1;
  const pixels = Buffer.alloc(stride * LEPORELLO_SKETCH_HEIGHT, 246);
  for (let row = 0; row < LEPORELLO_SKETCH_HEIGHT; row += 1) pixels[row * stride] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", zlib.deflateSync(pixels, { level: 9 })),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const removeLeporelloSketchSession = (sessionId) => {
  const session = leporelloSketchSessions.get(sessionId);
  leporelloSketchSessions.delete(sessionId);
  if (!session) return;
  try {
    fs.rmSync(session.directory, { recursive: true, force: true });
  } catch (error) {
    console.warn("Unable to remove Leporello sketch session", error);
  }
};

const migrateLegacyUserDataDirectory = () => {
  const currentUserData = app.getPath("userData");
  const appDataRoot = path.dirname(currentUserData);
  const legacyCandidates = ["Qalam", "qalam"]
    .map((name) => path.join(appDataRoot, name))
    .filter((candidate) => candidate !== currentUserData && fs.existsSync(candidate));
  if (!legacyCandidates.length) return;
  try {
    fs.mkdirSync(currentUserData, { recursive: true });
    fs.cpSync(legacyCandidates[0], currentUserData, {
      recursive: true,
      force: false,
      errorOnExist: false
    });
  } catch (error) {
    console.warn("Unable to migrate pre-Stylo desktop data", error);
  }
};

const getWindowStatePath = () => path.join(app.getPath("userData"), WINDOW_STATE_FILE);

const readWindowState = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(getWindowStatePath(), "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const bounds = parsed.bounds;
    if (
      !bounds ||
      ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    ) {
      return null;
    }
    return {
      bounds: {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height)
      },
      isMaximized: Boolean(parsed.isMaximized)
    };
  } catch {
    return null;
  }
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getRestoredWindowState = () => {
  const saved = readWindowState();
  if (!saved) return { bounds: DEFAULT_WINDOW_BOUNDS, isMaximized: false };

  const displays = screen.getAllDisplays();
  const matchingDisplay = displays.find(({ workArea }) => {
    const horizontalOverlap = Math.min(saved.bounds.x + saved.bounds.width, workArea.x + workArea.width) -
      Math.max(saved.bounds.x, workArea.x);
    const verticalOverlap = Math.min(saved.bounds.y + saved.bounds.height, workArea.y + workArea.height) -
      Math.max(saved.bounds.y, workArea.y);
    return horizontalOverlap >= MIN_VISIBLE_WINDOW_EDGE && verticalOverlap >= MIN_VISIBLE_WINDOW_EDGE;
  });

  const display = matchingDisplay || screen.getPrimaryDisplay();
  const { workArea } = display;
  const width = clamp(saved.bounds.width, MIN_WINDOW_BOUNDS.width, workArea.width);
  const height = clamp(saved.bounds.height, MIN_WINDOW_BOUNDS.height, workArea.height);
  const defaultX = Math.round(workArea.x + (workArea.width - width) / 2);
  const defaultY = Math.round(workArea.y + (workArea.height - height) / 2);
  const x = matchingDisplay
    ? clamp(saved.bounds.x, workArea.x - width + MIN_VISIBLE_WINDOW_EDGE, workArea.x + workArea.width - MIN_VISIBLE_WINDOW_EDGE)
    : defaultX;
  const y = matchingDisplay
    ? clamp(saved.bounds.y, workArea.y, workArea.y + workArea.height - MIN_VISIBLE_WINDOW_EDGE)
    : defaultY;

  return { bounds: { x, y, width, height }, isMaximized: saved.isMaximized };
};

const writeWindowState = (targetWindow) => {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  const statePath = getWindowStatePath();
  const temporaryPath = `${statePath}.tmp`;
  const payload = {
    bounds: targetWindow.isMaximized() ? targetWindow.getNormalBounds() : targetWindow.getBounds(),
    isMaximized: targetWindow.isMaximized()
  };

  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify(payload), "utf8");
    fs.renameSync(temporaryPath, statePath);
  } catch (error) {
    console.warn("Unable to persist the Stylo window state", error);
  }
};
const DESKTOP_CHROME_CSS = `
  html.stylo-desktop {
    --stylo-window-control-width: 138px;
    --stylo-window-drag-height: 36px;
    --stylo-window-drag-left: 0px;
  }

  html.stylo-desktop-darwin {
    --stylo-window-control-width: 0px;
    --stylo-window-drag-left: 88px;
  }

  html.stylo-desktop body {
    -webkit-app-region: no-drag;
  }

  html.stylo-desktop #stylo-desktop-window-drag-region {
    position: fixed;
    top: 0;
    left: var(--stylo-window-drag-left);
    right: var(--stylo-window-control-width);
    height: var(--stylo-window-drag-height);
    z-index: 2147483000;
    -webkit-app-region: drag;
  }

  html.stylo-desktop header.fixed.top-0,
  html.stylo-desktop .stylo-header-shell,
  html.stylo-desktop .qalam-header-shell,
  html.stylo-desktop .writing-floating-header,
  html.stylo-desktop .writing-info-header {
    -webkit-app-region: drag;
  }

  html.stylo-desktop button,
  html.stylo-desktop input,
  html.stylo-desktop textarea,
  html.stylo-desktop select,
  html.stylo-desktop a,
  html.stylo-desktop [role="button"],
  html.stylo-desktop [contenteditable="true"],
  html.stylo-desktop .react-flow,
  html.stylo-desktop canvas {
    -webkit-app-region: no-drag;
  }

  html.stylo-desktop #stylo-desktop-window-controls,
  html.stylo-desktop #stylo-desktop-window-controls * {
    -webkit-app-region: no-drag;
  }

  html.stylo-desktop #stylo-desktop-window-controls {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 2147483647;
    display: flex;
    width: var(--stylo-window-control-width);
    height: var(--stylo-window-drag-height);
    pointer-events: auto;
    color: rgba(244, 247, 242, 0.72);
  }

  html.stylo-desktop .stylo-window-control {
    position: relative;
    display: grid;
    width: 46px;
    height: var(--stylo-window-drag-height);
    place-items: center;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    cursor: default;
    transition: background-color 140ms ease, color 140ms ease;
  }

  html.stylo-desktop .stylo-window-control:hover {
    background: rgba(255, 255, 255, 0.09);
    color: rgba(255, 255, 255, 0.94);
  }

  html.stylo-desktop .stylo-window-control[data-window-action="close"]:hover {
    background: #c42b1c;
    color: #fff;
  }

  html.stylo-desktop .stylo-window-control__mark {
    position: relative;
    display: block;
    width: 13px;
    height: 13px;
  }

  html.stylo-desktop .stylo-window-control__mark--minimize::before {
    content: "";
    position: absolute;
    left: 1px;
    right: 1px;
    bottom: 3px;
    height: 1px;
    background: currentColor;
  }

  html.stylo-desktop .stylo-window-control__mark--maximize::before,
  html.stylo-desktop .stylo-window-control__mark--restore::before,
  html.stylo-desktop .stylo-window-control__mark--restore::after {
    content: "";
    position: absolute;
    border: 1px solid currentColor;
  }

  html.stylo-desktop .stylo-window-control__mark--maximize::before {
    inset: 1px;
  }

  html.stylo-desktop .stylo-window-control__mark--restore::before {
    inset: 3px 1px 1px 3px;
  }

  html.stylo-desktop .stylo-window-control__mark--restore::after {
    inset: 1px 3px 3px 1px;
    background: transparent;
  }

  html.stylo-desktop .stylo-window-control__mark--close::before,
  html.stylo-desktop .stylo-window-control__mark--close::after {
    content: "";
    position: absolute;
    top: 6px;
    left: 1px;
    width: 12px;
    height: 1px;
    background: currentColor;
  }

  html.stylo-desktop .stylo-window-control__mark--close::before {
    transform: rotate(45deg);
  }

  html.stylo-desktop .stylo-window-control__mark--close::after {
    transform: rotate(-45deg);
  }
`;

const DESKTOP_WINDOW_CONTROLS_JS = `
  (() => {
    if (document.getElementById("stylo-desktop-window-drag-region")) return;

    const api = window.styloDesktop || window.qalamDesktop;
    const isMac = document.documentElement.classList.contains("stylo-desktop-darwin");

    const dragRegion = document.createElement("div");
    dragRegion.id = "stylo-desktop-window-drag-region";
    dragRegion.setAttribute("aria-hidden", "true");

    document.body.appendChild(dragRegion);
    if (isMac) return;

    if (!api || typeof api.windowControl !== "function") return;

    const controls = document.createElement("div");
    controls.id = "stylo-desktop-window-controls";
    controls.setAttribute("aria-label", "Window controls");
    controls.innerHTML = [
      '<button class="stylo-window-control" type="button" data-window-action="minimize" aria-label="Minimize" title="Minimize"><span class="stylo-window-control__mark stylo-window-control__mark--minimize" aria-hidden="true"></span></button>',
      '<button class="stylo-window-control" type="button" data-window-action="toggle-maximize" aria-label="Maximize" title="Maximize"><span class="stylo-window-control__mark stylo-window-control__mark--maximize" aria-hidden="true"></span></button>',
      '<button class="stylo-window-control" type="button" data-window-action="close" aria-label="Close" title="Close"><span class="stylo-window-control__mark stylo-window-control__mark--close" aria-hidden="true"></span></button>'
    ].join("");

    const syncWindowState = (state) => {
      const isMaximized = Boolean(state && state.isMaximized);
      const maximizeButton = controls.querySelector('[data-window-action="toggle-maximize"]');
      const maximizeMark = maximizeButton && maximizeButton.querySelector(".stylo-window-control__mark");
      document.documentElement.dataset.styloWindowMaximized = isMaximized ? "true" : "false";
      if (!maximizeButton || !maximizeMark) return;
      maximizeButton.setAttribute("aria-label", isMaximized ? "Restore" : "Maximize");
      maximizeButton.setAttribute("title", isMaximized ? "Restore" : "Maximize");
      maximizeMark.classList.toggle("stylo-window-control__mark--maximize", !isMaximized);
      maximizeMark.classList.toggle("stylo-window-control__mark--restore", isMaximized);
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
  const configuredUrl = normalizeStartUrl(
    process.env.STYLO_DESKTOP_URL || process.env.QALAM_DESKTOP_URL
  );
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

ipcMain.handle("stylo-window-control", (event, action) => {
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

ipcMain.handle("stylo-leporello-sketch-start", (_event, payload) => {
  if (process.platform !== "darwin") {
    return { ok: false, message: "系统速绘目前仅支持 macOS。" };
  }
  const projectName = typeof payload?.projectName === "string" ? payload.projectName.trim().slice(0, 120) : "Leporello";
  const pageId = typeof payload?.pageId === "string" ? payload.pageId.trim().slice(0, 120) : "panel";
  if (!pageId || !/^[a-zA-Z0-9_-]+$/.test(pageId)) {
    return { ok: false, message: "折页标识无效。" };
  }
  for (const [sessionId, session] of leporelloSketchSessions) {
    if (Date.now() - session.createdAt > 6 * 60 * 60 * 1000) removeLeporelloSketchSession(sessionId);
  }
  try {
    const sessionId = crypto.randomUUID();
    const directory = path.join(app.getPath("temp"), "stylo-leporello", sessionId);
    const safeProjectName = (projectName || "Leporello")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "Leporello";
    const filePath = path.join(directory, `${safeProjectName}-${pageId}-21x9.png`);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(filePath, createBlankLeporelloPng(), { flag: "wx", mode: 0o600 });
    leporelloSketchSessions.set(sessionId, { directory, filePath, createdAt: Date.now() });
    shell.showItemInFolder(filePath);
    return {
      ok: true,
      sessionId,
      message: "已在 Finder 中准备 2100 × 900 画纸。使用快速操作中的标记，并在设备按钮中选择附近的 iPad 或 iPhone。",
    };
  } catch (error) {
    console.warn("Unable to start Leporello sketch", error);
    return { ok: false, message: "无法创建系统速绘画纸。" };
  }
});

ipcMain.handle("stylo-leporello-sketch-complete", (_event, sessionId) => {
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return { ok: false, message: "速绘会话无效。" };
  }
  const session = leporelloSketchSessions.get(sessionId);
  if (!session) return { ok: false, message: "速绘会话已失效，请重新开始。" };
  try {
    const stat = fs.statSync(session.filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > LEPORELLO_SKETCH_MAX_BYTES) {
      return { ok: false, message: "速绘文件大小无效。" };
    }
    const bytes = fs.readFileSync(session.filePath);
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(pngSignature)) {
      return { ok: false, message: "速绘文件不是有效的 PNG。" };
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width <= 0 || height <= 0 || width * height > 40_000_000) {
      return { ok: false, message: "速绘画纸尺寸无效。" };
    }
    const result = {
      ok: true,
      name: path.basename(session.filePath),
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      mimeType: "image/png",
      width,
      height,
      hasAlpha: false,
    };
    removeLeporelloSketchSession(sessionId);
    return result;
  } catch (error) {
    console.warn("Unable to complete Leporello sketch", error);
    return { ok: false, message: "无法读取系统速绘文件，请确认标记窗口已经保存。" };
  }
});

ipcMain.handle("stylo-leporello-sketch-cancel", (_event, sessionId) => {
  if (typeof sessionId === "string" && /^[0-9a-f-]{36}$/i.test(sessionId)) {
    removeLeporelloSketchSession(sessionId);
  }
  return { ok: true };
});

const createMainWindow = () => {
  const startUrl = getStartUrl();
  const isMac = process.platform === "darwin";
  const restoredWindowState = getRestoredWindowState();
  mainWindow = new BrowserWindow({
    ...restoredWindowState.bounds,
    minWidth: MIN_WINDOW_BOUNDS.width,
    minHeight: MIN_WINDOW_BOUNDS.height,
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
  let windowStateWriteTimer = null;

  const persistWindowStateSoon = () => {
    if (windowStateWriteTimer) clearTimeout(windowStateWriteTimer);
    windowStateWriteTimer = setTimeout(() => {
      windowStateWriteTimer = null;
      writeWindowState(mainWindow);
    }, WINDOW_STATE_WRITE_DELAY_MS);
  };

  const persistWindowStateNow = () => {
    if (windowStateWriteTimer) {
      clearTimeout(windowStateWriteTimer);
      windowStateWriteTimer = null;
    }
    writeWindowState(mainWindow);
  };

  if (restoredWindowState.isMaximized) mainWindow.maximize();

  const sendWindowState = () => {
    if (mainWindow.webContents.isDestroyed()) return;
    mainWindow.webContents.send("stylo-window-state", {
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
  mainWindow.on("move", persistWindowStateSoon);
  mainWindow.on("resize", persistWindowStateSoon);
  mainWindow.on("maximize", persistWindowStateSoon);
  mainWindow.on("unmaximize", persistWindowStateSoon);
  mainWindow.on("close", persistWindowStateNow);
  mainWindow.on("closed", () => {
    if (windowStateWriteTimer) clearTimeout(windowStateWriteTimer);
    windowStateWriteTimer = null;
    mainWindow = null;
  });

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
        `document.documentElement.classList.add("stylo-desktop", "stylo-desktop-${process.platform}");`,
        true
      )
      .catch(() => {});
    mainWindow.webContents.insertCSS(DESKTOP_CHROME_CSS).catch(() => {});
    mainWindow.webContents.executeJavaScript(DESKTOP_WINDOW_CONTROLS_JS, true).catch(() => {});
    sendWindowState();
  });

  mainWindow.loadURL(startUrl);
  return mainWindow;
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    migrateLegacyUserDataDirectory();
    if (process.platform !== "darwin") {
      Menu.setApplicationMenu(null);
    }

    createMainWindow();

    app.on("activate", () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createMainWindow();
        return;
      }
      mainWindow.show();
      mainWindow.focus();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  for (const sessionId of leporelloSketchSessions.keys()) removeLeporelloSketchSession(sessionId);
});

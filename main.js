const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const crypto = require("crypto");

const store = require("./src/store");
const monitor = require("./src/monitor");
const vcApi = require("./src/vcApi");
const proxy = require("./src/proxy");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function broadcastLinkUpdate(link) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("link-updated", link);
  }
}

function startAllEnabled() {
  const settings = store.loadSettings();
  for (const link of store.loadLinks()) {
    if (link.enabled) monitor.start(link, settings, broadcastLinkUpdate);
  }
}

app.whenReady().then(() => {
  createWindow();
  startAllEnabled();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  monitor.stopAll();
  if (process.platform !== "darwin") app.quit();
});

// ── IPC handlers ───────────────────────────────────────────────────────────

ipcMain.handle("get-settings", () => store.loadSettings());

ipcMain.handle("save-settings", (_e, settings) => {
  store.saveSettings(settings);
  // Restart monitors with the new proxy/webhook settings.
  for (const link of store.loadLinks()) {
    if (link.enabled) monitor.start(link, settings, broadcastLinkUpdate);
  }
  return store.loadSettings();
});

ipcMain.handle("get-links", () => store.loadLinks());

ipcMain.handle("add-link", async (_e, { url, europeOnly }) => {
  const settings = store.loadSettings();
  const agent = settings.proxy ? proxy.buildAgent(settings.proxy) : undefined;

  let label = "Custom search";
  let filters = {};
  try {
    filters = vcApi.filtersFromPageUrl(url);
  } catch {
    // ignore - leave filters empty, label stays generic
  }

  try {
    const { json } = await vcApi.search(url, { europeOnly: !!europeOnly, offset: 0, limit: 1, agent });
    const item = (json.items || [])[0];
    if (item) {
      const brand = item.brand?.name || "";
      const model = item.model?.name || "";
      label = [brand, model].filter(Boolean).join(" - ") || label;
    }
  } catch {
    // ignore - keep default label, monitoring can still run
  }

  const link = {
    id: crypto.randomUUID(),
    url,
    label,
    europeOnly: !!europeOnly,
    enabled: true,
    seenIds: undefined,
    status: {},
  };

  const links = store.loadLinks();
  links.push(link);
  store.saveLinks(links);

  monitor.start(link, settings, broadcastLinkUpdate);
  return link;
});

ipcMain.handle("remove-link", (_e, id) => {
  monitor.stop(id);
  const links = store.loadLinks().filter((l) => l.id !== id);
  store.saveLinks(links);
  return links;
});

ipcMain.handle("toggle-link", (_e, id) => {
  const settings = store.loadSettings();
  const links = store.loadLinks();
  const link = links.find((l) => l.id === id);
  if (!link) return null;

  link.enabled = !link.enabled;
  store.saveLinks(links);

  if (link.enabled) {
    monitor.start(link, settings, broadcastLinkUpdate);
  } else {
    monitor.stop(link.id);
  }
  return link;
});

ipcMain.handle("check-link-now", async (_e, id) => {
  const settings = store.loadSettings();
  const links = store.loadLinks();
  const link = links.find((l) => l.id === id);
  if (!link) return null;
  return monitor.runOnce(link, settings);
});

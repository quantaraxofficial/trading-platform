// TradePilot for Windows (Electron): the TradePilot site in its own app window, built like
// TradingView Desktop. A window is a 34px title bar of our own (ui/titlebar.html: chart tabs with
// their symbol and price, "+", new window, the main menu, and Windows' own minimise / maximise /
// close with Snap layouts) over the site's tabs, each a WebContentsView of its own. The main menu
// and a tab's menu are an overlay view on top (ui/menu.html). Tabs and windows come back as they
// were; desktop settings (ui/settings.html): start with Windows, restore tabs, theme, zoom,
// hardware acceleration. Hidden tabs are throttled, so a window of many charts stays light.
"use strict";

const { app, BrowserWindow, WebContentsView, ipcMain, shell, nativeTheme, clipboard, session, Menu, screen } = require("electron");
const path = require("path");
const fs = require("fs");

// config.json (optional): the local edition — another site address, its own data folder, and the
// servers it starts on this PC (local-servers.js). Without it: the live TradePilot.
const CONFIG = (() => { try { return require("./config.json"); } catch { return {}; } })();
const LOCAL = CONFIG.local || null;
const SITE = (process.env.TRADEPILOT_URL || CONFIG.site || "https://34-93-138-162.sslip.io").replace(/\/$/, "");
const SITE_ORIGIN = new URL(SITE).origin;
const HOME_URL = `${SITE}/chart`;
const TITLE_H = 34;
const PARTITION = "persist:tradepilot";
const UI = (f) => path.join(__dirname, "ui", f);
const ICON = path.join(__dirname, "..", "build", "icon.png");
// Sign-in pop-ups the site opens (Google through Firebase): real windows, so sign-in works
const AUTH_HOSTS = [/\.firebaseapp\.com$/, /^accounts\.google\.com$/, /^apis\.google\.com$/, /\.googleusercontent\.com$/];

// ---- settings and session (userData/settings.json)
const SETTINGS_FILE = () => path.join(app.getPath("userData"), "settings.json");
const DEFAULTS = { openAtLogin: false, restoreTabs: true, hardwareAcceleration: true, theme: "system", zoom: 1, windows: [], reminders: [], phoneAccess: false };
let settings = { ...DEFAULTS };
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), "utf8")) }; } catch { settings = { ...DEFAULTS }; }
}
let saveTimer = null;
function saveSettings(now = false) {
  const write = () => { try { fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2)); } catch { /* disk full / read only */ } };
  clearTimeout(saveTimer);
  if (now) write(); else saveTimer = setTimeout(write, 400);
}

// (before the app is ready: GPU on or off, and the same browser identity as Chrome so sign-in
// pages treat the app like a normal browser)
app.setPath("userData", path.join(app.getPath("appData"), CONFIG.userDataName || "TradePilot"));
loadSettings();
if (settings.hardwareAcceleration === false) app.disableHardwareAcceleration();
app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/\S+/, "").replace(/\s?tradepilot-desktop\/\S+/i, "") + ` TradePilotDesktop/${app.getVersion()}`;

// One app: a second launch (or a tradepilot:// link) goes to the open window
if (!app.requestSingleInstanceLock()) { app.quit(); }
// (tradepilot:// links belong to the live app)
if (!LOCAL) app.setAsDefaultProtocolClient("tradepilot");

function linkToUrl(link) {
  // tradepilot://chart?symbol=XAU/USD → SITE/chart?symbol=XAU/USD
  try {
    const u = new URL(link);
    if (u.protocol !== "tradepilot:") return null;
    const p = (u.host + u.pathname).replace(/\/+$/, "") || "chart";
    return `${SITE}/${p.replace(/^\/+/, "")}${u.search}`;
  } catch { return null; }
}

// ---- theme: System / Dark / Light, for the app's title bar and the site
const isDark = () => settings.theme === "dark" || (settings.theme === "system" && nativeTheme.shouldUseDarkColors);
const COLORS = {
  dark: { bar: "#0c0e15", tab: "#131722", text: "#d1d4dc", muted: "#787b86", border: "#2a2e39", hover: "#1e222d", accent: "#8b5cf6", page: "#131722" },
  light: { bar: "#e7e9ef", tab: "#ffffff", text: "#131722", muted: "#6a6d78", border: "#d1d4dc", hover: "#f0f3fa", accent: "#7c3aed", page: "#ffffff" },
};
const colors = () => COLORS[isDark() ? "dark" : "light"];
function siteTheme(wc) {
  const t = isDark() ? "dark" : "light";
  wc.executeJavaScript(`try{localStorage.setItem("tv:theme","${t}");document.documentElement.setAttribute("data-theme","${t}");window.dispatchEvent(new CustomEvent("tv:set-theme",{detail:{theme:"${t}"}}))}catch(e){}`).catch(() => {});
}

// ---- windows
const windows = new Set();
let closedTabs = [];            // the most recent first: Reopen closed tab
let quitting = false;

class AppWindow {
  constructor(state = {}) {
    const work = screen.getPrimaryDisplay().workArea;
    const b = state.bounds && visibleOnSomeDisplay(state.bounds) ? state.bounds : { width: Math.min(1600, work.width), height: Math.min(960, work.height), x: undefined, y: undefined };
    const c = colors();
    this.win = new BrowserWindow({
      ...b, minWidth: 760, minHeight: 480, show: false, backgroundColor: c.page, icon: ICON, title: "TradePilot",
      titleBarStyle: "hidden",
      titleBarOverlay: { color: c.bar, symbolColor: c.text, height: TITLE_H },
      webPreferences: { preload: path.join(__dirname, "preload-ui.js"), contextIsolation: true, sandbox: true, spellcheck: false },
    });
    this.tabs = [];
    this.active = null;
    this.overlay = null;          // the menu overlay view (main menu, a tab's menu)
    this.win.loadFile(UI("titlebar.html"));
    this.win.once("ready-to-show", () => { if (state.maximized) this.win.maximize(); this.win.show(); });
    for (const ev of ["resize", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) this.win.on(ev, () => { this.layout(); this.send(); });
    this.win.on("close", () => { if (!quitting && windows.size === 1) rememberSession(); });
    this.win.on("closed", () => { for (const t of this.tabs) destroyView(t.view); this.tabs = []; windows.delete(this); if (!quitting) rememberSession(); });
    this.win.on("focus", () => { lastFocused = this; });
    this.win.webContents.on("before-input-event", (e, input) => this.shortcut(e, input));
    const urls = state.tabs && state.tabs.length ? state.tabs : state.tabs ? [] : [HOME_URL];
    urls.forEach((u, i) => this.addTab(u, i === (state.active ?? 0)));
    if (!this.active && this.tabs.length) this.activate(this.tabs[0].id);
    windows.add(this);
    lastFocused = this;
  }

  // the site's area: everything under the title bar (all of the window in full screen)
  area() {
    const [w, h] = this.win.getContentSize();
    const top = this.win.isFullScreen() ? 0 : TITLE_H;
    return { x: 0, y: top, width: w, height: Math.max(0, h - top) };
  }
  layout() {
    const a = this.area();
    for (const t of this.tabs) {
      const on = t.id === this.active;
      t.view.setVisible(on);
      if (on) t.view.setBounds(a);
    }
    if (this.overlay?.getVisible()) { const [w, h] = this.win.getContentSize(); this.overlay.setBounds({ x: 0, y: 0, width: w, height: h }); }
  }

  addTab(url = HOME_URL, activate = true, index) {
    const view = new WebContentsView({
      webPreferences: {
        partition: PARTITION, preload: path.join(__dirname, "preload-site.js"),
        contextIsolation: true, sandbox: true, spellcheck: false, backgroundThrottling: true,
      },
    });
    view.setBackgroundColor(colors().page);
    const tab = { id: `t${++tabSeq}`, view, url, title: "TradePilot", favicon: null, loading: true };
    const wc = view.webContents;
    wc.setZoomFactor(settings.zoom || 1);
    wc.on("page-title-updated", (_e, title) => { tab.title = title; this.send(); if (tab.id === this.active) this.win.setTitle(title); });
    wc.on("page-favicon-updated", (_e, icons) => { tab.favicon = icons[0] || null; this.send(); });
    wc.on("did-start-loading", () => { tab.loading = true; this.send(); });
    wc.on("did-stop-loading", () => { tab.loading = false; this.send(); });
    // (the site follows the app's theme: System / Dark / Light)
    wc.on("did-finish-load", () => { wc.setZoomFactor(settings.zoom || 1); siteTheme(wc); });
    const remember = (_e, u) => { tab.url = u; rememberSessionSoon(); };
    wc.on("did-navigate", remember);
    wc.on("did-navigate-in-page", remember);
    // links: the site's own pages in a new tab, sign-in pop-ups as windows, the rest in the browser
    wc.setWindowOpenHandler(({ url: u }) => {
      let host = "";
      try { host = new URL(u).hostname; } catch { return { action: "deny" }; }
      if (AUTH_HOSTS.some(r => r.test(host))) {
        return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 680, parent: this.win, autoHideMenuBar: true, backgroundColor: "#ffffff", webPreferences: { partition: PARTITION } } };
      }
      if (u.startsWith(SITE_ORIGIN)) { this.addTab(u, true, this.tabs.indexOf(tab) + 1); return { action: "deny" }; }
      if (/^https?:|^mailto:/.test(u)) shell.openExternal(u);
      return { action: "deny" };
    });
    wc.on("will-navigate", (e, u) => {
      if (u.startsWith(SITE_ORIGIN) || u.startsWith("about:")) return;
      try { if (AUTH_HOSTS.some(r => r.test(new URL(u).hostname))) return; } catch { /* bad url */ }
      e.preventDefault();
      if (/^https?:|^mailto:/.test(u)) shell.openExternal(u);
    });
    wc.on("before-input-event", (e, input) => this.shortcut(e, input));
    wc.on("render-process-gone", () => { tab.title = "This tab stopped — reload it"; this.send(); });
    view.setVisible(false);
    this.win.contentView.addChildView(view, this.overlay ? this.win.contentView.children.indexOf(this.overlay) : undefined);
    if (index === undefined || index > this.tabs.length) this.tabs.push(tab); else this.tabs.splice(index, 0, tab);
    wc.loadURL(url);
    if (activate) this.activate(tab.id); else this.send();
    rememberSessionSoon();
    return tab;
  }

  activate(id) {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;
    this.active = id;
    this.layout();
    tab.view.webContents.focus();
    this.win.setTitle(tab.title);
    this.send();
    rememberSessionSoon();
  }

  closeTab(id) {
    const i = this.tabs.findIndex(t => t.id === id);
    if (i < 0) return;
    const [tab] = this.tabs.splice(i, 1);
    closedTabs.unshift(tab.view.webContents.getURL() || tab.url);
    closedTabs = closedTabs.slice(0, 20);
    this.win.contentView.removeChildView(tab.view);
    destroyView(tab.view);
    if (!this.tabs.length) { this.win.close(); return; }
    if (this.active === id) this.activate(this.tabs[Math.min(i, this.tabs.length - 1)].id);
    else this.send();
    rememberSessionSoon();
  }

  moveTab(id, to) {
    const i = this.tabs.findIndex(t => t.id === id);
    if (i < 0) return;
    const [tab] = this.tabs.splice(i, 1);
    this.tabs.splice(Math.max(0, Math.min(to, this.tabs.length)), 0, tab);
    this.send();
    rememberSessionSoon();
  }

  // the tab bar: title, price and change, read from the page's title ("XAUUSD 3,881.77 ▲ +0.10% | TradePilot")
  send() {
    if (this.win.isDestroyed()) return;
    const c = colors();
    this.win.webContents.send("state", {
      tabs: this.tabs.map(t => ({ id: t.id, title: t.title, favicon: t.favicon, loading: t.loading, url: t.view.webContents.getURL() || t.url })),
      active: this.active, maximized: this.win.isMaximized(), fullscreen: this.win.isFullScreen(), dark: isDark(), colors: c,
    });
  }

  applyTheme() {
    const c = colors();
    try { this.win.setTitleBarOverlay({ color: c.bar, symbolColor: c.text, height: TITLE_H }); } catch { /* not supported */ }
    this.win.setBackgroundColor(c.page);
    for (const t of this.tabs) { t.view.setBackgroundColor(c.page); siteTheme(t.view.webContents); }
    this.send();
  }

  // the main menu or a tab's menu: an overlay view over the whole window
  openOverlay(kind, data = {}) {
    if (!this.overlay) {
      this.overlay = new WebContentsView({ webPreferences: { preload: path.join(__dirname, "preload-ui.js"), contextIsolation: true, sandbox: true } });
      this.overlay.setBackgroundColor("#00000000");
      this.overlay.webContents.loadFile(UI("menu.html"));
      this.overlay.webContents.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "Escape") { e.preventDefault(); this.closeOverlay(); } });
    }
    this.win.contentView.addChildView(this.overlay);       // (on top)
    const [w, h] = this.win.getContentSize();
    this.overlay.setBounds({ x: 0, y: 0, width: w, height: h });
    this.overlay.setVisible(true);
    const payload = { kind, ...data, colors: colors(), dark: isDark(), theme: settings.theme, zoom: Math.round((settings.zoom || 1) * 100), version: app.getVersion(), canReopen: closedTabs.length > 0 };
    const show = () => { this.overlay.webContents.send("overlay", payload); this.overlay.webContents.focus(); };
    if (this.overlay.webContents.isLoading()) this.overlay.webContents.once("did-finish-load", show); else show();
  }
  closeOverlay() {
    if (!this.overlay) return;
    this.overlay.setVisible(false);
    const tab = this.tabs.find(t => t.id === this.active);
    tab?.view.webContents.focus();
  }

  // TradingView Desktop's keys: Ctrl+T / W / Tab / 1-9, Ctrl+N, Ctrl+Shift+T, zoom, F11, Ctrl+Shift+Q
  shortcut(e, input) {
    if (input.type !== "keyDown") return;
    const ctrl = input.control || input.meta, k = input.key.toLowerCase();
    const act = (fn) => { e.preventDefault(); fn(); };
    const tab = this.tabs.find(t => t.id === this.active);
    if (ctrl && !input.shift && k === "t") return act(() => this.addTab(HOME_URL));
    if (ctrl && !input.shift && k === "w") return act(() => this.closeTab(this.active));
    if (ctrl && input.shift && k === "t") return act(() => reopenClosed(this));
    if (ctrl && !input.shift && k === "n") return act(() => new AppWindow());
    if (ctrl && input.shift && k === "q") return act(() => app.quit());
    if (ctrl && k === "tab") return act(() => {
      const i = this.tabs.findIndex(t => t.id === this.active);
      const n = this.tabs.length;
      this.activate(this.tabs[(i + (input.shift ? n - 1 : 1)) % n].id);
    });
    if (ctrl && /^[1-9]$/.test(k)) return act(() => { const t = k === "9" ? this.tabs[this.tabs.length - 1] : this.tabs[+k - 1]; if (t) this.activate(t.id); });
    if (ctrl && (k === "=" || k === "+")) return act(() => setZoom((settings.zoom || 1) + 0.1));
    if (ctrl && k === "-") return act(() => setZoom((settings.zoom || 1) - 0.1));
    if (ctrl && k === "0") return act(() => setZoom(1));
    if (ctrl && k === ",") return act(() => openSettings());
    if (k === "f11") return act(() => this.win.setFullScreen(!this.win.isFullScreen()));
    if ((ctrl && k === "r") || k === "f5") return act(() => tab?.view.webContents.reload());
    if (ctrl && input.shift && k === "i" && !app.isPackaged) return act(() => tab?.view.webContents.openDevTools({ mode: "detach" }));
  }
}
let tabSeq = 0;
let lastFocused = null;

function destroyView(view) {
  try { if (!view.webContents.isDestroyed()) view.webContents.close(); } catch { /* gone */ }
}
function visibleOnSomeDisplay(b) {
  return screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y < a.y + a.height - 40 && b.y + 20 > a.y;
  });
}
function reopenClosed(w) {
  const url = closedTabs.shift();
  if (url) w.addTab(url);
}
function setZoom(z) {
  settings.zoom = Math.round(Math.max(0.5, Math.min(2, z)) * 10) / 10;
  for (const w of windows) for (const t of w.tabs) t.view.webContents.setZoomFactor(settings.zoom);
  saveSettings();
  for (const w of windows) if (w.overlay?.getVisible()) w.overlay.webContents.send("zoom", Math.round(settings.zoom * 100));
}
function setTheme(theme) {
  settings.theme = theme;
  nativeTheme.themeSource = theme;
  saveSettings();
  for (const w of windows) w.applyTheme();
  settingsWin?.webContents.send("settings", publicSettings());
}

// ---- the session: every window's tabs and place, for next time
let sessionTimer = null;
function rememberSessionSoon() { clearTimeout(sessionTimer); sessionTimer = setTimeout(rememberSession, 800); }
function rememberSession() {
  const list = [...windows].filter(w => !w.win.isDestroyed()).map(w => ({
    bounds: w.win.getNormalBounds(), maximized: w.win.isMaximized(),
    tabs: w.tabs.map(t => { const u = t.view.webContents.getURL() || t.url; return u.startsWith(SITE_ORIGIN) ? u : HOME_URL; }),
    active: Math.max(0, w.tabs.findIndex(t => t.id === w.active)),
  }));
  if (list.length) settings.windows = list;
  saveSettings();
}

// ---- desktop settings window
let settingsWin = null;
const publicSettings = () => ({
  openAtLogin: app.getLoginItemSettings().openAtLogin, restoreTabs: settings.restoreTabs, hardwareAcceleration: settings.hardwareAcceleration,
  theme: settings.theme, zoom: Math.round((settings.zoom || 1) * 100), version: app.getVersion(), electron: process.versions.electron, site: SITE, colors: colors(), dark: isDark(),
  // (the local edition: the phone apps on this Wi-Fi, and the addresses they use)
  local: !!LOCAL, phoneAccess: !!settings.phoneAccess, phoneAddresses: LOCAL ? require("./local-servers").lanAddresses().map((ip) => `${ip}`) : [],
  frontendPort: LOCAL?.frontendPort || null,
});
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  const parent = lastFocused?.win;
  const c = colors();
  settingsWin = new BrowserWindow({
    width: 560, height: 720, resizable: false, minimizable: false, maximizable: false, parent, modal: false, show: false,
    title: "TradePilot settings", icon: ICON, backgroundColor: c.page, titleBarStyle: "hidden",
    titleBarOverlay: { color: c.page, symbolColor: c.text, height: TITLE_H },
    webPreferences: { preload: path.join(__dirname, "preload-ui.js"), contextIsolation: true, sandbox: true },
  });
  settingsWin.loadFile(UI("settings.html"));
  settingsWin.once("ready-to-show", () => settingsWin.show());
  settingsWin.webContents.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "Escape") { e.preventDefault(); settingsWin.close(); } });
  settingsWin.on("closed", () => { settingsWin = null; });
}

// ---- messages from the title bar, the menu and the settings window
const winOf = (e) => [...windows].find(w => w.win.webContents === e.sender || w.overlay?.webContents === e.sender);
ipcMain.on("ui:ready", (e) => winOf(e)?.send());
ipcMain.on("tab:activate", (e, id) => winOf(e)?.activate(id));
ipcMain.on("tab:close", (e, id) => winOf(e)?.closeTab(id));
ipcMain.on("tab:new", (e) => winOf(e)?.addTab(HOME_URL));
ipcMain.on("tab:move", (e, id, to) => winOf(e)?.moveTab(id, to));
ipcMain.on("tab:menu", (e, id, x) => winOf(e)?.openOverlay("tab", { id, x }));
ipcMain.on("window:new", () => new AppWindow());
ipcMain.on("menu:open", (e, x) => winOf(e)?.openOverlay("main", { x }));
ipcMain.on("overlay:close", (e) => winOf(e)?.closeOverlay());
ipcMain.on("menu:action", (e, action, arg) => {
  const w = winOf(e);
  if (!w) return;
  const tab = w.tabs.find(t => t.id === (arg?.id || w.active));
  const close = () => w.closeOverlay();
  switch (action) {
    case "settings": close(); openSettings(); break;
    case "reminders": close(); openReminders(); break;
    case "new-tab": close(); w.addTab(HOME_URL); break;
    case "new-window": close(); new AppWindow(); break;
    case "reopen": close(); reopenClosed(w); break;
    case "open-clipboard": {
      close();
      const text = clipboard.readText().trim();
      const url = linkToUrl(text) || (text.startsWith(SITE_ORIGIN) ? text : null);
      if (url) w.addTab(url);
      break;
    }
    case "zoom-in": setZoom((settings.zoom || 1) + 0.1); break;
    case "zoom-out": setZoom((settings.zoom || 1) - 0.1); break;
    case "zoom-reset": setZoom(1); break;
    case "theme": setTheme(arg); break;
    case "quit": app.quit(); break;
    // a tab's menu
    case "reload": close(); tab?.view.webContents.reload(); break;
    case "duplicate": close(); if (tab) w.addTab(tab.view.webContents.getURL(), true, w.tabs.indexOf(tab) + 1); break;
    case "to-window": {
      close();
      if (tab && w.tabs.length > 1) { const url = tab.view.webContents.getURL(); w.closeTab(tab.id); new AppWindow({ tabs: [url] }); }
      break;
    }
    case "close-tab": close(); if (tab) w.closeTab(tab.id); break;
    case "close-others": close(); for (const t of [...w.tabs]) if (t.id !== tab?.id) w.closeTab(t.id); break;
    case "close-right": { close(); const i = w.tabs.indexOf(tab); for (const t of w.tabs.slice(i + 1)) w.closeTab(t.id); break; }
    case "copy-link": close(); if (tab) clipboard.writeText(tab.view.webContents.getURL()); break;
  }
});
ipcMain.handle("settings:get", () => publicSettings());
ipcMain.handle("settings:set", (_e, key, value) => {
  if (key === "openAtLogin") app.setLoginItemSettings({ openAtLogin: !!value });
  else if (key === "restoreTabs") settings.restoreTabs = !!value;
  else if (key === "hardwareAcceleration") settings.hardwareAcceleration = !!value;
  else if (key === "theme" && ["system", "dark", "light"].includes(value)) setTheme(value);
  else if (key === "zoom") setZoom(Number(value) / 100);
  else if (key === "phoneAccess" && LOCAL) settings.phoneAccess = !!value;
  saveSettings(true);
  return publicSettings();
});
ipcMain.on("settings:reminders", () => openReminders());
ipcMain.on("settings:relaunch", () => { quitting = true; rememberSession(); app.relaunch(); app.exit(0); });
ipcMain.on("settings:clear-cache", async () => { await session.fromPartition(PARTITION).clearCache(); });
ipcMain.on("settings:check-updates", () => checkForUpdates(true));

// ---- updates (from the site's /desktop/ folder, when one is published there)
let updater = null;
function checkForUpdates(manual = false) {
  if (LOCAL) { if (manual) settingsWin?.webContents.send("update", "This edition runs the branch on this PC: it's up to date with it."); return; }
  if (!app.isPackaged) { settingsWin?.webContents.send("update", "This is a development build."); return; }
  try {
    if (!updater) {
      updater = require("electron-updater").autoUpdater;
      updater.autoDownload = true;
      updater.on("update-available", (i) => settingsWin?.webContents.send("update", `Downloading version ${i.version}…`));
      updater.on("update-not-available", () => manual && settingsWin?.webContents.send("update", "You have the latest version."));
      updater.on("update-downloaded", (i) => settingsWin?.webContents.send("update", `Version ${i.version} is ready: it's installed when you close TradePilot.`));
      updater.on("error", () => manual && settingsWin?.webContents.send("update", "Couldn't check for updates right now."));
    }
    updater.checkForUpdates().catch(() => {});
  } catch { /* updater unavailable */ }
}

// ---- start
app.on("second-instance", (_e, argv) => {
  const due = reminderArg(argv);
  if (due) { fireReminder(due); return; }
  const link = argv.find(a => a.startsWith("tradepilot://"));
  const w = lastFocused && windows.has(lastFocused) ? lastFocused : [...windows][0];
  if (!w) { new AppWindow(link ? { tabs: [linkToUrl(link) || HOME_URL] } : {}); return; }
  if (w.win.isMinimized()) w.win.restore();
  w.win.focus();
  if (link) { const u = linkToUrl(link); if (u) w.addTab(u); }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = settings.theme;
  nativeTheme.on("updated", () => { if (settings.theme === "system") for (const w of windows) w.applyTheme(); });
  const ses = session.fromPartition(PARTITION);
  ses.preconnect({ url: SITE, numSockets: 2 });
  // permissions: the microphone (voice assistant), notifications, clipboard and full screen, for
  // TradePilot's own pages only
  const allowed = new Set(["media", "notifications", "clipboard-read", "clipboard-sanitized-write", "fullscreen", "pointerLock"]);
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    const origin = (() => { try { return new URL(details.requestingUrl || wc.getURL()).origin; } catch { return ""; } })();
    cb(origin === SITE_ORIGIN && allowed.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => origin === SITE_ORIGIN && allowed.has(permission));

  const fromTask = reminderArg(process.argv);
  if (fromTask && !reminderDue(fromTask)) { app.quit(); return; }
  startReminderClock();
  const open = () => {
    const link = process.argv.find(a => a.startsWith("tradepilot://"));
    const saved = settings.restoreTabs && settings.windows?.length ? settings.windows : [{}];
    saved.forEach((s, i) => new AppWindow(i === 0 && link ? { ...s, tabs: [...(s.tabs || []), linkToUrl(link) || HOME_URL], active: (s.tabs || []).length } : s));
    setTimeout(() => checkForUpdates(false), 15000);
    if (fromTask) fireReminder(fromTask);
  };
  if (LOCAL) startLocalEdition(open); else open();
});

// ---- the local edition: start the branch's servers (a splash shows how it's going), then the windows
function startLocalEdition(open) {
  const { startLocal } = require("./local-servers");
  const splash = new BrowserWindow({
    width: 460, height: 320, frame: false, resizable: false, show: false, backgroundColor: "#131722", icon: ICON, title: "TradePilot",
    webPreferences: { preload: path.join(__dirname, "preload-ui.js"), contextIsolation: true, sandbox: true },
  });
  splash.loadFile(UI("starting.html"));
  splash.once("ready-to-show", () => splash.show());
  const tell = (s) => { if (!splash.isDestroyed()) splash.webContents.send("starting", s); };
  let failed = false;
  const status = (text, detail) => { if (/didn't|couldn't/.test(text)) failed = true; tell({ status: text, detail, failed }); };
  const ask = (question) => new Promise((resolve) => {
    tell({ question });
    ipcMain.once("starting:answer", (_e, a) => resolve(a));
  });
  splash.on("closed", () => { if (!windows.size) app.quit(); });
  splash.webContents.once("did-finish-load", async () => {
    const ok = await startLocal({ ...LOCAL, phoneAccess: !!settings.phoneAccess }, path.join(app.getPath("userData"), "logs"), status, ask);
    if (ok) { open(); splash.destroy(); }
    else if (!failed) app.quit();
  });
}

// ---- trading reminders (reminders.js): the window to set them, Windows' tasks, the clock, the ringing
const reminders = require("./reminders");
let remindersWin = null;
const reminderArg = (argv) => (argv.find(a => a.startsWith("--reminder=")) || "").slice("--reminder=".length) || null;
const findReminder = (id) => (settings.reminders || []).find(r => r.id === id) || null;
const reminderDue = (id) => { const r = findReminder(id); return !!(r && r.enabled !== false && reminders.marketOpen(r.symbol)); };

function openReminders() {
  if (remindersWin && !remindersWin.isDestroyed()) { remindersWin.focus(); return; }
  const c = colors();
  remindersWin = new BrowserWindow({
    width: 620, height: 680, minWidth: 480, minHeight: 420, show: false, parent: lastFocused?.win, title: "Trading reminders", icon: ICON, backgroundColor: c.page,
    titleBarStyle: "hidden", titleBarOverlay: { color: c.page, symbolColor: c.text, height: TITLE_H },
    webPreferences: { preload: path.join(__dirname, "preload-ui.js"), contextIsolation: true, sandbox: true },
  });
  remindersWin.loadFile(UI("reminders.html"));
  remindersWin.once("ready-to-show", () => remindersWin.show());
  remindersWin.webContents.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "Escape") { e.preventDefault(); remindersWin.close(); } });
  remindersWin.on("closed", () => { remindersWin = null; });
}

// what the window may save: each reminder's own fields, checked
function cleanReminder(r) {
  const id = String(r?.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 20);
  const time = /^\d{2}:\d{2}$/.test(r?.time) ? r.time : null;
  const days = Array.isArray(r?.days) ? [...new Set(r.days.map(Number).filter(d => d >= 0 && d <= 6))] : [];
  const symbol = String(r?.symbol || "").toUpperCase().replace(/[^A-Z0-9/._-]/g, "").slice(0, 20);
  if (!id || !time || !days.length || !symbol) return null;
  return { id, name: String(r.name || "").slice(0, 60), symbol, interval: String(r.interval || "15min").replace(/[^a-z0-9]/gi, "").slice(0, 10),
    intervalLabel: String(r.intervalLabel || "").slice(0, 6), time, days, enabled: r.enabled !== false };
}
ipcMain.handle("reminders:get", () => ({ reminders: settings.reminders || [], colors: colors(), dark: isDark() }));
ipcMain.handle("reminders:save", async (_e, next) => {
  const previous = (settings.reminders || []).map(r => r.id);
  const list = (Array.isArray(next) ? next : []).map(cleanReminder).filter(Boolean).slice(0, 30);
  await reminders.syncTasks(list, previous, !!LOCAL);
  settings.reminders = list;
  saveSettings(true);
  return { reminders: list };
});
ipcMain.on("reminders:test", (_e, id) => fireReminder(id, { test: true }));

// ringing: the chart opens at once (a tab, the window to the front), the alarm until it's answered
let ringing = null;
const lastRung = new Map();
let snoozeTimer = null;
function fireReminder(id, { test = false, snoozed = false } = {}) {
  const r = findReminder(id);
  if (!r) return;
  if (!test && !reminders.marketOpen(r.symbol)) return;
  const minute = new Date().toISOString().slice(0, 16);
  if (!test && !snoozed && lastRung.get(id) === minute) return;
  lastRung.set(id, minute);
  if (!snoozed) openReminderChart(r);
  ringing = r;
  reminders.ring(r, { ...colors(), dark: isDark() });
}
function openReminderChart(r) {
  let w = lastFocused && windows.has(lastFocused) ? lastFocused : [...windows][0];
  if (!w) w = new AppWindow({ tabs: [] });
  const tab = w.addTab(`${SITE}/chart?symbol=${encodeURIComponent(r.symbol)}`);
  // (its timeframe, once the chart's there)
  tab.view.webContents.once("did-finish-load", () => setTimeout(() => {
    tab.view.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("tv:set-interval",{detail:{interval:${JSON.stringify(r.interval)}}}))`).catch(() => {});
  }, 2500));
  if (w.win.isMinimized()) w.win.restore();
  w.win.show();
  w.win.focus();
}
ipcMain.on("alarm:answer", (_e, action) => {
  reminders.closeAlarm();
  const r = ringing;
  ringing = null;
  clearTimeout(snoozeTimer);
  if (!r) return;
  if (action === "snooze") snoozeTimer = setTimeout(() => fireReminder(r.id, { snoozed: true }), 5 * 60 * 1000);
  if (action === "open") {
    const w = lastFocused && windows.has(lastFocused) ? lastFocused : [...windows][0];
    if (w) { if (w.win.isMinimized()) w.win.restore(); w.win.show(); w.win.focus(); }
  }
});

// while the app runs: its own clock (the tasks start it when it's closed)
function startReminderClock() {
  setInterval(() => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    for (const r of settings.reminders || []) {
      if (r.enabled !== false && r.time === hhmm && r.days.includes(now.getDay())) fireReminder(r.id);
    }
  }, 15000);
}

app.on("before-quit", () => { rememberSession(); quitting = true; saveSettings(true); if (LOCAL) require("./local-servers").stopLocal(); });
app.on("window-all-closed", () => app.quit());

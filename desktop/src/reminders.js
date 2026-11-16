// Trading reminders: on the days and at the time a trader picks, TradePilot opens on the chart they
// chose (symbol, timeframe) and rings — a window and a sound that keep going until they stop it
// (Stop, Open the chart, or Snooze). Only while that market is open: forex, metals, indices and
// stocks rest at the weekend (Friday 22:00 to Sunday 22:00 UTC), crypto never does.
//
// They ring even when the app is closed: each reminder is a Windows Task Scheduler task that starts
// TradePilot with --reminder=<id> (started that way while the market's closed, the app quits at once,
// unseen). While the app runs, its own timer rings them too (once per minute at most).
"use strict";

const { app, BrowserWindow, Notification, screen } = require("electron");
const { execFile } = require("child_process");
const path = require("path");

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const CRYPTO_BASES = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "BNB", "LTC", "DOT", "AVAX", "MATIC", "LINK", "TRX", "SHIB", "TON", "BCH"];

// The site's own split (src/app/trading/instruments.ts): no "/" is a stock; a crypto base; else forex / metals
function assetClassOf(symbol) {
  const s = String(symbol || "").toUpperCase();
  if (!s.includes("/")) return /USDT$|^(BTC|ETH|SOL)USD/.test(s) ? "crypto" : "stocks";
  const base = s.split("/")[0];
  if (CRYPTO_BASES.includes(base)) return "crypto";
  if (["XAU", "XAG", "XPT", "XPD"].includes(base)) return "commodities";
  return "forex";
}

// Is the market open at this moment? Crypto always; the rest not from Friday 22:00 to Sunday 22:00 UTC
function marketOpen(symbol, at = new Date()) {
  if (assetClassOf(symbol) === "crypto") return true;
  const d = at.getUTCDay(), h = at.getUTCHours() + at.getUTCMinutes() / 60;
  if (d === 6) return false;
  if (d === 5 && h >= 22) return false;
  if (d === 0 && h < 22) return false;
  return true;
}

// ---- Windows Task Scheduler: one weekly task per reminder
function taskPrefix(local) { return local ? "TradePilot Local" : "TradePilot"; }
function launchCommand(id) {
  // (packaged: the app's exe; from source: electron with the app's folder)
  const exe = `"${process.execPath}"`;
  return app.isPackaged ? `${exe} --reminder=${id}` : `${exe} "${app.getAppPath()}" --reminder=${id}`;
}
function schtasks(args) {
  return new Promise((resolve) => execFile("schtasks", args, { windowsHide: true }, (err, out, errOut) => resolve({ ok: !err, out: String(out || ""), err: String(errOut || err?.message || "") })));
}
async function syncTasks(reminders, previousIds, local) {
  // (TP_NO_TASKS: tests run without touching Windows' scheduler)
  if (process.env.TP_NO_TASKS) { for (const r of reminders) r.taskError = ""; return; }
  const prefix = taskPrefix(local);
  const keep = new Set();
  for (const r of reminders) {
    const name = `${prefix}\\Reminder ${r.id}`;
    if (!r.enabled || !r.days?.length || !/^\d{2}:\d{2}$/.test(r.time || "")) { await schtasks(["/Delete", "/F", "/TN", name]); r.taskError = ""; continue; }
    keep.add(r.id);
    const res = await schtasks(["/Create", "/F", "/TN", name, "/SC", "WEEKLY", "/D", r.days.map((d) => DAYS[d]).join(","), "/ST", r.time, "/TR", launchCommand(r.id)]);
    r.taskError = res.ok ? "" : res.err.trim().slice(0, 200);
  }
  for (const id of previousIds) if (!keep.has(id)) await schtasks(["/Delete", "/F", "/TN", `${prefix}\\Reminder ${id}`]);
}

// ---- the ringing window
let alarmWin = null;
function ring(reminder, colors) {
  if (alarmWin && !alarmWin.isDestroyed()) alarmWin.destroy();
  const area = screen.getPrimaryDisplay().workArea;
  const W = 440, H = 250;
  const win = new BrowserWindow({
    width: W, height: H, x: area.x + area.width - W - 24, y: area.y + area.height - H - 24,
    frame: false, resizable: false, alwaysOnTop: true, show: false, backgroundColor: colors.page, title: "TradePilot reminder",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload-ui.js"), contextIsolation: true, sandbox: true, autoplayPolicy: "no-user-gesture-required", backgroundThrottling: false },
  });
  alarmWin = win;
  win.setAlwaysOnTop(true, "screen-saver");
  win.loadFile(path.join(__dirname, "ui", "alarm.html"));
  win.once("ready-to-show", () => { win.show(); win.flashFrame(true); });
  win.webContents.once("did-finish-load", () => win.webContents.send("alarm", {
    name: reminder.name, symbol: reminder.symbol, intervalLabel: reminder.intervalLabel || reminder.interval, colors,
    dark: colors.dark, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));
  win.on("closed", () => { if (alarmWin === win) alarmWin = null; });
  // (the system notification too: clicking it brings the ringing window to the front)
  if (Notification.isSupported()) {
    const n = new Notification({ title: reminder.name || "Trading time", body: `${reminder.symbol} · ${reminder.intervalLabel || reminder.interval}: it's time. Stop the alarm in TradePilot.`, silent: true, icon: path.join(__dirname, "..", "build", "icon.png") });
    n.on("click", () => { if (!win.isDestroyed()) { win.show(); win.focus(); } });
    n.show();
  }
  return win;
}
function closeAlarm() { if (alarmWin && !alarmWin.isDestroyed()) alarmWin.destroy(); }

module.exports = { assetClassOf, marketOpen, syncTasks, ring, closeAlarm, DAYS };

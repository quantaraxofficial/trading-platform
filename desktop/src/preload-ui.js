// The app's own pages (title bar, menu, settings): a small, allow-listed bridge to the main process
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

const SEND = new Set(["ui:ready", "tab:activate", "tab:close", "tab:new", "tab:move", "tab:menu", "window:new", "menu:open", "overlay:close",
  "menu:action", "settings:relaunch", "settings:clear-cache", "settings:check-updates"]);
const INVOKE = new Set(["settings:get", "settings:set"]);
const ON = new Set(["state", "overlay", "zoom", "settings", "update"]);

contextBridge.exposeInMainWorld("tp", {
  send: (channel, ...args) => { if (SEND.has(channel)) ipcRenderer.send(channel, ...args); },
  invoke: (channel, ...args) => (INVOKE.has(channel) ? ipcRenderer.invoke(channel, ...args) : Promise.reject(new Error("not allowed"))),
  on: (channel, fn) => { if (ON.has(channel)) ipcRenderer.on(channel, (_e, ...args) => fn(...args)); },
});

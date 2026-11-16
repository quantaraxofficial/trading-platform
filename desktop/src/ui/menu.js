// The main menu (⋯) and a tab's menu, over the window. A click outside or Escape closes it.
"use strict";
const menu = document.getElementById("menu");
const I = {
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="3"/></svg>',
  tab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 5v14M5 12h14"/></svg>',
  win: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/></svg>',
  reopen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7"/><path d="M4 4v4.7h4.7"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/></svg>',
  reload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 12a8 8 0 1 1-2.3-5.6L20 8.7"/><path d="M20 4v4.7h-4.7"/></svg>',
  dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
};
const LOGO = '<svg width="40" height="40" viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#g)"/><path d="M18.5 8.5l-6 6-3.5-3.5-4.5 4.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 8.5h4v4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const item = (action, icon, label, key = "", disabled = false, cls = "") =>
  `<button class="item ${cls}" role="menuitem" data-action="${action}" ${disabled ? "disabled" : ""}>${I[icon] || ""}<span class="lbl">${label}</span>${key ? `<kbd>${key}</kbd>` : ""}</button>`;
let current = null;

function theme(colors, dark) {
  const r = document.documentElement;
  r.classList.toggle("light", !dark);
  r.style.setProperty("--panel", dark ? "#1e222d" : "#ffffff");
  r.style.setProperty("--text", colors.text); r.style.setProperty("--muted", colors.muted);
  r.style.setProperty("--sep", colors.border); r.style.setProperty("--accent", colors.accent);
  r.style.setProperty("--hover2", dark ? "#2a2e39" : "#f0f3fa");
}

window.tp.on("overlay", (d) => {
  current = d;
  theme(d.colors, d.dark);
  if (d.kind === "main") {
    menu.innerHTML = `<div class="head">${LOGO}<span class="name">TradePilot</span><span class="ver">Version ${d.version}</span></div><div class="sep"></div>
      ${item("settings", "settings", "Settings", "Ctrl + ,")}
      ${item("reminders", "bell", "Trading reminders")}
      ${item("new-tab", "tab", "New tab", "Ctrl + T")}
      ${item("new-window", "win", "New window", "Ctrl + N")}
      ${item("reopen", "reopen", "Reopen closed tab", "Ctrl + Shift + T", !d.canReopen)}
      ${item("open-clipboard", "link", "Open link from clipboard")}
      <div class="sep"></div>
      <div class="zoom">${I.zoom.replace("<svg", '<svg style="width:18px;height:18px;color:var(--muted)"')}<span class="lbl">Zoom</span>
        <button data-action="zoom-out" aria-label="Zoom out" title="Zoom out (Ctrl + −)"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>
        <output id="zoom" title="Reset (Ctrl + 0)">${d.zoom}%</output>
        <button data-action="zoom-in" aria-label="Zoom in" title="Zoom in (Ctrl + +)"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8M6 2v8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button></div>
      <div class="sep"></div>
      <div class="themes">
        <button class="theme ${d.theme === "system" ? "on" : ""}" data-action="theme" data-arg="system"><span class="pv"><span class="d"></span><span class="l"></span></span>System</button>
        <button class="theme ${d.theme === "dark" ? "on" : ""}" data-action="theme" data-arg="dark"><span class="pv"><span class="d"></span></span>Dark</button>
        <button class="theme ${d.theme === "light" ? "on" : ""}" data-action="theme" data-arg="light"><span class="pv"><span class="l"></span></span>Light</button>
      </div>
      <div class="sep"></div>
      ${item("quit", "exit", "Exit TradePilot", "Ctrl + Shift + Q", false, "danger")}`;
    menu.style.left = "auto";
    menu.style.right = `${Math.max(8, window.innerWidth - (d.x || window.innerWidth) + 8)}px`;
    menu.style.transformOrigin = "top right";
  } else {
    menu.innerHTML = `${item("reload", "reload", "Reload", "Ctrl + R")}
      ${item("duplicate", "dup", "Duplicate tab")}
      ${item("copy-link", "link", "Copy link")}
      ${item("to-window", "win", "Move tab to new window")}
      <div class="sep"></div>
      ${item("close-tab", "close", "Close tab", "Ctrl + W")}
      ${item("close-others", "close", "Close other tabs")}
      ${item("close-right", "close", "Close tabs to the right")}`;
    menu.style.right = "auto";
    menu.style.left = `${Math.max(8, Math.min(d.x || 8, window.innerWidth - 300))}px`;
    menu.style.transformOrigin = "top left";
  }
  menu.style.animation = "none"; void menu.offsetWidth; menu.style.animation = "";
  menu.querySelector("button:not(:disabled)")?.focus();
});
window.tp.on("zoom", (z) => { const o = document.getElementById("zoom"); if (o) o.textContent = `${z}%`; });

menu.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || b.disabled) return;
  const action = b.dataset.action;
  if (action === "theme") {
    menu.querySelectorAll(".theme").forEach((t) => t.classList.toggle("on", t === b));
    window.tp.send("menu:action", "theme", b.dataset.arg);
    return;
  }
  window.tp.send("menu:action", action, current?.kind === "tab" ? { id: current.id } : undefined);
});
menu.addEventListener("dblclick", (e) => { if (e.target.id === "zoom") window.tp.send("menu:action", "zoom-reset"); });
document.getElementById("backdrop").addEventListener("mousedown", () => window.tp.send("overlay:close"));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { window.tp.send("overlay:close"); return; }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const items = [...menu.querySelectorAll("button:not(:disabled)")];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  }
});

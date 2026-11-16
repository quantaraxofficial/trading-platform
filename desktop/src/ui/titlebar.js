// The title bar: chart tabs (symbol, price and change read from each page's title), "+",
// new window, the main menu. Drag a tab to reorder it, middle-click closes, right-click its menu.
"use strict";
const tabsEl = document.getElementById("tabs");
let state = { tabs: [], active: null };

// "XAUUSD 3,881.770 ▲ +0.10% | TradePilot" → symbol, price, direction, change
// (before the price comes, a chart tab shows its symbol from its address: /chart?symbol=XAU/USD)
function parse(title, url) {
  const t = String(title || "").replace(/\s*\|\s*TradePilot\s*$/, "").trim();
  const m = /^(\S+)\s+([\d.,]+)\s*([▲▼])?\s*([+−-]?[\d.,]+%)?/.exec(t);
  if (m) return { sym: m[1], price: m[2], dir: m[3] === "▲" ? "up" : m[3] === "▼" ? "down" : "", pct: m[4] || "" };
  try {
    const u = new URL(url);
    const s = u.pathname.startsWith("/chart") && u.searchParams.get("symbol");
    if (s && (!t || t === "Chart")) return { sym: s.replace("/", ""), price: "", dir: "", pct: "" };
  } catch { /* no address yet */ }
  return { sym: "", text: t || "TradePilot" };
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const LOGO = '<svg width="14" height="14" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#7c3aed"/><path d="M18.5 8.5l-6 6-3.5-3.5-4.5 4.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function render() {
  const c = state.colors;
  if (c) {
    const r = document.documentElement;
    r.classList.toggle("light", !state.dark);
    r.style.setProperty("--bar", c.bar); r.style.setProperty("--tab", c.tab); r.style.setProperty("--text", c.text);
    r.style.setProperty("--muted", c.muted); r.style.setProperty("--sep", c.border); r.style.setProperty("--hover", c.hover); r.style.setProperty("--accent", c.accent);
  }
  tabsEl.innerHTML = state.tabs.map((t) => {
    const p = parse(t.title, t.url);
    const label = p.sym
      ? `<span class="sym">${esc(p.sym)}</span>${p.price ? `<span class="price ${p.dir}">${esc(p.price)}</span>` : ""}${p.pct ? `<span class="${p.dir}">${esc(p.pct)}</span>` : ""}`
      : `<span>${esc(p.text)}</span>`;
    const icon = t.loading ? '<span class="spin"></span>' : t.favicon ? `<img src="${esc(t.favicon)}" alt="">` : LOGO;
    return `<div class="tab${t.id === state.active ? " active" : ""}" role="tab" aria-selected="${t.id === state.active}" data-id="${t.id}" title="${esc(t.title)}">
      <span class="icon">${icon}</span><span class="label">${label}</span>
      <button class="x" data-close="${t.id}" aria-label="Close tab" title="Close tab (Ctrl+W)"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button></div>`;
  }).join("");
}

window.tp.on("state", (s) => { state = s; if (!drag) render(); });
window.tp.send("ui:ready");

// clicks: activate, close (×, middle button), the tab's menu (right button)
tabsEl.addEventListener("mousedown", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  if (e.button === 1) { e.preventDefault(); window.tp.send("tab:close", tab.dataset.id); return; }
  if (e.button === 0 && !e.target.closest("[data-close]")) { window.tp.send("tab:activate", tab.dataset.id); startDrag(e, tab); }
});
tabsEl.addEventListener("click", (e) => {
  const x = e.target.closest("[data-close]");
  if (x) { e.stopPropagation(); window.tp.send("tab:close", x.dataset.close); }
});
tabsEl.addEventListener("contextmenu", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  e.preventDefault();
  window.tp.send("tab:menu", tab.dataset.id, Math.round(tab.getBoundingClientRect().left));
});
document.getElementById("new").addEventListener("click", () => window.tp.send("tab:new"));
document.getElementById("newwin").addEventListener("click", () => window.tp.send("window:new"));
document.getElementById("menu").addEventListener("click", (e) => window.tp.send("menu:open", Math.round(e.currentTarget.getBoundingClientRect().right)));

// dragging a tab along the bar reorders it
let drag = null;
function startDrag(e, tab) {
  const startX = e.clientX;
  const id = tab.dataset.id;
  let moved = false;
  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    if (!moved && Math.abs(dx) < 5) return;
    moved = true;
    drag = { id };
    tab.classList.add("dragging");
    tab.style.transform = `translateX(${dx}px)`;
  };
  const onUp = (ev) => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (moved) {
      const els = [...tabsEl.querySelectorAll(".tab")];
      const others = els.filter((el) => el !== tab);
      let to = others.length;
      for (let i = 0; i < others.length; i++) {
        const r = others[i].getBoundingClientRect();
        if (ev.clientX < r.left + r.width / 2) { to = i; break; }
      }
      window.tp.send("tab:move", id, to);
    }
    drag = null;
    tab.classList.remove("dragging");
    tab.style.transform = "";
    render();
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

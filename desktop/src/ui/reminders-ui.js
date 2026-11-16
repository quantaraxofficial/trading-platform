// Trading reminders: the list (on / off, test, edit, delete) and the form
"use strict";
const $ = (id) => document.getElementById(id);
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];   // Monday first
const LABEL = { "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m", "1h": "1h", "4h": "4h", "1day": "1D" };
const CRYPTO = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "BNB", "LTC", "DOT", "AVAX", "MATIC", "LINK", "TRX", "SHIB", "TON", "BCH"];
const isCrypto = (s) => { s = String(s || "").toUpperCase(); return s.includes("/") ? CRYPTO.includes(s.split("/")[0]) : /USDT$/.test(s); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let list = [];
let editing = null;      // the reminder being edited (a copy), or null
let days = new Set();

function theme(s) {
  const r = document.documentElement;
  r.classList.toggle("light", !s.dark);
  for (const [k, v] of Object.entries({ "--page": s.colors.page, "--text": s.colors.text, "--muted": s.colors.muted, "--sep": s.colors.border, "--accent": s.colors.accent, "--hover": s.colors.hover, "--hover2": s.dark ? "#2a2e39" : "#dfe2ea" })) r.style.setProperty(k, v);
}
const daysText = (d) => (d.length === 7 ? "Every day" : d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x)) ? "Mon – Fri" : ORDER.filter((x) => d.includes(x)).map((x) => DAY_NAMES[x]).join(", "));

function render() {
  $("list").innerHTML = list.length ? list.map((r) => `
    <div class="item" data-id="${r.id}">
      <label class="switch" title="${r.enabled ? "On" : "Off"}"><input type="checkbox" data-toggle ${r.enabled ? "checked" : ""} aria-label="On"><span></span></label>
      <div class="t"><b>${esc(r.name || "Reminder")} · ${esc(r.time)}</b>
        <small>${esc(daysText(r.days))} · ${esc(String(r.symbol).replace("/", ""))} ${esc(LABEL[r.interval] || r.interval)}${isCrypto(r.symbol) ? "" : " · not at weekends"}</small>
        ${r.taskError ? `<div class="err">Windows couldn't schedule it: ${esc(r.taskError)}</div>` : ""}</div>
      <button class="icon-btn" data-test title="Ring now (a test)" aria-label="Test"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></button>
      <button class="icon-btn" data-edit title="Edit" aria-label="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
      <button class="icon-btn" data-delete title="Delete" aria-label="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button>
    </div>`).join("") : `<div class="empty">No reminders yet. Add one for the sessions you trade.</div>`;
}

function renderDays() {
  const crypto = isCrypto($("f-symbol").value);
  $("f-days").innerHTML = ORDER.map((d) => `<button type="button" class="day ${days.has(d) ? "on" : ""} ${!crypto && (d === 0 || d === 6) ? "closed" : ""}" data-day="${d}">${DAY_NAMES[d]}</button>`).join("");
  $("f-note").textContent = !$("f-symbol").value ? "" : crypto
    ? "Crypto trades every day: it rings on every day you pick."
    : "This market rests at the weekend (Friday 22:00 to Sunday 22:00 UTC): it won't ring then.";
}

function openForm(r) {
  editing = r ? { ...r } : { id: `r${Date.now().toString(36)}`, enabled: true };
  $("f-name").value = r?.name || "";
  $("f-symbol").value = r?.symbol || "XAU/USD";
  $("f-interval").value = r?.interval || "15min";
  $("f-time").value = r?.time || "13:25";
  days = new Set(r?.days || [1, 2, 3, 4, 5]);
  renderDays();
  $("form").classList.add("show");
  $("f-name").focus();
}
const closeForm = () => { editing = null; $("form").classList.remove("show"); };

async function save(next) {
  $("msg").textContent = "Saving…";
  const res = await window.tp.invoke("reminders:save", next);
  list = res.reminders;
  render();
  $("msg").textContent = list.some((r) => r.taskError) ? "" : "Saved: Windows will open TradePilot at those times.";
}

window.tp.invoke("reminders:get").then((res) => { theme(res); list = res.reminders; render(); });

$("add").addEventListener("click", () => openForm(null));
$("cancel").addEventListener("click", closeForm);
$("f-symbol").addEventListener("input", renderDays);
$("f-days").addEventListener("click", (e) => {
  const b = e.target.closest("[data-day]");
  if (!b) return;
  const d = +b.dataset.day;
  if (days.has(d)) days.delete(d); else days.add(d);
  renderDays();
});
$("save").addEventListener("click", () => {
  const symbol = $("f-symbol").value.trim().toUpperCase();
  const time = $("f-time").value;
  if (!symbol) { $("f-note").textContent = "Pick a symbol."; return; }
  if (!days.size) { $("f-note").textContent = "Pick at least one day."; return; }
  if (!/^\d{2}:\d{2}$/.test(time)) { $("f-note").textContent = "Pick a time."; return; }
  const r = { ...editing, name: $("f-name").value.trim() || `${symbol.replace("/", "")} ${time}`, symbol, interval: $("f-interval").value, intervalLabel: LABEL[$("f-interval").value], time, days: [...days].sort() };
  const next = list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r];
  closeForm();
  save(next);
});
$("list").addEventListener("click", (e) => {
  const item = e.target.closest(".item");
  if (!item) return;
  const r = list.find((x) => x.id === item.dataset.id);
  if (e.target.closest("[data-test]")) window.tp.send("reminders:test", r.id);
  else if (e.target.closest("[data-edit]")) openForm(r);
  else if (e.target.closest("[data-delete]")) save(list.filter((x) => x.id !== r.id));
});
$("list").addEventListener("change", (e) => {
  if (!e.target.matches("[data-toggle]")) return;
  const id = e.target.closest(".item").dataset.id;
  save(list.map((x) => (x.id === id ? { ...x, enabled: e.target.checked } : x)));
});

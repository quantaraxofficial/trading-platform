// The desktop settings: applied at once (hardware acceleration after a restart)
"use strict";
const $ = (id) => document.getElementById(id);
let initialHw = null;
let initialPhone = null;

function show(s) {
  const r = document.documentElement;
  r.classList.toggle("light", !s.dark);
  r.style.setProperty("--page", s.colors.page); r.style.setProperty("--text", s.colors.text); r.style.setProperty("--muted", s.colors.muted);
  r.style.setProperty("--sep", s.colors.border); r.style.setProperty("--accent", s.colors.accent); r.style.setProperty("--hover", s.colors.hover);
  r.style.setProperty("--hover2", s.dark ? "#2a2e39" : "#dfe2ea");
  $("openAtLogin").checked = s.openAtLogin;
  $("restoreTabs").checked = s.restoreTabs;
  $("hardwareAcceleration").checked = s.hardwareAcceleration;
  if (initialHw === null) initialHw = s.hardwareAcceleration;
  $("restart").classList.toggle("show", s.hardwareAcceleration !== initialHw);
  document.querySelectorAll("#theme button").forEach((b) => b.classList.toggle("on", b.dataset.v === s.theme));
  const z = $("zoom");
  if (![...z.options].some((o) => +o.value === s.zoom)) z.add(new Option(`${s.zoom}%`, s.zoom));
  z.value = String(s.zoom);
  $("ver").textContent = `Version ${s.version} · Electron ${s.electron}`;
  // The local edition: the phone app over Wi-Fi
  $("phone").hidden = !s.local;
  if (s.local) {
    $("phoneAccess").checked = s.phoneAccess;
    if (initialPhone === null) initialPhone = s.phoneAccess;
    $("phoneRestart").classList.toggle("show", s.phoneAccess !== initialPhone);
    const addr = s.phoneAddresses || [];
    $("phoneInfo").textContent = !s.phoneAccess ? "" : addr.length
      ? `In the phone app, enter this PC's address: ${addr.join("  or  ")} (phone and PC on the same Wi-Fi).`
      : "This PC isn't on a local network right now: connect it to your Wi-Fi.";
  }
}

const set = (key, value) => window.tp.invoke("settings:set", key, value).then(show);
window.tp.invoke("settings:get").then(show);
window.tp.on("settings", show);
window.tp.on("update", (m) => { $("msg").textContent = m; });

for (const id of ["openAtLogin", "restoreTabs", "hardwareAcceleration"]) $(id).addEventListener("change", (e) => set(id, e.target.checked));
$("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) set("theme", b.dataset.v); });
$("zoom").addEventListener("change", (e) => set("zoom", +e.target.value));
$("reminders").addEventListener("click", () => window.tp.send("settings:reminders"));
$("relaunch").addEventListener("click", () => window.tp.send("settings:relaunch"));
$("phoneAccess").addEventListener("change", (e) => set("phoneAccess", e.target.checked));
$("phoneRelaunch").addEventListener("click", () => window.tp.send("settings:relaunch"));
$("clear").addEventListener("click", (e) => { window.tp.send("settings:clear-cache"); e.target.textContent = "Cleared"; e.target.disabled = true; });
$("updates").addEventListener("click", () => { $("msg").textContent = "Checking…"; window.tp.send("settings:check-updates"); });

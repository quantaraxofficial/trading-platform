// The ringing reminder: a chime that repeats until the trader answers (Open the chart, Snooze, Stop)
"use strict";
const $ = (id) => document.getElementById(id);
let ctx = null, timer = null;

// three rising notes, then a pause; again and again
function chime() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [659.25, 783.99, 987.77].forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = f;
    const t = t0 + i * 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.55);
  });
}
function startSound() {
  try { ctx = new AudioContext(); } catch { return; }
  ctx.resume().catch(() => {});
  chime();
  timer = setInterval(chime, 1600);
}
function stopSound() { clearInterval(timer); timer = null; if (ctx) { ctx.close().catch(() => {}); ctx = null; } }

window.tp.on("alarm", (a) => {
  const r = document.documentElement;
  r.classList.toggle("light", !a.dark);
  for (const [k, v] of Object.entries({ "--page": a.colors.page, "--text": a.colors.text, "--muted": a.colors.muted, "--sep": a.colors.border, "--accent": a.colors.accent, "--hover": a.colors.hover })) r.style.setProperty(k, v);
  $("title").textContent = a.name || "Trading time";
  $("when").textContent = `It's ${a.at}: time to trade`;
  $("sym").textContent = String(a.symbol || "").replace("/", "");
  $("tf").textContent = a.intervalLabel || "";
  startSound();
});
document.querySelector(".btns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  stopSound();
  window.tp.send("alarm:answer", b.dataset.a);
});

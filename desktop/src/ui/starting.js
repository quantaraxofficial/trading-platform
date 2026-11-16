// The splash while the local edition starts its servers: progress, and the question when the
// backend's port is taken
"use strict";
const $ = (id) => document.getElementById(id);
window.tp.on("starting", (s) => {
  if (s.status !== undefined) $("status").textContent = s.status;
  $("detail").textContent = s.detail || "";
  document.body.classList.toggle("failed", !!s.failed);
  $("ask").classList.toggle("show", !!s.question);
  if (s.question) $("q").textContent = s.question;
});
$("ask").addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  $("ask").classList.remove("show");
  window.tp.send("starting:answer", b.dataset.a);
});

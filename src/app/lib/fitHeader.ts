"use client";

// The chart header fits whatever width it has: it steps down only as far as it must, measured
// (not guessed from the window's width, since what's in it varies: the layout's name, Trade,
// the voice button…). 1: the buttons' labels go one at a time, Alert's, then Indicators', then
// Replay's (the one most looked for); 2: only the current
// interval stays (the rest are in its dropdown); 3: the layout's name gives way to its icon;
// 4: Compare, Undo / Redo and Quick search go (they have keys: Ctrl+Z, Ctrl+Y, Ctrl+K); 5: it
// scrolls sideways. Nothing ever squeezes on top of anything else.

import { useCallback, useRef } from "react";

const STEPS = [
  [],
  ["tv-hdr-noalert"],
  ["tv-hdr-noalert", "tv-hdr-noind"],
  ["tv-lw-1150"],
  ["tv-lw-1150", "tv-lw-1000"],
  ["tv-lw-1150", "tv-lw-1000", "tv-hdr-tight"],
  ["tv-lw-1150", "tv-lw-1000", "tv-hdr-tight", "tv-hdr-fewer"],
  ["tv-lw-1150", "tv-lw-1000", "tv-hdr-tight", "tv-hdr-fewer", "tv-hdr-scroll"],
];
const ALL = [...new Set(STEPS.flat())];

function watch(h: HTMLElement): () => void {
  let frame = 0, fitting = false;
  const fits = () => h.scrollWidth <= h.clientWidth + 1;
  const fit = () => {
    if (fitting) return;
    fitting = true;
    for (const step of STEPS) {
      h.classList.remove(...ALL);
      if (step.length) h.classList.add(...step);
      if (fits()) break;
    }
    // (the observers' own callbacks for these changes are let through and find the same answer)
    requestAnimationFrame(() => { fitting = false; });
  };
  const soon = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
  fit();
  const ro = new ResizeObserver(soon);
  ro.observe(h);
  // (buttons coming and going in it: the layout's name, the voice button, fonts loading…)
  const mo = new MutationObserver(soon);
  mo.observe(h, { childList: true, subtree: true, characterData: true });
  window.addEventListener("resize", soon);
  document.fonts?.ready.then(soon).catch(() => {});
  return () => { cancelAnimationFrame(frame); ro.disconnect(); mo.disconnect(); window.removeEventListener("resize", soon); };
}

// A ref for the header: it's fitted from the moment it appears (it can appear after the page)
export function useFitHeader() {
  const stop = useRef<(() => void) | null>(null);
  return useCallback((el: HTMLElement | null) => {
    stop.current?.();
    stop.current = el ? watch(el) : null;
  }, []);
}

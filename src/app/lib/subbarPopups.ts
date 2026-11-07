"use client";

// A shape's floating toolbar ([data-subbar]) opens its menus and pickers (template, more, colours,
// widths, line styles…) above or below itself. Near the top of the page one opening upwards went
// out of sight (and near the bottom, downwards). This flips such a popup to the side where it fits
// — below the toolbar when there's no room above, above when there's none below — and keeps it
// inside the window sideways. It watches for popups as they open, so every toolbar gets it.

const MARGIN = 6;

function popupsOf(bar: Element): HTMLElement[] {
  const out: HTMLElement[] = [];
  bar.querySelectorAll<HTMLElement>("*").forEach(el => {
    if (el.dataset.subbarPlaced === "1") return;
    const cs = getComputedStyle(el);
    if (cs.position !== "absolute") return;
    // menus and pickers, not the colour bars / badges drawn inside buttons
    if (el.offsetHeight < 40 || el.offsetWidth < 60) return;
    out.push(el);
  });
  return out;
}

function place(el: HTMLElement) {
  el.dataset.subbarPlaced = "1";
  const r = el.getBoundingClientRect();
  const anchor = el.offsetParent as HTMLElement | null;
  const a = anchor ? anchor.getBoundingClientRect() : r;
  const H = window.innerHeight, W = window.innerWidth;
  const roomBelow = H - a.bottom - MARGIN, roomAbove = a.top - MARGIN;
  if (r.top < MARGIN && roomBelow >= Math.min(r.height, roomAbove + 1)) {
    // was opening upwards off the top: open downwards
    Object.assign(el.style, { top: "100%", bottom: "auto", marginTop: "4px", marginBottom: "0" });
  } else if (r.bottom > H - MARGIN && roomAbove > roomBelow) {
    // was opening downwards off the bottom: open upwards
    Object.assign(el.style, { bottom: "100%", top: "auto", marginBottom: "4px", marginTop: "0" });
  }
  const r2 = el.getBoundingClientRect();
  if (r2.right > W - MARGIN) el.style.transform = `translateX(${W - MARGIN - r2.right}px)`;
  else if (r2.left < MARGIN) el.style.transform = `translateX(${MARGIN - r2.left}px)`;
}

let installed = false;
export function installSubbarPopupPlacement() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  let queued = false;
  const check = () => {
    queued = false;
    document.querySelectorAll("[data-subbar]").forEach(bar => popupsOf(bar).forEach(place));
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(check);
  }).observe(document.body, { childList: true, subtree: true });
}

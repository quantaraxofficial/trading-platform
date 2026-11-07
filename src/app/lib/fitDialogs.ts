// Shape settings dialogs ([data-tv-settings-dialog]) are drawn at a fixed size; on a small
// window (e.g. 1326 x 560) they ran off the bottom, Ok / Cancel out of reach. This scales each one
// down to fit the window (never up) with CSS zoom, and moves it back inside if it sticks out,
// with a margin. It follows the dialog as it's opened, dragged, switches tabs (its height changes)
// and as the window is resized.
//
// zoom scales the dialog's own left / top too: its position is worked out from where it shows
// and the zoom it has, so nothing is written unless the result changes (no feedback loop).

const ATTR = "data-tv-settings-dialog";
const M = 8;

function fit(el: HTMLElement) {
  const W = window.innerWidth, H = window.innerHeight;
  const curK = parseFloat(el.style.zoom) || 1;
  const curML = parseFloat(el.style.marginLeft) || 0, curMT = parseFloat(el.style.marginTop) || 0;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  // (left / top count from the window for a fixed dialog, from its container for an absolute one)
  const parent = getComputedStyle(el).position === "fixed" ? null : el.offsetParent as HTMLElement | null;
  const o = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
  // its natural size, and where its own left / top put it (without our margin), at zoom 1
  const w = r.width / curK, h = r.height / curK;
  const L = (r.left - o.left - curML * curK) / curK, T = (r.top - o.top - curMT * curK) / curK;
  const k = Math.min(1, (W - 2 * M) / w, (H - 2 * M) / h);
  const left = o.left + L * k, top = o.top + T * k, right = left + w * k, bottom = top + h * k;
  let dx = 0, dy = 0;
  if (left < M) dx = M - left; else if (right > W - M) dx = W - M - right;
  if (top < M) dy = M - top; else if (bottom > H - M) dy = H - M - bottom;
  const zoom = k < 0.999 ? String(Math.round(k * 1000) / 1000) : "";
  const ml = Math.abs(dx) > 0.5 ? `${Math.round((dx / k) * 10) / 10}px` : "";
  const mt = Math.abs(dy) > 0.5 ? `${Math.round((dy / k) * 10) / 10}px` : "";
  // (over the header and the bottom bar: once it fills the window they'd cover its title and its
  // Ok / Cancel row; popups opened from it are inside it, so they stay above it)
  if ((parseInt(getComputedStyle(el).zIndex, 10) || 0) < 6000) el.style.zIndex = "6000";
  if (el.style.zoom !== zoom) el.style.zoom = zoom;
  if (el.style.marginLeft !== ml) el.style.marginLeft = ml;
  if (el.style.marginTop !== mt) el.style.marginTop = mt;
}

export function installDialogFit(): () => void {
  if (typeof window === "undefined") return () => {};
  const watched = new Set<HTMLElement>();
  const ro = new ResizeObserver(entries => entries.forEach(e => fit(e.target as HTMLElement)));
  // (a dialog's position changes as it's dragged: its style attribute)
  const styleObs = new MutationObserver(records => {
    const seen = new Set<HTMLElement>();
    for (const r of records) seen.add(r.target as HTMLElement);
    seen.forEach(el => fit(el));
  });
  const scan = () => {
    document.querySelectorAll<HTMLElement>(`[${ATTR}]`).forEach(el => {
      if (watched.has(el)) return;
      watched.add(el);
      ro.observe(el);
      styleObs.observe(el, { attributes: true, attributeFilter: ["style"] });
      fit(el);
    });
    watched.forEach(el => { if (!el.isConnected) { watched.delete(el); ro.unobserve(el); } });
  };
  const added = new MutationObserver(scan);
  added.observe(document.body, { childList: true, subtree: true });
  const onResize = () => watched.forEach(fit);
  window.addEventListener("resize", onResize);
  scan();
  return () => {
    added.disconnect(); styleObs.disconnect(); ro.disconnect();
    window.removeEventListener("resize", onResize);
    watched.clear();
  };
}

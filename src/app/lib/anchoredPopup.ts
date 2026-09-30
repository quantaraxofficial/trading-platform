import { useEffect, type RefObject } from "react";

// Toolbar popups are placed with `position: fixed` next to their trigger instead of being
// absolutely positioned inside it, because on narrow screens the toolbars scroll (the header
// sideways, the drawing toolbar up/down) and a scrolling container would clip them.
// Use from the popup's ref callback: ref={el => placeBelow(el, triggerRef.current)}.
export function placeBelow(popup: HTMLElement | null, anchor: HTMLElement | null, align: "start" | "end" = "start", gap = 4) {
  if (!popup || !anchor) return;
  const a = anchor.getBoundingClientRect();
  const margin = 8;
  const w = popup.offsetWidth;
  let left = align === "end" ? a.right - w : a.left;
  left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
  Object.assign(popup.style, {
    position: "fixed", top: `${a.bottom + gap}px`, left: `${left}px`, right: "auto", bottom: "auto", marginTop: "0",
    maxHeight: `${Math.max(120, window.innerHeight - a.bottom - gap - margin)}px`,
  });
}

// Beside the trigger (for the vertical drawing toolbar), moved up if it would run off the
// bottom of the window (but not above minTop, e.g. the header's bottom edge), and scrolling
// only if it is taller than the space it has.
export function placeBeside(popup: HTMLElement | null, anchor: HTMLElement | null, gap = 2, minTop = 8) {
  if (!popup || !anchor) return;
  const a = anchor.getBoundingClientRect();
  const margin = 8;
  const available = window.innerHeight - margin - minTop;
  Object.assign(popup.style, { position: "fixed", left: `${a.right + gap}px`, right: "auto", marginLeft: "0", maxHeight: "", overflowY: "" });
  const h = popup.offsetHeight;
  let top = a.top;
  if (top + h > window.innerHeight - margin) top = Math.max(minTop, window.innerHeight - margin - h);
  popup.style.top = `${top}px`;
  if (h > available) {
    popup.style.maxHeight = `${available}px`;
    popup.style.overflowY = "auto";
  }
}

// A fixed popup would stay put while its toolbar scrolls away underneath it, so it closes
// when any scrolling ancestor of its trigger scrolls, or the window is resized.
export function useCloseOnAnchorScroll(anchorRef: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      const anchor = anchorRef.current;
      if (anchor && e.target instanceof Node && e.target !== anchor && e.target.contains(anchor)) onClose();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchorRef, open, onClose]);
}

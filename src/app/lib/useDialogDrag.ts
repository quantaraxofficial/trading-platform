"use client";

// Lets a centred dialog be moved by its title bar, as TradingView's settings dialogs can: the
// offset from where it opened follows the pointer, and the title bar always stays reachable on
// screen. Each opening starts centred again.
//
//   const drag = useDialogDrag();
//   <div role="dialog" ref={drag.ref} style={{ ...drag.style }}>
//     <div {...drag.handle}>Title  <button>✕</button></div>   // buttons inside don't start a drag

import { useCallback, useEffect, useRef, useState } from "react";

export function useDialogDrag() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ px: number; py: number; ox: number; oy: number; rect: DOMRect } | null>(null);
  // When a drag last moved the dialog: the click a drag ends with (on a backdrop that closes the
  // dialog when clicked) is ignored
  const movedAt = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // Buttons, inputs and links in the title bar keep their own clicks
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a, [role='tab']")) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    start.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y, rect };
    setDragging(true);
  }, [offset.x, offset.y]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      let dx = e.clientX - s.px, dy = e.clientY - s.py;
      // Keep at least 80px of the dialog (its title bar) on screen
      const minVisible = 80;
      dx = Math.max(minVisible - s.rect.right, Math.min(window.innerWidth - minVisible - s.rect.left, dx));
      dy = Math.max(-s.rect.top, Math.min(window.innerHeight - 48 - s.rect.top, dy));
      movedAt.current = Date.now();
      setOffset({ x: s.ox + dx, y: s.oy + dy });
    };
    const onUp = () => { setDragging(false); start.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  return {
    ref,
    dragging,
    // For a backdrop's onClick: true right after a drag (that click isn't a click outside)
    justDragged: () => Date.now() - movedAt.current < 400,
    // On the dialog box itself
    style: { transform: offset.x || offset.y ? `translate(${offset.x}px, ${offset.y}px)` : undefined } as React.CSSProperties,
    // On its title bar
    handle: {
      onPointerDown,
      style: { cursor: dragging ? "grabbing" : "grab", userSelect: "none", touchAction: "none" } as React.CSSProperties,
    },
  };
}

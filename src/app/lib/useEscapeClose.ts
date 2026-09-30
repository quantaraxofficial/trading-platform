import { useEffect, useRef } from "react";

// Shared Esc-to-close for every dialog/popup. Each mounted dialog pushes itself onto
// a stack, and a single capture-phase window listener hands Esc to the TOP entry only,
// so with a sub-popup open inside a modal (e.g. a color palette in a settings dialog)
// Esc closes just that popup first and the parent on the next press. Capture phase +
// stopPropagation keeps the same keypress from also reaching global shortcuts
// (deselect drawing / cancel tool) or an input's own handler after the dialog closed.
interface Entry { close: { current: () => void } }
const stack: Entry[] = [];
let listening = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  top.close.current();
}

export function useEscapeClose(onClose: () => void, enabled: boolean = true) {
  // Latest callback without re-registering (which would reorder the stack) on every render
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const entry: Entry = { close: closeRef };
    stack.push(entry);
    if (!listening) {
      window.addEventListener("keydown", onKeyDown, true);
      listening = true;
    }
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0 && listening) {
        window.removeEventListener("keydown", onKeyDown, true);
        listening = false;
      }
    };
  }, [enabled]);
}

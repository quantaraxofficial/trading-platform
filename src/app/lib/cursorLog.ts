// DEBUG (opt-in): finds what switches the chart's cursor between the cross and the pointing
// hand. Switched on with localStorage "tv:cursorLog" = "1"; logs to the console ("[CursorLog]"):
//   - every change of an element's `cursor` inside the chart, with the code that set it (a stack)
//   - every change of the cursor actually under the mouse (checked 5x a second), with the element
//     there: an overlay sliding under a still mouse changes it without any style change
//   - whether a live tick arrived just before (tv:live-price)

let installed = false;

// Off unless asked for: localStorage "tv:cursorLog" = "1" (then reload)
export function cursorLogWanted(): boolean {
  try { return typeof window !== "undefined" && localStorage.getItem("tv:cursorLog") === "1"; } catch { return false; }
}

export function installCursorLog(root: HTMLElement): () => void {
  if (installed || typeof window === "undefined" || !cursorLogWanted()) return () => {};
  installed = true;

  // 1) Who sets `cursor`. Chrome has no JS accessor for style properties to hook, so the chart's
  // elements hand out a wrapped `style` that notes every cursor assignment (with its stack);
  // setProperty / removeProperty (lightweight-charts' way) are caught on the prototype
  let lastSet: { value: string; stack: string; at: number } | null = null;
  const where = () => (new Error().stack || "").split(String.fromCharCode(10)).slice(3, 9).map(s => s.trim()).join(" | ");
  const note = (value: string) => { lastSet = { value, stack: where(), at: performance.now() }; };
  const styleDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style")!;
  const wrapped = new WeakMap<CSSStyleDeclaration, CSSStyleDeclaration>();
  Object.defineProperty(HTMLElement.prototype, "style", {
    ...styleDesc,
    get(this: HTMLElement) {
      const real = styleDesc.get!.call(this) as CSSStyleDeclaration;
      if (!document.documentElement.contains(this)) return real;   // anywhere on the page
      let w = wrapped.get(real);
      if (!w) {
        w = new Proxy(real, {
          get(t, k) { const v = Reflect.get(t, k, t); return typeof v === "function" ? v.bind(t) : v; },
          set(t, k, v) { if (k === "cursor") note(String(v)); return Reflect.set(t, k, v, t); },
        });
        wrapped.set(real, w);
      }
      return w;
    },
  });
  const declProto = CSSStyleDeclaration.prototype;
  const origSetProperty = declProto.setProperty;
  const origRemoveProperty = declProto.removeProperty;
  declProto.setProperty = function (name: string, value: string | null, priority?: string) {
    if (name === "cursor") note(String(value));
    return origSetProperty.call(this, name, value, priority);
  };
  declProto.removeProperty = function (name: string) {
    if (name === "cursor") note("(removed)");
    return origRemoveProperty.call(this, name);
  };

  // A live tick just before a change points at the live data
  let lastTick = 0;
  const onTick = () => { lastTick = performance.now(); };
  window.addEventListener("tv:live-price", onTick);
  const tickNote = () => (performance.now() - lastTick < 300 ? ` (live tick ${Math.round(performance.now() - lastTick)} ms before)` : "");
  const describe = (el: Element | null) => {
    if (!el) return "nothing";
    const h = el as HTMLElement;
    const cls = typeof h.className === "string" ? h.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    return `${el.tagName.toLowerCase()}${h.id ? "#" + h.id : ""}${cls ? "." + cls : ""}${h.dataset?.name ? `[data-name=${h.dataset.name}]` : ""}`;
  };

  // 2) Cursor changes on the chart's own elements
  const prev = new WeakMap<Element, string>();
  const mo = new MutationObserver(list => {
    for (const m of list) {
      const el = m.target as HTMLElement;
      const now = el.style?.cursor || "";
      const before = prev.get(el) ?? (m.oldValue?.match(/cursor:\s*([^;]+)/)?.[1] || "");
      if (now === before) continue;
      prev.set(el, now);
      const by = lastSet && performance.now() - lastSet.at < 50 ? lastSet.stack : "(no setter seen: a class / stylesheet change)";
      console.log(`[CursorLog] style ${describe(el)}: "${before}" -> "${now}"${tickNote()}\n   set by: ${by}`);
    }
  });
  // the whole page: a cursor set on the body or an overlay outside the chart shows over it too
  mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["style"], attributeOldValue: true });

  // 3) The cursor actually under the (still) mouse
  let mx = -1, my = -1, under = "", underEl = "";
  const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
  window.addEventListener("mousemove", onMove, true);
  // every frame (a flicker shorter than a poll interval would slip through), while the mouse is
  // over the chart
  let raf = 0;
  const poll = () => {
    raf = requestAnimationFrame(poll);
    if (mx < 0) return;
    const r = root.getBoundingClientRect();
    if (mx < r.left || mx > r.right || my < r.top || my > r.bottom) { under = ""; return; }
    const el = document.elementFromPoint(mx, my);
    const c = el ? getComputedStyle(el).cursor : "";
    const d = describe(el);
    if (c !== under) {
      if (under) console.log(`[CursorLog] under the mouse (${mx}, ${my}): "${under}" on ${underEl} -> "${c}" on ${d}${tickNote()}`);
      under = c;
      underEl = d;
    }
  };
  raf = requestAnimationFrame(poll);
  console.log("[CursorLog] watching the chart's cursor (temporary debug logging)");

  return () => {
    installed = false;
    mo.disconnect();
    cancelAnimationFrame(raf);
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("tv:live-price", onTick);
    Object.defineProperty(HTMLElement.prototype, "style", styleDesc);
    declProto.setProperty = origSetProperty;
    declProto.removeProperty = origRemoveProperty;
  };
}

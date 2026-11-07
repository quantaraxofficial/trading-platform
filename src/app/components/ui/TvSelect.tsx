"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../../lib/useEscapeClose";

// A drop-in for <select> drawn like TradingView's own dropdowns instead of the browser's native
// list (which looked out of place in the dialogs): same props (value, onChange with e.target.value,
// <option> / <optgroup> children, className / style for the box), a chevron, and a menu with
// hover rows, the chosen row highlighted, group headings, the keyboard (↑ ↓ Enter Esc Home End)
// and an outside click closing it. The menu takes the box's own colours, so it fits light and dark
// dialogs and the analytics pages alike, and opens upwards when there's no room below.

type Opt = { value: string; label: React.ReactNode; text: string; disabled?: boolean; group?: string };

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
  value?: string | number | readonly string[];
  onChange?: (e: { target: { value: string }; currentTarget: { value: string } }) => void;
  children?: React.ReactNode;
};

const textOf = (n: React.ReactNode): string =>
  typeof n === "string" || typeof n === "number" ? String(n)
    : Array.isArray(n) ? n.map(textOf).join("")
    : React.isValidElement(n) ? textOf((n.props as any).children) : "";

function optionsOf(children: React.ReactNode, group?: string): Opt[] {
  const out: Opt[] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    const p: any = child.props;
    if (child.type === "option") {
      const label = p.children;
      out.push({ value: String(p.value ?? textOf(label)), label, text: textOf(label), disabled: !!p.disabled, group });
    } else if (child.type === "optgroup") {
      out.push(...optionsOf(p.children, String(p.label ?? "")));
    } else if (child.type === React.Fragment) {
      out.push(...optionsOf(p.children, group));
    }
  });
  return out;
}

// The colours the box shows (a transparent box takes them from what's behind it)
// (a see-through one too, e.g. bg-gray-900/50 on the analytics pages: the first solid colour behind
// it, else its own colour made solid, so the menu isn't washed out over the page)
function coloursOf(el: HTMLElement) {
  const color = getComputedStyle(el).color;
  let firstTint = "";
  for (let e: HTMLElement | null = el; e; e = e.parentElement) {
    const b = getComputedStyle(e).backgroundColor;
    const m = /rgba?\(([^)]+)\)/.exec(b || "");
    if (!m) continue;
    const parts = m[1].split(",").map(x => parseFloat(x));
    const a = parts.length > 3 ? parts[3] : 1;
    if (a >= 0.95) return { color, bg: b };
    if (a > 0 && !firstTint) firstTint = `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
  }
  return { color, bg: firstTint || "#ffffff" };
}

export default function TvSelect({ value, onChange, children, className, style, disabled, ...rest }: Props) {
  const opts = optionsOf(children);
  const current = opts.find(o => o.value === String(value ?? "")) ?? opts[0];
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; maxHeight: number; up: boolean; color: string; bg: string; font: string } | null>(null);

  const close = useCallback(() => { setOpen(false); setPlace(null); }, []);
  // Esc closes this list first (the shared Esc stack), the dialog it's in on the next press
  useEscapeClose(() => { close(); btnRef.current?.focus(); }, open);
  const choose = (o: Opt | undefined) => {
    if (!o || o.disabled) return;
    close();
    btnRef.current?.focus();
    if (o.value !== String(value ?? "")) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } });
  };
  const openMenu = () => {
    if (disabled || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const cs = getComputedStyle(btnRef.current);
    const { color, bg } = coloursOf(btnRef.current);
    const below = window.innerHeight - r.bottom - 8, above = r.top - 8;
    const want = Math.min(320, opts.length * 34 + 12 + new Set(opts.map(o => o.group).filter(Boolean)).size * 28);
    const up = below < Math.min(want, 160) && above > below;
    setPlace({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: r.width, maxHeight: Math.max(120, Math.min(320, up ? above : below)), up, color, bg, font: cs.fontFamily });
    setActive(Math.max(0, opts.indexOf(current)));
    setOpen(true);
  };

  // Kept inside the window sideways once it's measured
  useLayoutEffect(() => {
    const m = menuRef.current;
    if (!open || !m || !place) return;
    const r = m.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) m.style.left = `${Math.max(8, window.innerWidth - 8 - r.width)}px`;
    m.querySelector<HTMLElement>("[data-active='1']")?.scrollIntoView({ block: "nearest" });
  }, [open, place, active]);

  // Outside press, scrolling what holds it or resizing the window close it; the arrows, Home,
  // End and Enter pick
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      const enabled = opts.map((o, i) => (o.disabled ? -1 : i)).filter(i => i >= 0);
      const step = (d: number) => {
        const at = enabled.indexOf(active);
        const next = enabled[Math.max(0, Math.min(enabled.length - 1, (at < 0 ? 0 : at + d)))];
        if (next !== undefined) setActive(next);
      };
      if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
      else if (e.key === "Home") { e.preventDefault(); setActive(enabled[0] ?? -1); }
      else if (e.key === "End") { e.preventDefault(); setActive(enabled[enabled.length - 1] ?? -1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopImmediatePropagation(); choose(opts[active]); }
      else if (e.key === "Tab") close();
    };
    const onScroll = (e: Event) => { const t = e.target as Node; if (t instanceof Node && !menuRef.current?.contains(t) && t.contains(btnRef.current)) close(); };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  });

  let lastGroup: string | undefined;
  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={className}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        {...(rest as any)}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={e => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); openMenu(); }
        }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, textAlign: "left",
          cursor: disabled ? "default" : "pointer", font: "inherit", minWidth: 0, ...style,
          ...(open ? { borderColor: "#2962ff" } : {}),
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{current?.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden
          style={{ flexShrink: 0, opacity: 0.7, transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && place && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{
            position: "fixed", left: place.left, top: place.up ? undefined : place.top, bottom: place.up ? window.innerHeight - place.top : undefined,
            minWidth: place.width, maxWidth: Math.max(place.width, 360), maxHeight: place.maxHeight, overflowY: "auto",
            background: place.bg, color: place.color, fontFamily: place.font, fontSize: 13,
            borderRadius: 6, padding: "4px 0", zIndex: 200000,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18), 0 0 0 1px rgba(128,128,128,0.25)",
          }}
        >
          {opts.map((o, i) => {
            const heading = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            const sel = o === current;
            const act = i === active;
            return (
              <React.Fragment key={`${o.group ?? ""}:${o.value}:${i}`}>
                {heading && <div style={{ padding: "8px 12px 4px", fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.55 }}>{heading}</div>}
                <div
                  role="option"
                  aria-selected={sel}
                  data-active={act ? "1" : undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => choose(o)}
                  style={{
                    display: "flex", alignItems: "center", minHeight: 32, padding: "0 12px", whiteSpace: "nowrap",
                    cursor: o.disabled ? "default" : "pointer", opacity: o.disabled ? 0.4 : 1,
                    // the chosen row inverted, as TradingView marks it; the row under the pointer shaded
                    background: sel ? place.color : act ? "rgba(128,128,128,0.16)" : "transparent",
                    color: sel ? place.bg : undefined,
                  }}
                >
                  {o.label}
                </div>
              </React.Fragment>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

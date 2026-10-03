"use client";

// Small building blocks shared by the order ticket, dialogs and account manager, drawn after
// TradingView's trading UI.

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../lib/useEscapeClose";

export const C = {
  panel: "var(--tv-trade-panel-bg)",
  text: "var(--tv-color-text)",
  muted: "var(--tv-trade-muted)",
  faint: "var(--tv-trade-faint)",
  border: "var(--tv-color-border)",
  field: "var(--tv-trade-field-border)",
  subtle: "var(--tv-trade-subtle-bg)",
  seg: "var(--tv-trade-seg-bg)",
  hover: "var(--tv-color-item-hover)",
  buy: "var(--tv-trade-buy)",
  sell: "var(--tv-trade-sell)",
  tp: "var(--tv-trade-tp)",
  sl: "var(--tv-trade-sl)",
  accent: "var(--tv-color-accent)",
  shadow: "var(--tv-trade-shadow)",
};

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 38, height: 22, borderRadius: 11, border: "none", padding: 0, cursor: disabled ? "default" : "pointer",
        background: on ? "var(--tv-trade-toggle-on)" : "var(--tv-trade-toggle-off)", position: "relative", flexShrink: 0,
        transition: "background 0.15s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: "50%",
        background: "var(--tv-trade-panel-bg)", transition: "left 0.15s",
      }} />
    </button>
  );
}

// Dark tooltip shown above (or below) its child on hover, like TradingView's
// Nudges a centred tooltip back inside the window (e.g. under the header's first button),
// keeping its arrow on the anchor.
function keepInViewport(el: HTMLDivElement | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const shift = r.left < 8 ? 8 - r.left : r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : 0;
  if (!shift) return;
  el.style.marginLeft = `${shift}px`;
  const arrow = el.querySelector<HTMLElement>("[data-tip-arrow]");
  if (arrow) arrow.style.marginLeft = `${-5 - shift}px`;
}

export function Tip({ text, children, placement = "top", delay = 300, block, maxWidth }: {
  text: React.ReactNode; children: React.ReactElement; placement?: "top" | "bottom" | "right"; delay?: number; block?: boolean; maxWidth?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos(placement === "right" ? { x: r.right, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: placement === "top" ? r.top : r.bottom });
    }, delay);
  };
  const hide = () => { clearTimeout(timer.current); setPos(null); };
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!text) return children;
  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} style={{ display: block ? "block" : "inline-flex", minWidth: 0 }}>
      {children}
      {pos && typeof document !== "undefined" && createPortal(
        <div ref={keepInViewport} style={{
          position: "fixed", left: placement === "right" ? pos.x + 13 : pos.x, top: placement === "top" ? pos.y - 8 : placement === "right" ? pos.y : pos.y + 8,
          transform: placement === "top" ? "translate(-50%, -100%)" : placement === "right" ? "translate(0, -50%)" : "translate(-50%, 0)",
          whiteSpace: "normal", width: "max-content",
          background: "var(--tv-trade-tooltip-bg)", color: "#fff", fontSize: 13, lineHeight: "18px", padding: "6px 10px",
          borderRadius: 6, zIndex: 20000, pointerEvents: "none", maxWidth: maxWidth ?? (placement === "right" ? 360 : 320), textAlign: "left",
        }}>
          {text}
          {placement === "right" ? (
            <span style={{ position: "absolute", right: "100%", top: "50%", marginTop: -5, width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderRight: "5px solid var(--tv-trade-tooltip-bg)" }} />
          ) : (
            <span data-tip-arrow style={{
              position: "absolute", left: "50%", marginLeft: -5, width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
              ...(placement === "top" ? { top: "100%", borderTop: "5px solid var(--tv-trade-tooltip-bg)" } : { bottom: "100%", borderBottom: "5px solid var(--tv-trade-tooltip-bg)" }),
            }} />
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}

// Popover menu anchored under an element, portaled so it isn't clipped; closes on outside click / Esc
export function Popover({ anchor, open, onClose, children, align = "left", width, offset = 4 }: {
  anchor: HTMLElement | null; open: boolean; onClose: () => void; children: React.ReactNode; align?: "left" | "right"; width?: number; offset?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor) { setPos(null); return; }
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const el = ref.current;
      const w = el?.offsetWidth || width || 200;
      const h = el?.offsetHeight || 0;
      let left = align === "right" ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      let top = r.bottom + offset;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - offset - h);
      setPos({ left, top });
    };
    place();
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open, anchor, align, width, offset]);
  useEscapeClose(onClose, open);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => { document.removeEventListener("mousedown", onDown, true); };
  }, [open, anchor, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} style={{
      position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, width, zIndex: 15000,
      background: C.panel, color: C.text, borderRadius: 8, boxShadow: C.shadow, padding: "6px 0",
      border: "1px solid var(--tv-color-border)",
    }}>
      {children}
    </div>,
    document.body,
  );
}

// A key cap inside a dark tooltip ("Buy Market  [Shift] [B]")
export const TipKey = ({ children }: { children: React.ReactNode }) => (
  <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 6px", borderRadius: 4, background: "rgba(255,255,255,0.16)", fontSize: 12 }}>{children}</span>
);

export function MenuItem({ children, onClick, selected, icon, right, danger }: {
  children: React.ReactNode; onClick?: () => void; selected?: boolean; icon?: React.ReactNode; right?: React.ReactNode; danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10, margin: "0 6px", padding: "0 10px", minHeight: 34, borderRadius: 6, cursor: "pointer",
        fontSize: 14, whiteSpace: "nowrap",
        background: selected ? "var(--tv-trade-toggle-on)" : hover ? C.hover : "transparent",
        color: selected ? "var(--tv-trade-panel-bg)" : danger ? C.sell : C.text,
      }}
    >
      {icon && <span style={{ display: "flex", color: selected ? "inherit" : danger ? C.sell : C.text }}>{icon}</span>}
      <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>{children}</span>
      {right}
    </div>
  );
}

export const MenuDivider = () => <div style={{ height: 1, background: C.border, margin: "6px 0" }} />;

// The app's own mark (as on the sign-in page): a trend arrow in a purple-to-indigo square
export function BrandLogo({ size = 24 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size / 4, background: "linear-gradient(90deg, #9333ea, #4f46e5)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <BrandMark size={size * 0.62} color="#ffffff" />
    </span>
  );
}

// The trend arrow on its own
export function BrandMark({ size = 17, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

// Round avatar with the symbol's initials, colored per symbol (the watchlist's style)
const AVATAR_COLORS = ["#f7931a", "#2962ff", "#089981", "#e91e63", "#9c27b0", "#ff9800", "#00bcd4", "#f23645"];
export function SymbolAvatar({ symbol, size = 20 }: { symbol: string; size?: number }) {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  const letters = symbol.replace(/[^A-Z]/gi, "").slice(0, symbol.includes("/") ? 1 : 2).toUpperCase();
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%", background: AVATAR_COLORS[h % AVATAR_COLORS.length], color: "#fff",
      fontSize: size * 0.42, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>{letters}</span>
  );
}

// ---------- icons (TradingView glyphs, 18–28px grids) ----------

export const SwapIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <path d="M3.5 7.5h11l-3-3M14.5 10.5h-11l3 3" />
  </svg>
);
export const ChevronDown = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M4 6l4 4 4-4" /></svg>
);
export const ChevronUp = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M4 10l4-4 4 4" /></svg>
);
export const ChevronLeft = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M11 3.5L5.5 9l5.5 5.5" /></svg>
);
export const CloseIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M3.5 3.5l11 11M14.5 3.5l-11 11" /></svg>
);
export const InfoIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <circle cx="8" cy="8" r="7.5" fill="currentColor" />
    <rect x="7.25" y="6.8" width="1.5" height="5.2" rx="0.4" fill="var(--tv-trade-panel-bg)" />
    <circle cx="8" cy="4.6" r="0.95" fill="var(--tv-trade-panel-bg)" />
  </svg>
);
export const HelpIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <circle cx="8" cy="8" r="7.5" fill="currentColor" />
    <path d="M6 6.2a2 2 0 1 1 2.8 1.8c-.5.25-.8.6-.8 1.1v.4" fill="none" stroke="var(--tv-trade-panel-bg)" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="11.8" r="0.9" fill="var(--tv-trade-panel-bg)" />
  </svg>
);
export const MoreIcon = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
    <circle cx="8.5" cy="14" r="1.8" /><circle cx="14" cy="14" r="1.8" /><circle cx="19.5" cy="14" r="1.8" />
  </svg>
);
export const PresetsIcon = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
    <rect x="6.5" y="6.5" width="6" height="6" rx="1.5" /><rect x="15.5" y="6.5" width="6" height="6" rx="1.5" />
    <rect x="6.5" y="15.5" width="6" height="6" rx="1.5" /><path d="M18.5 15v7M15 18.5h7" />
  </svg>
);
export const PinIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden>
    <path d="M13.5 3.5l5 5-2.5 1-3 3 .5 3.5-1.5 1.5-8-8L5.5 7.5 9 8l3-3 1.5-1.5zM7.5 14.5l-4 4" />
  </svg>
);
export const HexSettingsIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden>
    <path d="M7 3.5h8l4 7.5-4 7.5H7L3 11l4-7.5z" /><circle cx="11" cy="11" r="2.6" />
  </svg>
);
export const CloudUpIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden>
    <path d="M7 16.5H6a3.5 3.5 0 0 1-.4-7 5 5 0 0 1 9.6-1.3A3.8 3.8 0 0 1 16 16.5h-1M11 18.5v-7M8.5 14l2.5-2.5 2.5 2.5" />
  </svg>
);
export const TrashIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden>
    <path d="M3 5h12M7 5V3.5h4V5M4.5 5l.8 10h7.4l.8-10M7.5 7.5v5M10.5 7.5v5" />
  </svg>
);
export const PencilIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden>
    <path d="M11.5 3.5l3 3L6.5 14.5H3.5v-3l8-8zM10 5l3 3" />
  </svg>
);
export const DownloadIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <path d="M11 3.5v10M7 9.5l4 4 4-4M4 14v3.5h14V14" />
  </svg>
);
export const ColumnsIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <rect x="4.5" y="5.5" width="3.2" height="11" rx="0.8" /><rect x="9.4" y="5.5" width="3.2" height="11" rx="0.8" /><rect x="14.3" y="5.5" width="3.2" height="11" rx="0.8" />
  </svg>
);
export const PlusIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M9 3.5v11M3.5 9h11" /></svg>
);
export const CheckIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M2.5 7.5l3 3 6-6.5" /></svg>
);
export const MinimizeIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M5 15.5h12" /></svg>
);
export const MaximizeIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M12.5 4.5h5v5M9.5 17.5h-5v-5" /></svg>
);
export const RestoreIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M17.5 9.5h-5v-5M4.5 12.5h5v5" /></svg>
);

// "Nothing here yet" illustration: a UFO beaming something up (a pencil, or a cow on Analytics)
export function UfoIllustration({ size = 110, cargo = "pencil" }: { size?: number; cargo?: "pencil" | "cow" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <ellipse cx="55" cy="22" rx="20" ry="7" />
      <path d="M44 18a11 9 0 0 1 22 0" />
      <circle cx="46" cy="22" r="1.2" fill="currentColor" /><circle cx="55" cy="23.5" r="1.2" fill="currentColor" /><circle cx="64" cy="22" r="1.2" fill="currentColor" />
      <path d="M45 29L22 96M65 29l23 67" />
      {cargo === "pencil" ? (
        <path d="M47 72l14-16 6 5-14 16-8 3 2-8zM57 60l6 5" />
      ) : (
        <path d="M40 68h24l6-6 3 3-5 5v12h-5v-8H48v8h-5V74l-5-2 2-4zM62 62l2-4M68 60l3-3" />
      )}
    </svg>
  );
}

"use client";

// TradingView's chart menus (the chart's right-click menu, the price scale's gear menu): 32px
// rows with a 28px icon / check column, 14px labels, 12px grey shortcuts on the right, thin
// dividers inset past the icon column, submenus that open beside their row, a 6px-rounded box
// with a soft shadow. Opens at a point (right-click) or above an anchor (the gear); stays in the
// window; closes on Esc and on a click outside.

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../../lib/useEscapeClose";
import { MenuCheckIcon, MenuChevronIcon } from "./tvMenuIcons";

export type TvMenuItem =
  | {
      kind?: "item"; label: React.ReactNode; icon?: React.ReactNode; checked?: boolean; shortcut?: React.ReactNode;
      disabled?: boolean; onClick?: () => void; submenu?: TvMenuItem[]; testId?: string; keepOpen?: boolean;
    }
  | { kind: "divider" };

export type TvMenuPosition =
  | { x: number; y: number }                                   // top-left at a point (right-click)
  | { above: { right: number; top: number } };                 // right-aligned, just above (gear)

export function tvMenuPalette(isDark: boolean) {
  return isDark
    ? { bg: "#1e222d", text: "#d1d4dc", muted: "#787b86", divider: "#434651", hover: "#2a2e39", shadow: "0 2px 4px rgba(0,0,0,0.5)" }
    : { bg: "#ffffff", text: "#0f0f0f", muted: "#9c9c9c", divider: "#ebebeb", hover: "#f2f2f2", shadow: "0 2px 4px rgba(0,0,0,0.2)" };
}

const MARGIN = 4;

export default function TvMenu({ items, position, isDark, onClose, ariaLabel, testId }: {
  items: TvMenuItem[]; position: TvMenuPosition; isDark: boolean; onClose: () => void; ariaLabel?: string; testId?: string;
}) {
  const p = tvMenuPalette(isDark);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [sub, setSub] = useState<{ index: number; row: DOMRect } | null>(null);
  useEscapeClose(onClose);

  // Place once measured: inside the window, flipping / shifting as TradingView's do
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left: number, top: number;
    if ("above" in position) {
      left = position.above.right - w;
      top = position.above.top - 3 - h;
    } else {
      left = position.x;
      top = position.y;
    }
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - w - MARGIN));
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - h - MARGIN));
    setPos({ left, top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const down = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.("[data-tv-menu]")) onClose(); };
    document.addEventListener("mousedown", down, true);
    window.addEventListener("resize", onClose);
    return () => { document.removeEventListener("mousedown", down, true); window.removeEventListener("resize", onClose); };
  }, [onClose]);

  const subItem = sub ? items[sub.index] : null;
  return createPortal(
    <>
      <MenuBox p={p} refEl={boxRef} items={items} left={pos?.left ?? -9999} top={pos?.top ?? -9999} onClose={onClose}
        activeSub={sub?.index ?? null} onSub={(i, r) => setSub(r ? { index: i, row: r } : null)} ariaLabel={ariaLabel} testId={testId} />
      {subItem && subItem.kind !== "divider" && subItem.submenu && boxRef.current && (
        <SubMenu p={p} items={subItem.submenu} parent={boxRef.current.getBoundingClientRect()} row={sub!.row} onClose={onClose} />
      )}
    </>,
    document.body,
  );
}

function SubMenu({ p, items, parent, row, onClose }: { p: ReturnType<typeof tvMenuPalette>; items: TvMenuItem[]; parent: DOMRect; row: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = parent.right;
    if (left + w > window.innerWidth - MARGIN) left = parent.left - w;
    const top = Math.max(MARGIN, Math.min(row.top - 6, window.innerHeight - h));
    setPos({ left: Math.max(MARGIN, left), top });
  }, [parent, row]);
  return <MenuBox p={p} refEl={ref} items={items} left={pos?.left ?? -9999} top={pos?.top ?? -9999} onClose={onClose} activeSub={null} onSub={() => {}} />;
}

function MenuBox({ p, refEl, items, left, top, onClose, activeSub, onSub, ariaLabel, testId }: {
  p: ReturnType<typeof tvMenuPalette>; refEl: React.RefObject<HTMLDivElement | null>; items: TvMenuItem[]; left: number; top: number; onClose: () => void;
  activeSub: number | null; onSub: (index: number, row: DOMRect | null) => void; ariaLabel?: string; testId?: string;
}) {
  return (
    <div ref={refEl} data-tv-menu role="menu" aria-label={ariaLabel} data-testid={testId} onContextMenu={e => e.preventDefault()}
      style={{
        position: "fixed", left, top, zIndex: 10000, minWidth: 180, padding: "6px 0", background: p.bg, color: p.text,
        borderRadius: 6, boxShadow: p.shadow, fontSize: 14, lineHeight: "16px", userSelect: "none",
      }}>
      {items.map((it, i) => it.kind === "divider"
        ? <div key={i} role="separator" style={{ height: 1, background: p.divider, margin: "6px 0 6px 36px" }} />
        : <Row key={i} p={p} item={it} open={activeSub === i} onClose={onClose} onSub={r => onSub(i, it.submenu ? r : null)} />)}
    </div>
  );
}

function Row({ p, item, open, onClose, onSub }: {
  p: ReturnType<typeof tvMenuPalette>; item: Exclude<TvMenuItem, { kind: "divider" }>; open: boolean; onClose: () => void; onSub: (row: DOMRect) => void;
}) {
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dis = !!item.disabled;
  useEffect(() => () => clearTimeout(timer.current), []);
  const role = item.checked !== undefined ? "menuitemcheckbox" : "menuitem";
  return (
    <div role={role} aria-checked={item.checked} aria-disabled={dis || undefined} aria-haspopup={item.submenu ? "menu" : undefined} data-testid={item.testId}
      onMouseEnter={e => {
        setHover(true);
        const r = e.currentTarget.getBoundingClientRect();
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onSub(r), item.submenu ? 150 : 0);
      }}
      onMouseLeave={() => { setHover(false); clearTimeout(timer.current); }}
      onClick={e => {
        if (dis) return;
        if (item.submenu) { onSub(e.currentTarget.getBoundingClientRect()); return; }
        if (!item.keepOpen) onClose();
        item.onClick?.();
      }}
      style={{
        display: "flex", alignItems: "center", height: 32, padding: item.submenu ? "0 20px 0 8px" : "0 16px 0 8px",
        cursor: dis ? "default" : "pointer", whiteSpace: "nowrap",
        background: (hover || open) && !dis ? p.hover : "transparent", color: dis ? p.muted : p.text,
      }}>
      <span style={{ width: 28, height: 28, marginRight: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {item.icon ?? (item.checked ? <MenuCheckIcon /> : null)}
      </span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.shortcut !== undefined && item.shortcut !== null && <span style={{ marginLeft: 24, fontSize: 12, color: p.muted }}>{item.shortcut}</span>}
      {item.submenu && <span style={{ marginLeft: 24, display: "flex", color: p.text }}><MenuChevronIcon size={6} /></span>}
    </div>
  );
}

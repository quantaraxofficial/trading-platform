"use client";

// The bottom trading panel, shown (as on TradingView) only while a broker is connected. Its
// tab row holds "Paper Trading" (open the account manager), a context menu (Trading
// settings…, Connect another broker…, Log out) and the panel's Open/Collapse and
// Maximize/Restore buttons; opened, the account manager fills the rest.

import React, { useRef, useState } from "react";
import AccountManager from "./AccountManager";
import { BrokerMenu } from "./TradeButton";
import { Tip, MinimizeIcon, MaximizeIcon, RestoreIcon, BrandMark } from "./ui";

export const PANEL_ROW_HEIGHT = 38;

export default function TradingPanel({ open, maximized, onToggleOpen, onToggleMaximize }: {
  open: boolean; maximized: boolean; onToggleOpen: () => void; onToggleMaximize: () => void;
}) {
  const chevronRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoverTab, setHoverTab] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--tv-color-bg)", color: "var(--tv-hdr-text)" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        height: PANEL_ROW_HEIGHT, paddingRight: 2, background: open ? "var(--tv-panel-strip)" : "var(--tv-color-bg)",
      }}>
        {/* The broker's tab: white and joined to the panel while it's open */}
        <div
          onMouseLeave={() => setHoverTab(false)}
          style={{
            display: "flex", alignItems: "center", alignSelf: open ? "stretch" : "center",
            height: open ? undefined : 32, margin: open ? 0 : "0 0 0 2px", paddingRight: 6,
            borderRadius: open ? "0 8px 0 0" : 6,
            background: open ? "var(--tv-color-bg)" : hoverTab || menuOpen ? "var(--tv-hover-neutral)" : "transparent",
            boxShadow: open ? "4px 0 8px -6px rgba(0,0,0,0.25)" : undefined,
          }}
        >
          <Tip text={open ? "" : "Open account manager"}>
            <button
              type="button"
              aria-label="Paper Trading"
              aria-expanded={open}
              onClick={onToggleOpen}
              onMouseEnter={() => setHoverTab(true)}
              style={{
                display: "flex", alignItems: "center", height: open ? PANEL_ROW_HEIGHT : 32, padding: open ? "0 0 0 16px" : "0 0 0 14px",
                border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 14, fontFamily: "inherit",
              }}
            >
              <span style={{ position: "relative", display: "inline-flex" }}>
                <BrandMark />
                <span aria-hidden style={{ position: "absolute", right: -6, top: -3, width: 4, height: 4, borderRadius: "50%", background: "var(--tv-color-live)" }} />
              </span>
              <span style={{ marginLeft: 15, whiteSpace: "nowrap" }}>Paper Trading</span>
            </button>
          </Tip>
          <Tip text="Open context menu">
            <button
              ref={chevronRef}
              type="button"
              aria-label="Open context menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(o => !o)}
              onMouseEnter={() => setHoverTab(false)}
              className="tv-bb-btn"
              style={{ height: 24, minWidth: 21, padding: 0, marginLeft: 4, background: menuOpen ? "var(--tv-active-neutral-hover)" : undefined }}
            >
              <SmallChevron up={menuOpen} />
            </button>
          </Tip>
        </div>
        <BrokerMenu anchor={chevronRef.current} open={menuOpen} onClose={() => setMenuOpen(false)} />

        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Tip text={open ? "Collapse panel" : "Open panel"}>
            <button type="button" className="tv-bb-btn" aria-label={open ? "Collapse panel" : "Open panel"} onClick={onToggleOpen} style={{ width: 34, height: 34, padding: 0 }}>
              {open ? <MinimizeIcon size={28} /> : <PanelUpIcon />}
            </button>
          </Tip>
          <Tip text={maximized ? "Restore panel" : "Maximize panel"}>
            <button type="button" className="tv-bb-btn" aria-label={maximized ? "Restore panel" : "Maximize panel"} onClick={onToggleMaximize} style={{ width: 34, height: 34, padding: 0 }}>
              {maximized ? <RestoreIcon size={28} /> : <MaximizeIcon size={28} />}
            </button>
          </Tip>
        </div>
      </div>

      {open && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <AccountManager />
        </div>
      )}
    </div>
  );
}

const SmallChevron = ({ up }: { up?: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden>
    <path d={up ? "M1.5 6.5L5 3l3.5 3.5" : "M1.5 3.5L5 7l3.5-3.5"} />
  </svg>
);

const PanelUpIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <path d="M4.5 17.5l9.5-8.5 9.5 8.5" />
  </svg>
);

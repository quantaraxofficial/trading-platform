"use client";

// The header's Trade button. With no broker it opens the broker list; once Paper Trading is
// connected it becomes TradingView's split button: the logo and "Trade" open the trading
// panel, and the arrow holds Trading settings…, Connect another broker… and Log out.

import React, { useRef, useState } from "react";
import { engine, useEngineState, tradingUi, openAccountManager, closeTicket, closeDock } from "./store";
import { C, Popover, MenuItem, MenuDivider, TvLogo, ChevronDown, ChevronUp, HexSettingsIcon, Tip } from "./ui";

export default function TradeButton({ height }: { height: string }) {
  const state = useEngineState();
  const arrowRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<"main" | "arrow" | null>(null);
  const base: React.CSSProperties = {
    height, border: "none", cursor: "pointer", color: "var(--tv-color-text)", fontSize: 13, display: "flex", alignItems: "center", gap: 6,
  };

  if (!state.connected) {
    return (
      <Tip text="Trade with your broker" placement="bottom">
        <button type="button" aria-label="Trade" onClick={() => tradingUi.set({ dialog: { kind: "broker" } })}
          onMouseEnter={() => setHover("main")} onMouseLeave={() => setHover(null)}
          style={{ ...base, height: 28, padding: "0 12px", borderRadius: 14, fontSize: 14, fontWeight: 500, color: "var(--tv-hdr-text)",
            border: "1px solid var(--tv-trade-pill-border)", background: hover ? "var(--tv-hover-neutral)" : "transparent" }}>
          Trade
        </button>
      </Tip>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", borderRadius: 18, background: "var(--tv-trade-seg-bg)", height }}>
      <button type="button" title="Trading panel" onClick={openAccountManager}
        onMouseEnter={() => setHover("main")} onMouseLeave={() => setHover(null)}
        style={{ ...base, padding: "0 8px 0 4px", borderRadius: "18px 0 0 18px", background: hover === "main" ? "var(--tv-color-item-active)" : "transparent" }}>
        <TvLogo size={22} /> Trade
      </button>
      <button ref={arrowRef} type="button" aria-label="Broker menu" onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHover("arrow")} onMouseLeave={() => setHover(null)}
        style={{ ...base, padding: "0 6px", borderRadius: "0 18px 18px 0", background: open || hover === "arrow" ? "var(--tv-color-item-active)" : "transparent" }}>
        {open ? <ChevronUp /> : <ChevronDown />}
      </button>
      <BrokerMenu anchor={arrowRef.current} open={open} onClose={() => setOpen(false)} align="right" />
    </div>
  );
}

// The connected broker's menu, shared by the header's Trade button and the bottom panel's
// "Paper Trading" tab: Trading settings…, Connect another broker… and Log out
export function BrokerMenu({ anchor, open, onClose, align = "left" }: { anchor: HTMLElement | null; open: boolean; onClose: () => void; align?: "left" | "right" }) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align={align} width={240}>
      <MenuItem icon={<HexSettingsIcon />} onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("tv:open-chart-settings", { detail: { tab: "trading" } })); }}>
        Trading settings…
      </MenuItem>
      <MenuDivider />
      <MenuItem icon={<FolderIcon />} onClick={() => { onClose(); tradingUi.set({ dialog: { kind: "broker" } }); }}>
        Connect another broker…
      </MenuItem>
      <MenuDivider />
      <MenuItem danger icon={<LogOutIcon />} onClick={() => { onClose(); logOutBroker(); }}>
        Log out
      </MenuItem>
    </Popover>
  );
}

// Disconnects Paper Trading: the ticket, docked panel, chart previews and (with no broker
// left) the bottom trading panel all go away
export function logOutBroker() {
  closeTicket();
  closeDock();
  tradingUi.set({ project: null, pending: null });
  engine.setConnected(false);
}

const FolderIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.1"><path d="M3.5 6.5v10h15v-8h-7l-2-2h-6z" /></svg>
);
const LogOutIcon = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={C.sell} strokeWidth="1.2"><path d="M9 4.5H5.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H9M13 7.5l3.5 3.5-3.5 3.5M16.5 11H8" /></svg>
);

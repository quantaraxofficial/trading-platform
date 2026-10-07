"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Bot, Keyboard, Mail, Info, Tag } from "lucide-react";
import {
  TVPineIcon,
  TVWatchlistIcon,
  TVAlertsIcon,
  TVObjectTreeIcon,
  TVHelpIcon,
  TVProductsIcon,
  TVIndicatorsIcon,
  TVReplayIcon,
} from "./icons/TVIcons";
import { useEscapeClose } from "../lib/useEscapeClose";
import { useAlerts } from "@/context/AlertsContext";

// Trading Agent — a small chat-bubble-with-spark glyph (1px lines like the TradingView icons)
function TVAgentIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" {...props}>
      <path d="M4 5h16v10H9l-4 4v-4H4Z" vectorEffect="non-scaling-stroke" />
      <path d="M12 8.2 12.7 10 14.5 10.7 12.7 11.4 12 13.2 11.3 11.4 9.5 10.7 11.3 10Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

type MenuItem = { icon: React.ReactNode; label: string; hint?: string; onClick: () => void } | "divider";

interface RightSidebarProps {
  // The panel shown beside the toolbar, or null when that panel is collapsed
  activePanel: string | null;
  onPanelChange: (panelId: string) => void;
  onOpenPineEditor?: () => void;
  onOpenAgent?: () => void;
  onOpenReplay?: () => void;
  onOpenShortcuts?: () => void;
  // Pine Editor is open (its button shows as selected, and clicking it closes the editor)
  pineOpen?: boolean;
}

// TradingView's right toolbar: the panel switches at the top (Watchlist, Alerts, Object
// tree), the tools anchored at the bottom (Pine, our Trading Agent, Products) and Help
// Center in the corner. Clicking the open panel's button again collapses the panel.
export default function RightSidebar({ activePanel, onPanelChange, onOpenPineEditor, onOpenAgent, onOpenReplay, onOpenShortcuts, pineOpen = false }: RightSidebarProps) {
  const router = useRouter();
  const [menu, setMenu] = useState<"products" | "help" | null>(null);
  // Unread triggered alerts, as a red count on the Alerts button
  const { unread } = useAlerts();
  const productsRef = useRef<HTMLButtonElement>(null);
  const helpRef = useRef<HTMLButtonElement>(null);

  const panels = [
    { id: "watchlist", icon: <TVWatchlistIcon size={28} />, tooltip: "Watchlist, details and news" },
    { id: "alerts", icon: <TVAlertsIcon size={28} />, tooltip: "Alerts" },
    { id: "object_tree", icon: <TVObjectTreeIcon size={28} />, tooltip: "Object tree" },
  ];

  const i18 = { size: 18, strokeWidth: 1.5 };
  const productItems: MenuItem[] = [
    { icon: <TVIndicatorsIcon size={28} />, label: "Indicators, metrics, and strategies", hint: "/", onClick: () => window.dispatchEvent(new CustomEvent("tv:open-indicators")) },
    { icon: <TVPineIcon size={28} />, label: "Pine Editor", onClick: () => { if (!pineOpen) onOpenPineEditor?.(); } },
    { icon: <TVReplayIcon size={28} />, label: "Bar replay", onClick: () => onOpenReplay?.() },
    { icon: <Wallet {...i18} />, label: "Paper trading", onClick: () => window.dispatchEvent(new CustomEvent("tv:open-trading-panel")) },
    { icon: <Bot {...i18} />, label: "Trading Agent", onClick: () => onOpenAgent?.() },
    "divider",
    { icon: <Tag {...i18} />, label: "Pricing", onClick: () => router.push("/pricing") },
  ];
  const helpItems: MenuItem[] = [
    { icon: <Keyboard {...i18} />, label: "Keyboard shortcuts", hint: "Ctrl + /", onClick: () => onOpenShortcuts?.() },
    { icon: <Mail {...i18} />, label: "Contact support", onClick: () => router.push("/contact") },
    { icon: <Info {...i18} />, label: "About TradePilot", onClick: () => router.push("/about") },
  ];

  const tooltip = (text: string, hidden = false) => !hidden && (
    <div className="tv-tooltip" style={{ right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: "6px" }}>{text}</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", height: "100%", padding: "2px 0" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {panels.map(p => (
          <div key={p.id} className="tv-tooltip-container">
            <button className={`tv-rt-btn ${activePanel === p.id ? "active" : ""}`} onClick={() => onPanelChange(p.id)} aria-label={p.tooltip} aria-pressed={activePanel === p.id} style={{ position: "relative" }}>
              {p.icon}
              {p.id === "alerts" && unread > 0 && (
                <span data-testid="alerts-badge" style={{ position: "absolute", top: 3, right: 3, minWidth: 16, height: 16, padding: "0 4px", boxSizing: "border-box", borderRadius: 8, background: "#f23645", color: "#fff", fontSize: 11, lineHeight: "16px", fontWeight: 600, pointerEvents: "none" }}>{unread > 99 ? "99+" : unread}</span>
              )}
            </button>
            {tooltip(p.tooltip)}
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
        <div className="tv-tooltip-container">
          <button className={`tv-rt-btn ${pineOpen ? "active" : ""}`} onClick={() => onOpenPineEditor?.()} aria-label="Pine" aria-pressed={pineOpen}><TVPineIcon size={28} /></button>
          {tooltip("Pine")}
        </div>
        <div className="tv-tooltip-container">
          <button className="tv-rt-btn" onClick={() => onOpenAgent?.()} aria-label="Trading Agent"><TVAgentIcon size={28} /></button>
          {tooltip("Trading Agent")}
        </div>
        <div className="tv-tooltip-container">
          <button ref={productsRef} className={`tv-rt-btn ${menu === "products" ? "active" : ""}`} onClick={() => setMenu(m => (m === "products" ? null : "products"))} aria-label="Products">
            <TVProductsIcon size={36} />
          </button>
          {tooltip("Products", menu === "products")}
        </div>
      </div>

      <div className="tv-tooltip-container" style={{ marginTop: "13px" }}>
        <button ref={helpRef} className={`tv-rt-btn ${menu === "help" ? "active" : ""}`} onClick={() => setMenu(m => (m === "help" ? null : "help"))} aria-label="Help Center">
          <TVHelpIcon size={28} />
        </button>
        {tooltip("Help Center", menu === "help")}
      </div>

      {menu && (
        <SidebarMenu
          title={menu === "products" ? "Products" : "Help Center"}
          anchor={menu === "products" ? productsRef.current : helpRef.current}
          items={menu === "products" ? productItems : helpItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

// Opens to the left of its toolbar button, bottom-aligned with it (these buttons sit at
// the bottom of the window)
function SidebarMenu({ title, anchor, items, onClose }: { title: string; anchor: HTMLElement | null; items: MenuItem[]; onClose: () => void }) {
  useEscapeClose(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anchor, onClose]);
  const a = anchor?.getBoundingClientRect();
  return (
    <div ref={ref} role="menu" style={{
      position: "fixed", zIndex: 10005, width: "280px", maxHeight: "calc(100vh - 16px)", overflowY: "auto",
      right: a ? window.innerWidth - a.left + 6 : 60,
      bottom: a ? Math.max(8, window.innerHeight - a.bottom) : 8,
      backgroundColor: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)", border: "1px solid var(--tv-color-border)",
      borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.18)", padding: "6px 0",
    }}>
      <div style={{ padding: "8px 16px 6px", fontSize: "11px", letterSpacing: "0.4px", fontWeight: 600, color: "var(--tv-color-text-muted)", textTransform: "uppercase" }}>{title}</div>
      {items.map((item, i) => item === "divider" ? (
        <div key={`d${i}`} style={{ height: "1px", backgroundColor: "var(--tv-color-border)", margin: "6px 0" }} />
      ) : (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => { onClose(); item.onClick(); }}
          style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", minHeight: "40px", padding: "0 16px 0 10px", border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "14px", textAlign: "left" }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)"}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
        >
          <span style={{ width: "28px", display: "flex", justifyContent: "center", flexShrink: 0 }}>{item.icon}</span>
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.hint && <span style={{ fontSize: "12px", color: "var(--tv-color-text-muted)" }}>{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}

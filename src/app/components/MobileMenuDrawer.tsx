"use client";

import React from "react";
import Link from "next/link";
import { FileText, AlarmClock, Layers, Wallet, Bot, Home, Moon, PanelLeft, User, LogIn, LogOut, UserPlus, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEscapeClose } from "../lib/useEscapeClose";
import { TVPineIcon } from "./icons/TVIcons";

export type MobilePanel = "watchlist" | "alerts" | "object_tree";

interface MobileMenuDrawerProps {
  isDark: boolean;
  drawingsPanelVisible: boolean;
  onClose: () => void;
  onOpenPanel: (panel: MobilePanel) => void;
  onOpenPineEditor: () => void;
  onOpenTradingPanel: () => void;
  onOpenAgent: () => void;
  onToggleTheme: () => void;
  onToggleDrawingsPanel: () => void;
}

const PANEL_TITLES: Record<MobilePanel, string> = { watchlist: "Watchlist", alerts: "Alerts", object_tree: "Object tree" };

// A right-hand panel (watchlist, alerts, object tree) opened from the menu on a narrow
// screen, sliding over the chart below the header since there's no room to dock it.
export function MobilePanelSheet({ panel, onClose, children }: { panel: MobilePanel; onClose: () => void; children: React.ReactNode }) {
  useEscapeClose(onClose);
  return (
    <div style={{
      position: "fixed", top: "var(--tv-header-height)", right: 0, bottom: 0, width: "min(360px, 100vw)", zIndex: 10008,
      display: "flex", flexDirection: "column", backgroundColor: "var(--tv-color-bg)", color: "var(--tv-color-text)",
      borderLeft: "1px solid var(--tv-color-border)", boxShadow: "-2px 0 12px rgba(0,0,0,0.15)",
    }}>
      <div style={{ height: "44px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px 0 16px", borderBottom: "1px solid var(--tv-color-border)" }}>
        <span style={{ fontSize: "15px", fontWeight: 600 }}>{PANEL_TITLES[panel]}</span>
        <button className="tv-icon-btn" style={{ width: "32px", height: "32px", color: "var(--tv-color-text)" }} onClick={onClose} aria-label="Close">
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span style={{
      width: "36px", height: "20px", borderRadius: "10px", flexShrink: 0, position: "relative",
      backgroundColor: on ? "var(--tv-color-text)" : "#9598a1", transition: "background-color 0.15s",
    }}>
      <span style={{
        position: "absolute", top: "3px", left: on ? "19px" : "3px", width: "14px", height: "14px",
        borderRadius: "50%", backgroundColor: "var(--tv-color-pane-bg)", transition: "left 0.15s",
      }} />
    </span>
  );
}

// The phone/tablet menu behind the header's hamburger (TradingView's layout): on narrow
// screens the right-hand panels are hidden, so this is where they open from, alongside the
// theme / drawings-panel switches and the account links.
export default function MobileMenuDrawer(props: MobileMenuDrawerProps) {
  const { isDark, drawingsPanelVisible, onClose } = props;
  useEscapeClose(onClose);
  const { user, logout } = useAuth();

  const run = (fn: () => void) => () => { onClose(); fn(); };
  const row = (icon: React.ReactNode, label: string, onClick: () => void, extra?: React.ReactNode, color?: string) => (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "14px", width: "100%", minHeight: "44px", padding: "0 20px",
        border: "none", background: "transparent", color: color || "var(--tv-color-text)", cursor: "pointer",
        fontSize: "15px", textAlign: "left",
      }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)"}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
    >
      <span style={{ width: "28px", display: "flex", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {extra}
    </button>
  );
  const divider = <div style={{ height: "1px", backgroundColor: "var(--tv-color-border)", margin: "6px 6px" }} />;
  const i20 = { size: 20, strokeWidth: 1.5 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10010, backgroundColor: "rgba(0,0,0,0.3)" }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <nav style={{
        position: "absolute", top: 0, left: 0, bottom: 0, width: "min(280px, 80vw)", overflowY: "auto",
        backgroundColor: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)", boxShadow: "2px 0 12px rgba(0,0,0,0.2)",
        paddingBottom: "12px",
      }}>
        <div style={{ height: "56px", display: "flex", alignItems: "center", padding: "0 20px", fontSize: "18px", fontWeight: 700, borderBottom: "1px solid var(--tv-color-border)" }}>
          TradePilot
        </div>
        <div style={{ paddingTop: "6px" }}>
          {row(<FileText {...i20} />, "Watchlist", run(() => props.onOpenPanel("watchlist")))}
          {row(<AlarmClock {...i20} />, "Alerts", run(() => props.onOpenPanel("alerts")))}
          {row(<Layers {...i20} />, "Object tree", run(() => props.onOpenPanel("object_tree")))}
        </div>
        {divider}
        {row(<TVPineIcon size={28} />, "Pine Editor", run(props.onOpenPineEditor))}
        {row(<Wallet {...i20} />, "Trading panel", run(props.onOpenTradingPanel))}
        {row(<Bot {...i20} />, "Trading Agent", run(props.onOpenAgent))}
        {divider}
        <Link href="/landing" style={{ textDecoration: "none" }} onClick={onClose}>
          {row(<Home {...i20} />, "Home", () => {})}
        </Link>
        {row(<Moon {...i20} />, "Dark theme", props.onToggleTheme, <Switch on={isDark} />)}
        {row(<PanelLeft {...i20} />, "Drawings panel", props.onToggleDrawingsPanel, <Switch on={drawingsPanelVisible} />)}
        {divider}
        {user ? (
          <>
            <Link href="/profile" style={{ textDecoration: "none" }} onClick={onClose}>
              {row(<User {...i20} />, user.displayName || user.email || "Profile", () => {})}
            </Link>
            {row(<LogOut {...i20} />, "Sign out", run(() => { logout(); }))}
          </>
        ) : (
          <>
            <Link href="/login" style={{ textDecoration: "none" }} onClick={onClose}>
              {row(<LogIn {...i20} />, "Sign in", () => {}, undefined, "var(--tv-color-accent)")}
            </Link>
            <Link href="/signup" style={{ textDecoration: "none" }} onClick={onClose}>
              {row(<UserPlus {...i20} />, "Join now", () => {}, undefined, "var(--tv-color-accent)")}
            </Link>
          </>
        )}
      </nav>
    </div>
  );
}

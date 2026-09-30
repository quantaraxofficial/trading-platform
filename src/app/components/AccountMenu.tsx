"use client";

// The header avatar and its menu, laid out as TradingView's: the plan, the account (with its
// submenu: plans, profile, settings), Home and Support, the theme and drawings-panel switches,
// keyboard shortcuts, and Sign out. Every row leads somewhere real in this app.

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEscapeClose } from "../lib/useEscapeClose";
import { placeBelow, useCloseOnAnchorScroll } from "../lib/anchoredPopup";
import { Tip } from "../trading/ui";
import { readLayoutName } from "./LayoutMenu";

// Deterministic per-user avatar color, same idea as the colored initials used in the watchlist
const AVATAR_COLORS = ["#8c7ae6", "#2962ff", "#00bcd4", "#e91e63", "#ff9800", "#4caf50", "#f23645", "#9c27b0"];
function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function AccountMenu({ isDark, onToggleTheme, height, drawingsPanelVisible, onToggleDrawingsPanel }: {
  isDark: boolean; onToggleTheme: () => void; height: string;
  drawingsPanelVisible?: boolean; onToggleDrawingsPanel?: () => void;
}) {
  const { user, userData, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const subTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const close = React.useCallback(() => { setOpen(false); setSubOpen(false); }, []);
  useEscapeClose(close, open);
  useCloseOnAnchorScroll(ref, open, close);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);
  useEffect(() => () => clearTimeout(subTimer.current), []);

  const name = user?.displayName?.trim() || user?.email?.split("@")[0] || "";
  const letter = (name[0] || "T").toUpperCase();
  const color = getAvatarColor(user?.uid || user?.email || "guest");
  // The account's plan: none is sold through the app yet, so everyone is on the free one
  const plan: string = (userData && (userData.plan || userData.subscription_plan)) || "Basic";
  const go = (path: string) => { close(); router.push(path); };

  const showSub = () => { clearTimeout(subTimer.current); setSubOpen(true); };
  const hideSubSoon = () => { clearTimeout(subTimer.current); subTimer.current = setTimeout(() => setSubOpen(false), 150); };

  const row = (icon: React.ReactNode, label: React.ReactNode, onClick: () => void, extra?: React.ReactNode, opts: { danger?: boolean; hover?: () => void; leave?: () => void; active?: boolean } = {}) => (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={opts.hover}
      onMouseLeave={opts.leave}
      className="tv-menu-row"
      style={{ color: opts.danger ? "var(--tv-color-bear, #f23645)" : undefined, background: opts.active ? "var(--tv-hover-neutral)" : undefined }}
    >
      <span style={{ display: "flex", width: 24, justifyContent: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {extra}
    </button>
  );
  const divider = <div style={{ height: 1, background: "var(--tv-active-neutral)", margin: "6px 12px" }} />;
  const toggle = (on: boolean) => (
    <span aria-hidden style={{ width: 36, height: 20, borderRadius: 10, position: "relative", flexShrink: 0, background: on ? "var(--tv-hdr-text)" : "var(--tv-legend-muted)", transition: "background 0.15s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 14, height: 14, borderRadius: "50%", background: "var(--tv-color-pane-bg)", transition: "left 0.15s" }} />
    </span>
  );
  const chevron = <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden style={{ opacity: 0.6 }}><path d="M6 3.5L10.5 8 6 12.5" /></svg>;
  const avatar = (size: number) => (
    <span style={{ width: size, height: size, borderRadius: "50%", backgroundColor: color, color: "#ffffff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, fontWeight: 700, flexShrink: 0 }}>{letter}</span>
  );

  return (
    <div ref={ref} style={{ position: "relative" }} className="tv-wide-only">
      <Tip placement="bottom" text={(
        <span style={{ display: "block", lineHeight: "18px" }}>
          {user ? <>Logged in as <b>{user.displayName || user.email || "you"}</b></> : "Not signed in"}
          <br />Active layout: <b>{readLayoutName()}</b>
        </span>
      )}>
        <button className={`tv-hdr-btn ${open ? "active" : ""}`} style={{ minWidth: 38, height, padding: 0 }} onClick={() => (open ? close() : setOpen(true))} aria-label="Account" aria-expanded={open}>
          {avatar(26)}
        </button>
      </Tip>
      {open && (
        <div ref={el => placeBelow(el, ref.current)} role="menu" aria-label="Account" style={{
          position: "absolute", zIndex: 9999, width: 260, padding: "4px 0 8px",
          backgroundColor: "var(--tv-color-pane-bg)", color: "var(--tv-hdr-text)", border: "1px solid var(--tv-color-border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        }}>
          {/* The plan */}
          <button type="button" onClick={() => go("/pricing")} aria-label={`${plan} plan`}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", height: 44, padding: "0 12px", border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit" }}>
            <BrandMark />
            <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.3px" }}>{plan}</span>
          </button>
          {divider}

          {user ? (
            <div style={{ position: "relative" }} onMouseLeave={hideSubSoon}>
              {row(avatar(20), <b style={{ fontWeight: 600 }}>{name}</b>, () => (subOpen ? setSubOpen(false) : showSub()), chevron, { hover: showSub, active: subOpen })}
              {subOpen && (
                <div role="menu" aria-label="Account options" onMouseEnter={showSub} style={{
                  position: "absolute", left: "100%", top: 0, marginLeft: -6, width: 190, padding: "6px 0",
                  background: "var(--tv-color-pane-bg)", border: "1px solid var(--tv-color-border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                }}>
                  <button type="button" role="menuitem" className="tv-menu-row" style={{ height: 32, color: "var(--tv-color-accent)" }} onClick={() => go("/pricing")}>Explore our plans</button>
                  <button type="button" role="menuitem" className="tv-menu-row" style={{ height: 32 }} onClick={() => go("/profile")}>Your profile</button>
                  <button type="button" role="menuitem" className="tv-menu-row" style={{ height: 32 }} onClick={() => go("/profile?tab=settings")}>Settings and billing</button>
                </div>
              )}
            </div>
          ) : (
            <>
              {row(<SignInIcon />, "Sign in", () => go("/login"))}
              {row(<UserPlusIcon />, "Create account", () => go("/signup"))}
            </>
          )}
          {row(<HomeIcon />, "Home", () => go("/landing"))}
          {row(<SupportIcon />, "Support requests", () => go("/contact"))}
          {divider}
          {row(<MoonIcon />, "Dark theme", onToggleTheme, toggle(isDark))}
          {onToggleDrawingsPanel && row(<PanelIcon />, "Drawings panel", onToggleDrawingsPanel, toggle(!!drawingsPanelVisible))}
          {row(<KeyboardIcon />, "Keyboard shortcuts", () => { close(); window.dispatchEvent(new CustomEvent("tv:open-shortcuts")); },
            <span style={{ fontSize: 13, color: "var(--tv-legend-args)" }}>Ctrl + /</span>)}
          {user && (
            <>
              {divider}
              {row(<SignOutIcon />, "Sign out", () => { close(); logout(); }, undefined, { danger: true })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Icons: thin 24px outlines, as in TradingView's menu
const ico = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.1, "aria-hidden": true } as const;
const BrandMark = () => (
  <svg width="26" height="26" viewBox="0 0 36 36" fill="currentColor" aria-hidden><path d="M18 4L4 32h28L18 4zm0 8l8 16H10l8-16z" /></svg>
);
const HomeIcon = () => <svg {...ico}><path d="M4.5 11.5L12 5l7.5 6.5M6.5 10v9.5h4v-5h3v5h4V10" /></svg>;
const SupportIcon = () => <svg {...ico}><path d="M4.5 10.5h15v9h-15zM4.5 10.5L12 15l7.5-4.5M7.5 10.5v-5h9v5" /></svg>;
const MoonIcon = () => <svg {...ico}><path d="M18.5 14.5A7 7 0 0 1 9.5 5.5a7 7 0 1 0 9 9z" /></svg>;
const PanelIcon = () => <svg {...ico}><path d="M4.5 5.5h15v13h-15zM9.5 5.5v13" /></svg>;
const KeyboardIcon = () => <svg {...ico}><path d="M3.5 7.5h17v10h-17zM6.5 10.5h1M9.5 10.5h1M12.5 10.5h1M15.5 10.5h1M6.5 13h1M16.5 13h1M9 15h6" /></svg>;
const SignOutIcon = () => <svg {...ico}><path d="M10.5 5.5h-5v13h5M14 8.5l3.5 3.5-3.5 3.5M17.5 12h-9" /></svg>;
const SignInIcon = () => <svg {...ico}><path d="M13.5 5.5h5v13h-5M9.5 8.5L13 12l-3.5 3.5M13 12H4.5" /></svg>;
const UserPlusIcon = () => <svg {...ico}><circle cx="10" cy="9" r="3.5" /><path d="M3.5 19.5c.8-3.3 3.3-5 6.5-5s5.7 1.7 6.5 5M18 7.5v5M15.5 10h5" /></svg>;

"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { featureLabel, featureLocked, refreshAccess, useAccess } from "@/lib/access";
import { useEscapeClose } from "../lib/useEscapeClose";

// "Collab needs an active subscription": opened by requireFeature() / a 402 from the server
// (tv:feature-locked). Check again re-reads the subscription, for a renewal the admin just made.
export default function LockedFeatureDialog() {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setKey((e as CustomEvent).detail?.key ?? "");
    window.addEventListener("tv:feature-locked", on);
    return () => window.removeEventListener("tv:feature-locked", on);
  }, []);
  if (key === null) return null;
  return <Dialog featureKey={key} onClose={() => setKey(null)} />;
}

function Dialog({ featureKey, onClose }: { featureKey: string; onClose: () => void }) {
  useEscapeClose(onClose);
  const { user } = useAuth();
  const { access } = useAccess();
  const [checking, setChecking] = useState(false);
  const [stillLocked, setStillLocked] = useState(false);
  const label = featureKey ? featureLabel(featureKey) : "This";
  const ended = access?.until ? new Date(access.until).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;

  const checkAgain = async () => {
    if (!user?.uid) return;
    setChecking(true);
    await refreshAccess(user.uid);
    setChecking(false);
    if (!featureKey || !featureLocked(featureKey)) onClose();
    else setStillLocked(true);
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 10060, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)", padding: 16 }}>
      <div
        role="dialog"
        aria-label={`${label} needs an active subscription`}
        onMouseDown={e => e.stopPropagation()}
        style={{
          position: "relative", width: 460, maxWidth: "100%", boxSizing: "border-box", padding: "36px 36px 32px", borderRadius: 8,
          background: "var(--tv-color-pane-bg, #ffffff)", color: "var(--tv-hdr-text, #131722)", boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        }}
      >
        <button type="button" aria-label="Close" onClick={onClose}
          style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M1 1l16 16M17 1L1 17" /></svg>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 700, lineHeight: "28px", marginBottom: 14, paddingRight: 30 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden style={{ flexShrink: 0 }}>
            <rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          </svg>
          {label} needs an active subscription
        </div>
        <div style={{ fontSize: 15, lineHeight: "22px", marginBottom: 8 }}>
          {ended ? <>Your subscription ended on <b>{ended}</b>.</> : <>Your account doesn&apos;t have a subscription yet.</>}
        </div>
        {access?.message && <div style={{ fontSize: 15, lineHeight: "22px", whiteSpace: "pre-line" }}>{access.message}</div>}
        {stillLocked && <div style={{ fontSize: 13, marginTop: 12, color: "var(--tv-legend-args, #787b86)" }}>Still not renewed. Once it is, this opens again.</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 28 }}>
          <button type="button" onClick={checkAgain} disabled={checking || !user}
            style={{ height: 34, padding: "0 11px", borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: checking ? "default" : "pointer", background: "transparent", color: "inherit", border: "1px solid var(--tv-color-border, #dbdbdb)", opacity: checking ? 0.6 : 1 }}>
            {checking ? "Checking…" : "Check again"}
          </button>
          <button type="button" onClick={onClose} autoFocus
            style={{ height: 34, padding: "0 14px", borderRadius: 6, fontSize: 15, fontWeight: 500, cursor: "pointer", border: "none",
              background: "var(--tv-hdr-text, #131722)", color: "var(--tv-color-pane-bg, #ffffff)" }}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

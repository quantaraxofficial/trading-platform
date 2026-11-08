"use client";

// The voice assistant on the site's other pages (Analytics, Copy trading, Community…): a microphone
// button in the corner that opens the same panel as the chart's right toolbar. The chart page has
// its own (the toolbar button), so this stays out of it. The functions with inputs (VoiceBridge)
// and moving between pages come along; each page registers its own controls.

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import VoicePanel, { VoiceAssistantIcon } from "./VoicePanel";
import VoiceBridge from "./VoiceBridge";
import { useVoice, setVoiceUser } from "../lib/voice/assistant";
import { registerVoiceCommands } from "../lib/voice/registry";
import { useEscapeClose } from "../lib/useEscapeClose";
import { closeAllSiteTabs, listenForSiteClose } from "../lib/siteClose";

export default function VoiceDock() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const v = useVoice();
  const [open, setOpen] = useState(false);
  const onChart = pathname === "/" || pathname === "";
  useEscapeClose(() => setOpen(false), open && !onChart);

  useEffect(() => { if (!onChart) setVoiceUser(user?.uid ?? null); }, [user?.uid, onChart]);
  // "Close the site": every tab of the site closes (asked first). Every page, the chart's too:
  // this tab closes when another one says so (lib/siteClose)
  useEffect(() => {
    const stop = listenForSiteClose();
    registerVoiceCommands("site", [
      { id: "site-close-all-tabs", run: () => { void closeAllSiteTabs(); },
        confirm: () => "Close all TradePilot tabs? Your work is saved first. Say yes or no." },
    ]);
    return () => { stop(); registerVoiceCommands("site", null); };
  }, []);
  // Moving between the site's pages
  useEffect(() => {
    if (onChart) return;
    registerVoiceCommands("pages", [
      { id: "page-chart", run: () => router.push("/") },
      { id: "page-analytics", run: () => router.push("/analytics") },
      { id: "page-backtest-sessions", run: () => router.push("/analytics?view=backtests") },
      { id: "page-copy-trading", run: () => router.push("/analytics?view=copy") },
      { id: "page-community", run: () => router.push("/community") },
      { id: "page-pricing", run: () => router.push("/pricing") },
    ]);
    return () => registerVoiceCommands("pages", null);
  }, [onChart, router]);

  if (onChart) return null;
  return (
    <>
      <VoiceBridge />
      {open && (
        <div role="dialog" aria-label="Voice assistant" data-name="voice-dock"
          style={{ position: "fixed", right: 20, bottom: 84, width: 340, height: "min(560px, calc(100vh - 120px))", zIndex: 10060, borderRadius: 12,
            overflow: "hidden", border: "1px solid var(--tv-color-border)", boxShadow: "0 8px 32px rgba(0,0,0,0.35)" }}>
          <VoicePanel />
        </div>
      )}
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="Voice assistant" aria-expanded={open} data-name="voice-dock-button"
        title={v.listening ? "Voice assistant (listening)" : "Voice assistant"}
        style={{ position: "fixed", right: 20, bottom: 20, width: 52, height: 52, borderRadius: "50%", zIndex: 10060, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: v.listening ? "#f23645" : "#2962ff",
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }}
        className={v.listening ? "tv-voice-mic on" : undefined}>
        <VoiceAssistantIcon size={28} />
      </button>
    </>
  );
}

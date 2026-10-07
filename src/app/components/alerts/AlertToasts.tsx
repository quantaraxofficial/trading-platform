"use client";

// TradingView's alert toast: bottom-left over the chart, "Alert on [SYMBOL]", the message,
// "Edit alert" and the time it fired. It stays until closed (or hides itself after a few
// seconds with Settings → Alerts → Automatically hide toasts); closing it also stops a
// repeating alert sound.

import React, { useEffect, useRef, useState } from "react";
import type { AlertFiredDetail } from "@/context/AlertsContext";
import { DEFAULT_NOTIFY } from "@/context/AlertsContext";
import { playAlertSound, playAlertSoundRepeating } from "../../lib/alertSounds";
import { chartSettings } from "../../lib/chartSettings";

interface Toast { key: string; detail: AlertFiredDetail }

const AUTO_HIDE_MS = 6000;

export function AlarmIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} fill="none">
      <path fill="currentColor" d="M13.999 5c5.523 0 10 4.478 10 10s-4.477 10-10 10-10-4.477-10-10 4.477-10 10-10M13.5 15H10v1.5h5V10h-1.5zM8.183 4.02 3.099 9.527l-.551-.509-.552-.509 5.085-5.508zM26 8.51l-1.112 1.016-5.072-5.508 1.104-1.016z" />
    </svg>
  );
}

export function SymbolChip({ symbol, dark }: { symbol: string; dark: boolean }) {
  const name = symbol.split(":").pop() || symbol;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 22, boxSizing: "border-box", padding: "2px 7px 2px 2px", borderRadius: 30, background: dark ? "#2a2e39" : "#f0f3fa", fontSize: 14, lineHeight: "18px", fontWeight: 400, color: dark ? "#d1d4dc" : "#131722", verticalAlign: "middle", maxWidth: 160 }}>
      <span aria-hidden style={{ width: 18, height: 18, borderRadius: "50%", background: "#2962ff", color: "#fff", fontSize: 10, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{name.charAt(0)}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (t: number) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

export default function AlertToasts({ theme }: { theme?: string }) {
  const dark = theme === "dark";
  const [toasts, setToasts] = useState<Toast[]>([]);
  const stops = useRef(new Map<string, () => void>());

  const close = (key: string) => {
    stops.current.get(key)?.();
    stops.current.delete(key);
    setToasts(t => t.filter(x => x.key !== key));
  };

  useEffect(() => {
    const onFired = (e: Event) => {
      const detail = (e as CustomEvent<AlertFiredDetail>).detail;
      const n = detail.alert.notify ?? DEFAULT_NOTIFY;
      const key = detail.logId;
      if (!n.toast) {
        // No toast to close, so the sound plays once
        if (n.sound) playAlertSound(n.soundId);
        return;
      }
      if (n.sound) stops.current.set(key, playAlertSoundRepeating(n.soundId, n.soundRepeat));
      setToasts(t => [...t, { key, detail }]);
      if (chartSettings.get().autoHideToasts) setTimeout(() => close(key), AUTO_HIDE_MS);
    };
    window.addEventListener("tv:alert-fired", onFired);
    const all = stops.current;
    return () => { window.removeEventListener("tv:alert-fired", onFired); all.forEach(stop => stop()); };
  }, []);

  if (!toasts.length) return null;

  const c = dark
    ? { bg: "#1e222d", border: "#2a2e39", text: "#d1d4dc", time: "#868993", link: "#5b9cf6", icon: "#4dd0e1", strip: "rgba(77, 208, 225, 0.1)" }
    : { bg: "#ffffff", border: "#e0e3eb", text: "#131722", time: "#8c8c8c", link: "#2962ff", icon: "#00bcd4", strip: "rgba(0, 188, 212, 0.1)" };

  return (
    <div style={{ position: "fixed", left: 64, bottom: 12, zIndex: 10010, display: "flex", flexDirection: "column-reverse", gap: 8, pointerEvents: "none" }}>
      {toasts.map(({ key, detail }) => (
        <div key={key} role="status" aria-label={`Alert on ${detail.alert.symbol}`}
          style={{ pointerEvents: "auto", width: 400, boxSizing: "border-box", display: "flex", background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 12, padding: "3px 0 3px 3px", boxShadow: "0 2px 4px rgba(0, 0, 0, 0.4)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif", fontSize: 14, lineHeight: "18px" }}>
          <div style={{ width: 46, flex: "none", borderRadius: "8px 0 0 8px", background: c.strip, color: c.icon, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlarmIcon />
          </div>
          <div style={{ flex: 1, minWidth: 0, padding: "8px 11px 8px 12px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ paddingTop: 5, fontSize: 16, lineHeight: "24px", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  Alert on <SymbolChip symbol={detail.alert.symbol} dark={dark} />
                </div>
                <div style={{ marginTop: 7, fontSize: 14, lineHeight: "18px", wordBreak: "break-word" }}>{detail.alert.message || `${detail.alert.symbol} ${detail.alert.condition} ${detail.alert.value}`}</div>
              </div>
              <button type="button" aria-label="Close" onClick={() => close(key)}
                style={{ width: 20, height: 20, marginTop: 2, marginRight: -4, padding: 0, border: "none", background: "transparent", color: c.text, cursor: "pointer", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12"><path stroke="currentColor" strokeWidth="1.2" d="m1.5 1.5 9 9m0-9-9 9" /></svg>
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingBottom: 4 }}>
              <button type="button" onClick={() => { close(key); window.dispatchEvent(new CustomEvent("tv:edit-alert", { detail: { id: detail.alert.id } })); }}
                style={{ padding: 0, border: "none", background: "transparent", color: c.link, fontSize: 14, lineHeight: "18px", cursor: "pointer", fontFamily: "inherit" }}>
                Edit alert
              </button>
              <span style={{ color: c.time, fontWeight: 500 }}>{clock(detail.time)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

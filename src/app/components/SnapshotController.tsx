"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  captureChartSnapshot, snapshotFileName, downloadBlob, copyImageToClipboard, uploadSnapshot,
} from "../lib/chartSnapshot";

export type SnapshotAction = "download" | "copy-image" | "copy-link" | "open-tab" | "tweet";

interface ToastState { id: number; kind: "download" | "success" | "error"; message: string }

interface Options { symbol: string; intervalLabel: string; theme: string }

// Runs the chart-snapshot actions (download / copy image / copy link / open in new tab /
// tweet) and owns the confirmation toast shown at the bottom-center of the page. It lives
// at page level rather than inside the top bar so the keyboard shortcuts keep working
// while the panels (and with them the top bar) are hidden.
export function useChartSnapshot({ symbol, intervalLabel, theme }: Options) {
  const { user } = useAuth();
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  const showToast = useCallback((kind: ToastState["kind"], message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), kind, message });
    timer.current = setTimeout(() => setToast(null), kind === "error" ? 5000 : 3500);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const runSnapshot = useCallback(async (action: SnapshotAction) => {
    if (busy.current) return;
    busy.current = true;
    // Browsers only allow window.open inside the click itself, so claim the tab first
    // and point it at the snapshot once it exists.
    const popup = action === "open-tab" || action === "tweet" ? window.open("", "_blank") : null;
    const meta = { symbol, intervalLabel, theme };
    const author = (user as any)?.displayName || (user as any)?.name || "";
    try {
      const blob = await captureChartSnapshot(meta);
      switch (action) {
        case "download": {
          downloadBlob(blob, snapshotFileName(symbol));
          showToast("download", "File downloaded");
          break;
        }
        case "copy-image": {
          await copyImageToClipboard(blob);
          showToast("success", "Chart image copied to clipboard 👍");
          break;
        }
        case "copy-link": {
          const url = await uploadSnapshot(blob, { ...meta, author });
          await navigator.clipboard.writeText(url);
          showToast("success", "Link to the chart image copied to clipboard 👍");
          break;
        }
        case "open-tab": {
          const url = await uploadSnapshot(blob, { ...meta, author });
          if (popup) popup.location.href = url; else window.open(url, "_blank");
          break;
        }
        case "tweet": {
          const url = await uploadSnapshot(blob, { ...meta, author });
          const text = `${symbol}, ${intervalLabel}`;
          const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
          if (popup) popup.location.href = intent; else window.open(intent, "_blank");
          break;
        }
      }
    } catch (err: any) {
      if (popup) popup.close();
      showToast("error", err?.message || "Could not take the snapshot");
    } finally {
      busy.current = false;
    }
  }, [symbol, intervalLabel, theme, user, showToast]);

  const dark = theme === "dark";
  const toastElement = toast ? (
    <div
      key={toast.id}
      role="status"
      style={{
        position: "fixed", left: "50%", bottom: "calc(var(--tv-bottom-toolbar-height, 32px) + 40px)", transform: "translateX(-50%)",
        zIndex: 6000, display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderRadius: 8,
        fontSize: 14, whiteSpace: "nowrap", pointerEvents: "none",
        // The "File downloaded" toast is always dark; the copy confirmations follow the theme
        background: toast.kind === "download" || dark ? "#2a2e39" : "#ffffff",
        color: toast.kind === "download" || dark ? "#ffffff" : "#131722",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
      }}
    >
      {toast.kind === "download" ? (
        <Check size={18} color="#26a69a" strokeWidth={2.5} />
      ) : (
        <span style={{
          width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: toast.kind === "error" ? "#f23645" : "#089981", flexShrink: 0,
        }}>
          {toast.kind === "error" ? <AlertCircle size={14} color="#fff" /> : <Check size={14} color="#fff" strokeWidth={3} />}
        </span>
      )}
      {toast.message}
    </div>
  ) : null;

  return { runSnapshot, toastElement };
}

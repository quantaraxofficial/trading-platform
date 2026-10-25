"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Send, Paperclip, ImagePlus, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { sessionKey } from "@/lib/backend";
import { useEscapeClose } from "../lib/useEscapeClose";

interface FeedbackPanelProps {
  theme: string;
  symbol: string;
  interval: string;
  onClose: () => void;
}

// A report sent straight to the developer's Django admin: a message, one or more
// screenshots (drag & drop or pick), and the chart's context at the time it was
// written. Posted as multipart to /api/users/feedback/ — no sign-in required.
//
// The backend base URL is overridable via NEXT_PUBLIC_BACKEND_URL so a deployed
// build points at the real server; otherwise it assumes Django on :8000 next
// door (the local development layout).
const BACKEND_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BACKEND_URL) ||
  "http://localhost:8000";
const FEEDBACK_URL = `${BACKEND_BASE.replace(/\/$/, "")}/api/users/feedback/`;

// Client-side shrink: keep uploads small (a 4-core machine shouldn't churn on
// multi-megabyte POSTs). Downscales to a 1600px longest edge, ~0.8 JPEG.
function shrinkImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) {
          const name = file.name.replace(/\.[^.]+$/, "") || "screenshot";
          resolve(new File([blob], `${name}.jpg`, { type: "image/jpeg" }));
        } else resolve(file);
      }, "image/jpeg", 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

type Attach = { id: string; file: File; preview: string };

export default function FeedbackPanel({ theme, symbol, interval, onClose }: FeedbackPanelProps) {
  const isDark = theme === "dark";
  const { user } = useAuth();
  useEscapeClose(onClose);

  const [message, setMessage] = useState("");
  const [attaches, setAttaches] = useState<Attach[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!list.length) return;
    const shrunk = await Promise.all(list.map(shrinkImage));
    setAttaches(prev => [...prev, ...shrunk.map((f, i) => ({
      id: `a${Date.now()}_${i}`,
      file: f,
      preview: URL.createObjectURL(f),
    }))]);
  };

  const send = async () => {
    if (sending || sent || !message.trim()) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("message", message.trim());
      form.append("symbol", symbol);
      form.append("interval", interval);
      form.append("page_url", typeof location !== "undefined" ? location.href : "");
      for (const a of attaches) form.append("images", a.file, a.file.name);
      // Signed in → the backend attributes the report to the user via their
      // session; the same session key rides along either way for correlation.
      const key = sessionKey();
      const resp = await fetch(
        key ? `${FEEDBACK_URL}?session_key=${encodeURIComponent(key)}` : FEEDBACK_URL,
        { method: "POST", body: form }
      );
      if (!resp.ok) throw new Error(String(resp.status));
      setSent(true);
      setTimeout(onClose, 1400);
    } catch {
      setSending(false);
      setMessage(prev => prev + "\n[The report could not be sent — please try again.]");
    }
  };

  return (
    <div style={{
      position: "fixed", right: "16px", bottom: "calc(var(--tv-bottom-toolbar-height, 32px) + 16px)",
      width: "340px", maxWidth: "calc(100vw - 32px)", zIndex: 10006,
      display: "flex", flexDirection: "column",
      backgroundColor: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)",
      border: "1px solid var(--tv-color-border)", borderRadius: "10px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.28)", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: "1px solid var(--tv-color-border)",
      }}>
        <div style={{ fontSize: "14px", fontWeight: 600 }}>
          Send a bug report
          <span style={{ display: "block", fontSize: "11px", fontWeight: 400, color: "var(--tv-color-text-muted)" }}>
            goes straight to the developer{user ? " (as " + (user.displayName || user.email) + ")" : ""}
          </span>
        </div>
        <button className="tv-icon-btn" style={{ width: "28px", height: "28px" }} onClick={onClose} aria-label="Close">
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {sent ? (
        <div style={{ padding: "28px 16px", textAlign: "center" }}>
          <CheckCircle2 size={30} style={{ color: "var(--tv-color-bull, #089981)", margin: "0 auto 8px" }} />
          <div style={{ fontSize: "14px", fontWeight: 600 }}>Thanks — report sent</div>
          <div style={{ fontSize: "12px", color: "var(--tv-color-text-muted)" }}>The developer will see it in the admin panel.</div>
        </div>
      ) : (
        <>
          {/* Body */}
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px", maxHeight: "420px", overflowY: "auto" }}>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="What happened? What did you expect?"
              rows={4}
              style={{
                width: "100%", resize: "vertical", boxSizing: "border-box", padding: "8px 10px",
                borderRadius: "6px", border: "1px solid var(--tv-color-border)",
                backgroundColor: "var(--tv-color-bg)", color: "inherit",
                fontSize: "13px", fontFamily: "inherit", outline: "none",
              }}
            />

            {/* Attachments */}
            {attaches.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {attaches.map(a => (
                  <div key={a.id} style={{ position: "relative", width: "64px", height: "64px" }}>
                    <img src={a.preview} alt="" style={{
                      width: "100%", height: "100%", objectFit: "cover", borderRadius: "6px",
                      border: "1px solid var(--tv-color-border)",
                    }} />
                    <button
                      onClick={() => { URL.revokeObjectURL(a.preview); setAttaches(p => p.filter(x => x.id !== a.id)); }}
                      aria-label="Remove attachment"
                      style={{
                        position: "absolute", top: "-6px", right: "-6px", width: "18px", height: "18px",
                        borderRadius: "50%", border: "none", background: "#f23645", color: "#fff",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "11px", lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                padding: "10px", borderRadius: "6px", fontSize: "12px",
                border: `1px dashed ${dragOver ? "var(--tv-color-accent, #2962ff)" : "var(--tv-color-border)"}`,
                color: "var(--tv-color-text-muted)", cursor: "pointer",
              }}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={16} />
              Drop screenshots here or click to attach
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
            padding: "10px 14px", borderTop: "1px solid var(--tv-color-border)",
          }}>
            <span style={{ fontSize: "11px", color: "var(--tv-color-text-muted)" }}>
              context: {symbol} · {interval}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  display: "flex", alignItems: "center", gap: "5px", height: "32px", padding: "0 12px",
                  borderRadius: "6px", border: "1px solid var(--tv-color-border)",
                  background: "var(--tv-color-bg)", color: "var(--tv-color-text)",
                  fontSize: "13px", cursor: "pointer",
                }}
              >
                <Paperclip size={14} /> Attach
              </button>
              <button
                onClick={send}
                disabled={sending || !message.trim()}
                style={{
                  display: "flex", alignItems: "center", gap: "5px", height: "32px", padding: "0 14px",
                  borderRadius: "6px", border: "none",
                  background: !message.trim() ? "var(--tv-color-text-muted)" : "var(--tv-color-accent, #2962ff)",
                  color: "#fff", fontSize: "13px", fontWeight: 600,
                  cursor: !message.trim() ? "not-allowed" : "pointer",
                }}
              >
                <Send size={14} /> {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

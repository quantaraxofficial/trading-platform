"use client";

// The header's layout control, as on TradingView: the layout's name (click to save it; its
// tooltip says whether changes are saved) and "Manage layouts" (Save layout, Rename…).

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { Tip, TipKey, Popover, MenuItem, ChevronDown, ChevronUp, C } from "../trading/ui";
import { useEscapeClose } from "../lib/useEscapeClose";

const KEY = "tv:layoutName";

export function readLayoutName(): string {
  try { return localStorage.getItem(KEY) || "Unnamed"; } catch { return "Unnamed"; }
}

export default function LayoutMenu() {
  const { user } = useAuth();
  const [name, setName] = useState("Unnamed");
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const chevRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setName(readLayoutName()); }, []);
  const save = () => window.dispatchEvent(new CustomEvent("tv:save-chart"));

  return (
    <>
      <Tip text={user ? "All changes saved" : "Sign in to save your layout"} placement="bottom">
        <button type="button" className="tv-hdr-btn" onClick={save} style={{ maxWidth: 160, padding: "0 6px" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        </button>
      </Tip>
      <Tip text="Manage layouts" placement="bottom">
        <button ref={chevRef} type="button" aria-label="Manage layouts" className={`tv-hdr-btn ${open ? "active" : ""}`} style={{ minWidth: 24, padding: "0 4px" }} onClick={() => setOpen(o => !o)}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </Tip>
      <Popover anchor={chevRef.current} open={open} onClose={() => setOpen(false)} align="right" width={260}>
        <MenuItem onClick={() => { setOpen(false); save(); }} right={<span style={{ fontSize: 12, opacity: 0.6 }}>Ctrl + S</span>}>Save layout</MenuItem>
        <MenuItem onClick={() => { setOpen(false); setRenaming(true); }}>Rename…</MenuItem>
      </Popover>
      {renaming && (
        <RenameDialog
          initial={name}
          onClose={() => setRenaming(false)}
          onSave={n => {
            setName(n);
            try { localStorage.setItem(KEY, n); } catch { /* ignore */ }
            window.dispatchEvent(new CustomEvent("tv:layout-renamed", { detail: n }));
            setRenaming(false);
          }}
        />
      )}
    </>
  );
}

function RenameDialog({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const [value, setValue] = useState(initial === "Unnamed" ? "" : initial);
  useEscapeClose(onClose);
  const valid = value.trim().length > 0;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label="Rename layout" style={{ width: 420, maxWidth: "100%", background: C.panel, color: C.text, borderRadius: 8, boxShadow: C.shadow }}>
        <div style={{ padding: "20px 20px 12px", fontSize: 20, fontWeight: 600 }}>Rename</div>
        <div style={{ padding: "0 20px 16px" }}>
          <input
            autoFocus
            aria-label="Layout name"
            value={value}
            placeholder="Layout name"
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && valid) onSave(value.trim()); }}
            style={{ width: "100%", boxSizing: "border-box", height: 36, borderRadius: 6, border: `1px solid ${C.accent}`, padding: "0 10px", fontSize: 14, background: "transparent", color: C.text, outline: "none" }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 20px 18px", borderTop: `1px solid ${C.border}` }}>
          <button type="button" onClick={onClose} style={{ height: 34, padding: "0 14px", borderRadius: 6, border: `1px solid ${C.field}`, background: "transparent", color: C.text, cursor: "pointer", fontSize: 14 }}>Cancel</button>
          <button type="button" disabled={!valid} onClick={() => onSave(value.trim())} style={{ height: 34, padding: "0 14px", borderRadius: 6, border: "none", background: valid ? "var(--tv-trade-dark-btn)" : C.seg, color: valid ? "var(--tv-trade-dark-btn-text)" : C.faint, cursor: valid ? "pointer" : "default", fontSize: 14 }}>Save</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { TipKey };

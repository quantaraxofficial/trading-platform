"use client";

// The Chats panel's palette button: pick a theme for your private chats (ready-made or yours),
// make one, edit or delete yours. The editor (also used for a collab's group-chat theme in its
// settings) previews the theme as you change it.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./collab.css";
import { useEscapeClose } from "../../lib/useEscapeClose";
import { readImageFile } from "../../lib/chartBackgroundImage";
import {
  CHAT_FONTS, CHAT_FONT_SIZES, PRESET_THEMES, applyTheme, chatAreaStyle, chatThemes, deleteTheme, saveTheme, themeVars,
  type ChatFont, type ChatTheme,
} from "../../lib/collab/chatTheme";
import { CloseIcon } from "./icons";

const PaletteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <path d="M9 2.5a6.5 6.5 0 1 0 0 13c1 0 1.5-.6 1.5-1.3 0-1-.9-1.2-.9-2 0-.6.5-1 1.2-1h1.7a3 3 0 0 0 3-3C15.5 5 12.6 2.5 9 2.5Z" />
    <circle cx="5.8" cy="8.2" r=".9" /><circle cx="8" cy="5.4" r=".9" /><circle cx="11.4" cy="5.8" r=".9" />
  </svg>
);

function Swatches({ t }: { t: ChatTheme }) {
  const c = (x: string, d: string) => x || d;
  return (
    <span className="tv-co-theme-swatch" style={{ ...chatAreaStyle(t), background: t.image ? undefined : c(t.background, "var(--tv-color-pane-bg)") }}>
      <i style={{ background: c(t.bubble, "var(--tv-co-bubble)") }} />
      <i style={{ background: c(t.bubbleMine, "var(--tv-co-bubble-mine)") }} />
    </span>
  );
}

export default function ChatThemeMenu() {
  const v = chatThemes.useValue();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ChatTheme | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEscapeClose(() => setOpen(false), open && !editing);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  const row = (t: ChatTheme, mine: boolean) => (
    <div key={t.id} className={`tv-co-theme-row${v.active === t.id ? " on" : ""}`} role="menuitemradio" aria-checked={v.active === t.id}
      onClick={() => applyTheme(t.id)} data-name="chat-theme-option">
      <Swatches t={t} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
      {mine && <>
        <button className="tv-co-iconbtn small" title="Edit" aria-label={`Edit ${t.name}`} onClick={e => { e.stopPropagation(); setOpen(false); setEditing(t); }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M11.5 3.5l3 3L6 15H3v-3l8.5-8.5zM10 5l3 3" /></svg>
        </button>
        <button className="tv-co-iconbtn small" title="Delete" aria-label={`Delete ${t.name}`} onClick={e => { e.stopPropagation(); deleteTheme(t.id); }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M4 5.5h10M7.5 5.5V4h3v1.5M5.5 5.5l.7 9h5.6l.7-9" /></svg>
        </button>
      </>}
    </div>
  );
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="tv-co-iconbtn small" title="Chat theme" aria-label="Chat theme" aria-haspopup="menu" aria-expanded={open} data-name="chat-theme-button" onClick={() => setOpen(o => !o)}>
        <PaletteIcon />
      </button>
      {open && (
        <div className="tv-co-theme-menu" role="menu" aria-label="Chat theme" data-name="chat-theme-menu">
          <div className="tv-co-label" style={{ margin: "4px 10px 6px" }}>Chat theme</div>
          {PRESET_THEMES.map(t => row(t, false))}
          {v.custom.length > 0 && <div className="tv-co-label" style={{ margin: "10px 10px 6px" }}>Yours</div>}
          {v.custom.map(t => row(t, true))}
          <div style={{ height: 1, background: "var(--tv-co-border)", margin: "6px 0" }} />
          <div className="tv-co-theme-row" role="menuitem" data-name="chat-theme-create" onClick={() => {
            setOpen(false);
            const cur = [...PRESET_THEMES, ...v.custom].find(x => x.id === v.active);
            const base: Partial<ChatTheme> = cur && cur.id !== "default" ? cur : { background: "#16213a", text: "#f2f4f8", bubble: "#24314f", bubbleMine: "#3554a0", accent: "#7aa7ff", imageDim: 45 };
            setEditing({ imageDim: 45, font: "default", fontSize: 14, ...base, id: `t${Date.now().toString(36)}`, name: "My theme" } as ChatTheme);
          }}>
            <span className="tv-co-theme-swatch" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>+</span>Create theme…
          </div>
        </div>
      )}
      {editing && <ThemeEditor initial={editing} isNew={!v.custom.some(t => t.id === editing.id)} onClose={() => setEditing(null)} onSave={t => saveTheme(t)} />}
    </div>
  );
}

export function ThemeEditor({ initial, isNew, onClose, onSave, title }: { initial: ChatTheme; isNew: boolean; onClose: () => void; onSave: (t: ChatTheme) => void; title?: string }) {
  const [t, setT] = useState<ChatTheme>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEscapeClose(onClose);
  const set = (patch: Partial<ChatTheme>) => setT(x => ({ ...x, ...patch }));
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    try { set({ image: await readImageFile(f, { maxSide: 1600, maxChars: 450_000 }) }); }
    catch (e: any) { setError(e?.message || "Couldn't use that picture"); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };
  const color = (label: string, key: "background" | "text" | "bubble" | "bubbleMine" | "accent") => (
    <label className="tv-co-theme-color">
      <input type="color" value={t[key] || "#ffffff"} onChange={e => set({ [key]: e.target.value } as any)} aria-label={label} data-name={`chat-theme-${key}`} />
      <span>{label}</span>
    </label>
  );
  return createPortal(
    <div className="tv-co-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tv-co-dialog" role="dialog" aria-modal="true" aria-label={title || (isNew ? "Create chat theme" : "Edit chat theme")} data-name="chat-theme-editor" style={{ width: 560 }}>
        <div className="tv-co-header">
          <div className="tv-co-title">{title || (isNew ? "Create chat theme" : "Edit chat theme")}</div>
          <button className="tv-co-iconbtn" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="tv-co-content" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div className="tv-co-label">Name</div>
            <div className="tv-co-field plain"><input value={t.name} maxLength={40} onChange={e => set({ name: e.target.value })} onKeyDown={e => e.stopPropagation()} aria-label="Theme name" data-name="chat-theme-name" /></div>
            <div className="tv-co-label" style={{ marginTop: 16 }}>Background</div>
            {color("Background colour", "background")}
            <div className="tv-co-row" style={{ marginTop: 8, flexWrap: "wrap" }}>
              <button className="tv-co-btn secondary" style={{ height: 30 }} onClick={() => file.current?.click()} disabled={busy} data-name="chat-theme-image">
                {busy ? "Loading…" : t.image ? "Change photo…" : "Background photo…"}
              </button>
              {t.image && <button className="tv-co-btn secondary" style={{ height: 30 }} onClick={() => set({ image: undefined })}>Remove photo</button>}
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }} aria-label="Background photo file" onChange={e => pick(e.target.files?.[0])} />
            </div>
            {t.image && (
              <label className="tv-co-theme-color" style={{ marginTop: 8 }}>
                <input type="range" min={0} max={90} value={t.imageDim} onChange={e => set({ imageDim: Number(e.target.value) })} aria-label="Dim the photo" style={{ width: 120, accentColor: "var(--tv-co-accent)" }} />
                <span>Dim the photo {t.imageDim}%</span>
              </label>
            )}
            {error && <div className="tv-co-error">{error}</div>}
            <div className="tv-co-label" style={{ marginTop: 16 }}>Font</div>
            <div className="tv-co-row">
              <select className="tv-co-select" style={{ flex: 1, minWidth: 0, fontFamily: CHAT_FONTS[t.font || "default"].css || undefined }} value={t.font || "default"}
                onChange={e => set({ font: e.target.value as ChatFont })} aria-label="Font" data-name="chat-theme-font">
                {(Object.keys(CHAT_FONTS) as ChatFont[]).map(f => <option key={f} value={f} style={{ fontFamily: CHAT_FONTS[f].css || undefined }}>{CHAT_FONTS[f].label}</option>)}
              </select>
              <select className="tv-co-select" value={t.fontSize || 14} onChange={e => set({ fontSize: Number(e.target.value) })} aria-label="Text size" data-name="chat-theme-size">
                {CHAT_FONT_SIZES.map(n => <option key={n} value={n}>{n}px</option>)}
              </select>
            </div>
            <div className="tv-co-label" style={{ marginTop: 16 }}>Text and bubbles</div>
            {color("Text colour", "text")}
            {color("Others' messages", "bubble")}
            {color("Your messages", "bubbleMine")}
            {color("Accent", "accent")}
          </div>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div className="tv-co-label">Preview</div>
            <div className="tv-co-theme-preview" style={{ ...themeVars(t), ...chatAreaStyle(t) }} data-name="chat-theme-preview">
              <div className="tv-co-msg"><span className="tv-co-avatar sm" style={{ background: "#e91e63" }}>A</span>
                <div className="tv-co-msg-body"><div className="tv-co-msg-meta"><b style={{ color: "#e91e63" }}>Asha</b><span style={{ color: t.text || undefined, opacity: 0.7 }}>10:42</span></div>
                  <div className="tv-co-msg-text" style={{ color: t.text || undefined }}>Gold is holding the 4,000 support</div></div></div>
              <div className="tv-co-msg mine"><span className="tv-co-avatar sm" style={{ background: "#2962ff" }}>Y</span>
                <div className="tv-co-msg-body"><div className="tv-co-msg-meta"><b style={{ color: "#2962ff" }}>You</b></div>
                  <div className="tv-co-msg-text" style={{ color: t.text || undefined }}>Agreed, watching for a retest</div></div></div>
              <div style={{ marginTop: 10, height: 3, borderRadius: 2, background: t.accent || "var(--tv-co-accent)", width: "60%" }} />
            </div>
          </div>
        </div>
        <div className="tv-co-footer">
          <span className="tv-co-spacer" />
          <button className="tv-co-btn secondary" onClick={onClose}>Cancel</button>
          <button className="tv-co-btn primary" disabled={!t.name.trim()} data-name="chat-theme-save" onClick={() => { onSave({ ...t, name: t.name.trim() }); onClose(); }}>{isNew ? "Create and use" : "Save"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

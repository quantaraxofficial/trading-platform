"use client";

// Right toolbar → Voice assistant: the microphone, what's being heard, and the chat with the
// assistant, its answers shown as subtitles (each word lights up as it's spoken). Commands can
// also be typed. The listening itself lives in lib/voice/assistant (it carries on while another
// panel is open).

import React, { useEffect, useRef, useState } from "react";
import TvSelect from "@/app/components/ui/TvSelect";
import {
  useVoice, toggleListening, handleText, setVoicePrefs, clearVoiceChat, attachImage, VOICE_LANGS, type VoiceMessage,
} from "../lib/voice/assistant";

// (a picture from a paste or a drop: the first image in it)
const imageIn = (items: DataTransferItemList | FileList | null | undefined): File | null => {
  for (const it of Array.from(items ?? []) as (DataTransferItem | File)[]) {
    const f = it instanceof File ? it : it.kind === "file" ? it.getAsFile() : null;
    if (f && f.type.startsWith("image/")) return f;
  }
  return null;
};

export function VoiceAssistantIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} fill="none" stroke="currentColor" aria-hidden>
      <rect x="11" y="5.5" width="6" height="11" rx="3" />
      <path d="M8 13.5a6 6 0 0 0 12 0M14 19.5v3M11 22.5h6" />
    </svg>
  );
}

const EXAMPLES = ["Open gold on the 15 minute", "Mark order blocks", "Mark fair value gaps", "Mark support and resistance", "Add RSI", "Backtest gold from 1 March 2024 with 10k", "Start replay from 1 March 2024", "Switch to Heikin Ashi"];

// An answer as it's spoken: only the words said so far (a line cut short keeps those)
function Subtitle({ m }: { m: VoiceMessage }) {
  if (m.spokenTo === undefined) return <>{m.text}</>;
  const said = m.text.slice(0, m.spokenTo);
  return said ? <>{said}</> : <span aria-label="Speaking" style={{ opacity: 0.5, letterSpacing: 2 }}>•••</span>;
}

export default function VoicePanel() {
  const v = useVoice();
  const [text, setText] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [v.messages, v.hearing]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const send = (t: string) => { if (t.trim() || v.attachment) { handleText(t); setText(""); } };
  const canSend = !!text.trim() || !!v.attachment;
  const status = v.thinking ? "Thinking…" : v.speaking ? "Speaking…" : v.listening ? (v.hearing ? "Hearing you…" : "Listening… say a command") : v.supported ? "Click the microphone and speak" : "Type a command below";

  const iconBtn: React.CSSProperties = { width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "none", background: "transparent", color: "var(--tv-color-text)", cursor: "pointer", padding: 0 };

  return (
    <div data-name="voice-panel" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)", position: "relative" }}
      // (a picture dropped on the panel goes with the next message)
      onDragOver={e => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={e => { const f = imageIn(e.dataTransfer.files); setDragging(false); if (f) { e.preventDefault(); attachImage(f, f.name); } }}>
      {dragging && (
        <div aria-hidden style={{ position: "absolute", inset: 6, zIndex: 2, borderRadius: 8, border: "2px dashed var(--tv-color-accent)", background: "rgba(41, 98, 255, 0.08)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--tv-color-accent)", pointerEvents: "none" }}>Drop the picture here</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 12px 8px" }}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Voice assistant</span>
        <button type="button" className="tv-icon-btn" style={iconBtn} aria-pressed={v.replies} disabled={!v.canSpeak}
          title={v.replies ? "Spoken answers on (click for subtitles only)" : "Subtitles only (click to hear the answers)"} aria-label="Spoken answers"
          onClick={() => setVoicePrefs({ replies: !v.replies })}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
            <path d="M3 7h3l4-3v10l-4-3H3z" />
            {v.replies ? <path d="M12.5 6.5a3.5 3.5 0 0 1 0 5M14.5 4.5a6.3 6.3 0 0 1 0 9" /> : <path d="M12 7l4 4M16 7l-4 4" />}
          </svg>
        </button>
        <button type="button" className="tv-icon-btn" style={iconBtn} title="Clear the chat" aria-label="Clear the chat" onClick={clearVoiceChat} disabled={!v.messages.length}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M4 5.5h10M7.5 5.5V4h3v1.5M5.5 5.5l.7 9h5.6l.7-9" /></svg>
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px 8px", fontSize: 13, color: "var(--tv-color-text-muted)" }}>
        <span>Language</span>
        <TvSelect value={v.lang} onChange={e => setVoicePrefs({ lang: e.target.value })} aria-label="Voice language"
          style={{ height: 28, fontSize: 13, borderRadius: 6, border: "1px solid var(--tv-color-border)", background: "transparent", color: "var(--tv-color-text)", padding: "0 8px", minWidth: 140 }}>
          {VOICE_LANGS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </TvSelect>
      </div>

      {/* the chat */}
      <div ref={scroll} data-name="voice-chat" style={{ flex: 1, overflowY: "auto", padding: "4px 12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
        {v.messages.length === 0 && !v.hearing && (
          <div style={{ padding: "12px 4px", fontSize: 13, lineHeight: "20px", color: "var(--tv-color-text-muted)" }}>
            Talk to the site: open charts, mark order blocks, FVGs and levels, add indicators, start replays and backtest sessions, or ask anything. Try:
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {EXAMPLES.map(x => (
                <button key={x} type="button" onClick={() => send(x)} data-name="voice-example"
                  style={{ height: 28, padding: "0 10px", borderRadius: 14, border: "1px solid var(--tv-color-border)", background: "transparent", color: "var(--tv-color-text)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  “{x}”
                </button>
              ))}
            </div>
          </div>
        )}
        {v.messages.map(m => (
          <div key={m.id} data-name={m.from === "user" ? "voice-user" : "voice-reply"}
            style={{ alignSelf: m.from === "user" ? "flex-end" : "flex-start", maxWidth: "88%", padding: "7px 10px", borderRadius: 10, fontSize: 13, lineHeight: "19px",
              background: m.from === "user" ? "var(--tv-color-accent)" : "var(--tv-color-item-hover)", color: m.from === "user" ? "#fff" : "var(--tv-color-text)",
              borderBottomRightRadius: m.from === "user" ? 3 : 10, borderBottomLeftRadius: m.from === "user" ? 10 : 3 }}>
            {m.image && <img src={m.image} alt="Picture sent" data-name="voice-image" style={{ display: "block", maxWidth: "100%", maxHeight: 140, borderRadius: 6, marginBottom: m.text ? 6 : 0 }} />}
            {m.from === "assistant" ? <Subtitle m={m} /> : m.text}
            {m.link && (
              <a href={m.link.href} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-block", marginTop: 6, color: "var(--tv-color-accent)", fontWeight: 600, textDecoration: "none" }}>{m.link.label} ↗</a>
            )}
          </div>
        ))}
        {/* a yes / no question waiting: its answers as buttons (saying them works too) */}
        {v.pending && !v.thinking && (
          <div data-name="voice-answers" role="group" aria-label="Answer" style={{ alignSelf: "flex-end", display: "flex", gap: 6 }}>
            {v.pending.options.map(o => (
              <button key={o} type="button" onClick={() => send(o)} data-name="voice-answer"
                style={{ height: 28, padding: "0 14px", borderRadius: 14, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  border: "1px solid var(--tv-color-accent)", background: o === "Yes" ? "var(--tv-color-accent)" : "transparent", color: o === "Yes" ? "#fff" : "var(--tv-color-accent)" }}>
                {o}
              </button>
            ))}
          </div>
        )}
        {v.thinking && (
          <div data-name="voice-thinking" aria-label="Thinking" style={{ alignSelf: "flex-start", padding: "7px 12px", borderRadius: 10, borderBottomLeftRadius: 3, background: "var(--tv-color-item-hover)", color: "var(--tv-color-text-muted)", fontSize: 13, letterSpacing: 2 }}>•••</div>
        )}
        {v.hearing && (
          <div data-name="voice-hearing" style={{ alignSelf: "flex-end", maxWidth: "88%", padding: "7px 10px", borderRadius: 10, fontSize: 13, lineHeight: "19px", fontStyle: "italic",
            border: "1px dashed var(--tv-color-accent)", color: "var(--tv-color-text-muted)" }}>{v.hearing}…</div>
        )}
      </div>

      {v.error && (
        <div role="alert" style={{ margin: "0 12px 8px", padding: "8px 10px", borderRadius: 6, fontSize: 12, lineHeight: "17px", background: "rgba(242, 54, 69, 0.12)", color: "var(--tv-color-bear)" }}>{v.error}</div>
      )}

      {/* the microphone, and typing */}
      <div style={{ borderTop: "1px solid var(--tv-color-border)", padding: "12px 12px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={toggleListening} disabled={!v.supported} data-name="voice-mic"
          aria-label={v.listening ? "Stop listening" : "Start listening"} aria-pressed={v.listening}
          title={v.supported ? (v.listening ? "Stop listening" : "Start listening") : "Speech recognition isn't available in this browser"}
          className={v.listening ? "tv-voice-mic on" : "tv-voice-mic"}
          style={{ width: 52, height: 52, borderRadius: "50%", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: v.supported ? "pointer" : "default",
            background: v.listening ? "#f23645" : "var(--tv-color-accent)", color: "#fff", opacity: v.supported ? 1 : 0.4 }}>
          <VoiceAssistantIcon size={30} />
        </button>
        <div aria-live="polite" style={{ fontSize: 12, color: "var(--tv-color-text-muted)", minHeight: 16 }}>{status}</div>
        {/* a picture waiting to go with the next message (said or typed) */}
        {v.attachment && (
          <div data-name="voice-attachment" style={{ alignSelf: "stretch", display: "flex", alignItems: "center", gap: 8, padding: 6, borderRadius: 6, border: "1px solid var(--tv-color-border)" }}>
            <img src={v.attachment.url} alt="" style={{ width: 48, height: 32, objectFit: "cover", borderRadius: 4 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--tv-color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {v.attachment.name} · goes with your next message
            </span>
            <button type="button" className="tv-icon-btn" style={{ ...iconBtn, width: 24, height: 24 }} title="Remove the picture" aria-label="Remove the picture" onClick={() => attachImage(null)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M2 2l8 8M10 2l-8 8" /></svg>
            </button>
          </div>
        )}
        <form onSubmit={e => { e.preventDefault(); send(text); }} style={{ display: "flex", gap: 6, width: "100%" }}>
          <input ref={fileRef} type="file" accept="image/*" hidden data-name="voice-image-input"
            onChange={e => { const f = e.target.files?.[0]; if (f) attachImage(f, f.name); e.target.value = ""; }} />
          <button type="button" className="tv-icon-btn" style={{ ...iconBtn, width: 32, height: 32, border: "1px solid var(--tv-color-border)" }} data-name="voice-attach"
            title="Send a picture (or paste one): e.g. a screenshot of your chart to copy its colours" aria-label="Send a picture" onClick={() => fileRef.current?.click()}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
              <rect x="2.5" y="3.5" width="13" height="11" rx="1.5" /><circle cx="6.5" cy="7.5" r="1.3" /><path d="M3 13l4-4 3 3 2-2 3.5 3.5" />
            </svg>
          </button>
          <input value={text} onChange={e => setText(e.target.value)} placeholder={v.attachment ? "Say or type what to do with it…" : "Or type a command…"} aria-label="Type a command"
            onPaste={e => { const f = imageIn(e.clipboardData?.items); if (f) { e.preventDefault(); attachImage(f, f.name && f.name !== "image.png" ? f.name : "Pasted picture"); } }}
            style={{ flex: 1, minWidth: 0, height: 32, borderRadius: 6, border: "1px solid var(--tv-color-border)", background: "transparent", color: "var(--tv-color-text)", padding: "0 10px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <button type="submit" disabled={!canSend}
            style={{ height: 32, padding: "0 12px", borderRadius: 6, border: "none", background: "var(--tv-color-accent)", color: "#fff", fontSize: 13, cursor: canSend ? "pointer" : "default", opacity: canSend ? 1 : 0.5, fontFamily: "inherit" }}>Send</button>
        </form>
      </div>
    </div>
  );
}

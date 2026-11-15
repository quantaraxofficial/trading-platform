"use client";

// Right toolbar → Voice assistant: the orb (it listens when clicked, and moves with the voice), what's
// being heard, and the chat with the assistant, its answers shown as subtitles (each word lights up as
// it's spoken). Commands can also be typed, and a picture sent with them. The listening itself lives in
// lib/voice/assistant (it carries on while another panel is open).

import React, { useEffect, useRef, useState } from "react";
import TvSelect from "@/app/components/ui/TvSelect";
import VoiceOrb, { type OrbMode } from "./VoiceOrb";
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

const EXAMPLES = ["Open gold on the 15 minute", "Mark order blocks", "Find setups", "Bias for the next 4 hours", "Add RSI", "Backtest gold from 1 March 2024 with 10k", "Start replay from 1 March 2024", "Switch to Heikin Ashi"];

// An answer as it's spoken: only the words said so far (a line cut short keeps those)
function Subtitle({ m }: { m: VoiceMessage }) {
  if (m.spokenTo === undefined) return <>{m.text}</>;
  const said = m.text.slice(0, m.spokenTo);
  return said ? <>{said}</> : <span aria-label="Speaking" className="tv-voice-dots"><i /><i /><i /></span>;
}

// The panel's own look: the orb hanging and drifting, its shadow breathing with it, the typing dots
const STYLE = `
.tv-voice-float { animation: tvVoiceFloat 6s ease-in-out infinite; }
.tv-voice-shadow { animation: tvVoiceShadow 6s ease-in-out infinite; }
@keyframes tvVoiceFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes tvVoiceShadow { 0%, 100% { transform: scaleX(1); opacity: .55; } 50% { transform: scaleX(.82); opacity: .35; } }
.tv-voice-orb:focus-visible { outline: 2px solid var(--tv-color-accent); outline-offset: -12px; }
.tv-voice-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.tv-voice-dots i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .35; animation: tvVoiceDot 1.2s ease-in-out infinite; }
.tv-voice-dots i:nth-child(2) { animation-delay: .15s; } .tv-voice-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes tvVoiceDot { 0%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: .9; transform: translateY(-2px); } }
.tv-voice-chip:hover { background: var(--tv-color-item-hover); }
.tv-voice-composer:focus-within { border-color: var(--tv-color-accent); }
@media (prefers-reduced-motion: reduce) { .tv-voice-float, .tv-voice-shadow, .tv-voice-dots i { animation: none; } }
`;

// The assistant's mark beside its messages: a little orb
const Mark = () => (
  <span aria-hidden style={{ width: 20, height: 20, borderRadius: "50%", flex: "none", marginTop: 2,
    background: "radial-gradient(circle at 35% 30%, #ddd6fe 0%, #8b5cf6 45%, #4f46e5 100%)", boxShadow: "0 0 8px rgba(139, 92, 246, 0.45)" }} />
);

export default function VoicePanel() {
  const v = useVoice();
  const [text, setText] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" }); }, [v.messages, v.thinking, v.pending]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const send = (t: string) => { if (t.trim() || v.attachment) { handleText(t); setText(""); } };
  const canSend = !!text.trim() || !!v.attachment;
  const mode: OrbMode = v.thinking ? "thinking" : v.speaking ? "speaking" : v.listening ? "listening" : "idle";
  const status = v.thinking ? "Thinking" : v.speaking ? "Speaking" : v.listening ? (v.hearing ? "Hearing you" : "Listening, say a command")
    : v.supported ? "Tap the orb and speak" : "Type a command below";
  const speakingTo = [...v.messages].reverse().find(m => m.from === "assistant")?.spokenTo ?? 0;
  const empty = v.messages.length === 0;

  const iconBtn: React.CSSProperties = { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none", background: "transparent", color: "var(--tv-color-text-muted)", cursor: "pointer", padding: 0, flex: "none" };

  return (
    <div data-name="voice-panel" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)", position: "relative", overflow: "hidden" }}
      // (a picture dropped on the panel goes with the next message)
      onDragOver={e => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={e => { const f = imageIn(e.dataTransfer.files); setDragging(false); if (f) { e.preventDefault(); attachImage(f, f.name); } }}>
      <style>{STYLE}</style>
      {dragging && (
        <div aria-hidden style={{ position: "absolute", inset: 8, zIndex: 3, borderRadius: 14, border: "2px dashed var(--tv-color-accent)", background: "rgba(41, 98, 255, 0.08)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--tv-color-accent)", pointerEvents: "none" }}>Drop the picture here</div>
      )}

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "12px 10px 4px 16px" }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, letterSpacing: 0.1 }}>Voice assistant</span>
        <TvSelect value={v.lang} onChange={e => setVoicePrefs({ lang: e.target.value })} aria-label="Voice language" title="The language it hears and answers in"
          style={{ height: 26, maxWidth: 124, fontSize: 12, borderRadius: 13, border: "1px solid var(--tv-color-border)", background: "transparent", color: "var(--tv-color-text-muted)", padding: "0 8px" }}>
          {VOICE_LANGS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </TvSelect>
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

      {/* the chat */}
      <div ref={scroll} data-name="voice-chat" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {empty && !v.hearing && (
          <div style={{ padding: "4px 2px", textAlign: "center" }}>
            <div style={{ fontSize: 13, lineHeight: "20px", color: "var(--tv-color-text-muted)" }}>
              Open charts, mark order blocks, FVGs and levels, add indicators, find setups, start replays and backtests, or ask anything.
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--tv-color-text-muted)", margin: "16px 0 8px", opacity: 0.8 }}>Try saying</div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
              {EXAMPLES.map(x => (
                <button key={x} type="button" onClick={() => send(x)} data-name="voice-example" className="tv-voice-chip"
                  style={{ height: 30, padding: "0 12px", borderRadius: 15, border: "1px solid var(--tv-color-border)", background: "transparent", color: "var(--tv-color-text)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "background .15s" }}>
                  {x}
                </button>
              ))}
            </div>
          </div>
        )}
        {v.messages.map(m => m.from === "user" ? (
          <div key={m.id} data-name="voice-user"
            style={{ alignSelf: "flex-end", maxWidth: "84%", padding: "8px 12px", borderRadius: 16, borderBottomRightRadius: 5, fontSize: 13, lineHeight: "20px",
              background: "var(--tv-color-accent)", color: "#fff", boxShadow: "0 1px 2px rgba(0, 0, 0, 0.12)", overflowWrap: "anywhere" }}>
            {m.image && <img src={m.image} alt="Picture sent" data-name="voice-image" style={{ display: "block", maxWidth: "100%", maxHeight: 140, borderRadius: 10, marginBottom: m.text ? 6 : 0 }} />}
            {m.text}
          </div>
        ) : (
          <div key={m.id} style={{ alignSelf: "flex-start", display: "flex", gap: 8, maxWidth: "92%" }}>
            <Mark />
            <div data-name="voice-reply"
              style={{ padding: "8px 12px", borderRadius: 16, borderTopLeftRadius: 5, fontSize: 13, lineHeight: "20px", background: "var(--tv-color-item-hover)", color: "var(--tv-color-text)", overflowWrap: "anywhere" }}>
              <Subtitle m={m} />
              {m.link && (
                <a href={m.link.href} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-block", marginTop: 6, color: "var(--tv-color-accent)", fontWeight: 600, textDecoration: "none" }}>{m.link.label} ↗</a>
              )}
            </div>
          </div>
        ))}
        {/* a yes / no question waiting: its answers as buttons (saying them works too) */}
        {v.pending && !v.thinking && (
          <div data-name="voice-answers" role="group" aria-label="Answer" style={{ alignSelf: "flex-end", display: "flex", gap: 6 }}>
            {v.pending.options.map(o => (
              <button key={o} type="button" onClick={() => send(o)} data-name="voice-answer"
                style={{ height: 30, padding: "0 16px", borderRadius: 15, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  border: "1px solid var(--tv-color-accent)", background: o === "Yes" ? "var(--tv-color-accent)" : "transparent", color: o === "Yes" ? "#fff" : "var(--tv-color-accent)" }}>
                {o}
              </button>
            ))}
          </div>
        )}
        {v.thinking && (
          <div style={{ alignSelf: "flex-start", display: "flex", gap: 8 }}>
            <Mark />
            <div data-name="voice-thinking" aria-label="Thinking" style={{ padding: "10px 14px", borderRadius: 16, borderTopLeftRadius: 5, background: "var(--tv-color-item-hover)", color: "var(--tv-color-text-muted)" }}>
              <span className="tv-voice-dots"><i /><i /><i /></span>
            </div>
          </div>
        )}
      </div>

      {v.error && (
        <div role="alert" style={{ margin: "0 14px 8px", padding: "8px 12px", borderRadius: 10, fontSize: 12, lineHeight: "17px", background: "rgba(242, 54, 69, 0.12)", color: "var(--tv-color-bear)" }}>{v.error}</div>
      )}

      {/* the orb, hanging above the input: bigger while the chat is empty */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: empty ? "4px 16px 2px" : "2px 16px 0", transition: "padding .45s ease", flex: "none" }}>
        <div className="tv-voice-float" style={{ position: "relative", zIndex: 1 }}>
          <VoiceOrb mode={mode} size={empty ? 150 : 92} hearing={v.hearing} pulse={speakingTo} onClick={toggleListening} disabled={!v.supported}
            label={v.supported ? (v.listening ? "Stop listening" : "Start listening") : "Speech recognition isn't available in this browser"} />
        </div>
        <div className="tv-voice-shadow" aria-hidden style={{ width: empty ? 110 : 66, height: 10, marginTop: empty ? 6 : 2, borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(124, 58, 237, 0.35) 0%, rgba(124, 58, 237, 0) 70%)", transition: "width .45s ease" }} />
        <div aria-live="polite" style={{ marginTop: 8, fontSize: 12, letterSpacing: 0.3, color: "var(--tv-color-text-muted)", display: "flex", alignItems: "center", gap: 6, minHeight: 16 }}>
          {status}{(v.thinking || (v.listening && !v.hearing)) && <span className="tv-voice-dots"><i /><i /><i /></span>}
        </div>
        {v.hearing && (
          <div data-name="voice-hearing" style={{ marginTop: 6, maxWidth: "100%", padding: "0 8px", textAlign: "center", fontSize: 13, lineHeight: "19px", fontStyle: "italic",
            color: "var(--tv-color-text)", opacity: 0.8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            “{v.hearing}…”
          </div>
        )}
      </div>

      {/* typing (and a picture to send with it) */}
      <div style={{ padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 8, flex: "none" }}>
        {v.attachment && (
          <div data-name="voice-attachment" style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, borderRadius: 12, border: "1px solid var(--tv-color-border)" }}>
            <img src={v.attachment.url} alt="" style={{ width: 48, height: 32, objectFit: "cover", borderRadius: 6 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--tv-color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {v.attachment.name} · goes with your next message
            </span>
            <button type="button" className="tv-icon-btn" style={{ ...iconBtn, width: 24, height: 24 }} title="Remove the picture" aria-label="Remove the picture" onClick={() => attachImage(null)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M2 2l8 8M10 2l-8 8" /></svg>
            </button>
          </div>
        )}
        <form onSubmit={e => { e.preventDefault(); send(text); }} className="tv-voice-composer"
          style={{ display: "flex", alignItems: "center", gap: 4, padding: 4, borderRadius: 22, border: "1px solid var(--tv-color-border)", transition: "border-color .15s" }}>
          <input ref={fileRef} type="file" accept="image/*" hidden data-name="voice-image-input"
            onChange={e => { const f = e.target.files?.[0]; if (f) attachImage(f, f.name); e.target.value = ""; }} />
          <button type="button" className="tv-icon-btn" style={{ ...iconBtn, width: 32, height: 32, borderRadius: 16 }} data-name="voice-attach"
            title="Send a picture (or paste one): e.g. a screenshot of your chart to copy its colours and drawings" aria-label="Send a picture" onClick={() => fileRef.current?.click()}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
              <rect x="2.5" y="3.5" width="13" height="11" rx="2" /><circle cx="6.5" cy="7.5" r="1.3" /><path d="M3 13l4-4 3 3 2-2 3.5 3.5" />
            </svg>
          </button>
          <input value={text} onChange={e => setText(e.target.value)} placeholder={v.attachment ? "Say or type what to do with it…" : "Type a command…"} aria-label="Type a command"
            onPaste={e => { const f = imageIn(e.clipboardData?.items); if (f) { e.preventDefault(); attachImage(f, f.name && f.name !== "image.png" ? f.name : "Pasted picture"); } }}
            style={{ flex: 1, minWidth: 0, height: 32, border: "none", background: "transparent", color: "var(--tv-color-text)", padding: "0 4px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <button type="submit" disabled={!canSend} aria-label="Send" title="Send"
            style={{ width: 32, height: 32, borderRadius: 16, border: "none", background: "var(--tv-color-accent)", color: "#fff", cursor: canSend ? "pointer" : "default", opacity: canSend ? 1 : 0.4,
              display: "flex", alignItems: "center", justifyContent: "center", flex: "none", transition: "opacity .15s" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" /></svg>
          </button>
        </form>
      </div>
    </div>
  );
}

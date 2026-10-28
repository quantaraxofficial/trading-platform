"use client";

// The collab's group panel in the right column: who's here, the voice call, and the group chat
// (text, and pictures / documents: attach, drop or paste them).

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../../lib/useEscapeClose";
import "./collab.css";
import SignalCard from "./SignalCard";
import { collab, useCollab, chatFileProblem, CHAT_FILE_ACCEPT, type ChatMessage, type Peer, type SharedAlert } from "../../lib/collab/session";
import { useAlerts } from "@/context/AlertsContext";
import { Avatar } from "./CollabDialog";
import { VoicePlayer, VoiceRecorder } from "./VoiceMessage";
import CollabList, { RoleBadge } from "./CollabList";
import { chatAreaStyle, roomTheme, themeVars } from "../../lib/collab/chatTheme";
import { collabRoleOf } from "../../lib/collab/roles";
import { leaveCollab } from "./CollabController";
import { AddPersonIcon, LeaveIcon, MicIcon, PhoneIcon, SendIcon } from "./icons";
import { playCollabSound, setSoundsOn, soundsOn } from "../../lib/collab/sounds";

const GROUP_GAP_MS = 5 * 60 * 1000;

function timeOf(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayOf(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export default function CollabPanel({ onShare }: { onShare: () => void }) {
  const state = useCollab();
  const { room, peers, voice, status, uid, you, replay, replayDetached, alerts } = state;
  // The group's messages (private ones are in the Chats panel)
  const messages = state.messages.filter(m => !m.to);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [showList, setShowList] = useState(false);
  // The collab's chat theme (its admin or a controller sets it in its settings)
  const theme = roomTheme(state.room, state.uid);
  const [sounds, setSounds] = useState(soundsOn);
  const [draft, setDraft] = useState("");
  const [recordingVoice, setRecordingVoice] = useState(false);
  // Files picked, dropped or pasted, waiting for Send (with the message as the first one's caption)
  const [queued, setQueued] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<ChatMessage | null>(null);
  const addFiles = (list: FileList | File[] | null) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    const bad = files.map(chatFileProblem).filter(Boolean) as string[];
    setFileError(bad.length ? bad.join(" · ") : null);
    setQueued(q => [...q, ...files.filter(f => !chatFileProblem(f))].slice(0, 10));
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const chatRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reading the chat clears the unread count on the toolbar button
  useEffect(() => {
    collab.setChatOpen(true);
    return () => { collab.setChatOpen(false); collab.sendTyping(false); };
  }, []);
  // On screen with something new: the others' "Seen by" (read receipts)
  useEffect(() => { if (status === "live" && messages.length) collab.sendRead(); }, [messages.length, status]);
  // "… is typing" fades a few seconds after the last word from them
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 2000); return () => clearInterval(t); }, []);
  const typingNames = Object.entries(state.typing).filter(([u, t]) => u !== uid && Date.now() - t.at < 6000).map(([, t]) => t.name);

  // New messages scroll into view unless the user has scrolled up to read older ones
  useLayoutEffect(() => {
    const el = chatRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // One row per person here (someone with two tabs open counts once)
  const people: Peer[] = [];
  for (const p of peers) if (!people.some(x => x.uid === p.uid)) people.push(p);
  const inCall = peers.filter(p => p.voice);
  const speakingOf = (p: Peer) => (p.id === you ? voice.speaking.me : voice.speaking[p.id]);
  const send = () => {
    if (!draft.trim() && !queued.length) return;
    collab.sendTyping(false);
    if (queued.length) {
      queued.forEach((f, i) => collab.sendFile(f, i === 0 ? draft : ""));
      setQueued([]);
      setFileError(null);
    } else {
      collab.sendChat(draft);
    }
    setDraft("");
    atBottom.current = true;
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // No collab open: the list of yours (also from inside one, with "Your collabs")
  if (!room && status === "connecting") {
    return <div className="tv-co-panel"><div className="tv-co-empty">Connecting to the collab…</div></div>;
  }
  if (!room || showList) {
    return <CollabList currentToken={room ? state.token : null} onNew={onShare} onBack={room ? () => setShowList(false) : undefined} />;
  }

  const canEdit = !!room.perms?.edit;
  // "Seen by" under your latest message: who has read the chat since (read receipts on both sides)
  const lastMine = [...messages].reverse().find(m => m.author === uid && m.kind !== "system");
  const seenStatus = (m: ChatMessage) => {
    if (m.pending || m.upload) return <span>Sending…</span>;
    const by = room.members.filter(x => x.uid !== uid && x.chat_read_at && x.chat_read_at >= m.time);
    return by.length
      ? <span className="seen" title={by.map(x => x.name).join(", ")}><svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M1 5.5 4 8.5 10 1.5M7 8.5l8-7" /></svg> Seen by {by.length === room.members.length - 1 ? "everyone" : by.map(x => x.name.split(" ")[0]).join(", ")}</span>
      : <span><svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M1 5.5 4 8.5 10 1.5" /></svg> Sent</span>;
  };
  const canVoice = !!room.perms?.voice;
  const replayMine = !!replay && replay.driver === you;
  return (
    <div className="tv-co-panel" data-name="collab-panel" style={themeVars(theme)}
      onDragOver={e => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); } }}>
      {dragging && <div className="tv-co-drop" data-name="collab-drop">Drop pictures or documents to share them</div>}
      <div className="tv-co-panel-head">
        <div className="tv-co-panel-title">
          <b title={room.name}>{room.name}</b>
          <span>
            <RoleBadge role={collabRoleOf(room.role, room.perms, room.kind)} small />
            <i className={`tv-co-dot${status === "live" ? "" : " off"}`} />
            {status === "live" ? `${people.length} here now` : status === "reconnecting" ? "Reconnecting…" : "Connecting…"}
            {room.kind === "pine" ? <>{" · Pine script"}{!room.perms?.pine && " · View only"}</> : !canEdit && " · View only"}
          </span>
        </div>
        <div className="tv-co-stack" aria-label="People here">
          {people.slice(0, 4).map(p => <Avatar key={p.uid} name={p.name} color={p.color} size="sm" />)}
        </div>
        <button
          className="tv-co-iconbtn small"
          title={sounds ? "Turn collab sounds off" : "Turn collab sounds on"}
          aria-label={sounds ? "Turn collab sounds off" : "Turn collab sounds on"}
          aria-pressed={!sounds}
          data-name="collab-sounds"
          onClick={() => { setSoundsOn(!sounds); setSounds(!sounds); if (!sounds) playCollabSound("notice"); }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden>
            <path d="M3 7h2.5L9 4v10l-3.5-3H3V7Z" />
            {sounds ? <path d="M11.5 6.5a3.5 3.5 0 0 1 0 5M13.5 4.5a6.4 6.4 0 0 1 0 9" /> : <path d="m11.5 7 4 4m0-4-4 4" />}
          </svg>
        </button>
        <button className="tv-co-iconbtn small" title="Your collabs" aria-label="Your collabs" data-name="collab-show-list" onClick={() => setShowList(true)}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M6.5 4.5h9M6.5 9h9M6.5 13.5h9" /><circle cx="3.2" cy="4.5" r=".9" /><circle cx="3.2" cy="9" r=".9" /><circle cx="3.2" cy="13.5" r=".9" /></svg>
        </button>
        <button className="tv-co-iconbtn small" title="Share and add people" aria-label="Share and add people" onClick={onShare}><AddPersonIcon /></button>
        <button className="tv-co-iconbtn small" title="Leave collab" aria-label="Leave collab" onClick={leaveCollab}><LeaveIcon /></button>
      </div>

      <div className="tv-co-voice">
        <div className="tv-co-voice-row">
          {voice.joined ? (
            <>
              <button
                className={`tv-co-iconbtn${voice.muted ? " on" : ""}`}
                disabled={!canVoice}
                title={!canVoice ? "The owner has turned your mic off" : voice.muted ? "Unmute" : "Mute"}
                aria-label={voice.muted ? "Unmute" : "Mute"} aria-pressed={voice.muted} onClick={() => collab.toggleMute()}
              >
                <MicIcon off={voice.muted || !canVoice} />
              </button>
              <span style={{ flex: 1, fontSize: 13, color: "var(--tv-co-muted)" }}>In voice{!canVoice ? " · listening (mic off by the owner)" : voice.muted ? " · muted" : ""}</span>
              <button className="tv-co-btn danger" onClick={() => collab.leaveVoice()}><PhoneIcon hangup />Leave</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 13, color: "var(--tv-co-muted)" }}>{inCall.length ? `${inCall.length} in voice` : "Voice is quiet"}{!canVoice && " · your mic is off"}</span>
              <button className="tv-co-btn live" disabled={voice.joining || status !== "live"} title={canVoice ? undefined : "The owner has turned your mic off: you'll join to listen"} onClick={() => collab.joinVoice()}><PhoneIcon />{voice.joining ? "Joining…" : canVoice ? "Join voice" : "Listen in"}</button>
            </>
          )}
        </div>
        {voice.error && <div className="tv-co-error">{voice.error}</div>}
        {inCall.length > 0 && (
          <div className="tv-co-voice-people">
            {inCall.map(p => (
              <span key={p.id} className="tv-co-voice-person">
                <Avatar name={p.name} color={p.color} size="sm" speaking={!!speakingOf(p) && !p.muted} />
                {p.id === you ? "You" : p.name}
                {(p.muted || !p.perms.voice) && <em title={p.perms.voice ? "Muted" : "Mic off by the owner"}><MicIcon size={14} off /></em>}
              </span>
            ))}
          </div>
        )}
      </div>

      {replay && (
        <div className="tv-co-voice" data-name="collab-replay-row">
          <div className="tv-co-voice-row">
            <svg width="18" height="18" viewBox="0 0 28 28" fill="none" stroke="currentColor" aria-hidden style={{ flex: "none" }}>
              <path d="M6.5 14a7.5 7.5 0 1 0 2.2-5.3M6.5 5.5v3.7h3.7" /><path d="M12.5 10.5v7l5-3.5-5-3.5z" />
            </svg>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--tv-co-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {replayMine ? "You're driving the replay" : replay.driver ? `${replay.driver_name} is driving the replay` : `Replay paused · ${replay.driver_name} left`}
            </span>
            {!replayMine && replayDetached && <button className="tv-co-btn secondary" onClick={() => collab.setReplayDetached(false)}>Follow</button>}
            {(replayMine || room.role === "owner") && <button className="tv-co-btn danger" title="Stop the replay for everyone" onClick={() => collab.stopSharedReplay()}>Stop</button>}
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="tv-co-voice" data-name="collab-alerts">
          <button className="tv-co-voice-row" style={{ width: "100%", border: "none", background: "transparent", padding: 0, color: "inherit", font: "inherit", cursor: "pointer" }} onClick={() => setAlertsOpen(o => !o)} aria-expanded={alertsOpen}>
            <span style={{ flex: 1, textAlign: "left", fontSize: 12, letterSpacing: "0.4px", textTransform: "uppercase", color: "var(--tv-co-muted)" }}>Shared alerts · {alerts.filter(a => a.status === "active").length} active</span>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden style={{ color: "var(--tv-co-muted)", transform: alertsOpen ? undefined : "rotate(180deg)" }}><path fill="currentColor" d="m4.67 10.62.66.76L9 8.16l3.67 3.22.66-.76L9 6.84l-4.33 3.78Z" /></svg>
          </button>
          {alertsOpen && alerts.map(a => <SharedAlertRow key={a.id} a={a} canManage={a.created_by === uid || room.role === "owner"} />)}
        </div>
      )}

      {state.error && status === "live" && <div className="tv-co-banner error">{state.error}</div>}

      <div className="tv-co-chat" ref={chatRef} style={chatAreaStyle(theme)} onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {messages.length === 0 && <div className="tv-co-empty">No messages yet. Say hi to the group.</div>}
        {messages.map((m, i) => <Message key={m.id} m={m} prev={messages[i - 1]} mine={m.author === uid} color={room.members.find(x => x.uid === m.author)?.color || "#787b86"} onView={setViewing}
          status={m.author === uid && m.id === lastMine?.id ? seenStatus(m) : undefined}
          onAuthor={author => window.dispatchEvent(new CustomEvent("tv:open-dm", { detail: { token: room.token, uid: author } }))} />)}
      </div>

      {typingNames.length > 0 && (
        <div className="tv-co-typing" data-name="collab-typing">
          <span className="tv-co-typing-dots"><i /><i /><i /></span>
          {typingNames.length === 1 ? `${typingNames[0]} is typing…` : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing…` : `${typingNames.length} people are typing…`}
        </div>
      )}
      {(queued.length > 0 || fileError) && (
        <div className="tv-co-queued" data-name="collab-queued">
          {queued.map((f, i) => (
            <span key={`${f.name}${i}`} className="tv-co-chip" title={f.name}>
              <FileGlyph name={f.name} size={14} /><span>{f.name}</span>
              <button aria-label={`Remove ${f.name}`} onClick={() => setQueued(q => q.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
          {fileError && <div className="tv-co-error" style={{ width: "100%" }}>{fileError}</div>}
        </div>
      )}
      <div className={`tv-co-compose${recordingVoice ? " recording" : ""}`}>
        <button className="tv-co-iconbtn" aria-label="Share a picture or document" title="Share a picture or document" data-name="collab-attach" onClick={() => fileInput.current?.click()}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M15 8.5 9 14.5a3.9 3.9 0 0 1-5.5-5.5l6.4-6.4a2.6 2.6 0 0 1 3.7 3.7L7.2 12.7a1.3 1.3 0 0 1-1.8-1.8L11 5.3" /></svg>
        </button>
        <input ref={fileInput} type="file" multiple accept={CHAT_FILE_ACCEPT} style={{ display: "none" }} aria-label="Files to share" data-name="collab-file-input"
          onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={2000}
          placeholder={queued.length ? "Add a caption (optional)" : "Message the group"}
          onPaste={e => { const files = Array.from(e.clipboardData.files || []); if (files.length) { e.preventDefault(); addFiles(files); } }}
          onChange={e => {
            setDraft(e.target.value);
            collab.sendTyping(!!e.target.value.trim());
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(120, el.scrollHeight + 2)}px`;
          }}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            e.stopPropagation();   // typing here isn't a chart shortcut
          }}
        />
        {!draft.trim() && !queued.length
          ? <VoiceRecorder onSend={(file, secs) => collab.sendFile(file, "", undefined, secs)} onRecording={setRecordingVoice} />
          : <button className="tv-co-iconbtn" aria-label="Send" title="Send" onClick={send}><SendIcon /></button>}
      </div>
      {viewing && <ImageViewer m={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// Where a message's file comes from, and what Retry / Remove do for one still uploading (the
// group chat's by default; the Chats panel passes its own)
export interface FileActions { url: (id: number | string, download?: boolean) => string; retry: (id: string) => void; drop: (id: string) => void }
const groupFiles: FileActions = { url: (id, download) => collab.fileUrl(id, download), retry: id => collab.retryFile(id), drop: id => collab.dropFile(id) };

export function Message({ m, prev, mine, color, onView, files = groupFiles, onAuthor, status }: {
  m: ChatMessage; prev?: ChatMessage; mine: boolean; color: string; onView: (m: ChatMessage) => void; files?: FileActions;
  // Clicking someone's name or picture (to message them privately)
  onAuthor?: (uid: string, name: string) => void;
  // Under your message: sent / seen
  status?: ReactNode;
}) {
  const newDay = !prev || dayOf(prev.time) !== dayOf(m.time);
  const day = newDay ? <div className="tv-co-day">{dayOf(m.time)}</div> : null;
  if (m.kind === "system") return <>{day}<div className="tv-co-sys">{m.text} · {timeOf(m.time)}</div></>;
  const cont = !newDay && prev?.kind !== "system" && prev?.author === m.author && m.time - (prev?.time || 0) < GROUP_GAP_MS;
  const name = mine ? "You" : m.author_name || "Someone";
  const canDm = !mine && !!onAuthor && !!m.author;
  const dm = () => { if (canDm) onAuthor!(m.author!, m.author_name || "them"); };
  return (
    <>
      {day}
      <div className={`tv-co-msg${cont ? " cont" : ""}${mine ? " mine" : ""}${m.pending ? " pending" : ""}`}>
        <span onClick={dm} title={canDm ? `Message ${m.author_name} privately` : undefined} style={canDm ? { cursor: "pointer", display: "flex" } : { display: "flex" }}>
          <Avatar name={m.author_name || "?"} color={color} size="sm" />
        </span>
        <div className="tv-co-msg-body">
          {!cont && <div className="tv-co-msg-meta">
            <b style={{ color, cursor: canDm ? "pointer" : undefined }} onClick={dm} title={canDm ? `Message ${m.author_name} privately` : undefined} data-name={canDm ? "collab-author-dm" : undefined}>{name}</b>
            <span>{timeOf(m.time)}</span>
          </div>}
          {m.signal ? <SignalCard s={m.signal} mine={mine} />
            : m.attachment ? <Attachment m={m} onView={onView} files={files} /> : <div className="tv-co-msg-text">{m.text}</div>}
          {status && <div className="tv-co-msg-status" data-name="msg-status">{status}</div>}
        </div>
      </div>
    </>
  );
}

function fileSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// A document's kind, as a small labelled page
export function FileGlyph({ name, size = 30 }: { name: string; size?: number }) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const kind = ext === "pdf" ? ["PDF", "#f23645"] : ["doc", "docx", "odt", "rtf"].includes(ext) ? ["DOC", "#2962ff"]
    : ["xls", "xlsx", "ods", "csv"].includes(ext) ? ["XLS", "#089981"] : ["ppt", "pptx"].includes(ext) ? ["PPT", "#ff9800"]
      : ext === "zip" ? ["ZIP", "#787b86"] : ["png", "jpg", "jpeg", "gif", "webp"].includes(ext) ? ["IMG", "#9c27b0"] : [ext.slice(0, 4).toUpperCase() || "FILE", "#787b86"];
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 30 36" aria-hidden style={{ flex: "none" }}>
      <path d="M3 1h17l7 7v26a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z" fill="var(--tv-co-bg)" stroke="var(--tv-co-field)" />
      <path d="M20 1v7h7" fill="none" stroke="var(--tv-co-field)" />
      <rect x="0" y="19" width="24" height="11" rx="2" fill={kind[1]} />
      <text x="12" y="27.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff" fontFamily="sans-serif">{kind[0]}</text>
    </svg>
  );
}

// A shared picture (click to see it full size) or document (download), with its caption, and while
// it's still uploading, its progress (or why it failed, with Retry)
function Attachment({ m, onView, files }: { m: ChatMessage; onView: (m: ChatMessage) => void; files: FileActions }) {
  const a = m.attachment!;
  const up = m.upload;
  const src = up?.preview || (typeof m.id === "number" ? files.url(m.id) : "");
  const ratio = a.width && a.height ? a.height / a.width : 0.66;
  const w = Math.min(240, a.width || 240);
  return (
    <div className="tv-co-file" data-name="collab-attachment" data-kind={a.image ? "image" : "document"}>
      {a.audio && src ? (
        <VoicePlayer src={src} duration={a.duration} />
      ) : a.image && src ? (
        <button className="tv-co-file-img" onClick={() => !up && onView(m)} aria-label={`View ${a.name}`} disabled={!!up}
          style={{ width: w, height: Math.min(320, Math.round(w * ratio)) }}>
          <img src={src} alt={a.name} loading="lazy" />
        </button>
      ) : (
        <div className="tv-co-file-doc">
          <FileGlyph name={a.name} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="tv-co-member-name" title={a.name}>{a.name}</div>
            <div className="tv-co-member-sub">{fileSize(a.size)}</div>
          </div>
          {!up && typeof m.id === "number" && (
            <a className="tv-co-iconbtn small" href={files.url(m.id, true)} download={a.name} aria-label={`Download ${a.name}`} title="Download" data-name="collab-file-download">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M9 2.5v9M5.5 8 9 11.5 12.5 8M3 13v2.5h12V13" /></svg>
            </a>
          )}
        </div>
      )}
      {up && !up.error && <div className="tv-co-progress" role="progressbar" aria-valuenow={Math.round(up.progress * 100)}><i style={{ width: `${Math.max(4, up.progress * 100)}%` }} /></div>}
      {up?.error && (
        <div className="tv-co-error" data-name="collab-upload-error">
          {up.error}{" "}
          <button className="tv-co-link" onClick={() => files.retry(String(m.id))}>Retry</button>
          <button className="tv-co-link" onClick={() => files.drop(String(m.id))}>Remove</button>
        </div>
      )}
      {m.text && <div className="tv-co-msg-text" style={{ marginTop: 4 }}>{m.text}</div>}
    </div>
  );
}

// A shared picture, full size over the page (Escape or a click outside closes it)
export function ImageViewer({ m, onClose, files = groupFiles }: { m: ChatMessage; onClose: () => void; files?: FileActions }) {
  useEscapeClose(onClose);
  const a = m.attachment!;
  return createPortal(
    <div className="tv-co-viewer" role="dialog" aria-label={a.name} data-name="collab-image-viewer" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tv-co-viewer-bar">
        <span title={a.name}>{a.name} · {m.author_name}</span>
        <a href={files.url(m.id, true)} download={a.name} className="tv-co-iconbtn" aria-label="Download" title="Download">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M9 2.5v9M5.5 8 9 11.5 12.5 8M3 13v2.5h12V13" /></svg>
        </a>
        <button className="tv-co-iconbtn" aria-label="Close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden><path stroke="currentColor" strokeWidth="1.2" d="m1.5 1.5 15 15m0-15-15 15" /></svg>
        </button>
      </div>
      <img src={files.url(m.id)} alt={a.name} />
    </div>,
    document.body,
  );
}

const STATUS_LABEL: Record<SharedAlert["status"], string> = { active: "Active", triggered: "Triggered", expired: "Expired", stopped: "Stopped" };

// One shared alert: what it watches, who set it, and copy / stop / restart / remove
function SharedAlertRow({ a, canManage }: { a: SharedAlert; canManage: boolean }) {
  const { addAlert } = useAlerts();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    addAlert({ symbol: a.symbol, condition: a.condition, value: a.value, trigger: a.trigger, expiration: a.expiration || Date.now() + 30 * 86400000, message: a.message });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="tv-co-member" style={{ minHeight: 40, gap: 8, marginTop: 4 }} data-name="collab-alert-row">
      <span style={{ width: 4, alignSelf: "stretch", borderRadius: 2, background: a.color, flex: "none" }} />
      <div className="tv-co-member-info">
        <div className="tv-co-member-name" title={a.message}>{a.symbol.split(":").pop()} {a.condition} {a.value}</div>
        <div className="tv-co-member-sub">{STATUS_LABEL[a.status]} · {a.trigger} · set by {a.created_by_name}</div>
      </div>
      <button className="tv-co-iconbtn small" title={copied ? "Copied to your alerts" : "Copy to my alerts"} aria-label="Copy to my alerts" onClick={copy}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden>{copied ? <path d="m4 9.5 3 3 7-7" /> : <><rect x="6.5" y="6.5" width="9" height="9" rx="1.5" /><path d="M11.5 6.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></>}</svg>
      </button>
      {canManage && (a.status === "active" ? (
        <button className="tv-co-iconbtn small" title="Stop" aria-label="Stop alert" onClick={() => collab.setSharedAlertStatus(a.id, "stopped")}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden><rect x="5.5" y="5.5" width="7" height="7" rx="1" /></svg>
        </button>
      ) : (
        <button className="tv-co-iconbtn small" title="Restart" aria-label="Restart alert" onClick={() => collab.setSharedAlertStatus(a.id, "active")}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden><path d="M4.5 9a4.5 4.5 0 1 0 1.3-3.2M4.5 3.5v2.8h2.8" /></svg>
        </button>
      ))}
      {canManage && (
        <button className="tv-co-iconbtn small danger" title="Remove" aria-label="Remove alert" onClick={() => collab.removeSharedAlert(a.id)}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden><path fill="currentColor" d="M12 4h3v1h-1.04l-.88 9.64a1.5 1.5 0 0 1-1.5 1.36H6.42a1.5 1.5 0 0 1-1.5-1.36L4.05 5H3V4h3v-.5C6 2.67 6.67 2 7.5 2h3c.83 0 1.5.67 1.5 1.5V4ZM7.5 3a.5.5 0 0 0-.5.5V4h4v-.5a.5.5 0 0 0-.5-.5h-3ZM5.05 5l.87 9.55a.5.5 0 0 0 .5.45h5.17a.5.5 0 0 0 .5-.45L12.94 5h-7.9Z" /></svg>
        </button>
      )}
    </div>
  );
}

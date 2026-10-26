"use client";

// The collab's group panel in the right column: who's here, the voice call, and the group chat.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./collab.css";
import { collab, useCollab, type ChatMessage, type Peer, type SharedAlert } from "../../lib/collab/session";
import { useAlerts } from "@/context/AlertsContext";
import { Avatar } from "./CollabDialog";
import { leaveCollab } from "./CollabController";
import { AddPersonIcon, LeaveIcon, MicIcon, PhoneIcon, SendIcon } from "./icons";

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
  const { room, peers, messages, voice, status, uid, you, replay, replayDetached, alerts } = state;
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reading the chat clears the unread count on the toolbar button
  useEffect(() => {
    collab.setChatOpen(true);
    return () => collab.setChatOpen(false);
  }, []);

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
    if (!draft.trim()) return;
    collab.sendChat(draft);
    setDraft("");
    atBottom.current = true;
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  if (!room) {
    return (
      <div className="tv-co-panel">
        <div className="tv-co-empty">{status === "connecting" ? "Connecting to the collab…" : "Not in a collab. Right-click the chart and choose Collaborate… to start one."}</div>
      </div>
    );
  }

  const canEdit = !!room.perms?.edit;
  const canVoice = !!room.perms?.voice;
  const replayMine = !!replay && replay.driver === you;
  return (
    <div className="tv-co-panel" data-name="collab-panel">
      <div className="tv-co-panel-head">
        <div className="tv-co-panel-title">
          <b title={room.name}>{room.name}</b>
          <span>
            <i className={`tv-co-dot${status === "live" ? "" : " off"}`} />
            {status === "live" ? `${people.length} here now` : status === "reconnecting" ? "Reconnecting…" : "Connecting…"}
            {!canEdit && " · View only"}
          </span>
        </div>
        <div className="tv-co-stack" aria-label="People here">
          {people.slice(0, 4).map(p => <Avatar key={p.uid} name={p.name} color={p.color} size="sm" />)}
        </div>
        <button className="tv-co-iconbtn small" title="Share and add people" aria-label="Share and add people" onClick={onShare}><AddPersonIcon /></button>
        <button className="tv-co-iconbtn small" title="Leave collab" aria-label="Leave collab" onClick={leaveCollab}><LeaveIcon /></button>
      </div>

      <div className="tv-co-voice">
        <div className="tv-co-voice-row">
          {voice.joined ? (
            <>
              <button className={`tv-co-iconbtn${voice.muted ? " on" : ""}`} title={voice.muted ? "Unmute" : "Mute"} aria-label={voice.muted ? "Unmute" : "Mute"} aria-pressed={voice.muted} onClick={() => collab.toggleMute()}>
                <MicIcon off={voice.muted} />
              </button>
              <span style={{ flex: 1, fontSize: 13, color: "var(--tv-co-muted)" }}>In voice{voice.muted ? " · muted" : ""}</span>
              <button className="tv-co-btn danger" onClick={() => collab.leaveVoice()}><PhoneIcon hangup />Leave</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 13, color: "var(--tv-co-muted)" }}>{inCall.length ? `${inCall.length} in voice` : "Voice is quiet"}{!canVoice && " · you can listen in chat only"}</span>
              <button className="tv-co-btn live" disabled={voice.joining || status !== "live" || !canVoice} title={canVoice ? undefined : "The owner hasn't let you talk in the voice call"} onClick={() => collab.joinVoice()}><PhoneIcon />{voice.joining ? "Joining…" : "Join voice"}</button>
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
                {p.muted && <em><MicIcon size={14} off /></em>}
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

      <div className="tv-co-chat" ref={chatRef} onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {messages.length === 0 && <div className="tv-co-empty">No messages yet. Say hi to the group.</div>}
        {messages.map((m, i) => <Message key={m.id} m={m} prev={messages[i - 1]} mine={m.author === uid} color={room.members.find(x => x.uid === m.author)?.color || "#787b86"} />)}
      </div>

      <div className="tv-co-compose">
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={2000}
          placeholder="Message the group"
          onChange={e => {
            setDraft(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(120, el.scrollHeight + 2)}px`;
          }}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            e.stopPropagation();   // typing here isn't a chart shortcut
          }}
        />
        <button className="tv-co-iconbtn" aria-label="Send" title="Send" disabled={!draft.trim()} onClick={send}><SendIcon /></button>
      </div>
    </div>
  );
}

function Message({ m, prev, mine, color }: { m: ChatMessage; prev?: ChatMessage; mine: boolean; color: string }) {
  const newDay = !prev || dayOf(prev.time) !== dayOf(m.time);
  const day = newDay ? <div className="tv-co-day">{dayOf(m.time)}</div> : null;
  if (m.kind === "system") return <>{day}<div className="tv-co-sys">{m.text} · {timeOf(m.time)}</div></>;
  const cont = !newDay && prev?.kind === "text" && prev.author === m.author && m.time - prev.time < GROUP_GAP_MS;
  const name = mine ? "You" : m.author_name || "Someone";
  return (
    <>
      {day}
      <div className={`tv-co-msg${cont ? " cont" : ""}${mine ? " mine" : ""}${m.pending ? " pending" : ""}`}>
        <Avatar name={m.author_name || "?"} color={color} size="sm" />
        <div className="tv-co-msg-body">
          {!cont && <div className="tv-co-msg-meta"><b style={{ color }}>{name}</b><span>{timeOf(m.time)}</span></div>}
          <div className="tv-co-msg-text">{m.text}</div>
        </div>
      </div>
    </>
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

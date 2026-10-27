"use client";

// The right toolbar's Chats panel: your private conversations with people in your collabs and
// your group chats — the list (who / which group, the last message, unread), and a conversation
// with text, pictures and documents. "New chat" picks anyone in your collabs, or makes a group; a
// name clicked in a collab's group chat opens a conversation with them here. A group's settings
// (its gear) show who's in it; its admins rename it, add and remove people, make admins, set its
// theme and can delete it.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./collab.css";
import { useAuth } from "@/context/AuthContext";
import { useEscapeClose } from "../../lib/useEscapeClose";
import {
  CHAT_FILE_ACCEPT, chatFileProblem, chatFileUrl, isChatImage, uploadChatFile, type ChatMessage,
} from "../../lib/collab/session";
import {
  dmApi, groupApi, refreshDms, setDmPanelOpen, useDms,
  type DmContact, type DmPerson, type GroupInfo,
} from "../../lib/collab/dms";
import { PRESET_THEMES, chatAreaStyle, groupTheme, themeVars, useChatTheme, type ChatTheme } from "../../lib/collab/chatTheme";
import { Avatar } from "./CollabDialog";
import { FileGlyph, ImageViewer, Message, type FileActions } from "./CollabPanel";
import ChatThemeMenu, { ThemeEditor } from "./ChatThemeMenu";
import { CloseIcon, SendIcon } from "./icons";
import { reportTyping, seenText, setPrivacy, usePrivacy, type Seen } from "../../lib/collab/presence";
import { VoiceRecorder } from "./VoiceMessage";
import { isChatAudio } from "../../lib/collab/session";
import { TVSettingsHexIcon } from "../icons/TVIcons";

const THREAD_POLL_MS = 3000;

function when(ms: number) {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}
const preview = (m: ChatMessage | null, uid: string) =>
  !m ? "" : m.kind === "system" ? m.text : `${m.author === uid ? "You: " : m.author_name ? `${m.author_name.split(" ")[0]}: ` : ""}${m.attachment ? `📎 ${m.attachment.name}` : m.text}`;

// A private conversation (a collab's token and the other person) or a group (its token)
export interface OpenChat { token: string; uid?: string; group?: boolean }

export default function ChatsPanel({ open, onOpen }: { open: OpenChat | null; onOpen: (c: OpenChat | null) => void }) {
  const { user } = useAuth();
  const theme = useChatTheme();
  useEffect(() => { setDmPanelOpen(true); return () => setDmPanelOpen(false); }, []);
  if (!user) {
    return <div className="tv-co-panel"><div className="tv-co-empty">Sign in to chat privately with people in your collabs.</div></div>;
  }
  return (
    <div className="tv-co-panel" data-name="chats-panel" style={themeVars(theme)}>
      {open
        ? <Conversation key={`${open.group ? "g" : "d"}:${open.token}:${open.uid || ""}`} uid={user.uid} chat={open} onBack={() => onOpen(null)} />
        : <ConversationList uid={user.uid} onOpen={onOpen} />}
    </div>
  );
}

function GroupAvatar({ people, size = 32 }: { people: DmPerson[]; size?: number }) {
  const two = people.slice(0, 2);
  return (
    <span className="tv-co-groupavatar" style={{ width: size, height: size }} aria-hidden>
      {two.map((p, i) => <span key={p.uid} style={{ background: p.color, ...(i ? { right: 0, bottom: 0 } : { left: 0, top: 0 }) }}>{(p.name || "?").charAt(0)}</span>)}
    </span>
  );
}

function ConversationList({ uid, onOpen }: { uid: string; onOpen: (c: OpenChat) => void }) {
  const { conversations, groups, loaded, error } = useDms();
  const theme = useChatTheme();
  const [picking, setPicking] = useState<null | "person" | "group">(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // Private conversations and groups together, newest first
  const rows = useMemo(() => [
    ...conversations.map(c => ({ key: `d:${c.token}:${c.partner.uid}`, time: c.last.time, kind: "dm" as const, c })),
    ...groups.map(g => ({ key: `g:${g.token}`, time: g.last?.time || g.updated_at, kind: "group" as const, g })),
  ].sort((a, b) => b.time - a.time), [conversations, groups]);
  return (
    <>
      <div className="tv-co-panel-head">
        <div className="tv-co-panel-title">
          <b>Chats</b>
          <span>Private and group chats</span>
        </div>
        <ChatThemeMenu />
        <button className="tv-co-iconbtn small" title="Privacy: read receipts, typing, last seen" aria-label="Privacy" data-name="chats-privacy" onClick={() => setPrivacyOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><rect x="4.5" y="8" width="9" height="7" rx="1.5" /><path d="M6.5 8V6a2.5 2.5 0 0 1 5 0v2" /></svg>
        </button>
        <button className="tv-co-btn secondary" style={{ height: 30 }} onClick={() => setPicking(p => (p === "group" ? null : "group"))} data-name="chats-new-group">New group</button>
        <button className="tv-co-btn primary" style={{ height: 30 }} onClick={() => setPicking(p => (p === "person" ? null : "person"))} data-name="chats-new">New chat</button>
      </div>
      {privacyOpen && <PrivacyDialog onClose={() => setPrivacyOpen(false)} />}
      {picking === "person" && <PeoplePicker uid={uid} onPick={c => { setPicking(null); onOpen(c); }} onClose={() => setPicking(null)} />}
      {picking === "group" && <NewGroup uid={uid} onMade={token => { setPicking(null); refreshDms(); onOpen({ token, group: true }); }} onClose={() => setPicking(null)} />}
      <div className="tv-co-chat" style={{ padding: "6px 8px 12px", ...chatAreaStyle(theme) }}>
        {error && <div className="tv-co-banner error" style={{ margin: "4px 4px 8px" }}>{error}</div>}
        {loaded && rows.length === 0 && !picking && (
          <div className="tv-co-empty">No chats yet. Start one with New chat, make a group, or click someone&apos;s name in a collab&apos;s group chat.</div>
        )}
        {rows.map(r => r.kind === "dm" ? (
          <button key={r.key} className="tv-co-dmrow" onClick={() => onOpen({ token: r.c.token, uid: r.c.partner.uid })} data-name="chats-conversation">
            <Avatar name={r.c.partner.name} color={r.c.partner.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tv-co-dmrow-top"><b>{r.c.partner.name}</b><span>{when(r.c.last.time)}</span></div>
              <div className="tv-co-member-sub" title={r.c.room_name}>in {r.c.room_name}</div>
              <div className={`tv-co-dmrow-last${r.c.unread ? " unread" : ""}`}>{preview(r.c.last, uid)}</div>
            </div>
            {r.c.unread > 0 && <span className="tv-co-dmrow-badge" data-name="chats-unread">{r.c.unread}</span>}
          </button>
        ) : (
          <button key={r.key} className="tv-co-dmrow" onClick={() => onOpen({ token: r.g.token, group: true })} data-name="chats-group">
            <GroupAvatar people={r.g.people} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tv-co-dmrow-top"><b>{r.g.name}</b><span>{when(r.time)}</span></div>
              <div className="tv-co-member-sub">Group · {r.g.members} people{r.g.role === "admin" ? " · you're an admin" : ""}</div>
              <div className={`tv-co-dmrow-last${r.g.unread ? " unread" : ""}`}>{preview(r.g.last, uid)}</div>
            </div>
            {r.g.unread > 0 && <span className="tv-co-dmrow-badge" data-name="chats-unread">{r.g.unread}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

function PeoplePicker({ uid, onPick, onClose }: { uid: string; onPick: (c: OpenChat) => void; onClose: () => void }) {
  const [people, setPeople] = useState<DmContact[] | null>(null);
  const [q, setQ] = useState("");
  const [choose, setChoose] = useState<DmContact | null>(null);
  useEffect(() => { dmApi.people(uid).then(setPeople).catch(() => setPeople([])); }, [uid]);
  const shown = (people || []).filter(p => !q.trim() || `${p.name} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="tv-co-dmpicker" data-name="chats-picker">
      {choose ? (
        <>
          <div className="tv-co-label" style={{ margin: "2px 4px 6px" }}>Which collab is this chat about?</div>
          {choose.collabs.map(c => (
            <button key={c.token} className="tv-co-dmrow small" onClick={() => onPick({ token: c.token, uid: choose.uid })}>
              <span style={{ flex: 1, textAlign: "left" }}>{c.name}</span><span className="tv-co-member-sub">{c.kind === "pine" ? "Pine script" : "Chart"}</span>
            </button>
          ))}
          <button className="tv-co-link" onClick={() => setChoose(null)}>Back</button>
        </>
      ) : (
        <>
          <div className="tv-co-field plain" style={{ marginBottom: 6 }}>
            <input autoFocus placeholder="Search people in your collabs" value={q} onChange={e => setQ(e.target.value)} aria-label="Search people"
              onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") onClose(); }} />
          </div>
          {!people && <div className="tv-co-hint">Loading…</div>}
          {people && shown.length === 0 && <div className="tv-co-hint">{people.length ? "No one matches" : "No one to message yet: add people to a collab first."}</div>}
          {shown.map(p => (
            <button key={p.uid} className="tv-co-dmrow small" data-name="chats-person"
              onClick={() => (p.collabs.length === 1 ? onPick({ token: p.collabs[0].token, uid: p.uid }) : setChoose(p))}>
              <Avatar name={p.name} color={p.color} size="sm" />
              <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <span className="tv-co-member-sub" style={{ display: "block" }}>{p.collabs.map(c => c.name).join(", ")}</span>
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// Choosing people (for a new group, or to add to one): from your collabs and groups
function PeopleChooser({ uid, exclude = [], picked, setPicked }: { uid: string; exclude?: string[]; picked: string[]; setPicked: (f: (p: string[]) => string[]) => void }) {
  const [people, setPeople] = useState<DmPerson[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { groupApi.contacts(uid).then(setPeople).catch(() => setPeople([])); }, [uid]);
  const shown = (people || []).filter(p => !exclude.includes(p.uid) && (!q.trim() || `${p.name} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <>
      <div className="tv-co-field plain" style={{ marginBottom: 6 }}>
        <input placeholder="Search people in your collabs and groups" value={q} onChange={e => setQ(e.target.value)} aria-label="Search people" onKeyDown={e => e.stopPropagation()} />
      </div>
      {!people && <div className="tv-co-hint">Loading…</div>}
      {people && shown.length === 0 && <div className="tv-co-hint">{q ? "No one matches" : "No one else to add: people come from your collabs and groups."}</div>}
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {shown.map(p => (
          <label key={p.uid} className="tv-co-dmrow small" data-name="group-person" style={{ cursor: "pointer" }}>
            <input type="checkbox" className="tv-co-check" checked={picked.includes(p.uid)} onChange={() => setPicked(list => (list.includes(p.uid) ? list.filter(x => x !== p.uid) : [...list, p.uid]))} />
            <Avatar name={p.name} color={p.color} size="sm" />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span className="tv-co-member-sub" style={{ display: "block" }}>{p.email}</span>
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

function NewGroup({ uid, onMade, onClose }: { uid: string; onMade: (token: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const make = async () => {
    setBusy(true);
    setError(null);
    try { onMade((await groupApi.create(uid, name.trim(), picked)).token); }
    catch (e: any) { setError(e?.message || "Couldn't make the group"); setBusy(false); }
  };
  return (
    <div className="tv-co-dmpicker" data-name="chats-new-group-form">
      <div className="tv-co-label" style={{ margin: "2px 0 6px" }}>New group</div>
      <div className="tv-co-field plain" style={{ marginBottom: 8 }}>
        <input autoFocus placeholder="Group name" value={name} maxLength={80} onChange={e => setName(e.target.value)} aria-label="Group name" data-name="group-name-input"
          onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") onClose(); }} />
      </div>
      <PeopleChooser uid={uid} picked={picked} setPicked={setPicked} />
      {error && <div className="tv-co-error">{error}</div>}
      <div className="tv-co-row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button className="tv-co-btn secondary" style={{ height: 30 }} onClick={onClose}>Cancel</button>
        <button className="tv-co-btn primary" style={{ height: 30 }} disabled={busy || !name.trim() || !picked.length} onClick={make} data-name="group-create">
          {busy ? "Making…" : `Make group${picked.length ? ` (${picked.length + 1})` : ""}`}
        </button>
      </div>
    </div>
  );
}

// One conversation: private (with one person, about a collab) or a group
function Conversation({ uid, chat, onBack }: { uid: string; chat: OpenChat; onBack: () => void }) {
  const personal = useChatTheme();
  const isGroup = !!chat.group;
  const [partner, setPartner] = useState<DmPerson | null>(null);
  const [roomName, setRoomName] = useState("");
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [gone, setGone] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [queued, setQueued] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ChatMessage | null>(null);
  const [settings, setSettings] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  // Presence: the conversation's key (for typing), the other person's last seen / typing, a group's
  const [key, setKey] = useState("");
  const [seen, setSeen] = useState<(Seen & { typing?: boolean }) | null>(null);
  const [groupTyping, setGroupTyping] = useState<string[]>([]);
  const [groupSeen, setGroupSeen] = useState<Record<string, Seen>>({});
  const chatRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // A group's own theme (its admins set it) over your personal one
  const theme = (isGroup && groupTheme(group?.theme, uid, chat.token)) || personal;

  // The conversation from the server, keeping what's still on its way from here
  const keepLocal = (server: ChatMessage[]) => (prev: ChatMessage[]) =>
    [...server, ...prev.filter(m => m.upload || (m.pending && !server.some(x => x.text === m.text && x.author === uid)))];
  const load = useCallback(() => {
    if (isGroup) {
      groupApi.get(uid, chat.token).then(d => {
        const { messages: ms, key: k, presence, typing, receipts: _r, ...info } = d as any;
        setGroup(info);
        setKey(k || "");
        setGroupTyping(typing || []);
        setGroupSeen(presence || {});
        setMessages(keepLocal(ms));
        setError(null);
        refreshDms();
      }).catch(e => { if (e?.status === 404) setGone(true); else setError(e?.message || "Couldn't load this group"); });
      return;
    }
    dmApi.thread(uid, chat.token, chat.uid!).then(d => {
      setPartner(d.partner);
      setRoomName(d.room_name);
      setKey((d as any).key || "");
      setSeen((d as any).presence || null);
      setMessages(keepLocal(d.messages));
      setError(null);
      refreshDms();
    }).catch(e => setError(e?.message || "Couldn't load this chat"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, chat.token, chat.uid, isGroup]);
  useEffect(() => {
    load();
    const t = setInterval(load, THREAD_POLL_MS);
    // A private one that arrives over an open collab's connection: right away
    const now = (e: Event) => {
      const m = (e as CustomEvent).detail?.message as ChatMessage | undefined;
      if (!isGroup && m && (m.author === chat.uid || m.to === chat.uid)) load();
    };
    window.addEventListener("tv:collab-dm", now);
    return () => { clearInterval(t); window.removeEventListener("tv:collab-dm", now); };
  }, [load, chat.uid, isGroup]);
  useLayoutEffect(() => {
    const el = chatRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const files: FileActions = {
    url: (id, download) => chatFileUrl(uid, chat.token, id, download, isGroup),
    retry: id => { const m = messages.find(x => x.id === id); if (m?.upload) sendFile(m.upload.file, m.text, id, m.attachment?.duration ?? undefined); },
    drop: id => setMessages(ms => ms.filter(x => x.id !== id)),
  };
  const patch = (id: string, u: Partial<NonNullable<ChatMessage["upload"]>>) =>
    setMessages(ms => ms.map(x => (x.id === id && x.upload ? { ...x, upload: { ...x.upload, ...u } } : x)));
  function sendFile(file: File, caption: string, retryId?: string, duration?: number) {
    const id = retryId || `u${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const audio = isChatAudio(file.name);
    const pic = isChatImage(file.name) || audio ? URL.createObjectURL(file) : undefined;
    const pending: ChatMessage = {
      id, kind: "file", text: caption.trim(), time: Date.now(), author: uid, author_name: "You", pending: true, to: chat.uid,
      attachment: { name: file.name, size: file.size, type: file.type, image: isChatImage(file.name), width: null, height: null, audio, duration: duration ?? null },
      upload: { progress: 0, preview: pic, file },
    };
    setMessages(ms => (retryId ? ms.map(x => (x.id === id ? pending : x)) : [...ms, pending]));
    uploadChatFile({ uid, token: chat.token, file, caption, to: isGroup ? null : chat.uid, group: isGroup, duration, onProgress: progress => patch(id, { progress }) })
      .then(m => { if (pic) URL.revokeObjectURL(pic); setMessages(ms => [...ms.filter(x => x.id !== id && x.id !== m.id), m]); refreshDms(); })
      .catch((e: Error) => patch(id, { error: e.message }));
  }
  const addFiles = (list: FileList | File[] | null) => {
    const fs = Array.from(list || []);
    if (!fs.length) return;
    const bad = fs.map(chatFileProblem).filter(Boolean) as string[];
    setFileError(bad.length ? bad.join(" · ") : null);
    setQueued(q => [...q, ...fs.filter(f => !chatFileProblem(f))].slice(0, 10));
  };
  useEffect(() => () => { if (key) reportTyping(key, false); }, [key]);
  const send = () => {
    const text = draft.trim();
    if (!text && !queued.length) return;
    reportTyping(key, false);
    if (queued.length) {
      queued.forEach((f, i) => sendFile(f, i === 0 ? text : ""));
      setQueued([]);
      setFileError(null);
    } else {
      const id = `c${Date.now()}`;
      setMessages(ms => [...ms, { id, kind: "text", text, time: Date.now(), author: uid, author_name: "You", pending: true, to: chat.uid }]);
      (isGroup ? groupApi.send(uid, chat.token, text) : dmApi.send(uid, chat.token, chat.uid!, text))
        .then(m => { setMessages(ms => [...ms.filter(x => x.id !== id && x.id !== m.id), m]); refreshDms(); })
        .catch(e => { setMessages(ms => ms.filter(x => x.id !== id)); setError(e?.message || "Couldn't send"); setDraft(text); });
    }
    setDraft("");
    atBottom.current = true;
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  // Your messages: ✓ sent, ✓✓ seen (private), "Seen by …" on your latest (group)
  const lastMineId = [...messages].reverse().find(m => m.author === uid && m.kind !== "system")?.id;
  const statusOf = (m: ChatMessage, latest: boolean) => {
    if (m.pending || m.upload) return <span>Sending…</span>;
    if (!isGroup) return m.read ? <span className="seen" data-name="msg-seen"><svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M1 5.5 4 8.5 10 1.5M7 8.5l8-7" /></svg> Seen</span> : <span><svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M1 5.5 4 8.5 10 1.5" /></svg></span>;
    const by = (m.read_by || []).map(u => group?.members.find(x => x.uid === u)?.name || "").filter(Boolean);
    const everyone = by.length > 0 && by.length >= (group?.members.length || 1) - 1;
    if (!by.length) return <span><svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M1 5.5 4 8.5 10 1.5" /></svg></span>;
    return <span className="seen" title={`Seen by ${by.join(", ")}`} data-name="msg-seen"><svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M1 5.5 4 8.5 10 1.5M7 8.5l8-7" /></svg>{latest ? ` Seen by ${everyone ? "everyone" : by.map(n => n.split(" ")[0]).join(", ")}` : ""}</span>;
  };
  const colorOf = (author: string | null) => author === uid ? "#2962ff"
    : (isGroup ? group?.members.find(m => m.uid === author)?.color : partner?.color) || "#787b86";

  if (gone) {
    return (
      <>
        <div className="tv-co-panel-head">
          <button className="tv-co-iconbtn small" aria-label="All chats" onClick={onBack}><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M11 4 6 9l5 5" /></svg></button>
          <div className="tv-co-panel-title"><b>Group</b></div>
        </div>
        <div className="tv-co-empty">You&apos;re not in this group any more, or it was deleted.</div>
      </>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, ...themeVars(theme) }}>
      <div className="tv-co-panel-head">
        <button className="tv-co-iconbtn small" title="All chats" aria-label="All chats" onClick={onBack} data-name="chats-back">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M11 4 6 9l5 5" /></svg>
        </button>
        {isGroup ? <GroupAvatar people={group?.members || []} size={26} /> : partner && <Avatar name={partner.name} color={partner.color} size="sm" />}
        <div className="tv-co-panel-title">
          <b>{isGroup ? group?.name || "…" : partner?.name || "…"}</b>
          <span data-name="chats-subtitle">{isGroup
            ? (groupTyping.length ? <i className="tv-co-typing-inline">{groupTyping.length === 1 ? `${groupTyping[0]} is typing…` : `${groupTyping.length} people are typing…`}</i>
              : `Group · ${group?.members.length || 0} people${Object.values(groupSeen).filter(s => s.online).length ? ` · ${Object.values(groupSeen).filter(s => s.online).length} online` : ""}`)
            : seen?.typing ? <i className="tv-co-typing-inline">typing…</i>
              : <span title={roomName}>{seenText(seen) || "Private"} · in {roomName || "…"}</span>}</span>
        </div>
        {isGroup
          ? <button className="tv-co-iconbtn small" title="Group settings" aria-label="Group settings" data-name="group-settings" onClick={() => setSettings(true)}><TVSettingsHexIcon size={22} /></button>
          : <ChatThemeMenu />}
      </div>
      {error && <div className="tv-co-banner error">{error}</div>}
      <div className="tv-co-chat" ref={chatRef} style={chatAreaStyle(theme)} data-name="chats-thread"
        onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        onDragOver={e => { if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault(); }}
        onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } }}>
        {messages.length === 0 && <div className="tv-co-empty">{isGroup ? "Say hi to the group." : `Only you and ${partner?.name || "they"} can see this chat.`}</div>}
        {messages.map((m, i) => (
          <Message key={m.id} m={m} prev={messages[i - 1]} mine={m.author === uid} color={colorOf(m.author)} onView={setViewing} files={files}
            status={m.author === uid && m.kind !== "system" ? statusOf(m, m.id === lastMineId) : undefined} />
        ))}
      </div>
      {(queued.length > 0 || fileError) && (
        <div className="tv-co-queued">
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
        <button className="tv-co-iconbtn" aria-label="Share a picture or document" title="Share a picture or document" onClick={() => fileInput.current?.click()}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M15 8.5 9 14.5a3.9 3.9 0 0 1-5.5-5.5l6.4-6.4a2.6 2.6 0 0 1 3.7 3.7L7.2 12.7a1.3 1.3 0 0 1-1.8-1.8L11 5.3" /></svg>
        </button>
        <input ref={fileInput} type="file" multiple accept={CHAT_FILE_ACCEPT} style={{ display: "none" }} aria-label="Files to share" data-name="chats-file-input"
          onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
        <textarea ref={inputRef} rows={1} value={draft} maxLength={2000} data-name="chats-input"
          placeholder={queued.length ? "Add a caption (optional)" : isGroup ? `Message ${group?.name || "the group"}` : `Message ${partner?.name || ""} privately`}
          onChange={e => { setDraft(e.target.value); reportTyping(key, !!e.target.value.trim()); const el = e.target; el.style.height = "auto"; el.style.height = `${Math.min(120, el.scrollHeight + 2)}px`; }}
          onPaste={e => { const fs = Array.from(e.clipboardData.files || []); if (fs.length) { e.preventDefault(); addFiles(fs); } }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } e.stopPropagation(); }} />
        {!draft.trim() && !queued.length
          ? <VoiceRecorder onSend={(file, secs) => sendFile(file, "", undefined, secs)} onRecording={setRecordingVoice} />
          : <button className="tv-co-iconbtn" aria-label="Send" title="Send" onClick={send}><SendIcon /></button>}
      </div>
      {viewing && <ImageViewer m={viewing} onClose={() => setViewing(null)} files={files} />}
      {settings && group && (
        <GroupSettings uid={uid} group={group} onChange={setGroup} onClose={() => { setSettings(false); load(); }}
          onLeft={() => { setSettings(false); refreshDms(); onBack(); }} />
      )}
    </div>
  );
}

// Privacy: read receipts, typing, last seen (both ways for receipts and last seen)
function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const p = usePrivacy();
  useEscapeClose(onClose);
  const row = (key: "read_receipts" | "show_typing" | "show_last_seen", label: string, hint: string) => (
    <label className="tv-co-switch-row" data-name={`privacy-${key}`}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", lineHeight: "20px" }}>{label}</span>
        <span className="tv-co-hint" style={{ display: "block", marginTop: 2 }}>{hint}</span>
      </span>
      <input type="checkbox" role="switch" className="tv-co-switch" checked={p[key]} onChange={e => setPrivacy({ [key]: e.target.checked })} />
    </label>
  );
  return createPortal(
    <div className="tv-co-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tv-co-dialog" role="dialog" aria-modal="true" aria-label="Privacy" data-name="privacy-dialog" style={{ width: 440 }}>
        <div className="tv-co-header">
          <div className="tv-co-title">Privacy</div>
          <button className="tv-co-iconbtn" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="tv-co-content">
          <div className="tv-co-hint" style={{ marginTop: 0, marginBottom: 10 }}>For collab chats, group chats and private chats.</div>
          {row("read_receipts", "Read receipts", "Others see when you've read their messages. Off: they don't, and you don't see when they've read yours")}
          {row("show_typing", "Typing indicator", "Others see when you're typing")}
          {row("show_last_seen", "Last seen and online", "Others see when you're online or were last here. Off: they don't, and you don't see theirs")}
        </div>
        <div className="tv-co-footer"><span className="tv-co-spacer" /><button className="tv-co-btn primary" onClick={onClose}>Done</button></div>
      </div>
    </div>,
    document.body,
  );
}

// A group's settings: who's in it; for its admins also the name, adding / removing people, making
// admins, the theme (colours, font, a background photo) and deleting it. Anyone can leave.
function GroupSettings({ uid, group, onChange, onClose, onLeft }: {
  uid: string; group: GroupInfo; onChange: (g: GroupInfo) => void; onClose: () => void; onLeft: () => void;
}) {
  const admin = group.role === "admin";
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<ChatTheme | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEscapeClose(onClose, !editing);
  const run = async (f: () => Promise<any>, after?: (r: any) => void) => {
    setError(null);
    try { const r = await f(); if (r && r.token) onChange(r); after?.(r); }
    catch (e: any) { setError(e?.message || "Couldn't do that"); }
  };
  const cur = groupTheme(group.theme, uid, group.token);
  const setTheme = (t: ChatTheme | null, keepImage = false) =>
    run(() => groupApi.update(uid, group.token, t ? { theme: { ...t, image: t.image?.startsWith("data:") ? t.image : undefined }, keep_image: keepImage } : { theme: null }));
  const isPreset = (p: ChatTheme) => !!group.theme && !group.theme.image_v && group.theme.name === p.name && group.theme.background === p.background;
  const custom = !!group.theme && !PRESET_THEMES.some(isPreset);
  return createPortal(
    <div className="tv-co-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tv-co-dialog" role="dialog" aria-modal="true" aria-label="Group settings" data-name="group-settings-dialog">
        <div className="tv-co-header">
          <div className="tv-co-title">{group.name}</div>
          <button className="tv-co-iconbtn" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="tv-co-content">
          {admin && (
            <div className="tv-co-section">
              <div className="tv-co-label">Name</div>
              <div className="tv-co-field plain">
                <input defaultValue={group.name} key={group.name} maxLength={80} aria-label="Group name" data-name="group-rename"
                  onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== group.name) run(() => groupApi.update(uid, group.token, { name: v })); else e.target.value = group.name; }} />
              </div>
            </div>
          )}
          <div className="tv-co-section">
            <div className="tv-co-row" style={{ marginBottom: 8 }}>
              <div className="tv-co-label" style={{ margin: 0, flex: 1 }}>People · {group.members.length}</div>
              {admin && <button className="tv-co-link" onClick={() => setAdding(a => !a)} data-name="group-add-people">{adding ? "Cancel" : "Add people"}</button>}
            </div>
            {adding && (
              <div style={{ marginBottom: 10, padding: 10, borderRadius: 6, background: "var(--tv-co-hover)" }}>
                <PeopleChooser uid={uid} exclude={group.members.map(m => m.uid)} picked={picked} setPicked={setPicked} />
                <div className="tv-co-row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                  <button className="tv-co-btn primary" style={{ height: 30 }} disabled={!picked.length} data-name="group-add-confirm"
                    onClick={() => run(() => groupApi.add(uid, group.token, picked), () => { setPicked([]); setAdding(false); })}>Add {picked.length || ""}</button>
                </div>
              </div>
            )}
            {group.members.map(m => (
              <div key={m.uid} className="tv-co-member" data-name="group-member">
                <Avatar name={m.name} color={m.color} />
                <div className="tv-co-member-info">
                  <div className="tv-co-member-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}{m.uid === uid ? " (you)" : ""}</span>
                    {m.role === "admin" && <span className="tv-co-rolebadge small" style={{ color: "#f5a000", borderColor: "#f5a000", background: "#f5a00014" }}>Admin</span>}
                  </div>
                  <div className="tv-co-member-sub">{m.email}</div>
                </div>
                {admin && m.uid !== uid && <>
                  <button className="tv-co-btn secondary" style={{ height: 28, fontSize: 12 }} data-name="group-toggle-admin"
                    onClick={() => run(() => groupApi.setRole(uid, group.token, m.uid, m.role === "admin" ? "member" : "admin"))}>
                    {m.role === "admin" ? "Remove admin" : "Make admin"}
                  </button>
                  <button className="tv-co-iconbtn small" title={`Remove ${m.name}`} aria-label={`Remove ${m.name}`} data-name="group-remove-member"
                    onClick={() => run(() => groupApi.removeMember(uid, group.token, m.uid))}><CloseIcon size={14} /></button>
                </>}
              </div>
            ))}
          </div>
          {admin && (
            <div className="tv-co-section" data-name="group-theme">
              <div className="tv-co-label">Theme</div>
              <div className="tv-co-hint" style={{ marginTop: 0, marginBottom: 8 }}>How this group&apos;s chat looks for everyone in it: colours, font, a background photo.</div>
              <div className="tv-co-theme-grid">
                {PRESET_THEMES.map(p => {
                  const on = p.id === "default" ? !group.theme : isPreset(p);
                  return (
                    <button key={p.id} className={`tv-co-theme-pick${on ? " on" : ""}`} title={p.name} data-name="group-theme-preset" onClick={() => setTheme(p.id === "default" ? null : p)}>
                      <span className="tv-co-theme-swatch" style={{ ...chatAreaStyle(p), background: p.background || "var(--tv-color-pane-bg)" }}>
                        <i style={{ background: p.bubble || "var(--tv-co-bubble)" }} /><i style={{ background: p.bubbleMine || "var(--tv-co-bubble-mine)" }} />
                      </span>
                      <span>{p.name}</span>
                    </button>
                  );
                })}
                <button className={`tv-co-theme-pick${custom ? " on" : ""}`} data-name="group-theme-custom" title="Your own: colours, font and a background photo"
                  onClick={() => setEditing(custom && cur ? cur : { id: "group", name: "Our theme", background: "#16213a", imageDim: 45, text: "#f2f4f8", bubble: "#24314f", bubbleMine: "#3554a0", accent: "#7aa7ff", font: "default", fontSize: 14 })}>
                  <span className="tv-co-theme-swatch" style={custom && cur ? { ...chatAreaStyle(cur), background: cur.image ? undefined : cur.background } : { display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
                    {custom && cur ? <><i style={{ background: cur.bubble }} /><i style={{ background: cur.bubbleMine }} /></> : "+"}
                  </span>
                  <span>{custom ? group.theme!.name : "Custom…"}</span>
                </button>
              </div>
            </div>
          )}
          {!admin && group.theme && <div className="tv-co-hint">Theme: {group.theme.name} (the group&apos;s admins choose it)</div>}
          {confirmDelete && (
            <div className="tv-co-section" style={{ padding: 12, borderRadius: 6, background: "var(--tv-co-hover)" }} data-name="group-delete-confirm">
              Delete <b>{group.name}</b> for everyone, with all its messages and files?
              <div className="tv-co-row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                <button className="tv-co-btn secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button className="tv-co-btn danger" data-name="group-delete-yes" onClick={() => run(() => groupApi.remove(uid, group.token), onLeft)}>Delete group</button>
              </div>
            </div>
          )}
          {error && <div className="tv-co-error">{error}</div>}
        </div>
        <div className="tv-co-footer">
          <button className="tv-co-btn danger" data-name="group-leave" onClick={() => run(() => groupApi.removeMember(uid, group.token, uid), onLeft)}>Leave group</button>
          {admin && <button className="tv-co-btn danger" data-name="group-delete" onClick={() => setConfirmDelete(true)}>Delete group</button>}
          <span className="tv-co-spacer" />
          <button className="tv-co-btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
      {editing && (
        <ThemeEditor initial={editing} isNew={false} title="Theme for this group" onClose={() => setEditing(null)}
          onSave={t => setTheme(t, !!t.image && !t.image.startsWith("data:"))} />
      )}
    </div>,
    document.body,
  );
}

// A collab chart, on this side: the WebSocket to the backend's collab room, what it says about
// the room (who's in it, their access, the chat, everyone's cursors and paper trades), and the
// group voice call (WebRTC between the browsers, signalled over the same socket).
//
// The shared chart itself (symbol, interval, indicators, drawings) is applied by the page and
// the drawing layer, which listen to this session's chart events (onChart) and send their own
// changes through it.

import { useSyncExternalStore } from "react";
import { sessionKey } from "@/lib/backend";

export const BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const WS_BASE = BACKEND.replace(/^http/, "ws");

export type Role = "owner" | "editor" | "viewer";
export type LinkAccess = "restricted" | "view" | "edit";

// What someone may do besides watching and chatting (the owner sets these; the owner can do all)
export interface Perms { edit: boolean; replay: boolean; invite: boolean; voice: boolean; alert: boolean; pine: boolean }
// mic: whether the owner lets this person use their mic (perms.voice also needs everyone's mic on)
export interface Member { uid: string; name: string; email: string; role: Role; color: string; pending: boolean; perms: Perms; mic: boolean }
export interface Person { uid: string; name: string; email: string; color: string }
// Someone without access who asked to be let in
export interface JoinRequest extends Person { status: "pending" | "declined"; time: number }
// "chart": the whole chart is shared; "pine": only a Pine script, edited together
export type RoomKind = "chart" | "pine";
export interface RoomInfo {
  token: string; name: string; kind: RoomKind; link_access: LinkAccess; active: boolean; owner: string;
  symbol: string; interval: string; created_at: string; role: Role | null; perms: Perms | null; members: Member[];
  // The owner's settings: people without access may ask to join; everyone's mic on or off
  allow_requests: boolean; allow_voice: boolean;
  // Waiting requests (for those who can let people in), people kicked out (for the owner)
  requests: JoinRequest[]; kicked: Person[];
}
// What someone who opened a link without access is told
export interface NoAccess {
  error: string; room_name: string; owner_name: string; can_request: boolean;
  request: "pending" | "declined" | null; kicked?: boolean; not_invited?: boolean;
}
// Something worth a sound and a notification: people coming and going (you too), requests to
// join, and your access changing
export type CollabNotice =
  | { kind: "self-joined" | "self-left"; room: string }
  | { kind: "joined" | "left"; name: string; color: string }
  | { kind: "request"; request: JoinRequest; room: string; token: string }
  | { kind: "removed"; kicked: boolean }
  | { kind: "ended" }
  | { kind: "mic-off" | "mic-on" | "edit-on" | "edit-off" };
export interface Peer { id: string; uid: string; name: string; color: string; role: Role; perms: Perms; voice: boolean; muted: boolean }
// The replay everyone follows: who drives it (a connection; null once they've left) and where it is
export interface SharedReplay { driver: string | null; driver_uid: string; driver_name: string; time: number; playing: boolean; speed: number }
// An image or document shared in the chat
export interface ChatAttachment { name: string; size: number; type: string; image: boolean; width: number | null; height: number | null }
export interface ChatMessage {
  id: number | string; kind: "text" | "system" | "file"; text: string; time: number; author: string | null; author_name: string | null; pending?: boolean;
  attachment?: ChatAttachment;
  // A file still on its way up from here: how far (0..1), the picture to show meanwhile, or why it failed
  upload?: { progress: number; preview?: string; error?: string; file: File };
}

// What can be shared in the chat (the backend checks again): pictures, and documents
export const CHAT_FILE_MAX_BYTES = 20 * 1024 * 1024;
const CHAT_IMAGE_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const CHAT_DOC_EXT = [".pdf", ".txt", ".csv", ".json", ".md", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".rtf", ".zip", ".pine", ".py", ".mq5", ".mqh", ".mq4"];
export const CHAT_FILE_ACCEPT = [...CHAT_IMAGE_EXT, ...CHAT_DOC_EXT].join(",");
const extOf = (name: string) => { const i = name.lastIndexOf("."); return i < 0 ? "" : name.slice(i).toLowerCase(); };
export function chatFileProblem(file: File): string | null {
  const ext = extOf(file.name);
  if (!CHAT_IMAGE_EXT.includes(ext) && !CHAT_DOC_EXT.includes(ext)) return `${file.name}: that kind of file can't be shared here`;
  if (file.size > CHAT_FILE_MAX_BYTES) return `${file.name} is over ${CHAT_FILE_MAX_BYTES / (1024 * 1024)} MB`;
  return null;
}
export interface Cursor { id: string; uid: string; symbol: string; time: number; price: number; at: number }
export interface TradeLine { side: "buy" | "sell"; qty: number; price: number; kind: "position" | "limit" | "stop" }
export interface TradeSnap { symbol: string; name: string; color: string; lines: TradeLine[] }
// The Pine script on the shared chart: its code and the settings it runs with
export interface SharedPine { code: string; scriptName: string; overrides: Record<string, any>; colors: Record<string, string>; capital: number | null }
export interface SharedChart { symbol: string; interval: string; indicators: any[]; drawings: any[]; pine: SharedPine | null }
// An alert shared with everyone in the collab (checked by every open chart; fires once for all)
export interface SharedAlert {
  id: string; symbol: string; condition: "Crossing" | "Crossing Up" | "Crossing Down" | "Greater Than" | "Less Than"; value: number;
  trigger: "Once only" | "Every time"; expiration: number | null; message: string;
  status: "active" | "triggered" | "expired" | "stopped"; created_at: number; last_triggered_at: number | null;
  created_by: string; created_by_name: string; color: string;
}

export type Status = "idle" | "connecting" | "live" | "reconnecting" | "error" | "ended";

export interface CollabState {
  status: Status;
  error: string | null;
  token: string | null;
  kind: RoomKind | null;
  room: RoomInfo | null;
  you: string | null;            // this connection's id in the room
  uid: string | null;
  peers: Peer[];
  messages: ChatMessage[];
  unread: number;
  chatOpen: boolean;
  cursors: Record<string, Cursor>;
  trades: Record<string, TradeSnap>;
  // listenOnly: in the call without a mic (the owner hasn't let them talk)
  voice: { joined: boolean; joining: boolean; muted: boolean; listenOnly: boolean; error: string | null; speaking: Record<string, boolean> };
  replay: SharedReplay | null;
  // This person stepped out of the shared replay to replay on their own
  replayDetached: boolean;
  alerts: SharedAlert[];
}

const INITIAL: CollabState = {
  status: "idle", error: null, token: null, kind: null, room: null, you: null, uid: null, peers: [], messages: [], unread: 0,
  chatOpen: false, cursors: {}, trades: {}, voice: { joined: false, joining: false, muted: false, listenOnly: false, error: null, speaking: {} },
  replay: null, replayDetached: false, alerts: [],
};

// The live-edited Pine code: the room's document, others' edits and cursors (see pineDoc.ts)
export type PineDocEvent =
  | { type: "state"; state: string }
  | { type: "update"; u: string }
  | { type: "cursor"; id: string; uid: string; anchor: any; head: any }
  | { type: "denied"; state: string; error: string }
  | { type: "left"; id: string };

export type ChartEvent =
  | { type: "init"; chart: SharedChart }
  | { type: "chart"; symbol: string; interval: string; drawings: any[]; by: string }
  | { type: "indicators"; indicators: any[]; by: string }
  | { type: "drawings.upsert"; symbol: string; drawings: any[]; by: string }
  | { type: "drawings.delete"; symbol: string; ids: string[]; by: string }
  | { type: "drawings.replace"; symbol: string; drawings: any[]; by: string }
  | { type: "pine"; pine: SharedPine | null; by: string };

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ...(process.env.NEXT_PUBLIC_TURN_URL ? [{
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME || "",
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "",
  }] : []),
];

// The REST side of collab (create, open, invite, members), with this browser's session key
export async function collabApi<T = any>(uid: string, path: string, init?: { method?: string; body?: any }): Promise<T> {
  const url = `${BACKEND}/api/users/collab/${encodeURIComponent(uid)}/${path}${path.includes("?") ? "&" : "?"}session_key=${encodeURIComponent(sessionKey())}`;
  const res = await fetch(url, {
    method: init?.method || "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status, data });
  return data as T;
}

export function collabLink(token: string): string {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("collab", token);
  return u.toString();
}

class CollabSession {
  private state: CollabState = INITIAL;
  private subs = new Set<() => void>();
  private chartSubs = new Set<(e: ChartEvent) => void>();
  private pineDocSubs = new Set<(e: PineDocEvent) => void>();
  private noticeSubs = new Set<(n: CollabNotice) => void>();
  // "You joined" is said once per join, not again after a reconnect
  private announced = false;
  private ws: WebSocket | null = null;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private wanted = false;
  private outbox: any[] = [];
  // Voice
  private localStream: MediaStream | null = null;
  private pcs = new Map<string, RTCPeerConnection>();
  private audios = new Map<string, HTMLAudioElement>();
  private meters = new Map<string, { analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }>();
  private audioCtx: AudioContext | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;

  get = () => this.state;
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  onChart(f: (e: ChartEvent) => void) { this.chartSubs.add(f); return () => { this.chartSubs.delete(f); }; }
  onPineDoc(f: (e: PineDocEvent) => void) { this.pineDocSubs.add(f); return () => { this.pineDocSubs.delete(f); }; }
  private emitPineDoc(e: PineDocEvent) { this.pineDocSubs.forEach(f => f(e)); }
  onNotice(f: (n: CollabNotice) => void) { this.noticeSubs.add(f); return () => { this.noticeSubs.delete(f); }; }
  private notice(n: CollabNotice) { this.noticeSubs.forEach(f => f(n)); }

  private set(patch: Partial<CollabState>) {
    this.state = { ...this.state, ...patch };
    this.subs.forEach(f => f());
  }
  private emitChart(e: ChartEvent) { this.chartSubs.forEach(f => f(e)); }
  // This person's own row in the room (the server doesn't echo their own changes back)
  private patchSelf(patch: Partial<Peer>) {
    this.set({ peers: this.state.peers.map(p => (p.id === this.state.you ? { ...p, ...patch } : p)) });
  }

  get active() { return this.state.status !== "idle" && this.state.status !== "ended" && this.state.status !== "error"; }
  // A collab that shares the chart (not just a Pine script)
  get chartActive() { return this.active && this.state.kind !== "pine"; }
  get live() { return this.state.status === "live"; }
  get canEdit() { return !!this.state.room?.perms?.edit; }
  get canReplay() { return !!this.state.room?.perms?.replay; }
  get canVoice() { return !!this.state.room?.perms?.voice; }
  get canAlert() { return !!this.state.room?.perms?.alert; }
  get canPine() { return !!this.state.room?.perms?.pine; }
  myRole(): Role | null { return this.state.room?.role ?? null; }

  // ---- connection

  join(token: string, uid: string, kind: RoomKind = "chart") {
    if (this.state.token === token && this.active) return;
    this.leave();
    this.wanted = true;
    this.retry = 0;
    this.announced = false;
    this.set({ ...INITIAL, status: "connecting", token, uid, kind });
    this.connect();
  }

  leave() {
    const { status, room } = this.state;
    if (room && (status === "live" || status === "reconnecting")) this.notice({ kind: "self-left", room: room.name });
    this.wanted = false;
    this.leaveVoice();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
    const ws = this.ws;
    this.ws = null;
    this.outbox = [];
    if (ws) { ws.onclose = null; ws.close(); }
    if (this.state.status !== "idle") this.set({ ...INITIAL });
  }

  private connect() {
    const { token, uid } = this.state;
    if (!token || !uid) return;
    const ws = new WebSocket(`${WS_BASE}/ws/collab/${encodeURIComponent(token)}/?uid=${encodeURIComponent(uid)}&session_key=${encodeURIComponent(sessionKey())}`);
    this.ws = ws;
    ws.onmessage = (e) => { try { this.handle(JSON.parse(e.data)); } catch { /* malformed */ } };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      // The voice call can't survive the socket that signals it
      this.leaveVoice();
      if (e.code === 4403) {
        this.wanted = false;
        // "removed" already said why
        if (this.state.status !== "error") this.set({ status: "error", error: "You don't have access to this collab any more." });
        return;
      }
      if (e.code === 4410) { this.wanted = false; this.set({ status: "ended", error: "The owner ended this collab." }); return; }
      if (!this.wanted) return;
      this.set({ status: "reconnecting" });
      const delay = Math.min(15000, 1000 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else if (msg.type !== "cursor" && msg.type !== "rtc") this.outbox.push(msg);
  }

  private handle(msg: any) {
    switch (msg.type) {
      case "init": {
        this.retry = 0;
        this.set({
          status: "live", error: null, you: msg.you, room: msg.room, kind: msg.room?.kind || "chart", peers: msg.peers || [],
          messages: msg.messages || [], trades: msg.trades || {}, cursors: {}, replay: msg.replay || null,
          alerts: msg.alerts || [],
        });
        if (msg.room?.kind !== "pine") this.emitChart({ type: "init", chart: msg.chart });
        if (typeof msg.pinedoc === "string") this.emitPineDoc({ type: "state", state: msg.pinedoc });
        const pending = this.outbox;
        this.outbox = [];
        pending.forEach(m => this.send(m));
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.send({ type: "ping", t: Date.now() }), 25000);
        if (!this.announced && msg.room) {
          this.announced = true;
          this.notice({ kind: "self-joined", room: msg.room.name });
        }
        break;
      }
      case "room": {
        const before = this.state.room?.perms;
        const after: Perms | null = msg.room?.perms || null;
        this.set({ room: msg.room, peers: msg.peers || this.state.peers });
        this.applyPeerMutes();
        if (before && after && msg.room.role !== "owner") {
          if (before.voice !== after.voice) this.notice({ kind: after.voice ? "mic-on" : "mic-off" });
          const editKey = msg.room.kind === "pine" ? "pine" : "edit";
          if (before[editKey] !== after[editKey]) this.notice({ kind: after[editKey] ? "edit-on" : "edit-off" });
        }
        break;
      }
      case "join.request":
        if (this.state.room) this.notice({ kind: "request", request: msg.request, room: this.state.room.name, token: this.state.room.token });
        break;
      case "peer.joined": {
        const p: Peer = msg.peer;
        // Someone's second tab isn't a new arrival, nor is this person's own
        const fresh = p.uid !== this.state.uid && !this.state.peers.some(x => x.uid === p.uid);
        this.set({ peers: [...this.state.peers.filter(x => x.id !== p.id), p] });
        if (fresh) this.notice({ kind: "joined", name: p.name, color: p.color });
        break;
      }
      case "peer.left": {
        const gone = this.state.peers.find(p => p.id === msg.id);
        if (gone && gone.uid !== this.state.uid && !this.state.peers.some(p => p.id !== msg.id && p.uid === gone.uid)) {
          this.notice({ kind: "left", name: gone.name, color: gone.color });
        }
        const cursors = { ...this.state.cursors };
        delete cursors[msg.id];
        const peers = this.state.peers.filter(p => p.id !== msg.id);
        const trades = { ...this.state.trades };
        if (!peers.some(p => p.uid === msg.uid)) delete trades[msg.uid];
        this.set({ peers, cursors, trades });
        this.dropPeerAudio(msg.id);
        this.emitPineDoc({ type: "left", id: msg.id });
        break;
      }
      case "peer.updated":
        this.set({ peers: this.state.peers.map(p => (p.id === msg.peer.id ? msg.peer : p)) });
        if (!msg.peer.voice) this.dropPeerAudio(msg.peer.id);
        this.applyPeerMutes();
        break;
      case "chat": {
        const m: ChatMessage = msg.message;
        const mine = m.author === this.state.uid;
        // A file of mine that's arrived: it replaces its uploading copy
        const sameUpload = (x: ChatMessage) => mine && m.kind === "file" && !!x.upload && !x.upload.error
          && x.attachment?.name === m.attachment?.name && x.attachment?.size === m.attachment?.size;
        const messages = msg.client_id
          ? [...this.state.messages.filter(x => x.id !== msg.client_id), m]
          : [...this.state.messages.filter(x => x.id !== m.id && !sameUpload(x)), m];
        this.set({ messages, unread: this.state.chatOpen || mine || m.kind === "system" ? this.state.unread : this.state.unread + 1 });
        break;
      }
      case "cursor":
        this.set({ cursors: { ...this.state.cursors, [msg.id]: { id: msg.id, uid: msg.uid, symbol: msg.symbol, time: msg.time, price: msg.price, at: Date.now() } } });
        break;
      case "trades":
        this.set({ trades: { ...this.state.trades, [msg.uid]: msg.trades } });
        break;
      case "rtc":
        this.onSignal(msg.from, msg.data);
        break;
      case "replay":
        // A replay that ended: the next one is followed again
        this.set({ replay: msg.replay, replayDetached: msg.replay ? this.state.replayDetached : false });
        break;
      case "alerts":
        this.set({ alerts: msg.alerts || [] });
        break;
      case "alert.fired":
        window.dispatchEvent(new CustomEvent("tv:collab-alert-fired", { detail: { alert: msg.alert, price: msg.price, time: msg.time } }));
        break;
      case "pinedoc.update":
        this.emitPineDoc({ type: "update", u: msg.u });
        break;
      case "pinedoc.cursor":
        this.emitPineDoc({ type: "cursor", id: msg.id, uid: msg.uid, anchor: msg.anchor, head: msg.head });
        break;
      case "pinedoc.reset":
        this.emitPineDoc({ type: "state", state: msg.state });
        break;
      case "pinedoc.denied":
        this.emitPineDoc({ type: "denied", state: msg.state, error: msg.error });
        break;
      case "voice.revoked":
        // The owner turned this person's mic off: they stay in the call, listening
        this.localStream?.getAudioTracks().forEach(t => { t.enabled = false; });
        if (this.state.voice.joined) this.patchSelf({ muted: true });
        this.set({ voice: { ...this.state.voice, muted: this.state.voice.joined, error: msg.error || "Your mic was turned off" } });
        break;
      case "removed":
        this.wanted = false;
        this.notice({ kind: "removed", kicked: !!msg.kicked });
        this.set({ status: "error", error: msg.kicked ? "The owner kicked you out of this collab." : "You were removed from this collab." });
        break;
      case "ended":
        this.wanted = false;
        this.notice({ kind: "ended" });
        this.set({ status: "ended", error: "The owner ended this collab." });
        break;
      case "error":
        this.set({ error: msg.error });
        break;
      case "chart": case "indicators": case "drawings.upsert": case "drawings.delete": case "drawings.replace": case "pine":
        if (this.state.kind !== "pine") this.emitChart(msg);
        break;
    }
  }

  // ---- the shared chart

  sendChart(symbol: string, interval: string) { if (this.canEdit) this.send({ type: "chart", symbol, interval }); }
  sendIndicators(indicators: any[]) { if (this.canEdit) this.send({ type: "indicators", indicators }); }
  sendDrawingsUpsert(symbol: string, drawings: any[]) { if (this.canEdit && drawings.length) this.send({ type: "drawings.upsert", symbol, drawings }); }
  sendDrawingsDelete(symbol: string, ids: string[]) { if (this.canEdit && ids.length) this.send({ type: "drawings.delete", symbol, ids }); }
  sendDrawingsReplace(symbol: string, drawings: any[]) { if (this.canEdit) this.send({ type: "drawings.replace", symbol, drawings }); }
  sendCursor(symbol: string, time: number | null, price: number | null) { if (this.chartActive) this.send({ type: "cursor", symbol, time, price }); }
  sendTrades(symbol: string, lines: TradeLine[]) { if (this.chartActive) this.send({ type: "trades", symbol, lines }); }

  sendPine(pine: SharedPine | null) { if (this.canEdit) this.send({ type: "pine", pine }); }
  sendPineDocUpdate(u: string) { if (this.canPine) this.send({ type: "pinedoc.update", u }); }
  seedPineDoc(text: string) { if (this.canPine) this.send({ type: "pinedoc.seed", text }); }
  sendPineCursor(anchor: any, head: any) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "pinedoc.cursor", anchor, head })); }
  peerById(id: string) { return this.state.peers.find(p => p.id === id); }

  // ---- shared alerts

  addSharedAlert(alert: Pick<SharedAlert, "symbol" | "condition" | "value" | "trigger" | "expiration" | "message">) {
    if (this.canAlert) this.send({ type: "alert.add", alert });
  }
  removeSharedAlert(id: string) { this.send({ type: "alert.remove", id }); }
  setSharedAlertStatus(id: string, status: "active" | "stopped") { this.send({ type: "alert.update", id, status }); }
  reportAlertFired(id: string, price: number) { this.send({ type: "alert.fired", id, price }); }

  // ---- the shared replay (driven by one person, followed by everyone else)

  sendReplay(time: number, playing: boolean, speed: number, take = false) {
    if (!this.canReplay || !this.state.you || !this.chartActive) return;
    const me = this.state.peers.find(p => p.id === this.state.you);
    this.set({
      replay: { driver: this.state.you, driver_uid: this.state.uid || "", driver_name: me?.name || "You", time, playing, speed },
      replayDetached: false,
    });
    this.send({ type: "replay", action: "update", time, playing, speed, take });
  }
  stopSharedReplay() {
    if (!this.canReplay) return;
    this.set({ replay: null, replayDetached: false });
    this.send({ type: "replay", action: "stop" });
  }
  setReplayDetached(detached: boolean) { this.set({ replayDetached: detached }); }

  // ---- chat

  sendChat(text: string) {
    const t = text.trim();
    if (!t) return;
    const clientId = `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const me = this.state.room?.members.find(m => m.uid === this.state.uid);
    this.set({ messages: [...this.state.messages, { id: clientId, kind: "text", text: t, time: Date.now(), author: this.state.uid, author_name: me?.name || "You", pending: true }] });
    this.send({ type: "chat", text: t, client_id: clientId });
  }
  // Shares a picture or document (with an optional caption): shown at once with its progress,
  // replaced by the real message when it's arrived
  sendFile(file: File, caption = "", retryId?: string) {
    const { uid, token } = this.state;
    if (!uid || !token) return;
    const id = retryId || `u${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const ext = extOf(file.name);
    const image = CHAT_IMAGE_EXT.includes(ext);
    const old = this.state.messages.find(x => x.id === id);
    const preview = old?.upload?.preview || (image ? URL.createObjectURL(file) : undefined);
    const me = this.state.room?.members.find(m => m.uid === uid);
    const pending: ChatMessage = {
      id, kind: "file", text: caption.trim(), time: Date.now(), author: uid, author_name: me?.name || "You", pending: true,
      attachment: { name: file.name, size: file.size, type: file.type, image, width: null, height: null },
      upload: { progress: 0, preview, file },
    };
    const problem = chatFileProblem(file);
    if (problem) pending.upload!.error = problem;
    this.set({ messages: retryId ? this.state.messages.map(x => (x.id === id ? pending : x)) : [...this.state.messages, pending] });
    if (problem) return;
    const patch = (u: Partial<NonNullable<ChatMessage["upload"]>>) =>
      this.set({ messages: this.state.messages.map(x => (x.id === id && x.upload ? { ...x, upload: { ...x.upload, ...u } } : x)) });
    const form = new FormData();
    form.append("file", file, file.name);
    if (caption.trim()) form.append("text", caption.trim());
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BACKEND}/api/users/collab/${encodeURIComponent(uid)}/room/${encodeURIComponent(token)}/upload/?session_key=${encodeURIComponent(sessionKey())}`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) patch({ progress: e.loaded / e.total }); };
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && data?.id) {
        if (preview) URL.revokeObjectURL(preview);
        const has = this.state.messages.some(x => x.id === data.id);
        this.set({ messages: has ? this.state.messages.filter(x => x.id !== id) : this.state.messages.map(x => (x.id === id ? data : x)) });
      } else {
        patch({ error: data?.error || `Couldn't share ${file.name}` });
      }
    };
    xhr.onerror = () => patch({ error: `Couldn't share ${file.name}: no connection` });
    xhr.send(form);
  }
  // A file that failed: try again, or take it away
  retryFile(id: string) {
    const m = this.state.messages.find(x => x.id === id);
    if (m?.upload) this.sendFile(m.upload.file, m.text, id);
  }
  dropFile(id: string) {
    const m = this.state.messages.find(x => x.id === id);
    if (m?.upload?.preview) URL.revokeObjectURL(m.upload.preview);
    this.set({ messages: this.state.messages.filter(x => x.id !== id) });
  }
  // Where a shared file is fetched from (people in the collab only)
  fileUrl(messageId: number | string, download = false): string {
    const { uid, token } = this.state;
    if (!uid || !token) return "";
    return `${BACKEND}/api/users/collab/${encodeURIComponent(uid)}/room/${encodeURIComponent(token)}/file/${messageId}/?session_key=${encodeURIComponent(sessionKey())}${download ? "&download=1" : ""}`;
  }
  setChatOpen(open: boolean) { this.set({ chatOpen: open, unread: open ? 0 : this.state.unread }); }
  setRoom(room: RoomInfo) { this.set({ room }); }

  // ---- voice (a full mesh: each person in the call connects to each other one)

  // Without mic permission this joins to listen only
  async joinVoice() {
    if (this.state.voice.joined || this.state.voice.joining || !this.live) return;
    const listenOnly = !this.canVoice;
    this.set({ voice: { ...this.state.voice, joining: true, error: null } });
    if (!listenOnly) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (err: any) {
        const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
        this.set({ voice: { ...this.state.voice, joining: false, error: denied ? "Microphone access was blocked. Allow it in the browser's site settings." : "No microphone was found." } });
        return;
      }
    }
    this.set({ voice: { ...this.state.voice, joined: true, joining: false, muted: listenOnly, listenOnly, error: null } });
    this.patchSelf({ voice: true, muted: listenOnly });
    if (this.localStream) this.addMeter("me", this.localStream);
    this.send({ type: "voice", voice: true, muted: listenOnly });
    // The one who joins calls everyone already in the call (they answer), so two people never
    // call each other at the same time
    for (const p of this.state.peers) {
      if (p.id !== this.state.you && p.voice) this.call(p.id);
    }
  }

  leaveVoice() {
    const wasIn = this.state.voice.joined;
    this.pcs.forEach(pc => pc.close());
    this.pcs.clear();
    this.audios.forEach(a => { a.srcObject = null; a.remove(); });
    this.audios.clear();
    this.meters.clear();
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    if (this.meterTimer) { clearInterval(this.meterTimer); this.meterTimer = null; }
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    if (wasIn || this.state.voice.joining) {
      this.set({ voice: { joined: false, joining: false, muted: false, listenOnly: false, error: null, speaking: {} } });
      this.patchSelf({ voice: false, muted: false });
      this.send({ type: "voice", voice: false, muted: false });
    }
  }

  toggleMute() {
    const muted = !this.state.voice.muted;
    if (!muted && !this.canVoice) {
      this.set({ voice: { ...this.state.voice, error: "The owner has turned your mic off" } });
      return;
    }
    // Listening without a mic, and now allowed to talk: rejoin with the mic
    if (!this.localStream) {
      if (this.state.voice.joined) { this.leaveVoice(); this.joinVoice(); }
      return;
    }
    this.localStream.getAudioTracks().forEach(t => { t.enabled = !muted; });
    this.set({ voice: { ...this.state.voice, muted } });
    this.patchSelf({ muted });
    this.send({ type: "voice", voice: true, muted });
  }

  private peerConnection(peerId: string): RTCPeerConnection {
    let pc = this.pcs.get(peerId);
    if (pc) return pc;
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pcs.set(peerId, pc);
    if (this.localStream) this.localStream.getTracks().forEach(t => pc!.addTrack(t, this.localStream!));
    else pc.addTransceiver("audio", { direction: "recvonly" });   // listening only
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ type: "rtc", to: peerId, data: { candidate: e.candidate.toJSON() } }); };
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      let audio = this.audios.get(peerId);
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.style.display = "none";
        document.body.appendChild(audio);
        this.audios.set(peerId, audio);
      }
      audio.srcObject = stream;
      audio.play().catch(() => {});
      this.addMeter(peerId, stream);
      this.applyPeerMutes();
    };
    pc.onconnectionstatechange = () => {
      if (pc!.connectionState === "failed" || pc!.connectionState === "closed") this.dropPeerAudio(peerId);
    };
    return pc;
  }

  private async call(peerId: string) {
    const pc = this.peerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ type: "rtc", to: peerId, data: { sdp: pc.localDescription } });
  }

  // Whoever the owner hasn't let talk isn't played here, even if their browser keeps sending
  private applyPeerMutes() {
    this.audios.forEach((audio, id) => {
      const p = this.peerById(id);
      audio.muted = !!p && !p.perms.voice;
    });
  }

  private async onSignal(from: string, data: any) {
    if (!this.state.voice.joined) return;
    try {
      const pc = this.peerConnection(from);
      if (data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.send({ type: "rtc", to: from, data: { sdp: pc.localDescription } });
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(data.candidate).catch(() => {});
      }
    } catch { /* a broken negotiation leaves that one person unheard; rejoining the call retries */ }
  }

  private dropPeerAudio(peerId: string) {
    this.pcs.get(peerId)?.close();
    this.pcs.delete(peerId);
    const a = this.audios.get(peerId);
    if (a) { a.srcObject = null; a.remove(); this.audios.delete(peerId); }
    this.meters.delete(peerId);
    if (this.state.voice.speaking[peerId]) {
      const speaking = { ...this.state.voice.speaking };
      delete speaking[peerId];
      this.set({ voice: { ...this.state.voice, speaking } });
    }
  }

  // Who's talking: the level of each voice, checked a few times a second
  private addMeter(id: string, stream: MediaStream) {
    try {
      this.audioCtx = this.audioCtx || new AudioContext();
      const src = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      this.meters.set(id, { analyser, data: new Uint8Array(new ArrayBuffer(analyser.fftSize)) });
    } catch { return; }
    if (this.meterTimer) return;
    this.meterTimer = setInterval(() => {
      const speaking: Record<string, boolean> = {};
      this.meters.forEach((m, key) => {
        m.analyser.getByteTimeDomainData(m.data);
        let sum = 0;
        for (let i = 0; i < m.data.length; i++) { const v = (m.data[i] - 128) / 128; sum += v * v; }
        speaking[key] = Math.sqrt(sum / m.data.length) > 0.04 && !(key === "me" && this.state.voice.muted);
      });
      const prev = this.state.voice.speaking;
      const changed = Object.keys({ ...prev, ...speaking }).some(k => !!prev[k] !== !!speaking[k]);
      if (changed) this.set({ voice: { ...this.state.voice, speaking } });
    }, 200);
  }
}

export const collab = new CollabSession();
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as any).__collab = collab;

export function useCollab(): CollabState {
  return useSyncExternalStore(collab.subscribe, collab.get, () => INITIAL);
}

// The collab's shared alerts (re-renders only when they change)
const NO_ALERTS: SharedAlert[] = [];
export function useCollabAlerts(): SharedAlert[] {
  return useSyncExternalStore(collab.subscribe, () => (collab.active ? collab.get().alerts : NO_ALERTS), () => NO_ALERTS);
}

// Whether a collab that shares the chart is open (a Pine-script collab leaves the chart alone)
export function useCollabChartActive(): boolean {
  return useSyncExternalStore(collab.subscribe, () => collab.chartActive, () => false);
}

// Just whether a collab chart is open (re-renders only when that changes)
export function useCollabActive(): boolean {
  return useSyncExternalStore(collab.subscribe, () => collab.active, () => false);
}

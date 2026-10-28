// Trade copying (backend core/copy_api.py; the copier service runs a terminal per follower):
// channels you run and their signals, channels you follow and your copying settings.

import { BACKEND } from "../lib/collab/session";
import { sessionKey } from "@/lib/backend";

export interface CopierStatus { running: boolean; terminals: number; connected: number }
export interface Channel {
  id: number; name: string; description: string; code: string; default_risk: number; max_slippage: number; mirror_mt5: boolean;
  active: boolean; owner: string; subscribers: number; copying: number; created_at: number;
  signals?: Signal[]; followers?: Follower[]; connections?: Connection[];
}
// Where a channel's signals are posted as well (backend copy_share.py); its token never comes back
export type ConnectionKind = "telegram" | "discord" | "whatsapp" | "group" | "collab";
export interface Connection {
  id: number; kind: ConnectionKind; label: string; target: string; post_open: boolean; post_modify: boolean; post_close: boolean; enabled: boolean;
  show_code: boolean; recipients: string[]; template: string; language: string; last_at: number | null; last_ok: boolean | null; last_error: string;
}
// One of your chats here a channel can post to
export interface ShareTarget { kind: "group" | "collab"; personal: boolean; token: string; name: string }
export interface Signal {
  id: number; kind: "open" | "modify" | "close"; ref: string; source: "site" | "mt5"; symbol: string; side: string; entry: number | null;
  sl: number | null; tp: number | null; risk_percent: number | null; fraction: number; created_at: number; filled?: number; skipped?: number; failed?: number;
  posted?: number; post_failed?: number;
}
export interface Follower {
  id: number; name: string; auto_copy: boolean; terminal_status: string; terminal_error: string;
  broker: { login: number; server: string; mode: string } | null; last: { status: string; message: string; at: number } | null;
}
export interface Subscription {
  id: number; channel: number; auto_copy: boolean; terminal_status: string; terminal_error: string;
  broker: { login: number; server: string; mode: string } | null;
  risk_mode: "signal" | "fixed"; risk_percent: number; max_risk: number; no_sl_lots: number; max_open: number; daily_loss_limit: number;
  symbols: string[]; real_confirmed: boolean; channel_info: { name: string; owner: string; default_risk: number; active: boolean };
}
export interface Execution {
  id: number; signal: number; kind: string; signal_symbol: string; side: string; status: string; ticket: number | null; symbol: string;
  volume: number | null; price: number | null; sl: number | null; tp: number | null; message: string; latency_ms: number | null; at: number; follower?: string;
}

async function call<T>(uid: string, rest: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${BACKEND}/api/users/copy/${encodeURIComponent(uid)}/${rest}?session_key=${encodeURIComponent(sessionKey())}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export const copyOverview = (uid: string) => call<{ channels: Channel[]; following: Subscription[]; copier: CopierStatus; mt5_linked: boolean }>(uid, "");
export const createChannel = (uid: string, c: { name: string; description?: string; default_risk: number; max_slippage: number }) =>
  call<{ channel: Channel }>(uid, "channels/", "POST", c).then(d => d.channel);
export const getChannel = (uid: string, id: number) => call<{ channel: Channel; copier: CopierStatus }>(uid, `channels/${id}/`);
export const updateChannel = (uid: string, id: number, patch: Partial<Channel>) => call<{ channel: Channel; copier: CopierStatus }>(uid, `channels/${id}/`, "PATCH", patch);
export const deleteChannel = (uid: string, id: number) => call(uid, `channels/${id}/`, "DELETE");
export const sendSignal = (uid: string, id: number, s: Record<string, unknown>) => call<{ signal: Signal }>(uid, `channels/${id}/signals/`, "POST", s).then(d => d.signal);
export const signalResults = (uid: string, id: number, sid: number) => call<{ signal: Signal; results: Execution[] }>(uid, `channels/${id}/signals/${sid}/`);
export const addConnection = (uid: string, id: number, body: Record<string, unknown>) =>
  call<{ connection: Connection }>(uid, `channels/${id}/connections/`, "POST", body).then(d => d.connection);
export const updateConnection = (uid: string, id: number, xid: number, patch: Record<string, unknown>) =>
  call<{ connection: Connection }>(uid, `channels/${id}/connections/${xid}/`, "PATCH", patch).then(d => d.connection);
export const removeConnection = (uid: string, id: number, xid: number) => call(uid, `channels/${id}/connections/${xid}/`, "DELETE");
export const testConnection = (uid: string, id: number, xid: number) => call<{ connection: Connection }>(uid, `channels/${id}/connections/${xid}/test/`, "POST", {});
export const shareTargets = (uid: string) => call<{ targets: ShareTarget[] }>(uid, "share-targets/").then(d => d.targets);
export const joinChannel = (uid: string, code: string) => call<{ subscription: Subscription }>(uid, "join/", "POST", { code }).then(d => d.subscription);
export const updateSubscription = (uid: string, id: number, patch: Partial<Subscription>) =>
  call<{ subscription: Subscription; copier: CopierStatus }>(uid, `subscriptions/${id}/`, "PATCH", patch);
export const leaveChannel = (uid: string, id: number) => call(uid, `subscriptions/${id}/`, "DELETE");
export const subscriptionLog = (uid: string, id: number) => call<{ executions: Execution[] }>(uid, `subscriptions/${id}/log/`).then(d => d.executions);

// The site's own signals still open (opened here, not closed yet), to move stops or close
export function openSiteTrades(signals: Signal[]): Signal[] {
  const closed = new Set(signals.filter(s => s.kind === "close" && s.fraction >= 0.999).map(s => s.ref));
  return signals.filter(s => s.kind === "open" && s.source === "site" && !closed.has(s.ref));
}

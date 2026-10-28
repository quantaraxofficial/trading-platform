"use client";

// Where a copy channel's signals are posted as well as copied (backend copy_share.py): Telegram
// (your bot in your channel / group), Discord (a channel's webhook), WhatsApp (the Cloud API, to a
// list of numbers) and your chats here (groups, personal chats, collabs) as a signal card.

import React, { useEffect, useState } from "react";
import { Check, Megaphone, Send, Trash2, X } from "lucide-react";
import { addConnection, removeConnection, shareTargets, testConnection, updateConnection, type Connection, type ConnectionKind, type ShareTarget } from "./copy";
import { Card, Label, Pills } from "./ui";

const field = "w-full bg-gray-900/50 border border-purple-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-purple-500/70 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20";
const btn = "px-3 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white disabled:opacity-60";
const ghost = "px-2.5 py-1.5 rounded-lg text-xs border border-purple-700/50 text-purple-200 hover:bg-purple-800/30 disabled:opacity-60";
const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(ms).toLocaleDateString();
};

const KIND: Record<ConnectionKind, { name: string; color: string }> = {
  telegram: { name: "Telegram", color: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  discord: { name: "Discord", color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  whatsapp: { name: "WhatsApp", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  group: { name: "Chat", color: "bg-purple-500/15 text-purple-200 border-purple-500/30" },
  collab: { name: "Collab", color: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/30" },
};

export default function CopyConnections({ uid, channelId, connections, onChange }: {
  uid: string; channelId: number; connections: Connection[]; onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Card title={<span className="flex items-center gap-2"><Megaphone size={16} className="text-purple-400" />Post signals to</span>}
      subtitle="Every open, stop move and close goes out there too, in the background (copying never waits for it)"
      right={!adding && <button className={btn} onClick={() => setAdding(true)} data-testid="conn-add">Connect</button>}>
      {connections.length === 0 && !adding && (
        <p className="text-sm text-purple-300/70">Not posted anywhere yet: connect Telegram, Discord, WhatsApp, or one of your chats or collabs here.</p>
      )}
      {connections.length > 0 && (
        <div className="divide-y divide-purple-800/30 -mt-1" data-testid="connections">
          {connections.map(c => <ConnectionRow key={c.id} uid={uid} channelId={channelId} c={c} onChange={onChange} />)}
        </div>
      )}
      {adding && <ConnectForm uid={uid} channelId={channelId} existing={connections} onDone={() => { setAdding(false); onChange(); }} onCancel={() => setAdding(false)} />}
    </Card>
  );
}

function ConnectionRow({ uid, channelId, c, onChange }: { uid: string; channelId: number; c: Connection; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [numbers, setNumbers] = useState<string | null>(null);
  const patch = async (p: Record<string, unknown>) => {
    setMsg(null);
    try { await updateConnection(uid, channelId, c.id, p); onChange(); return true; } catch (e: any) { setMsg({ ok: false, text: e.message }); return false; }
  };
  const test = async () => {
    setBusy(true); setMsg(null);
    try { await testConnection(uid, channelId, c.id); setMsg({ ok: true, text: "Test posted" }); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    setBusy(false); onChange();
  };
  const externally = c.kind === "telegram" || c.kind === "discord" || c.kind === "whatsapp";
  const toggle = (key: "post_open" | "post_modify" | "post_close" | "show_code", label: string) => (
    <label className="inline-flex items-center gap-1.5 text-xs text-purple-200 cursor-pointer select-none">
      <input type="checkbox" className="accent-purple-500" checked={c[key]} onChange={e => patch({ [key]: e.target.checked })} data-testid={`conn-${key}`} />{label}
    </label>
  );
  return (
    <div className={`py-3 ${c.enabled ? "" : "opacity-60"}`} data-connection={c.id} data-kind={c.kind}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${KIND[c.kind].color}`}>{KIND[c.kind].name}</span>
        <span className="text-sm text-white font-medium truncate max-w-[22rem]" title={c.kind === "telegram" || c.kind === "whatsapp" ? c.target : undefined}>{c.label}</span>
        {c.kind === "whatsapp" && <span className="text-xs text-purple-300/70">→ {c.recipients.length} number{c.recipients.length === 1 ? "" : "s"}{c.template ? ` · template ${c.template}` : ""}</span>}
        <span className="flex-1" />
        {c.last_at != null && (
          <span className={`text-xs ${c.last_ok ? "text-emerald-400" : "text-rose-400"}`} title={c.last_error || undefined} data-testid="conn-last">
            {c.last_ok ? <Check size={12} className="inline -mt-0.5" /> : <X size={12} className="inline -mt-0.5" />} {c.last_ok ? "posted" : "failed"} {ago(c.last_at)}
          </span>
        )}
        <button className={ghost} onClick={test} disabled={busy} data-testid="conn-test"><Send size={12} className="inline -mt-0.5" /> {busy ? "Posting…" : "Test"}</button>
        <button className={ghost} onClick={() => patch({ enabled: !c.enabled })} data-testid="conn-enabled">{c.enabled ? "Pause" : "Resume"}</button>
        <button className={`${ghost} ${confirmDel ? "!border-rose-500 !text-rose-300" : ""}`} aria-label="Disconnect" data-testid="conn-remove"
          onClick={async () => { if (!confirmDel) { setConfirmDel(true); return; } await removeConnection(uid, channelId, c.id); onChange(); }}>
          <Trash2 size={12} className="inline -mt-0.5" />{confirmDel ? " Disconnect?" : ""}</button>
      </div>
      <div className="flex items-center gap-4 flex-wrap mt-2">
        {toggle("post_open", "Opens")}{toggle("post_modify", "Stop moves")}{toggle("post_close", "Closes")}
        {externally && toggle("show_code", "Add the join code")}
        {c.kind === "whatsapp" && numbers === null && <button className="text-xs text-purple-300 underline-offset-2 hover:underline" onClick={() => setNumbers(c.recipients.join("\n"))}>Edit numbers</button>}
      </div>
      {numbers !== null && (
        <div className="mt-2 flex gap-2 items-start" onKeyDown={e => e.stopPropagation()}>
          <textarea className={`${field} h-20 font-mono`} value={numbers} onChange={e => setNumbers(e.target.value)} placeholder="919876543210, one per line" />
          <div className="flex flex-col gap-1">
            <button className={ghost} onClick={async () => { if (await patch({ recipients: numbers })) setNumbers(null); }}>Save</button>
            <button className={ghost} onClick={() => setNumbers(null)}>Cancel</button>
          </div>
        </div>
      )}
      {(msg || (c.last_ok === false && c.last_error)) && (
        <div className={`text-xs mt-1.5 ${msg?.ok ? "text-emerald-400" : "text-rose-400"}`} data-testid="conn-msg">{msg ? msg.text : c.last_error}</div>
      )}
    </div>
  );
}

function ConnectForm({ uid, channelId, existing, onDone, onCancel }: { uid: string; channelId: number; existing: Connection[]; onDone: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState<"telegram" | "discord" | "whatsapp" | "here">("telegram");
  const [f, setF] = useState({ token: "", chat: "", webhook: "", number_id: "", wa_token: "", recipients: "", template: "", language: "en_US", target: "", show_code: false });
  const [targets, setTargets] = useState<ShareTarget[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (kind === "here" && targets === null) shareTargets(uid).then(setTargets, e => setErr(e.message)); }, [kind, targets, uid]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const taken = new Set(existing.map(c => `${c.kind}:${c.target}`));
  const connect = async () => {
    setErr(null); setBusy(true);
    let body: Record<string, unknown>;
    if (kind === "telegram") body = { kind, token: f.token.trim(), chat: f.chat.trim() };
    else if (kind === "discord") body = { kind, webhook: f.webhook.trim() };
    else if (kind === "whatsapp") body = { kind, number_id: f.number_id.trim(), token: f.wa_token.trim(), recipients: f.recipients, template: f.template, language: f.language };
    else {
      const t = (targets || []).find(x => `${x.kind}:${x.token}` === f.target);
      if (!t) { setErr("Pick a chat or collab"); setBusy(false); return; }
      body = { kind: t.kind, token: t.token };
    }
    if (kind !== "here") body.show_code = f.show_code;
    try { await addConnection(uid, channelId, body); onDone(); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const help = "text-xs text-purple-300/60 mt-2 leading-relaxed";
  const groups = (targets || []).filter(t => t.kind === "group" && !t.personal);
  const personal = (targets || []).filter(t => t.personal);
  const collabs = (targets || []).filter(t => t.kind === "collab");
  return (
    <div className="mt-3 pt-3 border-t border-purple-800/30" onKeyDown={e => e.stopPropagation()} data-testid="conn-form">
      <Pills size="sm" value={kind} onChange={v => { setKind(v); setErr(null); }} testId="conn-kind"
        options={[{ id: "telegram", label: "Telegram" }, { id: "discord", label: "Discord" }, { id: "whatsapp", label: "WhatsApp" }, { id: "here", label: "Chats & collabs here" }]} />
      <div className="mt-3">
        {kind === "telegram" && <>
          <div className="grid sm:grid-cols-2 gap-3">
            <label><Label>Bot token</Label><input type="password" autoComplete="off" className={`${field} mt-1`} value={f.token} onChange={set("token")} placeholder="123456789:AA…" data-testid="tg-token" /></label>
            <label><Label>Channel or group</Label><input className={`${field} mt-1`} value={f.chat} onChange={set("chat")} placeholder="@yourchannel or -1001234567890" data-testid="tg-chat" /></label>
          </div>
          <p className={help}>Make a bot with <b>@BotFather</b> (/newbot) and copy its token. Add the bot to your channel as an admin who can post (or to your group), then give the channel&apos;s @name or the group&apos;s id. Stop moves and closes are posted as replies to the trade.</p>
        </>}
        {kind === "discord" && <>
          <label><Label>Webhook URL</Label><input type="password" autoComplete="off" className={`${field} mt-1`} value={f.webhook} onChange={set("webhook")} placeholder="https://discord.com/api/webhooks/…" data-testid="dc-webhook" /></label>
          <p className={help}>In Discord: the channel&apos;s <b>Edit channel → Integrations → Webhooks → New webhook → Copy webhook URL</b>. Posts show your channel&apos;s name as the sender.</p>
        </>}
        {kind === "whatsapp" && <>
          <div className="grid sm:grid-cols-2 gap-3">
            <label><Label>Phone number id</Label><input className={`${field} mt-1`} value={f.number_id} onChange={set("number_id")} inputMode="numeric" placeholder="1098765432…" data-testid="wa-number" /></label>
            <label><Label>Access token</Label><input type="password" autoComplete="off" className={`${field} mt-1`} value={f.wa_token} onChange={set("wa_token")} placeholder="EAAG…" data-testid="wa-token" /></label>
            <label className="sm:col-span-2"><Label>Send to (with country code, one per line)</Label>
              <textarea className={`${field} mt-1 h-20 font-mono`} value={f.recipients} onChange={set("recipients")} placeholder={"919876543210\n447700900123"} data-testid="wa-recipients" /></label>
            <label><Label>Template (optional)</Label><input className={`${field} mt-1`} value={f.template} onChange={set("template")} placeholder="trade_signal" /></label>
            <label><Label>Template language</Label><input className={`${field} mt-1`} value={f.language} onChange={set("language")} placeholder="en_US" /></label>
          </div>
          <p className={help}>From <b>Meta for Developers → your app → WhatsApp → API setup</b> (use a permanent system-user token; the temporary one lasts 24 hours). WhatsApp only lets a business start a conversation with an <b>approved template</b>: make one whose body has a single {"{{1}}"} and the signal fills it in. Without a template, posts reach only people who messaged your number in the last 24 hours. WhatsApp groups and channels can&apos;t be posted to through WhatsApp&apos;s official API.</p>
        </>}
        {kind === "here" && <>
          <label><Label>Chat or collab</Label>
            <select className={`${field} mt-1`} value={f.target} onChange={set("target")} data-testid="here-target">
              <option value="">{targets === null ? "Loading…" : targets.length ? "Pick one" : "You're not in any chats or collabs yet"}</option>
              {[["Groups", groups], ["Personal chats", personal], ["Collabs", collabs]].map(([title, list]) => (list as ShareTarget[]).length > 0 && (
                <optgroup key={title as string} label={title as string}>
                  {(list as ShareTarget[]).map(t => <option key={`${t.kind}:${t.token}`} value={`${t.kind}:${t.token}`} disabled={taken.has(`${t.kind}:${t.token}`)}>{t.name}{taken.has(`${t.kind}:${t.token}`) ? " (already)" : ""}</option>)}
                </optgroup>
              ))}
            </select></label>
          <p className={help}>Each signal appears in the chat as a card from you, with a <b>Copy this channel</b> button that follows it (people then switch copying on with their own risk).</p>
        </>}
      </div>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <button className={btn} onClick={connect} disabled={busy} data-testid="conn-connect">{busy ? "Checking…" : "Connect"}</button>
        <button className="px-3 py-2 rounded-lg text-sm text-purple-300 hover:text-white" onClick={onCancel}>Cancel</button>
        {kind !== "here" && (
          <label className="inline-flex items-center gap-1.5 text-xs text-purple-200 cursor-pointer select-none">
            <input type="checkbox" className="accent-purple-500" checked={f.show_code} onChange={e => setF({ ...f, show_code: e.target.checked })} />Add the join code to posts
          </label>
        )}
        {err && <span className="text-sm text-rose-400" data-testid="conn-error">{err}</span>}
      </div>
    </div>
  );
}

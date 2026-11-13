"use client";

// Sharing a post or someone's profile: copy its link, or send it into your chats on the site —
// personal chats, group chats and collabs — with an optional note. Closes on Escape.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, MessageCircle, Search, Users, X } from "lucide-react";
import { shareTargets, type ShareTarget } from "./social";

export default function ShareDialog({ uid, title, link, onCopied, onSend, onClose }: {
  uid: string; title: string; link: string;
  onCopied?: () => void;
  onSend: (targets: { kind: string; token: string }[], note: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [targets, setTargets] = useState<ShareTarget[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close.current(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);
  useEffect(() => { shareTargets(uid).then(setTargets, e => { setTargets([]); setErr(e.message); }); }, [uid]);
  const url = typeof window !== "undefined" ? new URL(link, window.location.origin).toString() : link;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch {
      // (no clipboard permission: select it so Ctrl+C works)
      const i = document.getElementById("share-link") as HTMLInputElement | null; i?.select();
    }
    setCopied(true); onCopied?.();
    setTimeout(() => setCopied(false), 2000);
  };
  const key = (t: ShareTarget) => `${t.kind}:${t.token}`;
  const shown = useMemo(() => (targets || []).filter(t => t.name.toLowerCase().includes(q.trim().toLowerCase())), [targets, q]);
  const send = () => {
    const chosen = (targets || []).filter(t => picked.has(key(t))).map(t => ({ kind: t.kind, token: t.token }));
    if (!chosen.length) return;
    setBusy(true); setErr(null);
    onSend(chosen, note).then(() => { setDone(`Sent to ${chosen.length} chat${chosen.length === 1 ? "" : "s"}`); setPicked(new Set()); setNote(""); },
      e => setErr(e.message)).finally(() => setBusy(false));
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} data-testid="share-dialog"
        className="w-full max-w-md max-h-[88vh] flex flex-col bg-gradient-to-br from-gray-950 via-purple-950/90 to-gray-950 border border-purple-700/50 rounded-2xl shadow-2xl text-white">
        <div className="flex items-center px-5 py-4 border-b border-purple-800/40">
          <h2 className="text-lg font-bold flex-1">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="p-1 rounded hover:bg-purple-800/40"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto" onKeyDown={e => e.stopPropagation()}>
          <div>
            <div className="text-xs uppercase tracking-wider text-purple-300/70 mb-1.5">Link</div>
            <div className="flex gap-2">
              <input id="share-link" readOnly value={url} onFocus={e => e.target.select()} className="flex-1 min-w-0 bg-gray-900/60 border border-purple-700/50 rounded-lg px-3 py-2 text-sm text-purple-100" />
              <button onClick={copy} data-testid="share-copy" className="px-3 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 inline-flex items-center gap-1.5 whitespace-nowrap">
                {copied ? <><Check size={15} />Copied</> : <><Copy size={15} />Copy link</>}</button>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-purple-300/70 mb-1.5">Send in a chat</div>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your chats" className="w-full bg-gray-900/60 border border-purple-700/50 rounded-lg pl-9 pr-3 py-2 text-sm" />
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1" data-testid="share-targets">
              {targets === null ? <div className="text-sm text-purple-300 px-1">Loading your chats…</div>
                : shown.length === 0 ? <div className="text-sm text-purple-300/70 px-1">{targets.length ? "No chat matches" : "No chats yet: start one from someone's profile (Message), the Chats panel or a collab"}</div>
                  : shown.map(t => {
                    const on = picked.has(key(t));
                    return (
                      <button key={key(t)} onClick={() => setPicked(s => { const n = new Set(s); if (on) n.delete(key(t)); else n.add(key(t)); return n; })}
                        data-target={t.token} aria-pressed={on}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm ${on ? "bg-purple-700/40 border border-purple-400/60" : "border border-transparent hover:bg-purple-800/25"}`}>
                        <span className="w-8 h-8 rounded-full bg-purple-900/60 flex items-center justify-center shrink-0">
                          {t.kind === "collab" ? <span className="text-[10px] font-bold">CB</span> : t.personal ? <MessageCircle size={15} /> : <Users size={15} />}</span>
                        <span className="flex-1 min-w-0"><span className="block truncate">{t.name}</span>
                          <span className="text-[11px] text-purple-300/60">{t.kind === "collab" ? "Collab chat" : t.personal ? "Personal chat" : "Group chat"}</span></span>
                        <span className={`w-5 h-5 rounded border flex items-center justify-center ${on ? "bg-purple-500 border-purple-400" : "border-purple-600"}`}>{on && <Check size={13} />}</span>
                      </button>
                    );
                  })}
            </div>
          </div>
          {picked.size > 0 && (
            <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 500))} rows={2} placeholder="Add a message (optional)"
              className="w-full bg-gray-900/60 border border-purple-700/50 rounded-lg px-3 py-2 text-sm resize-none" />
          )}
          {err && <div role="alert" className="text-sm text-rose-400">{err}</div>}
          {done && <div role="status" className="text-sm text-emerald-300">{done}</div>}
          <div className="flex justify-end">
            <button onClick={send} disabled={!picked.size || busy} data-testid="share-send"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50">
              {busy ? "Sending…" : picked.size > 1 ? `Send to ${picked.size} chats` : "Send"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

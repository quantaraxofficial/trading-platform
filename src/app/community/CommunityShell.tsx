"use client";

// The Community pages' frame, in TradePilot's look (as Analytics): the sidebar (search, your
// profile, Analytics, back to the chart), the page title, and the notifications bell.

import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, BarChart3, Bell, LogIn, Search, TrendingUp, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getNotifications, markNotificationsRead, mySettings, profileUrl, chartUrlForScript, initials, type Notice } from "./social";

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div className="rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-bold flex items-center justify-center shrink-0 shadow-lg shadow-purple-900/40"
      style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials(name)}</div>
  );
}

export default function CommunityShell({ title, hint, active, children }: { title: React.ReactNode; hint?: React.ReactNode; active: "search" | "me" | "other"; children: (uid: string) => React.ReactNode }) {
  const { user, loading } = useAuth();
  const uid = user?.uid || null;
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => { if (uid) mySettings(uid).then(m => setMe(m.username), () => {}); }, [uid]);
  return (
    <div className="h-screen bg-gradient-to-br from-black via-purple-950 to-black text-white relative overflow-hidden" data-testid="community">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="cm-blob cm-blob-1" /><div className="cm-blob cm-blob-2" />
      </div>
      <div className="relative z-10 flex h-full">
        <aside className="hidden md:flex w-60 shrink-0 flex-col gap-6 p-5 border-r border-purple-800/30 bg-black/40 backdrop-blur-xl h-full overflow-y-auto">
          <a href="/" className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20"><TrendingUp className="w-6 h-6" /></div>
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent font-bold text-xl">TradePilot</span>
          </a>
          <nav className="space-y-1" aria-label="Community">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-400/70 px-3 mb-2">Community</div>
            {([["search", "Search", <Search key="s" size={18} />, "/community"], ["me", "My profile", <User key="u" size={18} />, me ? profileUrl(me) : "#"]] as const).map(([id, label, icon, href]) => (
              <a key={id} href={href} data-nav={id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active === id ? "bg-gradient-to-r from-purple-600/80 to-indigo-600/80 text-white shadow-lg shadow-purple-700/30" : "text-purple-300 hover:text-white hover:bg-purple-800/25"}`}>
                {icon}{label}</a>
            ))}
            <a href="/analytics" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-purple-300 hover:text-white hover:bg-purple-800/25"><BarChart3 size={18} />Analytics</a>
          </nav>
          <a href="/" className="mt-auto flex items-center gap-2 text-sm text-purple-400 hover:text-white"><ArrowLeft size={15} />Back to the chart</a>
        </aside>
        <main className="flex-1 min-w-0 h-full overflow-y-auto px-4 sm:px-8 py-6">
          <header className="flex items-center gap-3 mb-6">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold truncate">{title}</h1>
              {hint && <p className="text-purple-300/80 text-sm">{hint}</p>}
            </div>
            {uid && <NotificationsBell uid={uid} />}
          </header>
          {loading ? <div className="text-purple-300">Loading…</div> : !uid ? (
            <div className="max-w-md mx-auto mt-16 bg-black/60 backdrop-blur-xl border border-purple-800/50 rounded-2xl p-8 text-center shadow-2xl">
              <h2 className="text-2xl font-bold mb-2">Sign in to see the community</h2>
              <p className="text-purple-300 mb-6">Find traders, follow them and use their scripts.</p>
              <a href="/login" className="inline-flex items-center justify-center gap-2 w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 py-3 rounded-lg font-semibold"><LogIn size={18} />Sign in</a>
            </div>
          ) : children(uid)}
        </main>
      </div>
      <style>{`
        .cm-blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.15; animation: cm-pulse 6s ease-in-out infinite; }
        .cm-blob-1 { width: 360px; height: 360px; background: #581c87; top: -100px; right: -80px; }
        .cm-blob-2 { width: 320px; height: 320px; background: #4c1d95; bottom: -80px; left: -80px; }
        @keyframes cm-pulse { 0%, 100% { opacity: 0.12; } 50% { opacity: 0.2; } }
        @media (prefers-reduced-motion: reduce) { .cm-blob { animation: none; } }
      `}</style>
    </div>
  );
}

// Where a notification leads: the script on the chart, the person's profile, or the collab
export function noticeHref(n: Notice) {
  if (n.data?.script && (n.kind === "script" || n.kind === "shared")) return chartUrlForScript(n.data.script);
  if (n.kind === "invite" && n.data?.token) return `/?collab=${encodeURIComponent(n.data.token)}`;
  if (n.data?.username) return profileUrl(n.data.username);
  return null;
}

export function NotificationsBell({ uid }: { uid: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ unread: number; items: Notice[] } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const load = () => getNotifications(uid).then(setData, () => {});
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
    return () => clearInterval(t);
  }, [uid]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [open]);
  const toggle = () => {
    setOpen(o => !o);
    if (!open && data?.unread) markNotificationsRead(uid).then(d => setTimeout(() => setData(d), 1500), () => {});
  };
  return (
    <div className="relative" ref={ref}>
      <button aria-label="Notifications" onClick={toggle} data-testid="bell"
        className="relative w-10 h-10 rounded-xl border border-purple-700/50 text-purple-200 hover:bg-purple-800/30 flex items-center justify-center">
        <Bell size={18} />
        {!!data?.unread && <span data-testid="bell-count" className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">{data.unread > 99 ? "99+" : data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto bg-black/90 backdrop-blur-xl border border-purple-800/60 rounded-2xl shadow-2xl z-50" data-testid="notifications">
          <div className="px-4 py-3 border-b border-purple-800/40 text-sm font-semibold">Notifications</div>
          {!data?.items.length ? <div className="px-4 py-6 text-sm text-purple-300/70 text-center">Nothing yet. Follow traders to hear when they publish.</div> : data.items.map(n => {
            const href = noticeHref(n);
            const body = (
              <div className={`flex gap-3 px-4 py-3 border-b border-purple-900/40 ${n.read ? "" : "bg-purple-800/15"}`}>
                <Avatar name={n.actor?.name || "TradePilot"} size={32} />
                <div className="min-w-0">
                  <div className="text-sm text-purple-50">{n.text}</div>
                  <div className="text-[11px] text-purple-300/60 mt-0.5">{new Date(n.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>
                </div>
              </div>
            );
            return href ? <a key={n.id} href={href} className="block hover:bg-purple-800/20">{body}</a> : <div key={n.id}>{body}</div>;
          })}
        </div>
      )}
    </div>
  );
}

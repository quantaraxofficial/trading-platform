"use client";

// Reels (backend core/posts.py reels): the public posts that start with a video, full screen, one
// after another — scroll / swipe (or ↑ ↓) and each snaps into place. The one in view plays (looping),
// the others pause; one sound switch for all (videos start muted, as browsers allow); a tap pauses,
// a double tap likes. On each: its author (follow them), caption, like, comments (the post opens),
// share (copy its link or send it in your chats), its views. More load as you near the end.
// /reels?post=<id> starts at that reel. Escape leaves for Community.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, Heart, MessageCircle, Pause, Share2, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "./CommunityShell";
import { Caption, PostViewer } from "./Posts";
import ShareDialog from "./ShareDialog";
import { BACKEND } from "../lib/collab/session";
import { sessionKey } from "@/lib/backend";
import { followPerson, likePost, mediaUrl, postUrl, profileUrl, sharePost, type Post } from "./social";

type Reel = Post & { i_follow: boolean; views: number };

async function loadReels(uid: string, q: { before?: number; start?: number }) {
  const qs = new URLSearchParams({ session_key: sessionKey(), ...(q.before ? { before: String(q.before) } : {}), ...(q.start ? { start: String(q.start) } : {}) });
  const r = await fetch(`${BACKEND}/api/users/social/${encodeURIComponent(uid)}/reels/?${qs}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || "Reels couldn't be loaded");
  return d as { reels: Reel[]; more: boolean };
}
const countView = (uid: string, id: number) =>
  fetch(`${BACKEND}/api/users/social/${encodeURIComponent(uid)}/posts/${id}/view/?session_key=${encodeURIComponent(sessionKey())}`, { method: "POST" })
    .then(r => r.json()).catch(() => null) as Promise<{ views: number } | null>;
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

export default function Reels() {
  const { user, loading } = useAuth();
  const uid = user?.uid || null;
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [muted, setMuted] = useState(true);
  const [open, setOpen] = useState<Reel | null>(null);
  const [sharing, setSharing] = useState<Reel | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);

  useEffect(() => {
    if (!uid) return;
    const start = Number(new URLSearchParams(window.location.search).get("post")) || undefined;
    loadReels(uid, { start }).then(d => { setReels(d.reels); setMore(d.more); }, e => setErr(e.message));
  }, [uid]);
  const update = useCallback((r: Partial<Reel> & { id: number }) => setReels(list => list && list.map(x => (x.id === r.id ? { ...x, ...r } : x))), []);

  // the reel in view: the one most visible (IntersectionObserver), near the end: the next page
  useEffect(() => {
    const el = box.current;
    if (!el || !reels?.length) return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.6) setCurrent(Number((e.target as HTMLElement).dataset.index));
    }, { root: el, threshold: [0.6] });
    el.querySelectorAll("[data-reel]").forEach(n => io.observe(n));
    return () => io.disconnect();
  }, [reels?.length]);
  useEffect(() => {
    if (!uid || !reels || !more || loadingMore.current || current < reels.length - 3) return;
    loadingMore.current = true;
    loadReels(uid, { before: reels[reels.length - 1].id }).then(d => { setReels(list => [...(list || []), ...d.reels.filter(r => !(list || []).some(x => x.id === r.id))]); setMore(d.more); },
      () => {}).finally(() => { loadingMore.current = false; });
  }, [uid, reels, more, current]);
  // its view, counted once it's been in view a moment
  useEffect(() => {
    const r = reels?.[current];
    if (!uid || !r || r.mine) return;
    const t = setTimeout(() => countView(uid, r.id).then(v => v && update({ id: r.id, views: v.views })), 1500);
    return () => clearTimeout(t);
  }, [uid, current, reels?.[current]?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ↑ ↓ through them; Escape back to Community (unless a dialog is open: it closes first)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (open || sharing || (e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const el = box.current;
      if (!el) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); el.scrollBy({ top: el.clientHeight, behavior: "smooth" }); }
      if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); el.scrollBy({ top: -el.clientHeight, behavior: "smooth" }); }
      if (e.key === "m") setMuted(m => !m);
      if (e.key === "Escape") window.location.href = "/community?tab=posts";
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, sharing]);

  const like = (r: Reel, on = !r.liked) => {
    if (!uid) return;
    update({ id: r.id, liked: on, likes: r.likes + (on === r.liked ? 0 : on ? 1 : -1) });
    likePost(uid, r.id, on).then(x => update({ id: r.id, liked: x.liked, likes: x.likes }), () => update({ id: r.id, liked: r.liked, likes: r.likes }));
  };
  const follow = (r: Reel) => uid && followPerson(uid, r.author.username, !r.i_follow).then(x =>
    setReels(list => list && list.map(y => (y.author.username === r.author.username ? { ...y, i_follow: x.i_follow } : y))), () => {});

  const frame = (children: React.ReactNode) => (
    <div className="fixed inset-0 bg-black text-white" data-testid="reels">
      {children}
      <a href="/community?tab=posts" aria-label="Back to Community" className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center"><ArrowLeft size={20} /></a>
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 font-bold text-lg drop-shadow pointer-events-none">Reels</div>
    </div>
  );
  if (loading) return frame(<div className="h-full flex items-center justify-center text-purple-200">Loading…</div>);
  if (!uid) return frame(<div className="h-full flex flex-col items-center justify-center gap-4"><p>Sign in to watch reels</p><a href="/login" className="px-4 py-2 rounded-lg bg-purple-600 font-semibold">Sign in</a></div>);
  if (err) return frame(<div className="h-full flex items-center justify-center text-rose-300">{err}</div>);
  if (!reels) return frame(<div className="h-full flex items-center justify-center text-purple-200">Loading reels…</div>);
  if (!reels.length) return frame(<div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6"><p className="text-lg font-semibold">No reels yet</p>
    <p className="text-purple-200/80 text-sm">Post a video publicly and it shows here for everyone.</p><a href="/community?tab=posts" className="px-4 py-2 rounded-lg bg-purple-600 font-semibold">Back to Community</a></div>);

  return frame(
    <>
      <div ref={box} className="h-full overflow-y-scroll snap-y snap-mandatory overscroll-contain" style={{ scrollbarWidth: "none" }}>
        {reels.map((r, i) => (
          <ReelItem key={r.id} uid={uid} r={r} index={i} active={i === current} near={Math.abs(i - current) <= 1} muted={muted}
            onMute={() => setMuted(m => !m)} onLike={on => like(r, on)} onFollow={() => follow(r)} onComments={() => setOpen(r)} onShare={() => setSharing(r)} />
        ))}
        {more && <div className="h-24 snap-end flex items-center justify-center text-purple-200/70 text-sm">Loading more…</div>}
      </div>
      {open && <PostViewer uid={uid} post={open} onClose={() => setOpen(null)} onChange={p => { update(p as Reel); setOpen(o => (o ? { ...o, ...p } : o)); }}
        onDeleted={id => { setReels(list => list && list.filter(x => x.id !== id)); setOpen(null); }} />}
      {sharing && <ShareDialog uid={uid} title="Share reel" link={`/reels?post=${sharing.id}`} onClose={() => setSharing(null)}
        onCopied={() => sharePost(uid, sharing.id, { link: true }).then(x => update({ id: sharing.id, shares: x.shares }), () => {})}
        onSend={(targets, note) => sharePost(uid, sharing.id, { targets, note }).then(x => update({ id: sharing.id, shares: x.shares }))} />}
    </>
  );
}

function ReelItem({ uid, r, index, active, near, muted, onMute, onLike, onFollow, onComments, onShare }: {
  uid: string; r: Reel; index: number; active: boolean; near: boolean; muted: boolean;
  onMute: () => void; onLike: (on: boolean) => void; onFollow: () => void; onComments: () => void; onShare: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [burst, setBurst] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const taps = useRef<number | null>(null);
  const m = r.media[0];
  // only the reel in view plays (the rest pause and go back to the start)
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active) { setPaused(false); v.play().catch(() => setPaused(true)); }
    else { v.pause(); v.currentTime = 0; }
  }, [active]);
  useEffect(() => { if (video.current) video.current.muted = muted; }, [muted]);
  // a tap pauses / plays; two taps like it
  const tap = () => {
    if (taps.current) {
      clearTimeout(taps.current); taps.current = null;
      if (!r.liked) onLike(true);
      setBurst(b => b + 1);
      return;
    }
    taps.current = window.setTimeout(() => {
      taps.current = null;
      const v = video.current;
      if (!v) return;
      if (v.paused) { v.play().catch(() => {}); setPaused(false); } else { v.pause(); setPaused(true); }
    }, 250);
  };
  const action = "flex flex-col items-center gap-1 text-xs font-semibold drop-shadow";
  return (
    <section data-reel data-index={index} data-post={r.id} className="relative h-full w-full snap-start snap-always flex items-center justify-center bg-black overflow-hidden">
      {m && <video ref={video} src={mediaUrl(uid, r.id, m.id)} loop playsInline muted={muted} preload={near ? "auto" : "metadata"}
        className="h-full w-full max-w-[min(100vw,calc(100vh*9/16*1.25))] object-contain sm:object-cover bg-black" onClick={tap} data-testid="reel-video" />}
      {paused && <Pause size={64} className="absolute pointer-events-none opacity-70" />}
      {burst > 0 && <Heart key={burst} size={110} className="absolute pointer-events-none fill-rose-500 text-rose-500 animate-ping" style={{ animationIterationCount: 1 }} />}
      {/* the actions, on the right */}
      <div className="absolute right-3 sm:right-[max(12px,calc(50%-min(50vw,calc(100vh*9/32*1.25))-70px))] bottom-28 flex flex-col items-center gap-5 z-10">
        <button className={action} onClick={() => onLike(!r.liked)} aria-label={r.liked ? "Unlike" : "Like"} aria-pressed={r.liked} data-testid="reel-like">
          <Heart size={30} className={r.liked ? "fill-rose-500 text-rose-500" : ""} />{short(r.likes)}</button>
        {r.comments_setting !== "off" && (
          <button className={action} onClick={onComments} aria-label="Comments" data-testid="reel-comments"><MessageCircle size={30} />{short(r.comments)}</button>
        )}
        {(r.allow_sharing || r.mine) && <button className={action} onClick={onShare} aria-label="Share" data-testid="reel-share"><Share2 size={28} />{r.shares ? short(r.shares) : "Share"}</button>}
        <span className={action} title="Views"><Eye size={26} />{short(r.views)}</span>
        <button className={action} onClick={onMute} aria-label={muted ? "Sound on" : "Sound off"} data-testid="reel-mute">{muted ? <VolumeX size={26} /> : <Volume2 size={26} />}</button>
      </div>
      {/* who posted it, and its caption */}
      <div className="absolute left-0 right-20 bottom-0 p-4 pb-8 bg-gradient-to-t from-black/80 via-black/30 to-transparent z-10 sm:left-[max(0px,calc(50%-min(50vw,calc(100vh*9/32*1.25))))] sm:right-[max(80px,calc(50%-min(50vw,calc(100vh*9/32*1.25))))]">
        <div className="flex items-center gap-2.5 mb-2">
          <a href={profileUrl(r.author.username)}><Avatar name={r.author.name} src={r.author.avatar} size={36} /></a>
          <a href={profileUrl(r.author.username)} className="font-semibold drop-shadow hover:underline">{r.author.name}</a>
          {!r.mine && <button onClick={onFollow} data-testid="reel-follow"
            className={`ml-1 px-3 py-1 rounded-lg text-xs font-semibold border ${r.i_follow ? "border-white/40 text-white/90" : "border-white bg-white/10 hover:bg-white/20"}`}>{r.i_follow ? "Following" : "Follow"}</button>}
        </div>
        {r.caption && (
          <div onClick={() => setExpanded(e => !e)} className={`text-sm drop-shadow cursor-pointer ${expanded ? "max-h-48 overflow-y-auto" : "line-clamp-2"}`}>
            <Caption text={r.caption} />
          </div>
        )}
        <a href={postUrl(r.id)} className="text-[11px] text-white/60 hover:text-white mt-1 inline-block">Open post</a>
      </div>
    </section>
  );
}

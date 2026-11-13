"use client";

// Posts (backend core/posts.py): photos and videos with a caption, public or for followers only.
// The composer (pick or drop files, caption, who sees it, who may comment, whether it may be shared,
// upload progress), the grid on profiles and in Community's search, and the post itself (swipe
// through the photos / videos; the caption with its #hashtags and @mentions as links; like, comment
// and share as its settings allow — share copies its link or sends it into your chats; its author can
// edit or delete it, and delete any comment). Shown in a dialog (Escape closes it) or on its own page.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Globe2, Heart, ImagePlus, Layers, Lock, MessageCircle, Pencil, Play, Send, Share2, Trash2, X } from "lucide-react";
import { Avatar } from "./CommunityShell";
import ShareDialog from "./ShareDialog";
import {
  addComment, createPost, deleteComment, deletePost, likePost, listComments, listPosts, mediaUrl, postUrl, postsSearchUrl, profileUrl,
  sharePost, updatePost, type CommentsSetting, type Post, type PostComment,
} from "./social";

const btn = "px-3 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5";
const ghost = "px-3 py-2 rounded-lg text-sm border border-purple-700/50 text-purple-100 hover:bg-purple-800/30 disabled:opacity-50 inline-flex items-center gap-1.5";
const MAX_FILES = 10, MAX_CAPTION = 2200;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,.mov,.m4v";
const COMMENTS: [CommentsSetting, string][] = [["everyone", "Everyone"], ["followers", "Followers"], ["off", "Off"]];

function useEscape(onClose: () => void, on = true) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); ref.current(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [on]);
}

function Shade({ onClose, children, label, wide = false }: { onClose: () => void; children: React.ReactNode; label: string; wide?: boolean }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-6" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={label}
        className={`w-full ${wide ? "max-w-5xl" : "max-w-lg"} max-h-[92vh] overflow-hidden flex flex-col bg-gradient-to-br from-gray-950 via-purple-950/90 to-gray-950 border border-purple-700/50 rounded-2xl shadow-2xl text-white`}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the caption, linked

export function Caption({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/([#@][\w.]+)/g);
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((part, i) => part.startsWith("#") && part.length > 1
        ? <a key={i} href={postsSearchUrl(part)} className="text-purple-300 hover:underline">{part}</a>
        : part.startsWith("@") && part.length > 1
          ? <a key={i} href={profileUrl(part.slice(1).replace(/\.$/, ""))} className="text-purple-300 hover:underline">{part}</a>
          : <React.Fragment key={i}>{part}</React.Fragment>)}
    </p>
  );
}

export const ago = (ms: number) => {
  const s = (Date.now() - ms) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago`
    : s < 7 * 86400 ? `${Math.floor(s / 86400)} d ago` : new Date(ms).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
};
export const Visibility = ({ v }: { v: Post["visibility"] }) => v === "public"
  ? <span className="inline-flex items-center gap-1 text-[11px] text-purple-300/80"><Globe2 size={12} />Public</span>
  : <span className="inline-flex items-center gap-1 text-[11px] text-amber-300/90"><Lock size={12} />Followers only</span>;

// Who may comment, and whether it may be shared (the composer and the editor)
function PostSettings({ comments, setComments, sharing, setSharing, disabled }: {
  comments: CommentsSetting; setComments: (v: CommentsSetting) => void; sharing: boolean; setSharing: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-purple-300/80 w-24">Comments</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Who may comment">
          {COMMENTS.map(([v, label]) => (
            <button key={v} role="radio" aria-checked={comments === v} disabled={disabled} onClick={() => setComments(v)} data-comments={v}
              className={`px-2.5 py-1 rounded-lg text-xs border ${comments === v ? "border-purple-400 bg-purple-700/40" : "border-purple-800/50 hover:bg-purple-800/20"}`}>{label}</button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <span className="text-purple-300/80 w-24">Sharing</span>
        <input type="checkbox" checked={sharing} disabled={disabled} onChange={e => setSharing(e.target.checked)} className="accent-purple-500" data-testid="post-allow-sharing" />
        <span className="text-xs text-purple-200/80">{sharing ? "People can copy its link and send it in chats" : "Off"}</span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- composer

export function PostComposer({ uid, onClose, onPosted }: { uid: string; onClose: () => void; onPosted: (p: Post) => void }) {
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<Post["visibility"]>("public");
  const [comments, setComments] = useState<CommentsSetting>("everyone");
  const [sharing, setSharing] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => files.forEach(f => URL.revokeObjectURL(f.url)), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const add = (list: FileList | File[]) => {
    setErr(null);
    const ok = Array.from(list).filter(f => /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm))$/.test(f.type) || /\.(mov|m4v)$/i.test(f.name));
    if (ok.length < Array.from(list).length) setErr("Only photos (JPG, PNG, WebP, GIF) and videos (MP4, MOV, WebM) can be posted");
    setFiles(cur => [...cur, ...ok.map(file => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_FILES));
  };
  const remove = (i: number) => setFiles(cur => { URL.revokeObjectURL(cur[i].url); return cur.filter((_, k) => k !== i); });
  const busy = progress !== null;
  const submit = () => {
    if (!files.length || busy) return;
    setErr(null); setProgress(0);
    createPost(uid, { caption, visibility, comments, allow_sharing: sharing, files: files.map(f => f.file) }, setProgress)
      .then(p => { onPosted(p); onClose(); }, e => { setErr(e.message); setProgress(null); });
  };
  return (
    <Shade onClose={() => { if (!busy) onClose(); }} label="New post">
      <div className="flex items-center px-5 py-4 border-b border-purple-800/40">
        <h2 className="text-lg font-bold flex-1">New post</h2>
        <button aria-label="Close" onClick={onClose} disabled={busy} className="p-1 rounded hover:bg-purple-800/40"><X size={18} /></button>
      </div>
      <div className="p-5 space-y-4 overflow-y-auto" onKeyDown={e => e.stopPropagation()}>
        <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
          className={`rounded-xl border-2 border-dashed p-3 ${drag ? "border-purple-400 bg-purple-800/20" : "border-purple-700/50"}`}>
          {files.length === 0 ? (
            <button onClick={() => input.current?.click()} className="w-full py-10 flex flex-col items-center gap-2 text-purple-200" data-testid="post-pick">
              <ImagePlus size={32} className="text-purple-400" /><span className="font-medium">Add photos and videos</span>
              <span className="text-xs text-purple-300/60">or drop them here · up to {MAX_FILES} · photos 15 MB, videos 100 MB</span>
            </button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <div key={f.url} className="relative aspect-square rounded-lg overflow-hidden bg-black">
                  {f.file.type.startsWith("video") || /\.(mov|m4v)$/i.test(f.file.name)
                    ? <><video src={f.url} muted playsInline preload="metadata" className="w-full h-full object-cover" /><Play size={18} className="absolute left-1.5 bottom-1.5 text-white drop-shadow" /></>
                    : <img src={f.url} alt="" className="w-full h-full object-cover" />}
                  {!busy && <button aria-label="Remove" onClick={() => remove(i)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center hover:bg-rose-600"><X size={13} /></button>}
                </div>
              ))}
              {files.length < MAX_FILES && !busy && (
                <button onClick={() => input.current?.click()} className="aspect-square rounded-lg border border-dashed border-purple-700/60 flex items-center justify-center text-purple-300 hover:bg-purple-800/20" aria-label="Add more"><ImagePlus size={22} /></button>
              )}
            </div>
          )}
          <input ref={input} type="file" multiple accept={ACCEPT} hidden data-testid="post-files" onChange={e => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
        </div>
        <div>
          <textarea value={caption} onChange={e => setCaption(e.target.value.slice(0, MAX_CAPTION))} rows={4} disabled={busy} data-testid="post-caption"
            placeholder="Write a caption… #hashtags help people find it" className="w-full bg-gray-900/60 border border-purple-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-purple-300/40 focus:outline-none focus:border-purple-400 resize-y" />
          <div className="text-right text-[11px] text-purple-300/50">{caption.length} / {MAX_CAPTION}</div>
        </div>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who sees it">
          {([["public", <Globe2 key="g" size={15} />, "Public", "Everyone, and found in search"], ["followers", <Lock key="l" size={15} />, "Followers only", "Only people who follow you"]] as const).map(([v, icon, label, hint]) => (
            <button key={v} role="radio" aria-checked={visibility === v} onClick={() => setVisibility(v)} disabled={busy} data-visibility={v}
              className={`text-left px-3 py-2 rounded-lg border ${visibility === v ? "border-purple-400 bg-purple-700/30" : "border-purple-800/50 hover:bg-purple-800/20"}`}>
              <div className="flex items-center gap-1.5 text-sm font-medium">{icon}{label}</div><div className="text-[11px] text-purple-300/60">{hint}</div>
            </button>
          ))}
        </div>
        <PostSettings comments={comments} setComments={setComments} sharing={sharing} setSharing={setSharing} disabled={busy} />
        {err && <div role="alert" className="text-sm text-rose-400">{err}</div>}
        {busy && <div className="h-1.5 rounded-full bg-purple-950 overflow-hidden"><div className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all" style={{ width: `${Math.round((progress || 0) * 100)}%` }} /></div>}
        <div className="flex justify-end gap-2">
          <button className={ghost} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={btn} onClick={submit} disabled={!files.length || busy} data-testid="post-submit">{busy ? `Posting… ${Math.round((progress || 0) * 100)}%` : "Post"}</button>
        </div>
      </div>
    </Shade>
  );
}

// ---------------------------------------------------------------- grid

function Thumb({ uid, p, onOpen }: { uid: string; p: Post; onOpen: () => void }) {
  const m = p.media[0];
  return (
    <button onClick={onOpen} data-testid="post-tile" data-post={p.id} aria-label={p.caption ? `Post: ${p.caption.slice(0, 60)}` : "Post"}
      className="group relative aspect-square rounded-xl overflow-hidden bg-black/60 border border-purple-800/30 hover:border-purple-500/60">
      {m && (m.kind === "video"
        ? <video src={`${mediaUrl(uid, p.id, m.id)}#t=0.1`} muted playsInline preload="metadata" className="w-full h-full object-cover" />
        : <img src={mediaUrl(uid, p.id, m.id)} alt="" loading="lazy" className="w-full h-full object-cover" />)}
      <div className="absolute top-1.5 right-1.5 flex gap-1 text-white drop-shadow">
        {p.visibility === "followers" && <Lock size={15} />}
        {p.media.length > 1 ? <Layers size={15} /> : m?.kind === "video" ? <Play size={15} /> : null}
      </div>
      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-sm font-semibold">
        <span className="flex items-center gap-1"><Heart size={16} className="fill-white" />{p.likes}</span>
        {p.comments_setting !== "off" && <span className="flex items-center gap-1"><MessageCircle size={16} className="fill-white" />{p.comments}</span>}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------- the post

export function PostDetail({ uid, post, onClose, onChange, onDeleted, inline = false }: {
  uid: string; post: Post; onClose?: () => void; onChange: (p: Post) => void; onDeleted: (id: number) => void; inline?: boolean;
}) {
  const [i, setI] = useState(0);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(post.caption);
  const [visibility, setVisibility] = useState(post.visibility);
  const [commentsSetting, setCommentsSetting] = useState<CommentsSetting>(post.comments_setting);
  const [sharing, setSharing] = useState(post.allow_sharing);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const commentBox = useRef<HTMLTextAreaElement>(null);
  const n = post.media.length, m = post.media[Math.min(i, n - 1)];
  useEffect(() => {
    if (post.comments_setting === "off") { setComments([]); return; }
    listComments(uid, post.id).then(d => setComments(d.comments), () => setComments([]));
  }, [uid, post.id, post.comments_setting]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (editing || sharingOpen || tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowRight") setI(x => Math.min(n - 1, x + 1));
      if (e.key === "ArrowLeft") setI(x => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [n, editing, sharingOpen]);
  const save = () => updatePost(uid, post.id, { caption, visibility, comments: commentsSetting, allow_sharing: sharing })
    .then(p => { onChange(p); setEditing(false); }, e => setErr(e.message));
  const like = () => {
    const on = !post.liked;
    onChange({ ...post, liked: on, likes: post.likes + (on ? 1 : -1) });   // (at once; the server's count follows)
    likePost(uid, post.id, on).then(r => onChange({ ...post, liked: r.liked, likes: r.likes }), e => { onChange(post); setErr(e.message); });
  };
  const send = () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true); setErr(null);
    addComment(uid, post.id, t).then(r => { setComments(c => [...(c || []), r.comment]); setText(""); onChange({ ...post, comments: r.comments }); },
      e => setErr(e.message)).finally(() => setSending(false));
  };
  const removeComment = (c: PostComment) => deleteComment(uid, post.id, c.id).then(() => {
    setComments(list => (list || []).filter(x => x.id !== c.id)); onChange({ ...post, comments: Math.max(0, post.comments - 1) });
  }, e => setErr(e.message));
  const shareable = post.allow_sharing || post.mine;

  const body = (
    <div className={`flex flex-col md:flex-row min-h-0 flex-1 ${inline ? "rounded-2xl overflow-hidden border border-purple-800/40 bg-black/50" : ""}`} data-testid="post-viewer">
      <div className={`relative md:flex-1 bg-black flex items-center justify-center min-h-[260px] ${inline ? "max-h-[75vh]" : "max-h-[60vh] md:max-h-[92vh]"}`}>
        {m && (m.kind === "video"
          ? <video key={m.id} src={mediaUrl(uid, post.id, m.id)} controls playsInline className="max-w-full max-h-[60vh] md:max-h-[88vh]" data-testid="post-video" />
          : <img key={m.id} src={mediaUrl(uid, post.id, m.id)} alt="" className="max-w-full max-h-[60vh] md:max-h-[88vh] object-contain" data-testid="post-image" onDoubleClick={() => !post.liked && like()} />)}
        {i > 0 && <button aria-label="Previous" onClick={() => setI(i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"><ChevronLeft size={20} /></button>}
        {i < n - 1 && <button aria-label="Next" onClick={() => setI(i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"><ChevronRight size={20} /></button>}
        {n > 1 && <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5">{post.media.map((x, k) => <span key={x.id} className={`w-1.5 h-1.5 rounded-full ${k === i ? "bg-white" : "bg-white/40"}`} />)}</div>}
      </div>
      <div className="md:w-[360px] shrink-0 flex flex-col min-h-0 max-h-[92vh] border-t md:border-t-0 md:border-l border-purple-800/40">
        <div className="flex items-center gap-3 p-4 border-b border-purple-800/40">
          <a href={profileUrl(post.author.username)}><Avatar name={post.author.name} src={post.author.avatar} size={38} /></a>
          <div className="min-w-0 flex-1">
            <a href={profileUrl(post.author.username)} className="font-semibold hover:underline block truncate">{post.author.name}</a>
            <div className="flex items-center gap-2 text-[11px] text-purple-300/70">@{post.author.username} · {ago(post.created_at)}{post.edited ? " · edited" : ""}</div>
          </div>
          {onClose && <button aria-label="Close" onClick={onClose} className="p-1 rounded hover:bg-purple-800/40"><X size={18} /></button>}
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-3 min-h-[120px]">
          {editing ? (
            <div className="space-y-3" onKeyDown={e => e.stopPropagation()}>
              <textarea value={caption} onChange={e => setCaption(e.target.value.slice(0, MAX_CAPTION))} rows={5} data-testid="post-edit-caption"
                className="w-full bg-gray-900/60 border border-purple-700/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              <div className="flex gap-2">
                {(["public", "followers"] as const).map(v => (
                  <button key={v} onClick={() => setVisibility(v)} className={`flex-1 text-xs px-2 py-1.5 rounded-lg border ${visibility === v ? "border-purple-400 bg-purple-700/30" : "border-purple-800/50"}`}>
                    {v === "public" ? "Public" : "Followers only"}</button>
                ))}
              </div>
              <PostSettings comments={commentsSetting} setComments={setCommentsSetting} sharing={sharing} setSharing={setSharing} />
              <div className="flex justify-end gap-2"><button className={ghost} onClick={() => setEditing(false)}>Cancel</button><button className={btn} onClick={save} data-testid="post-edit-save">Save</button></div>
            </div>
          ) : (
            <>
              {post.caption ? <Caption text={post.caption} className="text-sm text-purple-50" /> : null}
              <Visibility v={post.visibility} />
              {post.comments_setting !== "off" && (
                <div className="space-y-3 pt-2" data-testid="post-comments">
                  {comments === null ? <div className="text-xs text-purple-300/60">Loading comments…</div> : comments.map(c => (
                    <div key={c.id} className="flex gap-2.5 group">
                      <a href={profileUrl(c.author.username)}><Avatar name={c.author.name} src={c.author.avatar} size={28} /></a>
                      <div className="min-w-0 flex-1 text-sm">
                        <a href={profileUrl(c.author.username)} className="font-semibold mr-1.5 hover:underline">{c.author.name}</a>
                        <span className="whitespace-pre-wrap break-words text-purple-50/90">{c.text}</span>
                        <div className="text-[11px] text-purple-300/50 mt-0.5 flex gap-3">{ago(c.at)}
                          {c.can_delete && <button onClick={() => removeComment(c)} className="hover:text-rose-300" aria-label="Delete comment">Delete</button>}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {err && <div role="alert" className="text-sm text-rose-400">{err}</div>}
        </div>
        {!editing && (
          <div className="border-t border-purple-800/40">
            <div className="flex items-center gap-1 px-3 pt-2">
              <button onClick={like} aria-pressed={post.liked} aria-label={post.liked ? "Unlike" : "Like"} data-testid="post-like"
                className={`p-2 rounded-lg hover:bg-purple-800/30 ${post.liked ? "text-rose-500" : "text-purple-100"}`}>
                <Heart size={22} className={post.liked ? "fill-rose-500" : ""} /></button>
              {post.comments_setting !== "off" && (
                <button onClick={() => commentBox.current?.focus()} aria-label="Comment" disabled={!post.can_comment}
                  className="p-2 rounded-lg hover:bg-purple-800/30 text-purple-100 disabled:opacity-40"><MessageCircle size={22} /></button>
              )}
              {shareable && <button onClick={() => setSharingOpen(true)} aria-label="Share" data-testid="post-share" className="p-2 rounded-lg hover:bg-purple-800/30 text-purple-100"><Share2 size={21} /></button>}
              {post.mine && (
                <div className="ml-auto flex gap-1">
                  <button className="p-2 rounded-lg hover:bg-purple-800/30 text-purple-200" onClick={() => setEditing(true)} aria-label="Edit post" data-testid="post-edit"><Pencil size={17} /></button>
                  <button className={`p-2 rounded-lg hover:bg-purple-800/30 ${confirm ? "text-rose-300 text-xs font-semibold" : "text-purple-200"}`} data-testid="post-delete"
                    aria-label={confirm ? "Delete for good" : "Delete post"}
                    onClick={() => (confirm ? deletePost(uid, post.id).then(() => { onDeleted(post.id); onClose?.(); }, e => setErr(e.message)) : setConfirm(true))}>
                    {confirm ? "Delete for good?" : <Trash2 size={17} />}</button>
                </div>
              )}
            </div>
            <div className="px-5 pb-2 text-sm">
              <b data-testid="post-likes">{post.likes} like{post.likes === 1 ? "" : "s"}</b>
              {post.comments_setting !== "off" && <span className="text-purple-300/70"> · {post.comments} comment{post.comments === 1 ? "" : "s"}</span>}
              {post.shares > 0 && <span className="text-purple-300/70"> · {post.shares} share{post.shares === 1 ? "" : "s"}</span>}
            </div>
            {post.comments_setting === "off" ? <div className="px-5 pb-3 text-xs text-purple-300/60">Comments are off</div>
              : post.can_comment ? (
                <div className="flex items-end gap-2 px-4 pb-3" onKeyDown={e => e.stopPropagation()}>
                  <textarea ref={commentBox} value={text} onChange={e => setText(e.target.value.slice(0, 1000))} rows={1} placeholder="Add a comment…" data-testid="post-comment-input"
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    className="flex-1 bg-gray-900/60 border border-purple-700/50 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-purple-400" />
                  <button onClick={send} disabled={!text.trim() || sending} aria-label="Post comment" data-testid="post-comment-send" className={btn}><Send size={15} /></button>
                </div>
              ) : <div className="px-5 pb-3 text-xs text-purple-300/60">Only @{post.author.username}&apos;s followers can comment</div>}
          </div>
        )}
      </div>
    </div>
  );
  return (
    <>
      {inline ? body : <Shade onClose={() => { if (!sharingOpen) onClose?.(); }} label="Post" wide>{body}</Shade>}
      {sharingOpen && (
        <ShareDialog uid={uid} title="Share post" link={postUrl(post.id)} onClose={() => setSharingOpen(false)}
          onCopied={() => sharePost(uid, post.id, { link: true }).then(r => onChange({ ...post, shares: r.shares }), () => {})}
          onSend={(targets, note) => sharePost(uid, post.id, { targets, note }).then(r => onChange({ ...post, shares: r.shares }))} />
      )}
    </>
  );
}

// (the dialog form, for grids)
export const PostViewer = (props: { uid: string; post: Post; onClose: () => void; onChange: (p: Post) => void; onDeleted: (id: number) => void }) => <PostDetail {...props} />;

// The posts a query finds (or someone's), newest first, 24 at a time
export function PostsFeed({ uid, q = "", author, scope, refresh = 0, empty }: {
  uid: string; q?: string; author?: string; scope?: "following"; refresh?: number; empty: React.ReactNode;
}) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [more, setMore] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const query = useMemo(() => ({ q: q.trim() || undefined, author, scope }), [q, author, scope]);
  const load = useCallback((before?: number) => listPosts(uid, { ...query, before }).then(d => {
    setPosts(cur => (before && cur ? [...cur, ...d.posts] : d.posts)); setMore(d.more); setErr(null);
  }, e => setErr(e.message)), [uid, query]);
  useEffect(() => {
    setPosts(null);
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [load, refresh]);
  if (err) return <div className="text-sm text-rose-400">{err}</div>;
  if (!posts) return <div className="text-purple-300 text-sm">Loading…</div>;
  if (!posts.length) return <>{empty}</>;
  const open = posts.find(p => p.id === openId) || null;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3" data-testid="post-grid">
        {posts.map(p => <Thumb key={p.id} uid={uid} p={p} onOpen={() => setOpenId(p.id)} />)}
      </div>
      {more && <div className="flex justify-center mt-4"><button className={ghost} onClick={() => load(posts[posts.length - 1].id)}>Load more</button></div>}
      {open && <PostViewer uid={uid} post={open} onClose={() => setOpenId(null)}
        onChange={p => setPosts(list => list && list.map(x => (x.id === p.id ? p : x)))}
        onDeleted={id => setPosts(list => list && list.filter(x => x.id !== id))} />}
    </>
  );
}

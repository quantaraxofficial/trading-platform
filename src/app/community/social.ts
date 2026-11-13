// People, profiles, follows, notifications and published scripts (backend core/social.py)

import { BACKEND } from "../lib/collab/session";
import { sessionKey } from "@/lib/backend";

export interface Person { username: string; name: string; bio: string; avatar?: string }   // avatar: the photo's address on the backend ("" = initials)
export interface SearchPerson extends Person { followers: number; scripts: number; is_me: boolean; i_follow: boolean }
export interface PublishedScript {
  id: number; name: string; kind: "indicator" | "strategy"; language: "pine" | "python" | "mql5"; description: string;
  visibility: "public" | "private"; version: number; uses: number; author: Person; mine: boolean; source_key: string | null;
  created_at: number; updated_at: number; invited?: Person[]; code?: string;
  // who may read its code: everyone who can use it, only the author, or the author and code_viewers
  code_access: CodeAccess; can_view_code: boolean; code_viewers?: Person[];
  compiled?: unknown;   // instead of the code, for someone who may not read it (Pine Script)
}
export type CodeAccess = "open" | "hidden" | "allowed";
export interface ProfileStats { label: string; currency: string; metrics: Record<string, number>; equity: [number, number][]; updated_at: number | null; shown: boolean }
export interface Profile extends Person {
  joined: number; is_me: boolean; followers: number; following: number; i_follow: boolean; follows_me: boolean;
  links: SocialLink[]; posts: number;   // links to their other social media; the posts you may see
  can_message: boolean; can_invite: boolean; scripts: PublishedScript[];
  stats?: ProfileStats;
  backtests?: { shown: boolean; items: { name: string; symbol: string; timeframe: string; language: string; trades: number; net: number; return_pct: number | null; period_from: number | null; period_to: number | null }[] };
  sessions?: { shown: boolean; items: { name: string; symbol: string; timeframe: string; status: string; trades: number; wins: number; net: number; return_pct: number | null; time_spent: number }[] };
}
export type Privacy = "everyone" | "following" | "nobody";
export interface MySettings extends Person {
  show_trading_stats: boolean; show_backtests: boolean; show_sessions: boolean; allow_messages: Privacy; allow_invites: Privacy; stats_updated_at: number | null;
  links: SocialLink[];
}
export interface Notice { id: number; kind: string; text: string; data: Record<string, any>; read: boolean; at: number; actor: Person | null }

async function call<T>(uid: string, rest: string, method = "GET", body?: unknown, query = ""): Promise<T> {
  const res = await fetch(`${BACKEND}/api/users/social/${encodeURIComponent(uid)}/${rest}?session_key=${encodeURIComponent(sessionKey())}${query}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}
const u = (s: string) => encodeURIComponent(s.replace(/^@/, "").toLowerCase());

export const searchPeople = (uid: string, q: string) => call<{ people: SearchPerson[] }>(uid, "search/", "GET", undefined, `&q=${encodeURIComponent(q)}`).then(d => d.people);
export const getProfile = (uid: string, username: string) => call<{ profile: Profile }>(uid, `people/${u(username)}/`).then(d => d.profile);
export const followPerson = (uid: string, username: string, on: boolean) => call<{ i_follow: boolean; followers: number }>(uid, `people/${u(username)}/follow/`, on ? "POST" : "DELETE");
export const followList = (uid: string, username: string, which: "followers" | "following") =>
  call<{ people: Person[] }>(uid, `people/${u(username)}/follows/`, "GET", undefined, `&which=${which}`).then(d => d.people);
export const messagePerson = (uid: string, username: string) => call<{ token: string }>(uid, `people/${u(username)}/message/`, "POST").then(d => d.token);
export const inviteOptions = (uid: string, username: string) =>
  call<{ collabs: { token: string; name: string; kind: string; member: boolean; can_editor: boolean }[]; allowed: boolean }>(uid, `people/${u(username)}/invite/`);
export const invitePerson = (uid: string, username: string, token: string, role: "editor" | "viewer") =>
  call<{ ok: boolean; collab: string; role: string }>(uid, `people/${u(username)}/invite/`, "POST", { token, role });
export const mySettings = (uid: string) => call<{ me: MySettings }>(uid, "me/").then(d => d.me);
export const updateMySettings = (uid: string, patch: Partial<MySettings>) => call<{ me: MySettings }>(uid, "me/", "PATCH", patch).then(d => d.me);
export const putMyStats = (uid: string, s: { label: string; currency: string; metrics: Record<string, number>; equity: [number, number][] }) => call(uid, "me/stats/", "PUT", s);
export const deleteMyStats = (uid: string) => call(uid, "me/stats/", "DELETE");
export const getNotifications = (uid: string) => call<{ unread: number; items: Notice[] }>(uid, "notifications/");
export const markNotificationsRead = (uid: string, ids?: number[]) => call<{ unread: number; items: Notice[] }>(uid, "notifications/", "POST", ids ? { ids } : {});
export type ScriptScope = "community" | "following" | "shared" | "mine";
export const listScripts = (uid: string, scope: ScriptScope, opts: { kind?: string; q?: string; sort?: "top" | "new" } = {}) =>
  call<{ scripts: PublishedScript[] }>(uid, "scripts/", "GET", undefined,
    `&scope=${scope}${opts.kind ? `&kind=${opts.kind}` : ""}${opts.q ? `&q=${encodeURIComponent(opts.q)}` : ""}${opts.sort ? `&sort=${opts.sort}` : ""}`).then(d => d.scripts);
export const getScript = (uid: string, id: number, use = false) => call<{ script: PublishedScript }>(uid, `scripts/${id}/`, "GET", undefined, use ? "&use=1" : "").then(d => d.script);
export const publishScript = (uid: string, s: { source_key: string; name: string; kind: string; language: string; description: string; code: string; visibility: string; invite: string[]; code_access: CodeAccess; code_viewers: string[]; compiled: unknown }) =>
  call<{ script: PublishedScript; first: boolean }>(uid, "scripts/publish/", "POST", s);
export const updateScript = (uid: string, id: number, patch: { name?: string; description?: string; visibility?: string; invite?: string[]; code_access?: CodeAccess; code_viewers?: string[] }) =>
  call<{ script: PublishedScript }>(uid, `scripts/${id}/`, "PATCH", patch).then(d => d.script);
export const unpublishScript = (uid: string, id: number) => call(uid, `scripts/${id}/`, "DELETE");

// On the chart: add a published script (the chart page runs /?addScript=<id>), or open a chat
export const ADD_SCRIPT_EVENT = "tv:add-script";
export const chartUrlForScript = (id: number) => `/?addScript=${id}`;
export const chartUrlForChat = (token: string) => `/?chat=${encodeURIComponent(token)}`;
export const profileUrl = (username: string) => `/u/${encodeURIComponent(username)}`;
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

// ---- profile photo, social links and posts (backend core/posts.py)
export type LinkKind = "instagram" | "x" | "youtube" | "tiktok" | "telegram" | "facebook" | "linkedin" | "discord" | "threads" | "website";
export interface SocialLink { kind: LinkKind; url: string; label?: string }
// How each is shown: a short badge in the network's colour (no brand artwork)
export const LINK_KINDS: { kind: LinkKind; label: string; short: string; color: string; hint: string }[] = [
  { kind: "instagram", label: "Instagram", short: "IG", color: "#d62976", hint: "@handle or link" },
  { kind: "x", label: "X", short: "X", color: "#3f3f46", hint: "@handle or link" },
  { kind: "youtube", label: "YouTube", short: "YT", color: "#e11d20", hint: "@channel or link" },
  { kind: "tiktok", label: "TikTok", short: "TT", color: "#0e7490", hint: "@handle or link" },
  { kind: "telegram", label: "Telegram", short: "TG", color: "#229ed9", hint: "@channel or link" },
  { kind: "facebook", label: "Facebook", short: "FB", color: "#1877f2", hint: "page name or link" },
  { kind: "linkedin", label: "LinkedIn", short: "in", color: "#0a66c2", hint: "profile name or link" },
  { kind: "discord", label: "Discord", short: "DC", color: "#5865f2", hint: "invite code or link" },
  { kind: "threads", label: "Threads", short: "@", color: "#52525b", hint: "@handle or link" },
  { kind: "website", label: "Website", short: "WWW", color: "#7c3aed", hint: "yoursite.com" },
];
export const avatarSrc = (path?: string) => (path ? `${BACKEND}${path}` : "");

export interface PostMediaItem { id: number; kind: "image" | "video"; mime: string; width: number | null; height: number | null }
export type CommentsSetting = "everyone" | "followers" | "off";
export interface Post {
  id: number; caption: string; visibility: "public" | "followers"; author: Person; mine: boolean; created_at: number; edited: boolean;
  media: PostMediaItem[];
  // its settings (who may comment, whether it may be shared) and what people did with it
  comments_setting: CommentsSetting; allow_sharing: boolean; can_comment: boolean;
  likes: number; liked: boolean; comments: number; shares: number;
}
export interface PostComment { id: number; text: string; author: Person; at: number; can_delete: boolean }
// A chat to share into: a personal chat or a group chat (kind group), or a collab
export interface ShareTarget { kind: "group" | "collab"; token: string; name: string; personal: boolean }
export const mediaUrl = (uid: string, postId: number, mediaId: number) =>
  `${BACKEND}/api/users/social/${encodeURIComponent(uid)}/posts/${postId}/media/${mediaId}/?session_key=${encodeURIComponent(sessionKey())}`;

async function upload<T>(uid: string, rest: string, form: FormData, method = "POST", onProgress?: (f: number) => void): Promise<T> {
  // (XMLHttpRequest: fetch can't report an upload's progress)
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, `${BACKEND}/api/users/social/${encodeURIComponent(uid)}/${rest}?session_key=${encodeURIComponent(sessionKey())}`);
    if (onProgress) x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => {
      let data: any = {};
      try { data = JSON.parse(x.responseText || "{}"); } catch { /* not JSON */ }
      if (x.status >= 200 && x.status < 300) resolve(data as T);
      else reject(new Error(data?.error || (x.status === 413 ? "That's too large to upload" : `Upload failed (${x.status})`)));
    };
    x.onerror = () => reject(new Error("The upload didn't get through: check the connection"));
    x.send(form);
  });
}
export function uploadAvatar(uid: string, file: File) {
  const f = new FormData(); f.append("file", file);
  return upload<{ avatar: string }>(uid, "me/avatar/", f).then(d => d.avatar);
}
export const removeAvatar = (uid: string) => call<{ avatar: string }>(uid, "me/avatar/", "DELETE").then(d => d.avatar);
export function createPost(uid: string, p: { caption: string; visibility: Post["visibility"]; comments: CommentsSetting; allow_sharing: boolean; files: File[] }, onProgress?: (f: number) => void) {
  const f = new FormData();
  f.append("caption", p.caption); f.append("visibility", p.visibility);
  f.append("comments", p.comments); f.append("allow_sharing", String(p.allow_sharing));
  p.files.forEach(file => f.append("files", file));
  return upload<{ post: Post }>(uid, "posts/", f, "POST", onProgress).then(d => d.post);
}
export const listPosts = (uid: string, o: { q?: string; author?: string; scope?: "following"; before?: number } = {}) =>
  call<{ posts: Post[]; more: boolean }>(uid, "posts/", "GET", undefined,
    `${o.q ? `&q=${encodeURIComponent(o.q)}` : ""}${o.author ? `&author=${encodeURIComponent(o.author)}` : ""}${o.scope ? `&scope=${o.scope}` : ""}${o.before ? `&before=${o.before}` : ""}`);
export const getPost = (uid: string, id: number) => call<{ post: Post }>(uid, `posts/${id}/`).then(d => d.post);
export const updatePost = (uid: string, id: number, patch: { caption?: string; visibility?: Post["visibility"]; comments?: CommentsSetting; allow_sharing?: boolean }) => call<{ post: Post }>(uid, `posts/${id}/`, "PATCH", patch).then(d => d.post);
export const deletePost = (uid: string, id: number) => call(uid, `posts/${id}/`, "DELETE");
export const postsSearchUrl = (q: string) => `/community?tab=posts&q=${encodeURIComponent(q)}`;
export const postUrl = (id: number) => `/p/${id}`;
export const likePost = (uid: string, id: number, on: boolean) => call<{ liked: boolean; likes: number }>(uid, `posts/${id}/like/`, on ? "POST" : "DELETE");
export const listComments = (uid: string, id: number) => call<{ comments: PostComment[]; can_comment: boolean; setting: CommentsSetting }>(uid, `posts/${id}/comments/`);
export const addComment = (uid: string, id: number, text: string) => call<{ comment: PostComment; comments: number }>(uid, `posts/${id}/comments/`, "POST", { text });
export const deleteComment = (uid: string, id: number, cid: number) => call(uid, `posts/${id}/comments/${cid}/`, "DELETE");
export const shareTargets = (uid: string) => call<{ targets: ShareTarget[] }>(uid, "share-targets/").then(d => d.targets);
export const sharePost = (uid: string, id: number, body: { targets?: { kind: string; token: string }[]; note?: string; link?: boolean }) =>
  call<{ sent?: number; shares: number }>(uid, `posts/${id}/share/`, "POST", body);
export const shareProfile = (uid: string, username: string, body: { targets: { kind: string; token: string }[]; note?: string }) =>
  call<{ sent: number }>(uid, `people/${u(username)}/share/`, "POST", body);

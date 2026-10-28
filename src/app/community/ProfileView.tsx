"use client";

// Someone's profile: who they are, follow / message / invite them to a collab (as their privacy
// allows), the scripts they've published that you can see, and — if they've chosen to show them —
// their trading stats, saved strategy backtests and backtest sessions. On your own profile: edit
// it, choose what it shows and who may message or invite you, and manage your published scripts.

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Activity, Code2, FlaskConical, MessageCircle, Settings2, UserPlus, Users, X } from "lucide-react";
import { Card, EquityChart, Empty, Label } from "../analytics/ui";
import { money, pnlClass } from "../analytics/stats";
import CommunityShell, { Avatar } from "./CommunityShell";
import { ScriptCard } from "./CommunityApp";
import {
  chartUrlForChat, followList, followPerson, getProfile, inviteOptions, invitePerson, messagePerson, mySettings, profileUrl,
  unpublishScript, updateMySettings, updateScript, deleteMyStats, type CodeAccess, type MySettings, type Person, type Privacy, type Profile, type PublishedScript,
} from "./social";

const btn = "px-3 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5";
const ghost = "px-3 py-2 rounded-lg text-sm border border-purple-700/50 text-purple-100 hover:bg-purple-800/30 disabled:opacity-50 inline-flex items-center gap-1.5";
const field = "w-full bg-gray-900/50 border border-purple-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-purple-500/70 focus:outline-none focus:border-purple-500";

export default function ProfileView() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(String(params?.username || ""));
  return (
    <CommunityShell title={`@${username}`} active="other">
      {uid => <ProfileBody uid={uid} username={username} />}
    </CommunityShell>
  );
}

function ProfileBody({ uid, username }: { uid: string; username: string }) {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [list, setList] = useState<"followers" | "following" | null>(null);
  const load = useCallback(() => getProfile(uid, username).then(setP, e => setError(e.message)), [uid, username]);
  useEffect(() => { load(); }, [load]);
  if (error) return <Card><Empty>{error}</Empty></Card>;
  if (!p) return <Card><Empty>Loading…</Empty></Card>;
  const follow = async () => {
    const r = await followPerson(uid, p.username, !p.i_follow);
    setP({ ...p, i_follow: r.i_follow, followers: r.followers });
  };
  const message = async () => {
    setNote(null);
    // The tab opens on the click itself (browsers block one opened after waiting for the server)
    const tab = window.open("about:blank", "_blank");
    try {
      const url = chartUrlForChat(await messagePerson(uid, p.username));
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (e: any) { tab?.close(); setNote({ ok: false, text: e.message }); }
  };
  return (
    <div className="space-y-5" data-testid="profile">
      <Card pad={false}>
        <div className="p-6 flex flex-wrap items-center gap-5">
          <Avatar name={p.name} size={76} />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold text-white" data-testid="profile-name">{p.name}</h2>
            <div className="text-purple-300/80 text-sm">@{p.username} · joined {new Date(p.joined).toLocaleDateString([], { month: "long", year: "numeric" })}{p.follows_me ? " · follows you" : ""}</div>
            {p.bio && <p className="text-purple-100/90 mt-2 max-w-2xl" data-testid="profile-bio">{p.bio}</p>}
            <div className="flex gap-4 mt-3 text-sm">
              <button onClick={() => setList("followers")} className="text-purple-200 hover:text-white"><b className="text-white" data-testid="profile-followers">{p.followers}</b> follower{p.followers === 1 ? "" : "s"}</button>
              <button onClick={() => setList("following")} className="text-purple-200 hover:text-white"><b className="text-white">{p.following}</b> following</button>
              <span className="text-purple-200"><b className="text-white">{p.scripts.filter(s => s.visibility === "public").length}</b> public scripts</span>
            </div>
          </div>
          {!p.is_me && (
            <div className="flex flex-wrap gap-2">
              <button className={p.i_follow ? ghost : btn} onClick={follow} data-testid="profile-follow"><Users size={15} />{p.i_follow ? "Following" : "Follow"}</button>
              <button className={ghost} onClick={message} disabled={!p.can_message} title={p.can_message ? "Open a private chat" : `${p.name} doesn't take messages from you`} data-testid="profile-message"><MessageCircle size={15} />Message</button>
              <button className={ghost} onClick={() => setInviting(true)} disabled={!p.can_invite} title={p.can_invite ? "Add them to one of your collabs" : `${p.name} doesn't take collab invites from you`} data-testid="profile-invite"><UserPlus size={15} />Invite to collab</button>
            </div>
          )}
        </div>
        {note && <div className={`px-6 pb-4 text-sm ${note.ok ? "text-emerald-300" : "text-rose-400"}`} data-testid="profile-note">{note.text}</div>}
      </Card>

      {p.is_me && <EditProfile uid={uid} onSaved={u => { if (u !== p.username) window.location.href = profileUrl(u); else load(); }} />}

      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2"><Code2 size={18} className="text-purple-400" />Scripts</h3>
        {p.scripts.length === 0 ? <Card><Empty>{p.is_me ? "Publish an indicator or strategy from the Pine editor (Publish script)" : "No published scripts yet"}</Empty></Card> : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {p.scripts.map(s => p.is_me ? <MyScript key={s.id} uid={uid} s={s} onChange={load} /> : <ScriptCard key={s.id} s={s} showAuthor={false} />)}
          </div>
        )}
      </section>

      {p.stats && <StatsSection s={p.stats} isMe={p.is_me} onRemove={async () => { await deleteMyStats(uid); load(); }} />}
      {p.is_me && !p.stats && <Card title="Trading stats"><Empty icon={<Activity size={20} />}>Show your trading results here: in Analytics → Performance, pick the account and press <b className="text-purple-100">Show on my profile</b>.</Empty></Card>}

      {p.backtests && (p.backtests.items.length > 0 || p.is_me) && (
        <Card title={<span className="flex items-center gap-2"><FlaskConical size={16} className="text-purple-400" />Strategy backtests {p.is_me && !p.backtests.shown && <Hidden />}</span>} pad={false}>
          {p.backtests.items.length === 0 ? <Empty>None saved yet</Empty> : (
            <Table cols={["Backtest", "Symbol", "Timeframe", "Trades", "Net", "Return"]} rows={p.backtests.items.map(b => [
              b.name, b.symbol, b.timeframe || "—", b.trades, <span key="n" className={pnlClass(b.net)}>{money(b.net, "USD", true)}</span>,
              b.return_pct != null ? <span key="r" className={pnlClass(b.return_pct)}>{b.return_pct}%</span> : "—"])} testId="profile-backtests" />
          )}
        </Card>
      )}
      {p.sessions && (p.sessions.items.length > 0 || p.is_me) && (
        <Card title={<span className="flex items-center gap-2"><FlaskConical size={16} className="text-purple-400" />Backtest sessions {p.is_me && !p.sessions.shown && <Hidden />}</span>} pad={false}>
          {p.sessions.items.length === 0 ? <Empty>No sessions yet</Empty> : (
            <Table cols={["Session", "Symbol", "Timeframe", "Status", "Trades", "Win rate", "Net", "Return"]} rows={p.sessions.items.map(s => [
              s.name, s.symbol, s.timeframe, <span key="s" className="capitalize">{s.status}</span>, s.trades, s.trades ? `${Math.round(s.wins / s.trades * 100)}%` : "—",
              <span key="n" className={pnlClass(s.net)}>{money(s.net, "USD", true)}</span>, s.return_pct != null ? <span key="r" className={pnlClass(s.return_pct)}>{s.return_pct}%</span> : "—"])} testId="profile-sessions" />
          )}
        </Card>
      )}

      {inviting && <InviteDialog uid={uid} p={p} onClose={() => setInviting(false)} onDone={t => { setInviting(false); setNote({ ok: true, text: t }); }} />}
      {list && <PeopleDialog uid={uid} username={p.username} which={list} onClose={() => setList(null)} />}
    </div>
  );
}

const Hidden = () => <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-700/50">Only you see this</span>;

function Table({ cols, rows, testId }: { cols: string[]; rows: React.ReactNode[][]; testId?: string }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm" data-testid={testId}>
      <thead><tr className="text-[11px] uppercase tracking-wider text-purple-300/60">{cols.map(c => <th key={c} className="text-left font-semibold px-5 py-2">{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-purple-800/20">{r.map((c, j) => <td key={j} className={`px-5 py-2.5 ${j === 0 ? "text-white font-medium" : "text-purple-100"}`}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

function StatsSection({ s, isMe, onRemove }: { s: NonNullable<Profile["stats"]>; isMe: boolean; onRemove: () => void }) {
  const m = s.metrics;
  const f = (v: number | undefined, kind: "money" | "pct" | "num" | "ratio") =>
    v == null ? "—" : kind === "money" ? money(v, s.currency, true) : kind === "pct" ? `${v.toFixed(1)}%` : kind === "ratio" ? (Number.isFinite(v) ? v.toFixed(2) : "∞") : String(v);
  const items: [string, string, string?][] = [
    ["Total P&L", f(m.totalPnl, "money"), pnlClass(m.totalPnl ?? 0)], ["Win rate", f(m.winRate, "pct")], ["Profit factor", f(m.profitFactor, "ratio")],
    ["Expectancy", f(m.expectancy, "money"), pnlClass(m.expectancy ?? 0)], ["Trades", f(m.trades, "num")], ["Max drawdown", f(m.maxDrawdown, "money"), "text-rose-400"],
    ["Avg winner", f(m.avgWin, "money"), "text-emerald-400"], ["Avg loser", f(m.avgLoss, "money"), "text-rose-400"],
  ];
  return (
    <Card title={<span className="flex items-center gap-2"><Activity size={16} className="text-purple-400" />Trading stats {isMe && !s.shown && <Hidden />}</span>}
      subtitle={`${s.label}${s.updated_at ? ` · updated ${new Date(s.updated_at).toLocaleDateString()}` : ""}`}
      right={isMe ? <button className="text-xs text-purple-300 hover:text-white" onClick={onRemove}>Remove</button> : undefined}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="profile-stats">
        {items.map(([l, v, cls]) => (
          <div key={l} className="rounded-xl p-3 bg-purple-950/30 border border-purple-800/30">
            <Label>{l}</Label><div className={`mt-1 text-lg font-bold tabular-nums ${cls || "text-white"}`}>{v}</div>
          </div>
        ))}
      </div>
      {s.equity.length >= 2 && <div className="mt-4"><EquityChart points={s.equity.map(([t, e]) => ({ time: t, equity: e, drawdown: 0, drawdownPct: null }))} mode="equity" format={v => money(v, s.currency)} height={180} /></div>}
    </Card>
  );
}

function MyScript({ uid, s, onChange }: { uid: string; s: PublishedScript; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const run = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); onChange(); } finally { setBusy(false); } };
  return (
    <div className="flex flex-col gap-2">
      <ScriptCard s={s} showAuthor={false} />
      {s.visibility === "private" && s.invited && s.invited.length > 0 && <div className="text-xs text-purple-300/70 px-1">Shared with {s.invited.map(i => `@${i.username}`).join(", ")}</div>}
      <CodeAccessControl uid={uid} s={s} onChange={onChange} />
      <div className="flex gap-2 px-1">
        <button className={ghost} disabled={busy} onClick={() => run(() => updateScript(uid, s.id, { visibility: s.visibility === "public" ? "private" : "public" }))} data-testid="script-visibility">
          Make {s.visibility === "public" ? "private" : "public"}</button>
        <button className={`${ghost} ${confirm ? "!border-rose-500 !text-rose-300" : ""}`} disabled={busy}
          onClick={() => (confirm ? run(() => unpublishScript(uid, s.id)) : setConfirm(true))}>{confirm ? "Unpublish?" : "Unpublish"}</button>
      </div>
    </div>
  );
}

// Who may read a script's code: anyone who can use it, only you, or people you choose
function CodeAccessControl({ uid, s, onChange }: { uid: string; s: PublishedScript; onChange: () => void }) {
  const [viewers, setViewers] = useState((s.code_viewers || []).map(v => `@${v.username}`).join(", "));
  const [err, setErr] = useState<string | null>(null);
  const save = async (code_access: CodeAccess, list?: string) => {
    setErr(null);
    try {
      await updateScript(uid, s.id, { code_access, ...(code_access === "allowed" ? { code_viewers: (list ?? viewers).split(/[\s,]+/).map(x => x.replace(/^@/, "")).filter(Boolean) } : {}) });
      onChange();
    } catch (e: any) { setErr(e.message); }
  };
  if (s.language !== "pine") return <div className="text-xs text-purple-300/60 px-1">Code: open (only Pine Script code can be hidden)</div>;
  return (
    <div className="px-1 space-y-1.5" data-testid="code-access">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-purple-300/70">Code:</span>
        <select value={s.code_access} onChange={e => save(e.target.value as CodeAccess)} data-script-code={s.id}
          className="bg-gray-900/60 border border-purple-700/50 rounded-md px-2 py-1 text-xs text-purple-100 focus:outline-none">
          <option value="open" className="bg-gray-900">Open to everyone who can use it</option>
          <option value="hidden" className="bg-gray-900">Hidden (only me)</option>
          <option value="allowed" className="bg-gray-900">Only people I choose</option>
        </select>
      </div>
      {s.code_access === "allowed" && (
        <div className="flex gap-2" onKeyDown={e => e.stopPropagation()}>
          <input value={viewers} onChange={e => setViewers(e.target.value)} placeholder="@asha_rao, @ben" className={`${field} !py-1 !text-xs`} />
          <button className={`${ghost} !py-1 !text-xs`} onClick={() => save("allowed")}>Save</button>
        </div>
      )}
      {err && <div className="text-xs text-rose-400">{err}</div>}
    </div>
  );
}

function EditProfile({ uid, onSaved }: { uid: string; onSaved: (username: string) => void }) {
  const [m, setM] = useState<MySettings | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { mySettings(uid).then(setM, e => setErr(e.message)); }, [uid]);
  if (!m) return null;
  const save = async () => {
    setErr(null);
    try { const r = await updateMySettings(uid, m); setOpen(false); onSaved(r.username); } catch (e: any) { setErr(e.message); }
  };
  const privacy = (key: "allow_messages" | "allow_invites", label: string) => (
    <label><Label>{label}</Label>
      <select className={`${field} mt-1`} value={m[key]} onChange={e => setM({ ...m, [key]: e.target.value as Privacy })} data-testid={`edit-${key}`}>
        <option value="everyone" className="bg-gray-900">Everyone</option><option value="following" className="bg-gray-900">People I follow</option><option value="nobody" className="bg-gray-900">Nobody</option>
      </select></label>
  );
  const toggle = (key: "show_trading_stats" | "show_backtests" | "show_sessions", label: string) => (
    <button onClick={() => setM({ ...m, [key]: !m[key] })} data-testid={`edit-${key}`}
      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-sm text-left ${m[key] ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-100" : "border-purple-800/50 text-purple-200"}`}>
      {label}<span className="text-xs font-semibold">{m[key] ? "Shown" : "Hidden"}</span></button>
  );
  return (
    <Card title={<span className="flex items-center gap-2"><Settings2 size={16} className="text-purple-400" />Your profile</span>}
      subtitle="What others see, and who can reach you" right={!open ? <button className={ghost} onClick={() => setOpen(true)} data-testid="edit-profile">Edit profile</button> : undefined}>
      {!open ? (
        <div className="text-sm text-purple-200/90 flex flex-wrap gap-x-6 gap-y-1">
          <span>Trading stats: <b>{m.show_trading_stats ? "shown" : "hidden"}</b></span><span>Backtests: <b>{m.show_backtests ? "shown" : "hidden"}</b></span>
          <span>Sessions: <b>{m.show_sessions ? "shown" : "hidden"}</b></span><span>Messages from: <b>{m.allow_messages}</b></span><span>Collab invites from: <b>{m.allow_invites}</b></span>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4" onKeyDown={e => e.stopPropagation()}>
          <label><Label>Username</Label><input className={`${field} mt-1`} value={m.username} onChange={e => setM({ ...m, username: e.target.value })} data-testid="edit-username" /></label>
          <label><Label>Bio</Label><input className={`${field} mt-1`} value={m.bio} maxLength={300} onChange={e => setM({ ...m, bio: e.target.value })} placeholder="What you trade, your style…" data-testid="edit-bio" /></label>
          <div className="md:col-span-2"><Label>On my profile</Label>
            <div className="grid sm:grid-cols-3 gap-2 mt-1">{toggle("show_trading_stats", "Trading stats")}{toggle("show_backtests", "Strategy backtests")}{toggle("show_sessions", "Backtest sessions")}</div></div>
          {privacy("allow_messages", "Who can message me")}
          {privacy("allow_invites", "Who can invite me to collabs")}
          {err && <div className="md:col-span-2 text-sm text-rose-400">{err}</div>}
          <div className="md:col-span-2 flex gap-2 justify-end"><button className={ghost} onClick={() => setOpen(false)}>Cancel</button><button className={btn} onClick={save} data-testid="edit-save">Save</button></div>
        </div>
      )}
    </Card>
  );
}

function Modal({ title, onClose, children, testId }: { title: string; onClose: () => void; children: React.ReactNode; testId?: string }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} data-testid={testId} className="w-full max-w-md max-h-[80vh] overflow-y-auto bg-black/85 border border-purple-800/60 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center mb-4"><h2 className="text-lg font-bold flex-1">{title}</h2><button aria-label="Close" onClick={onClose} className="text-purple-300 hover:text-white"><X size={20} /></button></div>
        {children}
      </div>
    </div>
  );
}

function InviteDialog({ uid, p, onClose, onDone }: { uid: string; p: Profile; onClose: () => void; onDone: (text: string) => void }) {
  const [opts, setOpts] = useState<Awaited<ReturnType<typeof inviteOptions>> | null>(null);
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { inviteOptions(uid, p.username).then(setOpts, e => setErr(e.message)); }, [uid, p.username]);
  return (
    <Modal title={`Invite ${p.name} to a collab`} onClose={onClose} testId="invite-dialog">
      {!opts ? <div className="text-purple-300 text-sm">{err || "Loading…"}</div> : opts.collabs.length === 0 ? (
        <div className="text-purple-300 text-sm">You have no collab you can add people to. Start one from the chart (the Collab button).</div>
      ) : (
        <>
          <div className="flex gap-2 mb-3 text-sm"><span className="text-purple-300">As</span>
            {(["viewer", "editor"] as const).map(r => <button key={r} onClick={() => setRole(r)} className={`px-2.5 py-1 rounded-lg capitalize ${role === r ? "bg-purple-600 text-white" : "border border-purple-700/50 text-purple-200"}`}>{r}</button>)}</div>
          <div className="space-y-2">
            {opts.collabs.map(c => (
              <button key={c.token} disabled={c.member} data-collab={c.token} onClick={async () => {
                setErr(null);
                try { const r = await invitePerson(uid, p.username, c.token, role === "editor" && !c.can_editor ? "viewer" : role); onDone(`Added ${p.name} to ${r.collab} as ${r.role}`); }
                catch (e: any) { setErr(e.message); }
              }} className="w-full text-left px-4 py-3 rounded-xl border border-purple-800/50 hover:border-purple-500/60 disabled:opacity-50 flex items-center gap-3">
                <span className="flex-1 text-white">{c.name}</span><span className="text-xs text-purple-300/70">{c.member ? "already in it" : c.kind}</span>
              </button>
            ))}
          </div>
          {role === "editor" && <p className="text-xs text-purple-300/60 mt-2">Only collabs you own can add editors; others add them as viewers.</p>}
          {err && <div className="text-sm text-rose-400 mt-3">{err}</div>}
        </>
      )}
    </Modal>
  );
}

function PeopleDialog({ uid, username, which, onClose }: { uid: string; username: string; which: "followers" | "following"; onClose: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  useEffect(() => { followList(uid, username, which).then(setPeople, () => setPeople([])); }, [uid, username, which]);
  return (
    <Modal title={which === "followers" ? "Followers" : "Following"} onClose={onClose} testId="people-dialog">
      {!people ? <div className="text-purple-300 text-sm">Loading…</div> : people.length === 0 ? <div className="text-purple-300 text-sm">Nobody yet</div> : (
        <div className="space-y-2">{people.map(x => (
          <a key={x.username} href={profileUrl(x.username)} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-purple-800/25">
            <Avatar name={x.name} size={36} /><div><div className="text-white text-sm font-medium">{x.name}</div><div className="text-xs text-purple-300/70">@{x.username}</div></div></a>
        ))}</div>
      )}
    </Modal>
  );
}

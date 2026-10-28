"use client";

// Community search: people by name or @username, and published indicators / strategies by name,
// description or author.

import React, { useEffect, useState } from "react";
import { Code2, Search, Users } from "lucide-react";
import { Card, Empty, Pills } from "../analytics/ui";
import CommunityShell, { Avatar } from "./CommunityShell";
import { chartUrlForScript, followPerson, listScripts, profileUrl, searchPeople, type PublishedScript, type SearchPerson } from "./social";

type Tab = "people" | "indicator" | "strategy";

export function ScriptCard({ s, showAuthor = true }: { s: PublishedScript; showAuthor?: boolean }) {
  return (
    <div className="bg-black/50 backdrop-blur-xl border border-purple-800/40 rounded-2xl p-5 flex flex-col gap-3" data-testid="script-card" data-script={s.id}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.kind === "strategy" ? "bg-gradient-to-br from-emerald-600 to-teal-600" : "bg-gradient-to-br from-purple-600 to-indigo-600"}`}><Code2 size={18} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-white font-semibold truncate">{s.name}</div>
          <div className="text-xs text-purple-300/70 mt-0.5 flex flex-wrap gap-x-2">
            <span className="capitalize">{s.kind}</span><span>· {s.language === "pine" ? "Pine Script" : s.language === "python" ? "Python" : "MQL5"}</span>
            <span>· v{s.version}</span><span>· {s.uses} use{s.uses === 1 ? "" : "s"}</span>
          </div>
        </div>
        {s.visibility === "private" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">Private</span>}
        {s.code_access !== "open" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-200 border border-purple-500/30" title={s.can_view_code ? "You can see its code" : "Its author keeps the code hidden"}>{s.can_view_code ? "Code shared with you" : "Code hidden"}</span>}
      </div>
      {s.description && <p className="text-sm text-purple-100/80 line-clamp-3">{s.description}</p>}
      <div className="flex items-center gap-2 mt-auto">
        {showAuthor && <a href={profileUrl(s.author.username)} className="flex items-center gap-2 min-w-0 flex-1 hover:underline" data-testid="script-author">
          <Avatar name={s.author.name} size={24} /><span className="text-sm text-purple-200 truncate">{s.author.name}</span></a>}
        {!showAuthor && <span className="flex-1 text-xs text-purple-300/60">Updated {new Date(s.updated_at).toLocaleDateString()}</span>}
        <a href={chartUrlForScript(s.id)} target="_blank" rel="noreferrer" data-testid="script-add"
          className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 font-semibold whitespace-nowrap">Add to chart</a>
      </div>
    </div>
  );
}

export function PersonCard({ uid, p, onChange }: { uid: string; p: SearchPerson; onChange?: (p: SearchPerson) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="bg-black/50 backdrop-blur-xl border border-purple-800/40 rounded-2xl p-5 flex items-center gap-4" data-testid="person-card" data-username={p.username}>
      <a href={profileUrl(p.username)}><Avatar name={p.name} size={48} /></a>
      <div className="min-w-0 flex-1">
        <a href={profileUrl(p.username)} className="text-white font-semibold hover:underline truncate block">{p.name}</a>
        <div className="text-xs text-purple-300/70">@{p.username} · {p.followers} follower{p.followers === 1 ? "" : "s"} · {p.scripts} script{p.scripts === 1 ? "" : "s"}</div>
        {p.bio && <div className="text-sm text-purple-100/80 mt-1 line-clamp-2">{p.bio}</div>}
      </div>
      {!p.is_me && (
        <button disabled={busy} data-testid="person-follow" onClick={async () => {
          setBusy(true);
          try { const r = await followPerson(uid, p.username, !p.i_follow); onChange?.({ ...p, i_follow: r.i_follow, followers: r.followers }); } finally { setBusy(false); }
        }} className={p.i_follow ? "px-3 py-1.5 rounded-lg text-sm border border-purple-600/60 text-purple-100 hover:bg-purple-800/30" : "px-3 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"}>
          {p.i_follow ? "Following" : "Follow"}</button>
      )}
    </div>
  );
}

export default function CommunityApp() {
  return (
    <CommunityShell title="Community" hint="Find traders and the indicators and strategies they publish" active="search">
      {uid => <SearchView uid={uid} />}
    </CommunityShell>
  );
}

function SearchView({ uid }: { uid: string }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("people");
  const [people, setPeople] = useState<SearchPerson[] | null>(null);
  const [scripts, setScripts] = useState<PublishedScript[] | null>(null);
  useEffect(() => { const v = new URLSearchParams(window.location.search).get("q"); if (v) setQ(v); }, []);
  useEffect(() => {
    let gone = false;
    const t = setTimeout(() => {
      if (tab === "people") {
        if (!q.trim()) { setPeople(null); return; }
        searchPeople(uid, q.trim()).then(r => { if (!gone) setPeople(r); }, () => {});
      } else {
        listScripts(uid, "community", { kind: tab, q: q.trim() }).then(r => { if (!gone) setScripts(r); }, () => {});
      }
    }, 250);
    return () => { gone = true; clearTimeout(t); };
  }, [uid, q, tab]);
  return (
    <div className="space-y-5">
      <div className="relative max-w-2xl">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={tab === "people" ? "Search people by name or @username" : `Search ${tab === "indicator" ? "indicators" : "strategies"} by name or author`}
          data-testid="community-search" aria-label="Search"
          className="w-full bg-gray-900/60 border border-purple-700/50 rounded-xl pl-11 pr-4 py-3 text-white placeholder-purple-500/80 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20" />
      </div>
      <Pills value={tab} onChange={setTab} testId="community-tab" options={[{ id: "people", label: "People" }, { id: "indicator", label: "Indicators" }, { id: "strategy", label: "Strategies" }]} />
      {tab === "people" ? (
        !q.trim() ? <Card><Empty icon={<Users size={22} />}>Type a name or @username to find traders</Empty></Card>
          : people === null ? <Card><Empty>Searching…</Empty></Card>
          : people.length === 0 ? <Card><Empty>No one matches &ldquo;{q}&rdquo;</Empty></Card>
          : <div className="grid md:grid-cols-2 gap-4" data-testid="people-results">{people.map(p => <PersonCard key={p.username} uid={uid} p={p} onChange={np => setPeople(list => list && list.map(x => x.username === np.username ? np : x))} />)}</div>
      ) : (
        scripts === null ? <Card><Empty>Loading…</Empty></Card>
          : scripts.length === 0 ? <Card><Empty icon={<Code2 size={22} />}>No published {tab === "indicator" ? "indicators" : "strategies"}{q ? ` matching “${q}”` : " yet"}</Empty></Card>
          : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="script-results">{scripts.map(s => <ScriptCard key={s.id} s={s} />)}</div>
      )}
    </div>
  );
}

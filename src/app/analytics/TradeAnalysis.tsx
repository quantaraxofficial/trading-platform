"use client";

// One trade at a time: the list (outcome tabs with counts, symbol search, period, sort) and the
// selected trade — its figures, a quality score out of 100, how it compares with your average,
// feedback, and its journal (pre-trade plan, review, emotions, lessons, R:R notes, tags, the
// execution checklist and your 1–10 rating), saved to your account.

import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Download, ExternalLink, Info, LineChart, Search, Star, Tag, X } from "lucide-react";
import { downloadTradesCsv } from "./exporters";
import { CHECKLIST, saveJournal, clearJournal, type ATrade, type Journal, type Source } from "./data";
import { computeStats, duration, isLoss, isWin, money, periodStart, pnlClass, tradeQuality, type Period, type Stats } from "./stats";
import { Card, Empty, Label, Pills, Ring } from "./ui";

type OutcomeTab = "all" | "winners" | "losers" | "be";
type Sort = "date" | "pnl" | "symbol";
const PERIOD_OPTS: { id: Period | "week" | "month" | "year"; label: string }[] = [
  { id: "all", label: "All Time" }, { id: "today", label: "Today" }, { id: "week", label: "This Week" },
  { id: "month", label: "This Month" }, { id: "3m", label: "3 Months" }, { id: "year", label: "This Year" },
];
function since(p: string) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === "week") { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
  if (p === "month") { d.setDate(1); return d.getTime(); }
  if (p === "year") { d.setMonth(0, 1); return d.getTime(); }
  return periodStart(p as Period);
}
const outcomeOf = (t: ATrade) => (t.open ? "open" : isWin(t) ? "winner" : isLoss(t) ? "loser" : "be");

export default function TradeAnalysis({ uid, source, trades, journals, onJournal, currency = "USD", selectedKey, onSelect, exportName = "Trading" }: {
  uid: string; source: Source; trades: ATrade[]; journals: Record<string, Journal>; onJournal: (key: string, j: Journal | null) => void;
  currency?: string; selectedKey: string | null; onSelect: (key: string | null) => void; exportName?: string;
}) {
  const [tab, setTab] = useState<OutcomeTab>("all");
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState("all");
  const [sort, setSort] = useState<Sort>("date");
  const all = useMemo(() => computeStats(trades), [trades]);
  const inPeriod = useMemo(() => { const from = since(period); return trades.filter(t => (t.exitTime ?? t.entryTime) >= from); }, [trades, period]);
  const counts = useMemo(() => ({
    all: inPeriod.length, winners: inPeriod.filter(t => outcomeOf(t) === "winner").length,
    losers: inPeriod.filter(t => outcomeOf(t) === "loser").length, be: inPeriod.filter(t => outcomeOf(t) === "be").length,
  }), [inPeriod]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase().replace("/", "");
    const xs = inPeriod.filter(t => (tab === "all" || (tab === "winners" ? outcomeOf(t) === "winner" : tab === "losers" ? outcomeOf(t) === "loser" : outcomeOf(t) === "be"))
      && (!needle || t.symbol.toLowerCase().replace("/", "").includes(needle)));
    return xs.sort((a, b) => sort === "pnl" ? b.pnl - a.pnl : sort === "symbol" ? a.symbol.localeCompare(b.symbol) : (b.exitTime ?? b.entryTime) - (a.exitTime ?? a.entryTime));
  }, [inPeriod, tab, q, sort]);
  const selected = trades.find(t => t.key === selectedKey) || null;
  const fmt = (v: number, signed = false) => money(v, currency, signed);

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-5 items-start" data-testid="trade-analysis">
      <Card title="Trades" pad={false} className="lg:sticky lg:top-4"
        right={<button onClick={() => downloadTradesCsv(exportName, list, journals)} data-testid="ta-export-csv" title="The trades listed, with their journal, as CSV"
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-purple-700/50 text-purple-200 hover:bg-purple-800/30"><Download size={12} />CSV</button>}>
        <div className="px-4 pt-3 space-y-2.5">
          <Pills size="sm" value={tab} onChange={setTab} testId="ta-outcome" options={[
            { id: "all", label: <>All <span className="opacity-60">{counts.all}</span></> },
            { id: "winners", label: <>Winners <span className="opacity-60">{counts.winners}</span></> },
            { id: "losers", label: <>Losers <span className="opacity-60">{counts.losers}</span></> },
            { id: "be", label: <>BE <span className="opacity-60">{counts.be}</span></> },
          ]} />
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search symbol…" aria-label="Search trades by symbol" data-testid="ta-search"
              className="w-full bg-gray-900/50 border border-purple-700/50 rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder-purple-500 focus:outline-none focus:border-purple-500" />
            {q && <button aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-400 hover:text-white"><X size={14} /></button>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={period} onChange={e => setPeriod(e.target.value)} aria-label="Time period" className="bg-gray-900/50 border border-purple-700/50 rounded-lg px-2 py-1.5 text-sm text-purple-100 focus:outline-none">
              {PERIOD_OPTS.map(o => <option key={o.id} value={o.id} className="bg-gray-900">{o.label}</option>)}
            </select>
            <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort by" className="bg-gray-900/50 border border-purple-700/50 rounded-lg px-2 py-1.5 text-sm text-purple-100 focus:outline-none">
              <option value="date" className="bg-gray-900">Date</option><option value="pnl" className="bg-gray-900">P&L</option><option value="symbol" className="bg-gray-900">Symbol</option>
            </select>
          </div>
        </div>
        <div className="mt-3 max-h-[64vh] overflow-y-auto px-2 pb-2" data-testid="ta-list">
          {list.length ? list.map(t => {
            const o = outcomeOf(t), j = journals[t.key];
            return (
              <button key={t.key} onClick={() => onSelect(t.key)} data-key={t.key}
                className={`w-full text-left px-3 py-2.5 rounded-xl mb-1 border transition-all ${selectedKey === t.key ? "bg-purple-700/25 border-purple-500/60" : "border-transparent hover:bg-purple-800/20"}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${t.side === "long" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>{t.side}</span>
                  <span className="text-sm font-semibold text-white flex-1 truncate">{t.symbol}</span>
                  <span className={`text-sm font-semibold tabular-nums ${t.open ? "text-purple-300" : pnlClass(t.pnl)}`}>{t.open ? "Open" : fmt(t.pnl, true)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-purple-300/60">
                  <span>{new Date(t.exitTime ?? t.entryTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span>· {t.qty}</span>
                  {o === "winner" && <span className="text-emerald-400/80">· Winner</span>}
                  {o === "loser" && <span className="text-rose-400/80">· Loser</span>}
                  {o === "open" && <span>· Held</span>}
                  {j && <span className="ml-auto flex items-center gap-1 text-purple-300"><BookOpen size={11} />Journaled</span>}
                </div>
              </button>
            );
          }) : <Empty icon={<LineChart size={20} />}>No trades found</Empty>}
        </div>
      </Card>

      {selected ? <TradeDetail key={selected.key} uid={uid} source={source} t={selected} all={all} journal={journals[selected.key]} onJournal={j => onJournal(selected.key, j)} fmt={fmt} />
        : <Card><Empty icon={<LineChart size={22} />}><div className="text-white font-semibold">Select a trade to analyze</div>Choose a trade from the list to see its figures, quality score and journal.</Empty></Card>}
    </div>
  );
}

function TradeDetail({ uid, source, t, all, journal, onJournal, fmt }: {
  uid: string; source: Source; t: ATrade; all: Stats; journal?: Journal; onJournal: (j: Journal | null) => void; fmt: (v: number, signed?: boolean) => string;
}) {
  const [draft, setDraft] = useState<Journal>(() => journal || { source, trade_key: t.key, symbol: t.symbol, checklist: {}, tags: [] });
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [tagDraft, setTagDraft] = useState("");
  const [showHow, setShowHow] = useState(false);
  useEffect(() => { setDraft(journal || { source, trade_key: t.key, symbol: t.symbol, checklist: {}, tags: [] }); }, [journal, source, t.key, t.symbol]);
  const quality = tradeQuality(t, all, draft as any);
  const edit = (patch: Partial<Journal>) => { setDraft(d => ({ ...d, ...patch })); setState("dirty"); };
  const save = async () => {
    setState("saving");
    try { const saved = await saveJournal(uid, { ...draft, source, trade_key: t.key, symbol: t.symbol }); onJournal(saved); setState("saved"); }
    catch { setState("error"); }
  };
  const clear = async () => {
    try { await clearJournal(uid, source, t.key); onJournal(null); setDraft({ source, trade_key: t.key, symbol: t.symbol, checklist: {}, tags: [] }); setState("idle"); }
    catch { setState("error"); }
  };
  const hold = t.exitTime ? t.exitTime - t.entryTime : Date.now() - t.entryTime;
  const move = t.exitPrice != null ? (t.side === "long" ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice) : null;
  const movePct = move != null && t.entryPrice ? (move / t.entryPrice) * 100 : null;
  const o = outcomeOf(t);
  const checks = draft.checklist || {};
  const feedback: { tone: "good" | "bad" | "info"; title: string; text: string }[] = [];
  if (!t.open) {
    if (checks.followed_plan && isWin(t)) feedback.push({ tone: "good", title: "Plan following pays off", text: "You followed your plan and the trade paid. Keep trading it the same way." });
    if (checks.followed_plan === false && journal && isLoss(t)) feedback.push({ tone: "bad", title: "Plan not followed", text: "This trade didn't follow your plan, and it lost. Note what pulled you off it." });
    if (isLoss(t) && all.avgLoss < 0 && t.pnl < all.avgLoss * 1.5) feedback.push({ tone: "bad", title: "Risk management issue", text: `This loss is ${(t.pnl / all.avgLoss).toFixed(1)}× your average loss. Check the stop and the size.` });
    if (!draft.lessons?.trim()) feedback.push({ tone: "info", title: "Document lessons", text: "Add lessons learned to build a personal trading playbook." });
  }
  const cmp = (v: number, a: number) => (a ? ((v - a) / Math.abs(a)) * 100 : null);
  const avgHold = all.avgHold;
  const avgQty = all.count ? all.closed.reduce((s, x) => s + x.qty, 0) / all.count : 0;
  const chartHref = `/?symbol=${encodeURIComponent(t.symbol.replace(/\+$/, ""))}`;

  return (
    <div className="space-y-5" data-testid="trade-detail">
      <Card pad={false}>
        <div className="p-5 flex flex-wrap items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs">{t.symbol.replace(/[^A-Z]/gi, "").slice(0, 3).toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-white">{t.symbol}</h2>
              <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${t.side === "long" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>{t.side}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${o === "winner" ? "border-emerald-500/40 text-emerald-400" : o === "loser" ? "border-rose-500/40 text-rose-400" : "border-purple-600/50 text-purple-300"}`}>
                {o === "winner" ? "Winner" : o === "loser" ? "Loser" : o === "open" ? "Open" : "Breakeven"}</span>
              {journal ? <span className="text-[11px] text-purple-300 flex items-center gap-1"><BookOpen size={12} />Journaled</span> : <span className="text-[11px] text-purple-300/50">Not journaled</span>}
            </div>
            <div className="text-xs text-purple-300/70 mt-1">
              {new Date(t.entryTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              {t.exitTime ? ` → ${new Date(t.exitTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : " · still open"}
              {t.signal ? ` · ${t.signal}` : ""}
            </div>
          </div>
          <div className="text-right">
            <Label>Net P&L</Label>
            <div className={`text-2xl font-bold tabular-nums ${t.open ? "text-purple-200" : pnlClass(t.pnl)}`} data-testid="detail-pnl">{t.open ? "Open" : fmt(t.pnl, true)}</div>
          </div>
          <a href={chartHref} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-purple-700/50 text-purple-200 hover:bg-purple-800/30">
            <ExternalLink size={14} />Open on chart</a>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-purple-800/30 divide-x divide-purple-800/30">
          {([
            ["Entry price", t.entryPrice || "—"], ["Exit price", t.exitPrice ?? "—"], ["Quantity", t.qty],
            ["Price move", move != null ? `${move > 0 ? "+" : ""}${+move.toFixed(5)}${movePct != null ? ` (${movePct.toFixed(2)}%)` : ""}` : "—"],
            ["Duration", duration(hold)], ["Commission", fmt(t.commission)], ["Swap", fmt(t.swap)],
            ["Run-up / drawdown", t.runUp != null || t.drawdown != null ? `${fmt(t.runUp ?? 0, true)} / ${fmt(t.drawdown ?? 0)}` : "—"],
          ] as [string, React.ReactNode][]).map(([l, v], i) => (
            <div key={l} className={`px-4 py-3 ${i >= 4 ? "border-t border-purple-800/30" : ""}`}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-300/60">{l}</div>
              <div className="mt-0.5 text-sm font-semibold text-white tabular-nums">{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid xl:grid-cols-[320px_1fr] gap-5">
        <Card title="Trade quality" right={<button onClick={() => setShowHow(v => !v)} className="text-xs text-purple-300 hover:text-white flex items-center gap-1"><Info size={13} />How is this calculated?</button>}>
          <div className="flex items-center gap-5" data-testid="quality">
            <Ring value={quality.total} label="of 100" />
            <div className="flex-1 space-y-2 text-sm">
              {([["Profitability", quality.profitability, 30], ["Execution", quality.execution, 40], ["Journal", quality.journal, 20], ["Rating", quality.rating, 10]] as const).map(([l, v, m]) => (
                <div key={l}>
                  <div className="flex justify-between text-xs"><span className="text-purple-300/80">{l}</span><span className="text-white tabular-nums">{v}/{m}</span></div>
                  <div className="h-1.5 mt-1 rounded-full bg-purple-950/60 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" style={{ width: `${(v / m) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          {showHow && (
            <div className="mt-4 text-xs text-purple-300/80 space-y-1 border-t border-purple-800/30 pt-3">
              <p><b className="text-white">Profitability (30)</b>: a win scores 15–30 by how it compares with your average win; breakeven 10; a loss up to 10 when it&apos;s smaller than your average loss.</p>
              <p><b className="text-white">Execution (40)</b>: 10 for each ticked checklist item.</p>
              <p><b className="text-white">Journal (20)</b>: pre-trade plan 7, post-trade review 7, lessons 6.</p>
              <p><b className="text-white">Rating (10)</b>: your own 1–10 rating.</p>
            </div>
          )}
        </Card>
        <Card title="Insights" subtitle="Compared with your average">
          <div className="grid sm:grid-cols-3 gap-3">
            {([
              ["P&L", t.open ? null : cmp(t.pnl, all.expectancy), t.open ? "—" : `${fmt(t.pnl, true)} vs ${fmt(all.expectancy, true)}`],
              ["Hold time", avgHold ? cmp(hold, avgHold) : null, `${duration(hold)} vs ${duration(avgHold)}`],
              ["Size", avgQty ? cmp(t.qty, avgQty) : null, `${t.qty} vs ${+avgQty.toFixed(2)}`],
            ] as [string, number | null, string][]).map(([l, pct, text]) => (
              <div key={l} className="rounded-xl p-3 bg-purple-950/30 border border-purple-800/30">
                <Label>{l}</Label>
                <div className={`mt-1 text-lg font-bold tabular-nums ${pct == null ? "text-purple-300/60" : l === "P&L" ? pnlClass(pct) : "text-white"}`}>{pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`}</div>
                <div className="text-[11px] text-purple-300/60">{text}</div>
              </div>
            ))}
          </div>
          {feedback.length > 0 && (
            <div className="mt-4 space-y-2" data-testid="feedback">
              {feedback.map(f => (
                <div key={f.title} className={`rounded-xl px-3 py-2.5 border text-sm ${f.tone === "good" ? "bg-emerald-500/10 border-emerald-500/30" : f.tone === "bad" ? "bg-rose-500/10 border-rose-500/30" : "bg-purple-800/15 border-purple-700/40"}`}>
                  <div className={`font-semibold ${f.tone === "good" ? "text-emerald-300" : f.tone === "bad" ? "text-rose-300" : "text-purple-200"}`}>{f.title}</div>
                  <div className="text-xs text-purple-200/80 mt-0.5">{f.text}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title={<span className="flex items-center gap-2"><BookOpen size={16} className="text-purple-400" />Trade journal</span>}
        right={<div className="flex items-center gap-2 text-xs">
          <span className={state === "error" ? "text-rose-400" : "text-purple-300/70"} data-testid="journal-state">{state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "dirty" ? "Unsaved changes" : state === "error" ? "Save failed" : ""}</span>
          {journal && <button onClick={clear} className="px-2.5 py-1 rounded-lg border border-purple-700/50 text-purple-300 hover:text-white">Clear</button>}
          <button onClick={save} disabled={state === "saving"} data-testid="journal-save" className="px-3 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-700 hover:to-indigo-700 disabled:opacity-60">Save</button>
        </div>}>
        <div className="grid md:grid-cols-2 gap-4">
          {([
            ["pre_trade", "Pre-trade analysis", "What did you see? Plan, thesis, levels, risk…"],
            ["post_trade", "Post-trade review", "What happened? Execution, slippage, improvements…"],
            ["emotions", "Emotions", "How did you feel before, during, after?"],
            ["lessons", "Lessons learned", "Key takeaways from this trade…"],
          ] as const).map(([k, l, ph]) => (
            <label key={k} className="block">
              <span className="block text-purple-300 text-sm font-medium mb-1.5">{l}</span>
              <textarea value={(draft as any)[k] || ""} onChange={e => edit({ [k]: e.target.value } as any)} placeholder={ph} rows={3} data-testid={`journal-${k}`}
                onKeyDown={e => e.stopPropagation()}
                className="w-full bg-gray-900/50 border border-purple-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-purple-500/70 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 resize-y" />
            </label>
          ))}
        </div>
        <label className="block mt-4">
          <span className="block text-purple-300 text-sm font-medium mb-1.5">R:R notes</span>
          <input value={draft.rr_notes || ""} onChange={e => edit({ rr_notes: e.target.value })} placeholder="Risk/reward: planned vs actual R:R…" onKeyDown={e => e.stopPropagation()}
            className="w-full bg-gray-900/50 border border-purple-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-purple-500/70 focus:outline-none focus:border-purple-500" />
        </label>
        <div className="grid md:grid-cols-2 gap-5 mt-5">
          <div>
            <span className="block text-purple-300 text-sm font-medium mb-2">Execution checklist</span>
            <div className="space-y-1.5" data-testid="journal-checklist">
              {CHECKLIST.map(c => (
                <button key={c.key} onClick={() => edit({ checklist: { ...checks, [c.key]: !checks[c.key] } })} data-check={c.key}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left transition-all ${checks[c.key] ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-200" : "border-purple-800/40 text-purple-200 hover:bg-purple-800/20"}`}>
                  <CheckCircle2 size={16} className={checks[c.key] ? "text-emerald-400" : "text-purple-600"} />{c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-purple-300 text-sm font-medium mb-2">Rating</span>
            <div className="flex gap-1" data-testid="journal-rating">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button key={n} aria-label={`Rate ${n}`} onClick={() => edit({ rating: draft.rating === n ? null : n })}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold border transition-all ${draft.rating && n <= draft.rating ? "bg-gradient-to-br from-purple-600 to-indigo-600 border-purple-500 text-white" : "border-purple-800/50 text-purple-300 hover:bg-purple-800/30"}`}>{n}</button>
              ))}
            </div>
            <span className="block text-purple-300 text-sm font-medium mb-2 mt-4">Tags</span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {(draft.tags || []).map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-700/30 border border-purple-600/40 text-purple-100">
                  <Tag size={11} />{tag}<button aria-label={`Remove ${tag}`} onClick={() => edit({ tags: (draft.tags || []).filter(x => x !== tag) })} className="hover:text-white"><X size={11} /></button>
                </span>
              ))}
              <input value={tagDraft} onChange={e => setTagDraft(e.target.value)} placeholder="Type tag + Enter" data-testid="journal-tag"
                onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter" && tagDraft.trim()) { edit({ tags: Array.from(new Set([...(draft.tags || []), tagDraft.trim()])) }); setTagDraft(""); } }}
                className="flex-1 min-w-[120px] bg-transparent border-b border-purple-700/50 px-1 py-1 text-sm text-white placeholder-purple-500/70 focus:outline-none focus:border-purple-500" />
            </div>
          </div>
        </div>
        {draft.rating ? <div className="mt-4 text-xs text-purple-300/70 flex items-center gap-1"><Star size={12} className="text-purple-400" />You rated this trade {draft.rating}/10</div> : null}
      </Card>
    </div>
  );
}

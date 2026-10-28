"use client";

// Copy trading: run channels (your MT5 trades mirrored, or signals sent from here, placed straight
// on every follower's broker account sized by risk %), and follow others' with your own limits.

import React, { useCallback, useEffect, useState } from "react";
import { Activity, Check, Copy, Radio, Send, Server, Trash2, Users, X } from "lucide-react";
import {
  copyOverview, createChannel, deleteChannel, getChannel, joinChannel, leaveChannel, openSiteTrades, sendSignal, signalResults, subscriptionLog,
  updateChannel, updateSubscription, type Channel, type CopierStatus, type Execution, type Signal, type Subscription,
} from "./copy";
import { Card, Empty, Kpi, Label, Pills } from "./ui";

const field = "w-full bg-gray-900/50 border border-purple-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-purple-500/70 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20";
const btn = "px-3 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white disabled:opacity-60";
const ghost = "px-3 py-2 rounded-lg text-sm border border-purple-700/50 text-purple-200 hover:bg-purple-800/30 disabled:opacity-60";
const when = (ms: number) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const STATUS: Record<string, string> = {
  filled: "text-emerald-400", modified: "text-sky-300", closed: "text-purple-200", skipped: "text-amber-300", failed: "text-rose-400",
  connected: "text-emerald-400", starting: "text-amber-300", error: "text-rose-400", off: "text-purple-300/60",
};
const num = (v: string) => (v.trim() === "" ? null : Number(v));

export default function CopyTrading({ uid }: { uid: string }) {
  const [tab, setTab] = useState<"channels" | "following">("channels");
  const [data, setData] = useState<{ channels: Channel[]; following: Subscription[]; copier: CopierStatus; mt5_linked: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => copyOverview(uid).then(d => { setData(d); setError(null); }, e => setError(e.message)), [uid]);
  useEffect(() => {
    reload();
    const t = setInterval(() => { if (document.visibilityState === "visible") reload(); }, 5000);
    return () => clearInterval(t);
  }, [reload]);
  const cs = data?.copier;

  return (
    <div className="space-y-5" data-testid="copy-trading">
      <Card pad={false}>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-purple-800/30">
          <Kpi label="Copier service" icon={<Server size={16} />} testId="copier-status"
            value={<span className={cs?.running ? "text-emerald-400" : "text-amber-300"}>{cs ? (cs.running ? "Running" : "Not running") : "…"}</span>}
            sub={cs?.running ? `${cs.connected} of ${cs.terminals} terminals connected` : "Start it on the copier server: manage.py run_copier"} />
          <Kpi label="Your channels" icon={<Radio size={16} />} value={data?.channels.length ?? "…"} sub={`${data?.channels.reduce((a, c) => a + c.copying, 0) ?? 0} followers copying`} />
          <Kpi label="Following" icon={<Users size={16} />} value={data?.following.length ?? "…"} sub={`${data?.following.filter(s => s.auto_copy).length ?? 0} copying to your broker`} />
          <Kpi label="Your MT5" icon={<Activity size={16} />} value={<span className={data?.mt5_linked ? "text-emerald-400" : "text-purple-300/70"}>{data ? (data.mt5_linked ? "Linked" : "Not linked") : "…"}</span>}
            sub={data?.mt5_linked ? "Copies go to it / it can be mirrored" : "On the chart: Trade with your broker → MetaTrader 5"} />
        </div>
      </Card>
      {error && <div role="alert" className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
      <Pills value={tab} onChange={setTab} testId="copy-tab" options={[{ id: "channels", label: "My channels" }, { id: "following", label: "Following" }]} />
      {!data ? <Card><Empty>Loading…</Empty></Card> : tab === "channels"
        ? <MyChannels uid={uid} channels={data.channels} mt5Linked={data.mt5_linked} onChange={reload} />
        : <Following uid={uid} subs={data.following} mt5Linked={data.mt5_linked} onChange={reload} />}
    </div>
  );
}

// ---------------------------------------------------------------- channels you run

function MyChannels({ uid, channels, mt5Linked, onChange }: { uid: string; channels: Channel[]; mt5Linked: boolean; onChange: () => void }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", risk: "1", slip: "25" });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (openId === null && channels.length) setOpenId(channels[0].id); }, [channels, openId]);
  const create = async () => {
    setErr(null);
    try {
      const c = await createChannel(uid, { name: form.name, description: form.description, default_risk: Number(form.risk), max_slippage: Number(form.slip) });
      setCreating(false); setForm({ name: "", description: "", risk: "1", slip: "25" }); setOpenId(c.id); onChange();
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="grid xl:grid-cols-[320px_1fr] gap-5 items-start">
      <div className="space-y-3">
        {channels.map(c => (
          <button key={c.id} onClick={() => setOpenId(c.id)} data-channel={c.id}
            className={`w-full text-left bg-black/50 backdrop-blur-xl border rounded-2xl p-4 transition-all ${openId === c.id ? "border-purple-500/70" : "border-purple-800/40 hover:border-purple-600/60"}`}>
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold truncate flex-1">{c.name}</span>
              {c.mirror_mt5 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">MT5 mirror</span>}
              {!c.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">Paused</span>}
            </div>
            <div className="text-xs text-purple-300/70 mt-1">Code <b className="text-purple-100 tracking-wider">{c.code}</b> · {c.subscribers} followers · {c.copying} copying</div>
          </button>
        ))}
        {creating ? (
          <Card title="New channel">
            <div className="space-y-2.5" onKeyDown={e => e.stopPropagation()}>
              <input className={field} placeholder="Name, e.g. Gold signals" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="ch-name" />
              <textarea className={field} rows={2} placeholder="What you trade, how often… (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <label><span className="block text-xs text-purple-300 mb-1">Default risk % / trade</span><input className={field} value={form.risk} onChange={e => setForm({ ...form, risk: e.target.value })} inputMode="decimal" /></label>
                <label><span className="block text-xs text-purple-300 mb-1">Max slippage (% of stop)</span><input className={field} value={form.slip} onChange={e => setForm({ ...form, slip: e.target.value })} inputMode="decimal" /></label>
              </div>
              {err && <div className="text-xs text-rose-400">{err}</div>}
              <div className="flex gap-2 justify-end"><button className={ghost} onClick={() => setCreating(false)}>Cancel</button><button className={btn} onClick={create} data-testid="ch-create">Create</button></div>
            </div>
          </Card>
        ) : <button className={`${btn} w-full`} onClick={() => setCreating(true)} data-testid="new-channel">+ New channel</button>}
      </div>
      {openId ? <ChannelDetail key={openId} uid={uid} id={openId} mt5Linked={mt5Linked} onChange={onChange} onDeleted={() => { setOpenId(null); onChange(); }} />
        : <Card><Empty icon={<Radio size={22} />}><div className="text-white font-semibold">Run a channel</div>Create one, share its code, and your trades are copied to every follower who switches copying on.</Empty></Card>}
    </div>
  );
}

function ChannelDetail({ uid, id, mt5Linked, onChange, onDeleted }: { uid: string; id: number; mt5Linked: boolean; onChange: () => void; onDeleted: () => void }) {
  const [c, setC] = useState<Channel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sig, setSig] = useState({ symbol: "XAU/USD", side: "buy" as "buy" | "sell", sl: "", tp: "", risk: "" });
  const [results, setResults] = useState<{ signal: Signal; results: Execution[] } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const load = useCallback(() => getChannel(uid, id).then(d => setC(d.channel), e => setErr(e.message)), [uid, id]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 3000);
    return () => clearInterval(t);
  }, [load]);
  const patch = async (p: Partial<Channel>) => { setErr(null); try { setC((await updateChannel(uid, id, p)).channel); onChange(); } catch (e: any) { setErr(e.message); } };
  const send = async (body: Record<string, unknown>, done: string) => {
    setErr(null); setNote(null);
    try { await sendSignal(uid, id, body); setNote(done); load(); } catch (e: any) { setErr(e.message); }
  };
  if (!c) return <Card><Empty>{err || "Loading…"}</Empty></Card>;
  const open = openSiteTrades(c.signals || []);
  return (
    <div className="space-y-5" data-testid="channel-detail">
      <Card title={c.name} subtitle={c.description || "Share the code; followers switch copying on with their own limits"}
        right={<div className="flex items-center gap-2">
          <span className="text-xs text-purple-300/70">Join code</span>
          <span className="font-mono text-lg text-white tracking-widest" data-testid="ch-code">{c.code}</span>
          <button aria-label="Copy the code" className="text-purple-300 hover:text-white" onClick={() => navigator.clipboard?.writeText(c.code)}><Copy size={15} /></button>
        </div>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label><Label>Default risk % / trade</Label><input className={`${field} mt-1`} defaultValue={c.default_risk} onBlur={e => Number(e.target.value) !== c.default_risk && patch({ default_risk: Number(e.target.value) })} inputMode="decimal" /></label>
          <label><Label>Max slippage (% of the stop)</Label><input className={`${field} mt-1`} defaultValue={c.max_slippage} onBlur={e => Number(e.target.value) !== c.max_slippage && patch({ max_slippage: Number(e.target.value) })} inputMode="decimal" /></label>
          <div><Label>Copy my MT5 trades</Label>
            <button onClick={() => patch({ mirror_mt5: !c.mirror_mt5 })} disabled={!mt5Linked && !c.mirror_mt5} data-testid="ch-mirror"
              className={`mt-1 w-full ${c.mirror_mt5 ? "px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600/80 text-white" : ghost}`}>
              {c.mirror_mt5 ? "On: new MT5 trades are signals" : mt5Linked ? "Off: turn on" : "Link MT5 first"}</button></div>
          <div><Label>Channel</Label>
            <div className="mt-1 flex gap-2">
              <button className={ghost} onClick={() => patch({ active: !c.active })}>{c.active ? "Pause" : "Resume"}</button>
              <button className={`${ghost} ${confirmDel ? "!border-rose-500 !text-rose-300" : ""}`} onClick={async () => { if (!confirmDel) { setConfirmDel(true); return; } await deleteChannel(uid, id); onDeleted(); }}>
                <Trash2 size={14} className="inline -mt-0.5" /> {confirmDel ? "Delete?" : ""}</button>
            </div></div>
        </div>
        <p className="text-xs text-purple-300/60 mt-3">Each follower's lot size is the risk % of their own equity at the stop distance on their broker. A copy that would fill more than the slippage (a % of the stop distance) past your entry is skipped.</p>
      </Card>

      <Card title={<span className="flex items-center gap-2"><Send size={16} className="text-purple-400" />Send a signal</span>} subtitle="Opens at the market on every follower's broker account">
        <div className="grid sm:grid-cols-6 gap-2 items-end" onKeyDown={e => e.stopPropagation()}>
          <label className="sm:col-span-2"><Label>Symbol</Label><input className={`${field} mt-1`} value={sig.symbol} onChange={e => setSig({ ...sig, symbol: e.target.value })} data-testid="sig-symbol" /></label>
          <div><Label>Side</Label><div className="mt-1"><Pills size="sm" value={sig.side} onChange={v => setSig({ ...sig, side: v })} options={[{ id: "buy", label: "Buy" }, { id: "sell", label: "Sell" }]} testId="sig-side" /></div></div>
          <label><Label>Stop loss</Label><input className={`${field} mt-1`} value={sig.sl} onChange={e => setSig({ ...sig, sl: e.target.value })} inputMode="decimal" data-testid="sig-sl" /></label>
          <label><Label>Take profit</Label><input className={`${field} mt-1`} value={sig.tp} onChange={e => setSig({ ...sig, tp: e.target.value })} inputMode="decimal" data-testid="sig-tp" /></label>
          <label><Label>Risk %</Label><input className={`${field} mt-1`} value={sig.risk} placeholder={String(c.default_risk)} onChange={e => setSig({ ...sig, risk: e.target.value })} inputMode="decimal" /></label>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button className={btn} data-testid="sig-send" disabled={!c.active}
            onClick={() => send({ kind: "open", symbol: sig.symbol, side: sig.side, sl: num(sig.sl), tp: num(sig.tp), risk_percent: num(sig.risk) }, `${sig.side === "buy" ? "Buy" : "Sell"} ${sig.symbol} sent`)}>
            Send {sig.side} signal</button>
          {note && <span className="text-sm text-emerald-400 flex items-center gap-1"><Check size={14} />{note}</span>}
          {err && <span className="text-sm text-rose-400">{err}</span>}
        </div>
        {open.length > 0 && (
          <div className="mt-4 border-t border-purple-800/30 pt-3 space-y-2" data-testid="open-site-trades">
            <Label>Open from here</Label>
            {open.map(o => <OpenTrade key={o.ref} o={o} onModify={(sl, tp) => send({ kind: "modify", ref: o.ref, sl, tp }, "Stops moved")}
              onClose={fr => send({ kind: "close", ref: o.ref, fraction: fr }, fr < 1 ? "Partly closed" : "Closed")} />)}
          </div>
        )}
      </Card>

      <div className="grid 2xl:grid-cols-[1.4fr_1fr] gap-5 items-start">
        <Card title="Signals" subtitle="Click one to see what it did on each follower's account" pad={false}>
          {(c.signals || []).length === 0 ? <Empty>No signals yet</Empty> : (
            <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="signals">
              <thead><tr className="text-[11px] uppercase tracking-wider text-purple-300/60">{["Time", "Kind", "Symbol", "Entry", "SL", "TP", "Risk", "Results"].map(h => <th key={h} className="text-left font-semibold px-4 py-2">{h}</th>)}</tr></thead>
              <tbody>{(c.signals || []).map(s => (
                <tr key={s.id} onClick={() => signalResults(uid, id, s.id).then(setResults)} className="border-t border-purple-800/20 hover:bg-purple-800/15 cursor-pointer" data-signal={s.id}>
                  <td className="px-4 py-2 text-purple-300/80 whitespace-nowrap">{when(s.created_at)}</td>
                  <td className="px-4 py-2 whitespace-nowrap"><span className="capitalize text-white">{s.kind}</span>{s.kind === "open" && <span className={`ml-1 font-semibold ${s.side === "buy" ? "text-emerald-400" : "text-rose-400"}`}>{s.side}</span>}
                    {s.kind === "close" && s.fraction < 0.999 && <span className="text-purple-300/70"> {Math.round(s.fraction * 100)}%</span>}
                    <span className="ml-1 text-[10px] text-purple-400/70 uppercase">{s.source}</span></td>
                  <td className="px-4 py-2 text-white">{s.symbol}</td>
                  <td className="px-4 py-2 tabular-nums">{s.entry ?? "market"}</td>
                  <td className="px-4 py-2 tabular-nums">{s.sl ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{s.tp ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{s.risk_percent != null ? `${s.risk_percent}%` : "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap"><span className="text-emerald-400">{s.filled}</span> / <span className="text-amber-300">{s.skipped}</span> / <span className="text-rose-400">{s.failed}</span></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Card>
        <Card title="Followers" pad={false}>
          {(c.followers || []).length === 0 ? <Empty icon={<Users size={20} />}>Nobody yet: share the code <b className="text-white">{c.code}</b></Empty> : (
            <div className="divide-y divide-purple-800/20" data-testid="followers">
              {(c.followers || []).map(f => (
                <div key={f.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center gap-2"><span className="text-white font-medium flex-1">{f.name}</span>
                    <span className={STATUS[f.auto_copy ? f.terminal_status : "off"] || ""}>{f.auto_copy ? f.terminal_status : "not copying"}</span></div>
                  <div className="text-xs text-purple-300/60 mt-0.5">{f.broker ? `MT5 ${f.broker.login} · ${f.broker.server} · ${f.broker.mode}` : "No broker linked"}
                    {f.last && <> · last: <span className={STATUS[f.last.status]}>{f.last.status}</span></>}</div>
                </div>))}
            </div>
          )}
        </Card>
      </div>
      {results && <ResultsDialog data={results} onClose={() => setResults(null)} />}
    </div>
  );
}

function OpenTrade({ o, onModify, onClose }: { o: Signal; onModify: (sl: number | null, tp: number | null) => void; onClose: (fraction: number) => void }) {
  const [sl, setSl] = useState(o.sl != null ? String(o.sl) : "");
  const [tp, setTp] = useState(o.tp != null ? String(o.tp) : "");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" onKeyDown={e => e.stopPropagation()} data-ref={o.ref}>
      <span className={`font-semibold uppercase text-xs ${o.side === "buy" ? "text-emerald-400" : "text-rose-400"}`}>{o.side}</span>
      <span className="text-white w-24">{o.symbol}</span>
      <input className={`${field} !w-28 !py-1.5`} value={sl} onChange={e => setSl(e.target.value)} placeholder="SL" />
      <input className={`${field} !w-28 !py-1.5`} value={tp} onChange={e => setTp(e.target.value)} placeholder="TP" />
      <button className={`${ghost} !py-1.5`} onClick={() => onModify(num(sl), num(tp))}>Move stops</button>
      <button className={`${ghost} !py-1.5`} onClick={() => onClose(0.5)}>Close half</button>
      <button className={`${ghost} !py-1.5 !text-rose-300`} onClick={() => onClose(1)} data-testid="close-trade">Close</button>
    </div>
  );
}

function ResultsDialog({ data, onClose }: { data: { signal: Signal; results: Execution[] }; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const s = data.signal;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Signal results" data-testid="signal-results" className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-black/85 border border-purple-800/60 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-bold text-white flex-1 capitalize">{s.kind} {s.side} {s.symbol} · {when(s.created_at)}</h2>
          <button aria-label="Close" onClick={onClose} className="text-purple-300 hover:text-white"><X size={20} /></button>
        </div>
        {data.results.length === 0 ? <Empty>No follower results yet</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wider text-purple-300/60">{["Follower", "Result", "Lots", "Price", "SL / TP", "Took", "Details"].map(h => <th key={h} className="text-left font-semibold px-2 py-2">{h}</th>)}</tr></thead>
            <tbody>{data.results.map(e => (
              <tr key={e.id} className="border-t border-purple-800/20">
                <td className="px-2 py-2 text-white">{e.follower}</td>
                <td className={`px-2 py-2 capitalize font-semibold ${STATUS[e.status]}`}>{e.status}</td>
                <td className="px-2 py-2 tabular-nums">{e.volume ?? "—"}</td>
                <td className="px-2 py-2 tabular-nums">{e.price ?? "—"}</td>
                <td className="px-2 py-2 tabular-nums whitespace-nowrap">{e.sl ?? "—"} / {e.tp ?? "—"}</td>
                <td className="px-2 py-2 tabular-nums">{e.latency_ms != null ? `${e.latency_ms} ms` : "—"}</td>
                <td className="px-2 py-2 text-purple-200/80">{e.message}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- channels you follow

function Following({ uid, subs, mt5Linked, onChange }: { uid: string; subs: Subscription[]; mt5Linked: boolean; onChange: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const join = async () => {
    setErr(null);
    try { await joinChannel(uid, code); setCode(""); onChange(); } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="space-y-5">
      <Card title="Follow a channel" subtitle="Enter the code the channel's owner shared">
        <div className="flex gap-2 max-w-md" onKeyDown={e => e.stopPropagation()}>
          <input className={`${field} uppercase tracking-widest font-mono`} placeholder="CODE" value={code} onChange={e => setCode(e.target.value)} data-testid="join-code"
            onKeyDown={e => e.key === "Enter" && join()} />
          <button className={btn} onClick={join} data-testid="join">Follow</button>
        </div>
        {err && <div className="text-sm text-rose-400 mt-2">{err}</div>}
      </Card>
      {subs.length === 0 ? <Card><Empty icon={<Users size={20} />}>You don&apos;t follow any channel yet</Empty></Card>
        : subs.map(s => <SubscriptionCard key={s.id} uid={uid} s={s} mt5Linked={mt5Linked} onChange={onChange} />)}
    </div>
  );
}

function SubscriptionCard({ uid, s, mt5Linked, onChange }: { uid: string; s: Subscription; mt5Linked: boolean; onChange: () => void }) {
  const [f, setF] = useState({
    risk_mode: s.risk_mode, risk_percent: String(s.risk_percent), max_risk: String(s.max_risk), max_open: String(s.max_open),
    daily_loss_limit: String(s.daily_loss_limit), no_sl_lots: String(s.no_sl_lots), symbols: s.symbols.join(", "),
  });
  const [real, setReal] = useState(s.real_confirmed);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [log, setLog] = useState<Execution[] | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => {
    const load = () => subscriptionLog(uid, s.id).then(setLog, () => {});
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 4000);
    return () => clearInterval(t);
  }, [uid, s.id]);
  const isReal = s.broker?.mode === "real";
  const save = async (extra: Partial<Subscription> = {}) => {
    setErr(null); setSaved(false);
    try {
      await updateSubscription(uid, s.id, {
        risk_mode: f.risk_mode, risk_percent: Number(f.risk_percent), max_risk: Number(f.max_risk), max_open: Number(f.max_open),
        daily_loss_limit: Number(f.daily_loss_limit), no_sl_lots: Number(f.no_sl_lots || 0),
        symbols: f.symbols.split(",").map(x => x.trim()).filter(Boolean), real_confirmed: real, ...extra,
      });
      setSaved(true); onChange();
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <Card title={<span>{s.channel_info.name} <span className="text-sm font-normal text-purple-300/70">by {s.channel_info.owner}</span></span>}
      subtitle={s.broker ? `Copies to MT5 ${s.broker.login} · ${s.broker.server} · ${s.broker.mode}` : "Link MT5 on the chart (Trade with your broker) to copy"}
      right={<div className="flex items-center gap-3">
        {s.auto_copy && <span className={`text-xs ${STATUS[s.terminal_status]}`} title={s.terminal_error} data-testid="sub-terminal">Terminal: {s.terminal_status}{s.terminal_error ? ` (${s.terminal_error})` : ""}</span>}
        <button data-testid="auto-copy" disabled={!mt5Linked && !s.auto_copy} onClick={() => save({ auto_copy: !s.auto_copy })}
          className={s.auto_copy ? "px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600/80 text-white" : btn}>
          {s.auto_copy ? "Copying: on" : "Start copying"}</button>
      </div>}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4" onKeyDown={e => e.stopPropagation()}>
        <div><Label>Risk per trade</Label>
          <div className="mt-1"><Pills size="sm" value={f.risk_mode} onChange={v => setF({ ...f, risk_mode: v })} options={[{ id: "signal", label: "Signal's %" }, { id: "fixed", label: "My own %" }]} /></div>
          {f.risk_mode === "fixed" && <input className={`${field} mt-2`} value={f.risk_percent} onChange={e => setF({ ...f, risk_percent: e.target.value })} inputMode="decimal" placeholder="%" />}</div>
        <label><Label>Never risk more than (%)</Label><input className={`${field} mt-1`} value={f.max_risk} onChange={e => setF({ ...f, max_risk: e.target.value })} inputMode="decimal" data-testid="sub-max-risk" /></label>
        <label><Label>Max copied trades open</Label><input className={`${field} mt-1`} value={f.max_open} onChange={e => setF({ ...f, max_open: e.target.value })} inputMode="numeric" /></label>
        <label><Label>Daily loss limit (% of balance, 0 = none)</Label><input className={`${field} mt-1`} value={f.daily_loss_limit} onChange={e => setF({ ...f, daily_loss_limit: e.target.value })} inputMode="decimal" /></label>
        <label className="lg:col-span-2"><Label>Only these symbols (comma-separated; empty = all)</Label><input className={`${field} mt-1`} value={f.symbols} onChange={e => setF({ ...f, symbols: e.target.value })} placeholder="XAUUSD, EURUSD" /></label>
        <label><Label>Lots for signals without a stop (0 = skip them)</Label><input className={`${field} mt-1`} value={f.no_sl_lots} onChange={e => setF({ ...f, no_sl_lots: e.target.value })} inputMode="decimal" /></label>
        <div className="flex items-end gap-2">
          <button className={btn} onClick={() => save()} data-testid="sub-save">Save</button>
          <button className={`${ghost} ${confirmLeave ? "!border-rose-500 !text-rose-300" : ""}`} onClick={async () => { if (!confirmLeave) { setConfirmLeave(true); return; } await leaveChannel(uid, s.id); onChange(); }}>{confirmLeave ? "Leave?" : "Unfollow"}</button>
        </div>
      </div>
      {isReal && (
        <label className="flex items-start gap-2 mt-4 text-sm text-purple-100 cursor-pointer">
          <input type="checkbox" checked={real} onChange={e => setReal(e.target.checked)} data-testid="sub-real" />
          <span>I understand copied trades will be placed on my <b>real-money</b> account automatically, without asking each time</span>
        </label>
      )}
      {(err || saved) && <div className={`text-sm mt-3 ${err ? "text-rose-400" : "text-emerald-400"}`}>{err || "Saved"}</div>}
      <div className="mt-5">
        <Label>On your account</Label>
        {!log || log.length === 0 ? <div className="text-sm text-purple-300/60 mt-2">Nothing copied yet</div> : (
          <div className="overflow-x-auto mt-2"><table className="w-full text-sm" data-testid="sub-log">
            <thead><tr className="text-[11px] uppercase tracking-wider text-purple-300/60">{["Time", "Signal", "Result", "Lots", "Price", "SL / TP", "Took", "Details"].map(h => <th key={h} className="text-left font-semibold px-2 py-2">{h}</th>)}</tr></thead>
            <tbody>{log.map(e => (
              <tr key={e.id} className="border-t border-purple-800/20">
                <td className="px-2 py-2 text-purple-300/80 whitespace-nowrap">{when(e.at)}</td>
                <td className="px-2 py-2 whitespace-nowrap"><span className="capitalize">{e.kind}</span> {e.kind === "open" && <span className={e.side === "buy" ? "text-emerald-400" : "text-rose-400"}>{e.side}</span>} {e.symbol || e.signal_symbol}</td>
                <td className={`px-2 py-2 capitalize font-semibold ${STATUS[e.status]}`}>{e.status}</td>
                <td className="px-2 py-2 tabular-nums">{e.volume ?? "—"}</td>
                <td className="px-2 py-2 tabular-nums">{e.price ?? "—"}</td>
                <td className="px-2 py-2 tabular-nums whitespace-nowrap">{e.sl ?? "—"} / {e.tp ?? "—"}</td>
                <td className="px-2 py-2 tabular-nums">{e.latency_ms != null ? `${e.latency_ms} ms` : "—"}</td>
                <td className="px-2 py-2 text-purple-200/80">{e.message}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </Card>
  );
}

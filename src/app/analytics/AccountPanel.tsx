"use client";

// A connected account in Analytics (accounts.ts): its live state (balance, equity, floating P&L, open
// positions — every trade on it, wherever it was placed) when the trader shows it, its prop-firm
// rules (progress to the target, room before the daily and maximum loss limits, trading days), and
// its settings. Also the dialog that connects an account: MT5 with its investor password, or cTrader.

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Link2, RefreshCw, Settings2, Trash2, Trophy, X } from "lucide-react";
import {
  accountName, connectMt5, ctraderUrl, liveState, removeAccount, syncAccount, updateAccount,
  type LiveState, type Preset, type Progress, type Rules, type StatsAccount,
} from "./accounts";
import { money } from "./stats";
import TvSelect from "@/app/components/ui/TvSelect";

const card = "rounded-2xl border border-purple-800/40 bg-black/40 backdrop-blur-xl p-4";
const input = "w-full bg-gray-900/60 border border-purple-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-purple-300/40 focus:outline-none focus:border-purple-400";
const btn = "flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-purple-700/50 text-purple-200 hover:bg-purple-800/30 disabled:opacity-50";
const primary = "px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50";

export function PlatformBadge({ platform }: { platform: "mt5" | "ctrader" }) {
  return platform === "mt5"
    ? <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-gradient-to-br from-emerald-600 to-blue-600">MT5</span>
    : <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-gradient-to-br from-red-600 to-orange-500">cT</span>;
}

// ---------------------------------------------------------------- the panel

export default function AccountPanel({ uid, account, presets, onChange, onRemoved }: {
  uid: string; account: StatsAccount; presets: Preset[]; onChange: (a: StatsAccount) => void; onRemoved: () => void;
}) {
  const cur = account.currency || "USD";
  const [live, setLive] = useState<LiveState | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);

  // The live state: read now, then every 15 s while the tab is visible
  useEffect(() => {
    setLive(null); setLiveErr(null);
    if (!account.show_live) return;
    let stop = false;
    const read = () => {
      if (document.visibilityState !== "visible") return;
      liveState(uid, account.id).then(d => { if (!stop) { setLive(d); setLiveErr(null); } }, e => { if (!stop) setLiveErr(e.message); });
    };
    read();
    const t = setInterval(read, 15000);
    document.addEventListener("visibilitychange", read);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", read); };
    // (read again when the rules change: their progress is against the equity now)
  }, [uid, account.id, account.show_live, JSON.stringify(account.rules)]);   // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    setSyncing(true); setSyncErr(null);
    syncAccount(uid, account.id).then(d => { onChange(d.account); if (account.show_live) setLive({ ...d.live, at: Date.now(), progress: d.account.progress }); },
      e => setSyncErr(e.message)).finally(() => setSyncing(false));
  };
  const progress = live?.progress ?? account.progress;

  return (
    <div className="space-y-4 mb-6" data-testid="account-panel">
      <div className="flex flex-wrap items-center gap-2">
        <PlatformBadge platform={account.platform} />
        <span className="font-semibold">{accountName(account)}</span>
        <span className="text-xs text-purple-300/70">{[account.broker, account.platform === "mt5" ? account.server : "", `#${account.login}`, account.mode].filter(Boolean).join(" · ")}</span>
        {account.on_leaderboard && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1"><Trophy size={11} />On the leaderboard</span>}
        <div className="ml-auto flex gap-2">
          <button onClick={refresh} disabled={syncing} className={btn} data-testid="account-refresh"><RefreshCw size={14} className={syncing ? "animate-spin" : ""} />Refresh history</button>
          <button onClick={() => setSettings(true)} className={btn} data-testid="account-settings"><Settings2 size={14} />Settings</button>
        </div>
      </div>
      <div className="text-xs text-purple-300/60">
        {account.synced_at ? `History read ${new Date(account.synced_at).toLocaleString()} · ${account.trade_count} closed trades, every one on the account` : "History not read yet"}
      </div>
      {(syncErr || account.last_error) && <div role="alert" className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{syncErr || account.last_error}</div>}

      {account.show_live && (
        <div className={card} data-testid="account-live">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-semibold">Live account</span>
            {live && <span className="text-xs text-purple-300/60 ml-auto">Updated {new Date(live.at).toLocaleTimeString()}</span>}
          </div>
          {liveErr ? <div className="text-sm text-red-400">{liveErr}</div> : !live ? <div className="text-sm text-purple-300">Reading the account…</div> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Figure label="Balance" value={money(live.account.balance, cur)} />
                <Figure label="Equity" value={money(live.account.equity, cur)} />
                <Figure label="Floating P&L" value={money(live.account.floating, cur, true)} tone={live.account.floating} />
                <Figure label="Open positions" value={String(live.positions.length)} />
              </div>
              {live.positions.length > 0 && (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-purple-300/70 text-xs">
                      <th className="py-1.5 pr-3">Symbol</th><th className="pr-3">Side</th><th className="pr-3 text-right">Volume</th>
                      <th className="pr-3 text-right">Open price</th><th className="pr-3 text-right">S/L</th><th className="pr-3 text-right">T/P</th>
                      <th className="pr-3">Opened</th><th className="text-right">P&L</th></tr></thead>
                    <tbody>
                      {live.positions.map(p => (
                        <tr key={p.ticket} className="border-t border-purple-800/30">
                          <td className="py-1.5 pr-3 font-medium">{p.symbol}</td>
                          <td className={`pr-3 ${p.side === "buy" ? "text-emerald-400" : "text-red-400"}`}>{p.side}</td>
                          <td className="pr-3 text-right tabular-nums">{p.volume}</td>
                          <td className="pr-3 text-right tabular-nums">{p.open_price}</td>
                          <td className="pr-3 text-right tabular-nums">{p.sl ?? "—"}</td>
                          <td className="pr-3 text-right tabular-nums">{p.tp ?? "—"}</td>
                          <td className="pr-3 text-xs text-purple-300/70">{p.time ? new Date(p.time).toLocaleString() : "—"}</td>
                          <td className={`text-right tabular-nums ${p.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(p.profit, cur, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {account.rules.firm && progress && <RulesCard account={account} progress={progress} presets={presets} live={!!live?.progress} />}

      {settings && <AccountSettings uid={uid} account={account} presets={presets} onClose={() => setSettings(false)}
        onSaved={a => { onChange(a); setSettings(false); }} onRemoved={onRemoved} />}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="rounded-xl bg-purple-900/20 border border-purple-800/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-purple-300/70">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === undefined ? "" : tone >= 0 ? "text-emerald-400" : "text-red-400"}`}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------- prop rules

function Bar({ pct, tone }: { pct: number; tone: "good" | "warn" | "bad" }) {
  const c = tone === "good" ? "from-emerald-500 to-teal-400" : tone === "warn" ? "from-amber-500 to-orange-400" : "from-red-600 to-rose-500";
  return <div className="h-2 rounded-full bg-purple-950/80 overflow-hidden"><div className={`h-full bg-gradient-to-r ${c}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}
const risk = (used: number): "good" | "warn" | "bad" => (used >= 80 ? "bad" : used >= 50 ? "warn" : "good");

function RulesCard({ account, progress: p, presets, live }: { account: StatsAccount; progress: Progress; presets: Preset[]; live: boolean }) {
  const cur = account.currency || "USD";
  const preset = presets.find(x => x.id === account.rules.firm);
  const phase = preset?.phases.find(x => x.id === account.rules.phase);
  if (p.error) return <div className={card}><div className="text-sm text-amber-300">{p.error} in the account's settings to track its rules.</div></div>;
  const status = p.status === "breached" ? { t: "Breached", c: "bg-red-500/15 text-red-300 border-red-500/30", i: <AlertTriangle size={13} /> }
    : p.status === "passed" ? { t: "Target reached", c: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", i: <CheckCircle2 size={13} /> }
      : { t: "In progress", c: "bg-purple-500/15 text-purple-200 border-purple-500/30", i: null };
  return (
    <div className={card} data-testid="account-rules">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-sm font-semibold">{preset ? `${preset.name}${phase ? ` · ${phase.label}` : ""}` : "Prop firm rules"}</span>
        <span className="text-xs text-purple-300/70">{money(p.size, cur)} account · {live ? "against the equity now" : "from the closed trades"}</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${status.c}`}>{status.i}{status.t}</span>
      </div>
      {p.breach && (
        <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {p.breach.rule === "daily" ? "Daily loss limit" : "Maximum loss"} broken{p.breach.live ? " now" : ` on ${new Date(p.breach.at).toLocaleDateString()}`}: {p.breach.live ? "equity" : "balance"} {money(p.breach.balance, cur)}.
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {p.target && (
          <div>
            <div className="flex justify-between text-sm mb-1"><span>Profit target {p.target.pct}%</span>
              <span className="tabular-nums">{money(p.profit, cur, true)} / {money(p.target.amount, cur)}</span></div>
            <Bar pct={p.target.progress} tone="good" />
            <div className="text-xs text-purple-300/60 mt-1">{p.target.reached ? "Reached" : `${p.target.progress}% of the way · ${money(Math.max(0, p.target.amount - p.profit), cur)} to go`}</div>
          </div>
        )}
        {p.daily && (
          <div>
            <div className="flex justify-between text-sm mb-1"><span>Daily loss limit {p.daily.pct}%</span>
              <span className="tabular-nums">{money(p.daily.left, cur)} left</span></div>
            <Bar pct={p.daily.used_pct} tone={risk(p.daily.used_pct)} />
            <div className="text-xs text-purple-300/60 mt-1">Today started at {money(p.daily.day_start, cur)} · limit {money(p.daily.floor, cur)}</div>
          </div>
        )}
        {p.max && (
          <div>
            <div className="flex justify-between text-sm mb-1"><span>Maximum loss {p.max.pct}%{p.max.trailing ? " (trailing)" : ""}</span>
              <span className="tabular-nums">{money(p.max.left, cur)} left</span></div>
            <Bar pct={p.max.used_pct} tone={risk(p.max.used_pct)} />
            <div className="text-xs text-purple-300/60 mt-1">Must stay above {money(p.max.floor, cur)}</div>
          </div>
        )}
        <div>
          <div className="flex justify-between text-sm mb-1"><span>Trading days</span>
            <span className="tabular-nums">{p.days.traded}{p.days.min ? ` / ${p.days.min}` : ""}</span></div>
          <Bar pct={p.days.min ? (p.days.traded / p.days.min) * 100 : 100} tone="good" />
          <div className="text-xs text-purple-300/60 mt-1">{p.days.min ? (p.days.met ? "Minimum met" : `${p.days.min - p.days.traded} more needed`) : "No minimum"}</div>
        </div>
      </div>
      <div className="text-[11px] text-purple-300/50 mt-3">Firms change their rules: check yours against the firm's current terms (Settings to edit them). Closed trades can't show a breach that happened on floating losses and recovered.</div>
    </div>
  );
}

// ---------------------------------------------------------------- settings

function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); ref.current(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-purple-700/50 bg-gradient-to-br from-gray-950 via-purple-950/80 to-gray-950 p-5 shadow-2xl text-white">
        <div className="flex items-center mb-4"><h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="ml-auto p-1 rounded hover:bg-purple-800/40"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));

function AccountSettings({ uid, account, presets, onClose, onSaved, onRemoved }: {
  uid: string; account: StatsAccount; presets: Preset[]; onClose: () => void; onSaved: (a: StatsAccount) => void; onRemoved: () => void;
}) {
  const [label, setLabel] = useState(account.label);
  const [showLive, setShowLive] = useState(account.show_live);
  const [onBoard, setOnBoard] = useState(account.on_leaderboard);
  const r = account.rules;
  const [firm, setFirm] = useState(r.firm);
  const [phase, setPhase] = useState(r.phase);
  const [f, setF] = useState({
    size: r.account_size?.toString() ?? (account.initial_balance?.toString() ?? ""), target: r.profit_target_pct?.toString() ?? "",
    daily: r.daily_loss_pct?.toString() ?? "", max: r.max_loss_pct?.toString() ?? "", trailing: r.max_loss_trailing, days: String(r.min_trading_days || 0),
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const preset = presets.find(p => p.id === firm);
  // a preset's phase fills the rules in (they can still be changed)
  const choosePhase = (fid: string, pid: string) => {
    setFirm(fid); setPhase(pid);
    const ph = presets.find(p => p.id === fid)?.phases.find(x => x.id === pid);
    if (ph) setF(x => ({ ...x, target: ph.target?.toString() ?? "", daily: String(ph.daily), max: String(ph.max), trailing: ph.trailing, days: String(ph.min_days) }));
  };
  const save = () => {
    setBusy(true); setErr(null);
    const rules: Partial<Rules> & { keep_rules: boolean } = firm ? {
      firm, phase, account_size: num(f.size), profit_target_pct: num(f.target), daily_loss_pct: num(f.daily), max_loss_pct: num(f.max),
      max_loss_trailing: f.trailing, min_trading_days: Number(f.days) || 0, keep_rules: true,
    } : { firm: "", phase: "", keep_rules: true };
    updateAccount(uid, account.id, { label, show_live: showLive, on_leaderboard: onBoard, ...rules })
      .then(onSaved, e => setErr(e.message)).finally(() => setBusy(false));
  };
  return (
    <Modal title="Account settings" onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm">Name<input className={`${input} mt-1`} value={label} onChange={e => setLabel(e.target.value)} placeholder={accountName(account)} maxLength={100} /></label>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={showLive} onChange={e => setShowLive(e.target.checked)} className="mt-1 accent-purple-500" />
          <span><span className="flex items-center gap-1.5 font-medium">{showLive ? <Eye size={14} /> : <EyeOff size={14} />}Show the live account</span>
            <span className="text-purple-300/60 text-xs">Balance, equity and open positions, read from the broker every 15 seconds while you look.</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={onBoard} onChange={e => setOnBoard(e.target.checked)} className="mt-1 accent-purple-500" />
          <span><span className="flex items-center gap-1.5 font-medium"><Trophy size={14} />Show on the leaderboard</span>
            <span className="text-purple-300/60 text-xs">Everyone sees your name, the account's results (return, win rate, profit factor, drawdown), its broker and prop firm. Never the account number or balance.</span></span>
        </label>

        <div className="border-t border-purple-800/40 pt-4">
          <div className="font-medium text-sm mb-2">Prop firm rules</div>
          <div className="grid grid-cols-2 gap-2">
            <TvSelect value={firm} onChange={e => { const v = e.target.value; if (v && v !== "custom") choosePhase(v, presets.find(p => p.id === v)?.phases[0]?.id || ""); else { setFirm(v); setPhase(""); } }} className={input} aria-label="Firm">
              <option value="">None</option>
              {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="custom">Other firm (my own rules)</option>
            </TvSelect>
            {preset && (
              <TvSelect value={phase} onChange={e => choosePhase(firm, e.target.value)} className={input} aria-label="Phase">
                {preset.phases.map(ph => <option key={ph.id} value={ph.id}>{ph.label}</option>)}
              </TvSelect>
            )}
          </div>
          {firm && (
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
              <label>Account size<input className={`${input} mt-1`} inputMode="decimal" value={f.size} onChange={e => setF({ ...f, size: e.target.value })} /></label>
              <label>Profit target %<input className={`${input} mt-1`} inputMode="decimal" value={f.target} onChange={e => setF({ ...f, target: e.target.value })} placeholder="none" /></label>
              <label>Daily loss limit %<input className={`${input} mt-1`} inputMode="decimal" value={f.daily} onChange={e => setF({ ...f, daily: e.target.value })} /></label>
              <label>Maximum loss %<input className={`${input} mt-1`} inputMode="decimal" value={f.max} onChange={e => setF({ ...f, max: e.target.value })} /></label>
              <label>Minimum trading days<input className={`${input} mt-1`} inputMode="numeric" value={f.days} onChange={e => setF({ ...f, days: e.target.value })} /></label>
              <label className="flex items-center gap-2 mt-5"><input type="checkbox" checked={f.trailing} onChange={e => setF({ ...f, trailing: e.target.checked })} className="accent-purple-500" />Maximum loss trails the highest balance</label>
            </div>
          )}
          {preset && <div className="text-[11px] text-purple-300/50 mt-2">{preset.name}'s published rules (Nov 2026). Firms change them: check against your firm's terms.</div>}
        </div>

        {err && <div role="alert" className="text-sm text-red-400">{err}</div>}
        <div className="flex items-center gap-2 pt-2">
          {confirmRemove ? (
            <>
              <span className="text-sm text-red-300">Disconnect? Its saved password / permission is deleted.</span>
              <button className="text-sm px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700" onClick={() => removeAccount(uid, account.id).then(onRemoved, e => setErr(e.message))}>Disconnect</button>
              <button className={btn} onClick={() => setConfirmRemove(false)}>Keep</button>
            </>
          ) : (
            <button className="flex items-center gap-1.5 text-sm text-red-300 hover:text-red-200" onClick={() => setConfirmRemove(true)}><Trash2 size={14} />Disconnect</button>
          )}
          <button className={`${primary} ml-auto`} onClick={save} disabled={busy}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- connecting an account

export function ConnectAccount({ uid, ctraderReady, onClose, onConnected }: {
  uid: string; ctraderReady: boolean; onClose: () => void; onConnected: (a: StatsAccount) => void;
}) {
  const [tab, setTab] = useState<"mt5" | "ctrader">("mt5");
  const [f, setF] = useState({ login: "", password: "", server: "", label: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    connectMt5(uid, f).then(onConnected, x => setErr(x.message)).finally(() => setBusy(false));
  };
  const goCtrader = () => {
    setBusy(true); setErr(null);
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { sessionStorage.setItem("tv:ctraderState", state); } catch { /* storage off */ }
    ctraderUrl(uid, state).then(url => { window.location.href = url; }, x => { setErr(x.message); setBusy(false); });
  };
  return (
    <Modal title="Connect a trading account" onClose={onClose}>
      <p className="text-sm text-purple-300/80 mb-4">Any broker or prop firm account (FTMO, FundedNext, The5ers, FundingPips…). TradePilot only reads it: its whole history for your stats, and its live state if you choose to show it. Every trade counts, wherever you placed it.</p>
      <div className="flex gap-1 p-1 rounded-xl bg-purple-950/60 mb-4" role="tablist">
        {(["mt5", "ctrader"] as const).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setErr(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === t ? "bg-gradient-to-r from-purple-600 to-indigo-600" : "text-purple-300 hover:text-white"}`}>
            {t === "mt5" ? "MetaTrader 5" : "cTrader"}</button>
        ))}
      </div>
      {tab === "mt5" ? (
        <form onSubmit={submit} className="space-y-3">
          <input className={input} placeholder="Account number" inputMode="numeric" value={f.login} onChange={e => setF({ ...f, login: e.target.value })} autoFocus />
          <input className={input} placeholder="Investor (read-only) password" type="password" autoComplete="off" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
          <input className={input} placeholder="Server, e.g. FTMO-Demo or ICMarketsSC-Live07" value={f.server} onChange={e => setF({ ...f, server: e.target.value })} />
          <input className={input} placeholder="Name (optional), e.g. FTMO 100k Challenge" value={f.label} onChange={e => setF({ ...f, label: e.target.value })} maxLength={100} />
          <p className="text-xs text-purple-300/60">Use the <b>investor password</b> your broker or prop firm gave you (in their welcome email or client area): with it the account can be seen but never traded. It's kept encrypted and never shown again.</p>
          {err && <div role="alert" className="text-sm text-red-400">{err}</div>}
          <button type="submit" className={`${primary} w-full`} disabled={busy || !f.login || !f.password || !f.server}>{busy ? "Connecting and reading the history…" : "Connect"}</button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-purple-300/80">Sign in with your cTrader ID and choose which accounts TradePilot may <b>view</b>. TradePilot gets view-only permission: it can't trade, and you can withdraw it any time in your cTrader ID settings.</p>
          {!ctraderReady && <div className="text-sm text-amber-300">cTrader isn't set up on this site yet.</div>}
          {err && <div role="alert" className="text-sm text-red-400">{err}</div>}
          <button className={`${primary} w-full flex items-center justify-center gap-2`} onClick={goCtrader} disabled={busy || !ctraderReady}><Link2 size={16} />Connect with cTrader</button>
        </div>
      )}
    </Modal>
  );
}

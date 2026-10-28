"use client";

// The strategy optimizer's report, in its own bottom-panel tab like the Strategy Tester's: a
// summary (progress, the best combination's full metrics and settings, the runners-up) and every
// result, ranked by any metric with filters. Pause / Continue work from here too; the settings
// are in the Pine Editor's Optimize dialog.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getRun, patchRun, type OptResult, type OptRun, type Ranking } from "../../lib/optimizer/api";
import { optimizerDock } from "../../lib/optimizer/dock";
import { isRunningHere, pauseRun, startRun, useOptimizer } from "../../lib/optimizer/manager";
import { formatMetric, METRIC_INFO, type Metrics } from "../../lib/optimizer/metrics";
import { intervalLabel, type Combo, type OptimizerConfig } from "../../lib/optimizer/space";
import { useEscapeClose } from "../../lib/useEscapeClose";
import { MaximizeIcon, MinimizeIcon, RestoreIcon, Tip } from "../../trading/ui";
import { PANEL_ROW_HEIGHT } from "../../trading/TradingPanel";
import type { ScriptLanguage } from "../../lib/scripting";

const STATUS_LABEL: Record<string, string> = { ready: "Ready", running: "Running", interrupted: "Stopped (its window closed)", paused: "Paused", done: "Done" };
const TABLE_METRICS = ["netProfit", "netProfitPct", "profitFactor", "winRate", "totalTrades", "maxDrawdownPct", "returnToDrawdown", "sharpe", "sortino", "profitableMonthsPct", "avgTrade"];
const SUMMARY_METRICS = ["netProfit", "netProfitPct", "profitFactor", "maxDrawdownPct", "maxDrawdown", "winRate", "totalTrades", "returnToDrawdown",
  "sharpe", "sortino", "profitableMonthsPct", "worstMonthPct", "avgTrade", "avgTradePct", "largestLoss", "longPnl", "shortPnl", "avgBarsInTrade"];
const GOOD_BAD = new Set(["netProfit", "netProfitPct", "avgTrade", "avgTradePct", "longPnl", "shortPnl", "worstMonthPct", "largestLoss"]);

const dur = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.round(h / 24)} days`;
};
const fmtVal = (v: unknown) => (typeof v === "boolean" ? (v ? "on" : "off") : v === undefined ? "" : String(v));
const info = (k: string) => METRIC_INFO.find(m => m.key === k)!;
const tone = (k: string, v: number | null | undefined) => (v == null || !GOOD_BAD.has(k) ? undefined : v > 0 ? "var(--st-pos)" : v < 0 ? "var(--st-neg)" : undefined);

// Applying a result: the chart switches to its symbol and timeframe and runs the strategy with its settings
export async function applyToChart(params: Combo, cfg: OptimizerConfig, code: string, language: ScriptLanguage, scriptName: string) {
  const w = window as any;
  if (params.symbol && w.__chartSymbol !== params.symbol) window.dispatchEvent(new CustomEvent("tv:set-symbol", { detail: { symbol: params.symbol } }));
  if (params.interval && w.__chartInterval !== params.interval) window.dispatchEvent(new CustomEvent("tv:set-interval", { detail: { interval: params.interval } }));
  const key = `${params.symbol}|${params.interval}`;
  for (let i = 0; i < 240 && !(w.__chartDataKey === key && (w.__chartFullData || []).length); i++) await new Promise(r => setTimeout(r, 250));
  const period = cfg.period;
  const range = period.kind === "days" ? { kind: "days", days: period.days } : period.kind === "custom" ? { kind: "custom", from: period.from, to: period.to }
    : period.kind === "history" ? { kind: "history" } : { kind: "all" };
  window.dispatchEvent(new CustomEvent("tv:add-script", { detail: { code, language, scriptName, overrides: params.inputs, capital: cfg.capital, range } }));
}

const OptTabIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <path d="M7 6v16M14 6v16M21 6v16" /><rect x="5" y="15" width="4" height="3" rx="1" fill="currentColor" /><rect x="12" y="9" width="4" height="3" rx="1" fill="currentColor" /><rect x="19" y="17" width="4" height="3" rx="1" fill="currentColor" />
  </svg>
);
const PanelUpIcon = () => <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M4.5 17.5l9.5-8.5 9.5 8.5" /></svg>;
const CloseIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M4 4l10 10M14 4L4 14" /></svg>;

export default function OptimizerReport() {
  const dock = optimizerDock.useValue();
  const { user } = useAuth();
  const uid = user?.uid || "";
  const live = useOptimizer();
  const [run, setRun] = useState<OptRun | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const runId = dock.runId;

  const load = useCallback(async (r?: Ranking | null) => {
    if (!uid || runId == null) return;
    try {
      const x = await getRun(uid, runId, r ?? undefined, 500);
      setRun(x); setErr(null);
      if (!r) setRanking({ sort: "netProfit", dir: "desc", min_trades: 5, ...(x.ranking || {}) });
    } catch (e: any) {
      setErr(e?.status === 404 ? "This optimization was deleted" : e.message);
    }
  }, [uid, runId]);

  useEffect(() => { setRun(null); setRanking(null); load(null); }, [load]);
  const here = runId != null && isRunningHere(runId) && live.phase !== "idle";
  const running = here || run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") load(ranking); }, 2500);
    return () => clearInterval(t);
  }, [running, ranking, load]);
  const prevPhase = useRef(live.phase);
  useEffect(() => {
    if (prevPhase.current !== "idle" && live.phase === "idle" && live.runId === runId) load(ranking);
    prevPhase.current = live.phase;
  }, [live.phase, live.runId, runId, ranking, load]);

  const changeRanking = (r: Ranking) => {
    setRanking(r); load(r);
    if (runId != null && uid) patchRun(uid, runId, { ranking: r }).catch(() => {});
  };

  useEscapeClose(() => optimizerDock.set({ maximized: false }), dock.maximized);
  const toggleOpen = () => { if (dock.maximized) optimizerDock.set({ maximized: false, expanded: false }); else optimizerDock.set({ expanded: !dock.expanded }); };
  const toggleMax = () => optimizerDock.set(d => (d.maximized ? { maximized: false } : { maximized: true, expanded: true }));

  const status = here ? "running" : run?.status || "ready";
  const elsewhere = !here && status === "running";
  const cursor = here ? live.cursor : run?.cursor ?? 0;
  const total = here ? live.total : run?.total ?? 0;
  const pct = total ? Math.min(100, cursor / total * 100) : 0;
  const etaMs = here && live.rate > 0 ? (total - cursor) / live.rate * 1000 : null;
  const cfg = run?.config;
  const varied = cfg?.params.filter(p => p.on) || [];
  const paramText = (c: Combo) => [
    cfg && cfg.symbols.length > 1 ? c.symbol : null, cfg && cfg.intervals.length > 1 ? intervalLabel(c.interval) : null,
    ...varied.map(v => `${v.title} ${fmtVal(c.inputs?.[v.key])}`),
  ].filter(Boolean).join(" · ");
  const apply = async (x: OptResult) => {
    if (!run || !cfg) return;
    setApplied(x.index);
    await applyToChart(x.params, cfg, run.code || "", run.language, run.script_name);
  };
  const cont = async () => {
    if (!run || !uid) return;
    setBusy(true); setErr(null);
    try { await startRun(uid, run, run.code || "", elsewhere); } catch (e: any) { setErr(e.message); }
    setBusy(false); load(ranking);
  };
  const pause = async () => {
    if (runId == null || !uid) return;
    setBusy(true);
    await pauseRun(uid, runId);
    setBusy(false); load(ranking);
  };

  const title = `Optimizer · ${run?.script_name || dock.scriptName || "Strategy"}`;
  return (
    <div className="st-root" data-name="optimizer-report" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* the tab */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, height: PANEL_ROW_HEIGHT, paddingRight: 2, background: dock.expanded ? "var(--tv-panel-strip)" : "var(--st-bg)", color: "var(--st-text)" }}>
        <div style={{
          display: "flex", alignItems: "center", alignSelf: dock.expanded ? "stretch" : "center", minWidth: 0, gap: 10,
          height: dock.expanded ? undefined : 32, margin: dock.expanded ? 0 : "0 0 0 2px", paddingRight: 12,
          borderRadius: dock.expanded ? "0 8px 0 0" : 6, background: dock.expanded ? "var(--st-bg)" : "transparent",
          boxShadow: dock.expanded ? "4px 0 8px -6px rgba(0,0,0,0.25)" : undefined,
        }}>
          <button type="button" aria-label={title} aria-expanded={dock.expanded} onClick={() => { if (!dock.expanded) toggleOpen(); }}
            style={{ display: "flex", alignItems: "center", gap: 10, height: dock.expanded ? PANEL_ROW_HEIGHT : 32, padding: dock.expanded ? "0 0 0 12px" : "0 0 0 10px", border: "none", background: "transparent", color: "inherit", fontSize: 14, minWidth: 0, cursor: dock.expanded ? "default" : "pointer" }}>
            <OptTabIcon />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>{title}</span>
          </button>
          {run && (
            <span data-name="optimizer-tab-status" style={{ fontSize: 12, whiteSpace: "nowrap", color: status === "running" ? "#089981" : "var(--st-text-secondary)" }}>
              {status === "done" ? "Done" : `${Math.floor(pct)}%${status === "running" ? "" : ` · ${STATUS_LABEL[status] || status}`}`}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Tip text={dock.expanded && !dock.maximized ? "Collapse panel" : "Open panel"}>
            <button type="button" className="tv-bb-btn" aria-label={dock.expanded && !dock.maximized ? "Collapse panel" : "Open panel"} onClick={toggleOpen} style={{ width: 34, height: 34, padding: 0 }}>
              {dock.expanded ? <MinimizeIcon size={28} /> : <PanelUpIcon />}
            </button>
          </Tip>
          <Tip text={dock.maximized ? "Restore panel" : "Maximize panel"}>
            <button type="button" className="tv-bb-btn" aria-label={dock.maximized ? "Restore panel" : "Maximize panel"} onClick={toggleMax} style={{ width: 34, height: 34, padding: 0 }}>
              {dock.maximized ? <RestoreIcon size={28} /> : <MaximizeIcon size={28} />}
            </button>
          </Tip>
          <Tip text="Close the report (the optimization keeps going)">
            <button type="button" className="tv-bb-btn" aria-label="Close optimizer report" data-name="optimizer-report-close" onClick={() => optimizerDock.set({ open: false, maximized: false })} style={{ width: 34, height: 34, padding: 0 }}>
              <CloseIcon />
            </button>
          </Tip>
        </div>
      </div>

      {dock.expanded && (
        <>
          {/* toolbar: views, progress, actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 20px", margin: "8px 0", flexShrink: 0, flexWrap: "wrap" }}>
            <div className="st-lighttabs" role="tablist" aria-label="Report view" style={{ gridTemplateColumns: "auto auto" }}>
              {(["summary", "results"] as const).map(v => (
                <button key={v} type="button" role="tab" aria-selected={dock.view === v} className={`st-lighttab${dock.view === v ? " selected" : ""}`}
                  data-name={`optimizer-view-${v}`} onClick={() => optimizerDock.set({ view: v })} style={{ width: "auto", padding: "0 12px", fontSize: 13 }}>
                  {v === "summary" ? "Summary" : "All results"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220, flex: "1 1 280px" }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--st-fill)", overflow: "hidden", maxWidth: 360 }}>
                <div data-name="optimizer-progress" style={{ width: `${pct}%`, height: "100%", background: status === "done" ? "var(--tv-color-accent, #2962ff)" : "#089981", transition: "width .3s" }} />
              </div>
              <span style={{ fontSize: 13, whiteSpace: "nowrap" }} data-name="optimizer-count">{cursor.toLocaleString()} of {total.toLocaleString()} tested</span>
              <span style={{ fontSize: 12, color: "var(--st-text-secondary)", whiteSpace: "nowrap" }}>
                {elsewhere ? "Running in another window" : STATUS_LABEL[status] || status}
                {etaMs != null ? ` · about ${dur(etaMs)} left` : ""}
                {here && live.message ? ` · ${live.message}` : ""}
              </span>
            </div>
            {err && <span style={{ fontSize: 12, color: "var(--st-neg)" }}>{err}</span>}
            {here || elsewhere
              ? <button type="button" className="st-pill" onClick={pause} disabled={busy || live.phase === "pausing"} data-name="optimizer-pause">{live.phase === "pausing" ? "Pausing…" : "Pause"}</button>
              : run && status !== "done" && <button type="button" className="st-pill" onClick={cont} disabled={busy} data-name="optimizer-continue">{status === "ready" ? "Start" : "Continue"}</button>}
          </div>

          <div className="st-scroll" data-name="optimizer-report-body" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            {!run ? <div style={{ padding: 24, color: "var(--st-text-secondary)", fontSize: 14 }}>{err || (runId == null ? "No optimization chosen" : "Loading…")}</div>
              : dock.view === "summary"
                ? <Summary run={run} ranking={ranking} paramText={paramText} onApply={apply} applied={applied} onShowAll={() => optimizerDock.set({ view: "results" })} />
                : <AllResults run={run} ranking={ranking} onRanking={changeRanking} paramText={paramText} onApply={apply} applied={applied} />}
          </div>
        </>
      )}
    </div>
  );
}

// ---- summary: the best combination

function Summary({ run, ranking, paramText, onApply, applied, onShowAll }: {
  run: OptRun; ranking: Ranking | null; paramText: (c: Combo) => string; onApply: (x: OptResult) => void; applied: number | null; onShowAll: () => void;
}) {
  const best = run.best;
  const sortKey = ranking?.sort || "netProfit";
  const by = info(sortKey) || info("netProfit");
  const rest = (run.results || []).slice(1, 6);
  if (!best || !best.metrics) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--st-text-secondary)", fontSize: 14 }} data-name="optimizer-empty">
        {run.tested ? `None of the ${run.tested.toLocaleString()} combinations tested so far pass the filters (All results to change them).` : "No results yet: they appear here as combinations are tested."}
      </div>
    );
  }
  const m = best.metrics as Metrics;
  return (
    <div style={{ padding: "8px 20px 24px" }} data-name="optimizer-summary">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <div style={{ fontSize: 12, color: "var(--st-text-secondary)" }}>Best by {by.label.toLowerCase()} · out of {(run.passing ?? 0).toLocaleString()} passing the filters ({(run.tested ?? 0).toLocaleString()} tested)</div>
          <div style={{ fontSize: 20, fontWeight: 600, lineHeight: "28px", marginTop: 2 }} data-name="optimizer-best-params">{paramText(best.params) || "The script's settings"}</div>
          <div style={{ fontSize: 13, color: "var(--st-text-secondary)", marginTop: 2 }}>{best.params.symbol} · {intervalLabel(best.params.interval)}</div>
        </div>
        <button type="button" className="st-pill" onClick={() => onApply(best)} data-name="optimizer-apply-best" style={{ fontWeight: 600 }}>
          {applied === best.index ? "Applied to chart" : "Apply to chart"}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1, background: "var(--st-row-border)", border: "1px solid var(--st-row-border)", borderRadius: 8, overflow: "hidden" }}>
        {SUMMARY_METRICS.map(k => {
          const mi = info(k);
          const v = (m as any)[k] as number | null;
          return (
            <div key={k} style={{ background: "var(--st-bg)", padding: "10px 14px" }} data-metric={k}>
              <div style={{ fontSize: 12, color: k === sortKey ? "var(--st-text)" : "var(--st-text-secondary)", fontWeight: k === sortKey ? 600 : 400 }}>{mi.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4, color: tone(k, v) }}>{formatMetric(mi.kind, v)}</div>
            </div>
          );
        })}
        <div style={{ background: "var(--st-bg)", padding: "10px 14px" }}>
          <div style={{ fontSize: 12, color: "var(--st-text-secondary)" }}>Profitable years</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{m.years ? `${m.profitableYears} of ${m.years}` : "—"}</div>
        </div>
      </div>
      {rest.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "20px 0 8px" }}>
            <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Runners-up</p>
            <button type="button" onClick={onShowAll} style={{ border: "none", background: "transparent", color: "var(--tv-color-accent, #2962ff)", cursor: "pointer", fontSize: 13, padding: 0 }}>All results</button>
          </div>
          <table className="st-table">
            <thead><tr><th>#</th><th>Settings</th>{["netProfit", "profitFactor", "maxDrawdownPct", "winRate", "totalTrades"].map(k => <th key={k} style={{ textAlign: "right" }}>{info(k).short}</th>)}<th /></tr></thead>
            <tbody>
              {rest.map((x, i) => (
                <tr key={x.index}>
                  <td>{i + 2}</td>
                  <td style={{ whiteSpace: "normal" }}>{paramText(x.params) || "—"}</td>
                  {["netProfit", "profitFactor", "maxDrawdownPct", "winRate", "totalTrades"].map(k => <td key={k} style={{ textAlign: "right", color: tone(k, (x.metrics as any)?.[k]) }}>{formatMetric(info(k).kind, (x.metrics as any)?.[k])}</td>)}
                  <td style={{ textAlign: "right" }}><button type="button" className="st-pill" onClick={() => onApply(x)}>{applied === x.index ? "Applied" : "Apply"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ---- every result, ranked and filtered

function NumIn({ value, onChange, placeholder, width = 56, name }: { value: number | "" | undefined; onChange: (v: number | "") => void; placeholder?: string; width?: number; name: string }) {
  const [t, setT] = useState(value === "" || value == null ? "" : String(value));
  useEffect(() => { setT(value === "" || value == null ? "" : String(value)); }, [value]);
  return <input className="st-input" value={t} placeholder={placeholder} inputMode="decimal" data-name={name} style={{ width, height: 28 }}
    onKeyDown={e => e.stopPropagation()}
    onChange={e => { setT(e.target.value); const s = e.target.value.trim(); if (s === "") onChange(""); else if (Number.isFinite(Number(s))) onChange(Number(s)); }} />;
}

function AllResults({ run, ranking, onRanking, paramText, onApply, applied }: {
  run: OptRun; ranking: Ranking | null; onRanking: (r: Ranking) => void; paramText: (c: Combo) => string; onApply: (x: OptResult) => void; applied: number | null;
}) {
  const r = ranking || { sort: "netProfit", dir: "desc" as const };
  const sort = r.sort || "netProfit";
  const mi = info(sort) || info("netProfit");
  const dir = r.dir || (mi.lowerBetter ? "asc" : "desc");
  const cols = useMemo(() => (TABLE_METRICS.includes(sort) ? TABLE_METRICS : [sort, ...TABLE_METRICS]).map(info).filter(Boolean), [sort]);
  const sortBy = (k: string) => {
    const x = info(k);
    onRanking({ ...r, sort: k, dir: k === sort ? (dir === "desc" ? "asc" : "desc") : (x.lowerBetter ? "asc" : "desc") });
  };
  const rows = run.results || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 20px 12px", flexWrap: "wrap", fontSize: 13 }}>
        <span style={{ color: "var(--st-text-secondary)" }}>Best by</span>
        <select className="st-input" value={sort} onChange={e => sortBy(e.target.value)} data-name="optimizer-sort" style={{ width: 190, height: 28, appearance: "auto" }}>
          {METRIC_INFO.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        <button type="button" className="st-pill" onClick={() => onRanking({ ...r, dir: dir === "desc" ? "asc" : "desc" })}>{dir === "desc" ? "Highest first" : "Lowest first"}</button>
        <span style={{ color: "var(--st-text-secondary)" }}>at least</span>
        <NumIn value={r.min_trades} onChange={v => onRanking({ ...r, min_trades: v })} name="optimizer-min-trades" />
        <span style={{ color: "var(--st-text-secondary)" }}>trades · drawdown at most</span>
        <NumIn value={r.max_dd} onChange={v => onRanking({ ...r, max_dd: v })} placeholder="any" name="optimizer-max-dd" />
        <span style={{ color: "var(--st-text-secondary)" }}>% · profit factor at least</span>
        <NumIn value={r.min_pf} onChange={v => onRanking({ ...r, min_pf: v })} placeholder="any" name="optimizer-min-pf" />
        <label style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={!!r.profitable} onChange={e => onRanking({ ...r, profitable: e.target.checked })} data-name="optimizer-profitable" />Profitable</label>
        <label style={{ display: "flex", gap: 5, alignItems: "center" }} title="Made money in every calendar year it traded"><input type="checkbox" checked={!!r.every_year} onChange={e => onRanking({ ...r, every_year: e.target.checked })} />Every year profitable</label>
        <span style={{ marginLeft: "auto", color: "var(--st-text-secondary)" }} data-name="optimizer-footer">
          {(run.passing ?? 0).toLocaleString()} of {(run.tested ?? 0).toLocaleString()} pass{rows.length < (run.passing ?? 0) ? ` · best ${rows.length} shown` : ""}{run.failed ? ` · ${run.failed.toLocaleString()} couldn't run` : ""}
        </span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--st-text-secondary)", fontSize: 14 }}>
          {run.tested ? "None pass the filters." : "No results yet."}
        </div>
      ) : (
        <table className="st-table" data-name="optimizer-results">
          <thead>
            <tr>
              <th>#</th>
              <th>Settings</th>
              {cols.map(c => (
                <th key={c.key} onClick={() => sortBy(c.key)} title={c.label} style={{ textAlign: "right", cursor: "pointer", color: c.key === sort ? "var(--st-text)" : undefined }}>
                  {c.short}{c.key === sort ? (dir === "desc" ? " ↓" : " ↑") : ""}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((x, i) => (
              <tr key={x.index} data-name="optimizer-row">
                <td>{i + 1}</td>
                <td style={{ whiteSpace: "normal", minWidth: 220 }}>{paramText(x.params) || "—"}</td>
                {cols.map(c => <td key={c.key} style={{ textAlign: "right", color: tone(c.key, (x.metrics as any)?.[c.key]) }}>{formatMetric(c.kind, (x.metrics as any)?.[c.key])}</td>)}
                <td style={{ textAlign: "right" }}><button type="button" className="st-pill" onClick={() => onApply(x)} data-name="optimizer-apply">{applied === x.index ? "Applied" : "Apply"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

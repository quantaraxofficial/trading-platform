"use client";

// Strategy optimizer (Pine Editor → Optimize, strategies only): choose what to vary — symbols, chart
// timeframes, the script's inputs — the testing period and capital; every combination is
// backtested (src/app/lib/optimizer) and ranked by the metric you choose, with filters. A run can be
// paused, the window closed, and continued later; its settings change only while it's paused.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { getScriptInputsMeta, type ScriptLanguage } from "../../lib/scripting";
import { deleteRun, getRun, listRuns, patchRun, createRun, type OptResult, type OptRun, type Ranking } from "../../lib/optimizer/api";
import { isRunningHere, pauseRun, startRun, useOptimizer } from "../../lib/optimizer/manager";
import { formatMetric, METRIC_INFO } from "../../lib/optimizer/metrics";
import {
  defaultSpec, intervalLabel, isRange, OPT_INTERVALS, problemsOf, spaceSize, totalOf, valuesOf, type Combo, type OptimizerConfig, type ParamSpec, type Period,
} from "../../lib/optimizer/space";
import { ConfirmDialog, Frame, PineButton, type PinePalette } from "./PineDialogs";
import { applyToChart } from "../optimizer/OptimizerReport";
import { showOptimizerReport } from "../../lib/optimizer/dock";

const PACES: { id: OptimizerConfig["pace"]; label: string; hint: string }[] = [
  { id: "gentle", label: "Gentle", hint: "rests 3× as long as each test: the PC stays cool" },
  { id: "balanced", label: "Balanced", hint: "about half of one CPU core" },
  { id: "full", label: "Full speed", hint: "one CPU core, flat out" },
];
const STATUS_LABEL: Record<string, string> = { ready: "Ready", running: "Running", interrupted: "Stopped (its window closed)", paused: "Paused", done: "Done" };

const dur = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.round(h / 24)} days`;
};
const toDate = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
const fromDate = (s: string) => Math.floor(Date.parse(`${s}T00:00:00Z`) / 1000);

function initialConfig(language: ScriptLanguage, code: string): OptimizerConfig {
  const w = typeof window !== "undefined" ? (window as any) : {};
  return {
    symbols: [w.__chartSymbol || "XAU/USD"],
    intervals: [w.__chartInterval || "1h"],
    params: getScriptInputsMeta(language, code).map(defaultSpec).filter((x): x is ParamSpec => !!x),
    period: { kind: "chart" },
    capital: null,
    search: { mode: "grid", samples: 500, seed: Math.floor(Math.random() * 1e9) },
    pace: "balanced",
  };
}

// The script's current inputs, keeping what was set for those that are still there
function withCurrentInputs(cfg: OptimizerConfig, language: ScriptLanguage, code: string): OptimizerConfig {
  const fresh = getScriptInputsMeta(language, code).map(defaultSpec).filter((x): x is ParamSpec => !!x);
  return { ...cfg, params: fresh.map(f => cfg.params.find(p => p.key === f.key && p.type === f.type) || f) };
}

export default function OptimizerDialog({ p, uid, scriptKey, scriptName, language, code, onClose }: {
  p: PinePalette; uid: string; scriptKey: string; scriptName: string; language: ScriptLanguage; code: string; onClose: () => void;
}) {
  const live = useOptimizer();
  const [runs, setRuns] = useState<OptRun[] | null>(null);
  const [selected, setSelected] = useState<number | "new">("new");
  const [detail, setDetail] = useState<OptRun | null>(null);
  const [draft, setDraft] = useState<OptimizerConfig>(() => initialConfig(language, code));
  const [dirty, setDirty] = useState(false);
  const [ranking, setRanking] = useState<Ranking>({ sort: "netProfit", dir: "desc", min_trades: 5 });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | { title: string; text: React.ReactNode; confirm: string; go: () => void }>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const reloadRuns = useCallback(async (pick?: number) => {
    try {
      const list = await listRuns(uid, scriptKey);
      setRuns(list);
      if (pick !== undefined) setSelected(pick);
      return list;
    } catch (e: any) { setErr(e.message); return []; }
  }, [uid, scriptKey]);

  // Open on the run under way in this window, else the latest one (unless one was picked meanwhile)
  const picked = useRef(false);
  useEffect(() => {
    reloadRuns().then(list => {
      if (picked.current) return;
      if (live.runId && list.some(r => r.id === live.runId)) setSelected(live.runId);
      else if (list.length) setSelected(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDetail = useCallback(async (id: number, r: Ranking) => {
    try { setDetail(await getRun(uid, id, r)); } catch (e: any) { setErr(e.message); }
  }, [uid]);

  // A run picked: its settings and ranking, its results
  useEffect(() => {
    if (selected === "new") { setDetail(null); setDraft(initialConfig(language, code)); setDirty(false); return; }
    const run = runs?.find(r => r.id === selected);
    const r = { sort: "netProfit", dir: "desc", min_trades: 5, ...(run?.ranking || {}) } as Ranking;
    setRanking(r);
    if (run) { setDraft(run.config); setDirty(false); }
    loadDetail(selected, r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // While it runs (here or in another window), its results refresh
  const runningSomewhere = detail?.status === "running" || (typeof selected === "number" && isRunningHere(selected));
  useEffect(() => {
    if (typeof selected !== "number" || !runningSomewhere) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") loadDetail(selected, ranking); }, 2500);
    return () => clearInterval(t);
  }, [selected, runningSomewhere, ranking, loadDetail]);
  // …and once this window stops running it
  const prevPhase = useRef(live.phase);
  useEffect(() => {
    if (prevPhase.current !== "idle" && live.phase === "idle" && typeof selected === "number") { loadDetail(selected, ranking); reloadRuns(); }
    prevPhase.current = live.phase;
  }, [live.phase, selected, ranking, loadDetail, reloadRuns]);


  const run = typeof selected === "number" ? runs?.find(r => r.id === selected) || null : null;
  const here = !!run && isRunningHere(run.id) && live.phase !== "idle";
  const status = here ? "running" : detail?.status ?? run?.status ?? "ready";
  const elsewhere = !here && status === "running";
  const locked = here || elsewhere;
  const problem = problemsOf(draft);
  const total = problem ? 0 : totalOf(draft);
  const codeChanged = !!detail?.code && detail.code !== code;

  // ---- actions
  const start = async (force = false) => {
    setErr(null); setBusy(true);
    try {
      let target: OptRun;
      if (selected === "new") {
        if (problem) { setErr(problem); return; }
        target = await createRun(uid, { script_key: scriptKey, script_name: scriptName, language, code, config: draft, ranking, total });
        await reloadRuns(target.id);
        await startRun(uid, target, code, force);
        showOptimizerReport(target.id, scriptName);
      } else {
        const fresh = detail || run!;
        target = fresh;
        await startRun(uid, fresh, fresh.code || code, force);
        showOptimizerReport(fresh.id, scriptName);
      }
      reloadRuns();
    } catch (e: any) {
      if (e?.data?.elsewhere) setConfirm({ title: "Running in another window", text: "This optimization is running in another window or tab. Take it over here? That window stops at its next save.", confirm: "Take over", go: () => { setConfirm(null); start(true); } });
      else setErr(e.message);
    } finally { setBusy(false); }
  };
  const pause = async () => {
    if (typeof selected !== "number") return;
    setBusy(true);
    await pauseRun(uid, selected);
    await loadDetail(selected, ranking); await reloadRuns();
    setBusy(false);
  };
  const saveSettings = (withCode: boolean) => {
    if (typeof selected !== "number") return;
    if (problem) { setErr(problem); return; }
    const cfg = withCode ? withCurrentInputs(draft, language, code) : draft;
    const doIt = async () => {
      setConfirm(null); setBusy(true); setErr(null);
      try {
        const r = await patchRun(uid, selected, { config: cfg, total: totalOf(cfg), ...(withCode ? { code, language } : {}) });
        setDraft(cfg); setDirty(false); setDetail(r); await reloadRuns();
      } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
    };
    const tested = detail?.tested || 0;
    if (tested) setConfirm({ title: "Start over?", text: <>New settings start this optimization over: the {tested.toLocaleString()} results so far are deleted.</>, confirm: "Start over", go: doIt });
    else doIt();
  };
  const remove = () => {
    if (typeof selected !== "number") return;
    setConfirm({ title: "Delete this optimization?", text: "It and all its results are deleted.", confirm: "Delete", go: async () => {
      setConfirm(null);
      if (isRunningHere(selected)) await pauseRun(uid, selected);
      await deleteRun(uid, selected);
      const list = await reloadRuns();
      setSelected(list.length ? list[0].id : "new");
    } });
  };
  const edit = (c: OptimizerConfig) => { setDraft(c); setDirty(true); };

  const progress = here ? live.cursor : detail?.cursor ?? run?.cursor ?? 0;
  const runTotal = here ? live.total : detail?.total ?? run?.total ?? total;
  const etaMs = here && live.rate > 0 ? (runTotal - progress) / live.rate * 1000 : null;

  return (
    <Frame p={p} title="Strategy optimizer" onClose={onClose} width={1240} height={820} testId="optimizer-dialog"
      titleExtra={<span style={{ fontSize: 14, fontWeight: 400, color: p.muted, marginLeft: 6 }}>{scriptName}</span>}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 20px 12px", borderBottom: `1px solid ${p.border}`, flexWrap: "wrap" }}>
        <select value={String(selected)} onChange={e => { picked.current = true; setSelected(e.target.value === "new" ? "new" : Number(e.target.value)); }} data-testid="opt-run-select"
          style={{ ...fieldStyle(p), width: 320 }}>
          <option value="new">New optimization…</option>
          {(runs || []).map((r, i) => (
            <option key={r.id} value={r.id}>{r.name || `Optimization ${runs!.length - i}`} · {r.cursor.toLocaleString()}/{r.total.toLocaleString()} · {STATUS_LABEL[r.status] || r.status}</option>
          ))}
        </select>
        {selected !== "new" && <PineButton p={p} onClick={() => { picked.current = true; setSelected("new"); }}>New</PineButton>}
        <span style={{ flex: 1 }} />
        {err && <span style={{ color: p.danger, fontSize: 13 }} data-testid="opt-error">{err}</span>}
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: 400, flexShrink: 0, overflowY: "auto", borderRight: `1px solid ${p.border}`, padding: "12px 20px 20px" }} data-testid="opt-settings">
          {locked && <Note p={p}>Pause it to change its settings.</Note>}
          <Settings p={p} cfg={draft} onChange={edit} locked={locked} />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* status and actions */}
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${p.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span data-testid="opt-status" style={{ fontSize: 13, fontWeight: 600, padding: "2px 8px", borderRadius: 4, border: `1px solid ${p.border}`,
                color: status === "running" ? "#089981" : status === "done" ? p.blue : status === "interrupted" ? "#ff9800" : p.text }}>
                {selected === "new" ? "New" : elsewhere ? "Running in another window" : STATUS_LABEL[status] || status}
              </span>
              <span style={{ fontSize: 13, color: p.muted }} data-testid="opt-count">
                {selected === "new" ? (problem ? "" : `${total.toLocaleString()} combination${total === 1 ? "" : "s"}${draft.search.mode === "random" ? ` (a random sample of ${spaceSize(draft).toLocaleString()})` : ""}`)
                  : `${progress.toLocaleString()} of ${runTotal.toLocaleString()} tested`}
              </span>
              <span style={{ flex: 1 }} />
              {selected === "new" && <PineButton p={p} kind="primary" onClick={() => start()} disabled={busy || !!problem}>Start</PineButton>}
              {selected !== "new" && here && <PineButton p={p} onClick={pause} disabled={busy || live.phase === "pausing"}>{live.phase === "pausing" ? "Pausing…" : "Pause"}</PineButton>}
              {selected !== "new" && elsewhere && <><PineButton p={p} onClick={pause} disabled={busy}>Pause</PineButton><PineButton p={p} onClick={() => start(true)} disabled={busy}>Run it here</PineButton></>}
              {selected !== "new" && !locked && status !== "done" && !dirty && (
                <PineButton p={p} kind="primary" onClick={() => start()} disabled={busy}>{status === "ready" ? "Start" : "Continue"}</PineButton>
              )}
              {selected !== "new" && !locked && dirty && <PineButton p={p} kind="primary" onClick={() => saveSettings(false)} disabled={busy || !!problem}>Save settings</PineButton>}
              {selected !== "new" && !locked && dirty && <PineButton p={p} onClick={() => { setDraft(run!.config); setDirty(false); }}>Discard</PineButton>}
              {selected !== "new" && !locked && <PineButton p={p} onClick={remove}>Delete</PineButton>}
            </div>
            {selected !== "new" && (
              <>
                <div style={{ height: 6, borderRadius: 3, background: p.hover, marginTop: 10, overflow: "hidden" }}>
                  <div data-testid="opt-progress" style={{ width: `${runTotal ? Math.min(100, progress / runTotal * 100) : 0}%`, height: "100%", background: status === "done" ? p.blue : "#089981", transition: "width .3s" }} />
                </div>
                <div style={{ fontSize: 12, color: p.muted, marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {here && live.message && <span data-testid="opt-message">{live.message}</span>}
                  {here && live.rate > 0 && <span>{live.rate >= 1 ? `${live.rate.toFixed(1)} a second` : `${(1 / live.rate).toFixed(1)} s each`}</span>}
                  {etaMs != null && <span>about {dur(etaMs)} left</span>}
                  {!!detail?.elapsed_ms && <span>{dur(detail.elapsed_ms + (here ? live.sessionMs : 0))} of testing so far</span>}
                  {!!detail?.failed && <span>{detail.failed.toLocaleString()} couldn&apos;t run</span>}
                  {status === "interrupted" && <span>Continue picks up from where it stopped.</span>}
                  {!here && live.runId === selected && live.error && <span style={{ color: p.danger }}>{live.error}</span>}
                </div>
              </>
            )}
            {codeChanged && (
              <div style={{ marginTop: 10, fontSize: 13, padding: "8px 10px", borderRadius: 6, background: p.hover, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }} data-testid="opt-code-changed">
                <span style={{ flex: 1 }}>The script has changed since this optimization started: it keeps testing the version it started with.</span>
                {!locked && <PineButton p={p} onClick={() => saveSettings(true)}>Start over with the current code</PineButton>}
              </div>
            )}
          </div>

          {selected === "new" ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", color: p.muted, fontSize: 14, lineHeight: "22px" }}>
              <div style={{ maxWidth: 460 }}>
                Choose the symbols, timeframes and inputs to try on the left, then <b style={{ color: p.text }}>Start</b>.<br />
                Every combination is backtested and ranked. You can pause, close this window or the whole page, and continue later from where it stopped.
                {problem && <div style={{ color: p.danger, marginTop: 12 }} data-testid="opt-problem">{problem}</div>}
              </div>
            </div>
          ) : (
            <BestSoFar p={p} run={detail} applied={applied}
              onShowReport={() => typeof selected === "number" && showOptimizerReport(selected, scriptName)}
              onApply={async (x) => {
                const cfg = detail?.config || draft;
                setApplied(`${x.index}`);
                await applyToChart(x.params, cfg, detail?.code || code, language, scriptName);
              }} />
          )}
        </div>
      </div>
      {confirm && <ConfirmDialog p={p} title={confirm.title} text={confirm.text} confirm={confirm.confirm} onCancel={() => setConfirm(null)} onConfirm={confirm.go} />}
    </Frame>
  );
}

// ---- settings

function fieldStyle(p: PinePalette): React.CSSProperties {
  return { height: 32, boxSizing: "border-box", padding: "0 8px", borderRadius: 6, border: `1px solid ${p.border}`, background: p.inputBg, color: p.text, fontSize: 13, fontFamily: "inherit", minWidth: 0 };
}
const Note = ({ p, children }: { p: PinePalette; children: React.ReactNode }) => (
  <div style={{ fontSize: 13, padding: "8px 10px", borderRadius: 6, background: p.hover, marginBottom: 12 }} data-testid="opt-locked">{children}</div>
);
const H = ({ children, p, right }: { children: React.ReactNode; p: PinePalette; right?: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "16px 0 8px" }}>
    <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: p.muted, flex: 1 }}>{children}</span>{right}
  </div>
);
function Chip({ p, on, children, onClick, disabled, testId }: { p: PinePalette; on: boolean; children: React.ReactNode; onClick?: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} aria-pressed={on}
      style={{ height: 28, padding: "0 10px", borderRadius: 14, fontSize: 13, fontFamily: "inherit", cursor: disabled ? "default" : "pointer",
        border: `1px solid ${on ? p.text : p.border}`, background: on ? p.text : "transparent", color: on ? p.bg : p.text, opacity: disabled && !on ? 0.5 : 1 }}>
      {children}
    </button>
  );
}

function NumberField({ p, value, onChange, disabled, width = 76, testId, placeholder }: { p: PinePalette; value: number | null; onChange: (v: number | null) => void; disabled?: boolean; width?: number; testId?: string; placeholder?: string }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => { setText(value == null ? "" : String(value)); }, [value]);
  return (
    <input value={text} disabled={disabled} inputMode="decimal" data-testid={testId} placeholder={placeholder}
      onChange={e => { setText(e.target.value); const t = e.target.value.trim(); if (t === "") onChange(null); else if (Number.isFinite(Number(t))) onChange(Number(t)); }}
      onKeyDown={e => e.stopPropagation()}
      style={{ ...fieldStyle(p), width }} />
  );
}

function Settings({ p, cfg, onChange, locked }: { p: PinePalette; cfg: OptimizerConfig; onChange: (c: OptimizerConfig) => void; locked: boolean }) {
  const [sym, setSym] = useState("");
  const set = (patch: Partial<OptimizerConfig>) => onChange({ ...cfg, ...patch });
  const setParam = (i: number, patch: Partial<ParamSpec>) => set({ params: cfg.params.map((x, j) => (j === i ? { ...x, ...patch } as ParamSpec : x)) });
  const addSymbol = () => {
    const s = sym.trim().toUpperCase();
    if (s && !cfg.symbols.includes(s)) set({ symbols: [...cfg.symbols, s] });
    setSym("");
  };
  const period = cfg.period;
  const setPeriod = (pr: Period) => set({ period: pr });
  const now = Math.floor(Date.now() / 1000);
  return (
    <fieldset disabled={locked} style={{ border: "none", margin: 0, padding: 0, minWidth: 0, opacity: locked ? 0.7 : 1 }}>
      <H p={p}>Symbols</H>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} data-testid="opt-symbols">
        {cfg.symbols.map(s => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 28, padding: "0 4px 0 10px", borderRadius: 14, border: `1px solid ${p.border}`, fontSize: 13 }}>
            {s}<button type="button" aria-label={`Remove ${s}`} onClick={() => set({ symbols: cfg.symbols.filter(x => x !== s) })}
              style={{ border: "none", background: "transparent", color: p.muted, cursor: "pointer", fontSize: 14, width: 20 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input value={sym} onChange={e => setSym(e.target.value)} placeholder="Add a symbol, e.g. EUR/USD" data-testid="opt-symbol-input"
          onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") addSymbol(); }} style={{ ...fieldStyle(p), flex: 1 }} />
        <PineButton p={p} onClick={addSymbol} disabled={!sym.trim()}>Add</PineButton>
      </div>

      <H p={p}>Chart timeframes</H>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} data-testid="opt-intervals">
        {OPT_INTERVALS.map(iv => {
          const on = cfg.intervals.includes(iv.value);
          return <Chip key={iv.value} p={p} on={on} testId={`opt-tf-${iv.value}`}
            onClick={() => set({ intervals: on ? cfg.intervals.filter(x => x !== iv.value) : [...cfg.intervals, iv.value] })}>{iv.label}</Chip>;
        })}
      </div>

      <H p={p}>Inputs</H>
      {cfg.params.length === 0 && <div style={{ fontSize: 13, color: p.muted }}>The script has no inputs that can be varied (numbers, on/off, option lists, timeframes).</div>}
      {cfg.params.map((x, i) => {
        const n = valuesOf(x).length;
        return (
          <div key={x.key} style={{ padding: "8px 0", borderTop: i ? `1px solid ${p.border}` : undefined }} data-testid="opt-param" data-key={x.key}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={x.on} onChange={e => setParam(i, { on: e.target.checked })} data-testid="opt-param-on" />
              <span style={{ flex: 1, fontWeight: 600 }}>{x.title}</span>
              <span style={{ color: p.muted, fontSize: 12 }}>{x.on ? `${n.toLocaleString()} value${n === 1 ? "" : "s"}` : "fixed at its setting"}</span>
            </label>
            {x.on && isRange(x) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, marginLeft: 24, fontSize: 12, color: p.muted }}>
                from <NumberField p={p} value={x.from} onChange={v => setParam(i, { from: v ?? NaN })} testId="opt-from" />
                to <NumberField p={p} value={x.to} onChange={v => setParam(i, { to: v ?? NaN })} testId="opt-to" />
                step <NumberField p={p} value={x.step} onChange={v => setParam(i, { step: v ?? NaN })} testId="opt-step" width={64} />
              </div>
            )}
            {x.on && !isRange(x) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, marginLeft: 24 }}>
                {x.options.map(o => {
                  const on = x.values.includes(o);
                  return <Chip key={String(o)} p={p} on={on} onClick={() => setParam(i, { values: on ? x.values.filter(v => v !== o) : [...x.values, o] })}>
                    {typeof o === "boolean" ? (o ? "On" : "Off") : x.type === "timeframe" ? (o || "Chart") : o}</Chip>;
                })}
              </div>
            )}
          </div>
        );
      })}

      <H p={p}>Testing period</H>
      <select value={period.kind} data-testid="opt-period" style={{ ...fieldStyle(p), width: "100%" }}
        onChange={e => {
          const k = e.target.value as Period["kind"];
          setPeriod(k === "days" ? { kind: "days", days: 365 } : k === "custom" ? { kind: "custom", from: now - 365 * 86400, to: now } : { kind: k } as Period);
        }}>
        <option value="chart">The bars one chart load gives</option>
        <option value="days">The last … days</option>
        <option value="custom">From a date to a date</option>
        <option value="history">The whole history (slow to load)</option>
      </select>
      {period.kind === "days" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 13 }}>
          Last <NumberField p={p} value={period.days} onChange={v => setPeriod({ kind: "days", days: v ?? 0 })} testId="opt-days" /> days
        </div>
      )}
      {period.kind === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 13 }}>
          <input type="date" value={toDate(period.from)} onChange={e => e.target.value && setPeriod({ ...period, from: fromDate(e.target.value) })} style={fieldStyle(p)} />
          to
          <input type="date" value={toDate(period.to)} onChange={e => e.target.value && setPeriod({ ...period, to: fromDate(e.target.value) })} style={fieldStyle(p)} />
        </div>
      )}
      <div style={{ fontSize: 12, color: p.muted, marginTop: 6 }}>Bars before the period still warm the strategy up; it only trades inside it.</div>

      <H p={p}>Initial capital</H>
      <NumberField p={p} value={cfg.capital} onChange={v => set({ capital: v })} width={160} placeholder="The script's own" testId="opt-capital" />

      <H p={p}>Search</H>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="radio" checked={cfg.search.mode === "grid"} onChange={() => set({ search: { ...cfg.search, mode: "grid" } })} data-testid="opt-grid" />
          Every combination ({spaceSize(cfg).toLocaleString()})
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="radio" checked={cfg.search.mode === "random"} onChange={() => set({ search: { ...cfg.search, mode: "random" } })} data-testid="opt-random" />
          A random sample of
          <NumberField p={p} value={cfg.search.samples} onChange={v => set({ search: { ...cfg.search, samples: Math.max(1, Math.floor(v ?? 1)) } })} width={90} testId="opt-samples" />
        </label>
        {cfg.search.mode === "random" && <div style={{ fontSize: 12, color: p.muted, marginLeft: 24 }}>Good for very large ranges: tests that many, spread across all of them.</div>}
      </div>

      <H p={p}>Pace</H>
      <div style={{ display: "flex", gap: 6 }}>
        {PACES.map(x => <Chip key={x.id} p={p} on={cfg.pace === x.id} onClick={() => set({ pace: x.id })} testId={`opt-pace-${x.id}`}>{x.label}</Chip>)}
      </div>
      <div style={{ fontSize: 12, color: p.muted, marginTop: 6 }}>{PACES.find(x => x.id === cfg.pace)?.hint}. The page stays responsive either way.</div>
    </fieldset>
  );
}

// ---- the best so far (the full report is the bottom panel's Optimizer tab)

function BestSoFar({ p, run, applied, onApply, onShowReport }: {
  p: PinePalette; run: OptRun | null; applied: string | null; onApply: (x: OptResult) => void; onShowReport: () => void;
}) {
  const best = run?.best || null;
  const sort = run?.ranked_by?.sort || "netProfit";
  const by = METRIC_INFO.find(m => m.key === sort) || METRIC_INFO[0];
  const cfg = run?.config;
  const varied = cfg?.params.filter(x => x.on) || [];
  const paramText = (c: Combo) => [
    cfg && cfg.symbols.length > 1 ? c.symbol : null, cfg && cfg.intervals.length > 1 ? intervalLabel(c.interval) : null,
    ...varied.map(v => `${v.title} ${fmtVal(c.inputs?.[v.key])}`),
  ].filter(Boolean).join(" · ");
  const shown = [by, ...METRIC_INFO.filter(m => ["netProfit", "profitFactor", "maxDrawdownPct", "winRate", "totalTrades", "sharpe"].includes(m.key) && m.key !== by.key)].slice(0, 6);
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "16px 20px" }} data-testid="opt-best-so-far">
      {!run ? <div style={{ color: p.muted, fontSize: 13 }}>Loading…</div> : !best || !best.metrics ? (
        <div style={{ color: p.muted, fontSize: 13, lineHeight: "20px" }} data-testid="opt-empty">
          {run.tested ? `None of the ${run.tested.toLocaleString()} tested so far pass the report's filters.` : "No results yet."}
        </div>
      ) : (
        <div data-testid="opt-best">
          <div style={{ fontSize: 12, color: p.muted, textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700 }}>Best so far · {by.label}</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }} data-testid="opt-best-params">{paramText(best.params) || "The script's settings"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
            {shown.map(m => (
              <div key={m.key}>
                <div style={{ fontSize: 11, color: p.muted }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colorOf(m.key, (best.metrics as any)[m.key]) }}>{formatMetric(m.kind, (best.metrics as any)[m.key])}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <PineButton p={p} kind="primary" onClick={() => onApply(best)}>{applied === `${best.index}` ? "Applied" : "Apply to chart"}</PineButton>
          </div>
        </div>
      )}
      {run && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${p.border}`, fontSize: 13, color: p.muted, lineHeight: "20px" }}>
          The full report (every result, ranked by any metric, with filters) is in the bottom panel&apos;s <b style={{ color: p.text }}>Optimizer</b> tab, next to the Strategy Tester.
          <div style={{ marginTop: 10 }}><PineButton p={p} onClick={onShowReport}>Show report</PineButton></div>
        </div>
      )}
    </div>
  );
}

const fmtVal = (v: unknown) => (typeof v === "boolean" ? (v ? "on" : "off") : v === undefined ? "" : String(v));
function colorOf(key: string, v: number | null | undefined): string | undefined {
  if (v == null || !["netProfit", "netProfitPct", "avgTrade", "avgTradePct", "longPnl", "shortPnl", "worstMonthPct"].includes(key)) return undefined;
  return v > 0 ? "#089981" : v < 0 ? "#f23645" : undefined;
}

// The chart's Pine-based built-in indicators (VWAP, Ichimoku, Pivot Points, RSI, MACD…) and the
// Volume Profile Visible Range: one instance per entry of the chart's indicator list, each with its
// own inputs (kept on the entry, so they save and sync with the layout), legend row and settings.
// Scripts run in a background worker and re-run when the bars change.

import { useCallback, useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { PineChartView, type PineLegendPlot } from "./PineChartView";
import { PINE_INDICATORS } from "../../lib/pineIndicators";
import { BUILTIN_SCRIPTS } from "./builtinScripts";
import { getPineInputsMeta, type PineInputMeta, type PineRunResult } from "../../lib/pineScriptEngine";
import { runPineOffThread } from "../../lib/pineRunner";
import { VolumeProfileVR, DEFAULT_VP, type VolumeProfileSettings } from "../chartPrimitives/VolumeProfileVR";

export const VOLUME_PROFILE_VR = "Volume Profile Visible Range";
// Indicators the chart draws natively (not through Pine)
const NATIVE = new Set(["Moving Average Exponential", "Volume", "FXN - Asian Session Range"]);

const CATALOG: Record<string, string> = {};
PINE_INDICATORS.forEach((i) => { CATALOG[i.name] = i.code; });
BUILTIN_SCRIPTS.filter((s) => s.type === "indicator" && !NATIVE.has(s.name)).forEach((s) => { if (!CATALOG[s.name]) CATALOG[s.name] = s.code; });

// Every indicator this hook can add, for the Indicators dialog
export const PINE_INDICATOR_NAMES = [...Object.keys(CATALOG), VOLUME_PROFILE_VR].sort((a, b) => a.localeCompare(b));
export const isPineIndicator = (name: string) => name === VOLUME_PROFILE_VR || !!CATALOG[name];

export interface IndicatorEntry { id: string; name: string; visible?: boolean; inputs?: Record<string, any> }

export interface PineIndicatorInstance {
  id: string; name: string; title: string; inputsText: string[]; plots: PineLegendPlot[];
  visible: boolean; overlay: boolean; paneTop?: number; error?: string;
}

// The Volume Profile's settings, as inputs for the settings dialog
const VP_INPUTS: PineInputMeta[] = [
  { varName: "rows", type: "int", title: "Number of rows", value: DEFAULT_VP.rows, minval: 4, maxval: 500, group: "Inputs" },
  { varName: "valueArea", type: "int", title: "Value area volume (%)", value: DEFAULT_VP.valueArea, minval: 1, maxval: 100, group: "Inputs" },
  { varName: "placement", type: "string", title: "Placement", value: DEFAULT_VP.placement, options: ["Right", "Left"], group: "Style" },
  { varName: "widthPct", type: "int", title: "Width (% of the box)", value: DEFAULT_VP.widthPct, minval: 5, maxval: 100, group: "Style" },
];
const vpSettings = (inputs?: Record<string, any>): VolumeProfileSettings => ({ ...DEFAULT_VP, ...(inputs || {}) });

interface Live { name: string; inputsKey: string; view?: PineChartView; vp?: VolumeProfileVR; vpOn?: ISeriesApi<SeriesType>; token: number; result?: PineRunResult | null; visible: boolean }

export function usePineIndicators(opts: {
  chart: IChartApi | null;
  mainSeries: () => ISeriesApi<SeriesType> | null;
  getBars: () => any[];
  symbol: string;
  pineTf: string;
  indicators: IndicatorEntry[];
  onChangeInputs?: (id: string, inputs: Record<string, any>) => void;
  onMarkersChanged?: () => void;
}) {
  const { chart, indicators } = opts;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const live = useRef(new Map<string, Live>());
  const [instances, setInstances] = useState<PineIndicatorInstance[]>([]);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);

  const barTimes = useCallback(() => (optsRef.current.getBars() || []).map((b: any) => b.time as number), []);

  // Rebuilds the legend list from what's drawn
  const publish = useCallback(() => {
    const list: PineIndicatorInstance[] = [];
    for (const ind of optsRef.current.indicators) {
      const l = live.current.get(ind.id);
      if (!l) continue;
      if (l.vp) {
        const s = vpSettings(ind.inputs);
        list.push({ id: ind.id, name: ind.name, title: "VRVP", inputsText: [String(s.rows), String(s.valueArea)], plots: [], visible: l.visible, overlay: true });
        continue;
      }
      const r = l.result;
      list.push({
        id: ind.id, name: ind.name,
        title: r?.meta?.shortTitle || r?.meta?.title || ind.name,
        inputsText: r?.inputs || [],
        plots: l.view && r ? r.plots.filter((p) => !p.hidden).map((p) => ({ title: p.title, color: p.color, lastValue: p.values.length ? p.values[p.values.length - 1].value : null })) : [],
        visible: l.visible, overlay: l.view ? l.view.overlay : true, paneTop: l.view?.paneTop(),
        error: r?.errors?.length ? r.errors[0].message : undefined,
      });
    }
    setInstances(list);
  }, []);

  // Runs one indicator on the current bars and draws the result (a newer run wins)
  const run = useCallback(async (id: string) => {
    const l = live.current.get(id);
    const ch = optsRef.current.chart;
    if (!l || !ch || l.vp) return;
    const ind = optsRef.current.indicators.find((i) => i.id === id);
    const bars = optsRef.current.getBars() || [];
    if (!ind || !bars.length) return;
    const token = ++l.token;
    const result = await runPineOffThread(CATALOG[ind.name], bars, { symbol: optsRef.current.symbol, pineTf: optsRef.current.pineTf, inputOverrides: ind.inputs || {} });
    if (live.current.get(id) !== l || l.token !== token) return; // removed or superseded meanwhile
    if (!l.view) l.view = new PineChartView(ch, optsRef.current.mainSeries, barTimes);
    l.result = result;
    if (result.errors?.length) l.view.clear();
    else { l.view.apply(result); if (!l.visible) l.view.setVisible(false); }
    publish();
    // A new pane gets its height on the chart's next layout: place its legend again after that
    requestAnimationFrame(() => requestAnimationFrame(publish));
    optsRef.current.onMarkersChanged?.();
  }, [barTimes, publish]);

  // Adds / removes instances as the indicator list changes; re-runs one whose inputs changed
  useEffect(() => {
    if (!chart) return;
    const wanted = new Set(indicators.filter((i) => isPineIndicator(i.name)).map((i) => i.id));
    Array.from(live.current.entries()).forEach(([id, l]) => {
      if (!wanted.has(id)) {
        l.view?.clear();
        if (l.vp && l.vpOn) { try { l.vpOn.detachPrimitive(l.vp as any); } catch { /* ignore */ } }
        live.current.delete(id);
      }
    });
    for (const ind of indicators) {
      if (!isPineIndicator(ind.name)) continue;
      const key = JSON.stringify(ind.inputs || {});
      let l = live.current.get(ind.id);
      const visible = ind.visible !== false;
      if (!l) {
        l = { name: ind.name, inputsKey: key, token: 0, visible };
        live.current.set(ind.id, l);
        if (ind.name === VOLUME_PROFILE_VR) {
          const main = optsRef.current.mainSeries();
          if (main) { l.vp = new VolumeProfileVR(optsRef.current.getBars, () => vpSettings(optsRef.current.indicators.find((i) => i.id === ind.id)?.inputs)); main.attachPrimitive(l.vp as any); l.vpOn = main; }
        } else run(ind.id);
      } else if (l.inputsKey !== key) {
        l.inputsKey = key;
        if (l.vp) chart.timeScale().applyOptions({}); else run(ind.id);
      }
      if (l.visible !== visible) { l.visible = visible; l.view?.setVisible(visible); l.vp?.setVisible(visible); }
    }
    publish();
  }, [chart, indicators, run, publish]);

  // A new chart (rebuilt on some changes) starts with nothing drawn
  useEffect(() => () => {
    live.current.forEach((l) => { l.view?.clear(); if (l.vp && l.vpOn) { try { l.vpOn.detachPrimitive(l.vp as any); } catch { /* ignore */ } } });
    live.current.clear();
  }, [chart]);

  // New bars (symbol / interval / live update / replay step): re-run every script, debounced
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rerunAll = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { live.current.forEach((_, id) => { run(id); }); }, 250);
  }, [run]);

  const toggle = useCallback((id: string) => {
    const l = live.current.get(id);
    if (!l) return;
    l.visible = !l.visible;
    l.view?.setVisible(l.visible);
    l.vp?.setVisible(l.visible);
    optsRef.current.chart?.timeScale().applyOptions({});
    publish();
    optsRef.current.onMarkersChanged?.();
  }, [publish]);

  // Markers of overlay scripts, to merge with the candles' own
  const overlayMarkers = useCallback(() => {
    const out: any[] = [];
    live.current.forEach((l) => { if (l.view && l.visible) out.push(...l.view.overlayMarkers()); });
    return out;
  }, []);

  // What the settings dialog needs for one indicator
  const settingsProps = useCallback((id: string) => {
    const ind = optsRef.current.indicators.find((i) => i.id === id);
    if (!ind) return null;
    const inst = instances.find((i) => i.id === id);
    const inputsMeta = ind.name === VOLUME_PROFILE_VR ? VP_INPUTS : getPineInputsMeta(CATALOG[ind.name]);
    return {
      scriptName: inst?.title || ind.name,
      inputsMeta,
      currentOverrides: ind.inputs || {},
      plots: inst?.plots || [],
      onApply: (overrides: Record<string, any>) => { optsRef.current.onChangeInputs?.(id, overrides); },
    };
  }, [instances]);

  // Keeps each pane legend at its pane's top as panes resize
  useEffect(() => {
    if (!chart) return;
    const onSize = () => publish();
    chart.timeScale().subscribeSizeChange(onSize);
    return () => { try { chart.timeScale().unsubscribeSizeChange(onSize); } catch { /* chart gone */ } };
  }, [chart, publish]);

  return { instances, rerunAll, toggle, overlayMarkers, settingsFor, setSettingsFor, settingsProps };
}

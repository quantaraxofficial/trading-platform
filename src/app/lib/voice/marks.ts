// The voice assistant's marks on the chart: every SMC / ICT and price-action concept in
// lib/analysis/concepts (order blocks, FVGs, POIs, liquidity, sweeps, premium / discount, kill
// zones, trend lines, candle and chart patterns…), drawn as labelled boxes, lines and labels. Each
// kind is one Object tree group ("Order blocks · voice assistant"): marking it again replaces the
// old ones, and the group can be hidden, locked or deleted like any drawings. They're ordinary
// drawings, so they're saved with the chart and Ctrl+Z takes a whole marking back.
// The drawing layer (DrawingContext) handles the tv:add-drawings / tv:remove-drawings events.

import { getChartBars } from "../chartBars";
import { analyse, ALL_MARK_KINDS, type MarkKind } from "../analysis/concepts";
export { CANDLE_PATTERN_IDS } from "../analysis/candles";
import type { Zone } from "../analysis/smc";

export type { MarkKind };
export const MARK_KINDS: MarkKind[] = ALL_MARK_KINDS;
// How each is said ("Marked 3 order blocks"), and its group in the Object tree
export const MARK_NAMES: Record<MarkKind, string> = {
  order_blocks: "order blocks", fvg: "fair value gaps", ifvg: "inverse fair value gaps", support_resistance: "support and resistance levels",
  structure: "structure breaks", poi: "points of interest", liquidity: "liquidity levels", sweeps: "liquidity sweeps",
  premium_discount: "premium and discount zones", breakers: "breaker blocks", bpr: "balanced price ranges", displacement: "displacement candles",
  killzones: "kill zones", key_levels: "key levels", swing_points: "swing points", trendlines: "trend lines", supply_demand: "supply and demand zones",
  candle_patterns: "candle patterns", chart_patterns: "chart patterns", ranges: "ranges",
};
const GROUP_NAMES: Record<MarkKind, string> = {
  order_blocks: "Order blocks", fvg: "Fair value gaps", ifvg: "Inverse FVGs", support_resistance: "Support / resistance", structure: "BOS / CHoCH",
  poi: "POIs", liquidity: "Liquidity (BSL / SSL)", sweeps: "Liquidity sweeps", premium_discount: "Premium / discount · OTE", breakers: "Breaker blocks",
  bpr: "Balanced price ranges", displacement: "Displacement", killzones: "Kill zones", key_levels: "Key levels (PDH / PDL / PWH / PWL)",
  swing_points: "Swing points (HH / HL / LH / LL)", trendlines: "Trend lines", supply_demand: "Supply / demand", candle_patterns: "Candle patterns",
  chart_patterns: "Chart patterns", ranges: "Ranges",
};
export const GROUP_PREFIX = "voice-marks-";
const groupId = (k: MarkKind) => `${GROUP_PREFIX}${k}`;

const GREEN = "#089981", RED = "#f23645";
const COLORS: Record<string, Record<Zone["side"], string>> = {
  ob: { bull: GREEN, bear: RED }, sr: { bull: GREEN, bear: RED }, bos: { bull: GREEN, bear: RED }, choch: { bull: GREEN, bear: RED },
  fvg: { bull: "#2962ff", bear: "#ff9800" }, ifvg: { bull: "#00bcd4", bear: "#e91e63" },
  poi: { bull: "#00897b", bear: "#d81b60" }, liq: { bull: "#7e57c2", bear: "#7e57c2" }, sweep: { bull: "#ab47bc", bear: "#ab47bc" },
  pd: { bull: GREEN, bear: RED }, eq: { bull: "#787b86", bear: "#787b86" }, ote: { bull: "#fbc02d", bear: "#fbc02d" },
  breaker: { bull: "#26a69a", bear: "#ef5350" }, bpr: { bull: "#5c6bc0", bear: "#5c6bc0" }, disp: { bull: "#2962ff", bear: "#ff6d00" },
  kz: { bull: "#42a5f5", bear: "#ffa726" }, key: { bull: "#546e7a", bear: "#546e7a" }, swing: { bull: GREEN, bear: RED },
  trend: { bull: GREEN, bear: RED }, sd: { bull: GREEN, bear: RED }, candle: { bull: GREEN, bear: RED },
  pattern: { bull: "#2962ff", bear: "#e91e63" }, neck: { bull: "#787b86", bear: "#787b86" }, range: { bull: "#9e9e9e", bear: "#9e9e9e" },
};
// Box fill (alpha) by kind: the wide context zones lighter
const FILL: Record<string, string> = { sr: "22", pd: "14", kz: "1c", range: "1c", ote: "2a" };

// The bars to look at: what's on screen, and at least 150 bars back from its right edge
function analysisStart(bars: { length: number }): number {
  try {
    const r = (window as any).__chartInstance?.timeScale?.().getVisibleLogicalRange?.();
    if (r) return Math.max(0, Math.floor(Math.min(r.from, Math.min(r.to, bars.length - 1) - 150)));
  } catch { /* no chart */ }
  return Math.max(0, bars.length - 300);
}

export type MarkResult = { ok: true; count: number; bull: number; bear: number; bos?: number; choch?: number; summary: string } | { ok: false; reason: "no_data" };

// What was marked, as it's said: "3 order blocks (2 bullish, 1 bearish)"
function summarise(kind: MarkKind, zones: Zone[]): string {
  const n = (f: (z: Zone) => boolean) => zones.filter(f).length;
  const shown = zones.filter(z => z.label);
  const count = kind === "sweeps" ? n(z => z.shape === "label") : kind === "chart_patterns" ? n(z => z.kind === "pattern") : shown.length;
  const name = MARK_NAMES[kind];
  const one = count === 1 ? name.replace(/ies$/, "y").replace(/(zone|level|block|gap|range|candle|line|point|pattern|break|sweep)s\b/g, "$1").replace(/s$/, "") : name;
  const labels = (pick: (z: Zone) => boolean) => Array.from(new Set(zones.filter(pick).map(z => z.label.split(" · ")[0]))).join(", ");
  let detail = "";
  switch (kind) {
    case "support_resistance": detail = `${n(z => z.side === "bull")} support, ${n(z => z.side === "bear")} resistance`; break;
    case "structure": detail = `${n(z => z.kind === "bos")} BOS, ${n(z => z.kind === "choch")} CHoCH`; break;
    case "liquidity": detail = `${n(z => z.side === "bear")} buy-side above, ${n(z => z.side === "bull")} sell-side below`; break;
    case "premium_discount": return "the premium and discount zones, equilibrium and the OTE zone of the current dealing range";
    case "killzones": case "key_levels": case "candle_patterns": case "chart_patterns": case "swing_points": detail = labels(z => z.shape !== "line" || kind === "key_levels"); break;
    case "poi": detail = shown.map(z => z.label.replace("POI · ", "")).join("; "); break;
    default: detail = `${n(z => z.side === "bull")} bullish, ${n(z => z.side === "bear")} bearish`;
  }
  return `${count} ${count === 1 ? one : name}${detail ? ` (${detail})` : ""}`;
}

export function markOnChart(kind: MarkKind, opts: { patterns?: string[] } = {}): MarkResult {
  const bars = getChartBars();
  if (bars.length < 30) return { ok: false, reason: "no_data" };
  const zones = analyse(kind, bars, analysisStart(bars), opts);
  const group = { id: groupId(kind), name: `${GROUP_NAMES[kind]} · voice assistant` };
  const stamp = Date.now().toString(36);
  const pt = (i: number, price: number) => ({ logical: i, price, time: bars[Math.min(Math.max(i, 0), bars.length - 1)]?.time });
  const drawings = zones.map((z, i) => {
    const color = (COLORS[z.kind] || COLORS.ob)[z.side];
    const id = `${groupId(kind)}-${stamp}-${i}`;
    const base = { id, visible: true, locked: false, group };
    // A level or a slanted line (structure breaks, liquidity, trend lines, necklines…), labelled
    if (z.kind === "bos" || z.kind === "choch" || z.shape === "line") {
      const dashed = z.kind === "choch" || !!z.dashed;
      return { ...base, type: "trendline", stroke: color, strokeWidth: z.kind === "choch" || z.kind === "trend" ? 2 : 1, lineStyle: dashed ? "dashed" : "solid",
        text: z.label, points: [pt(z.from, z.top), pt(z.to, z.bottom)] };
    }
    // A label at one bar (HH / LL, a sweep, a candle pattern)
    if (z.shape === "label") {
      return { ...base, type: "text", stroke: color, textColor: color, text: z.label, fontSize: 11, bold: true, points: [pt(z.from, z.top)] };
    }
    return {
      ...base, type: "rectangle", stroke: color, strokeWidth: 1, fill: color + (FILL[z.kind] || "33"), backgroundVisible: true,
      text: z.label, textColor: color, fontSize: 11, textAlign: "left", textVerticalAlign: "middle",
      extendRight: z.extend !== false,
      points: [pt(z.from, z.top), pt(z.extend === false ? Math.max(z.to, z.from + 1) : z.to, z.bottom)],
    };
  });
  // (the old marks of this kind go in the same step: one undo takes the whole marking back)
  fire("tv:add-drawings", { drawings, replaceGroup: group.id });
  const count = kind === "sweeps" ? zones.filter(z => z.shape === "label").length : kind === "chart_patterns" ? zones.filter(z => z.kind === "pattern").length : zones.length;
  return { ok: true, count, bull: zones.filter(z => z.side === "bull").length, bear: zones.filter(z => z.side === "bear").length,
    bos: zones.filter(z => z.kind === "bos").length, choch: zones.filter(z => z.kind === "choch").length, summary: summarise(kind, zones) };
}

// How many of the assistant's marks are on the chart (one kind, or all)
export function countMarks(kind?: MarkKind): number {
  const prefix = kind ? groupId(kind) : GROUP_PREFIX;
  try { return ((window as any).__drawings || []).filter((d: any) => d.group?.id?.startsWith(prefix)).length; } catch { return 0; }
}

// Removes the assistant's marks: one kind, or all of them
export function clearMarks(kind?: MarkKind) {
  fire("tv:remove-drawings", { groupPrefix: kind ? groupId(kind) : GROUP_PREFIX });
}

function fire(name: string, detail: unknown) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
}

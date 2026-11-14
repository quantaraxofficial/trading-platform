// The voice assistant's marks on the chart: every SMC / ICT and price-action concept in
// lib/analysis/concepts (order blocks, FVGs, POIs, liquidity, sweeps, premium / discount, kill
// zones, trend lines, candle and chart patterns…), drawn as labelled boxes, lines and labels. Each
// kind is one Object tree group ("Order blocks · voice assistant"): marking it again replaces the
// old ones, and the group can be hidden, locked or deleted like any drawings. They're ordinary
// drawings, so they're saved with the chart and Ctrl+Z takes a whole marking back.
// The drawing layer (DrawingContext) handles the tv:add-drawings / tv:remove-drawings events.

import { getChartBars } from "../chartBars";
import { analyse, ALL_MARK_KINDS, type MarkKind } from "../analysis/concepts";
import { setupMarks, SETUP_IDS, SETUP_NAMES, SETUP_FAMILIES, type SetupId, type SetupResult } from "../analysis/setups";
export { SETUP_IDS, SETUP_FAMILIES };
import { POSITION_TARGET_FILL, POSITION_STOP_FILL } from "../../components/drawing/tools/PositionTool";
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
  msnr_levels: "MSNR A and V levels", msnr_gaps: "MSNR gap levels", msnr_flips: "SBR and RBS levels", msnr_qm: "Quasimodo levels",
  msnr_compression: "compressions", setups: "trade setups",
  mitigation_blocks: "mitigation blocks",
  session_liquidity: "session highs and lows", inducement: "inducements", trendline_liquidity: "trend line liquidity lines",
  liquidity_voids: "liquidity voids", round_numbers: "round numbers", draw_on_liquidity: "the draw on liquidity",
};
const GROUP_NAMES: Record<MarkKind, string> = {
  order_blocks: "Order blocks", fvg: "Fair value gaps", ifvg: "Inverse FVGs", support_resistance: "Support / resistance", structure: "BOS / CHoCH",
  poi: "POIs", liquidity: "Liquidity (BSL / SSL)", sweeps: "Liquidity sweeps", premium_discount: "Premium / discount · OTE", breakers: "Breaker blocks",
  bpr: "Balanced price ranges", displacement: "Displacement", killzones: "Kill zones", key_levels: "Key levels (PDH / PDL / PWH / PWL)",
  swing_points: "Swing points (HH / HL / LH / LL)", trendlines: "Trend lines", supply_demand: "Supply / demand", candle_patterns: "Candle patterns",
  chart_patterns: "Chart patterns", ranges: "Ranges",
  msnr_levels: "MSNR A / V levels", msnr_gaps: "MSNR gap levels", msnr_flips: "MSNR SBR / RBS", msnr_qm: "MSNR QM (Quasimodo)",
  msnr_compression: "MSNR compression (CP)", setups: "Trade setups",
  mitigation_blocks: "Mitigation blocks",
  session_liquidity: "Session liquidity (Asia / London / NY, PMH / PML)", inducement: "Inducement (IDM)", trendline_liquidity: "Trend line liquidity",
  liquidity_voids: "Liquidity voids", round_numbers: "Round numbers", draw_on_liquidity: "Draw on liquidity (ERL / IRL)",
};
export const GROUP_PREFIX = "voice-marks-";
const groupId = (k: MarkKind | "bias") => `${GROUP_PREFIX}${k}`;

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
  // MSNR: fresh levels strong, unfresh ones muted; flips, QM and compression each their own
  msnr: { bull: GREEN, bear: RED }, msnr_gap: { bull: "#00acc1", bear: "#fb8c00" }, msnr_old: { bull: "#80cbc4", bear: "#ef9a9a" },
  msnr_flip: { bull: "#26a69a", bear: "#ef5350" }, msnr_qm: { bull: "#7e57c2", bear: "#ab47bc" }, msnr_cp: { bull: "#fbc02d", bear: "#fbc02d" },
  setup: { bull: "#089981", bear: "#f23645" },
  idm: { bull: "#ff9800", bear: "#ff9800" },
  // tapped zones lighter, used ones grey; mitigation blocks their own
  ob_tapped: { bull: GREEN, bear: RED }, fvg_tapped: { bull: "#2962ff", bear: "#ff9800" }, ifvg_tapped: { bull: "#00bcd4", bear: "#e91e63" }, poi_tapped: { bull: "#00897b", bear: "#d81b60" },
  zone_used: { bull: "#787b86", bear: "#787b86" }, mitigation: { bull: "#00acc1", bear: "#8e24aa" }, void: { bull: "#5c6bc0", bear: "#5c6bc0" }, round: { bull: "#9e9e9e", bear: "#9e9e9e" },
  erl: { bull: "#ab47bc", bear: "#ab47bc" }, irl: { bull: "#2962ff", bear: "#ff9800" },
};
// Box fill (alpha) by kind: the wide context zones lighter
const FILL: Record<string, string> = { bias_window: "12", bias: "1f", void: "1c", irl: "22", ob_tapped: "16", fvg_tapped: "16", ifvg_tapped: "16", poi_tapped: "16", zone_used: "10", sr: "22", pd: "14", kz: "1c", range: "1c", ote: "2a", msnr_gap: "26", msnr_old: "14", msnr_cp: "1c" };

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
    case "msnr_levels": case "msnr_gaps": {
      const fresh = n(z => /fresh/.test(z.label) && !/unfresh/.test(z.label));
      detail = `${n(z => z.side === "bear")} resistance above, ${n(z => z.side === "bull")} support below; ${fresh} fresh`;
      break;
    }
    case "order_blocks": case "fvg": case "ifvg": case "poi": {
      const fresh = n(z => /· fresh/.test(z.label)), tapped = n(z => /tapped/.test(z.label)), used = n(z => /broken|filled/.test(z.label));
      detail = `${n(z => z.side === "bull")} bullish, ${n(z => z.side === "bear")} bearish: ${fresh} fresh, ${tapped} tapped${used ? `, ${used} used` : ""}`;
      break;
    }
    case "session_liquidity": detail = `${n(z => /resting/.test(z.label))} still resting, ${n(z => /taken/.test(z.label))} taken`; break;
    case "inducement": detail = `${n(z => /not taken/.test(z.label))} not taken yet, ${n(z => /swept/.test(z.label))} swept`; break;
    case "liquidity_voids": detail = `${n(z => /open/.test(z.label))} open, ${n(z => /filled/.test(z.label))} filled`; break;
    case "draw_on_liquidity": {
      const draw = shown.find(z => /likely draw/.test(z.label));
      return `the external range liquidity${draw ? ` (the likely draw: ${draw.side === "bear" ? "the buy-side above" : "the sell-side below"})` : ""} and ${n(z => z.kind === "irl")} internal FVGs`;
    }
    case "msnr_flips": detail = `${n(z => z.side === "bull")} RBS, ${n(z => z.side === "bear")} SBR`; break;
    case "msnr_qm": return `${n(z => z.shape === "line")} Quasimodo level${n(z => z.shape === "line") === 1 ? "" : "s"} (${n(z => z.shape === "line" && z.side === "bear")} sell, ${n(z => z.shape === "line" && z.side === "bull")} buy)`;
    case "msnr_compression": detail = shown.map(z => z.label.replace("CP → A", "into resistance").replace("CP → V", "into support")).join("; "); break;
    default: detail = `${n(z => z.side === "bull")} bullish, ${n(z => z.side === "bear")} bearish`;
  }
  return `${count} ${count === 1 ? one : name}${detail ? ` (${detail})` : ""}`;
}

// Setups found: how many, how they went (won / lost, in R), and the ones still live
function setupSummary(results: SetupResult[]): string {
  if (!results.length) return "no trade setups";
  const won = results.filter(r => r.outcome === "won"), lost = results.filter(r => r.outcome === "lost");
  const net = won.reduce((a, r) => a + r.r, 0) - lost.length;
  const live = results.filter(r => r.outcome === "waiting" || r.outcome === "open");
  const liveText = live.length ? `; live now: ${live.slice(-3).map(r => `${SETUP_NAMES[r.id]} ${r.side === "bull" ? "long" : "short"} (${r.outcome === "open" ? "in trade" : "waiting for entry"})`).join(", ")}` : "";
  return `${results.length} trade setup${results.length === 1 ? "" : "s"} (${won.length} reached the target, ${lost.length} the stop, net ${net >= 0 ? "+" : ""}${net.toFixed(1)}R)${liveText}`;
}

export function markOnChart(kind: MarkKind, opts: { patterns?: string[]; setups?: SetupId[]; state?: "live" | "fresh" | "tapped" | "all" } = {}): MarkResult {
  const bars = getChartBars();
  if (bars.length < 30) return { ok: false, reason: "no_data" };
  const setups = kind === "setups" ? setupMarks(bars, analysisStart(bars), opts.setups) : null;
  const zones = setups ? setups.zones : analyse(kind, bars, analysisStart(bars), opts);
  drawZones(groupId(kind), `${GROUP_NAMES[kind]} · voice assistant`, zones, bars);
  const count = setups ? setups.results.length : kind === "sweeps" ? zones.filter(z => z.shape === "label").length : kind === "chart_patterns" ? zones.filter(z => z.kind === "pattern").length : zones.length;
  return { ok: true, count, bull: zones.filter(z => z.side === "bull").length, bear: zones.filter(z => z.side === "bear").length,
    bos: zones.filter(z => z.kind === "bos").length, choch: zones.filter(z => z.kind === "choch").length,
    summary: setups ? setupSummary(setups.results) : summarise(kind, zones) };
}

// Zones as drawings in one Object tree group, replacing the group's old ones (one undo takes them
// back). Bar indexes past the last bar are the bars to come (their times stepped on from the last).
// (the bias's forecast is drawn this way too: lib/voice/bias)
export function drawZones(gid: string, name: string, zones: Zone[], bars: { time: number }[]) {
  const group = { id: gid, name };
  const stamp = Date.now().toString(36);
  const last = bars.length - 1;
  const step = last > 0 ? bars[last].time - bars[last - 1].time : 60;
  const pt = (i: number, price: number) => ({ logical: i, price, time: i > last ? bars[last]?.time + (i - last) * step : bars[Math.max(i, 0)]?.time });
  const drawings = zones.map((z, i) => {
    const color = z.color || (COLORS[z.kind] || COLORS.ob)[z.side];
    const id = `${gid}-${stamp}-${i}`;
    const base = { id, visible: true, locked: false, group };
    // A level or a slanted line (structure breaks, liquidity, trend lines, necklines…), labelled
    if (z.kind === "bos" || z.kind === "choch" || z.shape === "line") {
      const dashed = z.kind === "choch" || !!z.dashed;
      return { ...base, type: "trendline", stroke: color, strokeWidth: z.kind === "choch" || z.kind === "trend" ? 2 : 1, lineStyle: dashed ? "dashed" : "solid",
        text: z.label, points: [pt(z.from, z.top), pt(z.to, z.bottom)] };
    }
    // A trade (a setup): a long / short position with its entry, target and stop
    if (z.shape === "position") {
      return { ...base, type: z.side === "bull" ? "long_position" : "short_position",
        textColor: "#ffffff", targetFillColor: POSITION_TARGET_FILL, stopFillColor: POSITION_STOP_FILL, accountSize: 1000, lotSize: 1, risk: 25, riskType: "%",
        points: [pt(z.from, z.entry!), pt(z.to, z.entry!), pt(z.from, z.target!), pt(z.from, z.stop!)] };
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
}

// How many of the assistant's marks are on the chart (one kind, or all)
export function countMarks(kind?: MarkKind): number {
  const prefix = kind ? groupId(kind) : GROUP_PREFIX;
  try { return ((window as any).__drawings || []).filter((d: any) => d.group?.id?.startsWith(prefix)).length; } catch { return 0; }
}

// Removes the assistant's marks: one kind, or all of them
export function clearMarks(kind?: MarkKind | "bias") {
  fire("tv:remove-drawings", { groupPrefix: kind ? groupId(kind) : GROUP_PREFIX });
}

function fire(name: string, detail: unknown) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
}

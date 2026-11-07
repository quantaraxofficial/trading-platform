// The voice assistant's marks on the chart: order blocks, fair value gaps, inverse FVGs and
// support / resistance (lib/analysis/smc), drawn as labelled rectangles that run on to the latest
// bar. Each kind is one Object tree group ("Order blocks · voice assistant"): marking it again
// replaces the old ones, and the group can be hidden, locked or deleted like any drawings. They're
// ordinary drawings, so they're saved with the chart and Ctrl+Z takes a whole marking back.
// The drawing layer (DrawingContext) handles the tv:add-drawings / tv:remove-drawings events.

import { getChartBars } from "../chartBars";
import { analyse, type MarkKind, type Zone } from "../analysis/smc";

export type { MarkKind };
export const MARK_KINDS: MarkKind[] = ["order_blocks", "fvg", "ifvg", "support_resistance"];
export const MARK_NAMES: Record<MarkKind, string> = {
  order_blocks: "order blocks", fvg: "fair value gaps", ifvg: "inverse fair value gaps", support_resistance: "support and resistance levels",
};
const GROUP_NAMES: Record<MarkKind, string> = {
  order_blocks: "Order blocks", fvg: "Fair value gaps", ifvg: "Inverse FVGs", support_resistance: "Support / resistance",
};
export const GROUP_PREFIX = "voice-marks-";
const groupId = (k: MarkKind) => `${GROUP_PREFIX}${k}`;

const COLORS: Record<Zone["kind"], Record<Zone["side"], string>> = {
  ob: { bull: "#089981", bear: "#f23645" },
  fvg: { bull: "#2962ff", bear: "#ff9800" },
  ifvg: { bull: "#00bcd4", bear: "#e91e63" },
  sr: { bull: "#089981", bear: "#f23645" },
};

// The bars to look at: what's on screen, and at least 150 bars back from its right edge
function analysisStart(bars: { length: number }): number {
  try {
    const r = (window as any).__chartInstance?.timeScale?.().getVisibleLogicalRange?.();
    if (r) return Math.max(0, Math.floor(Math.min(r.from, Math.min(r.to, bars.length - 1) - 150)));
  } catch { /* no chart */ }
  return Math.max(0, bars.length - 300);
}

export type MarkResult = { ok: true; count: number; bull: number; bear: number } | { ok: false; reason: "no_data" };

export function markOnChart(kind: MarkKind): MarkResult {
  const bars = getChartBars();
  if (bars.length < 30) return { ok: false, reason: "no_data" };
  const zones = analyse(kind, bars, analysisStart(bars));
  const group = { id: groupId(kind), name: `${GROUP_NAMES[kind]} · voice assistant` };
  const stamp = Date.now().toString(36);
  const drawings = zones.map((z, i) => {
    const color = COLORS[z.kind][z.side];
    return {
      id: `${groupId(kind)}-${stamp}-${i}`, type: "rectangle", visible: true, locked: false, group,
      stroke: color, strokeWidth: 1, fill: color + (z.kind === "sr" ? "22" : "33"), backgroundVisible: true,
      text: z.label, textColor: color, fontSize: 11, textAlign: "left", textVerticalAlign: "middle",
      extendRight: true,
      points: [
        { logical: z.from, price: z.top, time: bars[z.from]?.time },
        { logical: z.to, price: z.bottom, time: bars[z.to]?.time },
      ],
    };
  });
  // (the old marks of this kind go in the same step: one undo takes the whole marking back)
  fire("tv:add-drawings", { drawings, replaceGroup: group.id });
  return { ok: true, count: zones.length, bull: zones.filter(z => z.side === "bull").length, bear: zones.filter(z => z.side === "bear").length };
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

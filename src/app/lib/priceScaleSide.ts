// Which side of the chart the main price scale sits on (Settings → Scales and lines → Scales
// placement, or the price scale menu's "Move scale to left / right"), and where that puts the
// pane. Chart coordinates (timeToCoordinate, priceToCoordinate…) are relative to the pane, so
// overlays drawn over the whole chart add `paneLeft` — the left scale's width when the scale is
// on the left, else 0.
import type { IChartApi } from "lightweight-charts";

export type ScaleSide = "left" | "right";

export const sideOfPlacement = (placement?: string): ScaleSide => (placement === "Stack on the left" ? "left" : "right");

export function mainScaleSide(chart: IChartApi | null | undefined): ScaleSide {
  try {
    const o: any = chart?.options();
    return o?.leftPriceScale?.visible && !o?.rightPriceScale?.visible ? "left" : "right";
  } catch { return "right"; }
}

export function mainPriceScale(chart: IChartApi) {
  return chart.priceScale(mainScaleSide(chart));
}

export function paneGeometry(chart: IChartApi | null | undefined): { side: ScaleSide; scaleW: number; paneLeft: number } {
  const side = mainScaleSide(chart);
  let scaleW = 0;
  try { scaleW = chart ? chart.priceScale(side).width() : 0; } catch { /* disposed */ }
  return { side, scaleW, paneLeft: side === "left" ? scaleW : 0 };
}

// Puts the main price scale on a side: shows that scale, hides the other, carries the scale's
// state over (auto, mode, inverted, the visible range when manual) and moves every series that
// was on the old side — in every pane — onto it. Overlay scales (volume…) stay as they are.
export function applyScaleSide(chart: IChartApi, side: ScaleSide) {
  const from = mainScaleSide(chart);
  if (from === side) return false;
  const old = chart.priceScale(from);
  const o: any = old.options();
  let range: { from: number; to: number } | null = null;
  try { range = o.autoScale ? null : old.getVisibleRange(); } catch { /* none */ }
  chart.applyOptions({ leftPriceScale: { visible: side === "left" }, rightPriceScale: { visible: side === "right" } } as any);
  try {
    for (const pane of (chart as any).panes()) {
      for (const s of pane.getSeries()) {
        // (no id: it went on the side that was the default when it was added — the old one)
        const id = s.options().priceScaleId;
        if (id === from || id === undefined) s.applyOptions({ priceScaleId: side });
      }
    }
  } catch { /* chart disposed */ }
  const next = chart.priceScale(side);
  next.applyOptions({ autoScale: o.autoScale, mode: o.mode, invertScale: o.invertScale });
  if (range) { try { next.setVisibleRange(range); } catch { /* no data yet */ } }
  return true;
}

// Is a point (x from the chart's left edge, chart `width` wide) on the main price scale?
export function onPriceAxis(chart: IChartApi | null | undefined, x: number, width: number): boolean {
  const { side, scaleW } = paneGeometry(chart);
  if (scaleW <= 0) return false;
  return side === "left" ? x < scaleW : x >= width - scaleW;
}

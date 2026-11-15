// "Draw me green and red candles in an uptrend, the green ones bigger", "show a double top", "explain
// a liquidity sweep with a drawing": made-up candles on the sketch board (no market's prices), the
// pattern's parts labelled, said in words. Everything else works on it too: "now mark the order
// blocks", any drawing tool. "Back to the chart" returns to the market shown before.

import { sketchCandles, type SketchSpec } from "../analysis/sketchCandles";
import { setSketch, sketchPrevious, isSketch, SKETCH_SYMBOL } from "../sketch";
import { getChartBars, getChartInfo } from "../chartBars";
import { drawZones, GROUP_PREFIX } from "./marks";

const fire = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function sketchOnChart(spec: SketchSpec): Promise<string> {
  const sketch = sketchCandles(spec);
  const info = getChartInfo();
  setSketch(sketch.bars, info?.symbol);
  if (!isSketch(info?.symbol)) fire("tv:set-symbol", { symbol: SKETCH_SYMBOL });
  // (the board showing these candles)
  for (let t = 0; t < 50; t++) {
    await wait(150);
    const bars = getChartBars();
    if (isSketch(getChartInfo()?.symbol) && bars.length === sketch.bars.length && Math.abs(bars[bars.length - 1].close - sketch.bars[sketch.bars.length - 1].close) < 1e-9) break;
  }
  const bars = getChartBars();
  if (sketch.marks.length && bars.length) drawZones(`${GROUP_PREFIX}sketch`, "Sketch · voice assistant", sketch.marks, bars);
  // (the sketch filling the chart: a few dozen candles, not squeezed at the right like a market's)
  try { (window as any).__chartInstance?.timeScale().fitContent(); } catch { /* no chart */ }
  return `Here's ${sketch.caption}. It's a sketch, not a real market: draw on it or ask me to mark things on it. Say "back to the chart" to return.`;
}

export function leaveSketch(): string {
  const prev = sketchPrevious();
  if (!isSketch(getChartInfo()?.symbol)) return "The chart isn't on the sketch board.";
  fire("tv:set-symbol", { symbol: prev ?? "XAU/USD" });
  return `Back to ${prev ?? "gold"}.`;
}

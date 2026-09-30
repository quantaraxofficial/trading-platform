// Real traded volume from the data feed. TwelveData sends a per-bar volume for stocks and
// crypto; forex and metals come without one, and then there is simply no volume to show
// (TradingView shows "∅" in the legend for a missing value).

export type VolumeBar = { time: number; open: number; close: number; volume?: number };

export function barVolume(item: { volume?: string | number | null }): number | undefined {
  if (item.volume == null || item.volume === "") return undefined;
  const v = typeof item.volume === "number" ? item.volume : parseFloat(item.volume);
  return isFinite(v) && v >= 0 ? v : undefined;
}

export function hasVolume(bars: VolumeBar[]): boolean {
  return bars.some(b => b.volume != null && b.volume > 0);
}

// Histogram points for the Volume indicator: one per bar that has a volume, coloured by the
// bar's direction
export function volumeHistogram(bars: VolumeBar[], upColor: string, downColor: string) {
  const out: { time: any; value: number; color: string }[] = [];
  for (const d of bars) {
    if (d.volume == null) continue;
    out.push({ time: d.time, value: d.volume, color: d.close >= d.open ? upColor : downColor });
  }
  return out;
}

// TradingView's compact volume: four significant digits, "901.1K", "1.93M", "14.79M"
export function formatVolume(v: number | undefined | null): string {
  if (v == null || !isFinite(v)) return "∅";
  const abs = Math.abs(v);
  const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, suffix] of units) {
    if (abs >= size) return `${parseFloat((v / size).toPrecision(4))}${suffix}`;
  }
  return `${Math.round(v)}`;
}

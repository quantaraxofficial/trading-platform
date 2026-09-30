// Price precision and the simulated bid/ask used across the chart, legend and order panels.

// Decimal places a symbol is quoted in. Stocks (symbols without a "/") use the exchange tick:
// a cent above $1, as TradingView shows them; the feed's intraday stock bars carry sub-penny
// prices (340.405, 339.85989) that would otherwise read as 5–6 decimals.
// Pairs (forex, metals, crypto) are read off their own bars: the fewest decimals (2–6) that
// every recent price is a whole multiple of. EUR/USD comes out at 5, USD/JPY and gold at 3,
// crypto at 2.
// The feed sends some prices through single-precision floats ("341.040009" for 341.04), so a
// price counts as on the grid when it's within a couple of float32 ulps (~1.2e-7 relative) of it.
export function detectPrecision(bars: { open: number; high: number; low: number; close: number }[], symbol?: string): number {
  const sample = bars.slice(-120);
  if (sample.length === 0) return 2;
  if (symbol && !symbol.includes("/")) return sample[sample.length - 1].close >= 1 ? 2 : 4;
  for (let p = 2; p <= 6; p++) {
    const scale = Math.pow(10, p);
    const fits = sample.every(b => [b.open, b.high, b.low, b.close].every(v =>
      Math.abs(v * scale - Math.round(v * scale)) < Math.max(1e-6, Math.abs(v) * 1.2e-7) * scale));
    if (fits) return p;
  }
  return 6;
}

// The data feed has no bid/ask, so paper trading simulates a spread of about 1.2 basis points
// around the last price (≈0.04 on a $340 stock, ≈1.4 pips on EUR/USD), at least one tick wide
export function simulatedQuote(price: number, precision: number): { bid: number; ask: number; spread: number } {
  const tick = Math.pow(10, -precision);
  const half = Math.max(tick / 2, (price * 0.00012) / 2);
  const round = (v: number) => Math.round(v / tick) * tick;
  const bid = round(price - half);
  const ask = round(price + half);
  return { bid, ask, spread: ask - bid };
}

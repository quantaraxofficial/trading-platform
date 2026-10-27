// How a symbol is written for people to read, as TradingView does: XAUUSD, EURUSD, BTCUSD (no
// slash). The app keeps "XAU/USD" inside (data requests, saved drawings, watchlists use it);
// this is only for what's shown.
export function displaySymbol(symbol: string | null | undefined): string {
  return (symbol ?? "").replace(/\//g, "");
}

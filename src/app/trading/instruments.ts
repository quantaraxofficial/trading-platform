// Instrument facts the paper-trading engine and its UI need: asset class, default leverage,
// tick size, quantity step and number formatting.

export type AssetClass = "stocks" | "forex" | "crypto" | "commodities";

const CRYPTO_BASES = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "BNB", "LTC", "DOT", "AVAX"];
const METAL_BASES = ["XAU", "XAG", "XPT", "XPD"];

export function assetClassOf(symbol: string): AssetClass {
  if (!symbol.includes("/")) return "stocks";
  const base = symbol.split("/")[0];
  if (CRYPTO_BASES.includes(base)) return "crypto";
  if (METAL_BASES.includes(base)) return "commodities";
  return "forex";
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  stocks: "Stocks",
  forex: "Forex",
  crypto: "Crypto",
  commodities: "Commodities",
};

// Default paper-account leverage per asset class (TradingView's paper account trades crypto at 10x)
export const DEFAULT_LEVERAGE: Record<AssetClass, number> = {
  stocks: 2,
  forex: 50,
  crypto: 10,
  commodities: 20,
};

// Smallest tradable quantity: fractional coins, whole shares/units otherwise
export function qtyStepOf(symbol: string): number {
  return assetClassOf(symbol) === "crypto" ? 0.0001 : 1;
}

export function defaultQtyOf(symbol: string): number {
  return assetClassOf(symbol) === "forex" ? 1000 : 1;
}

// Decimals a symbol quotes in when the chart hasn't reported it (the chart detects it from bars)
export function defaultPrecisionOf(symbol: string): number {
  const cls = assetClassOf(symbol);
  if (cls === "forex") return symbol.includes("JPY") ? 3 : 5;
  if (cls === "commodities") return 3;
  return 2;
}

export function tickSize(precision: number): number {
  return Math.pow(10, -precision);
}

export function roundToTick(price: number, precision: number): number {
  const f = Math.pow(10, precision);
  return Math.round(price * f) / f;
}

export function roundQty(qty: number, symbol: string): number {
  const step = qtyStepOf(symbol);
  const decimals = step < 1 ? Math.round(-Math.log10(step)) : 0;
  const f = Math.pow(10, decimals);
  return Math.floor(qty * f + 1e-9) / f;
}

export function qtyDecimals(symbol: string): number {
  const step = qtyStepOf(symbol);
  return step < 1 ? Math.round(-Math.log10(step)) : 0;
}

// 84021 → "84,021", 1.08567 → "1.08567"
export function formatPrice(value: number, precision: number): string {
  if (!isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

// Plain price for input fields: no thousands separators
export function priceInput(value: number, precision: number): string {
  return isFinite(value) ? value.toFixed(precision) : "";
}

export function formatQty(qty: number): string {
  if (!isFinite(qty)) return "—";
  return String(Math.round(qty * 1e8) / 1e8);
}

// 100000 → "100,000.00"
export function formatMoney(value: number, decimals = 2): string {
  if (!isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Signed money as TradingView prints P&L: "+96.21", "−5.43" (true minus sign)
export function formatSignedMoney(value: number, decimals = 2): string {
  const abs = formatMoney(Math.abs(value), decimals);
  if (Math.abs(value) < Math.pow(10, -decimals) / 2) return formatMoney(0, decimals);
  return (value > 0 ? "+" : "−") + abs;
}

export function formatSignedPercent(value: number, decimals = 2): string {
  if (!isFinite(value)) return "—";
  if (Math.abs(value) < Math.pow(10, -decimals) / 2) return (0).toFixed(decimals) + "%";
  return (value > 0 ? "+" : "−") + Math.abs(value).toFixed(decimals) + "%";
}

// 95471.19 → "95.47 K"
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return (value / 1e9).toFixed(2) + " B";
  if (abs >= 1e6) return (value / 1e6).toFixed(2) + " M";
  if (abs >= 1e3) return (value / 1e3).toFixed(2) + " K";
  return value.toFixed(2);
}

// "2026-09-26 20:52:12"
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// "Sep 26, 2026, 20:52"
export function formatShortDateTime(ms: number): string {
  const d = new Date(ms);
  const month = d.toLocaleString("en-US", { month: "short" });
  const p = (n: number) => String(n).padStart(2, "0");
  return `${month} ${d.getDate()}, ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

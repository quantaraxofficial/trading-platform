"use client";

// Symbol logos as TradingView shows them: a forex pair as its two currencies' round flags
// overlapping (the base top-left, the quote bottom-right), gold and silver as a gold / silver coin
// with the quote currency's flag, crypto as its coin. Drawn here as small SVGs (simplified flags)
// so the colours say what the symbol is at a glance: gold is gold, not a random avatar colour.

import React from "react";

type Art = (id: string) => React.ReactNode;   // drawn in a 0..20 box, clipped to a circle by the caller

// ---- flags (simplified, recognisable at 10–20 px)
const stripesH = (colors: string[]) => colors.map((c, i) => <rect key={i} x={0} y={(20 / colors.length) * i} width={20} height={20 / colors.length + 0.2} fill={c} />);
const stripesV = (colors: string[]) => colors.map((c, i) => <rect key={i} x={(20 / colors.length) * i} y={0} width={20 / colors.length + 0.2} height={20} fill={c} />);
const unionJack = (s = 1, ox = 0, oy = 0) => (
  <g transform={`translate(${ox} ${oy}) scale(${s})`}>
    <rect width={20} height={20} fill="#012169" />
    <path d="M0 0L20 20M20 0L0 20" stroke="#ffffff" strokeWidth={4} />
    <path d="M0 0L20 20M20 0L0 20" stroke="#c8102e" strokeWidth={1.6} />
    <path d="M10 0V20M0 10H20" stroke="#ffffff" strokeWidth={6} />
    <path d="M10 0V20M0 10H20" stroke="#c8102e" strokeWidth={3.4} />
  </g>
);
const star = (cx: number, cy: number, r: number, fill: string, key?: React.Key) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return <polygon key={key} points={pts} fill={fill} />;
};

const FLAGS: Record<string, Art> = {
  USD: () => (<>
    {stripesH(["#b22234", "#ffffff", "#b22234", "#ffffff", "#b22234", "#ffffff", "#b22234"])}
    <rect width={10} height={10.8} fill="#3c3b6e" />
    {[[2.5, 2.5], [6.5, 2.5], [4.5, 5], [2.5, 7.8], [6.5, 7.8]].map(([x, y], i) => star(x, y, 1.1, "#ffffff", i))}
  </>),
  EUR: () => (<>
    <rect width={20} height={20} fill="#003399" />
    {Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return star(10 + 6 * Math.cos(a), 10 + 6 * Math.sin(a), 1.2, "#ffcc00", i); })}
  </>),
  GBP: () => unionJack(),
  JPY: () => (<><rect width={20} height={20} fill="#ffffff" /><circle cx={10} cy={10} r={5} fill="#bc002d" /></>),
  CHF: () => (<><rect width={20} height={20} fill="#da291c" /><path d="M8.3 4.5h3.4v3.8h3.8v3.4h-3.8v3.8H8.3v-3.8H4.5V8.3h3.8z" fill="#ffffff" /></>),
  CAD: () => (<>
    {stripesV(["#d52b1e", "#ffffff", "#ffffff", "#d52b1e"])}
    <path d="M10 4.6l1 2 1.2-.6-.4 2.7 1.6-1.3.3 1.1 1.4-.3-.5 1.7.7.4-2.8 2.2.3 1.1-2.4-.4V15.5h-.8v-2.3l-2.4.4.3-1.1-2.8-2.2.7-.4-.5-1.7 1.4.3.3-1.1 1.6 1.3-.4-2.7 1.2.6z" fill="#d52b1e" />
  </>),
  AUD: () => (<>
    <rect width={20} height={20} fill="#00008b" />
    {unionJack(0.5)}
    {star(5, 15, 2, "#ffffff")}{star(15, 5, 1.2, "#ffffff")}{star(13, 10, 1.2, "#ffffff")}{star(17, 9, 1.2, "#ffffff")}{star(15, 15.5, 1.3, "#ffffff")}
  </>),
  NZD: () => (<>
    <rect width={20} height={20} fill="#00247d" />
    {unionJack(0.5)}
    {[[15, 5], [12.6, 10], [17, 9.5], [15, 15]].map(([x, y], i) => <g key={i}>{star(x, y, 1.6, "#ffffff")}{star(x, y, 1.1, "#cc142b")}</g>)}
  </>),
  INR: () => (<>
    {stripesH(["#ff9933", "#ffffff", "#138808"])}
    <circle cx={10} cy={10} r={2.6} fill="none" stroke="#000080" strokeWidth={0.7} /><circle cx={10} cy={10} r={0.6} fill="#000080" />
  </>),
  MXN: () => (<>
    {stripesV(["#006847", "#ffffff", "#ce1126"])}
    <circle cx={10} cy={10} r={2.2} fill="#8c5a2b" /><path d="M7.9 11.4q2.1 1.5 4.2 0" stroke="#006847" strokeWidth={0.7} fill="none" />
  </>),
  CNY: () => (<>
    <rect width={20} height={20} fill="#ee1c25" />
    {star(6, 7, 3, "#ffff00")}{star(10.5, 3.8, 0.9, "#ffff00")}{star(12.4, 6, 0.9, "#ffff00")}{star(12.4, 9, 0.9, "#ffff00")}{star(10.5, 11.2, 0.9, "#ffff00")}
  </>),
  // "All": an event for every currency (the economic calendar's global events)
  ALL: () => (<>
    <rect width={20} height={20} fill="#2962ff" />
    <g fill="none" stroke="#ffffff" strokeWidth={0.9}>
      <circle cx={10} cy={10} r={6} /><ellipse cx={10} cy={10} rx={2.6} ry={6} /><path d="M4 10h12M5 7h10M5 13h10" />
    </g>
  </>),
};

// ---- coins
const coin = (face: string, rim: string, shine: string, label: string, ink: string): Art => (id) => (<>
  <defs>
    <radialGradient id={`${id}-g`} cx="35%" cy="30%" r="75%">
      <stop offset="0%" stopColor={shine} /><stop offset="60%" stopColor={face} /><stop offset="100%" stopColor={rim} />
    </radialGradient>
  </defs>
  <rect width={20} height={20} fill={`url(#${id}-g)`} />
  <circle cx={10} cy={10} r={7.4} fill="none" stroke={rim} strokeWidth={0.9} opacity={0.7} />
  <text x={10} y={13.2} textAnchor="middle" fontSize={8.4} fontWeight={700} fontFamily="-apple-system, Segoe UI, Roboto, sans-serif" fill={ink}>{label}</text>
</>);
const COINS: Record<string, Art> = {
  XAU: coin("#f2c037", "#b8860b", "#fff3b0", "Au", "#7a5300"),
  XAG: coin("#c9ced6", "#8a9099", "#ffffff", "Ag", "#4a5059"),
  XPT: coin("#d9dde3", "#9aa1ab", "#ffffff", "Pt", "#4a5059"),
  XPD: coin("#cfd3d8", "#8f969f", "#ffffff", "Pd", "#4a5059"),
  BTC: (id) => (<><rect width={20} height={20} fill="#f7931a" /><text x={10} y={14.2} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="-apple-system, Segoe UI, Roboto, sans-serif" fill="#ffffff" key={id}>₿</text></>),
  ETH: () => (<><rect width={20} height={20} fill="#627eea" /><path d="M10 3.5l4 6.6-4 2.4-4-2.4z" fill="#ffffff" opacity={0.9} /><path d="M10 13.3l4-2.4-4 5.6-4-5.6z" fill="#ffffff" opacity={0.75} /></>),
};

const ART: Record<string, Art> = { ...FLAGS, ...COINS };

// One round part of a logo
function Disc({ code, size, x, y, uid, ring }: { code: string; size: number; x: number; y: number; uid: string; ring?: string }) {
  const art = ART[code];
  const clip = `${uid}-${code}-c`;
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 20 20" overflow="visible">
      <defs><clipPath id={clip}><circle cx={10} cy={10} r={10} /></clipPath></defs>
      {ring && <circle cx={10} cy={10} r={11.4} fill={ring} />}
      <g clipPath={`url(#${clip})`}>{art(`${uid}-${code}`)}</g>
      <circle cx={10} cy={10} r={9.75} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={0.5} />
    </svg>
  );
}

// "XAU/USD", "XAUUSD", "OANDA:EURUSD" → ["XAU", "USD"]; "BTC/USD" → ["BTC", "USD"]; else null
export function logoParts(symbol: string): [string, string | null] | null {
  const s = symbol.toUpperCase().replace(/^[A-Z]+:/, "").replace(/\+$/, "");
  const m = /^([A-Z]{3})\/?([A-Z]{3})$/.exec(s);
  if (m && ART[m[1]] && ART[m[2]]) return [m[1], m[2]];
  if (m && ART[m[1]] && (m[1] in COINS)) return [m[1], null];
  return null;
}

// (ids from useId: the same on the server and in the browser)

// One currency's round flag (the economic calendar); null when we don't draw that currency
export function CurrencyFlag({ code, size }: { code: string; size: number }) {
  const uid = `cf${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const c = code.toUpperCase();
  if (!FLAGS[c]) return null;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle" }} aria-hidden>
      <Disc code={c} size={size} x={0} y={0} uid={uid} />
    </svg>
  );
}

// The same flag as an image, for drawing on a canvas (the chart's economic event marks). Rendered
// once per currency and size, off-screen; null until it has loaded (the caller redraws on `onReady`).
const flagImages = new Map<string, HTMLImageElement | "loading" | "none">();
export function currencyFlagImage(code: string, size: number, onReady: () => void): HTMLImageElement | null {
  const c = code.toUpperCase(), key = `${c}@${size}`;
  const have = flagImages.get(key);
  if (have instanceof HTMLImageElement) return have;
  if (have) return null;
  if (!FLAGS[c] || typeof document === "undefined") { flagImages.set(key, "none"); return null; }
  flagImages.set(key, "loading");
  void (async () => {
    const [{ createRoot }, { flushSync }] = await Promise.all([import("react-dom/client"), import("react-dom")]);
    const host = document.createElement("div");
    const root = createRoot(host);
    flushSync(() => root.render(<CurrencyFlag code={c} size={size} />));
    const svg = host.querySelector("svg");
    svg?.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const markup = svg?.outerHTML ?? "";
    root.unmount();
    if (!markup) { flagImages.set(key, "none"); return; }
    const img = new Image(size, size);
    img.onload = () => { flagImages.set(key, img); onReady(); };
    img.onerror = () => flagImages.set(key, "none");
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  })();
  return null;
}
// The logo, or null when the symbol isn't a pair / metal / coin we draw (the caller shows initials)
export function SymbolLogo({ symbol, size }: { symbol: string; size: number }) {
  const uid = `sl${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const parts = logoParts(symbol);
  if (!parts) return null;
  const [base, quote] = parts;
  if (!quote) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle" }} aria-hidden>
        <Disc code={base} size={size} x={0} y={0} uid={uid} />
      </svg>
    );
  }
  // Two overlapping discs, as on TradingView: the base on top at the top-left
  const d = size * 0.72;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle", overflow: "visible" }} aria-hidden>
      <Disc code={quote} size={d} x={size - d} y={size - d} uid={uid} />
      <Disc code={base} size={d} x={0} y={0} uid={uid} ring="var(--tv-color-pane-bg, #ffffff)" />
    </svg>
  );
}

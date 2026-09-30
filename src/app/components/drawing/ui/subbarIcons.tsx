import React from "react";

// TradingView's floating drawing-toolbar ("subbar") glyphs, recreated from TradingView
// Desktop at 1x. Coordinates are pixels of TradingView's toolbar button (its center at
// x=15, y≈15.5); the viewBox is the 28px icon box around it. Lines stay 1 screen px wide.

const VB = "1 2 28 28";

function Glyph({ size = 28, children, style }: { size?: number; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={VB} width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1" style={{ display: "block", ...style }}>
      {children}
    </svg>
  );
}

const line = (d: string) => <path d={d} vectorEffect="non-scaling-stroke" />;

// Drag handle: two columns of three small dots
export function SubGripIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="12" viewBox="0 0 8 12" style={{ display: "block" }}>
      {[0, 5, 10].flatMap(y => [0, 6].map(x => <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" fill="#b2b5be" />))}
    </svg>
  );
}

// Templates: three rounded squares and a "+" in the fourth corner
export function SubTemplateIcon() {
  const sq = (x: number, y: number) => `M${x + 1.5} ${y} H${x + 4.5} A1.5 1.5 0 0 1 ${x + 6} ${y + 1.5} V${y + 4.5} A1.5 1.5 0 0 1 ${x + 4.5} ${y + 6} H${x + 1.5} A1.5 1.5 0 0 1 ${x} ${y + 4.5} V${y + 1.5} A1.5 1.5 0 0 1 ${x + 1.5} ${y} Z`;
  return <Glyph>{line(`${sq(7.5, 8.5)} ${sq(16.5, 8.5)} ${sq(7.5, 17.5)} M19.5 17 V24 M16 20.5 H23`)}</Glyph>;
}

// Line / border color: a pencil, raised to leave room for the color bar under it
export function SubPencilIcon() {
  return (
    <Glyph>
      {line("M7.5 19.5 V14.8 L17.2 5.1 C18.3 4 19.8 4 20.8 5 L22 6.2 C23 7.2 23 8.7 21.9 9.8 L12.2 19.5 Z")}
      {line("M17.4 5.4 L22 10")}
      {line("M8.5 14.8 L12.5 18.8")}
    </Glyph>
  );
}

// Text color: a serif "T"
export function SubTextIcon() {
  return <Glyph>{line("M9.5 9 V5.5 H21.5 V9 M15.5 5.5 V19.5 M13 19.5 H18")}</Glyph>;
}

// Fill / background color: a tipped paint bucket with a drop
export function SubBucketIcon() {
  return (
    <Glyph>
      {line("M14.8 7.3 L21.9 13.6 L16.6 18.7 L9.6 12.2 Z")}
      {line("M14.5 7 V6 A1.5 1.5 0 0 1 17.5 6 V8.3")}
      {line("M14.5 7.5 V11.5")}
      <circle cx="9" cy="17" r="2" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

// Settings: a hexagon around a ring
// (also the chart's own settings button, in the price/time axis corner)
export function SubSettingsIcon({ size }: { size?: number } = {}) {
  return <Glyph size={size}>{line("M9.5 7.5 H20.5 L25.4 15.8 L20.5 24.5 H9.5 L4.6 15.8 Z M11.5 16 A3.5 3.5 0 1 0 18.5 16 A3.5 3.5 0 1 0 11.5 16")}</Glyph>;
}

// Add alert: alarm clock opening into a "+"
export function SubAlertIcon() {
  return <Glyph>{line("M14.5 24.5 A8 8 0 1 1 22.5 16.5 M14.5 11 V16.5 H11 M20.5 18 V27 M16 22.5 H25 M9.2 6.8 L4.8 11.2 M19.8 6.8 L24.2 11.2")}</Glyph>;
}

// Lock / unlock: the shackle is open until the drawing is locked
export function SubLockIcon({ locked = false }: { locked?: boolean }) {
  return (
    <Glyph>
      {line(locked ? "M11.5 14 V11 A3.5 3.5 0 0 1 18.5 11 V14" : "M11.5 14 V11 A3.5 3.5 0 0 1 18.5 11")}
      {line("M8.5 14.5 H21.5 A1 1 0 0 1 22.5 15.5 V24.5 A1 1 0 0 1 21.5 25.5 H8.5 A1 1 0 0 1 7.5 24.5 V15.5 A1 1 0 0 1 8.5 14.5 Z")}
      <rect x="14" y="18" width="2" height="4" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

// Remove: a trash can
export function SubTrashIcon() {
  return <Glyph>{line("M6 9.5 H24 M11.5 9 V6.5 H18.5 V9 M8.5 10 L9.6 24.5 Q9.7 25.5 10.7 25.5 H19.3 Q20.3 25.5 20.4 24.5 L21.5 10")}</Glyph>;
}

// More: three small rings
export function SubMoreIcon() {
  return <Glyph>{line("M5.5 16.5 A2 2 0 1 0 9.5 16.5 A2 2 0 1 0 5.5 16.5 M12.5 16.5 A2 2 0 1 0 16.5 16.5 A2 2 0 1 0 12.5 16.5 M19.5 16.5 A2 2 0 1 0 23.5 16.5 A2 2 0 1 0 19.5 16.5")}</Glyph>;
}

// Long/short position: create an order — a framed price zig-zag with a "+"
export function SubOrderIcon() {
  return <Glyph>{line("M16.5 24.5 H6.5 A1 1 0 0 1 5.5 23.5 V8.5 A1 1 0 0 1 6.5 7.5 H23.5 A1 1 0 0 1 24.5 8.5 V16.5 M22.5 19 V26 M19 22.5 H26 M13 12 L16.5 15.2 L20.5 12 M9 19.5 L12.5 16.3 L16.5 19.5")}</Glyph>;
}

// Line style: a 20px sample of the drawing's current style
export function SubLineStyleIcon({ style }: { style?: string }) {
  const s = (style || "solid").toLowerCase();
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="3" viewBox="0 0 20 3" style={{ display: "block" }}>
      <line x1="0" y1="1.5" x2="20" y2="1.5" stroke="currentColor" strokeWidth="1" strokeDasharray={s === "dashed" ? "4 3" : s === "dotted" ? "1 2" : undefined} />
    </svg>
  );
}

// Line width button content: a sample of the width, then "Npx"
export function SubWidthLabel({ width }: { width: number }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 2px" }}>
      <span style={{ width: "18px", height: `${width}px`, backgroundColor: "currentColor", flexShrink: 0 }} />
      <span style={{ fontSize: "14px", fontWeight: 400 }}>{width}px</span>
    </span>
  );
}

// The color bar under a color button; transparent fills show a checkerboard through them
export function SubColorBar({ color }: { color?: string }) {
  return (
    <div style={{
      position: "absolute", left: "6px", right: "6px", bottom: "5px", height: "4px", borderRadius: "2px",
      background: `linear-gradient(${color || "transparent"}, ${color || "transparent"}), repeating-conic-gradient(#c9ccd3 0% 25%, #ffffff 0% 50%) 0 0 / 4px 4px`,
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
    }} />
  );
}

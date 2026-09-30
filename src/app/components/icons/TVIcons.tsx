import React from 'react';

type GlyphRing = [number, number, number?];

// Shared renderer for the TradingView glyphs. Drawing-tool coordinates are on TradingView's
// own 30px icon grid (pixel centers at .5), recreated from its Geometric Shapes dropdown;
// toolbar glyphs pass their own 28px viewBox. Lines stay 1 screen px wide at any icon size,
// handles are hollow rings (radius 2 unless given), and lines are masked so they stop at a
// ring's edge instead of crossing it.
function TvGlyph({ size, lines = [], fills = [], rings = [], viewBox = "0 0 30 30", rest }: { size: number; lines?: string[]; fills?: string[]; rings?: GlyphRing[]; viewBox?: string; rest?: any }) {
  const maskId = `tv-glyph-${React.useId().replace(/:/g, '')}`;
  const [vx, vy, vw, vh] = viewBox.split(' ').map(Number);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={viewBox} width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1" {...rest}>
      {rings.length > 0 && (
        <mask id={maskId} maskUnits="userSpaceOnUse" x={vx} y={vy} width={vw} height={vh}>
          <rect x={vx} y={vy} width={vw} height={vh} fill="white" stroke="none" />
          {rings.map(([cx, cy, r = 2], i) => <circle key={i} cx={cx} cy={cy} r={r + 0.5} fill="black" stroke="none" />)}
        </mask>
      )}
      <g mask={rings.length > 0 ? `url(#${maskId})` : undefined}>
        {lines.map((d, i) => <path key={i} d={d} vectorEffect="non-scaling-stroke" />)}
        {fills.map((d, i) => <path key={`f${i}`} d={d} fill="currentColor" vectorEffect="non-scaling-stroke" />)}
      </g>
      {rings.map(([cx, cy, r = 2], i) => <circle key={`r${i}`} cx={cx} cy={cy} r={r} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

export function TVCrosshairIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="0 0 28 28" lines={["M3 14.5h8", "M18 14.5h8", "M14.5 3v8", "M14.5 18v8"]} />;
}

export function TVSettingsIcon({ size = 18, ...props }: any) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 18 18" 
      width={size} 
      height={size}
      {...props}
    >
      <path fill="currentColor" fillRule="evenodd" d="m3.1 9 2.28-5h7.24l2.28 5-2.28 5H5.38L3.1 9Zm1.63-6h8.54L16 9l-2.73 6H4.73L2 9l2.73-6Zm5.77 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm1 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"></path>
    </svg>
  );
}

export function TVMeasureIcon({ size = 28, ...props }: any) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 28 28" 
      width={size} 
      height={size}
      {...props}
    >
      <path fill="currentColor" d="M2 9.75a1.5 1.5 0 0 0-1.5 1.5v5.5a1.5 1.5 0 0 0 1.5 1.5h24a1.5 1.5 0 0 0 1.5-1.5v-5.5a1.5 1.5 0 0 0-1.5-1.5zm0 1h3v2.5h1v-2.5h3.25v3.9h1v-3.9h3.25v2.5h1v-2.5h3.25v3.9h1v-3.9H22v2.5h1v-2.5h3a.5.5 0 0 1 .5.5v5.5a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5v-5.5a.5.5 0 0 1 .5-.5z" transform="rotate(-45 14 14)"></path>
    </svg>
  );
}

export function TVTrendlineIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="0 0 28 28" lines={["M5.5 22.5 L22.5 5.5"]} rings={[[5.5, 22.5], [22.5, 5.5]]} />;
}

export function TVHorizontalRayIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} {...props}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M8 14.5h17v-1H8z" />
        <path d="M5.5 16c.828 0 1.5-.672 1.5-1.5S6.328 13 5.5 13 4 13.672 4 14.5 4.672 16 5.5 16zm0 1C4.119 17 3 15.881 3 14.5S4.119 12 5.5 12 8 13.119 8 14.5 6.881 17 5.5 17z" />
      </g>
    </svg>
  );
}

export function TVFibonacciIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="0 0 28 28" lines={["M3 4.5H25", "M3 10.5H22.5", "M3 16.5H25", "M5.5 22.5H25"]} rings={[[3.5, 22.5], [24.5, 10.5]]} />;
}

export function TVLongPositionIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} {...props}>
      <path fill="currentColor" d="M5.5 20c1.2 0 2.22.86 2.45 2H25v1H7.95a2.5 2.5 0 1 1-2.45-3m0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M25 18H5v-1h20zm-11-4h3v1h-4V9h1zM5.5 4c1.2 0 2.22.86 2.45 2H25v1H7.95A2.5 2.5 0 1 1 5.5 4m0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3" />
    </svg>
  );
}

export function TVShortPositionIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} {...props}>
      <path fill="currentColor" d="M5.5 20c1.2 0 2.22.86 2.45 2H25v1H7.95a2.5 2.5 0 1 1-2.45-3m0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M25 18H5v-1h20zM5.5 4c1.2 0 2.22.86 2.45 2H25v1H7.95A2.5 2.5 0 1 1 5.5 4m0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3" />
      <text x="14.5" y="14" fill="currentColor" fontSize="7.5" fontFamily="Arial, sans-serif" fontWeight="bold" textAnchor="middle" alignmentBaseline="middle">S</text>
    </svg>
  );
}

export function TVRectangleIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M6.5 6.5 H23.5 V23.5 H6.5 Z"]} rings={[[6.5, 6.5], [23.5, 6.5], [23.5, 23.5], [6.5, 23.5]]} />;
}

export function TVTriangleIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M7.5 6.5 V23.5 H22.5 Z"]} rings={[[7.5, 6.5], [7.5, 23.5], [22.5, 23.5]]} />;
}

// TradingView's arc glyph: a straight chord between the two ends, and the arc (the same
// quadratic the Arc tool draws) swinging out through its peak handle.
export function TVArcIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M7.5 23.5 L23.5 6.5", "M7.5 23.5 Q31.5 30 23.5 6.5"]} rings={[[7.5, 23.5], [23.5, 6.5], [23.5, 22.5]]} />;
}

// Curve — one smooth bend passing through its middle handle
export function TVCurveIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M6.5 23.5 Q8 8 23.5 6.5"]} rings={[[6.5, 23.5], [11.5, 11.5], [23.5, 6.5]]} />;
}

// Double curve — a smooth S through its four handles
export function TVDoubleCurveIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M5.5 24.5 C8.5 26.8 14 27.8 17.5 22.5", "M17.5 22.5 C20.5 17.5 10 13 12.5 7.5", "M12.5 7.5 C13.5 3.5 20.5 1.5 24.5 5.5"]} rings={[[5.5, 24.5], [17.5, 22.5], [12.5, 7.5], [24.5, 5.5]]} />;
}

export function TVBrushStrokeIcon({ size = 28, ...props }: any) {
  return <TVBrushIcon size={size} {...props} />;
}

export function TVHighlighterIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M16.6 2.3 L9.8 9.6 L8.6 14 L9 15.5", "M4.3 20.7 L9 15.5 L13.6 20.6", "M4.3 20.8 Q9.8 25.6 13.6 20.6", "M10.4 9.4 L20 19", "M13.6 21.2 L19.6 19.8", "M26.8 13.1 L19.9 20"]} />;
}

export function TVArrowMarkerIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M6 24.2 L15.3 10.8 L14.5 8.3 L24.5 5.2 L22.6 14.4 L21.2 15.6 L19.3 14.4 Z"]} />;
}

export function TVArrowIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M7.5 23.5 L17.8 13.2"]} fills={["M22.73 8.27 L19.9 15.34 L15.66 11.1 Z"]} rings={[[7.5, 23.5], [24.5, 6.5]]} />;
}

export function TVArrowMarkUpIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M16 6.7 L25.5 17.5 H19.5 V23.5 H12.5 V17.5 H6.5 Z"]} />;
}

export function TVArrowMarkDownIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M12.5 6.5 H19.5 V12.5 H25.5 L16 23.3 L6.5 12.5 H12.5 Z"]} />;
}

// Rotated rectangle — four corner handles plus the two width handles on the long sides
export function TVRotatedRectangleIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M17.5 3.5 L26.5 12.5 L12.5 26.5 L3.5 17.5 Z"]} rings={[[17.5, 3.5], [26.5, 12.5], [19.5, 19.5], [12.5, 26.5], [3.5, 17.5], [10.5, 10.5]]} />;
}

export function TVPathIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M2.6 19.4 L10.5 11.5 L17.5 18.5 L27.5 8.5", "M22 8.5 H27.5 V14"]} rings={[[10.5, 11.5], [17.5, 18.5]]} />;
}

// Polyline — a simpler multi-point line (fewer bends than Path), same dot-vertex style.
// TradingView's polyline glyph: seven hollow rings joined into one closed outline
// (top → top-right → right-middle → center → bottom-center → bottom-left → left-middle
// → back to top). Coordinates are taken from TradingView's own icon; each segment stops
// at the ring edges rather than running through the rings.
export function TVPolylineIcon({ size = 28, ...props }: any) {
  const rings: [number, number][] = [
    [20.5, 6.5], [28.5, 6.5], [28.5, 15.5], [20.5, 15.5], [20.5, 23.5], [12.5, 23.5], [12.5, 13.5],
  ];
  const trim = 2.6;
  const segments = rings.map(([x1, y1], i) => {
    const [x2, y2] = rings[(i + 1) % rings.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    return `M${x1 + ux * trim} ${y1 + uy * trim} L${x2 - ux * trim} ${y2 - uy * trim}`;
  }).join(' ');
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="6 0.5 29 29" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1" {...props}>
      {/* TradingView draws these lines 1px wide at any icon size; a scaled stroke went
          faint at our 16px dropdown size, so the stroke width is kept in screen pixels */}
      <path d={segments} vectorEffect="non-scaling-stroke" />
      {rings.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.1" vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

export function TVCircleIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M5.2 15 A9.8 9.8 0 1 0 24.8 15 A9.8 9.8 0 1 0 5.2 15"]} rings={[[15, 15, 1.5], [24.8, 15, 1.5]]} />;
}

export function TVEllipseIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M4.5 15.5 A11 8 0 1 0 26.5 15.5 A11 8 0 1 0 4.5 15.5"]} rings={[[15.5, 7.5], [26.5, 15.5], [15.5, 23.5], [4.5, 15.5]]} />;
}

// Brush — the bristle tip (flat base, rounded belly) with a hooked handle stroke
export function TVBrushIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} lines={["M3.5 23.5 H14.3 C16.5 22 18.2 19.8 18 17.5 C17.8 15 16.2 13.4 13.5 13.3 C11.5 13.3 10.3 13.6 9.6 14.3 Z", "M19.2 7.3 C17.2 9.6 17.4 13.6 21 13.5 C21.8 13.5 22.2 13.2 22.8 12.6 L27.9 7.5"]} />;
}

// ---- Toolbar glyphs (TradingView's 28px icons, recreated from TradingView Desktop) ----

// Indicators — a line plot over a stepped bar chart
export function TVIndicatorsIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="1 0 28 28" lines={["M6.8 11.7 L12.5 6.9 L16.4 10.3 L23.8 4.5", "M7.5 22.5 H23.5 V12.5 H19.5 V22.5", "M7.5 22.5 V18.5 H11.5 V22.5", "M11.5 18.5 V15.5 H15.5 V22.5", "M15.5 17.5 H19.5"]} />;
}

// Alert — alarm clock whose bottom-right quarter gives way to a "+"
export function TVAlertIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="1 1 28 28" lines={["M14.5 22.5 A8 8 0 1 1 22.5 14.5", "M14.5 9 V14.5 H11", "M20.5 16 V25 M16 20.5 H25", "M9.2 4.8 L4.8 9.2", "M19.8 4.8 L24.2 9.2"]} />;
}

// Replay — two hollow rewind triangles
export function TVReplayIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="1 0 28 28" lines={["M14.5 9 L8.7 14.5 L14.5 20 Z", "M22.5 9 L16.7 14.5 L22.5 20 Z"]} />;
}

// Indicator templates — a 2x2 grid of rounded squares
export function TVIndicatorTemplatesIcon({ size = 28, ...props }: any) {
  const square = (x: number, y: number) =>
    `M${x + 1.5} ${y} H${x + 4.5} A1.5 1.5 0 0 1 ${x + 6} ${y + 1.5} V${y + 4.5} A1.5 1.5 0 0 1 ${x + 4.5} ${y + 6} H${x + 1.5} A1.5 1.5 0 0 1 ${x} ${y + 4.5} V${y + 1.5} A1.5 1.5 0 0 1 ${x + 1.5} ${y} Z`;
  return <TvGlyph size={size} rest={props} viewBox="0 0 28 28" lines={[square(6.5, 6.5), square(15.5, 6.5), square(6.5, 15.5), square(15.5, 15.5)]} />;
}

// Go to date — a calendar page with an arrow entering it from the left
export function TVGoToDateIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="1 0 28 28" lines={["M11.5 5 V9 M18.5 5 V9", "M6.5 14 V9 A1.5 1.5 0 0 1 8 7.5 H22 A1.5 1.5 0 0 1 23.5 9 V21 A1.5 1.5 0 0 1 22 22.5 H15", "M6.5 11.5 H23.5", "M5 19.5 H13", "M9.5 16.5 L12.5 19.5 L9.5 22.5"]} />;
}

// Pine Editor — a snow-capped peak over a separate base
export function TVPineIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="1 0 28 28" lines={["M5.3 15.8 L12.6 13.2 L18.5 18.6 L24.6 14.3 L15 4 Z", "M6.5 19.2 L2.5 25.5 H27.5 L23.5 19.2"]} />;
}

// ---- Right toolbar glyphs: coordinates are pixels of TradingView's 44px toolbar button, and
// the viewBox is the 28px icon box at its middle ----

// Watchlist, details and news — a page whose bottom edge folds up like a bookmark
export function TVWatchlistIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="8 8 28 28" lines={["M13.5 33.5 V11.5 H32.5 V33.5 L22.5 29.2 Z", "M17 16.5 H29 M17 22.5 H29"]} />;
}

// Alerts — an alarm clock
export function TVAlertsIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="8 8 28 28" lines={["M12.5 22 A10.5 10.5 0 1 0 33.5 22 A10.5 10.5 0 1 0 12.5 22", "M23.5 16 V23.5 H18", "M16 9.2 L10.2 15", "M30 9.2 L35.8 15"]} />;
}

// Object tree — two stacked layers
export function TVObjectTreeIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="8 8 28 28" lines={["M22.5 12 L11.8 18.8 L22.5 24.5 L33.5 18.8 Z", "M11.3 24.2 L22.6 31 L33.8 24.2"]} />;
}

// Help Center — a question mark in a circle
export function TVHelpIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="8 8 28 28" lines={[
    "M9.5 22 A13.5 13.5 0 1 0 36.5 22 A13.5 13.5 0 1 0 9.5 22",
    "M18.5 17.5 C18.5 15 20.5 13.5 22.8 13.5 C25.3 13.5 27.5 15.2 27.5 17.8 C27.5 19.5 26.3 20.4 24.8 21.5 C23.6 22.4 22.8 23 22.8 24.8",
    "M21.5 29 A1.5 1.5 0 1 0 24.5 29 A1.5 1.5 0 1 0 21.5 29",
  ]} />;
}

// Products — a filled disc with a 3×3 grid of square holes (drawn larger than the others,
// filling most of its 44px button, as on TradingView)
export function TVProductsIcon({ size = 36, ...props }: any) {
  const hole = (x: number, y: number) => `M${x + 1} ${y} h2 a1 1 0 0 1 1 1 v2 a1 1 0 0 1 -1 1 h-2 a1 1 0 0 1 -1 -1 v-2 a1 1 0 0 1 1 -1 Z`;
  const holes = [13, 20, 27].flatMap(y => [14, 21, 28].map(x => hole(x, y))).join(" ");
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 36 36" width={size} height={size} {...props}>
      <path fill="currentColor" fillRule="evenodd" d={`M6 22 a17 17 0 1 0 34 0 a17 17 0 1 0 -34 0 Z ${holes}`} />
    </svg>
  );
}

// Quick search — a magnifier with a lightning bolt breaking through its rim
export function TVQuickSearchIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox="1 0 28 28" lines={["M12 6.66 A7 7 0 1 0 20.46 12.77", "M18.45 18.45 L23.5 23.5", "M17.5 3.5 V8.5 H20.8 L15.5 15.5 V10.5 H12.5 Z"]} />;
}

// ---------- Header and drawing toolbar glyphs (TradingView's 28px line icons) ----------

const G28 = "0 0 28 28";

// Compare symbols — a plus in a circle
export function TVCompareIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M14 4.5a9.5 9.5 0 1 1 0 19a9.5 9.5 0 1 1 0-19", "M14 9.5v9", "M9.5 14h9"]} />;
}

// Chart type: Candles — a tall and a short hollow candle
export function TVCandlesIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M9.5 5v4", "M9.5 20v3.5", "M7.5 9.5h4v10.5h-4z", "M18.5 8v3.5", "M18.5 17.5v3", "M16.5 11.5h4v6h-4z"]} />;
}

// Settings — a hexagon nut
export function TVSettingsHexIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M9.2 6.5h9.6L23.5 14l-4.7 7.5H9.2L4.5 14z", "M14 10.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7"]} />;
}

// Fullscreen mode — four corners
export function TVFullscreenIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M6.5 11.5v-3a2 2 0 0 1 2-2h3", "M16.5 6.5h3a2 2 0 0 1 2 2v3", "M21.5 16.5v3a2 2 0 0 1-2 2h-3", "M11.5 21.5h-3a2 2 0 0 1-2-2v-3"]} />;
}

// Take a snapshot — a camera
export function TVCameraIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M5.5 11a1.5 1.5 0 0 1 1.5-1.5h3l1.5-2.5h5l1.5 2.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20z", "M14 11.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7"]} />;
}

export function TVUndoIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M8.5 12.5h8a4.5 4.5 0 0 1 0 9h-3", "M11.5 9.5l-3 3l3 3"]} />;
}
export function TVRedoIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M19.5 12.5h-8a4.5 4.5 0 0 0 0 9h3", "M16.5 9.5l3 3l-3 3"]} />;
}

// Text tool — a serif T
export function TVTextToolIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M7.5 9V6.5h13V9", "M14 6.5v15", "M11 21.5h6"]} />;
}

// Icon (emoji) tool — a smiley
export function TVEmojiToolIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M14 3.5a10.5 10.5 0 1 1 0 21a10.5 10.5 0 1 1 0-21", "M10.8 16.3c.8 1.3 1.9 1.9 3.2 1.9s2.4-.6 3.2-1.9"]} fills={["M11 11.5h1.3v1.3H11z", "M15.7 11.5H17v1.3h-1.3z"]} />;
}

export function TVZoomInIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M12.5 5.5a7 7 0 1 1 0 14a7 7 0 1 1 0-14", "M17.5 17.5l5 5", "M12.5 9.5v6", "M9.5 12.5h6"]} />;
}
export function TVZoomOutIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M12.5 5.5a7 7 0 1 1 0 14a7 7 0 1 1 0-14", "M17.5 17.5l5 5", "M9.5 12.5h6"]} />;
}

// Magnet mode — an upright horseshoe magnet
export function TVMagnetIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M6.5 23.5V12a7.5 7.5 0 0 1 15 0v11.5H17V12a3 3 0 0 0-6 0v11.5z", "M6.5 19h4.5", "M17 19h4.5"]} />;
}

// Keep drawing — a pencil with a small open padlock
export function TVKeepDrawingIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M5.5 19.5l.9-3.4l9.4-9.4l2.5 2.5l-9.4 9.4z", "M14.3 8.2l2.5 2.5", "M17.5 18.5h6v5h-6z", "M18.5 18.5V17a2 2 0 0 1 4-.4"]} />;
}

// Lock drawings — padlock, open or closed
export function TVLockToolIcon({ size = 28, locked = false, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M8 13.5h12a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 8 13.5z", locked ? "M10.5 13.5v-4a3.5 3.5 0 0 1 7 0v4" : "M8.5 13.5v-5a3.5 3.5 0 0 1 7 0v1.5"]} fills={["M13.5 18h1v2h-1z"]} />;
}

// Hide all drawings — an eye with a small brush (crossed out while hidden)
export function TVHideDrawingsIcon({ size = 28, hidden = false, ...props }: any) {
  const lines = [
    "M2.5 13c2.2-3.6 5-5.5 8.2-5.5s6 1.9 8.2 5.5c-2.2 3.6-5 5.5-8.2 5.5s-6-1.9-8.2-5.5z",
    "M10.7 9.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7",
    "M10.7 11.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3",
    "M15.5 26.5c.4-1.7 1.6-2.7 3-2.7l1.3 1.1c-.3 1.5-1.8 2.1-4.3 1.6z",
    "M19.8 24.9l4.7-4.4",
  ];
  if (hidden) lines.push("M3.5 20.5l14.5-15");
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={lines} />;
}

// Remove objects — a trash can
export function TVTrashIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M5.5 9.5h17", "M11 9.5l.5-3h5l.5 3", "M7.5 9.5l1.3 14.2a1.5 1.5 0 0 0 1.5 1.3h7.4a1.5 1.5 0 0 0 1.5-1.3l1.3-14.2"]} />;
}

// Favorite drawing tools toolbar — a star outline
export function TVStarOutlineIcon({ size = 28, ...props }: any) {
  return <TvGlyph size={size} rest={props} viewBox={G28} lines={["M14 5.2l2.6 5.6l6.1.7l-4.5 4.2l1.2 6l-5.4-3l-5.4 3l1.2-6l-4.5-4.2l6.1-.7z"]} />;
}

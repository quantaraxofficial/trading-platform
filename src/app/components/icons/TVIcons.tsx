import React from 'react';

export function TVCrosshairIcon({ size = 28, ...props }: any) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 28 28" 
      width={size} 
      height={size}
      {...props}
    >
      <g fill="currentColor">
        <path d="M18 15.5h8v-2h-8z" fill="currentColor"></path>
        <path d="M13.5 18v8h2v-8zM13.5 3v8h2v-8zM3 15.5h8v-2h-8z" fill="currentColor"></path>
      </g>
    </svg>
  );
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
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} {...props}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M7.354 21.354l14-14-1.414-1.414-14 14z" />
        <path d="M22.5 7c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM5.5 24c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
}

export function TVFibonacciIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} {...props}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M3 5.5h22v-2h-22z" />
        <path d="M3 17.5h22v-2h-22z" />
        <path d="M3 11.5h19.5v-2h-19.5z" />
        <path d="M5.5 23.5h19.5v-2h-19.5z" />
        <path d="M3.5 24c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5zM24.5 12c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm0 1c-1.381 0-2.5-1.119-2.5-2.5s1.119-2.5 2.5-2.5 2.5 1.119 2.5 2.5-1.119 2.5-2.5 2.5z" />
      </g>
    </svg>
  );
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
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="7" width="20" height="14" rx="2.5" />
    </svg>
  );
}

// Point-based shape tool icons — an outline with small filled dots marking the shape's
// draggable anchor points, matching how these tools present once drawn on the chart.
export function TVTriangleIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 19 L12 5 L21 19 Z" />
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5" cy="19" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="21" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TVArcIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}>
      <path d="M4 17 Q9 4 20 7" />
      <circle cx="4" cy="17" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="7" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TVCurveIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}>
      <path d="M4 8 Q13 6 19 18" />
      <circle cx="4" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TVDoubleCurveIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}>
      <path d="M4 8 C 10 4, 10 16, 15 15 C 17 14.5, 18 12.5, 20 12" />
      <circle cx="4" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Brush stroke — a small scribble (the bristle mark) trailing off a straight handle line.
export function TVBrushStrokeIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20 Q4.5 17 6.5 17.5 Q9 18 8 15" />
      <path d="M8 15 L19 4" />
    </svg>
  );
}

// Highlighter — a flat-tipped marker pen body, drawn on the diagonal.
export function TVHighlighterIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 19 L8.5 20 L20 7 L17 4 L5.5 16.5 Z" />
      <path d="M5 19 L4 22" />
    </svg>
  );
}

// Arrow marker — a single stamped point with a small pointer flag, for the one-click marker tool.
export function TVArrowMarkerIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 19 L16 6" />
      <path d="M16 6 L20 4 L18 8 Z" fill="currentColor" stroke="currentColor" strokeWidth="1" />
      <circle cx="7" cy="19" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Arrow — a two-point line with a clean arrowhead.
export function TVArrowIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 19 L19 5" />
      <path d="M19 5 L12.5 6 M19 5 L18 11.5" />
      <circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Arrow mark up / down — an open chevron stamp for the one-click up/down markers.
export function TVArrowMarkUpIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 17 L12 6 L19 17" />
    </svg>
  );
}

export function TVArrowMarkDownIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 7 L12 18 L19 7" />
    </svg>
  );
}

// Rotated rectangle — a diamond outline with a dot at each of its 4 corners, matching
// the same anchor-point family as the other point-based shape icons above.
export function TVRotatedRectangleIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 4 L20 12 L12 20 L4 12 Z" />
      <circle cx="12" cy="4" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Path — a free-form multi-point line, dots marking each placed vertex.
export function TVPathIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 18 L9 8 L14 15 L20 6" />
      <circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="14" cy="15" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="6" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Polyline — a simpler multi-point line (fewer bends than Path), same dot-vertex style.
export function TVPolylineIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 17 L11 7 L20 14" />
      <circle cx="4" cy="17" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Circle — outline with a center dot and a radius-handle dot on the edge.
export function TVCircleIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="20" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Ellipse — same center/edge dot style as Circle, on a wider oval.
export function TVEllipseIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <ellipse cx="12" cy="12" rx="9" ry="6" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="21" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TVBrushIcon({ size = 28, ...props }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} {...props}>
      <g fill="currentColor" fillRule="nonzero">
        <path d="M1.789 23l.859-.854.221-.228c.18-.19.38-.409.597-.655.619-.704 1.238-1.478 1.815-2.298.982-1.396 1.738-2.776 2.177-4.081 1.234-3.667 5.957-4.716 8.923-1.263 3.251 3.785-.037 9.38-5.379 9.38h-9.211zm9.211-1c4.544 0 7.272-4.642 4.621-7.728-2.45-2.853-6.225-2.015-7.216.931-.474 1.408-1.273 2.869-2.307 4.337-.599.852-1.241 1.653-1.882 2.383l-.068.078h6.853z" />
        <path d="M18.182 6.002l-1.419 1.286c-1.031.935-1.075 2.501-.096 3.48l1.877 1.877c.976.976 2.553.954 3.513-.045l5.65-5.874-.721-.693-5.65 5.874c-.574.596-1.507.609-2.086.031l-1.877-1.877c-.574-.574-.548-1.48.061-2.032l1.419-1.286-.672-.741z" />
      </g>
    </svg>
  );
}

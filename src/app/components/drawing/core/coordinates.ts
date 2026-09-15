export function pixelToLogical(chart: any, x: number): number | null {
  if (!chart) return null;
  const ts = chart.timeScale();
  const logical = ts.coordinateToLogical(x);
  if (logical === null) return null;

  const coord = ts.logicalToCoordinate(logical);
  if (coord === null) return logical;

  if (x > coord) {
    const nextCoord = ts.logicalToCoordinate(logical + 1);
    if (nextCoord !== null && nextCoord !== coord) {
      const fraction = (x - coord) / (nextCoord - coord);
      return logical + fraction;
    }
  } else if (x < coord) {
    const prevCoord = ts.logicalToCoordinate(logical - 1);
    if (prevCoord !== null && prevCoord !== coord) {
      const fraction = (coord - x) / (coord - prevCoord);
      return logical - fraction;
    }
  }
  
  return logical;
}

export function logicalToPixel(chart: any, logical: number): number | null {
  if (!chart) return null;
  const ts = chart.timeScale();
  
  // Try exact mapping first
  const intLogical = Math.floor(logical);
  const fraction = logical - intLogical;
  
  const coord1 = ts.logicalToCoordinate(intLogical);
  const coord2 = ts.logicalToCoordinate(intLogical + 1);
  
  if (coord1 !== null && coord2 !== null) {
    return coord1 + fraction * (coord2 - coord1);
  }
  
  // Fallback: If one or both are null, we might be off-screen.
  // We can estimate based on a known bar and the current bar spacing.
  const visibleRange = ts.getVisibleLogicalRange();
  if (visibleRange) {
    const centerLogical = (visibleRange.from + visibleRange.to) / 2;
    const centerCoord = ts.logicalToCoordinate(centerLogical);
    const nextCoord = ts.logicalToCoordinate(centerLogical + 1);
    
    if (centerCoord !== null) {
      if (nextCoord !== null) {
        const barSpacing = nextCoord - centerCoord;
        return centerCoord + (logical - centerLogical) * barSpacing;
      }
      
      const prevCoord = ts.logicalToCoordinate(centerLogical - 1);
      if (prevCoord !== null) {
        const barSpacing = centerCoord - prevCoord;
        return centerCoord + (logical - centerLogical) * barSpacing;
      }
    }
  }

  return ts.logicalToCoordinate(Math.round(logical));
}

export function pixelToPrice(series: any, y: number) {
  if (!series) return null;
  return series.coordinateToPrice(y);
}

export function priceToPixel(series: any, price: number) {
  if (!series) return null;
  return series.priceToCoordinate(price);
}

export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function pointInPolygon(px: number, py: number, polyPoints: number[]) {
  // polyPoints is flat array [x1,y1,x2,y2,...]
  let inside = false;
  const n = polyPoints.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polyPoints[i * 2], yi = polyPoints[i * 2 + 1];
    const xj = polyPoints[j * 2], yj = polyPoints[j * 2 + 1];
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function calculateFibonacciLevels(startPrice: number, endPrice: number, activeLevels: string[] | null = null, overrideColor: string | null = null) {
  const diff = endPrice - startPrice;
  const allLevels = [
    { label: '0.000', price: endPrice, color: overrideColor || '#ff6b6b' },
    { label: '0.236', price: endPrice - 0.236 * diff, color: overrideColor || '#4ecdc4' },
    { label: '0.382', price: endPrice - 0.382 * diff, color: overrideColor || '#45b7d1' },
    { label: '0.500', price: endPrice - 0.5 * diff, color: overrideColor || '#96ceb4' },
    { label: '0.618', price: endPrice - 0.618 * diff, color: overrideColor || '#ffeaa7' },
    { label: '0.786', price: endPrice - 0.786 * diff, color: overrideColor || '#dfe6e9' },
    { label: '1.000', price: startPrice, color: overrideColor || '#ff6b6b' },
    { label: '1.618', price: startPrice - 0.618 * diff, color: overrideColor || '#fd79a8' },
    { label: '2.618', price: startPrice - 1.618 * diff, color: overrideColor || '#00cec9' },
  ];
  
  if (activeLevels && Array.isArray(activeLevels)) {
    return allLevels.filter(level => activeLevels.includes(level.label));
  }
  
  return allLevels;
}

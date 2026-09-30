import React from 'react';
import { PositionTool, PositionToolProps } from './PositionTool';

// TradingView's Short position (profit zone below the entry, stop above) — see PositionTool
export function ShortPositionTool(props: PositionToolProps) {
  return <PositionTool side="short" {...props} />;
}

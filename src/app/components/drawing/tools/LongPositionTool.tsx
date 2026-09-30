import React from 'react';
import { PositionTool, PositionToolProps } from './PositionTool';

// TradingView's Long position (profit zone above the entry, stop below) — see PositionTool
export function LongPositionTool(props: PositionToolProps) {
  return <PositionTool side="long" {...props} />;
}

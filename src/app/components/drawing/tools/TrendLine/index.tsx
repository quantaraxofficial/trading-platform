import React from 'react';
import { Line, Circle, Group, Text } from 'react-konva';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../../core/coordinates';

interface TrendLineProps {
  id: string;
  points: { logical: number; price: number }[]; // Needs exactly 2 points
  stroke: string;
  strokeWidth: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  extendLeft?: boolean;
  extendRight?: boolean;
  showMiddlePoint?: boolean;
  showPriceLabels?: boolean;
  showStats?: boolean;
  statsPosition?: 'Left' | 'Center' | 'Right';
  isSelected: boolean;
  chart: any;
  series: any;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  isLocked?: boolean;
  text?: string;
  onTextEdit?: () => void;
}

export function TrendLine({ 
  id, points, stroke, strokeWidth, lineStyle = 'solid', 
  extendLeft = false, extendRight = false, showMiddlePoint = false,
  showPriceLabels = false, showStats = false, statsPosition = 'Right',
  isSelected, chart, series, onSelect, onUpdatePoints, isLocked = false,
  text, onTextEdit
}: TrendLineProps) {
  const [isHovering, setIsHovering] = React.useState(false);
  
  if (points.length !== 2) return null;

  const [p1, p2] = points;
  
  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);

  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

  // Calculate extended points if needed
  let displayX1 = x1;
  let displayY1 = y1;
  let displayX2 = x2;
  let displayY2 = y2;

  if (extendLeft || extendRight) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length > 0) {
      const ux = dx / length;
      const uy = dy / length;
      
      const extension = 100000; // Large enough for any screen

      if (extendLeft) {
        displayX1 = x1 - ux * extension;
        displayY1 = y1 - uy * extension;
      }
      if (extendRight) {
        displayX2 = x2 + ux * extension;
        displayY2 = y2 + uy * extension;
      }
    }
  }

  const dash = lineStyle === 'dashed' ? [10, 10] : lineStyle === 'dotted' ? [2, 4] : [];

  // Stats calculation
  const priceDiff = p2.price - p1.price;
  const percentChange = ((p2.price - p1.price) / p1.price) * 100;
  const barDiff = Math.abs(Math.round(p2.logical - p1.logical));
  const statsText = `${priceDiff.toFixed(2)} (${percentChange.toFixed(2)}%) ${barDiff} bars`;

  const getStatsPos = () => {
    if (statsPosition === 'Left') return { x: x1, y: y1 - 20 };
    if (statsPosition === 'Center') return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 20 };
    return { x: x2, y: y2 - 20 };
  };

  const statsPos = getStatsPos();

  const handleDragEnd = (e: any) => {
    if (!onUpdatePoints) return;
    const node = e.target;
    // node could be Group (whole shape) or Circle (handle)
    const isHandle = node.className === 'Circle';

    if (!isHandle) {
      // Dragging the whole shape
      const dx = node.x();
      const dy = node.y();
      
      const newL1 = pixelToLogical(chart, x1 + dx);
      const newP1 = pixelToPrice(series, y1 + dy);
      const newL2 = pixelToLogical(chart, x2 + dx);
      const newP2 = pixelToPrice(series, y2 + dy);

      if (newL1 !== null && newP1 !== null && newL2 !== null && newP2 !== null) {
        onUpdatePoints([{ logical: newL1, price: newP1 }, { logical: newL2, price: newP2 }]);
      }
      
      // Reset position so it re-renders based on new logical points
      node.position({ x: 0, y: 0 });
    }
  };

  const handleCircleDrag = (index: number) => (e: any) => {
    e.cancelBubble = true; // Prevent Group drag
    if (!onUpdatePoints) return;
    
    const newX = e.target.x();
    const newY = e.target.y();
    
    const logical = pixelToLogical(chart, newX);
    const price = pixelToPrice(series, newY);
    
    if (logical !== null && price !== null) {
      const newPoints = [...points];
      newPoints[index] = { logical, price };
      onUpdatePoints(newPoints);
    }
  };

  return (
    <Group 
      id={id}
      draggable={isSelected && !isLocked} 
      onDragEnd={handleDragEnd}
      onClick={onSelect}
      onTap={onSelect}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Line
        points={[displayX1, displayY1, displayX2, displayY2]}
        stroke={isSelected ? '#2962ff' : stroke}
        strokeWidth={strokeWidth}
        dash={dash}
        hitStrokeWidth={10}
        listening={true}
      />
      
      {showPriceLabels && (
        <>
          <Text x={x1 + 10} y={y1 - 15} text={p1.price.toFixed(2)} fontSize={10} fill={stroke} />
          <Text x={x2 + 10} y={y2 - 15} text={p2.price.toFixed(2)} fontSize={10} fill={stroke} />
        </>
      )}

      {showStats && (
        <Text 
          x={statsPos.x} 
          y={statsPos.y} 
          text={statsText} 
          fontSize={11} 
          fill={stroke}
          fontStyle="bold"
        />
      )}

      {/* Text rendering */}
      {(() => {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        const textRot = (angle > 90 || angle < -90) ? angle + 180 : angle;

        if (text) {
          return (
            <Group 
              x={mx} 
              y={my} 
              rotation={textRot} 
              onClick={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }} 
              onTap={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
            >
              <Text 
                text={text} 
                fill={stroke} 
                fontSize={14} 
                offsetX={0} 
                offsetY={20} // Position above the line
                align="center"
              />
            </Group>
          );
        }

        if (isSelected && isHovering && !text) {
          return (
            <Group 
              x={mx} 
              y={my} 
              rotation={textRot} 
              onClick={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }} 
              onTap={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
            >
              <Text 
                text="+ Add text" 
                fill="#2962ff" 
                opacity={0.7} 
                fontSize={12} 
                offsetX={0} 
                offsetY={18}
                align="center"
              />
            </Group>
          );
        }
        return null;
      })()}

      {isSelected && (
        <>
          <Circle 
            x={x1} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} 
            draggable={!isLocked} 
            onDragStart={(e) => e.cancelBubble = true}
            onDragMove={handleCircleDrag(0)}
            onDragEnd={handleCircleDrag(0)} 
          />
          {showMiddlePoint && (
            <Circle 
              x={(x1 + x2) / 2} y={(y1 + y2) / 2} radius={5} fill="white" stroke="#2962ff" strokeWidth={1} 
            />
          )}
          <Circle 
            x={x2} y={y2} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} 
            draggable={!isLocked} 
            onDragStart={(e) => e.cancelBubble = true}
            onDragMove={handleCircleDrag(1)}
            onDragEnd={handleCircleDrag(1)} 
          />
        </>
      )}
    </Group>
  );
}

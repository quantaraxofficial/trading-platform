import { useEffect, useRef } from 'react';
import { useDrawing } from '../drawing/core/DrawingContext';

interface BotControllerProps {
  isActive: boolean;
  timeframe: string;
  onActionFired?: (action: string) => void;
  setTimeframe: (tf: string) => void;
}

export default function BotController({ isActive, timeframe, onActionFired, setTimeframe }: BotControllerProps) {
  const { drawings, addDrawing, setDrawings } = useDrawing();
  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  const timeframeRef = useRef(timeframe);
  const drawingsRef = useRef(drawings);

  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);

  useEffect(() => {
    if (!isActive) {
      if (pollInterval.current) clearInterval(pollInterval.current);
      return;
    }

    console.log('[BotController] Bot activated! Polling PyTorch API every 5s...');

    pollInterval.current = setInterval(async () => {
      try {
        let activeLongs = 0;
        let activeShorts = 0;
        drawingsRef.current.forEach(d => {
          if (d.type === 'long_position') activeLongs++;
          if (d.type === 'short_position') activeShorts++;
        });

        const currentTf = timeframeRef.current;

        const res = await fetch('http://localhost:8000/api/users/bot/predict/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeframe: currentTf,
            active_longs: activeLongs,
            active_shorts: activeShorts
          })
        });

        if (res.ok) {
          const data = await res.json();
          const action = data.predicted_action;
          console.log('[BotController] Inference received:', action, 'State used:', data.state_used);
          if (onActionFired) onActionFired(action);
          
          executeAction(action, currentTf);
        }
      } catch (err) {
        console.error('[BotController] Inference failed:', err);
      }
    }, 5000);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [isActive]);

  const executeAction = (action: string, currentTimeframe: string) => {
    if (action === 'DRAWING_ADDED') {
      // Simulate adding a long position at the center of the screen
      const logicalX = Date.now() / 1000;
      
      // We don't have exact price here, so we'll just mock a generic coordinate
      const newPos = {
        id: `bot-long-${Date.now()}`,
        type: 'long_position',
        points: [
          { logical: logicalX, price: 300 } // fallback price, AAPL is around 300
        ],
        style: {}
      };
      
      // In a real app we'd use Chart logic to find the center price, but this works for proof of concept
      addDrawing(newPos as any);
      console.log('[BotController] Executed: Added Long Position');
      
    } else if (action === 'DRAWING_MODIFIED') {
      // Modify the latest drawing by shifting its coordinates
      setDrawings(prev => {
        if (prev.length === 0) return prev;
        const newDrawings = [...prev];
        const latest = { ...newDrawings[newDrawings.length - 1] };
        if (latest.points && latest.points.length > 0) {
          latest.points = latest.points.map(p => ({
            ...p,
            price: p.price * 1.001 // shift price by 0.1%
          }));
        }
        newDrawings[newDrawings.length - 1] = latest;
        return newDrawings;
      });
      console.log('[BotController] Executed: Modified latest drawing');
      
    } else if (action === 'TIMEFRAME_CHANGED') {
      // Toggle between 15m and 5m randomly
      const newTf = currentTimeframe === '15min' ? '5min' : '15min';
      setTimeframe(newTf);
      console.log('[BotController] Executed: Changed Timeframe to', newTf);
      
    } else if (action === 'DRAWING_DELETED') {
      // Delete the oldest bot drawing
      setDrawings(prev => {
        if (prev.length > 0) {
          return prev.slice(1);
        }
        return prev;
      });
      console.log('[BotController] Executed: Deleted drawing');
    }
  };

  return null; // This is a headless component
}

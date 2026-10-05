import React, { useState, useEffect, useRef } from 'react';

interface DualRangeSliderProps {
  min: number;
  max: number;
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
}

export function DualRangeSlider({ min, max, from, to, onChange }: DualRangeSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeHandle, setActiveHandle] = useState<'from' | 'to' | null>(null);

  const getPercent = (value: number) => ((value - min) / (max - min)) * 100;

  const handleMouseDown = (handle: 'from' | 'to') => (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveHandle(handle);
  };

  useEffect(() => {
    if (!activeHandle) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
      const value = Math.round(min + percent * (max - min));

      if (activeHandle === 'from') {
        onChange(Math.min(value, to), to);
      } else {
        onChange(from, Math.max(value, from));
      }
    };

    const handleMouseUp = () => {
      setActiveHandle(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeHandle, from, to, min, max, onChange]);

  return (
    <div 
      ref={containerRef}
      style={{
        flex: 1,
        height: '4px',
        backgroundColor: 'var(--tv-sub-border)',
        borderRadius: '2px',
        position: 'relative',
        margin: '0 12px',
        cursor: 'pointer'
      }}
    >
      {/* Highlighted range */}
      <div 
        style={{
          position: 'absolute',
          left: `${getPercent(from)}%`,
          right: `${100 - getPercent(to)}%`,
          height: '100%',
          backgroundColor: '#434651',
          borderRadius: '2px'
        }}
      />
      
      {/* From handle */}
      <div 
        onMouseDown={handleMouseDown('from')}
        style={{
          position: 'absolute',
          left: `${getPercent(from)}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '12px',
          height: '12px',
          backgroundColor: 'var(--tv-sub-bg)',
          border: '2px solid #131722',
          borderRadius: '50%',
          cursor: 'ew-resize',
          zIndex: 2
        }}
      />
      
      {/* To handle */}
      <div 
        onMouseDown={handleMouseDown('to')}
        style={{
          position: 'absolute',
          left: `${getPercent(to)}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '12px',
          height: '12px',
          backgroundColor: 'var(--tv-sub-bg)',
          border: '2px solid #131722',
          borderRadius: '50%',
          cursor: 'ew-resize',
          zIndex: 2
        }}
      />
    </div>
  );
}

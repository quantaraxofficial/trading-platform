import React, { useState } from 'react';

interface NumberInputProps {
  value: number | string;
  onChange: (value: string) => void;
  width?: string;
  style?: React.CSSProperties;
}

export function NumberInput({ value, onChange, width = '100%', style }: NumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const borderStyle = isFocused 
    ? '1px solid #2962ff' 
    : isHovered 
      ? '1px solid #b2b5be' 
      : '1px solid #e0e3eb';

  return (
    <input
      type="number"
      step="any"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width,
        height: '34px',
        border: borderStyle,
        borderRadius: '4px',
        padding: '0 12px',
        fontSize: '13px',
        color: '#131722',
        outline: 'none',
        transition: 'border-color 0.2s',
        ...style
      }}
    />
  );
}

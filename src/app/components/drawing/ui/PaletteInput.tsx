"use client";

// A drop-in for <input type="color">: the same props (value, onChange receiving e.target.value,
// disabled, style), but it opens TradingView's palette (swatches, opacity, "+" for a custom
// colour) instead of the browser's own colour picker.

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ColorPickerPopup } from "./ColorPickerPopup";

type Props = {
  value?: string;
  onChange?: (e: { target: { value: string }; currentTarget: { value: string }; stopPropagation: () => void; preventDefault: () => void }) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  title?: string;
  className?: string;
  "aria-label"?: string;
  [k: string]: any;
};

export function PaletteInput({ value = "#000000", onChange, disabled, style, title, className, "aria-label": ariaLabel }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setPos(null);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [pos]);
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (pos) { setPos(null); return; }
    const r = btnRef.current!.getBoundingClientRect();
    setPos({ top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 440)), left: Math.max(8, Math.min(r.left, window.innerWidth - 290)) });
  };
  return (
    <>
      <button ref={btnRef} type="button" aria-label={ariaLabel || title || "Color"} title={title} className={className} disabled={disabled}
        onMouseDown={e => e.stopPropagation()} onClick={open}
        style={{ border: "none", padding: 0, background: "transparent", ...style }} />
      {pos && createPortal(
        <div ref={popRef} onMouseDown={e => e.stopPropagation()}>
          <ColorPickerPopup colorStr={value} onChange={c => onChange?.({ target: { value: c }, currentTarget: { value: c }, stopPropagation: () => {}, preventDefault: () => {} })} onClose={() => setPos(null)}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 100005 }} />
        </div>,
        document.body,
      )}
    </>
  );
}

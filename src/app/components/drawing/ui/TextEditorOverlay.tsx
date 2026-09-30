"use client";

import React, { useEffect, useRef } from 'react';

interface TextEditorOverlayProps {
  initialText: string;
  x: number;
  y: number;
  rotation?: number;
  onCommit: (newText: string) => void;
  onCancel: () => void;
  color?: string;
  fontSize?: number;
}

// Uses a contentEditable element instead of a <textarea> so the box always sizes
// itself to whatever's typed (shrink-to-fit, like any absolutely positioned block
// with no explicit width) — that's what lets translate(-50%, -50%) genuinely center
// the text on the shape's anchor point regardless of string length, and it's what
// gives a plain blinking caret with no visible input chrome, matching how this
// editor is meant to look sitting directly on top of the shape.
export function TextEditorOverlay({ initialText, x, y, rotation, onCommit, onCancel, color = '#2962ff', fontSize = 14 }: TextEditorOverlayProps) {
  const editableRef = useRef<HTMLDivElement>(null);
  const textRef = useRef(initialText);

  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    el.textContent = initialText;

    setTimeout(() => {
      el.focus();
      // Place the caret at the end of any existing text rather than the start
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 50);
  }, []);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    textRef.current = e.currentTarget.textContent || '';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onCancel();
      return;
    }
    if (e.key === 'Enter') {
      // Enter adds a new line rather than committing, matching TradingView.
      e.preventDefault();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const lineBreak = document.createTextNode('\n');
        range.insertNode(lineBreak);
        range.setStartAfter(lineBreak);
        range.setEndAfter(lineBreak);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      textRef.current = editableRef.current?.textContent || '';
    }
  };

  const handleBlur = () => {
    if (textRef.current.trim() === '') {
      onCancel();
    } else {
      onCommit(textRef.current);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 100, // Above drawing layer
      }}
      onMouseDown={(e) => {
        // If clicking outside the editable text, blur it (which commits)
        if (e.target !== editableRef.current) {
          handleBlur();
        }
      }}
    >
      <style>{`.tv-text-editor-overlay-input:empty:before { content: attr(data-placeholder); color: ${color}; opacity: 0.7; pointer-events: none; }`}</style>
      <div
        ref={editableRef}
        className="tv-text-editor-overlay-input"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Add text"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          transform: typeof rotation === 'number' ? `translate(-50%, -50%) rotate(${rotation}deg)` : undefined,
          minWidth: '20px',
          minHeight: `${fontSize + 4}px`,
          maxWidth: '360px',
          color,
          fontSize: `${fontSize}px`,
          fontFamily: 'sans-serif',
          textAlign: 'center',
          outline: 'none',
          caretColor: color,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      />
    </div>
  );
}

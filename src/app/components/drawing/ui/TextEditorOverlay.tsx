"use client";

import React, { useState, useEffect, useRef } from 'react';

interface TextEditorOverlayProps {
  initialText: string;
  x: number;
  y: number;
  rotation?: number;
  onCommit: (newText: string) => void;
  onCancel: () => void;
  color?: string;
}

export function TextEditorOverlay({ initialText, x, y, rotation, onCommit, onCancel, color = '#2962ff' }: TextEditorOverlayProps) {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = textareaRef.current.value.length;
          textareaRef.current.selectionEnd = textareaRef.current.value.length;
        }
      }, 50);
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    adjustHeight();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
    // Enter just adds a new line in TradingView
  };

  const handleBlur = () => {
    if (text.trim() === '') {
      onCancel();
    } else {
      onCommit(text);
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
        // If clicking outside the textarea, blur it (which commits)
        if (e.target !== textareaRef.current) {
          handleBlur();
        }
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="Add text"
        style={{
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          transform: typeof rotation === 'number' ? `translate(-50%, -50%) rotate(${rotation}deg)` : undefined,
          minWidth: '100px',
          minHeight: '24px',
          background: 'var(--tv-color-pane-background)',
          color: color,
          border: '1px solid var(--tv-color-border)',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '16px',
          fontFamily: 'sans-serif',
          resize: 'none',
          overflow: 'hidden',
          outline: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
        }}
      />
    </div>
  );
}

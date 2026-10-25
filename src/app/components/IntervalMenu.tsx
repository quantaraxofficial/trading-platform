"use client";

// The header's "Chart interval" dropdown and its "Add custom interval" dialog, as on TradingView:
// the intervals in collapsible sections (ticks, seconds, minutes, hours, days, ranges) with the
// user's custom ones sorted in, a star on each row to keep it on the toolbar, and a trash button
// on custom rows.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../lib/useEscapeClose";
import {
  SECTIONS, type SectionId, CUSTOM_TYPES, intervalName, isIntervalAvailable, sectionOf, sortIntervals,
  getCustomIntervals, subscribeCustomIntervals, addCustomInterval, removeCustomInterval, customIntervalError,
} from "../lib/intervals";

const COLLAPSED_KEY = "tv:intervalMenuSections";

function loadCollapsed(): SectionId[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function saveCollapsed(v: SectionId[]) {
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

// The custom intervals, kept current when they change here, in another tab or by cloud sync
let customSnapshot: string[] | null = null;
function customSnapshotNow() {
  const next = getCustomIntervals();
  if (!customSnapshot || customSnapshot.join() !== next.join()) customSnapshot = next;
  return customSnapshot;
}
const EMPTY: string[] = [];
export function useCustomIntervals(): string[] {
  return useSyncExternalStore(subscribeCustomIntervals, customSnapshotNow, () => EMPTY);
}

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><path fill="currentColor" d="M13.9 14.1V22h1.2v-7.9H23v-1.2h-7.9V5h-1.2v7.9H6v1.2h7.9Z" /></svg>
);
const StarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18"><path fill="currentColor" d="M9 1l2.35 4.76 5.26.77-3.8 3.7.9 5.24L9 13l-4.7 2.47.9-5.23-3.8-3.71 5.25-.77L9 1z" /></svg>
);
const StarOutlineIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" fill="none"><path stroke="currentColor" d="M9 2.13l1.903 3.855.116.236.26.038 4.255.618-3.079 3.001-.188.184.044.259.727 4.237-3.805-2L9 12.434l-.233.122-3.805 2.001.727-4.237.044-.26-.188-.183-3.079-3.001 4.255-.618.26-.038.116-.236L9 2.13z" /></svg>
);
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18"><path fill="currentColor" d="M12 4h3v1h-1.04l-.88 9.64a1.5 1.5 0 0 1-1.5 1.36H6.42a1.5 1.5 0 0 1-1.5-1.36L4.05 5H3V4h3v-.5C6 2.67 6.67 2 7.5 2h3c.83 0 1.5.67 1.5 1.5V4ZM7.5 3a.5.5 0 0 0-.5.5V4h4v-.5a.5.5 0 0 0-.5-.5h-3ZM5.05 5l.87 9.55a.5.5 0 0 0 .5.45h5.17a.5.5 0 0 0 .5-.45L12.94 5h-7.9Z" /></svg>
);
const SectionChevron = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18"><path fill="currentColor" d="m4.67 10.62.66.76L9 8.16l3.67 3.22.66-.76L9 6.84l-4.33 3.78Z" /></svg>
);
// Points down; the header button and the Type field turn it over while open
export const DownChevron = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18"><path fill="currentColor" d="M3.92 7.83 9 12.29l5.08-4.46-1-1.13L9 10.29l-4.08-3.6-1 1.14Z" /></svg>
);
const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18"><path stroke="currentColor" strokeWidth="1.2" d="m1.5 1.5 15 15m0-15-15 15" /></svg>
);

export function IntervalMenu({ anchor, interval, favorites, onSelect, onToggleFavorite, onRemoveCustom, onClose }: {
  anchor: HTMLElement | null;
  interval: string;
  favorites: string[];
  onSelect: (value: string) => void;
  onToggleFavorite: (value: string) => void;
  onRemoveCustom: (value: string) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const custom = useCustomIntervals();
  const [collapsed, setCollapsed] = useState<SectionId[]>(loadCollapsed);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revealValue, setRevealValue] = useState<string | null>(null);

  // Below the button, moved up as far as needed to fit the window; taller than the window, it
  // fills it from the top and scrolls
  const place = useCallback(() => {
    const el = menuRef.current;
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect();
    el.style.maxHeight = `${window.innerHeight}px`;
    const h = el.offsetHeight;
    const top = Math.max(0, Math.min(a.bottom + 2, window.innerHeight - h));
    const left = Math.max(0, Math.min(a.left, window.innerWidth - el.offsetWidth));
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }, [anchor]);
  useLayoutEffect(place);

  // A custom interval just added is scrolled into view
  useEffect(() => {
    if (!revealValue) return;
    menuRef.current?.querySelector(`[data-value="${revealValue}"]`)?.scrollIntoView({ block: "nearest" });
    setRevealValue(null);
  }, [revealValue, custom]);

  // Click outside closes the menu (but not while its dialog is open: that click is the dialog's)
  useEffect(() => {
    if (dialogOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dialogOpen, anchor, onClose]);
  useEscapeClose(onClose);

  const toggleSection = (id: SectionId) => {
    setCollapsed(prev => {
      const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id];
      saveCollapsed(next);
      return next;
    });
  };

  const onAdded = (value: string) => {
    const section = sectionOf(value);
    if (section && collapsed.includes(section)) toggleSection(section);
    setDialogOpen(false);
    setRevealValue(value);
  };

  return (
    <>
      <div ref={menuRef} className="tv-im" data-name="interval-menu">
        <div className="tv-im-box">
          <div className="tv-im-list">
            <div className="tv-im-row tv-im-add" onClick={() => setDialogOpen(true)}>
              <span className="tv-im-add-icon"><PlusIcon /></span>
              <span className="tv-im-title">Add custom interval…</span>
            </div>
            {SECTIONS.map(section => {
              const isCollapsed = collapsed.includes(section.id);
              const items = sortIntervals([...section.standard, ...custom.filter(v => sectionOf(v) === section.id)]);
              return (
                <div key={section.id}>
                  <div className="tv-im-sep" />
                  <button className={`tv-im-head${isCollapsed ? " collapsed" : ""}`} onClick={() => toggleSection(section.id)} aria-expanded={!isCollapsed}>
                    <span>{section.title}</span>
                    <SectionChevron />
                  </button>
                  {!isCollapsed && items.map(value => (
                    <IntervalRow
                      key={value}
                      value={value}
                      selected={value === interval}
                      favorite={favorites.includes(value)}
                      isCustom={custom.includes(value)}
                      onSelect={() => onSelect(value)}
                      onToggleFavorite={() => onToggleFavorite(value)}
                      onRemove={() => onRemoveCustom(value)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {dialogOpen && <AddCustomIntervalDialog onAdded={onAdded} onClose={() => setDialogOpen(false)} />}
    </>
  );
}

function IntervalRow({ value, selected, favorite, isCustom, onSelect, onToggleFavorite, onRemove }: {
  value: string; selected: boolean; favorite: boolean; isCustom: boolean;
  onSelect: () => void; onToggleFavorite: () => void; onRemove: () => void;
}) {
  // Tick and range bars (and seconds other than 30) can't be built from this app's data
  const available = isIntervalAvailable(value);
  return (
    <div
      className={`tv-im-row${selected ? " selected" : ""}${available ? "" : " unavailable"}`}
      data-value={value}
      title={available ? undefined : "Not available for this data feed"}
      onClick={() => available && onSelect()}
    >
      <span className="tv-im-title">{intervalName(value)}</span>
      <span className="tv-im-actions">
        {isCustom && (
          <button className="tv-im-icon hover-only" title="Remove" aria-label="Remove" onClick={e => { e.stopPropagation(); onRemove(); }}>
            <TrashIcon />
          </button>
        )}
        {available && (
          <button
            className={`tv-im-icon${favorite ? " fav" : " hover-only"}`}
            title={favorite ? "Remove from favorites" : "Add to favorites"}
            aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
            onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          >
            {favorite ? <StarIcon /> : <StarOutlineIcon />}
          </button>
        )}
      </span>
    </div>
  );
}

const ERRORS = {
  invalid: "Interval value is too big, please try again",
  already_exists: "Interval already exists, please use a different value",
};

export function AddCustomIntervalDialog({ onAdded, onClose }: { onAdded: (value: string) => void; onClose: () => void }) {
  const [type, setType] = useState<string>("min");
  const [value, setValue] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [focused, setFocused] = useState<"type" | "value" | null>("value");
  const inputRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Esc closes the Type list first, then the dialog (the menu behind it stays open)
  useEscapeClose(onClose);
  useEscapeClose(() => setTypeOpen(false), typeOpen);

  useEffect(() => {
    if (!typeOpen) return;
    const onDown = (e: MouseEvent) => { if (!typeRef.current?.contains(e.target as Node)) setTypeOpen(false); };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [typeOpen]);

  const error = customIntervalError(value, type);
  const canAdd = !!Number(value) && !error;

  const submit = () => {
    if (!canAdd) return;
    const added = addCustomInterval(Number(value), type);
    if (added) onAdded(added);
  };

  const typeLabel = CUSTOM_TYPES.find(t => t.id === type)?.label ?? type;

  return createPortal(
    <div className="tv-cid-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tv-cid" role="dialog" aria-modal="true" aria-labelledby="tv-cid-title" data-name="add-custom-interval-dialog">
        <div className="tv-cid-header">
          <div className="tv-cid-title" id="tv-cid-title">Add custom interval</div>
          <button className="tv-cid-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="tv-cid-content">
          <div className="tv-cid-row">
            <div className="tv-cid-label">Type</div>
            <div ref={typeRef} className={`tv-cid-field${typeOpen || focused === "type" ? " focused" : ""}`}>
              <button
                className={`tv-cid-select${typeOpen ? " open" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={typeOpen}
                onClick={() => setTypeOpen(o => !o)}
                onFocus={() => setFocused("type")}
                onBlur={() => setFocused(f => (f === "type" ? null : f))}
              >
                <span>{typeLabel}</span>
                <DownChevron />
              </button>
              {typeOpen && (
                <div className="tv-cid-pop" role="listbox">
                  {CUSTOM_TYPES.map(t => (
                    <div
                      key={t.id}
                      role="option"
                      aria-selected={t.id === type}
                      className={`tv-cid-opt${t.id === type ? " selected" : ""}`}
                      onClick={() => { setType(t.id); setTypeOpen(false); inputRef.current?.focus(); }}
                    >
                      {t.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="tv-cid-row">
            <div className="tv-cid-label">Interval</div>
            <div>
              <div className={`tv-cid-field${error ? " error" : focused === "value" ? " focused" : ""}`}>
                <input
                  ref={inputRef}
                  inputMode="numeric"
                  maxLength={6}
                  value={value}
                  aria-invalid={!!error}
                  onChange={e => { if (/^[0-9]*$/.test(e.target.value)) setValue(e.target.value); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
                  onFocus={() => setFocused("value")}
                  onBlur={() => setFocused(f => (f === "value" ? null : f))}
                  style={{ width: "100%", height: "100%", border: "none", outline: "none", background: "transparent", color: "var(--tv-im-text)", font: "inherit", fontSize: 14, padding: "0 8px", borderRadius: 8 }}
                />
              </div>
              {error && <div className="tv-cid-error">{ERRORS[error]}</div>}
            </div>
          </div>
        </div>
        <div className="tv-cid-footer">
          <button className="tv-cid-btn cancel" onClick={onClose}>Cancel</button>
          <button className="tv-cid-btn primary" disabled={!canAdd} onClick={submit}>Add</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

// Where the Pine Editor sits and how it's set up, kept across reloads as TradingView keeps them:
// the dock (an overlay over the right of the window, a split view beside the whole layout, or a
// tab in the bottom panel), its size, whether it's collapsed, and the Editor settings dialog's
// choices. Also whether the latest release notes have been looked at (the "…" button's dot).

import { makeStore } from "../../trading/settings";

export type PineDockMode = "overlay" | "split" | "bottom";

export interface PineDock {
  // Open (mounted); collapsed hides it without losing the script being edited
  open: boolean;
  collapsed: boolean;
  mode: PineDockMode;
  // Width of the overlay / split view, px
  width: number;
  // Split view taking the whole window
  maximized: boolean;
  // Bottom tab: panel height, and whether the panel is expanded
  bottomHeight: number;
  bottomExpanded: boolean;
}

export const pineDock = makeStore<PineDock>("tv:pineDock", {
  open: false, collapsed: false, mode: "overlay", width: 0, maximized: false, bottomHeight: 360, bottomExpanded: true,
});

export interface PineEditorSettings {
  suggestions: boolean;
  minimap: boolean;
  lineLengthGuide: boolean;
  diffDecorations: boolean;
  wordWrap: boolean;
}
export const DEFAULT_EDITOR_SETTINGS: PineEditorSettings = {
  suggestions: true, minimap: true, lineLengthGuide: false, diffDecorations: true, wordWrap: false,
};
export const pineEditorSettings = makeStore<PineEditorSettings>("tv:pineEditorSettings", DEFAULT_EDITOR_SETTINGS);

// Bumped when the release notes link changes, so the dot comes back for new notes
export const RELEASE_NOTES_VERSION = "2026-09";
export const pineMisc = makeStore<{ releaseNotesSeen: string }>("tv:pineMisc", { releaseNotesSeen: "" });

// The overlay's default width: half the window, as TradingView opens it
export const defaultPineWidth = () => (typeof window === "undefined" ? 720 : Math.round(window.innerWidth / 2));
export const MIN_PINE_WIDTH = 420;
export const clampPineWidth = (w: number) => Math.max(MIN_PINE_WIDTH, Math.min(w, (typeof window === "undefined" ? 1440 : window.innerWidth) - 240));

export function openPine() {
  pineDock.set(d => ({ open: true, collapsed: false, width: d.width || defaultPineWidth() }));
}

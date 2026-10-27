// Chat themes: how the collab's group chat and the private chats look for you — the
// background (a colour, or a photo dimmed by an amount), the font and its size, the text colour,
// the bubbles (yours and others') and an accent. A few come ready-made; you can make, edit and delete your own. Your
// choice and your themes follow your account like the other settings.

import type { CSSProperties } from "react";
import { makeStore } from "../../trading/settings";
import { FONTS, type FontKey } from "../fonts";
import { BACKEND, type RoomInfo } from "./session";
import { sessionKey } from "@/lib/backend";

export interface ChatTheme {
  id: string; name: string;
  background: string;          // the chat's background colour
  image?: string;              // a photo behind the messages (data URL), over the colour
  imageDim: number;            // 0..90: how much the background colour veils the photo
  text: string;                // the messages' text
  bubble: string;              // others' messages
  bubbleMine: string;          // yours
  accent: string;              // links, progress, the send button's colour
  font?: ChatFont;             // the messages' typeface (default: the app's)
  fontSize?: number;           // the messages' size in px (default 14)
}

// The same typefaces as the site font (lib/fonts)
export type ChatFont = FontKey;
export const CHAT_FONTS = FONTS;
export const CHAT_FONT_SIZES = [12, 13, 14, 15, 16, 18, 20];

export const PRESET_THEMES: ChatTheme[] = [
  { id: "default", name: "Default", background: "", imageDim: 0, text: "", bubble: "", bubbleMine: "", accent: "" },
  { id: "midnight", name: "Midnight", background: "#0e1525", imageDim: 0, text: "#e3e8f4", bubble: "#1d2840", bubbleMine: "#2d4a86", accent: "#6ea8ff" },
  { id: "ocean", name: "Ocean", background: "#e8f4f8", imageDim: 0, text: "#0b3142", bubble: "#ffffff", bubbleMine: "#bfe3ef", accent: "#0b8bb0" },
  { id: "forest", name: "Forest", background: "#102119", imageDim: 0, text: "#dcefe3", bubble: "#1c3628", bubbleMine: "#2f6a4a", accent: "#4fd18b" },
  { id: "sunset", name: "Sunset", background: "#fff3ea", imageDim: 0, text: "#3b1e12", bubble: "#ffe1cf", bubbleMine: "#ffc39e", accent: "#e8692c" },
  { id: "paper", name: "Paper", background: "#f6f1e7", imageDim: 0, text: "#2d2a26", bubble: "#ffffff", bubbleMine: "#ece3d0", accent: "#8a6d3b" },
];

export const chatThemes = makeStore<{ active: string; custom: ChatTheme[] }>("tv:collabChatThemes", { active: "default", custom: [] });

export function allThemes(custom: ChatTheme[]): ChatTheme[] { return [...PRESET_THEMES, ...custom]; }

// A collab's group-chat theme (set by its admin or a controller), its photo from its own link
export function themeImageUrl(uid: string, token: string, version: string) {
  return `${BACKEND}/api/users/collab/${encodeURIComponent(uid)}/room/${encodeURIComponent(token)}/theme-image/?session_key=${encodeURIComponent(sessionKey())}&v=${version}`;
}
// A group chat's theme (set by its admins), its photo from the group's own link
export function groupTheme(t: { name: string; background: string; text: string; bubble: string; bubbleMine: string; accent: string; imageDim: number; image_v: string | null; font?: string; fontSize?: number } | null | undefined, uid: string, token: string): ChatTheme | null {
  if (!t) return null;
  return { id: "group", name: t.name, background: t.background, text: t.text, bubble: t.bubble, bubbleMine: t.bubbleMine, accent: t.accent,
    font: (t.font as ChatFont) || undefined, fontSize: t.fontSize || undefined, imageDim: t.imageDim,
    image: t.image_v ? `${BACKEND}/api/users/collab/${encodeURIComponent(uid)}/groups/${encodeURIComponent(token)}/theme-image/?session_key=${encodeURIComponent(sessionKey())}&v=${t.image_v}` : undefined };
}

export function roomTheme(room: RoomInfo | null, uid: string | null): ChatTheme {
  const t = room?.chat_theme;
  if (!t || !room || !uid) return PRESET_THEMES[0];
  return { id: "room", name: t.name, background: t.background, text: t.text, bubble: t.bubble, bubbleMine: t.bubbleMine, accent: t.accent,
    font: (t.font as ChatFont) || undefined, fontSize: t.fontSize || undefined,
    imageDim: t.imageDim, image: t.image_v ? themeImageUrl(uid, room.token, t.image_v) : undefined };
}

export function activeTheme(v: { active: string; custom: ChatTheme[] }): ChatTheme {
  return allThemes(v.custom).find(t => t.id === v.active) || PRESET_THEMES[0];
}

export function useChatTheme(): ChatTheme {
  return activeTheme(chatThemes.useValue());
}

export function saveTheme(t: ChatTheme, apply = true) {
  chatThemes.set(v => ({ custom: [...v.custom.filter(x => x.id !== t.id), t], active: apply ? t.id : v.active }));
}
export function deleteTheme(id: string) {
  chatThemes.set(v => ({ custom: v.custom.filter(x => x.id !== id), active: v.active === id ? "default" : v.active }));
}
export function applyTheme(id: string) { chatThemes.set({ active: id }); }

// A colour with alpha (hex #rgb / #rrggbb only; the editor's colours are those)
function veil(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// The panel's CSS variables and the chat area's background for a theme (Default: the app's own)
export function themeVars(t: ChatTheme): CSSProperties {
  const v: Record<string, string> = {};
  // Only the chat area's text: the panel's header stays readable on its own background
  if (t.text) { v["--tv-co-chat-text"] = t.text; v["--tv-co-chat-muted"] = veil(t.text, 0.72); }
  if (t.font && CHAT_FONTS[t.font]?.css) v["--tv-co-chat-font"] = CHAT_FONTS[t.font].css;
  if (t.fontSize) v["--tv-co-chat-size"] = `${t.fontSize}px`;
  if (t.bubble) v["--tv-co-bubble"] = t.bubble;
  if (t.bubbleMine) v["--tv-co-bubble-mine"] = t.bubbleMine;
  if (t.accent) v["--tv-co-accent"] = t.accent;
  if (t.background) v["--tv-co-chat-bg"] = t.background;
  return v as CSSProperties;
}
export function chatAreaStyle(t: ChatTheme): CSSProperties {
  if (!t.background && !t.image) return {};
  const bg = t.background || "#ffffff";
  if (!t.image) return { background: bg };
  const a = Math.max(0, Math.min(90, t.imageDim)) / 100;
  return {
    backgroundColor: bg,
    backgroundImage: `linear-gradient(${veil(bg, a)}, ${veil(bg, a)}), url("${t.image}")`,
    backgroundSize: "100% 100%, cover", backgroundPosition: "center", backgroundRepeat: "no-repeat",
  };
}

// What the voice assistant can do on the site, registered by the parts of the site that do it:
// the page (every Quick search / Ctrl+K function, replay controls, date ranges, layouts, pages,
// settings tabs…), the drawing layer (undo, lock / hide / remove drawings, magnet, tools). The
// AI gets the ids (they name themselves: "replay-play", "settings-canvas", "page-analytics") and
// answers with {"type": "command", "id": …}; lib/voice/assistant runs it. A command with
// `confirm` waits for the trader's yes first (it returns the question, or null to just run).
// New features register here, so the assistant can always drive the whole site.

export type VoiceCommand = { id: string; run: () => void | Promise<void>; confirm?: () => string | null };

const sources = new Map<string, VoiceCommand[]>();
export function registerVoiceCommands(source: string, commands: VoiceCommand[] | null) {
  if (commands) sources.set(source, commands); else sources.delete(source);
}
export function voiceCommands(): VoiceCommand[] {
  const seen = new Set<string>();
  const out: VoiceCommand[] = [];
  sources.forEach(list => list.forEach(c => { if (!seen.has(c.id)) { seen.add(c.id); out.push(c); } }));
  return out;
}
export const voiceCommand = (id: string) => voiceCommands().find(c => c.id === id) ?? null;

// Functions with inputs ("watchlist_add(symbol, list?)"): the AI gets their signatures and
// answers {"type": "call", "fn": …, "args": {…}}. `run` returns what to say (or throws an Error
// whose message is said: a question when it needs to know more). `confirm` returns the yes / no
// question to ask first, or null.
export type VoiceArgs = Record<string, string | number | boolean | undefined>;
export type VoiceFunction = {
  name: string;
  signature: string;          // what the AI sees: "watchlist_add(symbol, list?) adds a symbol to a watchlist"
  run: (args: VoiceArgs) => Promise<string | void> | string | void;
  confirm?: (args: VoiceArgs) => Promise<string | null> | string | null;
};
const fnSources = new Map<string, VoiceFunction[]>();
export function registerVoiceFunctions(source: string, fns: VoiceFunction[] | null) {
  if (fns) fnSources.set(source, fns); else fnSources.delete(source);
}
export function voiceFunctions(): VoiceFunction[] {
  const seen = new Set<string>();
  const out: VoiceFunction[] = [];
  fnSources.forEach(list => list.forEach(f => { if (!seen.has(f.name)) { seen.add(f.name); out.push(f); } }));
  return out;
}
export const voiceFunction = (name: string) => voiceFunctions().find(f => f.name === name) ?? null;
// A question back to the trader from a function (said, and their answer goes to the AI)
export class VoiceQuestion extends Error {}

// Things the assistant reads from the site (the chart's indicators, the open collab…)
const context = new Map<string, () => unknown>();
export function setVoiceContext(key: string, get: (() => unknown) | null) { if (get) context.set(key, get); else context.delete(key); }
export function voiceContext<T>(key: string): T | null {
  try { return (context.get(key)?.() as T) ?? null; } catch { return null; }
}

// Picks a drawing tool (the drawing layer registers it)
let toolPicker: ((type: string) => void) | null = null;
export function registerToolPicker(pick: ((type: string) => void) | null) { toolPicker = pick; }
export function pickTool(type: string): boolean { if (!toolPicker) return false; toolPicker(type); return true; }

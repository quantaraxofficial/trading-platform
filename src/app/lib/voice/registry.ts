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

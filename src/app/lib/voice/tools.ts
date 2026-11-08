// Drawing tools, emoji and colours by what they're called, for the voice assistant ("pick the fib
// retracement tool", "put a smile emoji in the middle", "a red rectangle")

import { DRAWING_TOOLS } from "../../components/drawing/toolCatalog";

// A tool by what it was called: its name, then its keywords, then the most words in common
export function findTool(name: string): { type: string; label: string } | null {
  const n = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(tool|drawing|shape|the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return null;
  const tools = DRAWING_TOOLS.map(t => ({ type: String(t.type), label: t.label, words: [t.label, ...(t.keywords || [])].join(" ").toLowerCase() }));
  const exact = tools.find(t => t.label.toLowerCase() === n);
  if (exact) return exact;
  const inLabel = tools.find(t => t.label.toLowerCase().includes(n));
  if (inLabel) return inLabel;
  const want = n.split(" ");
  let best: (typeof tools)[number] | null = null, score = 0;
  for (const t of tools) {
    const s = want.filter(w => t.words.includes(w)).length;
    if (s > score) { best = t; score = s; }
  }
  return score > 0 ? best : null;
}

const EMOJI: Record<string, string> = {
  smile: "😀", smiley: "😊", happy: "😊", grin: "😁", laugh: "😂", wink: "😉", cool: "😎", love: "😍", sad: "😢", cry: "😭", angry: "😠",
  thinking: "🤔", shocked: "😮", wow: "😮", party: "🎉", celebrate: "🎉", heart: "❤️", fire: "🔥", rocket: "🚀", moon: "🌙", star: "⭐",
  "thumbs up": "👍", "thumbs down": "👎", clap: "👏", ok: "👌", check: "✅", tick: "✅", cross: "❌", warning: "⚠️", eyes: "👀",
  target: "🎯", money: "💰", dollar: "💵", gem: "💎", diamond: "💎", crown: "👑", bull: "🐂", bear: "🐻", "chart up": "📈",
  "chart down": "📉", bell: "🔔", clock: "⏰", lightning: "⚡", skull: "💀", trophy: "🏆", flag: "🚩", pin: "📍", up: "⬆️", down: "⬇️",
};
// (built at run time: the project compiles for an older target that rejects the u flag)
const PICTOGRAPH = new RegExp("\\p{Extended_Pictographic}", "u");
// An emoji: the character itself, or its name ("smile", "thumbs up"); null when neither
export function emojiOf(said: string): string | null {
  const s = said.trim();
  if (!s) return null;
  if (PICTOGRAPH.test(s)) return Array.from(s).filter(ch => PICTOGRAPH.test(ch) || /[‍️]/.test(ch)).join("") || null;
  const n = s.toLowerCase().replace(/\b(emoji|face|icon|the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
  return EMOJI[n] ?? EMOJI[n.replace(/s$/, "")] ?? Object.entries(EMOJI).find(([k]) => n.includes(k))?.[1] ?? null;
}

const COLORS: Record<string, string> = {
  red: "#f23645", green: "#089981", blue: "#2962ff", white: "#ffffff", black: "#000000", yellow: "#ffeb3b", orange: "#ff9800",
  purple: "#9c27b0", gray: "#787b86", grey: "#787b86", teal: "#00bcd4", pink: "#e91e63", brown: "#795548", gold: "#f7b500",
};
export function colorOf(said: string): string | null {
  const s = said.trim().toLowerCase();
  return COLORS[s] ?? (/^#[0-9a-f]{6}$/.test(s) ? s : null);
}

// The actions the voice assistant can carry out. Understanding what was said is the AI's job (the
// server's core/voice.py, Groq or Gemini): it answers with a spoken reply and up to three of these
// actions, already checked against the same lists on the server. lib/voice/assistant does them.

export type Interval = { value: string; label: string; spoken: string };
export type PanelId = "watchlist" | "alerts" | "object_tree" | "collab" | "chats" | "notifications" | "backtest_sessions";
// (every SMC / ICT and price-action concept the chart can mark: lib/analysis/concepts)
export type { MarkKind } from "../analysis/concepts";
import type { MarkKind } from "../analysis/concepts";
export type LengthUnit = "hours" | "days" | "weeks" | "months" | "years";

export type Intent =
  | { kind: "symbol"; symbol: string; interval?: Interval }
  | { kind: "interval"; interval: Interval }
  | { kind: "pine"; open: boolean }
  | { kind: "backtest_new"; symbol?: string; interval?: Interval; start?: string; balance?: number; length?: { value: number; unit: LengthUnit } }
  | { kind: "mark"; what: MarkKind[] }
  | { kind: "clear_marks"; what?: MarkKind[] }
  | { kind: "indicator"; name: string; remove?: boolean }
  | { kind: "chart_type"; type: string; label: string }
  | { kind: "replay"; date?: string; random?: boolean }
  | { kind: "alert"; price?: number }
  | { kind: "theme"; id: string; base: "light" | "dark"; label: string }
  | { kind: "snapshot"; copy?: boolean }
  | { kind: "reset_view" }
  | { kind: "panel"; panel: PanelId; label: string }
  | { kind: "price" }
  | { kind: "stop" }
  // any of the site's registered controls (lib/voice/registry: Quick search's functions, replay,
  // date ranges, layouts, settings tabs, pages, drawings…)
  | { kind: "command"; id: string }
  // a drawing tool, by name ("trend line", "fib retracement"): matched to the tool catalog
  | { kind: "drawing_tool"; name: string }
  // collabs: start one (asked for a name and who to invite first, or the defaults), invite people
  // to the open one, copy its link
  | { kind: "collab_start"; name?: string; invite?: Invitee[]; allowRequests?: boolean; allowVoice?: boolean }
  | { kind: "collab_invite"; invite: Invitee[] }
  | { kind: "collab_link" }
  // a function with inputs (lib/voice/registry: chats, alerts, watchlists, settings, Pine, orders…)
  | { kind: "call"; fn: string; args: Record<string, string | number | boolean> };

export type Invitee = { who: string; role: "editor" | "viewer" };

// The chart's timeframes, as values ("15min"), toolbar labels ("15m") and spoken names
const INTERVALS: Interval[] = [
  { value: "1min", label: "1m", spoken: "1 minute" }, { value: "5min", label: "5m", spoken: "5 minute" },
  { value: "15min", label: "15m", spoken: "15 minute" }, { value: "30min", label: "30m", spoken: "30 minute" },
  { value: "45min", label: "45m", spoken: "45 minute" }, { value: "1h", label: "1h", spoken: "1 hour" },
  { value: "2h", label: "2h", spoken: "2 hour" }, { value: "4h", label: "4h", spoken: "4 hour" },
  { value: "1day", label: "D", spoken: "daily" }, { value: "1week", label: "W", spoken: "weekly" }, { value: "1month", label: "M", spoken: "monthly" },
];
export const intervalByValue = (v: string | undefined): Interval | undefined => INTERVALS.find(i => i.value === v);

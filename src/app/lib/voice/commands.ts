// The actions the voice assistant can carry out. Understanding what was said is the AI's job (the
// server's core/voice.py, Groq or Gemini): it answers with a spoken reply and up to three of these
// actions, already checked against the same lists on the server. lib/voice/assistant does them.

export type Interval = { value: string; label: string; spoken: string };
export type PanelId = "watchlist" | "alerts" | "object_tree" | "collab" | "chats" | "notifications" | "backtest_sessions";
export type MarkKind = "order_blocks" | "fvg" | "ifvg" | "support_resistance";
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
  | { kind: "stop" };

// The chart's timeframes, as values ("15min"), toolbar labels ("15m") and spoken names
const INTERVALS: Interval[] = [
  { value: "1min", label: "1m", spoken: "1 minute" }, { value: "5min", label: "5m", spoken: "5 minute" },
  { value: "15min", label: "15m", spoken: "15 minute" }, { value: "30min", label: "30m", spoken: "30 minute" },
  { value: "45min", label: "45m", spoken: "45 minute" }, { value: "1h", label: "1h", spoken: "1 hour" },
  { value: "2h", label: "2h", spoken: "2 hour" }, { value: "4h", label: "4h", spoken: "4 hour" },
  { value: "1day", label: "D", spoken: "daily" }, { value: "1week", label: "W", spoken: "weekly" }, { value: "1month", label: "M", spoken: "monthly" },
];
export const intervalByValue = (v: string | undefined): Interval | undefined => INTERVALS.find(i => i.value === v);

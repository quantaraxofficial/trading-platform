// The voice assistant's commands (phase 1: plain rules, no AI): what was said → what to do.
// Speech-to-text writes the same thing many ways ("xauusd", "x a u u s d", "zau usd", "gold"),
// so a symbol is matched by name, by nickname, by letters, by the watchlists' symbols, and
// last of all through the data provider's symbol search.

export type Intent =
  | { kind: "symbol"; query: string; interval?: Interval }
  | { kind: "interval"; interval: Interval }
  | { kind: "pine"; open: boolean }
  | { kind: "backtest_new" }
  | { kind: "panel"; panel: PanelId; label: string }
  | { kind: "price" }
  | { kind: "greeting" }
  | { kind: "thanks" }
  | { kind: "help" }
  | { kind: "stop" }
  | { kind: "unknown" };

export type Interval = { value: string; label: string; spoken: string };
export type PanelId = "watchlist" | "alerts" | "object_tree" | "collab" | "chats" | "notifications" | "backtest_sessions";

// ---- words → numbers ("fifteen minute", "four hour") ---------------------------------------
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twelve: 12, fifteen: 15, twenty: 20, thirty: 30, "forty five": 45, "forty-five": 45, fortyfive: 45, sixty: 60, a: 1, an: 1,
};
function wordsToNumbers(t: string) {
  return t
    .replace(/\bforty[\s-]?five\b/g, "45")
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|sixty)\b(?=\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|day|days|week|weeks|month|months)\b)/g, w => String(NUMBER_WORDS[w]))
    .replace(/\b(an?|for)\b(?=\s*(minute|hour|day|week|month)\b)/g, w => String(NUMBER_WORDS[w]));
}

// ---- timeframes -----------------------------------------------------------------------------
const MINUTES: Record<number, Interval> = {
  1: { value: "1min", label: "1m", spoken: "1 minute" }, 5: { value: "5min", label: "5m", spoken: "5 minute" },
  15: { value: "15min", label: "15m", spoken: "15 minute" }, 30: { value: "30min", label: "30m", spoken: "30 minute" },
  45: { value: "45min", label: "45m", spoken: "45 minute" },
};
const HOURS: Record<number, Interval> = {
  1: { value: "1h", label: "1h", spoken: "1 hour" }, 2: { value: "2h", label: "2h", spoken: "2 hour" }, 4: { value: "4h", label: "4h", spoken: "4 hour" },
};
const DAY: Interval = { value: "1day", label: "D", spoken: "daily" };
const WEEK: Interval = { value: "1week", label: "W", spoken: "weekly" };
const MONTH: Interval = { value: "1month", label: "M", spoken: "monthly" };

export function findInterval(t: string): Interval | null {
  if (/\b(daily|1 day|one day|day chart|d1)\b/.test(t)) return DAY;
  if (/\b(weekly|1 week|week chart|w1)\b/.test(t)) return WEEK;
  if (/\b(monthly|1 month|month chart)\b/.test(t)) return MONTH;
  let m = /\b(\d+)\s*(m|min|mins|minute|minutes)\b/.exec(t) || /\bm(\d+)\b/.exec(t);
  if (m && MINUTES[+m[1]]) return MINUTES[+m[1]];
  if (m && +m[1] === 60) return HOURS[1];
  m = /\b(\d+)\s*(h|hr|hrs|hour|hours)\b/.exec(t) || /\bh(\d+)\b/.exec(t);
  if (m && HOURS[+m[1]]) return HOURS[+m[1]];
  if (/\bhourly\b/.test(t)) return HOURS[1];
  return null;
}

// ---- symbols --------------------------------------------------------------------------------
// Names and nicknames people say → the app's symbols (forex and metals as "XAU/USD")
const ALIASES: [RegExp, string][] = [
  [/\bgold\b/, "XAU/USD"], [/\bsilver\b/, "XAG/USD"],
  [/\bbitcoin\b|\bbtc\b/, "BTC/USD"], [/\bethereum\b|\bether\b/, "ETH/USD"],
  [/\beuro\s*(us\s*)?dollar\b|\beuro\s*usd\b|\bfiber\b|\bfibre\b/, "EUR/USD"],
  [/\b(british\s*)?pound\s*(us\s*)?dollar\b|\bcable\b|\bpound\s*usd\b|\bsterling\b/, "GBP/USD"],
  [/\bdollar\s*yen\b|\busd\s*yen\b/, "USD/JPY"], [/\beuro\s*yen\b/, "EUR/JPY"], [/\bpound\s*yen\b|\bgopher\b/, "GBP/JPY"],
  [/\baussie(\s*dollar)?\b|\baud\s*usd\b/, "AUD/USD"], [/\bkiwi\b/, "NZD/USD"],
  [/\bloonie\b|\bdollar\s*cad\b|\bdollar\s*canada\b/, "USD/CAD"], [/\bswissy\b|\bdollar\s*franc\b/, "USD/CHF"],
  [/\bapple\b/, "AAPL"], [/\btesla\b/, "TSLA"], [/\bnvidia\b/, "NVDA"], [/\bmicrosoft\b/, "MSFT"],
  [/\bamazon\b/, "AMZN"], [/\bgoogle\b|\balphabet\b/, "GOOGL"], [/\bnetflix\b/, "NFLX"], [/\bmeta\b|\bfacebook\b/, "META"],
  [/\bs\s*(and|&|n)\s*p(\s*500)?\b|\bspy\b/, "SPY"], [/\bnasdaq\b/, "NQ"],
];
const CODES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "XAU", "XAG", "BTC", "ETH", "SGD", "HKD", "INR", "CNH", "ZAR", "MXN", "TRY", "SEK", "NOK"];
// Codes speech-to-text often mishears ("zau usd" for "xau usd")
const MISHEARD: Record<string, string> = { ZAU: "XAU", SAU: "XAU", SHAU: "XAU", ZAG: "XAG", URO: "EUR", YOUR: "EUR", GPB: "GBP", OSD: "USD", USB: "USD" };

// Spelled-out or run-together codes ("x a u u s d", "xau usd", "eurusd") → "XAU/USD"
export function lettersToPair(phrase: string): string | null {
  const words = phrase.toUpperCase().split(/\s+/).filter(Boolean).map(w => MISHEARD[w.replace(/[^A-Z]/g, "")] ?? w);
  const letters = words.join("").replace(/[^A-Z]/g, "");
  if (letters.length === 6) {
    const a = letters.slice(0, 3), b = letters.slice(3);
    if (CODES.includes(a) && CODES.includes(b) && a !== b) return `${a}/${b}`;
  }
  return null;
}

// Words that only frame the request ("open the gold chart please")
const FILLER = /\b(please|can you|could you|would you|i want to|i'd like to|let'?s|hey|ok(ay)?|assistant|open|opened|show|show me|bring up|pull up|load|go to|switch( to)?|change( the)?( symbol)?( to)?|chart|charts|graph|the|me|on|to|of|for|symbol|ticker|instrument|timeframe|time frame|interval|now)\b/g;
// "a" / "an" are dropped, except among spelled-out letters ("x a u u s d")
const ARTICLE = /\b(a|an)\b/g;
const SPELLED = /(^|\s)[a-z](\s+[a-z]){2,}(\s|$)/;

export function symbolPhrase(t: string): string {
  let p = t.replace(FILLER, " ");
  if (!SPELLED.test(p)) p = p.replace(ARTICLE, " ");
  return p.replace(/\s+/g, " ").trim();
}

export function aliasSymbol(t: string): string | null {
  for (const [re, sym] of ALIASES) if (re.test(t)) return sym;
  return null;
}

// ---- the parser -----------------------------------------------------------------------------
const PANELS: [RegExp, PanelId, string][] = [
  [/\bwatch\s*list\b/, "watchlist", "watchlist"],
  [/\balerts?\b/, "alerts", "alerts"],
  [/\bobject\s*tree\b/, "object_tree", "object tree"],
  [/\bcollabs?\b|\bcollaboration\b/, "collab", "collabs"],
  [/\bchats?\b|\bmessages\b/, "chats", "chats"],
  [/\bnotifications?\b/, "notifications", "notifications"],
  [/\b(backtest(ing)?|back test(ing)?)\s*sessions\b|\bmy\s*(backtest(ing)?|back test(ing)?)/, "backtest_sessions", "backtest sessions"],
];

export function parseCommand(raw: string): Intent {
  const t = wordsToNumbers(raw.toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim());
  if (!t) return { kind: "unknown" };

  if (/^(stop|stop listening|mute|go to sleep|that'?s all|goodbye|bye)$/.test(t) || /\bstop listening\b/.test(t)) return { kind: "stop" };
  if (/\b(what can you do|help|commands|what do you do)\b/.test(t)) return { kind: "help" };
  if (/^(thanks|thank you|thank u|cheers|great|nice|perfect)\b/.test(t)) return { kind: "thanks" };
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|namaste|yo)\b/.test(t) && t.split(" ").length <= 4) return { kind: "greeting" };

  // Pine Editor
  if (/\b(pine|pain|pine script|script)\s*(editor)?\b/.test(t) && /\b(editor|pine|script)\b/.test(t)) {
    if (/\b(close|hide|exit|shut)\b/.test(t)) return { kind: "pine", open: false };
    if (/\b(open|show|start|launch|bring|pull)\b/.test(t) || /^(pine|pine editor|pine script)$/.test(t)) return { kind: "pine", open: true };
  }

  // A new backtest session ("create a backtesting session", "new back test session")
  if (/\b(create|new|start|make|begin|add)\b.*\b(backtest(ing)?|back\s*test(ing)?)\b/.test(t) || /\b(backtest(ing)?|back\s*test(ing)?)\b.*\b(create|new)\b/.test(t)) {
    return { kind: "backtest_new" };
  }

  // Panels on the right
  if (/\b(open|show|go to|switch to)\b/.test(t) || PANELS.some(([re]) => new RegExp(`^${re.source}$`).test(t))) {
    for (const [re, panel, label] of PANELS) if (re.test(t)) return { kind: "panel", panel, label };
  }

  if (/\b(price|quote|trading at|how much is|where is)\b/.test(t) && !/\balert\b/.test(t)) {
    // "what's the price of gold" asks about another symbol: open it first
    const sym = aliasSymbol(t) ?? lettersToPair(symbolPhrase(t.replace(/\b(what'?s|what is|price|quote|current|trading at|how much is|where is)\b/g, " ")));
    if (sym) return { kind: "symbol", query: sym };
    return { kind: "price" };
  }

  const interval = findInterval(t);
  // Strip the timeframe words before looking for a symbol
  const rest = t
    .replace(/\b(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|day|days|week|weeks|month|months)\b/g, " ")
    .replace(/\b(daily|weekly|monthly|hourly)\b/g, " ");
  const phrase = symbolPhrase(rest);
  if (phrase && /\b(open|show|load|switch|change|go|bring|pull)\b/.test(t)) return { kind: "symbol", query: phrase, interval: interval ?? undefined };
  if (interval) return { kind: "interval", interval };
  // A bare name or code ("gold", "eurusd", "x a u u s d")
  if (phrase && (aliasSymbol(phrase) || lettersToPair(phrase))) return { kind: "symbol", query: phrase };
  return { kind: "unknown" };
}

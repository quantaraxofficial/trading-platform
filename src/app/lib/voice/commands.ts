// The voice assistant's commands (plain rules, no AI): what was said → what to do. What these
// don't understand goes to the AI (core/voice.py), which answers with the same intents.
// Speech-to-text writes the same thing many ways ("xauusd", "x a u u s d", "zau usd", "gold"),
// so a symbol is matched by name, by nickname, by letters, by the watchlists' symbols, and
// last of all through the data provider's symbol search.

export type Intent =
  | { kind: "symbol"; query: string; interval?: Interval; exact?: boolean }   // exact: already the app's symbol (from the AI)
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
  | { kind: "greeting" }
  | { kind: "thanks" }
  | { kind: "help" }
  | { kind: "stop" }
  | { kind: "unknown" };

export type Interval = { value: string; label: string; spoken: string };
export type PanelId = "watchlist" | "alerts" | "object_tree" | "collab" | "chats" | "notifications" | "backtest_sessions";
export type MarkKind = "order_blocks" | "fvg" | "ifvg" | "support_resistance";
export type LengthUnit = "hours" | "days" | "weeks" | "months" | "years";

// ---- what can be marked, added, switched to ------------------------------------------------
// (checked in order: "inverse fvg" before "fvg")
const MARKS: [RegExp, MarkKind][] = [
  [/\border\s*blocks?\b|\bobs\b|\bo\s*b\s*s?\b/, "order_blocks"],
  [/\bi\s*-?\s*fvgs?\b|\bi\s*f\s*v\s*g\b|\binver(se|sion|ted)\s*(fair\s*value\s*gaps?|fvgs?)\b/, "ifvg"],
  [/\bfvgs?\b|\bf\s*v\s*g\b|\bfair\s*value\s*gaps?\b|\bimbalances?\b/, "fvg"],
  [/\bsupports?\b|\bresistances?\b|\bs\s*(and|&|n|\/)\s*r\b|\bkey\s*levels\b|\bsr\s*levels\b/, "support_resistance"],
];
export function marksIn(t: string): MarkKind[] {
  const out: MarkKind[] = [];
  let rest = t;
  for (const [re, kind] of MARKS) if (re.test(rest)) { out.push(kind); rest = rest.replace(re, " "); }
  return out;
}

// Spoken names → the chart's indicators (as listed in the Indicators dialog)
export const INDICATORS: [RegExp, string][] = [
  [/\brsi\b|\brelative\s*strength(\s*index)?\b/, "Relative Strength Index"],
  [/\bmacd\b|\bmac\s*d\b/, "MACD"],
  [/\batr\b|\baverage\s*true\s*range\b/, "Average True Range"],
  [/\bema\b|\bexponential(\s*moving\s*average)?\b/, "Moving Average Exponential"],
  [/\bsma\b|\bsimple\s*moving\s*average\b|\bmoving\s*average\b/, "Moving Average Simple"],
  [/\bvwap\b|\bvolume\s*weighted(\s*average\s*price)?\b/, "Volume Weighted Average Price"],
  [/\bichimoku\b/, "Ichimoku Cloud"],
  [/\bpivots?(\s*points?)?\b/, "Pivot Points Standard"],
  [/\bvolume\s*profile\b|\bvpvr\b/, "Volume Profile Visible Range"],
  [/\bdonchian\b/, "Donchian Channels"],
  [/\bmomentum\b/, "Momentum"],
  [/\bwilliams(\s*%?\s*r)?\b/, "Williams %R"],
  [/\bawesome\s*oscillator\b|\bao\b/, "Awesome Oscillator"],
  [/\bbull\s*bear\s*power\b/, "Bull Bear Power"],
  [/\brate\s*of\s*change\b|\broc\b/, "Rate Of Change"],
  [/\bprice\s*channel\b/, "Price Channel"],
  [/\basian\s*(session|range)\b|\bfxn\b/, "FXN - Asian Session Range"],
  [/\bvolume\b/, "Volume"],
];
export const indicatorIn = (t: string) => INDICATORS.find(([re]) => re.test(t))?.[1] ?? null;
export const INDICATOR_NAMES = Array.from(new Set(INDICATORS.map(([, n]) => n)));

export const CHART_TYPES: [RegExp, string, string][] = [
  [/\bheik[ie]n\s*ash[iy]\b|\bha\s*candles\b/, "ha", "Heikin Ashi"],
  [/\bhollow\s*candles?\b/, "hollowCandle", "hollow candles"],
  [/\bvolume\s*candles?\b/, "volCandles", "volume candles"],
  [/\bcandles?(tick)?s?\b|\bcandlesticks?\b|\bcandle\s*chart\b/, "candle", "candles"],
  [/\bline\s*with\s*markers\b/, "lineWithMarkers", "line with markers"],
  [/\bstep\s*line\b/, "stepline", "step line"],
  [/\bline\s*break\b/, "pb", "line break"],
  [/\bline\s*(chart|graph)\b|\bline\b/, "line", "line"],
  [/\bhlc\s*area\b/, "hlcArea", "HLC area"],
  [/\barea\b/, "area", "area"],
  [/\bbaseline\b/, "baseline", "baseline"],
  [/\bcolumns?\b/, "column", "columns"],
  [/\bhigh\s*low\b/, "hilo", "high-low"],
  [/\brenko\b/, "renko", "Renko"],
  [/\bkagi\b/, "kagi", "Kagi"],
  [/\bpoint\s*(and|&|n)\s*figure\b|\bp\s*(and|&|n)\s*f\b/, "pnf", "point and figure"],
  [/\brange\s*(bars|chart)\b/, "range", "range"],
  [/\bbars?\s*(chart|graph)?\b|\bohlc\b/, "bar", "bars"],
];

export const THEMES: [RegExp, string, "light" | "dark", string][] = [
  [/\bmidnight\b/, "midnight", "dark", "Midnight"], [/\bocean\b/, "ocean", "dark", "Ocean"], [/\bforest\b/, "forest", "dark", "Forest"],
  [/\bsunset\b/, "sunset", "dark", "Sunset"], [/\bgraphite\b|\bmonochrome\b/, "graphite", "dark", "Graphite"],
  [/\bhigh\s*contrast\b/, "contrast", "dark", "High contrast"], [/\bsepia\b/, "sepia", "light", "Sepia"], [/\barctic\b/, "arctic", "light", "Arctic"],
  [/\b(classic\s*)?dark\b|\bnight\s*mode\b/, "classic", "dark", "Classic dark"], [/\b(classic\s*)?light\b|\bday\s*mode\b/, "classic", "light", "Classic light"],
];

// ---- dates ("1 march 2024", "march 1st 2024", "2024-03-01", "1/3/2024", "january 2024") ---------
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
export const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const monthOf = (m: string) => MONTHS.findIndex(x => x.startsWith(m.slice(0, 3))) + 1;
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};
export function parseDate(t: string, now = new Date()): string | null {
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(t);          // day / month / year
  if (m) return iso(+m[3], +m[2], +m[1]);
  // (without a year: this year, or last year when that day hasn't come yet)
  const yearFor = (mo: number, d: number, y?: string) => {
    if (y) return +y;
    const cur = now.getUTCFullYear();
    return Date.UTC(cur, mo - 1, d) > now.getTime() ? cur - 1 : cur;
  };
  m = new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?" + MONTH_RE + "\\b(?:,?\\s+(\\d{4}))?").exec(t);
  if (m) { const mo = monthOf(m[2]); return iso(yearFor(mo, +m[1], m[3]), mo, +m[1]); }
  m = new RegExp("\\b" + MONTH_RE + "\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?").exec(t);
  if (m) { const mo = monthOf(m[1]); return iso(yearFor(mo, +m[2], m[3]), mo, +m[2]); }
  m = new RegExp("\\b" + MONTH_RE + "\\s+(\\d{4})\\b").exec(t);
  if (m) return iso(+m[2], monthOf(m[1]), 1);
  return null;
}

// An amount ("10000", "10,000", "10k", "ten thousand", "$5,000")
export function parseAmount(t: string): number | null {
  const m = /\$?\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|thousand|lakh|lac|m|million)?\b/.exec(t);
  if (!m) {
    const w = /\b(one|two|three|five|ten|twenty|fifty|hundred)\s+(thousand|lakh|million)\b/.exec(t);
    if (!w) return null;
    const n: Record<string, number> = { one: 1, two: 2, three: 3, five: 5, ten: 10, twenty: 20, fifty: 50, hundred: 100 };
    const mult: Record<string, number> = { thousand: 1e3, lakh: 1e5, million: 1e6 };
    return n[w[1]] * mult[w[2]];
  }
  const base = parseFloat(m[1].replace(/,/g, ""));
  const mult: Record<string, number> = { k: 1e3, thousand: 1e3, lakh: 1e5, lac: 1e5, m: 1e6, million: 1e6 };
  return base * (m[2] ? mult[m[2]] : 1);
}

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

// An interval by its value ("15min" → 15 minute), for actions the AI sends back
export function intervalByValue(v: string | undefined): Interval | undefined {
  return [...Object.values(MINUTES), ...Object.values(HOURS), DAY, WEEK, MONTH].find(i => i.value === v);
}

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
  // (punctuation goes, except inside numbers: "2,650", "1.0850", "2024-03-01", "1/3/2024")
  const t = wordsToNumbers(raw.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/[,!?]|\.(?!\d)/g, " ").replace(/\s+/g, " ").trim());
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

  // A new backtest session ("create a backtesting session on gold 15 minute from 1 march 2024
  // with 10k"): whatever is said of symbol, timeframe, start date, balance and length is used
  if (/\b(create|new|start|make|begin|add|set up)\b.*\b(backtest(ing)?|back\s*test(ing)?)\b/.test(t) || /\b(backtest(ing)?|back\s*test(ing)?)\b.*\b(create|new)\b/.test(t)) {
    const start = parseDate(t) ?? undefined;
    const AMT = "(\\$?[\\d,.]+\\s*(?:k|thousand|lakh|million)?)";
    // ("balance 5000" first: "2024-01-15 balance" mustn't read as 15)
    const balM = new RegExp("\\b(?:balance|capital|account|equity)\\s*(?:of\\s*)?" + AMT).exec(t)
      ?? new RegExp(AMT + "\\s*(?:dollars?|usd|balance|capital|account|equity)\\b").exec(t)
      ?? new RegExp("\\bwith\\s+" + AMT).exec(t);
    const balance = balM ? parseAmount(balM[1]) ?? undefined : undefined;
    const lenM = /\bfor\s+(\d+)\s*(hours?|days?|weeks?|months?|years?)\b/.exec(t);
    const length = lenM ? { value: +lenM[1], unit: (lenM[2].endsWith("s") ? lenM[2] : lenM[2] + "s") as LengthUnit } : undefined;
    // the symbol: what's left once everything else is taken out
    const rest = t
      .replace(/\bfor\s+\d+\s*(hours?|days?|weeks?|months?|years?)\b/g, " ")
      .replace(new RegExp("\\b(\\d{1,2}(st|nd|rd|th)?\\s+)?(of\\s+)?" + MONTH_RE + "(\\s+\\d{1,2}(st|nd|rd|th)?)?(,?\\s+\\d{4})?\\b", "g"), " ")
      .replace(/\b\d+\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b/g, " ")
      .replace(/\b(daily|weekly|monthly|hourly)\b/g, " ")
      .replace(/\$?[\d,./-]+\s*(k|thousand|lakh|million)?/g, " ")
      .replace(/\b(create|new|start|make|begin|add|set up|a|an|the|backtest(ing)?|back\s*test(ing)?|sessions?|from|starting|since|on|for|with|of|at|balance|capital|account|equity|dollars?|usd|chart|timeframe|please)\b/g, " ");
    const phrase = symbolPhrase(rest);
    const symbol = aliasSymbol(t) ?? (phrase ? lettersToPair(phrase) ?? (phrase.length <= 12 && /^[a-z]+$/.test(phrase) ? phrase : null) : null) ?? undefined;
    return { kind: "backtest_new", symbol, interval: findInterval(t) ?? undefined, start, balance, length };
  }

  // Marks on the chart ("mark order blocks", "draw support and resistance", "show me the fvgs and
  // ifvgs"), or taking them off ("clear the order blocks", "remove the marks")
  const marks = marksIn(t);
  if (/\b(clear|remove|delete|erase|hide|wipe|get rid of)\b/.test(t) && (marks.length || /\b(marks?|markings?|zones|levels|everything you (drew|marked))\b/.test(t))) {
    return { kind: "clear_marks", what: marks.length ? marks : undefined };
  }
  if (marks.length && /\b(mark|draw|show|find|highlight|plot|detect|identify|spot|add|display|where are|any)\b/.test(t)) return { kind: "mark", what: marks };

  // Indicators ("add rsi", "put a macd on", "remove the volume")
  const ind = indicatorIn(t);
  if (ind && /\b(remove|delete|hide|take off|get rid of)\b/.test(t)) return { kind: "indicator", name: ind, remove: true };
  if (ind && /\b(add|put|apply|show|load|insert|plot|open)\b/.test(t)) return { kind: "indicator", name: ind };

  // Chart type ("switch to heikin ashi", "line chart", "show candles")
  if (/\b(chart\s*type|switch|change|show|use|make it|set|turn)\b/.test(t) || /\bchart\b/.test(t)) {
    const ct = CHART_TYPES.find(([re]) => re.test(t));
    if (ct && !findInterval(t) && !aliasSymbol(t)) return { kind: "chart_type", type: ct[1], label: ct[2] };
  }

  // Site theme ("switch to the midnight theme", "dark mode")
  if (/\b(theme|mode|colou?rs?)\b/.test(t)) {
    const th = THEMES.find(([re]) => re.test(t));
    if (th) return { kind: "theme", id: th[1], base: th[2], label: th[3] };
  }

  // Bar replay ("start replay from 1 march 2024", "replay a random date")
  if (/\b(replay|bar replay|rewind)\b/.test(t) && !/\b(stop|exit|end|close|quit)\b/.test(t)) {
    return { kind: "replay", date: parseDate(t) ?? undefined, random: /\brandom\b/.test(t) };
  }

  // An alert at a price ("set an alert at 2650", "alert me when it hits 1.0850")
  if (/\balert\b/.test(t) && /\b(set|create|add|make|new|alert me|notify)\b/.test(t)) {
    const p = /\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\b/.exec(t);
    return { kind: "alert", price: p ? parseFloat(p[1].replace(/,/g, "")) : undefined };
  }

  // The chart image, and the view
  if (/\b(screenshot|snapshot|chart image|picture of the chart|capture the chart)\b/.test(t)) return { kind: "snapshot", copy: /\b(copy|clipboard)\b/.test(t) };
  if (/\b(reset|fit|restore)\b.*\b(view|chart|zoom|scale)\b/.test(t)) return { kind: "reset_view" };

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

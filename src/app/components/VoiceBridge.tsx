"use client";

// The voice assistant's functions with inputs (lib/voice/registry) that need the site's live state:
// the collab chat, alerts, watchlists, chart settings, layouts, go to a date, writing a Pine
// script, a paper order ticket. Rendered once on the chart page (always mounted, so they're there
// whichever panel is open). Anything sent to other people, deleted or traded asks first.

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAlerts, DEFAULT_NOTIFY, type AlertOperator, type AlertTrigger } from "@/context/AlertsContext";
import { registerVoiceFunctions, VoiceQuestion, type VoiceFunction, type VoiceArgs } from "../lib/voice/registry";
import { collab } from "../lib/collab/session";
import { watchlists, wl, listSymbols, sameSymbol } from "./watchlist/store";
import { chartSettings, FONT_SIZES } from "../lib/chartSettings";
import { layoutStore } from "../lib/layoutStore";
import { openTicket } from "../trading/store";
import { getChartInfo } from "../lib/chartBars";
import { BACKEND } from "../lib/collab/session";
import { sessionKey } from "@/lib/backend";
import { displaySymbol } from "../lib/symbolDisplay";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() && !isNaN(+v.replace(/,/g, "")) ? +v.replace(/,/g, "") : undefined);
const low = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const ask = (q: string): never => { throw new VoiceQuestion(q); };

// Forex, metals and crypto are BASE/QUOTE on the site ("XAUUSD" → "XAU/USD")
const CCY = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "XAU", "XAG", "BTC", "ETH", "SGD", "HKD", "INR", "CNH", "ZAR", "MXN", "TRY", "SEK", "NOK"]);
function siteSymbol(s: string): string {
  const u = s.toUpperCase().replace(/\s+/g, "");
  return u.length === 6 && !u.includes("/") && CCY.has(u.slice(0, 3)) && CCY.has(u.slice(3)) ? `${u.slice(0, 3)}/${u.slice(3)}` : u;
}

// One of several things by what it's called: exact, then starting with, then containing. Several
// equally good matches: a question
function pickByName<T>(items: T[], name: (t: T) => string, said: string, what: string): T {
  const s = low(said);
  const tiers = [(n: string) => n === s, (n: string) => n.startsWith(s), (n: string) => n.includes(s) || s.includes(n)];
  for (const test of tiers) {
    const hits = items.filter(i => test(low(name(i))));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) ask(`Which ${what}: ${hits.slice(0, 4).map(name).join(", or ")}?`);
  }
  return ask(`I couldn't find a ${what} called ${said}.`);
}

// Chart settings by name: what they set, and the values they take
const COLORS: Record<string, string> = {
  red: "#f23645", green: "#089981", blue: "#2962ff", white: "#ffffff", black: "#000000", yellow: "#ffeb3b", orange: "#ff9800",
  purple: "#9c27b0", gray: "#787b86", grey: "#787b86", teal: "#00bcd4", pink: "#e91e63", navy: "#0b1120", brown: "#795548",
};
const colorOf = (v: unknown) => { const s = low(str(v)); const c = COLORS[s] ?? (/^#[0-9a-f]{6}$/i.test(s) ? s : null); return c ?? ask(`What colour? Say a name like green, or a code like #089981.`); };
const boolOf = (v: unknown) => (typeof v === "boolean" ? v : /^(on|yes|true|show|enable|1)$/i.test(str(v)) ? true : /^(off|no|false|hide|disable|0)$/i.test(str(v)) ? false : ask("On or off?"));
const SETTINGS: Record<string, (v: unknown) => [Record<string, any>, string]> = {
  countdown: v => { const b = boolOf(v); return [{ countdown: b }, `the bar countdown ${b ? "on" : "off"}`]; },
  vertical_grid: v => { const b = boolOf(v); return [{ vertGrid: b }, `vertical grid lines ${b ? "on" : "off"}`]; },
  horizontal_grid: v => { const b = boolOf(v); return [{ horzGrid: b }, `horizontal grid lines ${b ? "on" : "off"}`]; },
  background_color: v => { const c = colorOf(v); return [{ background: c, background2: c, backgroundType: "Solid" }, `the background to ${str(v)}`]; },
  candle_up_color: v => { const c = colorOf(v); const k = chartSettings.get().candle; return [{ candle: { ...k, upColor: c, borderUpColor: c, wickUpColor: c } }, `rising candles to ${str(v)}`]; },
  candle_down_color: v => { const c = colorOf(v); const k = chartSettings.get().candle; return [{ candle: { ...k, downColor: c, borderDownColor: c, wickDownColor: c } }, `falling candles to ${str(v)}`]; },
  scale_font_size: v => { const n = num(v); const f = FONT_SIZES.reduce((a, b) => (Math.abs(b - (n ?? 12)) < Math.abs(a - (n ?? 12)) ? b : a)); return [{ fontSize: f }, `the scales' font size to ${f}`]; },
  symbol_name_label: v => { const b = boolOf(v); return [{ symbolName: b }, `the symbol's name on the price scale ${b ? "on" : "off"}`]; },
  last_price_line: v => { const b = boolOf(v); return [{ symbolLine: b }, `the last price line ${b ? "on" : "off"}`]; },
  previous_close_line: v => { const b = boolOf(v); return [{ prevCloseLine: b, prevCloseValue: b }, `the previous day close line ${b ? "on" : "off"}`]; },
  high_low_lines: v => { const b = boolOf(v); return [{ highLowLine: b, highLowValue: b }, `the high and low lines ${b ? "on" : "off"}`]; },
  bid_ask_lines: v => { const b = boolOf(v); return [{ bidAskLine: b, bidAskValue: b }, `the bid and ask lines ${b ? "on" : "off"}`]; },
  day_of_week: v => { const b = boolOf(v); return [{ dayOfWeek: b }, `the day of the week on the time scale ${b ? "on" : "off"}`]; },
  time_format: v => { const h = /12/.test(str(v)) ? "12-hours" : "24-hours"; return [{ timeFormat: h }, `the clock to ${h === "12-hours" ? "12" : "24"} hours`]; },
  session_breaks: v => { const b = boolOf(v); return [{ sessionBreaks: b }, `session breaks ${b ? "on" : "off"}`]; },
  candle_bodies: v => { const b = boolOf(v); const k = chartSettings.get().candle; return [{ candle: { ...k, bodyVisible: b } }, `candle bodies ${b ? "on" : "off"}`]; },
  candle_borders: v => { const b = boolOf(v); const k = chartSettings.get().candle; return [{ candle: { ...k, borderVisible: b } }, `candle borders ${b ? "on" : "off"}`]; },
  candle_wicks: v => { const b = boolOf(v); const k = chartSettings.get().candle; return [{ candle: { ...k, wickVisible: b } }, `candle wicks ${b ? "on" : "off"}`]; },
  ticker_watermark: v => { const b = boolOf(v); const w = chartSettings.get().watermark; return [{ watermark: { ...w, ticker: b } }, `the ticker watermark ${b ? "on" : "off"}`]; },
};

// Alerts: a condition from what was said, and a new alert as the Create alert dialog makes it
// (once only, a month, its automatic message, the notifications last chosen there)
function conditionOf(v: unknown): AlertOperator | undefined {
  const s = low(str(v));
  if (!s) return undefined;
  if (/cross(ing)? ?up|rise|rises|breaks? above/.test(s)) return "Crossing Up";
  if (/cross(ing)? ?down|fall|falls|drops?|breaks? below/.test(s)) return "Crossing Down";
  if (/greater|above|over|more than/.test(s)) return "Greater Than";
  if (/less|below|under/.test(s)) return "Less Than";
  return "Crossing";
}
function newAlert(a: VoiceArgs) {
  const value = num(a.price) ?? ask("At what price?");
  const symbol = a.symbol ? siteSymbol(str(a.symbol)) : getChartInfo()?.symbol ?? ask("For which symbol?");
  const condition = conditionOf(a.condition) ?? "Crossing";
  const trigger: AlertTrigger = /every/i.test(str(a.trigger)) ? "Every time" : "Once only";
  const days = Math.min(365, Math.max(1, num(a.days) ?? 30));
  let notify = DEFAULT_NOTIFY;
  try { notify = { ...DEFAULT_NOTIFY, ...JSON.parse(localStorage.getItem("tv:alert-notify") || "{}") }; } catch { /* storage off */ }
  const auto = `${symbol.split(":").pop()} ${condition} ${value}`;
  return { symbol, condition, value, trigger, expiration: Date.now() + days * 864e5, message: str(a.message) || auto, notify };
}

export default function VoiceBridge() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { alerts, log, addAlert, updateAlert, removeAlert, stopAlert, restartAlert, clearLog } = useAlerts();

  useEffect(() => {
    const alertText = (a: (typeof alerts)[number], i: number) => `${i + 1}: ${displaySymbol(a.symbol)} ${String(a.condition).replace(/_/g, " ")} ${a.value}`;
    // An alert by what was said: its number in the list, its price, or its symbol (active ones, or
    // the stopped ones to restart)
    const findAlert = (which: string, stopped = false) => {
      const live = alerts.filter(a => (stopped ? a.status !== "active" : a.status === "active"));
      const n = num(which);
      if (n !== undefined && Number.isInteger(n) && n >= 1 && n <= live.length && !live.some(a => a.value === n)) return live[n - 1];
      const hits = live.filter(a => (n !== undefined && Math.abs(a.value - n) < 1e-9) || sameSymbol(a.symbol, siteSymbol(which)) || low(displaySymbol(a.symbol)) === low(which));
      if (hits.length === 1) return hits[0];
      if (!hits.length) return ask(`I couldn't find ${stopped ? "a stopped" : "an"} alert for ${which}. You have: ${live.map(alertText).join("; ") || "none"}.`);
      return ask(`Which one: ${hits.map((a, i) => alertText(a, live.indexOf(a))).join("; ")}?`);
    };
    const fns: VoiceFunction[] = [
      { name: "collab_chat", signature: "collab_chat(text) message the open collab's group chat",
        confirm: a => (collab.get().room ? `Send "${str(a.text)}" to the collab's chat? Say yes or no.` : ask("You're not in a collab.")),
        run: a => { collab.sendChat(str(a.text)); return "Sent."; } },
      // ---- alerts
      { name: "alerts_list", signature: "alerts_list() reads the active alerts",
        run: () => { const live = alerts.filter(a => a.status === "active"); return live.length ? `You have ${live.length} active alert${live.length === 1 ? "" : "s"}: ${live.map(alertText).join("; ")}.` : "You have no active alerts."; } },
      { name: "alert_delete", signature: "alert_delete(which) which: its number from alerts_list, its price or its symbol",
        confirm: a => { const al = findAlert(str(a.which)); return `Delete the alert ${displaySymbol(al.symbol)} ${String(al.condition).replace(/_/g, " ")} ${al.value}? Say yes or no.`; },
        run: a => { const al = findAlert(str(a.which)); removeAlert(al.id); return "Deleted the alert."; } },
      { name: "alert_create", signature: "alert_create(price, condition?, symbol?, trigger?, message?, days?) sets a price alert straight away; condition crossing|crossing up|crossing down|greater than|less than (default crossing), symbol default the chart's, trigger once|every time, days until it expires (default 30)",
        confirm: a => { const d = newAlert(a); return `Set an alert: ${displaySymbol(d.symbol)} ${d.condition.toLowerCase()} ${d.value}, ${d.trigger.toLowerCase()}, for ${Math.round((d.expiration - Date.now()) / 864e5)} days? Say yes or no.`; },
        run: a => { const d = newAlert(a); addAlert(d); return `Alert set: ${displaySymbol(d.symbol)} ${d.condition.toLowerCase()} ${d.value}.`; } },
      { name: "alert_edit", signature: "alert_edit(which, price?, condition?) changes an active alert",
        confirm: a => { const al = findAlert(str(a.which)); return `Change the alert ${displaySymbol(al.symbol)} ${al.condition.toLowerCase()} ${al.value} to ${(conditionOf(a.condition) ?? al.condition).toLowerCase()} ${num(a.price) ?? al.value}? Say yes or no.`; },
        run: a => {
          const al = findAlert(str(a.which));
          const value = num(a.price) ?? al.value, condition = conditionOf(a.condition) ?? al.condition;
          updateAlert(al.id, { symbol: al.symbol, condition, value, trigger: al.trigger, expiration: al.expiration, notify: al.notify,
            message: al.message === `${al.symbol.split(":").pop()} ${al.condition} ${al.value}` ? `${al.symbol.split(":").pop()} ${condition} ${value}` : al.message });
          return `Changed it to ${condition.toLowerCase()} ${value}.`;
        } },
      { name: "alert_stop", signature: "alert_stop(which) stops an active alert (it can be restarted)",
        run: a => { const al = findAlert(str(a.which)); stopAlert(al.id); return `Stopped the ${displaySymbol(al.symbol)} ${al.value} alert.`; } },
      { name: "alert_restart", signature: "alert_restart(which) restarts a stopped or triggered alert",
        run: a => { const al = findAlert(str(a.which), true); restartAlert(al.id); return `Restarted the ${displaySymbol(al.symbol)} ${al.value} alert.`; } },
      { name: "alerts_log", signature: "alerts_log() reads the alerts that went off lately",
        run: () => log.length
          ? `The last ${Math.min(5, log.length)} that went off: ${log.slice(0, 5).map(l => `${displaySymbol(l.symbol)}: ${l.message}, ${new Date(l.time).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`).join("; ")}.`
          : "No alerts have gone off." },
      { name: "alerts_log_clear", signature: "alerts_log_clear() empties the list of alerts that went off",
        confirm: () => (log.length ? `Clear the ${log.length} entries of the alerts log? Say yes or no.` : null),
        run: () => { clearLog(); return "Cleared the alerts log."; } },
      // ---- watchlists
      { name: "watchlist_add", signature: "watchlist_add(symbol?, list?) adds a symbol (default: the chart's) to a watchlist (default: the open one)",
        run: a => {
          const sym = a.symbol ? siteSymbol(str(a.symbol)) : getChartInfo()?.symbol ?? ask("Which symbol?");
          const s = watchlists.get();
          const list = a.list ? pickByName(s.lists, l => l.name, str(a.list), "watchlist") : s.lists.find(l => l.id === s.activeId) ?? s.lists[0];
          if (listSymbols(list).some(x => sameSymbol(x, sym))) return `${displaySymbol(sym)} is already in ${list.name}.`;
          wl.addSymbol(sym, list.id);
          return `Added ${displaySymbol(sym)} to ${list.name}.`;
        } },
      { name: "watchlist_remove", signature: "watchlist_remove(symbol) from the open watchlist",
        run: a => { const sym = siteSymbol(str(a.symbol) || ask("Which symbol?")); wl.removeSymbol(sym); return `Removed ${displaySymbol(sym)} from the watchlist.`; } },
      { name: "watchlist_create", signature: "watchlist_create(name)",
        run: a => { const name = str(a.name) || ask("What should the list be called?"); wl.create(name); return `Created the watchlist ${name} and opened it.`; } },
      { name: "watchlist_open", signature: "watchlist_open(name)",
        run: a => { const l = pickByName(watchlists.get().lists, x => x.name, str(a.name), "watchlist"); wl.open(l.id); window.dispatchEvent(new CustomEvent("tv:open-panel", { detail: { id: "watchlist" } })); return `Opened ${l.name}.`; } },
      // ---- chart settings
      { name: "setting", signature: `setting(name, value) name: ${Object.keys(SETTINGS).join(" ")}; value: on/off, a colour, a size or a font`,
        run: a => {
          const set = SETTINGS[low(str(a.name)).replace(/\s+/g, "_")] ?? ask(`I can change: ${Object.keys(SETTINGS).join(", ").replace(/_/g, " ")}.`);
          const [patch, said] = set(a.value);
          chartSettings.set(patch);
          return `Set ${said}.`;
        } },
      // ---- layouts, dates
      { name: "layout_open", signature: "layout_open(name) opens a saved chart layout",
        run: a => { const l = pickByName(layoutStore.get().layouts, x => x.name, str(a.name), "layout"); window.dispatchEvent(new CustomEvent("tv:layout-open", { detail: l.id })); return `Opened the layout ${l.name}.`; } },
      { name: "go_to_date", signature: "go_to_date(date, time?) scrolls the chart to a date (YYYY-MM-DD) and time (HH:MM)",
        run: async a => {
          const date = str(a.date);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) ask("Which date?");
          const go = (window as any).__goToDate;
          if (typeof go !== "function") ask("Open the chart first.");
          await go(date, /^\d{1,2}:\d{2}$/.test(str(a.time)) ? str(a.time).padStart(5, "0") : "00:00");
          return `Went to ${date}${a.time ? ` ${str(a.time)}` : ""}.`;
        } },
      // ---- Pine
      { name: "pine_write", signature: "pine_write(name, code) a new Pine Script v6 script you write, opened in the editor for the trader to run",
        run: a => {
          const code = str(a.code) || ask("What should the script do?");
          window.dispatchEvent(new CustomEvent("tv:open-pine-editor", { detail: { code, scriptName: str(a.name) || "Voice script", language: "pine" } }));
          return `I've written ${str(a.name) || "the script"} and opened it in the Pine Editor. Check it, then add it to the chart.`;
        } },
      // ---- feedback (asked first; a picture of the chart along when they say so)
      { name: "feedback_send", signature: "feedback_send(message, screenshot?) sends feedback or a bug report to the site's team in the trader's words; screenshot true attaches a picture of the chart",
        confirm: a => `Send this feedback${a.screenshot === true || /^(yes|true)$/i.test(str(a.screenshot)) ? ", with a picture of the chart" : ""}: "${str(a.message) || ask("What would you like to tell the team?")}"? Say yes or no.`,
        run: async a => {
          const form = new FormData();
          const chart = getChartInfo();
          form.append("message", str(a.message));
          form.append("symbol", chart?.symbol ?? "");
          form.append("interval", chart?.interval ?? "");
          form.append("page_url", window.location.pathname + window.location.search);
          if (a.screenshot === true || /^(yes|true)$/i.test(str(a.screenshot))) {
            const canvas: HTMLCanvasElement | undefined = (window as any).__chartInstance?.takeScreenshot?.();
            const blob = canvas ? await new Promise<Blob | null>(r => canvas.toBlob(r, "image/png")) : null;
            if (blob) form.append("images", blob, "chart.png");
          }
          const res = await fetch(`${BACKEND}/api/users/feedback/?session_key=${encodeURIComponent(sessionKey())}`, { method: "POST", body: form });
          if (!res.ok) throw new Error(res.status === 429 ? "Too many reports for now; try again later." : "I couldn't send it just now.");
          return "Sent. Thanks: the team reads every report.";
        } },
      // ---- paper trading
      { name: "order_ticket", signature: "order_ticket(side, quantity?, type?, price?) opens a filled-in paper order ticket on the chart's symbol for the trader to place; side buy|sell, type market|limit|stop",
        run: a => {
          const side = /sell|short/i.test(str(a.side)) ? "sell" : /buy|long/i.test(str(a.side)) ? "buy" : ask("Buy or sell?");
          const type = /limit/i.test(str(a.type)) ? "limit" : /stop/i.test(str(a.type)) ? "stop" : "market";
          const price = num(a.price);
          if (type !== "market" && price === undefined) ask(`At what price should the ${type} order be?`);
          const symbol = getChartInfo()?.symbol ?? ask("Open a chart first.");
          openTicket({ symbol, side, type, price, qty: num(a.quantity) });
          return `Here's a ${type} ${side} ticket for ${displaySymbol(symbol)}${num(a.quantity) ? `, quantity ${num(a.quantity)}` : ""}${price !== undefined ? ` at ${price}` : ""}. Check it and press ${side === "buy" ? "Buy" : "Sell"} to place it.`;
        } },
    ];
    registerVoiceFunctions("site", fns);
  });
  useEffect(() => () => registerVoiceFunctions("site", null), []);
  return null;
}


"use client";

// The voice assistant's functions with inputs (lib/voice/registry) that need the site's live state:
// chats, alerts, watchlists, follows, chart settings, layouts, go to a date, writing a Pine
// script, a paper order ticket, copy trading. Rendered once on the chart page (always mounted, so they're there
// whichever panel is open). Anything sent to other people, deleted or traded asks first.

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAlerts } from "@/context/AlertsContext";
import { registerVoiceFunctions, VoiceQuestion, type VoiceFunction } from "../lib/voice/registry";
import { dmApi, groupApi, useDms } from "../lib/collab/dms";
import { collab } from "../lib/collab/session";
import { watchlists, wl, listSymbols, sameSymbol } from "./watchlist/store";
import { searchPeople, followPerson } from "../community/social";
import { chartSettings, FONT_SIZES } from "../lib/chartSettings";
import { FONTS, FONT_KEYS } from "../lib/fonts";
import { layoutStore } from "../lib/layoutStore";
import { openTicket } from "../trading/store";
import { getChartInfo } from "../lib/chartBars";
import { copyOverview, updateChannel, sendSignal, joinChannel, leaveChannel, updateSubscription } from "../analytics/copy";
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
  site_font: v => { const k = FONT_KEYS.find(x => low(x) === low(str(v)) || low(FONTS[x].label) === low(str(v))) ?? ask(`Which font: ${FONT_KEYS.map(x => FONTS[x].label).join(", ")}?`); return [{ siteFont: k }, `the site font to ${FONTS[k].label}`]; },
  symbol_name_label: v => { const b = boolOf(v); return [{ symbolName: b }, `the symbol's name on the price scale ${b ? "on" : "off"}`]; },
  last_price_line: v => { const b = boolOf(v); return [{ symbolLine: b }, `the last price line ${b ? "on" : "off"}`]; },
  previous_close_line: v => { const b = boolOf(v); return [{ prevCloseLine: b, prevCloseValue: b }, `the previous day close line ${b ? "on" : "off"}`]; },
  high_low_lines: v => { const b = boolOf(v); return [{ highLowLine: b, highLowValue: b }, `the high and low lines ${b ? "on" : "off"}`]; },
  bid_ask_lines: v => { const b = boolOf(v); return [{ bidAskLine: b, bidAskValue: b }, `the bid and ask lines ${b ? "on" : "off"}`]; },
  day_of_week: v => { const b = boolOf(v); return [{ dayOfWeek: b }, `the day of the week on the time scale ${b ? "on" : "off"}`]; },
  time_format: v => { const h = /12/.test(str(v)) ? "12-hours" : "24-hours"; return [{ timeFormat: h }, `the clock to ${h === "12-hours" ? "12" : "24"} hours`]; },
  session_breaks: v => { const b = boolOf(v); return [{ sessionBreaks: b }, `session breaks ${b ? "on" : "off"}`]; },
  ticker_watermark: v => { const b = boolOf(v); const w = chartSettings.get().watermark; return [{ watermark: { ...w, ticker: b } }, `the ticker watermark ${b ? "on" : "off"}`]; },
};

export default function VoiceBridge() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { alerts, removeAlert } = useAlerts();
  const dms = useDms();

  useEffect(() => {
    const needUid = () => uid ?? ask("Sign in first.");
    const alertText = (a: (typeof alerts)[number], i: number) => `${i + 1}: ${displaySymbol(a.symbol)} ${String(a.condition).replace(/_/g, " ")} ${a.value}`;
    // An alert by what was said: its number in the list, its price, or its symbol
    const findAlert = (which: string) => {
      const live = alerts.filter(a => a.status === "active");
      const n = num(which);
      if (n !== undefined && Number.isInteger(n) && n >= 1 && n <= live.length && !live.some(a => a.value === n)) return live[n - 1];
      const hits = live.filter(a => (n !== undefined && Math.abs(a.value - n) < 1e-9) || sameSymbol(a.symbol, siteSymbol(which)) || low(displaySymbol(a.symbol)) === low(which));
      if (hits.length === 1) return hits[0];
      if (!hits.length) return ask(`I couldn't find an alert for ${which}. You have: ${live.map(alertText).join("; ") || "no alerts"}.`);
      return ask(`Which one: ${hits.map((a, i) => alertText(a, live.indexOf(a))).join("; ")}?`);
    };
    // Someone to message: from the people in your collabs
    const contact = async (who: string) => {
      const people = await dmApi.people(needUid());
      const p = pickByName(people, x => x.name, who, "person in your collabs");
      if (!p.collabs.length) ask(`You and ${p.name} aren't in a collab together, so you can't message them yet.`);
      return p;
    };
    // Copy trading: a channel you run, or one you follow, by name
    const ownChannel = async (name: string) => pickByName((await copyOverview(needUid())).channels, c => c.name, name || ask("Which channel?"), "channel of yours");
    const followed = async (name: string) => pickByName((await copyOverview(needUid())).following, f => f.channel_info.name, name || ask("Which channel?"), "channel you follow");
    const fns: VoiceFunction[] = [
      // ---- chats
      { name: "chat_send", signature: "chat_send(to, text) private message to someone from your collabs",
        confirm: async a => { const p = await contact(str(a.to)); return `Send "${str(a.text)}" to ${p.name}? Say yes or no.`; },
        run: async a => { const p = await contact(str(a.to)); await dmApi.send(needUid(), p.collabs[0].token, p.uid, str(a.text)); return `Sent to ${p.name}.`; } },
      { name: "group_send", signature: "group_send(group, text) message one of your group chats",
        confirm: a => { const g = pickByName(dms.groups, x => x.name, str(a.group), "group"); return `Send "${str(a.text)}" to the group ${g.name}? Say yes or no.`; },
        run: async a => { const g = pickByName(dms.groups, x => x.name, str(a.group), "group"); await groupApi.send(needUid(), g.token, str(a.text)); return `Sent to ${g.name}.`; } },
      { name: "collab_chat", signature: "collab_chat(text) message the open collab's group chat",
        confirm: a => (collab.get().room ? `Send "${str(a.text)}" to the collab's chat? Say yes or no.` : ask("You're not in a collab.")),
        run: a => { collab.sendChat(str(a.text)); return "Sent."; } },
      // ---- alerts
      { name: "alerts_list", signature: "alerts_list() reads the active alerts",
        run: () => { const live = alerts.filter(a => a.status === "active"); return live.length ? `You have ${live.length} active alert${live.length === 1 ? "" : "s"}: ${live.map(alertText).join("; ")}.` : "You have no active alerts."; } },
      { name: "alert_delete", signature: "alert_delete(which) which: its number from alerts_list, its price or its symbol",
        confirm: a => { const al = findAlert(str(a.which)); return `Delete the alert ${displaySymbol(al.symbol)} ${String(al.condition).replace(/_/g, " ")} ${al.value}? Say yes or no.`; },
        run: a => { const al = findAlert(str(a.which)); removeAlert(al.id); return "Deleted the alert."; } },
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
      // ---- people
      { name: "follow", signature: "follow(person) follows someone on the community",
        confirm: async a => { const p = pickByName(await searchPeople(needUid(), str(a.person)), x => x.name || x.username, str(a.person), "person"); return `Follow ${p.name || p.username}? Say yes or no.`; },
        run: async a => { const p = pickByName(await searchPeople(needUid(), str(a.person)), x => x.name || x.username, str(a.person), "person"); await followPerson(needUid(), p.username, true); return `You're following ${p.name || p.username}.`; } },
      { name: "unfollow", signature: "unfollow(person)",
        confirm: a => `Unfollow ${str(a.person)}? Say yes or no.`,
        run: async a => { const p = pickByName(await searchPeople(needUid(), str(a.person)), x => x.name || x.username, str(a.person), "person"); await followPerson(needUid(), p.username, false); return `You've unfollowed ${p.name || p.username}.`; } },
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
      // ---- copy trading (signals reach followers' brokers: everything but reading asks first)
      { name: "copy_status", signature: "copy_status() reads your copy trading: channels you run, channels you follow, the copier",
        run: async () => {
          const o = await copyOverview(needUid());
          const own = o.channels.map(c => `${c.name} (${c.active ? "active" : "paused"}, ${c.subscribers} follower${c.subscribers === 1 ? "" : "s"}, ${c.copying} copying)`);
          const fol = o.following.map(s => `${s.channel_info.name} by ${s.channel_info.owner} (auto-copy ${s.auto_copy ? "on" : "off"})`);
          return [
            own.length ? `You run ${own.join("; ")}.` : "You don't run a channel.",
            fol.length ? `You follow ${fol.join("; ")}.` : "You don't follow a channel.",
            `Your MT5 is ${o.mt5_linked ? "linked" : "not linked"}.`,
          ].join(" ");
        } },
      { name: "copy_channel_pause", signature: "copy_channel_pause(channel) stops a channel you run from sending signals",
        confirm: async a => `Pause your channel ${(await ownChannel(str(a.channel))).name}? Its followers stop getting signals. Say yes or no.`,
        run: async a => { const c = await ownChannel(str(a.channel)); await updateChannel(needUid(), c.id, { active: false }); return `Paused ${c.name}.`; } },
      { name: "copy_channel_resume", signature: "copy_channel_resume(channel)",
        confirm: async a => `Resume your channel ${(await ownChannel(str(a.channel))).name}? Say yes or no.`,
        run: async a => { const c = await ownChannel(str(a.channel)); await updateChannel(needUid(), c.id, { active: true }); return `Resumed ${c.name}.`; } },
      { name: "copy_send_signal", signature: "copy_send_signal(channel, symbol, side, sl?, tp?, risk?) sends a trade to a channel you run: followers copy it on their brokers",
        confirm: async a => {
          const c = await ownChannel(str(a.channel));
          const side = /sell|short/i.test(str(a.side)) ? "sell" : /buy|long/i.test(str(a.side)) ? "buy" : ask("Buy or sell?");
          const sym = str(a.symbol) || ask("Which symbol?");
          return `Send a ${side} ${displaySymbol(siteSymbol(sym))} signal to ${c.name}${num(a.sl) !== undefined ? `, stop loss ${num(a.sl)}` : ", no stop loss"}${num(a.tp) !== undefined ? `, take profit ${num(a.tp)}` : ""}, risk ${num(a.risk) ?? c.default_risk}%? `
            + `Its ${c.copying} copying follower${c.copying === 1 ? "" : "s"} will trade it on their brokers. Say yes or no.`;
        },
        run: async a => {
          const c = await ownChannel(str(a.channel));
          const side = /sell|short/i.test(str(a.side)) ? "sell" : "buy";
          const sig = await sendSignal(needUid(), c.id, { kind: "open", symbol: siteSymbol(str(a.symbol)), side, sl: num(a.sl), tp: num(a.tp), risk_percent: num(a.risk) });
          return `Sent the ${side} signal to ${c.name}.${sig.failed ? ` ${sig.failed} follower${sig.failed === 1 ? "" : "s"} couldn't copy it.` : ""}`;
        } },
      { name: "copy_join", signature: "copy_join(code) follows a channel with its invite code",
        confirm: a => `Follow the channel with code ${str(a.code) || ask("What's the channel's code?")}? Say yes or no.`,
        run: async a => { const s = await joinChannel(needUid(), str(a.code)); return `You're following ${s.channel_info.name}. Auto-copy is ${s.auto_copy ? "on" : "off"}; set your risk on the Copy trading page.`; } },
      { name: "copy_leave", signature: "copy_leave(channel) stops following a channel",
        confirm: async a => `Stop following ${(await followed(str(a.channel))).channel_info.name}? Say yes or no.`,
        run: async a => { const s = await followed(str(a.channel)); await leaveChannel(needUid(), s.id); return `You've left ${s.channel_info.name}.`; } },
      { name: "copy_auto", signature: "copy_auto(channel, on) turns auto-copy of a channel you follow on or off (trades on your MT5)",
        confirm: async a => { const s = await followed(str(a.channel)); const on = boolOf(a.on); return `Turn auto-copy ${on ? "on" : "off"} for ${s.channel_info.name}?${on ? " Its signals will be traded on your MT5 account." : ""} Say yes or no.`; },
        run: async a => { const s = await followed(str(a.channel)); const on = boolOf(a.on); await updateSubscription(needUid(), s.id, { auto_copy: on }); return `Auto-copy is ${on ? "on" : "off"} for ${s.channel_info.name}.`; } },
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


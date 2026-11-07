"use client";

// The voice assistant (right toolbar → Voice assistant). Phase 1: spoken commands that drive the
// site, and a voice that answers, its words shown as subtitles in the panel's chat.
//   Listening:  the browser's speech recognition (Chrome, Edge, Safari; not Firefox, and Brave
//               blocks it), continuous while the mic is on. It pauses while the assistant
//               speaks, so it doesn't hear itself. Typing in the panel runs the same commands.
//   Speaking:   the browser's speech synthesis; each word lights up in the chat as it's said.
//   Doing:      the page's own events (tv:set-symbol, tv:set-interval, tv:pine-editor,
//               tv:open-panel), so a command does what the matching click does.
// The state lives here, not in the panel: listening carries on while another panel is open.
// What the plain rules (./commands) don't understand goes to the AI on the server (core/voice.py:
// Groq, or Gemini): it answers in words, or with one of the same actions the rules produce.

import { useSyncExternalStore } from "react";
import { parseCommand, aliasSymbol, lettersToPair, intervalByValue, type Intent, type Interval, type MarkKind } from "./commands";
import { markOnChart, clearMarks, MARK_NAMES } from "./marks";
import { getChartInfo } from "../chartBars";
import { setChartType, type ChartType } from "../chartType";
import { chartSettings, themeCanvas } from "../chartSettings";
import { themeSettings } from "../siteThemes";
import { createSession, freshAccount, endOf, OPEN_SESSION_EVENT } from "../../analytics/sessions";
import { backendFetch } from "@/lib/backend";
import { watchlists, listSymbols } from "../../components/watchlist/store";
import { tradingUi } from "../../trading/store";
import { displaySymbol } from "../symbolDisplay";

export type VoiceMessage = {
  id: number;
  from: "user" | "assistant";
  text: string;
  spokenTo?: number;                          // while being spoken: how much of it has been said
  link?: { label: string; href: string };     // e.g. a new tab the browser wouldn't open by itself
};

export type VoiceState = {
  supported: boolean;      // speech recognition exists in this browser
  canSpeak: boolean;       // speech synthesis exists
  listening: boolean;      // the mic is on
  hearing: string;         // what's being said right now (not final yet)
  speaking: boolean;
  thinking: boolean;       // waiting for the AI's answer
  replies: boolean;        // answers are spoken (off: subtitles only)
  lang: string;
  messages: VoiceMessage[];
  error: string | null;
};

export const VOICE_LANGS = [
  { value: "en-US", label: "English (US)" },
  { value: "en-IN", label: "English (India)" },
  { value: "en-GB", label: "English (UK)" },
];

const PREFS_KEY = "tv:voicePrefs";
const readPrefs = (): { replies?: boolean; lang?: string } => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { return {}; }
};

const recognitionClass = (): any =>
  typeof window === "undefined" ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

let state: VoiceState = {
  supported: false, canSpeak: false, listening: false, hearing: "", speaking: false, thinking: false, replies: true, lang: "en-US", messages: [], error: null,
};
let initialised = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const set = (p: Partial<VoiceState>) => { state = { ...state, ...p }; emit(); };

function init() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  const prefs = readPrefs();
  const navLang = (navigator.language || "").startsWith("en") ? navigator.language : "en-US";
  state = {
    ...state,
    supported: !!recognitionClass(),
    canSpeak: "speechSynthesis" in window,
    replies: prefs.replies ?? true,
    lang: VOICE_LANGS.some(l => l.value === prefs.lang) ? prefs.lang! : VOICE_LANGS.some(l => l.value === navLang) ? navLang : "en-US",
  };
  // (the voices list arrives a moment after the page loads)
  try { window.speechSynthesis?.getVoices(); } catch { /* none */ }
}

export const voice = {
  get: () => { init(); return state; },
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};
export function useVoice(): VoiceState {
  return useSyncExternalStore(voice.subscribe, voice.get, () => state);
}

let nextId = 1;
function push(m: Omit<VoiceMessage, "id">): number {
  const id = nextId++;
  set({ messages: [...state.messages.slice(-80), { ...m, id }] });
  return id;
}
function patchMessage(id: number, p: Partial<VoiceMessage>) {
  set({ messages: state.messages.map(m => (m.id === id ? { ...m, ...p } : m)) });
}

export function setVoicePrefs(p: { replies?: boolean; lang?: string }) {
  init();
  set(p);
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ replies: state.replies, lang: state.lang })); } catch { /* full */ }
  if (p.replies === false) { try { window.speechSynthesis?.cancel(); } catch { /* none */ } }
  if (p.lang && state.listening) { stopRecognition(); startRecognition(); }
}

// ---- speaking -------------------------------------------------------------------------------
// A clear English voice: the browser's natural / online ones first
function pickVoice(): SpeechSynthesisVoice | null {
  let voices: SpeechSynthesisVoice[] = [];
  try { voices = window.speechSynthesis.getVoices(); } catch { return null; }
  const lang = state.lang.toLowerCase();
  const en = voices.filter(v => v.lang.toLowerCase().startsWith("en"));
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase() === lang ? 4 : 0) + (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google|aria|jenny|samantha|zira|heera|neerja/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
  return en.sort((a, b) => score(b) - score(a))[0] ?? voices[0] ?? null;
}

let speakQueue: Promise<void> = Promise.resolve();

// Shows a reply in the chat and says it, each word appearing as it's spoken (subtitles)
function say(text: string, extra?: Partial<VoiceMessage>): Promise<void> {
  const speak = state.replies && state.canSpeak;
  const id = push({ from: "assistant", text, spokenTo: speak ? 0 : undefined, ...extra });
  if (!speak) return Promise.resolve();
  speakQueue = speakQueue.then(() => new Promise<void>(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      patchMessage(id, { spokenTo: undefined });
      set({ speaking: false });
      resumeAfterSpeaking();
      resolve();
    };
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v?.lang || state.lang;
      u.rate = 1.03;
      u.onstart = () => { set({ speaking: true }); pauseForSpeaking(); };
      u.onboundary = (e: SpeechSynthesisEvent) => {
        if (e.name && e.name !== "word") return;
        const end = text.indexOf(" ", e.charIndex + 1);
        patchMessage(id, { spokenTo: end < 0 ? text.length : end });
      };
      u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.speak(u);
      // (some voices never send boundary events, or never end: the whole line shows after a while)
      setTimeout(finish, 2500 + text.length * 90);
    } catch { finish(); }
  }));
  return speakQueue;
}

// ---- listening ------------------------------------------------------------------------------
let rec: any = null;
let pausedForSpeech = false;
let restarts: number[] = [];

function startRecognition() {
  const R = recognitionClass();
  if (!R) return;
  try { rec?.abort(); } catch { /* none */ }
  const r = new R();
  rec = r;
  r.continuous = true;
  r.interimResults = true;
  r.lang = state.lang;
  r.maxAlternatives = 1;
  r.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const text = res[0]?.transcript ?? "";
      if (res.isFinal) { set({ hearing: "" }); if (text.trim()) handleText(text.trim()); }
      else interim += text;
    }
    if (interim) set({ hearing: interim.trim() });
  };
  r.onerror = (e: any) => {
    const err = e?.error;
    if (err === "no-speech" || err === "aborted") return;
    const msg =
      err === "not-allowed" || err === "service-not-allowed" ? "The microphone is blocked for this site. Allow it in the address bar's site settings, then try again."
      : err === "network" ? "This browser can't reach its speech service (Brave turns it off). Use Chrome or Edge, or type your command below."
      : err === "audio-capture" ? "No microphone was found."
      : `Listening stopped (${err}).`;
    stopListening();
    set({ error: msg });
  };
  r.onend = () => {
    if (rec !== r) return;
    rec = null;
    // The browser ends a session after a pause: carry on while the mic is on
    if (!state.listening || pausedForSpeech) return;
    const now = Date.now();
    restarts = restarts.filter(t => now - t < 10000);
    if (restarts.length > 6) { stopListening(); set({ error: "Listening keeps stopping. Click the microphone to try again." }); return; }
    restarts.push(now);
    setTimeout(() => { if (state.listening && !pausedForSpeech && !rec) startRecognition(); }, 250);
  };
  try { r.start(); } catch { /* already started */ }
}

function stopRecognition() {
  const r = rec;
  rec = null;
  try { r?.abort(); } catch { /* none */ }
}

function pauseForSpeaking() {
  if (!state.listening) return;
  pausedForSpeech = true;
  stopRecognition();
  set({ hearing: "" });
}
function resumeAfterSpeaking() {
  if (!pausedForSpeech) return;
  pausedForSpeech = false;
  if (state.listening) setTimeout(() => { if (state.listening && !rec && !state.speaking) startRecognition(); }, 300);
}

let greeted = false;
export function startListening() {
  init();
  if (!state.supported) {
    set({ error: "This browser has no speech recognition. Use Chrome or Edge, or type your command below." });
    return;
  }
  set({ listening: true, error: null, hearing: "" });
  restarts = [];
  startRecognition();
  if (!greeted) {
    greeted = true;
    say("I'm listening. Try saying: open gold chart, switch to the 15 minute, or open the Pine Editor.");
  }
}
export function stopListening() {
  pausedForSpeech = false;
  set({ listening: false, hearing: "" });
  stopRecognition();
}
export function toggleListening() { (state.listening ? stopListening : startListening)(); }

// ---- doing ----------------------------------------------------------------------------------
const fire = (name: string, detail?: any) => window.dispatchEvent(new CustomEvent(name, { detail }));
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

// What was said → a symbol the chart can open (null: nothing found)
async function resolveSymbol(query: string, exact = false): Promise<{ symbol: string; name?: string } | null> {
  if (exact) return { symbol: query };
  const direct = aliasSymbol(query) ?? lettersToPair(query);
  if (direct) return { symbol: direct };
  const q = norm(query);
  if (!q) return null;
  // the watchlists' symbols ("open tesla" when TSLA is on a list is caught above; "eurjpy" here)
  try {
    const own = watchlists.get().lists.flatMap(l => listSymbols(l)).find(s => norm(s) === q);
    if (own) return { symbol: own };
  } catch { /* no lists */ }
  // the data provider's search
  try {
    const d = await (await fetch(`/api/symbol-search?q=${encodeURIComponent(query)}`)).json();
    const hits: { symbol: string; name: string }[] = Array.isArray(d?.data) ? d.data : [];
    const exact = hits.find(h => norm(h.symbol) === q);
    const named = hits.find(h => norm(h.name).includes(q));
    const hit = exact ?? named ?? null;
    if (hit) return { symbol: hit.symbol, name: hit.name };
  } catch { /* offline */ }
  return null;
}

function currentPrice(): { symbol: string; price: number } | null {
  try {
    const chart = (window as any).__chartInstance;
    const data = chart?.panes?.()[0]?.getSeries?.()[0]?.data?.();
    const last = data?.[data.length - 1];
    const price = typeof last?.close === "number" ? last.close : typeof last?.value === "number" ? last.value : null;
    const symbol = tradingUi.get().chartSymbol;
    return price !== null && symbol ? { symbol, price } : null;
  } catch { return null; }
}

// Numbers read out naturally ("2,650.45" rather than "2650.4500")
const spokenNumber = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 6 });

// Does what was asked; `reply` (from the AI) is said instead of the usual confirmation, and
// `quiet` (the AI's second and third actions) says nothing when it worked
async function run(intent: Intent, heard: string, reply?: string, quiet = false) {
  const confirm = (usual: string, extra?: Partial<VoiceMessage>) => (quiet ? Promise.resolve() : say(reply || usual, extra));
  switch (intent.kind) {
    case "symbol": {
      const found = await resolveSymbol(intent.query, intent.exact);
      if (!found) {
        // Not a name the rules know ("the yellow metal"): the AI may understand it (once — not
        // for a symbol the AI itself sent, nor when signed out)
        if (!intent.exact && voiceUid) { await askAI(heard); return; }
        say(`I couldn't find a symbol called "${intent.query}". Try its code, like X A U U S D, or a name like gold.`);
        return;
      }
      fire("tv:set-symbol", { symbol: found.symbol });
      if (intent.interval) fire("tv:set-interval", { interval: intent.interval.value });
      const shown = displaySymbol(found.symbol);
      confirm(`Opening ${shown}${found.name && norm(found.name) !== norm(found.symbol) ? `, ${found.name}` : ""}${intent.interval ? ` on the ${intent.interval.spoken} chart` : ""}.`);
      return;
    }
    case "interval":
      fire("tv:set-interval", { interval: intent.interval.value });
      confirm(`Switched to the ${intent.interval.spoken} chart.`);
      return;
    case "pine":
      fire("tv:pine-editor", { open: intent.open });
      confirm(intent.open ? "Here's the Pine Editor." : "Closed the Pine Editor.");
      return;
    case "backtest_new": {
      // With a start date: the session is made here and opened on this chart
      if (intent.start) { await createBacktest(intent, reply); return; }
      // Details but no date: ask for it
      if (intent.symbol || intent.interval || intent.balance) {
        say("From which date should it start? Say for example: create a backtest on gold 15 minute from 1 March 2024.");
        return;
      }
      const href = "/analytics?view=backtests";
      // (a tab opened from a voice command may be blocked: there's no click behind it. With
      // "noopener" the browser doesn't say whether it opened, so the link is offered either way)
      try { window.open(href, "_blank", "noopener"); } catch { /* blocked */ }
      confirm("Opening a new backtest session in a new tab. Choose the symbol and start date there, or tell me them, like: backtest gold 15 minute from 1 March 2024.", { link: { label: "Open new backtest session", href } });
      return;
    }
    case "mark": {
      const done: string[] = [];
      const none: string[] = [];
      for (const k of intent.what) {
        const r = markOnChart(k);
        if (!r.ok) { say("The chart has no bars to look at yet."); return; }
        if (!r.count) { none.push(MARK_NAMES[k]); continue; }
        const sides = k === "support_resistance"
          ? `${r.bull} support, ${r.bear} resistance`
          : `${r.bull} bullish, ${r.bear} bearish`;
        done.push(`${r.count} ${r.count === 1 ? MARK_NAMES[k].replace(/s$/, "").replace(/levels$/, "level") : MARK_NAMES[k]} (${sides})`);
      }
      const usual = (done.length ? `Marked ${done.join(" and ")} on the visible bars.` : "")
        + (none.length ? ` I found no ${none.join(" or ")} still in play there; zoom out to look further back.` : "");
      confirm(usual.trim());
      return;
    }
    case "clear_marks": {
      if (intent.what?.length) intent.what.forEach(k => clearMarks(k)); else clearMarks();
      confirm(intent.what?.length ? `Cleared the ${intent.what.map(k => MARK_NAMES[k]).join(" and ")}.` : "Cleared everything I marked.");
      return;
    }
    case "indicator":
      fire(intent.remove ? "tv:remove-indicator" : "tv:add-indicator", { name: intent.name });
      confirm(intent.remove ? `Removed the ${intent.name}.` : `Added the ${intent.name}.`);
      return;
    case "chart_type":
      setChartType(intent.type as ChartType);
      confirm(`Switched to ${intent.label}.`);
      return;
    case "theme":
      // (the page follows the theme's light / dark base)
      chartSettings.set(themeSettings(intent.id, intent.base, chartSettings.get(), themeCanvas));
      confirm(`Switched to the ${intent.label} theme.`);
      return;
    case "replay":
      if (intent.date) {
        fire("tv:replay-start", { kind: "date", date: intent.date });
        confirm(`Starting bar replay from ${spokenDate(intent.date)}.`);
      } else if (intent.random) {
        fire("tv:replay-start", { kind: "random" });
        confirm("Starting bar replay from a random date.");
      } else {
        say("From which date? Say for example: start replay from 1 March 2024. Or say: replay a random date.");
      }
      return;
    case "alert": {
      const price = intent.price ?? currentPrice()?.price;
      fire("tv:create-alert", { price });
      confirm(price !== undefined ? `Here's a new alert at ${spokenNumber(price)}. Check it and press Create.` : "Here's a new alert. Set the price and press Create.");
      return;
    }
    case "snapshot":
      fire("tv:snapshot", { action: intent.copy ? "copy" : "download" });
      confirm(intent.copy ? "Copied the chart image." : "Downloading the chart image.");
      return;
    case "reset_view":
      fire("tv:reset-chart-view");
      confirm("Reset the chart view.");
      return;
    case "panel":
      fire("tv:open-panel", { id: intent.panel });
      confirm(`Here's the ${intent.label} panel.`);
      return;
    case "price": {
      const p = currentPrice();
      say(p ? `${displaySymbol(p.symbol)} is at ${spokenNumber(p.price)}.` : "I can't read the price right now: the chart has no data yet.");
      return;
    }
    case "greeting":
      say("Hi! Tell me what to open, for example: open gold chart, or open the Pine Editor.");
      return;
    case "thanks":
      say("You're welcome.");
      return;
    case "help":
      say("You can say: open gold on the 15 minute, mark order blocks, mark fair value gaps, mark support and resistance, add RSI, switch to Heikin Ashi, start replay from 1 March 2024, set an alert at 2650, backtest gold from 1 March 2024 with 10k, open the Pine Editor, or ask me anything. Say stop listening to turn me off.");
      return;
    case "stop":
      await say("Okay, I've stopped listening.");
      stopListening();
      return;
    default:
      await askAI(heard);
  }
}

// ---- the AI (what the rules don't understand) -----------------------------------------------
let voiceUid: string | null = null;
// The signed-in user (the AI is per account: its requests are counted per user)
export function setVoiceUser(uid: string | null) { voiceUid = uid; }

const PANEL_LABELS: Record<string, string> = { watchlist: "watchlist", alerts: "alerts", object_tree: "object tree", collab: "collabs", chats: "chats", notifications: "notifications", backtest_sessions: "backtest sessions" };

// An action the AI sent back (already checked on the server) → the same intents the rules make
function intentOf(a: any): Intent | null {
  switch (a?.type) {
    case "symbol": return { kind: "symbol", query: String(a.symbol), interval: intervalByValue(a.interval), exact: true };
    case "interval": { const i = intervalByValue(a.interval); return i ? { kind: "interval", interval: i } : null; }
    case "pine": return { kind: "pine", open: !!a.open };
    case "backtest_new": return {
      kind: "backtest_new", symbol: a.symbol || undefined, interval: intervalByValue(a.interval), start: a.start_date || undefined,
      balance: typeof a.balance === "number" ? a.balance : undefined, length: a.length || undefined,
    };
    case "panel": return PANEL_LABELS[a.panel] ? { kind: "panel", panel: a.panel, label: PANEL_LABELS[a.panel] } : null;
    case "price": return { kind: "price" };
    case "mark": return Array.isArray(a.what) && a.what.length ? { kind: "mark", what: a.what as MarkKind[] } : null;
    case "clear_marks": return { kind: "clear_marks", what: Array.isArray(a.what) && a.what.length ? a.what as MarkKind[] : undefined };
    case "indicator": return typeof a.name === "string" ? { kind: "indicator", name: a.name, remove: !!a.remove } : null;
    case "chart_type": return typeof a.chart_type === "string" ? { kind: "chart_type", type: a.chart_type, label: String(a.label || a.chart_type) } : null;
    case "theme": return typeof a.id === "string" ? { kind: "theme", id: a.id, base: a.base === "light" ? "light" : "dark", label: String(a.label || a.id) } : null;
    case "replay": return { kind: "replay", date: a.date || undefined, random: !!a.random };
    case "alert": return { kind: "alert", price: typeof a.price === "number" ? a.price : undefined };
    case "snapshot": return { kind: "snapshot", copy: !!a.copy };
    case "reset_view": return { kind: "reset_view" };
    default: return null;
  }
}

// ---- backtest sessions, made by voice ----------------------------------------------------------
const spokenDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

async function createBacktest(intent: Extract<Intent, { kind: "backtest_new" }>, reply?: string) {
  if (!voiceUid) { say("Sign in to create backtest sessions: they're saved to your account."); return; }
  const chart = getChartInfo();
  // the symbol: the one named (found as for "open …"), else the chart's
  let symbol = chart?.symbol ?? null;
  if (intent.symbol) {
    const found = await resolveSymbol(intent.symbol, /[/]/.test(intent.symbol) || /^[A-Z0-9.]+$/.test(intent.symbol));
    if (!found) { say(`I couldn't find a symbol called "${intent.symbol}".`); return; }
    symbol = found.symbol;
  }
  if (!symbol) { say("Which symbol? Say for example: backtest gold from 1 March 2024."); return; }
  const iv: Interval | undefined = intent.interval ?? intervalByValue(chart?.interval);
  const interval = iv?.value ?? chart?.interval ?? "15min";
  const label = iv?.label ?? interval;
  const start = Math.floor(Date.parse(`${intent.start}T00:00:00Z`) / 1000);
  if (!(start > 0) || start * 1000 > Date.now()) { say("The start date has to be in the past."); return; }
  const length = intent.length ?? null;
  if (length && endOf(start, length) * 1000 > Date.now()) { say(`${length.value} ${length.unit} from ${spokenDate(intent.start!)} runs past today: start earlier or test less.`); return; }
  const balance = intent.balance && intent.balance > 0 ? intent.balance : 10000;
  const name = `${displaySymbol(symbol)} ${label} backtest`;
  set({ thinking: true });
  try {
    const s = await createSession(voiceUid, {
      name, symbol, interval, interval_label: label, start_time: start, initial_balance: balance,
      account: freshAccount(`Backtest · ${name}`, balance), book: {} as any, length,
    });
    set({ thinking: false });
    // (opened on this chart, as the replay menu's sessions are)
    fire(OPEN_SESSION_EVENT, { id: s.id });
    say(reply || `Created "${name}" from ${spokenDate(intent.start!)} with ${spokenNumber(balance)} dollars${length ? ` for ${length.value} ${length.unit}` : ""}, and opened it.`);
  } catch (e: any) {
    set({ thinking: false });
    say(`I couldn't create the session${e?.message ? `: ${e.message}` : ""}.`);
  }
}

async function askAI(text: string) {
  if (!voiceUid) {
    say(`I didn't get a command in "${text}". Sign in to talk with me freely; the basic commands work without it. Say help to hear them.`);
    return;
  }
  const p = currentPrice();
  const chartSymbol = tradingUi.get().chartSymbol;
  const history = state.messages.slice(0, -1).slice(-8).map(m => ({ from: m.from, text: m.text }));
  set({ thinking: true });
  try {
    const res = await backendFetch(`http://localhost:8000/api/users/voice/ask/${voiceUid}/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, history, context: { symbol: chartSymbol ? displaySymbol(chartSymbol) : null, price: p?.price ?? null } }),
    });
    const data = await res.json().catch(() => ({}));
    set({ thinking: false });
    if (!res.ok) {
      say(data?.error === "not_configured" ? "My AI isn't set up on the server yet, so I only understand the basic commands. Say help to hear them."
        : data?.error === "daily_limit" ? "You've used today's AI answers. The basic commands still work; say help to hear them."
        : data?.error === "busy" ? "My AI is busy right now; try again in a minute. The basic commands still work."
        : "I couldn't reach my AI just now. The basic commands still work.");
      return;
    }
    // up to three actions, in order: the reply is said with the first, the others quietly
    const intents = (Array.isArray(data.actions) ? data.actions : [data.action]).map(intentOf).filter((x: Intent | null): x is Intent => !!x);
    const reply = typeof data.reply === "string" && data.reply ? data.reply : undefined;
    if (!intents.length) { say(reply ?? "Sorry, I don't have an answer for that."); return; }
    for (let i = 0; i < intents.length; i++) await run(intents[i], text, i === 0 ? reply : undefined, i > 0);
  } catch {
    set({ thinking: false });
    say("I couldn't reach my AI just now. The basic commands still work.");
  }
}

// What was heard (or typed) → the chat, then the command
export function handleText(text: string) {
  init();
  const t = text.trim();
  if (!t) return;
  push({ from: "user", text: t });
  set({ error: null });
  run(parseCommand(t), t).catch(() => say("Something went wrong doing that."));
}

export function clearVoiceChat() { set({ messages: [] }); }

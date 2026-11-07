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

import { useSyncExternalStore } from "react";
import { parseCommand, aliasSymbol, lettersToPair, type Intent } from "./commands";
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
  supported: false, canSpeak: false, listening: false, hearing: "", speaking: false, replies: true, lang: "en-US", messages: [], error: null,
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
async function resolveSymbol(query: string): Promise<{ symbol: string; name?: string } | null> {
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

async function run(intent: Intent, heard: string) {
  switch (intent.kind) {
    case "symbol": {
      const found = await resolveSymbol(intent.query);
      if (!found) { say(`I couldn't find a symbol called "${intent.query}". Try its code, like X A U U S D, or a name like gold.`); return; }
      fire("tv:set-symbol", { symbol: found.symbol });
      if (intent.interval) fire("tv:set-interval", { interval: intent.interval.value });
      const shown = displaySymbol(found.symbol);
      say(`Opening ${shown}${found.name && norm(found.name) !== norm(found.symbol) ? `, ${found.name}` : ""}${intent.interval ? ` on the ${intent.interval.spoken} chart` : ""}.`);
      return;
    }
    case "interval":
      fire("tv:set-interval", { interval: intent.interval.value });
      say(`Switched to the ${intent.interval.spoken} chart.`);
      return;
    case "pine":
      fire("tv:pine-editor", { open: intent.open });
      say(intent.open ? "Here's the Pine Editor." : "Closed the Pine Editor.");
      return;
    case "backtest_new": {
      const href = "/analytics?view=backtests";
      // (a tab opened from a voice command may be blocked: there's no click behind it. With
      // "noopener" the browser doesn't say whether it opened, so the link is offered either way)
      try { window.open(href, "_blank", "noopener"); } catch { /* blocked */ }
      say("Opening a new backtest session in a new tab. Choose the symbol and start date there.", { link: { label: "Open new backtest session", href } });
      return;
    }
    case "panel":
      fire("tv:open-panel", { id: intent.panel });
      say(`Here's the ${intent.label} panel.`);
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
      say("You can say: open gold chart, open euro dollar on the 1 hour, switch to daily, open the Pine Editor, create a backtesting session, open my alerts, or what's the price. Say stop listening to turn me off.");
      return;
    case "stop":
      await say("Okay, I've stopped listening.");
      stopListening();
      return;
    default:
      say(`Sorry, I didn't get a command in "${heard}". Say help to hear what I can do.`);
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

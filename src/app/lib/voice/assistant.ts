"use client";

// The voice assistant (right toolbar → Voice assistant): talk to the site, and a voice that answers,
// its words shown as subtitles in the panel's chat. Everything said goes to the AI on the server
// (core/voice.py: Groq, or Gemini), which replies in words, asks when it needs to know more, and
// sends back actions for the site to do (lib/voice/commands: open charts, mark order blocks and
// FVGs, indicators, replays, backtest sessions…). Signed-in users only (the AI is per account).
//   Listening:  the browser's speech recognition (Chrome, Edge, Safari; not Firefox, and Brave
//               blocks it), continuous while the mic is on. It pauses while the assistant
//               speaks, so it doesn't hear itself. Typing in the panel does the same.
//   Speaking:   the browser's speech synthesis; each word lights up in the chat as it's said.
//   Doing:      the page's own events (tv:set-symbol, tv:set-interval, tv:pine-editor,
//               tv:open-panel…), so an action does what the matching click does. Creating a
//               backtest session and clearing all the marks wait for a yes.
// The state lives here, not in the panel: listening carries on while another panel is open.

import { useSyncExternalStore } from "react";
import { intervalByValue, type Intent, type Interval, type MarkKind, type Invitee } from "./commands";
import { voiceCommand, voiceCommands, voiceContext, pickTool, voiceFunction, voiceFunctions, VoiceQuestion } from "./registry";
import { findTool } from "./tools";
import { collab, collabApi, collabLink, type Person, type RoomInfo, type Member } from "../collab/session";
import { openCollab } from "../../components/collab/CollabController";
import { markOnChart, clearMarks, countMarks, MARK_NAMES } from "./marks";
import { getChartInfo, getChartBars } from "../chartBars";
import { setChartType, type ChartType } from "../chartType";
import { chartSettings, themeCanvas } from "../chartSettings";
import { createSession, freshAccount, endOf, OPEN_SESSION_EVENT } from "../../analytics/sessions";
import { backendFetch, BACKEND_URL } from "@/lib/backend";
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
  // a question waiting for the trader's answer, and quick answers for it (the panel's buttons)
  pending: { question: string; options: string[] } | null;
  replies: boolean;        // answers are spoken (off: subtitles only)
  lang: string;
  messages: VoiceMessage[];
  error: string | null;
};

// The languages it hears (the browser's speech recognition) and answers in (the AI writes its reply
// in the language chosen; the browser speaks it with a voice of that language when it has one).
// `name` is what the AI is told to answer in.
export const VOICE_LANGS = [
  { value: "en-US", label: "English (US)", name: "English" },
  { value: "en-IN", label: "English (India)", name: "English" },
  { value: "en-GB", label: "English (UK)", name: "English" },
  { value: "hi-IN", label: "हिन्दी (Hindi)", name: "Hindi" },
  { value: "mr-IN", label: "मराठी (Marathi)", name: "Marathi" },
  { value: "gu-IN", label: "ગુજરાતી (Gujarati)", name: "Gujarati" },
  { value: "bn-IN", label: "বাংলা (Bengali)", name: "Bengali" },
  { value: "ta-IN", label: "தமிழ் (Tamil)", name: "Tamil" },
  { value: "te-IN", label: "తెలుగు (Telugu)", name: "Telugu" },
  { value: "kn-IN", label: "ಕನ್ನಡ (Kannada)", name: "Kannada" },
  { value: "ml-IN", label: "മലയാളം (Malayalam)", name: "Malayalam" },
  { value: "pa-IN", label: "ਪੰਜਾਬੀ (Punjabi)", name: "Punjabi" },
  { value: "ur-IN", label: "اردو (Urdu)", name: "Urdu" },
  { value: "es-ES", label: "Español (Spanish)", name: "Spanish" },
  { value: "pt-BR", label: "Português (Portuguese)", name: "Portuguese" },
  { value: "fr-FR", label: "Français (French)", name: "French" },
  { value: "de-DE", label: "Deutsch (German)", name: "German" },
  { value: "it-IT", label: "Italiano (Italian)", name: "Italian" },
  { value: "ru-RU", label: "Русский (Russian)", name: "Russian" },
  { value: "tr-TR", label: "Türkçe (Turkish)", name: "Turkish" },
  { value: "ar-SA", label: "العربية (Arabic)", name: "Arabic" },
  { value: "id-ID", label: "Bahasa Indonesia", name: "Indonesian" },
  { value: "vi-VN", label: "Tiếng Việt (Vietnamese)", name: "Vietnamese" },
  { value: "th-TH", label: "ไทย (Thai)", name: "Thai" },
  { value: "zh-CN", label: "中文 (Chinese)", name: "Chinese (Simplified)" },
  { value: "ja-JP", label: "日本語 (Japanese)", name: "Japanese" },
  { value: "ko-KR", label: "한국어 (Korean)", name: "Korean" },
];

const PREFS_KEY = "tv:voicePrefs";
const readPrefs = (): { replies?: boolean; lang?: string } => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { return {}; }
};

const recognitionClass = (): any =>
  typeof window === "undefined" ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

let state: VoiceState = {
  supported: false, canSpeak: false, listening: false, hearing: "", speaking: false, thinking: false, pending: null, replies: true, lang: "en-US", messages: [], error: null,
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
function removeMessage(id: number) {
  set({ messages: state.messages.filter(m => m.id !== id) });
}

export function setVoicePrefs(p: { replies?: boolean; lang?: string }) {
  init();
  set(p);
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ replies: state.replies, lang: state.lang })); } catch { /* full */ }
  if (p.replies === false) { try { window.speechSynthesis?.cancel(); } catch { /* none */ } }
  if (p.lang && state.listening) { stopRecognition(); startRecognition(); }
}

// ---- speaking -------------------------------------------------------------------------------
// A clear voice in the chosen language (its country's first, then the same language anywhere): the
// browser's natural / online ones first. None in that language: the language's code is still set,
// so the browser reads it as best it can
function pickVoice(): SpeechSynthesisVoice | null {
  let voices: SpeechSynthesisVoice[] = [];
  try { voices = window.speechSynthesis.getVoices(); } catch { return null; }
  const lang = state.lang.toLowerCase().replace("_", "-");
  const base = lang.split("-")[0];
  const same = voices.filter(v => v.lang.toLowerCase().replace("_", "-").split("-")[0] === base);
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase().replace("_", "-") === lang ? 4 : 0) + (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google|aria|jenny|samantha|zira|heera|neerja/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
  return same.sort((a, b) => score(b) - score(a))[0] ?? null;
}

let speakQueue: Promise<void> = Promise.resolve();
// The line being said (to cut it short when the trader talks over it, and to tell its echo from them)
let speakingNow: { id: number; text: string; spokenTo: number; cut: boolean } | null = null;
let speechGen = 0;              // bumped by an interruption: lines waiting to be said are dropped
let lastSpoken = { text: "", at: 0 };

// Shows a reply in the chat and says it. The chat shows the words as they're spoken, and only those:
// a line that's cut short keeps what was said
function say(text: string, extra?: Partial<VoiceMessage>): Promise<void> {
  const speak = state.replies && state.canSpeak;
  if (!speak) { push({ from: "assistant", text, ...extra }); return Promise.resolve(); }
  const gen = speechGen;
  speakQueue = speakQueue.then(() => new Promise<void>(resolve => {
    // (talked over before its turn: not said, not shown)
    if (gen !== speechGen) { resolve(); return; }
    const id = push({ from: "assistant", text, spokenTo: 0, ...extra });
    const me = { id, text, spokenTo: 0, cut: false };
    speakingNow = me;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (!me.cut) patchMessage(id, { spokenTo: undefined });
      if (speakingNow === me) speakingNow = null;
      lastSpoken = { text, at: Date.now() };
      set({ speaking: false });
      resolve();
    };
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v?.lang || state.lang;   // (no voice for it: the language still tells the browser how to read it)
      u.rate = 1.03;
      u.onstart = () => { set({ speaking: true }); };
      u.onboundary = (e: SpeechSynthesisEvent) => {
        if (e.name && e.name !== "word" || me.cut) return;
        const end = text.indexOf(" ", e.charIndex + 1);
        me.spokenTo = end < 0 ? text.length : end;
        patchMessage(id, { spokenTo: me.spokenTo });
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

// The trader talked (or typed) over the assistant: it stops at once, the line keeps what was said,
// and what was still waiting to be said is dropped
export function interruptSpeaking() {
  speechGen++;
  const cur = speakingNow;
  speakingNow = null;
  if (cur && !cur.cut) {
    cur.cut = true;
    const said = cur.text.slice(0, cur.spokenTo).trimEnd();
    if (said) patchMessage(cur.id, { text: `${said}…`, spokenTo: undefined }); else removeMessage(cur.id);
    lastSpoken = { text: cur.text, at: Date.now() };
  }
  try { window.speechSynthesis.cancel(); } catch { /* none */ }
  set({ speaking: false });
}

// Is what the mic heard the assistant's own voice (from the speakers)? Most of its words are in
// what's being said; for languages without spaces, most of its character pairs
const NOT_WORD = new RegExp("[^\\p{L}\\p{M}\\p{N}\\s]", "gu");   // (letters, their marks and digits of any script)
const normText = (t: string) => t.toLowerCase().normalize("NFKC").replace(NOT_WORD, " ").replace(/\s+/g, " ").trim();
function isEcho(heard: string, spoken: string): boolean {
  const h = normText(heard), sp = normText(spoken);
  if (!h) return true;
  if (!sp) return false;
  if (sp.includes(h)) return true;
  const hw = h.split(" ");
  if (hw.length >= 2) {
    const sw = new Set(sp.split(" "));
    return hw.filter(w => sw.has(w)).length / hw.length >= 0.6;
  }
  const pairs = (x: string) => { const out = new Set<string>(); const c = x.replace(/ /g, ""); for (let i = 0; i < c.length - 1; i++) out.add(c.slice(i, i + 2)); return out; };
  const hp = pairs(h), sp2 = pairs(sp);
  if (hp.size < 2) return true;                    // too short to tell: not taken as the trader
  let hit = 0; hp.forEach(b => { if (sp2.has(b)) hit++; });
  return hit / hp.size >= 0.6;
}
// Enough to be the trader talking (a word or two, not a cough)
const substantial = (t: string) => { const n = normText(t); return n.split(" ").length >= 2 || n.replace(/ /g, "").length >= 4; };

// ---- listening ------------------------------------------------------------------------------
let rec: any = null;
let quietRestart = false;
const PAUSE_MS = 1200;          // the pause that ends a spoken command
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
  r.maxAlternatives = 3;
  // A pause after speaking ends the command: what was heard runs at once while the mic stays on
  // (the browser can hold a sentence back as "not final" until the mic is turned off). The session
  // starts afresh after it, so the same words don't come back as a final result.
  let pending = "";
  let pauseTimer: ReturnType<typeof setTimeout> | undefined;
  const endOnPause = () => {
    clearTimeout(pauseTimer);
    if (!pending) return;
    pauseTimer = setTimeout(() => {
      if (rec !== r || !pending) return;
      const t = pending;
      pending = "";
      set({ hearing: "" });
      quietRestart = true;
      try { r.abort(); } catch { /* ended */ }
      handleText(t);
    }, PAUSE_MS);
  };
  r.onresult = (e: any) => {
    let interim = "";
    // (what it's saying now, or said a moment ago: the speakers' sound reaching the mic)
    const echoOf = speakingNow ? speakingNow.text : Date.now() - lastSpoken.at < 1500 ? lastSpoken.text : "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const text = (res[0]?.transcript ?? "").trim();
      if (echoOf && isEcho(text, echoOf)) continue;
      if (state.speaking && substantial(text)) interruptSpeaking();
      if (res.isFinal) {
        set({ hearing: "" });
        // (what speech recognition also thought it heard: the AI picks the one that makes sense)
        const alts = Array.from({ length: res.length }, (_, k) => (res[k]?.transcript ?? "").trim()).slice(1).filter(x => x && x !== text);
        clearTimeout(pauseTimer);
        pending = "";
        if (text) handleText(text, alts);
      } else interim += `${text} `;
    }
    set({ hearing: interim.trim() });
    pending = interim.trim();
    endOnPause();
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
    if (!state.listening) return;
    // (a command ended by a pause restarts it on purpose: not counted as the browser stopping it)
    if (quietRestart) { quietRestart = false; setTimeout(() => { if (state.listening && !rec) startRecognition(); }, 60); return; }
    const now = Date.now();
    restarts = restarts.filter(t => now - t < 10000);
    if (restarts.length > 6) { stopListening(); set({ error: "Listening keeps stopping. Click the microphone to try again." }); return; }
    restarts.push(now);
    setTimeout(() => { if (state.listening && !rec) startRecognition(); }, 250);
  };
  try { r.start(); } catch { /* already started */ }
}

function stopRecognition() {
  const r = rec;
  rec = null;
  try { r?.abort(); } catch { /* none */ }
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
    say("I'm listening. Ask me anything, or tell me what to do: open gold on the 15 minute, mark the order blocks, or backtest gold from 1 March 2024.");
  }
}
export function stopListening() {
  set({ listening: false, hearing: "" });
  stopRecognition();
}
export function toggleListening() { (state.listening ? stopListening : startListening)(); }

// ---- doing ----------------------------------------------------------------------------------
const fire = (name: string, detail?: any) => window.dispatchEvent(new CustomEvent(name, { detail }));

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

// Numbers read out naturally ("2,650.45" rather than "2650.4500"), dates as "1 March 2024"
const spokenNumber = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 6 });
const spokenDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// ---- bigger actions wait for a yes -------------------------------------------------------------
// Creating a backtest session and clearing all the marks are asked first ("… Say yes or no"). The
// answer is read here, not by the AI: a yes runs it (and any actions the AI asked for after it),
// a no drops it, anything else drops it and goes to the AI as usual.
type Confirm = { intent: Intent; then: Intent[]; at: number; reply?: string };   // reply: the AI's words, said once it's done
let confirmPending: Confirm | null = null;
const CONFIRM_MS = 120_000;
// Yes / no in the languages it speaks (the answer's first word or phrase)
const YES_WORDS = ["yes", "yeah", "yep", "yup", "sure", "ok", "okay", "do it", "go ahead", "confirm", "please do", "correct", "go for it", "create it", "absolutely",
  "हाँ", "हां", "हा", "जी", "जी हाँ", "ठीक है", "कर दो", "होय", "हो", "हा ना", "હા", "হ্যাঁ", "ஆம்", "சரி", "అవును", "సరే", "ಹೌದು", "ಸರಿ", "അതെ", "ശരി", "ਹਾਂ", "جی", "ہاں",
  "haan", "han", "ha", "theek hai", "sí", "si", "claro", "vale", "sim", "oui", "d'accord", "ja", "jawohl", "certo", "да", "evet", "tamam", "نعم", "أجل", "ya", "iya", "có", "vâng",
  "ใช่", "ตกลง", "是", "好", "对", "可以", "はい", "うん", "네", "예"];
const NO_WORDS = ["no", "nope", "nah", "don't", "dont", "cancel", "stop", "never mind", "nevermind", "forget it", "abort", "wait",
  "नहीं", "नही", "ना", "मत", "रहने दो", "नको", "ના", "না", "இல்லை", "వద్దు", "కాదు", "ಬೇಡ", "ಇಲ್ಲ", "വേണ്ട", "ഇല്ല", "ਨਹੀਂ", "نہیں",
  "nahi", "nahin", "mat", "non", "nein", "não", "nao", "нет", "hayır", "hayir", "لا", "tidak", "jangan", "không", "ไม่", "不", "不要", "いいえ", "いや", "아니요", "아니"];
const startsWithWord = (words: string[]) => (t: string) => words.some(w => t === w || t.startsWith(w + " "));
const YES = { test: startsWithWord(YES_WORDS) };
const NO = { test: startsWithWord(NO_WORDS) };
function askConfirm(question: string, intent: Intent) {
  confirmPending = { intent, then: [], at: Date.now() };
  set({ pending: { question, options: ["Yes", "No"] } });
  say(question);
}
function clearConfirm() {
  confirmPending = null;
  if (state.pending) set({ pending: null });
}

// A backtest session's details: the AI's, else the chart's symbol and timeframe, 10,000 balance
type BacktestPlan = { symbol: string; interval: string; label: string; start: number; startIso: string; balance: number; length: { value: number; unit: any } | null; name: string };
function backtestPlan(intent: Extract<Intent, { kind: "backtest_new" }>): BacktestPlan | string {
  const chart = getChartInfo();
  const symbol = intent.symbol || chart?.symbol;
  if (!symbol) return "Which symbol should it be on?";
  const iv: Interval | undefined = intent.interval ?? intervalByValue(chart?.interval);
  const interval = iv?.value ?? chart?.interval ?? "15min";
  const label = iv?.label ?? interval;
  const start = Math.floor(Date.parse(`${intent.start}T00:00:00Z`) / 1000);
  if (!(start > 0) || start * 1000 > Date.now()) return "The start date has to be in the past. From which date should it start?";
  const length = intent.length ?? null;
  if (length && endOf(start, length) * 1000 > Date.now()) return `${length.value} ${length.unit} from ${spokenDate(intent.start!)} runs past today. Start earlier, or test less?`;
  const balance = intent.balance && intent.balance > 0 ? intent.balance : 10000;
  return { symbol, interval, label, start, startIso: intent.start!, balance, length, name: `${displaySymbol(symbol)} ${label} backtest` };
}

// Does an action the AI asked for. `reply` (the AI's) is said instead of the usual confirmation;
// `quiet` (its second and third actions) says nothing when it worked; `confirmed`: the trader
// has said yes to it
async function run(intent: Intent, reply?: string, quiet = false, confirmed = false) {
  const confirm = (usual: string, extra?: Partial<VoiceMessage>) => (quiet ? Promise.resolve() : say(reply || usual, extra));
  switch (intent.kind) {
    case "symbol":
      fire("tv:set-symbol", { symbol: intent.symbol });
      if (intent.interval) fire("tv:set-interval", { interval: intent.interval.value });
      confirm(`Opening ${displaySymbol(intent.symbol)}${intent.interval ? ` on the ${intent.interval.spoken} chart` : ""}.`);
      return;
    case "interval":
      fire("tv:set-interval", { interval: intent.interval.value });
      confirm(`Switched to the ${intent.interval.spoken} chart.`);
      return;
    case "pine":
      fire("tv:pine-editor", { open: intent.open });
      confirm(intent.open ? "Here's the Pine Editor." : "Closed the Pine Editor.");
      return;
    case "backtest_new": {
      // (the AI should have asked for a start date; if not, ask: the answer goes back to it)
      if (!intent.start) { chainStop = true; say("From which date should the backtest start? For example: 1 March 2024."); return; }
      const plan = backtestPlan(intent);
      if (typeof plan === "string") { say(plan); return; }
      if (!confirmed) {
        askConfirm(`Create a backtest on ${displaySymbol(plan.symbol)} ${plan.label} from ${spokenDate(plan.startIso)} with ${spokenNumber(plan.balance)} dollars${plan.length ? `, for ${plan.length.value} ${plan.length.unit}` : ""}? Say yes or no.`, intent);
        return;
      }
      await createBacktest(plan);
      return;
    }
    case "mark": {
      const done: string[] = [];
      const none: string[] = [];
      for (const k of intent.what) {
        const r = markOnChart(k);
        if (!r.ok) { say("The chart has no bars to look at yet."); return; }
        if (!r.count) { none.push(MARK_NAMES[k]); continue; }
        const sides = k === "support_resistance" ? `${r.bull} support, ${r.bear} resistance` : `${r.bull} bullish, ${r.bear} bearish`;
        done.push(`${r.count} ${r.count === 1 ? MARK_NAMES[k].replace(/s$/, "").replace(/levels$/, "level") : MARK_NAMES[k]} (${sides})`);
      }
      // (the counts are the site's, so they're said even when the AI gave its own reply)
      const result = (done.length ? `Marked ${done.join(" and ")} on the visible bars.` : "")
        + (none.length ? ` I found no ${none.join(" or ")} still in play there; zoom out to look further back.` : "");
      if (!quiet) say(result.trim());
      return;
    }
    case "clear_marks": {
      if (intent.what?.length) {
        intent.what.forEach(k => clearMarks(k));
        confirm(`Cleared the ${intent.what.map(k => MARK_NAMES[k]).join(" and ")}.`);
        return;
      }
      const n = countMarks();
      if (!n) { say("There are no marks of mine on the chart."); return; }
      if (!confirmed) { askConfirm(`Remove all ${n} marks I made? Say yes or no.`, intent); return; }
      clearMarks();
      say("Cleared everything I marked.");
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
      // (this site has the light and dark themes: the page switches, the chart's colours follow)
      fire("tv:set-theme", { theme: intent.base });
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
        chainStop = true;
        say("From which date? For example: 1 March 2024. Or say: a random date.");
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
    case "stop":
      await say(reply || "Okay, I've stopped listening.");
      stopListening();
      return;
    case "command":
      await runCommand(intent, confirmed, usual => { confirm(usual); });
      return;
    case "drawing_tool": {
      const tool = findTool(intent.name);
      if (!tool) { say(`I don't have a drawing tool called ${intent.name}.`); return; }
      if (!pickTool(tool.type)) { say("Open the chart to draw."); return; }
      confirm(`Picked the ${tool.label} tool. Click on the chart to draw.`);
      return;
    }
    case "collab_start":
      await startCollab(intent, confirmed);
      return;
    case "collab_invite":
      await inviteToCollab(intent, confirmed);
      return;
    case "collab_link":
      copyCollabLink();
      return;
    case "call":
      await callFunction(intent, confirmed, reply, quiet);
      return;
  }
}

// A function with inputs: asked first when it needs a yes, then run; what it returns is said. A
// question it raises (a name matching several people…) is said too: the answer goes to the AI
async function callFunction(intent: Extract<Intent, { kind: "call" }>, confirmed: boolean, reply?: string, quiet = false) {
  const f = voiceFunction(intent.fn);
  if (!f) { say("I can't do that here right now."); return; }
  try {
    if (f.confirm && !confirmed) {
      const q = await f.confirm(intent.args);
      if (q) { askConfirm(q, intent); return; }
    }
    const out = await f.run(intent.args);
    if (out || !quiet) say(out || reply || "Done.");
  } catch (e: any) {
    // (a question back to the trader: the actions after this one wait for their answer)
    if (e instanceof VoiceQuestion) chainStop = true;
    say(e?.message || "Something went wrong doing that.");
  }
}

// ---- the site's registered controls, drawing tools ----------------------------------------------
async function runCommand(intent: Extract<Intent, { kind: "command" }>, confirmed: boolean, done: (usual: string) => void) {
  const c = voiceCommand(intent.id);
  if (!c) { say("I can't do that here right now."); return; }
  if (c.confirm && !confirmed) {
    const q = c.confirm();
    if (q) { askConfirm(q, intent); return; }
  }
  await c.run();
  done("Done.");
}

// ---- collabs ----------------------------------------------------------------------------------
type Found = { label: string; query: string; role: "editor" | "viewer" };

// The people named, found as the Collaborate dialog finds them. A name that matches nobody, or
// several people, comes back as a question (the answer goes to the AI with the conversation)
async function findPeople(list: Invitee[]): Promise<Found[] | string> {
  const out: Found[] = [];
  for (const p of list) {
    const who = p.who.trim();
    if (!who) continue;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who)) { out.push({ label: who, query: who, role: p.role }); continue; }
    let people: Person[] = [];
    try { people = (await collabApi<{ people: Person[] }>(voiceUid!, `people/?q=${encodeURIComponent(who)}`)).people || []; } catch { people = []; }
    const exact = people.filter(x => x.name.toLowerCase() === who.toLowerCase());
    const pick = exact.length === 1 ? exact : people;
    if (pick.length === 1) { out.push({ label: pick[0].name, query: pick[0].email || pick[0].uid, role: p.role }); continue; }
    if (!pick.length) return `I couldn't find anyone called ${who}. What's their email, or their name as it shows on the site?`;
    return `Which ${who}? ${pick.slice(0, 4).map(x => `${x.name}${x.email ? `, ${x.email}` : ""}`).join("; or ")}.`;
  }
  return out;
}
const peopleText = (found: Found[]) => found.map(f => `${f.label} as ${f.role}`).join(", ");

async function startCollab(intent: Extract<Intent, { kind: "collab_start" }>, confirmed: boolean) {
  if (!voiceUid) { say("Sign in to start a collab."); return; }
  if (collab.get().room && collab.get().status !== "idle" && collab.get().status !== "ended") {
    say("You're already in a collab. Leave it first to start another, or ask me to invite people to this one.");
    return;
  }
  const chart = getChartInfo();
  if (!chart?.symbol) { say("Open a chart first: a collab shares it."); return; }
  const found = intent.invite?.length ? await findPeople(intent.invite) : [];
  if (typeof found === "string") { say(found); return; }
  const name = (intent.name || "").trim() || `${displaySymbol(chart.symbol)} analysis`;
  const allowRequests = intent.allowRequests ?? true, allowVoice = intent.allowVoice ?? true;
  const label = voiceContext<string>("interval-label") || chart.interval;
  if (!confirmed) {
    askConfirm(`Start a collab called ${name} on ${displaySymbol(chart.symbol)} ${label}${found.length ? `, inviting ${peopleText(found)}` : ", with nobody invited yet"}? `
      + `${allowRequests ? "People with the link can ask to join" : "Nobody can ask to join"}, and ${allowVoice ? "everyone can use their mic" : "only you can talk"}. Say yes or no.`, intent);
    return;
  }
  set({ thinking: true });
  try {
    const drawings = ((window as any).__drawings || []).filter((d: any) => d.type !== "measure");
    const room = await collabApi<RoomInfo>(voiceUid, "rooms/", { method: "POST", body: {
      name, symbol: chart.symbol, interval: chart.interval, indicators: voiceContext<any[]>("indicators") || [], drawings,
      pine: (window as any).__pineScript ?? null, link_access: "edit", allow_requests: allowRequests, allow_voice: allowVoice,
    } });
    await openCollab(room.token, voiceUid);
    const invited = found.length ? await invitePeople(room.token, found) : { added: [] as string[], failed: [] as string[] };
    set({ thinking: false });
    say(`Started the collab ${name}.`
      + (invited.added.length ? ` Invited ${invited.added.join(", ")}: they'll see it when they open the site.` : "")
      + (invited.failed.length ? ` I couldn't invite ${invited.failed.join(", ")}.` : "")
      + (found.length ? "" : " Say invite and a name to add people, or copy the link to share it."));
  } catch (e: any) {
    set({ thinking: false });
    say(`I couldn't start the collab${e?.message ? `: ${e.message}` : ""}.`);
  }
}

// Invites people to a collab, those for each role together (as the dialog does)
async function invitePeople(token: string, found: Found[]): Promise<{ added: string[]; failed: string[] }> {
  const added: string[] = [], failed: string[] = [];
  for (const role of ["editor", "viewer"] as const) {
    const group = found.filter(f => f.role === role);
    if (!group.length) continue;
    try {
      const res = await collabApi<{ added: Member[]; errors: { query: string; error: string }[] }>(voiceUid!, `room/${token}/invite/`, { method: "POST", body: { people: group.map(g => g.query), role } });
      res.added.forEach(m => added.push(m.name));
      res.errors.forEach(e => failed.push(group.find(g => g.query === e.query)?.label ?? e.query));
    } catch { group.forEach(g => failed.push(g.label)); }
  }
  return { added, failed };
}

async function inviteToCollab(intent: Extract<Intent, { kind: "collab_invite" }>, confirmed: boolean) {
  if (!voiceUid) { say("Sign in first."); return; }
  const room = collab.get().room;
  if (!room) { say("You're not in a collab. Shall I start one?"); return; }
  if (room.role !== "owner" && !room.perms?.invite) { say("Only the collab's owner, or someone they allow, can invite people to it."); return; }
  const found = await findPeople(intent.invite);
  if (typeof found === "string") { say(found); return; }
  if (!found.length) { say("Who should I invite?"); return; }
  if (!confirmed) { askConfirm(`Invite ${peopleText(found)} to ${room.name}? Say yes or no.`, intent); return; }
  set({ thinking: true });
  const r = await invitePeople(room.token, found);
  set({ thinking: false });
  say((r.added.length ? `Invited ${r.added.join(", ")}.` : "") + (r.failed.length ? ` I couldn't invite ${r.failed.join(", ")}.` : ""));
}

function copyCollabLink() {
  const room = collab.get().room;
  if (!room) { say("You're not in a collab."); return; }
  const link = collabLink(room.token);
  navigator.clipboard?.writeText(link).then(() => say("Copied the collab's link. Paste it to anyone you want to share it with."), () => say(`The link is ${link}`));
}

// ---- the AI ------------------------------------------------------------------------------------
let voiceUid: string | null = null;
// The signed-in user (the AI answers per account: its requests are counted per user)
export function setVoiceUser(uid: string | null) { voiceUid = uid; }

const PANEL_LABELS: Record<string, string> = { watchlist: "watchlist", alerts: "alerts", object_tree: "object tree", collab: "collabs", chats: "chats", notifications: "notifications", backtest_sessions: "backtest sessions" };

// An action the AI sent back (already checked on the server) → what run() does
function intentOf(a: any): Intent | null {
  switch (a?.type) {
    case "symbol": return typeof a.symbol === "string" ? { kind: "symbol", symbol: a.symbol, interval: intervalByValue(a.interval) } : null;
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
    case "stop": return { kind: "stop" };
    case "command": return typeof a.id === "string" ? { kind: "command", id: a.id } : null;
    case "drawing_tool": return typeof a.name === "string" ? { kind: "drawing_tool", name: a.name } : null;
    case "collab_start": return {
      kind: "collab_start", name: typeof a.name === "string" ? a.name : undefined, invite: invitees(a.invite),
      allowRequests: typeof a.ask_to_join === "boolean" ? a.ask_to_join : undefined, allowVoice: typeof a.everyone_mic === "boolean" ? a.everyone_mic : undefined,
    };
    case "collab_invite": { const inv = invitees(a.invite); return inv.length ? { kind: "collab_invite", invite: inv } : null; }
    case "collab_link": return { kind: "collab_link" };
    case "call": return typeof a.fn === "string" ? { kind: "call", fn: a.fn, args: a.args && typeof a.args === "object" ? a.args : {} } : null;
    default: return null;
  }
}

const invitees = (list: any): Invitee[] => (Array.isArray(list) ? list : [])
  .filter((x: any) => x && typeof x.who === "string" && x.who.trim())
  .map((x: any) => ({ who: x.who.trim(), role: x.role === "viewer" ? "viewer" : "editor" }));

// ---- backtest sessions, made by voice ----------------------------------------------------------
async function createBacktest(plan: BacktestPlan) {
  if (!voiceUid) { say("Sign in to create backtest sessions: they're saved to your account."); return; }
  set({ thinking: true });
  try {
    const s = await createSession(voiceUid, {
      name: plan.name, symbol: plan.symbol, interval: plan.interval, interval_label: plan.label, start_time: plan.start, initial_balance: plan.balance,
      account: freshAccount(`Backtest · ${plan.name}`, plan.balance), book: {} as any, length: plan.length,
    });
    set({ thinking: false });
    // (opened on this chart, as the replay menu's sessions are)
    fire(OPEN_SESSION_EVENT, { id: s.id });
    say(`Created the ${plan.name} and opened it.`);
  } catch (e: any) {
    set({ thinking: false });
    say(`I couldn't create the session${e?.message ? `: ${e.message}` : ""}.`);
  }
}

async function askAI(text: string, alternatives: string[] = []) {
  if (!voiceUid) { say("Sign in to use the voice assistant: it answers through your account."); return; }
  const p = currentPrice();
  const chart = getChartInfo();
  const chartSymbol = chart?.symbol || tradingUi.get().chartSymbol;
  // (the conversation so far, so it can follow up on its own questions)
  const history = state.messages.slice(0, -1).slice(-8).map(m => ({ from: m.from, text: m.text }));
  set({ thinking: true });
  try {
    const res = await backendFetch(`${BACKEND_URL}/api/users/voice/ask/${voiceUid}/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      // (the symbol as the site writes it, "XAU/USD", so the AI answers in the same form)
      body: JSON.stringify({ text, alternatives: alternatives.slice(0, 3), history, context: {
        symbol: chartSymbol || null, interval: chart?.interval ?? null, price: p?.price ?? null,
        commands: voiceCommands().map(c => c.id),
        functions: voiceFunctions().map(f => f.signature),
        collab: collab.get().room ? { name: collab.get().room!.name, role: collab.get().room!.role } : null,
        lang: state.lang, language: VOICE_LANGS.find(l => l.value === state.lang)?.name ?? "English",
      } }),
    });
    const data = await res.json().catch(() => ({}));
    set({ thinking: false });
    if (!res.ok) {
      say(data?.error === "not_configured" ? "My AI isn't set up on the server yet."
        : data?.error === "daily_limit" ? "You've used today's voice assistant answers. Try again tomorrow."
        : data?.error === "busy" ? "I'm getting too many requests right now. Try again in a minute."
        : "I couldn't reach my AI just now. Try again in a moment.");
      return;
    }
    // up to three actions, in order: the reply is said with the first, the others quietly. One
    // that needs a yes stops there; the rest wait for the answer
    const intents = (Array.isArray(data.actions) ? data.actions : [data.action]).map(intentOf).filter((x: Intent | null): x is Intent => !!x);
    const reply = typeof data.reply === "string" && data.reply ? data.reply : undefined;
    if (!intents.length) { say(reply ?? "Sorry, I don't have an answer for that."); return; }
    await runChain(intents, reply);
  } catch {
    set({ thinking: false });
    say("I couldn't reach my AI just now. Try again in a moment.");
  }
}

// What was heard (or typed) → the chat, then the AI (or the answer to a yes / no question)
export function handleText(text: string, alternatives: string[] = []) {
  init();
  const t = text.trim();
  if (!t) return;
  if (state.speaking || speakingNow) interruptSpeaking();
  push({ from: "user", text: t });
  set({ error: null });
  if (confirmPending && Date.now() - confirmPending.at > CONFIRM_MS) clearConfirm();
  if (confirmPending) {
    const c = confirmPending;
    const low = t.toLowerCase().replace(/[.!?,।。！？、]+/g, " ").replace(/\s+/g, " ").trim();
    if (YES.test(low)) {
      clearConfirm();
      queue(() => runChain([c.intent, ...c.then], c.intent.kind === "command" ? c.reply : undefined, true));
      return;
    }
    clearConfirm();
    if (NO.test(low)) { say("Okay, I won't."); return; }
  }
  queue(() => askAI(t, alternatives));
}

// One request at a time, in the order they came (speech can split a sentence into two)
let queueTail: Promise<void> = Promise.resolve();
function queue(job: () => Promise<void>) {
  queueTail = queueTail.then(job).catch(() => { say("Something went wrong doing that."); });
}

// ---- several actions in one go -------------------------------------------------------------------
// One after another. After one that changes what the chart shows (symbol, timeframe, date range,
// layout) the next waits until the chart has its new bars, so "switch to EUR/USD and mark the order
// blocks" marks EUR/USD's. A question (a function asking which one…) stops there: the rest would
// guess; a yes / no question keeps them for after the yes.
let chainStop = false;
async function runChain(intents: Intent[], reply?: string, firstConfirmed = false) {
  chainStop = false;
  for (let i = 0; i < intents.length; i++) {
    const before = getChartInfo();
    const barsBefore = getChartBars().length;
    await run(intents[i], i === 0 ? reply : undefined, i > 0, firstConfirmed && i === 0);
    if (confirmPending) { confirmPending.then = intents.slice(i + 1); if (i === 0) confirmPending.reply = reply; return; }
    if (chainStop) return;
    if (i < intents.length - 1 && changesChart(intents[i])) await chartSettled(intents[i], before, barsBefore);
  }
}
function changesChart(it: Intent): boolean {
  return it.kind === "symbol" || it.kind === "interval" || it.kind === "replay"
    || (it.kind === "command" && /^(range-|layout-|replay-)/.test(it.id))
    || (it.kind === "call" && (it.fn === "layout_open" || it.fn === "go_to_date"));
}
async function chartSettled(it: Intent, before: { symbol: string; interval: string } | null, barsBefore: number) {
  const norm = (s?: string) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const want = (info: { symbol: string; interval: string } | null) => {
    if (!info) return false;
    if (it.kind === "symbol") return norm(info.symbol) === norm(it.symbol) && (!it.interval || info.interval === it.interval.value);
    if (it.kind === "interval") return info.interval === it.interval.value;
    return true;
  };
  const start = Date.now();
  let stable = 0, lastCount = -1;
  while (Date.now() - start < 8000) {
    await new Promise(r => setTimeout(r, 150));
    const n = getChartBars().length;
    const info = getChartInfo();
    // (a switch: the chart says the new symbol / timeframe, its bars have changed and stopped changing)
    const switched = want(info) && (it.kind !== "symbol" && it.kind !== "interval" ? true : norm(info?.symbol) !== norm(before?.symbol) || info?.interval !== before?.interval || n !== barsBefore);
    stable = n > 0 && n === lastCount ? stable + 1 : 0;
    lastCount = n;
    if (switched && stable >= 3 && Date.now() - start > 450) return;
  }
}

export function clearVoiceChat() { clearConfirm(); set({ messages: [] }); }

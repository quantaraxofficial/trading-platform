// Alert sounds: the Classic and Soft sets of TradingView's "Play sound" list, synthesized with
// Web Audio from the pitch and loudness of each original (TradingView's own recordings aren't
// ours to ship). They play at TradingView's volume (0.5) and can repeat every few seconds until
// the alert's toast is closed.

export interface AlertSound { id: string; name: string }
export const SOUND_GROUPS: { title: string; sounds: AlertSound[] }[] = [
  { title: "Classic", sounds: [
    { id: "alert/fired", name: "Thin" },
    { id: "alert/3_notes_reverb", name: "3 Notes Reverb" },
    { id: "alert/alarm_clock", name: "Alarm Clock" },
    { id: "alert/beep_beep", name: "Beep-beep" },
    { id: "alert/calling", name: "Calling" },
    { id: "alert/chirpy", name: "Chirpy" },
    { id: "alert/fault", name: "Fault" },
    { id: "alert/hand_bell", name: "Hand Bell" },
  ] },
  { title: "Soft", sounds: [
    { id: "alert/soft/banjo", name: "Banjo" },
    { id: "alert/soft/droplet", name: "Droplet" },
    { id: "alert/soft/flickering", name: "Flickering" },
    { id: "alert/soft/hoarse", name: "Hoarse" },
    { id: "alert/soft/knock-knock", name: "Knock-knock" },
    { id: "alert/soft/promise", name: "Promise" },
    { id: "alert/soft/trumpets", name: "Trumpets" },
    { id: "alert/soft/you-win", name: "You win" },
  ] },
];
export const DEFAULT_SOUND = "alert/fired";
export const SOUND_REPEATS: { label: string; seconds: number }[] = [
  { label: "Once", seconds: 0 }, { label: "3 seconds", seconds: 3 }, { label: "5 seconds", seconds: 5 },
  { label: "10 seconds", seconds: 10 }, { label: "30 seconds", seconds: 30 }, { label: "Minute", seconds: 60 },
];
export const soundName = (id: string) => SOUND_GROUPS.flatMap(g => g.sounds).find(s => s.id === id)?.name ?? "Thin";

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

type Out = AudioNode;

// A tone with partials ([frequency ratio, level]) and an attack / hold / exponential release
function tone(c: AudioContext, out: Out, at: number, freq: number, o: { partials?: [number, number][]; type?: OscillatorType; attack?: number; hold?: number; release?: number; level?: number; glideTo?: number; glideTime?: number }) {
  const { partials = [[1, 1]], type = "sine", attack = 0.005, hold = 0, release = 0.2, level = 1 } = o;
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + attack);
  g.gain.setValueAtTime(level, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  g.connect(out);
  const end = at + attack + hold + release + 0.05;
  for (const [ratio, lvl] of partials) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * ratio, at);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo * ratio, at + (o.glideTime ?? attack + hold));
    const pg = c.createGain();
    pg.gain.value = lvl;
    osc.connect(pg).connect(g);
    osc.start(at);
    osc.stop(end);
  }
  return end;
}

// A filtered noise burst (knocks, sparkle)
function noise(c: AudioContext, out: Out, at: number, o: { freq: number; q?: number; type?: BiquadFilterType; release: number; level?: number }) {
  const len = Math.ceil(c.sampleRate * (o.release + 0.05));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = o.type ?? "bandpass"; f.frequency.value = o.freq; f.Q.value = o.q ?? 4;
  const g = c.createGain();
  g.gain.setValueAtTime(o.level ?? 1, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.release);
  src.connect(f).connect(g).connect(out);
  src.start(at);
  src.stop(at + o.release + 0.05);
}

// A synthetic room: exponentially decaying noise as the impulse response
function reverb(c: AudioContext, out: Out, seconds: number, wet: number): Out {
  const len = Math.ceil(c.sampleRate * seconds);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  const input = c.createGain();
  const dry = c.createGain(); dry.gain.value = 1;
  const w = c.createGain(); w.gain.value = wet;
  input.connect(dry).connect(out);
  input.connect(conv).connect(w).connect(out);
  return input;
}

// A plucked string (banjo): bright attack with fast-decaying upper partials
const pluck = (c: AudioContext, out: Out, at: number, f: number, level = 0.6) =>
  tone(c, out, at, f, { partials: [[1, 1], [2, 0.5], [3, 0.3], [4, 0.15]], type: "triangle", attack: 0.003, release: 0.35, level });

const SYNTHS: Record<string, (c: AudioContext, out: Out, t: number) => number> = {
  // 3.77 kHz ping with its octave: full for ~110 ms, then fading over ~200 ms
  "alert/fired": (c, out, t) => tone(c, out, t, 3768, { partials: [[1, 1], [2, 0.5]], attack: 0.004, hold: 0.1, release: 0.22 }),
  // Three bell notes (2.11 kHz, 1.97 kHz, 1.31 kHz) ringing into a long room
  "alert/3_notes_reverb": (c, out, t) => {
    const r = reverb(c, out, 2.2, 0.8);
    [[2110, 0], [1970, 0.26], [1314, 0.42]].forEach(([f, d]) => tone(c, r, t + d, f, { partials: [[1, 1], [0.5, 0.3], [1.5, 0.2]], attack: 0.004, hold: 0.25, release: 1.2, level: 0.55 }));
    return t + 2.6;
  },
  // A 7.4 kHz bell hammered ~20 times a second for 0.3 s
  "alert/alarm_clock": (c, out, t) => {
    for (let i = 0; i < 6; i++) tone(c, out, t + i * 0.05, 7400, { partials: [[1, 1], [0.963, 0.2]], attack: 0.002, hold: 0.02, release: 0.04 });
    return t + 0.34;
  },
  // A steady 657 Hz beep (with its 2nd and 3rd harmonics) for a quarter of a second
  "alert/beep_beep": (c, out, t) => tone(c, out, t, 657, { partials: [[1, 1], [2, 0.3], [3, 0.2]], attack: 0.004, hold: 0.23, release: 0.04 }),
  // A 743 Hz ring that drops to a 624/495 Hz chord and fades over two seconds
  "alert/calling": (c, out, t) => {
    tone(c, out, t, 743, { partials: [[1, 1], [2, 0.7], [3, 0.6], [4 / 3, 0.5]], attack: 0.02, hold: 0.32, release: 0.08, level: 0.7 });
    tone(c, out, t + 0.4, 624, { partials: [[1, 1], [2, 0.6], [495 / 624, 0.7], [991 / 624, 0.4]], attack: 0.01, hold: 0.3, release: 1.6, level: 0.6 });
    return t + 2.4;
  },
  // A short chirp gliding up to ~3.46 kHz
  "alert/chirpy": (c, out, t) => tone(c, out, t, 2600, { glideTo: 3460, glideTime: 0.04, partials: [[1, 1]], attack: 0.03, hold: 0.03, release: 0.06 }),
  // Two clashing tones (1.91 and 2.19 kHz): an error buzz for a third of a second
  "alert/fault": (c, out, t) => {
    tone(c, out, t, 1906, { type: "square", partials: [[1, 0.5]], attack: 0.003, hold: 0.3, release: 0.04, level: 0.5 });
    tone(c, out, t, 2186, { type: "square", partials: [[1, 0.5]], attack: 0.003, hold: 0.3, release: 0.04, level: 0.5 });
    return t + 0.36;
  },
  // A small bell shaken: bright inharmonic strikes for ~1.3 s, then the ring dies away
  "alert/hand_bell": (c, out, t) => {
    const strikes = [0, 0.12, 0.31, 0.43, 0.55, 0.64, 0.84, 0.95, 1.05, 1.15, 1.27];
    strikes.forEach((d, i) => tone(c, out, t + d, 5006, { partials: [[1, 0.8], [8581 / 5006, 0.9], [9259 / 5006, 0.6], [10853 / 5006, 0.7]], attack: 0.002, release: i === strikes.length - 1 ? 0.6 : 0.25, level: 0.45 }));
    tone(c, out, t + 1.2, 1755, { attack: 0.01, release: 0.6, level: 0.15 });
    return t + 1.9;
  },
  // A banjo phrase
  "alert/soft/banjo": (c, out, t) => {
    const notes = [194, 258, 495, 334, 592, 388, 301, 312, 592, 388, 700, 463, 345, 345, 668, 441, 786, 517, 441, 474, 463, 581, 700, 463, 700, 463];
    notes.forEach((f, i) => pluck(c, out, t + i * 0.085, f));
    return t + notes.length * 0.085 + 0.4;
  },
  // A water drop at ~5 kHz with its echoes
  "alert/soft/droplet": (c, out, t) => {
    tone(c, out, t, 1680, { glideTo: 5060, glideTime: 0.03, attack: 0.002, release: 0.06, level: 0.5 });
    for (let i = 0; i < 12; i++) tone(c, out, t + 0.05 + i * 0.065, 5060, { attack: 0.002, release: 0.05, level: Math.pow(0.78, i) });
    return t + 1.0;
  },
  // Three soft chords stepping up, the last one lingering
  "alert/soft/flickering": (c, out, t) => {
    const r = reverb(c, out, 1.5, 0.5);
    tone(c, r, t, 388, { partials: [[1, 0.4], [624 / 388, 1]], attack: 0.04, hold: 0.3, release: 0.15, level: 0.4 });
    tone(c, r, t + 0.5, 937, { partials: [[1, 1], [1572 / 937, 0.8], [1249 / 937, 0.6]], attack: 0.02, hold: 0.25, release: 0.2, level: 0.35 });
    tone(c, r, t + 1.05, 463, { partials: [[1, 1], [786 / 463, 0.9], [624 / 463, 0.55]], attack: 0.02, hold: 0.3, release: 2.0, level: 0.45 });
    return t + 3.4;
  },
  // A reedy 829 Hz horn honking five times, quieter each time
  "alert/soft/hoarse": (c, out, t) => {
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2800; lp.connect(out);
    [0, 0.64, 1.28, 1.92, 2.56].forEach((d, i) => tone(c, lp, t + d, 829, { type: "sawtooth", partials: [[1, 0.6]], attack: 0.02, hold: 0.22, release: 0.08, level: 0.5 * Math.pow(0.45, i) }));
    return t + 2.8;
  },
  // Two knocks on a door
  "alert/soft/knock-knock": (c, out, t) => {
    for (const d of [0, 0.18]) {
      noise(c, out, t + d, { freq: 270, q: 3, release: 0.16, level: 1.6 });
      tone(c, out, t + d, 129, { attack: 0.002, release: 0.15, level: 0.6 });
    }
    return t + 0.5;
  },
  // Low chimes resolving to a long held note, then a second phrase
  "alert/soft/promise": (c, out, t) => {
    const r = reverb(c, out, 2.5, 0.6);
    [[183, 0], [151, 0.4], [215, 0.75]].forEach(([f, d]) => tone(c, r, t + d, f, { partials: [[1, 1], [441 / 183, 0.5]], attack: 0.02, hold: 0.2, release: 0.5, level: 0.5 }));
    tone(c, r, t + 1.0, 592, { partials: [[1, 1], [441 / 592, 0.5]], attack: 0.05, hold: 1.0, release: 2.0, level: 0.35 });
    [[495, 3.9], [388, 4.1], [291, 4.25]].forEach(([f, d]) => tone(c, r, t + d, f, { attack: 0.01, release: 0.8, level: 0.35 }));
    return t + 5.5;
  },
  // A brass fanfare: C5, C6, then a held A4/F5/C6 chord
  "alert/soft/trumpets": (c, out, t) => {
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3000; lp.connect(out);
    const brass = (d: number, f: number, hold: number, level: number) => tone(c, lp, t + d, f, { type: "sawtooth", partials: [[1, 1]], attack: 0.03, hold, release: 0.25, level });
    brass(0, 523, 0.06, 0.25); brass(0.12, 1044, 0.35, 0.22);
    brass(0.55, 441, 2.0, 0.22); brass(0.55, 700, 2.0, 0.14); brass(0.55, 1044, 2.0, 0.12); brass(0.6, 1400, 1.9, 0.07);
    return t + 3.2;
  },
  // A jingle rising to a burst of sparkles
  "alert/soft/you-win": (c, out, t) => {
    [[151, 0], [205, 0.32], [151, 0.56], [205, 0.88], [829, 1.12], [743, 1.36], [1109, 1.6]].forEach(([f, d]) => tone(c, out, t + d, f, { type: "triangle", partials: [[1, 1], [2, 0.5], [4, 0.3]], attack: 0.01, hold: 0.12, release: 0.15, level: 0.45 }));
    for (let i = 0; i < 14; i++) tone(c, out, t + 1.9 + i * 0.08, [3500, 5006, 6783, 8904, 10680][i % 5], { attack: 0.002, release: 0.25, level: 0.12 * Math.pow(0.88, i) });
    return t + 3.3;
  },
};

// Plays one sound once. Returns a function that stops it early.
export function playAlertSound(id: string, volume = 0.5): () => void {
  const c = audio();
  if (!c) return () => {};
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(c.destination);
  (SYNTHS[id] ?? SYNTHS[DEFAULT_SOUND])(c, out, c.currentTime + 0.02);
  return () => { try { out.gain.setTargetAtTime(0, c.currentTime, 0.02); setTimeout(() => out.disconnect(), 200); } catch { /* already gone */ } };
}

// Plays a sound, again every `repeatSeconds` (0 = once) until the returned stop() is called
export function playAlertSoundRepeating(id: string, repeatSeconds: number): () => void {
  let stopCurrent = playAlertSound(id);
  if (!repeatSeconds) return stopCurrent;
  const timer = setInterval(() => { stopCurrent = playAlertSound(id); }, repeatSeconds * 1000);
  return () => { clearInterval(timer); stopCurrent(); };
}

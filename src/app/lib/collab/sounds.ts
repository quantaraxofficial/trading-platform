// The collab's notification sounds: soft bell-like chimes made with Web Audio (no audio files).
// Each note is a sine with a quiet octave-up partial, a quick attack and a long gentle decay,
// through a little echo so it sounds airy rather than beepy. Off when the user turns them off.

export type CollabSound =
  | "self-joined" | "self-left" | "joined" | "left" | "request" | "approved" | "declined"
  | "removed" | "mic-off" | "mic-on" | "notice";

const KEY = "tv:collabSounds";

// [frequency Hz, start offset s, gain]
const TUNES: Record<CollabSound, [number, number, number][]> = {
  // You: a rising C-major arpeggio in / falling out
  "self-joined": [[523.25, 0, 0.7], [659.25, 0.07, 0.7], [783.99, 0.14, 0.75], [1046.5, 0.21, 0.6]],
  "self-left": [[783.99, 0, 0.6], [659.25, 0.08, 0.55], [523.25, 0.16, 0.55]],
  // Someone else: a light two-note lift in, a softer drop out
  joined: [[783.99, 0, 0.55], [1174.66, 0.09, 0.5]],
  left: [[1174.66, 0, 0.35], [783.99, 0.1, 0.35]],
  // Someone at the door: a gentle ding-dong
  request: [[1318.51, 0, 0.5], [1046.5, 0.22, 0.5]],
  approved: [[1046.5, 0, 0.55], [1318.51, 0.07, 0.55], [1567.98, 0.14, 0.5]],
  declined: [[659.25, 0, 0.45], [523.25, 0.12, 0.45]],
  removed: [[523.25, 0, 0.5], [392, 0.14, 0.5], [329.63, 0.28, 0.45]],
  "mic-off": [[587.33, 0, 0.4], [440, 0.08, 0.4]],
  "mic-on": [[440, 0, 0.4], [587.33, 0.08, 0.4]],
  notice: [[880, 0, 0.4]],
};

let ctx: AudioContext | null = null;
let out: GainNode | null = null;

export function soundsOn(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

export function setSoundsOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage off */ }
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // Master level, then a short feedback echo mixed in quietly
    out = ctx.createGain();
    out.gain.value = 0.16;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.16;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 5200;
    out.connect(tone);
    tone.connect(ctx.destination);
    tone.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(ctx.destination);
  }
  // Browsers start audio suspended until the page has been clicked
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// The first click anywhere wakes the audio up, so sounds that come later can play
if (typeof window !== "undefined") {
  const wake = () => { if (ctx?.state === "suspended") ctx.resume().catch(() => {}); };
  window.addEventListener("pointerdown", wake, { capture: true, passive: true });
  window.addEventListener("keydown", wake, { capture: true, passive: true });
}

function note(ac: AudioContext, freq: number, at: number, level: number) {
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
  env.connect(out!);
  const body = ac.createOscillator();
  body.type = "sine";
  body.frequency.value = freq;
  body.connect(env);
  // A faint octave-up shimmer, decaying faster, gives the bell colour
  const shimmerEnv = ac.createGain();
  shimmerEnv.gain.setValueAtTime(0.0001, at);
  shimmerEnv.gain.exponentialRampToValueAtTime(level * 0.18, at + 0.01);
  shimmerEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
  shimmerEnv.connect(out!);
  const shimmer = ac.createOscillator();
  shimmer.type = "triangle";
  shimmer.frequency.value = freq * 2;
  shimmer.connect(shimmerEnv);
  body.start(at);
  shimmer.start(at);
  body.stop(at + 1.15);
  shimmer.stop(at + 0.5);
}

export function playCollabSound(kind: CollabSound) {
  if (!soundsOn()) return;
  const ac = context();
  if (!ac || ac.state !== "running" && ac.state !== "suspended") return;
  const t0 = ac.currentTime + 0.02;
  for (const [f, dt, g] of TUNES[kind]) note(ac, f, t0 + dt, g);
}

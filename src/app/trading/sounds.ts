// Execution sounds (Settings → Trading → Execution sound), synthesized with Web Audio so no
// audio files are needed. Each name is a short, distinct pattern of tones.

export const EXECUTION_SOUNDS = ["Alarm Clock", "Beep-beep", "Chirpy", "Ding", "Hand Bell", "Tick-tock"] as const;

type Tone = { f: number; start: number; dur: number; type?: OscillatorType };

const PATTERNS: Record<string, Tone[]> = {
  "Alarm Clock": [0, 0.14, 0.28, 0.42].map((t, i) => ({ f: i % 2 ? 1320 : 1760, start: t, dur: 0.1, type: "square" })),
  "Beep-beep": [{ f: 880, start: 0, dur: 0.12 }, { f: 880, start: 0.2, dur: 0.12 }],
  "Chirpy": [{ f: 1200, start: 0, dur: 0.06 }, { f: 1600, start: 0.07, dur: 0.06 }, { f: 2000, start: 0.14, dur: 0.08 }],
  "Ding": [{ f: 1318, start: 0, dur: 0.6, type: "sine" }],
  "Hand Bell": [{ f: 988, start: 0, dur: 0.35, type: "triangle" }, { f: 1319, start: 0.18, dur: 0.45, type: "triangle" }],
  "Tick-tock": [{ f: 2200, start: 0, dur: 0.03, type: "square" }, { f: 1600, start: 0.25, dur: 0.03, type: "square" }],
};

let ctx: AudioContext | null = null;

export function playExecutionSound(name: string, volume: number) {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const gainLevel = Math.max(0, Math.min(1, volume / 100)) * 0.25;
    const t0 = ctx.currentTime + 0.01;
    for (const tone of PATTERNS[name] || PATTERNS["Ding"]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type || "sine";
      osc.frequency.value = tone.f;
      gain.gain.setValueAtTime(gainLevel, t0 + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.start + tone.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + tone.start);
      osc.stop(t0 + tone.start + tone.dur + 0.02);
    }
  } catch { /* audio unavailable */ }
}

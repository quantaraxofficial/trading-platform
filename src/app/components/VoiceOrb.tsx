"use client";

// The voice assistant's orb: a glowing sphere of points turning in 3D, hanging in the panel. It grows
// and ripples with the trader's voice (the microphone's level while listening), pulses with each word
// while the assistant speaks, spins faster while it thinks, and drifts slowly at rest. Clicking it
// starts / stops listening.
//
// Drawn on a 2D canvas (a few hundred dots, no WebGL), at 30 frames a second at rest and 60 while
// active; it stops when the tab is hidden or the panel closes, and the microphone is let go as soon as
// listening stops.

import React, { useEffect, useRef } from "react";

export type OrbMode = "idle" | "listening" | "thinking" | "speaking";

// the site's purples (violet → indigo)
const LILAC: [number, number, number] = [196, 181, 253];
const VIOLET: [number, number, number] = [139, 92, 246];
const PURPLE: [number, number, number] = [124, 58, 237];
const INDIGO: [number, number, number] = [79, 70, 229];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = (c: number[], a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a.toFixed(3)})`;

// The microphone's loudness (0..1) while listening: its own stream beside speech recognition's
function useMicLevel(active: boolean) {
  const level = useRef(0);
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | null = null, ctx: AudioContext | null = null, stopped = false, raf = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        const read = () => {
          if (stopped) return;
          an.getFloatTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          // (speech is quiet in absolute terms: scaled up, gently clipped)
          level.current = Math.min(1, Math.sqrt(s / buf.length) * 7);
          raf = window.setTimeout(read, 33) as unknown as number;
        };
        read();
      } catch { /* no mic access: the orb follows what's heard instead */ }
    })();
    return () => {
      stopped = true;
      clearTimeout(raf);
      level.current = 0;
      stream?.getTracks().forEach(t => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [active]);
  return level;
}

// Points spread evenly over a sphere
const POINTS = (() => {
  const n = 240, out: { x: number; y: number; z: number; ph: number }[] = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = g * i;
    out.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, ph: Math.random() * Math.PI * 2 });
  }
  return out;
})();

export default function VoiceOrb({ mode, size, hearing, pulse, onClick, disabled, label }: {
  mode: OrbMode; size: number;
  hearing?: string;          // what's being heard (it ripples with it when there's no mic level)
  pulse?: number;            // changes with each word the assistant says
  onClick?: () => void; disabled?: boolean; label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mic = useMicLevel(mode === "listening");
  const state = useRef({ mode, hearing: hearing ?? "", pulse: pulse ?? 0, bump: 0, lastHearing: "", lastPulse: 0 });
  state.current.mode = mode;
  state.current.hearing = hearing ?? "";
  state.current.pulse = pulse ?? 0;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // (the canvas holds the orb at its biggest: room for it to grow and glow)
    const box = size * 1.7;
    cv.width = Math.round(box * dpr); cv.height = Math.round(box * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // a soft dot, drawn once and stamped (no blur per frame)
    const dot = document.createElement("canvas");
    dot.width = dot.height = 32;
    const dg = dot.getContext("2d")!;
    const rg = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.35, "rgba(255,255,255,0.55)"); rg.addColorStop(1, "rgba(255,255,255,0)");
    dg.fillStyle = rg; dg.fillRect(0, 0, 32, 32);
    const tinted = (c: number[]) => {
      const t = document.createElement("canvas"); t.width = t.height = 32;
      const tg = t.getContext("2d")!;
      tg.drawImage(dot, 0, 0); tg.globalCompositeOperation = "source-in"; tg.fillStyle = rgba(c, 1); tg.fillRect(0, 0, 32, 32);
      return t;
    };
    const dotsFront = tinted(LILAC), dotsBack = tinted(VIOLET);

    let raf = 0, timer = 0, last = performance.now(), spin = 0, level = 0, time = 0;
    const frame = (now: number) => {
      const s = state.current;
      const active = s.mode !== "idle";
      // (the next frame: at once while active; at rest, a frame every 33 ms — 30 a second, no more asked)
      if (active) raf = requestAnimationFrame(frame);
      else { raf = -1; timer = window.setTimeout(() => { raf = requestAnimationFrame(frame); }, 28); }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; time += dt;

      // how loud: the mic; else what's heard changing; the assistant's words; a slow breath at rest
      if (s.hearing !== s.lastHearing) { s.bump = Math.min(1, s.bump + 0.35); s.lastHearing = s.hearing; }
      if (s.pulse !== s.lastPulse) { s.bump = Math.min(1, s.bump + 0.45); s.lastPulse = s.pulse; }
      s.bump *= Math.pow(0.04, dt);
      let target = 0.04 + 0.03 * Math.sin(time * 1.3);
      if (s.mode === "listening") target = Math.max(mic.current * 1.15, s.bump * 0.6, 0.08);
      else if (s.mode === "speaking") target = 0.16 + 0.14 * Math.abs(Math.sin(time * 6.2)) * Math.abs(Math.sin(time * 2.3 + 1)) + s.bump * 0.35;
      else if (s.mode === "thinking") target = 0.1 + 0.05 * Math.sin(time * 4);
      level += (target - level) * Math.min(1, dt * (target > level ? 14 : 5));
      spin += dt * (reduce ? 0.15 : s.mode === "thinking" ? 1.9 : s.mode === "idle" ? 0.35 : 0.7 + level * 1.2);

      const cx = box / 2, cy = box / 2;
      const R = size * 0.36 * (1 + level * 0.38);
      g.clearRect(0, 0, box, box);

      // the glow around it
      const glow = g.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 1.75);
      glow.addColorStop(0, rgba(VIOLET, 0.28 + level * 0.3)); glow.addColorStop(0.55, rgba(PURPLE, 0.1 + level * 0.12)); glow.addColorStop(1, rgba(INDIGO, 0));
      g.fillStyle = glow;
      g.beginPath(); g.arc(cx, cy, R * 1.75, 0, Math.PI * 2); g.fill();

      // the core: a glassy sphere lit from the top left
      const core = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.05, cx, cy, R * 0.82);
      core.addColorStop(0, rgba(mix(LILAC, [255, 255, 255], 0.35), 0.95));
      core.addColorStop(0.35, rgba(VIOLET, 0.9));
      core.addColorStop(0.8, rgba(PURPLE, 0.85));
      core.addColorStop(1, rgba(INDIGO, 0.75));
      g.fillStyle = core;
      g.beginPath(); g.arc(cx, cy, R * 0.8, 0, Math.PI * 2); g.fill();

      // two rings orbiting it, tilted
      for (const [tilt, speed, alpha] of [[0.42, 1, 0.55], [-0.95, -0.7, 0.35]] as const) {
        const a = spin * speed;
        g.save();
        g.translate(cx, cy); g.rotate(tilt + Math.sin(time * 0.3) * 0.08);
        g.strokeStyle = rgba(LILAC, alpha * (0.6 + level * 0.6)); g.lineWidth = 1;
        g.beginPath(); g.ellipse(0, 0, R * 1.32, R * 0.36, 0, 0, Math.PI * 2); g.stroke();
        // (a bead running round it)
        const bx = Math.cos(a) * R * 1.32, by = Math.sin(a) * R * 0.36;
        g.globalAlpha = Math.sin(a) > 0 ? 1 : 0.45;
        g.drawImage(dotsFront, bx - 6, by - 6, 12, 12);
        g.restore();
      }

      // the shell of points, turning; rippling with the voice
      const tiltX = 0.38 + Math.sin(time * 0.45) * 0.08;
      const cY = Math.cos(spin), sY = Math.sin(spin), cX = Math.cos(tiltX), sX = Math.sin(tiltX);
      for (const p of POINTS) {
        let x = p.x * cY + p.z * sY, z = -p.x * sY + p.z * cY;
        let y = p.y * cX - z * sX; z = p.y * sX + z * cX;
        const ripple = 1 + level * 0.22 * Math.sin(p.ph + time * 5 + p.y * 4);
        x *= ripple; y *= ripple; z *= ripple;
        const persp = 2.8 / (2.8 - z);
        const px = cx + x * R * persp, py = cy + y * R * persp;
        const front = (z + 1) / 2;
        const sz = (1.4 + front * 2.6) * (1 + level * 0.5);
        g.globalAlpha = 0.18 + front * 0.75;
        g.drawImage(front > 0.5 ? dotsFront : dotsBack, px - sz, py - sz, sz * 2, sz * 2);
      }
      g.globalAlpha = 1;
    };
    const start = () => { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); clearTimeout(timer); raf = 0; };
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [size, mic]);

  const box = size * 1.7;
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-name="voice-mic" aria-label={label} title={label} aria-pressed={mode === "listening"}
      className={`tv-voice-orb${mode !== "idle" ? " active" : ""}`}
      style={{ width: box, height: box, margin: `${-size * 0.35}px 0`, padding: 0, border: "none", background: "transparent", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, borderRadius: "50%", position: "relative", transition: "width .45s ease, height .45s ease, margin .45s ease" }}>
      <canvas ref={canvas} aria-hidden style={{ width: "100%", height: "100%", display: "block" }} />
    </button>
  );
}

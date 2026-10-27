"use client";

// Voice messages in the chats: recording one (the mic in the message box: a red dot and a timer,
// cancel or send; up to 5 minutes), and playing one (play / pause, a progress bar to jump with,
// its length).

import { useEffect, useRef, useState } from "react";

export const MAX_VOICE_SECONDS = 300;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// What this browser records in (Chrome / Firefox: WebM with Opus; Safari: MP4 with AAC)
function recordingType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const [mime, ext] of [["audio/webm;codecs=opus", "webm"], ["audio/webm", "webm"], ["audio/ogg;codecs=opus", "ogg"], ["audio/mp4", "m4a"]] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <rect x="6.5" y="2.5" width="5" height="8.5" rx="2.5" /><path d="M4 9a5 5 0 0 0 10 0M9 14v2.5M6.5 16.5h5" />
  </svg>
);

// The mic button; while recording it becomes the recording bar (onRecording tells the message box
// to make room for it)
export function VoiceRecorder({ onSend, onRecording, disabled }: { onSend: (file: File, seconds: number) => void; onRecording?: (on: boolean) => void; disabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; started: number; send: boolean; type: { mime: string; ext: string } } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    rec.current?.stream.getTracks().forEach(t => t.stop());
    rec.current = null;
    setRecording(false);
    onRecording?.(false);
  };
  useEffect(() => () => { if (rec.current) { rec.current.send = false; try { rec.current.mr.stop(); } catch { /* stopped */ } cleanup(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setError(null);
    const type = recordingType();
    if (!type || !navigator.mediaDevices?.getUserMedia) { setError("This browser can't record voice messages"); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e: any) {
      setError(e?.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in the browser's site settings." : "No microphone was found.");
      return;
    }
    const mr = new MediaRecorder(stream, { mimeType: type.mime, audioBitsPerSecond: 48000 });
    const state = { mr, stream, chunks: [] as Blob[], started: Date.now(), send: false, type };
    rec.current = state;
    mr.ondataavailable = e => { if (e.data.size) state.chunks.push(e.data); };
    mr.onstop = () => {
      const secs = Math.max(1, Math.round((Date.now() - state.started) / 1000));
      if (state.send && state.chunks.length) {
        const mime = type.mime.split(";")[0];
        const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
        onSend(new File(state.chunks, `voice-message-${stamp}.${type.ext}`, { type: mime }), Math.min(secs, MAX_VOICE_SECONDS));
      }
      cleanup();
    };
    mr.start(500);
    setSeconds(0);
    setRecording(true);
    onRecording?.(true);
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - state.started) / 1000);
      setSeconds(s);
      if (s >= MAX_VOICE_SECONDS) stop(true);
    }, 250);
  };
  const stop = (send: boolean) => {
    if (!rec.current) return;
    rec.current.send = send;
    try { rec.current.mr.stop(); } catch { cleanup(); }
  };

  if (recording) {
    return (
      <div className="tv-co-recording" data-name="voice-recording">
        <button className="tv-co-iconbtn" title="Cancel" aria-label="Cancel the voice message" onClick={() => stop(false)} data-name="voice-cancel">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M4 5.5h10M7.5 5.5V4h3v1.5M5.5 5.5l.7 9h5.6l.7-9" /></svg>
        </button>
        <span className="tv-co-rec-dot" aria-hidden />
        <span className="tv-co-rec-time" data-name="voice-timer">{fmt(seconds)}</span>
        <span className="tv-co-hint" style={{ margin: 0, flex: 1 }}>Recording… (up to {MAX_VOICE_SECONDS / 60} min)</span>
        <button className="tv-co-iconbtn" title="Send" aria-label="Send the voice message" onClick={() => stop(true)} data-name="voice-send" style={{ color: "var(--tv-co-accent)" }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden><path d="M2.5 9 15.5 3l-4 12.5-2.6-5.4L2.5 9ZM8.9 10.1 15.5 3" /></svg>
        </button>
      </div>
    );
  }
  return (
    <>
      <button className="tv-co-iconbtn" title="Record a voice message" aria-label="Record a voice message" onClick={start} disabled={disabled} data-name="voice-record"><MicIcon /></button>
      {error && <div className="tv-co-error tv-co-rec-error" role="alert">{error}</div>}
    </>
  );
}

// A voice message's player
export function VoicePlayer({ src, duration }: { src: string; duration?: number | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [len, setLen] = useState(duration || 0);
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };
  const seek = (e: { currentTarget: HTMLDivElement; clientX: number }) => {
    const a = audio.current;
    if (!a || !len) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * len;
  };
  return (
    <div className="tv-co-voice-msg" data-name="voice-player">
      <button className="tv-co-voice-play" onClick={toggle} aria-label={playing ? "Pause" : "Play"} data-name="voice-play">
        {playing
          ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="3" y="2" width="3" height="10" rx="1" fill="currentColor" /><rect x="8" y="2" width="3" height="10" rx="1" fill="currentColor" /></svg>
          : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M4 2.5v9l7.5-4.5L4 2.5Z" fill="currentColor" /></svg>}
      </button>
      <div className="tv-co-voice-bar" onClick={seek} role="slider" aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(len)} aria-valuenow={Math.round(t)}>
        <i style={{ width: `${len ? Math.min(100, (t / len) * 100) : 0}%` }} />
      </div>
      <span className="tv-co-voice-time">{fmt(playing || t ? t : len)}</span>
      <audio ref={audio} src={src} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setT(0); }}
        onTimeUpdate={e => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={e => { const d = e.currentTarget.duration; if (isFinite(d) && d > 0) setLen(d); }} />
    </div>
  );
}

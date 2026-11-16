"use client";

// Shows the guided tours of lib/tours, on every page (mounted once, in the root layout). The next one
// this person hasn't seen for this page, once, a few seconds after it opens (signed in, after their
// account's settings came down, so a tour seen on another device isn't shown again). A spotlight on
// each step's target with a card beside it: Back, Next, Skip; Escape closes it. A step on another
// page goes there and the tour carries on (sessionStorage). The Help menu and the voice assistant
// ("guide me through the site") start one on request (tv:start-tour).
import { inApp } from "../lib/appBridge";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { cloudSyncReady } from "@/app/lib/cloudSync";
import { TOURS, markTourSeen, nextTour, type Tour, type TourPage } from "@/app/lib/tours";

const START_DELAY_MS = 2500;
const FIND_MS = 1500;          // how long a step waits for its target to appear (a dialog opening)
const FIND_AFTER_LOAD_MS = 8000; // the first step on a page just opened (its data loading)
const PAD = 6;
const CARD_W = 320;
const RESUME_KEY = "tv:tourResume";

type Rect = { top: number; left: number; width: number; height: number };

function findTarget(selector: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

// the page we're on is the step's (its path, and each of its query's values)
function onPath(path: string): boolean {
  const u = new URL(path, location.origin);
  if (u.pathname !== location.pathname) return false;
  const here = new URLSearchParams(location.search);
  let all = true;
  u.searchParams.forEach((v, k) => { if (here.get(k) !== v) all = false; });
  return all;
}

const pageOf = (pathname: string | null): TourPage | null =>
  pathname === "/" ? "home" : pathname === "/chart" ? "chart" : null;

export default function FeatureTour() {
  const { user, loading } = useAuth() as any;
  const page = pageOf(usePathname());
  const [tour, setTour] = useState<Tour | null>(null);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const target = useRef<HTMLElement | null>(null);
  const dir = useRef(1);
  const findMs = useRef(FIND_MS);
  const started = useRef(false);

  // carrying on a tour that came from another page; else the next unseen one here, once per visit
  useEffect(() => {
    if (loading || started.current) return;
    let resume: { id: string; step: number } | null = null;
    try { resume = JSON.parse(sessionStorage.getItem(RESUME_KEY) || "null"); sessionStorage.removeItem(RESUME_KEY); } catch { /* storage off */ }
    const again = resume && TOURS.find(t => t.id === resume!.id);
    if (again) {
      started.current = true;
      findMs.current = FIND_AFTER_LOAD_MS;
      dir.current = 1;
      setStep(resume!.step);
      setTour(again);
      return;
    }
    // (not inside the phone apps: they show their own first-run guide)
    if (!page || inApp()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (user?.uid) await cloudSyncReady();
      if (cancelled || started.current) return;
      const t = nextTour(page, !!user?.uid);
      if (t) { started.current = true; dir.current = 1; setStep(0); setTour(t); }
    }, START_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loading, user?.uid, page]);

  // on request: the Help menu, the voice assistant
  useEffect(() => {
    const onStart = (e: Event) => {
      const t = TOURS.find(x => x.id === (e as CustomEvent).detail?.id);
      if (t) { started.current = true; dir.current = 1; findMs.current = FIND_MS; setStep(0); setTour(t); }
    };
    window.addEventListener("tv:start-tour", onStart);
    return () => window.removeEventListener("tv:start-tour", onStart);
  }, []);

  // seen once it's on the screen (not when none of its targets were there)
  useEffect(() => { if (tour && rect) markTourSeen(tour.id); }, [tour, rect]);

  const finish = useCallback(() => {
    tour?.after?.();
    try { sessionStorage.removeItem(RESUME_KEY); } catch { /* storage off */ }
    setTour(null);
    setRect(null);
    target.current = null;
  }, [tour]);

  const place = () => {
    const el = target.current;
    if (!el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    setRect(prev => (prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
      ? prev : { top: r.top, left: r.left, width: r.width, height: r.height }));
  };

  // a step: on its page (going there if not), run its before(), wait for its target, skip it if it never shows
  useEffect(() => {
    if (!tour) return;
    if (step < 0) { dir.current = 1; setStep(0); return; }
    if (step >= tour.steps.length) { finish(); return; }
    const s = tour.steps[step];
    if (s.path && !onPath(s.path)) {
      tour.after?.();
      try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ id: tour.id, step })); } catch { /* storage off */ }
      location.assign(s.path);
      return;
    }
    s.before?.();
    setRect(null);
    target.current = null;
    const t0 = Date.now(), wait = findMs.current;
    let timer = 0;
    const look = () => {
      const el = findTarget(s.target);
      if (el) {
        findMs.current = FIND_MS;
        target.current = el;
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        place();
        return;
      }
      if (Date.now() - t0 > wait) { setStep(i => i + dir.current); return; }
      timer = window.setTimeout(look, 100);
    };
    look();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, step]);

  // follow the target while it moves (a dialog settling, the window resized): a few times a second
  // while a tour is open, nothing otherwise
  useEffect(() => {
    if (!tour) return;
    const id = window.setInterval(place, 250);
    window.addEventListener("resize", place);
    return () => { clearInterval(id); window.removeEventListener("resize", place); };
  }, [tour]);

  const next = () => { dir.current = 1; setStep(i => i + 1); };
  const back = () => { if (step > 0) { dir.current = -1; setStep(step - 1); } };

  // Escape closes it (before the dialog under it sees the key); arrows / Enter move
  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); back(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, finish, step]);

  if (!tour || !rect || step >= tour.steps.length) return null;
  const s = tour.steps[step];
  const last = step === tour.steps.length - 1;

  // the card: beside the target, on the side with room
  const vw = window.innerWidth, vh = window.innerHeight;
  const hole = { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD };
  let left: number, top: number;
  if (hole.left > CARD_W + 24) { left = hole.left - CARD_W - 14; top = hole.top; }
  else if (vw - (hole.left + hole.width) > CARD_W + 24) { left = hole.left + hole.width + 14; top = hole.top; }
  else { left = Math.min(Math.max(12, hole.left), vw - CARD_W - 12); top = hole.top + hole.height + 14 > vh - 200 ? hole.top - 214 : hole.top + hole.height + 14; }
  top = Math.min(Math.max(12, top), vh - 220);
  left = Math.min(Math.max(12, left), vw - CARD_W - 12);

  const btn = (primary: boolean): React.CSSProperties => ({
    height: 32, padding: "0 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600,
    border: primary ? "none" : "1px solid #4b3a6b",
    background: primary ? "linear-gradient(90deg, #7c3aed, #4f46e5)" : "transparent",
    color: primary ? "#fff" : "#e9d5ff",
  });

  return (
    <div data-name="feature-tour" role="dialog" aria-modal="true" aria-label={tour.title} style={{ position: "fixed", inset: 0, zIndex: 100010 }}>
      {/* (clicks outside the card do nothing: the tour leads) */}
      <div style={{ position: "absolute", inset: 0 }} onMouseDown={e => e.preventDefault()} />
      <div data-name="feature-tour-spotlight" style={{
        position: "absolute", top: hole.top, left: hole.left, width: hole.width, height: hole.height, borderRadius: 8,
        boxShadow: "0 0 0 9999px rgba(8, 4, 20, 0.62), 0 0 0 2px #a78bfa, 0 0 18px 4px rgba(139, 92, 246, 0.55)",
        pointerEvents: "none", transition: "top .18s, left .18s, width .18s, height .18s",
      }} />
      <div data-name="feature-tour-card" style={{
        position: "absolute", top, left, width: CARD_W, boxSizing: "border-box", padding: "16px 18px 14px", borderRadius: 12,
        background: "#17112a", color: "#ede9fe", border: "1px solid #3b2a63", boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        fontSize: 14, lineHeight: "20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
      }}>
        <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "#a78bfa", fontWeight: 700, marginBottom: 6 }}>
          {tour.label || "New here"} · {step + 1} of {tour.steps.length}
        </div>
        <div data-name="feature-tour-title" style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{s.title}</div>
        <div data-name="feature-tour-body" style={{ color: "#c4b5fd" }}>{s.body}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={finish} data-name="feature-tour-skip" style={{ ...btn(false), border: "none", padding: "0 6px", fontWeight: 500, opacity: 0.8 }}>{last ? "Close" : "Skip"}</button>
          <span style={{ flex: 1 }} />
          {step > 0 && <button type="button" onClick={back} data-name="feature-tour-back" style={btn(false)}>Back</button>}
          <button type="button" autoFocus onClick={next} data-name="feature-tour-next" style={btn(true)}>{last ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}

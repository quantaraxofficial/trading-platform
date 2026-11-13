// Where a visitor came from, noted on their first visit and sent once with their sign-up
// (backend core/arrival.py sorts it into ad / referral / social / search / email / link /
// website / direct; Django admin: "Where traders came from").
//
// Noted from the address they landed on: utm_source / utm_medium / utm_campaign / utm_term /
// utm_content (campaign and ad links), ref / referral / invite (referral codes), gclid / fbclid
// (Google and Meta ad clicks), and the site that sent them (document.referrer, not ours).
// The first visit that says something wins: a plain direct visit is replaced by a later one from a
// link or ad, but a link's or ad's visit is kept even if they come back directly before signing up.

const KEY = "tv:arrival";
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export type Arrival = Partial<Record<(typeof PARAMS)[number] | "ref" | "referrer" | "landing" | "at", string>> & {
  gclid?: boolean; fbclid?: boolean;
};

const cut = (v: string | null | undefined, n: number) => (v || "").trim().slice(0, n);

function fromThisVisit(): Arrival {
  const q = new URLSearchParams(location.search);
  const a: Arrival = {};
  for (const k of PARAMS) { const v = cut(q.get(k), 120); if (v) a[k] = v; }
  const ref = cut(q.get("ref") || q.get("referral") || q.get("invite"), 60);
  if (ref) a.ref = ref;
  if (q.get("gclid")) a.gclid = true;
  if (q.get("fbclid")) a.fbclid = true;
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    if (r && r.host && r.host !== location.host) a.referrer = cut(r.origin + r.pathname, 200);
  } catch { /* not a URL */ }
  return a;
}

const saysSomething = (a: Arrival | null) => !!a && Object.keys(a).some(k => k !== "landing" && k !== "at");

// Called on each page load (the auth provider mounts on every page)
export function noteArrival() {
  if (typeof window === "undefined") return;
  try {
    const now = fromThisVisit();
    const kept: Arrival | null = JSON.parse(localStorage.getItem(KEY) || "null");
    if (kept && (saysSomething(kept) || !saysSomething(now))) return;
    localStorage.setItem(KEY, JSON.stringify({ ...now, landing: cut(location.pathname, 120), at: new Date().toISOString() }));
  } catch { /* storage off: nothing noted */ }
}

// What's sent with the sign-up (the server keeps it only for a new account)
export function arrivalInfo(): Arrival | null {
  noteArrival();
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}

// Guided tours: a short walk through a feature, pointing at it on the page. Each tour is shown once to
// each person (signed in, the seen list follows their account: "tv:toursSeen" is cloud-synced), at
// most one per visit, the oldest unseen first, on its own page (the chart, the home page). It only
// counts as seen once it was actually shown (a tour whose targets aren't on the page waits).
// components/FeatureTour (in the root layout) shows them; a step with a `path` on another page goes
// there and the tour carries on. Tours with auto: false only start on request (the Help menu, the
// voice assistant's "guide me through the site").
//
// EVERY NEW FEATURE GETS A TOUR: add it at the end of TOURS with a new id (never reuse one: people
// who saw the old tour would miss the new one). Point steps at stable selectors (data-name /
// aria-label); a step whose target isn't on the page is skipped. A feature TradingView doesn't have
// also gets a step in "site-guide".

export interface TourStep {
  target: string;                   // a CSS selector
  title: string;
  body: string;
  path?: string;                    // the page it's on (e.g. "/analytics"), when the tour crosses pages
  before?: () => void;              // e.g. open the dialog the target is in
}

export type TourPage = "chart" | "home";

export interface Tour {
  id: string;
  title: string;                    // for the Help menu's tours
  label?: string;                   // the card's small heading ("New here" when not given)
  page: TourPage;                   // where it's shown by itself
  auto?: boolean;                   // false: only on request
  signedIn?: boolean;               // only for signed-in people (e.g. their account menu)
  steps: TourStep[];
  after?: () => void;               // put the page back (close what the steps opened)
}

const openSettings = (tab: string) => () => window.dispatchEvent(new CustomEvent("tv:open-chart-settings", { detail: { tab } }));
const closeSettings = () => window.dispatchEvent(new CustomEvent("tv:close-chart-settings"));
const openAccountMenu = () => window.dispatchEvent(new CustomEvent("tv:open-account-menu"));

const COLLAB: TourStep = {
  target: '[data-name="right-toolbar-collab"]',
  title: "Collab: trade together, live",
  body: "Share your chart with friends or students. Everyone sees the same chart, drawings and replay as they happen, with a group chat and voice. Invite people as editors or viewers.",
  before: closeSettings,
};
const BACKTEST_SESSIONS: TourStep = {
  target: '[data-name="right-toolbar-backtest_sessions"]',
  title: "Backtest sessions",
  body: "Practise a strategy on past candles with its own account. A session remembers where you were, your trades and drawings, so you can stop and carry on later, and see how you did on the Analytics page.",
  before: closeSettings,
};
const BACKGROUND_IMAGE: TourStep = {
  target: '[data-name="bg-image-choose"]',
  title: "A background image",
  body: "Chart settings → Canvas: tick Background image and choose a picture to put behind your candles.",
  before: openSettings("canvas"),
};
const SETTINGS_DOWNLOAD: TourStep = {
  target: '[data-name="settings-download"]',
  title: "Download your settings",
  body: "Saves all your chart settings to a file: keep a copy, or move them to another account.",
};
const SETTINGS_IMPORT: TourStep = {
  target: '[data-name="settings-import"]',
  title: "Import settings",
  body: "Load a settings file you downloaded (or a friend shared) and your chart takes its look at once.",
};

export const TOURS: Tour[] = [
  {
    id: "welcome-collab-backtests-settings",
    title: "Collab, backtest sessions and your settings",
    page: "chart",
    steps: [COLLAB, BACKTEST_SESSIONS, BACKGROUND_IMAGE, SETTINGS_DOWNLOAD, SETTINGS_IMPORT],
    after: closeSettings,
  },
  {
    id: "home-profile-analytics",
    title: "Your profile and analytics",
    page: "home",
    signedIn: true,
    steps: [
      {
        target: '[data-name="account-menu-profile"]',
        title: "Your profile",
        body: "Your trading at a glance: the equity curve, profit factor and metrics of every paper account, your backtesting, the badges you've earned, your account and your saved settings.",
        before: openAccountMenu,
      },
      {
        target: '[data-name="account-menu-analytics"]',
        title: "Analytics",
        body: "Your performance in depth: your results at a glance, and each trade scored, analysed and journaled.",
        before: openAccountMenu,
      },
      {
        target: '[data-name="account-menu-backtests"]',
        title: "Backtesting analytics",
        body: "How your backtests went: every backtest session and saved strategy backtest with its trades and results, so you can see what works before you trade it.",
        before: openAccountMenu,
      },
    ],
    after: () => window.dispatchEvent(new CustomEvent("tv:close-account-menu")),
  },
  {
    id: "home-faq",
    title: "Questions & answers",
    page: "home",
    steps: [
      {
        target: '[data-name="site-footer"] a[href="/faq"]',
        title: "Questions & answers",
        body: "Down in the footer: answers about the chart, replay and backtesting, collab, the voice assistant and your account. Search them, and if something isn't there, ask us from the same page.",
      },
    ],
  },
  // Everything TradePilot adds to a TradingView-style chart, across its pages (on request only)
  {
    id: "site-guide",
    title: "Everything TradePilot adds",
    label: "TradePilot tour",
    page: "chart",
    auto: false,
    steps: [
      {
        path: "/chart",
        target: '[data-name="right-toolbar-voice"]',
        title: "The voice assistant",
        body: "Talk to your chart in any of 27 languages: open symbols, mark order blocks and FVGs, find setups, get the bias, ask what a market did, copy a theme or drawings from a screenshot, or draw made-up candles on a sketch board to explain a pattern.",
        before: closeSettings,
      },
      { ...COLLAB, path: "/chart" },
      { ...BACKTEST_SESSIONS, path: "/chart" },
      { ...BACKGROUND_IMAGE, path: "/chart" },
      { ...SETTINGS_DOWNLOAD, path: "/chart" },
      { ...SETTINGS_IMPORT, path: "/chart" },
      {
        path: "/chart",
        target: 'button[aria-label="Send feedback"]',
        title: "Send feedback",
        body: "Tell the team what's missing or slow, with a picture of your chart if you like. It goes straight to us.",
        before: closeSettings,
      },
      {
        path: "/analytics",
        target: '[data-nav="performance"]',
        title: "Analytics: performance",
        body: "Your results at a glance for each paper account: profit, win rate, profit factor, drawdown, by day, symbol and session.",
      },
      {
        path: "/analytics",
        target: '[data-nav="trades"]',
        title: "Trade analysis and journal",
        body: "Each trade scored and analysed, with a journal to note why you took it, how you felt and what you learned.",
      },
      {
        path: "/analytics",
        target: '[data-nav="backtests"]',
        title: "Backtesting analytics",
        body: "Every backtest session and saved strategy backtest with its trades and results, side by side.",
      },
      {
        path: "/profile",
        target: '[data-name="profile-kpis"]',
        title: "Your profile",
        body: "Your trading in numbers, across every paper account, with the equity curve and your backtesting below.",
      },
      {
        path: "/profile?tab=achievements",
        target: '[data-name="profile-achievements"]',
        title: "Achievements",
        body: "Badges you earn from your trading, backtesting and journal. That's the tour: ask the voice assistant any time for more.",
      },
    ],
    after: closeSettings,
  },
];

export const SEEN_KEY = "tv:toursSeen";

export function seenTours(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
  } catch { return []; }
}

export function markTourSeen(id: string) {
  const seen = seenTours();
  if (seen.includes(id)) return;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id])); } catch { /* storage off */ }
}

export const nextTour = (page: TourPage, signedIn: boolean): Tour | null => {
  const seen = new Set(seenTours());
  return TOURS.find(t => t.page === page && t.auto !== false && (signedIn || !t.signedIn) && !seen.has(t.id)) || null;
};

// The Help menu's tours, the voice assistant's "guide me through the site": start one
export function startTour(id: string) {
  window.dispatchEvent(new CustomEvent("tv:start-tour", { detail: { id } }));
}

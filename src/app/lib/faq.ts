// The Q&A page's questions (src/app/faq). Each id is the question's link (/faq#id) and what its
// "Was this helpful?" votes are kept under (Django Admin: FAQ votes), so never change an id; add new
// questions for new features. Answers are paragraphs; links go under them.

export type FaqCategory = "start" | "charts" | "replay" | "trading" | "collab" | "voice" | "analytics" | "account" | "privacy";

export const FAQ_CATEGORIES: { id: FaqCategory; label: string }[] = [
  { id: "start", label: "Getting started" },
  { id: "charts", label: "Charts & drawings" },
  { id: "replay", label: "Replay & backtesting" },
  { id: "trading", label: "Trading & accounts" },
  { id: "collab", label: "Collab" },
  { id: "voice", label: "Voice assistant" },
  { id: "analytics", label: "Analytics & journal" },
  { id: "account", label: "Account" },
  { id: "privacy", label: "Privacy & safety" },
];

export interface FaqItem {
  id: string;
  category: FaqCategory;
  q: string;
  a: string[];
  links?: { href: string; label: string }[];
}

export const FAQ: FaqItem[] = [
  // ---- getting started
  {
    id: "what-is-tradepilot", category: "start", q: "What is TradePilot?",
    a: [
      "TradePilot is a charting and practice platform for traders: professional charts with drawing tools and indicators, bar replay and backtest sessions to practise on past markets, paper trading, live collab with your group, a voice assistant you can talk to, and analytics of every trade with a journal.",
    ],
    links: [{ href: "/chart", label: "Open the chart" }],
  },
  {
    id: "need-account", category: "start", q: "Do I need an account?",
    a: [
      "You can open the chart without one. Signed in, your layouts, drawings, settings and work are saved to your account and follow you to any device. Create one on the Sign up page.",
      "Some features, such as collab, bar replay and the voice assistant, need an account that includes them; when one isn't included, the site tells you when you try it.",
    ],
    links: [{ href: "/signup", label: "Sign up" }, { href: "/login", label: "Log in" }],
  },
  {
    id: "tour", category: "start", q: "Is there a tour of the features?",
    a: [
      "Yes. New features show you a short guided tour the first time you see them. To see one again, open Help (the ? at the bottom of the right toolbar) and pick a tour.",
      "You can also ask the voice assistant \"guide me through your website\": it walks you through everything TradePilot adds, page by page.",
    ],
  },
  {
    id: "phone", category: "start", q: "Does it work on a phone?",
    a: ["Yes, the site works in your phone's browser. The chart has the most room on a computer or tablet."],
  },

  // ---- charts & drawings
  {
    id: "chart-types", category: "charts", q: "Which chart types are there?",
    a: [
      "Candles, hollow candles, volume candles, bars, line, line with markers, step line, area, HLC area, baseline, columns, high-low, Heikin Ashi, Renko, line break, Kagi, point and figure, and range.",
    ],
  },
  {
    id: "indicators", category: "charts", q: "Which indicators can I add?",
    a: [
      "Among others: ATR, Awesome Oscillator, Bull Bear Power, Donchian Channels, Asian Session Range, Ichimoku, MACD, Momentum, EMA, SMA, Pivot Points, Price Channel, Rate of Change, RSI, Volume, Volume Profile, VWAP and Williams %R. You can also write your own in the Pine Editor.",
      "Open Indicators in the top bar (or press /) to add one; its settings open from its name on the chart.",
    ],
  },
  {
    id: "drawings", category: "charts", q: "How do I draw on the chart and manage drawings?",
    a: [
      "Pick a tool from the left toolbar: trend lines, Fibonacci tools, shapes, positions, text, brushes and more. The magnet snaps points to candles.",
      "From the same toolbar you can lock, hide or remove all drawings. Undo and redo work as usual (Ctrl+Z / Ctrl+Y).",
    ],
  },
  {
    id: "background-image", category: "charts", q: "Can I put my own picture behind the chart?",
    a: ["Yes. Open Chart settings → Canvas, tick Background image and choose a picture."],
  },
  {
    id: "move-settings", category: "charts", q: "How do I move my chart settings to another account?",
    a: [
      "In Chart settings, Download settings saves everything to a file, and Import loads a file into any account. Signed in, your settings also sync to every device by themselves.",
    ],
  },
  {
    id: "data-delay", category: "charts", q: "Is the market data live?",
    a: [
      "Prices come from third-party data providers and update as they arrive. Data can sometimes be delayed or incomplete, so always check prices with your broker before trading.",
    ],
  },

  // ---- replay & backtesting
  {
    id: "bar-replay", category: "replay", q: "How does bar replay work?",
    a: [
      "Press Replay in the top bar, choose a starting point on the chart (or a random one), then play, pause or step bar by bar at the speed you like. The future candles stay hidden until you get there.",
      "When you leave a replay you can save it, and carry on later from the replay's starting-point menu.",
    ],
  },
  {
    id: "backtest-sessions", category: "replay", q: "What is a backtest session?",
    a: [
      "A replay you come back to, with its own trading account. It remembers where you were, your trades, positions and drawings, your strategy and notes, and how long you've spent on it.",
      "Open them from Backtest sessions in the right toolbar. Their results are on the Analytics page under Backtests.",
    ],
    links: [{ href: "/analytics?view=backtests", label: "Backtesting analytics" }],
  },
  {
    id: "strategy-backtest", category: "replay", q: "Can I backtest a Pine Script strategy?",
    a: [
      "Yes. Add a strategy from the Pine Editor and the Strategy Tester shows its trades and results over the date range you choose. You can save a run and see it later under Analytics → Backtests.",
    ],
  },

  // ---- paper trading
  {
    id: "paper-trading", category: "trading", q: "How does paper trading work?",
    a: [
      "Paper trading is simulated: no real money. Use the Trade button or the order ticket to place market, limit and stop orders with stop loss and take profit; positions and orders show on the chart and in the trading panel.",
      "Fills and costs are simulated, so results can differ from a real broker.",
    ],
  },

  {
    id: "connect-account", category: "trading", q: "Can I connect my real MT5 or cTrader account?",
    a: [
      "Yes, read only, in Analytics → Connect an account. For MetaTrader 5 you give the account number, server and investor (read-only) password; for cTrader you sign in with your cTrader ID and allow view-only access. Passwords and tokens are kept encrypted and never sent back to the browser.",
      "Every closed trade on the account then counts in Performance and Trade Analysis, wherever you placed it. You can also see the live balance and track prop-firm rules (profit target, daily and maximum loss).",
    ],
    links: [{ href: "/analytics", label: "Open Analytics" }],
  },
  {
    id: "copy-trading", category: "trading", q: "How does copy trading work?",
    a: [
      "In Analytics → Copy trading you can run a channel (send signals from the site or mirror your own MT5 trades) or follow channels with your own limits: risk per trade, maximum risk, a daily loss limit and the symbols you allow.",
      "Copied trades go to your own broker account, so they are real trades with real money. They can fill at different prices or be skipped if late. A channel can also post its signals to Telegram, Discord or WhatsApp.",
    ],
  },
  {
    id: "leaderboard", category: "trading", q: "How does the leaderboard work?",
    a: [
      "The leaderboard ranks traders by return, profit factor, win rate or net profit, per market. It has manual backtests and Strategy Tester backtests you choose to share (at least 10 trades), and connected live accounts you choose to show (at least 5 closed trades in the period).",
      "Live results are read from the broker; your account number and balance are never shown.",
    ],
    links: [{ href: "/leaderboard", label: "Open the leaderboard" }],
  },

  // ---- collab
  {
    id: "collab", category: "collab", q: "What is collab?",
    a: [
      "Collab shares your chart live with friends or students: everyone sees the same chart, drawings and replay as they happen, with a group chat and voice.",
      "Start one from Collab in the right toolbar, then invite people as editors (they can change the chart) or viewers (they watch), or share its link.",
    ],
  },

  // ---- voice assistant
  {
    id: "voice-what", category: "voice", q: "What can the voice assistant do?",
    a: [
      "Talk or type to it in any of 27 languages. It can open symbols and timeframes, add indicators, draw, mark order blocks, FVGs, liquidity and other concepts, find setups, give the bias for the next hours, say what a market did over any period, run replay and backtests, set alerts, start a collab and write Pine scripts.",
      "Send it a screenshot to copy a chart's theme or drawings, or ask it to sketch made-up candles to explain a pattern. Big actions ask you yes or no first.",
    ],
  },
  {
    id: "voice-limit", category: "voice", q: "Is there a limit on voice requests?",
    a: [
      "There's a daily number of AI answers per account. Everyday commands said plainly in English, like \"switch to 15 minutes\" or \"add RSI\", are understood instantly by the site itself and don't count.",
    ],
  },

  // ---- analytics & journal
  {
    id: "analytics", category: "analytics", q: "Where do I see how I'm doing?",
    a: [
      "The Analytics page shows your performance for each paper account (profit, win rate, profit factor, drawdown, by day, symbol and session), Trade Analysis with each trade scored, and Backtests.",
      "Performance can be exported as a CSV or a PDF report. Your profile shows the overview, your backtesting and the achievements you've earned.",
    ],
    links: [{ href: "/analytics", label: "Open Analytics" }, { href: "/profile", label: "Your profile" }],
  },
  {
    id: "journal", category: "analytics", q: "Can I keep a trading journal?",
    a: ["Yes. In Analytics → Trade Analysis, open any trade to note why you took it, how you felt and what you learned."],
    links: [{ href: "/analytics?view=trades", label: "Trade analysis" }],
  },

  // ---- account
  {
    id: "one-device", category: "account", q: "Why can't I sign in on a second device?",
    a: [
      "Each account can be signed in on one device at a time. Sign out on the other device first (Profile → Sign out). If you can't reach it, write to us and we'll sign it out for you.",
    ],
    links: [{ href: "/contact", label: "Contact us" }],
  },
  {
    id: "forgot-password", category: "account", q: "I forgot my password.",
    a: [
      "Write to us through the Contact page with the email or user ID you sign in with, and we'll set you up with a new password.",
    ],
    links: [{ href: "/contact", label: "Contact us" }],
  },
  {
    id: "subscription-ends", category: "account", q: "What happens when my subscription ends?",
    a: ["Features that need a subscription stop working, but everything you saved stays on your account and is there again when you renew."],
  },

  // ---- privacy & safety
  {
    id: "advice", category: "privacy", q: "Is TradePilot financial advice?",
    a: [
      "No. Charts, marked zones, setups, bias readings, backtests and anything the voice assistant says are for analysis and practice, not advice. Trading involves risk; your decisions are your own.",
    ],
    links: [{ href: "/terms", label: "Terms of Service" }],
  },
  {
    id: "data", category: "privacy", q: "What do you do with my data?",
    a: [
      "We use it to run the service for you and to improve it. We don't sell personal data and don't use advertising trackers. The Privacy Policy explains exactly what is collected and why.",
    ],
    links: [{ href: "/privacy", label: "Privacy Policy" }],
  },
  {
    id: "contact", category: "privacy", q: "How do I reach you?",
    a: [
      "Use the Contact page's form; we reply by email. On the chart, Send feedback in the right toolbar goes straight to us too, with a picture of your chart if you like.",
    ],
    links: [{ href: "/contact", label: "Contact us" }],
  },
];

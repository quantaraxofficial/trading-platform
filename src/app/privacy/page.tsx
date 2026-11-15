import { Metadata } from 'next';
import LegalPage, { type LegalSection } from '../components/external/LegalPage';

export const metadata: Metadata = { title: 'Privacy Policy', description: "What TradePilot collects, why, who it's shared with and the choices you have.", alternates: { canonical: '/privacy' } };

const UPDATED = '15 November 2026';

const sections: LegalSection[] = [
  {
    id: 'who', title: 'Who we are',
    body: <p>TradePilot (&quot;we&quot;, &quot;us&quot;) runs this website and its charting, backtesting, collaboration and analytics tools. This policy explains what personal data we collect when you use it, why, who we share it with and the choices you have. For any question about it, write to us through the <a href="/contact">Contact page</a>.</p>,
  },
  {
    id: 'collect', title: 'What we collect',
    body: <>
      <p><b>Your account.</b> Your name, your email address or user ID, and your phone number if you give it. Sign-in is handled by Google Firebase Authentication; we don&apos;t see or store your Google password.</p>
      <p><b>What you save.</b> Chart layouts, drawings, watchlists, alerts, indicator and chart settings, templates, Pine scripts, backtest sessions and saved replays, trade journal entries, paper trading accounts, and anything you upload (for example a chart background image).</p>
      <p><b>Connected trading accounts.</b> If you connect an MT5 account: its account number, server and password (stored encrypted and never sent back to your browser); if you connect a cTrader account: the access cTrader gives us when you sign in with it. From them we read your balances, positions and trades, for your analytics and stats, the leaderboard (if you join it) and copy trading.</p>
      <p><b>Copy trading.</b> The channels you publish or follow, the signals sent and the trades copied to your accounts.</p>
      <p><b>Community.</b> Your public profile, posts, photos and videos, likes and comments. These are visible to other users, as are your leaderboard stats if you take part.</p>
      <p><b>Where you came from.</b> When you first visit and sign up: the link, campaign, referral code or ad that brought you, and the website you came from.</p>
      <p><b>Collab.</b> The rooms you create or join, who you invite, chat messages, voice notes and files you share there. The people in a room see what is shared in it.</p>
      <p><b>The voice assistant.</b> What you say or type to it, and the replies. Requests it couldn&apos;t carry out are kept so we can teach it. Screenshots you give it (to copy a theme or drawings) are read in your browser and not uploaded.</p>
      <p><b>How you use the site.</b> While the site is open in a visible tab, it tells our server once a minute: which page you are on, whether you used it in that minute (a click, a key, a scroll), and which features you used (counts such as &quot;drawing tools used 3 times&quot;). From this we know who is online, time spent on the site and which features are used.</p>
      <p><b>Technical data.</b> The device and browser type of the devices you sign in on, and, for requests that fail and for feedback and contact messages, the IP address and browser description. Signed-out visitors get a random visitor ID kept in their browser, with the pages visited and the website they came from.</p>
      <p><b>Messages you send us.</b> Feedback (with any screenshots and the chart you were on) and Contact page messages (your name, email and message).</p>
      <p><b>Subscriptions.</b> If you have a subscription, its plan and dates. We don&apos;t take card payments on this website and don&apos;t store card details.</p>
    </>,
  },
  {
    id: 'use', title: 'How we use it',
    body: <ul>
      <li>To run the service: sign you in, keep your charts, settings and work, and sync them across your devices.</li>
      <li>To run features you use: alerts, collab rooms, backtests, the voice assistant, analytics of your trades, copy trading, the community and the leaderboard.</li>
      <li>To keep accounts secure: one signed-in device per account, limits on repeated requests, and records of failed requests.</li>
      <li>To improve the site: which features are used, where errors happen and how long pages take to respond.</li>
      <li>To answer your feedback and messages, and to manage subscriptions.</li>
    </ul>,
  },
  {
    id: 'share', title: 'Who we share it with',
    body: <>
      <p>We don&apos;t sell your personal data and we don&apos;t use advertising trackers. We share data only with services that help us run the site, for those purposes:</p>
      <ul>
        <li><b>Google Firebase</b>: signing in, and some settings.</li>
        <li><b>Google Cloud</b>: the servers and database the site runs on.</li>
        <li><b>AI providers for the voice assistant</b> (Groq and Google Gemini): the text of your request and the chart context it needs (such as the symbol and timeframe), to understand what you asked.</li>
        <li><b>Market data providers</b>: requests for prices and candles. These don&apos;t include your personal data.</li>
        <li><b>Your broker&apos;s platform</b> (MetaTrader 5 servers or cTrader): to connect the accounts you link, read them and, for copy trading you set up, place trades on them.</li>
      </ul>
      <p>The people you collaborate with see what you share in a collab room. We may also disclose data where the law requires it.</p>
    </>,
  },
  {
    id: 'storage', title: 'Your browser’s storage',
    body: <p>The site keeps your session key, settings and preferences in your browser&apos;s local storage so it works quickly and remembers you; signed in, many of these are also saved to your account so they follow you to other devices. We don&apos;t use advertising cookies. Clearing your browser&apos;s site data signs you out on that browser.</p>,
  },
  {
    id: 'keep', title: 'How long we keep it',
    body: <p>We keep your account data and what you save for as long as your account is open. Usage and error records are kept for as long as they are useful to run and improve the site. When you ask us to delete your account, we delete your personal data, except what we must keep by law.</p>,
  },
  {
    id: 'choices', title: 'Your choices and rights',
    body: <ul>
      <li><b>See and download:</b> your settings can be downloaded from Chart settings (Download settings) or your profile; ask us for a copy of the rest.</li>
      <li><b>Correct:</b> ask us to correct your details.</li>
      <li><b>Delete:</b> delete drawings, scripts, sessions and other work yourself on the site, or ask us to delete your account.</li>
      <li><b>Object or withdraw:</b> tell us if you don&apos;t want your data used for a purpose described here.</li>
    </ul>,
  },
  {
    id: 'security', title: 'Security',
    body: <p>Connections to the site are encrypted (HTTPS), sign-in is handled by Firebase, every account request is checked against your signed-in session, and access to our systems is limited. No system is perfectly secure, so please keep your sign-in details to yourself and tell us if you think your account has been misused.</p>,
  },
  {
    id: 'children', title: 'Children',
    body: <p>TradePilot is for adults. It isn&apos;t meant for anyone under 18, and we don&apos;t knowingly collect their data.</p>,
  },
  {
    id: 'changes', title: 'Changes to this policy',
    body: <p>When we change this policy we update the date at the top of this page; for important changes we will also let you know on the site.</p>,
  },
  {
    id: 'contact', title: 'Contact us',
    body: <p>Questions, requests about your data or concerns: write to us through the <a href="/contact">Contact page</a>.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage active="/privacy" title="Privacy Policy" updated={UPDATED} sections={sections}
      intro={<p>Your privacy matters to us. This page says plainly what TradePilot collects, why, and what you can do about it.</p>} />
  );
}

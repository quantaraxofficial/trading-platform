import { Metadata } from 'next';
import LegalPage, { type LegalSection } from '../components/external/LegalPage';

export const metadata: Metadata = { title: 'Terms of Service' };

const UPDATED = '15 November 2026';

const sections: LegalSection[] = [
  {
    id: 'agree', title: 'Agreeing to these terms',
    body: <p>These terms apply to your use of the TradePilot website and its tools (&quot;the service&quot;). By creating an account or using the service you agree to them and to our <a href="/privacy">Privacy Policy</a>. If you don&apos;t agree, please don&apos;t use the service.</p>,
  },
  {
    id: 'advice', title: 'Not financial advice',
    body: <>
      <p>TradePilot is a charting, analysis and practice tool. <b>Nothing on it is financial, investment or trading advice</b>, or a recommendation to buy or sell anything. That includes charts, indicators, marked zones and setups, bias readings, backtest and replay results, analytics, and anything the voice assistant says.</p>
      <p>Trading involves a substantial risk of loss. Past results, whether real or simulated, do not guarantee future results. You alone are responsible for your trading decisions.</p>
    </>,
  },
  {
    id: 'eligibility', title: 'Who can use it',
    body: <p>You must be at least 18 and able to enter into a binding agreement. You must give accurate details when you sign up and keep them up to date.</p>,
  },
  {
    id: 'account', title: 'Your account',
    body: <ul>
      <li>Your account is for you alone; don&apos;t share it or your sign-in details.</li>
      <li>An account can be signed in on one device at a time.</li>
      <li>You are responsible for what happens under your account. Tell us at once if you think someone else has used it.</li>
    </ul>,
  },
  {
    id: 'subscription', title: 'Subscriptions and access',
    body: <p>Some features need an active subscription. Your access lasts until the end date shown on your account, unless it is extended. When it ends, features that need a subscription stop working, but your saved work stays on your account. Prices and plans are those agreed when you subscribe.</p>,
  },
  {
    id: 'data', title: 'Market data and simulated trading',
    body: <ul>
      <li>Prices and candles come from third-party data providers. They may be delayed, incomplete or wrong, and we don&apos;t guarantee their accuracy or availability.</li>
      <li>Paper trading, bar replay and backtests are simulations. Their fills, costs and results can differ from real markets.</li>
      <li>The voice assistant and automatic analysis can misunderstand or make mistakes. Check what they do before relying on it.</li>
    </ul>,
  },
  {
    id: 'live', title: 'Connected accounts and copy trading',
    body: <ul>
      <li>When you connect a trading account, you confirm you are allowed to, and you let us read it (and, for copy trading you set up, place trades on it).</li>
      <li>Copy trading and orders on connected accounts are <b>real trades with real money</b>. Copied trades can be filled at different prices, late, or not at all, and can lose money. You choose what to copy and with what risk, and you can stop at any time.</li>
      <li>Publishing a copy trading channel or a public profile doesn&apos;t make you or us a financial adviser; followers decide for themselves.</li>
    </ul>,
  },
  {
    id: 'use', title: 'Acceptable use',
    body: <>
      <p>Please don&apos;t:</p>
      <ul>
        <li>break the law, or infringe anyone&apos;s rights, through the service;</li>
        <li>post or share anything abusive, hateful, misleading, or that you don&apos;t have the right to share, in collab rooms, chats or anywhere else;</li>
        <li>try to get into accounts or systems you don&apos;t have access to, or disrupt or overload the service;</li>
        <li>scrape, copy or resell the service or its data, or reverse engineer it, except where the law allows;</li>
        <li>use bots or scripts to use the service in ways a person normally wouldn&apos;t.</li>
      </ul>
    </>,
  },
  {
    id: 'content', title: 'Your content',
    body: <p>What you create, such as drawings, scripts, journals and messages, stays yours. You give us permission to store, process and show it as needed to run the service for you, for example syncing it to your devices or showing it to the people in a collab room you share it with. You are responsible for what you share.</p>,
  },
  {
    id: 'ours', title: 'Our service',
    body: <p>The service, its software, design and brand belong to TradePilot or its licensors. We may change, add or remove features. We work to keep the service available but can&apos;t promise it will always be uninterrupted or error-free.</p>,
  },
  {
    id: 'ending', title: 'Suspension and closing an account',
    body: <p>You can stop using the service at any time and ask us to close your account. We may suspend or close an account that breaks these terms or puts the service or other users at risk. Where reasonable, we will tell you first.</p>,
  },
  {
    id: 'liability', title: 'Disclaimers and liability',
    body: <>
      <p>The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, to the extent the law allows.</p>
      <p>To the extent the law allows, TradePilot is not liable for trading losses, lost profits, or indirect or consequential losses arising from your use of the service, including from data errors, outages, or decisions based on anything shown on it. Nothing in these terms limits liability that cannot be limited by law.</p>
    </>,
  },
  {
    id: 'changes', title: 'Changes to these terms',
    body: <p>We may update these terms. When we do, we change the date at the top of this page, and for important changes we will let you know on the site. Using the service after a change means you accept the updated terms.</p>,
  },
  {
    id: 'contact', title: 'Contact us',
    body: <p>Questions about these terms: write to us through the <a href="/contact">Contact page</a>.</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalPage active="/terms" title="Terms of Service" updated={UPDATED} sections={sections}
      intro={<p>Please read these terms before using TradePilot. They explain what you can expect from us and what we expect from you.</p>} />
  );
}

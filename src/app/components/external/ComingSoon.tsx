// "Coming soon": what's built on the next version of the site (the merge branch) and not here yet.
// On the home page (the full cards), About (the cards) and Contact (one compact line).

import React from 'react';
import { Mic, Copy, Bot, Users, MessagesSquare, SlidersHorizontal, Code2, Palette, LayoutDashboard } from 'lucide-react';

export const COMING_SOON: { icon: React.ReactNode; title: string; description: string }[] = [
  { icon: <Mic className="w-7 h-7" />, title: 'Voice assistant',
    description: 'Talk to the chart: open symbols, mark order blocks and fair value gaps, set alerts, start backtests and write Pine scripts by voice, with spoken answers.' },
  { icon: <Copy className="w-7 h-7" />, title: 'Copy trading',
    description: 'Run a signal channel: followers copy your trades on their own MetaTrader 5 accounts, each with their own risk settings.' },
  { icon: <Bot className="w-7 h-7" />, title: 'MetaTrader 5 trading',
    description: 'Connect your MT5 account, trade straight from the chart, and let your strategies trade automatically.' },
  { icon: <Users className="w-7 h-7" />, title: 'Community',
    description: 'Profiles and followers, and indicators and strategies published by other traders that you can add to your chart.' },
  { icon: <MessagesSquare className="w-7 h-7" />, title: 'Chats',
    description: 'Private and group chats with the people you trade with, beside the chart.' },
  { icon: <SlidersHorizontal className="w-7 h-7" />, title: 'Strategy optimizer',
    description: "Search a strategy's inputs for the settings that tested best, then apply them to the chart." },
  { icon: <Code2 className="w-7 h-7" />, title: 'Python and MQL5',
    description: 'Write indicators and strategies in Python or MQL5 as well as Pine Script, and keep them in GitHub.' },
  { icon: <Palette className="w-7 h-7" />, title: 'Site themes',
    description: 'Ten colour themes for the whole site, from Midnight and Ocean to Sepia, candles included.' },
  { icon: <LayoutDashboard className="w-7 h-7" />, title: 'Redesign your layout',
    description: 'Drag the toolbars and panels anywhere on the screen and save the layouts you like.' },
];

const Badge = () => (
  <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-purple-700/40 text-purple-200 border border-purple-600/50">Coming soon</span>
);

// The cards (home page, About)
export default function ComingSoon({ heading = true }: { heading?: boolean }) {
  return (
    <div>
      {heading && (
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">Coming soon</span>
          </h2>
          <p className="text-xl text-purple-400 max-w-2xl mx-auto">Built and on its way: what the next version of TradePilot adds.</p>
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-name="coming-soon">
        {COMING_SOON.map(f => (
          <div key={f.title} className="bg-purple-950/60 backdrop-blur-sm border border-purple-800/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-purple-500">{f.icon}</span>
              <Badge />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
            <p className="text-purple-200 text-sm leading-relaxed">{f.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// One line (Contact)
export function ComingSoonLine() {
  return (
    <p className="text-purple-300 text-sm leading-relaxed" data-name="coming-soon-line">
      <span className="font-semibold text-white">Coming soon: </span>
      {COMING_SOON.map(f => f.title).join(' · ')}.{' '}
      <a href="/#coming-soon" className="text-purple-200 underline hover:text-white">See what&apos;s coming</a>
    </p>
  );
}

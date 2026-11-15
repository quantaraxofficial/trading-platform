'use client';

// The home page's About section (#about; "About Us" in the top bar scrolls here, /about opens it):
// the mission, what we believe in, and what TradePilot brings together, in the home page's look.
import React from 'react';
import { Award, BarChart3, Globe, Mic, Rewind, Shield, Users } from 'lucide-react';

const VALUES = [
  { icon: <Globe className="w-7 h-7" />, title: 'Accessible', text: 'World-class trading tools shouldn’t be locked behind expensive terminals. Everything runs in your browser, on any computer or phone.' },
  { icon: <Shield className="w-7 h-7" />, title: 'Honest', text: 'Practice before you risk money: replay, backtests and paper trading are clearly simulated, and nothing here is financial advice.' },
  { icon: <Award className="w-7 h-7" />, title: 'Always improving', text: 'We ship new tools all the time, often from traders’ own feedback, and every new feature comes with a short guided tour.' },
];

const PILLARS = [
  { icon: <BarChart3 className="w-6 h-6" />, title: 'Chart', text: 'Professional charts, 18 chart types, indicators, Pine Script and a full set of drawing tools.' },
  { icon: <Rewind className="w-6 h-6" />, title: 'Practise', text: 'Bar replay and backtest sessions with their own accounts, on any market and date.' },
  { icon: <Users className="w-6 h-6" />, title: 'Trade together', text: 'Collab rooms share your chart live, with group chat and voice.' },
  { icon: <Mic className="w-6 h-6" />, title: 'Just ask', text: 'A voice assistant that marks concepts, finds setups and explains, in 27 languages.' },
];

export default function AboutSection() {
  return (
    <section id="about" data-name="home-about" className="relative py-24 px-6" style={{ zIndex: 1 }}>
      <div className="container mx-auto max-w-6xl">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block rounded-full border border-purple-700/60 bg-purple-900/40 px-4 py-1 text-sm font-medium text-purple-300">About us</span>
            <h2 className="mt-5 text-4xl md:text-5xl font-bold leading-tight">
              Built for traders,{' '}
              <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">by traders</span>
            </h2>
            <p className="mt-6 text-lg leading-8 text-purple-200/90">
              We built TradePilot to close the gap between institutional-grade tools and everyday traders: one place to chart the
              markets, practise on their history, learn together and understand your own trading.
            </p>
            <p className="mt-4 text-lg leading-8 text-purple-300/80">
              Our mission is simple: make professional analysis fast, intuitive and within everyone’s reach, so you can focus on
              getting better, not on fighting your tools.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/chart" className="rounded-lg bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 px-6 py-3 font-semibold transition-all hover:scale-105">Start charting</a>
              <a href="/contact" className="rounded-lg border-2 border-purple-600 hover:border-white px-6 py-3 font-semibold transition-colors">Talk to us</a>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {PILLARS.map((p, i) => (
              <div key={p.title} className={`rounded-2xl border border-purple-800/50 bg-purple-950/60 backdrop-blur-sm p-6 transition-all hover:border-purple-500 hover:-translate-y-1 ${i % 2 ? 'sm:translate-y-6' : ''}`}>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-900/50">{p.icon}</div>
                <h3 className="mt-4 text-lg font-bold">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-purple-200/80">{p.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-20 grid md:grid-cols-3 gap-6">
          {VALUES.map(v => (
            <div key={v.title} className="rounded-2xl border border-purple-800/50 bg-gradient-to-b from-purple-900/40 to-purple-950/40 p-7">
              <div className="text-purple-400">{v.icon}</div>
              <h3 className="mt-4 text-xl font-bold">{v.title}</h3>
              <p className="mt-2 leading-7 text-purple-200/80">{v.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

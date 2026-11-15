'use client';

// The site pages' footer (home, About, Contact, Profile): the brand, every page of the site in
// columns (the product, the community, your account, the company), and the copyright with a "back to top".
import React from 'react';
import { ArrowUp, TrendingUp } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

type FooterLink = { href: string; label: string };

export default function SiteFooter() {
  const { user, loading } = useAuth();
  const signedIn = !!user;
  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: 'Product',
      links: [
        { href: '/chart', label: 'Open the chart' },
        { href: '/analytics', label: 'Analytics' },
        { href: '/analytics?view=trades', label: 'Trade analysis & journal' },
        { href: '/analytics?view=backtests', label: 'Backtesting analytics' },
        { href: '/#features', label: 'Features' },
        { href: '/pricing', label: 'Pricing' },
      ],
    },
    {
      title: 'Community',
      links: [
        { href: '/community', label: 'Community' },
        { href: '/leaderboard', label: 'Leaderboard' },
        { href: '/reels', label: 'Reels' },
      ],
    },
    {
      title: 'Your account',
      links: loading ? [] : signedIn
        ? [
          { href: '/profile', label: 'Your profile' },
          { href: '/profile?tab=sessions', label: 'Your backtesting' },
          { href: '/profile?tab=achievements', label: 'Achievements' },
          { href: '/profile?tab=settings', label: 'Settings' },
        ]
        : [{ href: '/login', label: 'Log in' }, { href: '/signup', label: 'Sign up' }],
    },
    {
      title: 'Company',
      links: [
        { href: '/', label: 'Home' },
        { href: '/about', label: 'About us' },
        { href: '/faq', label: 'Q&A' },
        { href: '/contact', label: 'Contact us' },
        { href: '/terms', label: 'Terms of Service' },
        { href: '/privacy', label: 'Privacy Policy' },
      ],
    },
  ];
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <footer data-name="site-footer" className="relative border-t border-purple-900/60 bg-black/40 backdrop-blur-sm text-white" style={{ zIndex: 1 }}>
      <div className="mx-auto max-w-6xl px-6 py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div>
          <a href="/" className="inline-flex items-center gap-2" aria-label="TradePilot home">
            <span className="w-9 h-9 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center"><TrendingUp className="w-5 h-5" /></span>
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent font-bold text-xl">TradePilot</span>
          </a>
          <p className="mt-4 text-sm leading-6 text-purple-300/80 max-w-xs">
            Professional charting, bar replay and backtesting, collab with your group, a voice assistant and analytics of every trade, in one place.
          </p>
          <a href="/chart" className="mt-5 inline-flex items-center rounded-lg bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 px-4 py-2 text-sm font-semibold transition-colors">
            Open the chart
          </a>
        </div>
        {columns.map(c => (
          <nav key={c.title} aria-label={c.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-purple-400">{c.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(l => (
                <li key={l.href}><a href={l.href} className="text-sm text-purple-200/80 hover:text-white transition-colors">{l.label}</a></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-purple-900/50">
        <div className="mx-auto max-w-6xl px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-purple-300/70">
          <span>© {new Date().getFullYear()} TradePilot. All rights reserved. · <a href="/faq" className="hover:text-white">Q&amp;A</a> · <a href="/terms" className="hover:text-white">Terms</a> · <a href="/privacy" className="hover:text-white">Privacy</a></span>
          <span className="text-center">Charts and analysis are for information, not financial advice. Trading involves risk.</span>
          <button type="button" onClick={toTop} className="inline-flex items-center gap-1 hover:text-white transition-colors" data-name="footer-top">
            <ArrowUp className="w-3.5 h-3.5" />Back to top
          </button>
        </div>
      </div>
    </footer>
  );
}

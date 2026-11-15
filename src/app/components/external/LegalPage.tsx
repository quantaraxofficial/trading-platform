'use client';

// The Terms and Privacy pages' layout: the site's nav and footer, a title with the date it took
// effect, a list of its sections (links), and the sections.
import React from 'react';
import SiteNav from './SiteNav';
import SiteFooter from './SiteFooter';

export interface LegalSection { id: string; title: string; body: React.ReactNode }

export default function LegalPage({ title, intro, updated, sections, active }: {
  title: string; intro: React.ReactNode; updated: string; sections: LegalSection[]; active: '/terms' | '/privacy';
}) {
  return (
    <div data-site-page className="min-h-screen relative text-white" style={{ backgroundColor: '#0f172a', overflow: 'clip', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', backgroundColor: 'rgba(139, 92, 246, 0.25)', filter: 'blur(120px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <SiteNav active={active} />
      <main className="relative mx-auto max-w-3xl px-6 pt-16 pb-20" style={{ zIndex: 10 }} data-name={`legal-${active.slice(1)}`}>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-slate-400">Effective {updated}</p>
        <div className="mt-6 text-slate-300 leading-7">{intro}</div>
        <nav aria-label="Sections" className="mt-8 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-purple-300 mb-3">On this page</div>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm list-decimal list-inside text-slate-300">
            {sections.map(s => <li key={s.id}><a href={`#${s.id}`} className="hover:text-white">{s.title}</a></li>)}
          </ol>
        </nav>
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="mt-10 scroll-mt-24">
            <h2 className="text-xl font-bold text-white">{i + 1}. {s.title}</h2>
            <div className="mt-3 space-y-3 text-slate-300 leading-7 legal-body">{s.body}</div>
          </section>
        ))}
      </main>
      <SiteFooter />
      <style jsx global>{`
        .legal-body ul { list-style: disc; padding-left: 1.25rem; }
        .legal-body li { margin: 0.35rem 0; }
        .legal-body a { color: #a78bfa; text-decoration: underline; }
        .legal-body b { color: #e2e8f0; }
      `}</style>
    </div>
  );
}

'use client';

// The Q&A page (lib/faq): search (matches highlighted, "/" jumps to it), topic filters with counts,
// answers that open and close (all at once too), a link per question (/faq#id opens it), "Was this
// helpful?" (kept for Django Admin: core/faq.py; once per question in this browser), and "Ask us"
// with the question or search carried to the Contact form.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Link2, Search, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { BACKEND_URL, backendFetch } from '@/lib/backend';
import { FAQ, FAQ_CATEGORIES, type FaqCategory, type FaqItem } from '../lib/faq';

const VOTES_KEY = 'tv:faqVotes';
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const words = (q: string) => norm(q).split(/\s+/).filter(w => w.length > 1);

function matches(item: FaqItem, ws: string[]) {
  if (!ws.length) return true;
  const text = norm([item.q, ...item.a].join(' '));
  return ws.every(w => text.includes(w));
}

// The search's words marked in a text
function Marked({ text, ws }: { text: string; ws: string[] }) {
  if (!ws.length) return <>{text}</>;
  const esc = ws.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${esc.join('|')})`, 'gi'));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="bg-purple-500/40 text-white rounded px-0.5">{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}

const askUrl = (text: string) => `/contact?message=${encodeURIComponent(text)}`;

export default function FaqApp() {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<FaqCategory | 'all'>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [votes, setVotes] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const ws = useMemo(() => words(query), [query]);

  useEffect(() => {
    try { setVotes(JSON.parse(localStorage.getItem(VOTES_KEY) || '{}') || {}); } catch { /* storage off */ }
    // a question's link opens it
    const openHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!FAQ.some(f => f.id === id)) return;
      setTopic('all'); setQuery('');
      setOpen(prev => new Set(prev).add(id));
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };
    openHash();
    window.addEventListener('hashchange', openHash);
    // "/" jumps to the search
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('hashchange', openHash); window.removeEventListener('keydown', onKey); };
  }, []);

  const found = useMemo(() => FAQ.filter(f => matches(f, ws)), [ws]);
  const shown = topic === 'all' ? found : found.filter(f => f.category === topic);
  const count = (c: FaqCategory) => found.filter(f => f.category === c).length;
  // searching opens what it finds (a few at most)
  useEffect(() => {
    if (ws.length && found.length <= 6) setOpen(new Set(found.map(f => f.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws]);
  const isOpen = (id: string) => open.has(id);
  const allOpen = shown.length > 0 && shown.every(f => isOpen(f.id));

  // one open at a time: opening a question closes the others ("Expand all" still opens them all)
  const toggle = (id: string) => setOpen(prev => (prev.has(id) ? new Set(Array.from(prev).filter(x => x !== id)) : new Set([id])));
  const setAll = (on: boolean) => setOpen(on ? new Set(shown.map(f => f.id)) : new Set());

  const vote = (id: string, helpful: boolean) => {
    if (id in votes) return;
    const next = { ...votes, [id]: helpful };
    setVotes(next);
    try { localStorage.setItem(VOTES_KEY, JSON.stringify(next)); } catch { /* storage off */ }
    backendFetch(`${BACKEND_URL}/api/users/faq/vote/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, helpful }),
    }).catch(() => { /* offline: the thanks still shows */ });
  };

  const copyLink = async (id: string) => {
    const url = `${location.origin}/faq#${id}`;
    try { await navigator.clipboard.writeText(url); } catch { history.replaceState(null, '', `#${id}`); }
    setCopied(id);
    setTimeout(() => setCopied(c => (c === id ? null : c)), 1800);
  };

  const label = (c: FaqCategory) => FAQ_CATEGORIES.find(x => x.id === c)?.label || c;

  return (
    <div data-name="faq" className="relative mx-auto max-w-3xl px-6 pb-20" style={{ zIndex: 10 }}>
      {/* search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" aria-hidden />
        <input ref={searchRef} type="text" inputMode="search" enterKeyHint="search" role="searchbox" value={query} onChange={e => setQuery(e.target.value)} data-name="faq-search"
          onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery(''); } }}
          placeholder="Search the questions…" aria-label="Search the questions"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 py-4 pl-12 pr-12 text-base text-white placeholder-slate-500 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30" />
        {!query && <kbd className="hidden md:block absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-slate-600 px-2 py-0.5 text-xs text-slate-400" title="Press / to search">/</kbd>}
        {query && (
          <button type="button" onClick={() => { setQuery(''); searchRef.current?.focus(); }} aria-label="Clear the search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="w-4 h-4" /></button>
        )}
      </div>

      {/* topics */}
      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Topics">
        {[{ id: 'all' as const, label: 'All' }, ...FAQ_CATEGORIES].map(c => {
          const n = c.id === 'all' ? found.length : count(c.id);
          const on = topic === c.id;
          return (
            <button key={c.id} type="button" role="tab" aria-selected={on} onClick={() => setTopic(c.id)} disabled={!n && !on}
              data-name={`faq-topic-${c.id}`}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${on ? 'border-purple-500 bg-purple-600 text-white' : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-purple-500/60 hover:text-white'} disabled:opacity-35 disabled:cursor-default`}>
              {c.label} <span className={on ? 'text-purple-200' : 'text-slate-500'}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between text-sm text-slate-400">
        <span data-name="faq-count">{shown.length} {shown.length === 1 ? 'question' : 'questions'}{ws.length ? ` for “${query.trim()}”` : ''}</span>
        {shown.length > 0 && <button type="button" onClick={() => setAll(!allOpen)} className="text-purple-300 hover:text-white" data-name="faq-toggle-all">{allOpen ? 'Collapse all' : 'Expand all'}</button>}
      </div>

      {/* the questions */}
      <div className="mt-3 space-y-3">
        {shown.map(f => {
          const on = isOpen(f.id);
          const voted = f.id in votes;
          return (
            <section key={f.id} id={f.id} data-name="faq-item" className={`scroll-mt-24 rounded-2xl border transition-colors ${on ? 'border-purple-600/60 bg-slate-900/80' : 'border-slate-700/70 bg-slate-900/50 hover:border-slate-600'}`}>
              <h2 className="m-0">
                <button type="button" onClick={() => toggle(f.id)} aria-expanded={on} aria-controls={`${f.id}-a`}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left text-white">
                  <span className="flex-1 text-[17px] font-semibold"><Marked text={f.q} ws={ws} /></span>
                  {topic === 'all' && <span className="hidden sm:inline rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-slate-400">{label(f.category)}</span>}
                  <ChevronDown className={`w-5 h-5 flex-none text-purple-300 transition-transform ${on ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              </h2>
              {on && (
                <div id={`${f.id}-a`} className="px-5 pb-5 -mt-1 text-slate-300 leading-7">
                  {f.a.map((p, i) => <p key={i} className="mt-2"><Marked text={p} ws={ws} /></p>)}
                  {f.links && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {f.links.map(l => <a key={l.href} href={l.href} className="rounded-lg bg-purple-600/20 px-3 py-1.5 text-sm font-medium text-purple-200 hover:bg-purple-600/40 hover:text-white">{l.label} →</a>)}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-700/60 pt-3 text-sm text-slate-400">
                    {voted ? (
                      <span data-name="faq-voted">
                        Thanks for letting us know.{' '}
                        {votes[f.id] === false && <a href={askUrl(`About "${f.q}": `)} className="text-purple-300 hover:text-white underline">Ask us about it</a>}
                      </span>
                    ) : (
                      <>
                        <span>Was this helpful?</span>
                        <button type="button" onClick={() => vote(f.id, true)} data-name="faq-yes" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 hover:border-green-500/70 hover:text-green-300"><ThumbsUp className="w-3.5 h-3.5" />Yes</button>
                        <button type="button" onClick={() => vote(f.id, false)} data-name="faq-no" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 hover:border-rose-500/70 hover:text-rose-300"><ThumbsDown className="w-3.5 h-3.5" />No</button>
                      </>
                    )}
                    <button type="button" onClick={() => copyLink(f.id)} className="ml-auto inline-flex items-center gap-1.5 hover:text-white" data-name="faq-copy-link">
                      <Link2 className="w-3.5 h-3.5" />{copied === f.id ? 'Link copied' : 'Copy link'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* nothing found, or still a question */}
      <div className="mt-10 rounded-2xl border border-slate-700/70 bg-gradient-to-br from-purple-900/30 to-indigo-900/20 p-6 text-center" data-name="faq-ask">
        <div className="text-lg font-semibold text-white">{shown.length ? 'Still have a question?' : `No answers for “${query.trim()}” yet`}</div>
        <p className="mt-1 text-slate-400">Ask us and we&apos;ll answer by email.</p>
        <a href={askUrl(ws.length ? query.trim() : '')} className="mt-4 inline-block rounded-xl bg-purple-600 px-5 py-2.5 font-semibold text-white hover:bg-purple-700" data-name="faq-ask-link">
          {ws.length ? 'Ask us this' : 'Ask us a question'}
        </a>
      </div>
    </div>
  );
}

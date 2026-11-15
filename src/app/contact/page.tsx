"use client";

// The Contact page, in the home page's look (the dark-to-purple gradient, glowing blobs, purple glass
// cards): where else to get help, and the form (sent to the team: core/contact.py → Django Admin's
// Contact messages, with a notification). The Q&A page's "Ask us" fills the message (?message=…).
import React, { useEffect, useState } from 'react';
import { CheckCircle2, HelpCircle, MessageSquareText, Send, UserRound } from 'lucide-react';
import SiteNav from '../components/external/SiteNav';
import SiteFooter from '../components/external/SiteFooter';
import { BACKEND_URL, backendFetch } from '@/lib/backend';

const HELP = [
  { icon: <HelpCircle className="w-6 h-6" />, title: 'Questions & answers', text: 'Most questions about the chart, replay, collab and your account are answered here.', href: '/faq', cta: 'Browse the Q&A' },
  { icon: <MessageSquareText className="w-6 h-6" />, title: 'Feedback from the chart', text: 'Send feedback in the chart’s right toolbar: a picture of your chart goes with it.', href: '/chart', cta: 'Open the chart' },
  { icon: <UserRound className="w-6 h-6" />, title: 'Your account', text: 'Need an account, a new password or a device signed out? Write to us with the form.', href: '#contact-form', cta: 'Write to us' },
];

export default function ContactPage() {
  return (
    <div data-site-page className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black text-white overflow-x-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className="blob blob-1"></div><div className="blob blob-2"></div><div className="blob blob-3"></div>
      </div>
      <SiteNav active="/contact" />

      <main className="relative px-6 pt-12 pb-24" style={{ zIndex: 1 }}>
        <div className="container mx-auto max-w-6xl">
          <header className="text-center max-w-2xl mx-auto">
            <span className="inline-block rounded-full border border-purple-700/60 bg-purple-900/40 px-4 py-1 text-sm font-medium text-purple-300">Contact</span>
            <h1 className="mt-5 text-4xl md:text-6xl font-bold leading-tight">
              Get in <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">touch</span>
            </h1>
            <p className="mt-5 text-lg md:text-xl text-purple-300">
              A question about features, your account or anything else? Send us a message and we’ll answer by email.
            </p>
          </header>

          <div className="mt-14 grid lg:grid-cols-[1fr_1.2fr] gap-8 items-start">
            <div className="space-y-4">
              {HELP.map(h => (
                <a key={h.title} href={h.href} className="group flex gap-4 rounded-2xl border border-purple-800/50 bg-purple-950/60 backdrop-blur-sm p-5 transition-all hover:border-purple-500 hover:bg-purple-900/40">
                  <span className="flex-none w-11 h-11 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-900/50">{h.icon}</span>
                  <span>
                    <span className="block text-lg font-bold">{h.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-purple-200/80">{h.text}</span>
                    <span className="mt-2 inline-block text-sm font-semibold text-purple-300 group-hover:text-white">{h.cta} →</span>
                  </span>
                </a>
              ))}
            </div>

            <div id="contact-form" className="scroll-mt-28 rounded-2xl border border-purple-700/60 bg-purple-950/70 backdrop-blur-md p-6 sm:p-8 shadow-2xl shadow-purple-950/60">
              <h2 className="text-2xl font-bold">Send us a message</h2>
              <p className="mt-1 text-purple-300/90">We usually reply within a working day.</p>
              <div className="mt-6"><ContactForm /></div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />

      <style jsx global>{`
        .blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.15; will-change: opacity; transform: translateZ(0); animation: pulse-blob 6s ease-in-out infinite; }
        .blob-1 { width: 320px; height: 320px; background: #581c87; top: -80px; right: -80px; }
        .blob-2 { width: 320px; height: 320px; background: #581c87; bottom: -80px; left: -80px; }
        .blob-3 { width: 384px; height: 384px; background: #4c1d95; top: 50%; left: 50%; transform: translate3d(-50%, -50%, 0); opacity: 0.08; }
        @keyframes pulse-blob { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.25; } }
      `}</style>
    </div>
  );
}

// The form: sent to the team (core/contact.py). Signed in, it's linked to your account.
const inputCls = 'w-full rounded-xl border border-purple-800/70 bg-black/40 px-4 py-3 text-white placeholder-purple-300/40 outline-none transition-colors focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30';
const labelCls = 'text-sm font-semibold text-purple-100';
const errCls = 'text-sm text-rose-300';

function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'busy'>('idle');
  // (the Q&A page's "Ask us" brings the question: ?message=…)
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('message');
    if (m) setMessage(m.slice(0, 5000));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = 'Please enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) local.email = 'Please enter a valid email address.';
    if (!message.trim()) local.message = 'Please write a message.';
    setErrors(local);
    if (Object.keys(local).length) return;
    setState('sending');
    try {
      const res = await backendFetch(`${BACKEND_URL}/api/users/contact/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      });
      if (res.ok) { setState('sent'); setName(''); setEmail(''); setMessage(''); return; }
      if (res.status === 429) { setState('busy'); return; }
      const data = await res.json().catch(() => null);
      if (data?.errors) { setErrors(data.errors); setState('idle'); return; }
      setState('failed');
    } catch { setState('failed'); }
  };

  if (state === 'sent') return (
    <div data-name="contact-sent" className="py-8 text-center">
      <CheckCircle2 className="mx-auto w-14 h-14 text-green-400" />
      <div className="mt-4 text-2xl font-bold">Thanks, your message is sent.</div>
      <p className="mt-2 text-purple-300">We&apos;ll get back to you by email.</p>
      <button type="button" onClick={() => setState('idle')} className="mt-6 rounded-lg border-2 border-purple-600 hover:border-white px-5 py-2.5 font-semibold transition-colors">Send another</button>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate data-name="contact-form" className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="space-y-2">
          <label htmlFor="contact-name" className={labelCls}>Name</label>
          <input id="contact-name" type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="name" className={inputCls} aria-invalid={!!errors.name} />
          {errors.name && <span className={errCls}>{errors.name}</span>}
        </div>
        <div className="space-y-2">
          <label htmlFor="contact-email" className={labelCls}>Email</label>
          <input id="contact-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} autoComplete="email" className={inputCls} aria-invalid={!!errors.email} />
          {errors.email && <span className={errCls}>{errors.email}</span>}
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="contact-message" className={labelCls}>Message</label>
        <textarea id="contact-message" rows={6} placeholder="How can we help?" value={message} onChange={e => setMessage(e.target.value)} maxLength={5000} className={`${inputCls} resize-y`} aria-invalid={!!errors.message} />
        <div className="flex justify-between">
          {errors.message ? <span className={errCls}>{errors.message}</span> : <span />}
          <span className="text-xs text-purple-300/60">{message.length}/5000</span>
        </div>
      </div>
      {state === 'failed' && <div className={errCls} role="alert">It couldn&apos;t be sent just now. Please try again in a moment.</div>}
      {state === 'busy' && <div className={errCls} role="alert">You&apos;ve sent a few messages already. Please try again in an hour.</div>}
      <button type="submit" disabled={state === 'sending'} data-name="contact-send"
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 px-6 py-3.5 text-lg font-semibold transition-all disabled:opacity-70">
        <Send className="w-5 h-5" />{state === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}

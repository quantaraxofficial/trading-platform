"use client";

import SiteNav from '../components/external/SiteNav';
import SiteFooter from '../components/external/SiteFooter';
import React, { useState } from 'react';
import { BACKEND_URL, backendFetch } from '@/lib/backend';
import { Zap, MessageSquare, MapPin } from 'lucide-react';
import { ComingSoonLine } from '../components/external/ComingSoon';
import Link from 'next/link';

export default function ContactPage() {
  return (
    <div data-site-page style={{ 
      minHeight: '100vh', 
      backgroundColor: '#0f172a', 
      color: 'white', 
      position: 'relative', 
      overflow: 'clip', // clips the glows without a second scroll bar (hidden would scroll)
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Abstract Background Gradients */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', backgroundColor: 'rgba(139, 92, 246, 0.3)', filter: 'blur(120px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '40%', height: '40%', backgroundColor: 'rgba(99, 102, 241, 0.3)', filter: 'blur(120px)', borderRadius: '50%', pointerEvents: 'none' }} />

      {/* Navigation (a ☰ menu on phones) */}
      <SiteNav active="/contact" />

      {/* Hero Section */}
      <div style={{ position: 'relative', zIndex: 10, paddingTop: '80px', paddingBottom: '48px', textAlign: 'center', paddingLeft: '16px', paddingRight: '16px', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '56px', fontWeight: 800, marginBottom: '24px', letterSpacing: '-0.025em' }}>
          Get in <span style={{ background: 'linear-gradient(to right, #a78bfa, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Touch</span>
        </h1>
        <p style={{ fontSize: '20px', color: '#94a3b8', lineHeight: '1.6' }}>
          Whether you have a question about features, trials, pricing, or anything else, our team is ready to answer all your questions.
        </p>
      </div>

      {/* Contact Form & Info */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: '1000px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: '48px', padding: '0 24px 96px' }}>
        
        {/* Contact Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{ padding: '12px', backgroundColor: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', color: '#818cf8' }}>
              <MessageSquare size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>Live Chat</h3>
              <p style={{ color: '#94a3b8', marginBottom: '8px' }}>Available for Pro members 24/7.</p>
              <span style={{ color: '#818cf8', fontWeight: 500, cursor: 'pointer' }}>Open Chat</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{ padding: '12px', backgroundColor: 'rgba(236, 72, 153, 0.1)', borderRadius: '12px', color: '#f472b6' }}>
              <MapPin size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>Office</h3>
              <p style={{ color: '#94a3b8', lineHeight: '1.5' }}>123 Trading Ave, Suite 500<br/>New York, NY 10004<br/>United States</p>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)', padding: '32px', borderRadius: '24px', border: '1px solid rgba(51, 65, 85, 0.5)', backdropFilter: 'blur(12px)' }}>
          <ContactForm />
        </div>

      </div>
      
      {/* What's coming, in a line */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: '1000px', margin: '0 auto', padding: '0 24px 64px' }}>
        <ComingSoonLine />
      </div>

      <SiteFooter />
    </div>
  );
}

// The form: sent to the team (core/contact.py → Django Admin's Contact messages, with a notification).
// Signed in, it's linked to your account.
const inputStyle: React.CSSProperties = { padding: '12px 16px', borderRadius: '12px', backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid #334155', color: 'white', outline: 'none', width: '100%' };
const labelStyle: React.CSSProperties = { fontSize: '14px', fontWeight: 600, color: '#e2e8f0' };
const errStyle: React.CSSProperties = { fontSize: '13px', color: '#fca5a5' };

function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'busy'>('idle');

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
    <div data-name="contact-sent" style={{ textAlign: 'center', padding: '24px 8px' }}>
      <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Thanks, your message is sent.</div>
      <p style={{ color: '#94a3b8', lineHeight: 1.6, marginBottom: '20px' }}>We&apos;ll get back to you by email.</p>
      <button type="button" onClick={() => setState('idle')} style={{ padding: '10px 18px', borderRadius: '12px', border: '1px solid #475569', background: 'transparent', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Send another</button>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate data-name="contact-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label htmlFor="contact-name" style={labelStyle}>Name</label>
        <input id="contact-name" type="text" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="name" style={inputStyle} aria-invalid={!!errors.name} />
        {errors.name && <span style={errStyle}>{errors.name}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label htmlFor="contact-email" style={labelStyle}>Email</label>
        <input id="contact-email" type="email" placeholder="john@example.com" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} autoComplete="email" style={inputStyle} aria-invalid={!!errors.email} />
        {errors.email && <span style={errStyle}>{errors.email}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label htmlFor="contact-message" style={labelStyle}>Message</label>
        <textarea id="contact-message" rows={4} placeholder="How can we help?" value={message} onChange={e => setMessage(e.target.value)} maxLength={5000} style={{ ...inputStyle, resize: 'vertical' }} aria-invalid={!!errors.message}></textarea>
        {errors.message && <span style={errStyle}>{errors.message}</span>}
      </div>
      {state === 'failed' && <span style={errStyle} role="alert">It couldn&apos;t be sent just now. Please try again in a moment.</span>}
      {state === 'busy' && <span style={errStyle} role="alert">You&apos;ve sent a few messages already. Please try again in an hour.</span>}
      <button type="submit" disabled={state === 'sending'} data-name="contact-send" style={{ marginTop: '8px', padding: '14px', borderRadius: '12px', border: 'none', cursor: state === 'sending' ? 'default' : 'pointer', fontWeight: 700, backgroundColor: '#9333ea', color: 'white', fontSize: '16px', transition: 'all 0.2s', width: '100%', opacity: state === 'sending' ? 0.7 : 1 }}>
        {state === 'sending' ? 'Sending…' : 'Send Message'}
      </button>
    </form>
  );
}

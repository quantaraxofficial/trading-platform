"use client";

import SiteNav from '../components/external/SiteNav';
import React from 'react';
import { Zap, Mail, MessageSquare, MapPin } from 'lucide-react';
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
            <div style={{ padding: '12px', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: '12px', color: '#a78bfa' }}>
              <Mail size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>Email Support</h3>
              <p style={{ color: '#94a3b8', marginBottom: '8px' }}>Send us an email anytime.</p>
              <a href="mailto:support@tradepilot.com" style={{ color: '#a78bfa', textDecoration: 'none', fontWeight: 500 }}>support@tradepilot.com</a>
            </div>
          </div>
          
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
          <form style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>Name</label>
              <input type="text" placeholder="John Doe" style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid #334155', color: 'white', outline: 'none', width: '100%' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>Email</label>
              <input type="email" placeholder="john@example.com" style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid #334155', color: 'white', outline: 'none', width: '100%' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>Message</label>
              <textarea rows={4} placeholder="How can we help?" style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid #334155', color: 'white', outline: 'none', width: '100%', resize: 'vertical' }}></textarea>
            </div>
            <button type="button" style={{ marginTop: '8px', padding: '14px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 700, backgroundColor: '#9333ea', color: 'white', fontSize: '16px', transition: 'all 0.2s', width: '100%' }}>
              Send Message
            </button>
          </form>
        </div>

      </div>
      
      {/* What's coming, in a line */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: '1000px', margin: '0 auto', padding: '0 24px 64px' }}>
        <ComingSoonLine />
      </div>

      {/* Footer */}
      <footer style={{ position: 'relative', zIndex: 10, borderTop: '1px solid #1e293b', padding: '48px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '32px', color: '#64748b', fontSize: '14px' }}>
          <div>© 2026 TradePilot Trading Solutions. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}

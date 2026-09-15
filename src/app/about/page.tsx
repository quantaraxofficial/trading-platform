"use client";

import React from 'react';
import { Zap, Shield, Globe, Award } from 'lucide-react';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#0f172a', 
      color: 'white', 
      position: 'relative', 
      overflowX: 'hidden',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Abstract Background Gradients */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', backgroundColor: 'rgba(139, 92, 246, 0.3)', filter: 'blur(120px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '40%', height: '40%', backgroundColor: 'rgba(99, 102, 241, 0.3)', filter: 'blur(120px)', borderRadius: '50%', pointerEvents: 'none' }} />

      {/* Navigation */}
      <nav style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
        <Link href="/landing" style={{ fontSize: '24px', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(to right, #a78bfa, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          <Zap size={24} style={{ color: '#8b5cf6', fill: '#8b5cf6' }} />
          TradePilot
        </Link>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <Link href="/landing" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '15px' }}>Home</Link>
          <Link href="/" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '15px' }}>Chart</Link>
          <Link href="/pricing" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '15px' }}>Pricing</Link>
          <Link href="/about" style={{ color: 'white', textDecoration: 'none', fontSize: '15px', fontWeight: 600 }}>About Us</Link>
          <Link href="/contact" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '15px' }}>Contact</Link>
          <Link href="/login" style={{ padding: '10px 24px', backgroundColor: '#9333ea', borderRadius: '8px', color: 'white', textDecoration: 'none', fontWeight: 600, fontSize: '15px' }}>Sign In</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div style={{ position: 'relative', zIndex: 10, paddingTop: '80px', paddingBottom: '48px', textAlign: 'center', paddingLeft: '16px', paddingRight: '16px', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '56px', fontWeight: 800, marginBottom: '24px', letterSpacing: '-0.025em' }}>
          Our <span style={{ background: 'linear-gradient(to right, #a78bfa, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Mission</span>
        </h1>
        <p style={{ fontSize: '20px', color: '#94a3b8', lineHeight: '1.6' }}>
          We built TradePilot to bridge the gap between institutional-grade tools and retail traders. 
          Our goal is to provide the most powerful, intuitive, and lightning-fast charting platform on the web.
        </p>
      </div>

      {/* Values Section */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px', padding: '48px 24px 96px' }}>
        <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)', padding: '32px', borderRadius: '24px', border: '1px solid rgba(51, 65, 85, 0.5)', backdropFilter: 'blur(12px)' }}>
          <Globe className="text-purple-400 mb-6" size={32} />
          <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>Accessibility</h3>
          <p style={{ color: '#94a3b8', lineHeight: '1.5' }}>World-class financial tools shouldn't be locked behind expensive terminals. We bring them directly to your browser.</p>
        </div>
        <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)', padding: '32px', borderRadius: '24px', border: '1px solid rgba(51, 65, 85, 0.5)', backdropFilter: 'blur(12px)' }}>
          <Shield className="text-indigo-400 mb-6" size={32} />
          <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>Reliability</h3>
          <p style={{ color: '#94a3b8', lineHeight: '1.5' }}>When markets move fast, you need a platform that moves faster. Our architecture is built for 99.9% uptime and zero latency.</p>
        </div>
        <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)', padding: '32px', borderRadius: '24px', border: '1px solid rgba(51, 65, 85, 0.5)', backdropFilter: 'blur(12px)' }}>
          <Award className="text-pink-400 mb-6" size={32} />
          <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>Innovation</h3>
          <p style={{ color: '#94a3b8', lineHeight: '1.5' }}>We are constantly pushing the boundaries of what is possible in web-based technical analysis and charting.</p>
        </div>
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

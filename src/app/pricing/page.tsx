"use client";

import React, { useState, useEffect } from 'react';
import { Check, Zap, Shield, Star, Crown, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
export default function PricingPage() {
  const [country, setCountry] = useState<string | null>(null);

  useEffect(() => {
    fetch('https://api.country.is/')
      .then(res => res.json())
      .then(data => setCountry(data.country))
      .catch(() => setCountry('IN')); // Fallback to IN on error
  }, []);

  const isIndia = country === 'IN' || country === null;
  const currencySymbol = isIndia ? '₹' : '$';
  const getPrice = (inr: number) => isIndia ? inr : (inr / 83.5).toFixed(2);

  const plans = [
    {
      name: "1 Month",
      icon: <Star className="text-purple-400" size={24} />,
      price: getPrice(779),
      period: "per month",
      description: "Billed monthly. Cancel anytime.",
      features: [
        "Real-time Stock Data",
        "Unlimited Indicators",
        "Standard Drawing Tools",
        "Cloud Sync",
        "Email Support"
      ],
      color: "rgba(139, 92, 246, 0.1)",
      borderColor: "rgba(139, 92, 246, 0.2)",
      buttonColor: "bg-purple-600",
      popular: false
    },
    {
      name: "3 Months",
      icon: <Crown className="text-indigo-400" size={24} />,
      price: getPrice(559),
      period: "per month",
      description: `Billed as one payment of ${currencySymbol}${isIndia ? 1677 : (1677 / 83.5).toFixed(2)}.`,
      features: [
        "Everything in 1 Month",
        "Bar Replay Mode",
        "Drawing Templates",
        "Priority Chat Support"
      ],
      color: "rgba(99, 102, 241, 0.15)",
      borderColor: "rgba(99, 102, 241, 0.4)",
      buttonColor: "bg-indigo-600",
      popular: true
    },
    {
      name: "6 Months",
      icon: <Zap className="text-pink-400" size={24} />,
      price: getPrice(449),
      period: "per month",
      description: `Billed as one payment of ${currencySymbol}${isIndia ? 2694 : (2694 / 83.5).toFixed(2)}.`,
      features: [
        "Everything in 3 Months",
        "Level 2 Market Data",
        "API Access (Rest & Websocket)",
        "Dedicated Account Manager"
      ],
      color: "rgba(236, 72, 153, 0.1)",
      borderColor: "rgba(236, 72, 153, 0.2)",
      buttonColor: "bg-pink-600",
      popular: false
    }
  ];

  const siteFeatures = [
    { title: "Advanced Charting", desc: "High-performance charts with lightning fast interactions.", icon: <Sparkles className="text-purple-500" /> },
    { title: "Technical Analysis", desc: "Over 50+ drawing tools and hundreds of built-in indicators.", icon: <Zap className="text-indigo-500" /> },
    { title: "Cloud Persistence", desc: "Never lose a drawing. Everything is synced to your account.", icon: <Shield className="text-blue-500" /> },
    { title: "Bar Replay", desc: "Practice your strategies by replaying historical price action.", icon: <RotateCcw className="text-pink-500" size={20}/> }
  ];

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
          <Link href="/login" style={{ padding: '10px 24px', backgroundColor: '#9333ea', borderRadius: '8px', color: 'white', textDecoration: 'none', fontWeight: 600, fontSize: '15px' }}>Sign In</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div style={{ position: 'relative', zIndex: 10, paddingTop: '80px', paddingBottom: '48px', textAlign: 'center', paddingLeft: '16px', paddingRight: '16px' }}>
        <h1 style={{ fontSize: '56px', fontWeight: 800, marginBottom: '24px', letterSpacing: '-0.025em' }}>
          Supercharge Your <span style={{ background: 'linear-gradient(to right, #a78bfa, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Trading</span>
        </h1>
        <p style={{ fontSize: '20px', color: '#94a3b8', maxWidth: '672px', margin: '0 auto 48px' }}>
          Unlock institutional-grade tools, real-time data, and cloud persistence for all your technical analysis needs.
        </p>

        {/* Billing Cycle Toggle removed as plans now represent durations */}
      </div>

      {/* Pricing Cards */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px', padding: '0 24px 96px' }}>
        {plans.map((plan) => (
          <div 
            key={plan.name}
            style={{ 
              backgroundColor: plan.color, borderColor: plan.borderColor,
              position: 'relative', padding: '32px', borderRadius: '24px', border: '2px solid',
              display: 'flex', flexDirection: 'column', gap: '24px', backdropFilter: 'blur(12px)',
              transition: 'transform 0.3s',
              boxShadow: plan.popular ? '0 20px 40px rgba(99, 102, 241, 0.2)' : 'none'
            }}
          >
            {plan.popular && (
              <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: '#6366f1', color: 'white', padding: '4px 16px', borderRadius: '9999px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', boxShadow: '0 8px 16px rgba(0,0,0,0.2)' }}>
                Most Popular
              </div>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ padding: '12px', backgroundColor: 'rgba(30, 41, 59, 0.5)', borderRadius: '16px', border: '1px solid rgba(51, 65, 85, 0.5)' }}>
                {plan.icon}
              </div>
              <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>{plan.name}</h2>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '36px', fontWeight: 800 }}>{currencySymbol}{plan.price}</span>
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>{plan.period}</span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '8px', lineHeight: '1.5' }}>{plan.description}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, margin: '16px 0' }}>
              {plan.features.map(feature => (
                <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#e2e8f0' }}>
                  <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', padding: '4px', borderRadius: '50%', display: 'flex' }}>
                    <Check style={{ color: '#10b981' }} size={14} />
                  </div>
                  {feature}
                </div>
              ))}
            </div>

            <button style={{ 
              width: '100%', padding: '16px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              backgroundColor: plan.buttonColor.replace('bg-', '#').replace('purple-600', '9333ea').replace('indigo-600', '4f46e5').replace('pink-600', 'db2777'),
              color: 'white', fontSize: '16px', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}>
              Get Started
              <ArrowRight size={18} />
            </button>
          </div>
        ))}
      </div>

      {/* Features Grid */}
      <div style={{ position: 'relative', zIndex: 10, backgroundColor: 'rgba(15, 23, 42, 0.5)', borderTop: '1px solid #1e293b', borderBottom: '1px solid #1e293b', padding: '96px 24px', backdropFilter: 'blur(20px)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <h2 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '16px' }}>Why choose TradePilot?</h2>
            <p style={{ color: '#94a3b8' }}>Professional tools built for performance and reliability.</p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '48px' }}>
            {siteFeatures.map(feat => (
              <div key={feat.title} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', backgroundColor: '#1e293b', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', border: '1px solid #334155', boxShadow: '0 8px 16px rgba(0,0,0,0.2)' }}>
                  {feat.icon}
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>{feat.title}</h3>
                <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.6' }}>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ position: 'relative', zIndex: 10, borderTop: '1px solid #1e293b', padding: '48px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '32px', color: '#64748b', fontSize: '14px' }}>
          <div>© 2026 TradePilot Trading Solutions. All rights reserved.</div>
          <div style={{ display: 'flex', gap: '32px' }}>
            <Link href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Terms of Service</Link>
            <Link href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Internal icon component for Bar Replay
function RotateCcw({ size = 20, className = "" }: { size?: number, className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

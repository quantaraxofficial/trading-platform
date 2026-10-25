'use client';
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

/**
 * TradingView-style login page (observed from the real in.tradingview.com UI):
 * dark, centered card with a Google "continue with" option, an OR divider,
 * email + password, a primary action button, and a muted "create account"
 * link. This build has no public self-signup (accounts are created by the
 * operator in the Django admin), so that link is intentionally non-functional.
 */
export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleManualSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(formData.email, formData.password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setBusy(true);
    try {
      // false means the Google window was closed without signing in
      if (await signInWithGoogle()) router.push('/');
    } catch (err: any) {
      setError(err.message || 'Sign-in with Google failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', backgroundColor: 'var(--tv-color-bg)', color: 'var(--tv-color-text)',
      fontFamily: "Inter, 'Arial', sans-serif",
    }}>
      {/* Brand wordmark, top-left (TradingView puts the logo here on the login card) */}
      <div style={{ position: 'fixed', top: '14px', left: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
          <rect x="1" y="1" width="26" height="26" rx="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 17.5l4.5-7L16 17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 10.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: '16px', fontWeight: 700 }}>TradePilot</span>
      </div>

      <div style={{
        width: '100%', maxWidth: '390px',
        border: '1px solid var(--tv-color-border)',
        borderRadius: '8px',
        backgroundColor: 'var(--tv-color-pane-bg)',
        overflow: 'hidden',
      }}>
        {/* Card header */}
        <div style={{ padding: '24px 24px 0' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0, color: 'var(--tv-color-text)' }}>Sign in</h1>
          <p style={{ fontSize: '13px', color: 'var(--tv-color-text-muted)', margin: '6px 0 0' }}>
            Your account lets your charts follow you across devices
          </p>
        </div>

        {error && (
          <div style={{
            margin: '14px 24px 0', padding: '8px 12px', borderRadius: '6px',
            backgroundColor: 'rgba(242,54,69,0.1)', border: '1px solid rgba(242,54,69,0.3)',
            color: '#f23645', fontSize: '13px', textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <div style={{ padding: '20px 24px 24px' }}>
          {/* Google, TradingView's primary option */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              height: '40px', border: '1px solid var(--tv-color-border)', borderRadius: '6px',
              background: 'var(--tv-color-bg)', color: 'var(--tv-color-text)', fontSize: '14px',
              fontWeight: 500, cursor: busy ? 'wait' : 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l4.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          {/* OR divider, TradingView style */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--tv-color-border)' }} />
            <span style={{ fontSize: '12px', color: 'var(--tv-color-text-muted)' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--tv-color-border)' }} />
          </div>

          <form onSubmit={handleManualSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--tv-color-text-muted)' }}>Email</span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="you@example.com"
                style={{
                  height: '38px', padding: '0 12px', borderRadius: '6px',
                  border: '1px solid var(--tv-color-border)', background: 'var(--tv-color-bg)',
                  color: 'var(--tv-color-text)', fontSize: '14px', outline: 'none',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--tv-color-text-muted)' }}>Password</span>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder="Your password"
                  style={{
                    width: '100%', height: '38px', padding: '0 36px 0 12px', borderRadius: '6px',
                    border: '1px solid var(--tv-color-border)', background: 'var(--tv-color-bg)',
                    color: 'var(--tv-color-text)', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '28px', height: '28px', border: 'none', background: 'transparent',
                    color: 'var(--tv-color-text-muted)', cursor: 'pointer',
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={busy}
              style={{
                height: '38px', borderRadius: '6px', border: 'none',
                background: 'var(--tv-color-accent, #2962ff)', color: '#fff',
                fontSize: '14px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
              }}
            >
              Sign in
            </button>
          </form>

          {/* Muted footer row: the create-account link is present like TradingView's,
              but this build has no public signup — accounts are issued by the operator */}
          <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--tv-color-text-muted)' }}>
            No account yet?{' '}
            <span style={{ color: 'var(--tv-color-text-muted)', cursor: 'not-allowed', opacity: 0.7 }} title="Accounts are created for you by the platform owner">
              Get your account
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

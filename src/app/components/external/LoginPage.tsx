'use client';
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

/**
 * TradingView-style login page (observed from the real in.tradingview.com UI):
 * dark, centered card with email + password, a "Remember me" checkbox,
 * "Forgot password?" (handled by the platform owner, not self-service),
 * a primary action button, and a muted "create account" link. This build
 * has no public self-signup (accounts are created by the operator in the
 * Django admin), so that link is intentionally non-functional.
 */
export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
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
      // "Remember me" keeps this browser's Firebase session persistent;
      // unchecking it uses the browser's default (session-only) auth
      if (!remember) {
        try { localStorage.removeItem('tv_keep_me'); } catch { /* ignore */ }
      } else {
        try { localStorage.setItem('tv_keep_me', '1'); } catch { /* ignore */ }
      }
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  // Google account sign-in (a pop-up); closing the pop-up just leaves the form as it was
  const handleGoogleSignIn = async () => {
    setError('');
    setBusy(true);
    try {
      if (await signInWithGoogle()) router.push('/');
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
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

            {/* Remember me + Forgot password, one row above the submit button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--tv-color-text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  style={{
                    width: '15px', height: '15px', accentColor: 'var(--tv-color-accent, #2962ff)',
                    cursor: 'pointer',
                  }}
                />
                Remember me
              </label>
              <a
                href="#"
                onClick={e => {
                  e.preventDefault();
                  setError('');
                  // No self-service password reset in this build (accounts are
                  // operator-managed); surface that instead of a dead link
                  setError('Password reset is handled by the platform owner. Contact support if you are locked out.');
                }}
                style={{ fontSize: '13px', color: 'var(--tv-color-accent, #2962ff)', textDecoration: 'none' }}
              >
                Forgot password?
              </a>
            </div>

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

          {/* Or with a Google account */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '14px 0', fontSize: '12px', color: 'var(--tv-color-text-muted)' }}>
            <span style={{ flex: 1, height: '1px', background: 'var(--tv-color-border)' }} />
            or
            <span style={{ flex: 1, height: '1px', background: 'var(--tv-color-border)' }} />
          </div>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy}
            data-name="google-sign-in"
            style={{
              width: '100%', height: '38px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              border: '1px solid var(--tv-color-border)', background: 'var(--tv-color-bg)', color: 'var(--tv-color-text)',
              fontSize: '14px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continue with Google
          </button>

          {/* Muted warning: accounts are operator-issued, and each account can
              only be active on one device at a time (the backend enforces a
              2-session limit and kicks the oldest) */}
          <div style={{
            marginTop: '14px', padding: '8px 12px', borderRadius: '6px',
            backgroundColor: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.3)',
            fontSize: '12px', lineHeight: '1.5', color: 'var(--tv-color-text-muted)',
          }}>
            <span style={{ fontWeight: 600, color: '#ff9800' }}>Note:</span> Each account can be
            signed in on one device at a time. Signing in on a new device signs you out of
            the previous one.
          </div>
        </div>
      </div>
    </div>
  );
}

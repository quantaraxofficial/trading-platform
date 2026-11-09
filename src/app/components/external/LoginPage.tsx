'use client';
import React, { useState } from 'react';
import { Eye, EyeOff, TrendingUp, Mail, Lock, LogIn, ArrowRight } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

/**
 * Sign in, in the home page's look (its purple gradient and glowing blobs, a glass card): email and password, "Remember me", "Forgot password?" (handled by the
 * platform owner, not self-service) and Google. This build has no public sign-up: accounts are
 * created by the operator in the Django admin, so the card points to Contact instead.
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
      router.push('/chart');
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
      if (await signInWithGoogle()) router.push('/chart');
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full bg-gray-900/50 border border-purple-700/50 rounded-lg py-3 text-white placeholder-purple-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all";

  return (
    <div data-site-page className="min-h-screen relative bg-gradient-to-br from-black via-purple-950 to-black text-white">
      {/* The home page's background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          {/* Logo and title */}
          <div className="text-center mb-8">
            <a href="/" aria-label="TradePilot home" className="w-16 h-16 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-purple-500/20">
              <TrendingUp className="w-10 h-10 text-white" />
            </a>
            <h1 className="text-3xl font-bold mb-2">
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent">Welcome back</span>
            </h1>
            <p className="text-purple-300">Sign in to TradePilot: your charts follow you across devices</p>
          </div>

          <div className="bg-black/60 backdrop-blur-xl border border-purple-800/50 rounded-2xl p-8 shadow-2xl">
            <form className="space-y-5" onSubmit={handleManualSignIn}>
              {error && (
                <div role="alert" className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="login-email" className="block text-purple-300 text-sm font-medium mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
                  <input id="login-email" type="text" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
                    value={formData.email} onChange={handleChange} required placeholder="you@example.com"
                    className={`${field} pl-12 pr-4`} />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-purple-300 text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
                  <input id="login-password" type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password"
                    value={formData.password} onChange={handleChange} required placeholder="Your password"
                    className={`${field} pl-12 pr-12`} />
                  <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400 hover:text-purple-300">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Remember me + Forgot password */}
              <div className="flex items-center justify-between">
                <label className="flex items-center cursor-pointer select-none">
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded accent-purple-600 cursor-pointer" />
                  <span className="ml-2 text-purple-300 text-sm">Remember me</span>
                </label>
                <a href="#" className="text-purple-400 hover:text-purple-300 text-sm"
                  onClick={e => {
                    e.preventDefault();
                    // No self-service password reset in this build (accounts are operator-managed)
                    setError('Password reset is handled by the platform owner. Contact support if you are locked out.');
                  }}>
                  Forgot password?
                </a>
              </div>

              <button type="submit" disabled={busy}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-wait text-white py-3 rounded-lg font-semibold transition-all transform hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/25 flex items-center justify-center">
                <LogIn className="w-5 h-5 mr-2" />
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            {/* Or with a Google account */}
            <div className="flex items-center gap-4 my-6 text-sm text-purple-300">
              <div className="flex-1 border-t border-purple-700/50" />or<div className="flex-1 border-t border-purple-700/50" />
            </div>
            <button type="button" onClick={handleGoogleSignIn} disabled={busy} data-name="google-sign-in"
              className="w-full bg-gray-900/50 border border-purple-700/50 hover:bg-gray-900/70 disabled:opacity-60 py-3 px-4 rounded-lg transition-all flex items-center justify-center font-semibold">
              <svg className="w-5 h-5 mr-2" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </button>

            {/* One device at a time */}
            <p className="text-center text-purple-300 text-sm mt-6">
              No account yet?{' '}
              <a href="/signup" className="text-purple-200 font-semibold hover:text-white">Sign up</a>
            </p>
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs leading-relaxed text-purple-200">
              <span className="font-semibold text-amber-400">Note:</span> each account can be signed in on one device at a time.
              Signing in on a new device signs you out of the previous one.
            </div>
          </div>

          {/* Back to home */}
          <div className="text-center mt-6">
            <a href="/" className="text-purple-400 hover:text-purple-300 inline-flex items-center justify-center">
              <ArrowRight className="w-4 h-4 mr-1 rotate-180" />
              Back to home
            </a>
          </div>
        </div>
      </div>

      {/* The same blobs as the home page (LandingPage) */}
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

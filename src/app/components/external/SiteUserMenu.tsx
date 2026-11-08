'use client';

// The site pages' account corner (home, About, Contact, Profile): signed out, whatever the page
// passes as `signedOut` (its "Log in" link); signed in, the profile picture (or initials) opening a
// menu with Profile, Analytics, the chart and Sign out. On a phone (`mobile`) the same entries are
// listed in the page's menu instead of a pop-up.

import React, { useEffect, useRef, useState } from 'react';
import { BarChart3, LineChart, LogOut, User as UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { USER_ID_DOMAIN } from '@/context/AuthContext';
import { useEscapeClose } from '../../lib/useEscapeClose';

// The name to show, and the sign-in shown under it (a user ID account's made-up email reads as its ID)
export function accountName(user: { displayName?: string | null; email?: string | null } | null, userData?: { name?: string } | null) {
  const login = accountLogin(user);
  return user?.displayName || userData?.name || login || 'Trader';
}
export function accountLogin(user: { email?: string | null } | null) {
  const e = user?.email || '';
  return e.endsWith(`@${USER_ID_DOMAIN}`) ? e.slice(0, -(USER_ID_DOMAIN.length + 1)) : e;
}
const initials = (name: string) => name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || 'T';

export function Avatar({ size = 40, className = '' }: { size?: number; className?: string }) {
  const { user, userData } = useAuth();
  const [broken, setBroken] = useState(false);
  const name = accountName(user, userData);
  const photo = !broken ? user?.photoURL : null;
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)}
      className={`rounded-full object-cover ${className}`} style={{ width: size, height: size }} />
  ) : (
    <span className={`rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white select-none ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>{initials(name)}</span>
  );
}

export default function SiteUserMenu({ signedOut, mobile = false }: { signedOut: React.ReactNode; mobile?: boolean }) {
  const { user, userData, loading, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscapeClose(() => setOpen(false), open);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);

  // Signed in shows at once (the server's profile can follow); signed out only once the sign-in has
  // been read, so a signed-in visitor never sees "Log in" flash
  if (!user) return loading ? (mobile ? null : <span className="inline-block w-10 h-10" aria-hidden />) : <>{signedOut}</>;

  const name = accountName(user, userData);
  const signOut = async () => { setOpen(false); await logout(); router.push('/'); };
  const items = [
    { href: '/profile', label: 'Your profile', icon: <UserIcon className="w-4 h-4" /> },
    { href: '/analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { href: '/chart', label: 'Open the chart', icon: <LineChart className="w-4 h-4" /> },
  ];

  if (mobile) return (
    <div className="space-y-4" data-name="site-user-menu-mobile">
      <a href="/profile" className="flex items-center gap-3 text-white"><Avatar size={32} />{name}</a>
      {items.slice(1).map(i => <a key={i.href} href={i.href} className="block text-purple-400 hover:text-white transition-colors">{i.label}</a>)}
      <button type="button" onClick={signOut} className="block text-purple-400 hover:text-white transition-colors">Sign out</button>
    </div>
  );

  return (
    <div ref={ref} className="relative" data-name="site-user-menu">
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="Your account" aria-haspopup="menu" aria-expanded={open}
        className="block rounded-full ring-2 ring-purple-500/60 hover:ring-purple-300 transition-all">
        <Avatar size={40} />
      </button>
      {open && (
        <div role="menu" aria-label="Your account"
          className="absolute right-0 mt-3 w-64 bg-black/90 backdrop-blur-xl border border-purple-800/60 rounded-xl shadow-2xl shadow-purple-950/50 py-2 z-50">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-purple-800/40 mb-1">
            <Avatar size={40} />
            <div className="min-w-0">
              <div className="font-semibold text-white truncate">{name}</div>
              <div className="text-xs text-purple-300/80 truncate">{accountLogin(user)}</div>
            </div>
          </div>
          {items.map(i => (
            <a key={i.href} href={i.href} role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-purple-200 hover:text-white hover:bg-purple-800/30 transition-colors">
              {i.icon}{i.label}
            </a>
          ))}
          <button type="button" role="menuitem" onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-rose-300 hover:text-rose-200 hover:bg-rose-900/20 transition-colors border-t border-purple-800/40 mt-1">
            <LogOut className="w-4 h-4" />Sign out
          </button>
        </div>
      )}
    </div>
  );
}

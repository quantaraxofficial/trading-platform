'use client';

// Paper trading: loads and saves the engine's accounts (Firestore for signed-in users, this
// browser otherwise), runs the live price feed and order expiry, and plays execution sounds.
// The engine itself lives in app/trading; components read it through usePaperTrading().

import React, { ReactNode, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { engine, useEngineState } from '@/app/trading/store';
import {
  createInitialState, normalizeState, activeAccount, activeBook, accountMetrics, positionViews,
} from '@/app/trading/engine';
import { startQuoteFeed } from '@/app/trading/quoteFeed';
import { tradingSettings } from '@/app/trading/settings';
import { playExecutionSound } from '@/app/trading/sounds';

const LOCAL_KEY = 'tv:paperTrading';
const localKeyFor = (uid?: string) => (uid ? `${LOCAL_KEY}:${uid}` : LOCAL_KEY);

// Firestore rejects undefined fields; JSON round-trip drops them
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

export const PaperTradingProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const uid = user?.uid;

  // Load this user's (or this browser's) paper accounts, then save on every change that matters
  useEffect(() => {
    let cancelled = false;
    let ready = false;
    let lastSaved = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const save = () => {
      const state = plain(engine.getSavedState());
      lastSaved = engine.getRevision();
      try { localStorage.setItem(localKeyFor(uid), JSON.stringify(state)); } catch { /* ignore */ }
      if (uid) setDoc(doc(db, 'userPaperTrading', uid), { engine: state }, { merge: true }).catch(err => console.warn('[PaperTrading] save failed', err));
    };

    // This browser's copy at once; the account's copy (which can take seconds, or fail when
    // offline) replaces it only if nothing was traded meanwhile — otherwise a late load wiped
    // out orders placed (or a broker connected) right after the page opened
    const name = user?.displayName || user?.email?.split('@')[0] || 'Paper Trading';
    let localRaw: any = null;
    try { localRaw = JSON.parse(localStorage.getItem(localKeyFor(uid)) || 'null'); } catch { localRaw = null; }
    engine.replaceState(localRaw ? normalizeState(localRaw) : createInitialState(name));
    const loadedRevision = engine.getRevision();
    lastSaved = loadedRevision;
    ready = true;
    (async () => {
      if (!uid) return;
      let raw: any = null;
      try {
        const snap = await getDoc(doc(db, 'userPaperTrading', uid));
        raw = snap.exists() ? snap.data()?.engine ?? null : null;
      } catch (err) {
        console.warn('[PaperTrading] load failed, using this browser\'s copy', err);
      }
      if (cancelled || !raw || engine.getRevision() !== loadedRevision) return;
      engine.replaceState(normalizeState(raw));
      lastSaved = engine.getRevision();
    })();

    const unsubscribe = engine.subscribe(() => {
      if (!ready || engine.getRevision() === lastSaved) return;
      clearTimeout(timer);
      timer = setTimeout(save, 800);
    });
    const flush = () => { if (ready && engine.getRevision() !== lastSaved) save(); };
    window.addEventListener('beforeunload', flush);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      flush();
      unsubscribe();
      window.removeEventListener('beforeunload', flush);
    };
  }, [uid]);

  // Live prices and order expiry
  useEffect(() => {
    const stop = startQuoteFeed();
    const tick = setInterval(() => engine.tick(), 30000);
    return () => { stop(); clearInterval(tick); };
  }, []);

  // Settings → Trading → Execution sound
  useEffect(() => engine.onNotice(n => {
    const s = tradingSettings.get();
    if (n.kind === 'executed' && s.executionSound) playExecutionSound(s.executionSoundName, s.executionSoundVolume);
  }), []);

  return <>{children}</>;
};

// Everything a component usually needs, recomputed when the engine state changes
export function usePaperTrading() {
  const state = useEngineState();
  return useMemo(() => ({
    state,
    engine,
    account: activeAccount(state),
    book: activeBook(state),
    metrics: accountMetrics(state),
    positions: positionViews(state),
    connected: state.connected,
  }), [state]);
}

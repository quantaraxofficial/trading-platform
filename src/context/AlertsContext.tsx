'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { DEFAULT_SOUND } from '@/app/lib/alertSounds';
import { setAlertWatchSymbols } from '@/app/trading/quoteFeed';

export type AlertOperator = 'Crossing' | 'Crossing Up' | 'Crossing Down' | 'Greater Than' | 'Less Than';
export type AlertTrigger = 'Once only' | 'Every time';
export const ALERT_OPERATORS: AlertOperator[] = ['Crossing', 'Crossing Up', 'Crossing Down', 'Greater Than', 'Less Than'];

// What happens when an alert fires (TradingView's Notifications section)
export interface AlertNotify {
  app: boolean;          // desktop notification ("Notify in app")
  toast: boolean;        // toast in the page corner
  sound: boolean;
  soundId: string;
  soundRepeat: number;   // seconds between repeats until the toast is closed; 0 = once
  webhook: boolean;
  webhookUrl: string;
}
export const DEFAULT_NOTIFY: AlertNotify = { app: true, toast: true, sound: false, soundId: DEFAULT_SOUND, soundRepeat: 0, webhook: false, webhookUrl: '' };

export interface Alert {
  id: string;
  symbol: string;
  condition: AlertOperator;
  value: number;
  trigger: AlertTrigger;
  expiration: number; // timestamp
  message: string;
  createdAt: number;
  // 'triggered' / 'expired' / 'stopped' all read "Stopped — …" like TradingView
  status: 'active' | 'triggered' | 'expired' | 'stopped';
  notify?: AlertNotify;
  lastTriggeredAt?: number;
}

export interface AlertLogEntry { id: string; alertId: string; symbol: string; message: string; time: number; read: boolean }

export interface AlertFiredDetail { alert: Alert; logId: string; time: number; price: number }

type NewAlert = Omit<Alert, 'id' | 'createdAt' | 'status'>;

interface AlertsContextType {
  alerts: Alert[];
  log: AlertLogEntry[];
  unread: number;
  addAlert: (alert: NewAlert) => string;
  updateAlert: (id: string, patch: Partial<NewAlert>) => void;
  removeAlert: (id: string) => void;
  restartAlert: (id: string) => void;
  stopAlert: (id: string) => void;
  markAsTriggered: (id: string) => void;
  markLogRead: () => void;
  clearLog: () => void;
  removeLogEntry: (id: string) => void;
  checkAlerts: (symbol: string, currentPrice: number) => void;
}

const AlertsContext = createContext<AlertsContextType>({
  alerts: [], log: [], unread: 0,
  addAlert: () => '', updateAlert: () => {}, removeAlert: () => {}, restartAlert: () => {}, stopAlert: () => {},
  markAsTriggered: () => {}, markLogRead: () => {}, clearLog: () => {}, removeLogEntry: () => {}, checkAlerts: () => {},
});

const LOCAL_KEY = 'tv:alerts';
const LOG_LIMIT = 500;
const EVERY_TIME_GAP_MS = 60000; // "Every time" level alerts (greater/less than) fire at most once a minute

// "OANDA:XAUUSD", "XAU/USD" and "xauusd" are the same symbol
export const alertSymbolKey = (s: string) => (s.split(':').pop() || s).toUpperCase().replace(/[^A-Z0-9.]/g, '');

const uid = () => Math.random().toString(36).slice(2, 11);

function conditionMet(op: AlertOperator, value: number, prev: number | undefined, price: number): boolean {
  switch (op) {
    case 'Greater Than': return price > value;
    case 'Less Than': return price < value;
    case 'Crossing Up': return prev !== undefined && prev < value && price >= value;
    case 'Crossing Down': return prev !== undefined && prev > value && price <= value;
    default: return prev !== undefined && ((prev < value && price >= value) || (prev > value && price <= value));
  }
}

function desktopNotify(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, tag: `${title}:${body}:${Date.now()}` }); } catch { /* not allowed here */ }
}

// TradingView POSTs the alert's message to the webhook. From the browser that's a no-cors
// text/plain request: the receiver gets the body, we just can't read its answer.
function postWebhook(url: string, message: string) {
  if (!/^https?:\/\//i.test(url)) return;
  fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: message }).catch(() => {});
}

export const AlertsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [log, setLog] = useState<AlertLogEntry[]>([]);
  // Saving waits until this account's (or this browser's) alerts have loaded, so an empty
  // list never overwrites them
  const loadedFor = useRef<string | null>(null);
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  const lastPrices = useRef<Record<string, number>>({});

  // Load: the signed-in account's alerts from Firestore, otherwise this browser's
  useEffect(() => {
    let cancelled = false;
    loadedFor.current = null;
    const owner = user?.uid ?? 'local';
    const apply = (data: { alerts?: Alert[]; log?: AlertLogEntry[] } | null) => {
      if (cancelled) return;
      setAlerts(Array.isArray(data?.alerts) ? data!.alerts : []);
      setLog(Array.isArray(data?.log) ? data!.log : []);
      loadedFor.current = owner;
    };
    if (!user?.uid) {
      let data = null;
      try { data = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch { /* ignore */ }
      apply(data);
    } else {
      getDoc(doc(db, 'userAlerts', user.uid))
        .then(snap => apply(snap.exists() ? (snap.data() as any) : null))
        .catch(error => { console.error('Failed to load alerts:', error); apply(null); });
    }
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Save
  useEffect(() => {
    const owner = user?.uid ?? 'local';
    if (loadedFor.current !== owner) return;
    if (!user?.uid) {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ alerts, log })); } catch { /* full or blocked */ }
      return;
    }
    const t = setTimeout(() => {
      setDoc(doc(db, 'userAlerts', user.uid), { alerts, log }, { merge: true }).catch(error => console.error('Failed to save alerts:', error));
    }, 400);
    return () => clearTimeout(t);
  }, [alerts, log, user?.uid]);

  // The quote feed also polls every symbol with an active alert, so alerts fire for symbols
  // that aren't on the chart
  useEffect(() => {
    setAlertWatchSymbols(Array.from(new Set(alerts.filter(a => a.status === 'active').map(a => a.symbol))));
  }, [alerts]);

  // Expire alerts past their expiration date
  useEffect(() => {
    const expire = () => {
      const now = Date.now();
      if (!alertsRef.current.some(a => a.status === 'active' && a.expiration && a.expiration < now)) return;
      setAlerts(prev => prev.map(a => (a.status === 'active' && a.expiration && a.expiration < now ? { ...a, status: 'expired' } : a)));
    };
    expire();
    const t = setInterval(expire, 30000);
    return () => clearInterval(t);
  }, []);

  const addAlert = useCallback((alertData: NewAlert) => {
    const id = uid();
    setAlerts(prev => [{ ...alertData, id, createdAt: Date.now(), status: 'active' }, ...prev]);
    return id;
  }, []);

  // Saving an edited alert restarts it, as in TradingView
  const updateAlert = useCallback((id: string, patch: Partial<NewAlert>) => {
    setAlerts(prev => prev.map(a => (a.id === id ? { ...a, ...patch, status: 'active' } : a)));
  }, []);

  const removeAlert = useCallback((id: string) => setAlerts(prev => prev.filter(a => a.id !== id)), []);
  const restartAlert = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => {
      if (a.id !== id) return a;
      // An expired alert gets a fresh month, like TradingView's restart
      const expiration = a.expiration && a.expiration < Date.now() ? Date.now() + 30 * 86400000 : a.expiration;
      return { ...a, status: 'active', expiration };
    }));
  }, []);
  const stopAlert = useCallback((id: string) => setAlerts(prev => prev.map(a => (a.id === id ? { ...a, status: 'stopped' } : a))), []);
  const markAsTriggered = useCallback((id: string) => setAlerts(prev => prev.map(a => (a.id === id ? { ...a, status: 'triggered' } : a))), []);
  const markLogRead = useCallback(() => setLog(prev => (prev.some(e => !e.read) ? prev.map(e => (e.read ? e : { ...e, read: true })) : prev)), []);
  const clearLog = useCallback(() => setLog([]), []);
  const removeLogEntry = useCallback((id: string) => setLog(prev => prev.filter(e => e.id !== id)), []);

  const checkAlerts = useCallback((symbol: string, price: number) => {
    if (!isFinite(price)) return;
    const key = alertSymbolKey(symbol);
    const prev = lastPrices.current[key];
    lastPrices.current[key] = price;
    const now = Date.now();
    const fired: Alert[] = [];
    for (const a of alertsRef.current) {
      if (a.status !== 'active' || alertSymbolKey(a.symbol) !== key) continue;
      if (a.expiration && a.expiration < now) continue;
      const level = a.condition === 'Greater Than' || a.condition === 'Less Than';
      if (level && a.trigger === 'Every time' && a.lastTriggeredAt && now - a.lastTriggeredAt < EVERY_TIME_GAP_MS) continue;
      if (conditionMet(a.condition, a.value, prev, price)) fired.push(a);
    }
    if (!fired.length) return;

    const ids = new Set(fired.map(a => a.id));
    setAlerts(list => list.map(a => (ids.has(a.id) ? { ...a, lastTriggeredAt: now, status: a.trigger === 'Once only' ? 'triggered' : a.status } : a)));
    const entries = fired.map(a => ({ id: uid(), alertId: a.id, symbol: a.symbol, message: a.message || `${a.symbol} ${a.condition} ${a.value}`, time: now, read: false }));
    setLog(l => [...entries.reverse(), ...l].slice(0, LOG_LIMIT));

    fired.forEach((a, i) => {
      const notify = a.notify ?? DEFAULT_NOTIFY;
      const message = a.message || `${a.symbol} ${a.condition} ${a.value}`;
      if (notify.app) desktopNotify(`Alert on ${a.symbol}`, message);
      if (notify.webhook && notify.webhookUrl) postWebhook(notify.webhookUrl, message);
      // The toast and the sound (AlertToasts)
      window.dispatchEvent(new CustomEvent<AlertFiredDetail>('tv:alert-fired', { detail: { alert: a, logId: entries[entries.length - 1 - i].id, time: now, price } }));
    });
  }, []);

  // Live quotes (the quote feed) check every symbol's alerts, whatever the chart shows
  useEffect(() => {
    const onPrice = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.symbol && typeof d.price === 'number') checkAlerts(d.symbol, d.price);
    };
    window.addEventListener('tv:live-price', onPrice);
    return () => window.removeEventListener('tv:live-price', onPrice);
  }, [checkAlerts]);

  const unread = useMemo(() => log.filter(e => !e.read).length, [log]);

  return (
    <AlertsContext.Provider value={{ alerts, log, unread, addAlert, updateAlert, removeAlert, restartAlert, stopAlert, markAsTriggered, markLogRead, clearLog, removeLogEntry, checkAlerts }}>
      {children}
    </AlertsContext.Provider>
  );
};

export const useAlerts = () => useContext(AlertsContext);

// Asked when an alert that notifies the desktop is created, not on page load
export function requestDesktopPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

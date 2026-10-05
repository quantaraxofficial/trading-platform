'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface Alert {
  id: string;
  symbol: string;
  condition: 'Crossing';
  value: number;
  trigger: 'Once only';
  expiration: number; // timestamp
  message: string;
  createdAt: number;
  status: 'active' | 'triggered' | 'expired';
}

interface AlertsContextType {
  alerts: Alert[];
  addAlert: (alert: Omit<Alert, 'id' | 'createdAt' | 'status'>) => void;
  removeAlert: (id: string) => void;
  markAsTriggered: (id: string) => void;
  checkAlerts: (symbol: string, currentPrice: number) => void;
}

const AlertsContext = createContext<AlertsContextType>({
  alerts: [],
  addAlert: () => {},
  removeAlert: () => {},
  markAsTriggered: () => {},
  checkAlerts: () => {},
});

export const AlertsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [lastPrices, setLastPrices] = useState<Record<string, number>>({});

  // Request desktop notification permissions
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Load alerts from Firestore when user logs in
  useEffect(() => {
    if (!user?.uid) {
      setAlerts([]);
      return;
    }
    const loadAlerts = async () => {
      try {
        const docRef = doc(db, 'userAlerts', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setAlerts(docSnap.data().alerts || []);
        }
      } catch (error) {
        console.error("Failed to load alerts:", error);
      }
    };
    loadAlerts();
  }, [user]);

  // Save alerts to Firestore whenever they change
  useEffect(() => {
    if (!user?.uid) return;
    const saveAlerts = async () => {
      try {
        await setDoc(doc(db, 'userAlerts', user.uid), { alerts }, { merge: true });
      } catch (error) {
        console.error("Failed to save alerts:", error);
      }
    };
    // Debounce or just save directly since alerts don't change rapidly
    saveAlerts();
  }, [alerts, user]);

  const addAlert = (alertData: Omit<Alert, 'id' | 'createdAt' | 'status'>) => {
    const newAlert: Alert = {
      ...alertData,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: Date.now(),
      status: 'active'
    };
    setAlerts(prev => [...prev, newAlert]);
  };

  const removeAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const markAsTriggered = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'triggered' } : a));
  };

  const checkAlerts = (symbol: string, currentPrice: number) => {
    const prevPrice = lastPrices[symbol];
    if (prevPrice === undefined) {
      setLastPrices(prev => ({ ...prev, [symbol]: currentPrice }));
      return; // Need two data points to detect crossing
    }
    
    if (prevPrice !== currentPrice) {
      setAlerts(prev => {
        let changed = false;
        const newAlerts = prev.map(a => {
          if (a.status !== 'active' || a.symbol !== symbol) return a;
          
          let crossed = false;
          if (prevPrice < a.value && currentPrice >= a.value) crossed = true; // crossed up
          if (prevPrice > a.value && currentPrice <= a.value) crossed = true; // crossed down
          
          if (crossed) {
            changed = true;
            
            // Play a standard TradingView style double-beep alert sound
            try {
              const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
              if (AudioContext) {
                const ctx = new AudioContext();
                const playBeep = (time: number) => {
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(800, time);
                  gain.gain.setValueAtTime(0, time);
                  gain.gain.linearRampToValueAtTime(0.5, time + 0.05);
                  gain.gain.linearRampToValueAtTime(0, time + 0.15);
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.start(time);
                  osc.stop(time + 0.2);
                };
                const now = ctx.currentTime;
                playBeep(now);
                playBeep(now + 0.25);
              }
            } catch (e) {
              console.error("Audio playback failed", e);
            }

            // In-app toast (the chart shows it; Settings → Alerts → Automatically hide toasts)
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tv:alert-toast', { detail: { title: `Alert on ${a.symbol}`, body: a.message || `${a.symbol} crossed ${a.value}` } }));

            // Send Desktop Notification
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(`Alert Triggered: ${a.symbol}`, {
                body: a.message || `${a.symbol} crossed ${a.value}`,
              });
            } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'denied') {
              // Fallback to requesting permission again if they ignored it initially, then notifying
              Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                  new Notification(`Alert Triggered: ${a.symbol}`, {
                    body: a.message || `${a.symbol} crossed ${a.value}`,
                  });
                }
              });
            }
            return { ...a, status: 'triggered' };
          }
          return a;
        });
        return changed ? newAlerts : prev;
      });
      setLastPrices(prev => ({ ...prev, [symbol]: currentPrice }));
    }
  };

  return (
    <AlertsContext.Provider value={{ alerts, addAlert, removeAlert, markAsTriggered, checkAlerts }}>
      {children}
    </AlertsContext.Provider>
  );
};

export const useAlerts = () => useContext(AlertsContext);

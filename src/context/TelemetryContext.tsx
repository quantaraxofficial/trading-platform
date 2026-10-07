'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { backendFetch } from "@/lib/backend";

interface TelemetryAction {
  action_type: string;
  action_data: any;
  market_state?: any;
}

interface TelemetryContextType {
  logAction: (type: string, data: any, marketState?: any) => void;
  sessionId: string | null;
}

const TelemetryContext = createContext<TelemetryContextType>({
  logAction: () => {},
  sessionId: null
});

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Use a ref for the buffer so we don't trigger re-renders on every action
  const actionBuffer = useRef<TelemetryAction[]>([]);

  // Initialize a backtest session on mount (if user is logged in)
  useEffect(() => {
    if (!user) return;

    const startSession = async () => {
      try {
        const symbol = new URLSearchParams(window.location.search).get('symbol') || 'UNKNOWN';
        const res = await backendFetch(`http://localhost:8000/api/users/telemetry/session/start/${user.uid}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol })
        });
        
        if (res.ok) {
          const data = await res.json();
          setSessionId(data.session_id);
          console.log('[Telemetry] Session started:', data.session_id);
        }
      } catch (err) {
        console.error('[Telemetry] Failed to start session:', err);
      }
    };

    startSession();
  }, [user]);

  // The function components will call to log an event
  const logAction = useCallback((type: string, data: any, marketState?: any) => {
    if (!sessionId) return; // Drop logs if no active session
    
    actionBuffer.current.push({
      action_type: type,
      action_data: data,
      market_state: marketState
    });
    console.log(`[Telemetry] Queued action: ${type}`);
  }, [sessionId]);

  // Background worker to flush the buffer to the backend every 5 seconds
  useEffect(() => {
    if (!user || !sessionId) return;

    const flushInterval = setInterval(async () => {
      if (actionBuffer.current.length === 0) return;

      // Extract current buffer and clear it immediately so new actions aren't lost during the fetch
      const actionsToSend = [...actionBuffer.current];
      actionBuffer.current = [];

      try {
        const res = await backendFetch(`http://localhost:8000/api/users/telemetry/actions/log/${user.uid}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            actions: actionsToSend
          })
        });

        if (!res.ok) {
          console.warn('[Telemetry] Failed to flush actions, putting them back in buffer');
          // If it fails, put them back at the front of the queue
          actionBuffer.current = [...actionsToSend, ...actionBuffer.current];
        } else {
          console.log(`[Telemetry] Flushed ${actionsToSend.length} actions to backend`);
        }
      } catch (err) {
        console.error('[Telemetry] Network error flushing actions:', err);
        actionBuffer.current = [...actionsToSend, ...actionBuffer.current];
      }
    }, 5000); // 5 seconds

    return () => clearInterval(flushInterval);
  }, [user, sessionId]);

  return (
    <TelemetryContext.Provider value={{ logAction, sessionId }}>
      {children}
    </TelemetryContext.Provider>
  );
}

export const useTelemetry = () => useContext(TelemetryContext);

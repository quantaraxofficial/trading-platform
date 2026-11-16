"use client";

// The chart page inside the TradePilot phone apps (lib/appBridge): tells the app what the chart
// shows, who's signed in, the watchlists and their prices; does what the app's native screens ask.

import { useEffect, useMemo, useRef } from "react";
import { onAppCommand, postToApp } from "../lib/appBridge";
import { useAuth } from "@/context/AuthContext";
import { activeList, listSymbols, watchlists, wl, type WatchlistState } from "./watchlist/store";
import { useWatchQuotes } from "./watchlist/data";
import { fetchStockData } from "./ChartContainer";
import { useSyncExternalStore } from "react";

export interface AppBridgeProps {
  symbol: string;
  interval: string;
  theme: string;
  replayActive: boolean;
  drawOpen: boolean;
  bottomOpen: boolean;
  setSymbol: (s: string) => void;
  setInterval: (iv: string) => void;
  setTheme: (t: "light" | "dark") => void;
  setDrawOpen: (open: boolean) => void;
  setBottomOpen: (open: boolean) => void;
  openSheet: (p: "alerts" | "object_tree" | "watchlist") => void;
  openReplay: () => void;
  openPine: () => void;
}

const fire = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const key = (k: string, shift = false) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, ctrlKey: true, shiftKey: shift, bubbles: true }));

export default function AppBridge(p: AppBridgeProps) {
  const { user, logout } = useAuth();
  const logoutRef = useRef(logout);
  logoutRef.current = logout;
  const lists = useSyncExternalStore(watchlists.subscribe, watchlists.get, watchlists.get) as WatchlistState;
  const symbols = useMemo(() => listSymbols(activeList(lists)), [lists]);
  const quotes = useWatchQuotes(symbols);
  const props = useRef(p);
  props.current = p;

  // What the chart shows
  useEffect(() => {
    postToApp("state", { symbol: p.symbol, interval: p.interval, theme: p.theme, replay: p.replayActive, draw: p.drawOpen, bottom: p.bottomOpen });
  }, [p.symbol, p.interval, p.theme, p.replayActive, p.drawOpen, p.bottomOpen]);

  // Who's signed in (no keys or tokens: the app shows the name and opens the site's own pages)
  useEffect(() => {
    postToApp("user", user ? { signedIn: true, uid: user.uid, name: user.displayName || "", email: user.email || "", photo: user.photoURL || "" } : { signedIn: false });
  }, [user?.uid, user?.displayName, user?.email, user?.photoURL]);

  // The watchlists
  useEffect(() => {
    postToApp("lists", { activeId: lists.activeId, lists: lists.lists.map(l => ({ id: l.id, name: l.name, items: l.items })) });
  }, [lists]);

  // Their prices (a second apart at most)
  const lastQuotes = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const send = () => {
      lastQuotes.current = Date.now();
      const out: Record<string, unknown> = {};
      for (const [s, q] of Object.entries(quotes)) out[s] = { name: q.name, exchange: q.exchange, currency: q.currency, last: q.close, change: q.change, changePct: q.percentChange, open: q.open, high: q.high, low: q.low, prevClose: q.previousClose, volume: q.volume, marketOpen: q.isMarketOpen };
      postToApp("quotes", { quotes: out });
    };
    if (pending.current) return;
    const wait = Math.max(0, 1000 - (Date.now() - lastQuotes.current));
    pending.current = setTimeout(() => { pending.current = null; send(); }, wait);
  }, [quotes]);

  // The app's commands
  useEffect(() => onAppCommand(c => {
    const q = props.current;
    switch (c.type) {
      case "setSymbol": if (c.symbol) q.setSymbol(String(c.symbol)); break;
      case "setInterval": if (c.interval) q.setInterval(String(c.interval)); break;
      case "theme": if (c.theme === "light" || c.theme === "dark") q.setTheme(c.theme); break;
      case "draw": q.setDrawOpen(typeof c.open === "boolean" ? c.open : !q.drawOpen); break;
      case "bottom": q.setBottomOpen(typeof c.open === "boolean" ? c.open : !q.bottomOpen); break;
      case "indicators": fire("tv:open-indicators"); break;
      case "alerts": q.openSheet("alerts"); break;
      case "createAlert": fire("tv:create-alert"); break;
      case "objectTree": q.openSheet("object_tree"); break;
      case "replay": q.openReplay(); break;
      case "snapshot": fire("tv:snapshot"); break;
      case "settings": fire("tv:open-chart-settings"); break;
      case "pine": q.openPine(); break;
      case "trade": q.setBottomOpen(true); fire("tv:open-trading-panel"); break;
      case "undo": key("z"); break;
      case "redo": key("y"); break;
      case "addSymbol": if (c.symbol) wl.addSymbol(String(c.symbol), c.listId); break;
      case "removeSymbol": if (c.symbol) wl.removeSymbol(String(c.symbol)); break;
      case "openList": if (c.id) wl.open(String(c.id)); break;
      case "createList": if (c.name) wl.create(String(c.name)); break;
      case "toggleSection": if (c.id) wl.toggleSection(String(c.id)); break;
      case "logout": void logoutRef.current?.(); break;
      // A symbol page's chart: its bars, from the same sources as the chart
      case "series": {
        const { symbol, interval, id } = c;
        fetchStockData(String(symbol), String(interval || "1day"))
          .then(bars => postToApp("series", { id, symbol, interval, bars: bars.map((b: any) => [b.time, b.open, b.high, b.low, b.close]) }))
          .catch(() => postToApp("series", { id, symbol, interval, bars: [], error: true }));
        break;
      }
      case "refresh": {
        postToApp("state", { symbol: q.symbol, interval: q.interval, theme: q.theme, replay: q.replayActive, draw: q.drawOpen, bottom: q.bottomOpen });
        const s = watchlists.get();
        postToApp("lists", { activeId: s.activeId, lists: s.lists.map(l => ({ id: l.id, name: l.name, items: l.items })) });
        break;
      }
    }
  }), []);

  useEffect(() => { postToApp("ready", { version: 1 }); }, []);
  return null;
}

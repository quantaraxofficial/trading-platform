"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, X, User, Users, CreditCard, Activity, BarChart2, Bookmark, TrendingUp, Flame, ShoppingBag, Star } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { DEFAULT_FAVORITE_INDICATORS, loadFavoriteIndicators, saveFavoriteIndicators } from "@/app/utils/favoriteIndicators";
import { useEscapeClose } from "../lib/useEscapeClose";
import { PINE_INDICATOR_NAMES } from "./pine/usePineIndicators";

interface IndicatorsModalProps {
  onClose: () => void;
  onSelect?: (indicator: string) => void;
}

export default function IndicatorsModal({ onClose, onSelect }: IndicatorsModalProps) {
  useEscapeClose(onClose);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>(DEFAULT_FAVORITE_INDICATORS);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
    setFavorites(loadFavoriteIndicators());
  }, []);

  const toggleFavorite = (ind: string) => {
    if (!user) {
      router.push("/login");
      return;
    }
    setFavorites(prev => {
      const next = prev.includes(ind) ? prev.filter(v => v !== ind) : [...prev, ind];
      saveFavoriteIndicators(next);
      return next;
    });
  };

  // The chart's own indicators plus the Pine-based built-ins (VWAP, Ichimoku, Pivot Points, RSI, MACD…)
  const indicators = Array.from(new Set([
    "Moving Average Exponential",
    "FXN - Asian Session Range",
    "Volume",
    ...PINE_INDICATOR_NAMES,
  ]));

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10000,
    }} onClick={onClose}>
      <div
        style={{
          width: "860px", height: "600px", maxHeight: "90vh",
          backgroundColor: "var(--tv-color-pane-bg)", borderRadius: "8px",
          display: "flex", flexDirection: "column",
          overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.24)",
          fontFamily: "Inter, sans-serif"
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "var(--tv-color-text)" }}>Indicators, metrics, and strategies</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tv-color-text)", padding: 0 }}>
            <X size={24} strokeWidth={1.5} />
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ padding: "0 24px 16px" }}>
          <div style={{
            position: "relative", display: "flex", alignItems: "center",
            border: "1px solid var(--tv-color-border)", borderRadius: "6px",
            backgroundColor: "var(--tv-color-pane-bg)", padding: "0 12px"
          }}>
            <Search size={20} color="var(--tv-color-text-muted)" strokeWidth={1.5} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                padding: "10px", fontSize: "16px", color: "var(--tv-color-text)"
              }}
            />
          </div>
        </div>

        {/* Content Layout */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", borderTop: "1px solid var(--tv-color-border)" }}>

          {/* Left Sidebar */}
          <div style={{ width: "240px", borderRight: "1px solid var(--tv-color-border)", display: "flex", flexDirection: "column", overflowY: "auto", padding: "16px 12px" }}>

            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", textTransform: "uppercase", padding: "8px 12px", letterSpacing: "0.5px" }}>Personal</div>
            <SidebarItem icon={<User size={18} strokeWidth={1.5} />} label="My scripts" />
            <SidebarItem icon={<Users size={18} strokeWidth={1.5} />} label="Invite-only" />
            <SidebarItem icon={<CreditCard size={18} strokeWidth={1.5} />} label="Purchased" />

            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", textTransform: "uppercase", padding: "16px 12px 8px", letterSpacing: "0.5px" }}>Built-in</div>
            <SidebarItem icon={<Activity size={18} strokeWidth={1.5} />} label="Technicals" active={true} />
            <SidebarItem icon={<BarChart2 size={18} strokeWidth={1.5} />} label="Fundamentals" />

            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", textTransform: "uppercase", padding: "16px 12px 8px", letterSpacing: "0.5px" }}>Community</div>
            <SidebarItem icon={<Bookmark size={18} strokeWidth={1.5} />} label="Editors' picks" />
            <SidebarItem icon={<TrendingUp size={18} strokeWidth={1.5} />} label="Top" />
            <SidebarItem icon={<Flame size={18} strokeWidth={1.5} />} label="Trending" />
            <SidebarItem icon={<ShoppingBag size={18} strokeWidth={1.5} />} label="Store" />

          </div>

          {/* Right Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "16px 24px" }}>

            {/* Pill Navigation */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
              <Pill label="Indicators" active={true} />
              <Pill label="Strategies" />
              <Pill label="Profiles" />
              <Pill label="Patterns" />
            </div>

            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "0.5px" }}>Script name</div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {indicators.map((ind, i) => (
                <IndicatorRowItem
                  key={ind + i}
                  ind={ind}
                  onSelect={() => onSelect?.(ind)}
                  isFav={favorites.includes(ind)}
                  onToggleFavorite={() => toggleFavorite(ind)}
                />
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px",
      padding: "8px 12px", borderRadius: "6px",
      backgroundColor: active ? "var(--tv-color-item-hover)" : "transparent",
      color: "var(--tv-color-text)", cursor: "pointer",
      fontWeight: active ? 600 : 400,
      fontSize: "14px",
      transition: "background-color 0.1s"
    }}
    onMouseEnter={e => !active && (e.currentTarget.style.backgroundColor = "var(--tv-color-bg-hover)")}
    onMouseLeave={e => !active && (e.currentTarget.style.backgroundColor = "transparent")}
    >
      <div style={{ color: active ? "var(--tv-color-text)" : "var(--tv-color-text-muted)" }}>
        {icon}
      </div>
      {label}
    </div>
  );
}

function Pill({ label, active = false }: { label: string, active?: boolean }) {
  return (
    <div style={{
      padding: "6px 16px", borderRadius: "16px",
      backgroundColor: active ? "var(--tv-color-text)" : "var(--tv-color-item-hover)",
      color: active ? "var(--tv-color-pane-bg)" : "var(--tv-color-text)",
      fontSize: "13px", fontWeight: active ? 600 : 400,
      cursor: "pointer",
      transition: "background-color 0.1s"
    }}
    onMouseEnter={e => !active && (e.currentTarget.style.backgroundColor = "var(--tv-color-border)")}
    onMouseLeave={e => !active && (e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)")}
    >
      {label}
    </div>
  );
}

function IndicatorRowItem({ ind, onSelect, isFav, onToggleFavorite }: { ind: string, onSelect: () => void, isFav: boolean, onToggleFavorite: () => void }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onClick={onSelect}
      style={{
        padding: "10px 8px",
        cursor: "pointer",
        fontSize: "14px",
        color: "var(--tv-color-text)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        transition: "background-color 0.1s",
        borderRadius: "4px",
        backgroundColor: hover ? "var(--tv-color-item-hover)" : "transparent"
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span>{ind}</span>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        style={{ opacity: (hover || isFav) ? 1 : 0, transition: "opacity 0.1s", display: "flex", alignItems: "center", padding: "4px" }}
      >
        <Star size={16} color={isFav ? "#f5b041" : "#b2b5be"} fill={isFav ? "#f5b041" : "transparent"} style={{ cursor: "pointer" }} />
      </div>
    </div>
  );
}

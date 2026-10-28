"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, X, User, Users, Activity, TrendingUp, Sparkles, Heart, Star } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { DEFAULT_FAVORITE_INDICATORS, loadFavoriteIndicators, saveFavoriteIndicators } from "@/app/utils/favoriteIndicators";
import { useEscapeClose } from "../lib/useEscapeClose";
import { PINE_INDICATOR_NAMES } from "./pine/usePineIndicators";
import {
  ADD_SCRIPT_EVENT, getScript, listScripts, profileUrl, searchPeople, initials, type PublishedScript, type ScriptScope, type SearchPerson,
} from "../community/social";

interface IndicatorsModalProps {
  onClose: () => void;
  onSelect?: (indicator: string) => void;
}

// Where the list comes from: the chart's built-ins, or published scripts (yours, shared with you,
// the community's most used / newest, from people you follow)
type Source = "builtin" | "mine" | "shared" | "top" | "new" | "following";
type Kind = "indicator" | "strategy" | "profiles";
const SCOPE: Record<Exclude<Source, "builtin">, { scope: ScriptScope; sort?: "top" | "new" }> = {
  mine: { scope: "mine" }, shared: { scope: "shared" }, top: { scope: "community", sort: "top" }, new: { scope: "community", sort: "new" }, following: { scope: "following" },
};

export default function IndicatorsModal({ onClose, onSelect }: IndicatorsModalProps) {
  useEscapeClose(onClose);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>(DEFAULT_FAVORITE_INDICATORS);
  const [source, setSource] = useState<Source>("builtin");
  const [kind, setKind] = useState<Kind>("indicator");
  const [scripts, setScripts] = useState<PublishedScript[] | null>(null);
  const [people, setPeople] = useState<SearchPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const router = useRouter();
  const uid = user?.uid;

  useEffect(() => {
    inputRef.current?.focus();
    setFavorites(loadFavoriteIndicators());
  }, []);

  // Published scripts / people, as the source, kind and search change
  useEffect(() => {
    setError(null);
    if (kind === "profiles") {
      setScripts(null);
      if (!uid || !search.trim()) { setPeople(null); return; }
      let gone = false;
      const t = setTimeout(() => searchPeople(uid, search.trim()).then(p => { if (!gone) setPeople(p); }, e => !gone && setError(e.message)), 250);
      return () => { gone = true; clearTimeout(t); };
    }
    if (source === "builtin") { setScripts(null); return; }
    if (!uid) { setScripts([]); return; }
    let gone = false;
    setScripts(null);
    const t = setTimeout(() => listScripts(uid, SCOPE[source].scope, { kind, q: search.trim(), sort: SCOPE[source].sort })
      .then(s => { if (!gone) setScripts(s); }, e => { if (!gone) { setScripts([]); setError(e.message); } }), 200);
    return () => { gone = true; clearTimeout(t); };
  }, [uid, source, kind, search]);

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

  // A published script onto the chart (counted as a use)
  const addScript = async (s: PublishedScript) => {
    if (!uid) return;
    setAdding(s.id);
    try {
      const full = await getScript(uid, s.id, true);
      if (!full.code && !full.compiled) { setError("This script can't be run"); return; }
      // (hidden code: the compiled script runs instead)
      window.dispatchEvent(new CustomEvent(ADD_SCRIPT_EVENT, { detail: full.code ? { code: full.code, language: full.language, scriptName: full.name } : { compiled: full.compiled, language: "pine", scriptName: full.name } }));
      onClose();
    } catch (e: any) { setError(e?.message || "Couldn't add the script"); }
    finally { setAdding(null); }
  };

  // The chart's own indicators plus the Pine-based built-ins (VWAP, Ichimoku, Pivot Points, RSI, MACD…)
  const builtins = Array.from(new Set([
    "Moving Average Exponential",
    "FXN - Asian Session Range",
    "Volume",
    ...PINE_INDICATOR_NAMES,
  ])).filter(n => n.toLowerCase().includes(search.trim().toLowerCase()));

  const empty: Record<Source, string> = {
    builtin: "No built-in strategies", mine: "You haven't published any. Use Publish script in the Pine editor.",
    shared: "Nobody has shared a private script with you", top: "Nothing published yet", new: "Nothing published yet",
    following: "Nothing from people you follow yet",
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10000,
    }} onClick={onClose}>
      <div
        role="dialog" aria-label="Indicators, metrics, and strategies" data-testid="indicators-modal"
        style={{
          width: "860px", height: "600px", maxHeight: "90vh", maxWidth: "calc(100vw - 32px)",
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
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tv-color-text)", padding: 0 }}>
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
              placeholder={kind === "profiles" ? "Search people by name or @username" : "Search"}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              data-testid="indicators-search"
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
          <div style={{ width: "220px", borderRight: "1px solid var(--tv-color-border)", display: "flex", flexDirection: "column", overflowY: "auto", padding: "16px 12px", flexShrink: 0 }}>
            <SectionTitle>Personal</SectionTitle>
            <SidebarItem icon={<User size={18} strokeWidth={1.5} />} label="My scripts" active={source === "mine"} onClick={() => setSource("mine")} id="mine" />
            <SidebarItem icon={<Users size={18} strokeWidth={1.5} />} label="Invite-only" active={source === "shared"} onClick={() => setSource("shared")} id="shared" />

            <SectionTitle>Built-in</SectionTitle>
            <SidebarItem icon={<Activity size={18} strokeWidth={1.5} />} label="Technicals" active={source === "builtin"} onClick={() => setSource("builtin")} id="builtin" />

            <SectionTitle>Community</SectionTitle>
            <SidebarItem icon={<TrendingUp size={18} strokeWidth={1.5} />} label="Top" active={source === "top"} onClick={() => setSource("top")} id="top" />
            <SidebarItem icon={<Sparkles size={18} strokeWidth={1.5} />} label="Newest" active={source === "new"} onClick={() => setSource("new")} id="new" />
            <SidebarItem icon={<Heart size={18} strokeWidth={1.5} />} label="Following" active={source === "following"} onClick={() => setSource("following")} id="following" />
            <a href="/community" target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--tv-color-accent, #2962ff)", padding: "12px 12px 4px", textDecoration: "none" }}>Browse the community ↗</a>
          </div>

          {/* Right Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "16px 24px", minWidth: 0 }}>

            {/* Pill Navigation */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }} data-testid="indicators-kind">
              <Pill label="Indicators" active={kind === "indicator"} onClick={() => setKind("indicator")} />
              <Pill label="Strategies" active={kind === "strategy"} onClick={() => setKind("strategy")} />
              <Pill label="Profiles" active={kind === "profiles"} onClick={() => setKind("profiles")} />
            </div>

            {kind !== "profiles" && (
              <div style={{ display: "flex", fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "0.5px" }}>
                <span style={{ flex: 1 }}>Script name</span>{source !== "builtin" && <span>Author</span>}
              </div>
            )}
            {error && <div role="alert" style={{ color: "#f23645", fontSize: 13, marginBottom: 8 }}>{error}</div>}

            <div style={{ flex: 1, overflowY: "auto" }} data-testid="indicators-list">
              {kind === "profiles" ? (
                !search.trim() ? <Note>Type a name or @username</Note> : people === null ? <Note>Searching…</Note> : people.length === 0 ? <Note>No one matches</Note>
                  : people.map(p => (
                    <a key={p.username} href={profileUrl(p.username)} target="_blank" rel="noreferrer" data-username={p.username}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px", borderRadius: 4, textDecoration: "none", color: "var(--tv-color-text)" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)")} onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                      <span style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#8b5cf6,#4f46e5)", color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(p.name)}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14 }}>{p.name}</span>
                        <span style={{ display: "block", fontSize: 12, color: "var(--tv-color-text-muted)" }}>@{p.username} · {p.followers} followers · {p.scripts} scripts</span>
                      </span>
                    </a>
                  ))
              ) : source === "builtin" ? (
                kind === "strategy" ? <Note>{empty.builtin}</Note> : builtins.map((ind, i) => (
                  <IndicatorRowItem key={ind + i} ind={ind} onSelect={() => onSelect?.(ind)} isFav={favorites.includes(ind)} onToggleFavorite={() => toggleFavorite(ind)} />
                ))
              ) : !uid ? <Note>Sign in to see published scripts</Note>
                : scripts === null ? <Note>Loading…</Note>
                : scripts.length === 0 ? <Note>{search.trim() ? "No scripts match" : empty[source]}</Note>
                : scripts.map(s => <ScriptRow key={s.id} s={s} busy={adding === s.id} onAdd={() => addScript(s)} />)}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", textTransform: "uppercase", padding: "16px 12px 8px", letterSpacing: "0.5px" }}>{children}</div>
);
const Note = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "24px 8px", fontSize: 14, color: "var(--tv-color-text-muted)" }}>{children}</div>
);

function SidebarItem({ icon, label, active = false, onClick, id }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void, id?: string }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} data-source={id} aria-pressed={active}
      onKeyDown={e => { if (e.key === "Enter") onClick?.(); }}
      style={{
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

function Pill({ label, active = false, onClick }: { label: string, active?: boolean, onClick?: () => void }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} data-kind={label} aria-pressed={active}
      onKeyDown={e => { if (e.key === "Enter") onClick?.(); }}
      style={{
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

// A published script: its name (and whether it's private, its version), and who made it — the
// author opens their profile; the row adds the script to the chart
function ScriptRow({ s, busy, onAdd }: { s: PublishedScript; busy: boolean; onAdd: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={busy ? undefined : onAdd} data-script={s.id} title={s.description || s.name}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ padding: "10px 8px", cursor: busy ? "progress" : "pointer", fontSize: "14px", color: "var(--tv-color-text)", display: "flex", alignItems: "center", gap: 12,
        borderRadius: "4px", backgroundColor: hover ? "var(--tv-color-item-hover)" : "transparent", opacity: busy ? 0.6 : 1 }}>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {s.name}
        {s.visibility === "private" && <span style={{ marginLeft: 8, fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "rgba(242,153,0,0.15)", color: "#c77c00" }}>Private</span>}
        {s.code_access !== "open" && !s.can_view_code && <span style={{ marginLeft: 8, fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--tv-color-item-hover)", color: "var(--tv-color-text-muted)" }}>Code hidden</span>}
        <span style={{ marginLeft: 8, fontSize: 12, color: "var(--tv-color-text-muted)" }}>v{s.version}{s.uses ? ` · ${s.uses} use${s.uses === 1 ? "" : "s"}` : ""}</span>
      </span>
      <a href={profileUrl(s.author.username)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} data-testid="script-author"
        style={{ fontSize: 13, color: "var(--tv-color-text-muted)", textDecoration: "none", whiteSpace: "nowrap" }}
        onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}>
        {s.mine ? "You" : s.author.name}
      </a>
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

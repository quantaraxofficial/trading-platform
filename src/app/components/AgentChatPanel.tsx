"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { backendFetch } from "@/lib/backend";

interface ChatMessage {
  id: string;
  sender: "agent" | "user";
  text: string;
}

interface AgentChatPanelProps {
  theme?: string;
  onClose: () => void;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AgentChatPanel({ theme, onClose }: AgentChatPanelProps) {
  const isDark = theme === "dark";
  const { user } = useAuth();
  const uid = user?.uid;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idCounterRef = useRef(0);
  const nextId = () => `m${idCounterRef.current++}`;

  const pushMessage = (sender: "agent" | "user", text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), sender, text }]);
  };

  // Greets with real, computed observations from the user's own logged activity
  // (fetched from /agent/insights), revealed one line at a time for a natural
  // chat feel, then invites them to add explicit strategy input.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!uid) {
        setTyping(false);
        pushMessage("agent", "Sign in first so I can start learning from your trading activity.");
        return;
      }
      try {
        const res = await backendFetch(`http://localhost:8000/api/users/agent/insights/${uid}/`);
        const data = await res.json();
        if (cancelled) return;
        const msgs: string[] = Array.isArray(data.messages) && data.messages.length > 0
          ? data.messages
          : ["I don't have anything to report yet — keep trading and I'll start noticing patterns."];
        for (const m of msgs) {
          if (cancelled) return;
          await delay(550);
          pushMessage("agent", m);
        }
        await delay(500);
        if (!cancelled) {
          pushMessage("agent", "Want to tell me more about your strategy directly? Type it below and I'll remember it.");
          setTyping(false);
        }
      } catch {
        if (!cancelled) {
          pushMessage("agent", "I couldn't reach my notes just now — try again in a bit.");
          setTyping(false);
        }
      }
    }
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    pushMessage("user", text);
    setInput("");

    if (!uid) {
      await delay(300);
      pushMessage("agent", "Sign in first so I can remember this.");
      return;
    }

    setSending(true);
    setTyping(true);
    try {
      const res = await backendFetch(`http://localhost:8000/api/users/agent/strategy-note/${uid}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      await delay(400);
      if (res.ok) {
        pushMessage("agent", "Got it — I've saved that as part of your strategy profile, and I'll keep it in mind alongside what I see you do on the chart.");
      } else {
        pushMessage("agent", "Hmm, I couldn't save that just now. Mind trying again?");
      }
    } catch {
      await delay(300);
      pushMessage("agent", "Hmm, I couldn't save that just now. Mind trying again?");
    } finally {
      setSending(false);
      setTyping(false);
    }
  }

  const bg = isDark ? "#1e222d" : "#ffffff";
  const headerBg = isDark ? "#131722" : "#f8f9fd";
  const border = isDark ? "#2a2e39" : "#e0e3eb";
  const text = isDark ? "#d1d4dc" : "#131722";
  const muted = "#787b86";
  const accent = "#2962ff";
  const agentBubbleBg = isDark ? "#2a2e39" : "#f0f3fa";
  const userBubbleBg = accent;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "420px", height: "560px", maxHeight: "85vh", background: bg,
          borderRadius: "10px", boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${border}`, backgroundColor: headerBg, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600, color: text }}>
            <Sparkles size={16} color={accent} />
            Trading Agent
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{ width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: muted, cursor: "pointer", borderRadius: "4px" }}
          >
            <X size={18} />
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                maxWidth: "82%",
                background: m.sender === "user" ? userBubbleBg : agentBubbleBg,
                color: m.sender === "user" ? "#ffffff" : text,
                padding: "9px 13px",
                borderRadius: m.sender === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                fontSize: "13.5px",
                lineHeight: "1.45",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.text}
            </div>
          ))}
          {typing && (
            <div style={{ alignSelf: "flex-start", background: agentBubbleBg, padding: "10px 14px", borderRadius: "12px 12px 12px 2px", display: "flex", gap: "4px" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  width: "6px", height: "6px", borderRadius: "50%", background: muted,
                  animation: `agentTypingDot 1.2s ${i * 0.15}s infinite ease-in-out`,
                }} />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", padding: "12px 14px", borderTop: `1px solid ${border}`, flexShrink: 0 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Tell me about your strategy..."
            rows={1}
            style={{
              flex: 1, resize: "none", maxHeight: "80px", padding: "9px 12px", fontSize: "13.5px",
              borderRadius: "8px", border: `1px solid ${border}`, outline: "none",
              background: isDark ? "#131722" : "#ffffff", color: text, fontFamily: "inherit",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            title="Send"
            style={{
              width: "36px", height: "36px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "8px", border: "none", background: input.trim() && !sending ? accent : (isDark ? "#2a2e39" : "#e0e3eb"),
              color: input.trim() && !sending ? "#ffffff" : muted, cursor: input.trim() && !sending ? "pointer" : "default",
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes agentTypingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

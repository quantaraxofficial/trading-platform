"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { joinChannel } from "../../analytics/copy";
import type { ChatSignal } from "../../lib/collab/session";

const price = (v: number | null) => (v == null ? "—" : String(+v.toFixed(8)));

// A copy channel's signal posted in a chat (backend copy_share.py): the trade, and "Copy this
// channel", which follows it (copying itself is switched on in Analytics → Copy trading, with
// the follower's own risk and limits)
export default function SignalCard({ s, mine }: { s: ChatSignal; mine: boolean }) {
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "busy" | "following" | { error: string }>("idle");
  const buy = s.side === "buy";
  const side = s.side.toUpperCase();
  const title = s.kind === "open" ? `${side} ${s.symbol}`
    : s.kind === "modify" ? `${s.symbol} ${side}: stops moved`
      : s.fraction != null && s.fraction < 0.999 ? `${Math.round(s.fraction * 100)}% closed: ${s.symbol} ${side}` : `Closed: ${s.symbol} ${side}`;
  const follow = async () => {
    if (!user) return;
    setState("busy");
    try { await joinChannel(user.uid, s.channel.code); setState("following"); } catch (e: any) { setState({ error: e.message }); }
  };
  return (
    <div className="tv-co-signal" data-name="chat-signal" data-kind={s.kind}>
      <div className="tv-co-signal-head">
        <span className={`tv-co-signal-dot ${s.kind === "open" ? (buy ? "buy" : "sell") : s.kind}`} />
        <b>{title}</b>
        {s.test && <span className="tv-co-signal-test">test</span>}
      </div>
      {s.kind !== "close" && (
        <div className="tv-co-signal-grid">
          {s.kind === "open" && <><span>Entry</span><b>{s.entry == null ? "market" : price(s.entry)}</b></>}
          <span>Stop loss</span><b>{price(s.sl)}</b>
          <span>Take profit</span><b>{price(s.tp)}</b>
          {s.kind === "open" && s.risk ? <><span>Risk</span><b>{s.risk}% of equity</b></> : null}
        </div>
      )}
      <div className="tv-co-signal-foot">
        <span title={`Trade #${s.ref}`}>{s.channel.name} · copy channel</span>
        {mine ? <span className="tv-co-signal-note">Your channel</span>
          : state === "following" ? <a className="tv-co-signal-note" href="/analytics?view=copy&tab=following" target="_blank" rel="noreferrer" data-name="chat-signal-setup">Following: set up copying ↗</a>
            : <button type="button" className="tv-co-btn secondary" disabled={state === "busy" || !user} onClick={follow} data-name="chat-signal-follow"
                title="Follow this channel; you switch copying on with your own risk and limits">
              {state === "busy" ? "…" : "Copy this channel"}</button>}
      </div>
      {typeof state === "object" && <div className="tv-co-signal-err">{state.error}</div>}
    </div>
  );
}

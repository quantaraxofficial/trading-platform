"use client";

// "Publish script": shares the editor's script as a public indicator / strategy (in everyone's
// Indicators search and on your profile; your followers are told) or a private one (only you and
// the people you invite). Republishing the same script makes a new version.

import React, { useEffect, useState } from "react";
import { Frame, PineButton, typeIcon, type PinePalette } from "./PineDialogs";
import { listScripts, profileUrl, publishScript, mySettings, type CodeAccess, type PublishedScript } from "../../community/social";
import { compilePineForSharing } from "../../lib/pineScriptEngine";

export default function PublishDialog({ p, uid, sourceKey, name, kind, language, code, onClose, onDone }: {
  p: PinePalette; uid: string; sourceKey: string; name: string; kind: "indicator" | "strategy"; language: string; code: string;
  onClose: () => void; onDone: (text: string) => void;
}) {
  const [title, setTitle] = useState(name);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [invite, setInvite] = useState("");
  const [codeAccess, setCodeAccess] = useState<CodeAccess>("open");
  const [viewers, setViewers] = useState("");
  // Only Pine Script code can be hidden: others get it compiled (comments and names gone); MQL5
  // compiles to JavaScript and Python runs as itself, so theirs stays open
  const canHide = language === "pine";
  const [existing, setExisting] = useState<PublishedScript | null | undefined>(undefined);
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listScripts(uid, "mine").then(l => {
      const e = l.find(s => s.source_key === sourceKey) || null;
      setExisting(e);
      if (e) {
        setDescription(e.description);
        setVisibility(e.visibility);
        setInvite((e.invited || []).map(i => `@${i.username}`).join(", "));
        setCodeAccess(e.code_access);
        setViewers((e.code_viewers || []).map(i => `@${i.username}`).join(", "));
      }
    }, () => setExisting(null));
    mySettings(uid).then(m => setMe(m.username), () => {});
  }, [uid, sourceKey]);
  const publish = async () => {
    setErr(null);
    setBusy(true);
    try {
      let compiled: unknown = null;
      if (language === "pine") {
        try { compiled = compilePineForSharing(code); }
        catch (e: any) { if (codeAccess !== "open") throw new Error(`Fix the script first: ${e?.message || e}`); }
      }
      const r = await publishScript(uid, {
        compiled,
        source_key: sourceKey, name: title.trim() || name, kind, language, description, code, visibility,
        invite: invite.split(/[\s,]+/).map(x => x.replace(/^@/, "")).filter(Boolean),
        code_access: canHide ? codeAccess : "open", code_viewers: viewers.split(/[\s,]+/).map(x => x.replace(/^@/, "")).filter(Boolean),
      });
      onDone(r.script.visibility === "public"
        ? `${r.first ? "Published" : `Version ${r.script.version} published`}: ${r.script.name} is public${r.first ? " (your followers were told)" : ""}`
        : `${r.script.name} published privately${r.script.invited?.length ? ` for ${r.script.invited.map(i => `@${i.username}`).join(", ")}` : " (only you)"}`);
    } catch (e: any) { setErr(e?.message || "Couldn't publish"); }
    finally { setBusy(false); }
  };
  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: `1px solid ${p.border}`, borderRadius: 6, padding: "8px 10px", background: p.inputBg, color: p.text, fontSize: 14, fontFamily: "inherit", outline: "none" };
  const label: React.CSSProperties = { display: "block", fontSize: 13, color: p.muted, margin: "14px 0 6px" };
  const choice = (v: "public" | "private", head: string, text: string) => (
    <button type="button" onClick={() => setVisibility(v)} data-visibility={v}
      style={{ flex: 1, textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
        border: `1px solid ${visibility === v ? p.blue : p.border}`, background: visibility === v ? p.hover : "transparent", color: p.text }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{head}</div>
      <div style={{ fontSize: 12, color: p.muted, marginTop: 2 }}>{text}</div>
    </button>
  );
  return (
    <Frame p={p} title="Publish script" onClose={onClose} width={520} testId="pine-publish">
      <div style={{ padding: "0 20px" }} onKeyDown={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: p.muted }}>
          {typeIcon(kind, 18)}<span style={{ textTransform: "capitalize" }}>{kind}</span><span>· {language === "pine" ? "Pine Script" : language === "python" ? "Python" : "MQL5"}</span>
          {existing && <span>· republishing makes version {existing.version + 1}</span>}
        </div>
        <label style={label}>Title</label>
        <input style={input} value={title} onChange={e => setTitle(e.target.value)} maxLength={100} data-testid="publish-title" />
        <label style={label}>Description</label>
        <textarea style={{ ...input, minHeight: 90, resize: "vertical" }} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="What it shows or trades, its inputs, how to use it…" data-testid="publish-description" />
        <label style={label}>Who can use it</label>
        <div style={{ display: "flex", gap: 10 }}>
          {choice("public", "Public", "Everyone finds it in Indicators and on your profile")}
          {choice("private", "Private", "Only you, and the people you invite")}
        </div>
        {visibility === "private" && (
          <>
            <label style={label}>Invite people (their @usernames)</label>
            <input style={input} value={invite} onChange={e => setInvite(e.target.value)} placeholder="@asha_rao, @ben" data-testid="publish-invite" />
          </>
        )}
        <label style={label}>Who can see the code</label>
        <div style={{ display: "flex", gap: 8 }} data-testid="publish-code-access">
          {([["open", "Open", "Anyone who can use it"], ["hidden", "Hidden", "Only you"], ["allowed", "Chosen people", "Only you and people you list"]] as const).map(([v, head, text]) => (
            <button key={v} type="button" disabled={!canHide && v !== "open"} onClick={() => setCodeAccess(v)} data-code-access={v}
              style={{ flex: 1, textAlign: "left", padding: "8px 10px", borderRadius: 8, cursor: !canHide && v !== "open" ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: !canHide && v !== "open" ? 0.45 : 1,
                border: `1px solid ${codeAccess === v ? p.blue : p.border}`, background: codeAccess === v ? p.hover : "transparent", color: p.text }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{head}</div><div style={{ fontSize: 11, color: p.muted, marginTop: 2 }}>{text}</div>
            </button>
          ))}
        </div>
        {!canHide && <div style={{ fontSize: 12, color: p.muted, marginTop: 6 }}>Only Pine Script code can be hidden ({language === "python" ? "Python" : "MQL5"} scripts run as themselves).</div>}
        {canHide && codeAccess === "allowed" && (
          <input style={{ ...input, marginTop: 8 }} value={viewers} onChange={e => setViewers(e.target.value)} placeholder="Who may see the code: @asha_rao, @ben" data-testid="publish-code-viewers" />
        )}
        {canHide && codeAccess !== "open" && <div style={{ fontSize: 12, color: p.muted, marginTop: 6 }}>Others can still add it to their chart: they get it compiled, without your code, comments or names.</div>}
        {err && <div role="alert" style={{ color: p.danger, fontSize: 13, marginTop: 12 }}>{err}</div>}
        {me && <div style={{ fontSize: 12, color: p.muted, marginTop: 12 }}>It shows on <a href={profileUrl(me)} target="_blank" rel="noreferrer" style={{ color: p.blue, textDecoration: "none" }}>your profile (@{me})</a>.</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "24px 20px 20px" }}>
        <PineButton p={p} onClick={onClose}>Cancel</PineButton>
        <PineButton p={p} kind="primary" onClick={publish} disabled={busy || existing === undefined || !code.trim()}>{busy ? "Publishing…" : existing ? "Publish new version" : "Publish"}</PineButton>
      </div>
    </Frame>
  );
}

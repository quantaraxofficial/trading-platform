"use client";

// In the Pine Editor, while a collab is open: "Live" with who else has a cursor in the code, or
// "View only" when the owner hasn't let this person edit the script.

import "./collab.css";
import { useCollab } from "../../lib/collab/session";
import { usePineDoc } from "../../lib/collab/pineDoc";
import { Avatar } from "./CollabDialog";

export default function PineLiveBadge() {
  const { status, room } = useCollab();
  const { ready, canEdit, cursors } = usePineDoc();
  if (status !== "live" || !room || !ready) return null;
  const editing = Array.from(new Map(cursors.map(c => [c.uid, c])).values());
  return (
    <span data-name="pine-live-badge" title={canEdit ? "Everyone in the collab edits this script together" : "The owner hasn't let you edit the script"}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 8px", borderRadius: 13, flexShrink: 0,
        background: canEdit ? "rgba(8,153,129,0.12)" : "var(--tv-co-hover)", color: canEdit ? "#089981" : "var(--tv-co-muted)", fontSize: 12, fontWeight: 600 }}>
      <i className={`tv-co-dot${canEdit ? "" : " off"}`} />
      {canEdit ? "Live" : "View only"}
      {editing.length > 0 && (
        <span className="tv-co-stack" style={{ marginLeft: 2 }}>
          {editing.slice(0, 4).map(c => <Avatar key={c.uid} name={c.name} color={c.color} size="sm" />)}
        </span>
      )}
    </span>
  );
}

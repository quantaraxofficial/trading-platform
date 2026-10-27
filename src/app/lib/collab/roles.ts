// What someone is in a collab, as one coloured label: from their role and what the owner lets
// them do. Used for the list of your collabs and the people in one.
import type { Perms, Role, RoomKind } from "./session";

export type CollabRoleKey = "admin" | "controller" | "editor" | "participant" | "viewer";

export const COLLAB_ROLES: Record<CollabRoleKey, { label: string; color: string; hint: string }> = {
  admin: { label: "Admin", color: "#f5a000", hint: "Owns the collab: manages everyone and can end it" },
  controller: { label: "Controller", color: "#9c27b0", hint: "Adds people (and edits)" },
  editor: { label: "Editor", color: "#2962ff", hint: "Edits the chart or the script" },
  participant: { label: "Participant", color: "#089981", hint: "Can't edit, but talks in voice or shares alerts" },
  viewer: { label: "Viewer", color: "#787b86", hint: "Watches and chats" },
};
export const COLLAB_ROLE_ORDER: CollabRoleKey[] = ["admin", "controller", "editor", "participant", "viewer"];

export function collabRoleOf(role: Role | string | null | undefined, perms: Perms | null | undefined, kind: RoomKind = "chart"): CollabRoleKey {
  if (role === "owner") return "admin";
  if (!perms) return role === "editor" ? "editor" : "viewer";
  if (perms.invite) return "controller";
  if (kind === "pine" ? perms.pine : perms.edit) return "editor";
  if (perms.voice || perms.alert) return "participant";
  return "viewer";
}

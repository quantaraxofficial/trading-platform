// A drawing tool's saved templates (kept in the account, per tool type): renaming one, and
// telling the imported ones apart (an imported settings file adds them as "Imported · <owner>",
// see lib/settingsTransfer).
import { backendFetch } from "@/lib/backend";
import { IMPORTED_PREFIX } from "../../../lib/settingsTransfer";

const API = "http://localhost:8000/api/users/templates";

export interface DrawingTemplate { id: number | string; name: string; tool_type: string; settings: any }

export const isImported = (t: { name: string }) => t.name.startsWith(IMPORTED_PREFIX);

// The account keeps a template per (tool, name): renaming saves it under the new name, then
// removes the old one. Throws when the account couldn't be reached.
export async function renameDrawingTemplate(uid: string, t: DrawingTemplate, name: string) {
  const clean = name.trim().slice(0, 100);
  if (!clean || clean === t.name || clean === "default") return;
  const res = await backendFetch(`${API}/${uid}/`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: clean, tool_type: t.tool_type, settings: typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings }),
  });
  if (!res.ok) throw new Error("Couldn't rename the template");
  await backendFetch(`${API}/delete/${t.id}/`, { method: "DELETE" });
}

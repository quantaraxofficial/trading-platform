// Settings → Download settings / Import: all of an account's settings (the ones that follow it
// between devices: layouts, watchlists, chart settings and templates, the background image,
// indicator templates, favorites, theme…) as one JSON file, and that file read back on another
// computer. The file also carries each drawing tool's saved default and templates.
//
// Importing replaces this browser's settings, uploads them to the signed-in account at once, and
// reloads, so everything comes up configured. What was imported also shows up in the Template
// menus, marked Imported and renamable, each applying only its own part: the chart settings in
// Settings → Template, each drawing tool's style in that tool's Template menu (as
// "Imported · <owner>"), the indicator templates among Indicator templates.

import { SYNCED_KEYS, flushCloudSync } from "./cloudSync";
import { DEFAULT_CHART_SETTINGS, importedTemplateName, type ChartSettingsSnapshot, type ChartTemplate } from "./chartSettings";
import { backendFetch } from "@/lib/backend";

const APP = "tradepilot-settings";
const VERSION = 1;
const MAX_FILE_BYTES = 30_000_000;

// A drawing tool's saved style: its default ("default") or a named template
export interface DrawingToolTemplate { tool_type: string; name: string; settings: Record<string, any> }

export interface SettingsFile {
  app: typeof APP;
  version: number;
  exported_at: string;
  account?: { name?: string | null; email?: string | null };
  settings: Record<string, string>;
  drawing_templates?: DrawingToolTemplate[];
}

const TEMPLATES_API = "http://localhost:8000/api/users/templates";
export const IMPORTED_PREFIX = "Imported · ";

// The account's drawing-tool defaults and templates (the chart settings' templates are in the settings)
async function accountDrawingTemplates(uid: string): Promise<DrawingToolTemplate[]> {
  try {
    const res = await backendFetch(`${TEMPLATES_API}/${uid}/`);
    const data = res.ok ? await res.json() : [];
    return Array.isArray(data)
      ? data.filter((t: any) => t && t.tool_type !== "chart_settings" && typeof t.name === "string" && t.settings && typeof t.settings === "object")
        .map((t: any) => ({ tool_type: t.tool_type, name: t.name, settings: t.settings }))
      : [];
  } catch { return []; }
}

export async function buildSettingsFile(account?: { name?: string | null; email?: string | null }, uid?: string | null): Promise<SettingsFile> {
  const settings: Record<string, string> = {};
  for (const key of SYNCED_KEYS) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) settings[key] = v;
    } catch { /* storage off */ }
  }
  const drawing_templates = uid ? await accountDrawingTemplates(uid) : [];
  return { app: APP, version: VERSION, exported_at: new Date().toISOString(), account, settings, drawing_templates };
}

export async function downloadSettings(account?: { name?: string | null; email?: string | null }, uid?: string | null) {
  const file = await buildSettingsFile(account, uid);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tradepilot-settings-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return Object.keys(file.settings).length;
}

// Reads and checks a settings file: only the settings that follow an account, each a string
export async function readSettingsFile(file: File): Promise<SettingsFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error("That file is too big to be a settings file");
  let data: any;
  try { data = JSON.parse(await file.text()); } catch { throw new Error("That file isn't a settings file (it isn't JSON)"); }
  if (!data || data.app !== APP || typeof data.settings !== "object" || !data.settings) throw new Error("That file isn't a settings file downloaded from this site");
  if (typeof data.version !== "number" || data.version > VERSION) throw new Error("This settings file is from a newer version of the site");
  const allowed = new Set(SYNCED_KEYS);
  const settings: Record<string, string> = {};
  for (const [key, value] of Object.entries(data.settings)) {
    if (!allowed.has(key) || typeof value !== "string") continue;
    settings[key] = value;
  }
  const drawing_templates: DrawingToolTemplate[] = (Array.isArray(data.drawing_templates) ? data.drawing_templates : [])
    .filter((t: any) => t && typeof t.tool_type === "string" && t.tool_type.length <= 50 && t.tool_type !== "chart_settings"
      && typeof t.name === "string" && t.name.length <= 100 && t.settings && typeof t.settings === "object" && !Array.isArray(t.settings))
    .slice(0, 500)
    .map((t: any) => ({ tool_type: t.tool_type, name: t.name, settings: t.settings }));
  if (!Object.keys(settings).length && !drawing_templates.length) throw new Error("There are no settings in that file");
  return { ...data, settings, drawing_templates };
}

const TEMPLATES_KEY = "tv:chartSettingsTemplates";
const INDICATOR_TEMPLATES_KEY = "tv:indicatorTemplates";
const ownerOf = (file: SettingsFile) => (file.account?.name || file.account?.email || "settings file").trim().slice(0, 60);
const parse = (v: string | undefined) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };

// The file's chart settings (chart, status line, trading) as a Settings → Template entry, so they
// can be applied again later, or renamed
function importedTemplate(file: SettingsFile, existing: ChartTemplate[]): ChartTemplate | null {
  const chart = parse(file.settings["tv:chartSettings"]);
  if (!chart) return null;
  const settings: ChartSettingsSnapshot = {
    chart: { ...DEFAULT_CHART_SETTINGS, ...chart, candle: { ...DEFAULT_CHART_SETTINGS.candle, ...(chart.candle || {}) } },
    status: parse(file.settings["tv:statusLine"]) || undefined as any,
    trading: parse(file.settings["tv:tradingSettings"]) || {},
    imported: { from: file.account?.name || file.account?.email || "a settings file", at: file.exported_at },
  };
  if (!settings.status) delete (settings as any).status;
  return { name: importedTemplateName(file.account?.name || file.account?.email, existing.map(t => t.name)), settings };
}

// Puts the file's settings in place (uploading them to the signed-in account), adds them to the
// templates, then reloads
export async function applySettingsFile(file: SettingsFile, uid?: string | null) {
  for (const [key, value] of Object.entries(file.settings)) {
    if (key === TEMPLATES_KEY || key === INDICATOR_TEMPLATES_KEY) continue;
    try { localStorage.setItem(key, value); } catch { throw new Error("The browser's storage is full; the settings couldn't all be saved"); }
  }
  // Templates: the file's join this account's (a name in both: the file's wins), plus one for the
  // imported settings themselves
  const mine: ChartTemplate[] = parse(localStorage.getItem(TEMPLATES_KEY) || undefined)?.list || [];
  const theirs: ChartTemplate[] = (parse(file.settings[TEMPLATES_KEY])?.list || []).map((t: ChartTemplate) => ({ name: t.name, settings: t.settings }));
  const merged = new Map<string, ChartTemplate>(mine.map(t => [t.name, t]));
  theirs.forEach(t => { if (t?.name && t.settings) merged.set(t.name, t); });
  const added = importedTemplate(file, Array.from(merged.values()));
  if (added) merged.set(added.name, added);
  const list = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify({ list })); } catch { /* full */ }

  // Indicator templates: the file's join this account's, marked imported (a name already taken
  // gets the owner's name after it)
  const owner = ownerOf(file);
  const myInd: any[] = parse(localStorage.getItem(INDICATOR_TEMPLATES_KEY) || undefined) || [];
  const theirInd: any[] = parse(file.settings[INDICATOR_TEMPLATES_KEY]) || [];
  if (Array.isArray(theirInd) && theirInd.length) {
    const names = new Set(myInd.map(t => String(t?.name || "").toLowerCase()));
    const incoming = theirInd.filter(t => t && typeof t.name === "string" && Array.isArray(t.indicators)).map(t => {
      let name = t.name;
      if (names.has(name.toLowerCase())) name = `${t.name} · ${owner}`;
      for (let i = 2; names.has(name.toLowerCase()); i++) name = `${t.name} · ${owner} (${i})`;
      names.add(name.toLowerCase());
      return { ...t, name, id: Math.random().toString(36).slice(2, 10), imported: { from: owner, at: file.exported_at } };
    });
    try { localStorage.setItem(INDICATOR_TEMPLATES_KEY, JSON.stringify([...(Array.isArray(myInd) ? myInd : []), ...incoming])); } catch { /* full */ }
  }

  // The account keeps its templates too (they're synced from it on every visit). Each drawing
  // tool's default becomes this account's default for that tool, and also a template
  // "Imported · <owner>"; its named templates come in as "Imported · <owner> · <name>"
  if (uid) {
    const post = (tool_type: string, name: string, settings: any) =>
      backendFetch(`${TEMPLATES_API}/${uid}/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, tool_type, settings }) }).catch(() => null);
    const drawing = (file.drawing_templates || []).flatMap(t => (t.name === "default"
      ? [post(t.tool_type, "default", t.settings), post(t.tool_type, `${IMPORTED_PREFIX}${owner}`, t.settings)]
      : [post(t.tool_type, `${IMPORTED_PREFIX}${owner} · ${t.name}`.slice(0, 100), t.settings)]));
    await Promise.all([
      ...[...theirs, ...(added ? [added] : [])].map(t => post("chart_settings", t.name, t.settings)),
      ...drawing,
    ]);
  }
  await flushCloudSync();
  window.location.reload();
}

// Settings → Download settings / Import: all of an account's settings (the ones that follow it
// between devices: layouts, watchlists, chart settings and templates, the background image,
// indicator templates, favorites, theme…) as one JSON file, and that file read back on another
// computer. Importing replaces this browser's copies, uploads them to the signed-in account at
// once, and reloads, so everything comes up configured.

import { SYNCED_KEYS, flushCloudSync } from "./cloudSync";

const APP = "tradepilot-settings";
const VERSION = 1;
const MAX_FILE_BYTES = 30_000_000;

export interface SettingsFile {
  app: typeof APP;
  version: number;
  exported_at: string;
  account?: { name?: string | null; email?: string | null };
  settings: Record<string, string>;
}

export function buildSettingsFile(account?: { name?: string | null; email?: string | null }): SettingsFile {
  const settings: Record<string, string> = {};
  for (const key of SYNCED_KEYS) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) settings[key] = v;
    } catch { /* storage off */ }
  }
  return { app: APP, version: VERSION, exported_at: new Date().toISOString(), account, settings };
}

export function downloadSettings(account?: { name?: string | null; email?: string | null }) {
  const file = buildSettingsFile(account);
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
  if (!Object.keys(settings).length) throw new Error("There are no settings in that file");
  return { ...data, settings };
}

// Puts the file's settings in place (uploading them to the signed-in account), then reloads
export async function applySettingsFile(file: SettingsFile) {
  for (const [key, value] of Object.entries(file.settings)) {
    try { localStorage.setItem(key, value); } catch { throw new Error("The browser's storage is full; the settings couldn't all be saved"); }
  }
  await flushCloudSync();
  window.location.reload();
}

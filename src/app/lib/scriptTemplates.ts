"use client";

// Settings templates for Pine indicators and strategies, as TradingView keeps them in a script's
// settings → Defaults menu: named sets of the script's input values (plus a strategy's initial
// capital and the plots' colours), and one "default" set used whenever the script is added.
// Stored per script under "tv:scriptTemplates", one of the keys that sync with the account
// (lib/cloudSync), so they're saved in the database and follow the user between devices.
//
// A script is identified by where it lives on the site, so its templates find it again:
//   builtin:<name>    a built-in indicator / strategy
//   script:<id>       a script saved from the Pine Editor (privately)
//   published:<id>    a published script (public or private)
// A script that was never saved has no key, and so no templates: it has to be saved first.

import { makeStore } from "../trading/settings";

export interface ScriptTemplateValues {
  inputs: Record<string, any>;
  capital?: number;
  plotColors?: Record<string, string>;
}
export interface ScriptTemplate { name: string; values: ScriptTemplateValues; savedAt: number }
interface ScriptEntry { templates: ScriptTemplate[]; default?: ScriptTemplateValues }

export const scriptTemplatesStore = makeStore<{ byScript: Record<string, ScriptEntry> }>("tv:scriptTemplates", { byScript: {} });

export const builtinScriptKey = (name: string) => `builtin:${name}`;

export function scriptEntry(key: string | null | undefined): ScriptEntry {
  if (!key) return { templates: [] };
  return scriptTemplatesStore.get().byScript[key] || { templates: [] };
}

const update = (key: string, fn: (e: ScriptEntry) => ScriptEntry) =>
  scriptTemplatesStore.set(prev => ({ byScript: { ...prev.byScript, [key]: fn(prev.byScript[key] || { templates: [] }) } }));

// Saving under an existing name (case-insensitive) replaces it, as TradingView does
export function saveScriptTemplate(key: string, name: string, values: ScriptTemplateValues) {
  const clean = name.trim();
  if (!clean) return;
  update(key, e => ({
    ...e,
    templates: [...e.templates.filter(t => t.name.toLowerCase() !== clean.toLowerCase()), { name: clean, values, savedAt: Date.now() }]
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export function deleteScriptTemplate(key: string, name: string) {
  update(key, e => ({ ...e, templates: e.templates.filter(t => t.name !== name) }));
}

export function saveScriptDefault(key: string, values: ScriptTemplateValues) {
  update(key, e => ({ ...e, default: values }));
}

export function clearScriptDefault(key: string) {
  update(key, e => { const { default: _d, ...rest } = e; return { ...rest, templates: e.templates }; });
}

export function scriptDefault(key: string | null | undefined): ScriptTemplateValues | undefined {
  return key ? scriptEntry(key).default : undefined;
}

// ------------------------------------------------------------------ the script behind a key
// For indicator templates that hold a script: its code, from where it's saved on the site
import { BUILTIN_SCRIPTS } from "../components/pine/builtinScripts";
import { backendFetch, BACKEND_URL } from "@/lib/backend";

export async function resolveScriptCode(key: string, uid: string | null): Promise<{ code: string; name: string } | null> {
  if (key.startsWith("builtin:")) {
    const b = BUILTIN_SCRIPTS.find(s => s.name === key.slice(8));
    return b ? { code: b.code, name: b.name } : null;
  }
  if (key.startsWith("script:")) {
    const id = key.slice(7);
    // Signed in: the account's saved scripts; signed out: the ones kept in this browser
    if (uid) {
      try {
        const list = await (await backendFetch(`${BACKEND_URL}/api/users/pinescripts/${uid}/`)).json();
        const s = Array.isArray(list) ? list.find((x: any) => String(x.id) === id) : null;
        return s ? { code: s.code, name: s.name } : null;
      } catch { return null; }
    }
    try {
      const list = JSON.parse(localStorage.getItem("tv-pine-scripts-v1") || "[]");
      const s = Array.isArray(list) ? list.find((x: any) => String(x.id) === id) : null;
      return s ? { code: s.code, name: s.name } : null;
    } catch { return null; }
  }
  return resolveOtherScriptCode(key, uid);
}

// Branch-specific sources (published scripts on the merge branch); none here
async function resolveOtherScriptCode(_key: string, _uid: string | null): Promise<{ code: string; name: string } | null> {
  return null;
}

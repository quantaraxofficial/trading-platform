// GitHub for the script editor: connect an account, browse its repositories, pull a script file
// into the editor and push the editor's script back as a commit. Every call goes through the
// backend (core/github.py), which holds the token; the browser never sees it.

import { backendFetch } from "@/lib/backend";
import type { ScriptLanguage } from "./scripting";

const BASE = "http://localhost:8000/api/users/github";

export interface GitHubAccount { connected: boolean; login?: string; avatar_url?: string }
export interface GitHubRepo { full_name: string; private: boolean; default_branch: string; can_push: boolean; description: string }
export interface GitHubFile { path: string; size: number }
// The GitHub file a script is linked to; sha is the version last pulled or pushed
export interface GitHubLink { repo: string; branch: string; path: string; sha?: string }
export interface PulledFile extends GitHubLink { content: string; sha: string; html_url?: string }
export interface PushResult extends GitHubLink { sha: string; html_url?: string; commit: { sha: string; html_url: string; message: string } }

export class GitHubApiError extends Error {
  constructor(message: string, public status: number, public data: any) { super(message); }
  // The file changed on GitHub since it was pulled / pushed, or exists already
  get conflict() { return this.status === 409; }
  get reconnect() { return !!this.data?.reconnect; }
}

async function call<T>(uid: string, path: string, init?: { method?: string; body?: any; query?: Record<string, string | undefined> }): Promise<T> {
  const q = new URLSearchParams();
  Object.entries(init?.query || {}).forEach(([k, v]) => { if (v !== undefined) q.set(k, v); });
  const url = `${BASE}/${encodeURIComponent(uid)}/${path}${q.toString() ? `?${q}` : ""}`;
  let res: Response;
  try {
    res = await backendFetch(url, {
      method: init?.method || "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new GitHubApiError("Couldn't reach the server", 0, null);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GitHubApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  return data as T;
}

export const github = {
  account: (uid: string) => call<GitHubAccount>(uid, "account/"),
  connect: (uid: string, token: string) => call<GitHubAccount>(uid, "account/", { method: "POST", body: { token } }),
  disconnect: (uid: string) => call<GitHubAccount>(uid, "account/", { method: "DELETE" }),
  repos: (uid: string) => call<{ repos: GitHubRepo[] }>(uid, "repos/").then(d => d.repos),
  branches: (uid: string, repo: string) => call<{ branches: string[] }>(uid, "branches/", { query: { repo } }).then(d => d.branches),
  createBranch: (uid: string, repo: string, name: string, from: string) => call<{ name: string }>(uid, "branches/", { method: "POST", body: { repo, name, from } }),
  files: (uid: string, repo: string, ref: string, all = false) =>
    call<{ files: GitHubFile[]; truncated: boolean }>(uid, "files/", { query: { repo, ref, all: all ? "1" : undefined } }),
  pull: (uid: string, link: GitHubLink) => call<PulledFile>(uid, "file/", { query: { repo: link.repo, ref: link.branch, path: link.path } }),
  push: (uid: string, link: GitHubLink, content: string, message: string, force = false) =>
    call<PushResult>(uid, "file/", { method: "PUT", body: { repo: link.repo, branch: link.branch, path: link.path, sha: link.sha, content, message, force } }),
};

// Which language a file is in, by its extension (null: not a script file)
export function languageOfPath(path: string): ScriptLanguage | null {
  const p = path.toLowerCase();
  if (p.endsWith(".pine") || p.endsWith(".pinescript")) return "pine";
  if (p.endsWith(".py")) return "python";
  if (p.endsWith(".mq5") || p.endsWith(".mqh") || p.endsWith(".mq4")) return "mql5";
  return null;
}

export const EXTENSION_OF: Record<ScriptLanguage, string> = { pine: ".pine", python: ".py", mql5: ".mq5" };

// A file name for a script ("My RSI" in Python -> my_rsi.py)
export function fileNameFor(scriptName: string, language: ScriptLanguage): string {
  const base = scriptName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "script";
  return base + EXTENSION_OF[language];
}

// The script's name from its file ("indicators/my_rsi.pine" -> "my_rsi")
export function scriptNameOfPath(path: string): string {
  const file = path.split("/").pop() || path;
  return file.replace(/\.[^.]+$/, "") || file;
}

export const githubUrl = (l: GitHubLink) => `https://github.com/${l.repo}/blob/${encodeURIComponent(l.branch)}/${l.path.split("/").map(encodeURIComponent).join("/")}`;
export const shortLink = (l: GitHubLink) => `${l.repo}/${l.path}${l.branch ? ` (${l.branch})` : ""}`;

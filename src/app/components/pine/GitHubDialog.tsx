"use client";

// The Pine Editor's GitHub dialogs: Connect GitHub (paste a personal access token), Pull from
// GitHub (pick a repository, branch and script file) and Push to GitHub (repository, branch,
// file path and commit message). Pushing a file that changed on GitHub since it was pulled asks
// whether to overwrite it or pull it instead.

import React, { useEffect, useMemo, useState } from "react";
import { Frame, PineButton, type PinePalette } from "./PineDialogs";
import { SearchIcon } from "./pineIcons";
import { languageLabel, type ScriptLanguage } from "../../lib/scripting";
import {
  github, GitHubApiError, fileNameFor, languageOfPath,
  type GitHubAccount, type GitHubFile, type GitHubLink, type GitHubRepo, type PulledFile, type PushResult,
} from "../../lib/github";

export const GitHubIcon = ({ size = 22 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width={size} height={size} aria-hidden fill="currentColor">
    <path d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z" />
  </svg>
);

type Mode = "connect" | "pull" | "push";

const label = (p: PinePalette): React.CSSProperties => ({ display: "block", fontSize: 14, color: p.muted, margin: "14px 0 6px" });
const field = (p: PinePalette): React.CSSProperties => ({
  width: "100%", boxSizing: "border-box", height: 34, padding: "0 8px", fontSize: 15, fontFamily: "inherit", color: p.text,
  background: p.inputBg, border: `1px solid ${p.border}`, borderRadius: 6, outline: "none",
});

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

export default function GitHubDialog({ p, uid, mode, account, link, language, scriptName, code, onClose, onConnected, onPulled, onPushed }: {
  p: PinePalette; uid: string; mode: Mode; account: GitHubAccount | null;
  // The file the script is linked to (push prefills it)
  link: GitHubLink | null; language: ScriptLanguage; scriptName: string; code: string;
  onClose: () => void; onConnected: (a: GitHubAccount) => void; onPulled: (f: PulledFile) => void; onPushed: (r: PushResult) => void;
}) {
  const needsConnect = mode === "connect" || !account?.connected;
  const title = needsConnect ? "Connect GitHub" : mode === "pull" ? "Pull from GitHub" : "Push to GitHub";
  return (
    <Frame p={p} title={title} onClose={onClose} width={needsConnect ? 500 : 560} testId={`github-${needsConnect ? "connect" : mode}-dialog`}
      titleExtra={<span style={{ display: "flex", color: p.muted }}><GitHubIcon size={20} /></span>}>
      {needsConnect
        ? <Connect p={p} uid={uid} onClose={onClose} onConnected={onConnected} />
        : mode === "pull"
          ? <Pull p={p} uid={uid} link={link} onClose={onClose} onPulled={onPulled} />
          : <Push p={p} uid={uid} link={link} language={language} scriptName={scriptName} code={code} onClose={onClose} onPushed={onPushed} onPulled={onPulled} />}
    </Frame>
  );
}

function Connect({ p, uid, onClose, onConnected }: { p: PinePalette; uid: string; onClose: () => void; onConnected: (a: GitHubAccount) => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connect = async () => {
    setBusy(true);
    setError(null);
    try { onConnected(await github.connect(uid, token.trim())); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const a = (href: string, text: string) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: p.blue }}>{text}</a>;
  return (
    <>
      <div style={{ padding: "0 20px", fontSize: 14, lineHeight: "21px" }}>
        <div>Push your scripts to your GitHub repositories and pull them back, as commits. Paste a personal access token from GitHub:</div>
        <ol style={{ margin: "10px 0 0", paddingLeft: 20, color: p.text }}>
          <li>Create one: {a("https://github.com/settings/personal-access-tokens/new", "fine-grained token")} with <b>Contents: Read and write</b> on the repositories you&apos;ll use, or a {a("https://github.com/settings/tokens/new?scopes=repo&description=Script%20editor", "classic token")} with the <b>repo</b> scope.</li>
          <li>Copy it and paste it here.</li>
        </ol>
        <label style={label(p)} htmlFor="gh-token">Personal access token</label>
        <input id="gh-token" type="password" autoFocus autoComplete="off" spellCheck={false} value={token} placeholder="github_pat_… or ghp_…"
          onChange={e => setToken(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && token.trim()) connect(); e.stopPropagation(); }}
          style={{ ...field(p), border: `1px solid ${p.blue}`, boxShadow: `0 0 0 1px ${p.blue}` }} data-testid="github-token" />
        <div style={{ fontSize: 12, color: p.muted, marginTop: 6 }}>It&apos;s stored encrypted on the server and only used to talk to GitHub for you. Disconnect any time from the GitHub menu.</div>
        {error && <div role="alert" style={{ color: p.danger, fontSize: 13, marginTop: 8 }}>{error}</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "24px 20px 20px" }}>
        <PineButton p={p} onClick={onClose}>Cancel</PineButton>
        <PineButton p={p} kind="primary" disabled={!token.trim() || busy} onClick={connect}>{busy ? "Connecting…" : "Connect"}</PineButton>
      </div>
    </>
  );
}

// The repositories and one's branches (shared by Pull and Push)
function useRepoBranch(uid: string, link: GitHubLink | null, onlyPushable: boolean) {
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null);
  const [repo, setRepo] = useState(link?.repo || "");
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState(link?.branch || "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    github.repos(uid).then(list => {
      if (!alive) return;
      const usable = onlyPushable ? list.filter(r => r.can_push) : list;
      setRepos(usable);
      if (!usable.some(r => r.full_name === repo)) setRepo(usable[0]?.full_name || "");
    }).catch(e => { if (alive) { setRepos([]); setError(errorText(e)); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, onlyPushable]);
  useEffect(() => {
    if (!repo) { setBranches(null); return; }
    let alive = true;
    setBranches(null);
    github.branches(uid, repo).then(list => {
      if (!alive) return;
      setBranches(list);
      const def = repos?.find(r => r.full_name === repo)?.default_branch;
      setBranch(b => (list.includes(b) ? b : def && list.includes(def) ? def : list[0] || def || "main"));
    }).catch(e => { if (alive) { setBranches([]); setError(errorText(e)); } });
    return () => { alive = false; };
  }, [uid, repo, repos]);
  return { repos, repo, setRepo, branches, setBranches, branch, setBranch, error, setError };
}

function RepoBranch({ p, rb, extraBranch }: { p: PinePalette; rb: ReturnType<typeof useRepoBranch>; extraBranch?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div style={{ flex: 3, minWidth: 0 }}>
        <label style={label(p)} htmlFor="gh-repo">Repository</label>
        <select id="gh-repo" value={rb.repo} onChange={e => rb.setRepo(e.target.value)} disabled={!rb.repos?.length} style={field(p)} data-testid="github-repo">
          {!rb.repos && <option>Loading…</option>}
          {rb.repos?.length === 0 && <option value="">No repositories</option>}
          {rb.repos?.map(r => <option key={r.full_name} value={r.full_name}>{r.full_name}{r.private ? " 🔒" : ""}</option>)}
        </select>
      </div>
      <div style={{ flex: 2, minWidth: 0 }}>
        <label style={label(p)} htmlFor="gh-branch">Branch</label>
        {extraBranch ?? (
          <select id="gh-branch" value={rb.branch} onChange={e => rb.setBranch(e.target.value)} disabled={!rb.branches?.length} style={field(p)} data-testid="github-branch">
            {!rb.branches && <option>Loading…</option>}
            {rb.branches?.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

function Pull({ p, uid, link, onClose, onPulled }: { p: PinePalette; uid: string; link: GitHubLink | null; onClose: () => void; onPulled: (f: PulledFile) => void }) {
  const rb = useRepoBranch(uid, link, false);
  const [files, setFiles] = useState<GitHubFile[] | null>(null);
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(link?.path || null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!rb.repo || !rb.branch || !rb.branches) return;
    let alive = true;
    setFiles(null);
    github.files(uid, rb.repo, rb.branch, all).then(d => { if (alive) setFiles(d.files); }).catch(e => { if (alive) { setFiles([]); rb.setError(errorText(e)); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, rb.repo, rb.branch, rb.branches, all]);
  const shown = useMemo(() => (files || []).filter(f => f.path.toLowerCase().includes(query.trim().toLowerCase())), [files, query]);
  const pull = async (path = picked) => {
    if (!path) return;
    setBusy(true);
    rb.setError(null);
    try { onPulled(await github.pull(uid, { repo: rb.repo, branch: rb.branch, path })); }
    catch (e) { rb.setError(errorText(e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <div style={{ padding: "0 20px" }}>
        <RepoBranch p={p} rb={rb} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 6px" }}>
          <span style={{ flex: 1, fontSize: 14, color: p.muted }}>File</span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: p.muted, cursor: "pointer" }}>
            <input type="checkbox" className="pine-checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Show all files
          </label>
        </div>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 8, top: 8, color: p.muted, display: "flex" }}><SearchIcon /></span>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder="Search files" aria-label="Search files" style={{ ...field(p), paddingLeft: 32 }} />
        </div>
        <div role="listbox" aria-label="Files" data-testid="github-files" style={{ height: 220, overflowY: "auto", marginTop: 8, border: `1px solid ${p.border}`, borderRadius: 6 }}>
          {!files && <div style={{ padding: 12, color: p.muted, fontSize: 14 }}>{rb.repo ? "Loading files…" : "Pick a repository"}</div>}
          {files && shown.length === 0 && <div style={{ padding: 12, color: p.muted, fontSize: 14 }}>{files.length ? "No file matches" : "No Pine, Python or MQL5 files on this branch. Tick Show all files to see the rest."}</div>}
          {shown.map(f => {
            const lang = languageOfPath(f.path);
            return (
              <div key={f.path} role="option" aria-selected={picked === f.path} onClick={() => setPicked(f.path)} onDoubleClick={() => pull(f.path)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", fontSize: 14, background: picked === f.path ? p.hover : "transparent" }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.path}>{f.path}</span>
                <span style={{ fontSize: 12, color: p.muted, flexShrink: 0 }}>{lang ? languageLabel(lang) : ""}</span>
              </div>
            );
          })}
        </div>
        {rb.error && <div role="alert" style={{ color: p.danger, fontSize: 13, marginTop: 8 }}>{rb.error}</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "20px" }}>
        <PineButton p={p} onClick={onClose}>Cancel</PineButton>
        <PineButton p={p} kind="primary" disabled={!picked || busy || !files?.some(f => f.path === picked)} onClick={() => pull()}>{busy ? "Pulling…" : "Pull"}</PineButton>
      </div>
    </>
  );
}

function Push({ p, uid, link, language, scriptName, code, onClose, onPushed, onPulled }: {
  p: PinePalette; uid: string; link: GitHubLink | null; language: ScriptLanguage; scriptName: string; code: string;
  onClose: () => void; onPushed: (r: PushResult) => void; onPulled: (f: PulledFile) => void;
}) {
  const rb = useRepoBranch(uid, link, true);
  const [newBranch, setNewBranch] = useState<string | null>(null);
  const [path, setPath] = useState(link?.path || fileNameFor(scriptName, language));
  const fileName = path.split("/").pop() || path;
  const [message, setMessage] = useState(link ? `Update ${fileName}` : `Add ${fileName}`);
  const [busy, setBusy] = useState(false);
  // GitHub has a different version of the file: overwrite it, or pull it instead
  const [conflict, setConflict] = useState<null | "exists" | "changed">(null);
  // The link's version applies only to the file it was pulled / pushed from
  const sameFile = !!link && link.repo === rb.repo && link.branch === (newBranch ?? rb.branch) && link.path === path.trim();

  const push = async (force = false) => {
    setBusy(true);
    rb.setError(null);
    try {
      let branch = rb.branch;
      if (newBranch !== null) {
        const name = newBranch.trim();
        if (!name) throw new Error("Name the new branch");
        await github.createBranch(uid, rb.repo, name, rb.branch);
        branch = name;
      }
      const target: GitHubLink = { repo: rb.repo, branch, path: path.trim().replace(/^\/+/, ""), sha: sameFile ? link!.sha : undefined };
      onPushed(await github.push(uid, target, code, message, force));
    } catch (e) {
      if (e instanceof GitHubApiError && e.conflict) setConflict(e.data?.exists ? "exists" : "changed");
      else rb.setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const pullTheirs = async () => {
    setBusy(true);
    try { onPulled(await github.pull(uid, { repo: rb.repo, branch: newBranch?.trim() || rb.branch, path: path.trim() })); }
    catch (e) { rb.setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const pathLang = languageOfPath(path);
  return (
    <>
      <div style={{ padding: "0 20px" }}>
        <RepoBranch p={p} rb={rb} extraBranch={
          <div style={{ display: "flex", gap: 6 }}>
            {newBranch === null ? (
              <select id="gh-branch" value={rb.branch} onChange={e => { if (e.target.value === "__new") setNewBranch(""); else rb.setBranch(e.target.value); }}
                disabled={!rb.branches} style={field(p)} data-testid="github-branch">
                {!rb.branches && <option>Loading…</option>}
                {rb.branches?.map(b => <option key={b} value={b}>{b}</option>)}
                {rb.branches && <option value="__new">New branch…</option>}
              </select>
            ) : (
              <>
                <input id="gh-branch" autoFocus value={newBranch} onChange={e => setNewBranch(e.target.value)} onKeyDown={e => e.stopPropagation()}
                  placeholder={`new branch from ${rb.branch}`} style={field(p)} data-testid="github-new-branch" />
                <button type="button" className="pine-icon-btn" aria-label="Pick an existing branch" title="Pick an existing branch" onClick={() => setNewBranch(null)} style={{ width: 34, height: 34, color: p.text, flexShrink: 0 }}>✕</button>
              </>
            )}
          </div>
        } />
        <label style={label(p)} htmlFor="gh-path">File path</label>
        <input id="gh-path" value={path} onChange={e => { setPath(e.target.value); setConflict(null); }} onKeyDown={e => e.stopPropagation()} spellCheck={false} style={field(p)} data-testid="github-path" />
        {pathLang && pathLang !== language && <div style={{ fontSize: 12, color: "#ff9800", marginTop: 6 }}>The script is {languageLabel(language)}, but this file name is for {languageLabel(pathLang)}.</div>}
        <label style={label(p)} htmlFor="gh-message">Commit message</label>
        <textarea id="gh-message" value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.stopPropagation()} rows={2}
          style={{ ...field(p), height: "auto", padding: "6px 8px", resize: "vertical" }} data-testid="github-message" />
        {conflict && (
          <div role="alert" data-testid="github-conflict" style={{ marginTop: 12, padding: 12, borderRadius: 6, background: p.hover, fontSize: 14, lineHeight: "20px" }}>
            {conflict === "exists"
              ? <><b>{path}</b> already exists on <b>{newBranch?.trim() || rb.branch}</b>. Overwrite it with this script, or pull it into the editor instead?</>
              : <><b>{path}</b> changed on GitHub since you last pulled or pushed it. Overwrite GitHub&apos;s version, or pull it into the editor instead?</>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <PineButton p={p} onClick={pullTheirs} disabled={busy}>Pull theirs</PineButton>
              <PineButton p={p} kind="primary" onClick={() => push(true)} disabled={busy}>Overwrite</PineButton>
            </div>
          </div>
        )}
        {rb.error && <div role="alert" style={{ color: p.danger, fontSize: 13, marginTop: 8 }}>{rb.error}</div>}
        {rb.repos && rb.repos.length === 0 && !rb.error && <div style={{ color: p.muted, fontSize: 13, marginTop: 8 }}>The token can&apos;t write to any repository. Give it Contents: Read and write access, or create a repository on GitHub first.</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "20px" }}>
        <PineButton p={p} onClick={onClose}>Cancel</PineButton>
        <PineButton p={p} kind="primary" disabled={busy || !rb.repo || !rb.branch || !path.trim() || !!conflict} onClick={() => push(false)}>{busy ? "Pushing…" : "Commit & push"}</PineButton>
      </div>
    </>
  );
}


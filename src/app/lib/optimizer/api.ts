// The optimizer's runs and results on the backend (core/optimizer_api.py)

import { BACKEND } from "../collab/session";
import { sessionKey } from "@/lib/backend";
import type { Metrics } from "./metrics";
import type { Combo, OptimizerConfig } from "./space";

export type RunStatus = "ready" | "running" | "interrupted" | "paused" | "done";
export interface Ranking { sort?: string; dir?: "asc" | "desc"; min_trades?: number | ""; max_dd?: number | ""; min_pf?: number | ""; profitable?: boolean; every_year?: boolean }
export interface OptResult { index: number; params: Combo; metrics: Metrics | null; error: string }
export interface OptRun {
  id: number; name: string; script_key: string; script_name: string; language: "pine" | "python" | "mql5"; status: RunStatus;
  total: number; cursor: number; elapsed_ms: number; runner: string; config: OptimizerConfig; ranking: Ranking;
  created_at: number; updated_at: number; best: OptResult | null;
  // With the run's detail
  results?: OptResult[]; passing?: number; tested?: number; failed?: number; code?: string; ranked_by?: { sort: string; dir: string };
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: any) { super(message); }
}

export const resultsUrl = (uid: string, id: number) =>
  `${BACKEND}/api/users/optimizer/${encodeURIComponent(uid)}/runs/${id}/results/?session_key=${encodeURIComponent(sessionKey())}`;

async function call<T>(uid: string, rest: string, method = "GET", body?: unknown): Promise<T> {
  const sep = rest.includes("?") ? "&" : "?";
  const res = await fetch(`${BACKEND}/api/users/optimizer/${encodeURIComponent(uid)}/${rest}${sep}session_key=${encodeURIComponent(sessionKey())}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  return data as T;
}

const query = (r: Ranking) => Object.entries(r).filter(([, v]) => v !== "" && v !== undefined && v !== false)
  .map(([k, v]) => `${k}=${encodeURIComponent(String(v === true ? 1 : v))}`).join("&");

export const listRuns = (uid: string, scriptKey: string) => call<{ runs: OptRun[] }>(uid, `runs/?script_key=${encodeURIComponent(scriptKey)}`).then(d => d.runs);
export const createRun = (uid: string, body: { script_key: string; script_name: string; language: string; code: string; config: OptimizerConfig; ranking: Ranking; total: number; name?: string }) =>
  call<{ run: OptRun }>(uid, "runs/", "POST", body).then(d => d.run);
export const getRun = (uid: string, id: number, ranking?: Ranking, limit = 100) =>
  call<{ run: OptRun }>(uid, `runs/${id}/?limit=${limit}${ranking ? `&${query(ranking)}` : ""}`).then(d => d.run);
export const patchRun = (uid: string, id: number, body: Record<string, unknown>) => call<{ run: OptRun }>(uid, `runs/${id}/`, "PATCH", body).then(d => d.run);
export const deleteRun = (uid: string, id: number) => call(uid, `runs/${id}/`, "DELETE");
export const claimRun = (uid: string, id: number, runner: string, force = false) => call<{ run: OptRun }>(uid, `runs/${id}/claim/`, "POST", { runner, force }).then(d => d.run);
export const sendResults = (uid: string, id: number, body: { runner: string; cursor: number; elapsed_ms: number; results: { index: number; params: Combo; metrics?: Metrics; error?: string }[] }) =>
  call<{ status: RunStatus; cursor: number }>(uid, `runs/${id}/results/`, "POST", body);

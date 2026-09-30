import { promises as fs } from 'fs';
import path from 'path';

// Server-side storage for chart snapshots created from the Snapshot menu. Each snapshot
// is a PNG plus a small JSON sidecar with what the public snapshot page needs to show.
export const SNAPSHOT_DIR = path.join(process.cwd(), '.snapshots');

// Ids are generated as 18 hex chars; validating that shape is also what keeps any
// path traversal out of the file lookups below.
export const SNAPSHOT_ID_RE = /^[a-f0-9]{18}$/;

export interface SnapshotMeta {
  symbol: string;
  intervalLabel: string;
  author: string;
  createdAt: string;   // ISO timestamp
  tzOffsetMin: number; // creator's UTC offset in minutes (e.g. 330 for UTC+5:30)
}

export async function readSnapshotMeta(id: string): Promise<SnapshotMeta | null> {
  if (!SNAPSHOT_ID_RE.test(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(SNAPSHOT_DIR, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

export async function readSnapshotImage(id: string): Promise<Buffer | null> {
  if (!SNAPSHOT_ID_RE.test(id)) return null;
  try {
    return await fs.readFile(path.join(SNAPSHOT_DIR, `${id}.png`));
  } catch {
    return null;
  }
}

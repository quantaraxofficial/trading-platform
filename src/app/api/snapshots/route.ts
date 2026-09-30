import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SNAPSHOT_DIR, SnapshotMeta } from '@/app/lib/snapshotStore';

const MAX_BYTES = 10 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const clean = (v: string | null, max: number) => (v || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, max);

// Body: the PNG. Query: symbol, interval, author, tz (creator's UTC offset in minutes).
export async function POST(request: Request) {
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is empty or too large' }, { status: 400 });
  }
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return NextResponse.json({ error: 'Only PNG images are accepted' }, { status: 400 });
  }

  const q = new URL(request.url).searchParams;
  const tz = parseInt(q.get('tz') || '0', 10);
  const meta: SnapshotMeta = {
    symbol: clean(q.get('symbol'), 40) || 'Chart',
    intervalLabel: clean(q.get('interval'), 10),
    author: clean(q.get('author'), 60),
    createdAt: new Date().toISOString(),
    tzOffsetMin: Number.isFinite(tz) && Math.abs(tz) <= 14 * 60 ? tz : 0,
  };

  const id = crypto.randomBytes(9).toString('hex');
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  await fs.writeFile(path.join(SNAPSHOT_DIR, `${id}.png`), bytes);
  await fs.writeFile(path.join(SNAPSHOT_DIR, `${id}.json`), JSON.stringify(meta));
  return NextResponse.json({ id });
}

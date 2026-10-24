import { NextResponse } from 'next/server';
import { readSnapshotImage } from '@/app/lib/snapshotStore';
import { reportServerFailure } from '@/lib/requestTracker';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await readSnapshotImage(id);
  if (!image) {
    reportServerFailure({ path: `/api/snapshots/${id}`, method: 'GET', status_code: 404, reason_code: 'snapshot_not_found', reason_message: `Snapshot ${id} not found` });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(image), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}

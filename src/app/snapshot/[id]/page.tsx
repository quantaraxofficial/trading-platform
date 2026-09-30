import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readSnapshotMeta } from '@/app/lib/snapshotStore';
import SnapshotActions from './SnapshotActions';
import { TrendingUp } from 'lucide-react';

// Public page a chart snapshot opens on ("Open in new tab" / "Copy link" in the chart's
// Snapshot menu): branded header with Copy link + Launch chart, the image beneath it.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const meta = await readSnapshotMeta(id);
  if (!meta) return { title: 'Snapshot not found' };
  const title = `${meta.symbol} Chart Image${meta.author ? ` by ${meta.author}` : ''}`;
  return { title, openGraph: { title, images: [`/api/snapshots/${id}`] } };
}

function formatCreated(iso: string, tzOffsetMin: number): string {
  // Shift to the creator's local clock, then print it as if it were UTC
  const d = new Date(new Date(iso).getTime() + tzOffsetMin * 60000);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const pad = (n: number) => String(n).padStart(2, '0');
  const sign = tzOffsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(tzOffsetMin);
  const off = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? ':' + pad(abs % 60) : ''}`;
  return `${month} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} ${off}`;
}

export default async function SnapshotPage({ params }: Params) {
  const { id } = await params;
  const meta = await readSnapshotMeta(id);
  if (!meta) notFound();

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <header style={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(90deg,#a855f7,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={22} color="#fff" />
          </div>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px' }}>TradePilot</span>
        </div>
        <SnapshotActions symbol={meta.symbol} />
      </header>

      <main style={{ flex: 1, padding: '0 55px 24px' }}>
        <div style={{ background: '#fff', color: '#131722', maxWidth: 1800, margin: '0 auto' }}>
          <div style={{ padding: '8px 10px 4px', fontSize: 12 }}>
            {meta.author ? `${meta.author} created with TradePilot` : 'Created with TradePilot'}, {formatCreated(meta.createdAt, meta.tzOffsetMin)}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/snapshots/${id}`} alt={`${meta.symbol} chart`} style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>
      </main>
    </div>
  );
}

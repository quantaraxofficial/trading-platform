'use client';

import { useState } from 'react';
import { Link2, ChartNoAxesCombined } from 'lucide-react';

// The two buttons at the right of the snapshot page's header
export default function SnapshotActions({ symbol }: { symbol: string }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', window.location.href);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        onClick={copyLink}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#fff', fontSize: 15, cursor: 'pointer', padding: '8px 14px' }}
      >
        <Link2 size={18} />
        {copied ? 'Link copied' : 'Copy link'}
      </button>
      <a
        href={`/?symbol=${encodeURIComponent(symbol)}`}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', color: '#131722', fontSize: 15, fontWeight: 500, padding: '10px 18px', borderRadius: 6, textDecoration: 'none' }}
      >
        <ChartNoAxesCombined size={18} />
        Launch {symbol.replace('/', '')} chart
      </a>
    </div>
  );
}

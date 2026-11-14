import { Metadata } from 'next';
import ChartApp from '../ChartApp';
import { peopleIn, whatIsShared, type InviteRoom } from '../lib/collab/invite';

// The chart (the site's home page is at /, from where people come here)
const BASE: Metadata = { title: 'Chart' };

// A collab link (?collab=<token>) shows, where it's pasted (WhatsApp, Telegram…), who invites,
// what's shared and how many are in it (backend collab_preview: public, ended collabs not found)
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }): Promise<Metadata> {
  const token = (await searchParams).collab;
  if (typeof token !== 'string' || !/^[\w-]{4,32}$/.test(token)) return BASE;
  const backend = ((typeof window === 'undefined' && process.env.BACKEND_URL) || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
  try {
    const res = await fetch(`${backend}/api/users/collab/preview/${encodeURIComponent(token)}/`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!res.ok) return BASE;
    const d: InviteRoom & { owner_name: string; people: number } = await res.json();
    const title = `${d.owner_name} is inviting you to collab on TradePilot`;
    const description = `"${d.name}": ${whatIsShared(d)}. ${peopleIn(d.people)}.`;
    return { title: { absolute: title }, description, openGraph: { title, description, siteName: 'TradePilot', type: 'website' }, twitter: { card: 'summary', title, description } };
  } catch {
    return BASE;
  }
}

export default function Page() {
  return <ChartApp />;
}

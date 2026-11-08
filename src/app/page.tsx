import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import LandingPage from './components/external/LandingPage';

export const metadata: Metadata = {
  title: { absolute: 'TradePilot | Professional Trading Made Simple' },
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(x => qs.append(k, x));
    else if (v !== undefined) qs.append(k, v);
  }
  if (qs.toString()) redirect(`/chart?${qs.toString()}`);
  return <LandingPage />;
}

import { Metadata } from 'next';
import AnalyticsApp from './AnalyticsApp';

export const metadata: Metadata = {
  title: 'Analytics',   // (the layout adds " | TradePilot")
};

export default function Page() {
  return <AnalyticsApp />;
}

import { Metadata } from 'next';
import AnalyticsApp from './AnalyticsApp';

export const metadata: Metadata = {
  title: 'Analytics | TradePilot',
};

export default function Page() {
  return <AnalyticsApp />;
}

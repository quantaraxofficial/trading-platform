import { Metadata } from 'next';
import CommunityApp from './CommunityApp';

export const metadata: Metadata = {
  title: 'Community | TradePilot',
};

export default function Page() {
  return <CommunityApp />;
}

import { Metadata } from 'next';
import Reels from '../community/Reels';

export const metadata: Metadata = {
  title: 'Reels | TradePilot',
};

export default function Page() {
  return <Reels />;
}

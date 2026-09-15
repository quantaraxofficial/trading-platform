import { Metadata } from 'next';
import ProfilePage from '../components/external/ProfilePage';

export const metadata: Metadata = {
  title: 'Trader Profile | TradePilot',
};

export default function Page() {
  return <ProfilePage />;
}

import { Metadata } from 'next';
import ProfileView from '../../community/ProfileView';

export const metadata: Metadata = {
  title: 'Profile | TradePilot',
};

export default function Page() {
  return <ProfileView />;
}

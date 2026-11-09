import { Metadata } from 'next';
import ProfilePage from '../components/external/ProfilePage';

export const metadata: Metadata = {
  title: 'Profile',
};

export default function Page() {
  return <ProfilePage />;
}

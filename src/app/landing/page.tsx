import { Metadata } from 'next';
import LandingPage from '../components/external/LandingPage';

export const metadata: Metadata = {
  title: 'TradePilot | Professional Trading Made Simple',
};

export default function Page() {
  return <LandingPage />;
}

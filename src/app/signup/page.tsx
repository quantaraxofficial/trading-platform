import { Metadata } from 'next';
import SignupPage from '../components/external/SignupPage';

export const metadata: Metadata = {
  title: 'Create Account | TradePilot',
};

export default function Page() {
  return <SignupPage />;
}

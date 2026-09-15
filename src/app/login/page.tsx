import { Metadata } from 'next';
import LoginPage from '../components/external/LoginPage';

export const metadata: Metadata = {
  title: 'Login | TradePilot',
};

export default function Page() {
  return <LoginPage />;
}

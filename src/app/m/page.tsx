import { Metadata, Viewport } from 'next';
import MobileApp from '../mobile/MobileApp';

// The mobile terminal: phones only, for the accounts with unlimited access (see mobile/MobileApp)
export const metadata: Metadata = {
  title: 'Terminal',
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, themeColor: '#000000',
};

export default function Page() {
  return <MobileApp />;
}

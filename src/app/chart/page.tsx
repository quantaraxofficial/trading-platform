import { Metadata } from 'next';
import ChartApp from '../ChartApp';

// The chart (the site's home page is at /, from where people come here)
export const metadata: Metadata = {
  title: 'Chart',
};

export default function Page() {
  return <ChartApp />;
}

import { redirect } from 'next/navigation';

// The home page moved to /
export default function Page() {
  redirect('/');
}

import { Metadata } from 'next';
import PostPage from '../../community/PostPage';

export const metadata: Metadata = {
  title: 'Post | TradePilot',
};

export default function Page() {
  return <PostPage />;
}

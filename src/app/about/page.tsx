import { redirect } from 'next/navigation';

// About us is a section of the home page now (components/external/AboutSection): old links land there
export default function AboutPage() {
  redirect('/#about');
}

import { Metadata } from 'next';
import SiteNav from '../components/external/SiteNav';
import SiteFooter from '../components/external/SiteFooter';
import FaqApp from './FaqApp';
import { FAQ } from '../lib/faq';

export const metadata: Metadata = {
  title: 'Questions & answers',
  description: 'Answers about TradePilot: charts and drawings, bar replay and backtesting, paper trading, collab, the voice assistant, analytics and your account.',
  alternates: { canonical: '/faq' },
};

// The questions as structured data, so search engines can show them (schema.org FAQPage)
const FAQ_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.join(' ') } })),
};

export default function FaqPage() {
  return (
    <div data-site-page className="min-h-screen relative text-white" style={{ backgroundColor: '#0f172a', overflow: 'clip', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', backgroundColor: 'rgba(139, 92, 246, 0.3)', filter: 'blur(120px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '30%', right: '-10%', width: '40%', height: '40%', backgroundColor: 'rgba(99, 102, 241, 0.22)', filter: 'blur(120px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD).replace(/</g, '\\u003c') }} />
      <SiteNav active="/faq" />
      <header className="relative mx-auto max-w-3xl px-6 pt-14 pb-8 text-center" style={{ zIndex: 10 }}>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          Questions &amp; <span style={{ background: 'linear-gradient(to right, #a78bfa, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>answers</span>
        </h1>
        <p className="mt-4 text-lg text-slate-400">Everything about the chart, replay and backtesting, collab, the voice assistant and your account.</p>
      </header>
      <FaqApp />
      <SiteFooter />
    </div>
  );
}

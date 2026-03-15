import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import Pricing from '@/components/landing/Pricing';
import Testimonials from '@/components/landing/Testimonials';
import HowItWorks from '@/components/landing/HowItWorks';
import FAQ from '@/components/landing/FAQ';
import Footer from '@/components/landing/Footer';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://flacroncv-web.onrender.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Build Your Perfect CV with AI | FlacronCV',
    description:
      'Create ATS-optimized CVs and cover letters in minutes using AI. Professional templates, PDF & DOCX export, multilingual support. Free to start — no credit card required.',
    keywords: [
      'CV builder',
      'resume builder',
      'AI CV',
      'cover letter generator',
      'ATS optimization',
      'PDF resume',
      'free CV builder',
      'professional CV templates',
    ],
    openGraph: {
      title: 'Build Your Perfect CV with AI | FlacronCV',
      description:
        'Create ATS-optimized CVs and cover letters in minutes. Free templates, PDF & DOCX export, 6 languages supported.',
      type: 'website',
      url: `${SITE_URL}/${locale}`,
      siteName: 'FlacronCV',
      images: [
        {
          url: `${SITE_URL}/og.png`,
          width: 1200,
          height: 630,
          alt: 'FlacronCV – AI-Powered CV & Cover Letter Builder',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Build Your Perfect CV with AI | FlacronCV',
      description:
        'Create ATS-optimized CVs and cover letters in minutes. Free to start.',
      images: [`${SITE_URL}/og.png`],
    },
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
    },
  };
}

// FAQ structured data (English — primary crawl language)
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is FlacronCV really free?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes! The Free plan lets you create up to 5 CVs, 1 cover letter, use 5 AI credits/month, and export up to 2 documents/month as PDF — no credit card required. Upgrade to Pro for 10 CVs, 20 cover letters, 100 AI credits, unlimited exports, and DOCX format.',
      },
    },
    {
      '@type': 'Question',
      name: 'What export formats are supported?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'All plans support PDF export. Pro and Enterprise plans also unlock DOCX (Microsoft Word) format. The Free plan includes 2 exports/month; Pro and Enterprise offer unlimited exports.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does the AI writing work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Our AI analyzes your experience and the job description to generate tailored content. It uses advanced language models to create professional, impactful bullet points, summaries, and cover letters.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is my data secure?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. All data is encrypted in transit (TLS) and at rest (AES-256). We are GDPR compliant, we never sell your data to third parties, and you can request complete deletion of your account and all associated files at any time from your account settings.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I cancel my subscription anytime?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, you can cancel anytime from your billing settings — no questions asked. Your subscription stays active until the end of the current billing period, and you will not be charged again.',
      },
    },
    {
      '@type': 'Question',
      name: 'What languages are supported?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'FlacronCV currently supports English, Spanish, French, German, Arabic, and Urdu — for both the app interface and your CV content. More languages (including Portuguese, Italian, and Chinese) are coming soon.',
      },
    },
  ],
};

export default function LandingPage(): React.JSX.Element {
  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />
      <Testimonials />
      <Pricing />
      <FAQ />
      <Footer />
    </main>
  );
}

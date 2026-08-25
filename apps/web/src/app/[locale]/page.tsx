import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import Pricing from '@/components/landing/Pricing';
import HowItWorks from '@/components/landing/HowItWorks';
import FAQ from '@/components/landing/FAQ';
import Footer from '@/components/landing/Footer';
import JsonLd from '@/components/seo/JsonLd';
import { SITE_URL, localizedAlternates } from '@/lib/seo';
import { faqPage, organizationAndWebsite, softwareApplication } from '@/lib/json-ld';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    // Bare title — the root layout template appends " | FlacronCV".
    title: 'Build Your Perfect CV with AI',
    description:
      'Draft a CV with AI from templates built so applicant tracking systems can read your details. Edit every line, export to PDF or Word. Free to start — no card required.',
    keywords: [
      'CV builder',
      'resume builder',
      'AI CV',
      'cover letter generator',
      'applicant tracking systems',
      'PDF resume',
      'free CV builder',
      'professional CV templates',
    ],
    openGraph: {
      title: 'Build Your Perfect CV with AI | FlacronCV',
      description:
        'AI-drafted CVs with templates built to be parsed cleanly. Edit every line, export to PDF or Word. Six languages.',
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
        'Draft your CV with AI. Templates use clear structure so tracking systems can read the text. Free to start.',
      images: [`${SITE_URL}/og.png`],
    },
    alternates: localizedAlternates('', locale),
  };
}

export default function LandingPage({
  params: { locale },
}: {
  params: { locale: string };
}): React.JSX.Element | null {
  return (
    <main id="main-content" className="min-h-screen">
      <JsonLd data={organizationAndWebsite(locale)} />
      <JsonLd data={softwareApplication()} />
      <JsonLd data={faqPage()} />
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />
      {/* Testimonials intentionally hidden until real, verifiable customer
          testimonials are collected — do not re-enable with placeholder data. */}
      <Pricing />
      <FAQ />
      <Footer />
    </main>
  );
}

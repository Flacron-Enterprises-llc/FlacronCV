import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Navbar from '@/components/landing/Navbar';
import HeroV2 from '@/components/landing/HeroV2';
import HomeMarquee from '@/components/landing/HomeMarquee';
import ProductShowcase from '@/components/landing/ProductShowcase';
import TemplateShowcase from '@/components/landing/TemplateShowcase';
import Features from '@/components/landing/Features';
import Pricing from '@/components/landing/Pricing';
import CareerAddonTeaser from '@/components/landing/CareerAddonTeaser';
import HowItWorks from '@/components/landing/HowItWorks';
import FAQ from '@/components/landing/FAQ';
import Footer from '@/components/landing/Footer';
import JsonLd from '@/components/seo/JsonLd';
import { SITE_URL, localizedAlternates } from '@/lib/seo';
import { faqPage, organizationAndWebsite, softwareApplication } from '@/lib/json-ld';
import '@/styles/home-theme.css';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'meta' });
  const title = t('home_title');
  const description = t('home_description');
  const ogTitle = t('home_og_title');
  const ogDescription = t('home_og_description');
  const twitterDescription = t('home_twitter_description');
  const ogAlt = t('home_og_alt');
  return {
    // Bare title — the root layout template appends " | FlacronCV".
    title,
    description,
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
      title: ogTitle,
      description: ogDescription,
      type: 'website',
      url: `${SITE_URL}/${locale}`,
      siteName: 'FlacronCV',
      images: [
        {
          url: `${SITE_URL}/og.png`,
          width: 1200,
          height: 630,
          alt: ogAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: twitterDescription,
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
    <main id="main-content" className="fc-home min-h-screen">
      <JsonLd data={organizationAndWebsite(locale)} />
      <JsonLd data={softwareApplication()} />
      <JsonLd data={faqPage()} />
      <Navbar logoVariant="auto" />
      <HeroV2 />
      <HomeMarquee />
      <ProductShowcase />
      <HowItWorks />
      <Features />
      <TemplateShowcase />
      {/* Testimonials intentionally hidden until real, verifiable customer
          testimonials are collected — do not re-enable with placeholder data. */}
      <Pricing />
      {/* Career add-on note (only with the career build switch); V1's plan cards are unchanged. */}
      <CareerAddonTeaser />
      <FAQ />
      <Footer logoVariant="auto" />
    </main>
  );
}

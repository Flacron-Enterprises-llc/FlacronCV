import type { Metadata } from 'next';
import { Inter, Merriweather, Playfair_Display, Roboto, Lora, Open_Sans, Montserrat } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { AuthProvider } from '@/providers/AuthProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import LoadingBar from '@/components/shared/LoadingBar';
import CookieConsent from '@/components/shared/CookieConsent';
import AnalyticsProvider from '@/providers/AnalyticsProvider';
import { Toaster } from 'sonner';
import { SITE_URL } from '@/lib/seo';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const merriweather = Merriweather({ weight: ['300', '400', '700'], subsets: ['latin'], variable: '--font-merriweather' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' });
const roboto = Roboto({ weight: ['300', '400', '500', '700'], subsets: ['latin'], variable: '--font-roboto' });
const lora = Lora({ subsets: ['latin'], variable: '--font-lora' });
const openSans = Open_Sans({ subsets: ['latin'], variable: '--font-opensans' });
const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-montserrat' });

const RTL_LOCALES = ['ar', 'ur'];

// Applies the saved theme before first paint so dark-mode users never see a
// flash of the light theme. Must stay in sync with ThemeProvider's storage key.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})()`;

export const metadata: Metadata = {
  title: {
    default: 'FlacronCV – AI-Powered CV & Cover Letter Builder',
    template: '%s | FlacronCV',
  },
  description:
    'AI CV and cover-letter builder. Templates use standard headings and readable structure. How any one applicant tracking system interprets a CV is outside our control.',
  keywords: [
    'CV builder',
    'resume builder',
    'cover letter generator',
    'AI CV',
    'applicant tracking systems',
    'professional CV',
    'job application',
    'free resume builder',
  ],
  // SITE_URL is already imported above. This line re-implemented it instead,
  // keeping a second copy of the fallback — so seo.ts and the metadataBase
  // could disagree about the site's own origin, and fixing one left the other
  // pointing at the dead Render host.
  metadataBase: new URL(SITE_URL),
  // Site-wide social-card defaults; per-page metadata overrides these.
  openGraph: {
    type: 'website',
    siteName: 'FlacronCV',
    images: [
      { url: '/og.png', width: 1200, height: 630, alt: 'FlacronCV – AI-Powered CV & Cover Letter Builder' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
    other: [
      { rel: 'manifest', url: '/site.webmanifest' },
    ],
  },
};

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();
  const t = await getTranslations();
  const dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body suppressHydrationWarning className={`${inter.variable} ${merriweather.variable} ${playfair.variable} ${roboto.variable} ${lora.variable} ${openSans.variable} ${montserrat.variable} font-sans antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
        >
          {t('common.skip_to_content')}
        </a>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            <ThemeProvider>
              <AuthProvider>
                <AnalyticsProvider>
                  <LoadingBar />
                  {children}
                  <Toaster position="bottom-right" richColors />
                  <CookieConsent />
                </AnalyticsProvider>
              </AuthProvider>
            </ThemeProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Link } from '@/i18n/routing';
import { Home } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import { AuthBottomWave } from '@/components/auth/AuthArt';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('not_found');
  return {
    title: t('title'),
    description: t('desc'),
    // No robots entry: Next already injects <meta name="robots" content="noindex">
    // into every 404 response, and a second, different robots tag here gave
    // crawlers two conflicting directives. No canonical either: a 404 is not a
    // document with a preferred URL.
  };
}

export default async function NotFound() {
  const t = await getTranslations('not_found');
  const tNav = await getTranslations();

  const link = 'rounded text-sm font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-400';
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-stone-950">
      <main id="main-content" className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
        <Link href="/" className="mb-10 inline-flex items-center">
          <Logo className="h-10" priority />
        </Link>

        <p
          className="select-none bg-gradient-to-br from-navy via-navy to-brand-600 bg-clip-text text-[7rem] font-black leading-none tracking-tighter text-transparent sm:text-[9rem] dark:from-white dark:via-stone-300 dark:to-brand-500"
          aria-hidden="true"
        >
          404
        </p>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-navy dark:text-white">{t('title')}</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-stone-600 dark:text-stone-400">{t('desc')}</p>

        <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Link href="/" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950">
            <Home className="h-5 w-5" aria-hidden="true" />
            {t('btn_home')}
          </Link>
          <Link href="/templates" className="inline-flex h-12 items-center justify-center rounded-full border border-stone-300 bg-white px-7 text-[15px] font-semibold text-stone-800 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800 dark:focus-visible:ring-offset-stone-950">
            {t('browse_templates')}
          </Link>
        </div>

        <nav className="mt-12" aria-label={t('looking_for')}>
          <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">{t('looking_for')}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link href="/templates" className={link}>{tNav('nav.templates')}</Link>
            <Link href="/about-us" className={link}>{tNav('footer.about')}</Link>
            <Link href="/contact-us" className={link}>{tNav('footer.contact')}</Link>
            <Link href="/login" className={link}>{tNav('nav.login')}</Link>
          </div>
        </nav>
      </main>
      <AuthBottomWave className="block h-14 w-full shrink-0" />
    </div>
  );
}

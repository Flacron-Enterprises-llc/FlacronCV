import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Link } from '@/i18n/routing';
import Button from '@/components/ui/Button';
import { Home } from 'lucide-react';
import Logo from '@/components/ui/Logo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('not_found');
  return {
    title: t('title'),
    description: t('desc'),
    robots: { index: false, follow: true },
    // No canonical: a 404 is not a document with a preferred URL. Indexing it
    // at all is the defect; noindex is the fix.
  };
}

export default async function NotFound() {
  const t = await getTranslations('not_found');
  const tNav = await getTranslations();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 dark:bg-black">
      <div className="text-center">
        {/* Logo */}
        <Link href="/" className="mb-8 inline-flex items-center">
          <Logo className="h-9" />
        </Link>

        {/* 404 graphic */}
        <div className="mb-6">
          <p className="text-9xl font-black tracking-tight text-stone-100 dark:text-stone-800">
            404
          </p>
          <div className="-mt-8 flex justify-center">
            <div className="rounded-2xl bg-brand-600 px-6 py-2">
              <h1 className="text-lg font-bold text-white">{t('title')}</h1>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-sm text-stone-500 dark:text-stone-400">{t('desc')}</p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/">
            <Button variant="primary" size="lg" icon={<Home className="h-5 w-5" />}>
              {t('btn_home')}
            </Button>
          </Link>
          <Link href="/templates">
            <Button variant="secondary" size="lg">
              {t('browse_templates')}
            </Button>
          </Link>
        </div>

        {/* Helpful links */}
        <div className="mt-12">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
            {t('looking_for')}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link href="/templates" className="text-sm text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400">{tNav('nav.templates')}</Link>
            <Link href="/about-us" className="text-sm text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400">{tNav('footer.about')}</Link>
            <Link href="/contact-us" className="text-sm text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400">{tNav('footer.contact')}</Link>
            <Link href="/login" className="text-sm text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400">{tNav('nav.login')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

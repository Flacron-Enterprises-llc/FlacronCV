import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { Link } from '@/i18n/routing';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';
import Button from '@/components/ui/Button';
import { ArrowRight, Sparkles } from 'lucide-react';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('testimonials_page');
  return pageMetadata({ locale, path: '/testimonials', title: t('title'), description: t('subtitle') });
}

export default async function TestimonialsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations('testimonials_page');
  const tNav = await getTranslations();

  return (
    <>
      <JsonLd data={pageBreadcrumbs(locale, tNav('nav.home'), t('title'), '/testimonials')} />
      {/* Hero */}
      <section className="border-b border-stone-200 bg-gradient-to-b from-stone-50 to-white dark:border-stone-800 dark:from-stone-900 dark:to-black">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
            {t('subtitle')}
          </p>
        </div>
      </section>

      {/* Honest "no fabricated testimonials yet" state */}
      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-stone-200 bg-white p-10 text-center dark:border-stone-800 dark:bg-stone-900">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <Sparkles className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold text-stone-900 dark:text-white">
            {t('empty_title')}
          </h2>
          <p className="max-w-xl text-stone-600 dark:text-stone-400">
            {t('empty_desc')}
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-stone-200 bg-gradient-to-br from-brand-600 to-brand-700 dark:border-stone-800">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">
            {t('cta_title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-50">
            {t('cta_desc')}
          </p>
          <div className="mt-8">
            <Link href="/register">
              <Button
                size="lg"
                icon={<ArrowRight className="h-5 w-5 rtl:rotate-180" />}
                className="bg-white text-brand-700 hover:bg-brand-50"
              >
                {t('cta_btn')}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

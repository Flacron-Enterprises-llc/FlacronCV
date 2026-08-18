import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { FileText } from 'lucide-react';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('terms');
  return pageMetadata({ locale, path: '/terms-of-service', title: t('title'), description: t('intro') });
}

export default async function TermsOfServicePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations('terms');
  const tNav = await getTranslations();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <JsonLd data={pageBreadcrumbs(locale, tNav('nav.home'), t('title'), '/terms-of-service')} />
      {/* Header */}
      <div className="mb-10 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
          <FileText className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-stone-900 dark:text-white">{t('title')}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('last_updated')}</p>
        </div>
      </div>

      <div className="space-y-2 text-stone-600 dark:text-stone-400">
        <p>{t('intro')}</p>
      </div>

      <hr className="my-8 border-stone-200 dark:border-stone-800" />

      <div className="space-y-8">
        <Section title={t('s1_title')}>
          <p>{t('s1_desc')}</p>
        </Section>

        <Section title={t('s2_title')}>
          <p>{t('s2_desc')}</p>
        </Section>

        <Section title={t('s3_title')}>
          <p>{t('s3_intro')}</p>
          <ul className="mt-2 space-y-1 ps-5">
            {[t('s3_1'), t('s3_2'), t('s3_3'), t('s3_4'), t('s3_5')].map((item, i) => (
              <li key={i} className="list-disc text-sm">
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('s4_title')}>
          <p>{t('s4_desc')}</p>
        </Section>

        <Section title={t('s5_title')}>
          <p>{t('s5_desc')}</p>
        </Section>

        <Section title={t('s6_title')}>
          <p>{t('s6_desc')}</p>
        </Section>

        <Section title={t('s7_title')}>
          <p>{t('s7_desc')}</p>
        </Section>

        <Section title={t('s8_title')}>
          <p>{t('s8_desc')}</p>
        </Section>

        <Section title={t('s9_title')}>
          <p>{t('s9_desc')}</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
      <h2 className="mb-3 text-lg font-bold text-stone-900 dark:text-white">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
        {children}
      </div>
    </section>
  );
}

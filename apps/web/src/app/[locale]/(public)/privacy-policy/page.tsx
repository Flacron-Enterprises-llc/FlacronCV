import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { Shield } from 'lucide-react';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('privacy');
  return pageMetadata({ locale, path: '/privacy-policy', title: t('title'), description: t('intro') });
}

export default async function PrivacyPolicyPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations('privacy');
  const tNav = await getTranslations();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <JsonLd data={pageBreadcrumbs(locale, tNav('nav.home'), t('title'), '/privacy-policy')} />
      {/* Header */}
      <div className="mb-10 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-stone-900 dark:text-white">{t('title')}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('last_updated')}</p>
        </div>
      </div>

      <div className="prose prose-stone max-w-none dark:prose-invert">
        <p className="lead text-stone-600 dark:text-stone-400">{t('intro')}</p>

        <hr className="my-8 border-stone-200 dark:border-stone-800" />

        <Section title={t('s1_title')}>
          <ul>
            <li>{t('s1_account')}</li>
            <li>{t('s1_content')}</li>
            <li>{t('s1_usage')}</li>
            <li>{t('s1_cookies')}</li>
          </ul>
        </Section>

        <Section title={t('s2_title')}>
          <p>{t('s2_use_intro')}</p>
          <ul>
            <li>{t('s2_provide')}</li>
            <li>{t('s2_improve')}</li>
            <li>{t('s2_communicate')}</li>
            <li>{t('s2_security')}</li>
            <li>{t('s2_legal')}</li>
          </ul>
        </Section>

        <Section title={t('s3_title')}>
          <p>{t('s3_desc')}</p>
        </Section>

        <Section title={t('s4_title')}>
          <p>{t('s4_desc')}</p>
        </Section>

        <Section title={t('s5_title')}>
          <ul>
            <li>{t('s5_access')}</li>
            <li>{t('s5_correct')}</li>
            <li>{t('s5_delete')}</li>
            <li>{t('s5_portability')}</li>
          </ul>
          <p>{t('s5_contact')}</p>
        </Section>

        <Section title={t('s6_title')}>
          <p>{t('s6_desc')}</p>
        </Section>

        <Section title={t('s7_title')}>
          <p>{t('s7_desc')}</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-bold text-stone-900 dark:text-white">{title}</h2>
      <div className="space-y-3 text-stone-600 dark:text-stone-400">{children}</div>
    </section>
  );
}

import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { Cookie } from 'lucide-react';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('cookies_policy');
  return pageMetadata({ locale, path: '/cookie-policy', title: t('title'), description: t('intro') });
}

export default async function CookiePolicyPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations('cookies_policy');
  const tNav = await getTranslations();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <JsonLd data={pageBreadcrumbs(locale, tNav('nav.home'), t('title'), '/cookie-policy')} />
      {/* Header */}
      <div className="mb-10 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
          <Cookie className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-stone-900 dark:text-white">{t('title')}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('last_updated')}</p>
        </div>
      </div>

      <p className="mb-8 text-stone-600 dark:text-stone-400">{t('intro')}</p>

      <div className="space-y-6">
        <Section title={t('s1_title')}>
          <p>{t('s1_desc')}</p>
        </Section>

        <Section title={t('s2_title')}>
          <div className="space-y-4">
            <CookieType
              title={t('s2_essential_title')}
              desc={t('s2_essential_desc')}
              examples={t('s2_essential_examples')}
              required
              requiredLabel={t('required')}
            />
            <CookieType
              title={t('s2_preference_title')}
              desc={t('s2_preference_desc')}
              examples={t('s2_preference_examples')}
            />
            <CookieType
              title={t('s2_analytics_title')}
              desc={t('s2_analytics_desc')}
              examples={t('s2_analytics_examples')}
            />
          </div>
        </Section>

        <Section title={t('s3_title')}>
          <p>{t('s3_desc')}</p>
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
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-bold text-stone-900 dark:text-white">{title}</h2>
      <div className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">{children}</div>
    </section>
  );
}

function CookieType({
  title,
  desc,
  examples,
  required,
  requiredLabel,
}: {
  title: string;
  desc: string;
  examples: string;
  required?: boolean;
  requiredLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-semibold text-stone-900 dark:text-white">{title}</h3>
        {required && (
          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            {requiredLabel}
          </span>
        )}
      </div>
      <p className="text-sm text-stone-600 dark:text-stone-400">{desc}</p>
      <p className="mt-2 text-xs italic text-stone-400 dark:text-stone-500">{examples}</p>
    </div>
  );
}

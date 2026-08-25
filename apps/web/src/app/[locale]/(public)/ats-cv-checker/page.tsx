import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { Link } from '@/i18n/routing';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';
import Button from '@/components/ui/Button';
import Pricing from '@/components/landing/Pricing';
import { ATS_CV_CHECKER, ATS_CV_CHECKER_PATH } from '@/content/ats-cv-checker';
import { Percent, List, Pencil, ArrowRight } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    locale: 'en',
    path: ATS_CV_CHECKER_PATH,
    title: ATS_CV_CHECKER.title,
    description: ATS_CV_CHECKER.subtitle,
    englishDocument: true,
  });
}

function CopyCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <h3 className="font-semibold text-stone-900 dark:text-white">{title}</h3>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{desc}</p>
      </div>
    </div>
  );
}

export default async function AtsCvCheckerPage() {
  const tNav = await getTranslations();
  const copy = ATS_CV_CHECKER;

  return (
    <>
      <JsonLd data={pageBreadcrumbs('en', tNav('nav.home'), copy.title, ATS_CV_CHECKER_PATH)} />

      <section className="border-b border-stone-200 bg-gradient-to-b from-brand-50 to-white dark:border-stone-800 dark:from-stone-900 dark:to-black">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl">
            {copy.hero_title}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
            {copy.hero_desc}
          </p>
          <div className="mt-8">
            <Link href="/register">
              <Button size="lg" icon={<ArrowRight className="h-5 w-5 rtl:rotate-180" />}>
                {copy.cta_btn}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-black">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-center text-2xl font-bold text-stone-900 dark:text-white">
            {copy.limit_title}
          </h2>
          <p className="text-center text-stone-600 dark:text-stone-400">{copy.limit_desc}</p>
        </div>
      </section>

      <section className="border-b border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="mb-2 text-center text-2xl font-bold text-stone-900 dark:text-white">
            {copy.mid_title}
          </h2>
          <p className="mb-10 text-center text-stone-500 dark:text-stone-400">{copy.mid_subtitle}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <CopyCard icon={Percent} title={copy.mid1_title} desc={copy.mid1_desc} />
            <CopyCard icon={List} title={copy.mid2_title} desc={copy.mid2_desc} />
            <CopyCard icon={Pencil} title={copy.mid3_title} desc={copy.mid3_desc} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="mb-4 text-center text-2xl font-bold text-stone-900 dark:text-white">
          {copy.how_title}
        </h2>
        <p className="text-center text-stone-600 dark:text-stone-400">{copy.how_desc}</p>
      </section>

      <section className="border-t border-stone-200 bg-gradient-to-br from-brand-600 to-brand-700 dark:border-stone-800">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">{copy.cta_title}</h2>
          <div className="mt-8">
            <Link href="/register">
              <Button
                size="lg"
                icon={<ArrowRight className="h-5 w-5 rtl:rotate-180" />}
                className="bg-white text-brand-700 hover:bg-brand-50"
              >
                {copy.cta_btn}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-stone-200 bg-white py-12 dark:border-stone-800 dark:bg-stone-950">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-stone-600 dark:text-stone-400">{copy.related_title}</p>
          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-8">
            <Link
              href="/ai-cv-builder"
              locale="en"
              className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              {copy.related_cv_cta}
            </Link>
            <Link
              href="/templates"
              className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              {copy.related_templates_cta}
            </Link>
          </div>
        </div>
      </section>

      <Pricing />
    </>
  );
}

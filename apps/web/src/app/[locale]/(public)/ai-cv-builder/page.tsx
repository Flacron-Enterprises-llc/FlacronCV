import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { Link } from '@/i18n/routing';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';
import Button from '@/components/ui/Button';
import Pricing from '@/components/landing/Pricing';
import FAQ from '@/components/landing/FAQ';
import { AI_CV_BUILDER, AI_CV_BUILDER_PATH } from '@/content/ai-cv-builder';
import {
  FileText,
  List,
  Mail,
  Target,
  LayoutTemplate,
  Sparkles,
  Download,
  ArrowRight,
} from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    locale: 'en',
    path: AI_CV_BUILDER_PATH,
    title: AI_CV_BUILDER.title,
    description: AI_CV_BUILDER.subtitle,
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

export default async function AiCvBuilderPage() {
  const tNav = await getTranslations();
  const copy = AI_CV_BUILDER;

  return (
    <>
      <JsonLd
        data={pageBreadcrumbs('en', tNav('nav.home'), copy.title, AI_CV_BUILDER_PATH)}
      />

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

      <section className="border-b border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="mb-2 text-center text-2xl font-bold text-stone-900 dark:text-white">
            {copy.mid_title}
          </h2>
          <p className="mb-10 text-center text-stone-500 dark:text-stone-400">
            {copy.mid_subtitle}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CopyCard icon={FileText} title={copy.mid1_title} desc={copy.mid1_desc} />
            <CopyCard icon={List} title={copy.mid2_title} desc={copy.mid2_desc} />
            <CopyCard icon={Mail} title={copy.mid3_title} desc={copy.mid3_desc} />
            <CopyCard icon={Target} title={copy.mid4_title} desc={copy.mid4_desc} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="mb-2 text-center text-2xl font-bold text-stone-900 dark:text-white">
          {copy.close_title}
        </h2>
        <p className="mb-10 text-center text-stone-500 dark:text-stone-400">
          {copy.close_subtitle}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <CopyCard icon={LayoutTemplate} title={copy.close1_title} desc={copy.close1_desc} />
          <CopyCard icon={Sparkles} title={copy.close2_title} desc={copy.close2_desc} />
          <CopyCard icon={Download} title={copy.close3_title} desc={copy.close3_desc} />
        </div>
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

      <Pricing />
      <FAQ />
    </>
  );
}

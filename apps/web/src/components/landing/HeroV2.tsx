'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import {
  IconArrowRight,
  IconBriefcase,
  IconChart,
  IconCheck,
  IconDocument,
  IconDownload,
  IconGraduation,
  IconLayers,
  IconSend,
  IconTarget,
  TINT,
  type Tint,
} from './HeroV2Icons';

/**
 * Homepage hero ported from V2 (`apps/web/src/components/public/HomeHero.tsx`).
 *
 * Styling: Tailwind on V1's palette (`career-*` tokens, `brand-*`, `chrome`) plus
 * the `.fc-hero-*` rules at the end of `styles/globals.css` (animation, blobs,
 * portrait fade). Nothing outside this section is restyled.
 *
 * Portrait: client-provided photograph, authorised for the website. Provenance
 * and usage rules: V2 `docs/DESIGN_SYSTEM.md` ("Marketing imagery"). Only the
 * approved cutout derivatives in `public/marketing/` may be used; do not flip,
 * retouch or replace them.
 */

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-stone-950';

type PillarKey =
  | 'pillar_jobs'
  | 'pillar_resume'
  | 'pillar_tailored'
  | 'pillar_growth'
  | 'pillar_tracker'
  | 'pillar_ats';

type Pillar = { key: PillarKey; tint: Tint; Icon: typeof IconBriefcase };

/**
 * "Jobs & Opportunities" and "Career Development" are the career area (opportunity
 * search, learning), which only exists when the career integration is switched
 * on. Without it, those two pillars name features V1 already ships: the job
 * application tracker (/jobs) and the ATS score check.
 *
 * Same build-time switch as `isCareerEnabled()` in components/career/CareerServices,
 * read directly so the homepage bundle does not pull in the career API client.
 */
function careerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CAREER_ENABLED?.trim() === 'true';
}

function pillars(careerOn: boolean): Pillar[] {
  return [
    careerOn
      ? { key: 'pillar_jobs', tint: 'blue', Icon: IconBriefcase }
      : { key: 'pillar_tracker', tint: 'blue', Icon: IconBriefcase },
    { key: 'pillar_resume', tint: 'violet', Icon: IconDocument },
    { key: 'pillar_tailored', tint: 'peach', Icon: IconTarget },
    careerOn
      ? { key: 'pillar_growth', tint: 'teal', Icon: IconGraduation }
      : { key: 'pillar_ats', tint: 'teal', Icon: IconChart },
  ];
}

export default function HeroV2() {
  const t = useTranslations('home_hero');
  const { user } = useAuth();
  // Authenticated users skip the register page and land in the app.
  const primary = user
    ? { href: '/dashboard', label: t('cta_dashboard') }
    : { href: '/register', label: t('cta_start') };

  return (
    <section className="relative overflow-hidden bg-career-canvas pt-16">
      <div
        aria-hidden="true"
        className="fc-hero-blob-blue pointer-events-none absolute -start-40 top-40 h-[28rem] w-[28rem] rounded-full opacity-80"
      />
      <div className="relative mx-auto grid min-w-0 max-w-7xl gap-8 px-4 pt-8 sm:px-6 sm:pt-10 lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)] lg:gap-6 lg:px-8 lg:pt-8">
        <div className="fc-hero-copy min-w-0 lg:self-center lg:pb-12">
          <h1 className="text-[2.25rem] font-extrabold leading-[1.08] tracking-tight text-career-ink sm:text-5xl lg:text-[2.5rem] xl:text-[3.375rem]">
            <span className="block">{t('title_1')}</span>
            <span className="block text-brand-600 dark:text-brand-500">{t('title_2')}</span>
            <span className="block text-brand-600 dark:text-brand-500">{t('title_3')}</span>
          </h1>
          <p className="mt-5 max-w-[34rem] text-base leading-7 text-career-muted sm:text-lg sm:leading-8">{t('lede')}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href={primary.href}
              className={`group inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-md bg-brand-700 px-6 text-base font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-brand-800 motion-reduce:transition-none ${FOCUS}`}
            >
              <span className="min-w-0 truncate">{primary.label}</span>
              <IconArrowRight className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
            </Link>
            <Link
              href="/#pricing"
              className={`inline-flex min-h-[3rem] items-center justify-center rounded-md border border-chrome/50 bg-career-surface px-6 text-base font-semibold text-chrome transition-colors duration-200 hover:bg-career-wash motion-reduce:transition-none dark:border-white/40 dark:text-white dark:hover:bg-white/10 ${FOCUS}`}
            >
              {t('cta_plans')}
            </Link>
          </div>
          <ul
            aria-label={t('pillars_label')}
            className="mt-9 grid max-w-[36rem] grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-[repeat(4,minmax(min-content,1fr))] sm:gap-0 lg:grid-cols-2 lg:gap-x-6 lg:gap-y-5 xl:grid-cols-[repeat(4,minmax(min-content,1fr))] xl:gap-0"
          >
            {pillars(careerEnabled()).map(({ key, tint, Icon }, index) => (
              <li
                key={key}
                className={`flex min-w-0 flex-col gap-2.5 sm:px-4 lg:px-0 xl:px-4 ${index === 0 ? 'sm:ps-0 xl:ps-0' : 'sm:border-s sm:border-career-line lg:border-s-0 xl:border-s'}`}
              >
                <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${TINT[tint]}`}>
                  <Icon className="h-[1.375rem] w-[1.375rem]" />
                </span>
                <span className="text-sm font-semibold leading-5 text-career-ink">{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  const t = useTranslations('home_hero');
  const tJobs = useTranslations('jobs');

  return (
    // Flush with the hero's bottom edge: the waist crop and the peach disc are cut by the same line.
    <div className="fc-hero-media relative mx-auto w-full min-w-0 max-w-[36rem] self-end px-2 sm:px-6">
      <div
        aria-hidden="true"
        className="fc-hero-blob-peach pointer-events-none absolute bottom-[-22%] left-1/2 aspect-square w-[92%] -translate-x-1/2 rounded-full sm:bottom-[-14%] sm:w-[min(100%,34rem)]"
      />
      <div className="fc-hero-portrait relative mx-auto aspect-[3/4] w-[min(72%,17.5rem)] sm:w-[min(80%,26rem)] lg:w-[min(86%,30rem,calc((100vh-8rem)*0.75))]">
        <picture>
          <source
            type="image/webp"
            srcSet="/marketing/client-portrait-cutout-480.webp 480w, /marketing/client-portrait-cutout-720.webp 720w, /marketing/client-portrait-cutout-960.webp 960w"
            sizes="(min-width: 1024px) 30rem, (min-width: 640px) 26rem, 72vw"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- art-directed <picture> with a WebP srcset; next/image cannot express it */}
          <img
            src="/marketing/client-portrait-cutout-720.png"
            alt={t('image_alt')}
            width={720}
            height={960}
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-contain object-bottom"
          />
        </picture>
      </div>

      <div aria-hidden="true" className="pointer-events-none">
        <FloatCard className="bottom-[12%] start-0 w-[9.5rem] sm:bottom-auto sm:top-[9%] sm:w-44 lg:w-40 xl:w-44">
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TINT.violet}`}>
              <IconLayers className="h-5 w-5" />
            </span>
            <p className="text-xs font-semibold text-career-muted">{t('card_templates')}</p>
          </div>
          <p className="mt-2.5 text-sm font-bold text-career-ink">{t('card_templates_cv')}</p>
          <p className="mt-0.5 text-xs text-career-muted">{t('card_templates_letters')}</p>
        </FloatCard>

        <FloatCard className="fc-hero-float-late end-0 top-[33%] hidden w-[11.75rem] sm:block">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TINT.blue}`}>
              <IconSend className="h-5 w-5" />
            </span>
            <p className="min-w-0 text-xs font-semibold leading-4 text-career-muted">{t('card_track')}</p>
          </div>
          {/* Statuses are V1's job-tracker stages (/jobs). Illustration only, labelled as a sample. */}
          <ul className="mt-2.5 space-y-1.5 text-xs">
            <li className="flex items-center gap-2 font-semibold text-career-ink">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#2563eb]" />
              {tJobs('status.wishlist')}
            </li>
            <li className="flex items-center gap-2 font-semibold text-career-ink">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#a8620a]" />
              {tJobs('status.interviewing')}
            </li>
            <li className="flex items-center gap-2 font-semibold text-career-ink">
              <span className="h-2 w-2 shrink-0 rounded-full bg-career-success" />
              {tJobs('status.offer')}
            </li>
          </ul>
          <p className="mt-2.5 inline-flex rounded bg-career-wash px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-career-muted">
            {t('card_sample')}
          </p>
        </FloatCard>

        <FloatCard className="fc-hero-float-later bottom-[14%] start-0 hidden w-44 sm:block">
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TINT.teal}`}>
              <IconDownload className="h-5 w-5" />
            </span>
            <p className="text-xs font-semibold text-career-muted">{t('card_export')}</p>
          </div>
          <ul className="mt-2.5 space-y-1 text-xs font-semibold text-career-ink">
            <li className="flex items-center gap-1.5">
              <IconCheck className="h-4 w-4 shrink-0 text-career-success" />
              {t('export_pdf')}
            </li>
            <li className="flex items-center gap-1.5">
              <IconCheck className="h-4 w-4 shrink-0 text-career-success" />
              {t('export_docx')}
            </li>
          </ul>
        </FloatCard>
      </div>
    </div>
  );
}

function FloatCard({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      className={`fc-hero-float absolute rounded-xl border border-career-line bg-career-surface p-3 shadow-lg backdrop-blur-sm sm:p-3.5 ${className}`}
    >
      {children}
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { useInView } from '@/hooks/useInView';
import { CvThumb } from './showcase/DocumentThumb';
import { IconArrowRight, IconBriefcase, IconCheck, IconDocument, IconSend, TINT, type Tint } from './HeroV2Icons';

/**
 * "Product showcase" ported from V2's HomePreviews (`apps/web/src/components/public/HomePreviews.tsx`),
 * rebuilt on V1 features:
 *  - Resume builder: the real V1 CV layout with sample content, linking to /cv.
 *  - Job tools: V1's ATS check against a pasted job ad. The listings are fictional
 *    and labelled as samples; no job feed is connected, so nothing here is "live".
 *  - Application tracking: V1's Job Tracker (/jobs) stages, with sample counts.
 * Career-only features are mentioned only when the career integration is built in.
 */

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-stone-950';

function careerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CAREER_ENABLED?.trim() === 'true';
}

const EDITOR_SECTIONS = ['personal', 'experience', 'education', 'skills', 'design', 'export'] as const;

const SAMPLE_LISTINGS: Array<{ n: 1 | 2 | 3; initials: string; tint: Tint }> = [
  { n: 1, initials: 'NS', tint: 'blue' },
  { n: 2, initials: 'BH', tint: 'teal' },
  { n: 3, initials: 'LF', tint: 'peach' },
];

/** V1 Job Tracker stages (`JobStatus`), sample counts only. */
const SAMPLE_TRACKER: Array<{ status: 'wishlist' | 'applied' | 'interviewing' | 'offer'; count: number; dot: string }> = [
  { status: 'wishlist', count: 6, dot: 'bg-[#2563eb]' },
  { status: 'applied', count: 4, dot: 'bg-brand-500' },
  { status: 'interviewing', count: 2, dot: 'bg-[#a8620a]' },
  { status: 'offer', count: 1, dot: 'bg-career-success' },
];

export default function ProductShowcase() {
  const t = useTranslations('home_showcase');
  const tJobs = useTranslations('jobs');
  const { user } = useAuth();
  const { ref, isInView } = useInView({ threshold: 0.08 });
  const careerOn = careerEnabled();
  const reveal = `transition-all duration-700 ease-out motion-reduce:transition-none ${
    isInView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
  }`;

  return (
    <section id="product" aria-labelledby="product-title" className="bg-career-canvas py-16 sm:py-20">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`mx-auto max-w-2xl text-center ${reveal}`}>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">{t('product_eyebrow')}</p>
          <h2 id="product-title" className="mt-2 text-3xl font-bold tracking-tight text-career-ink sm:text-4xl">
            {t('product_title')}
          </h2>
          <p className="mt-4 text-base leading-7 text-career-muted">{t('product_lede')}</p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Resume builder */}
          <article className={`flex min-w-0 flex-col rounded-2xl border border-career-line bg-career-surface p-5 shadow-sm md:col-span-2 lg:col-span-1 ${reveal}`}>
            <CardHeading tint="violet" Icon={IconDocument} title={t('resume_title')} body={t('resume_body')} />
            <div className="mt-5 flex-1 overflow-hidden rounded-xl border border-career-line bg-career-wash">
              <p className="border-b border-career-line px-3.5 py-2 text-xs font-semibold text-career-muted">{t('editor_label')}</p>
              <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3 p-3 md:grid-cols-[9rem_minmax(0,15rem)] md:justify-center lg:grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)]">
                <ul className="space-y-1 text-xs" aria-label={t('editor_sections_label')}>
                  {EDITOR_SECTIONS.map((section, index) => (
                    <li
                      key={section}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 font-semibold ${
                        index === 1 ? 'bg-career-orange-tint text-career-orange-text' : 'text-career-muted'
                      }`}
                    >
                      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${index === 1 ? 'bg-brand-500' : 'bg-career-line'}`} />
                      <span className="min-w-0 break-words">{t(`section_${section}`)}</span>
                    </li>
                  ))}
                </ul>
                <div className="min-w-0 self-start overflow-hidden rounded-md border border-career-line shadow-sm">
                  <CvThumb slug="professional" label={t('resume_preview_alt')} />
                </div>
              </div>
            </div>
            <CardLink href={user ? '/cv' : '/register'} label={user ? t('resume_cta_signed_in') : t('resume_cta')} />
          </article>

          {/* Job tools */}
          <article className={`flex min-w-0 flex-col rounded-2xl border border-career-line bg-career-surface p-5 shadow-sm delay-100 ${reveal}`}>
            <CardHeading tint="blue" Icon={IconBriefcase} title={t('jobs_title')} body={t('jobs_body')} />
            <div className="mt-5 flex flex-1 flex-col gap-2.5">
              <SampleBadge>{t('sample_listings')}</SampleBadge>
              <ul className="flex flex-col gap-2.5">
                {SAMPLE_LISTINGS.map((item) => (
                  <li key={item.n} className="flex min-w-0 items-start gap-3 rounded-xl border border-career-line bg-career-canvas p-3">
                    <span aria-hidden="true" className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${TINT[item.tint]}`}>
                      {item.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-5 text-career-ink">{t(`listing_${item.n}_title`)}</p>
                      <p className="text-xs text-career-muted">{t(`listing_${item.n}_org`)}</p>
                      <p className="mt-1.5 text-xs font-medium text-career-muted">{t(`listing_${item.n}_meta`)}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {careerOn ? <p className="text-xs leading-5 text-career-muted">{t('jobs_career_note')}</p> : null}
            </div>
            <CardLink href={user ? '/cv' : '/register'} label={t('jobs_cta')} />
          </article>

          {/* Application tracking */}
          <article className={`flex min-w-0 flex-col rounded-2xl border border-career-line bg-career-surface p-5 shadow-sm delay-200 ${reveal}`}>
            <CardHeading tint="teal" Icon={IconSend} title={t('track_title')} body={t('track_body')} />
            <div className="mt-5 flex flex-1 flex-col gap-2.5">
              <SampleBadge>{t('sample_tracker')}</SampleBadge>
              <ul className="flex flex-col gap-2.5">
                {SAMPLE_TRACKER.map(({ status, count, dot }) => (
                  <li key={status} className="flex items-center gap-3 rounded-xl border border-career-line bg-career-canvas px-3.5 py-3">
                    <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
                    <span className="min-w-0 flex-1 text-sm font-semibold text-career-ink">{tJobs(`status.${status}`)}</span>
                    <span className="text-lg font-bold tabular-nums text-career-ink">{count}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-1 space-y-1 text-xs text-career-muted">
                <li className="flex items-center gap-1.5">
                  <IconCheck className="h-4 w-4 shrink-0 text-career-success" />
                  {t('track_point_notes')}
                </li>
                <li className="flex items-center gap-1.5">
                  <IconCheck className="h-4 w-4 shrink-0 text-career-success" />
                  {t('track_point_stages')}
                </li>
              </ul>
            </div>
            <CardLink href={user ? '/jobs' : '/register'} label={t('track_cta')} />
          </article>
        </div>
      </div>
    </section>
  );
}

function CardHeading({ tint, Icon, title, body }: { tint: Tint; Icon: typeof IconDocument; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3.5">
      <span aria-hidden="true" className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TINT[tint]}`}>
        <Icon className="h-[1.375rem] w-[1.375rem]" />
      </span>
      <div className="min-w-0">
        <h3 className="text-lg font-bold leading-6 text-career-ink">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-career-muted">{body}</p>
      </div>
    </div>
  );
}

function SampleBadge({ children }: { children: string }) {
  return (
    <p className="inline-flex self-start rounded-full bg-career-wash px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-career-muted">
      {children}
    </p>
  );
}

function CardLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`group mt-5 inline-flex min-h-[2.75rem] items-center gap-2 self-start rounded-md text-sm font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300 ${FOCUS}`}
    >
      {label}
      <IconArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
    </Link>
  );
}

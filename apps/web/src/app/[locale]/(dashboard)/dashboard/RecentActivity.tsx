'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { CoverLetter, CV, JobApplication, JobStatus } from '@flacroncv/shared-types';
import { api } from '@/lib/api';
import { Link } from '@/i18n/routing';
import Card from '@/components/ui/Card';
import { formatDate, toDate } from '@/lib/format-date';
import { Briefcase, FileText, Mail, ArrowRight } from 'lucide-react';

/** How many documents the dashboard lists; each list endpoint is asked for this many. */
const RECENT_LIMIT = 4;

/** Job stages worth a glance on the dashboard, in pipeline order. */
const PIPELINE: JobStatus[] = [JobStatus.WISHLIST, JobStatus.APPLIED, JobStatus.INTERVIEWING, JobStatus.OFFER];

type RecentDoc = { id: string; kind: 'cv' | 'cover_letter'; title: string; updatedAt: Date | null };

/**
 * Latest CVs and cover letters plus a job-tracker summary, so the dashboard
 * leads somewhere other than the quick actions. Uses the existing list
 * endpoints with a small limit (both already return newest-first), so it costs
 * two light requests; the jobs list shares the job tracker's cache.
 */
export default function RecentActivity() {
  const t = useTranslations('dashboard');
  const tJobs = useTranslations('jobs');
  const locale = useLocale();

  const cvs = useQuery({
    queryKey: ['dashboard', 'recent-cvs'],
    queryFn: () => api.get<{ items: CV[] }>(`/cvs?limit=${RECENT_LIMIT}`),
    staleTime: 30_000,
  });
  const letters = useQuery({
    queryKey: ['dashboard', 'recent-cover-letters'],
    queryFn: () => api.get<{ items: CoverLetter[] }>(`/cover-letters?limit=${RECENT_LIMIT}`),
    staleTime: 30_000,
  });
  // Same key and endpoint as the job tracker page, so visiting either fills
  // the cache for the other.
  const jobs = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.get<JobApplication[]>('/jobs'),
    staleTime: 30_000,
  });

  const docs: RecentDoc[] = [
    ...(cvs.data?.items ?? []).map((cv) => ({
      id: cv.id,
      kind: 'cv' as const,
      title: cv.title,
      updatedAt: toDate(cv.updatedAt),
    })),
    ...(letters.data?.items ?? []).map((letter) => ({
      id: letter.id,
      kind: 'cover_letter' as const,
      title: letter.title,
      updatedAt: toDate(letter.updatedAt),
    })),
  ]
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    .slice(0, RECENT_LIMIT);

  const docsLoading = cvs.isPending || letters.isPending;
  const docsFailed = cvs.isError && letters.isError;

  const activeJobs = (jobs.data ?? []).filter((job) => !job.archived);
  const countFor = (status: JobStatus) => activeJobs.filter((job) => job.status === status).length;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <h2 className="mb-4 text-lg font-semibold text-stone-900 dark:text-white">{t('recent')}</h2>
        {docsLoading ? (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800" />
            ))}
          </div>
        ) : docsFailed ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">{t('recent_error')}</p>
        ) : docs.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm font-medium text-stone-700 dark:text-stone-300">{t('no_documents')}</p>
            <Link href="/cv/new" className="mt-1 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              {t('start_creating')}
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {docs.map((doc) => {
              const Icon = doc.kind === 'cv' ? FileText : Mail;
              return (
                <li key={`${doc.kind}-${doc.id}`}>
                  <Link
                    href={doc.kind === 'cv' ? `/cv/${doc.id}` : `/cover-letters/${doc.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      {/* dir="auto": a title can be in any script, whatever the UI language. */}
                      <span dir="auto" className="block truncate text-sm font-medium text-stone-900 dark:text-white">
                        {doc.title || t('untitled')}
                      </span>
                      <span className="block text-xs text-stone-500 dark:text-stone-400">
                        {doc.kind === 'cv' ? t('doc_cv') : t('doc_cover_letter')}
                        {doc.updatedAt && ` · ${t('updated_on', { date: formatDate(doc.updatedAt, undefined, locale) })}`}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-stone-400 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-stone-400" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('job_tracker')}</h2>
        </div>
        {jobs.isPending ? (
          <div className="h-24 animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800" aria-hidden="true" />
        ) : jobs.isError ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">{t('jobs_error')}</p>
        ) : activeJobs.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">{t('jobs_empty')}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3">
            {PIPELINE.map((status) => (
              <div key={status} className="rounded-lg bg-stone-50 px-3 py-2 dark:bg-stone-800/60">
                <dt className="truncate text-xs text-stone-500 dark:text-stone-400">{tJobs(`status.${status}`)}</dt>
                <dd className="text-xl font-bold text-stone-900 dark:text-white">{countFor(status)}</dd>
              </div>
            ))}
          </dl>
        )}
        <Link
          href="/jobs"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          {t('jobs_open')}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </Card>
    </div>
  );
}

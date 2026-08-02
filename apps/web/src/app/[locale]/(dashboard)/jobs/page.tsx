'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { formatDate, cn } from '@/lib/utils';
import { toDate } from '@/lib/format-date';
import { buildIcsEvent, downloadIcs } from '@/lib/ics';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import JobFormModal from '@/components/jobs/JobFormModal';
import {
  Plus,
  Briefcase,
  Pencil,
  Trash2,
  ExternalLink,
  AlertCircle,
  MapPin,
  Clock,
  Search,
  Archive,
  Banknote,
  User as UserIcon,
  CalendarClock,
  CalendarPlus,
  BellRing,
} from 'lucide-react';
import { toast } from 'sonner';
import { JobApplication, JobStatus } from '@flacroncv/shared-types';

const STATUS_ORDER: JobStatus[] = [
  JobStatus.WISHLIST,
  JobStatus.APPLIED,
  JobStatus.INTERVIEWING,
  JobStatus.OFFER,
  JobStatus.REJECTED,
  JobStatus.ACCEPTED,
];

const STATUS_VARIANT: Record<JobStatus, 'default' | 'info' | 'warning' | 'brand' | 'danger' | 'success'> = {
  [JobStatus.WISHLIST]: 'default',
  [JobStatus.APPLIED]: 'info',
  [JobStatus.INTERVIEWING]: 'warning',
  [JobStatus.OFFER]: 'brand',
  [JobStatus.REJECTED]: 'danger',
  [JobStatus.ACCEPTED]: 'success',
};

type SortKey = 'updated' | 'applied' | 'company' | 'position' | 'status';

/** Filename-safe fragment of a company or position name. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Epoch millis for any date-ish value; 0 when absent so it sorts last. */
function time(value: unknown): number {
  const d = toDate(value);
  return d ? d.getTime() : 0;
}

const SORTERS: Record<SortKey, (a: JobApplication, b: JobApplication) => number> = {
  // Most recently touched first — the default, matching the API's ordering.
  updated: (a, b) => time(b.updatedAt) - time(a.updatedAt),
  // Newest application first; entries with no applied date sort to the end.
  applied: (a, b) => time(b.appliedDate) - time(a.appliedDate),
  company: (a, b) => a.company.localeCompare(b.company),
  position: (a, b) => a.position.localeCompare(b.position),
  // Pipeline order (wishlist → accepted) rather than alphabetical, which would
  // be meaningless for a funnel.
  status: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
};

export default function JobsPage(): React.JSX.Element | null {
  const t = useTranslations('jobs');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<'all' | JobStatus>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JobApplication | null>(null);

  const { data: jobs, isLoading, isError, refetch } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.get<JobApplication[]>('/jobs'),
    enabled: !!user,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['jobs'] });

  // Archived applications are hidden unless explicitly requested — everything
  // else (counts, search, sort) operates on that same visible set so the tab
  // numbers always describe what the list is actually showing.
  const visible = (jobs ?? []).filter((j) => !!j.archived === showArchived);

  // Per-status counts for the filter tabs.
  const counts = visible.reduce<Record<string, number>>(
    (acc, j) => ({ ...acc, [j.status]: (acc[j.status] ?? 0) + 1 }),
    {},
  );

  const query = search.trim().toLowerCase();
  const filtered = visible
    .filter((j) => filter === 'all' || j.status === filter)
    .filter(
      (j) =>
        !query ||
        [j.company, j.position, j.location, j.notes, j.contactName]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(query)),
    )
    .sort(SORTERS[sort]);

  // Optimistic inline status change: the <select> reflects the new value
  // immediately (writing it into the cache), rolls back on failure, and
  // reconciles with the server on settle — so it never snaps back to the stale
  // value mid-save (R4). The row's select is disabled while its write is in flight.
  const statusMutation = useMutation({
    mutationFn: ({ job, status }: { job: JobApplication; status: JobStatus }) =>
      api.put(`/jobs/${job.id}`, { status }),
    onMutate: async ({ job, status }) => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] });
      const previous = queryClient.getQueryData<JobApplication[]>(['jobs']);
      queryClient.setQueryData<JobApplication[]>(['jobs'], (old) =>
        (old ?? []).map((j) => (j.id === job.id ? { ...j, status } : j)),
      );
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['jobs'], ctx.previous);
      toast.error((e as Error)?.message || t('save_error'));
    },
    onSettled: invalidate,
  });

  const handleDelete = async (job: JobApplication) => {
    // Name the application in the prompt so the user can see exactly which one
    // they are about to remove.
    if (!window.confirm(t('delete_confirm_named', { position: job.position, company: job.company }))) {
      return;
    }
    try {
      await api.delete(`/jobs/${job.id}`);
      invalidate();
      toast.success(t('deleted'));
    } catch (e) {
      toast.error((e as Error)?.message || t('save_error'));
    }
  };

  /** Archive/unarchive — a reversible alternative to deleting a finished role. */
  const handleArchive = async (job: JobApplication) => {
    try {
      await api.put(`/jobs/${job.id}`, { archived: !job.archived });
      invalidate();
      toast.success(job.archived ? t('unarchived') : t('archived_toast'));
    } catch (e) {
      toast.error((e as Error)?.message || t('save_error'));
    }
  };

  /**
   * Export a scheduled interview as a `.ics` download.
   *
   * A file rather than a calendar API: it imports into Google, Outlook and Apple
   * alike, and needs no OAuth token from the user. Defaults to one hour, since
   * the tracker only records a start time.
   */
  const handleAddToCalendar = (job: JobApplication) => {
    const content = buildIcsEvent({
      title: t('calendar_summary', { position: job.position, company: job.company }),
      description: [
        t('calendar_description', { position: job.position, company: job.company }),
        job.jobUrl,
      ]
        .filter(Boolean)
        .join('\n'),
      location: job.location,
      start: job.interviewDate,
      url: job.jobUrl,
    });
    // No parseable interview date means there is nothing to schedule.
    if (!content) {
      toast.error(t('calendar_error'));
      return;
    }
    const name = [slug(job.company), slug(job.position)].filter(Boolean).join('-') || 'interview';
    downloadIcs(`interview-${name}.ics`, content);
    toast.success(t('calendar_downloaded'));
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (job: JobApplication) => {
    setEditing(job);
    setModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('title')}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('subtitle')}</p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
          {t('add')}
        </Button>
      </div>

      {/* Search + sort */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <label className="sr-only" htmlFor="job-search">
            {t('search_label')}
          </label>
          <input
            id="job-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_ph')}
            className="w-full rounded-lg border border-stone-300 bg-white py-2 ps-9 pe-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="job-sort">
            {t('sort_label')}
          </label>
          <select
            id="job-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            {(['updated', 'applied', 'company', 'position', 'status'] as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {t(`sort.${k}`)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowArchived((v) => !v)}
            aria-pressed={showArchived}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              showArchived
                ? 'bg-brand-600 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
            )}
          >
            <Archive className="h-4 w-4" />
            {t('archived')}
          </button>
        </div>
      </div>

      {/* Status filter, each tab carrying its own count */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', ...STATUS_ORDER] as const).map((s) => {
          const count = s === 'all' ? visible.length : (counts[s] ?? 0);
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                filter === s
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
              )}
            >
              {s === 'all' ? t('filter_all') : t(`status.${s}`)}
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                  filter === s ? 'bg-white/25' : 'bg-stone-200 dark:bg-stone-700',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-5 w-1/3 rounded bg-stone-200 dark:bg-stone-700" />
              <div className="mt-3 h-4 w-1/4 rounded bg-stone-200 dark:bg-stone-700" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-danger-400 dark:text-danger-500" />
          <h3 className="text-lg font-semibold text-stone-900 dark:text-white">{t('load_error')}</h3>
          <Button variant="secondary" className="mt-4" onClick={() => refetch()}>
            {t('retry')}
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Briefcase className="mb-4 h-12 w-12 text-stone-300 dark:text-stone-600" />
          <h3 className="text-lg font-semibold text-stone-900 dark:text-white">{t('empty_title')}</h3>
          <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">{t('empty_desc')}</p>
          <Button className="mt-6" icon={<Plus className="h-4 w-4" />} onClick={openNew}>
            {t('add')}
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => (
            <Card key={job.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-stone-900 dark:text-white">
                      {job.position}
                    </h3>
                    <Badge variant={STATUS_VARIANT[job.status]}>{t(`status.${job.status}`)}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">{job.company}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    {job.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location}
                      </span>
                    )}
                    {job.appliedDate && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(job.appliedDate)}
                      </span>
                    )}
                    {job.salaryRange && (
                      <span className="flex items-center gap-1">
                        <Banknote className="h-3.5 w-3.5" />
                        {job.salaryRange}
                      </span>
                    )}
                    {job.contactName && (
                      <span className="flex items-center gap-1">
                        <UserIcon className="h-3.5 w-3.5" />
                        {job.contactEmail ? (
                          <a href={`mailto:${job.contactEmail}`} className="hover:underline">
                            {job.contactName}
                          </a>
                        ) : (
                          job.contactName
                        )}
                      </span>
                    )}
                    {job.interviewDate && (
                      <span className="flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {t('interview_on', { date: formatDate(job.interviewDate) })}
                      </span>
                    )}
                    {job.followUpDate && (
                      <span className="flex items-center gap-1">
                        <BellRing className="h-3.5 w-3.5" />
                        {t('follow_up_on', { date: formatDate(job.followUpDate) })}
                      </span>
                    )}
                    {job.jobUrl && (
                      <a
                        href={job.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t('view_posting')}
                      </a>
                    )}
                  </div>
                  {job.notes && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-stone-500 dark:text-stone-400">
                      {job.notes}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <label className="sr-only" htmlFor={`status-${job.id}`}>
                    {t('status_label')}
                  </label>
                  <select
                    id={`status-${job.id}`}
                    value={job.status}
                    disabled={statusMutation.isPending && statusMutation.variables?.job.id === job.id}
                    onChange={(e) => statusMutation.mutate({ job, status: e.target.value as JobStatus })}
                    className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                  </select>
                  {job.interviewDate && (
                    <button
                      onClick={() => handleAddToCalendar(job)}
                      aria-label={t('add_to_calendar')}
                      title={t('add_to_calendar')}
                      className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-brand-600 dark:hover:bg-stone-800 dark:hover:text-brand-400"
                    >
                      <CalendarPlus className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(job)}
                    aria-label={t('edit')}
                    title={t('edit')}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleArchive(job)}
                    aria-label={job.archived ? t('unarchive') : t('archive')}
                    title={job.archived ? t('unarchive') : t('archive')}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(job)}
                    aria-label={t('delete')}
                    title={t('delete')}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <JobFormModal open={modalOpen} onClose={() => setModalOpen(false)} job={editing} />
    </div>
  );
}

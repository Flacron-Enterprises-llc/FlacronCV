'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { cn } from '@/lib/utils';
import { downloadIcs } from '@/lib/ics';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import JobFormModal from '@/components/jobs/JobFormModal';
import JobCard from '@/components/jobs/JobCard';
import JobBoard from '@/components/jobs/JobBoard';
import {
  SORT_KEYS,
  STATUS_ORDER,
  applicationCalendarFile,
  filterJobs,
  isCapacityError,
  statusCounts,
  type CalendarKind,
  type SortKey,
} from '@/components/jobs/job-workspace';
import { Plus, Briefcase, AlertCircle, Search, Archive, SearchX, List, Columns3 } from 'lucide-react';
import { toast } from 'sonner';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  CoverLetter,
  CV,
  JobApplication,
  JobCapacity,
  JobChecklistItem,
  JobStatus,
  UpdateJobData,
} from '@flacroncv/shared-types';
import { TOUR_TARGETS } from '@/lib/app-tour';

type View = 'list' | 'board';
const VIEW_KEY = 'flacroncv.jobs.view';

export default function JobsPage(): React.JSX.Element | null {
  const t = useTranslations('jobs');
  const tCommon = useTranslations('common');
  const formatApiError = useApiErrorMessage();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>('list');
  const [filter, setFilter] = useState<'all' | JobStatus>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobApplication | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The chosen view is a per-browser convenience; storage may be unavailable.
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === 'board') setView('board');
    } catch {
      /* private mode: default view */
    }
  }, []);
  const chooseView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* not remembered, still switched */
    }
  };

  const { data: jobs, isLoading, isError, refetch } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.get<JobApplication[]>('/jobs'),
    enabled: !!user,
  });

  // Tracked-application usage. `limit` is null until a plan limit is wired,
  // in which case nothing is shown (no invented number).
  const { data: capacity } = useQuery({
    queryKey: ['jobs', 'capacity'],
    queryFn: () => api.get<JobCapacity>('/jobs/capacity'),
    enabled: !!user,
  });

  // Titles for the documents linked to each application. Same keys and shape
  // as the CV / cover-letter lists, so these are usually already cached.
  const { data: cvsData } = useQuery({
    queryKey: ['cvs'],
    queryFn: () => api.get<{ items: CV[] }>('/cvs?limit=100'),
    enabled: !!user,
  });
  const { data: lettersData } = useQuery({
    queryKey: ['cover-letters'],
    queryFn: () => api.get<{ items: CoverLetter[] }>('/cover-letters?limit=100'),
    enabled: !!user,
  });
  const cvTitles = new Map((cvsData?.items ?? []).map((cv) => [cv.id, cv.title]));
  const letterTitles = new Map((lettersData?.items ?? []).map((cl) => [cl.id, cl.title]));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['jobs'] });

  // Archived applications are hidden unless explicitly requested — everything
  // else (counts, search, sort) operates on that same visible set so the tab
  // numbers always describe what the list is actually showing.
  const visible = (jobs ?? []).filter((j) => !!j.archived === showArchived);
  const counts = statusCounts(visible);
  // The board shows every stage as a column, so the status tab does not narrow it.
  const filtered = filterJobs(visible, { status: view === 'board' ? 'all' : filter, search, sort });

  // Applications exist but the current view hides all of them (status tab,
  // search, or the archived toggle). "No applications yet — add your first"
  // would be false here; offer to clear the view instead.
  const hasApplications = (jobs ?? []).length > 0;
  const clearFilters = () => {
    setFilter('all');
    setSearch('');
    setShowArchived(false);
  };

  // Optimistic inline change (status from the select or a board drop, a
  // checklist tick): the cache reflects the new value immediately, rolls back
  // on failure, and reconciles with the server on settle — so it never snaps
  // back to the stale value mid-save. The card's controls are disabled meanwhile.
  const patchMutation = useMutation({
    mutationFn: ({ job, patch }: { job: JobApplication; patch: UpdateJobData }) =>
      api.put<JobApplication>(`/jobs/${job.id}`, patch),
    onMutate: async ({ job, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] });
      const previous = queryClient.getQueryData<JobApplication[]>(['jobs']);
      queryClient.setQueryData<JobApplication[]>(['jobs'], (old) =>
        (old ?? []).map((j) => (j.id === job.id ? ({ ...j, ...patch } as JobApplication) : j)),
      );
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['jobs'], ctx.previous);
      toast.error(formatApiError(e, t('save_error')));
    },
    onSettled: invalidate,
  });
  const busyId = patchMutation.isPending ? (patchMutation.variables?.job.id ?? null) : null;

  const refreezeMutation = useMutation({
    mutationFn: ({ job, kind }: { job: JobApplication; kind: 'cv' | 'cover_letter' }) =>
      api.post<JobApplication>(`/jobs/${job.id}/refreeze`, { kind }),
    onSuccess: () => toast.success(t('refrozen')),
    onError: (e) => toast.error(formatApiError(e, t('save_error'))),
    onSettled: invalidate,
  });

  /** Confirmed in the styled modal (RTL/dark aware), not window.confirm. */
  const confirmDelete = async () => {
    const job = deleteTarget;
    if (!job || deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/jobs/${job.id}`);
      invalidate();
      toast.success(t('deleted'));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(formatApiError(e, t('save_error')));
    } finally {
      setDeleting(false);
    }
  };

  /** Archive/unarchive — a reversible alternative to deleting a finished role. */
  const handleArchive = async (job: JobApplication) => {
    try {
      await api.put(`/jobs/${job.id}`, { archived: !job.archived });
      invalidate();
      toast.success(job.archived ? t('unarchived') : t('archived_toast'));
    } catch (e) {
      // Restoring counts toward the plan capacity again.
      toast.error(isCapacityError(e) ? t('capacity_reached') : formatApiError(e, t('save_error')));
    }
  };

  /**
   * Export an interview, follow-up or deadline as a `.ics` download.
   *
   * A file rather than a calendar API: it imports into Google, Outlook and Apple
   * alike, and needs no OAuth token from the user.
   */
  const handleCalendar = (job: JobApplication, kind: CalendarKind) => {
    const names = { position: job.position, company: job.company };
    const file = applicationCalendarFile(job, kind, {
      title: t(`calendar.${kind}.summary`, names),
      description: t(`calendar.${kind}.description`, names),
    });
    // No parseable date means there is nothing to schedule.
    if (!file) {
      toast.error(t('calendar_error'));
      return;
    }
    downloadIcs(file.filename, file.content);
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

  const cardActions = {
    onEdit: openEdit,
    onArchive: (job: JobApplication) => void handleArchive(job),
    onDelete: (job: JobApplication) => setDeleteTarget(job),
    onStatus: (job: JobApplication, status: JobStatus) => patchMutation.mutate({ job, patch: { status } }),
    onChecklist: (job: JobApplication, checklist: JobChecklistItem[]) =>
      patchMutation.mutate({ job, patch: { checklist } }),
    onCalendar: handleCalendar,
    onRefreeze: (job: JobApplication, kind: 'cv' | 'cover_letter') => refreezeMutation.mutate({ job, kind }),
  };

  const tabClass = (active: boolean) =>
    cn(
      'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      active
        ? 'bg-brand-600 text-white'
        : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
    );

  return (
    <div className={cn('mx-auto space-y-6', view === 'board' ? 'max-w-7xl' : 'max-w-4xl')}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" data-tour={TOUR_TARGETS.jobs}>
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('title')}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('subtitle')}</p>
          {capacity && capacity.limit !== null && (
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              {t('capacity', { used: capacity.used, limit: capacity.limit })}
            </p>
          )}
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
          {t('add')}
        </Button>
      </div>

      {/* Search + sort + view */}
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
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="job-sort">
            {t('sort_label')}
          </label>
          <select
            id="job-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`sort.${k}`)}
              </option>
            ))}
          </select>
          <button onClick={() => setShowArchived((v) => !v)} aria-pressed={showArchived} className={tabClass(showArchived)}>
            <Archive className="h-4 w-4" />
            {t('archived')}
          </button>
          <div role="group" aria-label={t('view_label')} className="flex gap-1">
            <button onClick={() => chooseView('list')} aria-pressed={view === 'list'} className={tabClass(view === 'list')}>
              <List className="h-4 w-4" aria-hidden="true" />
              {t('view_list')}
            </button>
            <button onClick={() => chooseView('board')} aria-pressed={view === 'board'} className={tabClass(view === 'board')}>
              <Columns3 className="h-4 w-4" aria-hidden="true" />
              {t('view_board')}
            </button>
          </div>
        </div>
      </div>

      {/* Status filter (list view), each tab carrying its own count */}
      {view === 'list' && (
        <div className="flex flex-wrap items-center gap-2">
          {(['all', ...STATUS_ORDER] as const).map((s) => {
            const count = s === 'all' ? visible.length : counts[s];
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
      )}

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
      ) : !hasApplications ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Briefcase className="mb-4 h-12 w-12 text-stone-300 dark:text-stone-600" />
          <h3 className="text-lg font-semibold text-stone-900 dark:text-white">{t('empty_title')}</h3>
          <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">{t('empty_desc')}</p>
          <Button className="mt-6" icon={<Plus className="h-4 w-4" />} onClick={openNew}>
            {t('add')}
          </Button>
        </Card>
      ) : filtered.length === 0 && view === 'list' ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <SearchX className="mb-4 h-12 w-12 text-stone-300 dark:text-stone-600" />
          <h3 className="text-lg font-semibold text-stone-900 dark:text-white">{t('no_match_title')}</h3>
          <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">{t('no_match_desc')}</p>
          <Button className="mt-6" variant="secondary" onClick={clearFilters}>
            {t('clear_filters')}
          </Button>
        </Card>
      ) : view === 'board' ? (
        <JobBoard
          jobs={filtered}
          cvTitles={cvTitles}
          letterTitles={letterTitles}
          busyId={busyId}
          {...cardActions}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              cvTitles={cvTitles}
              letterTitles={letterTitles}
              busy={busyId === job.id || (refreezeMutation.isPending && refreezeMutation.variables?.job.id === job.id)}
              {...cardActions}
            />
          ))}
        </div>
      )}

      <JobFormModal open={modalOpen} onClose={() => setModalOpen(false)} job={editing} />

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title={t('delete_confirm_title')}
        size="sm"
      >
        {/* Names the application so the user sees exactly which one goes. */}
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {deleteTarget &&
            t('delete_confirm_named', { position: deleteTarget.position, company: deleteTarget.company })}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
            {tCommon('cancel')}
          </Button>
          <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>
            {t('delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

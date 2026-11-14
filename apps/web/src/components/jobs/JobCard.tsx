'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Archive,
  Banknote,
  BellRing,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileText,
  Flag,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { JobApplication, JobChecklistItem, JobStatus, isJobOpen } from '@flacroncv/shared-types';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useFormatDate, useFormatDateTime } from '@/lib/use-format-date';
import { followUpState } from './follow-up';
import ApplicationDrafts from './ApplicationDrafts';
import {
  STATUS_ORDER,
  STATUS_VARIANT,
  boardStatus,
  calendarKinds,
  checklistProgress,
  letterText,
  type CalendarKind,
} from './job-workspace';

export interface JobCardActions {
  onEdit: (job: JobApplication) => void;
  onArchive: (job: JobApplication) => void;
  onDelete: (job: JobApplication) => void;
  onStatus: (job: JobApplication, status: JobStatus) => void;
  onChecklist: (job: JobApplication, checklist: JobChecklistItem[]) => void;
  onCalendar: (job: JobApplication, kind: CalendarKind) => void;
  onRefreeze: (job: JobApplication, kind: 'cv' | 'cover_letter') => void;
}

interface JobCardProps extends JobCardActions {
  job: JobApplication;
  /** Titles of the user's current documents, to link the ones that still exist. */
  cvTitles: Map<string, string>;
  letterTitles: Map<string, string>;
  /** True while this card's status/checklist write is in flight. */
  busy: boolean;
  /** Board cards: fewer details, same actions. */
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, job: JobApplication) => void;
}

const iconButton =
  'rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-200';

export default function JobCard({
  job,
  cvTitles,
  letterTitles,
  busy,
  compact = false,
  draggable = false,
  onDragStart,
  ...actions
}: JobCardProps) {
  const t = useTranslations('jobs');
  const formatDate = useFormatDate();
  const [expanded, setExpanded] = useState(false);
  const status = boardStatus(job.status);
  const progress = checklistProgress(job);
  const contacts = job.contacts ?? [];
  const firstContact = contacts[0];
  const open = isJobOpen(job);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, job) : undefined}
      className={cn(draggable && 'cursor-grab active:cursor-grabbing')}
    >
    <Card padding={compact ? 'sm' : 'md'}>
      <div className={cn('flex flex-col gap-3', !compact && 'sm:flex-row sm:items-start sm:justify-between')}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn('font-semibold text-stone-900 dark:text-white', compact ? 'text-sm' : 'text-base')}>
              {job.position}
            </h3>
            {!compact && <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>}
            {job.outcome && (
              <Badge variant={job.outcome === 'accepted' ? 'success' : 'default'}>
                {t(`outcome.${job.outcome}`)}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">{job.company}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
            {job.location && !compact && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {job.location}
              </span>
            )}
            {job.appliedDate && !compact && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDate(job.appliedDate)}
              </span>
            )}
            {job.salaryRange && !compact && (
              <span className="flex items-center gap-1">
                <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
                {job.salaryRange}
              </span>
            )}
            {firstContact && !compact && (
              <span className="flex items-center gap-1">
                <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {firstContact.email ? (
                  <a href={`mailto:${firstContact.email}`} className="hover:underline">
                    {firstContact.name || firstContact.email}
                  </a>
                ) : (
                  firstContact.name
                )}
                {contacts.length > 1 && <span>{t('more_contacts', { count: contacts.length - 1 })}</span>}
              </span>
            )}
            {job.deadline && <DueBadge date={job.deadline} live={open} kind="deadline" />}
            {job.interviewDate && (
              <span className="flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {t('interview_on', { date: formatDate(job.interviewDate) })}
              </span>
            )}
            {job.followUpDate && <DueBadge date={job.followUpDate} live={open} kind="follow_up" />}
            {progress.total > 0 && (
              <span className="flex items-center gap-1">
                <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t('checklist_progress', { done: progress.done, total: progress.total })}
              </span>
            )}
            {job.jobUrl && !compact && (
              <a
                href={job.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {t('view_posting')}
              </a>
            )}
          </div>

          {!compact && (
            <DocumentLinks job={job} cvTitles={cvTitles} letterTitles={letterTitles} />
          )}
          {job.notes && !compact && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-stone-500 dark:text-stone-400">{job.notes}</p>
          )}
        </div>

        <div className={cn('flex shrink-0 flex-wrap items-center gap-2', compact && 'justify-between')}>
          <label className="sr-only" htmlFor={`status-${job.id}${compact ? '-board' : ''}`}>
            {t('move_to', { position: job.position })}
          </label>
          <select
            id={`status-${job.id}${compact ? '-board' : ''}`}
            value={status}
            disabled={busy}
            onChange={(e) => actions.onStatus(job, e.target.value as JobStatus)}
            className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
          <div className="flex items-center">
            <CalendarMenu job={job} onPick={(kind) => actions.onCalendar(job, kind)} />
            <button type="button" onClick={() => actions.onEdit(job)} aria-label={t('edit')} title={t('edit')} className={iconButton}>
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => actions.onArchive(job)}
              aria-label={job.archived ? t('unarchive') : t('archive')}
              title={job.archived ? t('unarchive') : t('archive')}
              className={iconButton}
            >
              <Archive className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => actions.onDelete(job)}
              aria-label={t('delete')}
              title={t('delete')}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
          {expanded ? t('hide_details') : t('show_details')}
        </button>
        {!compact && <ApplicationDrafts job={job} />}
      </div>

      {expanded && (
        <JobDetails
          job={job}
          busy={busy}
          onChecklist={(items) => actions.onChecklist(job, items)}
          onRefreeze={(kind) => actions.onRefreeze(job, kind)}
          cvTitles={cvTitles}
          letterTitles={letterTitles}
          showDrafts={compact}
        />
      )}
    </Card>
    </div>
  );
}

/** Deadline / follow-up date, flagged when due or past while the application is still open. */
function DueBadge({ date, live, kind }: { date: string; live: boolean; kind: 'deadline' | 'follow_up' }) {
  const t = useTranslations('jobs');
  const formatDate = useFormatDate();
  const due = live ? followUpState(date) : null;
  const shown = formatDate(date);
  const Icon = kind === 'deadline' ? Flag : BellRing;
  // Colour plus words: the state is in the text, not only the hue.
  if (due === 'overdue') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {kind === 'deadline' ? t('deadline_passed', { date: shown }) : t('follow_up_overdue', { date: shown })}
      </span>
    );
  }
  if (due === 'today') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {kind === 'deadline' ? t('deadline_today') : t('follow_up_today')}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {kind === 'deadline' ? t('deadline_on', { date: shown }) : t('follow_up_on', { date: shown })}
    </span>
  );
}

function CalendarMenu({ job, onPick }: { job: JobApplication; onPick: (kind: CalendarKind) => void }) {
  const t = useTranslations('jobs');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const kinds = calendarKinds(job);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (kinds.length === 0) return null;
  const single = kinds.length === 1;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => (single ? onPick(kinds[0]) : setOpen((v) => !v))}
        aria-label={single ? t(`calendar.${kinds[0]}.button`) : t('add_to_calendar')}
        aria-haspopup={single ? undefined : 'menu'}
        aria-expanded={single ? undefined : open}
        title={single ? t(`calendar.${kinds[0]}.button`) : t('add_to_calendar')}
        className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-brand-600 dark:hover:bg-stone-800 dark:hover:text-brand-400"
      >
        <CalendarPlus className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 z-20 mt-1 w-56 rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900"
        >
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(kind);
              }}
              className="block w-full px-3 py-2 text-start text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              {t(`calendar.${kind}.button`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The documents sent for this application. A link to a since-deleted document is not shown. */
function DocumentLinks({
  job,
  cvTitles,
  letterTitles,
}: {
  job: JobApplication;
  cvTitles: Map<string, string>;
  letterTitles: Map<string, string>;
}) {
  const t = useTranslations('jobs');
  const cvTitle = job.cvSnapshot?.title || (job.linkedCVId ? cvTitles.get(job.linkedCVId) : undefined);
  const letterTitle =
    job.coverLetterSnapshot?.title || (job.linkedCoverLetterId ? letterTitles.get(job.linkedCoverLetterId) : undefined);
  const cvExists = !!job.linkedCVId && cvTitles.has(job.linkedCVId);
  const letterExists = !!job.linkedCoverLetterId && letterTitles.has(job.linkedCoverLetterId);
  if (!cvTitle && !letterTitle) return null;
  const linkClass = 'flex min-w-0 items-center gap-1 text-brand-600 hover:underline dark:text-brand-400';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {cvTitle &&
        (cvExists ? (
          <Link href={`/cv/${job.linkedCVId}`} className={linkClass}>
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('linked_cv_link', { title: cvTitle })}</span>
          </Link>
        ) : (
          <span className="flex items-center gap-1 text-stone-500">
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('linked_cv_link', { title: cvTitle })}
          </span>
        ))}
      {letterTitle &&
        (letterExists ? (
          <Link href={`/cover-letters/${job.linkedCoverLetterId}`} className={linkClass}>
            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('linked_cover_letter_link', { title: letterTitle })}</span>
          </Link>
        ) : (
          <span className="flex items-center gap-1 text-stone-500">
            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('linked_cover_letter_link', { title: letterTitle })}
          </span>
        ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-stone-100 pt-3 dark:border-stone-800">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{title}</h4>
      {children}
    </section>
  );
}

function JobDetails({
  job,
  busy,
  onChecklist,
  onRefreeze,
  cvTitles,
  letterTitles,
  showDrafts,
}: {
  job: JobApplication;
  busy: boolean;
  onChecklist: (items: JobChecklistItem[]) => void;
  onRefreeze: (kind: 'cv' | 'cover_letter') => void;
  cvTitles: Map<string, string>;
  letterTitles: Map<string, string>;
  showDrafts: boolean;
}) {
  const t = useTranslations('jobs');
  const formatDate = useFormatDate();
  const formatDateTime = useFormatDateTime();
  const [letterOpen, setLetterOpen] = useState(false);
  const contacts = job.contacts ?? [];
  const checklist = job.checklist ?? [];
  const answers = job.formAnswers ?? [];

  return (
    <div className="mt-3 space-y-3 text-sm">
      {showDrafts && <ApplicationDrafts job={job} />}
      {showDrafts && <DocumentLinks job={job} cvTitles={cvTitles} letterTitles={letterTitles} />}

      {job.outcome && (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {t('outcome_recorded', {
            outcome: t(`outcome.${job.outcome}`),
            origin: t(`outcome_origin.${job.outcomeOrigin ?? 'user_reported'}`),
            date: job.outcomeRecordedAt ? formatDate(job.outcomeRecordedAt) : '—',
          })}
        </p>
      )}

      <Section title={t('section.checklist')}>
        {checklist.length === 0 ? (
          <p className="text-xs text-stone-500 dark:text-stone-400">{t('checklist_empty')}</p>
        ) : (
          <ul className="space-y-1">
            {checklist.map((item) => (
              <li key={item.id}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={busy}
                    onChange={() =>
                      onChecklist(checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className={cn('text-stone-700 dark:text-stone-300', item.done && 'text-stone-400 line-through')}>
                    {item.label}
                    <span className="ms-1 text-xs text-stone-400">· {t(`checklist_kind.${item.kind}`)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {contacts.length > 0 && (
        <Section title={t('section.contacts')}>
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id} className="text-stone-700 dark:text-stone-300">
                <span className="font-medium">{c.name || c.email}</span>
                {c.role && <span className="text-stone-500"> · {c.role}</span>}
                <div className="flex flex-wrap gap-x-3 text-xs">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="text-brand-600 hover:underline dark:text-brand-400">
                      {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400">
                      <Phone className="h-3 w-3" aria-hidden="true" />
                      {c.phone}
                    </a>
                  )}
                </div>
                {c.notes && <p className="whitespace-pre-wrap text-xs text-stone-500">{c.notes}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(job.cvSnapshot || job.coverLetterSnapshot) && (
        <Section title={t('section.documents')}>
          <ul className="space-y-2 text-xs text-stone-600 dark:text-stone-400">
            {job.cvSnapshot && (
              <li className="flex flex-wrap items-center gap-2">
                <span>
                  {t('frozen_cv', {
                    title: job.cvSnapshot.title,
                    version: job.cvSnapshot.versionNumber ?? '—',
                    date: job.cvSnapshot.frozenAt ? formatDateTime(job.cvSnapshot.frozenAt) : '—',
                  })}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRefreeze('cv')}
                  className="flex items-center gap-1 text-brand-600 hover:underline disabled:opacity-60 dark:text-brand-400"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  {t('refreeze')}
                </button>
              </li>
            )}
            {job.coverLetterSnapshot && (
              <li>
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    {t('frozen_letter', {
                      title: job.coverLetterSnapshot.title,
                      date: job.coverLetterSnapshot.frozenAt ? formatDateTime(job.coverLetterSnapshot.frozenAt) : '—',
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLetterOpen((v) => !v)}
                    aria-expanded={letterOpen}
                    className="text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {letterOpen ? t('hide_letter') : t('show_letter')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRefreeze('cover_letter')}
                    className="flex items-center gap-1 text-brand-600 hover:underline disabled:opacity-60 dark:text-brand-400"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    {t('refreeze')}
                  </button>
                </div>
                {letterOpen && (
                  <p className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-2 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                    {letterText(job.coverLetterSnapshot.content)}
                    {job.coverLetterSnapshot.truncated && `\n${t('letter_truncated')}`}
                  </p>
                )}
              </li>
            )}
          </ul>
          <p className="mt-1 text-xs text-stone-400">{t('frozen_help')}</p>
        </Section>
      )}

      {job.jobDescription && (
        <Section title={t('section.description')}>
          <p className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-stone-700 dark:text-stone-300">
            {job.jobDescription}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            {t(job.jobDescriptionSource === 'opportunity' ? 'description_from_opportunity' : 'description_pasted')}
          </p>
        </Section>
      )}

      {answers.length > 0 && (
        <Section title={t('section.form_answers')}>
          <dl className="space-y-2">
            {answers.map((a) => (
              <div key={a.id}>
                <dt className="font-medium text-stone-700 dark:text-stone-300">{a.question}</dt>
                <dd className="whitespace-pre-wrap text-stone-600 dark:text-stone-400">{a.answer || '—'}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {(job.statusHistory ?? []).length > 1 && (
        <Section title={t('section.history')}>
          <ol className="space-y-0.5 text-xs text-stone-500 dark:text-stone-400">
            {job.statusHistory.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                {formatDateTime(h.at)} · {t(`status.${boardStatus(h.status)}`)}
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

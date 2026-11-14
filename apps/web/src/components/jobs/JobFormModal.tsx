'use client';

import React, { useState, useEffect, useId } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useModalA11y } from '@/hooks/useModalA11y';
import Button from '@/components/ui/Button';
import { AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useFormatDate, useFormatDateTime } from '@/lib/use-format-date';
import { documentOptionLabels } from './document-option-labels';
import { STATUS_ORDER, boardStatus, isCapacityError } from './job-workspace';
import {
  AnswersEditor,
  ChecklistEditor,
  ContactsEditor,
  rowKey,
  type AnswerRow,
  type ChecklistRow,
  type ContactRow,
} from './WorkspaceEditors';
import {
  JOB_LIMITS,
  JOB_OUTCOMES,
  JobApplication,
  JobOutcome,
  JobStatus,
  CreateJobData,
  CV,
  CoverLetter,
} from '@flacroncv/shared-types';

const contactRows = (job?: JobApplication | null): ContactRow[] =>
  (job?.contacts ?? []).map((c) => ({
    key: rowKey(),
    id: c.id,
    name: c.name ?? '',
    role: c.role ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    notes: c.notes ?? '',
  }));
const checklistRows = (job?: JobApplication | null): ChecklistRow[] =>
  (job?.checklist ?? []).map((i) => ({ key: rowKey(), id: i.id, label: i.label, kind: i.kind, done: i.done }));
const answerRows = (job?: JobApplication | null): AnswerRow[] =>
  (job?.formAnswers ?? []).map((a) => ({ key: rowKey(), id: a.id, question: a.question, answer: a.answer }));

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="border-t border-stone-200 pt-4 text-sm font-semibold text-stone-900 dark:border-stone-700 dark:text-white">
      {children}
    </h4>
  );
}

interface JobFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided, the modal edits this application; otherwise it creates one. */
  job?: JobApplication | null;
}

const inputClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white';
const labelClass = 'mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300';

export default function JobFormModal({ open, onClose, job }: JobFormModalProps) {
  const t = useTranslations('jobs');
  const tCommon = useTranslations('common');
  const formatApiError = useApiErrorMessage();
  const queryClient = useQueryClient();
  const titleId = useId();
  const dialogRef = useModalA11y<HTMLDivElement>(open, onClose);
  const formatDate = useFormatDate();
  const formatDateTime = useFormatDateTime();

  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [status, setStatus] = useState<JobStatus>(JobStatus.SAVED);
  const [location, setLocation] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [appliedDate, setAppliedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [salaryRange, setSalaryRange] = useState('');
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [deadline, setDeadline] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [outcome, setOutcome] = useState<JobOutcome | ''>('');
  const [interviewDate, setInterviewDate] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [linkedCVId, setLinkedCVId] = useState('');
  const [linkedCoverLetterId, setLinkedCoverLetterId] = useState('');
  // True from the moment Save is clicked until the mutation is handed off —
  // covers the awaited duplicate check, during which isPending is still false.
  const [submitting, setSubmitting] = useState(false);
  // An existing application for the same role, found on Save. Confirmed inline
  // in this dialog rather than with window.confirm (unstyled, ignores RTL and
  // dark mode) or a second modal stacked on this one (two focus traps).
  const [duplicateOf, setDuplicateOf] = useState<JobApplication | null>(null);

  // Documents the user can attach to this application.
  const { data: cvsData } = useQuery({
    queryKey: ['cvs'],
    queryFn: () => api.get<{ items: CV[] }>('/cvs?limit=100'),
    enabled: open,
  });
  const { data: clData } = useQuery({
    queryKey: ['cover-letters'],
    queryFn: () => api.get<{ items: CoverLetter[] }>('/cover-letters?limit=100'),
    enabled: open,
  });

  // Reset the form to the target job (or empty) each time it opens.
  useEffect(() => {
    if (!open) return;
    setCompany(job?.company ?? '');
    setPosition(job?.position ?? '');
    setStatus(job ? boardStatus(job.status) : JobStatus.SAVED);
    setLocation(job?.location ?? '');
    setJobUrl(job?.jobUrl ?? '');
    setAppliedDate(job?.appliedDate ?? '');
    setNotes(job?.notes ?? '');
    setSalaryRange(job?.salaryRange ?? '');
    setContacts(contactRows(job));
    setChecklist(checklistRows(job));
    setAnswers(answerRows(job));
    setDeadline(job?.deadline ?? '');
    setJobDescription(job?.jobDescription ?? '');
    setOutcome(job?.outcome ?? '');
    setInterviewDate(job?.interviewDate ?? '');
    setFollowUpDate(job?.followUpDate ?? '');
    setLinkedCVId(job?.linkedCVId ?? '');
    setLinkedCoverLetterId(job?.linkedCoverLetterId ?? '');
    setDuplicateOf(null);
  }, [open, job]);

  // The warning is about the company/position it was raised for; editing
  // either makes it stale, and the next Save checks again.
  useEffect(() => {
    setDuplicateOf(null);
  }, [company, position]);

  const optionLabelFormat = (pattern: 'cv_option' | 'cover_letter_option') => ({
    date: formatDate,
    dateTime: (value: unknown) => formatDateTime(value),
    label: (title: string, when: string) => t(pattern, { title, date: when }),
  });
  const cvLabels = documentOptionLabels(cvsData?.items ?? [], optionLabelFormat('cv_option'));
  const letterLabels = documentOptionLabels(clData?.items ?? [], optionLabelFormat('cover_letter_option'));

  const mutation = useMutation({
    mutationFn: (data: CreateJobData) =>
      job ? api.put(`/jobs/${job.id}`, data) : api.post('/jobs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success(job ? t('updated') : t('created'));
      onClose();
    },
    onError: (e: Error) =>
      toast.error(isCapacityError(e) ? t('capacity_reached') : formatApiError(e, t('save_error'))),
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submit(false);
  };

  const submit = async (confirmedDuplicate: boolean) => {
    // The duplicate check below is awaited, so between the click and
    // `mutation.mutate()` the Save button is NOT yet in its pending state — a
    // second click in that window ran the whole handler again and created two
    // applications. `submitting` closes that window; the button reflects it too.
    if (submitting || mutation.isPending) return;
    setSubmitting(true);
    try {
      await runSubmit(confirmedDuplicate);
    } finally {
      setSubmitting(false);
    }
  };

  const runSubmit = async (confirmedDuplicate: boolean) => {
    if (!company.trim()) return toast.error(t('company_required'));
    if (!position.trim()) return toast.error(t('position_required'));

    // On EDIT, send cleared fields as `null` rather than omitting them.
    //
    // The server whitelist copies a field only when it is `!== undefined`, so
    // `x.trim() || undefined` meant emptying a field silently did nothing —
    // the user deleted their salary range, hit Save, saw a success toast, and
    // the old value was still there on reload. Omission is correct on CREATE
    // (let the server apply its own defaults) but wrong on UPDATE, where the
    // user is expressing intent to clear.
    //
    // `null`, not `''`: class-validator's @IsOptional skips its validators for
    // null but not for an empty string, so `''` would trip @IsEmail on
    // contactEmail and 400 the whole save. null is also what the stored
    // JobApplication type uses for "not set".
    const optional = (v: string) => (job ? v.trim() || null : v.trim() || undefined);

    const payload: CreateJobData = {
      company: company.trim(),
      position: position.trim(),
      status,
      location: optional(location),
      jobUrl: optional(jobUrl),
      appliedDate: optional(appliedDate),
      notes: optional(notes),
      salaryRange: optional(salaryRange),
      interviewDate: optional(interviewDate),
      followUpDate: optional(followUpDate),
      deadline: optional(deadline),
      jobDescription: optional(jobDescription),
      linkedCVId: optional(linkedCVId),
      linkedCoverLetterId: optional(linkedCoverLetterId),
      // Lists are sent whole: the server keeps the ids it is given (stable
      // rows) and drops rows left empty.
      contacts: contacts.map(({ id, name, role, email, phone, notes }) => ({
        id,
        name,
        role: role.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      })),
      checklist: checklist.map(({ id, label, kind, done }) => ({ id, label, kind, done })),
      formAnswers: answers.map(({ id, question, answer }) => ({ id, question, answer })),
      ...(job ? { outcome: outcome || null } : outcome ? { outcome } : {}),
    };

    // Only on create, and only as a confirmation — applying to the same role
    // twice is legitimate, it just should not happen unnoticed.
    if (!job && !confirmedDuplicate) {
      try {
        const { duplicate } = await api.get<{ duplicate: JobApplication | null }>(
          `/jobs/duplicate-check?company=${encodeURIComponent(payload.company)}&position=${encodeURIComponent(payload.position)}`,
        );
        if (duplicate) {
          setDuplicateOf(duplicate);
          return;
        }
      } catch {
        // A failed check must not block the user from saving.
      }
    }

    mutation.mutate(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl outline-none dark:border-stone-700 dark:bg-stone-900"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700">
          <h3 id={titleId} className="text-lg font-semibold text-stone-900 dark:text-white">
            {job ? t('edit_title') : t('new_title')}
          </h3>
          <button
            onClick={onClose}
            aria-label={tCommon('close')}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <label htmlFor="job-company" className={labelClass}>
                {t('company')}
              </label>
              <input
                id="job-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={t('company_ph')}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor="job-position" className={labelClass}>
                {t('position')}
              </label>
              <input
                id="job-position"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder={t('position_ph')}
                className={inputClass}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="job-status" className={labelClass}>
                  {t('status_label')}
                </label>
                <select
                  id="job-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as JobStatus)}
                  className={inputClass}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="job-applied" className={labelClass}>
                  {t('applied_date')}
                </label>
                <input
                  id="job-applied"
                  type="date"
                  value={appliedDate}
                  onChange={(e) => setAppliedDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="job-location" className={labelClass}>
                {t('location')}
              </label>
              <input
                id="job-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('location_ph')}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="job-url" className={labelClass}>
                {t('job_url')}
              </label>
              <input
                id="job-url"
                type="url"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://…"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="job-salary" className={labelClass}>
                  {t('salary_range')}
                </label>
                <input
                  id="job-salary"
                  value={salaryRange}
                  onChange={(e) => setSalaryRange(e.target.value)}
                  placeholder={t('salary_range_ph')}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="job-deadline" className={labelClass}>
                  {t('deadline')}
                </label>
                <input
                  id="job-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="job-interview" className={labelClass}>
                  {t('interview_date')}
                </label>
                <input
                  id="job-interview"
                  type="datetime-local"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="job-followup" className={labelClass}>
                  {t('follow_up_date')}
                </label>
                <input
                  id="job-followup"
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Attach the documents actually sent for this application. The
                server freezes them on link (CV version / letter copy). */}
            <p className="text-xs text-stone-500 dark:text-stone-400">{t('frozen_on_link')}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="job-cv" className={labelClass}>
                  {t('linked_cv')}
                </label>
                <select
                  id="job-cv"
                  value={linkedCVId}
                  onChange={(e) => setLinkedCVId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t('no_document')}</option>
                  {(cvsData?.items ?? []).map((cv) => (
                    <option key={cv.id} value={cv.id}>
                      {cvLabels.get(cv.id) ?? cv.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="job-cl" className={labelClass}>
                  {t('linked_cover_letter')}
                </label>
                <select
                  id="job-cl"
                  value={linkedCoverLetterId}
                  onChange={(e) => setLinkedCoverLetterId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t('no_document')}</option>
                  {(clData?.items ?? []).map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {letterLabels.get(cl.id) ?? cl.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="job-notes" className={labelClass}>
                {t('notes')}
              </label>
              <textarea
                id="job-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('notes_ph')}
                rows={3}
                className={`${inputClass} resize-y`}
              />
            </div>

            <SectionTitle>{t('section.description')}</SectionTitle>
            <div>
              <label htmlFor="job-description" className="sr-only">
                {t('section.description')}
              </label>
              <textarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder={t('description_ph')}
                rows={5}
                maxLength={JOB_LIMITS.descriptionChars}
                className={`${inputClass} resize-y`}
              />
              <p className="mt-1 text-end text-xs tabular-nums text-stone-400">
                {t('chars', { used: jobDescription.length, max: JOB_LIMITS.descriptionChars })}
              </p>
            </div>

            <SectionTitle>{t('section.contacts')}</SectionTitle>
            <ContactsEditor rows={contacts} onChange={setContacts} />

            <SectionTitle>{t('section.checklist')}</SectionTitle>
            <ChecklistEditor rows={checklist} onChange={setChecklist} />

            <SectionTitle>{t('section.form_answers')}</SectionTitle>
            <AnswersEditor rows={answers} onChange={setAnswers} />

            <SectionTitle>{t('section.outcome')}</SectionTitle>
            <div>
              <label htmlFor="job-outcome" className={labelClass}>
                {t('outcome_label')}
              </label>
              <select
                id="job-outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as JobOutcome | '')}
                className={inputClass}
              >
                <option value="">{t('outcome_none')}</option>
                {JOB_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {t(`outcome.${o}`)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{t('outcome_help')}</p>
            </div>
          </div>

          {duplicateOf ? (
            <div
              role="alert"
              className="border-t border-amber-200 bg-amber-50 px-5 py-3 dark:border-amber-900 dark:bg-amber-950/30"
            >
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <p className="text-sm text-stone-700 dark:text-stone-300">
                  {t('duplicate_confirm', { company: duplicateOf.company, position: duplicateOf.position })}
                </p>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDuplicateOf(null)}>
                  {tCommon('cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  loading={submitting || mutation.isPending}
                  onClick={() => void submit(true)}
                >
                  {t('duplicate_add_anyway')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-3 dark:border-stone-700">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" size="sm" loading={submitting || mutation.isPending}>
                {tCommon('save')}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

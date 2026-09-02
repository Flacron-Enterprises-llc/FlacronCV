'use client';

import React, { useState, useEffect, useId } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useModalA11y } from '@/hooks/useModalA11y';
import Button from '@/components/ui/Button';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import {
  JobApplication,
  JobStatus,
  CreateJobData,
  CV,
  CoverLetter,
} from '@flacroncv/shared-types';

const STATUSES: JobStatus[] = [
  JobStatus.WISHLIST,
  JobStatus.APPLIED,
  JobStatus.INTERVIEWING,
  JobStatus.OFFER,
  JobStatus.REJECTED,
  JobStatus.ACCEPTED,
];

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
  const queryClient = useQueryClient();
  const titleId = useId();
  const dialogRef = useModalA11y<HTMLDivElement>(open, onClose);

  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [status, setStatus] = useState<JobStatus>(JobStatus.WISHLIST);
  const [location, setLocation] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [appliedDate, setAppliedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [salaryRange, setSalaryRange] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [linkedCVId, setLinkedCVId] = useState('');
  const [linkedCoverLetterId, setLinkedCoverLetterId] = useState('');
  // True from the moment Save is clicked until the mutation is handed off —
  // covers the awaited duplicate check, during which isPending is still false.
  const [submitting, setSubmitting] = useState(false);

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
    setStatus(job?.status ?? JobStatus.WISHLIST);
    setLocation(job?.location ?? '');
    setJobUrl(job?.jobUrl ?? '');
    setAppliedDate(job?.appliedDate ?? '');
    setNotes(job?.notes ?? '');
    setSalaryRange(job?.salaryRange ?? '');
    setContactName(job?.contactName ?? '');
    setContactEmail(job?.contactEmail ?? '');
    setInterviewDate(job?.interviewDate ?? '');
    setFollowUpDate(job?.followUpDate ?? '');
    setLinkedCVId(job?.linkedCVId ?? '');
    setLinkedCoverLetterId(job?.linkedCoverLetterId ?? '');
  }, [open, job]);

  const mutation = useMutation({
    mutationFn: (data: CreateJobData) =>
      job ? api.put(`/jobs/${job.id}`, data) : api.post('/jobs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success(job ? t('updated') : t('created'));
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || t('save_error')),
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The duplicate check below is awaited, so between the click and
    // `mutation.mutate()` the Save button is NOT yet in its pending state — a
    // second click in that window ran the whole handler again and created two
    // applications. `submitting` closes that window; the button reflects it too.
    if (submitting || mutation.isPending) return;
    setSubmitting(true);
    try {
      await runSubmit();
    } finally {
      setSubmitting(false);
    }
  };

  const runSubmit = async () => {
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
      contactName: optional(contactName),
      contactEmail: optional(contactEmail),
      interviewDate: optional(interviewDate),
      followUpDate: optional(followUpDate),
      linkedCVId: optional(linkedCVId),
      linkedCoverLetterId: optional(linkedCoverLetterId),
    };

    // Only on create, and only as a confirmation — applying to the same role
    // twice is legitimate, it just should not happen unnoticed.
    if (!job) {
      try {
        const { duplicate } = await api.get<{ duplicate: JobApplication | null }>(
          `/jobs/duplicate-check?company=${encodeURIComponent(payload.company)}&position=${encodeURIComponent(payload.position)}`,
        );
        if (
          duplicate &&
          !window.confirm(t('duplicate_confirm', { company: duplicate.company, position: duplicate.position }))
        ) {
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
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl outline-none dark:border-stone-700 dark:bg-stone-900"
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
                  {STATUSES.map((s) => (
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
                <label htmlFor="job-contact-name" className={labelClass}>
                  {t('contact_name')}
                </label>
                <input
                  id="job-contact-name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder={t('contact_name_ph')}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="job-contact-email" className={labelClass}>
                {t('contact_email')}
              </label>
              <input
                id="job-contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="recruiter@company.com"
                className={inputClass}
              />
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

            {/* Attach the documents actually sent for this application. */}
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
                      {cv.title}
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
                      {cl.title}
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
          </div>

          <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-3 dark:border-stone-700">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" size="sm" loading={submitting || mutation.isPending}>
              {tCommon('save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

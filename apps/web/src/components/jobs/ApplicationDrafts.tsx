'use client';

import React, { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isApiError, newIdempotencyKey } from '@flacroncv/career-api-client';
import { JobApplication } from '@flacroncv/shared-types';
import { Copy, HeartHandshake, Mail } from 'lucide-react';
import { toast } from 'sonner';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { Link } from '@/i18n/routing';
import { isCareerEnabled, useCareerAccess, useCareerApi } from '@/components/career/CareerServices';
import { draftContextOf, draftTypesFor, problemOf, type ApplicationDraftType, type DraftProblem as Problem } from './application-drafts';

/**
 * Referral-request and thank-you drafts for one application, written by the
 * career writing service. Shown only when the career integration is switched
 * on AND the person has career access; otherwise renders nothing, so V1
 * behaves exactly as before.
 */
export default function ApplicationDrafts({ job }: { job: JobApplication }) {
  const enabled = isCareerEnabled();
  const access = useCareerAccess();
  if (!enabled || !access.data?.enabled) return null;
  const types = draftTypesFor(job);
  if (types.length === 0) return null;
  return <DraftButtons job={job} types={types} />;
}

function DraftButtons({ job, types }: { job: JobApplication; types: ApplicationDraftType[] }) {
  const t = useTranslations('jobs.drafts');
  const tCommon = useTranslations('common');
  const api = useCareerApi();
  const [open, setOpen] = useState<ApplicationDraftType | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [draft, setDraft] = useState<{ id: string; body: string } | null>(null);
  // One idempotency key per draft type until the request settles: a retry
  // after a lost response replays the same request instead of charging twice.
  const keys = useRef<Partial<Record<ApplicationDraftType, string>>>({});

  const close = () => {
    if (pending) return;
    setOpen(null);
    setProblem(null);
    setDraft(null);
  };

  const create = async (type: ApplicationDraftType) => {
    setPending(true);
    setProblem(null);
    const key = (keys.current[type] ??= newIdempotencyKey());
    try {
      const paid = await api.createWriting(
        { type, opportunityId: job.opportunityId || null, context: draftContextOf(job) },
        key,
      );
      delete keys.current[type];
      setDraft({ id: paid.document.id, body: paid.document.body });
    } catch (error) {
      // A definite refusal ends the attempt; a lost response keeps the key.
      const status = isApiError(error) ? error.status : 0;
      if ((status >= 400 && status < 500) || isApiError(error, 'provider_unavailable')) delete keys.current[type];
      setProblem(problemOf(error));
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.body);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copy_failed'));
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {types.map((type) => (
          <Button
            key={type}
            type="button"
            size="sm"
            variant="secondary"
            icon={type === 'thank_you' ? <HeartHandshake className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            onClick={() => setOpen(type)}
          >
            {t(`${type}.button`)}
          </Button>
        ))}
      </div>

      <Modal isOpen={open !== null} onClose={close} title={open ? t(`${open}.title`) : ''} size="md">
        {open && !draft && (
          <div className="space-y-3 text-sm text-stone-600 dark:text-stone-400">
            <p>{t(`${open}.intro`, { position: job.position, company: job.company })}</p>
            <p>{t('uses_allowance')}</p>
            {!job.opportunityId && <p>{t('no_opportunity')}</p>}
            {problem && (
              <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                {t(`problem.${problem}`)}{' '}
                {(problem === 'quota' || problem === 'upgrade') && (
                  <Link href="/settings/billing" className="font-medium underline">
                    {t('see_plans')}
                  </Link>
                )}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={close} disabled={pending}>
                {tCommon('cancel')}
              </Button>
              <Button type="button" size="sm" loading={pending} onClick={() => void create(open)}>
                {problem ? t('retry') : t('create')}
              </Button>
            </div>
          </div>
        )}
        {draft && (
          <div className="space-y-3">
            <p className="text-sm text-stone-600 dark:text-stone-400">{t('review_before_sending')}</p>
            <textarea
              readOnly
              value={draft.body}
              rows={10}
              aria-label={t('draft_label')}
              className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => void copy()}>
                {t('copy')}
              </Button>
              <Link
                href="/career/documents"
                className="inline-flex items-center rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                {t('edit_in_documents')}
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

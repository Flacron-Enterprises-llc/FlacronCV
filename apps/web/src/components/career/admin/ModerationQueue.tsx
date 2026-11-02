'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ApiClient, ModerationAction, ModerationQueueItem, ModerationStatus, ReportReason } from '@flacroncv/career-api-client';
import { Button, Card } from '@/components/career/ui';

const REASONS: ReportReason[] = ['suspicious_fee', 'misleading', 'expired_closed', 'duplicate', 'scam', 'other'];

export function ModerationQueue({
  api,
  items,
  onChange,
}: {
  api: ApiClient;
  items: ModerationQueueItem[];
  onChange: (items: ModerationQueueItem[]) => void;
}) {
  const t = useTranslations('career.admin');
  const locale = useLocale();
  const busy = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function moderate(item: ModerationQueueItem, action: ModerationAction) {
    if (busy.current) return;
    busy.current = item.opportunityId;
    setPendingId(item.opportunityId);
    setError(null);
    setSaved(null);
    try {
      const result = await api.adminModerateOpportunity(item.opportunityId, {
        action,
        notes: notes[item.opportunityId]?.trim() || undefined,
      });
      onChange(items.map((row) => (
        row.opportunityId === result.opportunityId
          ? { ...row, moderationStatus: result.moderationStatus, reportCount: 0 }
          : row
      )));
      setSaved(t('moderation_saved'));
    } catch {
      setError(t('moderation_failed'));
    } finally {
      busy.current = null;
      setPendingId(null);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('moderation_title')}</h2>
      <p className="mt-2 text-sm text-career-muted">{t('moderation_body')}</p>
      {items.length === 0 ? <p className="mt-3 text-sm text-career-ink">{t('moderation_empty')}</p> : null}
      <ul className="mt-3 grid grid-cols-1 gap-4">
        {items.map((item) => {
          const working = pendingId === item.opportunityId;
          return (
            <li key={item.opportunityId} className="rounded-md border border-career-line p-3">
              <h3 className="text-base font-semibold text-career-ink">{item.title}</h3>
              <p className="mt-1 text-sm text-career-muted">{item.organization ?? t('moderation_org_missing')} · {item.provider}</p>
              <p className="mt-2 text-sm text-career-ink">{statusLabel(t, item.moderationStatus)}</p>
              <p className="mt-1 text-sm text-career-ink">{t('moderation_reports', { count: item.reportCount })}</p>
              <p className="mt-1 text-sm text-career-muted">{t('moderation_checked', { date: item.checkedAt.slice(0, 10) })}</p>
              <p className="mt-1 text-sm text-career-muted">{t('moderation_reported', { date: item.latestReportAt.slice(0, 10) })}</p>
              {item.latestReasons.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {item.latestReasons.map((reason) => (
                    <li key={reason} className="text-sm text-career-ink">{reasonLabel(t, reason)}</li>
                  ))}
                </ul>
              ) : null}
              {item.reportNotes.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {item.reportNotes.map((note, index) => (
                    <li key={`${item.opportunityId}-note-${index}`} className="text-sm text-career-ink">{t('moderation_note')}: {note}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 space-y-1.5">
                <label htmlFor={`review-note-${item.opportunityId}`} className="block text-sm font-semibold text-career-ink">{t('moderation_notes_label')}</label>
                <textarea
                  id={`review-note-${item.opportunityId}`}
                  className="block min-h-[6rem] w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-base text-career-ink focus:border-career-navy focus:outline-none focus:ring-2 focus:ring-career-orange-text/40"
                  maxLength={2000}
                  value={notes[item.opportunityId] ?? ''}
                  onChange={(event) => setNotes((current) => ({ ...current, [item.opportunityId]: event.target.value }))}
                />
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="button" disabled={working || pendingId !== null} onClick={() => void moderate(item, 'verify')}>{t('moderation_verify')}</Button>
                <Button type="button" variant="danger" disabled={working || pendingId !== null} onClick={() => void moderate(item, 'suppress')}>{t('moderation_suppress')}</Button>
                <Button type="button" variant="secondary" disabled={working || pendingId !== null} onClick={() => void moderate(item, 'dismiss')}>{t('moderation_dismiss')}</Button>
              </div>
              <a className="mt-3 inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href={`/${locale}/career/opportunities/${item.opportunityId}`}>
                {t('moderation_open')}
              </a>
            </li>
          );
        })}
      </ul>
      {saved ? <p className="mt-3 text-sm text-career-ink" role="status">{saved}</p> : null}
      {error ? <p className="mt-3 text-sm text-career-danger" role="alert">{error}</p> : null}
    </Card>
  );
}

function statusLabel(t: (key: string) => string, status: ModerationStatus): string {
  if (status === 'flagged') return t('moderation_status_flagged');
  if (status === 'under_review') return t('moderation_status_under_review');
  if (status === 'suppressed') return t('moderation_status_suppressed');
  if (status === 'verified') return t('moderation_status_verified');
  return t('moderation_status_unflagged');
}

function reasonLabel(t: (key: string) => string, reason: ReportReason): string {
  if (!REASONS.includes(reason)) return reason;
  return t(`moderation_reason_${reason}`);
}

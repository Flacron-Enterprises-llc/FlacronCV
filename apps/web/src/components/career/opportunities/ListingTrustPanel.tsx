'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  isApiError,
  type ApiClient,
  type OpportunityDetail,
  type ReportReason,
  type TrustSignalKey,
  type ViewerReport,
} from '@flacroncv/career-api-client';
import { Button } from '@/components/career/ui';

const REASONS: ReportReason[] = ['suspicious_fee', 'misleading', 'expired_closed', 'duplicate', 'scam', 'other'];

export function ListingTrustPanel({
  api,
  item,
  onChange,
}: {
  api: ApiClient;
  item: OpportunityDetail;
  onChange: (item: OpportunityDetail) => void;
}) {
  const t = useTranslations('career.opportunities');
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localReport, setLocalReport] = useState<ViewerReport | null>(null);

  const trust = item.trustSignals;
  const report = trust?.viewerReport ?? localReport;
  const confidence = trust?.sourceConfidence ?? (item.provider === 'paste' ? 'candidate_supplied' : 'provider_record');
  const sourcesCount = trust?.sourcesCount ?? 1;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    if (!reason) {
      setError(t('report_invalid'));
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const reported = await api.reportOpportunity(item.id, { reason, notes: notes.trim() || undefined });
      setOpen(false);
      try {
        onChange(await api.opportunity(item.id));
        setLocalReport(null);
      } catch {
        setLocalReport({
          reportId: reported.reportId,
          reason: reported.reason,
          status: 'pending',
          reviewAction: null,
          createdAt: item.checkedAt,
        });
      }
    } catch (caught) {
      setError(isApiError(caught, 'validation_error') ? t('report_invalid') : t('report_failed'));
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  const status = reportStatus(t, report);

  return (
    <section className="rounded-lg border border-career-line bg-career-surface p-4" aria-labelledby="listing-checks">
      <h2 id="listing-checks" className="text-lg font-semibold text-career-ink">{t('trust_title')}</h2>
      <p className="mt-2 text-sm text-career-muted">{t('trust_disclaimer')}</p>
      <p className="mt-3 text-sm text-career-ink">{t('checked', { date: item.checkedAt.slice(0, 10) })}</p>
      <p className="mt-2 text-sm text-career-ink">
        {confidence === 'multiple_sources'
          ? t('trust_confidence_multiple', { count: sourcesCount })
          : confidence === 'candidate_supplied'
            ? t('trust_confidence_candidate')
            : t('trust_confidence_provider')}
      </p>
      {item.label === 'expired' ? <p className="mt-2 text-sm text-career-warning">{t('trust_expired')}</p> : null}
      {trust && trust.signals.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {trust.signals.map((signal) => (
            <li key={signal.key} className={signalClass(signal.severity)}>
              {signalText(t, signal.key, sourcesCount, trust.reportCount)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-career-ink">{t('trust_none')}</p>
      )}
      {status ? <p className="mt-3 text-sm text-career-ink" role="status">{status}</p> : null}
      {open ? (
        <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void submit(event)} aria-busy={submitting}>
          <h3 className="text-base font-semibold text-career-ink">{t('report_title')}</h3>
          <div className="space-y-1.5">
            <label htmlFor="listing-report-reason" className="block text-sm font-semibold text-career-ink">{t('report_reason')}</label>
            <select
              id="listing-report-reason"
              className="block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink focus:border-career-navy focus:outline-none focus:ring-2 focus:ring-career-orange-text/40"
              value={reason}
              onChange={(event) => setReason(event.target.value as ReportReason | '')}
              required
            >
              <option value="">{t('report_invalid')}</option>
              {REASONS.map((value) => (
                <option key={value} value={value}>{t(`reason_${value}`)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="listing-report-notes" className="block text-sm font-semibold text-career-ink">{t('report_notes')}</label>
            <textarea
              id="listing-report-notes"
              className="block min-h-[6rem] w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-base text-career-ink focus:border-career-navy focus:outline-none focus:ring-2 focus:ring-career-orange-text/40"
              value={notes}
              maxLength={2000}
              onChange={(event) => setNotes(event.target.value)}
            />
            <p className="text-sm text-career-muted">{t('report_hint')}</p>
          </div>
          {error ? <p className="text-sm text-career-danger" role="alert">{error}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" loading={submitting} loadingLabel={t('report_submitting')}>{t('report_submit')}</Button>
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => setOpen(false)}>{t('report_cancel')}</Button>
          </div>
        </form>
      ) : (
        <Button type="button" className="mt-4" variant="secondary" onClick={() => { setError(null); setOpen(true); }}>
          {report?.status === 'pending' ? t('report_update') : t('report_open')}
        </Button>
      )}
    </section>
  );
}

function signalClass(severity: 'info' | 'warning' | 'alert'): string {
  if (severity === 'alert') return 'text-sm text-career-danger';
  if (severity === 'warning') return 'text-sm text-career-warning';
  return 'text-sm text-career-ink';
}

function signalText(
  t: (key: string, values?: Record<string, string | number>) => string,
  key: TrustSignalKey,
  sourcesCount: number,
  reportCount: number,
): string {
  if (key === 'duplicate_sources') return t('signal_duplicate_sources', { count: sourcesCount });
  if (key === 'user_flagged') return t('signal_user_flagged', { count: reportCount });
  return t(`signal_${key}`);
}

function reportStatus(
  t: (key: string) => string,
  report: ViewerReport | null,
): string | null {
  if (!report) return null;
  if (report.status === 'pending') return t('report_pending');
  if (report.reviewAction === 'suppress') return t('report_reviewed_suppress');
  if (report.reviewAction === 'verify') return t('report_reviewed_verify');
  return t('report_reviewed_dismiss');
}

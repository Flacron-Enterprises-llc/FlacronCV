import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  MatchResult,
  OpportunityCompensation,
  OpportunityDetail,
  OpportunityItem,
  PaidMatch,
  ReportReason,
  ResumeList,
  TrustSignal,
  TrustSignalSummary,
  ViewerReport,
} from '../../../../../packages/career-api-client/src/types';
import { isStaleListing } from '../../../../../packages/career-shared/src/opportunities';
import { t } from '../../i18n';
import { labelMap } from '../career-view';

/**
 * Pure view logic for the mobile opportunity screens (list, paste, detail,
 * listing checks, resume comparison, map list). Copy lives in the `careerJobs`
 * namespace and mirrors the website's `career.opportunities` / `career.scope` strings. Nothing here grants
 * access or claims a listing is safe; the career API decides.
 */

/** English value of {@link notStated} (kept for tests and comparisons). */
export const NOT_STATED = 'Not stated';

/** "Not stated" in the current language. */
export function notStated(): string {
  return t('careerJobs.notStated');
}

/** Same limits as the API's PasteDto. */
export const PASTE_MAX = 20000;
export const SOURCE_URL_MAX = 2000;
export const REPORT_NOTES_MAX = 2000;

export function payText(compensation: OpportunityCompensation): string {
  const { minimum, maximum, currency, period } = compensation;
  if (minimum === null && maximum === null) return notStated();
  const amount = minimum !== null && maximum !== null ? `${minimum}–${maximum}` : String(minimum ?? maximum);
  return [amount, currency, period].filter((part): part is string => part !== null && part.length > 0).join(' ');
}

export function sponsorshipText(sponsorship: OpportunityItem['sponsorship']): string {
  if (sponsorship === 'stated_yes') return t('careerJobs.sponsorshipYes');
  if (sponsorship === 'stated_no') return t('careerJobs.sponsorshipNo');
  return notStated();
}

export function locationsText(locations: string[]): string {
  return locations.length > 0 ? locations.join(', ') : notStated();
}

export function isStale(checkedAt: string, nowMs: number): boolean {
  return isStaleListing(checkedAt, nowMs);
}

/** Only web links open outside the app; anything else in a pasted URL is ignored. */
export function openableUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return /^https?:\/\/[^\s]+$/i.test(trimmed) ? trimmed : null;
}

export type PasteCheck = { ok: true; input: { text: string; sourceUrl?: string } } | { ok: false; message: string };

export function checkPaste(text: string, sourceUrl: string): PasteCheck {
  const body = text.trim();
  if (body.length === 0) return { ok: false, message: t('careerJobs.paste.empty') };
  if (body.length > PASTE_MAX) return { ok: false, message: t('careerJobs.paste.tooLong', { max: PASTE_MAX }) };
  const url = sourceUrl.trim();
  if (url.length === 0) return { ok: true, input: { text: body } };
  if (url.length > SOURCE_URL_MAX || !openableUrl(url)) {
    return { ok: false, message: t('careerJobs.paste.badUrl') };
  }
  return { ok: true, input: { text: body, sourceUrl: url } };
}

const REPORT_REASON_LABEL = labelMap('careerJobs.reasons', ['suspicious_fee', 'misleading', 'expired_closed', 'duplicate', 'scam', 'other'] as const);

/** Report reasons; `label` is read in the current language. */
export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = (
  ['suspicious_fee', 'misleading', 'expired_closed', 'duplicate', 'scam', 'other'] as const
).map((value) => ({
  value,
  get label() {
    return REPORT_REASON_LABEL[value];
  },
}));

export function trustDisclaimer(): string {
  return t('careerJobs.trust.disclaimer');
}

export function trustNone(): string {
  return t('careerJobs.trust.none');
}

/** The trust summary: the dedicated /trust answer when it loaded, else the one embedded in the detail. */
export function pickTrust(item: OpportunityDetail, trust: TrustSignalSummary | undefined): TrustSignalSummary | null {
  return trust ?? item.trustSignals ?? null;
}

export function confidenceText(item: Pick<OpportunityItem, 'provider'>, trust: TrustSignalSummary | null): string {
  const confidence = trust?.sourceConfidence ?? (item.provider === 'paste' ? 'candidate_supplied' : 'provider_record');
  if (confidence === 'multiple_sources') return t('careerJobs.trust.multiple', { count: trust?.sourcesCount ?? 1 });
  if (confidence === 'candidate_supplied') return t('careerJobs.trust.candidate');
  return t('careerJobs.trust.provider');
}

export function signalText(signal: Pick<TrustSignal, 'key'>, sourcesCount: number, reportCount: number): string {
  switch (signal.key) {
    case 'verified_employer':
      return t('careerJobs.signals.verified_employer');
    case 'stale_listing':
      return t('careerJobs.signals.stale_listing');
    case 'suspicious_fee':
      return t('careerJobs.signals.suspicious_fee');
    case 'conflicting_compensation':
      return t('careerJobs.signals.conflicting_compensation');
    case 'duplicate_sources':
      return t('careerJobs.signals.duplicate_sources', { count: sourcesCount });
    case 'user_flagged':
      return t('careerJobs.signals.user_flagged', { count: reportCount });
    case 'suppressed_listing':
      return t('careerJobs.signals.suppressed_listing');
  }
}

export function reportStatusText(report: ViewerReport | null): string | null {
  if (!report) return null;
  if (report.status === 'pending') return t('careerJobs.reportStatus.pending');
  if (report.reviewAction === 'suppress') return t('careerJobs.reportStatus.suppress');
  if (report.reviewAction === 'verify') return t('careerJobs.reportStatus.verify');
  return t('careerJobs.reportStatus.dismiss');
}

export function reportErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'validation_error') return t('careerJobs.report.invalid');
  if (error instanceof ApiError && error.code === 'network_error') return t('careerJobs.report.network');
  return t('careerJobs.report.failed');
}

export const FIT_LABEL: Record<MatchResult['fit'], string> = labelMap('careerJobs.fit', ['blocked', 'none', 'partial', 'strong'] as const);

export function notAScore(): string {
  return t('careerJobs.notAScore');
}

export interface MatchLine {
  key: string;
  kind: 'reason' | 'gap' | 'unknown';
  text: string;
}

export function matchLines(match: MatchResult): MatchLine[] {
  const lines: MatchLine[] = [];
  // The API returns one reason per matching fact; the same word on two facts reads as one line.
  const seen = new Set<string>();
  for (const reason of match.reasons) {
    if (seen.has(reason.token)) continue;
    seen.add(reason.token);
    lines.push({ key: `r-${reason.token}`, kind: 'reason', text: t('careerJobs.match.reason', { token: reason.token }) });
  }
  for (const gap of match.gaps) {
    lines.push({ key: `g-${gap.token}`, kind: 'gap', text: t('careerJobs.match.gap', { token: gap.token }) });
  }
  match.unknowns.forEach((unknown, index) => {
    const text =
      unknown.code === 'unconfirmed'
        ? t('careerJobs.match.unconfirmed', { token: unknown.token ?? '' })
        : unknown.code === 'pay'
          ? t('careerJobs.match.pay')
          : unknown.code === 'sponsorship'
            ? t('careerJobs.match.sponsorship')
            : t('careerJobs.match.location');
    lines.push({ key: `u-${unknown.code}-${unknown.factId ?? index}`, kind: 'unknown', text });
  });
  return lines;
}

/**
 * The API's overlap is a 0–1 text similarity between the confirmed facts and
 * the listing (fit is derived from it). Shown as a plain two-decimal measure,
 * never a percentage, so it does not read like a hiring chance.
 */
export function overlapText(overlap: number): string {
  const value = Number.isFinite(overlap) ? Math.min(1, Math.max(0, overlap)) : 0;
  return t('careerJobs.match.overlap', { value: value.toFixed(2) });
}

export function remainingAnalyses(analysis: OpportunityDetail['resumeAnalysis']): number {
  return Math.max(0, analysis.includedRemaining) + Math.max(0, analysis.packRemaining);
}

export function remainingText(analysis: OpportunityDetail['resumeAnalysis']): string {
  const count = remainingAnalyses(analysis);
  return t('careerJobs.remaining', { count });
}

/** After a paid comparison the detail shows the new allowance, as on the website. */
export function withPaidUsage(item: OpportunityDetail, paid: Pick<PaidMatch, 'usage'>): OpportunityDetail {
  return {
    ...item,
    resumeAnalysis: {
      ...item.resumeAnalysis,
      includedRemaining: paid.usage.includedRemaining,
      packRemaining: paid.usage.packRemaining,
    },
  };
}

export interface VersionChoice {
  resumeId: string;
  versionId: string;
  title: string;
  language: string;
}

/** Career CVs that have a saved version to compare with (the website uses the first one). */
export function versionChoices(list: ResumeList | undefined): VersionChoice[] {
  return (list?.items ?? [])
    .filter((resume): resume is typeof resume & { currentVersionId: string } => Boolean(resume.currentVersionId))
    .map((resume) => ({ resumeId: resume.id, versionId: resume.currentVersionId, title: resume.title, language: resume.language.toUpperCase() }));
}

export function compareErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'quota_exhausted') return t('careerJobs.compareErrors.quota');
    if (error.code === 'plan_upgrade_required' || error.code === 'capacity_exceeded') return t('careerJobs.compareErrors.notInPlan');
    if (error.code === 'feature_unavailable') return t('careerJobs.compareErrors.off');
    if (error.code === 'provider_unavailable') return t('careerJobs.compareErrors.provider');
    if (error.code === 'not_found') return t('careerJobs.compareErrors.notFound');
    if (error.code === 'network_error') return t('careerJobs.compareErrors.network');
  }
  return t('careerJobs.compareErrors.failed');
}

export function noTiles(): string {
  return t('careerJobs.map.noTiles');
}

export function mapErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'plan_upgrade_required') return t('careerJobs.map.errors.upgrade');
    if (error.code === 'quota_exhausted' || error.code === 'capacity_exceeded') return t('careerJobs.map.errors.quota');
    if (error.code === 'feature_unavailable') return t('careerJobs.map.errors.off');
    if (error.code === 'network_error') return t('careerJobs.map.errors.network');
  }
  return t('careerJobs.map.errors.failed');
}

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

/**
 * Pure view logic for the mobile opportunity screens (list, paste, detail,
 * listing checks, resume comparison, map list). Copy mirrors the website's
 * `career.opportunities` / `career.scope` English strings. Nothing here grants
 * access or claims a listing is safe; the career API decides.
 */

export const NOT_STATED = 'Not stated';

/** Same limits as the API's PasteDto. */
export const PASTE_MAX = 20000;
export const SOURCE_URL_MAX = 2000;
export const REPORT_NOTES_MAX = 2000;

export function payText(compensation: OpportunityCompensation): string {
  const { minimum, maximum, currency, period } = compensation;
  if (minimum === null && maximum === null) return NOT_STATED;
  const amount = minimum !== null && maximum !== null ? `${minimum}–${maximum}` : String(minimum ?? maximum);
  return [amount, currency, period].filter((part): part is string => part !== null && part.length > 0).join(' ');
}

export function sponsorshipText(sponsorship: OpportunityItem['sponsorship']): string {
  if (sponsorship === 'stated_yes') return 'Visa sponsorship stated';
  if (sponsorship === 'stated_no') return 'No visa sponsorship stated';
  return NOT_STATED;
}

export function locationsText(locations: string[]): string {
  return locations.length > 0 ? locations.join(', ') : NOT_STATED;
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
  if (body.length === 0) return { ok: false, message: 'Paste the text of the job advert first.' };
  if (body.length > PASTE_MAX) return { ok: false, message: `The advert is too long. Keep it under ${PASTE_MAX} characters.` };
  const url = sourceUrl.trim();
  if (url.length === 0) return { ok: true, input: { text: body } };
  if (url.length > SOURCE_URL_MAX || !openableUrl(url)) {
    return { ok: false, message: 'The link must start with http:// or https://, or leave it empty.' };
  }
  return { ok: true, input: { text: body, sourceUrl: url } };
}

export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'suspicious_fee', label: 'Asks for a fee' },
  { value: 'misleading', label: 'Misleading details' },
  { value: 'expired_closed', label: 'Expired or closed' },
  { value: 'duplicate', label: 'Duplicate listing' },
  { value: 'scam', label: 'Suspicious request' },
  { value: 'other', label: 'Something else' },
];

export const TRUST_DISCLAIMER = 'These checks show freshness, conflicts, and reports. They do not promise a listing is safe.';
export const TRUST_NONE = 'No extra warnings on the saved text. That is not a promise the listing is safe.';

/** The trust summary: the dedicated /trust answer when it loaded, else the one embedded in the detail. */
export function pickTrust(item: OpportunityDetail, trust: TrustSignalSummary | undefined): TrustSignalSummary | null {
  return trust ?? item.trustSignals ?? null;
}

export function confidenceText(item: Pick<OpportunityItem, 'provider'>, trust: TrustSignalSummary | null): string {
  const confidence = trust?.sourceConfidence ?? (item.provider === 'paste' ? 'candidate_supplied' : 'provider_record');
  if (confidence === 'multiple_sources') return `Matched across ${trust?.sourcesCount ?? 1} sources. A match is not a safety check.`;
  if (confidence === 'candidate_supplied') return 'Source: text you pasted. FlacronCV did not collect this from an employer feed.';
  return 'Source: a job-feed record. The feed is not a safety check.';
}

export function signalText(signal: Pick<TrustSignal, 'key'>, sourcesCount: number, reportCount: number): string {
  switch (signal.key) {
    case 'verified_employer':
      return 'A moderator confirmed this posting. That does not promise the role is open or safe.';
    case 'stale_listing':
      return 'Last checked more than 30 days ago. The employer site may have changed.';
    case 'suspicious_fee':
      return 'The text mentions an upfront fee or payment. Check the original listing before you apply.';
    case 'conflicting_compensation':
      return 'The saved pay range conflicts with itself: the minimum is higher than the maximum.';
    case 'duplicate_sources':
      return `This listing was matched across ${sourcesCount} sources.`;
    case 'user_flagged':
      return `${reportCount} open reports are waiting for review. This is not a confirmed finding.`;
    case 'suppressed_listing':
      return 'Removed from search after review.';
  }
}

export function reportStatusText(report: ViewerReport | null): string | null {
  if (!report) return null;
  if (report.status === 'pending') return 'Your report is waiting for review.';
  if (report.reviewAction === 'suppress') return 'A reviewer removed this listing from search.';
  if (report.reviewAction === 'verify') return 'A reviewer confirmed the posting after your report. That is not a safety promise.';
  return 'A reviewer looked at your report. The listing stays in search.';
}

export function reportErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'validation_error') return 'Choose a reason.';
  if (error instanceof ApiError && error.code === 'network_error') return 'No connection. The report was not saved.';
  return 'The report was not saved.';
}

export const FIT_LABEL: Record<MatchResult['fit'], string> = {
  blocked: 'Blocked',
  none: 'No overlap with your confirmed facts',
  partial: 'Partial overlap with your confirmed facts',
  strong: 'Strong overlap with your confirmed facts',
};

export const NOT_A_SCORE = 'This is not an employer score and it is not a hiring probability.';

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
    lines.push({ key: `r-${reason.token}`, kind: 'reason', text: `Your confirmed facts include ${reason.token}.` });
  }
  for (const gap of match.gaps) {
    lines.push({ key: `g-${gap.token}`, kind: 'gap', text: `In the listing, not in your confirmed facts: ${gap.token}.` });
  }
  match.unknowns.forEach((unknown, index) => {
    const text =
      unknown.code === 'unconfirmed'
        ? `${unknown.token ?? ''} is only on a fact you have not confirmed.`
        : unknown.code === 'pay'
          ? 'Pay was not stated.'
          : unknown.code === 'sponsorship'
            ? 'Sponsorship was not stated.'
            : 'Location was not stated.';
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
  return `Wording overlap with your confirmed facts: ${value.toFixed(2)} on a scale from 0 (none) to 1 (same wording).`;
}

export function remainingAnalyses(analysis: OpportunityDetail['resumeAnalysis']): number {
  return Math.max(0, analysis.includedRemaining) + Math.max(0, analysis.packRemaining);
}

export function remainingText(analysis: OpportunityDetail['resumeAnalysis']): string {
  const count = remainingAnalyses(analysis);
  return `${count} resume ${count === 1 ? 'analysis' : 'analyses'} remaining.`;
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
    if (error.code === 'quota_exhausted') return 'No resume analyses left. The listing is still here.';
    if (error.code === 'plan_upgrade_required' || error.code === 'capacity_exceeded') return 'Your career plan does not include resume analyses.';
    if (error.code === 'feature_unavailable') return 'Resume analysis is switched off.';
    if (error.code === 'provider_unavailable') return 'Needs the AI provider, which is not configured in this environment. Nothing was charged.';
    if (error.code === 'not_found') return 'That CV version or listing no longer exists. No analysis was used.';
    if (error.code === 'network_error') return 'No connection. Try again; retrying the same comparison will not charge twice.';
  }
  return 'The comparison was not saved.';
}

export const NO_TILES = 'No map tiles are connected. Locations stay approximate, so the listings are shown as a list.';

export function mapErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'plan_upgrade_required') return 'Map sessions start on a higher plan. Nothing was saved.';
    if (error.code === 'quota_exhausted' || error.code === 'capacity_exceeded') return 'The map session allowance is used up. The list stays available.';
    if (error.code === 'feature_unavailable') return 'Map sessions are switched off. Nothing was changed.';
    if (error.code === 'network_error') return 'No connection. Try again; retrying the same start will not charge twice.';
  }
  return 'That session was not started. Nothing extra was used.';
}

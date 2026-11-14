import { STALE_LISTING_DAYS, isStaleListing } from './opportunities';

export type ModerationStatus = 'unflagged' | 'flagged' | 'under_review' | 'verified' | 'suppressed';

export type ReportReason =
  | 'suspicious_fee'
  | 'misleading'
  | 'expired_closed'
  | 'duplicate'
  | 'scam'
  | 'other';

export type ModerationAction = 'verify' | 'suppress' | 'dismiss';

export type TrustSignalKey =
  | 'verified_employer'
  | 'stale_listing'
  | 'suspicious_fee'
  | 'conflicting_compensation'
  | 'duplicate_sources'
  | 'user_flagged'
  | 'suppressed_listing';

export interface TrustSignal {
  key: TrustSignalKey;
  severity: 'info' | 'warning' | 'alert';
  message: string;
}

export interface ViewerReport {
  reportId: string;
  reason: ReportReason;
  status: 'pending' | 'reviewed';
  reviewAction: ModerationAction | null;
  createdAt: string;
}

/** How the listing reached FlacronCV. This is provenance, not a safety verdict. */
export type SourceConfidence = 'candidate_supplied' | 'provider_record' | 'multiple_sources';

export interface TrustSignalSummary {
  moderationStatus: ModerationStatus;
  isVerified: boolean;
  isSuppressed: boolean;
  signals: TrustSignal[];
  reportCount: number;
  sourcesCount: number;
  sourceConfidence: SourceConfidence;
  viewerReport: ViewerReport | null;
}

export interface ReportOpportunityInput {
  reason: ReportReason;
  notes?: string;
}

export interface ModerateOpportunityInput {
  action: ModerationAction;
  notes?: string;
}

export interface ModerationQueueItem {
  opportunityId: string;
  title: string;
  organization: string | null;
  provider: string;
  moderationStatus: ModerationStatus;
  reportCount: number;
  latestReportAt: string;
  latestReasons: ReportReason[];
  reportNotes: string[];
  checkedAt: string;
}

const SUSPICIOUS_FEE_REGEX = /(wire transfer|pay upfront|payment required|application fee|training fee|registration fee|western union|crypto payment|buy equipment upfront)/i;


export function detectSuspiciousPatterns(text: string): boolean {
  return SUSPICIOUS_FEE_REGEX.test(text);
}

export function sourceConfidenceFor(provider: string, sourcesCount: number): SourceConfidence {
  if (sourcesCount > 1) return 'multiple_sources';
  if (provider === 'paste') return 'candidate_supplied';
  return 'provider_record';
}

export function computeTrustSignals(params: {
  moderationStatus: ModerationStatus;
  checkedAtIso: string;
  nowMs: number;
  sourcesCount: number;
  reportCount: number;
  provider?: string;
  description?: string;
  compensation?: { minimum: number | null; maximum: number | null };
  viewerReport?: ViewerReport | null;
}): TrustSignalSummary {
  const {
    moderationStatus,
    checkedAtIso,
    nowMs,
    sourcesCount,
    reportCount,
    provider = '',
    description = '',
    compensation,
    viewerReport = null,
  } = params;
  const signals: TrustSignal[] = [];

  const isVerified = moderationStatus === 'verified';
  const isSuppressed = moderationStatus === 'suppressed';

  if (isVerified) {
    signals.push({
      key: 'verified_employer',
      severity: 'info',
      message: 'A moderator confirmed this posting. Confirmation does not promise the role is open or safe.',
    });
  }

  if (isSuppressed) {
    signals.push({
      key: 'suppressed_listing',
      severity: 'alert',
      message: 'Removed from search after review.',
    });
  }

  if (sourcesCount > 1) {
    signals.push({
      key: 'duplicate_sources',
      severity: 'info',
      message: `Matched across ${sourcesCount} sources. A match is not a safety check.`,
    });
  }

  // One staleness rule for search, detail and trust signals (STALE_LISTING_DAYS).
  if (isStaleListing(checkedAtIso, nowMs)) {
    signals.push({
      key: 'stale_listing',
      severity: 'warning',
      message: `Listing checked over ${STALE_LISTING_DAYS} days ago. Availability may have changed on the employer site.`,
    });
  }

  // Check suspicious fee keywords
  if (detectSuspiciousPatterns(description)) {
    signals.push({
      key: 'suspicious_fee',
      severity: 'alert',
      message: 'The text mentions an upfront fee or payment. This is a warning about the wording, not a confirmed finding.',
    });
  }

  // Check conflicting compensation
  if (
    compensation &&
    compensation.minimum !== null &&
    compensation.maximum !== null &&
    compensation.minimum > compensation.maximum
  ) {
    signals.push({
      key: 'conflicting_compensation',
      severity: 'warning',
      message: 'Conflicting salary information: minimum exceeds maximum in posted data.',
    });
  }

  // Check user reports
  if (reportCount > 0 || moderationStatus === 'flagged' || moderationStatus === 'under_review') {
    signals.push({
      key: 'user_flagged',
      severity: 'warning',
      message: `${reportCount} open report(s). Review is not finished, so this is not a confirmed finding.`,
    });
  }

  return {
    moderationStatus,
    isVerified,
    isSuppressed,
    signals,
    reportCount,
    sourcesCount,
    sourceConfidence: sourceConfidenceFor(provider, sourcesCount),
    viewerReport,
  };
}

import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { MatchResult, OpportunityDetail, ResumeList, TrustSignalSummary } from '../../../../../packages/career-api-client/src/types';
import {
  checkPaste,
  compareErrorMessage,
  confidenceText,
  FIT_LABEL,
  isStale,
  locationsText,
  mapErrorMessage,
  matchLines,
  NOT_STATED,
  openableUrl,
  overlapText,
  payText,
  pickTrust,
  remainingAnalyses,
  remainingText,
  REPORT_REASONS,
  reportErrorMessage,
  reportStatusText,
  signalText,
  sponsorshipText,
  versionChoices,
  withPaidUsage,
} from './opportunities';

const detail: OpportunityDetail = {
  id: 'o1',
  category: 'job',
  provider: 'paste',
  title: 'Analyst',
  organization: null,
  status: 'open',
  label: 'open',
  sourceUrl: null,
  checkedAt: '2026-11-01T00:00:00.000Z',
  deadline: null,
  locations: [],
  compensation: { minimum: null, maximum: null, currency: null, period: null },
  sponsorship: 'unknown',
  description: 'Text',
  resumeAnalysis: { includedRemaining: 3, packRemaining: 2, renewalDate: null },
};

describe('listing fields', () => {
  it('says not stated for missing pay, sponsorship and location', () => {
    expect(payText(detail.compensation)).toBe(NOT_STATED);
    expect(sponsorshipText('unknown')).toBe(NOT_STATED);
    expect(locationsText([])).toBe(NOT_STATED);
  });

  it('formats a pay range or a single bound with currency and period', () => {
    expect(payText({ minimum: 30000, maximum: 40000, currency: 'GBP', period: 'year' })).toBe('30000–40000 GBP year');
    expect(payText({ minimum: null, maximum: 20, currency: null, period: 'hour' })).toBe('20 hour');
    expect(sponsorshipText('stated_yes')).toMatch(/sponsorship stated/);
    expect(locationsText(['Leeds', 'Remote'])).toBe('Leeds, Remote');
  });

  it('marks a listing stale after the shared threshold', () => {
    const checked = '2026-11-01T00:00:00.000Z';
    expect(isStale(checked, Date.parse('2026-11-05T00:00:00.000Z'))).toBe(false);
    expect(isStale(checked, Date.parse('2026-12-20T00:00:00.000Z'))).toBe(true);
    expect(isStale('not a date', Date.now())).toBe(false);
  });

  it('opens only http(s) links', () => {
    expect(openableUrl(' https://example.test/job ')).toBe('https://example.test/job');
    expect(openableUrl('javascript:alert(1)')).toBeNull();
    expect(openableUrl('file:///etc/passwd')).toBeNull();
    expect(openableUrl(null)).toBeNull();
  });
});

describe('checkPaste', () => {
  it('needs text and trims it', () => {
    expect(checkPaste('   ', '').ok).toBe(false);
    expect(checkPaste('  Analyst role  ', '')).toEqual({ ok: true, input: { text: 'Analyst role' } });
  });

  it('accepts an http(s) link and refuses others', () => {
    expect(checkPaste('x', 'https://a.test/1')).toEqual({ ok: true, input: { text: 'x', sourceUrl: 'https://a.test/1' } });
    expect(checkPaste('x', 'ftp://a.test').ok).toBe(false);
  });

  it('refuses text over the API limit', () => {
    expect(checkPaste('a'.repeat(20001), '').ok).toBe(false);
  });
});

describe('listing checks', () => {
  it('has the six report reasons the API accepts', () => {
    expect(REPORT_REASONS.map((r) => r.value)).toEqual(['suspicious_fee', 'misleading', 'expired_closed', 'duplicate', 'scam', 'other']);
  });

  it('prefers the dedicated trust answer and falls back to the embedded one', () => {
    const embedded: TrustSignalSummary = { moderationStatus: 'unflagged', isVerified: false, isSuppressed: false, signals: [], reportCount: 0, sourcesCount: 1, sourceConfidence: 'candidate_supplied', viewerReport: null };
    expect(pickTrust(detail, undefined)).toBeNull();
    expect(pickTrust({ ...detail, trustSignals: embedded }, undefined)).toBe(embedded);
    const fresh = { ...embedded, reportCount: 2 };
    expect(pickTrust({ ...detail, trustSignals: embedded }, fresh)).toBe(fresh);
  });

  it('describes the source without promising safety', () => {
    expect(confidenceText({ provider: 'paste' }, null)).toMatch(/text you pasted/);
    expect(confidenceText({ provider: 'feed' }, null)).toMatch(/job-feed record/);
    expect(
      confidenceText({ provider: 'feed' }, { moderationStatus: 'unflagged', isVerified: false, isSuppressed: false, signals: [], reportCount: 0, sourcesCount: 3, sourceConfidence: 'multiple_sources', viewerReport: null }),
    ).toMatch(/3 sources/);
  });

  it('words counted signals with their counts', () => {
    expect(signalText({ key: 'duplicate_sources' }, 4, 0)).toMatch(/4 sources/);
    expect(signalText({ key: 'user_flagged' }, 1, 2)).toMatch(/^2 open reports/);
    expect(signalText({ key: 'suppressed_listing' }, 1, 0)).toBe('Removed from search after review.');
  });

  it('shows the viewer report status', () => {
    expect(reportStatusText(null)).toBeNull();
    const base = { reportId: 'r', reason: 'scam' as const, createdAt: '' };
    expect(reportStatusText({ ...base, status: 'pending', reviewAction: null })).toMatch(/waiting/);
    expect(reportStatusText({ ...base, status: 'reviewed', reviewAction: 'suppress' })).toMatch(/removed/);
    expect(reportStatusText({ ...base, status: 'reviewed', reviewAction: 'dismiss' })).toMatch(/stays in search/);
  });

  it('maps report failures', () => {
    expect(reportErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error' }))).toBe('Choose a reason.');
    expect(reportErrorMessage(new Error('x'))).toBe('The report was not saved.');
  });
});

describe('comparison', () => {
  const match: MatchResult = {
    id: 'm',
    fit: 'partial',
    overlap: 2,
    reasons: [{ code: 'confirmed_overlap', factId: 'f1', token: 'sql' }],
    gaps: [{ code: 'not_in_facts', token: 'python' }],
    unknowns: [{ code: 'pay' }, { code: 'unconfirmed', factId: 'f2', token: 'excel' }],
    profileVersion: 1,
    opportunityId: 'o1',
    opportunityRevisionId: 'rev',
    resumeVersionId: 'v1',
    createdAt: '',
  };

  it('lists reasons, gaps and unknowns in the website order', () => {
    const lines = matchLines(match);
    expect(lines.map((l) => l.kind)).toEqual(['reason', 'gap', 'unknown', 'unknown']);
    expect(lines[0].text).toBe('Your confirmed facts include sql.');
    expect(lines[1].text).toBe('In the listing, not in your confirmed facts: python.');
    expect(lines[2].text).toBe('Pay was not stated.');
    expect(lines[3].text).toBe('excel is only on a fact you have not confirmed.');
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
    expect(FIT_LABEL[match.fit]).toMatch(/Partial/);
    expect(overlapText(0.5793)).toMatch(/: 0\.58 on a scale from 0/);
    expect(overlapText(Number.NaN)).toMatch(/: 0\.00 /);
    expect(overlapText(0.5793)).not.toMatch(/%/);
  });

  it('shows a word matched on several facts once', () => {
    const lines = matchLines({
      ...match,
      reasons: [
        { code: 'confirmed_overlap', factId: 'f1', token: 'sql' },
        { code: 'confirmed_overlap', factId: 'f3', token: 'sql' },
        { code: 'confirmed_overlap', factId: 'f3', token: 'data' },
      ],
    });
    expect(lines.filter((l) => l.kind === 'reason').map((l) => l.text)).toEqual([
      'Your confirmed facts include sql.',
      'Your confirmed facts include data.',
    ]);
  });

  it('counts remaining analyses and applies a paid result', () => {
    expect(remainingAnalyses(detail.resumeAnalysis)).toBe(5);
    expect(remainingText({ includedRemaining: 1, packRemaining: 0, renewalDate: null })).toBe('1 resume analysis remaining.');
    const updated = withPaidUsage(detail, { usage: { unit: 'resume_analysis', includedGranted: 0, includedRemaining: 0, packRemaining: 1, packHeld: 0, renewalDate: '', ledgerState: 'committed' } });
    expect(remainingAnalyses(updated.resumeAnalysis)).toBe(1);
    expect(detail.resumeAnalysis.includedRemaining).toBe(3);
  });

  it('offers only CVs with a saved version', () => {
    const list = {
      items: [
        { id: 'a', title: 'CV A', language: 'en', templateId: 't', createdAt: '', currentVersionId: 'va' },
        { id: 'b', title: 'CV B', language: 'fr', templateId: 't', createdAt: '', currentVersionId: null },
      ],
      documentCredit: { includedRemaining: 0, packRemaining: 0, renewalDate: null },
    } as ResumeList;
    expect(versionChoices(list)).toEqual([{ resumeId: 'a', versionId: 'va', title: 'CV A', language: 'EN' }]);
    expect(versionChoices(undefined)).toEqual([]);
  });

  it('maps comparison and map failures to clear messages', () => {
    expect(compareErrorMessage(new ApiError(402, 'quota_exhausted', { code: 'quota_exhausted' }))).toMatch(/No resume analyses left/);
    expect(compareErrorMessage(new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' }))).toMatch(/AI provider/);
    expect(compareErrorMessage(new Error('x'))).toBe('The comparison was not saved.');
    expect(mapErrorMessage(new ApiError(402, 'quota_exhausted', { code: 'quota_exhausted' }))).toMatch(/used up/);
    expect(mapErrorMessage(new Error('x'))).toMatch(/not started/);
  });
});

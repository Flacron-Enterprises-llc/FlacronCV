import { describe, expect, it } from 'vitest';
import { computeTrustSignals, detectSuspiciousPatterns, sourceConfidenceFor } from './opportunity-trust';

describe('Opportunity Trust & Moderation', () => {
  const nowMs = new Date('2026-10-17T12:00:00Z').getTime();

  it('detects suspicious payment and wire transfer patterns', () => {
    expect(detectSuspiciousPatterns('Candidates must submit a wire transfer for background verification.')).toBe(true);
    expect(detectSuspiciousPatterns('Please send money via Western Union for training materials.')).toBe(true);
    expect(detectSuspiciousPatterns('Standard 401k and competitive compensation.')).toBe(false);
  });

  it('computes trust signals for verified listings', () => {
    const summary = computeTrustSignals({
      moderationStatus: 'verified',
      checkedAtIso: '2026-10-15T00:00:00Z',
      nowMs,
      sourcesCount: 2,
      reportCount: 0,
      description: 'Senior Software Engineer with modern TypeScript experience.',
      compensation: { minimum: 120000, maximum: 160000 },
    });

    expect(summary.isVerified).toBe(true);
    expect(summary.isSuppressed).toBe(false);
    expect(summary.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'verified_employer', severity: 'info' }),
        expect.objectContaining({ key: 'duplicate_sources', severity: 'info' }),
      ]),
    );
  });

  it('flags stale listings, conflicting compensation, and suspicious fees', () => {
    const summary = computeTrustSignals({
      moderationStatus: 'flagged',
      checkedAtIso: '2026-08-01T00:00:00Z', // > 30 days ago
      nowMs,
      sourcesCount: 1,
      reportCount: 3,
      description: 'Great role, pay upfront for training fee before start date.',
      compensation: { minimum: 200000, maximum: 100000 }, // min > max
    });

    expect(summary.moderationStatus).toBe('flagged');
    expect(summary.reportCount).toBe(3);
    const keys = summary.signals.map((s) => s.key);
    expect(keys).toContain('stale_listing');
    expect(keys).toContain('suspicious_fee');
    expect(keys).toContain('conflicting_compensation');
    expect(keys).toContain('user_flagged');
  });

  it('marks suppressed listings as suppressed with alert signal', () => {
    const summary = computeTrustSignals({
      moderationStatus: 'suppressed',
      checkedAtIso: '2026-10-16T00:00:00Z',
      nowMs,
      sourcesCount: 1,
      reportCount: 5,
    });

    expect(summary.isSuppressed).toBe(true);
    expect(summary.signals).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'suppressed_listing', severity: 'alert' })]),
    );
  });

  it('explains a flag without calling an employer fraudulent or promising safety', () => {
    const summary = computeTrustSignals({
      moderationStatus: 'unflagged',
      checkedAtIso: '2026-10-01T00:00:00Z',
      nowMs,
      sourcesCount: 2,
      reportCount: 1,
      provider: 'paste',
      description: 'Pay upfront with a wire transfer before the interview.',
      compensation: { minimum: 90000, maximum: 40000 },
    });
    const text = summary.signals.map((signal) => signal.message).join(' ');
    expect(text).not.toMatch(/fraud|guaranteed/i);
    expect(summary.sourceConfidence).toBe('multiple_sources');
    expect(sourceConfidenceFor('paste', 1)).toBe('candidate_supplied');
    expect(sourceConfidenceFor('adzuna', 1)).toBe('provider_record');
    expect(summary.viewerReport).toBeNull();
  });
});

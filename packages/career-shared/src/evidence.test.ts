import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_LABELS,
  EVIDENCE_TYPES,
  defaultEvidenceLabel,
  effectiveEvidenceLabel,
  isEvidenceLabel,
  isEvidenceType,
  safeEvidenceUrl,
  verificationActive,
} from './evidence';

describe('Career Evidence Vault (CV11)', () => {
  it('recognizes valid evidence types', () => {
    for (const type of EVIDENCE_TYPES) {
      expect(isEvidenceType(type)).toBe(true);
    }
    expect(isEvidenceType('patent')).toBe(false);
    expect(isEvidenceType(123)).toBe(false);
  });

  it('recognizes valid evidence labels', () => {
    for (const label of EVIDENCE_LABELS) {
      expect(isEvidenceLabel(label)).toBe(true);
    }
    expect(isEvidenceLabel('guaranteed_accurate')).toBe(false);
  });

  it('assigns truthful default labels without premature verification claims', () => {
    // Spec §25: An uploaded credential is labeled evidence attached until its issuer is checked
    expect(defaultEvidenceLabel('credential', true)).toBe('evidence_attached');
    expect(defaultEvidenceLabel('work_sample', true)).toBe('evidence_attached');

    // Self-reported without attachment is self_reported
    expect(defaultEvidenceLabel('credential', false)).toBe('self_reported');
    expect(defaultEvidenceLabel('project', false)).toBe('self_reported');

    // A self-entered reference is NEVER default labeled reference_confirmed
    expect(defaultEvidenceLabel('reference', false)).toBe('self_reported');
    expect(defaultEvidenceLabel('reference', true)).toBe('evidence_attached');
  });

  it('derives the shown label from active checks only', () => {
    const today = '2026-11-14';
    const check = (over: Partial<{ label: 'issuer_verified' | 'assessment_completed' | 'reference_confirmed'; checkedOn: string; expiresOn: string | null; revokedAt: string | null }>) => ({
      label: 'issuer_verified' as const,
      checkedOn: '2026-01-01',
      createdAt: '2026-01-01T00:00:00Z',
      expiresOn: null,
      revokedAt: null,
      ...over,
    });
    expect(effectiveEvidenceLabel('evidence_attached', [], today)).toBe('evidence_attached');
    expect(effectiveEvidenceLabel('evidence_attached', [check({})], today)).toBe('issuer_verified');
    expect(effectiveEvidenceLabel('evidence_attached', [check({ expiresOn: '2026-11-13' })], today)).toBe('evidence_attached');
    expect(effectiveEvidenceLabel('evidence_attached', [check({ expiresOn: '2026-11-14' })], today)).toBe('issuer_verified');
    expect(effectiveEvidenceLabel('self_reported', [check({ revokedAt: '2026-05-01T00:00:00Z' })], today)).toBe('self_reported');
    expect(
      effectiveEvidenceLabel('self_reported', [check({ label: 'reference_confirmed', checkedOn: '2026-06-01' }), check({ checkedOn: '2026-02-01' })], today),
    ).toBe('reference_confirmed');
    // A stored verified label with no recorded check is not trusted.
    expect(effectiveEvidenceLabel('issuer_verified', [], today, true)).toBe('evidence_attached');
    expect(verificationActive({ expiresOn: null, revokedAt: null }, today)).toBe(true);
  });

  it('keeps only http and https links', () => {
    expect(safeEvidenceUrl('https://example.test/cert')).toBe('https://example.test/cert');
    expect(safeEvidenceUrl(' http://example.test ')).toBe('http://example.test/');
    expect(safeEvidenceUrl('javascript:alert(1)')).toBeNull();
    expect(safeEvidenceUrl('data:text/html,hi')).toBeNull();
    expect(safeEvidenceUrl('https://user:pw@example.test')).toBeNull();
    expect(safeEvidenceUrl('not a url')).toBeNull();
  });
});

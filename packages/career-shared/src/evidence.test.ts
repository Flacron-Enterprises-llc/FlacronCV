import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_LABELS,
  EVIDENCE_TYPES,
  defaultEvidenceLabel,
  isEvidenceLabel,
  isEvidenceType,
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
});

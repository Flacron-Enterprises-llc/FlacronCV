import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import {
  canSaveOwnership,
  evidenceErrorMessage,
  evidenceResultMessage,
  initialCriteria,
  OWNERSHIP_MAX,
  reportBalanceText,
  rubricCheckInput,
  rubricStatusLine,
  rubricWeight,
  savedOwnership,
  toggleId,
} from './learning';

const brief = {
  rubrics: [
    { id: 'c1', name: 'Works', description: '', weight: 60, evidenceType: 'project' as const },
    { id: 'c2', name: 'Clear', description: '', weight: 40, evidenceType: 'work_sample' as const },
  ],
  rubricCheck: {
    assessment: 'self_check' as const,
    evidenceIds: ['e1'],
    criteria: [{ criterionId: 'c1', met: true, note: 'repo' }],
    checkedAt: '2026-05-02T10:00:00Z',
  },
  ownershipStatement: null,
};

describe('ownership statement', () => {
  it('is never prefilled and only saves new, non-empty text within the limit', () => {
    expect(savedOwnership(brief)).toBe('');
    expect(canSaveOwnership('  ', brief)).toBe(false);
    expect(canSaveOwnership('I built it', brief)).toBe(true);
    expect(canSaveOwnership(' I built it ', { ownershipStatement: 'I built it' })).toBe(false);
    expect(canSaveOwnership('x'.repeat(OWNERSHIP_MAX + 1), brief)).toBe(false);
  });
});

describe('rubric self-check', () => {
  it('starts from the saved check and sends every criterion in order', () => {
    const drafts = initialCriteria(brief);
    expect(drafts).toEqual({ c1: { met: true, note: 'repo' }, c2: { met: false, note: '' } });
    expect(rubricCheckInput(brief, { ...drafts, c2: { met: true, note: ' slides ' } }, ['e1', 'e2', 'e1'])).toEqual({
      evidenceIds: ['e1', 'e2'],
      criteria: [
        { criterionId: 'c1', met: true, note: 'repo' },
        { criterionId: 'c2', met: true, note: 'slides' },
      ],
    });
  });

  it('toggles evidence without duplicates and states the result as a self-check', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
    expect(rubricStatusLine(brief.rubricCheck, '2 May 2026')).toBe('Self-check from 2 May 2026: 1 of 1 criteria met. Not an independent assessment.');
    expect(rubricWeight(60)).toBe('60%');
  });
});

describe('vault and charge messages', () => {
  it('says when nothing new was added', () => {
    expect(evidenceResultMessage(true)).toBe('Added to your evidence.');
    expect(evidenceResultMessage(false)).toMatch(/already in your Evidence Vault/);
  });

  it('maps vault refusals', () => {
    expect(evidenceErrorMessage(new ApiError(409, 'capacity_exceeded', { code: 'capacity_exceeded' }))).toMatch(/full/);
    expect(evidenceErrorMessage(new ApiError(403, 'feature_unavailable', { code: 'feature_unavailable' }))).toMatch(/not open/);
    expect(evidenceErrorMessage(new ApiError(402, 'plan_upgrade_required', { code: 'plan_upgrade_required' }))).toMatch(/does not include/);
  });

  it('states the report balance or that it is unknown', () => {
    expect(reportBalanceText(null)).toBe('Not available right now');
    expect(reportBalanceText(0)).toBe('None left');
    expect(reportBalanceText(2)).toBe('2 reports');
  });
});

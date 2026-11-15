import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { MatchResult } from '../../../../../packages/career-api-client/src/types';
import { compareUpgradeText, explainMatch, labelTone, preferenceDetail } from './match-explain';

const base: MatchResult = {
  id: 'm1',
  fit: 'partial',
  overlap: 0.4,
  reasons: [
    { code: 'confirmed_overlap', factId: 'f1', token: 'sql' },
    { code: 'confirmed_overlap', factId: 'f2', token: 'sql' },
    { code: 'credential_held', factId: 'f3', token: 'CPA' },
  ],
  gaps: [
    { code: 'not_in_facts', token: 'python' },
    { code: 'credential_missing', token: 'PMP' },
  ],
  unknowns: [{ code: 'pay' }, { code: 'unconfirmed', factId: 'f4', token: 'excel' }],
  preferenceFit: [
    { dimension: 'arrangement', status: 'conflict', detail: 'onsite' },
    { dimension: 'pay', status: 'meets', detail: '£40,000' },
    { dimension: 'seniority', status: 'not_set' },
    { dimension: 'remote_restriction', status: 'check', detail: 'UK residents only' },
  ],
  profileVersion: 1,
  opportunityId: 'o1',
  opportunityRevisionId: 'r1',
  resumeVersionId: 'v1',
  createdAt: '2026-11-01T00:00:00Z',
};

describe('explainMatch', () => {
  it('keeps qualification fit, preferences and unknowns apart, one line per matching word', () => {
    const view = explainMatch(base);
    expect(view.qualification).toEqual([
      'Your confirmed facts include sql.',
      'Your confirmed certification covers CPA.',
      'In the listing, not in your confirmed facts: python.',
      'The listing requires PMP, which is not in your confirmed certifications.',
    ]);
    expect(view.preferences).toEqual([
      'Work arrangement: On site, not one you chose.',
      'Pay: £40,000 reaches your minimum.',
      'Remote limit: “UK residents only”. Check you meet it; FlacronCV does not decide eligibility.',
    ]);
    expect(view.notSetCount).toBe(1);
    expect(view.unknowns).toEqual(['Pay was not stated.', 'excel is only on a fact you have not confirmed.']);
  });

  it('derives the label for an older comparison: a missing credential makes it a stretch', () => {
    const view = explainMatch(base);
    expect(view.label).toBe('stretch');
    expect(view.labelText).toBe('Stretch opportunity');
    expect(view.reasons).toContain('A credential the listing requires is not in your confirmed facts.');
    expect(labelTone('strong_fit')).toBe('success');
  });

  it('uses the stored label when the server sent one', () => {
    const view = explainMatch({ ...base, label: 'strong_fit', labelReasons: ['skills_overlap'] });
    expect(view.labelText).toBe('Strong fit');
    expect(view.reasons).toEqual(['Your confirmed facts cover much of what the listing asks for.']);
  });

  it('translates coded preference values and keeps stated ones as written', () => {
    expect(preferenceDetail('schedule', 'internship')).toBe('Internship');
    expect(preferenceDetail('location', 'remote')).toBe('Remote');
    expect(preferenceDetail('location', 'Leeds')).toBe('Leeds');
  });
});

describe('compareUpgradeText', () => {
  it('names the plan comparisons start on, or says another plan is needed', () => {
    expect(compareUpgradeText(new ApiError(402, 'plan_upgrade_required', { minimumPlan: 'professional' } as never))).toBe(
      'Résumé comparisons start on the Professional plan. Nothing was used.',
    );
    expect(compareUpgradeText(new ApiError(403, 'feature_unavailable', {} as never))).toMatch(/need another plan/);
    expect(compareUpgradeText(new ApiError(429, 'quota_exhausted', {} as never))).toBeNull();
  });
});

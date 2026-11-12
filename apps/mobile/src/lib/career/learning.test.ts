import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { SkillGapReport } from '../../../../../packages/career-api-client/src/types';
import {
  buildSkillReportInput,
  clampTimeBudget,
  EMPTY_SKILL_REPORT_FORM,
  isOpenableUrl,
  milestoneDone,
  milestoneEffort,
  reportMeta,
  skillReportErrorMessage,
  skillReportSignature,
  withMilestone,
} from './learning';
import { PROVIDER_UNAVAILABLE_MESSAGE } from './action-packs';

function report(completed: string[] = []): SkillGapReport {
  const m = (id: string) => ({ id, title: id, description: '', targetSkill: 'SQL', estimatedHours: 4, estimatedCostCents: 0, resources: [] });
  return {
    id: 'r1',
    targetRole: 'Analyst',
    targetIndustry: null,
    timeBudgetHoursPerWeek: 5,
    financialBudgetCents: 0,
    skillGaps: [],
    learningPlan: [m('a'), m('b'), m('c')],
    projectBrief: null,
    progress: { completedMilestoneIds: completed, percent: 0 },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('buildSkillReportInput', () => {
  it('builds the same body as the website (trimmed, industry null when blank, dollars to cents)', () => {
    const out = buildSkillReportInput({ ...EMPTY_SKILL_REPORT_FORM, targetRole: '  Data Analyst ', targetIndustry: ' ', financialBudget: '150' });
    expect(out).toEqual({
      ok: true,
      input: { targetRole: 'Data Analyst', targetIndustry: null, timeBudgetHoursPerWeek: 5, financialBudgetCents: 15000, includeProjectBrief: true },
    });
  });

  it('refuses a blank role and a non-whole budget', () => {
    expect(buildSkillReportInput({ ...EMPTY_SKILL_REPORT_FORM, targetRole: '   ' })).toMatchObject({ ok: false, field: 'targetRole' });
    expect(buildSkillReportInput({ ...EMPTY_SKILL_REPORT_FORM, targetRole: 'x', financialBudget: '12.5' })).toMatchObject({ ok: false, field: 'financialBudget' });
    expect(buildSkillReportInput({ ...EMPTY_SKILL_REPORT_FORM, targetRole: 'x', financialBudget: '-1' })).toMatchObject({ ok: false, field: 'financialBudget' });
    expect(buildSkillReportInput({ ...EMPTY_SKILL_REPORT_FORM, targetRole: 'x', financialBudget: '' })).toMatchObject({ ok: true });
  });

  it('keeps the time budget inside the website range 2-30', () => {
    expect(clampTimeBudget(1)).toBe(2);
    expect(clampTimeBudget(31)).toBe(30);
    expect(clampTimeBudget(Number.NaN)).toBe(5);
  });

  it('signature changes with the input', () => {
    const a = buildSkillReportInput({ ...EMPTY_SKILL_REPORT_FORM, targetRole: 'A' });
    const b = buildSkillReportInput({ ...EMPTY_SKILL_REPORT_FORM, targetRole: 'B' });
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(skillReportSignature(a.input)).not.toBe(skillReportSignature(b.input));
    expect(skillReportSignature(a.input)).toBe(skillReportSignature({ ...a.input }));
  });
});

describe('progress', () => {
  it('recomputes the percent like the server', () => {
    const r = withMilestone(report(), 'a', true);
    expect(r.progress).toEqual({ completedMilestoneIds: ['a'], percent: 33 });
    expect(milestoneDone(r, 'a')).toBe(true);
    const all = withMilestone(withMilestone(r, 'b', true), 'c', true);
    expect(all.progress.percent).toBe(100);
    expect(withMilestone(all, 'b', false).progress).toEqual({ completedMilestoneIds: ['a', 'c'], percent: 67 });
    expect(withMilestone(report(), 'unknown', true).progress.completedMilestoneIds).toEqual([]);
  });
});

describe('formatting', () => {
  it('describes the report and the milestone effort', () => {
    expect(reportMeta({ targetIndustry: 'Finance', timeBudgetHoursPerWeek: 6, financialBudgetCents: 25000 })).toBe('Finance · 6 hours/week · $250 budget');
    expect(milestoneEffort({ estimatedHours: 6, estimatedCostCents: 0 })).toBe('~6h · Free');
    expect(milestoneEffort({ estimatedHours: 6, estimatedCostCents: 4000 })).toBe('~6h · about $40');
  });

  it('opens only web links', () => {
    expect(isOpenableUrl('https://example.org/course')).toBe(true);
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false);
    expect(isOpenableUrl('file:///etc/passwd')).toBe(false);
  });
});

describe('skillReportErrorMessage', () => {
  it('maps refusals', () => {
    expect(skillReportErrorMessage(new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' }))).toBe(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(skillReportErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error' }))).toMatch(/target role/);
    expect(skillReportErrorMessage(new ApiError(402, 'quota_exhausted', { code: 'quota_exhausted' }))).toMatch(/No skill report credits/);
    expect(skillReportErrorMessage(new Error('boom'))).toMatch(/No credit was used/);
  });
});

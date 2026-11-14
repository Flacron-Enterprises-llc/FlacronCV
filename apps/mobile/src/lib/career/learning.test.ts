import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { SkillGapReport } from '../../../../../packages/career-api-client/src/types';
import {
  buildSkillReportInput,
  clampTimeBudget,
  EMPTY_SKILL_REPORT_FORM,
  evidenceErrorMessage,
  gapBadge,
  hasEssentialCredential,
  isOpenableUrl,
  milestoneDone,
  milestoneEffort,
  milestoneEvidenceId,
  planCostLine,
  reportMeta,
  skillReportErrorMessage,
  skillReportSignature,
  withMilestone,
  withMilestoneEvidence,
} from './learning';
import { PROVIDER_UNAVAILABLE_MESSAGE } from './action-packs';

function report(completed: string[] = []): SkillGapReport {
  const m = (id: string) => ({ id, title: id, description: '', targetSkill: 'SQL', estimatedHours: 4, estimatedCostCents: 0 as number | null, costAsOf: null as string | null, resources: [] });
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
    expect(milestoneEffort({ estimatedHours: 6, estimatedCostCents: 0, costAsOf: '2026-05' })).toBe('~6h · Free (stated 2026-05; check with the provider)');
    expect(milestoneEffort({ estimatedHours: 6, estimatedCostCents: 4000, costAsOf: '2026-05-01' })).toBe(
      '~6h · about $40 (stated 2026-05-01; check with the provider)',
    );
  });

  it('never shows an unknown cost as free', () => {
    expect(milestoneEffort({ estimatedHours: 6, estimatedCostCents: null })).toBe('~6h · Cost unknown');
    expect(milestoneEffort({ estimatedHours: 6, estimatedCostCents: null, costAsOf: null })).toBe('~6h · Cost unknown');
    // A cost without the date it was stated is not a known cost either.
    expect(milestoneEffort({ estimatedHours: 6, estimatedCostCents: 0 })).toBe('~6h · Cost unknown');
  });

  it('totals only known costs and cannot judge the budget while some are unknown', () => {
    const r = report();
    r.financialBudgetCents = 10000;
    r.learningPlan[0] = { ...r.learningPlan[0], estimatedCostCents: 4000, costAsOf: '2026-05' };
    r.learningPlan[1] = { ...r.learningPlan[1], estimatedCostCents: null };
    r.learningPlan[2] = { ...r.learningPlan[2], estimatedCostCents: 0, costAsOf: '2026-05' };
    expect(planCostLine(r)).toBe(
      'Known costs: $40 · 1 step with unknown cost (not counted) · Cannot tell if it fits the budget until the unknown costs are checked',
    );
    r.learningPlan[1] = { ...r.learningPlan[1], estimatedCostCents: 1000, costAsOf: '2026-05' };
    expect(planCostLine(r)).toBe('Known costs: $50 · Within budget');
    r.financialBudgetCents = 2000;
    expect(planCostLine(r)).toBe('Known costs: $50 · Over budget');
  });

  it('labels essential credentials apart from preferred skills', () => {
    expect(gapBadge({ kind: 'credential', importance: 'critical' })).toEqual({ label: 'Essential credential', tone: 'warning' });
    expect(gapBadge({ kind: 'credential', importance: 'preferred' }).label).toBe('Credential · PREFERRED');
    expect(gapBadge({ importance: 'preferred' })).toEqual({ label: 'PREFERRED', tone: 'brand' });
    expect(gapBadge({ kind: 'skill', importance: 'critical' }).label).toBe('CRITICAL GAP');
    const r = report();
    expect(hasEssentialCredential(r)).toBe(false);
    r.skillGaps = [{ skill: 'Licence', currentLevel: 'none', requiredLevel: 'expert', importance: 'critical', kind: 'credential' }];
    expect(hasEssentialCredential(r)).toBe(true);
  });

  it('opens only web links', () => {
    expect(isOpenableUrl('https://example.org/course')).toBe(true);
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false);
    expect(isOpenableUrl('file:///etc/passwd')).toBe(false);
  });
});

describe('milestone evidence', () => {
  it('remembers the vault item per milestone and keeps it when ticks change', () => {
    const r = withMilestoneEvidence(withMilestone(report(), 'a', true), 'a', 'ev1');
    expect(milestoneEvidenceId(r, 'a')).toBe('ev1');
    expect(milestoneEvidenceId(r, 'b')).toBeNull();
    expect(withMilestone(r, 'b', true).progress.evidenceByMilestone).toEqual({ a: 'ev1' });
  });

  it('explains that only a ticked milestone can be recorded', () => {
    const err = new ApiError(400, 'validation_error', { code: 'validation_error', field: 'milestoneId', reason: 'not_completed' });
    expect(evidenceErrorMessage(err)).toMatch(/Tick the milestone/);
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

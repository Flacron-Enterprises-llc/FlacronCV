import { describe, expect, it } from 'vitest';
import { computeLearningProgress, isEssentialCredential, learningPlanCost, type LearningPlanMilestone } from './learning';

describe('CV13: Learning plan progress calculations', () => {
  const sampleMilestones: LearningPlanMilestone[] = [
    {
      id: 'm-1',
      title: 'Advanced Rust Concurrency',
      description: 'Master async runtimes and lock-free data structures',
      targetSkill: 'Rust',
      estimatedHours: 20,
      estimatedCostCents: 0,
      resources: [
        {
          title: 'Rust Atomics and Locks',
          provider: 'O’Reilly',
          url: 'https://marabos.nl/atomics/',
          type: 'book',
          isFree: true,
        },
      ],
    },
    {
      id: 'm-2',
      title: 'PostgreSQL Internals and Indexing',
      description: 'Deep dive into query planner and B-Tree indexes',
      targetSkill: 'PostgreSQL',
      estimatedHours: 15,
      estimatedCostCents: 4900,
      resources: [],
    },
  ];

  it('computes 0% progress when no milestones are completed', () => {
    const progress = computeLearningProgress(sampleMilestones, []);
    expect(progress.percent).toBe(0);
    expect(progress.completedMilestoneIds).toEqual([]);
  });

  it('computes 50% when one of two milestones is completed', () => {
    const progress = computeLearningProgress(sampleMilestones, ['m-1']);
    expect(progress.percent).toBe(50);
    expect(progress.completedMilestoneIds).toEqual(['m-1']);
  });

  it('computes 100% when all milestones are completed and filters unknown IDs', () => {
    const progress = computeLearningProgress(sampleMilestones, ['m-1', 'm-2', 'unknown-id']);
    expect(progress.percent).toBe(100);
    expect(progress.completedMilestoneIds).toEqual(['m-1', 'm-2']);
  });
});

describe('CV13: learning plan cost never treats unknown as free', () => {
  const step = (id: string, cost: number | null): LearningPlanMilestone => ({
    id,
    title: id,
    description: id,
    targetSkill: 'SQL',
    estimatedHours: 4,
    estimatedCostCents: cost,
    costAsOf: cost === null ? null : '2026-09',
    resources: [],
  });

  it('treats a cost without a stated date as unknown', () => {
    expect(learningPlanCost([{ ...step('a', 1000), costAsOf: null }], 5000)).toEqual({
      knownTotalCents: 0,
      unknownCount: 1,
      withinBudget: null,
    });
  });

  it('is within budget only when every cost is known', () => {
    expect(learningPlanCost([step('a', 1000), step('b', 0)], 2000)).toEqual({
      knownTotalCents: 1000,
      unknownCount: 0,
      withinBudget: true,
    });
  });

  it('cannot say a plan fits when a cost is unknown', () => {
    expect(learningPlanCost([step('a', 1000), step('b', null)], 5000)).toEqual({
      knownTotalCents: 1000,
      unknownCount: 1,
      withinBudget: null,
    });
  });

  it('says over budget when the known costs alone exceed it', () => {
    expect(learningPlanCost([step('a', 9000), step('b', null)], 5000).withinBudget).toBe(false);
  });

  it('marks only critical credentials as essential', () => {
    expect(isEssentialCredential({ kind: 'credential', importance: 'critical' })).toBe(true);
    expect(isEssentialCredential({ kind: 'credential', importance: 'preferred' })).toBe(false);
    expect(isEssentialCredential({ kind: 'skill', importance: 'critical' })).toBe(false);
    expect(isEssentialCredential({ importance: 'critical' })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { computeLearningProgress, type LearningPlanMilestone } from './learning';

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

import { describe, expect, it } from 'vitest';
import { defaultActionPackChecklist, defaultActionPackNextSteps } from './action-pack';

describe('action-pack', () => {
  it('generates customized checklist items for vacancy', () => {
    const checklist = defaultActionPackChecklist('Senior Engineer', 'Acme Corp');
    expect(checklist).toHaveLength(5);
    expect(checklist[0].label).toContain('Senior Engineer');
    expect(checklist[0].label).toContain('Acme Corp');
    expect(checklist.every((c) => !c.done)).toBe(true);
  });

  it('generates actionable next steps based on fit and gaps', () => {
    const strongSteps = defaultActionPackNextSteps('strong', 0);
    expect(strongSteps.some((s) => s.includes('Direct match'))).toBe(true);

    const blockedSteps = defaultActionPackNextSteps('blocked', 2);
    expect(blockedSteps.some((s) => s.includes('blocking constraints'))).toBe(true);
    expect(blockedSteps.some((s) => s.includes('2 identified skill gaps'))).toBe(true);

    const partialSteps = defaultActionPackNextSteps('partial', 3);
    expect(partialSteps.some((s) => s.includes('highlighted skill gaps'))).toBe(true);
    expect(partialSteps.some((s) => s.includes('3 identified skill gaps'))).toBe(true);
  });
});

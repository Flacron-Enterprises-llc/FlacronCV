import { describe, expect, it } from 'vitest';
import { SPECIALIST_MODES, validateRadiusLimit } from './career-modes';

describe('CV14 Career Modes & Radius Validation', () => {
  it('validates radius limits according to plan caps', () => {
    // Free plan cap = 25 mi
    expect(validateRadiusLimit(20, 25)).toEqual({ valid: true, maxAllowed: 25 });
    expect(validateRadiusLimit(25, 25)).toEqual({ valid: true, maxAllowed: 25 });
    expect(validateRadiusLimit(30, 25)).toEqual({ valid: false, maxAllowed: 25 });

    // Starter plan cap = 50 mi
    expect(validateRadiusLimit(50, 50)).toEqual({ valid: true, maxAllowed: 50 });
    expect(validateRadiusLimit(75, 50)).toEqual({ valid: false, maxAllowed: 50 });

    // Professional plan cap = 100 mi
    expect(validateRadiusLimit(100, 100)).toEqual({ valid: true, maxAllowed: 100 });
    expect(validateRadiusLimit(101, 100)).toEqual({ valid: false, maxAllowed: 100 });

    // Career Pro & Business cap = 200 mi
    expect(validateRadiusLimit(200, 200)).toEqual({ valid: true, maxAllowed: 200 });
    expect(validateRadiusLimit(250, 200)).toEqual({ valid: false, maxAllowed: 200 });
    expect(validateRadiusLimit(-5, 200)).toEqual({ valid: false, maxAllowed: 200 });
  });

  it('exposes all specialist modes with prompt modifiers and recommendations', () => {
    expect(Object.keys(SPECIALIST_MODES)).toEqual([
      'general',
      'technical_engineering',
      'executive_leadership',
      'creative_design',
      'academic_research',
      'career_transition',
    ]);

    expect(SPECIALIST_MODES.technical_engineering.recommendedFocus).toContain('System Architecture');
    expect(SPECIALIST_MODES.executive_leadership.recommendedFocus).toContain('P&L Management');
    expect(SPECIALIST_MODES.career_transition.recommendedFocus).toContain('Transferable Skills');
    expect(SPECIALIST_MODES.career_transition.promptModifier).toContain('domain expertise');
  });
});

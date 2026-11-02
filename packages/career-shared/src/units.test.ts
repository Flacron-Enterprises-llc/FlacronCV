import { describe, expect, it } from 'vitest';
import { ADDONS, ALLOWANCES, PLAN_ORDER, UNIT_ALLOWANCE_FIELD, includedUnits } from './catalog';
import type { UsageUnit } from './catalog';

const UNITS = Object.keys(UNIT_ALLOWANCE_FIELD) as UsageUnit[];

describe('unit allowance map', () => {
  it('reads the allowance from ALLOWANCES, not a second number', () => {
    expect(includedUnits('starter', 'document_credit')).toBe(ALLOWANCES.starter.documentCredits);
    expect(includedUnits('professional', 'resume_analysis')).toBe(ALLOWANCES.professional.resumeAnalyses);
    expect(includedUnits('free', 'text_interview')).toBeNull();
    expect(includedUnits('business', 'messaging_balance')).toBeNull();
  });

  it('maps every usage pack to a unit that a plan includes', () => {
    for (const addon of ADDONS.filter((a) => a.kind === 'usage_pack')) {
      expect(UNIT_ALLOWANCE_FIELD[addon.unit as UsageUnit]).not.toBeNull();
    }
  });

  it('never lowers a monthly unit allowance along the plan order, so an upgrade delta is never negative', () => {
    for (const unit of UNITS) {
      let previous = 0;
      for (const planId of PLAN_ORDER) {
        const value = includedUnits(planId, unit) ?? 0;
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });
});

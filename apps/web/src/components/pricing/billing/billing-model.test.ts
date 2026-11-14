import { describe, expect, it } from 'vitest';
import type { UsageSummary } from '@flacroncv/career-api-client';
import { activePacks, careerAllowanceRows, expiresSoon, usageWarnings, v1AllowanceRows, type AllowanceRow } from './billing-model';

const row = (over: Partial<AllowanceRow>): AllowanceRow => ({
  key: 'document_credit',
  source: 'career',
  granted: 100,
  used: 0,
  remaining: 100,
  packRemaining: 0,
  capacity: false,
  ...over,
});

describe('usage warnings (spec §11: 80, 95, 100 percent)', () => {
  it('warns at 80, 95 and 100 percent and not below', () => {
    expect(usageWarnings([row({ used: 79, remaining: 21 })])).toEqual([]);
    expect(usageWarnings([row({ used: 80, remaining: 20 })])).toMatchObject([{ level: 80, percent: 80 }]);
    expect(usageWarnings([row({ used: 96, remaining: 4 })])).toMatchObject([{ level: 95, percent: 96 }]);
    expect(usageWarnings([row({ used: 100, remaining: 0 })])).toMatchObject([{ level: 100 }]);
  });

  it('holds the warning back while purchased pack units remain', () => {
    expect(usageWarnings([row({ used: 100, remaining: 25, packRemaining: 25 })])).toEqual([]);
  });

  it('ignores units the plan does not include, capacities and unlimited rows', () => {
    expect(usageWarnings([row({ granted: 0, used: 0, remaining: 0 })])).toEqual([]);
    expect(usageWarnings([row({ capacity: true, used: 100, remaining: 0 })])).toEqual([]);
    expect(usageWarnings([row({ granted: null, used: 500, remaining: null })])).toEqual([]);
  });

  it('lists exhausted units first', () => {
    const warnings = usageWarnings([row({ key: 'a', used: 85, remaining: 15 }), row({ key: 'b', used: 100, remaining: 0 })]);
    expect(warnings.map((w) => w.key)).toEqual(['b', 'a']);
  });
});

describe('allowance rows', () => {
  const summary: UsageSummary = {
    renewalDate: '2026-12-01',
    units: [
      { unit: 'document_credit', includedGranted: 60, includedRemaining: 10, packRemaining: 30, packHeld: 30 },
      { unit: 'voice_minute', includedGranted: 0, includedRemaining: 0, packRemaining: 0, packHeld: 0 },
    ],
    packs: [
      { id: 'p2', addonId: 'document_m', unit: 'document_credit', remainingUnits: 30, purchasedUnits: 30, expiresAt: '2027-06-01T00:00:00Z', state: 'held', requiredPlan: null },
      { id: 'p1', addonId: 'document_s', unit: 'document_credit', remainingUnits: 5, purchasedUnits: 10, expiresAt: '2027-01-01T00:00:00Z', state: 'held', requiredPlan: null },
      { id: 'p0', addonId: 'alert_s', unit: 'alert_item', remainingUnits: 0, purchasedUnits: 100, expiresAt: '2026-12-01T00:00:00Z', state: 'used_up', requiredPlan: null },
    ],
  };

  it('reports granted, used and remaining (included + packs) per career unit', () => {
    expect(careerAllowanceRows(summary)[0]).toMatchObject({ granted: 60, used: 50, remaining: 40, packRemaining: 30 });
  });

  it('lists packs still holding units, soonest expiry first', () => {
    expect(activePacks(summary).map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(expiresSoon(summary.packs[1], new Date('2026-12-15T00:00:00Z'))).toBe(true);
    expect(expiresSoon(summary.packs[0], new Date('2026-12-15T00:00:00Z'))).toBe(false);
  });

  it('drops the V1 credit row when the career ledger owns the pool', () => {
    const withCareer = v1AllowanceRows('free', { aiCreditsUsed: 1 }, new Set(['document_credit']));
    expect(withCareer.find((r) => r.key === 'aiCredits')).toBeUndefined();
    const v1Only = v1AllowanceRows('free', { aiCreditsUsed: 1 }, new Set());
    expect(v1Only.find((r) => r.key === 'aiCredits')).toMatchObject({ used: 1, source: 'v1' });
  });

  it('counts legacy CV creations per month', () => {
    const rows = v1AllowanceRows('pro', { cvsCreated: 4, coverLettersCreated: 2, aiCreditsUsed: 90, exportsThisMonth: 3 }, new Set());
    expect(rows.find((r) => r.key === 'cvs')).toMatchObject({ granted: 10, used: 4, remaining: 6, capacity: false });
    expect(rows.find((r) => r.key === 'exports')).toMatchObject({ granted: null, remaining: null });
  });
});

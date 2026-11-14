import { describe, expect, it } from 'vitest';
import { EMPTY_QUANTITIES, calculate, parseQuantity, requiredPlanFor, restrictionFor, visibleFields, type QuantityField } from './estimate-model';
import type { BillingInterval, PlanId } from '@flacroncv/career-shared';

const NOW = new Date('2026-11-14T12:00:00Z');

function run(planId: PlanId, interval: BillingInterval, quantities: Partial<Record<QuantityField, number>>) {
  return calculate({ planId, interval, quantities: { ...EMPTY_QUANTITIES, ...quantities } }, NOW);
}

describe('price calculator arithmetic (spec §10B)', () => {
  it('Example A: Professional monthly, one location, 30 documents, 5 action packs, 60 voice minutes', () => {
    const { estimate } = run('professional', 'monthly', { locations: 1, documents: 30, actionPacks: 5, voiceMinutes: 60 });
    expect(estimate.recurringMonthlyCents).toBe(4098);
    expect(estimate.oneTimeCents).toBe(3097);
    expect(estimate.dueNowCents).toBe(7195);
    expect(estimate.lines.map((l) => [l.id, l.quantity, l.lineCents])).toEqual([
      ['professional', 1, 3899],
      ['document_m', 1, 1299],
      ['action_s', 1, 799],
      ['voice_s', 1, 999],
      ['location_extra', 1, 199],
    ]);
  });

  it('Example B: Career Pro, 500 alerts and 180 voice minutes', () => {
    const { estimate } = run('career_pro', 'monthly', { alerts: 500, voiceMinutes: 180 });
    expect(estimate.dueNowCents).toBe(10897);
    expect(estimate.recurringMonthlyCents).toBe(6899);
  });

  it('Example C: Business with two seats, 25 candidates, 100 GB and a 100-document pack', () => {
    const { estimate } = run('business', 'monthly', { staff: 2, candidates25: 1, storage100gb: 1, documents: 100 });
    expect(estimate.recurringMonthlyCents).toBe(30499);
    expect(estimate.dueNowCents).toBe(33998);
  });

  it('Example D: Professional annual with the Example A extras', () => {
    const result = run('professional', 'annual', { locations: 1, documents: 30, actionPacks: 5, voiceMinutes: 60 });
    expect(result.estimate.dueNowCents).toBe(42286);
    // Later monthly invoices are the capacity add-on only.
    expect(result.estimate.recurringMonthlyCents).toBe(199);
    expect(result.estimate.monthlyEquivalentCents).toBe(3249);
    expect(result.nextRenewal?.toISOString().slice(0, 10)).toBe('2027-11-14');
    expect(result.allowanceRenewal?.toISOString().slice(0, 10)).toBe('2026-12-14');
  });

  it('40 extra documents buy one 30-pack and one 10-pack for $17.98', () => {
    const result = run('starter', 'monthly', { documents: 40 });
    const packs = result.estimate.lines.filter((l) => l.billing === 'one_time');
    expect(packs.map((l) => l.id).sort()).toEqual(['document_m', 'document_s']);
    expect(result.estimate.oneTimeCents).toBe(1798);
    expect(result.included.find((r) => r.field === 'documents')).toMatchObject({ included: 20, purchased: 40, requested: 40 });
  });

  it('shows the excess units supplied by pack rounding', () => {
    const result = run('starter', 'monthly', { documents: 12 });
    expect(result.included.find((r) => r.field === 'documents')).toMatchObject({ purchased: 20, requested: 12 });
  });

  it('with no add-ons totals only the base plan', () => {
    const { estimate } = run('starter', 'monthly', {});
    expect(estimate.lines).toHaveLength(1);
    expect(estimate.dueNowCents).toBe(2199);
    expect(estimate.oneTimeCents).toBe(0);
  });

  it('Free is $0 and buys nothing; every requested extra is listed with the plan it needs', () => {
    const result = run('free', 'monthly', { documents: 10, voiceMinutes: 60, locations: 1, messagingDollars: 10 });
    expect(result.estimate.dueNowCents).toBe(0);
    expect(result.restricted).toEqual([
      { field: 'documents', requiredPlan: 'starter' },
      { field: 'voiceMinutes', requiredPlan: 'professional' },
      { field: 'locations', requiredPlan: 'starter' },
      { field: 'messagingDollars', requiredPlan: 'starter' },
    ]);
    expect(result.nextRenewal).toBeNull();
    expect(result.packExpiry).toBeNull();
  });

  it('refuses Professional-only packs on Starter instead of charging for them', () => {
    const result = run('starter', 'monthly', { actionPacks: 5, forms: 25, documents: 10 });
    expect(result.restricted.map((r) => r.field)).toEqual(['actionPacks', 'forms']);
    expect(result.estimate.oneTimeCents).toBe(499);
  });

  it('rounds saved searches to blocks of 5 and messaging to $10 top-ups', () => {
    const result = run('starter', 'monthly', { savedSearches: 7, messagingDollars: 15 });
    expect(result.estimate.lines.find((l) => l.id === 'saved_search_5')).toMatchObject({ quantity: 2, lineCents: 598 });
    expect(result.estimate.lines.find((l) => l.id === 'messaging_topup')).toMatchObject({ quantity: 2, lineCents: 2000 });
    expect(result.messagingCents).toBe(2000);
  });

  it('dates packs to expire twelve months after purchase', () => {
    expect(run('starter', 'monthly', { documents: 10 }).packExpiry?.toISOString().slice(0, 10)).toBe('2027-11-14');
  });

  it('clamps renewal to the end of a shorter month', () => {
    const result = calculate({ planId: 'starter', interval: 'monthly', quantities: EMPTY_QUANTITIES }, new Date('2026-01-31T00:00:00Z'));
    expect(result.nextRenewal?.toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});

describe('calculator fields', () => {
  it('derives each restriction from the catalog', () => {
    expect(requiredPlanFor('documents')).toBe('starter');
    expect(requiredPlanFor('actionPacks')).toBe('professional');
    expect(requiredPlanFor('mapSessions')).toBe('professional');
    expect(requiredPlanFor('staff')).toBe('business');
    expect(restrictionFor('scenarioReports', 'starter')).toBe('professional');
    expect(restrictionFor('scenarioReports', 'career_pro')).toBeNull();
  });

  it('shows Business capacity only on Business and the 10 GB block only on individual plans', () => {
    expect(visibleFields('professional')).toContain('storage10gb');
    expect(visibleFields('professional')).not.toContain('staff');
    expect(visibleFields('business')).toEqual(expect.arrayContaining(['staff', 'candidates25', 'candidates100', 'storage100gb']));
    expect(visibleFields('business')).not.toContain('storage10gb');
  });

  it('accepts whole numbers 0..10,000 only', () => {
    expect(parseQuantity('')).toBe(0);
    expect(parseQuantity(' 40 ')).toBe(40);
    expect(parseQuantity('10000')).toBe(10000);
    expect(parseQuantity('10001')).toBeNull();
    expect(parseQuantity('1.5')).toBeNull();
    expect(parseQuantity('-3')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
  });
});

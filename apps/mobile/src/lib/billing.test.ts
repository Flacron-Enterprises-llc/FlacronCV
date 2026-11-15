import { describe, expect, it } from 'vitest';
import type { UsageSummary } from '../../../../packages/career-api-client/src/types';
import {
  activePacks,
  billingOwner,
  billingStore,
  canPurchaseInApp,
  careerAllowanceRows,
  expiresSoon,
  storageGrace,
  unseenWarningIds,
  usageWarnings,
  v1AllowanceRows,
} from './billing';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const FUTURE = '2026-12-14T12:00:00.000Z';
const PAST = '2026-10-01T12:00:00.000Z';

function summary(over: Partial<UsageSummary> = {}): UsageSummary {
  return { renewalDate: FUTURE, units: [], packs: [], ...over };
}

describe('V1 allowance rows', () => {
  it('current plans show stored-document capacity and the analyses counter', () => {
    const rows = v1AllowanceRows(
      'professional',
      { storedCvs: 4, storedCoverLetters: 2, cvsCreated: 9, aiCreditsUsed: 10, aiCreditsLimit: 60, analysesUsed: 5, analysesLimit: 60, exportsThisMonth: 3 },
      new Set(),
    );
    expect(rows.map((r) => r.key)).toEqual(['cvs', 'coverLetters', 'aiCredits', 'analyses', 'exports']);
    expect(rows[0]).toMatchObject({ granted: 20, used: 4, remaining: 16, capacity: true });
    expect(rows[1]).toMatchObject({ granted: 20, used: 2, capacity: true });
    expect(rows[2]).toMatchObject({ granted: 60, used: 10, remaining: 50, capacity: false });
    expect(rows[3]).toMatchObject({ granted: 60, used: 5 });
    expect(rows[4]).toMatchObject({ granted: null, used: 3, remaining: null });
  });

  it('legacy plans count creations per month and have no analyses row', () => {
    const rows = v1AllowanceRows('pro', { cvsCreated: 3, coverLettersCreated: 1, aiCreditsUsed: 1, aiCreditsLimit: 100 }, new Set());
    expect(rows.map((r) => r.key)).toEqual(['cvs', 'coverLetters', 'aiCredits', 'exports']);
    expect(rows[0]).toMatchObject({ granted: 10, used: 3, capacity: false });
  });

  it('a lower stored credit ceiling wins (server enforces min(stored, plan))', () => {
    const rows = v1AllowanceRows('starter', { aiCreditsUsed: 0, aiCreditsLimit: 3 }, new Set());
    expect(rows.find((r) => r.key === 'aiCredits')?.granted).toBe(3);
  });

  it('leaves out the V1 credit and analysis rows when the career ledger meters them (one pool)', () => {
    const rows = v1AllowanceRows('starter', { aiCreditsUsed: 1 }, new Set(['document_credit', 'resume_analysis']));
    expect(rows.map((r) => r.key)).toEqual(['cvs', 'coverLetters', 'exports']);
  });

  it('unknown counters stay unknown, never zero', () => {
    const rows = v1AllowanceRows('free', undefined, new Set());
    expect(rows[0]).toMatchObject({ used: null, remaining: null });
    expect(v1AllowanceRows('nope', {}, new Set())).toEqual([]);
  });
});

describe('career rows, warnings, packs', () => {
  const units: UsageSummary['units'] = [
    { unit: 'document_credit', includedGranted: 60, includedRemaining: 9, packRemaining: 0, packHeld: 0 },
    { unit: 'alert_item', includedGranted: 100, includedRemaining: 4, packRemaining: 0, packHeld: 0 },
    { unit: 'action_pack', includedGranted: 10, includedRemaining: 0, packRemaining: 0, packHeld: 0 },
    { unit: 'voice_minute', includedGranted: 30, includedRemaining: 0, packRemaining: 20, packHeld: 0 },
    { unit: 'map_session', includedGranted: 0, includedRemaining: 0, packRemaining: 0, packHeld: 0 },
  ];

  it('warns at 80, 95 and 100 percent; packs hold the warning back; not-included units never warn', () => {
    const rows = careerAllowanceRows(summary({ units }));
    expect(rows[0]).toMatchObject({ key: 'document_credit', granted: 60, used: 51, remaining: 9 });
    const warnings = usageWarnings(rows);
    expect(warnings).toEqual([
      { key: 'action_pack', source: 'career', level: 100, percent: 100 },
      { key: 'alert_item', source: 'career', level: 95, percent: 96 },
      { key: 'document_credit', source: 'career', level: 80, percent: 85 },
    ]);
  });

  it('capacity rows never warn', () => {
    const rows = v1AllowanceRows('free', { storedCvs: 1 }, new Set());
    expect(usageWarnings(rows)).toEqual([]);
  });

  it('marks only unseen server notices', () => {
    expect(
      unseenWarningIds(
        summary({
          warnings: [
            { id: 'a', unit: 'alert_item', threshold: 95, createdAt: PAST, seenAt: null },
            { id: 'b', unit: 'alert_item', threshold: 80, createdAt: PAST, seenAt: PAST },
          ],
        }),
      ),
    ).toEqual(['a']);
    expect(unseenWarningIds(undefined)).toEqual([]);
  });

  it('lists held packs with units, soonest expiry first, and flags expiry within 30 days', () => {
    const packs = activePacks(
      summary({
        packs: [
          { id: 'p1', addonId: 'document_m', unit: 'document_credit', remainingUnits: 5, purchasedUnits: 30, expiresAt: '2027-06-01T00:00:00Z', state: 'held', requiredPlan: null },
          { id: 'p2', addonId: 'alert_s', unit: 'alert_item', remainingUnits: 0, purchasedUnits: 100, expiresAt: '2027-01-01T00:00:00Z', state: 'held', requiredPlan: null },
          { id: 'p3', addonId: 'document_s', unit: 'document_credit', remainingUnits: 2, purchasedUnits: 10, expiresAt: '2026-12-01T00:00:00Z', state: 'held', requiredPlan: null },
        ],
      }),
    );
    expect(packs.map((p) => p.id)).toEqual(['p3', 'p1']);
    expect(expiresSoon(packs[0], NOW)).toBe(true);
    expect(expiresSoon(packs[1], NOW)).toBe(false);
  });

  it('reports the storage grace only while files are over the limit', () => {
    expect(storageGrace(summary({ storage: { usedBytes: 2, limitBytes: 1, excessBytes: 1, graceUntil: FUTURE } }))).toEqual({
      graceUntil: FUTURE,
      excessBytes: 1,
    });
    expect(storageGrace(summary({ storage: { usedBytes: 1, limitBytes: 1, excessBytes: 0, graceUntil: FUTURE } }))).toBeNull();
  });
});

describe('who bills the plan (no double billing)', () => {
  it('Free (or an ended plan) may buy in the app', () => {
    expect(billingOwner({ plan: 'free' as never }, NOW)).toBe('none');
    expect(canPurchaseInApp(null, NOW)).toBe(true);
    expect(
      canPurchaseInApp({ plan: 'starter' as never, status: 'canceled' as never, currentPeriodEnd: PAST, stripeSubscriptionId: 'sub_1' }, NOW),
    ).toBe(true);
  });

  it('a web (Stripe) subscriber — new plan or legacy — is managed on the website', () => {
    const web = { plan: 'professional' as never, status: 'active' as never, stripeSubscriptionId: 'sub_1', currentPeriodEnd: FUTURE };
    expect(billingOwner(web, NOW)).toBe('website');
    expect(canPurchaseInApp(web, NOW)).toBe(false);
    expect(billingOwner({ ...web, plan: 'pro' as never }, NOW)).toBe('website');
  });

  it('a store subscriber changes plans in the store', () => {
    const apple = { plan: 'starter' as never, status: 'active' as never, originalTransactionId: 'o-1', currentPeriodEnd: FUTURE, provider: 'apple' };
    expect(billingOwner(apple, NOW)).toBe('store');
    expect(billingStore(apple)).toBe('apple');
    expect(canPurchaseInApp(apple, NOW)).toBe(false);
    expect(billingStore({ purchaseToken: 't' })).toBe('google');
    // A stale Stripe id after a store purchase is still the store.
    expect(billingOwner({ ...apple, stripeSubscriptionId: 'sub_old' }, NOW)).toBe('store');
  });

  it('a paid plan with no live subscription was granted by support', () => {
    expect(billingOwner({ plan: 'career_pro' as never, status: 'active' as never }, NOW)).toBe('support');
  });
});

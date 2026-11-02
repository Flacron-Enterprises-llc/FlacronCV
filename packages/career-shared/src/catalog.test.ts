import { describe, expect, it } from 'vitest';
import { PLAN_ORDER, PLANS, PURCHASE_CHANNELS, addonById, annualIsTenTimesMonthly, trialFor } from './catalog';
import { estimate } from './estimate';
import { monthlyEquivalentCents } from './money';
import { selectCheapestPacks } from './packs';

describe('professional trial', () => {
  it('gives Professional seven days with a card on monthly and annual, and no other plan', () => {
    expect(trialFor('professional', 'monthly')).toEqual({
      days: 7,
      cardRequired: true,
      intervals: ['monthly', 'annual'],
    });
    expect(trialFor('professional', 'annual')).toEqual(trialFor('professional', 'monthly'));
    for (const id of PLAN_ORDER) {
      if (id === 'professional') continue;
      expect(trialFor(id, 'monthly')).toBeNull();
      expect(trialFor(id, 'annual')).toBeNull();
    }
  });
});

describe('catalog prices', () => {
  it('sets every annual price to 10 times monthly', () => {
    for (const id of PLAN_ORDER) {
      expect(annualIsTenTimesMonthly(PLANS[id])).toBe(true);
    }
  });
});

describe('spec section 10B examples', () => {
  it('example A: $40.98 recurring + $30.97 one-time = $71.95 due now', () => {
    const result = estimate({
      planId: 'professional',
      interval: 'monthly',
      desired: [
        { unit: 'document_credit', units: 30 },
        { unit: 'action_pack', units: 5 },
        { unit: 'voice_minute', units: 60 },
      ],
      recurring: [{ addonId: 'location_extra', quantity: 1 }],
    });

    expect(result.recurringMonthlyCents).toBe(4098);
    expect(result.oneTimeCents).toBe(3097);
    expect(result.dueNowCents).toBe(7195);
    expect(result.notes).toEqual([]);
  });

  it('example B: $108.97 due now and $68.99 ongoing', () => {
    const result = estimate({
      planId: 'career_pro',
      interval: 'monthly',
      desired: [
        { unit: 'alert_item', units: 500 },
        { unit: 'voice_minute', units: 180 },
      ],
    });

    expect(result.dueNowCents).toBe(10897);
    expect(result.recurringMonthlyCents).toBe(6899);
    expect(result.oneTimeCents).toBe(3998);
  });

  it('example C: $304.99 recurring and $339.98 first charge', () => {
    const result = estimate({
      planId: 'business',
      interval: 'monthly',
      desired: [{ unit: 'document_credit', units: 100 }],
      recurring: [
        { addonId: 'staff_seat', quantity: 2 },
        { addonId: 'candidates_25', quantity: 1 },
        { addonId: 'storage_100gb_business', quantity: 1 },
      ],
    });

    expect(result.recurringMonthlyCents).toBe(30499);
    expect(result.oneTimeCents).toBe(3499);
    expect(result.dueNowCents).toBe(33998);
  });

  it('example D: $422.86 due now, later months $1.99, equivalent $32.49', () => {
    const result = estimate({
      planId: 'professional',
      interval: 'annual',
      desired: [
        { unit: 'document_credit', units: 30 },
        { unit: 'action_pack', units: 5 },
        { unit: 'voice_minute', units: 60 },
      ],
      recurring: [{ addonId: 'location_extra', quantity: 1 }],
    });

    expect(result.baseCents).toBe(38990);
    expect(result.dueNowCents).toBe(42286);
    expect(result.recurringMonthlyCents).toBe(199);
    expect(result.monthlyEquivalentCents).toBe(3249);
    expect(monthlyEquivalentCents(38990)).toBe(3249);
  });
});

describe('pack rounding', () => {
  it('buys one 30-pack and one 10-pack for 40 document credits at $17.98', () => {
    const result = selectCheapestPacks('document_credit', 40, 'starter');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalCents).toBe(1798);
    expect(result.unitsPurchased).toBe(40);
    expect(result.packs.map((pack) => `${pack.addonId}x${pack.quantity}`).sort()).toEqual([
      'document_mx1',
      'document_sx1',
    ]);
  });

  it('does not sell packs on the Free plan', () => {
    const packs = selectCheapestPacks('document_credit', 10, 'free');
    expect(packs.ok).toBe(false);
    const result = estimate({
      planId: 'free',
      interval: 'monthly',
      desired: [{ unit: 'document_credit', units: 10 }],
    });
    expect(result.dueNowCents).toBe(0);
    expect(result.oneTimeCents).toBe(0);
    expect(result.notes.some((note) => note.code === 'plan')).toBe(true);
  });

  it('does not count white-label, the API package, or Career Maintenance as another unit', () => {
    expect(addonById('white_label')?.unit).toBe('white_label');
    expect(addonById('white_label')?.priceCents).toBe(9900);
    expect(addonById('api_package')?.unit).toBe('api_read');
    expect(addonById('api_package')?.units).toBe(10000);
    expect(addonById('api_package')?.firmPrice).toBe(false);
    expect(addonById('career_maintenance')?.unit).toBe('unspecified');
    expect(addonById('messaging_topup')?.units).toBe(1);
    expect(addonById('messaging_topup')?.priceCents).toBe(1000);
    expect(PURCHASE_CHANNELS.business.monthly).toEqual(['stripe']);
    expect(PURCHASE_CHANNELS.business.annual).toEqual(['stripe']);
  });

  it('prices one messaging top-up as $10 and does not treat it as a document pack', () => {
    const result = estimate({
      planId: 'starter',
      interval: 'monthly',
      oneTime: [{ addonId: 'messaging_topup', quantity: 1 }],
    });
    expect(result.oneTimeCents).toBe(1000);
    expect(result.dueNowCents).toBe(2199 + 1000);
    const blocked = estimate({
      planId: 'professional',
      interval: 'monthly',
      oneTime: [{ addonId: 'document_l', quantity: 1 }],
    });
    expect(blocked.oneTimeCents).toBe(0);
    expect(blocked.notes.some((note) => note.code === 'not_purchasable' && note.addonId === 'document_l')).toBe(true);
  });
});

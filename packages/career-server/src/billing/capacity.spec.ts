import type { AccountRow } from './accounts';
import { capacityExtrasFor } from './capacity';
import { buildCatalogSnapshot } from './catalog';
import { BillingError } from './errors';
import { capacityLimit, checkCapacity, checkReactivation } from '../metering/access';

const snapshot = buildCatalogSnapshot();
const row = (plan_id: string, capacity_extras: Record<string, number> = {}) => ({ plan_id, capacity_extras }) as unknown as AccountRow;

describe('capacity add-ons (pure)', () => {
  it('each add-on raises exactly one count cap by units x quantity', () => {
    expect(capacityExtrasFor(snapshot, 'professional', [
      { addonId: 'location_extra', quantity: 2 },
      { addonId: 'saved_search_5', quantity: 1 },
      { addonId: 'portfolio_extra', quantity: 1 },
      { addonId: 'storage_10gb', quantity: 1 },
    ])).toEqual({ locationProfiles: 2, savedSearches: 5, portfolioPages: 1, storageBytes: 10_000_000_000 });
  });

  it('packs, unknown ids, Free, and Business-only add-ons below Business add nothing', () => {
    expect(capacityExtrasFor(snapshot, 'free', [{ addonId: 'location_extra', quantity: 1 }])).toEqual({});
    expect(capacityExtrasFor(snapshot, 'career_pro', [{ addonId: 'staff_seat', quantity: 1 }])).toEqual({});
    expect(capacityExtrasFor(snapshot, 'professional', [{ addonId: 'document_l', quantity: 1 }, { addonId: 'nope', quantity: 3 }])).toEqual({});
    expect(capacityExtrasFor(snapshot, 'professional', [{ addonId: 'location_extra', quantity: -4 }])).toEqual({});
  });

  it('never touches intelligence, matching schedule or the local radius', () => {
    const extras = capacityExtrasFor(snapshot, 'business', snapshot.addons.map((a) => ({ addonId: a.id, quantity: 5 })));
    for (const field of Object.keys(extras)) {
      expect(['locationProfiles', 'savedSearches', 'portfolioPages', 'storageBytes', 'staffSeats', 'activeCandidates']).toContain(field);
    }
    expect(extras).not.toHaveProperty('localRadiusMiles');
    expect(extras).not.toHaveProperty('alertIntelligence');
  });

  it('Business seats and candidate blocks raise the limits; reactivation checks the raised cap', () => {
    const business = row('business', capacityExtrasFor(snapshot, 'business', [
      { addonId: 'staff_seat', quantity: 2 },
      { addonId: 'candidates_25', quantity: 1 },
      { addonId: 'candidates_100', quantity: 1 },
    ]) as Record<string, number>);
    expect(capacityLimit(snapshot, business, 'staffSeats')).toBe(3 + 2);
    expect(capacityLimit(snapshot, business, 'activeCandidates')).toBe(50 + 25 + 100);
    expect(() => checkReactivation(snapshot, business, 'activeCandidates', 174)).not.toThrow();
    expect(() => checkReactivation(snapshot, business, 'activeCandidates', 175)).toThrow(BillingError);
    // Without add-ons the plain Business cap applies.
    expect(() => checkCapacity(snapshot, row('business'), 'activeCandidates', 50)).toThrow(BillingError);
  });

  it('an extra on a field the plan lacks never unlocks it', () => {
    expect(capacityLimit(snapshot, row('professional', { staffSeats: 9 }), 'staffSeats')).toBeNull();
  });
});

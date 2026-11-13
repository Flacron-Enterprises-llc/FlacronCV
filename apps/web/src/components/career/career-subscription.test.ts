import { describe, expect, it } from 'vitest';
import { careerRenewal, hasStripeCareerSubscription, type CareerSubscriptionView } from './career-subscription';

const now = new Date('2026-11-13T12:00:00Z');
const sub = (overrides: Partial<CareerSubscriptionView>): CareerSubscriptionView => ({
  plan: 'professional',
  status: 'active',
  currentPeriodEnd: '2026-12-13T12:00:00.000Z',
  cancelAtPeriodEnd: false,
  source: 'stripe',
  ...overrides,
});

describe('careerRenewal', () => {
  it('renews an active subscription on its period end', () => {
    expect(careerRenewal(sub({}), now)).toEqual({ key: 'renews_on', date: new Date('2026-12-13T12:00:00.000Z') });
  });

  it('ends at period end when cancellation is scheduled, or when cancelled with time left', () => {
    expect(careerRenewal(sub({ cancelAtPeriodEnd: true }), now)?.key).toBe('ends_on');
    expect(careerRenewal(sub({ status: 'canceled' }), now)?.key).toBe('ends_on');
    expect(careerRenewal(sub({ status: 'canceled', currentPeriodEnd: '2026-10-01T00:00:00Z' }), now)?.key).toBe('ended_on');
  });

  it('reads a serialized Firestore timestamp', () => {
    expect(careerRenewal(sub({ currentPeriodEnd: { _seconds: 1_800_000_000, _nanoseconds: 0 } }), now)?.date.getTime()).toBe(1_800_000_000_000);
  });

  it('says nothing for a local fixture, an unpaid state, or a missing date', () => {
    expect(careerRenewal(sub({ source: 'local_fixture' }), now)).toBeNull();
    expect(careerRenewal(sub({ status: 'incomplete' }), now)).toBeNull();
    expect(careerRenewal(sub({ currentPeriodEnd: null }), now)).toBeNull();
    expect(careerRenewal(null, now)).toBeNull();
    expect(hasStripeCareerSubscription(sub({ source: 'local_fixture' }))).toBe(false);
    expect(hasStripeCareerSubscription(sub({}))).toBe(true);
  });
});

import {
  resolveEffectivePlan,
  CANCEL_AT_PERIOD_END_GRACE_MS,
  DELINQUENT_STATUSES,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@flacroncv/shared-types';

// Fixed clock so grace-window comparisons are deterministic.
const NOW = new Date('2026-07-15T00:00:00.000Z');
const FUTURE = new Date('2026-08-15T00:00:00.000Z'); // still within paid period
const PAST = new Date('2026-06-15T00:00:00.000Z'); // paid period already ended

describe('resolveEffectivePlan', () => {
  describe('non-delinquent subscriptions resolve to their stored plan', () => {
    it('active PRO → PRO', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: FUTURE },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });

    it('active ENTERPRISE → ENTERPRISE', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.ENTERPRISE, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: PAST },
          NOW,
        ),
        // Active is honoured even if the stored period end looks stale.
      ).toBe(SubscriptionPlan.ENTERPRISE);
    });

    it('trialing PRO → PRO (trial is a valid non-delinquent state)', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.TRIALING, currentPeriodEnd: null },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });
  });

  describe('FREE is always the floor', () => {
    it('FREE plan → FREE regardless of status', () => {
      for (const status of Object.values(SubscriptionStatus)) {
        expect(
          resolveEffectivePlan({ plan: SubscriptionPlan.FREE, status, currentPeriodEnd: null }, NOW),
        ).toBe(SubscriptionPlan.FREE);
      }
    });

    it('null / undefined subscription → FREE', () => {
      expect(resolveEffectivePlan(null, NOW)).toBe(SubscriptionPlan.FREE);
      expect(resolveEffectivePlan(undefined, NOW)).toBe(SubscriptionPlan.FREE);
      expect(resolveEffectivePlan({}, NOW)).toBe(SubscriptionPlan.FREE);
    });
  });

  describe('delinquent subscriptions keep paid access only until period end (grace)', () => {
    it('past_due PRO BEFORE period end → PRO (still in the paid window)', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: FUTURE },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });

    it('past_due PRO AFTER period end → FREE (grace expired)', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: PAST },
          NOW,
        ),
      ).toBe(SubscriptionPlan.FREE);
    });

    it('unpaid ENTERPRISE BEFORE period end → ENTERPRISE (grace)', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.ENTERPRISE, status: SubscriptionStatus.UNPAID, currentPeriodEnd: FUTURE },
          NOW,
        ),
      ).toBe(SubscriptionPlan.ENTERPRISE);
    });

    it('unpaid PRO AFTER period end → FREE', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.UNPAID, currentPeriodEnd: PAST },
          NOW,
        ),
      ).toBe(SubscriptionPlan.FREE);
    });

    it('incomplete PRO with no period end → FREE (initial payment never landed; fail safe)', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.INCOMPLETE, currentPeriodEnd: null },
          NOW,
        ),
      ).toBe(SubscriptionPlan.FREE);
    });

    it('past_due PRO with unknown period end → FREE (fail safe)', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: undefined },
          NOW,
        ),
      ).toBe(SubscriptionPlan.FREE);
    });

    it('exactly at period end (now === periodEnd) → still granted (boundary is inclusive)', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: NOW },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });
  });

  describe('currentPeriodEnd coercion (Firestore / serialised shapes)', () => {
    it('Firestore Timestamp via .toDate() — before end grants, after end revokes', () => {
      const future = { toDate: () => FUTURE };
      const past = { toDate: () => PAST };
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: future },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: past },
          NOW,
        ),
      ).toBe(SubscriptionPlan.FREE);
    });

    it('Firestore Timestamp via { seconds } — handled', () => {
      const future = { seconds: Math.floor(FUTURE.getTime() / 1000) };
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: future },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });

    it('ISO string period end — handled', () => {
      expect(
        resolveEffectivePlan(
          {
            plan: SubscriptionPlan.PRO,
            status: SubscriptionStatus.PAST_DUE,
            currentPeriodEnd: FUTURE.toISOString(),
          },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });

    it('epoch-millis number period end — handled', () => {
      expect(
        resolveEffectivePlan(
          {
            plan: SubscriptionPlan.PRO,
            status: SubscriptionStatus.PAST_DUE,
            currentPeriodEnd: FUTURE.getTime(),
          },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });

    it('unparseable period-end string on a delinquent sub → FREE (fail safe)', () => {
      expect(
        resolveEffectivePlan(
          {
            plan: SubscriptionPlan.PRO,
            status: SubscriptionStatus.PAST_DUE,
            currentPeriodEnd: 'not-a-date',
          },
          NOW,
        ),
      ).toBe(SubscriptionPlan.FREE);
    });
  });

  describe('boundary documentation', () => {
    it('DELINQUENT_STATUSES is exactly the dunning trio', () => {
      expect([...DELINQUENT_STATUSES].sort()).toEqual(
        [SubscriptionStatus.INCOMPLETE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.UNPAID].sort(),
      );
    });

    // This used to assert the opposite, on the premise that plan=PRO +
    // status=CANCELED "does not occur in our data" because revokeToFree always
    // writes plan=FREE. That premise was wrong: `customer.subscription.updated`
    // writes the status through while leaving the plan intact, so the pairing
    // occurs on every ordinary cancellation — and the resolver granted PRO
    // forever. Cancellation now ends access at the period already paid for.
    it('canceled PRO drops to FREE once the paid period has passed', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.CANCELED, currentPeriodEnd: PAST },
          NOW,
        ),
      ).toBe(SubscriptionPlan.FREE);
    });

    it('canceled PRO keeps access until the end of the period already paid for', () => {
      expect(
        resolveEffectivePlan(
          { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.CANCELED, currentPeriodEnd: FUTURE },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });
  });

  describe('cancelAtPeriodEnd (active until Stripe deletes; dropped webhook)', () => {
    it('active PRO with cancelAtPeriodEnd still inside the paid period → PRO', () => {
      expect(
        resolveEffectivePlan(
          {
            plan: SubscriptionPlan.PRO,
            status: SubscriptionStatus.ACTIVE,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: FUTURE,
          },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });

    it('active PRO with cancelAtPeriodEnd, period just ended, still inside the 15-minute grace → PRO', () => {
      const justEnded = new Date(NOW.getTime() - 60 * 1000); // 1 minute ago
      expect(
        resolveEffectivePlan(
          {
            plan: SubscriptionPlan.PRO,
            status: SubscriptionStatus.ACTIVE,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: justEnded,
          },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });

    it('active PRO with cancelAtPeriodEnd, exactly at periodEnd + grace → still PRO (boundary inclusive)', () => {
      const atGraceEdge = new Date(NOW.getTime() - CANCEL_AT_PERIOD_END_GRACE_MS);
      expect(
        resolveEffectivePlan(
          {
            plan: SubscriptionPlan.PRO,
            status: SubscriptionStatus.ACTIVE,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: atGraceEdge,
          },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });

    it('active PRO with cancelAtPeriodEnd, past periodEnd + grace → FREE', () => {
      const pastGrace = new Date(NOW.getTime() - CANCEL_AT_PERIOD_END_GRACE_MS - 1);
      expect(
        resolveEffectivePlan(
          {
            plan: SubscriptionPlan.PRO,
            status: SubscriptionStatus.ACTIVE,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: pastGrace,
          },
          NOW,
        ),
      ).toBe(SubscriptionPlan.FREE);
    });

    it('active PRO with cancelAtPeriodEnd and unknown period end → FREE (fail safe)', () => {
      expect(
        resolveEffectivePlan(
          {
            plan: SubscriptionPlan.PRO,
            status: SubscriptionStatus.ACTIVE,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: null,
          },
          NOW,
        ),
      ).toBe(SubscriptionPlan.FREE);
    });

    it('active PRO without cancelAtPeriodEnd keeps PRO even if stored period end is stale', () => {
      expect(
        resolveEffectivePlan(
          {
            plan: SubscriptionPlan.PRO,
            status: SubscriptionStatus.ACTIVE,
            cancelAtPeriodEnd: false,
            currentPeriodEnd: PAST,
          },
          NOW,
        ),
      ).toBe(SubscriptionPlan.PRO);
    });
  });
});

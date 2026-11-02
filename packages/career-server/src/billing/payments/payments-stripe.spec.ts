/**
 * BUILD_PLAN P3 with Stripe: checkout, webhooks, upgrade preview,
 * downgrade, packs, refunds, legacy rows. No network: a fake gateway and
 * events signed with a local test secret.
 */
import { randomUUID } from 'crypto';
import type { BillingInterval, PlanId } from '@flacroncv/career-shared';
import { createPaymentsFixture, PaymentsFixture, stripeFixtures } from '../../testing';
import { buildCatalogSnapshot, includedFor } from '../catalog';
import { BillingError } from '../errors';
import { fingerprintRequest } from '../fingerprint';
import type { CheckoutRequest } from './checkout';

const snapshot = buildCatalogSnapshot();

async function errorOf(promise: Promise<unknown>): Promise<BillingError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof BillingError)) throw new Error(`expected a BillingError, got ${String(error)}`);
  return error;
}

describe('Stripe checkout, webhooks, and plan changes', () => {
  let f: PaymentsFixture;

  beforeAll(async () => {
    f = await createPaymentsFixture('payments_stripe', '2026-10-05T12:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });
  afterEach(() => {
    f.clock.set('2026-10-05T12:00:00Z');
  });

  function priceOf(planId: PlanId, interval: BillingInterval = 'monthly'): string {
    const ref = f.skus.stripe.refFor({ kind: 'plan', planId, interval });
    if (!ref) throw new Error(`no test price for ${planId} ${interval}`);
    return ref;
  }

  function subscriptionEvent(
    type: string,
    input: {
      id: string;
      planId: PlanId;
      interval?: BillingInterval;
      priceId?: string;
      status?: string;
      start: string;
      end: string;
      accountId?: string;
      trialEnd?: string;
      cancelAtPeriodEnd?: boolean;
    },
    created = f.clock.now(),
  ) {
    return stripeFixtures.event(
      type,
      stripeFixtures.subscription({
        id: input.id,
        priceId: input.priceId ?? priceOf(input.planId, input.interval),
        status: input.status ?? 'active',
        periodStart: new Date(input.start),
        periodEnd: new Date(input.end),
        accountId: input.accountId,
        trialEnd: input.trialEnd ? new Date(input.trialEnd) : undefined,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      }),
      created,
    );
  }

  async function subscribed(planId: PlanId, start = '2026-10-01T00:00:00Z', end = '2026-11-01T00:00:00Z') {
    const account = await f.freeAccount({ anchor: '2026-09-01T00:00:00Z' });
    const subscriptionId = `sub_${randomUUID()}`;
    const outcome = await f.deliverStripe(
      subscriptionEvent('customer.subscription.created', { id: subscriptionId, planId, start, end, accountId: account.id }),
    );
    expect(outcome.outcome).toBe('applied');
    return { accountId: account.id, subscriptionId };
  }

  async function reserveOne(accountId: string, unit: string) {
    const key = randomUUID();
    return f.billing.reserve({
      billingAccountId: accountId,
      unit,
      idempotencyKey: key,
      requestFingerprint: fingerprintRequest({ key }),
      requestId: key,
    });
  }

  async function eventRow(eventId: string) {
    const res = await f.db.pool.query(
      `SELECT outcome, detail FROM billing_events WHERE provider = 'stripe' AND provider_event_id = $1`,
      [eventId],
    );
    return res.rows[0];
  }

  describe('checkout', () => {
    it('chooses the price on the server for every paid plan and interval, with the trial only on Professional', async () => {
      const account = await f.freeAccount();
      for (const planId of ['starter', 'professional', 'career_pro', 'business'] as const) {
        for (const interval of ['monthly', 'annual'] as const) {
          const result = await f.payments.createCheckout(account.id, {
            planId,
            interval,
            provider: 'stripe',
            idempotencyKey: `${planId}-${interval}`,
          });
          const sent = f.stripe.sessions[f.stripe.sessions.length - 1];
          expect(sent).toMatchObject({
            mode: 'subscription',
            priceId: priceOf(planId, interval),
            billingAccountId: account.id,
            trialDays: planId === 'professional' ? 7 : null,
            metadata: { billing_account_id: account.id, sku: `plan:${planId}:${interval}` },
          });
          expect(result).toMatchObject({ provider: 'stripe', trialDays: planId === 'professional' ? 7 : null });
        }
      }
    });

    it('ignores a price id sent by the client', async () => {
      const account = await f.freeAccount();
      const body = {
        planId: 'starter' as const,
        interval: 'monthly' as const,
        provider: 'stripe' as const,
        idempotencyKey: 'client-price',
        priceId: priceOf('business', 'annual'),
      };
      const request: CheckoutRequest = body;
      await f.payments.createCheckout(account.id, request);
      expect(f.stripe.sessions[f.stripe.sessions.length - 1].priceId).toBe(priceOf('starter'));
    });

    it('does not sell Free, sells Business on Stripe only, and gives stores the product id the server chose', async () => {
      const account = await f.freeAccount();
      const free = await errorOf(
        f.payments.createCheckout(account.id, { planId: 'free', interval: 'monthly', provider: 'stripe', idempotencyKey: 'a' }),
      );
      expect(free.code).toBe('validation_error');
      for (const provider of ['apple', 'google'] as const) {
        for (const interval of ['monthly', 'annual'] as const) {
          const error = await errorOf(
            f.payments.createCheckout(account.id, { planId: 'business', interval, provider, idempotencyKey: 'b' }),
          );
          expect(error.code).toBe('channel_unavailable');
          expect(error.details).toEqual({ planId: 'business', interval, provider });
        }
      }
      const sessions = f.stripe.sessions.length;
      expect(
        await f.payments.createCheckout(account.id, { planId: 'starter', interval: 'monthly', provider: 'apple', idempotencyKey: 'c' }),
      ).toEqual({ provider: 'apple', productId: 'com.flacroncv.v2.starter.monthly', accountToken: account.id });
      expect(f.stripe.sessions.length).toBe(sessions);
    });

    it('gives the Professional trial only when it has not been used', async () => {
      const used = await f.billing.createFreeAccount({
        authUserId: `uid-${randomUUID()}`,
        hasUsedTrial: true,
        catalogVersion: snapshot.version,
      });
      const result = await f.payments.createCheckout(used.id, {
        planId: 'professional',
        interval: 'annual',
        provider: 'stripe',
        idempotencyKey: 'trial',
      });
      expect(result).toMatchObject({ trialDays: null });
      expect(f.stripe.sessions[f.stripe.sessions.length - 1].trialDays).toBeNull();
    });

    it('replays the same key, refuses the same key with another body, and retries after a Stripe failure', async () => {
      const account = await f.freeAccount();
      const request = { planId: 'starter' as const, interval: 'monthly' as const, provider: 'stripe' as const };
      f.stripe.failNext = true;
      await expect(f.payments.createCheckout(account.id, { ...request, idempotencyKey: 'k1' })).rejects.toThrow('fake Stripe outage');
      const first = await f.payments.createCheckout(account.id, { ...request, idempotencyKey: 'k1' });
      const again = await f.payments.createCheckout(account.id, { ...request, idempotencyKey: 'k1' });
      expect(again).toEqual(first);
      const mismatch = await errorOf(
        f.payments.createCheckout(account.id, { ...request, interval: 'annual', idempotencyKey: 'k1' }),
      );
      expect(mismatch.code).toBe('idempotency_mismatch');
    });

    it('refuses an account that already pays for a V2 plan', async () => {
      const { accountId } = await subscribed('starter');
      const error = await errorOf(
        f.payments.createCheckout(accountId, { planId: 'professional', interval: 'monthly', provider: 'stripe', idempotencyKey: 'x' }),
      );
      expect(error.details).toMatchObject({ reason: 'already_subscribed' });
    });

    it('sells packs from Starter up, never to Free, and respects each pack minimum', async () => {
      const free = await f.freeAccount();
      expect((await errorOf(f.payments.createPackCheckout(free.id, { addonId: 'document_s', idempotencyKey: 'p' }))).code).toBe(
        'not_purchasable',
      );
      const { accountId } = await subscribed('starter');
      const action = await errorOf(f.payments.createPackCheckout(accountId, { addonId: 'action_s', idempotencyKey: 'p1' }));
      expect(action.details).toMatchObject({ minimumPlan: 'professional' });
      await f.payments.createPackCheckout(accountId, { addonId: 'document_s', idempotencyKey: 'p2' });
      expect(f.stripe.sessions[f.stripe.sessions.length - 1]).toMatchObject({
        mode: 'payment',
        priceId: 'price_test_document_s',
        trialDays: null,
      });
    });
  });

  describe('webhooks', () => {
    it('activates once; a replayed event changes nothing', async () => {
      const account = await f.freeAccount({ anchor: '2026-09-01T00:00:00Z' });
      const subscriptionId = `sub_${randomUUID()}`;
      const event = subscriptionEvent('customer.subscription.created', {
        id: subscriptionId,
        planId: 'starter',
        start: '2026-10-05T12:00:00Z',
        end: '2026-11-05T12:00:00Z',
        accountId: account.id,
      });
      expect(await f.deliverStripe(event)).toMatchObject({ outcome: 'applied', billingAccountId: account.id });
      const row = await f.db.pool.query(`SELECT plan_id, status, provider, provider_subscription_id FROM billing_accounts WHERE id = $1`, [
        account.id,
      ]);
      expect(row.rows[0]).toEqual({ plan_id: 'starter', status: 'active', provider: 'stripe', provider_subscription_id: subscriptionId });
      await f.spend(account.id, 'document_credit', 2);

      expect(await f.deliverStripe(event)).toMatchObject({ outcome: 'replayed', detail: 'applied' });
      const sameState = subscriptionEvent('customer.subscription.updated', {
        id: subscriptionId,
        planId: 'starter',
        start: '2026-10-05T12:00:00Z',
        end: '2026-11-05T12:00:00Z',
      });
      expect((await f.deliverStripe(sameState)).outcome).toBe('applied');
      expect(await f.billing.unitBalance(account.id, 'document_credit')).toMatchObject({
        includedGranted: 20,
        includedRemaining: 18,
      });
      const events = await f.db.pool.query(`SELECT count(*)::int AS n FROM billing_events WHERE provider_event_id = $1`, [event.id]);
      expect(events.rows[0].n).toBe(1);
    });

    it('rejects a price id outside the catalog and leaves the account alone', async () => {
      const account = await f.freeAccount();
      const event = subscriptionEvent('customer.subscription.created', {
        id: `sub_${randomUUID()}`,
        planId: 'starter',
        priceId: 'price_not_in_our_catalog',
        start: '2026-10-05T12:00:00Z',
        end: '2026-11-05T12:00:00Z',
        accountId: account.id,
      });
      expect(await f.deliverStripe(event)).toMatchObject({ outcome: 'rejected', detail: 'validation_error:unknown_price' });
      expect(await eventRow(event.id)).toEqual({ outcome: 'rejected', detail: 'validation_error:unknown_price' });
      const row = await f.db.pool.query(`SELECT plan_id, provider FROM billing_accounts WHERE id = $1`, [account.id]);
      expect(row.rows[0]).toEqual({ plan_id: 'free', provider: null });
    });

    it('refuses a bad signature before recording anything', async () => {
      const event = stripeFixtures.event('invoice.paid', {}, f.clock.now());
      const rawBody = JSON.stringify(event);
      const error = await errorOf(f.payments.stripeWebhook(rawBody, 't=1,v1=00'));
      expect(error.code).toBe('unauthenticated');
      expect(await eventRow(event.id)).toBeUndefined();
    });

    it('starts the Professional trial and marks the trial used', async () => {
      const account = await f.freeAccount();
      const subscriptionId = `sub_${randomUUID()}`;
      await f.deliverStripe(
        subscriptionEvent('customer.subscription.created', {
          id: subscriptionId,
          planId: 'professional',
          status: 'trialing',
          start: '2026-10-05T12:00:00Z',
          end: '2026-10-12T12:00:00Z',
          trialEnd: '2026-10-12T12:00:00Z',
          accountId: account.id,
        }),
      );
      const row = await f.db.pool.query(`SELECT plan_id, status, trial_end, has_used_trial FROM billing_accounts WHERE id = $1`, [
        account.id,
      ]);
      expect(row.rows[0]).toEqual({
        plan_id: 'professional',
        status: 'trialing',
        trial_end: new Date('2026-10-12T12:00:00Z'),
        has_used_trial: true,
      });
      const again = await f.payments.createCheckout(account.id, {
        planId: 'professional',
        interval: 'monthly',
        provider: 'stripe',
        idempotencyKey: 'second-trial',
      }).then(
        () => 'created',
        (e: unknown) => (e instanceof BillingError ? e.details.reason : e),
      );
      expect(again).toBe('already_subscribed');
    });

    it('records each paid invoice once and opens the next month when the period moves', async () => {
      const { accountId, subscriptionId } = await subscribed('starter');
      await f.spend(accountId, 'document_credit', 20);

      f.clock.set('2026-11-01T00:05:00Z');
      const invoice = stripeFixtures.invoice({
        subscriptionId,
        priceId: priceOf('starter'),
        amountPaid: 2199,
        paymentIntent: `pi_${randomUUID()}`,
        paidAt: f.clock.now(),
      });
      expect((await f.deliverStripe(stripeFixtures.event('invoice.paid', invoice, f.clock.now()))).outcome).toBe('applied');
      expect((await f.deliverStripe(stripeFixtures.event('invoice.paid', invoice, f.clock.now()))).detail).toBe('duplicate_payment');
      await f.deliverStripe(
        subscriptionEvent('customer.subscription.updated', {
          id: subscriptionId,
          planId: 'starter',
          start: '2026-11-01T00:00:00Z',
          end: '2026-12-01T00:00:00Z',
        }),
      );
      expect(await f.billing.unitBalance(accountId, 'document_credit')).toMatchObject({
        includedRemaining: 20,
        allowancePeriodStart: new Date('2026-11-01T00:00:00Z'),
      });
      const purchases = await f.db.pool.query(
        `SELECT kind, sku, amount_cents, currency FROM purchases WHERE billing_account_id = $1`,
        [accountId],
      );
      expect(purchases.rows).toEqual([{ kind: 'subscription', sku: 'plan:starter:monthly', amount_cents: 2199, currency: 'USD' }]);
    });

    it('upgrade preview does not reset used units, and neither does the verified upgrade', async () => {
      const { accountId, subscriptionId } = await subscribed('starter');
      await f.spend(accountId, 'document_credit', 5);
      f.clock.set('2026-10-16T00:00:00Z');
      const ledgerBefore = await f.db.pool.query(`SELECT count(*)::int AS n FROM usage_ledger WHERE billing_account_id = $1`, [
        accountId,
      ]);

      const preview = await f.payments.upgradePreview(accountId, 'professional');
      const professionalDocs = includedFor(snapshot, 'professional', 'document_credit') ?? 0;
      expect(preview).toMatchObject({ currency: 'USD', restartsUsage: false });
      expect(preview.proratedCents).toBe(Math.round(((3899 - 2199) * 16) / 31));
      expect(preview.allowanceDeltas).toContainEqual({ unit: 'document_credit', delta: professionalDocs - 20 });
      expect(await f.billing.unitBalance(accountId, 'document_credit')).toMatchObject({ includedGranted: 20, includedRemaining: 15 });
      const plan = await f.db.pool.query(`SELECT plan_id FROM billing_accounts WHERE id = $1`, [accountId]);
      expect(plan.rows[0].plan_id).toBe('starter');

      await f.deliverStripe(
        subscriptionEvent('customer.subscription.updated', {
          id: subscriptionId,
          planId: 'professional',
          start: '2026-10-01T00:00:00Z',
          end: '2026-11-01T00:00:00Z',
        }),
      );
      expect(await f.billing.unitBalance(accountId, 'document_credit')).toMatchObject({
        includedGranted: professionalDocs,
        includedRemaining: professionalDocs - 5,
      });
      const ledgerAfter = await f.db.pool.query(`SELECT count(*)::int AS n FROM usage_ledger WHERE billing_account_id = $1`, [
        accountId,
      ]);
      expect(ledgerAfter.rows[0].n).toBe(ledgerBefore.rows[0].n);
    });

    it('a downgrade waits for the period end and keeps the old rows readable', async () => {
      const { accountId, subscriptionId } = await subscribed('professional');
      await f.spend(accountId, 'action_pack', 3);
      const ledgerBefore = await f.db.pool.query(
        `SELECT id, unit, quantity, state, allowance_period_start FROM usage_ledger WHERE billing_account_id = $1 ORDER BY id`,
        [accountId],
      );

      f.clock.set('2026-10-20T00:00:00Z');
      await f.deliverStripe(
        subscriptionEvent('customer.subscription.updated', {
          id: subscriptionId,
          planId: 'starter',
          start: '2026-10-01T00:00:00Z',
          end: '2026-11-01T00:00:00Z',
        }),
      );
      const scheduled = await f.db.pool.query(`SELECT plan_id, scheduled_plan_id FROM billing_accounts WHERE id = $1`, [accountId]);
      expect(scheduled.rows[0]).toEqual({ plan_id: 'professional', scheduled_plan_id: 'starter' });
      expect((await reserveOne(accountId, 'action_pack')).ledger.state).toBe('reserved');

      f.clock.set('2026-11-01T00:05:00Z');
      await f.deliverStripe(
        subscriptionEvent('customer.subscription.updated', {
          id: subscriptionId,
          planId: 'starter',
          start: '2026-11-01T00:00:00Z',
          end: '2026-12-01T00:00:00Z',
        }),
      );
      const after = await f.db.pool.query(`SELECT plan_id, scheduled_plan_id FROM billing_accounts WHERE id = $1`, [accountId]);
      expect(after.rows[0]).toEqual({ plan_id: 'starter', scheduled_plan_id: null });
      expect((await errorOf(reserveOne(accountId, 'action_pack'))).code).toBe('plan_upgrade_required');
      expect(await f.billing.unitBalance(accountId, 'document_credit')).toMatchObject({ includedGranted: 20 });

      const october = await f.db.pool.query(
        `SELECT included_granted, included_remaining FROM usage_balances
          WHERE billing_account_id = $1 AND unit = 'action_pack' AND allowance_period_start = '2026-10-01T00:00:00Z'`,
        [accountId],
      );
      expect(october.rows).toEqual([{ included_granted: 10, included_remaining: 6 }]);
      const ledgerNow = await f.db.pool.query(
        `SELECT id, unit, quantity, state, allowance_period_start FROM usage_ledger
          WHERE billing_account_id = $1 AND id = ANY($2) ORDER BY id`,
        [accountId, ledgerBefore.rows.map((r) => r.id)],
      );
      expect(ledgerNow.rows).toEqual(ledgerBefore.rows);
    });

    it('cancel at period end is a flag; the deletion moves the account to Free and keeps its packs', async () => {
      const { accountId, subscriptionId } = await subscribed('starter');
      const checkout = await f.payments.createPackCheckout(accountId, { addonId: 'document_s', idempotencyKey: 'pack-1' });
      if (checkout.provider !== 'stripe') throw new Error('expected Stripe');
      await f.deliverStripe(
        stripeFixtures.event(
          'checkout.session.completed',
          stripeFixtures.packCheckout({ sessionId: checkout.sessionId, accountId, paymentIntent: `pi_${randomUUID()}`, amountTotal: 499 }),
          f.clock.now(),
        ),
      );

      await f.deliverStripe(
        subscriptionEvent('customer.subscription.updated', {
          id: subscriptionId,
          planId: 'starter',
          start: '2026-10-01T00:00:00Z',
          end: '2026-11-01T00:00:00Z',
          cancelAtPeriodEnd: true,
        }),
      );
      const flagged = await f.db.pool.query(`SELECT plan_id, cancel_at_period_end FROM billing_accounts WHERE id = $1`, [accountId]);
      expect(flagged.rows[0]).toEqual({ plan_id: 'starter', cancel_at_period_end: true });

      f.clock.set('2026-11-01T00:00:01Z');
      await f.deliverStripe(
        subscriptionEvent('customer.subscription.deleted', {
          id: subscriptionId,
          planId: 'starter',
          status: 'canceled',
          start: '2026-10-01T00:00:00Z',
          end: '2026-11-01T00:00:00Z',
        }),
      );
      const ended = await f.db.pool.query(
        `SELECT plan_id, status, provider, provider_subscription_id FROM billing_accounts WHERE id = $1`,
        [accountId],
      );
      expect(ended.rows[0]).toEqual({ plan_id: 'free', status: 'active', provider: null, provider_subscription_id: null });
      expect(await f.billing.unitBalance(accountId, 'document_credit')).toMatchObject({ includedGranted: 3, packRemaining: 10 });
    });

    it('a pack is granted from our checkout record, and a refund revokes only its unused units', async () => {
      const { accountId } = await subscribed('starter');
      const checkout = await f.payments.createPackCheckout(accountId, { addonId: 'document_s', idempotencyKey: 'pack-2' });
      if (checkout.provider !== 'stripe') throw new Error('expected Stripe');
      const paymentIntent = `pi_${randomUUID()}`;
      expect(
        (
          await f.deliverStripe(
            stripeFixtures.event(
              'checkout.session.completed',
              stripeFixtures.packCheckout({ sessionId: checkout.sessionId, accountId, paymentIntent, amountTotal: 499 }),
              f.clock.now(),
            ),
          )
        ).outcome,
      ).toBe('applied');
      const unknown = stripeFixtures.event(
        'checkout.session.completed',
        stripeFixtures.packCheckout({ sessionId: 'cs_not_ours', accountId, paymentIntent: 'pi_other', amountTotal: 1 }),
        f.clock.now(),
      );
      expect((await f.deliverStripe(unknown)).detail).toBe('validation_error:unknown_checkout');

      await f.spend(accountId, 'document_credit', 20 + 2);
      const refund = (amountRefunded: number) =>
        stripeFixtures.event('charge.refunded', stripeFixtures.charge({ paymentIntent, amount: 499, amountRefunded }), f.clock.now());
      expect((await f.deliverStripe(refund(499))).outcome).toBe('applied');
      expect((await f.deliverStripe(refund(499))).detail).toBe('no_new_refund');

      const pack = await f.db.pool.query(
        `SELECT p.status, p.remaining_units, p.revoked_units, p.revoke_reason, u.sku, u.amount_cents, u.refunded_cents
           FROM packs p JOIN purchases u ON u.id = p.purchase_id WHERE p.billing_account_id = $1`,
        [accountId],
      );
      expect(pack.rows).toEqual([
        {
          status: 'revoked',
          remaining_units: 0,
          revoked_units: 8,
          revoke_reason: 'refund',
          sku: 'pack:document_s',
          amount_cents: 499,
          refunded_cents: 499,
        },
      ]);
      const used = await f.db.pool.query(
        `SELECT count(*)::int AS n FROM usage_ledger l JOIN packs p ON p.id = l.pack_id
          WHERE p.billing_account_id = $1 AND l.state = 'committed'`,
        [accountId],
      );
      expect(used.rows[0].n).toBe(2);
    });

    it('a legacy row follows its own subscription and never becomes a V2 plan', async () => {
      const account = await f.freeAccount({ anchor: '2026-09-01T00:00:00Z' });
      const subscriptionId = `sub_v1_${randomUUID()}`;
      await f.db.pool.query(
        `UPDATE billing_accounts
            SET plan_id = 'legacy_pro', legacy_plan = 'pro', origin = 'migrated', provider = 'stripe',
                provider_subscription_id = $2, period_start = '2026-09-10T00:00:00Z', period_end = '2026-10-10T00:00:00Z'
          WHERE id = $1`,
        [account.id, subscriptionId],
      );
      const balancesBefore = await f.db.pool.query(`SELECT count(*)::int AS n FROM usage_balances WHERE billing_account_id = $1`, [
        account.id,
      ]);

      f.clock.set('2026-10-10T00:05:00Z');
      const renewal = subscriptionEvent('customer.subscription.updated', {
        id: subscriptionId,
        planId: 'starter',
        priceId: 'price_test_v1_pro_monthly',
        start: '2026-10-10T00:00:00Z',
        end: '2026-11-10T00:00:00Z',
      });
      expect((await f.deliverStripe(renewal)).outcome).toBe('applied');
      const row = await f.db.pool.query(`SELECT plan_id, legacy_plan, period_end FROM billing_accounts WHERE id = $1`, [account.id]);
      expect(row.rows[0]).toEqual({ plan_id: 'legacy_pro', legacy_plan: 'pro', period_end: new Date('2026-11-10T00:00:00Z') });
      const balancesAfter = await f.db.pool.query(`SELECT count(*)::int AS n FROM usage_balances WHERE billing_account_id = $1`, [
        account.id,
      ]);
      expect(balancesAfter.rows[0].n).toBe(balancesBefore.rows[0].n);

      const toV2 = subscriptionEvent('customer.subscription.updated', {
        id: subscriptionId,
        planId: 'career_pro',
        start: '2026-10-10T00:00:00Z',
        end: '2026-11-10T00:00:00Z',
      });
      expect((await f.deliverStripe(toV2)).detail).toBe('validation_error:legacy_plan_mismatch');
      const still = await f.db.pool.query(`SELECT plan_id FROM billing_accounts WHERE id = $1`, [account.id]);
      expect(still.rows[0].plan_id).toBe('legacy_pro');

      const fresh = await f.freeAccount();
      const v1OnNewAccount = subscriptionEvent('customer.subscription.created', {
        id: `sub_${randomUUID()}`,
        planId: 'starter',
        priceId: 'price_test_v1_pro_monthly',
        start: '2026-10-10T00:00:00Z',
        end: '2026-11-10T00:00:00Z',
        accountId: fresh.id,
      });
      expect((await f.deliverStripe(v1OnNewAccount)).detail).toBe('validation_error:legacy_price_on_new_subscription');
    });

    it('an older event delivered late does not undo a newer one', async () => {
      const { accountId, subscriptionId } = await subscribed('starter');
      // Stripe repeats the subscription's metadata, our account id, on every event.
      const period = { start: '2026-10-01T00:00:00Z', end: '2026-11-01T00:00:00Z', accountId };
      const olderUpdate = subscriptionEvent(
        'customer.subscription.updated',
        { id: subscriptionId, planId: 'starter', ...period },
        new Date('2026-10-05T12:00:10Z'),
      );
      const deletion = subscriptionEvent(
        'customer.subscription.deleted',
        { id: subscriptionId, planId: 'starter', status: 'canceled', ...period },
        new Date('2026-10-05T12:00:20Z'),
      );
      await f.deliverStripe(deletion);
      expect(await f.deliverStripe(olderUpdate)).toMatchObject({ outcome: 'ignored', detail: 'stale' });
      const row = await f.db.pool.query(`SELECT plan_id FROM billing_accounts WHERE id = $1`, [accountId]);
      expect(row.rows[0].plan_id).toBe('free');
    });
  });
});

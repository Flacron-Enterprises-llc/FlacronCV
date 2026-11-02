/**
 * BUILD_PLAN P3 with the stores: Apple and Google write the same
 * `billing_accounts` row as Stripe. Business is never a store product. A
 * V1 product id keeps its legacy plan. Fakes only: no store is called.
 */
import { randomUUID } from 'crypto';
import { createPaymentsFixture, fakeAppleSignedPayload, googlePushBody, PaymentsFixture } from '../../testing';
import type { AppleNotification } from './apple';
import { BillingError } from '../errors';

describe('App Store and Google Play notifications', () => {
  let f: PaymentsFixture;

  beforeAll(async () => {
    f = await createPaymentsFixture('payments_stores', '2026-10-05T12:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });
  afterEach(() => {
    f.clock.set('2026-10-05T12:00:00Z');
  });

  async function account(id: string) {
    const res = await f.db.pool.query(
      `SELECT plan_id, legacy_plan, status, provider, provider_subscription_id, period_end, scheduled_plan_id
         FROM billing_accounts WHERE id = $1`,
      [id],
    );
    return res.rows[0];
  }

  async function errorOf(promise: Promise<unknown>): Promise<BillingError> {
    const error = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );
    if (!(error instanceof BillingError)) throw new Error(`expected a BillingError, got ${String(error)}`);
    return error;
  }

  describe('Apple', () => {
    function appleSubscription(input: {
      type: string;
      subtype?: string;
      productId: string;
      original: string;
      purchase: string;
      expires: string;
      accountId?: string;
      priceMilli?: number;
      autoRenewProductId?: string;
    }): AppleNotification {
      return {
        notificationUUID: randomUUID(),
        notificationType: input.type,
        subtype: input.subtype,
        signedDate: f.clock.now().getTime(),
        data: {
          bundleId: 'com.flacroncv.mobile',
          environment: 'Sandbox',
          transaction: {
            transactionId: randomUUID(),
            originalTransactionId: input.original,
            productId: input.productId,
            appAccountToken: input.accountId,
            purchaseDate: new Date(input.purchase).getTime(),
            expiresDate: new Date(input.expires).getTime(),
            type: 'Auto-Renewable Subscription',
            price: input.priceMilli,
            currency: 'USD',
          },
          renewal: { autoRenewStatus: 1, autoRenewProductId: input.autoRenewProductId ?? input.productId },
        },
      };
    }

    it('subscribes, renews, and downgrades at renewal on the same row', async () => {
      const free = await f.freeAccount();
      const original = `apple-${randomUUID()}`;
      const subscribed = appleSubscription({
        type: 'SUBSCRIBED',
        subtype: 'INITIAL_BUY',
        productId: 'com.flacroncv.v2.professional.monthly',
        original,
        purchase: '2026-10-05T12:00:00Z',
        expires: '2026-11-05T12:00:00Z',
        accountId: free.id,
        priceMilli: 38990,
      });
      expect((await f.deliverApple(subscribed)).outcome).toBe('applied');
      expect(await f.deliverApple(subscribed)).toMatchObject({ outcome: 'replayed' });
      expect(await account(free.id)).toMatchObject({ plan_id: 'professional', provider: 'apple', provider_subscription_id: original });

      f.clock.set('2026-10-20T00:00:00Z');
      await f.deliverApple(
        appleSubscription({
          type: 'DID_CHANGE_RENEWAL_PREF',
          subtype: 'DOWNGRADE',
          productId: 'com.flacroncv.v2.professional.monthly',
          original,
          purchase: '2026-10-05T12:00:00Z',
          expires: '2026-11-05T12:00:00Z',
          autoRenewProductId: 'com.flacroncv.v2.starter.monthly',
        }),
      );
      expect(await account(free.id)).toMatchObject({ plan_id: 'professional', scheduled_plan_id: 'starter' });

      f.clock.set('2026-11-05T12:01:00Z');
      await f.deliverApple(
        appleSubscription({
          type: 'DID_RENEW',
          productId: 'com.flacroncv.v2.starter.monthly',
          original,
          purchase: '2026-11-05T12:00:00Z',
          expires: '2026-12-05T12:00:00Z',
          priceMilli: 21990,
        }),
      );
      expect(await account(free.id)).toMatchObject({
        plan_id: 'starter',
        scheduled_plan_id: null,
        period_end: new Date('2026-12-05T12:00:00Z'),
      });
      const purchases = await f.db.pool.query(
        `SELECT sku, amount_cents, currency FROM purchases WHERE billing_account_id = $1 ORDER BY purchased_at`,
        [free.id],
      );
      expect(purchases.rows).toEqual([
        { sku: 'plan:professional:monthly', amount_cents: 3899, currency: 'USD' },
        { sku: 'plan:starter:monthly', amount_cents: 2199, currency: 'USD' },
      ]);

      f.clock.set('2026-12-05T12:01:00Z');
      await f.deliverApple(
        appleSubscription({
          type: 'EXPIRED',
          subtype: 'VOLUNTARY',
          productId: 'com.flacroncv.v2.starter.monthly',
          original,
          purchase: '2026-11-05T12:00:00Z',
          expires: '2026-12-05T12:00:00Z',
        }),
      );
      expect(await account(free.id)).toMatchObject({ plan_id: 'free', provider: null });
    });

    it('rejects a product that is not ours, including any Business product id', async () => {
      const free = await f.freeAccount();
      const notification = appleSubscription({
        type: 'SUBSCRIBED',
        productId: 'com.flacroncv.v2.business.monthly',
        original: `apple-${randomUUID()}`,
        purchase: '2026-10-05T12:00:00Z',
        expires: '2026-11-05T12:00:00Z',
        accountId: free.id,
      });
      expect(await f.deliverApple(notification)).toMatchObject({ outcome: 'rejected', detail: 'validation_error:unknown_price' });
      expect(await account(free.id)).toMatchObject({ plan_id: 'free' });
    });

    it('a V1 product id keeps a legacy row legacy and cannot start a new plan', async () => {
      const legacy = await f.freeAccount();
      const original = `apple-v1-${randomUUID()}`;
      await f.db.pool.query(
        `UPDATE billing_accounts
            SET plan_id = 'legacy_enterprise', legacy_plan = 'enterprise', origin = 'migrated', provider = 'apple',
                provider_subscription_id = $2, period_start = '2026-09-20T00:00:00Z', period_end = '2026-10-20T00:00:00Z'
          WHERE id = $1`,
        [legacy.id, original],
      );
      f.clock.set('2026-10-20T00:01:00Z');
      const renewal = appleSubscription({
        type: 'DID_RENEW',
        productId: 'com.flacroncv.enterprise.monthly',
        original,
        purchase: '2026-10-20T00:00:00Z',
        expires: '2026-11-20T00:00:00Z',
        priceMilli: 9990,
      });
      expect((await f.deliverApple(renewal)).outcome).toBe('applied');
      expect(await account(legacy.id)).toMatchObject({
        plan_id: 'legacy_enterprise',
        legacy_plan: 'enterprise',
        period_end: new Date('2026-11-20T00:00:00Z'),
      });

      const fresh = await f.freeAccount();
      const v1Buy = appleSubscription({
        type: 'SUBSCRIBED',
        productId: 'com.flacroncv.pro.monthly',
        original: `apple-${randomUUID()}`,
        purchase: '2026-10-20T00:00:00Z',
        expires: '2026-11-20T00:00:00Z',
        accountId: fresh.id,
      });
      expect((await f.deliverApple(v1Buy)).detail).toBe('validation_error:legacy_price_on_new_subscription');
    });

    it('refuses a payload that does not verify, before recording anything', async () => {
      const signed = fakeAppleSignedPayload({ notificationUUID: 'n-1', notificationType: 'TEST', signedDate: 0 });
      const error = await errorOf(f.payments.appleWebhook({ signedPayload: `x${signed}` }));
      expect(error.code).toBe('unauthenticated');
      const rows = await f.db.pool.query(`SELECT 1 FROM billing_events WHERE provider_event_id = 'n-1'`);
      expect(rows.rowCount).toBe(0);
    });
  });

  describe('Google', () => {
    function subscriptionRtdn(token: string, notificationType: number) {
      return {
        version: '1.0',
        packageName: 'com.flacroncv.mobile',
        eventTimeMillis: String(f.clock.now().getTime()),
        subscriptionNotification: { version: '1.0', notificationType, purchaseToken: token },
      };
    }

    function playSubscription(token: string, input: { accountId: string; productId: string; basePlanId: string; expiry: string }) {
      f.googlePlay.subscriptions.set(token, {
        latestOrderId: `GPA.${randomUUID()}`,
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        externalAccountIdentifiers: { obfuscatedExternalAccountId: input.accountId },
        lineItems: [
          {
            productId: input.productId,
            expiryTime: input.expiry,
            offerDetails: { basePlanId: input.basePlanId },
            autoRenewingPlan: { autoRenewEnabled: true },
          },
        ],
      });
    }

    it('a purchase activates the plan and is acknowledged, also on redelivery', async () => {
      const free = await f.freeAccount();
      const token = `gp-${randomUUID()}`;
      playSubscription(token, { accountId: free.id, productId: 'flacroncv_starter', basePlanId: 'monthly', expiry: '2026-11-05T12:00:00Z' });
      const messageId = randomUUID();
      expect((await f.deliverGoogle(subscriptionRtdn(token, 4), messageId)).outcome).toBe('applied');
      expect(await account(free.id)).toMatchObject({ plan_id: 'starter', provider: 'google', provider_subscription_id: token });
      expect(await f.billing.unitBalance(free.id, 'document_credit')).toMatchObject({ includedGranted: 20 });
      expect(f.googlePlay.acknowledged.filter((t) => t === token)).toHaveLength(1);

      expect(await f.deliverGoogle(subscriptionRtdn(token, 4), messageId)).toMatchObject({ outcome: 'replayed', detail: 'applied' });
      expect(f.googlePlay.acknowledged.filter((t) => t === token)).toHaveLength(2);
    });

    it('a product that is not ours is rejected and left unacknowledged, so Google refunds it', async () => {
      const free = await f.freeAccount();
      const token = `gp-${randomUUID()}`;
      playSubscription(token, { accountId: free.id, productId: 'flacroncv_business', basePlanId: 'monthly', expiry: '2026-11-05T12:00:00Z' });
      expect(await f.deliverGoogle(subscriptionRtdn(token, 4))).toMatchObject({
        outcome: 'rejected',
        detail: 'validation_error:unknown_price',
      });
      expect(f.googlePlay.acknowledged).not.toContain(token);
      expect(await account(free.id)).toMatchObject({ plan_id: 'free' });
    });

    it('a pack: refused on Free, granted on Starter, revoked when voided', async () => {
      const productRtdn = (token: string) => ({
        version: '1.0',
        packageName: 'com.flacroncv.mobile',
        eventTimeMillis: String(f.clock.now().getTime()),
        oneTimeProductNotification: { version: '1.0', notificationType: 1, purchaseToken: token, sku: 'flacroncv_pack_document_s' },
      });
      const buy = (accountId: string) => {
        const token = `gp-pack-${randomUUID()}`;
        const orderId = `GPA.${randomUUID()}`;
        f.googlePlay.products.set(`flacroncv_pack_document_s/${token}`, {
          orderId,
          purchaseState: 0,
          purchaseTimeMillis: String(f.clock.now().getTime()),
          obfuscatedExternalAccountId: accountId,
        });
        return { token, orderId };
      };

      const free = await f.freeAccount();
      const refused = buy(free.id);
      expect((await f.deliverGoogle(productRtdn(refused.token))).detail).toBe('not_purchasable');
      expect(f.googlePlay.acknowledged).not.toContain(`flacroncv_pack_document_s/${refused.token}`);

      const starter = await f.freeAccount();
      const subToken = `gp-${randomUUID()}`;
      playSubscription(subToken, { accountId: starter.id, productId: 'flacroncv_starter', basePlanId: 'monthly', expiry: '2026-11-05T12:00:00Z' });
      await f.deliverGoogle(subscriptionRtdn(subToken, 4));
      const bought = buy(starter.id);
      expect((await f.deliverGoogle(productRtdn(bought.token))).outcome).toBe('applied');
      expect(f.googlePlay.acknowledged).toContain(`flacroncv_pack_document_s/${bought.token}`);
      expect(await f.billing.unitBalance(starter.id, 'document_credit')).toMatchObject({ packRemaining: 10 });

      const voided = {
        version: '1.0',
        packageName: 'com.flacroncv.mobile',
        eventTimeMillis: String(f.clock.now().getTime()),
        voidedPurchaseNotification: { purchaseToken: bought.token, orderId: bought.orderId, productType: 2 },
      };
      expect((await f.deliverGoogle(voided)).outcome).toBe('applied');
      expect(await f.billing.unitBalance(starter.id, 'document_credit')).toMatchObject({ packRemaining: 0 });
    });

    it('refuses a push without the Pub/Sub token, before calling Google or recording anything', async () => {
      const body = googlePushBody({ testNotification: { version: '1.0' } }, f.clock.now(), 'm-unauth');
      const error = await errorOf(f.payments.googleWebhook(body, 'Bearer forged'));
      expect(error.code).toBe('unauthenticated');
      const rows = await f.db.pool.query(`SELECT 1 FROM billing_events WHERE provider_event_id = 'm-unauth'`);
      expect(rows.rowCount).toBe(0);
    });
  });
});

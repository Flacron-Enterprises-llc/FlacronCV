import { PLAN_ORDER, PLANS, subscriptionChargeCents } from '@flacroncv/career-shared';
import type { BillingInterval, PlanId } from '@flacroncv/career-shared';
import { BillingError } from '../errors';
import { buildCatalogSnapshot } from '../catalog';
import { UnconfiguredStripeGateway, type StripeCheckoutRequest, type StripeGateway, type StripeUpgradeQuoteRequest } from './checkout';
import { ProviderSkus, skuKey } from './skus';
import { STRIPE_API_VERSION, STRIPE_APP_ID } from './stripe';

export { STRIPE_APP_ID };

export function isStripeTestSecret(secret: string): boolean {
  return /^(sk_test_|rk_test_)/.test(secret.trim());
}

export function isStripeLiveSecret(secret: string): boolean {
  return /^(sk_live_|rk_live_)/.test(secret.trim());
}

/**
 * Stripe HTTPS adapter. Development accepts only test secrets. Metadata
 * stamps `app_id=flacroncv-v2` so V1 objects on the same Stripe account
 * are not reused.
 */
export class LiveStripeGateway implements StripeGateway {
  constructor(
    private readonly secret: string,
    private readonly siteUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly appId: string = STRIPE_APP_ID,
    private readonly timeoutMs: number = 20_000,
  ) {
    if (!secret.trim()) throw new Error('LiveStripeGateway needs STRIPE_SECRET_KEY');
  }

  async createCheckoutSession(request: StripeCheckoutRequest): Promise<{ sessionId: string; url: string }> {
    const fields: Record<string, string> = {
      mode: request.mode,
      'line_items[0][price]': request.priceId,
      'line_items[0][quantity]': '1',
      success_url: `${this.siteUrl.replace(/\/+$/, '')}/en/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.siteUrl.replace(/\/+$/, '')}/en/pricing`,
      client_reference_id: request.billingAccountId,
      'metadata[app_id]': this.appId,
    };
    if (request.customerId) fields.customer = request.customerId;
    for (const [key, value] of Object.entries(request.metadata)) {
      fields[`metadata[${key}]`] = value;
    }
    if (request.mode === 'subscription') {
      fields['subscription_data[metadata][app_id]'] = this.appId;
      for (const [key, value] of Object.entries(request.metadata)) {
        fields[`subscription_data[metadata][${key}]`] = value;
      }
      if (request.trialDays) fields['subscription_data[trial_period_days]'] = String(request.trialDays);
    }
    const created = await this.postForm('/v1/checkout/sessions', fields, request.idempotencyKey);
    const sessionId = str(created.id);
    const url = str(created.url);
    if (!sessionId || !url) throw new BillingError('provider_unavailable', { reason: 'stripe_session' });
    return { sessionId, url };
  }

  async quoteUpgrade(request: StripeUpgradeQuoteRequest): Promise<{ proratedCents: number }> {
    const created = await this.postForm('/v1/invoices/create_preview', {
      subscription: request.subscriptionId,
      'subscription_details[items][0][price]': request.newPriceId,
    });
    const amount = num(created.amount_due);
    if (amount === null) throw new BillingError('provider_unavailable', { reason: 'stripe_quote' });
    return { proratedCents: amount };
  }

  async createBillingPortal(request: { billingAccountId: string; customerId: string | null }): Promise<{ url: string }> {
    if (!request.customerId) throw new BillingError('provider_unavailable', { reason: 'stripe_customer' });
    const created = await this.postForm('/v1/billing_portal/sessions', {
      customer: request.customerId,
      return_url: `${this.siteUrl.replace(/\/+$/, '')}/en/billing`,
    });
    const url = str(created.url);
    if (!url) throw new BillingError('provider_unavailable', { reason: 'stripe_portal' });
    return { url };
  }

  /** Creates missing V2 plan prices on the test account. Never maps V1 Pro/Enterprise ids. */
  async ensurePlanPrices(): Promise<Record<string, string>> {
    const listed = await this.getJson(`/v1/prices?active=true&limit=100`);
    const existing = new Map<string, string>();
    for (const item of array(listed.data)) {
      const row = record(item);
      const nickname = str(row.nickname);
      const id = str(row.id);
      if (nickname && id) existing.set(nickname, id);
    }
    const mapped: Record<string, string> = {};
    for (const planId of PLAN_ORDER) {
      if (planId === 'free') continue;
      for (const interval of ['monthly', 'annual'] as const) {
        const key = skuKey({ kind: 'plan', planId, interval });
        mapped[key] = existing.get(`v2:${planId}:${interval}`) ?? (await this.ensurePrice(planId, interval));
      }
    }
    return mapped;
  }

  private async ensurePrice(planId: PlanId, interval: BillingInterval): Promise<string> {
    const nickname = `v2:${planId}:${interval}`;
    const product = await this.postForm('/v1/products', {
      name: `FlacronCV V2 ${PLANS[planId].id} ${interval}`,
      'metadata[app_id]': this.appId,
      'metadata[sku]': skuKey({ kind: 'plan', planId, interval }),
    });
    const productId = str(product.id);
    if (!productId) throw new BillingError('provider_unavailable', { reason: 'stripe_product' });
    const price = await this.postForm('/v1/prices', {
      product: productId,
      currency: 'usd',
      unit_amount: String(subscriptionChargeCents(planId, interval)),
      nickname,
      'recurring[interval]': interval === 'annual' ? 'year' : 'month',
      'metadata[app_id]': this.appId,
      'metadata[sku]': skuKey({ kind: 'plan', planId, interval }),
    });
    const priceId = str(price.id);
    if (!priceId) throw new BillingError('provider_unavailable', { reason: 'stripe_price' });
    return priceId;
  }

  private async postForm(path: string, fields: Record<string, string>, idempotencyKey?: string): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.secret}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': STRIPE_API_VERSION,
    };
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    const response = await this.fetchImpl(`https://api.stripe.com${path}`, {
      method: 'POST',
      headers,
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new BillingError('provider_unavailable', { reason: stripeReason(body) });
    return body;
  }

  private async getJson(path: string): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`https://api.stripe.com${path}`, {
      headers: {
        authorization: `Bearer ${this.secret}`,
        'stripe-version': STRIPE_API_VERSION,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new BillingError('provider_unavailable', { reason: stripeReason(body) });
    return body;
  }
}

export function createStripeGateway(env: NodeJS.ProcessEnv = process.env): StripeGateway {
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? '';
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  if (!secret) return new UnconfiguredStripeGateway();
  if (isStripeLiveSecret(secret) && (nodeEnv !== 'production' || env.DEPLOY_ENV?.trim().toLowerCase() === 'staging')) {
    return new UnconfiguredStripeGateway();
  }
  if (!isStripeTestSecret(secret) && nodeEnv !== 'production') return new UnconfiguredStripeGateway();
  const site = env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3001';
  return new LiveStripeGateway(secret, site, fetch, env.STRIPE_APP_ID?.trim() || STRIPE_APP_ID);
}

export async function stripeSkusFromEnv(env: NodeJS.ProcessEnv, gateway: StripeGateway): Promise<ProviderSkus> {
  const snapshot = buildCatalogSnapshot();
  const raw = env.STRIPE_PRICES?.trim() ?? '';
  if (raw.length > 0) return ProviderSkus.parse('stripe', 'STRIPE_PRICES', raw, snapshot);
  if (env.STRIPE_AUTO_TEST_PRICES === 'true' && gateway instanceof LiveStripeGateway && isStripeTestSecret(env.STRIPE_SECRET_KEY ?? '')) {
    try {
      const mapped = await gateway.ensurePlanPrices();
      return ProviderSkus.parse('stripe', 'STRIPE_PRICES', JSON.stringify(mapped), snapshot);
    } catch {
      return ProviderSkus.empty('stripe');
    }
  }
  return ProviderSkus.empty('stripe');
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stripeReason(body: Record<string, unknown>): string {
  const error = record(body.error);
  const code = str(error.code) ?? str(error.type);
  return code && /^[a-z0-9_]+$/i.test(code) ? code : 'stripe_error';
}

import {
  FLACRONCV_WEBHOOK_URL,
  PortalConfigLike,
  WebhookEndpointLike,
  foreignFingerprint,
  planPortal,
  planWebhookEvents,
} from './stripe-live-setup';
import { HANDLED_STRIPE_EVENTS } from './payment.service';

const endpoint = (over: Partial<WebhookEndpointLike> = {}): WebhookEndpointLike => ({
  id: 'we_fcv',
  url: FLACRONCV_WEBHOOK_URL,
  status: 'enabled',
  livemode: true,
  enabled_events: ['checkout.session.completed', 'invoice.paid', 'invoice.payment_failed', 'customer.subscription.updated', 'customer.subscription.deleted', 'some.other.event'],
  metadata: { app_id: 'flacron-cv' },
  ...over,
});

describe('planWebhookEvents', () => {
  it('adds only the missing handled events and keeps every existing one', () => {
    const plan = planWebhookEvents([endpoint(), { ...endpoint(), id: 'we_other', url: 'https://other.example/hook', metadata: { app_id: 'other' } }], HANDLED_STRIPE_EVENTS, 'live');
    expect(plan.kind).toBe('add_events');
    if (plan.kind !== 'add_events') return;
    expect(plan.endpointId).toBe('we_fcv');
    expect(plan.add).toContain('checkout.session.expired');
    expect(plan.add).toContain('charge.dispute.closed');
    expect(plan.next).toEqual(expect.arrayContaining(endpoint().enabled_events));
    expect(new Set(plan.next)).toEqual(new Set([...endpoint().enabled_events, ...HANDLED_STRIPE_EVENTS]));
  });

  it('is up to date when everything is enabled (or the endpoint takes all events)', () => {
    expect(planWebhookEvents([endpoint({ enabled_events: [...HANDLED_STRIPE_EVENTS] })], HANDLED_STRIPE_EVENTS, 'live').kind).toBe('up_to_date');
    expect(planWebhookEvents([endpoint({ enabled_events: ['*'] })], HANDLED_STRIPE_EVENTS, 'live').kind).toBe('up_to_date');
  });

  it('refuses missing, duplicate, wrong-mode, disabled and other-app endpoints', () => {
    expect(planWebhookEvents([], HANDLED_STRIPE_EVENTS, 'live').kind).toBe('conflict');
    expect(planWebhookEvents([endpoint(), endpoint({ id: 'we_2' })], HANDLED_STRIPE_EVENTS, 'live').kind).toBe('conflict');
    expect(planWebhookEvents([endpoint({ livemode: false })], HANDLED_STRIPE_EVENTS, 'live').kind).toBe('conflict');
    expect(planWebhookEvents([endpoint({ status: 'disabled' })], HANDLED_STRIPE_EVENTS, 'live').kind).toBe('conflict');
    expect(planWebhookEvents([endpoint({ metadata: { app_id: 'other-app' } })], HANDLED_STRIPE_EVENTS, 'live').kind).toBe('conflict');
    // An untagged endpoint with FlacronCV's exact URL is FlacronCV's (it predates the app_id standard).
    expect(planWebhookEvents([endpoint({ metadata: {} })], HANDLED_STRIPE_EVENTS, 'live').kind).toBe('add_events');
  });
});

const portal = (over: Partial<PortalConfigLike> = {}): PortalConfigLike => ({
  id: 'bpc_fcv',
  active: true,
  is_default: false,
  livemode: true,
  metadata: { app_id: 'flacron-cv', fcv_portal: 'five-plan-v1' },
  features: {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    subscription_update: { enabled: false },
  },
  ...over,
});

describe('planPortal', () => {
  const url = 'https://www.flacroncv.com/settings/billing';

  it('creates a non-default configuration without plan changes when none of ours exists; ignores others', () => {
    const others = [portal({ id: 'bpc_default', is_default: true, metadata: {} }), portal({ id: 'bpc_legacy', metadata: { app_id: 'flacron-cv' } })];
    const plan = planPortal(others, 'live', url);
    expect(plan.kind).toBe('create');
    if (plan.kind !== 'create') return;
    expect(plan.params.features.subscription_update.enabled).toBe(false);
    expect(plan.params.features.subscription_cancel.mode).toBe('at_period_end');
    expect(plan.params.metadata).toEqual({ app_id: 'flacron-cv', fcv_portal: 'five-plan-v1' });
    expect(plan.idempotencyKey).toMatch(/^flacroncv-portal-live-/);
  });

  it('reuses a matching configuration and refuses one that drifted, is default or is duplicated', () => {
    expect(planPortal([portal()], 'live', url)).toEqual({ kind: 'reuse', configurationId: 'bpc_fcv' });
    expect(planPortal([portal({ features: { ...portal().features, subscription_update: { enabled: true } } })], 'live', url).kind).toBe('conflict');
    expect(planPortal([portal({ is_default: true })], 'live', url).kind).toBe('conflict');
    expect(planPortal([portal(), portal({ id: 'bpc_2' })], 'live', url).kind).toBe('conflict');
    expect(planPortal([portal({ livemode: false })], 'live', url).kind).toBe('conflict');
  });
});

describe('foreignFingerprint', () => {
  it('ignores FlacronCV objects and changes when a foreign object changes', () => {
    const base = [
      { id: 'prod_a', active: true, metadata: { app_id: 'other' } },
      { id: 'prod_b', active: true, metadata: null },
      { id: 'prod_fcv', active: true, metadata: { app_id: 'flacron-cv' } },
    ];
    const fp = foreignFingerprint(base);
    expect(fp.count).toBe(2);
    expect(foreignFingerprint([...base, { id: 'prod_fcv2', active: true, metadata: { app_id: 'flacron-cv' } }])).toEqual(fp);
    expect(foreignFingerprint([...base].reverse())).toEqual(fp);
    expect(foreignFingerprint([{ ...base[0]!, active: false }, base[1]!, base[2]!]).hash).not.toBe(fp.hash);
  });
});

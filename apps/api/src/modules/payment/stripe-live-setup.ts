/**
 * Planning for FlacronCV's own webhook events and Customer Portal configuration.
 * Pure functions: they decide, the provisioning script performs. Nothing here
 * ever plans a change to another application's endpoint or configuration, to
 * the account's default portal configuration, or removes an existing event.
 */
import { createHash } from 'crypto';
import { CATALOG_APP_ID } from './stripe-catalog-provision';

export const FLACRONCV_WEBHOOK_URL = 'https://api.flacroncv.com/api/v1/webhooks/stripe';

export interface WebhookEndpointLike {
  id: string;
  url: string;
  status: string;
  livemode: boolean;
  enabled_events: string[];
  metadata: Record<string, string> | null;
}

export type WebhookPlan =
  | { kind: 'conflict'; reason: string }
  | { kind: 'up_to_date'; endpointId: string }
  | { kind: 'add_events'; endpointId: string; add: string[]; next: string[] };

/**
 * Adds the events the API handles to FlacronCV's endpoint. Existing events are
 * kept (union, never removal). Exactly one enabled endpoint must have the URL.
 */
export function planWebhookEvents(
  endpoints: WebhookEndpointLike[],
  handled: Iterable<string>,
  mode: 'test' | 'live',
  url = FLACRONCV_WEBHOOK_URL,
): WebhookPlan {
  const matches = endpoints.filter((e) => e.url === url);
  if (matches.length === 0) return { kind: 'conflict', reason: `no webhook endpoint for ${url}` };
  if (matches.length > 1) return { kind: 'conflict', reason: `${matches.length} endpoints for ${url} (${matches.map((e) => e.id).join(', ')})` };
  const e = matches[0]!;
  if (e.livemode !== (mode === 'live')) return { kind: 'conflict', reason: `endpoint ${e.id} is ${e.livemode ? 'live' : 'test'} mode` };
  if (e.status !== 'enabled') return { kind: 'conflict', reason: `endpoint ${e.id} is ${e.status}` };
  const owner = e.metadata?.app_id;
  if (owner && owner !== CATALOG_APP_ID) return { kind: 'conflict', reason: `endpoint ${e.id} is tagged app_id=${owner}` };
  const current = e.enabled_events ?? [];
  if (current.includes('*')) return { kind: 'up_to_date', endpointId: e.id };
  const add = [...new Set(handled)].filter((ev) => !current.includes(ev)).sort();
  if (add.length === 0) return { kind: 'up_to_date', endpointId: e.id };
  return { kind: 'add_events', endpointId: e.id, add, next: [...current, ...add] };
}

export interface PortalConfigLike {
  id: string;
  active: boolean;
  is_default: boolean;
  livemode: boolean;
  metadata: Record<string, string> | null;
  features: {
    invoice_history?: { enabled: boolean };
    payment_method_update?: { enabled: boolean };
    subscription_cancel?: { enabled: boolean; mode?: string };
    subscription_update?: { enabled: boolean };
    customer_update?: { enabled: boolean };
  };
}

/** Marks the configuration this tool owns; earlier FlacronCV configurations are left as they are. */
export const PORTAL_MARKER = { app_id: CATALOG_APP_ID, fcv_portal: 'five-plan-v1' } as const;

/**
 * FlacronCV's portal: invoices, payment method, cancel at period end. Plan
 * changes are NOT offered in the portal: the app's own upgrade (prorated,
 * paid before it applies) and downgrade (scheduled for period end) are the
 * only plan-change paths, so the portal can never grant an unpaid upgrade.
 */
export function desiredPortalConfig(returnUrl: string) {
  return {
    business_profile: { headline: 'Manage your FlacronCV subscription' },
    default_return_url: returnUrl,
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: false },
      subscription_cancel: { enabled: true, mode: 'at_period_end' as const, proration_behavior: 'none' as const },
      subscription_update: { enabled: false },
    },
    metadata: { ...PORTAL_MARKER },
  };
}

export type PortalPlan =
  | { kind: 'conflict'; reason: string }
  | { kind: 'reuse'; configurationId: string }
  | { kind: 'create'; idempotencyKey: string; params: ReturnType<typeof desiredPortalConfig> };

export function portalMatches(c: PortalConfigLike): boolean {
  const f = c.features ?? {};
  return (
    c.active &&
    !c.is_default &&
    f.invoice_history?.enabled === true &&
    f.payment_method_update?.enabled === true &&
    f.subscription_cancel?.enabled === true &&
    f.subscription_cancel?.mode === 'at_period_end' &&
    f.subscription_update?.enabled === false
  );
}

export function planPortal(configs: PortalConfigLike[], mode: 'test' | 'live', returnUrl: string): PortalPlan {
  const ours = configs.filter((c) => c.metadata?.app_id === PORTAL_MARKER.app_id && c.metadata?.fcv_portal === PORTAL_MARKER.fcv_portal);
  if (ours.some((c) => c.livemode !== (mode === 'live'))) return { kind: 'conflict', reason: 'portal configuration in the wrong mode' };
  const active = ours.filter((c) => c.active);
  if (active.length > 1) return { kind: 'conflict', reason: `${active.length} active FlacronCV five-plan portal configurations (${active.map((c) => c.id).join(', ')})` };
  if (active.length === 1) {
    const c = active[0]!;
    if (c.is_default) return { kind: 'conflict', reason: `portal configuration ${c.id} is the account default` };
    if (!portalMatches(c)) return { kind: 'conflict', reason: `portal configuration ${c.id} does not match the reviewed settings` };
    return { kind: 'reuse', configurationId: c.id };
  }
  const params = desiredPortalConfig(returnUrl);
  const idempotencyKey = `flacroncv-portal-${mode}-${createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0, 32)}`;
  return { kind: 'create', idempotencyKey, params };
}

/**
 * Order-independent fingerprint of objects that are NOT FlacronCV's (untagged or
 * another app's). Equal before and after a run proves they were not changed.
 */
export function foreignFingerprint(
  objects: { id: string; active?: boolean; metadata: Record<string, string> | null; [k: string]: unknown }[],
): { count: number; hash: string } {
  const foreign = objects
    .filter((o) => o.metadata?.app_id !== CATALOG_APP_ID)
    .map((o) => JSON.stringify([o.id, o.active ?? null, o.metadata ?? {}, o.lookup_key ?? null, o.unit_amount ?? null, o.name ?? null, o.updated ?? null]))
    .sort();
  return { count: foreign.length, hash: createHash('sha256').update(foreign.join('\n')).digest('hex').slice(0, 16) };
}

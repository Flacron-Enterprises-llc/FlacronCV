/**
 * Provision FlacronCV's five-plan Stripe catalog (app_id=flacron-cv), plus — optionally — FlacronCV's
 * own webhook events and Customer Portal configuration.
 *
 * Dry run by default (read-only). Writes only with --apply. Every run:
 *   - checks the account Stripe states for the key against --account;
 *   - fingerprints every product/price that is NOT FlacronCV's before and after, and fails if it moved;
 *   - only CREATES FlacronCV-tagged products/prices (never updates, archives or adopts anything);
 *   - only ADDS missing handled events to FlacronCV's own endpoint (never removes one, never another app's);
 *   - only CREATES a new, non-default FlacronCV portal configuration (never edits the default or others);
 *   - after --apply, reads everything back and expects a no-op plan.
 *
 * TEST mode (default):
 *   npx ts-node --transpile-only scripts/stripe-provision-catalog.ts --account=acct_…  [--apply]
 *   … --key-file=<file with STRIPE_PROVISIONING_KEY=rk_test_…> --anchor-product=prod_… [--apply]
 *
 * LIVE mode (plans only; packs are not on sale without the career service):
 *   npx ts-node --transpile-only scripts/stripe-provision-catalog.ts --live \
 *     --account=acct_… --confirm-live=acct_… \
 *     --key-file=<file with STRIPE_PROVISIONING_KEY=rk_live_…> \
 *     --legacy-prices=price_…,price_…,price_…,price_…  (the four STRIPE_PRO_/ENTERPRISE_ ids the live API runs with)
 *     [--webhook-events] [--portal] [--env-out=FILE] [--apply]
 *
 * The provisioning key is a SEPARATE restricted key (Products, Prices, Webhook Endpoints, Customer portal:
 * Write; everything else None), never the application's key. It is never printed.
 * Prints the env lines the API expects; price and portal ids are not secrets.
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import {
  CatalogTransport,
  StripePriceLike,
  StripeProductLike,
  applyCatalog,
  desiredCatalog,
  envLines,
  livePlanCatalog,
  planCatalog,
} from '../src/modules/payment/stripe-catalog-provision';
import {
  PortalConfigLike,
  WebhookEndpointLike,
  foreignFingerprint,
  planPortal,
  planWebhookEvents,
} from '../src/modules/payment/stripe-live-setup';
import { HANDLED_STRIPE_EVENTS } from '../src/modules/payment/payment.service';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : 'true'];
  }),
) as Record<string, string>;

const refuse = (msg: string): never => {
  console.error(`Refusing: ${msg}`);
  process.exit(1);
};

const live = args.live === 'true';
const mode: 'test' | 'live' = live ? 'live' : 'test';
const expectedAccount = (args.account ?? '').trim();
if (!/^acct_[A-Za-z0-9]+$/.test(expectedAccount)) refuse('pass the expected Stripe account: --account=acct_…');
const apply = args.apply === 'true';
const wantWebhook = args['webhook-events'] === 'true';
const wantPortal = args.portal === 'true';
const legacyPrices = (args['legacy-prices'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (live) {
  if (args['confirm-live'] !== expectedAccount) refuse('live mode needs --confirm-live=<the same acct_… as --account>.');
  if (!args['key-file']) refuse('live mode needs --key-file (a restricted rk_live_ provisioning key); the Stripe CLI is never used live.');
  if (legacyPrices.length !== 4 || legacyPrices.some((p) => !/^price_[A-Za-z0-9]+$/.test(p))) {
    refuse('live mode needs --legacy-prices with the four price ids the live API is configured with.');
  }
}
if ((wantWebhook || wantPortal) && !args['key-file']) refuse('--webhook-events and --portal need --key-file.');
if (args['anchor-product'] && !/^prod_[A-Za-z0-9]+$/.test(args['anchor-product'])) refuse('--anchor-product must be a Stripe product id (prod_…).');

interface SetupTransport extends CatalogTransport {
  getPrice(id: string): Promise<StripePriceLike | null>;
  listWebhookEndpoints(): Promise<WebhookEndpointLike[]>;
  setWebhookEvents(id: string, events: string[]): Promise<WebhookEndpointLike>;
  listPortalConfigs(): Promise<PortalConfigLike[]>;
  createPortalConfig(params: Record<string, unknown>, idempotencyKey: string): Promise<PortalConfigLike>;
}

/** Flattens params into the CLI's -d key=value form (nested keys as a[b]). */
function dataArgs(params: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') out.push(...dataArgs(v as Record<string, unknown>, name));
    else out.push('-d', `${name}=${String(v)}`);
  }
  return out;
}

function cli(cliArgs: string[]): any {
  // No --live flag ever: the CLI's default is test mode.
  const out = execFileSync('stripe', cliArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
  const json = JSON.parse(out);
  if (json.error) throw new Error(`Stripe error: ${json.error.type}${json.error.code ? ` (${json.error.code})` : ''}: ${json.error.message ?? ''}`);
  return json;
}

function cliListAll(path: string): any[] {
  const items: any[] = [];
  let after: string | null = null;
  for (let page = 0; page < 100; page++) {
    const json = cli(['get', path, '-d', 'limit=100', ...(after ? ['-d', `starting_after=${after}`] : [])]);
    items.push(...json.data);
    if (!json.has_more) return items;
    after = json.data[json.data.length - 1].id;
  }
  throw new Error(`Too many pages listing ${path}`);
}

const cliTransport: CatalogTransport = {
  mode: 'test',
  async accountId() {
    return cli(['get', '/v1/account']).id;
  },
  async listProducts(): Promise<StripeProductLike[]> {
    return cliListAll('/v1/products');
  },
  async listPrices(): Promise<StripePriceLike[]> {
    return cliListAll('/v1/prices');
  },
  async createProduct(params, idempotencyKey) {
    return cli(['post', '/v1/products', '--confirm', '-i', idempotencyKey, ...dataArgs(params)]);
  },
  async createPrice(params, idempotencyKey) {
    return cli(['post', '/v1/prices', '--confirm', '-i', idempotencyKey, ...dataArgs(params)]);
  },
};

/**
 * Key transport (--key-file=PATH): a SEPARATE restricted provisioning key, never the application's key.
 * The file holds STRIPE_PROVISIONING_KEY=rk_test_… (test) or rk_live_… (live, with --live). Never printed.
 *
 * Account identity: GET /v1/account when the key may read it; otherwise the account Stripe names in its
 * permission refusal (test mode additionally requires --anchor-product, an object the operator confirmed).
 * Live mode is corroborated further in main(): the live API's four legacy prices and FlacronCV's webhook
 * endpoint must be in this account.
 */
function keyTransport(keyFile: string, anchorProduct: string | undefined): SetupTransport {
  const text = readFileSync(keyFile, 'utf8');
  const key = (/^\s*STRIPE_PROVISIONING_KEY\s*=\s*(\S*)/m.exec(text)?.[1] ?? '').trim();
  const wanted = live ? /^rk_live_[A-Za-z0-9]+$/ : /^rk_test_[A-Za-z0-9]+$/;
  if (!wanted.test(key)) {
    throw new Error(`STRIPE_PROVISIONING_KEY must be a restricted ${live ? 'LIVE (rk_live_…, with --live)' : 'TEST (rk_test_…)'} key. sk_ keys are refused.`);
  }
  const form = (params: Record<string, unknown>, prefix = '', out = new URLSearchParams()) => {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      const name = prefix ? `${prefix}[${k}]` : k;
      if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(item))));
      else if (typeof v === 'object') form(v as Record<string, unknown>, name, out);
      else out.append(name, String(v));
    }
    return out;
  };
  const call = async (method: 'GET' | 'POST', path: string, params?: Record<string, unknown>, idempotencyKey?: string) => {
    const body = params ? form(params) : undefined;
    const url = `https://api.stripe.com${path}${method === 'GET' && body ? `?${body}` : ''}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Stripe-Version': '2024-04-10',
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: method === 'POST' ? body : undefined,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = json?.error;
      const err = new Error(`Stripe ${res.status} on ${method} ${path.split('?')[0]}: ${e?.type ?? 'error'}${e?.code ? ` (${e.code})` : ''}`);
      Object.assign(err, { status: res.status, account: /on account '(acct_[A-Za-z0-9]+)'/.exec(e?.message ?? '')?.[1] ?? null });
      throw err;
    }
    return json;
  };
  const listAll = async (path: string, extra: Record<string, unknown> = {}) => {
    const items: any[] = [];
    let after: string | null = null;
    for (let page = 0; page < 200; page++) {
      const json = await call('GET', path, { limit: 100, ...extra, ...(after ? { starting_after: after } : {}) });
      items.push(...json.data);
      if (!json.has_more) return items;
      after = json.data[json.data.length - 1].id;
    }
    throw new Error(`Too many pages listing ${path}`);
  };
  return {
    mode,
    async accountId() {
      try {
        return (await call('GET', '/v1/account')).id;
      } catch (error) {
        const e = error as { status?: number; account?: string | null };
        if (e.status !== 403) throw error;
        if (live) {
          if (!e.account) throw new Error('Stripe did not state the key\'s account.');
          return e.account;
        }
        if (!anchorProduct) throw error;
        const p = await call('GET', `/v1/products/${anchorProduct}`);
        if (p.livemode !== false || p.metadata?.app_id !== 'flacron-cv') {
          throw new Error(`Anchor ${anchorProduct} is not a FlacronCV test-mode product.`);
        }
        return expectedAccount; // the operator confirmed this object belongs to --account; this key reads it
      }
    },
    listProducts: () => listAll('/v1/products'),
    listPrices: () => listAll('/v1/prices'),
    createProduct: (params, idempotencyKey) => call('POST', '/v1/products', params, idempotencyKey),
    createPrice: (params, idempotencyKey) => call('POST', '/v1/prices', params, idempotencyKey),
    async getPrice(id) {
      try {
        return await call('GET', `/v1/prices/${id}`);
      } catch (error) {
        if ((error as { status?: number }).status === 404) return null;
        throw error;
      }
    },
    listWebhookEndpoints: () => listAll('/v1/webhook_endpoints'),
    setWebhookEvents: (id, events) => call('POST', `/v1/webhook_endpoints/${id}`, { enabled_events: events }),
    listPortalConfigs: () => listAll('/v1/billing_portal/configurations'),
    createPortalConfig: (params, idempotencyKey) => call('POST', '/v1/billing_portal/configurations', params, idempotencyKey),
  };
}

let transport: CatalogTransport;
try {
  transport = args['key-file'] ? keyTransport(args['key-file'], args['anchor-product']) : cliTransport;
} catch (error) {
  // Never echo the file's contents; only the reason.
  const message = error instanceof Error ? error.message : String(error);
  refuse(/ENOENT/.test(message) ? 'key file not found' : message);
}
const setup = transport! as SetupTransport;
const options = { allowLive: live };
const catalog = live ? livePlanCatalog() : desiredCatalog();
const returnUrl = args['return-url'] ?? 'https://www.flacroncv.com/settings/billing';
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

async function foreign() {
  const [products, prices] = [await transport.listProducts(), await transport.listPrices()];
  return { products: foreignFingerprint(products as never), prices: foreignFingerprint(prices as never) };
}

async function main() {
  const plan = await planCatalog(transport, expectedAccount, catalog, options);
  console.log(`Account ${plan.accountId} (${mode.toUpperCase()} mode, stated by Stripe) — ${apply ? 'APPLY' : 'DRY RUN (read-only)'}`);
  const conflicts = [...plan.conflicts];

  // Live corroboration: the running API's legacy prices and FlacronCV's endpoint are in this account.
  let endpoints: WebhookEndpointLike[] = [];
  if (wantWebhook || live) endpoints = await setup.listWebhookEndpoints();
  if (live) {
    for (const id of legacyPrices) {
      const p = await setup.getPrice(id);
      const owner = p?.metadata?.app_id;
      const ok = !!p && p.livemode && (!owner || owner === 'flacron-cv');
      console.log(`  legacy price ${id}: ${p ? `found live=${p.livemode} active=${p.active} app_id=${owner ?? 'none'}` : 'NOT FOUND in this account'}`);
      if (!ok) conflicts.push(`legacy price ${id} is not a live price of this account (or belongs to another app)`);
    }
    const ours = endpoints.filter((e) => e.url === 'https://api.flacroncv.com/api/v1/webhooks/stripe' && e.livemode);
    console.log(`  FlacronCV live webhook endpoints in this account: ${ours.length}`);
    if (ours.length !== 1) conflicts.push('FlacronCV\'s live webhook endpoint is not (exactly once) in this account');
  }

  const before = await foreign();
  console.log(`Left alone: ${plan.ignored.untaggedProducts} untagged products, ${plan.ignored.untaggedPrices} untagged prices, ` +
    `${plan.ignored.otherAppProducts} other-app products, ${plan.ignored.otherAppPrices} other-app prices`);
  console.log(`Fingerprint of objects that are not FlacronCV's: products ${before.products.count}/${before.products.hash}, prices ${before.prices.count}/${before.prices.hash}`);
  for (const a of plan.actions) {
    if (a.kind === 'create_product') console.log(`  CREATE product  ${a.key.padEnd(30)} "${a.name}"`);
    else if (a.kind === 'reuse_product') console.log(`  REUSE  product  ${a.key.padEnd(30)} ${a.productId} "${a.name}"`);
    else if (a.kind === 'create_price') console.log(`  CREATE price    ${a.lookupKey.padEnd(30)} ${money(a.amountCents)} ${a.currency} ${a.interval ?? 'one_time'} -> ${a.envName}`);
    else console.log(`  REUSE  price    ${a.lookupKey.padEnd(30)} ${a.priceId} -> ${a.envName}`);
  }
  const n = (k: string) => plan.actions.filter((a) => a.kind === k).length;
  console.log(`Totals: create ${n('create_product')} products + ${n('create_price')} prices; reuse ${n('reuse_product')} products + ${n('reuse_price')} prices`);

  const webhookPlan = wantWebhook ? planWebhookEvents(endpoints, HANDLED_STRIPE_EVENTS, mode) : null;
  if (webhookPlan) {
    if (webhookPlan.kind === 'conflict') conflicts.push(`webhook: ${webhookPlan.reason}`);
    else if (webhookPlan.kind === 'up_to_date') console.log(`  WEBHOOK ${webhookPlan.endpointId}: all handled events enabled`);
    else console.log(`  WEBHOOK ${webhookPlan.endpointId}: ADD ${webhookPlan.add.join(', ')} (existing events kept)`);
  }
  const portalPlan = wantPortal ? planPortal(await setup.listPortalConfigs(), mode, returnUrl) : null;
  if (portalPlan) {
    if (portalPlan.kind === 'conflict') conflicts.push(`portal: ${portalPlan.reason}`);
    else if (portalPlan.kind === 'reuse') console.log(`  PORTAL  REUSE ${portalPlan.configurationId}`);
    else console.log('  PORTAL  CREATE non-default FlacronCV configuration (invoices, payment method, cancel at period end; no plan changes)');
  }

  if (conflicts.length) {
    console.log(`CONFLICTS (${conflicts.length}) — nothing will be written:`);
    for (const c of conflicts) console.log(`  - ${c}`);
    process.exit(2);
  }
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to perform the actions above.');
    return;
  }

  const result = await applyCatalog(transport, expectedAccount, catalog, options);
  console.log(`Created ${result.created.products} products and ${result.created.prices} prices.`);
  if (webhookPlan?.kind === 'add_events') {
    const updated = await setup.setWebhookEvents(webhookPlan.endpointId, webhookPlan.next);
    console.log(`Webhook ${updated.id}: ${updated.enabled_events.length} events enabled.`);
  }
  let portalId: string | null = portalPlan?.kind === 'reuse' ? portalPlan.configurationId : null;
  if (portalPlan?.kind === 'create') {
    const created = await setup.createPortalConfig(portalPlan.params, portalPlan.idempotencyKey);
    if (created.is_default || created.livemode !== live) throw new Error(`Portal configuration ${created.id} came back default or in the wrong mode — investigate.`);
    portalId = created.id;
    console.log(`Portal configuration created: ${portalId}`);
  }

  // Read-back: a repeat plan must be a no-op, and nothing foreign may have changed.
  const again = await planCatalog(transport, expectedAccount, catalog, options);
  const creates = again.actions.filter((a) => a.kind.startsWith('create')).length;
  const after = await foreign();
  const foreignSame = after.products.hash === before.products.hash && after.prices.hash === before.prices.hash;
  const webhookAfter = wantWebhook ? planWebhookEvents(await setup.listWebhookEndpoints(), HANDLED_STRIPE_EVENTS, mode).kind : 'n/a';
  const portalAfter = wantPortal ? planPortal(await setup.listPortalConfigs(), mode, returnUrl).kind : 'n/a';
  console.log(`Read-back: catalog conflicts=${again.conflicts.length} creates=${creates}; webhook=${webhookAfter}; portal=${portalAfter}; ` +
    `foreign objects unchanged=${foreignSame} (products ${after.products.count}/${after.products.hash}, prices ${after.prices.count}/${after.prices.hash})`);
  const readBackOk = again.conflicts.length === 0 && creates === 0 && foreignSame &&
    (webhookAfter === 'n/a' || webhookAfter === 'up_to_date') && (portalAfter === 'n/a' || portalAfter === 'reuse');
  if (!readBackOk) {
    console.log('READ-BACK FAILED — stop and investigate before using these ids.');
    process.exitCode = 3;
  }

  const lines = [`# ${mode} catalog for ${plan.accountId} (price and portal ids are not secrets)`, ...envLines(result.env)];
  if (portalId) lines.push(`STRIPE_PORTAL_CONFIGURATION_ID=${portalId}`);
  console.log(`\n${lines.join('\n')}`);
  if (args['env-out']) writeFileSync(args['env-out'], `${lines.join('\n')}\n`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

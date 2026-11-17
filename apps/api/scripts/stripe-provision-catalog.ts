/**
 * Provision FlacronCV's five-plan catalog in Stripe TEST mode (app_id=flacron-cv).
 *
 * Dry run by default (read-only). Writes only with --apply. Talks to Stripe
 * through the logged-in Stripe CLI in its default TEST mode, so this script
 * never reads or prints an API key. Live mode is refused.
 *
 *   npx ts-node --transpile-only scripts/stripe-provision-catalog.ts --account=acct_…           # dry run
 *   npx ts-node --transpile-only scripts/stripe-provision-catalog.ts --account=acct_… --apply   # create
 *
 * Or with a separate, temporary provisioning key instead of the CLI login:
 *   … --account=acct_… --key-file=<file with STRIPE_PROVISIONING_KEY=rk_test_…> --anchor-product=prod_… [--apply]
 *
 * Prints the env lines the API expects (STRIPE_PRICE_<PLAN>_<MONTHLY|ANNUAL>,
 * STRIPE_PRICE_PACK_<ID>[_RECURRING]); price ids are not secrets.
 * Legacy plans are handled by scripts/stripe-sync-catalog.mjs, not here.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import {
  CatalogTransport,
  StripePriceLike,
  StripeProductLike,
  applyCatalog,
  envLines,
  planCatalog,
} from '../src/modules/payment/stripe-catalog-provision';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : 'true'];
  }),
) as Record<string, string>;

if (args.live) {
  console.error('Refusing: this script provisions Stripe TEST mode only.');
  process.exit(1);
}
const expectedAccount = (args.account ?? '').trim();
if (!/^acct_[A-Za-z0-9]+$/.test(expectedAccount)) {
  console.error('Pass the expected Stripe account: --account=acct_…');
  process.exit(1);
}
const apply = args.apply === 'true';

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

function cli(args: string[]): any {
  // No --live flag ever: the CLI's default is test mode.
  const out = execFileSync('stripe', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
  const json = JSON.parse(out);
  if (json.error) throw new Error(`Stripe error: ${json.error.type}${json.error.code ? ` (${json.error.code})` : ''}: ${json.error.message ?? ''}`);
  return json;
}

function listAll(path: string): any[] {
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
    return listAll('/v1/products');
  },
  async listPrices(): Promise<StripePriceLike[]> {
    return listAll('/v1/prices');
  },
  async createProduct(params, idempotencyKey) {
    return cli(['post', '/v1/products', '--confirm', '-i', idempotencyKey, ...dataArgs(params)]);
  },
  async createPrice(params, idempotencyKey) {
    return cli(['post', '/v1/prices', '--confirm', '-i', idempotencyKey, ...dataArgs(params)]);
  },
};

/**
 * Key transport (--key-file=PATH): a SEPARATE, temporary restricted TEST key used only for
 * provisioning (Products: Write, Prices: Write), never the application's key. The file holds
 * STRIPE_PROVISIONING_KEY=rk_test_…; the key is never printed.
 *
 * Account identity: GET /v1/account when the key may read it; otherwise --anchor-product=prod_…
 * names an object the operator confirmed in the Dashboard of --account (test mode). The key must
 * read exactly that object (test mode, tagged app_id=flacron-cv) before anything is written.
 */
function keyTransport(keyFile: string, anchorProduct: string | undefined): CatalogTransport {
  const text = readFileSync(keyFile, 'utf8');
  const key = (/^\s*STRIPE_PROVISIONING_KEY\s*=\s*(\S*)/m.exec(text)?.[1] ?? '').trim();
  if (!/^rk_test_[A-Za-z0-9]+$/.test(key)) {
    throw new Error('STRIPE_PROVISIONING_KEY must be a restricted TEST key (rk_test_…). sk_ and live keys are refused.');
  }
  const headers = (extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${key}`,
    'Stripe-Version': '2024-04-10',
    ...extra,
  });
  const form = (params: Record<string, unknown>, prefix = '', out = new URLSearchParams()) => {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      const name = prefix ? `${prefix}[${k}]` : k;
      if (typeof v === 'object') form(v as Record<string, unknown>, name, out);
      else out.append(name, String(v));
    }
    return out;
  };
  const call = async (method: 'GET' | 'POST', path: string, params?: Record<string, unknown>, idempotencyKey?: string) => {
    const body = params ? form(params) : undefined;
    const url = `https://api.stripe.com${path}${method === 'GET' && body ? `?${body}` : ''}`;
    const res = await fetch(url, {
      method,
      headers: headers({
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      }),
      body: method === 'POST' ? body : undefined,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = json?.error;
      const err = new Error(`Stripe ${res.status}: ${e?.type ?? 'error'}${e?.code ? ` (${e.code})` : ''}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return json;
  };
  const listAllKey = async (path: string) => {
    const items: any[] = [];
    let after: string | null = null;
    for (let page = 0; page < 100; page++) {
      const json = await call('GET', path, { limit: 100, ...(after ? { starting_after: after } : {}) });
      items.push(...json.data);
      if (!json.has_more) return items;
      after = json.data[json.data.length - 1].id;
    }
    throw new Error(`Too many pages listing ${path}`);
  };
  return {
    mode: 'test',
    async accountId() {
      try {
        return (await call('GET', '/v1/account')).id;
      } catch (error) {
        if ((error as { status?: number }).status !== 403 || !anchorProduct) throw error;
        const p = await call('GET', `/v1/products/${anchorProduct}`);
        if (p.livemode !== false || p.metadata?.app_id !== 'flacron-cv') {
          throw new Error(`Anchor ${anchorProduct} is not a FlacronCV test-mode product.`);
        }
        // The operator confirmed this object belongs to --account; this key reads it.
        return expectedAccount;
      }
    },
    listProducts: () => listAllKey('/v1/products'),
    listPrices: () => listAllKey('/v1/prices'),
    createProduct: (params, idempotencyKey) => call('POST', '/v1/products', params, idempotencyKey),
    createPrice: (params, idempotencyKey) => call('POST', '/v1/prices', params, idempotencyKey),
  };
}

if (args['anchor-product'] && !/^prod_[A-Za-z0-9]+$/.test(args['anchor-product'])) {
  console.error('--anchor-product must be a Stripe product id (prod_…).');
  process.exit(1);
}
let transport: CatalogTransport;
try {
  transport = args['key-file'] ? keyTransport(args['key-file'], args['anchor-product']) : cliTransport;
} catch (error) {
  // Never echo the file's contents; only the reason.
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Refusing: ${/ENOENT/.test(message) ? 'key file not found' : message}`);
  process.exit(1);
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

async function main() {
  const plan = await planCatalog(transport, expectedAccount);
  console.log(`Account ${plan.accountId} (TEST mode) — ${apply ? 'APPLY' : 'DRY RUN (read-only)'}`);
  console.log(
    `Left alone: ${plan.ignored.untaggedProducts} untagged products, ${plan.ignored.untaggedPrices} untagged prices, ` +
      `${plan.ignored.otherAppProducts} other-app products, ${plan.ignored.otherAppPrices} other-app prices`,
  );
  for (const a of plan.actions) {
    if (a.kind === 'create_product') console.log(`  CREATE product  ${a.key.padEnd(30)} "${a.name}"`);
    else if (a.kind === 'reuse_product') console.log(`  REUSE  product  ${a.key.padEnd(30)} ${a.productId} "${a.name}"`);
    else if (a.kind === 'create_price') console.log(`  CREATE price    ${a.lookupKey.padEnd(30)} ${money(a.amountCents)} ${a.currency} ${a.interval ?? 'one_time'} -> ${a.envName}`);
    else console.log(`  REUSE  price    ${a.lookupKey.padEnd(30)} ${a.priceId} -> ${a.envName}`);
  }
  const n = (k: string) => plan.actions.filter((a) => a.kind === k).length;
  console.log(`Totals: create ${n('create_product')} products + ${n('create_price')} prices; reuse ${n('reuse_product')} products + ${n('reuse_price')} prices`);
  if (plan.conflicts.length) {
    console.log(`CONFLICTS (${plan.conflicts.length}) — nothing will be written:`);
    for (const c of plan.conflicts) console.log(`  - ${c}`);
    process.exit(2);
  }
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to create the objects above.');
    return;
  }
  const result = await applyCatalog(transport, expectedAccount);
  console.log(`Created ${result.created.products} products and ${result.created.prices} prices.`);
  console.log('\n# Test-mode env for the V1 API (price ids are not secrets):');
  for (const line of envLines(result.env)) console.log(line);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

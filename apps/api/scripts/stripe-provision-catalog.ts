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
 * Prints the env lines the API expects (STRIPE_PRICE_<PLAN>_<MONTHLY|ANNUAL>,
 * STRIPE_PRICE_PACK_<ID>[_RECURRING]); price ids are not secrets.
 * Legacy plans are handled by scripts/stripe-sync-catalog.mjs, not here.
 */
import { execFileSync } from 'child_process';
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

const transport: CatalogTransport = {
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

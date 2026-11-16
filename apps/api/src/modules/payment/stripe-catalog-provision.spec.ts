import {
  CatalogTransport,
  StripePriceLike,
  StripeProductLike,
  applyCatalog,
  desiredCatalog,
  envLines,
  planCatalog,
} from './stripe-catalog-provision';

const ACCOUNT = 'acct_test_flacron';

/** In-memory Stripe: lookup keys unique, idempotency keys replay, optional failure after N writes. */
class FakeStripe implements CatalogTransport {
  products: StripeProductLike[] = [];
  prices: StripePriceLike[] = [];
  writes = 0;
  failAfterWrites = Infinity;
  private replay = new Map<string, { kind: string; body: string; result: StripeProductLike | StripePriceLike }>();
  private seq = 0;

  constructor(public mode: 'test' | 'live' = 'test', public account = ACCOUNT, private live = false) {}

  async accountId() { return this.account; }
  async listProducts() { return this.products.map((p) => ({ ...p })); }
  async listPrices() { return this.prices.map((p) => ({ ...p })); }

  private idem<T extends StripeProductLike | StripePriceLike>(kind: string, key: string, body: unknown, make: () => T): T {
    const prior = this.replay.get(key);
    if (prior) {
      if (prior.kind !== kind || prior.body !== JSON.stringify(body)) throw new Error('idempotency_error');
      return prior.result as T;
    }
    if (this.writes >= this.failAfterWrites) throw new Error('simulated network failure');
    this.writes += 1;
    const result = make();
    this.replay.set(key, { kind, body: JSON.stringify(body), result });
    return result;
  }

  async createProduct(params: { name: string; metadata: Record<string, string> }, key: string) {
    return this.idem('product', key, params, () => {
      const p: StripeProductLike = { id: `prod_${++this.seq}`, name: params.name, active: true, livemode: this.live, metadata: { ...params.metadata } };
      this.products.push(p);
      return p;
    });
  }

  async createPrice(params: Parameters<CatalogTransport['createPrice']>[0], key: string) {
    return this.idem('price', key, params, () => {
      if (this.prices.some((x) => x.lookup_key === params.lookup_key)) throw new Error('lookup_key already in use');
      const p: StripePriceLike = {
        id: `price_${++this.seq}`,
        product: params.product,
        active: true,
        livemode: this.live,
        currency: params.currency,
        unit_amount: params.unit_amount,
        type: params.recurring ? 'recurring' : 'one_time',
        recurring: params.recurring ? { ...params.recurring } : null,
        lookup_key: params.lookup_key,
        metadata: { ...params.metadata },
      };
      this.prices.push(p);
      return p;
    });
  }
}

const counts = (plan: Awaited<ReturnType<typeof planCatalog>>) =>
  plan.actions.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.kind]: (acc[a.kind] ?? 0) + 1 }), {});

describe('stripe-catalog-provision', () => {
  it('derives exactly 4 plans x 2 prices and 24 add-ons from the code catalog, USD, annual = 10 x monthly', () => {
    const d = desiredCatalog();
    const plans = d.filter((x) => x.idField === 'fcv_plan');
    const packs = d.filter((x) => x.idField === 'fcv_pack');
    expect(plans.map((p) => p.idValue)).toEqual(['starter', 'professional', 'career_pro', 'business']);
    expect(plans.flatMap((p) => p.prices)).toHaveLength(8);
    expect(packs).toHaveLength(24);
    expect(d.flatMap((x) => x.prices).every((p) => p.currency === 'usd')).toBe(true);
    for (const p of plans) expect(p.prices[1]!.amountCents).toBe(p.prices[0]!.amountCents * 10);
    const business = plans.find((p) => p.idValue === 'business')!;
    expect(business.prices.map((p) => p.amountCents)).toEqual([20800, 208000]);
    // Never provisioned through checkout:
    const ids = packs.map((p) => p.idValue);
    for (const id of ['messaging_topup', 'white_label', 'api_package', 'career_maintenance']) expect(ids).not.toContain(id);
    // Env names are the ones the API reads.
    const envs = d.flatMap((x) => x.prices.map((p) => p.envName));
    expect(envs).toContain('STRIPE_PRICE_CAREER_PRO_ANNUAL');
    expect(envs).toContain('STRIPE_PRICE_PACK_DOCUMENT_S');
    expect(envs).toContain('STRIPE_PRICE_PACK_LOCATION_EXTRA_RECURRING');
    expect(new Set(envs).size).toBe(32);
    // Product names are unique, so receipts and Checkout never show two identical lines.
    expect(new Set(d.map((x) => x.name)).size).toBe(28);
    expect(packs.find((p) => p.idValue === 'storage_100gb_business')!.name).toBe('FlacronCV - Business 100 GB storage');
    // Every product and price is tagged.
    for (const x of d) {
      expect(x.metadata.app_id).toBe('flacron-cv');
      for (const p of x.prices) expect(p.metadata.app_id).toBe('flacron-cv');
    }
  });

  it('first run creates 28 products and 32 prices; a repeat run reuses everything and writes nothing', async () => {
    const stripe = new FakeStripe();
    const first = await planCatalog(stripe, ACCOUNT);
    expect(first.conflicts).toEqual([]);
    expect(counts(first)).toEqual({ create_product: 28, create_price: 32 });
    const applied = await applyCatalog(stripe, ACCOUNT);
    expect(applied.created).toEqual({ products: 28, prices: 32 });
    expect(applied.env).toHaveLength(32);
    expect(envLines(applied.env)[0]).toMatch(/^STRIPE_PRICE_STARTER_MONTHLY=price_/);

    const writes = stripe.writes;
    const again = await planCatalog(stripe, ACCOUNT);
    expect(again.conflicts).toEqual([]);
    expect(counts(again)).toEqual({ reuse_product: 28, reuse_price: 32 });
    const reapplied = await applyCatalog(stripe, ACCOUNT);
    expect(reapplied.created).toEqual({ products: 0, prices: 0 });
    expect(stripe.writes).toBe(writes);
    expect(reapplied.env).toEqual(applied.env);
  });

  it('an interrupted run resumes without duplicates', async () => {
    const stripe = new FakeStripe();
    stripe.failAfterWrites = 7;
    await expect(applyCatalog(stripe, ACCOUNT)).rejects.toThrow('simulated network failure');
    expect(stripe.writes).toBe(7);
    stripe.failAfterWrites = Infinity;
    const resumed = await applyCatalog(stripe, ACCOUNT);
    expect(stripe.products).toHaveLength(28);
    expect(stripe.prices).toHaveLength(32);
    expect(new Set(stripe.prices.map((p) => p.lookup_key)).size).toBe(32);
    expect(resumed.env).toHaveLength(32);
  });

  it('refuses the wrong account and live mode before reading or writing anything else', async () => {
    await expect(planCatalog(new FakeStripe('test', 'acct_someone_else'), ACCOUNT)).rejects.toThrow(/not the expected account/);
    await expect(planCatalog(new FakeStripe('test'), '')).rejects.toThrow(/not the expected account/);
    const live = new FakeStripe('live');
    await expect(applyCatalog(live, ACCOUNT)).rejects.toThrow(/TEST mode only/);
    expect(live.writes).toBe(0);
    const liveObjects = new FakeStripe('test');
    liveObjects.products.push({ id: 'prod_live', name: 'x', active: true, livemode: true, metadata: null });
    await expect(applyCatalog(liveObjects, ACCOUNT)).rejects.toThrow(/live-mode objects/);
    expect(liveObjects.writes).toBe(0);
  });

  it('never touches untagged or other-app objects, even with FlacronCV-like names or identifiers', async () => {
    const stripe = new FakeStripe();
    stripe.products.push(
      { id: 'prod_untagged', name: 'FlacronCV - Starter', active: true, livemode: false, metadata: { fcv_plan: 'starter' } },
      { id: 'prod_other', name: 'FlacronCV - Starter', active: true, livemode: false, metadata: { app_id: 'other-app', fcv_plan: 'starter' } },
    );
    stripe.prices.push({
      id: 'price_other', product: 'prod_other', active: true, livemode: false, currency: 'usd', unit_amount: 2199,
      type: 'recurring', recurring: { interval: 'month', interval_count: 1 }, lookup_key: 'other_starter', metadata: { app_id: 'other-app' },
    });
    const plan = await planCatalog(stripe, ACCOUNT);
    expect(plan.conflicts).toEqual([]);
    expect(plan.ignored).toEqual({ untaggedProducts: 1, untaggedPrices: 0, otherAppProducts: 1, otherAppPrices: 1 });
    expect(plan.actions.find((a) => a.key === 'plan:starter')?.kind).toBe('create_product');
    const before = JSON.stringify([stripe.products.slice(0, 2), stripe.prices.slice(0, 1)]);
    await applyCatalog(stripe, ACCOUNT);
    expect(JSON.stringify([stripe.products.slice(0, 2), stripe.prices.slice(0, 1)])).toBe(before);
  });

  it('stops on a lookup key held by an untagged or other-app price instead of adopting it', async () => {
    const stripe = new FakeStripe();
    stripe.prices.push({
      id: 'price_squatter', product: 'prod_x', active: true, livemode: false, currency: 'usd', unit_amount: 2199,
      type: 'recurring', recurring: { interval: 'month', interval_count: 1 }, lookup_key: 'fcv_starter_monthly', metadata: {},
    });
    const plan = await planCatalog(stripe, ACCOUNT);
    expect(plan.conflicts.join('\n')).toMatch(/fcv_starter_monthly: lookup key is already used by a price that is not tagged/);
    await expect(applyCatalog(stripe, ACCOUNT)).rejects.toThrow(/Refusing to write/);
    expect(stripe.writes).toBe(0);
  });

  it('stops on conflicting amount, currency, interval, archived or duplicate catalog entries, writing nothing', async () => {
    const seed = async () => {
      const s = new FakeStripe();
      await applyCatalog(s, ACCOUNT);
      s.writes = 0;
      return s;
    };
    const byLookup = (s: FakeStripe, k: string) => s.prices.find((p) => p.lookup_key === k)!;

    const amount = await seed();
    byLookup(amount, 'fcv_professional_monthly').unit_amount = 3999;
    expect((await planCatalog(amount, ACCOUNT)).conflicts.join('\n')).toMatch(/amount 3999, expected 3899/);

    const currency = await seed();
    byLookup(currency, 'fcv_pack_document_s').currency = 'eur';
    expect((await planCatalog(currency, ACCOUNT)).conflicts.join('\n')).toMatch(/currency eur, expected usd/);

    const interval = await seed();
    byLookup(interval, 'fcv_business_annual').recurring = { interval: 'month', interval_count: 1 };
    expect((await planCatalog(interval, ACCOUNT)).conflicts.join('\n')).toMatch(/interval month\/1, expected year\/1/);

    const oneTime = await seed();
    const recurringPack = byLookup(oneTime, 'fcv_pack_coaching_100');
    recurringPack.type = 'recurring';
    recurringPack.recurring = { interval: 'month', interval_count: 1 };
    expect((await planCatalog(oneTime, ACCOUNT)).conflicts.join('\n')).toMatch(/is recurring, expected one-time/);

    const archived = await seed();
    archived.products.find((p) => p.metadata?.fcv_plan === 'starter')!.active = false;
    expect((await planCatalog(archived, ACCOUNT)).conflicts.join('\n')).toMatch(/plan:starter: product .* is archived/);

    const duplicate = await seed();
    duplicate.products.push({ id: 'prod_dup', name: 'FlacronCV - Starter', active: true, livemode: false, metadata: { app_id: 'flacron-cv', fcv_plan: 'starter' } });
    expect((await planCatalog(duplicate, ACCOUNT)).conflicts.join('\n')).toMatch(/plan:starter: 2 products tagged/);

    const stray = await seed();
    const original = byLookup(stray, 'fcv_starter_monthly');
    stray.prices.push({ ...original, id: 'price_stray', lookup_key: null });
    expect((await planCatalog(stray, ACCOUNT)).conflicts.join('\n')).toMatch(/price_stray tagged for this slot without the lookup key/);

    for (const s of [amount, currency, interval, oneTime, archived, duplicate, stray]) {
      await expect(applyCatalog(s, ACCOUNT)).rejects.toThrow(/Refusing to write/);
      expect(s.writes).toBe(0);
    }
  });
});

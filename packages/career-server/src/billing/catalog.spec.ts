import { ADDONS, ALLOWANCES, CATALOG_VERSION, PLANS, PURCHASE_CHANNELS } from '@flacroncv/career-shared';
import { createTestDatabase, TestDatabase } from '../testing';
import { buildCatalogSnapshot, CatalogStore, publishCatalog } from './catalog';
import { isBillingError } from './errors';

describe('catalog in the database', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('catalog');
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  it('publishes the packages/shared catalog under CATALOG_VERSION', async () => {
    expect(await publishCatalog(db.pool)).toBe('inserted');
    const snapshot = await new CatalogStore().get(db.pool, CATALOG_VERSION);
    expect(snapshot.version).toBe(CATALOG_VERSION);
    expect(snapshot.plans).toEqual(PLANS);
    expect(snapshot.allowances).toEqual(ALLOWANCES);
    expect(snapshot.addons).toEqual(JSON.parse(JSON.stringify(ADDONS)));
    expect(snapshot.purchaseChannels.business).toEqual(PURCHASE_CHANNELS.business);
  });

  it('does nothing when the same catalog is published again', async () => {
    expect(await publishCatalog(db.pool)).toBe('unchanged');
    const rows = await db.pool.query(`SELECT count(*)::int AS n FROM catalog_versions`);
    expect(rows.rows[0].n).toBe(1);
  });

  it('refuses different contents under a version that is already published', async () => {
    const changed = buildCatalogSnapshot();
    changed.plans.starter.monthlyCents += 1;
    await db.pool.query(`UPDATE catalog_versions SET snapshot = $2 WHERE version = $1`, [
      CATALOG_VERSION,
      JSON.stringify(changed),
    ]);
    const error = await publishCatalog(db.pool).catch((e: unknown) => e);
    expect(isBillingError(error, 'catalog_conflict')).toBe(true);
  });
});

import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import { RecordingSignInDeleter } from '../identity/sign-in-deleter';
import { MemoryObjectStorage } from '../storage/object-storage';
import { TestClock } from '../testing/billing-fixture';
import { FakeIdTokenVerifier } from '../testing/fake-identity';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { AccountPrivacyService } from './account-privacy.service';

/**
 * V1 closure sweep: fairness and a bounded throughput measurement on
 * synthetic, fictional accounts in a throwaway database. Numbers are from
 * this laptop and local Postgres; they are a floor for planning, not a forecast.
 */
describe('V1 closure sweep throughput and fairness', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let privacy: AccountPrivacyService;

  const identity = (uid: string): VerifiedIdentity => ({
    uid,
    email: `${uid}@example.test`,
    emailVerified: true,
    authTime: clock.now(),
    issuedAt: clock.now(),
    signInProvider: 'password',
  });
  const seed = async (prefix: string, n: number) => {
    for (let i = 0; i < n; i += 1) await identities.principal(identity(`${prefix}-${i}`));
  };
  const remaining = async (prefix: string) =>
    (await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE auth_user_id LIKE $1`, [`${prefix}-%`])).rows[0].n;

  beforeAll(async () => {
    db = await createTestDatabase('closure_sweep');
    clock = new TestClock('2026-11-04T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    privacy = new AccountPrivacyService(db.pool, new FakeIdTokenVerifier(), new MemoryObjectStorage(), clock, new RecordingSignInDeleter());
  }, 120_000);

  afterAll(async () => {
    if (db) await db.drop();
  });

  it('unreadable V1 records no longer block the front of the queue; they back off and everyone else is processed', async () => {
    await seed('unreadable', 30);
    await seed('closed', 30);
    const isClosed = async (uid: string) => {
      if (uid.startsWith('unreadable-')) throw new Error('V1 read failed');
      return uid.startsWith('closed-');
    };
    // The old limit (20, one batch) would have spent every tick on the 30 unreadable rows.
    const run = await privacy.eraseClosedV1Accounts(isClosed, { batchSize: 20, concurrency: 4, maxBatches: 10 });
    expect(run).toMatchObject({ erased: 30, failed: 30 });
    expect(await remaining('closed')).toBe(0);
    expect(await remaining('unreadable')).toBe(30);
    // Backed off: not retried immediately, retried after an hour.
    expect(await privacy.eraseClosedV1Accounts(isClosed, { batchSize: 20, maxBatches: 10 })).toMatchObject({ checked: 0, backlog: 0 });
    clock.set('2026-11-04T11:01:00Z');
    expect(await privacy.eraseClosedV1Accounts(isClosed, { batchSize: 20, maxBatches: 10 })).toMatchObject({ checked: 30, failed: 30 });
  }, 120_000);

  it('measures checks and erasures per run with the defaults, and reports the backlog by count', async () => {
    const OPEN = 400;
    const CLOSED = 100;
    await seed('open', OPEN);
    await seed('gone', CLOSED);
    clock.set('2026-11-06T12:00:00Z'); // everyone is due for a daily re-check
    const isClosed = async (uid: string) => uid.startsWith('gone-');

    const before = await privacy.closureBacklog();
    expect(before.backlog).toBeGreaterThanOrEqual(OPEN + CLOSED);
    const started = Date.now();
    const run = await privacy.eraseClosedV1Accounts(isClosed, { batchSize: 50, concurrency: 4, timeBudgetMs: 120_000 });
    const seconds = (Date.now() - started) / 1000;
    expect(run.erased).toBe(CLOSED);
    expect(run.backlog).toBe(0);
    expect(await remaining('gone')).toBe(0);
    expect(await remaining('open')).toBe(OPEN);

    const perSecond = run.checked / seconds;
    // eslint-disable-next-line no-console
    console.log(
      `MEASURE closure sweep: ${run.checked} people (${CLOSED} erased) in ${seconds.toFixed(1)} s = ${perSecond.toFixed(1)} per second; ` +
        `≈ ${Math.floor(perSecond * 60)} per 60 s tick budget; old fixed limit was 20 per 15-minute tick (≈ 1,920 per day)`,
    );
  }, 600_000);
});

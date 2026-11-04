import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { BillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { RecordingSignInDeleter } from '../identity/sign-in-deleter';
import { MemoryObjectStorage } from '../storage/object-storage';
import { TestClock } from '../testing/billing-fixture';
import { FakeIdTokenVerifier } from '../testing/fake-identity';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { AccountPrivacyService } from './account-privacy.service';
import { normalizeInviteEmail } from './erasure-email';

class FlakyStorage extends MemoryObjectStorage {
  failDelete = false;
  async delete(key: string): Promise<void> {
    if (this.failDelete) throw new BillingError('provider_unavailable', { reason: 'storage_error' });
    return super.delete(key);
  }
}

/** Background (tokenless) erasure still removes business invitations naming the person, and nothing else. */
describe('erasure by recorded, verified email (fictional accounts, local Postgres)', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let storage: FlakyStorage;
  let tokens: FakeIdTokenVerifier;
  let privacy: AccountPrivacyService;
  let business: Principal;

  const identity = (uid: string, overrides: Partial<VerifiedIdentity> = {}): VerifiedIdentity => ({
    uid,
    email: `${uid}@example.test`,
    emailVerified: true,
    authTime: clock.now(),
    issuedAt: clock.now(),
    signInProvider: 'password',
    ...overrides,
  });
  const invite = (email: string) =>
    db.pool.query(`INSERT INTO business_candidates (workspace_id, email, consent) VALUES ($1, $2, true)`, [business.workspaceId, email]);
  const invited = async () =>
    (await db.pool.query<{ email: string }>(`SELECT email FROM business_candidates WHERE workspace_id = $1 ORDER BY email`, [business.workspaceId])).rows.map(
      (row) => row.email,
    );
  const closed = new Set<string>();
  const sweep = () => privacy.eraseClosedV1Accounts(async (uid) => closed.has(uid));

  beforeAll(async () => {
    db = await createTestDatabase('erasure_email');
    clock = new TestClock('2026-11-04T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    storage = new FlakyStorage();
    tokens = new FakeIdTokenVerifier();
    privacy = new AccountPrivacyService(db.pool, tokens, storage, clock, new RecordingSignInDeleter());
    business = await identities.principal(identity('biz-owner'));
  });

  afterEach(() => {
    storage.failDelete = false;
  });

  afterAll(async () => {
    await db.drop();
  });

  it('normalises like invitations: trimmed and lower-cased, nothing else', () => {
    expect(normalizeInviteEmail('  Ada.Lovelace+cv@Example.TEST ')).toBe('ada.lovelace+cv@example.test');
    expect(normalizeInviteEmail('not-an-address')).toBeNull();
    expect(normalizeInviteEmail(null)).toBeNull();
  });

  it('a V1-closure erase without any token removes invitations naming the person (any case or spacing) and keeps everyone else', async () => {
    await identities.principal(identity('ada-closed', { email: 'Ada.Closed@Example.test' }));
    await invite('ada.closed@example.test');
    await invite('other.person@example.test');
    // An older row written before normalisation existed, with stray spacing and case.
    await invite('  ADA.CLOSED@example.test ');
    closed.add('ada-closed');

    expect(await sweep()).toMatchObject({ erased: 1, failed: 0 });

    expect(await invited()).toEqual(['other.person@example.test']);
    const owner = await db.pool.query(`SELECT 1 FROM users WHERE auth_user_id = 'biz-owner'`);
    expect(owner.rows).toHaveLength(1);
    const gone = await db.pool.query(`SELECT 1 FROM users WHERE auth_user_id = 'ada-closed'`);
    expect(gone.rows).toHaveLength(0);
  });

  it('never records or erases by an unverified address (it could be someone else’s)', async () => {
    await invite('victim@example.test');
    await identities.principal(identity('impostor', { email: 'victim@example.test', emailVerified: false }));
    const stored = await db.pool.query(`SELECT erasure_email FROM users WHERE auth_user_id = 'impostor'`);
    expect(stored.rows[0].erasure_email).toBeNull();
    tokens.set('impostor', { email: 'victim@example.test', emailVerified: false, authTime: clock.now(), issuedAt: clock.now() });
    const impostor = await identities.principal(identity('impostor', { email: 'victim@example.test', emailVerified: false }));
    await expect(privacy.deleteAccount(impostor, { idToken: 'fake:impostor', confirm: 'DELETE' })).resolves.toEqual({ deleted: true });
    expect(await invited()).toContain('victim@example.test');
  });

  it('keeps the recorded address through a storage failure, so the retried erase still removes the invitation', async () => {
    const bea = await identities.principal(identity('bea-retry'));
    await invite('bea-retry@example.test');
    await privacy.startExport(bea, 'personal');
    closed.add('bea-retry');

    storage.failDelete = true;
    expect(await sweep()).toMatchObject({ erased: 0, failed: 1 });
    const kept = await db.pool.query(`SELECT erasure_email, deletion_requested_at FROM users WHERE auth_user_id = 'bea-retry'`);
    expect(kept.rows[0]).toMatchObject({ erasure_email: 'bea-retry@example.test' });
    expect(kept.rows[0].deletion_requested_at).not.toBeNull();
    expect(await invited()).toContain('bea-retry@example.test');

    storage.failDelete = false;
    clock.set(new Date(clock.now().getTime() + 16 * 60_000).toISOString());
    expect(await sweep()).toMatchObject({ erased: 1, failed: 0 });
    expect(await invited()).not.toContain('bea-retry@example.test');
    // Idempotent: a further run finds nothing to do and changes nothing.
    expect(await sweep()).toMatchObject({ erased: 0, failed: 0 });
    expect(await invited()).toEqual(['other.person@example.test', 'victim@example.test']);
  });

  it('a person-started deletion records the verified address at the mark, before anything is removed', async () => {
    const cy = await identities.principal(identity('cy-self', { email: 'cy.new@example.test' }));
    await invite('cy.new@example.test');
    tokens.set('cy-self', { email: 'cy.new@example.test', emailVerified: true, authTime: clock.now(), issuedAt: clock.now() });
    await expect(privacy.deleteAccount(cy, { idToken: 'fake:cy-self', confirm: 'DELETE' })).resolves.toEqual({ deleted: true });
    expect(await invited()).not.toContain('cy.new@example.test');
  });
});

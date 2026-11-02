import { CATALOG_VERSION, LEGAL_VERSIONS } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { TestClock } from '../testing/billing-fixture';
import type { VerifiedIdentity } from './id-token';
import { IdentityService } from './identity.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-16T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

const ACCEPT_ALL = {
  termsAccepted: true,
  privacyAccepted: true,
  disclaimerAccepted: true,
  termsVersion: LEGAL_VERSIONS.terms,
  privacyVersion: LEGAL_VERSIONS.privacy,
  disclaimerVersion: LEGAL_VERSIONS.disclaimer,
};

describe('IdentityService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let billing: BillingService;

  beforeAll(async () => {
    db = await createTestDatabase('identity');
    clock = new TestClock('2026-10-16T09:00:00Z');
    billing = new BillingService(db.pool, clock);
    await billing.publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function count(table: string, uid: string): Promise<number> {
    const res = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table} WHERE auth_user_id = $1`,
      [uid],
    );
    return res.rows[0].n;
  }

  it('creates a user, a workspace, and a Free account with this month open on first sign-in', async () => {
    const p = await identities.principal(identity('first-user'), 'fr');
    expect(p.locale).toBe('fr');
    expect(p.origin).toBe('v2');
    const account = await db.pool.query(`SELECT plan_id, workspace_id, allowance_anchor FROM billing_accounts WHERE id = $1`, [
      p.billingAccountId,
    ]);
    expect(account.rows[0]).toMatchObject({ plan_id: 'free', workspace_id: p.workspaceId });
    expect(account.rows[0].allowance_anchor.toISOString()).toBe('2026-10-16T09:00:00.000Z');
    const balance = await billing.unitBalance(p.billingAccountId, 'document_credit');
    expect(balance.includedRemaining).toBeGreaterThan(0);
  });

  it('returns the same rows on the next sign-in', async () => {
    const a = await identities.principal(identity('repeat-user'));
    const b = await identities.principal(identity('repeat-user'), 'fr');
    expect(b).toMatchObject({ userId: a.userId, workspaceId: a.workspaceId, billingAccountId: a.billingAccountId });
    expect(b.locale).toBe('en');
  });

  it('creates one account when the first requests arrive together', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => identities.principal(identity('racing-user'))));
    expect(new Set(results.map((r) => r.billingAccountId)).size).toBe(1);
    expect(await count('users', 'racing-user')).toBe(1);
    expect(await count('billing_accounts', 'racing-user')).toBe(1);
  });

  it('uses the rows a V1 copy already wrote and does not add a second account', async () => {
    const migrated = await billing.createFreeAccount({
      authUserId: 'v1-user',
      origin: 'migrated',
      anchor: new Date('2025-03-02T10:00:00Z'),
      catalogVersion: CATALOG_VERSION,
    });
    const p = await identities.principal(identity('v1-user'));
    expect(p.billingAccountId).toBe(migrated.id);
    expect(p.origin).toBe('migrated');
    expect(await count('billing_accounts', 'v1-user')).toBe(1);
  });

  describe('legal acceptance', () => {
    it('asks a new V2 account and does not ask a copied V1 account with no row', async () => {
      const fresh = await identities.principal(identity('legal-new'));
      expect((await identities.legal(fresh)).needsAcceptance).toBe(true);
      const migrated = await identities.principal(identity('v1-user'));
      expect((await identities.legal(migrated)).needsAcceptance).toBe(false);
    });

    it('records all three current versions, then stops asking', async () => {
      const p = await identities.principal(identity('legal-accept'));
      const legal = await identities.acceptLegal(p, ACCEPT_ALL);
      expect(legal.needsAcceptance).toBe(false);
      expect(legal.accepted).toMatchObject({ termsVersion: '2026-08-16', acceptedAt: new Date('2026-10-16T09:00:00Z') });
    });

    it('re-consent overwrites the one row', async () => {
      const p = await identities.principal(identity('legal-again'));
      await identities.acceptLegal(p, ACCEPT_ALL);
      clock.set('2026-10-17T09:00:00Z');
      const legal = await identities.acceptLegal(p, ACCEPT_ALL);
      clock.set('2026-10-16T09:00:00Z');
      expect(legal.accepted?.acceptedAt).toEqual(new Date('2026-10-17T09:00:00Z'));
      expect(await count('legal_acceptances', 'legal-again')).toBe(1);
    });

    it('refuses a document left unaccepted and a version the server does not publish', async () => {
      const p = await identities.principal(identity('legal-refuse'));
      await expect(identities.acceptLegal(p, { ...ACCEPT_ALL, disclaimerAccepted: false })).rejects.toMatchObject({
        code: 'validation_error',
      });
      await expect(identities.acceptLegal(p, { ...ACCEPT_ALL, termsVersion: '2019-01-01' })).rejects.toMatchObject({
        code: 'validation_error',
      });
      expect(await count('legal_acceptances', 'legal-refuse')).toBe(0);
    });
  });

  describe('locale', () => {
    it('stores en or fr and refuses another code', async () => {
      const p = await identities.principal(identity('locale-user'));
      expect((await identities.setLocale(p, 'fr')).locale).toBe('fr');
      await expect(identities.setLocale(p, 'es')).rejects.toMatchObject({ code: 'validation_error' });
      const again = await identities.principal(identity('locale-user'));
      expect(again.locale).toBe('fr');
    });
  });

  describe('push tokens', () => {
    it('registers once, moves a token to the person now signed in, and removes only your own', async () => {
      const a = await identities.principal(identity('push-a'));
      const b = await identities.principal(identity('push-b'));
      await identities.registerPushToken(a, 'ExponentPushToken[device-1]');
      await identities.registerPushToken(a, 'ExponentPushToken[device-1]');
      expect(await count('push_tokens', 'push-a')).toBe(1);

      await identities.removePushToken(b, 'ExponentPushToken[device-1]');
      expect(await count('push_tokens', 'push-a')).toBe(1);

      await identities.registerPushToken(b, 'ExponentPushToken[device-1]');
      expect(await count('push_tokens', 'push-a')).toBe(0);
      expect(await count('push_tokens', 'push-b')).toBe(1);

      await identities.removePushToken(b, 'ExponentPushToken[device-1]');
      expect(await count('push_tokens', 'push-b')).toBe(0);
      await expect(identities.registerPushToken(a, '  ')).rejects.toMatchObject({ code: 'validation_error' });
    });
  });
});

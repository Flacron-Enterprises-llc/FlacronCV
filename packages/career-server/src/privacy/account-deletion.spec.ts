import { randomUUID } from 'crypto';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { BillingError } from '../billing/errors';
import { EvidenceService } from '../evidence/evidence.service';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { MemoryObjectStorage } from '../storage/object-storage';
import { TestClock } from '../testing/billing-fixture';
import { FakeIdTokenVerifier } from '../testing/fake-identity';
import { RecordingSignInDeleter } from '../identity/sign-in-deleter';
import { personalDataFixture } from '../testing/personal-data-fixture';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { AccountPrivacyService, OWNER_WORKSPACE_TABLES, PERSONAL_COLUMNS, remainingPersonalData } from './account-privacy.service';
import { isLivePerson, livePersonCondition } from './live-person';

/** Records the sign-ins deletion removes; nothing leaves the process. */
const signIns = new RecordingSignInDeleter();

const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');

/** Memory storage that can be told to refuse, standing in for S3 being unreachable. */
class FlakyStorage extends MemoryObjectStorage {
  failDelete = false;
  async delete(key: string): Promise<void> {
    if (this.failDelete) throw new BillingError('provider_unavailable', { reason: 'storage_error' });
    return super.delete(key);
  }
}

describe('account deletion (fictional accounts, local Postgres, memory storage)', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let storage: FlakyStorage;
  let tokens: FakeIdTokenVerifier;
  let privacy: AccountPrivacyService;
  let evidence: EvidenceService;

  const identity = (uid: string): VerifiedIdentity => ({
    uid,
    email: `${uid}@example.test`,
    emailVerified: true,
    authTime: clock.now(),
    issuedAt: clock.now(),
    signInProvider: 'password',
  });
  const person = (uid: string) => identities.principal(identity(uid));
  const fresh = (p: Principal) => {
    tokens.set(p.authUserId, { authTime: clock.now(), issuedAt: clock.now(), email: p.identity.email });
    return { idToken: `fake:${p.authUserId}`, confirm: 'DELETE' };
  };

  let seed: ReturnType<typeof personalDataFixture>['seed'];
  let seedEverything: ReturnType<typeof personalDataFixture>['seedEverything'];

  beforeAll(async () => {
    db = await createTestDatabase('account_deletion');
    clock = new TestClock('2026-10-24T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    storage = new FlakyStorage();
    tokens = new FakeIdTokenVerifier();
    privacy = new AccountPrivacyService(db.pool, tokens, storage, clock, signIns);
    evidence = new EvidenceService(db.pool, undefined, storage, { clock });
    ({ seed, seedEverything } = personalDataFixture(db, clock));
    await db.pool.query(`INSERT INTO feature_flags (feature, enabled) VALUES ('evidenceItems', true) ON CONFLICT (feature) DO UPDATE SET enabled = true`);
  });

  afterEach(() => {
    storage.failDelete = false;
  });

  afterAll(async () => {
    await db.drop();
  });

  it('covers every column in the schema that holds a sign-in id', async () => {
    const cols = await db.pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = $1 AND column_name LIKE '%auth_user_id'`,
      [db.schema],
    );
    // users is removed last; these two follow it by ON DELETE CASCADE (checked below).
    // deleted_sign_ins keeps only the random uid, for two hours, so an old token cannot open a new account.
    const handled = new Set([
      ...PERSONAL_COLUMNS.map(([t, c]) => `${t}.${c}`),
      'users.auth_user_id',
      'legal_acceptances.auth_user_id',
      'push_tokens.auth_user_id',
      'deleted_sign_ins.auth_user_id',
    ]);
    const missed = cols.rows.map((r) => `${r.table_name}.${r.column_name}`).filter((name) => !handled.has(name));
    expect(missed).toEqual([]);
    const cascades = await db.pool.query<{ table_name: string; delete_rule: string }>(
      `SELECT kcu.table_name, rc.delete_rule FROM information_schema.referential_constraints rc
         JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
        WHERE rc.constraint_schema = $1 AND kcu.table_name IN ('legal_acceptances', 'push_tokens') AND kcu.column_name = 'user_id'`,
      [db.schema],
    );
    expect(cascades.rows.map((r) => r.delete_rule)).toEqual(['CASCADE', 'CASCADE']);
    for (const table of OWNER_WORKSPACE_TABLES) {
      const has = await db.pool.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = 'workspace_id'`, [db.schema, table]);
      expect(has.rowCount).toBe(1);
    }
  });

  it('removes the V2 sign-in with the fresh token, and an old token cannot open a new account afterwards', async () => {
    const kai = await person('del-kai');
    const before = signIns.deleted.length;
    await expect(privacy.deleteAccount(kai, fresh(kai))).resolves.toEqual({ deleted: true });
    expect(signIns.deleted.slice(before)).toEqual(['fake:del-kai']);
    await expect(identities.principal(identity('del-kai'))).rejects.toMatchObject({ details: { reason: 'account_deleted' } });
    expect((await db.pool.query(`SELECT 1 FROM users WHERE auth_user_id = 'del-kai'`)).rowCount).toBe(0);
    // Two hours later no token from before the deletion is valid, so the uid is forgotten.
    clock.set(new Date(clock.now().getTime() + 2 * 60 * 60_000 + 1).toISOString());
    await privacy.finishInterruptedDeletions();
    expect((await db.pool.query(`SELECT 1 FROM deleted_sign_ins WHERE auth_user_id = 'del-kai'`)).rowCount).toBe(0);
  });

  it('refuses before changing anything when no sign-in deleter is configured', async () => {
    const lia = await person('del-lia');
    const unconfigured = new AccountPrivacyService(db.pool, tokens, storage, clock);
    await expect(unconfigured.deleteAccount(lia, fresh(lia))).rejects.toMatchObject({ code: 'provider_unavailable' });
    const row = await db.pool.query(`SELECT deletion_requested_at FROM users WHERE auth_user_id = 'del-lia'`);
    expect(row.rows[0].deletion_requested_at).toBeNull();
  });

  it('keeps the sign-in usable when removing it fails, so the person can retry', async () => {
    const max = await person('del-max');
    signIns.failNext = 1;
    await expect(privacy.deleteAccount(max, fresh(max))).rejects.toMatchObject({ code: 'provider_unavailable' });
    const row = await db.pool.query(`SELECT deletion_requested_at, sign_in_deleted_at FROM users WHERE auth_user_id = 'del-max'`);
    expect(row.rows[0].deletion_requested_at).not.toBeNull();
    expect(row.rows[0].sign_in_deleted_at).toBeNull();
    await expect(privacy.deleteAccount(max, fresh(max))).resolves.toEqual({ deleted: true });
    expect(signIns.deleted).toContain('fake:del-max');
  });

  it('finishes an erase interrupted after the sign-in was removed, without the person', async () => {
    const ned = await person('del-ned');
    await seedEverything(ned);
    // The state a failed last pass leaves: marked, sign-in gone, rows still present.
    await db.pool.query(`UPDATE users SET deletion_requested_at = $2, sign_in_deleted_at = $2 WHERE auth_user_id = $1`, ['del-ned', clock.now()]);
    expect(await privacy.finishInterruptedDeletions()).toEqual({ finished: 0, failed: 0 });
    clock.set(new Date(clock.now().getTime() + 16 * 60_000).toISOString());
    expect(await privacy.finishInterruptedDeletions()).toEqual({ finished: 1, failed: 0 });
    expect(await remainingPersonalData(db.pool, { ...ned, identity: { ...ned.identity, email: null } })).toEqual([]);
    expect(signIns.deleted).not.toContain('fake:del-ned');
  });

  it('erases every personal table, keeps accounting rows unlinked, and leaves other people alone', async () => {
    const ada = await person('del-ada');
    const bea = await person('del-bea');
    await seedEverything(ada);
    await seedEverything(bea);
    // Ada also appears in Bea's business workspace (staff seat, invitation by address) and reviewed Bea's report.
    const seat = await seed('business_staff', { workspace_id: bea.workspaceId, auth_user_id: ada.authUserId, role: 'counselor' });
    const invite = await seed('business_candidates', { workspace_id: bea.workspaceId, email: 'Del-Ada@Example.test', consent: true });
    await seed('business_assignments', { staff_id: seat.id, candidate_id: invite.id });
    await db.pool.query(`UPDATE opportunity_reports SET reviewer_auth_user_id = $1, status = 'reviewed' WHERE candidate_auth_user_id = $2`, [ada.authUserId, bea.authUserId]);
    const beaBefore = await remainingPersonalData(db.pool, bea);
    const auditBefore = (await db.pool.query(`SELECT 1 FROM admin_audit WHERE actor_auth_user_id = 'deleted-account'`)).rowCount ?? 0;

    await expect(privacy.deleteAccount(ada, fresh(ada))).resolves.toEqual({ deleted: true });

    expect(await remainingPersonalData(db.pool, ada)).toEqual([]);
    const ledger = await db.pool.query(`SELECT candidate_auth_user_id FROM usage_ledger WHERE billing_account_id = $1`, [ada.billingAccountId]);
    expect(ledger.rows).toEqual([{ candidate_auth_user_id: null }]);
    const account = await db.pool.query(`SELECT auth_user_id FROM billing_accounts WHERE id = $1`, [ada.billingAccountId]);
    expect(account.rows).toEqual([{ auth_user_id: null }]);
    expect((await db.pool.query(`SELECT 1 FROM admin_audit WHERE actor_auth_user_id = 'deleted-account'`)).rowCount).toBe(auditBefore + 1);
    expect((await db.pool.query(`SELECT 1 FROM legal_acceptances WHERE auth_user_id = $1`, [ada.authUserId])).rowCount).toBe(0);
    // Bea keeps everything, minus the rows that were about Ada: her staff seat, her invitation, her name on the review.
    expect(await remainingPersonalData(db.pool, bea)).toEqual(beaBefore);
    const beaReport = await db.pool.query(`SELECT reviewer_auth_user_id, status FROM opportunity_reports WHERE candidate_auth_user_id = $1`, [bea.authUserId]);
    expect(beaReport.rows).toEqual([{ reviewer_auth_user_id: null, status: 'reviewed' }]);
    expect((await db.pool.query(`SELECT 1 FROM business_staff WHERE id = $1`, [seat.id])).rowCount).toBe(0);
    expect((await db.pool.query(`SELECT 1 FROM business_candidates WHERE id = $1`, [invite.id])).rowCount).toBe(0);
    expect((await db.pool.query(`SELECT 1 FROM business_staff WHERE workspace_id = $1 AND auth_user_id = $2`, [bea.workspaceId, bea.authUserId])).rowCount).toBe(1);
    // The shared feed listing Ada applied to stays; her pasted one is gone.
    expect((await db.pool.query(`SELECT 1 FROM opportunities WHERE candidate_auth_user_id IS NULL`)).rowCount).toBeGreaterThan(0);
  });

  it('stops with the account marked when storage refuses, refuses other requests meanwhile, and finishes on retry', async () => {
    const cy = await person('del-cy');
    const item = await evidence.create(cy, { title: 'Certificate', evidenceType: 'credential' });
    await evidence.uploadAttachment(cy, item.id, { body: PDF, contentType: 'application/pdf' });
    await privacy.startExport(cy, 'personal');
    const keys = [...storage.objects.keys()].filter((key) => key.includes(cy.workspaceId) || key.startsWith('exports/'));
    expect(keys.length).toBeGreaterThanOrEqual(2);

    storage.failDelete = true;
    await expect(privacy.deleteAccount(cy, fresh(cy))).rejects.toMatchObject({ code: 'provider_unavailable' });
    const marked = await db.pool.query(`SELECT deletion_requested_at FROM users WHERE auth_user_id = $1`, [cy.authUserId]);
    expect(marked.rows[0].deletion_requested_at).not.toBeNull();
    expect(await isLivePerson(db.pool, cy.authUserId)).toBe(false);
    await expect(identities.principal(identity(cy.authUserId))).rejects.toMatchObject({ details: { reason: 'account_deletion_pending' } });
    await expect(identities.principal(identity(cy.authUserId), undefined, { allowPendingDeletion: true })).resolves.toMatchObject({ workspaceId: cy.workspaceId });
    // Nothing is half-erased: rows and files are still there to retry.
    expect((await evidence.get(cy, item.id)).attachmentStored).toBe(true);
    await expect(evidence.uploadAttachment(cy, item.id, { body: PDF, contentType: 'application/pdf' })).rejects.toMatchObject({ details: { reason: 'account_deleted' } });
    await expect(privacy.startExport(cy, 'personal')).rejects.toMatchObject({ details: { reason: 'account_deleted' } });

    storage.failDelete = false;
    await expect(privacy.deleteAccount(cy, fresh(cy))).resolves.toEqual({ deleted: true });
    for (const key of keys) expect(storage.objects.has(key)).toBe(false);
    expect(await remainingPersonalData(db.pool, cy)).toEqual([]);
  });

  it('leaves the account marked and retryable when the database fails part way', async () => {
    const dee = await person('del-dee');
    await seed('career_achievements', { workspace_id: dee.workspaceId, candidate_auth_user_id: dee.authUserId, title: 'Award' });
    await db.pool.query(`
      CREATE FUNCTION refuse_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated failure'; END; $$;
      CREATE TRIGGER refuse_delete BEFORE DELETE ON career_achievements FOR EACH ROW EXECUTE FUNCTION refuse_delete();`);
    try {
      await expect(privacy.deleteAccount(dee, fresh(dee))).rejects.toThrow('simulated failure');
      expect((await db.pool.query(`SELECT 1 FROM career_achievements WHERE candidate_auth_user_id = $1`, [dee.authUserId])).rowCount).toBe(1);
      expect((await db.pool.query(`SELECT deletion_requested_at FROM users WHERE auth_user_id = $1`, [dee.authUserId])).rows[0].deletion_requested_at).not.toBeNull();
    } finally {
      await db.pool.query(`DROP TRIGGER refuse_delete ON career_achievements; DROP FUNCTION refuse_delete();`);
    }
    await expect(privacy.deleteAccount(dee, fresh(dee))).resolves.toEqual({ deleted: true });
    expect(await remainingPersonalData(db.pool, dee)).toEqual([]);
  });

  it('refuses a late metered save once the account is deleted and gives the credit back', async () => {
    const eve = await person('del-eve');
    const metering = new MeteringService(db.pool, clock);
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const running = metering.run({
      spender: eve,
      kind: 'test.late_save',
      unit: 'document_credit',
      feature: 'documentCredits',
      idempotencyKey: randomUUID(),
      body: {},
      requestId: 'late',
      execute: async () => {
        await gate;
        return 'done';
      },
      save: async (tx) => {
        await tx.query(`INSERT INTO career_achievements (workspace_id, candidate_auth_user_id, title) VALUES ($1, $2, 'Late')`, [eve.workspaceId, eve.authUserId]);
        return 'saved';
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await privacy.deleteAccount(eve, fresh(eve));
    finish();
    await expect(running).rejects.toMatchObject({ code: 'permission_denied', details: { reason: 'account_deleted', released: true } });
    expect((await db.pool.query(`SELECT 1 FROM career_achievements WHERE candidate_auth_user_id = $1`, [eve.authUserId])).rowCount).toBe(0);
    const ledger = await db.pool.query(`SELECT state FROM usage_ledger WHERE billing_account_id = $1`, [eve.billingAccountId]);
    expect(ledger.rows.map((r) => r.state)).toEqual(['released']);
  });

  it('skips one-statement background inserts for a person who is being deleted', async () => {
    const fay = await person('del-fay');
    const insertDigest = () =>
      db.pool.query(`INSERT INTO digests (recipient_auth_user_id, period_start, channel) SELECT $1, now(), 'email' WHERE ${livePersonCondition(1)} RETURNING id`, [fay.authUserId]);
    expect((await insertDigest()).rowCount).toBe(1);
    await db.pool.query(`UPDATE users SET deletion_requested_at = now() WHERE auth_user_id = $1`, [fay.authUserId]);
    await db.pool.query(`DELETE FROM digests WHERE recipient_auth_user_id = $1`, [fay.authUserId]);
    expect((await insertDigest()).rowCount).toBe(0);
  });

  it('asks for a live Stripe subscription to be cancelled first and changes nothing until then', async () => {
    const gil = await person('del-gil');
    await db.pool.query(`UPDATE billing_accounts SET plan_id = 'professional', provider = 'stripe', status = 'active', cancel_at_period_end = false WHERE id = $1`, [gil.billingAccountId]);
    await expect(privacy.deleteAccount(gil, fresh(gil))).rejects.toMatchObject({ code: 'validation_error', details: { field: 'subscription', reason: 'cancel_first' } });
    expect(await isLivePerson(db.pool, gil.authUserId)).toBe(true);
    await db.pool.query(`UPDATE billing_accounts SET cancel_at_period_end = true WHERE id = $1`, [gil.billingAccountId]);
    await expect(privacy.deleteAccount(gil, fresh(gil))).resolves.toEqual({ deleted: true });
  });

  it('refuses the deleted sign-in id while its tokens can be valid, and a later reuse deletes cleanly too', async () => {
    const hal = await person('del-hal');
    await privacy.deleteAccount(hal, fresh(hal));
    await expect(person('del-hal')).rejects.toMatchObject({ details: { reason: 'account_deleted' } });
    clock.set(new Date(clock.now().getTime() + 2 * 60 * 60_000 + 1).toISOString());
    await privacy.finishInterruptedDeletions();
    const again = await person('del-hal');
    expect(again.workspaceId).not.toBe(hal.workspaceId);
    await expect(privacy.deleteAccount(again, fresh(again))).resolves.toEqual({ deleted: true });
    expect(await remainingPersonalData(db.pool, again)).toEqual([]);
    expect(await remainingPersonalData(db.pool, hal)).toEqual([]);
  });
});

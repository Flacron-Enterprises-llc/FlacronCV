import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { MemoryObjectStorage } from '../storage/object-storage';
import { TestClock } from '../testing/billing-fixture';
import { FakeIdTokenVerifier } from '../testing/fake-identity';
import { RecordingSignInDeleter } from '../identity/sign-in-deleter';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { AccountPrivacyService } from './account-privacy.service';
import { personKey } from './live-person';

/** Records the sign-ins deletion removes; nothing leaves the process. */
const signIns = new RecordingSignInDeleter();

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-17T03:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('AccountPrivacyService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let privacy: AccountPrivacyService;
  let storage: MemoryObjectStorage;
  let tokens: FakeIdTokenVerifier;

  beforeAll(async () => {
    db = await createTestDatabase('privacy');
    clock = new TestClock('2026-10-17T03:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    storage = new MemoryObjectStorage();
    tokens = new FakeIdTokenVerifier();
    privacy = new AccountPrivacyService(db.pool, tokens, storage, clock, signIns);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string): Promise<Principal> {
    return identities.principal(identity(uid));
  }

  it('exports this person only, and a wrong or stale delete leaves the account', async () => {
    const ada = await person('privacy-ada');
    const bee = await person('privacy-bee');
    await db.pool.query(
      `INSERT INTO career_facts (workspace_id, candidate_auth_user_id, fact_type, value, source, confirmation)
       VALUES ($1, $2, 'skill', '{"name":"SQL"}'::jsonb, 'manual', 'draft')`,
      [ada.workspaceId, ada.authUserId],
    );
    await db.pool.query(
      `INSERT INTO career_facts (workspace_id, candidate_auth_user_id, fact_type, value, source, confirmation)
       VALUES ($1, $2, 'skill', '{"name":"SecretCo"}'::jsonb, 'manual', 'draft')`,
      [bee.workspaceId, bee.authUserId],
    );
    const started = await privacy.startExport(ada, 'personal');
    expect(started.status).toBe('queued');
    const ready = await privacy.readExport(ada, started.id);
    expect(ready.status).toBe('ready');
    expect(ready.url).toContain('https://exports.example.test/');
    // The key carries a hash of the person, never the sign-in id.
    const file = storage.objects.get(`exports/${personKey(ada.authUserId)}/${started.id}.json`);
    const text = file ? file.toString('utf8') : '';
    expect(text).toContain('SQL');
    expect(text).toContain('document_credit');
    expect(text).not.toContain('SecretCo');
    expect(text).not.toContain('hiring');
    expect(JSON.parse(text).profile.facts).toHaveLength(1);

    await expect(privacy.deleteAccount(ada, { idToken: `fake:${ada.authUserId}`, confirm: 'delete' })).rejects.toMatchObject({
      code: 'validation_error',
    });
    tokens.set(ada.authUserId, { authTime: new Date('2020-01-01T00:00:00Z') });
    await expect(privacy.deleteAccount(ada, { idToken: `fake:${ada.authUserId}`, confirm: 'DELETE' })).rejects.toMatchObject({
      code: 'validation_error',
    });
    const still = await db.pool.query(`SELECT 1 FROM career_facts WHERE candidate_auth_user_id = $1`, [ada.authUserId]);
    expect(still.rowCount).toBe(1);
    clock.set('2026-10-17T06:00:00Z');
    const expired = await privacy.readExport(ada, started.id);
    expect(expired.status).toBe('failed');
    expect(expired.url).toBeUndefined();
  });

  it('removes personal rows, keeps a shared listing, and unlinks the ledger', async () => {
    const ada = await person('privacy-ada');
    tokens.set(ada.authUserId, { authTime: clock.now() });
    await db.pool.query(`UPDATE workspaces SET name = 'Ada' WHERE id = $1`, [ada.workspaceId]);
    const paste = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunities (category, provider, source_id, title, organization, status, dedupe_key, candidate_auth_user_id)
       VALUES ('job', 'paste', 'privacy-paste', 'SQL analyst', 'unstated', 'open', 'paste:privacy-paste', $1)
       RETURNING id`,
      [ada.authUserId],
    );
    const revision = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunity_revisions (opportunity_id, revision, title, organization, status, description)
       VALUES ($1, 1, 'SQL analyst', 'unstated', 'open', 'private note') RETURNING id`,
      [paste.rows[0].id],
    );
    await db.pool.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [paste.rows[0].id, revision.rows[0].id]);
    const feed = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunities (category, provider, source_id, title, organization, status, dedupe_key)
       VALUES ('job', 'adzuna', 'privacy-feed', 'Shared role', 'Shared Co', 'open', 'shared co|shared role')
       RETURNING id`,
    );
    await db.pool.query(
      `INSERT INTO applications (workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id, source_snapshot)
       VALUES ($1, $2, $3, $4, '{"title":"SQL analyst"}'::jsonb)`,
      [ada.workspaceId, ada.authUserId, paste.rows[0].id, revision.rows[0].id],
    );
    await db.pool.query(
      `INSERT INTO writing_documents (workspace_id, candidate_auth_user_id, document_type, title, body)
       VALUES ($1, $2, 'cover_letter', 'Letter', 'SQL')`,
      [ada.workspaceId, ada.authUserId],
    );
    await db.pool.query(
      `INSERT INTO star_stories (workspace_id, candidate_auth_user_id, situation, task, action, result)
       VALUES ($1, $2, 'SQL', 'SQL', 'SQL', 'SQL')`,
      [ada.workspaceId, ada.authUserId],
    );
    await db.pool.query(
      `INSERT INTO usage_ledger
         (billing_account_id, workspace_id, candidate_auth_user_id, unit, quantity, request_id, idempotency_key,
          request_fingerprint, allowance_period_start, state, committed_at)
       VALUES ($1, $2, $3, 'document_credit', 1, 'r', 'privacy-ledger', 'f', '2026-10-01T00:00:00Z', 'committed', '2026-10-02T00:00:00Z')`,
      [ada.billingAccountId, ada.workspaceId, ada.authUserId],
    );

    // A stored practice recording: erasure must delete the audio object, not only its row.
    const voice = await db.pool.query<{ id: string }>(
      `INSERT INTO voice_interview_sessions (workspace_id, candidate_auth_user_id, kind, title, prompt)
       VALUES ($1, $2, 'practice', 'Voice', 'p') RETURNING id`,
      [ada.workspaceId, ada.authUserId],
    );
    await storage.put('voice/ada-take-1.m4a', Buffer.from('audio'), 'audio/mp4');
    await db.pool.query(
      `INSERT INTO voice_audio_records
         (session_id, billing_account_id, idempotency_key, request_fingerprint, duration_seconds, requested_seconds, transcript, feedback, audio_object_key)
       VALUES ($1, $2, 'privacy-voice', 'f', 30, 30, 'Hello', '{}'::jsonb, 'voice/ada-take-1.m4a')`,
      [voice.rows[0].id, ada.billingAccountId],
    );

    const result = await privacy.deleteAccount(ada, { idToken: `fake:${ada.authUserId}`, confirm: 'DELETE' });
    expect(result).toEqual({ deleted: true });
    expect(storage.objects.has('voice/ada-take-1.m4a')).toBe(false);
    expect(await count(db, 'career_facts', ada.authUserId)).toBe(0);
    expect(await count(db, 'writing_documents', ada.authUserId)).toBe(0);
    expect(await count(db, 'star_stories', ada.authUserId)).toBe(0);
    expect(await count(db, 'applications', ada.authUserId)).toBe(0);
    const pasteLeft = await db.pool.query(`SELECT 1 FROM opportunities WHERE id = $1`, [paste.rows[0].id]);
    expect(pasteLeft.rowCount).toBe(0);
    const feedLeft = await db.pool.query(`SELECT candidate_auth_user_id FROM opportunities WHERE id = $1`, [feed.rows[0].id]);
    expect(feedLeft.rowCount).toBe(1);
    expect(feedLeft.rows[0].candidate_auth_user_id).toBeNull();
    const ledger = await db.pool.query<{ candidate_auth_user_id: string | null }>(
      `SELECT candidate_auth_user_id FROM usage_ledger WHERE idempotency_key = 'privacy-ledger'`,
    );
    expect(ledger.rows[0].candidate_auth_user_id).toBeNull();
    const user = await db.pool.query(`SELECT 1 FROM users WHERE auth_user_id = $1`, [ada.authUserId]);
    expect(user.rowCount).toBe(0);
    const workspace = await db.pool.query<{ name: string | null; auth_user_id: string | null }>(
      `SELECT w.name, b.auth_user_id FROM workspaces w JOIN billing_accounts b ON b.workspace_id = w.id WHERE w.id = $1`,
      [ada.workspaceId],
    );
    expect(workspace.rows[0].name).toBeNull();
    expect(workspace.rows[0].auth_user_id).toBeNull();
    const bee = await db.pool.query(`SELECT 1 FROM career_facts WHERE candidate_auth_user_id = 'privacy-bee'`);
    expect(bee.rowCount).toBe(1);
    expect(storage.objects.size).toBe(0);
  });

  it('tells an active store subscriber to cancel in the store and still deletes', async () => {
    const ada = await person('privacy-apple');
    tokens.set(ada.authUserId, { authTime: clock.now() });
    await db.pool.query(`UPDATE billing_accounts SET plan_id = 'starter', provider = 'apple', status = 'active' WHERE id = $1`, [
      ada.billingAccountId,
    ]);
    const result = await privacy.deleteAccount(ada, { idToken: `fake:${ada.authUserId}`, confirm: 'DELETE' });
    expect(result.storeSubscription).toEqual({ provider: 'apple', cancelUrl: 'https://apps.apple.com/account/subscriptions' });
    const user = await db.pool.query(`SELECT 1 FROM users WHERE auth_user_id = $1`, [ada.authUserId]);
    expect(user.rowCount).toBe(0);
  });
});

async function count(db: TestDatabase, table: string, uid: string): Promise<number> {
  const column = table === 'users' ? 'auth_user_id' : 'candidate_auth_user_id';
  const res = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [uid]);
  return res.rows[0].n;
}

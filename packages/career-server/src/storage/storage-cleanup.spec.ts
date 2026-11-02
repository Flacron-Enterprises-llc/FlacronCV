import { Client } from 'pg';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { BillingError } from '../billing/errors';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { TestClock } from '../testing/billing-fixture';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { MemoryObjectStorage } from './object-storage';
import { EvidenceService } from '../evidence/evidence.service';
import { cleanupBackoffMs, storageCleanupIntervalMs, StorageCleanupService } from './storage-cleanup';

/** Memory storage that counts deletes and can refuse them (S3 unreachable). Mocked; no AWS. */
class CountingStorage extends MemoryObjectStorage {
  deletes = 0;
  failDelete = false;
  /** Runs while a put is in flight, to act in the middle of an upload. */
  duringPut: (() => Promise<void>) | null = null;
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.duringPut) await this.duringPut();
    return super.put(key, body, contentType);
  }
  async delete(key: string): Promise<void> {
    this.deletes += 1;
    if (this.failDelete) throw new BillingError('provider_unavailable', { reason: 'storage_error' });
    return super.delete(key);
  }
}

describe('StorageCleanupService (local Postgres, memory storage)', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let storage: CountingStorage;
  let cleanup: StorageCleanupService;
  let ada: Principal;

  const queue = (key: string, notBefore = clock.now()) =>
    db.pool.query(`INSERT INTO stored_object_intents (object_key, candidate_auth_user_id, created_at, not_before) VALUES ($1, $2, $3, $4)`, [
      key,
      ada.authUserId,
      clock.now(),
      notBefore,
    ]);
  const row = async (key: string) =>
    (await db.pool.query(`SELECT attempts, last_error, not_before FROM stored_object_intents WHERE object_key = $1`, [key])).rows[0];

  beforeAll(async () => {
    db = await createTestDatabase('storage_cleanup');
    clock = new TestClock('2026-10-24T12:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    const identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    const at = clock.now();
    ada = await identities.principal({ uid: 'cleanup-ada', email: 'cleanup-ada@example.test', emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' });
  });

  beforeEach(async () => {
    storage = new CountingStorage();
    cleanup = new StorageCleanupService(db.pool, storage, clock);
    await db.pool.query(`DELETE FROM stored_object_intents`);
    await db.pool.query(`DELETE FROM account_exports`);
  });

  afterAll(async () => {
    await db.drop();
  });

  it('deletes a due orphan, and repeating the delete is harmless', async () => {
    await storage.put('evidence/ws/p/item/orphan', Buffer.from('x'), 'application/pdf');
    await queue('evidence/ws/p/item/orphan');
    await queue('evidence/ws/p/item/already-gone');
    expect(await cleanup.runOnce()).toMatchObject({ deleted: 2, failed: 0 });
    expect(storage.objects.size).toBe(0);
    expect((await db.pool.query(`SELECT 1 FROM stored_object_intents`)).rowCount).toBe(0);
  });

  it('never deletes a current attachment or an object that is not due yet', async () => {
    const key = 'evidence/ws/p/item/current';
    await storage.put(key, Buffer.from('x'), 'application/pdf');
    await db.pool.query(
      `INSERT INTO career_evidence (workspace_id, candidate_auth_user_id, title, evidence_type, attachment_object_key, attachment_content_type, attachment_size_bytes, attachment_sha256, attachment_uploaded_at)
       VALUES ($1, $2, 'Current', 'project', $3, 'application/pdf', 1, 'x', now())`,
      [ada.workspaceId, ada.authUserId, key],
    );
    await queue(key);
    await storage.put('evidence/ws/p/item/later', Buffer.from('x'), 'application/pdf');
    await queue('evidence/ws/p/item/later', new Date(clock.now().getTime() + 10 * 60_000));
    expect(await cleanup.runOnce()).toMatchObject({ deleted: 0, kept: 1 });
    expect(storage.objects.has(key)).toBe(true);
    expect(storage.objects.has('evidence/ws/p/item/later')).toBe(true);
    expect(await row('evidence/ws/p/item/later')).toMatchObject({ attempts: 0 });
  });

  it('skips a row an upload in progress has locked, and takes it once the lock is gone', async () => {
    const key = 'evidence/ws/p/item/in-progress';
    await storage.put(key, Buffer.from('x'), 'application/pdf');
    await queue(key);
    const upload = new Client({ connectionString: db.url });
    await upload.connect();
    try {
      await upload.query('BEGIN');
      await upload.query(`SELECT 1 FROM stored_object_intents WHERE object_key = $1 FOR UPDATE`, [key]);
      expect(await cleanup.runOnce()).toMatchObject({ deleted: 0, failed: 0 });
      expect(storage.objects.has(key)).toBe(true);
      await upload.query('ROLLBACK');
    } finally {
      await upload.end();
    }
    expect(await cleanup.runOnce()).toMatchObject({ deleted: 1 });
  });

  it('records a failure, backs off, and succeeds on a later run', async () => {
    const key = 'evidence/ws/p/item/retry';
    await storage.put(key, Buffer.from('x'), 'application/pdf');
    await queue(key);
    storage.failDelete = true;
    expect(await cleanup.runOnce()).toMatchObject({ failed: 1 });
    const failed = await row(key);
    expect(failed).toMatchObject({ attempts: 1, last_error: 'provider_unavailable:storage_error' });
    expect(new Date(failed.not_before).getTime()).toBe(clock.now().getTime() + cleanupBackoffMs(1));
    // Not due again yet.
    expect(await cleanup.runOnce()).toMatchObject({ failed: 0, deleted: 0 });
    storage.failDelete = false;
    clock.set(new Date(clock.now().getTime() + cleanupBackoffMs(1)).toISOString());
    expect(await cleanup.runOnce()).toMatchObject({ deleted: 1 });
    expect(storage.objects.has(key)).toBe(false);
    expect(cleanupBackoffMs(2)).toBe(2 * cleanupBackoffMs(1));
    expect(cleanupBackoffMs(50)).toBe(6 * 60 * 60 * 1000);
  });

  it('queues expired and failed exports, and leaves a live export alone', async () => {
    const now = clock.now();
    const insert = async (key: string, status: string, expires: Date | null) => {
      await storage.put(key, Buffer.from('{}'), 'application/json');
      await db.pool.query(
        `INSERT INTO account_exports (billing_account_id, auth_user_id, scope, status, object_key, expires_at) VALUES ($1, $2, 'personal', $3, $4, $5)`,
        [ada.billingAccountId, ada.authUserId, status, key, expires],
      );
    };
    await insert('exports/p/expired.json', 'ready', new Date(now.getTime() - 1));
    await insert('exports/p/failed.json', 'failed', null);
    await insert('exports/p/live.json', 'ready', new Date(now.getTime() + 30 * 60_000));
    expect(await cleanup.runOnce()).toMatchObject({ queuedExports: 2, deleted: 2 });
    expect([...storage.objects.keys()]).toEqual(['exports/p/live.json']);
    const keys = await db.pool.query(`SELECT object_key FROM account_exports WHERE auth_user_id = $1 ORDER BY object_key NULLS FIRST`, [ada.authUserId]);
    expect(keys.rows.map((r) => r.object_key)).toEqual([null, null, 'exports/p/live.json']);
  });

  it('lets two sweepers run at once without deleting anything twice', async () => {
    for (let i = 0; i < 20; i += 1) {
      await storage.put(`evidence/ws/p/item/${i}`, Buffer.from('x'), 'application/pdf');
      await queue(`evidence/ws/p/item/${i}`);
    }
    const other = new StorageCleanupService(db.pool, storage, clock);
    const [a, b] = await Promise.all([cleanup.runOnce(20), other.runOnce(20)]);
    expect(a.deleted + b.deleted).toBe(20);
    expect(storage.deletes).toBe(20);
    expect(storage.objects.size).toBe(0);
  });

  it('does not touch an upload that is still running, even after its due time', async () => {
    await db.pool.query(`INSERT INTO feature_flags (feature, enabled) VALUES ('evidenceItems', true) ON CONFLICT (feature) DO UPDATE SET enabled = true`);
    const evidence = new EvidenceService(db.pool, undefined, storage, { clock });
    const item = await evidence.create(ada, { title: 'Slow upload', evidenceType: 'project' });
    let sweptDuringUpload: unknown = null;
    storage.duringPut = async () => {
      // The upload has queued its key and holds the row lock; pretend an hour has passed and sweep.
      const later = new StorageCleanupService(db.pool, storage, { now: () => new Date(clock.now().getTime() + 60 * 60_000) });
      sweptDuringUpload = await later.runOnce();
    };
    const stored = await evidence.uploadAttachment(ada, item.id, { body: Buffer.from('%PDF-1.7\n'), contentType: 'application/pdf' });
    storage.duringPut = null;
    expect(sweptDuringUpload).toMatchObject({ deleted: 0, failed: 0 });
    expect(stored.attachmentStored).toBe(true);
    expect(storage.deletes).toBe(0);
    const key = (await db.pool.query(`SELECT attachment_object_key FROM career_evidence WHERE id = $1`, [item.id])).rows[0].attachment_object_key;
    expect(storage.objects.has(key)).toBe(true);
    expect((await db.pool.query(`SELECT 1 FROM stored_object_intents`)).rowCount).toBe(0);
  });

  it('runs every 15 minutes when a store is configured, never in tests unless asked, and can be turned off', () => {
    expect(storageCleanupIntervalMs({ OBJECT_STORAGE: 's3' })).toBe(15 * 60_000);
    expect(storageCleanupIntervalMs({ OBJECT_STORAGE: 'local' })).toBe(15 * 60_000);
    expect(storageCleanupIntervalMs({})).toBe(0);
    expect(storageCleanupIntervalMs({ OBJECT_STORAGE: 's3', NODE_ENV: 'test' })).toBe(0);
    expect(storageCleanupIntervalMs({ OBJECT_STORAGE: 's3', STORAGE_CLEANUP_INTERVAL_MS: '0' })).toBe(0);
    expect(storageCleanupIntervalMs({ STORAGE_CLEANUP_INTERVAL_MS: '1000' })).toBe(60_000);
    expect(storageCleanupIntervalMs({ STORAGE_CLEANUP_INTERVAL_MS: '300000' })).toBe(300_000);
  });
});

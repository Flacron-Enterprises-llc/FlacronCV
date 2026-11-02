import { createHash } from 'crypto';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { BillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { AccountPrivacyService } from '../privacy/account-privacy.service';
import { MemoryObjectStorage } from '../storage/object-storage';
import { TestClock } from '../testing/billing-fixture';
import { FakeIdTokenVerifier } from '../testing/fake-identity';
import { RecordingSignInDeleter } from '../identity/sign-in-deleter';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { cleanFileName, evidenceUploadMaxBytes, verifyEvidenceFile } from './evidence-files';
import { StorageCleanupService } from '../storage/storage-cleanup';
import { EvidenceService } from './evidence.service';

/** Records the sign-ins deletion removes; nothing leaves the process. */
const signIns = new RecordingSignInDeleter();

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('IHDR')]);
const MB = 1024 * 1024;

/** Memory storage that can be told to fail, standing in for S3 being unreachable. */
class FlakyStorage extends MemoryObjectStorage {
  failPut = false;
  failDelete = false;
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.failPut) throw new BillingError('provider_unavailable', { reason: 'storage_error' });
    return super.put(key, body, contentType);
  }
  async delete(key: string): Promise<void> {
    if (this.failDelete) throw new BillingError('provider_unavailable', { reason: 'storage_error' });
    return super.delete(key);
  }
}

function identity(uid: string, at: Date): VerifiedIdentity {
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('evidence file rules', () => {
  it('checks type, size, and the file signature', () => {
    expect(() => verifyEvidenceFile(PDF, 'application/pdf', MB)).not.toThrow();
    expect(() => verifyEvidenceFile(PNG, 'image/png', MB)).not.toThrow();
    expect(() => verifyEvidenceFile(PDF, 'text/html', MB)).toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'unsupported_type' }) }));
    expect(() => verifyEvidenceFile(PNG, 'application/pdf', MB)).toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'type_mismatch' }) }));
    expect(() => verifyEvidenceFile(Buffer.alloc(0), 'application/pdf', MB)).toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'empty' }) }));
    expect(() => verifyEvidenceFile({ not: 'a buffer' }, 'application/pdf', MB)).toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'empty' }) }));
    expect(() => verifyEvidenceFile(PDF, 'application/pdf', 10)).toThrow(expect.objectContaining({ details: { field: 'file', reason: 'too_large', limit: 10 } }));
  });

  it('keeps only a display name and sets the extension from the verified type', () => {
    expect(cleanFileName('C:\\Users\\ada\\Certificat été.PDF', 'application/pdf')).toBe('Certificat été.pdf');
    expect(cleanFileName('../../etc/passwd', 'image/png')).toBe('passwd.png');
    expect(cleanFileName('<script>"x".html', 'application/pdf')).toBe('scriptx.pdf');
    expect(cleanFileName(undefined, 'image/jpeg')).toBe('evidence.jpg');
  });

  it('reads a bounded size cap', () => {
    expect(evidenceUploadMaxBytes({})).toBe(10 * MB);
    expect(evidenceUploadMaxBytes({ EVIDENCE_UPLOAD_MAX_BYTES: '2097152' })).toBe(2 * MB);
    expect(evidenceUploadMaxBytes({ EVIDENCE_UPLOAD_MAX_BYTES: '999999999' })).toBe(10 * MB);
    expect(evidenceUploadMaxBytes({ EVIDENCE_UPLOAD_MAX_BYTES: 'abc' })).toBe(10 * MB);
  });
});

describe('EvidenceService private files (CV11, memory storage)', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let storage: FlakyStorage;
  let service: EvidenceService;
  let ada: Principal;
  let charles: Principal;

  beforeAll(async () => {
    db = await createTestDatabase('evidence_files');
    clock = new TestClock('2026-10-24T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    ada = await identities.principal(identity('ada-files', clock.now()));
    charles = await identities.principal(identity('charles-files', clock.now()));
    storage = new FlakyStorage();
    service = new EvidenceService(db.pool, undefined, storage, { maxUploadBytes: MB, clock });
    await db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('evidenceItems', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
  });

  afterEach(() => {
    storage.failPut = false;
    storage.failDelete = false;
  });

  afterAll(async () => {
    await db.drop();
  });

  const ledgerRows = async () =>
    Number((await db.pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM usage_ledger`)).rows[0]?.n ?? 0);

  it('stores a private file under the workspace and a hashed candidate prefix, without spending credits', async () => {
    const item = await service.create(ada, { title: 'Catalogue certificate', evidenceType: 'credential' });
    expect(item.evidenceLabel).toBe('self_reported');
    const before = await ledgerRows();

    const stored = await service.uploadAttachment(ada, item.id, { body: PDF, contentType: 'application/pdf; charset=binary', fileName: 'Certificat été.pdf' });
    expect(stored).toMatchObject({
      attachmentStored: true,
      attachmentContentType: 'application/pdf',
      attachmentName: 'Certificat été.pdf',
      attachmentSizeBytes: PDF.length,
      attachmentUrl: null,
      evidenceLabel: 'evidence_attached',
    });
    const row = (await db.pool.query(`SELECT attachment_object_key, attachment_sha256 FROM career_evidence WHERE id = $1`, [item.id])).rows[0];
    const candidate = createHash('sha256').update(ada.authUserId).digest('hex').slice(0, 32);
    expect(row.attachment_object_key).toMatch(new RegExp(`^evidence/${ada.workspaceId}/${candidate}/${item.id}/[0-9a-f-]{36}$`));
    expect(row.attachment_object_key).not.toContain(ada.authUserId);
    expect(row.attachment_sha256).toBe(createHash('sha256').update(PDF).digest('hex'));
    expect(storage.objects.get(row.attachment_object_key)?.equals(PDF)).toBe(true);
    expect(storage.contentTypes.get(row.attachment_object_key)).toBe('application/pdf');

    const link = await service.attachmentLink(ada, item.id);
    expect(link.expiresAt).toBe('2026-10-24T10:05:00.000Z');
    expect(link.url).toContain(encodeURIComponent(row.attachment_object_key));
    expect(await ledgerRows()).toBe(before);
  });

  it('refuses another candidate on every file route and leaves the file alone', async () => {
    const item = await service.create(ada, { title: 'Private sample', evidenceType: 'work_sample' });
    await service.uploadAttachment(ada, item.id, { body: PDF, contentType: 'application/pdf' });
    const key = (await db.pool.query(`SELECT attachment_object_key FROM career_evidence WHERE id = $1`, [item.id])).rows[0].attachment_object_key;

    for (const attempt of [
      () => service.uploadAttachment(charles, item.id, { body: PDF, contentType: 'application/pdf' }),
      () => service.attachmentLink(charles, item.id),
      () => service.removeAttachment(charles, item.id),
      () => service.delete(charles, item.id),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: 'permission_denied' });
    }
    expect(storage.objects.has(key)).toBe(true);
    await expect(service.attachmentLink(ada, 'not-a-uuid')).rejects.toMatchObject({ code: 'validation_error' });
    await expect(service.attachmentLink(ada, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('stores nothing for a wrong type, a mismatched signature, or an oversized file', async () => {
    const item = await service.create(ada, { title: 'Portfolio scan', evidenceType: 'project' });
    const count = storage.objects.size;
    await expect(service.uploadAttachment(ada, item.id, { body: PDF, contentType: 'text/html' })).rejects.toMatchObject({ details: { reason: 'unsupported_type' } });
    await expect(service.uploadAttachment(ada, item.id, { body: PNG, contentType: 'application/pdf' })).rejects.toMatchObject({ details: { reason: 'type_mismatch' } });
    await expect(service.uploadAttachment(ada, item.id, { body: Buffer.concat([PDF, Buffer.alloc(MB)]), contentType: 'application/pdf' })).rejects.toMatchObject({ details: { reason: 'too_large', limit: MB } });
    expect(storage.objects.size).toBe(count);
    expect((await service.get(ada, item.id)).attachmentStored).toBe(false);
    await expect(service.attachmentLink(ada, item.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('enforces the plan storage allowance on retained bytes and keeps existing files readable', async () => {
    // Free allows 100 MB (decimal, OPEN_DECISIONS 14) per workspace. Another candidate's workspace does not count.
    const filler = await service.create(charles, { title: 'Large archive', evidenceType: 'work_sample' });
    await db.pool.query(
      `UPDATE career_evidence SET attachment_object_key = $2, attachment_content_type = 'application/pdf',
         attachment_size_bytes = $3, attachment_sha256 = 'x', attachment_uploaded_at = now() WHERE id = $1`,
      [filler.id, `evidence/${charles.workspaceId}/f/${filler.id}/filler`, 100_000_000 - 10],
    );
    await storage.put(`evidence/${charles.workspaceId}/f/${filler.id}/filler`, Buffer.from('x'), 'application/pdf');
    const item = await service.create(charles, { title: 'Reference letter', evidenceType: 'reference' });
    await expect(service.uploadAttachment(charles, item.id, { body: PDF, contentType: 'application/pdf' })).rejects.toMatchObject({
      code: 'capacity_exceeded',
      details: { field: 'storageBytes', limit: 100_000_000 },
    });
    // Over the allowance, the existing file still downloads.
    await expect(service.attachmentLink(charles, filler.id)).resolves.toHaveProperty('url');
    // Replacing a file counts only the difference.
    await expect(service.uploadAttachment(charles, filler.id, { body: PDF, contentType: 'application/pdf' })).resolves.toMatchObject({ attachmentSizeBytes: PDF.length });
    expect(storage.objects.has(`evidence/${charles.workspaceId}/f/${filler.id}/filler`)).toBe(false);
  });

  it('keeps the item unchanged when storage refuses the upload', async () => {
    const erin = await identities.principal(identity('erin-files', clock.now()));
    const item = await service.create(erin, { title: 'Conference talk', evidenceType: 'publication' });
    storage.failPut = true;
    await expect(service.uploadAttachment(erin, item.id, { body: PDF, contentType: 'application/pdf' })).rejects.toMatchObject({ code: 'provider_unavailable' });
    expect(await service.get(erin, item.id)).toMatchObject({ attachmentStored: false, evidenceLabel: 'self_reported' });
  });

  it('deletes the old object on replace, on removal, and when a link replaces the file', async () => {
    const fay = await identities.principal(identity('fay-files', clock.now()));
    const item = await service.create(fay, { title: 'Design sample', evidenceType: 'work_sample' });
    const keyOf = async () => (await db.pool.query(`SELECT attachment_object_key FROM career_evidence WHERE id = $1`, [item.id])).rows[0].attachment_object_key as string | null;

    await service.uploadAttachment(fay, item.id, { body: PDF, contentType: 'application/pdf' });
    const first = (await keyOf())!;
    await service.uploadAttachment(fay, item.id, { body: PNG, contentType: 'image/png', fileName: 'sample.png' });
    const second = (await keyOf())!;
    expect(second).not.toBe(first);
    expect(storage.objects.has(first)).toBe(false);
    expect(storage.objects.has(second)).toBe(true);

    const removed = await service.removeAttachment(fay, item.id);
    expect(removed).toMatchObject({ attachmentStored: false, attachmentName: null, attachmentSizeBytes: null, evidenceLabel: 'self_reported' });
    expect(storage.objects.has(second)).toBe(false);
    await expect(service.removeAttachment(fay, item.id)).resolves.toMatchObject({ attachmentStored: false });

    await service.uploadAttachment(fay, item.id, { body: PDF, contentType: 'application/pdf' });
    const third = (await keyOf())!;
    const linked = await service.update(fay, item.id, { attachmentUrl: 'https://example.test/talk', attachmentName: 'Talk' });
    expect(linked).toMatchObject({ attachmentStored: false, attachmentUrl: 'https://example.test/talk' });
    expect(storage.objects.has(third)).toBe(false);
    expect(await keyOf()).toBeNull();
  });

  it('deletes the file with its item, and keeps the item when storage refuses', async () => {
    const gus = await identities.principal(identity('gus-files', clock.now()));
    const item = await service.create(gus, { title: 'Award scan', evidenceType: 'credential' });
    await service.uploadAttachment(gus, item.id, { body: PDF, contentType: 'application/pdf' });
    const key = (await db.pool.query(`SELECT attachment_object_key FROM career_evidence WHERE id = $1`, [item.id])).rows[0].attachment_object_key;

    storage.failDelete = true;
    await expect(service.delete(gus, item.id)).rejects.toMatchObject({ code: 'provider_unavailable' });
    expect((await service.get(gus, item.id)).attachmentStored).toBe(true);
    expect(storage.objects.has(key)).toBe(true);

    storage.failDelete = false;
    await service.delete(gus, item.id);
    expect(storage.objects.has(key)).toBe(false);
    await expect(service.get(gus, item.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('removes every stored evidence file and evidence row when the account is deleted', async () => {
    const tokens = new FakeIdTokenVerifier();
    const privacy = new AccountPrivacyService(db.pool, tokens, storage, clock, signIns);
    const dora = await identities.principal(identity('dora-files', clock.now()));
    const one = await service.create(dora, { title: 'Thesis', evidenceType: 'publication' });
    const two = await service.create(dora, { title: 'Portfolio', evidenceType: 'project' });
    await service.uploadAttachment(dora, one.id, { body: PDF, contentType: 'application/pdf' });
    await service.uploadAttachment(dora, two.id, { body: PNG, contentType: 'image/png' });
    const keys = (await db.pool.query<{ k: string }>(`SELECT attachment_object_key AS k FROM career_evidence WHERE candidate_auth_user_id = $1`, [dora.authUserId])).rows.map((r) => r.k);
    expect(keys).toHaveLength(2);

    tokens.set(dora.authUserId, { authTime: clock.now(), issuedAt: clock.now() });
    await privacy.deleteAccount(dora, { idToken: `fake:${dora.authUserId}`, confirm: 'DELETE' });
    for (const key of keys) expect(storage.objects.has(key)).toBe(false);
    expect((await db.pool.query(`SELECT 1 FROM career_evidence WHERE candidate_auth_user_id = $1`, [dora.authUserId])).rowCount).toBe(0);
    // Another person's files are untouched.
    expect((await db.pool.query(`SELECT 1 FROM career_evidence WHERE candidate_auth_user_id = $1 AND attachment_object_key IS NOT NULL`, [ada.authUserId])).rowCount).toBeGreaterThan(0);
  });
  it('lets only one of two concurrent uploads use the last of the allowance', async () => {
    const ivy = await identities.principal(identity('ivy-files', clock.now()));
    const filler = await service.create(ivy, { title: 'Archive', evidenceType: 'work_sample' });
    const a = await service.create(ivy, { title: 'Letter A', evidenceType: 'reference' });
    const b = await service.create(ivy, { title: 'Letter B', evidenceType: 'reference' });
    // Room for exactly one more PDF (decimal 100 MB on Free).
    await db.pool.query(
      `UPDATE career_evidence SET attachment_object_key = $2, attachment_content_type = 'application/pdf',
         attachment_size_bytes = $3, attachment_sha256 = 'x', attachment_uploaded_at = now() WHERE id = $1`,
      [filler.id, `evidence/${ivy.workspaceId}/f/${filler.id}/filler`, 100_000_000 - PDF.length - 1],
    );
    const results = await Promise.allSettled([
      service.uploadAttachment(ivy, a.id, { body: PDF, contentType: 'application/pdf' }),
      service.uploadAttachment(ivy, b.id, { body: PDF, contentType: 'application/pdf' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ code: 'capacity_exceeded' });
    const used = await db.pool.query<{ bytes: string }>(
      `SELECT SUM(attachment_size_bytes)::text AS bytes FROM career_evidence WHERE workspace_id = $1 AND attachment_object_key IS NOT NULL`,
      [ivy.workspaceId],
    );
    expect(Number(used.rows[0].bytes)).toBeLessThanOrEqual(100_000_000);
    // Only the accepted file is in storage, and no intent is left behind.
    const stored = [...storage.objects.keys()].filter((key) => key.startsWith(`evidence/${ivy.workspaceId}/`) && !key.endsWith('/filler'));
    expect(stored).toHaveLength(1);
    expect((await db.pool.query(`SELECT 1 FROM stored_object_intents WHERE candidate_auth_user_id = $1`, [ivy.authUserId])).rowCount).toBe(0);
  });

  it('removes a written object when the database refuses, and sweeps it later if that cleanup also fails', async () => {
    const jo = await identities.principal(identity('jo-files', clock.now()));
    const item = await service.create(jo, { title: 'Scan', evidenceType: 'credential' });
    await db.pool.query(`
      CREATE FUNCTION refuse_file() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.attachment_object_key IS NOT NULL THEN RAISE EXCEPTION 'simulated failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER refuse_file BEFORE UPDATE ON career_evidence FOR EACH ROW EXECUTE FUNCTION refuse_file();`);
    const prefix = `evidence/${jo.workspaceId}/`;
    const objects = () => [...storage.objects.keys()].filter((key) => key.startsWith(prefix));
    const intents = async () => (await db.pool.query(`SELECT 1 FROM stored_object_intents WHERE candidate_auth_user_id = $1`, [jo.authUserId])).rowCount;
    try {
      await expect(service.uploadAttachment(jo, item.id, { body: PDF, contentType: 'application/pdf' })).rejects.toThrow('simulated failure');
      expect(objects()).toHaveLength(0);
      expect(await intents()).toBe(0);

      storage.failDelete = true;
      await expect(service.uploadAttachment(jo, item.id, { body: PDF, contentType: 'application/pdf' })).rejects.toThrow('simulated failure');
      expect(objects()).toHaveLength(1);
      expect(await intents()).toBe(1);
    } finally {
      storage.failDelete = false;
      await db.pool.query(`DROP TRIGGER refuse_file ON career_evidence; DROP FUNCTION refuse_file();`);
    }
    // The failed upload is over, so its row is due now; the sweeper deletes the object.
    const sweep = await new StorageCleanupService(db.pool, storage, clock).runOnce();
    expect(sweep.deleted).toBeGreaterThanOrEqual(1);
    expect(objects()).toHaveLength(0);
    expect(await intents()).toBe(0);
  });

  it('checks ownership before asking storage for a link, and keeps file names and content out of errors', async () => {
    const kim = await identities.principal(identity('kim-files', clock.now()));
    const lee = await identities.principal(identity('lee-files', clock.now()));
    const item = await service.create(kim, { title: 'Private', evidenceType: 'work_sample' });
    await service.uploadAttachment(kim, item.id, { body: PDF, contentType: 'application/pdf', fileName: 'Kim private plan.pdf' });
    const signed = jest.spyOn(storage, 'signedUrl');
    try {
      await expect(service.attachmentLink(lee, item.id)).rejects.toMatchObject({ code: 'permission_denied' });
      expect(signed).not.toHaveBeenCalled();
    } finally {
      signed.mockRestore();
    }
    const refusal = await service
      .uploadAttachment(kim, item.id, { body: Buffer.from('<html>secret body</html>'), contentType: 'application/pdf', fileName: 'Kim private plan.pdf' })
      .catch((error: unknown) => error);
    expect(refusal).toMatchObject({ code: 'validation_error', details: { reason: 'type_mismatch' } });
    expect(JSON.stringify(refusal)).not.toMatch(/Kim private plan|secret body/);
  });

  it('treats removing twice and deleting twice as harmless', async () => {
    const max = await identities.principal(identity('max-files', clock.now()));
    const item = await service.create(max, { title: 'Twice', evidenceType: 'project' });
    await service.uploadAttachment(max, item.id, { body: PDF, contentType: 'application/pdf' });
    await service.removeAttachment(max, item.id);
    await expect(service.removeAttachment(max, item.id)).resolves.toMatchObject({ attachmentStored: false });
    await service.delete(max, item.id);
    await expect(service.delete(max, item.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});
